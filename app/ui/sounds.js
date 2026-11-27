/* Sons d'interface façon Create, synthétisés (aucun fichier) : clics mécaniques, cliquetis d'engrenage, carillon. */
const sfx = (() => {
  let ctx = null, master = null, volume = 0.6;
  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = volume * 0.5;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }
  function noiseBuffer() {
    if (noiseBuffer.buf) return noiseBuffer.buf;
    const len = ctx.sampleRate * 0.25, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return (noiseBuffer.buf = buf);
  }
  /** Petit « tic » métallique : bruit filtré + note courte. */
  function tick(at, pitch = 1, level = 1) {
    const t = at || ctx.currentTime;
    const n = ctx.createBufferSource();
    n.buffer = noiseBuffer();
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = 2600 * pitch; bp.Q.value = 5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5 * level, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
    n.connect(bp).connect(g).connect(master);
    n.start(t); n.stop(t + 0.05);
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(1500 * pitch, t);
    o.frequency.exponentialRampToValueAtTime(700 * pitch, t + 0.04);
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.18 * level, t + 0.003);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(og).connect(master);
    o.start(t); o.stop(t + 0.06);
  }
  function tone(freq, start, dur, type = "sine", level = 0.25) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(level, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(master);
    o.start(start); o.stop(start + dur + 0.02);
  }
  const play = (fn) => { if (volume <= 0 || !ensure()) return; try { fn(ctx.currentTime); } catch (_) {} };
  return {
    setVolume(v) { volume = Math.max(0, Math.min(1, v)); if (master) master.gain.value = volume * 0.5; },
    click: () => play((t) => tick(t, 1, 0.8)),
    toggle: (on) => play((t) => { tick(t, on ? 1.25 : 0.85, 0.8); tick(t + 0.045, on ? 1.5 : 0.7, 0.45); }),
    /** Cliquetis d'engrenage qui accélère (lancement du jeu). */
    ratchet: () => play((t) => { let at = t; for (let i = 0; i < 12; i++) { tick(at, 0.8 + i * 0.03, 0.55 + i * 0.03); at += Math.max(0.03, 0.12 - i * 0.009); } }),
    chime: () => play((t) => { tone(659.25, t, 0.5, "triangle", 0.16); tone(987.77, t + 0.11, 0.7, "triangle", 0.14); tone(1318.5, t + 0.22, 0.9, "sine", 0.07); }),
    error: () => play((t) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.setValueAtTime(170, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.22);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.connect(g).connect(master); o.start(t); o.stop(t + 0.32);
      tick(t, 0.5, 0.6);
    }),
  };
})();
