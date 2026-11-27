//! Discord Rich Presence : affiche « Joue sur … » sur le profil Discord du joueur.
//! Tout se passe dans un fil séparé ; si Discord n'est pas ouvert, rien ne se passe.

use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use std::sync::mpsc::{channel, Sender};
use std::sync::{Mutex, OnceLock};

pub enum Msg {
    Playing { app_id: String, details: String, state: String, start: i64, button: Option<(String, String)> },
    Clear,
}

fn sender() -> &'static Mutex<Sender<Msg>> {
    static TX: OnceLock<Mutex<Sender<Msg>>> = OnceLock::new();
    TX.get_or_init(|| {
        let (tx, rx) = channel::<Msg>();
        std::thread::spawn(move || {
            let mut client: Option<(String, DiscordIpcClient)> = None;
            for msg in rx {
                match msg {
                    Msg::Playing { app_id, details, state, start, button } => {
                        if client.as_ref().map(|(id, _)| id != &app_id).unwrap_or(true) {
                            if let Some((_, mut c)) = client.take() {
                                let _ = c.close();
                            }
                            if let Ok(mut c) = DiscordIpcClient::new(&app_id) {
                                if c.connect().is_ok() {
                                    client = Some((app_id.clone(), c));
                                }
                            }
                        }
                        if let Some((_, c)) = client.as_mut() {
                            let mut act = activity::Activity::new()
                                .details(&details)
                                .state(&state)
                                .timestamps(activity::Timestamps::new().start(start))
                                .assets(activity::Assets::new().large_image("logo").large_text(&details));
                            let btn;
                            if let Some((label, url)) = &button {
                                btn = vec![activity::Button::new(label, url)];
                                act = act.buttons(btn);
                            }
                            if c.set_activity(act).is_err() {
                                client = None; // Discord fermé entre-temps : on réessaiera la prochaine fois
                            }
                        }
                    }
                    Msg::Clear => {
                        if let Some((_, c)) = client.as_mut() {
                            let _ = c.clear_activity();
                        }
                    }
                }
            }
        });
        Mutex::new(tx)
    })
}

pub fn send(msg: Msg) {
    let _ = sender().lock().unwrap().send(msg);
}
