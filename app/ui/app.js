const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const $ = (id) => document.getElementById(id);
const SVGNS = "http://www.w3.org/2000/svg";
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const state = { info: null, pack: null, phase: "idle", pending: 0, statusTimer: null, hoverPlay: false };

/* =====================================================================
   Engrenages façon Create : vraie denture, emboîtés, vitesse variable
   ===================================================================== */
const MATERIALS = {
  brass:    { body: "url(#m-brass)",    plate: "#C68C33", hole: "rgba(40,24,6,.55)", edge: "#8A5C1C" },
  copper:   { body: "url(#m-copper)",   plate: "#B25C33", hole: "rgba(40,14,4,.55)", edge: "#7A3A1C" },
  andesite: { body: "url(#m-andesite)", plate: "#67625A", hole: "rgba(0,0,0,.45)",   edge: "#45413B" },
  dark:     { body: "#2A1E0C",          plate: "#3A2A12", hole: "rgba(0,0,0,.0)",     edge: "#2A1E0C" },
};

function el(tag, attrs, parent) {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}

/** Dessine un engrenage de N dents, module m, centré en (0,0). */
function buildGear(parent, N, m, matName) {
  const mat = MATERIALS[matName];
  const g = el("g", {}, parent);
  const R = (m * N) / 2, ro = R + m * 0.95, ri = R - m * 1.15, s = (2 * Math.PI) / N;
  const pts = [];
  for (let i = 0; i < N; i++) {
    const c = i * s;
    for (const [r, o] of [[ri, -0.29], [ro, -0.16], [ro, 0.16], [ri, 0.29]]) {
      pts.push(`${(r * Math.cos(c + o * s)).toFixed(2)},${(r * Math.sin(c + o * s)).toFixed(2)}`);
    }
  }
  el("path", { d: "M" + pts.join(" L") + " Z", fill: mat.body, stroke: mat.edge, "stroke-width": Math.max(1, m * 0.08), "stroke-linejoin": "round" }, g);
  const plateR = ri - m * 0.55;
  el("circle", { r: plateR, fill: mat.plate, stroke: mat.edge, "stroke-width": Math.max(1, m * 0.1) }, g);
  el("circle", { r: plateR - m * 0.35, fill: "none", stroke: "rgba(255,255,255,.12)", "stroke-width": Math.max(.6, m * 0.06) }, g);
  const hubR = Math.max(m * 1.5, R * 0.24);
  if (N >= 12) {
    const holes = N >= 24 ? 8 : 6, hr = (plateR + hubR) / 2, size = Math.min((plateR - hubR) * 0.24, (2 * Math.PI * hr) / holes * 0.22);
    for (let i = 0; i < holes; i++) {
      const a = (i / holes) * 2 * Math.PI + Math.PI / holes;
      el("circle", { cx: hr * Math.cos(a), cy: hr * Math.sin(a), r: size, fill: mat.hole }, g);
    }
  }
  el("circle", { r: hubR, fill: matName === "dark" ? mat.plate : "url(#m-andesite)", stroke: matName === "dark" ? mat.edge : "#3E3A35", "stroke-width": Math.max(1, m * 0.12) }, g);
  const ax = hubR * 0.62;
  el("rect", { x: -ax / 2, y: -ax / 2, width: ax, height: ax, rx: ax * 0.12, fill: matName === "dark" ? "#F0C25A" : "#2B2824" }, g);
  return { g, N, R };
}

const kin = { speed: 0, target: 4, angle: 0, last: 0, gears: [], shownRpm: -1 };

function addGear(parent, N, m, mat, cx, cy, phase, rate) {
  const gear = buildGear(parent, N, m, mat);
  Object.assign(gear, { cx, cy, phase, rate, m });
  kin.gears.push(gear);
  return gear;
}

/** Ajoute un engrenage qui s'emboîte avec `p` dans la direction thetaDeg. */
function meshWith(parent, p, N, mat, thetaDeg) {
  const R = (p.m * N) / 2, dist = p.R + R, t = (thetaDeg * Math.PI) / 180;
  const cx = p.cx + dist * Math.cos(t), cy = p.cy + dist * Math.sin(t);
  const sc = 360 / N, d = thetaDeg - p.phase;
  const phase = thetaDeg + 180 - 0.5 * sc + (d * p.N) / N;
  return addGear(parent, N, p.m, mat, cx, cy, phase, (-p.rate * p.N) / N);
}

