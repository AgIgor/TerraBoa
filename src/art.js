// Sprites gerados com Canvas 2D e guardados em cache.
import { TILE, G } from './config.js';
import { RNG } from './rng.js';

const cache = new Map();
function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
function cached(key, w, h, draw) {
  let c = cache.get(key);
  if (!c) { c = canvas(w, h); draw(c.getContext('2d'), new RNG(hashStr(key))); cache.set(key, c); }
  return c;
}
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export const tileHash = (x, y) => ((x * 73856093) ^ (y * 19349663)) >>> 0;

const T = TILE;

// ---------- chão ----------
const GRASS_COL = [['#6fae4b', '#5f9c3e', '#86c25c'], ['#4f9a3c', '#438a33', '#64ae4c'], ['#8ea44c', '#7d9440', '#a3b85e'], ['#a8a160', '#968e52', '#bdb474']];
const PASTURE_COL = [['#4fa83a', '#3e9530', '#6cc04f'], ['#3f9c34', '#33882b', '#58b446'], ['#6a9e3c', '#5a8c33', '#80b04e'], ['#909a4e', '#7e8842', '#a6ae62']];

export function groundSprite(type, v, season, frame = 0) {
  return cached(`g${type}-${v}-${type === G.GRASS || type === G.PASTURE ? season : 0}-${type === G.WATER ? frame : 0}`, T, T, (c, r) => {
    switch (type) {
      case G.GRASS: {
        const [a, b, l] = GRASS_COL[season];
        c.fillStyle = a; c.fillRect(0, 0, T, T);
        for (let k = 0; k < 26; k++) {
          c.fillStyle = r.chance(0.5) ? b : l;
          const x = r.int(0, T - 2), y = r.int(0, T - 3);
          c.fillRect(x, y, 1, r.int(2, 4));
        }
        if (r.chance(0.25)) { c.fillStyle = r.pick(['#f4e36a', '#ffffff', '#e8a0d0']); c.fillRect(r.int(3, 28), r.int(3, 28), 2, 2); }
        break;
      }
      case G.PASTURE: {
        const [a, b, l] = PASTURE_COL[season];
        c.fillStyle = a; c.fillRect(0, 0, T, T);
        for (let y = 2; y < T; y += 6) for (let x = (y % 12 ? 1 : 4); x < T; x += 7) {
          c.fillStyle = b; c.fillRect(x, y, 5, 4);
          c.fillStyle = l; c.fillRect(x + 1, y - 1, 1, 3); c.fillRect(x + 3, y - 2, 1, 3);
        }
        break;
      }
      case G.WATER: {
        c.fillStyle = '#3b7db3'; c.fillRect(0, 0, T, T);
        c.fillStyle = '#346fa2';
        for (let k = 0; k < 6; k++) c.fillRect(r.int(0, 28), r.int(0, 30), r.int(3, 8), 1);
        c.fillStyle = 'rgba(255,255,255,0.35)';
        for (let k = 0; k < 3; k++) {
          const x = (r.int(0, 26) + frame * 3) % 28, y = r.int(2, 29);
          c.fillRect(x, y, 4, 1);
        }
        break;
      }
      case G.SAND: {
        c.fillStyle = '#d9c78f'; c.fillRect(0, 0, T, T);
        for (let k = 0; k < 20; k++) { c.fillStyle = r.chance(0.5) ? '#c9b47a' : '#e8d9a6'; c.fillRect(r.int(0, 31), r.int(0, 31), 1, 1); }
        break;
      }
      case G.DIRT: {
        c.fillStyle = '#8d6b47'; c.fillRect(0, 0, T, T);
        for (let k = 0; k < 18; k++) { c.fillStyle = r.chance(0.5) ? '#7b5c3b' : '#a07e57'; c.fillRect(r.int(0, 30), r.int(0, 30), r.int(1, 3), 1); }
        break;
      }
      case G.TILLED: {
        c.fillStyle = '#7a5434'; c.fillRect(0, 0, T, T);
        for (let y = 0; y < T; y += 8) {
          c.fillStyle = '#5e3f25'; c.fillRect(0, y + 5, T, 3);
          c.fillStyle = '#916643'; c.fillRect(0, y + 1, T, 2);
        }
        for (let k = 0; k < 10; k++) { c.fillStyle = '#6a4a2e'; c.fillRect(r.int(0, 30), r.int(0, 30), 2, 1); }
        break;
      }
      case G.PATH: {
        c.fillStyle = '#b0915e'; c.fillRect(0, 0, T, T);
        for (let k = 0; k < 14; k++) { c.fillStyle = r.chance(0.5) ? '#9c7f50' : '#c2a473'; c.fillRect(r.int(0, 30), r.int(0, 30), r.int(1, 3), 1); }
        c.fillStyle = '#9a7c4d'; c.fillRect(0, 9, T, 2); c.fillRect(0, 22, T, 2);
        break;
      }
      case G.YARD: {
        c.fillStyle = '#b89a6a'; c.fillRect(0, 0, T, T);
        for (let k = 0; k < 14; k++) { c.fillStyle = r.chance(0.5) ? '#a88a5c' : '#c8ab7c'; c.fillRect(r.int(0, 30), r.int(0, 30), 2, 1); }
        break;
      }
    }
  });
}

