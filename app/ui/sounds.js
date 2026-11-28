/* Audio du launcher, entièrement synthétisé (aucun fichier) :
   - effets doux (bois, harpe, cloches) avec réverbération ;
   - musique d'ambiance générative, médiévale et zen (bourdon, accords lents, harpe, cloches, vent). */
const sfx = (() => {
  let ctx = null, sfxBus, musicBus, reverb;
  let sfxVol = 0.6, musicVol = 0.35, musicWanted = false, music = null;
  const AC = window.AudioContext || window.webkitAudioContext;

  // Gamme de ré dorien (couleur médiévale)
  const NOTE = { D2: 73.42, A2: 110, C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196, A3: 220, B3: 246.94,
    C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392, A4: 440, B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25,
    F5: 698.46, G5: 783.99, A5: 880, C6: 1046.5, D6: 1174.66, E6: 1318.51 };

  function impulse(seconds, decay) {
    const len = ctx.sampleRate * seconds, buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  function ensure() {
    if (!AC) return null;
    if (!ctx) {
      ctx = new AC();
      reverb = ctx.createConvolver();
      reverb.buffer = impulse(3.4, 2.6);
      const wet = ctx.createGain(); wet.gain.value = 0.8;
      reverb.connect(wet).connect(ctx.destination);
      sfxBus = ctx.createGain(); sfxBus.gain.value = sfxVol * 0.5; sfxBus.connect(ctx.destination);
      const sfxSend = ctx.createGain(); sfxSend.gain.value = 0.35; sfxBus.connect(sfxSend).connect(reverb);
      musicBus = ctx.createGain(); musicBus.gain.value = 0; musicBus.connect(ctx.destination);
      const musicSend = ctx.createGain(); musicSend.gain.value = 0.6; musicBus.connect(musicSend).connect(reverb);
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  }

  // ----- Instruments -----
  const pluckCache = {};
  /** Corde pincée (algorithme de Karplus-Strong) : sonne comme une harpe ou un luth. */
  function pluckBuffer(freq, bright) {
    const key = freq.toFixed(2) + (bright ? "b" : "");
    if (pluckCache[key]) return pluckCache[key];
    const sr = ctx.sampleRate, len = Math.floor(sr * 2.4), N = Math.max(2, Math.round(sr / freq));
    const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
    let prev = 0;
    for (let i = 0; i < N; i++) { const r = Math.random() * 2 - 1; prev = bright ? r : (r + prev) / 2; d[i] = prev; }
    const damp = bright ? 0.4985 : 0.4975;
    for (let i = N; i < len; i++) d[i] = (d[i - N] + d[i - N + 1 < i ? i - N + 1 : i - N]) * damp;
    return (pluckCache[key] = buf);
  }
  function pluck(freq, t, gain = 0.3, dest = sfxBus, bright = false) {
    const src = ctx.createBufferSource(); src.buffer = pluckBuffer(freq, bright);
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = bright ? 5200 : 3200;
    const g = ctx.createGain(); g.gain.value = gain;
    src.connect(lp).connect(g).connect(dest);
    src.start(t); src.stop(t + 2.4);
  }
  function bell(freq, t, gain = 0.12, dest = sfxBus, dur = 3) {
    for (const [ratio, amp] of [[1, 1], [2.76, 0.35], [5.4, 0.12], [8.93, 0.05]]) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.value = freq * ratio;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain * amp, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur / ratio ** 0.5);
      o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.1);
    }
  }
  /** « Tok » de bois doux. */
  function woodTok(t, pitch = 1, gain = 1) {
    for (const [f, a, dur] of [[340 * pitch, 0.42, 0.07], [1020 * pitch, 0.08, 0.025]]) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(f * 1.15, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.012);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(a * gain, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(sfxBus); o.start(t); o.stop(t + dur + 0.02);
    }
  }

  const run = (fn) => { if (sfxVol <= 0 || !ensure()) return; try { fn(ctx.currentTime + 0.01); } catch (_) {} };
  const vary = () => 0.96 + Math.random() * 0.08;

  // ----- Musique d'ambiance -----
  const MELODY = ["D4", "E4", "F4", "G4", "A4", "C5", "D5", "E5", "F5", "A5"].map((n) => NOTE[n]);
  const CHORDS = [["D3", "F3", "A3"], ["C3", "E3", "G3"], ["D3", "F3", "A3"], ["A2", "C3", "E3"], ["G3", "B3", "D4"], ["D3", "A3", "D4"]];

  function startMusic() {
    if (music || !ensure()) return;
    const t0 = ctx.currentTime;
    const m = { nodes: [], timer: null, next: t0 + 1.5, nextChord: t0 + 0.2, nextBell: t0 + 9, chord: 0, idx: 4 };
    // Bourdon (ré + la graves), qui « respire » lentement
    for (const [f, type, amp] of [[NOTE.D2, "triangle", 0.09], [NOTE.A2, "sine", 0.05], [NOTE.D3 * 1.003, "sine", 0.025]]) {
      const o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
      o.type = type; o.frequency.value = f; g.gain.value = amp;
      lfo.frequency.value = 0.05 + Math.random() * 0.05; lg.gain.value = amp * 0.5;
      lfo.connect(lg).connect(g.gain);
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 500;
      o.connect(lp).connect(g).connect(musicBus);
      o.start(); lfo.start();
      m.nodes.push(o, lfo);
    }
    // Vent léger
    const len = ctx.sampleRate * 4, nb = ctx.createBuffer(1, len, ctx.sampleRate), nd = nb.getChannelData(0);
    for (let i = 0; i < len; i++) nd[i] = Math.random() * 2 - 1;
    const wind = ctx.createBufferSource(); wind.buffer = nb; wind.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 420; bp.Q.value = 0.6;
    const wg = ctx.createGain(); wg.gain.value = 0.018;
    const wl = ctx.createOscillator(), wlg = ctx.createGain(); wl.frequency.value = 0.07; wlg.gain.value = 0.012;
    const wf = ctx.createOscillator(), wfg = ctx.createGain(); wf.frequency.value = 0.05; wfg.gain.value = 180;
    wl.connect(wlg).connect(wg.gain); wf.connect(wfg).connect(bp.frequency);
    wind.connect(bp).connect(wg).connect(musicBus);
    wind.start(); wl.start(); wf.start();
    m.nodes.push(wind, wl, wf);

    const schedule = () => {
      const now = ctx.currentTime, ahead = now + 1.2;
      // Accords lents (nappe douce)
      while (m.nextChord < ahead) {
        const names = CHORDS[m.chord % CHORDS.length];
        for (const n of names) for (const det of [-4, 4]) {
          const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
          o.type = "triangle"; o.frequency.value = NOTE[n]; o.detune.value = det;
          lp.type = "lowpass"; lp.frequency.value = 650;
          const s = m.nextChord, e = s + 13;
          g.gain.setValueAtTime(0.0001, s);
          g.gain.linearRampToValueAtTime(0.022, s + 3.5);
          g.gain.setValueAtTime(0.022, e - 4);
          g.gain.linearRampToValueAtTime(0.0001, e);
          o.connect(lp).connect(g).connect(musicBus); o.start(s); o.stop(e + 0.1);
        }
        m.chord++;
        m.nextChord += 10;
      }
      // Harpe : promenade dans la gamme, parfois un petit arpège
      while (m.next < ahead) {
        if (Math.random() < 0.72) {
          if (Math.random() < 0.18) {
            const names = CHORDS[(m.chord + CHORDS.length - 1) % CHORDS.length];
            names.forEach((n, i) => pluck(NOTE[n] * 2, m.next + i * 0.16, 0.16, musicBus));
            m.next += 0.6;
          } else {
            m.idx = Math.max(0, Math.min(MELODY.length - 1, m.idx + [-2, -1, -1, 1, 1, 2, 0][Math.floor(Math.random() * 7)]));
            pluck(MELODY[m.idx], m.next, 0.12 + Math.random() * 0.1, musicBus);
          }
        }
        m.next += [0.55, 0.8, 0.8, 1.1, 1.6, 2.4][Math.floor(Math.random() * 6)];
      }
      // Cloche lointaine de temps en temps
      if (m.nextBell < ahead) {
        bell([NOTE.D5, NOTE.A4, NOTE.F5, NOTE.E5][Math.floor(Math.random() * 4)], m.nextBell, 0.035, musicBus, 5);
        m.nextBell += 16 + Math.random() * 18;
      }
    };
    schedule();
    m.timer = setInterval(schedule, 400);
    musicBus.gain.cancelScheduledValues(t0);
    musicBus.gain.setValueAtTime(musicBus.gain.value, t0);
    musicBus.gain.linearRampToValueAtTime(musicVol * 0.45, t0 + 5);
    music = m;
  }

  function stopMusic() {
    if (!music || !ctx) return;
    const m = music; music = null;
    clearInterval(m.timer);
    const t = ctx.currentTime;
    musicBus.gain.cancelScheduledValues(t);
    musicBus.gain.setValueAtTime(musicBus.gain.value, t);
    musicBus.gain.linearRampToValueAtTime(0, t + 2.5);
    setTimeout(() => m.nodes.forEach((n) => { try { n.stop(); } catch (_) {} }), 2700);
  }

  // Si le navigateur bloque le son au démarrage, on le lance au premier clic.
  function unlockLater(fn) {
    const go = () => { window.removeEventListener("pointerdown", go, true); window.removeEventListener("keydown", go, true); ensure(); fn(); };
    window.addEventListener("pointerdown", go, true);
    window.addEventListener("keydown", go, true);
  }

  return {
    setVolume(v) { sfxVol = Math.max(0, Math.min(1, v)); if (sfxBus) sfxBus.gain.value = sfxVol * 0.5; },
    setMusicVolume(v) {
      musicVol = Math.max(0, Math.min(1, v));
      if (music && ctx) { musicBus.gain.cancelScheduledValues(ctx.currentTime); musicBus.gain.setTargetAtTime(musicVol * 0.45, ctx.currentTime, 0.3); }
      if (musicVol <= 0) stopMusic(); else if (musicWanted && !music) startMusic();
    },
    music(on) {
      musicWanted = !!on;
      if (!on || musicVol <= 0) return stopMusic();
      if (!ensure()) return;
      if (ctx.state === "running") startMusic(); else { ctx.resume().then(() => ctx.state === "running" && startMusic()).catch(() => {}); unlockLater(() => musicWanted && startMusic()); }
    },
    /** Petit son d'ouverture : accord de harpe + cloche. */
    startup() {
      if (sfxVol <= 0 || !ensure()) return;
      const go = () => run((t) => {
        [NOTE.D3, NOTE.A3, NOTE.D4, NOTE.F4, NOTE.A4, NOTE.E5].forEach((f, i) => pluck(f, t + i * 0.13, 0.22 - i * 0.015));
        bell(NOTE.A5, t + 0.85, 0.07, sfxBus, 4);
      });
      if (ctx.state === "running") go(); else { ctx.resume().then(() => ctx.state === "running" && go()).catch(() => {}); }
    },
    click: () => run((t) => woodTok(t, vary(), 0.9)),
    toggle: (on) => run((t) => pluck(on ? NOTE.A5 : NOTE.E5, t, 0.16, sfxBus, true)),
    /** Lancement du jeu : glissando de harpe qui monte. */
    ratchet: () => run((t) => {
      [NOTE.D4, NOTE.F4, NOTE.A4, NOTE.C5, NOTE.D5, NOTE.F5, NOTE.A5].forEach((f, i) => pluck(f, t + i * 0.075, 0.2, sfxBus, true));
      bell(NOTE.D6, t + 0.6, 0.06, sfxBus, 3);
    }),
    chime: () => run((t) => { bell(NOTE.E6, t, 0.08); bell(NOTE.A5, t + 0.14, 0.07); }),
    error: () => run((t) => { pluck(NOTE.F3, t, 0.22); pluck(NOTE.E3, t + 0.16, 0.22); }),
    /** Rendu hors ligne (tests) */
    _note: NOTE,
  };
})();
