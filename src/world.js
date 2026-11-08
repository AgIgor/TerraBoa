// Mapa: chão, objetos, umidade, capim e fertilidade por tile.
import { MAP_W, MAP_H, G, O, BLOCK_ANIMAL, BLOCK_PLAYER, GRASS_CAP } from './config.js';
import { RNG, makeNoise } from './rng.js';

const FULL = [[0, 1, 0, 1]];
// [x0, x1, y0, y1] dentro do tile
const SHAPES = {
  [O.TREE]: [[0.32, 0.68, 0.58, 0.95]],      // só o tronco
  [O.ROCK]: [[0.16, 0.84, 0.42, 0.86]],
  [O.TROUGH]: [[0.06, 0.94, 0.4, 0.82]],
  [O.FEEDER]: [[0.06, 0.94, 0.4, 0.88]],
  [O.SPRINKLER]: [[0.4, 0.6, 0.55, 0.9]],
  [O.PAIOL]: [[0.04, 0.96, 0.3, 0.9]],
  [O.SILO]: [[0.06, 0.94, 0.2, 0.95]],
  [O.HOUSE]: FULL,
  [O.COOP]: FULL,
};

export class World {
  constructor(w = MAP_W, h = MAP_H) {
    this.w = w; this.h = h;
    const n = w * h;
    this.ground = new Uint8Array(n);
    this.obj = new Uint8Array(n);
    this.hp = new Uint8Array(n);       // vida de árvores e pedras
    this.moist = new Float32Array(n);  // umidade do solo 0..1
    this.grass = new Float32Array(n);  // capim disponível 0..1
    this.fert = new Float32Array(n);   // fertilidade 0..1
    this.idle = new Uint8Array(n);     // dias sem uso (terra arada parada, pasto rapado)
    this.comp = new Int32Array(n);     // áreas fechadas para os animais
    this.compOpen = new Set();
    this.crops = new Map();      // idx -> lavoura
    this.troughs = new Map();    // idx -> { water }
    this.feeders = new Map();    // idx -> { food }
    this.sprinklers = new Set();
    this.buildings = [];         // { kind, x, y, w, h }
    this.drops = [];             // ovos no chão { x, y, n, day }
    this.dirty = true;
  }

  idx(x, y) { return y * this.w + x; }
  inside(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }

  walkableAnimal(i) { return (this.ground[i] !== G.WATER || this.obj[i] === O.BRIDGE) && !BLOCK_ANIMAL.has(this.obj[i]); }
  walkablePlayer(x, y) {
    if (!this.inside(x, y)) return false;
    const i = this.idx(x, y);
    return (this.ground[i] !== G.WATER || this.obj[i] === O.BRIDGE) && !BLOCK_PLAYER.has(this.obj[i]);
  }
  // Colisão fina do jogador: cada objeto bloqueia só a parte desenhada (pé/base),
  // em coordenadas locais do tile (0..1). Casas e água bloqueiam o tile todo.
  solidRects(x, y) {
    if (!this.inside(x, y)) return FULL;
    const i = this.idx(x, y);
    const o = this.obj[i];
    if (o === O.BRIDGE) return null;
    if (this.ground[i] === G.WATER) return FULL;
    if (o === O.FENCE) {
      const r = [[0.4, 0.6, 0.6, 0.86]]; // poste
      const fl = (nx, ny) => this.inside(nx, ny) && (this.obj[this.idx(nx, ny)] === O.FENCE || this.obj[this.idx(nx, ny)] === O.GATE);
      if (fl(x + 1, y)) r.push([0.5, 1, 0.62, 0.82]);
      if (fl(x - 1, y)) r.push([0, 0.5, 0.62, 0.82]);
      if (fl(x, y - 1)) r.push([0.42, 0.58, 0, 0.7]);
      if (fl(x, y + 1)) r.push([0.42, 0.58, 0.6, 1]);
      return r;
    }
    return SHAPES[o] || null;
  }
  playerFree(px, py, rx = 0.2, top = 0.1, bot = 0.06) {
    const x0 = px - rx, x1 = px + rx, y0 = py - top, y1 = py + bot;
    for (let ty = Math.floor(y0); ty <= Math.floor(y1); ty++) for (let tx = Math.floor(x0); tx <= Math.floor(x1); tx++) {
      const rects = this.solidRects(tx, ty);
      if (!rects) continue;
      for (const [a, b, c, d] of rects)
        if (x1 > tx + a && x0 < tx + b && y1 > ty + c && y0 < ty + d) return false;
    }
    return true;
  }
  inBush(px, py) {
    const x = Math.floor(px), y = Math.floor(py);
    return this.inside(x, y) && this.obj[this.idx(x, y)] === O.BUSH;
  }
  nearWater(x, y, r = 1) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const nx = x + dx, ny = y + dy;
      if (this.inside(nx, ny) && this.ground[this.idx(nx, ny)] === G.WATER) return true;
    }
    return false;
  }

  // Rotula as regiões onde um animal consegue andar. Região que encosta na borda = aberta.
  recomputeComponents() {
    const { w, h, comp } = this;
    comp.fill(-1);
    this.compOpen = new Set();
    this.compSize = [];
    let id = 0;
    const stack = [];
    const tryPush = j => { if (comp[j] === -1 && this.walkableAnimal(j)) { comp[j] = id; stack.push(j); } };
    for (let s = 0; s < w * h; s++) {
      if (comp[s] !== -1 || !this.walkableAnimal(s)) continue;
      let open = false, size = 0;
      comp[s] = id; stack.push(s);
      while (stack.length) {
        const i = stack.pop(); size++;
        const x = i % w, y = (i / w) | 0;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) open = true;
        if (x > 0) tryPush(i - 1);
        if (x < w - 1) tryPush(i + 1);
        if (y > 0) tryPush(i - w);
        if (y < h - 1) tryPush(i + w);
      }
      if (open) this.compOpen.add(id);
      this.compSize[id] = size;
      id++;
    }
    this.dirty = false;
  }
}