export function wetTilled() {
  return cached('wet', T, T, c => {
    c.fillStyle = '#4a311c'; c.fillRect(0, 0, T, T);
    for (let y = 0; y < T; y += 8) { c.fillStyle = '#3a2614'; c.fillRect(0, y + 5, T, 3); c.fillStyle = '#5c3e24'; c.fillRect(0, y + 1, T, 2); }
  });
}

// ---------- vegetação e pedras ----------
// tipo de árvore pelo hash: 0 comum, 1 ipê-amarelo, 2 ipê-roxo, 3 pequizeiro
export function treeSprite(kind, season, bloom) {
  return cached(`tree${kind}-${season}-${bloom ? 1 : 0}`, 56, 72, (c, r) => {
    c.fillStyle = 'rgba(0,0,0,0.22)';
    c.beginPath(); c.ellipse(28, 66, 18, 6, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#6b4a2c'; c.fillRect(25, 38, 7, 28);
    c.fillStyle = '#58391f'; c.fillRect(25, 38, 2, 28);
    let cols;
    if (bloom && kind === 1) cols = ['#d9a51c', '#f2c534', '#ffe066'];
    else if (bloom && kind === 2) cols = ['#a0457e', '#c25b9c', '#e08ac0'];
    else if (season === 3) cols = ['#4d7a35', '#5d8a3e', '#76a04f'];
    else if (season === 2) cols = ['#3f7a30', '#4f8a38', '#6a9e45'];
    else cols = ['#2f6e2a', '#3c8434', '#56a046'];
    if (kind === 3 && !bloom) cols = cols.map(x => x); // pequizeiro: copa mais aberta
    const blobs = [[28, 30, 18], [16, 34, 12], [40, 34, 12], [22, 20, 12], [36, 20, 12], [28, 14, 10]];
    for (let L = 0; L < 3; L++) {
      c.fillStyle = cols[L];
      for (const [x, y, rr] of blobs) {
        c.beginPath(); c.arc(x - L * 1.5 + r.range(-1, 1), y - L * 2.5, rr - L * 3.5, 0, Math.PI * 2); c.fill();
      }
    }
    if (bloom) { c.fillStyle = kind === 1 ? '#fff3a0' : '#f6c0e0'; for (let k = 0; k < 18; k++) c.fillRect(r.int(10, 46), r.int(6, 44), 2, 2); }
  });
}

export function bushSprite(season, v) {
  return cached(`bush-${season}-${v}`, T, T, (c, r) => {
    c.fillStyle = 'rgba(0,0,0,0.2)'; c.beginPath(); c.ellipse(16, 27, 12, 4, 0, 0, Math.PI * 2); c.fill();
    const cols = season === 3 ? ['#6a7a3a', '#7d8e48'] : ['#3d7a2f', '#56963f'];
    for (let L = 0; L < 2; L++) {
      c.fillStyle = cols[L];
      for (let k = 0; k < 5; k++) { c.beginPath(); c.arc(r.int(9, 23), r.int(13, 22) - L * 2, r.int(5, 8) - L * 2, 0, Math.PI * 2); c.fill(); }
    }
    if (v % 3 === 0 && season !== 3) { c.fillStyle = '#d23a3a'; for (let k = 0; k < 4; k++) c.fillRect(r.int(8, 23), r.int(10, 22), 2, 2); }
  });
}

export function rockSprite(v) {
  return cached(`rock-${v}`, T, T, (c, r) => {
    c.fillStyle = 'rgba(0,0,0,0.2)'; c.beginPath(); c.ellipse(16, 26, 12, 4, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#7d7f7a'; c.beginPath(); c.ellipse(16, 20, 11, 8, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#9a9c96'; c.beginPath(); c.ellipse(14, 17, 7, 5, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#6a6c67'; c.fillRect(r.int(10, 20), 22, 5, 1);
  });
}

// ---------- lavouras ----------
const H = 56; // altura do sprite de lavoura (cresce para cima do tile)
export function cropSprite(type, stage, wilt) {
  return cached(`crop-${type}-${stage}-${wilt ? 1 : 0}`, T, H, (c, r) => {
    const base = H - 4; // linha do chão
    if (stage < 0) { drawDead(c, r, base, type); return; }
    const plants = type === 'cafe' ? [[16, 0]] : type === 'pimenta' ? [[9, -6], [23, 4]] : [[6, -8], [16, 0], [26, -8], [11, 8], [22, 8]].slice(0, type === 'soja' ? 5 : 3);
    for (const [px, dy] of plants) {
      const y0 = base - 6 + dy;
      ({ milho: drawMilho, soja: drawSoja, cana: drawCana, cafe: drawCafe, pimenta: drawPimenta })[type](c, r, px, y0, stage);
    }
    if (wilt) {
      c.globalCompositeOperation = 'source-atop';
      c.fillStyle = 'rgba(176,140,60,0.55)'; c.fillRect(0, 0, T, H);
      c.globalCompositeOperation = 'source-over';
    }
  });
}
function leaf(c, x, y, len, ang, col, w = 2) {
  c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round';
  c.beginPath(); c.moveTo(x, y);
  c.quadraticCurveTo(x + Math.cos(ang) * len * 0.6, y + Math.sin(ang) * len * 0.6 - 2, x + Math.cos(ang) * len, y + Math.sin(ang) * len);
  c.stroke();
}
function drawMilho(c, r, x, y, s) {
  const h = [5, 14, 26, 36, 36][s];
  const stalk = s === 4 ? '#b8a64a' : '#5d9c38', lf = s === 4 ? '#c9b25a' : '#6fb544';
  c.strokeStyle = stalk; c.lineWidth = 2; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - h); c.stroke();
  for (let k = 1; k <= Math.min(4, s + 1); k++) { const yy = y - h * k / 5; leaf(c, x, yy, 6 + s, k % 2 ? -0.5 : Math.PI + 0.5, lf); }
  if (s >= 3) { c.fillStyle = '#e8d68a'; c.fillRect(x - 1, y - h - 4, 2, 5); }
  if (s === 4) { c.fillStyle = '#f2c43a'; c.fillRect(x + 1, y - h * 0.55, 3, 6); c.fillStyle = '#9fae5a'; c.fillRect(x + 1, y - h * 0.55 - 1, 3, 2); }
}
function drawSoja(c, r, x, y, s) {
  const rr = [2, 4, 5.5, 6.5, 6.5][s];
  const col = s === 4 ? ['#b8913e', '#d4ab52'] : s === 3 ? ['#5f9a34', '#86b94c'] : ['#3f8c30', '#5daa42'];
  c.fillStyle = col[0]; c.beginPath(); c.arc(x, y - rr, rr, 0, Math.PI * 2); c.fill();
  c.fillStyle = col[1]; c.beginPath(); c.arc(x - 1, y - rr - 1, rr * 0.6, 0, Math.PI * 2); c.fill();
  if (s === 4) { c.fillStyle = '#8a6a2e'; for (let k = 0; k < 3; k++) c.fillRect(x - 3 + k * 2, y - rr * 1.3 + k, 1, 3); }
}
function drawCana(c, r, x, y, s) {
  const h = [6, 18, 32, 44, 46][s];
  for (const dx of [-2, 1, 3]) {
    c.strokeStyle = s >= 3 ? '#8aa53e' : '#5fa83c'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(x + dx, y); c.lineTo(x + dx * 1.5, y - h); c.stroke();
    if (s >= 2) { c.fillStyle = '#7a8a3a'; for (let k = 6; k < h; k += 7) c.fillRect(x + dx * (1 + k / h * 0.5) - 1, y - k, 3, 1); }
  }
  for (let k = 0; k < s + 1; k++) leaf(c, x, y - h * (0.4 + k * 0.15), 8 + s * 2, k % 2 ? -0.9 : Math.PI + 0.9, '#6cb848', 1.5);
  if (s === 4) { c.fillStyle = '#e6dcc0'; c.fillRect(x - 1, y - h - 6, 3, 7); }
}
function drawCafe(c, r, x, y, s) {
  const rr = [3, 6, 9, 11, 11][s];
  c.fillStyle = '#5a3b22'; c.fillRect(x - 1, y - 4, 2, 4);
  c.fillStyle = '#1f5a2a'; c.beginPath(); c.ellipse(x, y - rr - 2, rr, rr * 1.15, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#2f7a38'; c.beginPath(); c.ellipse(x - 2, y - rr - 4, rr * 0.65, rr * 0.75, 0, 0, Math.PI * 2); c.fill();
  if (s === 3) { c.fillStyle = '#ffffff'; for (let k = 0; k < 6; k++) c.fillRect(x + r.int(-rr + 2, rr - 3), y - r.int(4, rr * 2), 2, 2); }
  if (s === 4) { for (let k = 0; k < 12; k++) { c.fillStyle = r.chance(0.75) ? '#c8242a' : '#e8a02a'; c.fillRect(x + r.int(-rr + 2, rr - 3), y - r.int(4, rr * 2), 2, 2); } }
}
function drawPimenta(c, r, x, y, s) {
  const rr = [2.5, 4.5, 6, 7, 7][s];
  c.fillStyle = '#3d8a34'; c.beginPath(); c.arc(x, y - rr - 1, rr, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#58a845'; c.beginPath(); c.arc(x - 1, y - rr - 2, rr * 0.55, 0, Math.PI * 2); c.fill();
  if (s >= 3) for (let k = 0; k < (s === 4 ? 7 : 3); k++) { c.fillStyle = s === 4 ? '#e2231a' : '#7fc040'; c.fillRect(x + r.int(-rr, rr - 1), y - r.int(2, rr * 2), 1, 3); }
}
function drawDead(c, r, base, type) {
  c.strokeStyle = '#8a6a3a'; c.lineWidth = 2;
  for (const x of [8, 16, 24]) { c.beginPath(); c.moveTo(x, base - 4); c.lineTo(x + r.int(-3, 3), base - r.int(8, 14)); c.stroke(); }
}

// ---------- construções ----------
export function houseSprite() {
  return cached('house', 3 * T + 8, 2 * T + 48, c => {
    const W = 3 * T, ox = 4, top = 48;
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(ox + 4, top + 2 * T - 6, W, 8);
    // paredes
    c.fillStyle = '#efe6d2'; c.fillRect(ox, top + 6, W, 2 * T - 8);
    c.fillStyle = '#d8ccb0'; c.fillRect(ox, top + 2 * T - 10, W, 8);
    // telhado de telha
    c.fillStyle = '#a8442e';
    c.beginPath(); c.moveTo(ox - 4, top + 12); c.lineTo(ox + W / 2, top - 30); c.lineTo(ox + W + 4, top + 12); c.closePath(); c.fill();
    c.fillStyle = '#c4573a';
    for (let y = top - 22; y < top + 12; y += 6) {
      const k = (y - (top - 30)) / 42;
      c.fillRect(ox + W / 2 - (W / 2 + 4) * k, y, (W + 8) * k, 2);
    }
    c.fillStyle = '#7a2e1f'; c.fillRect(ox - 4, top + 10, W + 8, 3);
    // porta e janelas
    c.fillStyle = '#6b4325'; c.fillRect(ox + W / 2 - 7, top + 2 * T - 30, 14, 22);
    c.fillStyle = '#e0b04a'; c.fillRect(ox + W / 2 + 3, top + 2 * T - 20, 2, 2);
    for (const wx of [ox + 12, ox + W - 30]) {
      c.fillStyle = '#5b86b0'; c.fillRect(wx, top + 22, 18, 16);
      c.fillStyle = '#2f5a86'; c.fillRect(wx + 8, top + 22, 2, 16);
      c.fillStyle = '#3e6b2a'; c.fillRect(wx - 2, top + 38, 22, 4);
    }
    // chaminé
    c.fillStyle = '#8a8070'; c.fillRect(ox + W - 26, top - 20, 8, 18);
  });
}
export function coopSprite() {
  return cached('coop', 3 * T + 8, 2 * T + 52, c => {
    const W = 3 * T, ox = 4, top = 52;
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(ox + 4, top + 2 * T - 6, W, 8);
    c.fillStyle = '#9a5a32'; c.fillRect(ox, top, W, 2 * T - 2);
    c.fillStyle = '#86492a'; for (let x = ox; x < ox + W; x += 6) c.fillRect(x, top, 2, 2 * T - 2);
    c.fillStyle = '#3f7a4a';
    c.beginPath(); c.moveTo(ox - 5, top + 4); c.lineTo(ox + 14, top - 26); c.lineTo(ox + W - 14, top - 26); c.lineTo(ox + W + 5, top + 4); c.closePath(); c.fill();
    c.fillStyle = '#346a3e'; for (let x = ox; x < ox + W; x += 8) c.fillRect(x, top - 20, 2, 22);
    // portão grande
    c.fillStyle = '#5e3518'; c.fillRect(ox + W / 2 - 16, top + 22, 32, 2 * T - 24);
    c.strokeStyle = '#d8c090'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(ox + W / 2 - 16, top + 22); c.lineTo(ox + W / 2 + 16, top + 2 * T - 2); c.moveTo(ox + W / 2 + 16, top + 22); c.lineTo(ox + W / 2 - 16, top + 2 * T - 2); c.stroke();
    // placa
    c.fillStyle = '#f2e6c4'; c.fillRect(ox + 10, top + 4, W - 20, 13);
    c.fillStyle = '#2c4a2c'; c.font = 'bold 9px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('COOPERATIVA', ox + W / 2, top + 11);
    // silo
    c.fillStyle = '#c8ccd0'; c.fillRect(ox + W - 14, top - 40, 16, 2 * T + 36);
    c.fillStyle = '#a8acb0'; for (let y = top - 36; y < top + 2 * T - 4; y += 8) c.fillRect(ox + W - 14, y, 16, 1);
    c.fillStyle = '#b0b4b8'; c.beginPath(); c.arc(ox + W - 6, top - 40, 8, Math.PI, 0); c.fill();
  });
}
