//! Installation de Java, de Minecraft (vanilla) et de NeoForge.

use crate::config::{data_dir, runtime_dir};
use crate::net::{self, get_json, Job};
use anyhow::{anyhow, Context, Result};
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::process::Stdio;

pub const VERSION_MANIFEST: &str = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
const JAVA_ALL: &str =
    "https://piston-meta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json";
const NEO_MAVEN: &str = "https://maven.neoforged.net/releases/net/neoforged/neoforge";

#[cfg(windows)]
pub const OS_NAME: &str = "windows";
#[cfg(target_os = "macos")]
pub const OS_NAME: &str = "osx";
#[cfg(all(unix, not(target_os = "macos")))]
pub const OS_NAME: &str = "linux";

#[cfg(windows)]
const JAVA_PLATFORM: &str = "windows-x64";
#[cfg(target_os = "macos")]
const JAVA_PLATFORM: &str = "mac-os";
#[cfg(all(unix, not(target_os = "macos")))]
const JAVA_PLATFORM: &str = "linux";

pub type Progress = std::sync::Arc<dyn Fn(usize, usize) + Send + Sync>;

// ---------- Règles (OS) ----------

pub fn rules_allow(rules: Option<&Value>) -> bool {
    let Some(arr) = rules.and_then(|r| r.as_array()) else { return true };
    let mut allowed = false;
    for r in arr {
        if rule_matches(r) {
            allowed = r.get("action").and_then(|a| a.as_str()) == Some("allow");
        }
    }
    allowed
}

fn rule_matches(r: &Value) -> bool {
    if r.get("features").is_some() {
        return false;
    }
    if let Some(os) = r.get("os") {
        if let Some(n) = os.get("name").and_then(|n| n.as_str()) {
            if n != OS_NAME {
                return false;
            }
        }
        if let Some(a) = os.get("arch").and_then(|a| a.as_str()) {
            if a == "x86" && cfg!(target_pointer_width = "64") {
                return false;
            }
        }
    }
    true
}

// ---------- Bibliothèques ----------

/// "groupe:artefact:version[:classifier][@ext]" → chemin Maven relatif
pub fn maven_path(name: &str) -> Option<String> {
    let (coords, ext) = match name.split_once('@') {
        Some((c, e)) => (c, e),
        None => (name, "jar"),
    };
    let p: Vec<&str> = coords.split(':').collect();
    if p.len() < 3 {
        return None;
    }
    let group = p[0].replace('.', "/");
    let file = match p.get(3) {
        Some(cl) => format!("{}-{}-{}.{}", p[1], p[2], cl, ext),
        None => format!("{}-{}.{}", p[1], p[2], ext),
    };
    Some(format!("{group}/{}/{}/{file}", p[1], p[2]))
}

/// Chemin local + adresse de téléchargement (vide si fabriqué par l'installeur NeoForge).
pub fn library_entry(lib: &Value, libs_dir: &Path) -> Option<(PathBuf, String, Option<String>, u64)> {
    if !rules_allow(lib.get("rules")) {
        return None;
    }
    if let Some(a) = lib.get("downloads").and_then(|d| d.get("artifact")) {
        let rel = a.get("path").and_then(|p| p.as_str()).map(String::from).or_else(|| {
            lib.get("name").and_then(|n| n.as_str()).and_then(maven_path)
        })?;
        return Some((
            libs_dir.join(&rel),
            a.get("url").and_then(|u| u.as_str()).unwrap_or("").to_string(),
            a.get("sha1").and_then(|s| s.as_str()).map(String::from),
            a.get("size").and_then(|s| s.as_u64()).unwrap_or(0),
        ));
    }
    if lib.get("downloads").is_some() {
        return None; // uniquement des natives anciennes : rien à mettre dans le classpath
    }
    let rel = maven_path(lib.get("name")?.as_str()?)?;
    let base = lib.get("url").and_then(|u| u.as_str()).unwrap_or("https://libraries.minecraft.net/");
    let url = format!("{}/{}", base.trim_end_matches('/'), rel);
    Some((libs_dir.join(&rel), url, None, 0))
}