function buildMachine() {
  const root = $("gears");
  const big = addGear(root, 28, 16, "brass", 470, 330, 0, 1);
  const cop = meshWith(root, big, 14, "copper", 146);
  const and = meshWith(root, big, 10, "andesite", -136);
  meshWith(root, and, 8, "copper", 196);
  meshWith(root, cop, 9, "andesite", 100);
  // Petits engrenages d'interface
  kin.icons = [
    { g: buildGear($("brand-gear"), 10, 7.4, "brass").g, rate: 0.6 },
    { g: buildGear($("play-gear"), 10, 7.4, "dark").g, rate: -1.8, play: true },
    { g: buildGear($("modal-gear"), 10, 7.4, "brass").g, rate: 2.5, fixed: true },
  ];
  buildGear($("upd-gear"), 10, 7.4, "brass");
}

function setTargetRpm(rpm) { kin.target = rpm; }
function targetForPhase() {
  if (state.phase === "busy") return 48;
  if (state.phase === "ingame") return 14;
  return state.hoverPlay ? 16 : 4;
}
function refreshTarget() { setTargetRpm(targetForPhase()); }

function tick(t) {
  const dt = kin.last ? Math.min(0.05, (t - kin.last) / 1000) : 0;
  kin.last = t;
  kin.speed += (kin.target - kin.speed) * Math.min(1, dt * 2.2);
  if (!reduceMotion) kin.angle += kin.speed * 6 * dt; // tr/min → degrés/s
  for (const g of kin.gears) {
    g.g.setAttribute("transform", `translate(${g.cx.toFixed(1)} ${g.cy.toFixed(1)}) rotate(${(g.phase + g.rate * kin.angle).toFixed(2)})`);
  }
  if (kin.icons && !reduceMotion) {
    for (const ic of kin.icons) {
      const a = ic.fixed ? (t / 1000) * 60 * ic.rate : kin.angle * ic.rate * (ic.play ? 1 + (state.hoverPlay ? 1 : 0) : 1);
      ic.g.setAttribute("transform", `rotate(${a.toFixed(2)})`);
    }
  }
  const rpm = Math.round(kin.speed);
  if (rpm !== kin.shownRpm) {
    kin.shownRpm = rpm;
    $("rpm").textContent = rpm;
    $("rpm-label").textContent = rpm < 16 ? "(Lente)" : rpm < 40 ? "(Moyenne)" : "(Rapide)";
  }
  requestAnimationFrame(tick);
}

/* =====================================================================
   Fenêtre (barre de titre personnalisée)
   ===================================================================== */
const appWindow = window.__TAURI__.window && window.__TAURI__.window.getCurrentWindow ? window.__TAURI__.window.getCurrentWindow() : null;
$("win-min").addEventListener("click", () => appWindow && appWindow.minimize());
$("win-max").addEventListener("click", () => appWindow && appWindow.toggleMaximize());
$("win-close").addEventListener("click", () => appWindow && appWindow.close());

/* =====================================================================
   Utilitaires
   ===================================================================== */
function toast(msg, ms = 9000, title = "Oups") {
  const t = $("toast");
  t.querySelector(".t-title").textContent = title;
  $("toast-text").textContent = msg;
  t.classList.remove("hidden");
  t.style.animation = "none"; void t.offsetWidth; t.style.animation = "";
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
  $("belt-wrap").classList.toggle("moving", !!moving);
  if (value >= 0) f.style.width = `calc((100% - 22px) * ${value})`;
}

function setStatus(title, sub, pct) {
  $("status-title").textContent = title;
  $("status-sub").textContent = sub || "";
  $("status-pct").textContent = pct || "";
}

function sparks() {
  if (reduceMotion) return;
  const r = $("play").getBoundingClientRect();
  const box = $("sparks");
  for (let i = 0; i < 26; i++) {
    const s = document.createElement("span");
    s.className = "spark";
    s.style.left = r.left + r.width * (0.2 + Math.random() * 0.6) + "px";
    s.style.top = r.top + r.height * 0.4 + "px";
    box.appendChild(s);
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, v = 80 + Math.random() * 140;
    s.animate(
      [{ transform: "translate(0,0) scale(1)", opacity: 1 },
       { transform: `translate(${Math.cos(a) * v}px, ${Math.sin(a) * v + 60}px) scale(.3)`, opacity: 0 }],
      { duration: 700 + Math.random() * 500, easing: "cubic-bezier(.2,.8,.4,1)" }
    ).onfinish = () => s.remove();
  }
}

