// Sons gerados na hora com Web Audio (sem arquivos): ferramentas, bichos, ambiente e interface.
// Mesma ideia do Mata Viva: osciladores e ruído filtrado com envelopes curtos.
import { ANIMALS } from './config.js';
import { rainAt } from './climate.js';

const KEY = 'terraboa-som';
let AC = null, master = null, noise = null;
const opt = (() => { try { return { on: true, vol: 0.6, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { on: true, vol: 0.6 }; } })();
const saveOpt = () => { try { localStorage.setItem(KEY, JSON.stringify(opt)); } catch { /* sem storage */ } };

export const soundOn = () => opt.on;
export const soundVol = () => opt.vol;
export function setSound(on, vol = opt.vol) {
  opt.on = !!on; opt.vol = Math.max(0, Math.min(1, vol)); saveOpt();
  if (master) master.gain.value = opt.on ? opt.vol : 0;
  if (!opt.on) stopLoops();
}

// O navegador só deixa tocar depois de um toque/tecla do jogador
export function unlock() {
  if (!opt.on) return null;
  if (!AC) {
    try {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      master = AC.createGain(); master.gain.value = opt.vol; master.connect(AC.destination);
      noise = AC.createBuffer(1, AC.sampleRate * 1.0, AC.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch { AC = null; }
  }
  if (AC && AC.state === 'suspended') AC.resume();
  return AC;
}
const ac = () => (opt.on && AC && AC.state === 'running' ? AC : null);

function tone(type, f0, f1, gain, dur, delay = 0, dest = master) {
  const a = ac(); if (!a) return;
  const t0 = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(dest); o.start(t0); o.stop(t0 + dur + 0.03);
}
function hiss(type, freq, q, gain, dur, delay = 0, sweep = null, dest = master) {
  const a = ac(); if (!a) return;
  const t0 = a.currentTime + delay, s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = noise; f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
  if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f).connect(g).connect(dest); s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.05);
}
// voz com vibrato (bichos)
function voice(type, f0, f1, gain, dur, delay = 0, vib = 0, vibHz = 6, lp = 1800) {
  const a = ac(); if (!a) return;
  const t0 = a.currentTime + delay, o = a.createOscillator(), g = a.createGain(), f = a.createBiquadFilter();
  o.type = type; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  if (vib) { const l = a.createOscillator(), lg = a.createGain(); l.frequency.value = vibHz; lg.gain.value = vib; l.connect(lg).connect(o.frequency); l.start(t0); l.stop(t0 + dur + 0.05); }
  f.type = 'lowpass'; f.frequency.value = lp;
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(0.08, dur * 0.25)); g.gain.setValueAtTime(gain, t0 + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(f).connect(g).connect(master); o.start(t0); o.stop(t0 + dur + 0.05);
}

// ---------- efeitos ----------
export function sfx(kind, v = 1) {
  if (!ac()) return;
  switch (kind) {
    case 'enxada': hiss('lowpass', 700, 0.7, 0.35 * v, 0.14); tone('sine', 120, 60, 0.25 * v, 0.1); break;
    case 'machado': hiss('bandpass', 560, 2, 0.5 * v, 0.14); tone('sine', 160, 70, 0.3 * v, 0.12); break;
    case 'arvore': hiss('lowpass', 900, 0.5, 0.4, 0.9, 0, 120); tone('sine', 90, 40, 0.35, 0.7, 0.15); break;
    case 'pedra': hiss('bandpass', 2300, 2, 0.35 * v, 0.09); tone('triangle', 900, 840, 0.08 * v, 0.16); break;
    case 'mato': hiss('bandpass', 1500, 0.8, 0.18 * v, 0.25); break;
    case 'agua': hiss('bandpass', 2600, 1.2, 0.12, 0.45, 0, 1400); hiss('bandpass', 1800, 1.5, 0.08, 0.35, 0.1, 900); break;
    case 'encher': for (let k = 0; k < 4; k++) tone('sine', 300 + k * 90, 700 + k * 120, 0.08, 0.12, k * 0.09); break;
    case 'plantar': hiss('bandpass', 1700, 0.7, 0.18, 0.1); tone('triangle', 520, 480, 0.04, 0.08, 0.04); break;
    case 'construir': tone('sine', 190, 90, 0.3, 0.1); hiss('bandpass', 800, 2, 0.25, 0.06); tone('sine', 210, 100, 0.26, 0.1, 0.14); hiss('bandpass', 850, 2, 0.22, 0.06, 0.14); break;
    case 'desmontar': tone('triangle', 280, 150, 0.14, 0.18); hiss('bandpass', 600, 1.5, 0.2, 0.15, 0.05); break;
    case 'laco': hiss('highpass', 1200, 0.6, 0.12, 0.35, 0, 3200); break;
    case 'pegou': tone('sine', 660, 700, 0.08, 0.18); tone('sine', 990, 1000, 0.07, 0.24, 0.08); break;
    case 'colher': tone('triangle', 520, 560, 0.08, 0.1); tone('triangle', 780, 820, 0.07, 0.14, 0.08); hiss('bandpass', 1900, 1, 0.08, 0.12); break;
    case 'ovos': tone('sine', 900, 1300, 0.08, 0.06); tone('sine', 1100, 1500, 0.06, 0.06, 0.07); break;
    case 'leite': for (let k = 0; k < 3; k++) hiss('bandpass', 3200, 4, 0.1, 0.07, k * 0.13, 2200); break;
    case 'tosquia': for (let k = 0; k < 3; k++) { hiss('highpass', 4500, 1, 0.1, 0.04, k * 0.12); tone('triangle', 2400, 2200, 0.03, 0.04, k * 0.12); } break;
    case 'adubo': hiss('lowpass', 1200, 0.6, 0.22, 0.3, 0, 400); break;
    case 'moeda': tone('triangle', 1320, 1320, 0.08, 0.12); tone('triangle', 1760, 1760, 0.08, 0.3, 0.08); tone('sine', 2640, 2640, 0.03, 0.3, 0.08); break;
    case 'compra': tone('triangle', 880, 860, 0.07, 0.1); tone('triangle', 660, 640, 0.07, 0.16, 0.08); break;
    case 'erro': tone('square', 180, 150, 0.04, 0.12); tone('square', 140, 120, 0.04, 0.16, 0.1); break;
    case 'clique': tone('triangle', 2200, 1800, 0.03, 0.04); break;
    case 'aviso': tone('sine', 520, 520, 0.06, 0.16); tone('sine', 390, 390, 0.06, 0.24, 0.14); break;
    case 'bom': tone('sine', 660, 660, 0.05, 0.12); tone('sine', 880, 880, 0.05, 0.2, 0.1); break;
    case 'passo': hiss('lowpass', 500 + Math.random() * 300, 0.7, 0.05 * v, 0.06); break;
    case 'trote': tone('triangle', 260 + Math.random() * 40, 180, 0.07, 0.05); hiss('bandpass', 900, 3, 0.06, 0.04); break;
    case 'trovao': {
      const a = ac(), t0 = a.currentTime + 0.3 + Math.random() * 1.2, s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
      s.buffer = noise; s.loop = true; f.type = 'lowpass'; f.frequency.value = 170;
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.9, t0 + 0.1); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.6);
      s.connect(f).connect(g).connect(master); s.start(t0); s.stop(t0 + 2.7);
      tone('sine', 70, 38, 0.3, 1.4, 0.3);
      break;
    }
    case 'fogo': for (let k = 0; k < 4; k++) hiss('bandpass', 900 + Math.random() * 2400, 3, 0.06 * v, 0.05, Math.random() * 0.4); break;
    case 'galo': voice('sawtooth', 600, 700, 0.05, 0.18, 0, 30, 18, 2400); voice('sawtooth', 820, 900, 0.05, 0.25, 0.2, 40, 20, 2600); voice('sawtooth', 900, 560, 0.05, 0.6, 0.47, 30, 18, 2600); break;
  }
}