pub fn library_jobs(json: &Value, libs_dir: &Path) -> Vec<Job> {
    let mut jobs = Vec::new();
    for lib in json.get("libraries").and_then(|l| l.as_array()).into_iter().flatten() {
        if let Some((path, url, sha1, size)) = library_entry(lib, libs_dir) {
            if !url.is_empty() {
                jobs.push(Job { url, path, sha1, size });
            }
        }
    }
    jobs
}

// ---------- Java ----------

/// Installe le Java fourni par Mojang (composant demandé par la version) et renvoie (java, javaw).
pub async fn install_java(component: &str, progress: Progress, strict: bool) -> Result<(PathBuf, PathBuf)> {
    let root = runtime_dir().join(component);
    let all: Value = match get_json(JAVA_ALL).await {
        Ok(v) => v,
        // Mojang ne répond pas : on garde le Java déjà installé s'il est là.
        Err(e) => return java_paths(&root).ok_or(e),
    };
    let entry = all[JAVA_PLATFORM][component]
        .get(0)
        .ok_or_else(|| anyhow!("Java « {component} » introuvable pour ce système"))?;
    let manifest_url = entry["manifest"]["url"]
        .as_str()
        .ok_or_else(|| anyhow!("Manifeste Java invalide"))?;
    let manifest: Value = get_json(manifest_url).await?;
    let mut jobs = Vec::new();
    if let Some(files) = manifest["files"].as_object() {
        for (rel, f) in files {
            let path = root.join(rel);
            match f["type"].as_str() {
                Some("directory") => {
                    std::fs::create_dir_all(&path)?;
                }
                Some("file") => {
                    let raw = &f["downloads"]["raw"];
                    jobs.push(Job {
                        url: raw["url"].as_str().unwrap_or_default().to_string(),
                        path,
                        sha1: raw["sha1"].as_str().map(String::from),
                        size: raw["size"].as_u64().unwrap_or(0),
                    });
                }
                _ => {}
            }
        }
    }
    let p = progress.clone();
    net::download_all(jobs, strict, 12, move |d, t| p(d, t)).await?;

    java_paths(&root).ok_or_else(|| anyhow!("Java n'a pas pu être installé"))
}

/// (java, javaw) s'ils existent dans ce dossier.
fn java_paths(root: &Path) -> Option<(PathBuf, PathBuf)> {
    #[cfg(windows)]
    let (java, javaw) = (root.join("bin").join("java.exe"), root.join("bin").join("javaw.exe"));
    #[cfg(not(windows))]
    let (java, javaw) = {
        use std::os::unix::fs::PermissionsExt;
        let p = root.join("bin").join("java");
        if let Ok(m) = std::fs::metadata(&p) {
            let mut perm = m.permissions();
            perm.set_mode(0o755);
            let _ = std::fs::set_permissions(&p, perm);
        }
        (root.join("bin").join("java"), root.join("bin").join("java"))
    };
    (java.exists() && javaw.exists()).then_some((java, javaw))
}

// ---------- Minecraft vanilla ----------

