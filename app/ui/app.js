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
/** Notification en haut à droite. type : error | success | info | update | warning (deviné d'après le titre). */
const TOAST_ICONS = {
  error: '<path d="M12 8v5M12 16.5v.01"/><path d="M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0Z"/>',
  success: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5v.01"/>',
  update: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 20h14"/>',
  warning: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/>',
};
function toast(msg, ms = 6000, title = "Oups", type) {
  type = type || (title === "Oups" || /planté|erreur/i.test(title) ? "error" : /connecté/i.test(title) ? "success" : /mise à jour/i.test(title) ? "update" : /config/i.test(title) ? "warning" : "info");
  if (title === "Oups") title = "Un problème est survenu";
  const box = $("toasts");
  while (box.children.length >= 4) box.firstElementChild.remove();
  const n = document.createElement("div");
  n.className = "ntf " + type;
  n.setAttribute("role", type === "error" ? "alert" : "status");
  n.innerHTML = `<span class="ntf-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${TOAST_ICONS[type]}</svg></span>
    <span class="ntf-text"><strong></strong><span></span></span>
    <button class="ntf-close" aria-label="Fermer"><svg viewBox="0 0 12 12"><path d="M3 3l6 6M9 3l-6 6"/></svg></button>
    <span class="ntf-bar"></span>`;
  n.querySelector("strong").textContent = title;
  n.querySelector(".ntf-text span").textContent = msg;
  const bar = n.querySelector(".ntf-bar");
  bar.style.animationDuration = ms + "ms";
  const close = () => {
    if (n.classList.contains("out")) return;
    n.classList.add("out");
    setTimeout(() => n.remove(), 320);
  };
  bar.addEventListener("animationend", close);
  n.querySelector(".ntf-close").addEventListener("click", close);
  box.appendChild(n);
  return n;
}

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
    renderChangelog(p);
    const links = p.links || {};
    $("link-discord").classList.toggle("hidden", !(links.discord || "").startsWith("https://"));
    $("link-site").classList.toggle("hidden", !(links.site || "").startsWith("https://"));
    const latest = (p.changelog && p.changelog[0]) || null;
    const items = ((p.news && p.news.length ? p.news : latest ? latest.items : []) || []).slice(0, 3);
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
  const heads = $("heads");
  heads.innerHTML = "";
  const sample = (s.online && s.sample) || [];
  $("players").classList.toggle("hidden", !sample.length);
  sample.slice(0, 8).forEach((pl) => {
    const img = new Image();
    img.src = `https://mc-heads.net/avatar/${pl.id || pl.name}/32`;
    img.alt = pl.name;
    img.title = pl.name;
    img.onerror = () => { const f = document.createElement("span"); f.textContent = pl.name[0].toUpperCase(); f.title = pl.name; img.replaceWith(f); };
    heads.appendChild(img);
  });
  if (s.players > Math.min(8, sample.length) && sample.length) {
    const more = document.createElement("span");
    more.textContent = "+" + (s.players - Math.min(8, sample.length));
    heads.appendChild(more);
  }
}
$("link-discord").addEventListener("click", () => state.pack && invoke("open_url", { url: state.pack.links.discord }));
$("link-site").addEventListener("click", () => state.pack && invoke("open_url", { url: state.pack.links.site }));

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
  if (payload !== null && payload !== 0) showCrash(payload);
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
    toast(`Bienvenue ${payload.name} !`, 4000, "Connecté", "success");
  } else if (!$("login").classList.contains("hidden")) {
    $("login-wait").classList.add("hidden");
    $("login-error").textContent = payload.error;
    $("login-error").classList.remove("hidden");
  }
});

/* =====================================================================
   Onglet Nouveautés : frise des mises à jour
   ===================================================================== */
function fmtDate(d) {
  if (!d) return "";
  const t = new Date(d + "T12:00:00");
  return isNaN(t) ? d : t.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}
function lsGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }

function renderChangelog(p) {
  let releases = (p.changelog || []).filter((r) => r && (r.items || []).length);
  if (!releases.length && (p.news || []).length) releases = [{ version: p.version, date: "", title: "Dernière mise à jour", items: p.news }];
  const tl = $("timeline");
  tl.innerHTML = "";
  $("cl-count").textContent = releases.length ? `${releases.length} mise${releases.length > 1 ? "s" : ""} à jour` : "";
  if (!releases.length) {
    const li = document.createElement("li");
    li.className = "cl-empty";
    li.textContent = "Aucune nouveauté pour l'instant.";
    tl.appendChild(li);
  }
  releases.forEach((r, i) => {
    const li = document.createElement("li");
    li.className = "release" + (i === 0 ? " latest" : "");
    li.style.animationDelay = 80 + i * 70 + "ms";
    const side = document.createElement("div");
    side.className = "rel-side";
    const ver = document.createElement("span");
    ver.className = "rel-ver";
    ver.textContent = r.version ? "v" + r.version : "—";
    const date = document.createElement("span");
    date.className = "rel-date";
    date.textContent = fmtDate(r.date);
    side.append(ver, date);
    const node = document.createElementNS(SVGNS, "svg");
    node.setAttribute("class", "rel-node");
    node.setAttribute("viewBox", "-50 -50 100 100");
    buildGear(el("g", {}, node), 10, 7.4, i === 0 ? "brass" : "andesite");
    const card = document.createElement("div");
    card.className = "rel-card";
    const h = document.createElement("h3");
    h.className = "rel-title";
    h.textContent = r.title || "Mise à jour";
    if (i === 0) { const n = document.createElement("span"); n.className = "rel-new"; n.textContent = "NOUVEAU"; h.appendChild(n); }
    const ul = document.createElement("ul");
    ul.className = "rel-items";
    for (const it of r.items || []) {
      const row = document.createElement("li");
      const kind = NEWS_ICON[it.type] ? it.type : "info";
      const b = document.createElement("b");
      b.className = "k-" + kind;
      b.textContent = NEWS_ICON[kind];
      row.append(b, document.createTextNode(it.text));
      ul.appendChild(row);
    }
    card.append(h, ul);
    li.append(side, node, card);
    tl.appendChild(li);
  });
  const key = releases.length ? releases[0].version || releases[0].title : "";
  state.latestNews = key;
  $("news-dot").classList.toggle("hidden", !key || lsGet("nouveautes-vues") === key);
}
$("news-all").addEventListener("click", () => showView("news"));

/* =====================================================================
   Onglet Mods
   ===================================================================== */
state.mods = null; state.modsAt = 0; state.modFilter = "all";
function gearIcon() {
  const svg = document.createElementNS(SVGNS, "svg");
  svg.setAttribute("viewBox", "-50 -50 100 100");
  buildGear(el("g", {}, svg), 10, 7.4, "andesite");
  return svg;
}
function iconBox(url) {
  const box = document.createElement("div");
  box.className = "mod-icon";
  if (url) {
    const img = new Image();
    img.alt = "";
    img.onerror = () => { img.remove(); box.appendChild(gearIcon()); };
    img.src = url;
    box.appendChild(img);
  } else box.appendChild(gearIcon());
  return box;
}

async function loadMods(force) {
  if (!force && state.mods && Date.now() - state.modsAt < 120000) return renderMods();
  $("mods-count").textContent = "Chargement…";
  try {
    state.mods = await invoke("get_mods");
    state.modsAt = Date.now();
    renderMods();
  } catch (e) {
    $("mods-count").textContent = "Impossible de charger la liste des mods.";
    toast(String(e));
  }
}

function renderMods() {
  const data = state.mods;
  if (!data) return;
  const q = $("mods-search").value.trim().toLowerCase();
  const f = state.modFilter;
  const list = data.mods.filter((m) =>
    (f === "all" || m.status === f) &&
    (!q || (m.name || "").toLowerCase().includes(q) || (m.description || "").toLowerCase().includes(q) || (m.id || "").includes(q)));
  const nNew = data.mods.filter((m) => m.status === "new").length, nUp = data.mods.filter((m) => m.status === "updated").length;
  $("mods-count").textContent = `${data.mods.length} mod${data.mods.length > 1 ? "s" : ""} sur le serveur` +
    (nNew ? ` · ${nNew} nouveau${nNew > 1 ? "x" : ""}` : "") + (nUp ? ` · ${nUp} mis à jour` : "");
  const grid = $("mods-grid");
  grid.innerHTML = "";
  if (!list.length) {
    const e = document.createElement("p");
    e.className = "empty";
    e.textContent = data.mods.length ? "Aucun mod ne correspond." : "Aucun mod pour l'instant : dépose tes .jar dans modpack/mods sur GitHub.";
    grid.appendChild(e);
  }
  list.forEach((m, i) => {
    const card = document.createElement("div");
    card.className = "mod";
    card.style.animationDelay = Math.min(i, 20) * 25 + "ms";
    const text = document.createElement("div");
    text.className = "mod-text";
    const name = document.createElement("div");
    name.className = "mod-name";
    const n = document.createElement("span");
    n.textContent = m.name;
    name.appendChild(n);
    if (m.status === "new" || m.status === "updated") {
      const b = document.createElement("span");
      b.className = "badge " + m.status;
      b.textContent = m.status === "new" ? "NOUVEAU" : "MIS À JOUR";
      name.appendChild(b);
    }
    const ver = document.createElement("span");
    ver.className = "mod-ver";
    ver.textContent = m.version ? "v" + m.version : "";
    const desc = document.createElement("span");
    desc.className = "mod-desc";
    desc.textContent = m.description || "";
    text.append(name, ver, desc);
    card.append(iconBox(m.icon), text);
    grid.appendChild(card);
  });
  renderOptional();
}