// Vozes dos bichos (v = volume pela distância)
export function animalCall(sp, adult = true, v = 1) {
  if (!ac() || v <= 0.02) return;
  const k = adult ? 1 : 1.6; // filhote: mais agudo
  switch (sp) {
    case 'gado': voice('sawtooth', 150 * k, 115 * k, 0.07 * v, 1.1, 0, 4, 5, 700); break;
    case 'bufalo': voice('sawtooth', 105 * k, 80 * k, 0.08 * v, 1.2, 0, 3, 4, 520); break;
    case 'porco': for (let i = 0; i < 2 + (Math.random() * 2 | 0); i++) voice('square', 190 * k, 140 * k, 0.04 * v, 0.12, i * 0.16, 25, 30, 900); break;
    case 'galinha': for (let i = 0; i < 3; i++) voice('triangle', 700 * k, 900 * k, 0.04 * v, 0.07, i * 0.11, 0, 6, 3000); voice('triangle', 800 * k, 1100 * k, 0.04 * v, 0.18, 0.35, 0, 6, 3000); break;
    case 'cavalo': voice('sawtooth', 700, 380, 0.05 * v, 0.9, 0, 60, 22, 2200); break;
    case 'ovelha': voice('sawtooth', 320 * k, 300 * k, 0.05 * v, 0.7, 0, 22, 7, 1600); break;
    case 'cabra': voice('sawtooth', 420 * k, 390 * k, 0.05 * v, 0.55, 0, 35, 9, 1900); break;
    case 'pato': for (let i = 0; i < 2 + (Math.random() * 2 | 0); i++) voice('square', 520 * k, 430 * k, 0.035 * v, 0.13, i * 0.17, 0, 6, 1400); break;
    case 'peru': for (let i = 0; i < 6; i++) voice('square', 560 + (i % 2) * 140, 520, 0.03 * v, 0.06, i * 0.06, 0, 6, 1800); break;
    case 'lhama': voice('sine', 260 * k, 300 * k, 0.05 * v, 0.6, 0, 8, 4, 900); break;
    case 'coelho': break; // coelho é quieto
  }
}

