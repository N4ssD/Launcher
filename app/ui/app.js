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

/** Style « plan technique lumineux » : contours qui brillent, cercle primitif en pointillés, axes. */
const BLUEPRINT = { brass: "#F2C35B", copper: "#F08A55", andesite: "#CFC8BA" };
function buildGearD(parent, N, m, matName) {
  const c = BLUEPRINT[matName] || BLUEPRINT.brass;
  const g = el("g", { class: "gm-" + matName }, parent);
  const R = (m * N) / 2, ro = R + m * 0.95, ri = R - m * 1.15, s = (2 * Math.PI) / N;
  const pts = [];
  for (let i = 0; i < N; i++) {
    const a = i * s;
    for (const [r, o] of [[ri, -0.29], [ro, -0.16], [ro, 0.16], [ri, 0.29]]) {
      pts.push(`${(r * Math.cos(a + o * s)).toFixed(2)},${(r * Math.sin(a + o * s)).toFixed(2)}`);
    }
  }
  const d = "M" + pts.join(" L") + " Z";
  const hub = Math.max(m * 1.5, R * 0.24);
  el("path", { d, fill: "rgba(233,180,76,.05)" }, g);
  // Halo lumineux (traits larges et transparents : léger et fluide, pas de flou à recalculer)
  const glow = el("g", { class: "g-glow", fill: "none", stroke: c, "stroke-linejoin": "round" }, g);
  el("path", { d, "stroke-width": 9, "stroke-opacity": 0.07 }, glow);
  el("path", { d, "stroke-width": 5, "stroke-opacity": 0.16 }, glow);
  el("path", { d, fill: "none", stroke: c, "stroke-width": 2.2, "stroke-linejoin": "round" }, g);
  el("circle", { r: R, fill: "none", stroke: c, "stroke-width": 1, "stroke-dasharray": "10 6", opacity: 0.55 }, g);
  el("circle", { r: ri - m * 0.6, fill: "none", stroke: c, "stroke-width": 1.4, opacity: 0.75 }, g);
  el("circle", { r: hub, fill: "none", stroke: c, "stroke-width": 2 }, g);
  el("path", { d: `M${-ro - 14},0 H${ro + 14} M0,${-ro - 14} V${ro + 14}`, stroke: c, "stroke-width": 0.8, opacity: 0.4, "stroke-dasharray": "18 5 3 5" }, g);
  el("rect", { x: -hub * 0.3, y: -hub * 0.3, width: hub * 0.6, height: hub * 0.6, fill: "none", stroke: c, "stroke-width": 1.6 }, g);
  return { g, N, R };
}

const kin = { speed: 0, target: 4, angle: 0, last: 0, gears: [], shownRpm: -1 };

function addGear(parent, N, m, mat, cx, cy, phase, rate) {
  const gear = buildGearD(parent, N, m, mat);
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
  // Cotes du plan (fixes)
  const ann = el("g", { class: "g-annot", stroke: BLUEPRINT.brass, fill: BLUEPRINT.brass, "font-family": "Cascadia Mono, Consolas, monospace", "font-size": 13 }, $("machine"));
  const ro = big.R + big.m * 0.95, y = big.cy + ro + 26;
  el("path", { d: `M${big.cx - ro},${y} H${big.cx + ro} M${big.cx - ro},${y - 8} v16 M${big.cx + ro},${y - 8} v16`, fill: "none", "stroke-width": 1 }, ann);
  el("text", { x: big.cx - 64, y: y - 8, stroke: "none" }, ann).textContent = `Ø ${Math.round(ro * 2)} · Z=${big.N}`;
  el("text", { x: cop.cx - 44, y: cop.cy + cop.R + cop.m * 2.6, stroke: "none" }, ann).textContent = `Z=${cop.N} · m${cop.m}`;
  buildGauge(big);
  // Petits engrenages d'interface
  kin.icons = [
    { g: buildGear($("brand-gear"), 10, 7.4, "brass").g, rate: 0.6 },
    { g: buildGear($("play-gear"), 10, 7.4, "dark").g, rate: -1.8, play: true },
    { g: buildGear($("modal-gear"), 10, 7.4, "brass").g, rate: 2.5, fixed: true },
  ];
  buildGear($("upd-gear"), 10, 7.4, "brass");
}