pub async fn install_vanilla(mc_dir: &Path, version: &str, progress: Progress, strict: bool) -> Result<Value> {
    let vdir = mc_dir.join("versions").join(version);
    let json_path = vdir.join(format!("{version}.json"));
    let json: Value = match std::fs::read_to_string(&json_path).ok().and_then(|s| serde_json::from_str(&s).ok()) {
        Some(v) => v,
        None => {
            let manifest: Value = get_json(VERSION_MANIFEST).await?;
            let url = manifest["versions"]
                .as_array()
                .and_then(|a| a.iter().find(|v| v["id"].as_str() == Some(version)))
                .and_then(|v| v["url"].as_str())
                .ok_or_else(|| anyhow!("Version Minecraft {version} introuvable"))?
                .to_string();
            let v: Value = get_json(&url).await?;
            std::fs::create_dir_all(&vdir)?;
            std::fs::write(&json_path, serde_json::to_string(&v)?)?;
            v
        }
    };

    let libs_dir = mc_dir.join("libraries");
    let mut jobs = library_jobs(&json, &libs_dir);

    let client = &json["downloads"]["client"];
    jobs.push(Job {
        url: client["url"].as_str().unwrap_or_default().to_string(),
        path: vdir.join(format!("{version}.jar")),
        sha1: client["sha1"].as_str().map(String::from),
        size: client["size"].as_u64().unwrap_or(0),
    });

    if let Some(log) = json["logging"]["client"]["file"].as_object() {
        if let (Some(id), Some(url)) = (log.get("id").and_then(|v| v.as_str()), log.get("url").and_then(|v| v.as_str())) {
            jobs.push(Job {
                url: url.to_string(),
                path: mc_dir.join("assets").join("log_configs").join(id),
                sha1: log.get("sha1").and_then(|v| v.as_str()).map(String::from),
                size: log.get("size").and_then(|v| v.as_u64()).unwrap_or(0),
            });
        }
    }

    // Index des ressources
    let ai = &json["assetIndex"];
    let ai_id = ai["id"].as_str().ok_or_else(|| anyhow!("assetIndex manquant"))?;
    let ai_job = Job {
        url: ai["url"].as_str().unwrap_or_default().to_string(),
        path: mc_dir.join("assets").join("indexes").join(format!("{ai_id}.json")),
        sha1: ai["sha1"].as_str().map(String::from),
        size: ai["size"].as_u64().unwrap_or(0),
    };
    if ai_job.needed(true) {
        net::download(&ai_job).await?;
    }
    let index: Value = serde_json::from_str(&std::fs::read_to_string(&ai_job.path)?)?;
    let objects = mc_dir.join("assets").join("objects");
    for (_, obj) in index["objects"].as_object().into_iter().flatten() {
        if let Some(hash) = obj["hash"].as_str() {
            let sub = &hash[..2];
            jobs.push(Job {
                url: format!("https://resources.download.minecraft.net/{sub}/{hash}"),
                path: objects.join(sub).join(hash),
                sha1: Some(hash.to_string()),
                size: obj["size"].as_u64().unwrap_or(0),
            });
        }
    }

    let p = progress.clone();
    net::download_all(jobs, strict, 24, move |d, t| p(d, t)).await?;
    Ok(json)
}

// ---------- NeoForge ----------

fn version_key(v: &str) -> Vec<u64> {
    v.split(['.', '-'])
        .map(|p| p.parse::<u64>().unwrap_or(0))
        .collect()
}

/// "latest" → dernière version NeoForge stable pour cette version de Minecraft.
pub async fn resolve_neoforge(spec: &str, mc: &str, mc_dir: &Path) -> Result<String> {
    let spec = spec.trim();
    if !spec.is_empty() && spec != "latest" && spec != "auto" {
        return Ok(spec.to_string());
    }
    let parts: Vec<&str> = mc.trim_start_matches("1.").split('.').collect();
    let prefix = format!("{}.{}.", parts[0], parts.get(1).unwrap_or(&"0"));
    let xml = match neo_metadata().await {
        Ok(x) => x,
        Err(e) => {
            // Site NeoForge injoignable : on reprend la version déjà installée la plus récente.
            let mut local: Vec<String> = std::fs::read_dir(mc_dir.join("versions"))
                .into_iter()
                .flatten()
                .flatten()
                .filter_map(|d| d.file_name().to_str().and_then(|n| n.strip_prefix("neoforge-")).map(String::from))
                .filter(|v| v.starts_with(&prefix))
                .collect();
            local.sort_by_key(|v| version_key(v));
            return local.pop().ok_or(e);
        }
    };
    let mut versions: Vec<String> = xml
        .split("<version>")
        .skip(1)
        .filter_map(|s| s.split("</version>").next())
        .filter(|v| v.starts_with(&prefix))
        .map(String::from)
        .collect();
    let stable: Vec<String> = versions.iter().filter(|v| !v.contains("beta")).cloned().collect();
    if !stable.is_empty() {
        versions = stable;
    }
    versions.sort_by_key(|v| version_key(v));
    versions.pop().ok_or_else(|| anyhow!("Aucune version NeoForge pour Minecraft {mc}"))
}