function renderOptional() {
  const data = state.mods, box = $("optional-list");
  box.innerHTML = "";
  if (!data.optional.length) {
    const e = document.createElement("p");
    e.className = "muted small";
    e.textContent = "Aucun mod optionnel proposé pour l'instant.";
    box.appendChild(e);
    return;
  }
  const choices = state.info.settings.optional || {};
  const isOn = (o) => (o.id in choices ? choices[o.id] : o.default);
  data.optional.forEach((o) => {
    const row = document.createElement("label");
    const available = !!o.file;
    const on = available && (isOn(o) || data.optional.some((x) => isOn(x) && (x.requires || []).includes(o.id)));
    row.className = "opt" + (on ? " on" : "") + (available ? "" : " off");
    const text = document.createElement("div");
    text.className = "mod-text";
    const name = document.createElement("div");
    name.className = "mod-name";
    name.textContent = o.name;
    const desc = document.createElement("span");
    desc.className = "mod-desc";
    const req = (o.requires || []).map((r) => (data.optional.find((x) => x.id === r) || { name: r }).name);
    desc.textContent = !available ? o.error || "Indisponible" : (req.length ? `Nécessite ${req.join(", ")} · ` : "") + (o.description || "");
    text.append(name, desc);
    const sw = document.createElement("input");
    sw.type = "checkbox";
    sw.className = "switch";
    sw.checked = on;
    sw.disabled = !available;
    sw.addEventListener("change", () => setOptional(o.id, sw.checked));
    row.append(iconBox(o.icon), text, sw);
    box.appendChild(row);
  });
}

function setOptional(id, on) {
  const opt = state.mods.optional;
  const choices = Object.assign({}, state.info.settings.optional || {});
  choices[id] = on;
  if (on) {
    // Active aussi ce dont il a besoin
    const stack = [id];
    while (stack.length) {
      const o = opt.find((x) => x.id === stack.pop());
      for (const r of (o && o.requires) || []) if (!choices[r]) { choices[r] = true; stack.push(r); }
    }
  } else {
    // Désactive ce qui en dépend
    let changed = true;
    while (changed) {
      changed = false;
      for (const o of opt) if (choices[o.id] !== false && (o.requires || []).some((r) => choices[r] === false) && (choices[o.id] || o.default)) { choices[o.id] = false; changed = true; }
    }
  }
  state.info.settings.optional = choices;
  saveSettings();
  renderOptional();
  toast("C'est noté : le changement sera appliqué au prochain lancement du jeu.", 3500, "Mods optionnels", "success");
}

$("mods-search").addEventListener("input", renderMods);
document.querySelectorAll(".fchip").forEach((b) => b.addEventListener("click", () => {
  document.querySelectorAll(".fchip").forEach((x) => x.classList.toggle("active", x === b));
  state.modFilter = b.dataset.f;
  renderMods();
}));

/* =====================================================================
   Onglet Captures
   ===================================================================== */
const fileSrc = (p) => (window.__TAURI__.core.convertFileSrc ? window.__TAURI__.core.convertFileSrc(p) : p);
async function loadShots() {
  const shots = await invoke("list_screenshots").catch(() => []);
  const grid = $("shots-grid");
  grid.innerHTML = "";
  $("shots-count").textContent = shots.length
    ? `${shots.length} capture${shots.length > 1 ? "s" : ""} · appuie sur F2 en jeu pour en prendre`
    : "Appuie sur F2 en jeu pour prendre une capture.";
  if (!shots.length) {
    const e = document.createElement("p");
    e.className = "empty";
    e.textContent = "Aucune capture pour l'instant.";
    grid.appendChild(e);
  }
  shots.forEach((sh, i) => {
    const b = document.createElement("button");
    b.className = "shot";
    b.style.animationDelay = Math.min(i, 16) * 30 + "ms";
    const img = new Image();
    img.loading = "lazy";
    img.alt = sh.name;
    img.src = fileSrc(sh.path);
    const cap = document.createElement("span");
    cap.textContent = new Date(sh.modified * 1000).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    b.append(img, cap);
    b.addEventListener("click", () => openLightbox(sh));
    grid.appendChild(b);
  });
}
let lightboxShot = null;
function openLightbox(sh) {
  lightboxShot = sh;
  $("lightbox-img").src = fileSrc(sh.path);
  $("lightbox-name").textContent = sh.name;
  $("lightbox").classList.remove("hidden");
}
$("lightbox-close").addEventListener("click", () => $("lightbox").classList.add("hidden"));
$("lightbox").addEventListener("click", (e) => { if (e.target.id === "lightbox") $("lightbox").classList.add("hidden"); });
$("lightbox-open").addEventListener("click", () => lightboxShot && invoke("open_file", { path: lightboxShot.path }).catch((e) => toast(String(e))));

