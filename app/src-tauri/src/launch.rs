//! Construction de la ligne de commande et lancement du jeu.

use crate::auth::Account;
use crate::config::{data_dir, CLIENT_ID};
use crate::install::{library_entry, rules_allow};
use anyhow::{anyhow, Result};
use serde_json::{Map, Value};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};

#[cfg(windows)]
const CP_SEP: &str = ";";
#[cfg(not(windows))]
const CP_SEP: &str = ":";

fn read_version(mc_dir: &Path, id: &str) -> Result<Value> {
    let p = mc_dir.join("versions").join(id).join(format!("{id}.json"));
    let s = std::fs::read_to_string(&p).map_err(|_| anyhow!("Version {id} absente"))?;
    Ok(serde_json::from_str(&s)?)
}

fn lib_key(lib: &Value) -> String {
    let name = lib.get("name").and_then(|n| n.as_str()).unwrap_or("");
    let p: Vec<&str> = name.split(':').collect();
    match p.len() {
        0..=2 => name.to_string(),
        3 => format!("{}:{}", p[0], p[1]),
        _ => format!("{}:{}:{}", p[0], p[1], p[3]),
    }
}

/// Fusionne une version (NeoForge) avec celle dont elle hérite (vanilla).
pub fn merged_version(mc_dir: &Path, id: &str) -> Result<Value> {
    let child = read_version(mc_dir, id)?;
    let Some(parent_id) = child.get("inheritsFrom").and_then(|p| p.as_str()) else {
        return Ok(child);
    };
    let parent = merged_version(mc_dir, parent_id)?;
    let mut out: Map<String, Value> = parent.as_object().cloned().unwrap_or_default();
    for (k, v) in child.as_object().cloned().unwrap_or_default() {
        match k.as_str() {
            "libraries" | "arguments" | "inheritsFrom" => {}
            _ => {
                out.insert(k, v);
            }
        }
    }
    // Bibliothèques : celles de NeoForge d'abord, sans doublon.
    let mut seen = HashSet::new();
    let mut libs = Vec::new();
    for lib in child["libraries"].as_array().into_iter().flatten().chain(parent["libraries"].as_array().into_iter().flatten()) {
        if seen.insert(lib_key(lib)) {
            libs.push(lib.clone());
        }
    }
    out.insert("libraries".into(), Value::Array(libs));
    // Arguments : vanilla puis NeoForge.
    let mut args = Map::new();
    for kind in ["jvm", "game"] {
        let mut list = Vec::new();
        list.extend(parent["arguments"][kind].as_array().cloned().unwrap_or_default());
        list.extend(child["arguments"][kind].as_array().cloned().unwrap_or_default());
        args.insert(kind.into(), Value::Array(list));
    }
    out.insert("arguments".into(), Value::Object(args));
    out.insert("id".into(), Value::String(id.to_string()));
    Ok(Value::Object(out))
}

fn collect(list: &Value, out: &mut Vec<String>) {
    for a in list.as_array().into_iter().flatten() {
        if let Some(s) = a.as_str() {
            out.push(s.to_string());
        } else if rules_allow(a.get("rules")) {
            match &a["value"] {
                Value::String(s) => out.push(s.clone()),
                Value::Array(arr) => out.extend(arr.iter().filter_map(|x| x.as_str().map(String::from))),
                _ => {}
            }
        }
    }
}

fn substitute(arg: &str, vars: &HashMap<&str, String>) -> String {
    let mut s = arg.to_string();
    for (k, v) in vars {
        s = s.replace(&format!("${{{k}}}"), v);
    }
    s
}

pub fn split_address(addr: &str) -> (String, u16) {
    let addr = addr.trim();
    match addr.rsplit_once(':') {
        Some((h, p)) if p.parse::<u16>().is_ok() && !h.contains(':') => (h.to_string(), p.parse().unwrap()),
        _ => (addr.to_string(), 25565),
    }
}

pub struct LaunchOptions<'a> {
    pub mc_dir: &'a Path,
    pub game_dir: &'a Path,
    pub javaw: &'a Path,
    pub version_id: &'a str,
    pub account: &'a Account,
    pub ram_mb: u32,
    pub server: &'a str,
    pub fullscreen: bool,
    pub width: u32,
    pub height: u32,
}