/* =====================================================================
   Compte
   ===================================================================== */
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
  btn.classList.toggle("ingame", state.phase === "ingame");
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
  refreshTarget();
}
$("play").addEventListener("mouseenter", () => { state.hoverPlay = true; refreshTarget(); });
$("play").addEventListener("mouseleave", () => { state.hoverPlay = false; refreshTarget(); });

/* =====================================================================
   Modpack & serveur
   ===================================================================== */
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
    items.forEach((n, i) => {
      const li = document.createElement("li");
      li.style.animationDelay = 380 + i * 90 + "ms";
      const b = document.createElement("b");
      const kind = NEWS_ICON[n.type] ? n.type : "info";
      b.className = "k-" + kind;
      b.textContent = NEWS_ICON[kind];
      li.appendChild(b);
      li.appendChild(document.createTextNode(n.text));
      ul.appendChild(li);
    });
    if (state.phase === "idle") {
      if (r.pending_files > 0) {
        setStatus("Mise à jour disponible", `${r.pending_files} fichier(s) · ${mb(r.pending_bytes)} · faite automatiquement au lancement`, "");
        setBelt(0, false);
      } else {
        setStatus("Tout est prêt", "Modpack à jour · connexion directe au serveur", "");
        setBelt(1, false);
      }
    }
    renderRam();
    refreshServer();
    clearInterval(state.statusTimer);
    state.statusTimer = setInterval(refreshServer, 30000);
  } catch (e) {
    $("brand-name").textContent = "Launcher";
    $("hero-name").textContent = "Hors ligne";
    setStatus("Impossible de récupérer le modpack", String(e), "");
    setBelt(0, false);
  }
  renderPlay();
}

async function refreshServer() {
  if (!state.pack || !state.pack.address) {
    $("server-dot").className = "dot";
    $("server-text").textContent = "Adresse du serveur non définie";
    return;
  }
  const s = await invoke("server_status", { address: state.pack.address });
  $("server-dot").className = "dot " + (s.online ? "on" : "off");
  $("server-text").textContent = s.online ? `Serveur en ligne · ${s.players} / ${s.max} joueurs` : "Serveur hors ligne";
  $("chip-ping").textContent = s.online ? `PING ${s.ping_ms} ms` : "PING —";
}

/* =====================================================================
   Jouer
   ===================================================================== */
$("play").addEventListener("click", async () => {
  if (!state.info.account) return openLogin();
  state.phase = "busy";
  renderPlay();
  setStatus("Préparation…", "", "");
  setBelt(-1, true);
  try {
    await invoke("play");
  } catch (e) {
    backToIdle();
    toast(String(e));
  }
});

function backToIdle() {
  state.phase = "idle";
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
    minecraft: "Fichiers du jeu (seulement la première fois)",
    java: "Java pour Minecraft (seulement la première fois)",
    neoforge: "Chargeur de mods NeoForge",
    mods: "Synchronisation avec les mods du serveur",
    lancement: "Ouverture de la fenêtre du jeu…",
  }[stage] || "";
}

listen("launched", () => {
  state.phase = "ingame";
  renderPlay();
  setStatus("Minecraft est lancé", "Connexion automatique au serveur", "");
  setBelt(1, false);
  sparks();
});

listen("game-exit", ({ payload }) => {
  backToIdle();
  if (payload !== null && payload !== 0) {
    toast(`Minecraft s'est fermé avec une erreur (code ${payload}). Ouvre Réglages › Journaux et regarde le fichier jeu.log.`, 12000, "Le jeu a planté");
  }
});

listen("play-error", ({ payload }) => {
  backToIdle();
  toast(payload);
});

/* =====================================================================
   Connexion (code façon panneau à volets)
   ===================================================================== */
let loginUri = "";
const FLAP_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";

