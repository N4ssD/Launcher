mod auth;
mod config;
mod install;
mod launch;
mod net;
mod status;
mod sync;

use anyhow::anyhow;
use config::{Pack, Settings, PACK_BASE_URL};
use serde::Serialize;
use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Default)]
struct AppState {
    busy: AtomicBool,
}

#[derive(Serialize, Clone)]
struct Prog {
    stage: String,
    label: String,
    /// 0..1, ou -1 si indéterminé
    value: f64,
}

fn emit(app: &AppHandle, stage: &str, label: &str, value: f64) {
    let _ = app.emit("progress", Prog { stage: stage.into(), label: label.into(), value });
}

fn progress(app: &AppHandle, stage: &'static str, label: &'static str) -> install::Progress {
    let app = app.clone();
    let last = Arc::new(AtomicI64::new(-1));
    Arc::new(move |done: usize, total: usize| {
        let pct = if total == 0 { 100 } else { (done * 100 / total) as i64 };
        if last.swap(pct, Ordering::SeqCst) != pct {
            emit(&app, stage, label, pct as f64 / 100.0);
        }
    })
}

fn err(e: anyhow::Error) -> String {
    format!("{e:#}")
}

#[derive(Serialize)]
struct AccountInfo {
    name: String,
    uuid: String,
}

#[derive(Serialize)]
struct Info {
    account: Option<AccountInfo>,
    settings: Settings,
    login_configured: bool,
    version: String,
}

#[tauri::command]
fn get_info() -> Info {
    Info {
        account: auth::load().map(|a| AccountInfo { name: a.name, uuid: a.uuid }),
        settings: Settings::load(),
        login_configured: !config::CLIENT_ID.trim().is_empty(),
        version: env!("CARGO_PKG_VERSION").into(),
    }
}

async fn fetch_pack() -> anyhow::Result<Pack> {
    let t = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)?.as_secs();
    net::get_json(&format!("{PACK_BASE_URL}pack.json?t={t}")).await
}

#[derive(Serialize)]
struct PackInfo {
    pack: Pack,
    pending_files: usize,
    pending_bytes: u64,
}

#[tauri::command]
async fn get_pack() -> Result<PackInfo, String> {
    let pack = fetch_pack().await.map_err(err)?;
    let (pending_files, pending_bytes) = match sync::fetch_manifest().await {
        Ok(m) => tokio::task::spawn_blocking(move || sync::pending(&config::game_dir(), &m))
            .await
            .unwrap_or((0, 0)),
        Err(_) => (0, 0),
    };
    Ok(PackInfo { pack, pending_files, pending_bytes })
}

#[tauri::command]
async fn server_status(address: String) -> status::ServerStatus {
    status::ping(&address).await
}

#[derive(Serialize)]
struct LoginStart {
    user_code: String,
    verification_uri: String,
}

#[derive(Serialize, Clone)]
struct LoginResult {
    ok: bool,
    name: Option<String>,
    error: Option<String>,
}

#[tauri::command]
async fn login_start(app: AppHandle) -> Result<LoginStart, String> {
    let dc = auth::start_device().await.map_err(err)?;
    let out = LoginStart { user_code: dc.user_code.clone(), verification_uri: dc.verification_uri.clone() };
    tauri::async_runtime::spawn(async move {
        let r = match auth::poll_device(&dc).await {
            Ok(acc) => LoginResult { ok: true, name: Some(acc.name), error: None },
            Err(e) => LoginResult { ok: false, name: None, error: Some(err(e)) },
        };
        let _ = app.emit("login", r);
    });
    Ok(out)
}

#[tauri::command]
fn logout() {
    auth::clear();
}

#[tauri::command]
fn save_settings(settings: Settings) -> Result<(), String> {
    settings.save().map_err(err)
}

#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    if !url.starts_with("https://") {
        return Err("Adresse refusée".into());
    }
    open::that_detached(url).map_err(|e| e.to_string())
}

#[tauri::command]
fn open_folder(which: String) -> Result<(), String> {
    let dir = match which.as_str() {
        "logs" => config::data_dir().join("logs"),
        _ => config::game_dir(),
    };
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    open::that_detached(dir).map_err(|e| e.to_string())
}

#[tauri::command]
fn play(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    if state.busy.swap(true, Ordering::SeqCst) {
        return Err("Une préparation est déjà en cours.".into());
    }
    tauri::async_runtime::spawn(async move {
        let r = run_play(&app).await;
        app.state::<AppState>().busy.store(false, Ordering::SeqCst);
        if let Err(e) = r {
            let _ = app.emit("play-error", err(e));
        }
    });
    Ok(())
}

async fn run_play(app: &AppHandle) -> anyhow::Result<()> {
    let settings = Settings::load();
    emit(app, "compte", "Vérification du compte", -1.0);
    let acc = auth::load().ok_or_else(|| anyhow!("Connecte-toi d'abord avec ton compte Microsoft."))?;
    let acc = auth::ensure_valid(acc).await?;

    emit(app, "pack", "Récupération du modpack", -1.0);
    let pack = fetch_pack().await?;
    let manifest = sync::fetch_manifest().await?;
    let mc_dir = config::mc_dir();
    let game_dir = config::game_dir();

    let vjson = install::install_vanilla(&mc_dir, &pack.minecraft, progress(app, "minecraft", "Téléchargement de Minecraft")).await?;
    let component = vjson["javaVersion"]["component"].as_str().unwrap_or("java-runtime-delta").to_string();
    let (java, javaw) = install::install_java(&component, progress(app, "java", "Installation de Java")).await?;

    emit(app, "neoforge", "Installation de NeoForge", -1.0);
    let neo = install::resolve_neoforge(&pack.neoforge, &pack.minecraft).await?;
    let id = install::install_neoforge(&mc_dir, &java, &neo).await?;
    let merged = launch::merged_version(&mc_dir, &id)?;
    let jobs = install::library_jobs(&merged, &mc_dir.join("libraries"));
    let p = progress(app, "neoforge", "Bibliothèques NeoForge");
    net::download_all(jobs, false, 12, move |d, t| p(d, t)).await?;

    sync::sync(&game_dir, &manifest, progress(app, "mods", "Mise à jour des mods")).await?;

    emit(app, "lancement", "Lancement de Minecraft", -1.0);
    let mut child = launch::launch(launch::LaunchOptions {
        mc_dir: &mc_dir,
        game_dir: &game_dir,
        javaw: &javaw,
        version_id: &id,
        account: &acc,
        ram_mb: settings.ram_mb,
        server: &pack.address,
    })?;
    let _ = app.emit("launched", acc.name.clone());
    if settings.minimize_on_launch {
        if let Some(w) = app.get_webview_window("main") {
            let _ = w.minimize();
        }
    }
    let app2 = app.clone();
    std::thread::spawn(move || {
        let code = child.wait().ok().and_then(|s| s.code());
        let _ = app2.emit("game-exit", code);
        if let Some(w) = app2.get_webview_window("main") {
            let _ = w.unminimize();
            let _ = w.set_focus();
        }
    });
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            get_info,
            get_pack,
            server_status,
            login_start,
            logout,
            save_settings,
            open_url,
            open_folder,
            play
        ])
        .run(tauri::generate_context!())
        .expect("erreur au démarrage du launcher");
}