async fn neo_metadata() -> Result<String> {
    let r = net::client().get(format!("{NEO_MAVEN}/maven-metadata.xml")).send().await?;
    if !r.status().is_success() {
        return Err(anyhow!("NeoForge a répondu {}", r.status()));
    }
    Ok(r.text().await?)
}

pub fn installer_path(neo: &str) -> PathBuf {
    data_dir().join("cache").join(format!("neoforge-{neo}-installer.jar"))
}

/// Installe NeoForge avec son installeur officiel (mode client, sans fenêtre). Renvoie l'id de version.
pub async fn install_neoforge(mc_dir: &Path, java: &Path, neo: &str) -> Result<String> {
    let id = format!("neoforge-{neo}");
    let json_path = mc_dir.join("versions").join(&id).join(format!("{id}.json"));
    if json_path.exists() {
        return Ok(id);
    }
    // L'installeur exige un launcher_profiles.json dans le dossier cible.
    let profiles = mc_dir.join("launcher_profiles.json");
    if !profiles.exists() {
        std::fs::create_dir_all(mc_dir)?;
        std::fs::write(&profiles, r#"{"profiles":{},"version":3}"#)?;
    }
    let installer = installer_path(neo);
    if !installer.exists() {
        net::download(&Job {
            url: format!("{NEO_MAVEN}/{neo}/neoforge-{neo}-installer.jar"),
            path: installer.clone(),
            sha1: None,
            size: 0,
        })
        .await?;
    }
    let log_path = data_dir().join("logs").join("neoforge-installer.log");
    std::fs::create_dir_all(log_path.parent().unwrap())?;

    let mut last = String::new();
    for flag in ["--installClient", "--install-client"] {
        let log = std::fs::File::create(&log_path)?;
        let mut cmd = std::process::Command::new(java);
        cmd.arg("-jar")
            .arg(&installer)
            .arg(flag)
            .arg(mc_dir)
            .current_dir(data_dir().join("cache"))
            .stdin(Stdio::null())
            .stdout(Stdio::from(log.try_clone()?))
            .stderr(Stdio::from(log));
        hide_window(&mut cmd);
        let status = tokio::task::spawn_blocking(move || cmd.status())
            .await?
            .context("Impossible de lancer l'installeur NeoForge")?;
        if status.success() && json_path.exists() {
            return Ok(id);
        }
        last = format!("code {:?}", status.code());
    }
    // L'installeur était peut-être abîmé : il sera retéléchargé au prochain essai.
    let _ = std::fs::remove_file(&installer);
    Err(anyhow!(
        "L'installation de NeoForge {neo} a échoué ({last}). Détails : {}",
        log_path.display()
    ))
}

pub fn hide_window(cmd: &mut std::process::Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    #[cfg(not(windows))]
    let _ = cmd;
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn maven() {
        assert_eq!(maven_path("net.neoforged:neoforge:21.1.1:client").unwrap(), "net/neoforged/neoforge/21.1.1/neoforge-21.1.1-client.jar");
        assert_eq!(maven_path("a.b:c:1@zip").unwrap(), "a/b/c/1/c-1.zip");
    }

    #[test]
    fn rules() {
        assert!(rules_allow(None));
        assert!(!rules_allow(Some(&json!([{"action":"allow","features":{"is_demo_user":true}}]))));
        let other = if OS_NAME == "osx" { "linux" } else { "osx" };
        assert!(!rules_allow(Some(&json!([{"action":"allow","os":{"name":other}}]))));
        assert!(rules_allow(Some(&json!([{"action":"allow","os":{"name":OS_NAME}}]))));
        assert!(rules_allow(Some(&json!([{"action":"allow"},{"action":"disallow","os":{"name":other}}]))));
    }

    #[test]
    fn addr() {
        assert_eq!(crate::launch::split_address("play.x.fr"), ("play.x.fr".to_string(), 25565));
        assert_eq!(crate::launch::split_address("1.2.3.4:25570"), ("1.2.3.4".to_string(), 25570));
    }
}
