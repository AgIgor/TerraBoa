// Efeitos visuais (só no navegador, não entram no save nem na simulação):
// vento com rajadas, partículas com gravidade e quique, respingos de chuva, folhas ao vento,
// sombras de nuvem, fumaça e tremor de objetos atingidos. Baseado nas técnicas do Mata Viva.
import { TILE } from './config.js';

const T = TILE;
const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);

export const fx = {
  time: 0,
  wind: 0.35,        // vento atual com rajada (≈ 0..2.5)
  windBase: 0.35,    // vento do dia, suavizado
  parts: [],         // partículas no mundo (px), com altura z
  smokes: [],
  splashes: [],      // em tela
  drops: [],         // chuva em tela, com profundidade
  leaves: [],        // folhas voando em tela
  clouds: [],        // sombras de nuvem no mundo
  shake: new Map(),  // idx do tile -> tempo de tremor
};

// ---------- vento ----------
export function updateWind(dayWind, dt) {
  fx.time += dt;
  fx.windBase += ((dayWind ?? 0.35) - fx.windBase) * (1 - Math.exp(-dt * 0.6));
  const t = fx.time;
  fx.wind = fx.windBase * (0.75 + 0.3 * Math.sin(t * 0.7) + 0.15 * Math.sin(t * 2.3 + 1));
}
// deslocamento da copa (px) e inclinação de plantas baixas, por fase
export const swayX = ph => Math.sin(fx.time * 1.7 + ph) * 1.6 * fx.wind + fx.wind * 1.4 + Math.sin(fx.time * 3.1 + ph * 2) * 0.6 * fx.wind;
export const skew = ph => -(Math.sin(fx.time * 2 + ph) * 0.05 + 0.03) * fx.wind;

// ---------- tremor ----------
export function shakeTile(i, s = 0.25) { fx.shake.set(i, Math.max(fx.shake.get(i) || 0, s)); }
export function shakeOffset(i) {
  const s = fx.shake.get(i);
  return s ? Math.sin(fx.time * 70) * 2.6 * (s / 0.25) : 0;
}

// ---------- partículas ----------
const KINDS = {
  madeira: { c: ['#c8945a', '#a87440', '#e0b47a'], s: [2, 3.2] },
  folha: { c: ['#4f9a3c', '#6cb848', '#3c7a30', '#86c25c'], s: [2.2, 3.4], slow: true },
  terra: { c: ['#7a5434', '#5e3f25', '#916643'], s: [1.8, 3] },
  pedra: { c: ['#8a8c88', '#a8aaa6', '#6a6c67'], s: [1.6, 2.6] },
  agua: { c: ['#8cc4ee', '#b8dcf6', '#5a9ad0'], s: [1.4, 2.2] },
  semente: { c: ['#e8d080', '#c8a860', '#f0e0a0'], s: [1.2, 1.8] },
  poeira: { c: ['rgba(200,180,140,0.6)', 'rgba(180,160,120,0.5)'], s: [2.5, 4], slow: true, dust: true },
  palha: { c: ['#e8cc78', '#d8b860', '#c8a848'], s: [1.8, 3], slow: true },
  ovo: { c: ['#f5efe0', '#e8d2b0'], s: [1.6, 2.2] },
  la: { c: ['#f6f2ea', '#e8e2d6'], s: [2.5, 3.6], slow: true },
};
// x, y em tiles; h = altura de saída em px
export function burst(x, y, kind, n = 8, h = 6, spread = 0.35, up = 40) {
  const k = KINDS[kind] || KINDS.terra;
  for (let j = 0; j < n && fx.parts.length < 700; j++) {
    fx.parts.push({
      x: (x + rnd(-spread, spread)) * T, y: (y + rnd(-spread * 0.5, spread * 0.5)) * T, z: h + rnd(0, 6),
      vx: rnd(-40, 40) + fx.wind * (k.slow ? 30 : 8), vy: rnd(-14, 14), vz: rnd(up * 0.4, up),
      life: k.dust ? rnd(0.4, 0.8) : rnd(0.7, 1.3), c: k.c[(Math.random() * k.c.length) | 0],
      s: rnd(k.s[0], k.s[1]), r: Math.random() * 3, slow: !!k.slow, dust: !!k.dust,
    });
  }
}
// copa inteira caindo em folhas
export function treeFall(x, y) {
  for (let j = 0; j < 40 && fx.parts.length < 700; j++) {
    fx.parts.push({
      x: (x + rnd(-0.8, 0.8)) * T, y: (y + rnd(-0.2, 0.3)) * T, z: rnd(20, 50),
      vx: rnd(-30, 30) + fx.wind * 30, vy: rnd(-10, 10), vz: rnd(0, 30),
      life: rnd(1.2, 2.2), c: KINDS.folha.c[(Math.random() * 4) | 0], s: rnd(2.2, 3.6), r: Math.random() * 3, slow: true,
    });
  }
  burst(x, y, 'madeira', 12, 8);
}
export function smoke(x, y) { if (fx.smokes.length < 60) fx.smokes.push({ x: x * T, y: y * T, r: 3, life: 2.4, max: 2.4 }); }