function renderFlaps(code, scramble) {
  const box = $("login-code");
  box.innerHTML = "";
  [...code].forEach((ch, i) => {
    const f = document.createElement("span");
    f.className = "flap" + (ch === "-" ? " dash" : "");
    f.style.animationDelay = i * 55 + "ms";
    f.textContent = ch === "-" ? "–" : scramble ? FLAP_CHARS[(Math.random() * FLAP_CHARS.length) | 0] : ch;
    box.appendChild(f);
    if (scramble && ch !== "-" && !reduceMotion) {
      const end = performance.now() + 350 + i * 90;
      const iv = setInterval(() => {
        if (performance.now() >= end) { f.textContent = ch; clearInterval(iv); }
        else f.textContent = FLAP_CHARS[(Math.random() * FLAP_CHARS.length) | 0];
      }, 45);
    } else {
      f.textContent = ch === "-" ? "–" : ch;
    }
  });
}

async function openLogin() {
  $("login").classList.remove("hidden");
  $("login-error").classList.add("hidden");
  $("login-wait").classList.add("hidden");
  $("login-help").textContent = "Préparation…";
  renderFlaps("········", false);
  $("login-open").disabled = true;
  $("login-copy").disabled = true;
  try {
    const r = await invoke("login_start");
    loginUri = r.verification_uri;
    renderFlaps(r.user_code, true);
    $("login-help").textContent = "Entre ce code sur la page Microsoft, puis connecte-toi avec le compte qui possède Minecraft. Cette fenêtre se fermera toute seule.";
    $("login-open").disabled = false;
    $("login-copy").disabled = false;
    $("login-wait").classList.remove("hidden");
    $("login-code").dataset.code = r.user_code;
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
    await navigator.clipboard.writeText($("login-code").dataset.code || "");
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
    toast(`Bienvenue ${payload.name} !`, 4000, "Connecté");
    $("toast").querySelector(".t-title").style.color = "#7DD87F";
    setTimeout(() => ($("toast").querySelector(".t-title").style.color = ""), 4200);
  } else if (!$("login").classList.contains("hidden")) {
    $("login-wait").classList.add("hidden");
    $("login-error").textContent = payload.error;
    $("login-error").classList.remove("hidden");
  }
});

/* =====================================================================
   Onglets & réglages
   ===================================================================== */
function moveIndicator() {
  const active = document.querySelector(".tab.active");
  const ind = $("tab-ind");
  ind.style.left = active.offsetLeft + "px";
  ind.style.width = active.offsetWidth + "px";
}

function showView(v) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === v));
  moveIndicator();
  for (const name of ["home", "settings"]) {
    const view = $("view-" + name);
    const show = name === v;
    if (show && view.classList.contains("hidden")) {
      view.classList.remove("hidden");
      view.classList.remove("enter"); void view.offsetWidth; view.classList.add("enter");
    } else if (!show) {
      view.classList.add("hidden");
    }
  }
}
document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => showView(t.dataset.view)));
window.addEventListener("resize", moveIndicator);

// ----- Mémoire : limite selon la RAM du PC, valeur conseillée, zone rouge -----
const gb = (mb) => (mb / 1024).toFixed(1).replace(".0", "") + " Go";
function ramLimits() {
  const total = state.info.system_ram_mb || 16384;
  const safe = state.info.safe_ram_mb || 8192;
  const packRec = (state.pack && state.pack.ram) || 6144;
  const rec = Math.max(2048, Math.floor(Math.min(packRec, safe) / 512) * 512);
  const max = Math.max(4096, Math.floor((total - 1024) / 512) * 512);
  return { total, safe, rec, max };
}

function renderRam() {
  if (!state.info) return;
  const { total, safe, rec, max } = ramLimits();
  const r = $("ram"), auto = $("ram-auto").checked;
  r.max = max;
  if (auto) r.value = rec;
  r.disabled = auto;
  const val = +r.value;
  const pct = ((val - r.min) / (r.max - r.min)) * 100;
  const spct = ((Math.min(safe, max) - r.min) / (r.max - r.min)) * 100;
  r.style.setProperty("--p", pct + "%");
  r.style.setProperty("--s", spct + "%");
  $("ram-out").textContent = gb(val);
  $("ram-max-label").textContent = gb(max);
  $("ram-info").textContent = `Ton PC : ${gb(total)} · Conseillé pour le modpack : ${gb(rec)}`;
  const danger = val > safe;
  $("ram-out").classList.toggle("danger", danger);
  $("ram-warn").classList.toggle("hidden", !danger);
  if (danger) $("ram-warn").textContent = `Attention : laisse au moins ${gb(total - safe)} à Windows, sinon ton PC risque de ramer ou le jeu de planter.`;
}