// Gera o mundo natural: campos, mata, lagoas, um rio, a sede e a cooperativa.
export function generateWorld(seed) {
  const w = new World();
  const rng = new RNG(seed ^ 0x9e3779b9);
  const elev = makeNoise(seed + 11), forest = makeNoise(seed + 23), soil = makeNoise(seed + 37), lush = makeNoise(seed + 51);
  const { w: W, h: H } = w;

  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = w.idx(x, y);
    const e = elev(x / 26, y / 26);
    w.ground[i] = e < 0.27 ? G.WATER : G.GRASS;
    w.fert[i] = 0.5 + 0.45 * soil(x / 18, y / 18);
    w.moist[i] = 0.45 + rng.range(0, 0.1);
    w.grass[i] = GRASS_CAP.wild * (0.45 + 0.55 * lush(x / 9, y / 9));
  }

  // Rio serpenteando de cima para baixo
  let rx = rng.int(W * 0.15, W * 0.3);
  for (let y = 0; y < H; y++) {
    rx += rng.int(-1, 1);
    rx = Math.max(3, Math.min(W - 4, rx));
    const width = 2 + (rng.chance(0.3) ? 1 : 0);
    for (let k = 0; k < width; k++) w.ground[w.idx(rx + k, y)] = G.WATER;
  }

  // Areia na beira da água
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = w.idx(x, y);
    if (w.ground[i] === G.GRASS && w.nearWater(x, y, 1) && rng.chance(0.75)) w.ground[i] = G.SAND;
  }

  // Sede da fazenda perto do centro, numa área seca
  let cx = Math.floor(W * 0.55), cy = Math.floor(H * 0.5);
  for (let tries = 0; tries < 200; tries++) {
    let ok = true;
    for (let dy = -7; dy <= 7 && ok; dy++) for (let dx = -8; dx <= 14 && ok; dx++)
      if (!w.inside(cx + dx, cy + dy) || w.ground[w.idx(cx + dx, cy + dy)] === G.WATER) ok = false;
    if (ok) break;
    cx = rng.int(W * 0.35, W * 0.7); cy = rng.int(H * 0.3, H * 0.7);
  }
  w.farm = { cx, cy };

  // Vegetação nativa
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = w.idx(x, y);
    if (w.ground[i] !== G.GRASS) continue;
    if (Math.abs(x - cx) <= 8 && Math.abs(y - cy) <= 6) continue;
    const f = forest(x / 15, y / 15);
    if (f > 0.6 && rng.chance(0.55)) setObj(w, i, O.TREE, 3);
    else if (f > 0.5 && rng.chance(0.25)) setObj(w, i, O.BUSH, 1);
    else if (rng.chance(0.012)) setObj(w, i, O.TREE, 3);
    else if (rng.chance(0.03)) setObj(w, i, O.BUSH, 1);
    else if (rng.chance(0.01)) setObj(w, i, O.ROCK, 3);
  }

  // Casa (3x2) e terreiro
  for (let dy = -2; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
    const i = w.idx(cx + dx, cy + dy);
    w.ground[i] = G.YARD; w.obj[i] = O.NONE; w.grass[i] = 0;
  }
  placeBuilding(w, 'house', cx - 1, cy - 2, 3, 2, O.HOUSE);

  // Estrada de terra até a borda leste, com a cooperativa no caminho
  const roadY = cy + 2;
  for (let x = cx + 3; x < W; x++) {
    for (const yy of [roadY, roadY + 1]) {
      const i = w.idx(x, yy);
      if (w.ground[i] === G.WATER) continue; // ponte simples: a estrada não atravessa lagoas
      w.ground[i] = G.PATH; w.obj[i] = O.NONE; w.grass[i] = 0;
    }
  }
  const coopX = cx + 9;
  for (let dy = -3; dy <= -1; dy++) for (let dx = -1; dx <= 3; dx++) {
    const i = w.idx(coopX + dx, roadY + dy);
    if (w.ground[i] === G.WATER) w.ground[i] = G.GRASS;
    w.obj[i] = O.NONE;
    w.ground[i] = G.YARD; w.grass[i] = 0;
  }
  placeBuilding(w, 'coop', coopX, roadY - 2, 3, 2, O.COOP);

  w.spawn = { x: cx + 0.5, y: cy + 1.5 };
  w.recomputeComponents();
  return w;
}

function setObj(w, i, o, hp) { w.obj[i] = o; w.hp[i] = hp; }

function placeBuilding(w, kind, x, y, bw, bh, o) {
  for (let dy = 0; dy < bh; dy++) for (let dx = 0; dx < bw; dx++) w.obj[w.idx(x + dx, y + dy)] = o;
  w.buildings.push({ kind, x, y, w: bw, h: bh });
}

// ---- salvar / carregar ----
const ARRAYS = ['ground', 'obj', 'hp', 'idle'];
const FLOATS = ['moist', 'grass', 'fert'];

export function worldToJSON(w) {
  const o = { w: w.w, h: w.h, farm: w.farm, spawn: w.spawn, buildings: w.buildings, drops: w.drops };
  for (const k of ARRAYS) o[k] = Array.from(w[k]);
  for (const k of FLOATS) o[k] = Array.from(w[k], v => Math.round(v * 1000));
  o.crops = [...w.crops];
  o.troughs = [...w.troughs];
  o.feeders = [...w.feeders];
  o.sprinklers = [...w.sprinklers];
  return o;
}

export function worldFromJSON(o) {
  const w = new World(o.w, o.h);
  for (const k of ARRAYS) w[k].set(o[k]);
  for (const k of FLOATS) w[k].set(o[k].map(v => v / 1000));
  w.farm = o.farm; w.spawn = o.spawn; w.buildings = o.buildings; w.drops = o.drops || [];
  w.crops = new Map(o.crops);
  w.troughs = new Map(o.troughs);
  w.feeders = new Map(o.feeders);
  w.sprinklers = new Set(o.sprinklers);
  w.recomputeComponents();
  return w;
}