/** Compteur de vitesse fixe, monté sur l'axe de la grande roue (la roue tourne autour). */
const GAUGE_MAX = 64;
function buildGauge(big) {
  const c = BLUEPRINT.brass, r = 44;
  const g = el("g", { class: "gauge", transform: `translate(${big.cx} ${big.cy})` }, $("machine"));
  const pt = (rr, deg) => [rr * Math.cos((deg * Math.PI) / 180), rr * Math.sin((deg * Math.PI) / 180)];
  el("circle", { r: r + 4, fill: "none", stroke: c, "stroke-width": 7, "stroke-opacity": 0.1 }, g);
  el("circle", { r, fill: "#16140F", stroke: c, "stroke-width": 2 }, g);
  el("circle", { r: r - 6, fill: "none", stroke: c, "stroke-width": 0.8, opacity: 0.45 }, g);
  for (let i = 0; i <= 16; i++) {
    const deg = 135 + (i * 270) / 16, big4 = i % 4 === 0, [x1, y1] = pt(r - 7, deg), [x2, y2] = pt(r - 7 - (big4 ? 8 : 4), deg);
    el("line", { x1, y1, x2, y2, stroke: c, "stroke-width": big4 ? 1.8 : 1, opacity: big4 ? 1 : 0.7 }, g);
  }
  const [rx1, ry1] = pt(r - 3, 135 + 270 * 0.75), [rx2, ry2] = pt(r - 3, 405);
  el("path", { class: "gauge-red", d: `M${rx1},${ry1} A${r - 3},${r - 3} 0 0,1 ${rx2},${ry2}`, fill: "none", stroke: BLUEPRINT.copper, "stroke-width": 3 }, g);
  const needle = el("g", { class: "gauge-needle" }, g);
  el("line", { x1: 0, y1: 8, x2: 0, y2: -(r - 13), stroke: "#FFF1CF", "stroke-width": 2.2, "stroke-linecap": "round" }, needle);
  el("circle", { r: 4, fill: c }, g);
  const num = el("text", { y: 22, "text-anchor": "middle", fill: c, "font-size": 13, "font-weight": 700 }, g);
  el("text", { y: 33, "text-anchor": "middle", fill: c, "font-size": 7.5, "letter-spacing": 1, opacity: 0.7 }, g).textContent = "tr/min";
  num.textContent = "0";
  kin.gauge = { needle, num };
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
    if (kin.gauge) kin.gauge.num.textContent = rpm;
  }
  if (kin.gauge) kin.gauge.needle.setAttribute("transform", `rotate(${(-135 + 270 * Math.min(1, kin.speed / GAUGE_MAX)).toFixed(2)})`);
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
  if (type === "error") sfx.error(); else if (type === "success") sfx.chime();
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
  $("hero").classList.toggle("spinning", state.phase === "busy");
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
    lsSet("nom-serveur", p.name);
    $("brand-name").textContent = p.name;
    $("hero-name").textContent = p.name;
    $("chip-mc").textContent = `NEOFORGE ${p.minecraft}`;
    $("chip-pack").textContent = p.version ? `MODPACK v${p.version}` : "MODPACK";
    $("news-title").textContent = p.version ? `NOUVEAUTÉS v${p.version}` : "NOUVEAUTÉS";
    const ul = $("news-list");
    ul.innerHTML = "";
    renderChangelog(p);
    state.event = p.event || null;
    renderEvent();
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
    checkVoteReminders(!state.votesChecked); state.votesChecked = true;
    firstRunFlow();
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
  sfx.click();
  if (state.pack && rulesPending()) return openRules(true);
  if (!state.info.account) return openLogin();
  sfx.ratchet();
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
  setTimeout(maybeApplyUpdate, 2500);
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
  sfx.chime();
  sfx.music(false);
});

