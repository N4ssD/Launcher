//! Réglages fixés à la compilation et chemins locaux.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Adresse du dossier `modpack/` du dépôt GitHub (pack.json, manifest.json, mods…).
/// Peut être changée au moment du build avec la variable d'environnement PACK_BASE_URL.
pub const PACK_BASE_URL: &str = match option_env!("PACK_BASE_URL") {
    Some(v) => v,
    None => "https://raw.githubusercontent.com/N4ssD/Launcher/main/modpack/",
};

/// Identifiant de l'application Azure (connexion Microsoft).
/// Fourni au build par la variable GitHub `AZURE_CLIENT_ID`.
pub const CLIENT_ID: &str = match option_env!("AZURE_CLIENT_ID") {
    Some(v) => v,
    None => "",
};

pub const USER_AGENT: &str = concat!("N4ssD-Launcher/", env!("CARGO_PKG_VERSION"));

/// Dossier de données : %APPDATA%\N4ssD-Launcher
pub fn data_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("N4ssD-Launcher")
}

pub fn mc_dir() -> PathBuf {
    data_dir().join("minecraft")
}

pub fn game_dir() -> PathBuf {
    data_dir().join("jeu")
}

pub fn runtime_dir() -> PathBuf {
    data_dir().join("java")
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Settings {
    #[serde(default = "default_ram")]
    pub ram_mb: u32,
    #[serde(default = "default_true")]
    pub minimize_on_launch: bool,
}

fn default_ram() -> u32 {
    6144
}
fn default_true() -> bool {
    true
}

impl Default for Settings {
    fn default() -> Self {
        Settings { ram_mb: default_ram(), minimize_on_launch: true }
    }
}

impl Settings {
    fn path() -> PathBuf {
        data_dir().join("reglages.json")
    }
    pub fn load() -> Settings {
        std::fs::read_to_string(Self::path())
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }
    pub fn save(&self) -> anyhow::Result<()> {
        std::fs::create_dir_all(data_dir())?;
        std::fs::write(Self::path(), serde_json::to_string_pretty(self)?)?;
        Ok(())
    }
}

/// Contenu de modpack/pack.json
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Pack {
    pub name: String,
    pub address: String,
    pub minecraft: String,
    pub neoforge: String,
    #[serde(default)]
    pub version: String,
    #[serde(default)]
    pub news: Vec<News>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct News {
    #[serde(rename = "type", default)]
    pub kind: String,
    pub text: String,
}
