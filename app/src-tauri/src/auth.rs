//! Connexion Microsoft → Xbox Live → Minecraft (flux « code d'appareil »).

use crate::config::{data_dir, CLIENT_ID};
use crate::net::client;
use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const SCOPE: &str = "XboxLive.signin offline_access";
const DEVICE_URL: &str = "https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode";
const TOKEN_URL: &str = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Account {
    pub name: String,
    pub uuid: String,
    pub access_token: String,
    pub expires_at: u64,
    pub refresh_token: String,
    #[serde(default)]
    pub xuid: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DeviceCode {
    pub user_code: String,
    pub device_code: String,
    pub verification_uri: String,
    pub interval: u64,
    pub expires_in: u64,
}

fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

fn check_client_id() -> Result<()> {
    if CLIENT_ID.trim().is_empty() {
        return Err(anyhow!(
            "La connexion Microsoft n'est pas encore configurée : il manque l'identifiant Azure (AZURE_CLIENT_ID) dans le dépôt GitHub."
        ));
    }
    Ok(())
}

#[derive(Serialize, Deserialize, Default)]
struct Store {
    #[serde(default)]
    active: String,
    #[serde(default)]
    accounts: Vec<Account>,
}

fn store_path() -> std::path::PathBuf {
    data_dir().join("comptes.json")
}

fn load_store() -> Store {
    if let Some(s) = std::fs::read_to_string(store_path()).ok().and_then(|s| serde_json::from_str(&s).ok()) {
        return s;
    }
    // Ancien format (un seul compte)
    let old = data_dir().join("compte.json");
    if let Some(acc) = std::fs::read_to_string(&old).ok().and_then(|s| serde_json::from_str::<Account>(&s).ok()) {
        let s = Store { active: acc.uuid.clone(), accounts: vec![acc] };
        if save_store(&s).is_ok() {
            let _ = std::fs::remove_file(old);
        }
        return s;
    }
    Store::default()
}

fn save_store(s: &Store) -> Result<()> {
    std::fs::create_dir_all(data_dir())?;
    std::fs::write(store_path(), serde_json::to_string(s)?)?;
    Ok(())
}

/// Compte actif
pub fn load() -> Option<Account> {
    let s = load_store();
    s.accounts.iter().find(|a| a.uuid == s.active).or(s.accounts.first()).cloned()
}

/// Ajoute ou met à jour un compte et le rend actif
pub fn save(acc: &Account) -> Result<()> {
    let mut s = load_store();
    s.accounts.retain(|a| a.uuid != acc.uuid);
    s.accounts.push(acc.clone());
    s.active = acc.uuid.clone();
    save_store(&s)
}

/// Déconnecte le compte actif (passe au suivant s'il y en a un)
pub fn clear() {
    let mut s = load_store();
    let active = load().map(|a| a.uuid).unwrap_or_default();
    s.accounts.retain(|a| a.uuid != active);
    s.active = s.accounts.first().map(|a| a.uuid.clone()).unwrap_or_default();
    let _ = save_store(&s);
}

#[derive(Serialize)]
pub struct AccountSummary {
    pub name: String,
    pub uuid: String,
    pub active: bool,
}

pub fn list() -> Vec<AccountSummary> {
    let s = load_store();
    let active = load().map(|a| a.uuid).unwrap_or_default();
    s.accounts.iter().map(|a| AccountSummary { name: a.name.clone(), uuid: a.uuid.clone(), active: a.uuid == active }).collect()
}

pub fn switch(uuid: &str) -> bool {
    let mut s = load_store();
    if s.accounts.iter().any(|a| a.uuid == uuid) {
        s.active = uuid.to_string();
        return save_store(&s).is_ok();
    }
    false
}

pub fn remove(uuid: &str) {
    let mut s = load_store();
    s.accounts.retain(|a| a.uuid != uuid);
    if s.active == uuid {
        s.active = s.accounts.first().map(|a| a.uuid.clone()).unwrap_or_default();
    }
    let _ = save_store(&s);
}

pub async fn start_device() -> Result<DeviceCode> {
    check_client_id()?;
    let r = client()
        .post(DEVICE_URL)
        .form(&[("client_id", CLIENT_ID), ("scope", SCOPE)])
        .send()
        .await?;
    let v: Value = r.json().await?;
    if let Some(err) = v.get("error_description").and_then(|e| e.as_str()) {
        return Err(anyhow!("Microsoft refuse la demande : {err}"));
    }
    Ok(serde_json::from_value(v)?)
}

/// Attend que le joueur valide le code, puis termine la connexion.
pub async fn poll_device(dc: &DeviceCode) -> Result<Account> {
    let deadline = now() + dc.expires_in;
    let mut interval = dc.interval.max(2);
    loop {
        if now() > deadline {
            return Err(anyhow!("Le code a expiré. Recommence la connexion."));
        }
        tokio::time::sleep(Duration::from_secs(interval)).await;
        let v: Value = client()
            .post(TOKEN_URL)
            .form(&[
                ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
                ("client_id", CLIENT_ID),
                ("device_code", dc.device_code.as_str()),
            ])
            .send()
            .await?
            .json()
            .await?;
        match v.get("error").and_then(|e| e.as_str()) {
            None => {
                let access = str_field(&v, "access_token")?;
                let refresh = str_field(&v, "refresh_token")?;
                let acc = ms_to_minecraft(&access, &refresh).await?;
                save(&acc)?;
                return Ok(acc);
            }
            Some("authorization_pending") => continue,
            Some("slow_down") => interval += 5,
            Some("authorization_declined") => return Err(anyhow!("Connexion refusée.")),
            Some("expired_token") => return Err(anyhow!("Le code a expiré. Recommence la connexion.")),
            Some(other) => return Err(anyhow!("Erreur Microsoft : {other}")),
        }
    }
}

/// Renvoie un compte dont le jeton Minecraft est encore valable (le renouvelle si besoin).
pub async fn ensure_valid(acc: Account) -> Result<Account> {
    if acc.expires_at > now() + 300 {
        return Ok(acc);
    }
    check_client_id()?;
    let v: Value = client()
        .post(TOKEN_URL)
        .form(&[
            ("grant_type", "refresh_token"),
            ("client_id", CLIENT_ID),
            ("refresh_token", acc.refresh_token.as_str()),
            ("scope", SCOPE),
        ])
        .send()
        .await?
        .json()
        .await?;
    if v.get("error").is_some() {
        clear();
        return Err(anyhow!("Ta session a expiré, reconnecte-toi."));
    }
    let access = str_field(&v, "access_token")?;
    let refresh = v
        .get("refresh_token")
        .and_then(|s| s.as_str())
        .map(String::from)
        .unwrap_or(acc.refresh_token);
    let acc = ms_to_minecraft(&access, &refresh).await?;
    save(&acc)?;
    Ok(acc)
}

fn str_field(v: &Value, k: &str) -> Result<String> {
    v.get(k)
        .and_then(|s| s.as_str())
        .map(String::from)
        .ok_or_else(|| anyhow!("Réponse inattendue (champ {k} manquant)"))
}

async fn ms_to_minecraft(ms_access: &str, refresh: &str) -> Result<Account> {
    // 1. Xbox Live
    let xbl: Value = client()
        .post("https://user.auth.xboxlive.com/user/authenticate")
        .json(&json!({
            "Properties": {
                "AuthMethod": "RPS",
                "SiteName": "user.auth.xboxlive.com",
                "RpsTicket": format!("d={ms_access}")
            },
            "RelyingParty": "http://auth.xboxlive.com",
            "TokenType": "JWT"
        }))
        .send()
        .await?
        .json()
        .await?;
    let xbl_token = str_field(&xbl, "Token")?;
    let uhs = xbl["DisplayClaims"]["xui"][0]["uhs"]
        .as_str()
        .ok_or_else(|| anyhow!("Xbox Live : réponse inattendue"))?
        .to_string();

    // 2. XSTS
    let resp = client()
        .post("https://xsts.auth.xboxlive.com/xsts/authorize")
        .json(&json!({
            "Properties": { "SandboxId": "RETAIL", "UserTokens": [xbl_token] },
            "RelyingParty": "rp://api.minecraftservices.com/",
            "TokenType": "JWT"
        }))
        .send()
        .await?;
    let status = resp.status();
    let xsts: Value = resp.json().await.unwrap_or(Value::Null);
    if !status.is_success() {
        let code = xsts.get("XErr").and_then(|c| c.as_u64()).unwrap_or(0);
        return Err(anyhow!(match code {
            2148916233 => "Ce compte Microsoft n'a pas de profil Xbox. Connecte-toi une fois sur minecraft.net pour le créer.".to_string(),
            2148916235 => "Xbox Live n'est pas disponible dans ton pays.".to_string(),
            2148916236 | 2148916237 => "Ce compte doit être vérifié comme adulte sur la page Xbox.".to_string(),
            2148916238 => "Compte enfant : il doit être ajouté à une famille Microsoft par un adulte.".to_string(),
            _ => format!("Xbox Live a refusé la connexion (code {code})."),
        }));
    }
    let xsts_token = str_field(&xsts, "Token")?;
    let xuid = xsts["DisplayClaims"]["xui"][0]["xid"].as_str().unwrap_or("0").to_string();

    // 3. Minecraft
    let resp = client()
        .post("https://api.minecraftservices.com/authentication/login_with_xbox")
        .json(&json!({ "identityToken": format!("XBL3.0 x={uhs};{xsts_token}") }))
        .send()
        .await?;
    if resp.status().as_u16() == 403 {
        return Err(anyhow!(
            "Mojang n'a pas encore autorisé ce launcher (application Azure en attente de validation)."
        ));
    }
    if !resp.status().is_success() {
        return Err(anyhow!("Minecraft a refusé la connexion ({}).", resp.status()));
    }
    let mc: Value = resp.json().await?;
    let mc_token = str_field(&mc, "access_token")?;
    let expires_in = mc.get("expires_in").and_then(|e| e.as_u64()).unwrap_or(86400);

    // 4. Profil (pseudo + UUID). 404 = le compte ne possède pas Minecraft.
    let resp = client()
        .get("https://api.minecraftservices.com/minecraft/profile")
        .bearer_auth(&mc_token)
        .send()
        .await?;
    if resp.status().as_u16() == 404 {
        return Err(anyhow!("Ce compte ne possède pas Minecraft Java Edition."));
    }
    let profile: Value = resp.json().await?;
    Ok(Account {
        name: str_field(&profile, "name")?,
        uuid: str_field(&profile, "id")?,
        access_token: mc_token,
        expires_at: now() + expires_in,
        refresh_token: refresh.to_string(),
        xuid,
    })
}