listen("game-exit", ({ payload }) => {
  backToIdle();
  setTimeout(loadStats, 800);
  if ($("music-on").checked) setTimeout(() => sfx.music(true), 1500);
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
async function toggleAccMenu(force) {
  const menu = $("acc-menu");
  const open = force !== undefined ? force : menu.classList.contains("hidden");
  if (!open) { menu.classList.add("hidden"); $("account").classList.remove("open"); return; }
  const list = await invoke("list_accounts").catch(() => []);
  if (!list.length) return openLogin();
  const box = $("acc-list");
  box.innerHTML = "";
  for (const a of list) {
    const row = document.createElement("div");
    row.className = "acc-item";
    row.setAttribute("role", "menuitem");
    row.tabIndex = 0;
    const av = document.createElement("span");
    av.className = "avatar";
    av.textContent = a.name[0].toUpperCase();
    const img = new Image(); img.alt = ""; img.onload = () => { av.textContent = ""; av.appendChild(img); };
    img.src = `https://mc-heads.net/avatar/${a.uuid}/64`;
    const name = document.createElement("span");
    name.className = "acc-name";
    name.textContent = a.name;
    row.append(av, name);
    if (a.active) { const c = document.createElement("span"); c.className = "acc-check"; c.textContent = "✓"; row.appendChild(c); }
    const del = document.createElement("button");
    del.className = "acc-del"; del.textContent = "×"; del.setAttribute("aria-label", "Retirer " + a.name);
    del.addEventListener("click", async (e) => { e.stopPropagation(); await invoke("remove_account", { uuid: a.uuid }); await refreshInfo(); toggleAccMenu(true); });
    row.appendChild(del);
    row.addEventListener("click", async () => {
      if (!a.active) { await invoke("switch_account", { uuid: a.uuid }); await refreshInfo(); toast(a.name, 3000, "Compte changé", "success"); }
      toggleAccMenu(false);
    });
    box.appendChild(row);
  }
  menu.classList.remove("hidden");
  $("account").classList.add("open");
}
async function refreshInfo() { state.info = await invoke("get_info"); renderAccount(); }
$("account").addEventListener("click", (e) => { e.stopPropagation(); if (state.phase === "busy") return; state.info.account ? toggleAccMenu() : openLogin(); });
document.addEventListener("click", (e) => { if (!e.target.closest(".acc-wrap")) toggleAccMenu(false); });
$("acc-add").addEventListener("click", () => { toggleAccMenu(false); openLogin(); });
$("acc-logout").addEventListener("click", async () => { toggleAccMenu(false); await invoke("logout"); await refreshInfo(); });
$("add-account").addEventListener("click", openLogin);
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
   Bannière d'événement
   ===================================================================== */
function renderEvent() {
  const ev = state.event, box = $("event");
  if (!ev || !ev.title) return box.classList.add("hidden");
  const start = ev.date ? new Date(ev.date) : null;
  const end = ev.end ? new Date(ev.end) : start ? new Date(start.getTime() + 3 * 3600e3) : null;
  const now = new Date();
  if (end && now > end) return box.classList.add("hidden");
  $("event-title").textContent = ev.title;
  $("event-desc").textContent = ev.text || "";
  const when = $("event-when");
  when.classList.remove("live");
  if (start && now < start) {
    const m = Math.round((start - now) / 60000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
    when.textContent = "dans " + (d ? `${d} j ${h} h` : h ? `${h} h ${mm} min` : `${Math.max(1, mm)} min`);
  } else if (start) {
    when.textContent = "EN COURS";
    when.classList.add("live");
  } else when.textContent = "";
  when.classList.toggle("hidden", !when.textContent);
  box.classList.remove("hidden");
}
setInterval(renderEvent, 30000);

/* =====================================================================
   Onglet Nouveautés : frise des mises à jour
   ===================================================================== */
function fmtDate(d) {
  if (!d) return "";
  const t = new Date(d + "T12:00:00");
  return isNaN(t) ? d : t.toLocaleDateString(i18n.lang === "en" ? "en-GB" : "fr-FR", { day: "numeric", month: "short", year: "numeric" });
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
   Vote avec rappel
   ===================================================================== */
const nowSec = () => Math.floor(Date.now() / 1000);
function voteSites() { return (state.pack && state.pack.vote) || []; }
function voteState(site) {
  const last = (state.info.settings.votes || {})[site.name] || 0;
  const next = last + (site.cooldown_hours || 24) * 3600;
  return { last, next, ready: nowSec() >= next };
}
function fmtWait(sec) {
  const m = Math.ceil(sec / 60), h = Math.floor(m / 60);
  return h ? `${h} h ${String(m % 60).padStart(2, "0")}` : `${m} min`;
}
function renderVotes() {
  const sites = voteSites();
  $("vote-btn").classList.toggle("hidden", !sites.length);
  if (!sites.length) return;
  const ready = sites.filter((s) => voteState(s).ready).length;
  $("vote-badge").textContent = ready;
  $("vote-badge").classList.toggle("hidden", !ready);
  $("vote-btn").classList.toggle("ready", ready > 0);
  const list = $("vote-list");
  list.innerHTML = "";
  sites.forEach((site, i) => {
    const st = voteState(site);
    const row = document.createElement("div");
    row.className = "vote-row" + (st.ready ? " ready" : "");
    const num = document.createElement("span"); num.className = "vote-num"; num.textContent = i + 1;
    const info = document.createElement("span"); info.className = "vote-info";
    const name = document.createElement("strong"); name.textContent = site.name;
    const sub = document.createElement("span");
    if (st.ready) { sub.textContent = st.last ? "Tu peux revoter" : "Disponible"; sub.className = "ok"; }
    else sub.textContent = "Prochain vote dans " + fmtWait(st.next - nowSec());
    info.append(name, sub);
    const btn = document.createElement("button");
    btn.className = st.ready ? "primary" : "ghost";
    btn.textContent = st.ready ? "Voter" : "Ouvrir";
    btn.addEventListener("click", () => vote(site, st.ready));
    row.append(num, info, btn);
    list.appendChild(row);
  });
}
function vote(site, counts) {
  invoke("open_url", { url: site.url }).catch(() => {});
  if (!counts) return;
  const votes = Object.assign({}, state.info.settings.votes || {});
  votes[site.name] = nowSec();
  state.info.settings.votes = votes;
  state.voteNotified = state.voteNotified || {};
  saveSettings();
  renderVotes();
  toast(`Merci pour ton vote sur ${site.name} ! Je te préviendrai quand tu pourras revoter.`, 5000, "Merci !", "success");
}
/** Rappel : notification quand un vote redevient possible. */
function checkVoteReminders(startup) {
  const sites = voteSites();
  if (!sites.length) return;
  state.voteNotified = state.voteNotified || {};
  // Pas de rappel pendant le règlement ou la visite guidée : on réessaiera au prochain passage.
  if ((state.pack && rulesPending()) || !$("tour").classList.contains("hidden")) return renderVotes();
  const ready = sites.filter((s) => {
    const st = voteState(s);
    if (!st.ready || state.voteNotified[s.name] === st.next) return false;
    state.voteNotified[s.name] = st.next;
    return true;
  });
  renderVotes();
  if (!ready.length) return;
  const msg = ready.length === 1 ? `Tu peux voter sur ${ready[0].name} !` : `Tu peux voter sur ${ready.length} sites !`;
  setTimeout(() => {
    const n = toast(msg + " Clique ici pour voter.", 8000, "Vote disponible", "info");
    n.style.cursor = "pointer";
    n.addEventListener("click", (e) => { if (!e.target.closest(".ntf-close")) openVotes(); });
  }, startup ? 3500 : 0);
}
function openVotes() { renderVotes(); $("votes").classList.remove("hidden"); }
$("vote-btn").addEventListener("click", openVotes);
$("votes-close").addEventListener("click", () => $("votes").classList.add("hidden"));
setInterval(() => { if (!$("votes").classList.contains("hidden")) renderVotes(); checkVoteReminders(false); }, 30000);

/* =====================================================================
   Règlement + visite guidée
   ===================================================================== */
function rulesVersion() { const r = state.pack && state.pack.rules; return r && (r.items || []).length ? r.version || "1" : null; }
function rulesPending() { const v = rulesVersion(); return v !== null && state.info.settings.rules_accepted !== v; }
function openRules(force) {
  const r = state.pack.rules;
  $("rules-title").textContent = r.title || "Règlement du serveur";
  const ol = $("rules-list");
  ol.innerHTML = "";
  for (const it of r.items) { const li = document.createElement("li"); li.textContent = it; ol.appendChild(li); }
  const already = !rulesPending() && !force;
  $("rules-ok").checked = already;
  $("rules-accept").disabled = !already;
  $("rules-accept").textContent = rulesPending() ? "Accepter et continuer" : "Fermer";
  $("rules").classList.remove("hidden");
}
$("rules-ok").addEventListener("change", () => ($("rules-accept").disabled = !$("rules-ok").checked));
$("rules-accept").addEventListener("click", () => {
  const first = rulesPending();
  state.info.settings.rules_accepted = rulesVersion();
  saveSettings();
  $("rules").classList.add("hidden");
  if (first) toast("Bon jeu sur le serveur !", 3500, "Règlement accepté", "success");
  if (!state.info.settings.tour_done) setTimeout(startTour, 600);
});
$("rules-again").addEventListener("click", () => openRules(false));
/** Au chargement du modpack : règlement d'abord, puis visite guidée la première fois. */
function firstRunFlow() {
  $("rules-again").classList.toggle("hidden", rulesVersion() === null);
  if (state.firstRunDone) return;
  state.firstRunDone = true;
  if (rulesPending()) return setTimeout(() => openRules(true), 900);
  if (!state.info.settings.tour_done) setTimeout(startTour, 1400);
}

const TOUR = [
  { sel: "#play", title: "Jouer", text: "Un seul clic : le launcher met à jour les mods et te connecte directement au serveur." },
  { sel: '[data-view="news"]', title: "Nouveautés", text: "Tout ce qui change sur le serveur et dans le modpack. Le point orange signale une nouveauté pas encore lue." },
  { sel: '[data-view="mods"]', title: "Mods", text: "La liste des mods du serveur, et des mods optionnels à activer toi-même : minimap, shaders…" },
  { sel: "#vote-btn", title: "Voter", text: "Vote pour le serveur une fois par jour. Le launcher te prévient quand tu peux revoter." },
  { sel: '[data-view="settings"]', title: "Réglages", text: "Mémoire, sons, musique, langue… et le bouton Réparer si le jeu ne se lance plus." },
  { sel: "#account", title: "Ton compte", text: "Connecte-toi ici avec ton compte Microsoft. Tu peux en ajouter plusieurs." },
];
let tourSteps = [], tourIdx = 0;
function zoomFactor() { return parseFloat(document.documentElement.style.zoom) || 1; }
function layoutRect(elm) {
  const z = zoomFactor(), r = elm.getBoundingClientRect();
  // Selon le navigateur, les coordonnées tiennent compte du zoom de la page (démo web) ou non.
  const visual = Math.abs(document.body.getBoundingClientRect().width - document.body.offsetWidth * z) < 2 && z !== 1;
  const k = visual ? z : 1;
  return { left: r.left / k, top: r.top / k, width: r.width / k, height: r.height / k };
}
function startTour() {
  if (state.phase !== "idle") return;
  showView("home");
  tourSteps = TOUR.filter((s) => { const e = document.querySelector(s.sel); return e && e.offsetParent !== null; });
  if (!tourSteps.length) return;
  tourIdx = 0;
  $("tour").classList.remove("hidden");
  showTourStep();
}
function showTourStep() {
  const st = tourSteps[tourIdx], target = document.querySelector(st.sel);
  const r = layoutRect(target), pad = 8, z = zoomFactor();
  const vw = innerWidth / z, vh = innerHeight / z;
  Object.assign($("tour-spot").style, { left: r.left - pad + "px", top: r.top - pad + "px", width: r.width + pad * 2 + "px", height: r.height + pad * 2 + "px" });
  $("tour-step").textContent = `${tourIdx + 1} / ${tourSteps.length}`;
  $("tour-title").textContent = st.title;
  $("tour-text").textContent = st.text;
  $("tour-next").textContent = tourIdx === tourSteps.length - 1 ? "Terminer" : "Suivant";
  const card = $("tour-card"), cw = 320, ch = card.offsetHeight || 150;
  let top = r.top + r.height + pad + 14;
  if (top + ch > vh - 10) top = r.top - pad - 14 - ch;
  let left = Math.min(vw - cw - 12, Math.max(12, r.left + r.width / 2 - cw / 2));
  Object.assign(card.style, { left: left + "px", top: Math.max(10, top) + "px" });
}
function endTour() {
  $("tour").classList.add("hidden");
  setTimeout(() => checkVoteReminders(false), 1200);
  if (!state.info.settings.tour_done) { state.info.settings.tour_done = true; saveSettings(); }
}
$("tour-next").addEventListener("click", () => { if (++tourIdx >= tourSteps.length) return endTour(); showTourStep(); });
$("tour-skip").addEventListener("click", endTour);
$("tour-again").addEventListener("click", () => setTimeout(startTour, 200));
addEventListener("resize", () => { if (!$("tour").classList.contains("hidden")) showTourStep(); });

/* =====================================================================
   Temps de jeu
   ===================================================================== */
function fmtDuration(sec) {
  const m = Math.round(sec / 60), h = Math.floor(m / 60);
  if (h >= 10) return `${h} h`;
  return h ? `${h} h ${String(m % 60).padStart(2, "0")}` : `${Math.max(1, m)} min`;
}
async function loadStats() {
  const tz = -new Date().getTimezoneOffset();
  const st = await invoke("get_stats", { tzOffsetMin: tz }).catch(() => null);
  if (!st || !st.sessions) return $("playstats").classList.add("hidden");
  const today = Math.floor((Date.now() / 1000 + tz * 60) / 86400);
  const days = new Set(st.days || []);
  let d = days.has(today) ? today : today - 1, streak = 0;
  while (days.has(d)) { streak++; d--; }
  $("ps-total").textContent = `${fmtDuration(st.total_secs)} de jeu`;
  $("ps-last").textContent = `Dernière session : ${fmtDuration(st.last_session_secs)}`;
  $("ps-streak").textContent = `${streak} jour${streak > 1 ? "s" : ""} d'affilée`;
  $("ps-streak-wrap").classList.toggle("hidden", streak < 2);
  $("playstats").classList.remove("hidden");
}

/* =====================================================================
   Onglets & réglages
   ===================================================================== */
function moveIndicator() {
  const active = document.querySelector(".tab.active");
  const ind = $("tab-ind");
  ind.style.left = active.offsetLeft + "px";
  ind.style.width = active.offsetWidth + "px";
}

const VIEW_ORDER = ["home", "news", "mods", "shots", "settings"];
let currentView = "home";
function showView(v) {
  const dir = VIEW_ORDER.indexOf(v) >= VIEW_ORDER.indexOf(currentView) ? "enter-r" : "enter-l";
  currentView = v;
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
      view.classList.remove("enter", "enter-r", "enter-l"); void view.offsetWidth; view.classList.add(dir);
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
    sound_volume: +$("volume").value,
    music_on: $("music-on").checked,
    music_volume: +$("music-volume").value,
    optimized_java: $("opt-java").checked,
    lang: $("lang").value,
    theme: $("theme").value,
    season: $("season").value,
    daytime: $("daytime").value,
  });
  state.info.settings = settings;
  $("display-size").disabled = settings.fullscreen;
  invoke("save_settings", { settings }).catch((e) => toast(String(e)));
}
$("display-mode").addEventListener("change", saveSettings);
$("display-size").addEventListener("change", saveSettings);
$("discord-rpc").addEventListener("change", saveSettings);
$("opt-java").addEventListener("change", saveSettings);
for (const id of ["theme", "season", "daytime"]) $(id).addEventListener("change", () => { saveSettings(); applyAmbiance(); });
function renderVolume() {
  const v = +$("volume").value;
  $("volume").style.setProperty("--p", v + "%");
  $("volume").style.setProperty("--s", "100%");
  $("volume-out").textContent = v + " %";
  sfx.setVolume(v / 100);
}
$("volume").addEventListener("input", renderVolume);
function renderMusic() {
  const v = +$("music-volume").value;
  $("music-volume").style.setProperty("--p", v + "%");
  $("music-volume").style.setProperty("--s", "100%");
  $("music-out").textContent = v + " %";
  $("music-volume").disabled = !$("music-on").checked;
  sfx.setMusicVolume(v / 100);
}
$("music-volume").addEventListener("input", renderMusic);
$("music-volume").addEventListener("change", saveSettings);
$("music-on").addEventListener("change", () => { renderMusic(); sfx.music($("music-on").checked && state.phase !== "ingame"); saveSettings(); });
$("volume").addEventListener("change", () => { saveSettings(); sfx.chime(); });
$("lang").addEventListener("change", () => { saveSettings(); setTimeout(() => location.reload(), 250); });
$("repair").addEventListener("click", async () => {
  if (state.phase !== "idle") return;
  showView("home");
  state.phase = "busy";
  renderPlay();
  setStatus("Préparation…", "", "");
  setBelt(-1, true);
  try { await invoke("repair"); } catch (e) { backToIdle(); toast(String(e)); }
});
listen("repair-done", () => {
  backToIdle();
  toast("Tout a été vérifié : tu peux jouer.", 6000, "Installation réparée", "success");
});
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

/** Télécharge la mise à jour en arrière-plan, sans bloquer le launcher. */
async function backgroundUpdate(u) {
  state.updateDownloading = true;
  $("upd-status").textContent = `Version actuelle : v${state.info.version} · téléchargement de v${u.version}…`;
  try {
    const v = await invoke("download_update");
    state.updateReady = v;
    $("upd-status").textContent = `Version actuelle : v${state.info.version} · v${v} prête à installer`;
    maybeApplyUpdate();
  } catch (e) {
    $("upd-status").textContent = `Version actuelle : v${state.info.version} · vérification impossible`;
  } finally {
    state.updateDownloading = false;
  }
}
/** Installe dès que le launcher est libre (pas pendant la préparation ni pendant le jeu). */
function maybeApplyUpdate() {
  if (!state.updateReady || state.phase !== "idle" || !$("login").classList.contains("hidden")) return;
  toast(`La version v${state.updateReady} est prête : le launcher redémarre…`, 2500, "Mise à jour");
  setTimeout(() => state.phase === "idle" && installUpdate(), 1800);
}

async function installUpdate() {
  if (state.phase !== "idle") return toast("Attends la fin de la préparation du jeu avant de mettre à jour.", 5000, "Patiente un instant", "warning");
  const u = state.update;
  $("updater").classList.remove("hidden");
  $("upd-sub").textContent = u ? `v${state.info.version} → v${u.version}` : "Téléchargement de la nouvelle version…";
  $("upd-pct").textContent = state.updateReady ? "Installation… le launcher va redémarrer" : "Préparation…";
  try {
    await invoke("install_update");
  } catch (e) {
    $("updater").classList.add("hidden");
    toast(String(e));
  }
}

listen("update-progress", ({ payload }) => {
  const [done, total] = payload;
  if ($("updater").classList.contains("hidden")) {
    if (total) $("upd-status").textContent = `Version actuelle : v${state.info.version} · téléchargement… ${Math.round((done / total) * 100)} %`;
    return;
  }
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
  if (state.updateDownloading) return toast("La mise à jour se télécharge déjà, elle s'installera toute seule.", 4000, "Mise à jour");
  if (state.update) return installUpdate();
  const u = await checkUpdate(true);
  if (u) toast(`La version v${u.version} est disponible. Clique sur « Installer ».`, 5000, "Mise à jour");
});

/* =====================================================================
   Animations d'ambiance : poussières dorées + parallaxe
   ===================================================================== */
const motes = (() => {
  const cv = $("motes"), cx = cv.getContext("2d");
  let W = 0, H = 0, parts = [], last = 0, mode = "motes", pumpkins = [];
  const sprites = {};
  function glowSprite(rgb) {
    if (sprites[rgb]) return sprites[rgb];
    const c = document.createElement("canvas"); c.width = c.height = 32;
    const g = c.getContext("2d"), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(0.35, `rgba(${rgb},.5)`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
    return (sprites[rgb] = c);
  }
  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = innerWidth; H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  const rnd = (a, b) => a + Math.random() * (b - a);
  const LEAF = ["#C8642A", "#D9922E", "#A7402A", "#8A5A2B", "#E0A23A"], PETAL = ["#F7C6D9", "#F4B0C8", "#FFE1EC", "#F9D2E2"];
  function spawn(fresh) {
    const y0 = fresh ? Math.random() * H : null;
    switch (mode) {
      case "snow": return { x: rnd(0, W), y: y0 ?? -10, r: rnd(1.2, 3.6), vy: rnd(18, 55), sway: rnd(8, 26), f: rnd(.3, .9), ph: rnd(0, 6.3), a: rnd(.5, .95) };
      case "leaves": return { x: rnd(0, W), y: y0 ?? -20, r: rnd(8, 13), vy: rnd(22, 48), sway: rnd(30, 70), f: rnd(.25, .6), ph: rnd(0, 6.3), rot: rnd(0, 6.3), vr: rnd(-2.5, 2.5), c: LEAF[(Math.random() * LEAF.length) | 0], a: rnd(.75, 1) };
      case "petals": return { x: rnd(0, W), y: y0 ?? -10, r: rnd(3, 5.5), vy: rnd(14, 30), sway: rnd(25, 55), f: rnd(.3, .7), ph: rnd(0, 6.3), rot: rnd(0, 6.3), vr: rnd(-2, 2), c: PETAL[(Math.random() * PETAL.length) | 0], a: rnd(.6, .95) };
      case "fireflies": return { x: rnd(0, W), y: y0 ?? rnd(H * .3, H), r: rnd(2.5, 5), vx: rnd(-12, 12), vy: rnd(-10, 10), ph: rnd(0, 6.3), tw: rnd(.6, 1.6), a: rnd(.6, 1) };
      case "embers": return { x: rnd(0, W), y: y0 ?? H + 10, r: rnd(2, 5), vy: rnd(14, 34), sway: rnd(6, 20), f: rnd(.2, .6), ph: rnd(0, 6.3), tw: rnd(.8, 2), a: rnd(.35, .8) };
      default: return { x: rnd(0, W), y: y0 ?? H + 10, r: rnd(2, 7), vy: rnd(8, 26), sway: rnd(6, 24), f: rnd(.2, .7), ph: rnd(0, 6.3), tw: rnd(.6, 2.2), a: rnd(.25, .8) };
    }
  }
  function count() {
    const base = (W * H) / 16000;
    return Math.round(Math.min(110, { snow: base * 1.4, leaves: base * .7, petals: base * .6, fireflies: base * .5, embers: base * .8 }[mode] ?? base));
  }
  function reset() {
    parts = Array.from({ length: count() }, () => spawn(true));
    pumpkins = mode === "embers" ? [{ x: .44, s: 1.1 }, { x: .5, s: .75 }, { x: .555, s: .9 }] : [];
  }
  function drawPumpkin(x, y, s, t) {
    cx.save(); cx.translate(x, y); cx.scale(s, s);
    cx.globalAlpha = .35 + .2 * Math.sin(t * 2); cx.drawImage(glowSprite("255,140,30"), -40, -40, 80, 80);
    cx.globalAlpha = 1; cx.fillStyle = "#E3741F";
    for (const [ox, w] of [[-9, 11], [9, 11], [0, 13]]) { cx.beginPath(); cx.ellipse(ox, 0, w, 12, 0, 0, Math.PI * 2); cx.fill(); }
    cx.fillStyle = "#4A6B2A"; cx.fillRect(-2, -16, 4, 6);
    cx.fillStyle = "#FFD36A"; cx.globalAlpha = .7 + .3 * Math.sin(t * 6);
    cx.beginPath(); cx.moveTo(-9, -3); cx.lineTo(-5, -7); cx.lineTo(-2, -3); cx.fill();
    cx.beginPath(); cx.moveTo(9, -3); cx.lineTo(5, -7); cx.lineTo(2, -3); cx.fill();
    cx.beginPath(); cx.moveTo(-8, 4); cx.lineTo(8, 4); cx.lineTo(4, 8); cx.lineTo(0, 5); cx.lineTo(-4, 8); cx.fill();
    cx.restore();
  }
  function frame(t) {
    requestAnimationFrame(frame);
    if (document.hidden || reduceMotion) { last = t; return; }
    const dt = last ? Math.min(0.05, (t - last) / 1000) : 0, ts = t / 1000;
    last = t;
    const boost = 1 + Math.min(3, kin.speed / 16);
    cx.clearRect(0, 0, W, H);
    const acc = getComputedStyle(document.body).getPropertyValue("--acc-rgb").trim() || "233,180,76";
    for (const p of parts) {
      cx.globalAlpha = p.a;
      if (mode === "snow" || mode === "leaves" || mode === "petals") {
        p.y += p.vy * dt;
        const x = p.x + Math.sin(ts * p.f + p.ph) * p.sway;
        if (p.y > H + 20) Object.assign(p, spawn(false));
        if (mode === "snow") { cx.fillStyle = "#F4F8FF"; cx.beginPath(); cx.arc(x, p.y, p.r, 0, Math.PI * 2); cx.fill(); continue; }
        p.rot += p.vr * dt;
        cx.save(); cx.translate(x, p.y); cx.rotate(p.rot); cx.scale(1, .45 + .55 * Math.abs(Math.sin(ts * 1.6 + p.ph)));
        cx.fillStyle = p.c; cx.beginPath(); cx.ellipse(0, 0, p.r, p.r * (mode === "leaves" ? .55 : .7), 0, 0, Math.PI * 2); cx.fill();
        if (mode === "leaves") { cx.strokeStyle = "rgba(60,30,10,.5)"; cx.lineWidth = .8; cx.beginPath(); cx.moveTo(-p.r, 0); cx.lineTo(p.r, 0); cx.stroke(); }
        cx.restore();
      } else if (mode === "fireflies") {
        p.x += (p.vx + Math.sin(ts * .7 + p.ph) * 14) * dt; p.y += (p.vy + Math.cos(ts * .6 + p.ph) * 10) * dt;
        if (p.x < -20 || p.x > W + 20 || p.y < -20 || p.y > H + 20) Object.assign(p, spawn(false), { y: Math.random() * H });
        cx.globalAlpha = p.a * Math.max(0, Math.sin(ts * p.tw + p.ph)) ** 2;
        cx.drawImage(glowSprite("200,255,120"), p.x - p.r * 2, p.y - p.r * 2, p.r * 4, p.r * 4);
      } else {
        p.y -= p.vy * dt * boost;
        const x = p.x + Math.sin(ts * p.f + p.ph) * p.sway;
        if (p.y < -20) Object.assign(p, spawn(false));
        cx.globalAlpha = Math.max(0, p.a * (0.55 + 0.45 * Math.sin(ts * p.tw + p.ph)) * Math.min(1, (H - p.y) / 120));
        cx.drawImage(glowSprite(mode === "embers" ? "255,140,40" : acc), x - p.r, p.y - p.r, p.r * 2, p.r * 2);
      }
    }
    for (const pk of pumpkins) drawPumpkin(pk.x * W, H * 0.745 + Math.sin(ts + pk.x * 9) * 3, pk.s, ts + pk.x * 5);
    cx.globalAlpha = 1;
  }
  return {
    start() { resize(); reset(); addEventListener("resize", () => { resize(); reset(); }); requestAnimationFrame(frame); },
    setMode(m) { if (m !== mode) { mode = m; if (W) reset(); } },
  };
})();

/* =====================================================================
   Ambiance : thème de couleur, moment de la journée, saison
   ===================================================================== */
function autoDaytime(d = new Date()) {
  const h = d.getHours() + d.getMinutes() / 60;
  return h >= 6 && h < 9 ? "matin" : h >= 9 && h < 17 ? "jour" : h >= 17 && h < 20.5 ? "soir" : "nuit";
}
function autoSeason(d = new Date()) {
  const md = (d.getMonth() + 1) * 100 + d.getDate();
  if (md >= 1024 && md <= 1102) return "halloween";
  if (md >= 1201 || md <= 319) return "hiver";
  if (md >= 922) return "automne";
  if (md >= 320 && md <= 620) return "printemps";
  return "ete";
}
function applyAmbiance() {
  const st = (state.info && state.info.settings) || {};
  const day = st.daytime && st.daytime !== "auto" ? st.daytime : autoDaytime();
  const season = st.season && st.season !== "auto" ? st.season : autoSeason();
  document.body.dataset.theme = st.theme || "laiton";
  document.body.className = document.body.className.replace(/\b[ts]-\S+/g, "").trim();
  document.body.classList.add("t-" + day, "s-" + season);
  const mode = season === "hiver" ? "snow" : season === "halloween" ? "embers" : day === "nuit" ? "fireflies" : season === "automne" ? "leaves" : season === "printemps" ? "petals" : "motes";
  motes.setMode(mode);
}
setInterval(applyAmbiance, 5 * 60 * 1000);

/* =====================================================================
   Écran d'ouverture : engrenages dessinés au trait puis emboîtés
   ===================================================================== */
function runSplash() {
  const sp = $("splash");
  const reveal = () => {
    sp.classList.add("out");
    document.body.classList.remove("splashing", "splash-prep");
    motes.start();
  };
  try { sfx.warm(); } catch {}
  if (reduceMotion) return reveal();
  const stage = $("splash-stage");
  const css = getComputedStyle(document.body);
  // Chaque engrenage est un élément à part que la carte graphique fait tourner : reste fluide même si le reste travaille.
  const gear = (N, m, cx, cy, cls, color, delay, rot) => {
    const R = (m * N) / 2, ro = R + m * 0.95, ri = R - m * 1.15, st = (2 * Math.PI) / N, size = (ro + 4) * 2;
    const wrap = document.createElement("div");
    wrap.className = "sg-wrap " + cls;
    Object.assign(wrap.style, { width: size + "px", height: size + "px", left: cx - size / 2 + "px", top: cy - size / 2 + "px" });
    const svg = el("svg", { viewBox: `${-size / 2} ${-size / 2} ${size} ${size}` }, null);
    const g = el("g", rot ? { transform: `rotate(${rot})` } : {}, svg);
    const pts = [];
    for (let i = 0; i < N; i++) for (const [r, o] of [[ri, -0.29], [ro, -0.16], [ro, 0.16], [ri, 0.29]]) pts.push(`${(r * Math.cos(i * st + o * st)).toFixed(2)},${(r * Math.sin(i * st + o * st)).toFixed(2)}`);
    el("path", { d: "M" + pts.join(" L") + " Z", fill: "none", stroke: color, "stroke-width": 2.4, pathLength: 1, style: `animation-delay:${delay}s` }, g);
    el("circle", { r: R * 0.42, fill: "none", stroke: color, "stroke-width": 2, pathLength: 1, style: `animation-delay:${delay + 0.1}s` }, g);
    el("rect", { x: -R * 0.12, y: -R * 0.12, width: R * 0.24, height: R * 0.24, fill: "none", stroke: color, "stroke-width": 2, pathLength: 1, style: `animation-delay:${delay + 0.18}s` }, g);
    wrap.appendChild(svg);
    stage.appendChild(wrap);
    return R;
  };
  const R1 = gear(16, 9, 110, 90, "sg1", css.getPropertyValue("--gear-a").trim() || "#F2C35B", 0, 0);
  gear(10, 9, 110 + R1 + 45 + 1, 90, "sg2", css.getPropertyValue("--gear-b").trim() || "#F08A55", 0.08, 18);
  $("splash-name").textContent = lsGet("nom-serveur") || "";
  // Le launcher se dessine derrière l'écran d'ouverture un peu avant sa disparition : pas d'à-coup au fondu.
  setTimeout(() => document.body.classList.add("splash-prep"), 1500);
  setTimeout(reveal, 2000);
}

let parallaxRaf = 0;
document.addEventListener("mousemove", (e) => {
  if (reduceMotion || parallaxRaf) return;
  parallaxRaf = requestAnimationFrame(() => {
    parallaxRaf = 0;
    const x = e.clientX / innerWidth - 0.5, y = e.clientY / innerHeight - 0.5;
    document.documentElement.style.setProperty("--px", (-x * 18).toFixed(1) + "px");
    document.documentElement.style.setProperty("--py", (-y * 12).toFixed(1) + "px");
  });
});
// Fenêtre réduite ou cachée : on met les animations en pause (économie de batterie)
document.addEventListener("visibilitychange", () => document.body.classList.toggle("paused", document.hidden));

/* =====================================================================
   Reflets qui suivent la souris + inclinaison 3D des cartes
   ===================================================================== */
const TILT = ".mod, .rel-card, .opt, .shot, .vote-row, .card";
let tilted = null;
document.addEventListener("mousemove", (e) => {
  if (reduceMotion) return;
  const z = zoomFactor();
  const sh = e.target.closest(".panel, .hero, .card");
  if (sh) {
    const r = sh.getBoundingClientRect();
    sh.style.setProperty("--sx", ((e.clientX - r.left) / z).toFixed(0) + "px");
    sh.style.setProperty("--sy", ((e.clientY - r.top) / z).toFixed(0) + "px");
  }
  const t = e.target.closest(TILT);
  if (tilted && tilted !== t) tilted.style.rotate = "";
  tilted = t;
  if (t) {
    const r = t.getBoundingClientRect();
    const dx = (e.clientX - r.left) / r.width - 0.5, dy = (e.clientY - r.top) / r.height - 0.5;
    const max = t.classList.contains("card") ? 2.5 : 7;
    const ang = Math.min(1, Math.hypot(dx, dy) * 2) * max;
    t.style.rotate = ang > 0.2 ? `${(-dy).toFixed(3)} ${dx.toFixed(3)} 0 ${ang.toFixed(2)}deg` : "";
  }
}, { passive: true });
document.addEventListener("mouseleave", () => { if (tilted) tilted.style.rotate = ""; tilted = null; });
document.querySelectorAll(".settings .card").forEach((c, i) => c.style.setProperty("--i", i));

/* =====================================================================
   Sons : clics sur les boutons et interrupteurs
   ===================================================================== */
document.addEventListener("click", (e) => {
  const sw = e.target.closest(".switch");
  if (sw) return sfx.toggle(sw.checked);
  const b = e.target.closest("button, .opt, .acc-item");
  if (b && b.id !== "play" && !b.disabled) sfx.click();
}, true);

/* =====================================================================
   Démarrage
   ===================================================================== */
(async function init() {
  runSplash();
  buildMachine();
  requestAnimationFrame(tick);
  requestAnimationFrame(moveIndicator);
  state.info = await invoke("get_info");
  const s = state.info.settings;
  i18n.start(s.lang || "fr");
  $("theme").value = s.theme || "laiton";
  $("season").value = s.season || "auto";
  $("daytime").value = s.daytime || "auto";
  applyAmbiance();
  $("lang").value = s.lang === "en" ? "en" : "fr";
  $("volume").value = s.sound_volume ?? 60;
  renderVolume();
  $("music-on").checked = s.music_on !== false;
  $("music-volume").value = s.music_volume ?? 35;
  renderMusic();
  loadStats();
  setTimeout(() => sfx.startup(), 1050);
  if ($("music-on").checked) setTimeout(() => sfx.music(true), 2600);
  $("opt-java").checked = s.optimized_java !== false;
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
    if ($("upd-auto").checked) backgroundUpdate(u);
    else toast(`Une nouvelle version du launcher (v${u.version}) est disponible. Va dans Réglages pour l'installer.`, 8000, "Mise à jour");
  }
})();