function saveSettings() {
  const settings = {
    ram_mb: $("ram-auto").checked ? 0 : +$("ram").value,
    minimize_on_launch: $("minimize").checked,
    auto_update: $("upd-auto").checked,
  };
  state.info.settings = settings;
  invoke("save_settings", { settings }).catch((e) => toast(String(e)));
}
$("ram-auto").addEventListener("change", () => { renderRam(); saveSettings(); });
$("upd-auto").addEventListener("change", saveSettings);
$("ram").addEventListener("input", renderRam);
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

/* =====================================================================
   Mise à jour du launcher (vérifiée au démarrage)
   ===================================================================== */
state.update = null;
async function checkUpdate(manual) {
  const st = $("upd-status");
  st.textContent = `Version actuelle : v${state.info.version} · recherche…`;
  try {
    const u = await invoke("check_update");
    state.update = u;
    if (u) {
      st.textContent = `Version actuelle : v${state.info.version} · nouvelle version v${u.version} disponible`;
      $("upd-check").textContent = "Installer";
    } else {
      st.textContent = `Version actuelle : v${state.info.version} · à jour`;
      $("upd-check").textContent = "Rechercher";
      if (manual) toast("Le launcher est déjà à jour.", 3500, "Mise à jour");
    }
    return u;
  } catch (e) {
    st.textContent = `Version actuelle : v${state.info.version} · vérification impossible`;
    if (manual) toast(String(e));
    return null;
  }
}

async function installUpdate() {
  if (state.phase !== "idle") return toast("Attends la fin de la préparation du jeu avant de mettre à jour.");
  const u = state.update;
  $("updater").classList.remove("hidden");
  $("upd-sub").textContent = u ? `v${state.info.version} → v${u.version}` : "Téléchargement de la nouvelle version…";
  $("upd-pct").textContent = "Préparation…";
  try {
    await invoke("install_update");
  } catch (e) {
    $("updater").classList.add("hidden");
    toast(String(e));
  }
}

listen("update-progress", ({ payload }) => {
  const [done, total] = payload;
  const fill = $("upd-fill");
  if (total) {
    fill.classList.remove("indeterminate");
    fill.style.width = `calc((100% - 22px) * ${Math.min(1, done / total)})`;
    $("upd-pct").textContent = `${mb(done)} / ${mb(total)} · ${Math.round((done / total) * 100)} %`;
    if (done >= total) $("upd-pct").textContent = "Installation… le launcher va redémarrer";
  } else {
    $("upd-pct").textContent = `${mb(done)} téléchargés`;
  }
});

$("upd-check").addEventListener("click", async () => {
  if (state.update) return installUpdate();
  const u = await checkUpdate(true);
  if (u) toast(`La version v${u.version} est disponible. Clique sur « Installer ».`, 5000, "Mise à jour");
});

/* =====================================================================
   Démarrage
   ===================================================================== */
(async function init() {
  buildMachine();
  requestAnimationFrame(tick);
  requestAnimationFrame(moveIndicator);
  state.info = await invoke("get_info");
  const s = state.info.settings;
  $("ram-auto").checked = s.ram_mb === 0;
  $("ram").max = ramLimits().max;
  if (s.ram_mb) $("ram").value = s.ram_mb;
  $("minimize").checked = s.minimize_on_launch;
  $("upd-auto").checked = s.auto_update !== false;
  renderRam();
  $("app-version").textContent = `Launcher v${state.info.version} · N4ssD`;
  renderAccount();
  if (!state.info.login_configured) {
    setTimeout(() => toast("La connexion Microsoft n'est pas encore configurée (identifiant Azure manquant). Voir le README du dépôt.", 12000, "Configuration"), 1400);
  }
  loadPack();
  const u = await checkUpdate(false);
  if (u) {
    if ($("upd-auto").checked) installUpdate();
    else toast(`Une nouvelle version du launcher (v${u.version}) est disponible. Va dans Réglages pour l'installer.`, 8000, "Mise à jour");
  }
})();
