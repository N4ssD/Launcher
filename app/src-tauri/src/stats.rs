//! Temps de jeu : total, dernière session, série de jours joués.

use crate::config::data_dir;
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Serialize, Deserialize, Default, Clone)]
pub struct Stats {
    #[serde(default)]
    pub total_secs: u64,
    #[serde(default)]
    pub last_session_secs: u64,
    #[serde(default)]
    pub last_played: u64,
    #[serde(default)]
    pub sessions: u32,
    /// Jours joués (numéro de jour depuis 1970, heure locale approximée côté interface)
    #[serde(default)]
    pub days: Vec<i64>,
}

fn path() -> std::path::PathBuf {
    data_dir().join("temps-de-jeu.json")
}

fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

pub fn load() -> Stats {
    std::fs::read_to_string(path()).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default()
}

/// Ajoute une session terminée. `day` = jour local fourni par l'interface (ou calculé en UTC).
pub fn add_session(secs: u64, tz_offset_min: i64) {
    if secs < 30 {
        return; // lancement raté ou fermé tout de suite : on ne compte pas
    }
    let mut s = load();
    s.total_secs += secs;
    s.last_session_secs = secs;
    s.last_played = now();
    s.sessions += 1;
    let day = ((now() as i64) + tz_offset_min * 60).div_euclid(86400);
    if !s.days.contains(&day) {
        s.days.push(day);
        s.days.sort_unstable();
        let keep = s.days.len().saturating_sub(400);
        s.days.drain(..keep);
    }
    let _ = std::fs::create_dir_all(data_dir());
    let _ = std::fs::write(path(), serde_json::to_string(&s).unwrap_or_default());
}