// ---------- atualização ----------
export function updateFx(dt, view) {
  for (const [i, s] of fx.shake) { const n = s - dt; if (n <= 0) fx.shake.delete(i); else fx.shake.set(i, n); }
  for (const p of fx.parts) {
    p.vz -= (p.slow ? 90 : 380) * dt; p.z += p.vz * dt;
    if (p.z < 0) { p.z = 0; p.vz *= -0.3; p.vx *= 0.5; p.vy *= 0.5; }
    if (p.slow) p.vx += (fx.wind * 25 - p.vx) * dt * 0.8;
    p.x += p.vx * dt; p.y += p.vy * dt; p.r += dt * 6; p.life -= dt;
  }
  fx.parts = fx.parts.filter(p => p.life > 0);
  for (const s of fx.smokes) { s.life -= dt; s.y -= 16 * dt; s.x += fx.wind * 22 * dt; s.r += 5 * dt; }
  fx.smokes = fx.smokes.filter(s => s.life > 0);
  for (const s of fx.splashes) s.l += dt;
  fx.splashes = fx.splashes.filter(s => s.l < 0.28);
  // sombras de nuvem passeando sobre o mapa
  if (view) {
    while (fx.clouds.length < 7) fx.clouds.push({ x: view.cx + rnd(-900, 900), y: view.cy + rnd(-700, 700), r: rnd(160, 320) });
    for (const c of fx.clouds) {
      c.x += (12 + fx.wind * 28) * dt; c.y += 4 * dt;
      if (c.x - view.cx > 1100 || Math.abs(c.y - view.cy) > 900) { c.x = view.cx - 1100; c.y = view.cy + rnd(-800, 800); }
    }
  }
}

// ---------- desenho no mundo (px, já com a câmera aplicada) ----------
export function drawCloudShadows(ctx, cloudiness) {
  if (cloudiness < 0.05) return;
  for (const c of fx.clouds) {
    const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.r);
    g.addColorStop(0, `rgba(10,22,28,${(0.2 * cloudiness).toFixed(3)})`);
    g.addColorStop(1, 'rgba(10,22,28,0)');
    ctx.fillStyle = g; ctx.fillRect(c.x - c.r, c.y - c.r, c.r * 2, c.r * 2);
  }
}
export function drawParts(ctx) {
  for (const p of fx.parts) {
    ctx.globalAlpha = Math.min(1, p.life * 2.2) * (p.dust ? 0.8 : 1);
    ctx.fillStyle = p.c;
    if (p.dust) { ctx.beginPath(); ctx.arc(p.x, p.y - p.z, p.s * (1.6 - p.life), 0, TAU); ctx.fill(); continue; }
    ctx.save(); ctx.translate(p.x, p.y - p.z); ctx.rotate(p.r);
    ctx.fillRect(-p.s / 2, -p.s / 3, p.s, p.s * 0.66);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}
export function drawSmoke(ctx) {
  for (const s of fx.smokes) {
    ctx.fillStyle = `rgba(210,210,215,${(0.35 * s.life / s.max).toFixed(3)})`;
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
  }
}

// ---------- chuva e vento em tela ----------
function newDrop(vw, vh, any) {
  return { x: Math.random() * (vw + 120) - 60 - fx.wind * 60, y: any ? Math.random() * vh : -20 - Math.random() * 80, z: 0.45 + Math.random() * 0.55, g: vh * (0.12 + Math.random() * 0.92) };
}
export function drawRain(ctx, vw, vh, intensity, dt) {
  const want = Math.round(Math.min(1, intensity) * 420);
  while (fx.drops.length < want) fx.drops.push(newDrop(vw, vh, true));
  if (fx.drops.length > want) fx.drops.length = want;
  if (fx.drops.length) {
    ctx.strokeStyle = 'rgba(196,214,236,0.5)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (const d of fx.drops) {
      d.x += fx.wind * 260 * d.z * dt; d.y += 760 * d.z * dt;
      if (d.y > d.g) { if (fx.splashes.length < 140) fx.splashes.push({ x: d.x, y: d.y, l: 0 }); Object.assign(d, newDrop(vw, vh, false)); }
      if (d.x > vw + 60) d.x -= vw + 120;
      const len = 9 * d.z + 4;
      ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - fx.wind * 6 * d.z, d.y - len);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(196,218,232,0.45)';
  for (const s of fx.splashes) {
    const q = s.l / 0.28;
    ctx.globalAlpha = 1 - q;
    ctx.beginPath(); ctx.ellipse(s.x, s.y, 2 + q * 6, 1 + q * 2.4, 0, 0, TAU); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
export function drawLeaves(ctx, vw, vh, dt, season) {
  const want = fx.windBase > 1.0 ? Math.round((fx.windBase - 1.0) * 30) : 0;
  const cols = season === 2 || season === 3 ? ['#c9a24a', '#8a6a3a', '#b8802e', '#7aa04a'] : ['#5e9a40', '#7aa04a', '#4f8a38', '#c9a24a'];
  while (fx.leaves.length < want) fx.leaves.push({ x: -20 - Math.random() * vw * 0.3, y: Math.random() * vh, r: Math.random() * 6, c: cols[(Math.random() * cols.length) | 0], s: 0.6 + Math.random() * 0.8 });
  if (fx.leaves.length > want) fx.leaves.length = want;
  for (const l of fx.leaves) {
    l.x += fx.wind * 220 * l.s * dt; l.y += Math.sin(fx.time * 3 + l.r * 5) * 30 * dt; l.r += dt * 6;
    if (l.x > vw + 30) { l.x = -20; l.y = Math.random() * vh; }
    ctx.save(); ctx.translate(l.x, l.y); ctx.rotate(l.r); ctx.fillStyle = l.c; ctx.fillRect(-3, -1.5, 6, 3); ctx.restore();
  }
}
