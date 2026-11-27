//! Synchronisation des fichiers du modpack (mods, configs…) avec le dépôt GitHub.

use crate::config::PACK_BASE_URL;
use crate::net::{self, Job};
use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Component, Path, PathBuf};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Manifest {
    #[serde(default)]
    pub version: String,
    pub files: Vec<ManifestFile>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ManifestFile {
    pub path: String,
    pub sha1: String,
    pub size: u64,
    #[serde(default)]
    pub url: String,
    /// Infos du mod (nom, version, description, icône, statut) lues dans le .jar
    #[serde(default, rename = "mod", skip_serializing_if = "Option::is_none")]
    pub info: Option<serde_json::Value>,
    /// Fichier d'un mod optionnel (supprimé quand le joueur le désactive)
    #[serde(default, skip)]
    pub optional: bool,
}

/// Dossiers entièrement gérés par le launcher : ce qui n'est pas dans le manifeste y est supprimé.
const STRICT_DIRS: [&str; 1] = ["mods/"];

fn safe_rel(p: &str) -> Option<PathBuf> {
    let path = Path::new(p);
    if path.components().all(|c| matches!(c, Component::Normal(_))) {
        Some(path.to_path_buf())
    } else {
        None
    }
}

fn state_path(game_dir: &Path) -> PathBuf {
    game_dir.join(".launcher-sync.json")
}

fn load_state(game_dir: &Path) -> HashMap<String, String> {
    std::fs::read_to_string(state_path(game_dir))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn url_for(f: &ManifestFile) -> String {
    if !f.url.is_empty() {
        return f.url.clone();
    }
    let enc: Vec<String> = f.path.split('/').map(encode_segment).collect();
    format!("{PACK_BASE_URL}{}", enc.join("/"))
}

fn encode_segment(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(b as char),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

/// Ce qu'il reste à faire : (fichiers à télécharger, fichiers à supprimer).
pub fn plan(game_dir: &Path, m: &Manifest) -> Result<(Vec<Job>, Vec<PathBuf>, Vec<(String, String)>)> {
    let state = load_state(game_dir);
    let mut jobs = Vec::new();
    let mut new_state = Vec::new();
    let mut wanted: HashSet<PathBuf> = HashSet::new();
    for f in &m.files {
        let rel = safe_rel(&f.path).ok_or_else(|| anyhow!("Chemin refusé dans le manifeste : {}", f.path))?;
        let dest = game_dir.join(&rel);
        wanted.insert(dest.clone());
        new_state.push((f.path.clone(), f.sha1.clone()));
        let strict = STRICT_DIRS.iter().any(|d| f.path.starts_with(d));
        let job = Job { url: url_for(f), path: dest.clone(), sha1: Some(f.sha1.clone()), size: f.size };
        let known = state.get(&f.path) == Some(&f.sha1);
        let need = if !dest.exists() {
            true
        } else if strict {
            // Mod : doit être identique à celui du dépôt, sinon on le remplace.
            job.needed(!known)
        } else {
            // Config : réécrite seulement si elle a changé dans le dépôt (le joueur garde ses réglages sinon).
            !known && job.needed(true)
        };
        if need {
            jobs.push(job);
        }
    }
    let mut remove = Vec::new();
    for d in STRICT_DIRS {
        let dir = game_dir.join(d.trim_end_matches('/'));
        if let Ok(rd) = std::fs::read_dir(&dir) {
            for e in rd.flatten() {
                let p = e.path();
                let is_jar = p.extension().map(|x| x.eq_ignore_ascii_case("jar")).unwrap_or(false);
                if p.is_file() && is_jar && !wanted.contains(&p) {
                    remove.push(p);
                }
            }
        }
    }
    Ok((jobs, remove, new_state))
}

pub async fn fetch_manifest() -> Result<Manifest> {
    let t = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    net::get_json(&format!("{PACK_BASE_URL}manifest.json?t={t}")).await
}

fn optional_state_path(game_dir: &Path) -> PathBuf {
    game_dir.join(".launcher-optional.json")
}

pub async fn sync(game_dir: &Path, m: &Manifest, progress: crate::install::Progress) -> Result<()> {
    std::fs::create_dir_all(game_dir.join("mods"))?;
    // Supprime les fichiers optionnels installés avant et désactivés depuis.
    let wanted_opt: HashSet<String> = m.files.iter().filter(|f| f.optional).map(|f| f.path.clone()).collect();
    let before: Vec<String> = std::fs::read_to_string(optional_state_path(game_dir))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    for p in before.iter().filter(|p| !wanted_opt.contains(*p)) {
        if let Some(rel) = safe_rel(p) {
            let _ = std::fs::remove_file(game_dir.join(rel));
        }
    }
    std::fs::write(optional_state_path(game_dir), serde_json::to_string(&wanted_opt.iter().collect::<Vec<_>>())?)?;
    let gd = game_dir.to_path_buf();
    let mc = m.clone();
    let (jobs, remove, new_state) = tokio::task::spawn_blocking(move || plan(&gd, &mc)).await??;
    for p in remove {
        let _ = std::fs::remove_file(p);
    }
    let p = progress.clone();
    net::download_all(jobs, false, 6, move |d, t| p(d, t)).await?;
    let map: HashMap<String, String> = new_state.into_iter().collect();
    std::fs::write(state_path(game_dir), serde_json::to_string(&map)?)?;
    Ok(())
}

/// Nombre de fichiers à mettre à jour et taille totale.
pub fn pending(game_dir: &Path, m: &Manifest) -> (usize, u64) {
    match plan(game_dir, m) {
        Ok((jobs, remove, _)) => (jobs.len() + remove.len(), jobs.iter().map(|j| j.size).sum()),
        Err(_) => (0, 0),
    }
}
