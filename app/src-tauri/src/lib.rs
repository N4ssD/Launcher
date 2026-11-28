mod auth;
mod config;
mod install;
mod launch;
mod modrinth;
mod net;
mod presence;
mod status;
mod sync;

use anyhow::anyhow;
use config::{memory, Pack, Settings, PACK_BASE_URL};
use serde::Serialize;
use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_updater::UpdaterExt;

#[derive(Default)]
struct AppState {
    busy: AtomicBool,
    /// Mise à jour téléchargée, prête à être installée
    pending_update: std::sync::Mutex<Option<(tauri_plugin_updater::Update, Vec<u8>)>>,
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
    system_ram_mb: u64,
    safe_ram_mb: u64,
}

#[tauri::command]
fn get_info() -> Info {
    Info {
        account: auth::load().map(|a| AccountInfo { name: a.name, uuid: a.uuid }),
        settings: Settings::load(),
        login_configured: !config::CLIENT_ID.trim().is_empty(),
        version: env!("CARGO_PKG_VERSION").into(),
        system_ram_mb: memory::total_mb(),
        safe_ram_mb: memory::safe_max_mb(memory::total_mb()),
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
        "screenshots" => config::game_dir().join("screenshots"),
        "crash" => config::game_dir().join("crash-reports"),
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

struct Prepared {
    pack: Pack,
    javaw: std::path::PathBuf,
    version_id: String,
}

/// Installe/vérifie tout ce qu'il faut (Java, Minecraft, NeoForge, mods).
/// `strict` = réparation : vérifie chaque fichier (SHA-1) et réinstalle NeoForge.
async fn prepare(app: &AppHandle, settings: &Settings, strict: bool) -> anyhow::Result<Prepared> {
    emit(app, "pack", "Récupération du modpack", -1.0);
    let pack = fetch_pack().await?;
    let mut manifest = sync::fetch_manifest().await?;
    let opt = modrinth::resolve(&pack.optional, &pack.minecraft).await;
    for id in modrinth::enabled(&opt, &settings.optional) {
        if let Some(f) = opt.iter().find(|r| r.id == id).and_then(|r| r.file.clone()) {
            manifest.files.push(f);
        }
    }
    let mc_dir = config::mc_dir();
    let game_dir = config::game_dir();

    let vjson = install::install_vanilla(&mc_dir, &pack.minecraft, progress(app, "minecraft", "Téléchargement de Minecraft"), strict).await?;
    let component = vjson["javaVersion"]["component"].as_str().unwrap_or("java-runtime-delta").to_string();
    let (java, javaw) = install::install_java(&component, progress(app, "java", "Installation de Java"), strict).await?;

    emit(app, "neoforge", "Installation de NeoForge", -1.0);
    let neo = install::resolve_neoforge(&pack.neoforge, &pack.minecraft).await?;
    if strict {
        let _ = std::fs::remove_dir_all(mc_dir.join("versions").join(format!("neoforge-{neo}")));
    }
    let id = install::install_neoforge(&mc_dir, &java, &neo).await?;
    let merged = launch::merged_version(&mc_dir, &id)?;
    let jobs = install::library_jobs(&merged, &mc_dir.join("libraries"));
    let p = progress(app, "neoforge", "Bibliothèques NeoForge");
    net::download_all(jobs, strict, 12, move |d, t| p(d, t)).await?;

    if strict {
        let _ = std::fs::remove_file(game_dir.join(".launcher-sync.json"));
    }
    sync::sync(&game_dir, &manifest, progress(app, "mods", "Mise à jour des mods")).await?;
    Ok(Prepared { pack, javaw, version_id: id })
}

async fn run_play(app: &AppHandle) -> anyhow::Result<()> {
    let settings = Settings::load();
    emit(app, "compte", "Vérification du compte", -1.0);
    let acc = auth::load().ok_or_else(|| anyhow!("Connecte-toi d'abord avec ton compte Microsoft."))?;
    let acc = auth::ensure_valid(acc).await?;
    let Prepared { pack, javaw, version_id } = prepare(app, &settings, false).await?;

    emit(app, "lancement", "Lancement de Minecraft", -1.0);
    let mc_dir = config::mc_dir();
    let game_dir = config::game_dir();
    let mut child = launch::launch(launch::LaunchOptions {
        mc_dir: &mc_dir,
        game_dir: &game_dir,
        javaw: &javaw,
        version_id: &version_id,
        account: &acc,
        ram_mb: if settings.ram_mb == 0 {
            memory::recommended_mb(memory::total_mb(), pack.ram) as u32
        } else {
            settings.ram_mb
        },
        server: &pack.address,
        fullscreen: settings.fullscreen,
        width: settings.width,
        height: settings.height,
        optimized_java: settings.optimized_java,
    })?;
    if settings.discord_rpc && !pack.discord_app_id.trim().is_empty() {
        let start = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0);
        presence::send(presence::Msg::Playing {
            app_id: pack.discord_app_id.trim().to_string(),
            details: format!("Joue sur {}", pack.name),
            state: if pack.version.is_empty() { "Modpack officiel".into() } else { format!("Modpack v{}", pack.version) },
            start,
            button: if pack.links.discord.starts_with("https://") { Some(("Rejoindre le serveur".into(), pack.links.discord.clone())) } else { None },
        });
    }
    let _ = app.emit("launched", acc.name.clone());
    if settings.minimize_on_launch {
        if let Some(w) = app.get_webview_window("main") {
            let _ = w.minimize();
        }
    }
    let app2 = app.clone();
    std::thread::spawn(move || {
        let code = child.wait().ok().and_then(|s| s.code());
        presence::send(presence::Msg::Clear);
        let _ = app2.emit("game-exit", code);
        if let Some(w) = app2.get_webview_window("main") {
            let _ = w.unminimize();
            let _ = w.set_focus();
        }
    });
    Ok(())
}

#[tauri::command]
fn repair(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    if state.busy.swap(true, Ordering::SeqCst) {
        return Err("Une préparation est déjà en cours.".into());
    }
    tauri::async_runtime::spawn(async move {
        let r = prepare(&app, &Settings::load(), true).await;
        app.state::<AppState>().busy.store(false, Ordering::SeqCst);
        match r {
            Ok(_) => { let _ = app.emit("repair-done", ()); }
            Err(e) => { let _ = app.emit("play-error", err(e)); }
        }
    });
    Ok(())
}

// ---------- Comptes ----------

#[tauri::command]
fn list_accounts() -> Vec<auth::AccountSummary> {
    auth::list()
}

#[tauri::command]
fn switch_account(uuid: String) -> bool {
    auth::switch(&uuid)
}

#[tauri::command]
fn remove_account(uuid: String) {
    auth::remove(&uuid)
}

#[derive(Serialize)]
struct ModsInfo {
    mods: Vec<serde_json::Value>,
    optional: Vec<modrinth::Resolved>,
    enabled: Vec<String>,
}

#[tauri::command]
async fn get_mods() -> Result<ModsInfo, String> {
    let pack = fetch_pack().await.map_err(err)?;
    let manifest = sync::fetch_manifest().await.map_err(err)?;
    let mut mods: Vec<serde_json::Value> = manifest
        .files
        .iter()
        .filter(|f| f.path.starts_with("mods/") && f.path.to_lowercase().ends_with(".jar"))
        .map(|f| {
            let mut v = f.info.clone().unwrap_or_else(|| serde_json::json!({}));
            if v.get("name").and_then(|n| n.as_str()).map(|n| n.is_empty()).unwrap_or(true) {
                let stem = f.path.trim_start_matches("mods/").trim_end_matches(".jar").to_string();
                v["name"] = serde_json::Value::String(stem);
            }
            v["size"] = serde_json::json!(f.size);
            v
        })
        .collect();
    mods.sort_by_key(|m| m["name"].as_str().unwrap_or("").to_lowercase());
    let optional = modrinth::resolve(&pack.optional, &pack.minecraft).await;
    let enabled = modrinth::enabled(&optional, &Settings::load().optional);
    Ok(ModsInfo { mods, optional, enabled })
}

// ---------- Captures d'écran ----------

#[derive(Serialize)]
struct Shot {
    path: String,
    name: String,
    modified: u64,
}

#[tauri::command]
fn list_screenshots() -> Vec<Shot> {
    let dir = config::game_dir().join("screenshots");
    let mut out: Vec<Shot> = std::fs::read_dir(&dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter(|e| e.path().extension().map(|x| x.eq_ignore_ascii_case("png")).unwrap_or(false))
        .map(|e| Shot {
            path: e.path().to_string_lossy().to_string(),
            name: e.file_name().to_string_lossy().to_string(),
            modified: e
                .metadata()
                .and_then(|m| m.modified())
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0),
        })
        .collect();
    out.sort_by(|a, b| b.modified.cmp(&a.modified));
    out.truncate(120);
    out
}

#[tauri::command]
fn open_file(path: String) -> Result<(), String> {
    let p = std::path::PathBuf::from(&path);
    let shots = config::game_dir().join("screenshots");
    if !p.starts_with(&shots) || !p.exists() {
        return Err("Fichier refusé".into());
    }
    open::that_detached(p).map_err(|e| e.to_string())
}

// ---------- Rapport de crash ----------

#[derive(Serialize)]
struct CrashInfo {
    text: String,
    source: String,
}

fn tail(text: &str, lines: usize) -> String {
    let v: Vec<&str> = text.lines().collect();
    v[v.len().saturating_sub(lines)..].join("\n")
}

#[tauri::command]
fn crash_info() -> CrashInfo {
    let dir = config::game_dir().join("crash-reports");
    let recent = std::fs::read_dir(&dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|e| Some((e.metadata().ok()?.modified().ok()?, e.path())))
        .filter(|(t, _)| t.elapsed().map(|d| d.as_secs() < 900).unwrap_or(false))
        .max_by_key(|(t, _)| *t);
    if let Some((_, p)) = recent {
        if let Ok(t) = std::fs::read_to_string(&p) {
            return CrashInfo { text: t, source: p.file_name().unwrap_or_default().to_string_lossy().to_string() };
        }
    }
    let log = std::fs::read_to_string(config::data_dir().join("logs").join("jeu.log")).unwrap_or_default();
    CrashInfo { text: tail(&log, 250), source: "jeu.log".into() }
}

#[tauri::command]
async fn share_crash(text: String) -> Result<String, String> {
    let r = net::client()
        .post("https://api.mclo.gs/1/log")
        .form(&[("content", text.as_str())])
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let v: serde_json::Value = r.json().await.map_err(|e| e.to_string())?;
    v["url"].as_str().map(String::from).ok_or_else(|| "Envoi du rapport impossible".into())
}

// ---------- Mise à jour du launcher ----------

#[derive(Serialize)]
struct UpdateInfo {
    version: String,
    notes: Option<String>,
}

#[tauri::command]
async fn check_update(app: AppHandle) -> Result<Option<UpdateInfo>, String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    match updater.check().await {
        Ok(Some(u)) => Ok(Some(UpdateInfo { version: u.version.clone(), notes: u.body.clone() })),
        Ok(None) => Ok(None),
        Err(e) => Err(format!("Impossible de vérifier les mises à jour : {e}")),
    }
}

