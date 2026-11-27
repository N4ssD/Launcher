//! Téléchargements : client HTTP partagé, vérification SHA-1, téléchargements en parallèle.

use anyhow::{anyhow, Context, Result};
use futures_util::{stream, StreamExt};
use serde::de::DeserializeOwned;
use sha1::{Digest, Sha1};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, OnceLock};
use std::time::Duration;
use tokio::io::AsyncWriteExt;

pub fn client() -> &'static reqwest::Client {
    static C: OnceLock<reqwest::Client> = OnceLock::new();
    C.get_or_init(|| {
        reqwest::Client::builder()
            .user_agent(crate::config::USER_AGENT)
            .connect_timeout(Duration::from_secs(20))
            .timeout(Duration::from_secs(600))
            .build()
            .expect("client http")
    })
}

pub async fn get_json<T: DeserializeOwned>(url: &str) -> Result<T> {
    let r = client()
        .get(url)
        .send()
        .await
        .with_context(|| format!("Impossible de joindre {url}"))?;
    if !r.status().is_success() {
        return Err(anyhow!("{url} a répondu {}", r.status()));
    }
    Ok(r.json::<T>().await.with_context(|| format!("Réponse illisible de {url}"))?)
}

pub fn sha1_file(path: &Path) -> Result<String> {
    let mut f = std::fs::File::open(path)?;
    let mut h = Sha1::new();
    std::io::copy(&mut f, &mut h)?;
    Ok(hex::encode(h.finalize()))
}

#[derive(Clone, Debug)]
pub struct Job {
    pub url: String,
    pub path: PathBuf,
    pub sha1: Option<String>,
    pub size: u64,
}

impl Job {
    /// Faut-il (re)télécharger ce fichier ? `strict` = comparer aussi le SHA-1.
    pub fn needed(&self, strict: bool) -> bool {
        let meta = match std::fs::metadata(&self.path) {
            Ok(m) => m,
            Err(_) => return true,
        };
        if self.size > 0 && meta.len() != self.size {
            return true;
        }
        if strict {
            if let Some(expected) = &self.sha1 {
                return sha1_file(&self.path).map(|s| !s.eq_ignore_ascii_case(expected)).unwrap_or(true);
            }
        }
        false
    }
}

pub async fn download(job: &Job) -> Result<()> {
    if let Some(parent) = job.path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    let tmp = job.path.with_extension("part");
    let mut last_err = anyhow!("échec");
    for attempt in 0..3 {
        if attempt > 0 {
            tokio::time::sleep(Duration::from_millis(800 * attempt)).await;
        }
        match download_once(job, &tmp).await {
            Ok(()) => {
                tokio::fs::rename(&tmp, &job.path).await?;
                return Ok(());
            }
            Err(e) => last_err = e,
        }
    }
    let _ = tokio::fs::remove_file(&tmp).await;
    Err(last_err.context(format!("Téléchargement impossible : {}", job.url)))
}

async fn download_once(job: &Job, tmp: &Path) -> Result<()> {
    let resp = client().get(&job.url).send().await?;
    if !resp.status().is_success() {
        return Err(anyhow!("HTTP {}", resp.status()));
    }
    let mut file = tokio::fs::File::create(tmp).await?;
    let mut hasher = Sha1::new();
    let mut body = resp.bytes_stream();
    while let Some(chunk) = body.next().await {
        let chunk = chunk?;
        hasher.update(&chunk);
        file.write_all(&chunk).await?;
    }
    file.flush().await?;
    drop(file);
    if let Some(expected) = &job.sha1 {
        let got = hex::encode(hasher.finalize());
        if !got.eq_ignore_ascii_case(expected) {
            return Err(anyhow!("fichier corrompu (SHA-1 différent)"));
        }
    }
    Ok(())
}

/// Télécharge tous les fichiers nécessaires, `concurrency` à la fois.
/// `on_progress(fait, total)` est appelé après chaque fichier.
pub async fn download_all<F>(jobs: Vec<Job>, strict: bool, concurrency: usize, on_progress: F) -> Result<()>
where
    F: Fn(usize, usize) + Send + Sync + 'static,
{
    let todo: Vec<Job> = tokio::task::spawn_blocking(move || {
        jobs.into_iter().filter(|j| j.needed(strict)).collect()
    })
    .await?;
    let total = todo.len();
    if total == 0 {
        return Ok(());
    }
    let done = Arc::new(AtomicUsize::new(0));
    let cb = Arc::new(on_progress);
    cb(0, total);
    let results: Vec<Result<()>> = stream::iter(todo.into_iter().map(|job| {
        let done = done.clone();
        let cb = cb.clone();
        async move {
            let r = download(&job).await;
            let n = done.fetch_add(1, Ordering::SeqCst) + 1;
            cb(n, total);
            r
        }
    }))
    .buffer_unordered(concurrency)
    .collect()
    .await;
    for r in results {
        r?;
    }
    Ok(())
}