/* =====================================================================
   Rapport de crash
   ===================================================================== */
let crashText = "";
async function showCrash(code) {
  const info = await invoke("crash_info").catch(() => ({ text: "", source: "" }));
  crashText = info.text || `Minecraft s'est fermé avec le code ${code}.`;
  $("crash-source").textContent = info.source ? `(${info.source})` : "";
  const lines = crashText.split("\n");
  $("crash-log").textContent = lines.slice(-80).join("\n");
  $("crash-link").classList.add("hidden");
  $("crash-share").disabled = false;
  $("crash-share").textContent = "Partager le rapport";
  $("crash").classList.remove("hidden");
  requestAnimationFrame(() => ($("crash-log").scrollTop = $("crash-log").scrollHeight));
}
$("crash-share").addEventListener("click", async () => {
  $("crash-share").disabled = true;
  $("crash-share").textContent = "Envoi…";
  try {
    const url = await invoke("share_crash", { text: crashText });
    try { await navigator.clipboard.writeText(url); } catch (_) {}
    $("crash-link").textContent = `Lien copié : ${url} (colle-le sur le Discord du serveur)`;
    $("crash-link").classList.remove("hidden");
    $("crash-share").textContent = "Envoyé !";
  } catch (e) {
    $("crash-share").disabled = false;
    $("crash-share").textContent = "Partager le rapport";
    toast(String(e));
  }
});
$("crash-copy").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(crashText); $("crash-copy").textContent = "Copié !"; setTimeout(() => ($("crash-copy").textContent = "Copier"), 1500); } catch (_) {}
});
$("crash-close").addEventListener("click", () => $("crash").classList.add("hidden"));

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
  if (v === "news" && state.latestNews) { lsSet("nouveautes-vues", state.latestNews); $("news-dot").classList.add("hidden"); }
  if (v === "mods") loadMods();
  if (v === "shots") loadShots();
  for (const name of ["home", "news", "mods", "shots", "settings"]) {
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
  const [w, h] = $("display-size").value.split("x").map(Number);
  const settings = Object.assign({}, state.info.settings, {
    ram_mb: $("ram-auto").checked ? 0 : +$("ram").value,
    minimize_on_launch: $("minimize").checked,
    auto_update: $("upd-auto").checked,
    fullscreen: $("display-mode").value === "fullscreen",
    width: w, height: h,
    discord_rpc: $("discord-rpc").checked,
    optional: state.info.settings.optional || {},
  });
  state.info.settings = settings;
  $("display-size").disabled = settings.fullscreen;
  invoke("save_settings", { settings }).catch((e) => toast(String(e)));
}
$("display-mode").addEventListener("change", saveSettings);
$("display-size").addEventListener("change", saveSettings);
$("discord-rpc").addEventListener("change", saveSettings);
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
  if (state.phase !== "idle") return toast("Attends la fin de la préparation du jeu avant de mettre à jour.", 5000, "Patiente un instant", "warning");
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
  $("display-mode").value = s.fullscreen ? "fullscreen" : "window";
  const size = `${s.width || 0}x${s.height || 0}`;
  $("display-size").value = [...$("display-size").options].some((o) => o.value === size) ? size : "0x0";
  $("display-size").disabled = !!s.fullscreen;
  $("discord-rpc").checked = s.discord_rpc !== false;
  renderRam();
  $("app-version").textContent = `Launcher v${state.info.version} · N4ssD`;
  renderAccount();
  if (!state.info.login_configured) {
    setTimeout(() => toast("La connexion Microsoft n'est pas encore configurée (identifiant Azure manquant). Voir le README du dépôt.", 12000, "Connexion pas encore configurée", "warning"), 1400);
  }
  loadPack();
  const u = await checkUpdate(false);
  if (u) {
    if ($("upd-auto").checked) installUpdate();
    else toast(`Une nouvelle version du launcher (v${u.version}) est disponible. Va dans Réglages pour l'installer.`, 8000, "Mise à jour");
  }
})();
