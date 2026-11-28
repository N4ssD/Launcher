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
    #[serde(default = "default_true")]
    pub auto_update: bool,
    /// Mods optionnels activés (id → oui/non). Absent = valeur par défaut du pack.
    #[serde(default)]
    pub optional: std::collections::HashMap<String, bool>,
    #[serde(default)]
    pub fullscreen: bool,
    /// Taille de la fenêtre du jeu (0 = taille par défaut de Minecraft)
    #[serde(default)]
    pub width: u32,
    #[serde(default)]
    pub height: u32,
    #[serde(default = "default_true")]
    pub discord_rpc: bool,
    /// Volume des sons d'interface (0 à 100)
    #[serde(default = "default_volume")]
    pub sound_volume: u32,
    /// Musique d'ambiance
    #[serde(default = "default_true")]
    pub music_on: bool,
    #[serde(default = "default_music")]
    pub music_volume: u32,
    /// Arguments Java optimisés (G1GC)
    #[serde(default = "default_true")]
    pub optimized_java: bool,
    /// Langue de l'interface : fr ou en
    #[serde(default = "default_lang")]
    pub lang: String,
}

fn default_volume() -> u32 {
    40
}
fn default_music() -> u32 {
    25
}
fn default_lang() -> String {
    "fr".into()
}

/// 0 = automatique (valeur conseillée selon le PC et le modpack)
fn default_ram() -> u32 {
    0
}
fn default_true() -> bool {
    true
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            ram_mb: default_ram(),
            minimize_on_launch: true,
            auto_update: true,
            optional: Default::default(),
            fullscreen: false,
            width: 0,
            height: 0,
            discord_rpc: true,
            sound_volume: default_volume(),
            music_on: true,
            music_volume: default_music(),
            optimized_java: true,
            lang: default_lang(),
        }
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
    /// Historique des mises à jour (onglet Nouveautés)
    #[serde(default)]
    pub changelog: Vec<Release>,
    /// Mods optionnels proposés aux joueurs (téléchargés depuis Modrinth)
    #[serde(default)]
    pub optional: Vec<OptionalMod>,
    /// Liens affichés dans la barre du haut
    #[serde(default)]
    pub links: Links,
    /// Identifiant de l'application Discord (statut « Joue sur … »)
    #[serde(default)]
    pub discord_app_id: String,
    /// Événement affiché sur l'accueil (facultatif)
    #[serde(default)]
    pub event: Option<Event>,
    /// RAM conseillée pour le modpack, en Mo (facultatif)
    #[serde(default)]
    pub ram: Option<u32>,
}

/// Mémoire du PC et valeurs conseillées (en Mo).
pub mod memory {
    pub fn total_mb() -> u64 {
        let mut s = sysinfo::System::new();
        s.refresh_memory();
        s.total_memory() / 1024 / 1024
    }
    /// Au-delà, Windows risque de manquer de mémoire : on garde au moins 30 % (min 2,5 Go) pour le système.
    pub fn safe_max_mb(total: u64) -> u64 {
        let reserve = ((total as f64) * 0.3).max(2560.0);
        (((total as f64 - reserve).max(2048.0)) as u64) / 512 * 512
    }
    pub fn recommended_mb(total: u64, pack: Option<u32>) -> u64 {
        let want = pack.map(|v| v as u64).unwrap_or(6144);
        want.min(safe_max_mb(total)).max(2048) / 512 * 512
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Event {
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub text: String,
    /// Début, ex. « 2026-12-05T21:00:00+01:00 »
    #[serde(default)]
    pub date: String,
    /// Fin (facultatif)
    #[serde(default)]
    pub end: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct Links {
    #[serde(default)]
    pub discord: String,
    #[serde(default)]
    pub site: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct OptionalMod {
    /// Identifiant (slug) du projet sur Modrinth, ex. « xaeros-minimap »
    pub modrinth: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub description: String,
    /// Dossier de destination : mods (défaut), shaderpacks, resourcepacks
    #[serde(default = "default_dir")]
    pub dir: String,
    /// Chargeur à demander à Modrinth (défaut : neoforge ; « iris » pour les shaders)
    #[serde(default)]
    pub loader: String,
    /// Activé par défaut ?
    #[serde(default)]
    pub default: bool,
    /// Autres mods optionnels nécessaires (slugs)
    #[serde(default)]
    pub requires: Vec<String>,
}

fn default_dir() -> String {
    "mods".into()
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Release {
    #[serde(default)]
    pub version: String,
    #[serde(default)]
    pub date: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub items: Vec<News>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct News {
    #[serde(rename = "type", default)]
    pub kind: String,
    pub text: String,
}
