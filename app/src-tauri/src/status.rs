//! Statut du serveur (protocole « Server List Ping » de Minecraft).

use anyhow::{anyhow, Result};
use serde::Serialize;
use serde_json::Value;
use std::time::{Duration, Instant};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

#[derive(Serialize, Clone, Debug, Default)]
pub struct ServerStatus {
    pub online: bool,
    pub players: i64,
    pub max: i64,
    pub ping_ms: u64,
    pub version: String,
    /// Échantillon de joueurs connectés (pseudo + UUID), si le serveur le donne
    pub sample: Vec<Player>,
}

#[derive(Serialize, Clone, Debug, Default)]
pub struct Player {
    pub name: String,
    pub id: String,
}

fn varint(mut v: i32, out: &mut Vec<u8>) {
    loop {
        let mut b = (v & 0x7F) as u8;
        v = ((v as u32) >> 7) as i32;
        if v != 0 {
            b |= 0x80;
        }
        out.push(b);
        if v == 0 {
            break;
        }
    }
}

async fn read_varint(s: &mut TcpStream) -> Result<i32> {
    let mut result = 0i32;
    for i in 0..5 {
        let b = s.read_u8().await?;
        result |= ((b & 0x7F) as i32) << (7 * i);
        if b & 0x80 == 0 {
            return Ok(result);
        }
    }
    Err(anyhow!("varint trop long"))
}

pub async fn ping(address: &str) -> ServerStatus {
    match tokio::time::timeout(Duration::from_secs(5), ping_inner(address)).await {
        Ok(Ok(s)) => s,
        _ => ServerStatus::default(),
    }
}

/// Adresse sans port (ex. « play.serveur.fr ») : Minecraft regarde d'abord l'enregistrement DNS
/// `_minecraft._tcp` (SRV) qui donne la vraie machine et le vrai port. On fait pareil (DNS sur HTTPS).
async fn resolve_srv(host: &str) -> Option<(String, u16)> {
    if host.parse::<std::net::IpAddr>().is_ok() || !host.contains('.') {
        return None;
    }
    let r = crate::net::client()
        .get("https://cloudflare-dns.com/dns-query")
        .query(&[("name", format!("_minecraft._tcp.{host}")), ("type", "SRV".into())])
        .header("accept", "application/dns-json")
        .timeout(Duration::from_secs(2))
        .send()
        .await
        .ok()?;
    let v: Value = r.json().await.ok()?;
    let data = v["Answer"].as_array()?.iter().find(|a| a["type"].as_u64() == Some(33))?["data"].as_str()?.to_string();
    parse_srv(&data)
}

/// « 0 5 25570 mc.exemple.fr. » → ("mc.exemple.fr", 25570)
fn parse_srv(data: &str) -> Option<(String, u16)> {
    let p: Vec<&str> = data.split_whitespace().collect();
    let port = p.get(2)?.parse().ok()?;
    let target = p.get(3)?.trim_end_matches('.').to_string();
    (!target.is_empty()).then_some((target, port))
}

async fn ping_inner(address: &str) -> Result<ServerStatus> {
    let (host, port) = crate::launch::split_address(address);
    let explicit_port = address.trim().rsplit_once(':').map(|(_, p)| p.parse::<u16>().is_ok()).unwrap_or(false);
    let (conn_host, conn_port) = match if explicit_port { None } else { resolve_srv(&host).await } {
        Some(t) => t,
        None => (host.clone(), port),
    };
    let start = Instant::now();
    let mut s = TcpStream::connect((conn_host.as_str(), conn_port)).await?;
    let ping_ms = start.elapsed().as_millis() as u64;

    let mut pkt = Vec::new();
    varint(0, &mut pkt);
    varint(767, &mut pkt);
    varint(host.len() as i32, &mut pkt);
    pkt.extend_from_slice(host.as_bytes());
    pkt.extend_from_slice(&port.to_be_bytes());
    varint(1, &mut pkt);
    let mut msg = Vec::new();
    varint(pkt.len() as i32, &mut msg);
    msg.extend(pkt);
    msg.extend([1u8, 0u8]);
    s.write_all(&msg).await?;

    let _len = read_varint(&mut s).await?;
    let _id = read_varint(&mut s).await?;
    let n = read_varint(&mut s).await? as usize;
    if n > 1 << 20 {
        return Err(anyhow!("réponse trop grande"));
    }
    let mut buf = vec![0u8; n];
    s.read_exact(&mut buf).await?;
    let v: Value = serde_json::from_slice(&buf)?;
    Ok(ServerStatus {
        online: true,
        players: v["players"]["online"].as_i64().unwrap_or(0),
        max: v["players"]["max"].as_i64().unwrap_or(0),
        ping_ms,
        version: v["version"]["name"].as_str().unwrap_or("").to_string(),
        sample: v["players"]["sample"]
            .as_array()
            .map(|a| {
                a.iter()
                    .filter_map(|p| Some(Player { name: p["name"].as_str()?.to_string(), id: p["id"].as_str().unwrap_or("").to_string() }))
                    .filter(|p| !p.name.contains('§') && !p.id.starts_with("00000000-0000-0000"))
                    .take(12)
                    .collect()
            })
            .unwrap_or_default(),
    })
}

#[cfg(test)]
mod tests {
    #[test]
    fn srv() {
        assert_eq!(super::parse_srv("0 5 25570 mc.exemple.fr."), Some(("mc.exemple.fr".into(), 25570)));
        assert_eq!(super::parse_srv("garbage"), None);
    }
}
