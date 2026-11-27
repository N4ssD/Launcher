const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const $ = (id) => document.getElementById(id);

const state = { info: null, pack: null, phase: "idle", pending: 0, statusTimer: null };

// ---------- Engrenages (dessinés en SVG) ----------
function gearPath(teeth) {
  const cx = 50, cy = 50, ro = 49, ri = 41, hole = teeth > 16 ? 11 : 13;
  const pts = [];
  for (let i = 0; i < teeth; i++) {
    const a = (2 * Math.PI * i) / teeth, s = (2 * Math.PI) / teeth;
    for (const [t, r] of [[0, ri], [0.18, ro], [0.5, ro], [0.68, ri]]) {
      const ang = a + t * s;
      pts.push(`${(cx + r * Math.cos(ang)).toFixed(2)},${(cy + r * Math.sin(ang)).toFixed(2)}`);
    }
  }
  return `M${pts.join(" L")} Z M${cx + hole},${cy} A${hole},${hole} 0 1 0 ${cx - hole},${cy} A${hole},${hole} 0 1 0 ${cx + hole},${cy} Z`;
}
document.querySelectorAll("path[data-gear]").forEach((p) => p.setAttribute("d", gearPath(+p.dataset.gear)));

// ---------- Utilitaires ----------
function toast(msg, ms = 9000) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add("hidden"), ms);
}
$("toast").addEventListener("click", () => $("toast").classList.add("hidden"));

function mb(bytes) {
  return bytes >= 1e9 ? (bytes / 1e9).toFixed(1) + " Go" : Math.max(1, Math.round(bytes / 1e6)) + " Mo";
}

function setBelt(value, moving) {
  const f = $("belt-fill");
  f.classList.toggle("indeterminate", value < 0);
  f.classList.toggle("moving", !!moving && value >= 0);
  if (value >= 0) f.style.width = Math.round(value * 100) + "%";
}

function setStatus(title, sub, pct) {
  $("status-title").textContent = title;
  $("status-sub").textContent = sub || "";
  $("status-pct").textContent = pct || "";
}

// ---------- Compte ----------
function renderAccount() {
  const acc = state.info && state.info.account;
  $("account-name").textContent = acc ? acc.name : "Se connecter";
  $("settings-account").textContent = acc ? `Connecté : ${acc.name}` : "Non connecté";
  $("logout").disabled = !acc;
  const av = $("account-avatar");
  av.textContent = acc ? acc.name[0].toUpperCase() : "?";
  if (acc) {
    const img = new Image();
    img.alt = "";
    img.onload = () => { av.textContent = ""; av.appendChild(img); };
    img.src = `https://mc-heads.net/avatar/${acc.uuid}/64`;
  }
  renderPlay();
}

function renderPlay() {
  const acc = state.info && state.info.account;
  const btn = $("play");
  btn.classList.toggle("working", state.phase === "busy");
  if (state.phase === "busy") {
    btn.disabled = true;
    $("play-label").textContent = "Patiente";
    $("play-sub").textContent = "préparation du jeu…";
  } else if (state.phase === "ingame") {
    btn.disabled = true;
    $("play-label").textContent = "En jeu";
    $("play-sub").textContent = "bon jeu !";
  } else if (!acc) {
    btn.disabled = false;
    $("play-label").textContent = "Connexion";
    $("play-sub").textContent = "compte Microsoft";
  } else {
    btn.disabled = !state.pack;
    $("play-label").textContent = "Jouer";
    $("play-sub").textContent = state.pending > 0 ? "mise à jour incluse" : "connexion directe";
  }
}

// ---------- Modpack & serveur ----------
const NEWS_ICON = { add: "+", update: "↑", remove: "−", info: "•" };

async function loadPack() {
  try {
    const r = await invoke("get_pack");
    state.pack = r.pack;
    state.pending = r.pending_files;
    const p = r.pack;
    document.title = p.name;
    $("brand-name").textContent = p.name;
    $("hero-name").textContent = p.name;
    $("chip-mc").textContent = `NEOFORGE ${p.minecraft}`;
    $("chip-pack").textContent = p.version ? `MODPACK v${p.version}` : "MODPACK";
    $("news-title").textContent = p.version ? `NOUVEAUTÉS v${p.version}` : "NOUVEAUTÉS";
    const ul = $("news-list");
    ul.innerHTML = "";
    const items = (p.news || []).slice(0, 3);
    if (!items.length) items.push({ type: "info", text: "Rien de nouveau pour l'instant" });
    for (const n of items) {
      const li = document.createElement("li");
      const b = document.createElement("b");
      const kind = NEWS_ICON[n.type] ? n.type : "info";
      b.className = "k-" + kind;
      b.textContent = NEWS_ICON[kind];
      li.appendChild(b);
      li.appendChild(document.createTextNode(n.text));
      ul.appendChild(li);
    }
    if (state.phase === "idle") {
      if (r.pending_files > 0) {
        setStatus("Mise à jour disponible", `${r.pending_files} fichier(s) · ${mb(r.pending_bytes)} — faite automatiquement au lancement`, "");
        setBelt(0);
      } else {
        setStatus("Tout est prêt", "Modpack à jour · connexion directe au serveur", "");
        setBelt(1);
      }
    }
    refreshServer();
    clearInterval(state.statusTimer);
    state.statusTimer = setInterval(refreshServer, 30000);
  } catch (e) {
    $("brand-name").textContent = "Launcher";
    $("hero-name").textContent = "Hors ligne";
    setStatus("Impossible de récupérer le modpack", String(e), "");
    setBelt(0);
  }
  renderPlay();
}

