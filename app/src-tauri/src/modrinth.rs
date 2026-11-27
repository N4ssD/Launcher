//! Mods optionnels : infos et fichiers récupérés sur Modrinth (pas besoin de les héberger soi-même).

use crate::config::OptionalMod;
use crate::net::client;
use crate::sync::ManifestFile;
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

const API: &str = "https://api.modrinth.com/v2";

#[derive(Serialize, Clone, Debug)]
pub struct Resolved {
    pub id: String,
    pub name: String,
    pub description: String,
    pub icon: String,
    pub dir: String,
    pub default: bool,
    pub requires: Vec<String>,
    pub version: String,
    pub file: Option<ManifestFile>,
    pub error: Option<String>,
}

static CACHE: Mutex<Option<(Instant, String, Vec<Resolved>)>> = Mutex::new(None);

fn loader_for(o: &OptionalMod) -> String {
    if !o.loader.is_empty() {
        return o.loader.clone();
    }
    match o.dir.as_str() {
        "shaderpacks" => "iris".into(),
        "resourcepacks" => "minecraft".into(),
        _ => "neoforge".into(),
    }
}

async fn get(url: &str, query: &[(&str, String)]) -> Result<Value, String> {
    let r = client().get(url).query(query).send().await.map_err(|e| e.to_string())?;
    if !r.status().is_success() {
        return Err(format!("Modrinth a répondu {}", r.status()));
    }
    r.json().await.map_err(|e| e.to_string())
}

pub async fn resolve(items: &[OptionalMod], mc: &str) -> Vec<Resolved> {
    let key = format!("{mc}|{}", serde_json::to_string(items).unwrap_or_default());
    if let Some((t, k, v)) = CACHE.lock().unwrap().as_ref() {
        if k == &key && t.elapsed() < Duration::from_secs(600) {
            return v.clone();
        }
    }
    let mut projects: HashMap<String, Value> = HashMap::new();
    if !items.is_empty() {
        let ids = serde_json::to_string(&items.iter().map(|o| o.modrinth.clone()).collect::<Vec<_>>()).unwrap();
        if let Ok(Value::Array(list)) = get(&format!("{API}/projects"), &[("ids", ids)]).await {
            for p in list {
                for k in ["slug", "id"] {
                    if let Some(s) = p[k].as_str() {
                        projects.insert(s.to_lowercase(), p.clone());
                    }
                }
            }
        }
    }
    let mut out = Vec::new();
    for o in items {
        let p = projects.get(&o.modrinth.to_lowercase());
        let mut r = Resolved {
            id: o.modrinth.clone(),
            name: if o.name.is_empty() { p.and_then(|p| p["title"].as_str()).unwrap_or(&o.modrinth).to_string() } else { o.name.clone() },
            description: if o.description.is_empty() { p.and_then(|p| p["description"].as_str()).unwrap_or("").to_string() } else { o.description.clone() },
            icon: p.and_then(|p| p["icon_url"].as_str()).unwrap_or("").to_string(),
            dir: o.dir.clone(),
            default: o.default,
            requires: o.requires.clone(),
            version: String::new(),
            file: None,
            error: None,
        };
        let loaders = serde_json::to_string(&[loader_for(o)]).unwrap();
        let games = serde_json::to_string(&[mc]).unwrap();
        match get(&format!("{API}/project/{}/version", o.modrinth), &[("loaders", loaders), ("game_versions", games)]).await {
            Ok(Value::Array(vs)) if !vs.is_empty() => {
                let v = &vs[0];
                let files = v["files"].as_array().cloned().unwrap_or_default();
                let f = files.iter().find(|f| f["primary"].as_bool() == Some(true)).or(files.first());
                if let Some(f) = f {
                    let filename = f["filename"].as_str().unwrap_or("fichier.jar").replace(['/', '\\'], "_");
                    r.version = v["version_number"].as_str().unwrap_or("").to_string();
                    r.file = Some(ManifestFile {
                        path: format!("{}/{}", o.dir.trim_matches('/'), filename),
                        sha1: f["hashes"]["sha1"].as_str().unwrap_or("").to_string(),
                        size: f["size"].as_u64().unwrap_or(0),
                        url: f["url"].as_str().unwrap_or("").to_string(),
                        info: None,
                        optional: true,
                    });
                }
            }
            Ok(_) => r.error = Some(format!("Pas disponible pour Minecraft {mc}")),
            Err(e) => r.error = Some(e),
        }
        out.push(r);
    }
    *CACHE.lock().unwrap() = Some((Instant::now(), key, out.clone()));
    out
}

/// Ids activés : choix du joueur, sinon valeur par défaut, plus les dépendances nécessaires.
pub fn enabled(list: &[Resolved], choices: &HashMap<String, bool>) -> Vec<String> {
    let mut on: Vec<String> = list
        .iter()
        .filter(|r| *choices.get(&r.id).unwrap_or(&r.default))
        .map(|r| r.id.clone())
        .collect();
    let mut i = 0;
    while i < on.len() {
        if let Some(r) = list.iter().find(|r| r.id == on[i]) {
            for dep in &r.requires {
                if !on.contains(dep) && list.iter().any(|x| &x.id == dep) {
                    on.push(dep.clone());
                }
            }
        }
        i += 1;
    }
    on
}