pub fn launch(o: LaunchOptions) -> Result<Child> {
    let v = merged_version(o.mc_dir, o.version_id)?;
    let libs_dir = o.mc_dir.join("libraries");
    let vdir = o.mc_dir.join("versions").join(o.version_id);
    let natives = vdir.join("natives");
    std::fs::create_dir_all(&natives)?;
    std::fs::create_dir_all(o.game_dir)?;

    // Comme le launcher officiel : copie du jar vanilla dans le dossier de la version.
    let own_jar = vdir.join(format!("{}.jar", o.version_id));
    if !own_jar.exists() {
        if let Some(parent) = read_version(o.mc_dir, o.version_id)?.get("inheritsFrom").and_then(|p| p.as_str()) {
            let src = o.mc_dir.join("versions").join(parent).join(format!("{parent}.jar"));
            if src.exists() {
                std::fs::copy(&src, &own_jar)?;
            }
        }
    }

    let mut cp: Vec<PathBuf> = Vec::new();
    let mut seen = HashSet::new();
    for lib in v["libraries"].as_array().into_iter().flatten() {
        if let Some((path, ..)) = library_entry(lib, &libs_dir) {
            if seen.insert(path.clone()) {
                cp.push(path);
            }
        }
    }
    cp.push(own_jar);
    let classpath = cp.iter().map(|p| p.to_string_lossy().to_string()).collect::<Vec<_>>().join(CP_SEP);

    let asset_index = v["assetIndex"]["id"].as_str().or(v["assets"].as_str()).unwrap_or("").to_string();
    let mut vars: HashMap<&str, String> = HashMap::new();
    vars.insert("natives_directory", natives.to_string_lossy().into());
    vars.insert("launcher_name", "N4ssD-Launcher".into());
    vars.insert("launcher_version", env!("CARGO_PKG_VERSION").into());
    vars.insert("classpath", classpath);
    vars.insert("classpath_separator", CP_SEP.into());
    vars.insert("library_directory", libs_dir.to_string_lossy().into());
    vars.insert("version_name", o.version_id.into());
    vars.insert("auth_player_name", o.account.name.clone());
    vars.insert("game_directory", o.game_dir.to_string_lossy().into());
    vars.insert("assets_root", o.mc_dir.join("assets").to_string_lossy().into());
    vars.insert("game_assets", o.mc_dir.join("assets").to_string_lossy().into());
    vars.insert("assets_index_name", asset_index);
    vars.insert("auth_uuid", o.account.uuid.clone());
    vars.insert("auth_access_token", o.account.access_token.clone());
    vars.insert("auth_session", o.account.access_token.clone());
    vars.insert("clientid", CLIENT_ID.into());
    vars.insert("auth_xuid", o.account.xuid.clone());
    vars.insert("user_type", "msa".into());
    vars.insert("user_properties", "{}".into());
    vars.insert("version_type", v["type"].as_str().unwrap_or("release").into());

    let mut jvm = Vec::new();
    collect(&v["arguments"]["jvm"], &mut jvm);
    let mut game = Vec::new();
    collect(&v["arguments"]["game"], &mut game);
    if game.is_empty() {
        if let Some(old) = v["minecraftArguments"].as_str() {
            game.extend(old.split(' ').map(String::from));
        }
    }

    let mut args: Vec<String> = vec![
        format!("-Xmx{}M", o.ram_mb),
        format!("-Xms{}M", (o.ram_mb / 4).max(512)),
    ];
    if let Some(log) = v["logging"]["client"].as_object() {
        if let (Some(arg), Some(id)) = (log.get("argument").and_then(|a| a.as_str()), log["file"]["id"].as_str()) {
            let path = o.mc_dir.join("assets").join("log_configs").join(id);
            if path.exists() {
                args.push(arg.replace("${path}", &path.to_string_lossy()));
            }
        }
    }
    args.extend(jvm.iter().map(|a| substitute(a, &vars)));
    args.push(v["mainClass"].as_str().ok_or_else(|| anyhow!("mainClass manquant"))?.to_string());
    args.extend(game.iter().map(|a| substitute(a, &vars)));

    if o.fullscreen {
        args.push("--fullscreen".into());
    } else if o.width >= 640 && o.height >= 360 {
        args.extend(["--width".to_string(), o.width.to_string(), "--height".to_string(), o.height.to_string()]);
    }
    if !o.server.trim().is_empty() {
        let (host, port) = split_address(o.server);
        args.push("--quickPlayMultiplayer".into());
        args.push(format!("{host}:{port}"));
    }

    let logs = data_dir().join("logs");
    std::fs::create_dir_all(&logs)?;
    let log = std::fs::File::create(logs.join("jeu.log"))?;
    let mut cmd = Command::new(o.javaw);
    cmd.args(&args)
        .current_dir(o.game_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::from(log.try_clone()?))
        .stderr(Stdio::from(log));
    crate::install::hide_window(&mut cmd);
    Ok(cmd.spawn().map_err(|e| anyhow!("Impossible de lancer Minecraft : {e}"))?)
}