async function refreshServer() {
  if (!state.pack || !state.pack.address) {
    $("server-text").textContent = "Adresse du serveur non définie";
    return;
  }
  const s = await invoke("server_status", { address: state.pack.address });
  $("server-dot").className = "dot " + (s.online ? "on" : "off");
  $("server-text").textContent = s.online ? `Serveur en ligne · ${s.players} / ${s.max} joueurs` : "Serveur hors ligne";
  $("chip-ping").textContent = s.online ? `PING ${s.ping_ms} ms` : "PING —";
}

// ---------- Jouer ----------
$("play").addEventListener("click", async () => {
  if (!state.info.account) return openLogin();
  state.phase = "busy";
  $("hero").classList.add("spinning");
  renderPlay();
  setStatus("Préparation…", "", "");
  setBelt(-1);
  try {
    await invoke("play");
  } catch (e) {
    backToIdle();
    toast(String(e));
  }
});

function backToIdle() {
  state.phase = "idle";
  $("hero").classList.remove("spinning");
  renderPlay();
  loadPack();
}

listen("progress", ({ payload }) => {
  const pct = payload.value >= 0 ? Math.round(payload.value * 100) + " %" : "";
  setStatus(payload.label, stageHint(payload.stage), pct);
  setBelt(payload.value, true);
});

function stageHint(stage) {
  return {
    compte: "Connexion au compte Microsoft",
    pack: "Lecture du modpack sur GitHub",
    minecraft: "Fichiers du jeu (une seule fois)",
    java: "Java pour Minecraft (une seule fois)",
    neoforge: "Chargeur de mods NeoForge",
    mods: "Synchronisation avec les mods du serveur",
    lancement: "Ouverture de la fenêtre du jeu…",
  }[stage] || "";
}

listen("launched", () => {
  state.phase = "ingame";
  renderPlay();
  setStatus("Minecraft est lancé", "Connexion automatique au serveur", "");
  setBelt(1);
});

listen("game-exit", ({ payload }) => {
  backToIdle();
  if (payload !== null && payload !== 0) {
    toast(`Minecraft s'est fermé avec une erreur (code ${payload}). Ouvre « Réglages › Journaux » et regarde le fichier jeu.log.`);
  }
});

listen("play-error", ({ payload }) => {
  backToIdle();
  toast(payload);
});

// ---------- Connexion ----------
let loginUri = "";
async function openLogin() {
  $("login").classList.remove("hidden");
  $("login-error").classList.add("hidden");
  $("login-help").textContent = "Préparation…";
  $("login-code").textContent = "· · · · · · · ·";
  $("login-open").disabled = true;
  $("login-copy").disabled = true;
  try {
    const r = await invoke("login_start");
    loginUri = r.verification_uri;
    $("login-code").textContent = r.user_code;
    $("login-help").textContent = "Ouvre la page Microsoft, entre ce code puis connecte-toi avec le compte qui possède Minecraft. Cette fenêtre se fermera toute seule.";
    $("login-open").disabled = false;
    $("login-copy").disabled = false;
    invoke("open_url", { url: loginUri }).catch(() => {});
  } catch (e) {
    $("login-help").textContent = "";
    $("login-error").textContent = String(e);
    $("login-error").classList.remove("hidden");
  }
}
$("account").addEventListener("click", () => {
  if (state.info.account) showView("settings");
  else openLogin();
});
$("login-open").addEventListener("click", () => invoke("open_url", { url: loginUri }));
$("login-copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("login-code").textContent);
    $("login-copy").textContent = "Copié !";
    setTimeout(() => ($("login-copy").textContent = "Copier le code"), 1500);
  } catch (_) {}
});
$("login-close").addEventListener("click", () => $("login").classList.add("hidden"));

listen("login", async ({ payload }) => {
  if (payload.ok) {
    $("login").classList.add("hidden");
    state.info = await invoke("get_info");
    renderAccount();
  } else if (!$("login").classList.contains("hidden")) {
    $("login-error").textContent = payload.error;
    $("login-error").classList.remove("hidden");
  }
});

// ---------- Réglages ----------
function showView(v) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === v));
  $("view-home").classList.toggle("hidden", v !== "home");
  $("view-settings").classList.toggle("hidden", v !== "settings");
}
document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => showView(t.dataset.view)));

function saveSettings() {
  const settings = { ram_mb: +$("ram").value, minimize_on_launch: $("minimize").checked };
  state.info.settings = settings;
  invoke("save_settings", { settings }).catch((e) => toast(String(e)));
}
$("ram").addEventListener("input", () => ($("ram-out").textContent = (+$("ram").value / 1024).toFixed(1).replace(".0", "") + " Go"));
$("ram").addEventListener("change", saveSettings);
$("minimize").addEventListener("change", saveSettings);
document.querySelectorAll("[data-folder]").forEach((b) =>
  b.addEventListener("click", () => invoke("open_folder", { which: b.dataset.folder }).catch((e) => toast(String(e))))
);
$("logout").addEventListener("click", async () => {
  await invoke("logout");
  state.info = await invoke("get_info");
  renderAccount();
  showView("home");
});

// ---------- Démarrage ----------
(async function init() {
  state.info = await invoke("get_info");
  const s = state.info.settings;
  $("ram").value = s.ram_mb;
  $("ram").dispatchEvent(new Event("input"));
  $("minimize").checked = s.minimize_on_launch;
  $("app-version").textContent = `Launcher v${state.info.version} — N4ssD`;
  renderAccount();
  if (!state.info.login_configured) {
    toast("La connexion Microsoft n'est pas encore configurée (identifiant Azure manquant). Voir le README du dépôt.", 12000);
  }
  loadPack();
})();