// ---------- laços contínuos: chuva, vento, trator ----------
const loops = {};
function loop(name, setup) {
  if (loops[name]) return loops[name];
  const a = ac(); if (!a) return null;
  loops[name] = setup(a);
  return loops[name];
}
function noiseLoop(a, type, freq, q) {
  const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = noise; s.loop = true; f.type = type; f.frequency.value = freq; f.Q.value = q; g.gain.value = 0;
  s.connect(f).connect(g).connect(master); s.start();
  return { g, f, s };
}
function stopLoops() { for (const k in loops) { try { loops[k].s.stop(); loops[k].o2?.stop(); } catch { /* */ } delete loops[k]; } }
function setLevel(l, v, t = 0.4) { if (l) l.g.gain.setTargetAtTime(v, AC.currentTime, t); }

// ---------- ambiente (chamado a cada quadro) ----------
const amb = { bird: 2, cri: 1, frog: 2, cic: 6, call: 3, rooster: 0, fire: 1, step: 0 };
export function ambient(g, dt, fx, opts = {}) {
  const a = ac(); if (!a) return;
  for (const k in amb) amb[k] -= dt;
  const p = g.player, w = g.world, today = g.climate.days[0];
  const hour = (g.time % 1440) / 60, night = hour < 5.5 || hour > 19;
  const rain = rainAt(today, hour);
  // chuva e vento contínuos
  const r = loop('chuva', a2 => noiseLoop(a2, 'lowpass', 2800, 0.3));
  setLevel(r, rain > 0 ? Math.min(0.22, 0.05 + rain * 0.025) : 0, 1.2);
  const wl = loop('vento', a2 => noiseLoop(a2, 'bandpass', 420, 0.6));
  if (wl) { setLevel(wl, Math.min(0.12, Math.max(0, (fx.wind || 0) - 0.35) * 0.08), 1.5); wl.f.frequency.setTargetAtTime(320 + (fx.wind || 0) * 220, a.currentTime, 1); }
  // motor do trator
  const tr = loop('trator', a2 => {
    const o = a2.createOscillator(), f = a2.createBiquadFilter(), gg = a2.createGain();
    o.type = 'sawtooth'; o.frequency.value = 48; f.type = 'lowpass'; f.frequency.value = 260; gg.gain.value = 0;
    o.connect(f).connect(gg).connect(master); o.start();
    return { g: gg, f, s: o, o };
  });
  const onTractor = p.mount?.kind === 'trator';
  setLevel(tr, onTractor ? (p.moving ? 0.16 : 0.09) : 0, 0.3);
  if (tr && onTractor) tr.o.frequency.setTargetAtTime(p.moving ? 62 : 46, a.currentTime, 0.3);
  if (opts.paused) return;

  // passarinhos de dia (menos na chuva)
  if (amb.bird <= 0) {
    amb.bird = 2 + Math.random() * 5;
    if (!night && rain < 0.5) {
      const r0 = Math.random(), v = 0.016 + Math.random() * 0.018;
      if (r0 < 0.4) { const n = 2 + (Math.random() * 3 | 0), f = 2400 + Math.random() * 1200; for (let k = 0; k < n; k++) tone('sine', f, f * 1.25, v, 0.07, k * 0.1); }
      else if (r0 < 0.7) { tone('sine', 1900, 2150, v, 0.12); tone('sine', 2500, 2300, v, 0.1, 0.18); tone('sine', 1700, 1500, v, 0.22, 0.34); }
      else if (r0 < 0.85) { tone('sine', 1300, 1250, v, 0.16); tone('sine', 1500, 1100, v, 0.3, 0.2); } // bem-te-vi de longe
      else { tone('triangle', 3200, 1800, v * 0.8, 0.25); tone('triangle', 3000, 1700, v * 0.8, 0.25, 0.3); }
    }
  }
  // cigarras no verão, à tarde
  if (amb.cic <= 0) {
    amb.cic = 8 + Math.random() * 10;
    if (today.season === 1 && hour > 10 && hour < 17 && rain <= 0) {
      const t0 = a.currentTime, s = a.createBufferSource(), f = a.createBiquadFilter(), gg = a.createGain();
      s.buffer = noise; s.loop = true; f.type = 'bandpass'; f.frequency.value = 5200 + Math.random() * 900; f.Q.value = 9;
      gg.gain.setValueAtTime(0.0001, t0); gg.gain.exponentialRampToValueAtTime(0.04, t0 + 1.4); gg.gain.setValueAtTime(0.04, t0 + 2.6); gg.gain.exponentialRampToValueAtTime(0.0001, t0 + 3);
      s.connect(f).connect(gg).connect(master); s.start(t0); s.stop(t0 + 3.05);
    }
  }
  // grilos à noite
  if (amb.cri <= 0) {
    amb.cri = 0.5 + Math.random() * 0.8;
    if (night && rain < 0.3) { const f = 4100 + Math.random() * 500; for (let k = 0; k < 3; k++) tone('sine', f, f, 0.007, 0.03, k * 0.06); }
  }
  // sapos perto da água, à noite ou na chuva
  if (amb.frog <= 0) {
    amb.frog = 1 + Math.random() * 2.5;
    if ((night || rain > 0) && w.nearWater(Math.floor(p.x), Math.floor(p.y), 8)) { const f = 170 + Math.random() * 120; for (let k = 0; k < 2 + (Math.random() * 3 | 0); k++) tone('square', f, f * 0.8, 0.012, 0.07, k * 0.11); }
  }
  // galo cantando de madrugada
  if (amb.rooster <= 0) {
    amb.rooster = 25 + Math.random() * 30;
    if (hour > 4.8 && hour < 6.8 && g.animals.some(b => b.sp === 'galinha' && b.sex === 'm' && b.weight > 1.2 && Math.hypot(b.x - p.x, b.y - p.y) < 22)) sfx('galo');
  }
  // um bicho perto chama de vez em quando
  if (amb.call <= 0) {
    amb.call = 3 + Math.random() * 6;
    const near = g.animals.filter(b => !b.ridden && Math.hypot(b.x - p.x, b.y - p.y) < 12);
    if (near.length && !(night && Math.random() < 0.7)) {
      const b = near[(Math.random() * near.length) | 0], d = Math.hypot(b.x - p.x, b.y - p.y);
      animalCall(b.sp, b.weight >= ANIMALS[b.sp].adultW * 0.6, Math.max(0, 1 - d / 12));
    }
  }
  // fogo crepitando perto
  if (amb.fire <= 0) {
    amb.fire = 0.25 + Math.random() * 0.3;
    let best = 99;
    for (const i of w.fires.keys()) { const d = Math.hypot(i % w.w + 0.5 - p.x, ((i / w.w) | 0) + 0.5 - p.y); if (d < best) best = d; }
    if (best < 14) sfx('fogo', 1 - best / 14);
  }
}

// passos: chamado quando o jogador anda
export function footstep(g) {
  const p = g.player;
  if (p.mount?.kind === 'cavalo') sfx('trote');
  else if (!p.mount) sfx('passo', p.sneak ? 0.4 : 1);
}

// depuração: estado do áudio e laços ativos
export const audioDebug = () => ({ state: AC?.state || 'sem áudio', loops: Object.keys(loops) });