/// Télécharge la mise à jour en arrière-plan (sans l'installer).
#[tauri::command]
async fn download_update(app: AppHandle) -> Result<String, String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    let update = updater
        .check()
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Le launcher est déjà à jour.".to_string())?;
    let version = update.version.clone();
    let app2 = app.clone();
    let mut done: u64 = 0;
    let bytes = update
        .download(
            move |chunk, total| {
                done += chunk as u64;
                let _ = app2.emit("update-progress", (done, total));
            },
            || {},
        )
        .await
        .map_err(|e| format!("La mise à jour a échoué : {e}"))?;
    *app.state::<AppState>().pending_update.lock().unwrap() = Some((update, bytes));
    Ok(version)
}

/// Installe la mise à jour téléchargée (installation silencieuse) puis redémarre.
#[tauri::command]
async fn install_update(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    if state.busy.load(Ordering::SeqCst) {
        return Err("Attends la fin de la préparation du jeu.".into());
    }
    let pending = state.pending_update.lock().unwrap().take();
    let (update, bytes) = match pending {
        Some(p) => p,
        None => {
            let updater = app.updater().map_err(|e| e.to_string())?;
            let update = updater
                .check()
                .await
                .map_err(|e| e.to_string())?
                .ok_or_else(|| "Le launcher est déjà à jour.".to_string())?;
            let app2 = app.clone();
            let mut done: u64 = 0;
            let bytes = update
                .download(
                    move |chunk, total| {
                        done += chunk as u64;
                        let _ = app2.emit("update-progress", (done, total));
                    },
                    || {},
                )
                .await
                .map_err(|e| format!("La mise à jour a échoué : {e}"))?;
            (update, bytes)
        }
    };
    update.install(bytes).map_err(|e| format!("La mise à jour a échoué : {e}"))?;
    app.restart();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
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
            play,
            check_update,
            download_update,
            install_update,
            get_mods,
            list_screenshots,
            open_file,
            crash_info,
            share_crash,
            repair,
            list_accounts,
            switch_account,
            remove_account
        ])
        .run(tauri::generate_context!())
        .expect("erreur au démarrage du launcher");
}
