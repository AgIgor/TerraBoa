// Fogo no campo: começa na seca longa, espalha com o vento (que sopra para leste) e para em aceiros.
// Faz parte da simulação (usa g.rng e fica no save).
import { G, O, CROPS } from './config.js';
import { rainAt } from './climate.js';

const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const BURNABLE_OBJ = { [O.BUSH]: 0.9, [O.TREE]: 0.45, [O.FENCE]: 0.35, [O.GATE]: 0.35, [O.FEEDER]: 0.35, [O.PAIOL]: 0.4, [O.LAMP]: 0.2 };
const BURN_HOURS = { [O.TREE]: 4, [O.PAIOL]: 3 };
export const MAX_FIRES = 500;

// Quão fácil o tile pega fogo (0 = não queima: água, estrada, terra nua ou arada sem lavoura)
export function flammability(w, i) {
  const gr = w.ground[i], o = w.obj[i];
  if (gr === G.WATER || o === O.HOUSE || o === O.COOP || o === O.SILO || o === O.BRIDGE || o === O.TROUGH || o === O.SPRINKLER || o === O.ROCK) return 0;
  let f = BURNABLE_OBJ[o] || 0;
  const c = w.crops.get(i);
  if (c && !c.dead) f = Math.max(f, c.prog > 0.5 ? 0.6 : 0.25);
  else if (c && c.dead) f = Math.max(f, 0.7);
  if (gr === G.GRASS || gr === G.PASTURE) f = Math.max(f, Math.min(1, w.grass[i] * 1.5));
  if (gr === G.SAND) f = Math.max(f, w.grass[i] * 0.8);
  // terra úmida queima pouco
  return f * Math.max(0, 1 - w.moist[i] * 1.6);
}

export function ignite(g, i, heat = 1) {
  const w = g.world;
  if (w.fires.has(i) || w.fires.size >= MAX_FIRES || flammability(w, i) <= 0.05) return false;
  w.fires.set(i, { heat, age: 0 });
  return true;
}

// Uma vez por dia: chance de um fogo começar no campo em seca longa.
export function fireDay(g, today) {
  const w = g.world, c = g.climate, r = g.rng;
  if (today.rain > 0 || c.dryStreak < 10) return;
  const p = Math.min(0.14, (c.dryStreak - 9) * 0.015) * (1 + (today.wind || 0.3) * 0.5) * (today.tMax > 30 ? 1.3 : 1);
  if (!r.chance(p)) return;
  for (let tries = 0; tries < 60; tries++) {
    const x = r.int(2, w.w - 3), y = r.int(2, w.h - 3);
    if (Math.hypot(x - w.farm.cx, y - w.farm.cy) < 16) continue;
    const i = w.idx(x, y);
    if (flammability(w, i) < 0.4) continue;
    ignite(g, i);
    const dx = x - w.farm.cx, dy = y - w.farm.cy;
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'leste' : 'oeste') : (dy > 0 ? 'sul' : 'norte');
    g.notify(`Fumaça a ${dir}: começou um fogo no campo (${c.dryStreak} dias sem chuva). O vento leva para leste; terra arada e estrada seguram o fogo.`, 'bad');
    return;
  }
}

// Uma vez por hora: queima, espalha e apaga com a chuva.
export function fireHour(g, hour) {
  const w = g.world;
  if (!w.fires.size) return;
  const r = g.rng, today = g.climate.days[0];
  const rain = rainAt(today, hour);
  const wind = today.wind ?? 0.35;
  const born = [];
  let hitFarm = false, hitAnimal = false;
  for (const [i, f] of w.fires) {
    f.age++;
    if (rain > 0) f.heat -= 0.5 + rain * 0.1;
    if (w.moist[i] > 0.6) f.heat -= 0.4;
    const o = w.obj[i];
    // o que está no tile queima
    w.grass[i] = 0;
    const c = w.crops.get(i);
    if (c && !c.dead) { c.dead = true; c.health = 0; g.stats.lost++; hitFarm = true; }
    if (f.age >= (BURN_HOURS[o] || 1) && BURNABLE_OBJ[o]) {
      if (o === O.FENCE || o === O.GATE || o === O.FEEDER || o === O.PAIOL || o === O.LAMP) hitFarm = true;
      w.obj[i] = O.NONE; w.feeders.delete(i); w.dirty = true;
    }
    w.fert[i] = Math.min(1, w.fert[i] + 0.02); // cinza aduba
    w.ash.set(i, g.time);
    // espalha para os vizinhos; o vento empurra para leste (+x)
    if (f.heat > 0.3) {
      const x = i % w.w, y = (i / w.w) | 0;
      for (const [dx, dy] of N8) {
        const nx = x + dx, ny = y + dy;
        if (!w.inside(nx, ny)) continue;
        const j = w.idx(nx, ny);
        if (w.fires.has(j)) continue;
        const wf = Math.max(0.25, 1 + wind * 0.9 * dx);
        const p = 0.22 * flammability(w, j) * wf * f.heat * (dx && dy ? 0.7 : 1);
        if (r.chance(p)) born.push(j);
      }
    }
    if (f.age >= (BURN_HOURS[o] || 2) || f.heat <= 0) f.done = true;
  }
  for (const [i, f] of w.fires) if (f.done) w.fires.delete(i);
  for (const j of born) ignite(g, j, 0.9);
  // animais perto do fogo se machucam e fogem
  for (const a of g.animals) {
    const ai = w.idx(Math.floor(a.x), Math.floor(a.y));
    if (!w.fires.has(ai)) continue;
    a.health -= 0.25; a.fleeing = 0; a.seek = null; a.path = [];
    if (a.owned) hitAnimal = true;
    if (a.health <= 0 && a.owned) { a.dead = true; g.notify('Um animal morreu no fogo.', 'bad'); }
  }
  g.animals = g.animals.filter(a => !a.dead);
  if (w.dirty) w.recomputeComponents();
  if ((hitFarm || hitAnimal) && (!g.flags.fireWarn || g.time - g.flags.fireWarn > 240)) {
    g.flags.fireWarn = g.time;
    g.notify(hitAnimal ? 'O fogo chegou nos seus animais! Tire-os de lá ou apague com o regador.' : 'O fogo está queimando sua lavoura ou cercas! Apague com o regador ou faça aceiro com a enxada.', 'bad');
  }
  if (!w.fires.size && g.flags.fireOn) g.notify('O fogo apagou.', 'info');
  g.flags.fireOn = w.fires.size > 0;
}

// Apagar com o regador: tira o fogo do tile e molha em volta.
export function douse(g, x, y) {
  const w = g.world;
  let n = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!w.inside(x + dx, y + dy)) continue;
    const j = w.idx(x + dx, y + dy);
    if (w.fires.delete(j)) n++;
  }
  return n;
}
