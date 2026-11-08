// Simulação da terra: umidade, lavouras, capim, regeneração natural. Sem DOM.
import { G, O, CROPS, GRASS_CAP, GRASS_RATE, TROUGH_MAX, YEAR_DAYS } from './config.js';
import { tempAt, rainAt, climateNextDay, EVENT_TEXT, ENSO } from './climate.js';
import { marketDay } from './market.js';
import { animalsHour, animalsDay } from './animals.js';

// Fator de temperatura 0..1 (trapézio)
export function fTemp(T, d) {
  if (T <= d.tMin || T >= d.tMax) return 0;
  if (T < d.tOpt[0]) return (T - d.tMin) / (d.tOpt[0] - d.tMin);
  if (T > d.tOpt[1]) return (d.tMax - T) / (d.tMax - d.tOpt[1]);
  return 1;
}
// Fator de água 0..1
export function fWater(m, d) {
  if (m >= d.water) return m > 0.97 ? 0.8 : 1;
  return Math.max(0, (m - d.wilt * 0.6) / (d.water - d.wilt * 0.6));
}
const CAPIM = { tMin: 8, tOpt: [22, 34], tMax: 42, water: 0.32, wilt: 0.08 };

export function cropStage(c) {
  if (c.dead) return -1;
  if (c.ripe) return 4;
  return c.prog < 0.15 ? 0 : c.prog < 0.4 ? 1 : c.prog < 0.7 ? 2 : 3;
}

export function hourly(g, hour) {
  const w = g.world, today = g.climate.days[0];
  const T = tempAt(today, hour);
  const rain = rainAt(today, hour);
  const day = hour >= 6 && hour < 18;
  const sun = rain > 0 ? 0.15 : 1 - today.cloud * 0.6;
  const et0 = (0.0025 + 0.00045 * Math.max(0, T - 8)) * (day ? sun : 0.3);
  const n = w.w * w.h;

  for (let i = 0; i < n; i++) {
    const gr = w.ground[i];
    if (gr === G.WATER) continue;
    let m = w.moist[i];
    if (rain) m += rain * 0.026 * (w.obj[i] === O.TREE ? 0.7 : 1);
    let k = 1;
    if (gr === G.TILLED) k = 1.25;
    else if (gr === G.PATH || gr === G.YARD) k = 1.4;
    else if (w.obj[i] === O.TREE) k = 0.55;
    if (w.crops.has(i)) k += 0.3;
    m -= et0 * k;
    if (gr === G.SAND) m = Math.max(m, 0.55);
    w.moist[i] = m < 0 ? 0 : m > 1 ? 1 : m;

    // capim
    const cap = gr === G.PASTURE ? GRASS_CAP.pasture : gr === G.GRASS ? GRASS_CAP.wild : gr === G.SAND ? 0.25 : 0;
    if (cap > 0 && w.obj[i] !== O.TREE) {
      const rate = (gr === G.PASTURE ? GRASS_RATE.pasture : GRASS_RATE.wild) * fTemp(T, CAPIM) * fWater(w.moist[i], CAPIM) * (0.6 + 0.4 * w.fert[i]);
      let gv = w.grass[i] + rate * (0.25 + (cap - w.grass[i]));
      if (w.moist[i] < 0.06 && gv > 0.15) gv -= 0.0015; // seca: pasto amarela
      w.grass[i] = Math.max(0, Math.min(cap, gv));
    } else if (gr !== G.PASTURE && gr !== G.GRASS && gr !== G.SAND) w.grass[i] = 0;
  }

  // chuva enche bebedouros
  if (rain) for (const t of w.troughs.values()) t.water = Math.min(TROUGH_MAX, t.water + rain * 0.08);

  // aspersores ligam às 6h e às 17h
  if (hour === 6 || hour === 17) for (const i of w.sprinklers) {
    const x = i % w.w, y = (i / w.w) | 0;
    if (!w.nearWater(x, y, 8)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const nx = x + dx, ny = y + dy;
      if (!w.inside(nx, ny)) continue;
      const j = w.idx(nx, ny);
      w.moist[j] = Math.max(w.moist[j], 0.7);
    }
  }

  // lavouras
  for (const [i, c] of w.crops) {
    if (c.dead) continue;
    const d = CROPS[c.type];
    const m = w.moist[i];
    if (c.ripe) {
      c.ripeH = (c.ripeH || 0) + 1;
      if (c.ripeH > 96 && !d.perennial) c.health -= 0.008; // passou do ponto
      if (c.ripeH > 120 && d.perennial) c.health -= 0.004;
    } else {
      const ft = fTemp(T, d), fw = fWater(m, d);
      c.prog += (ft * fw) / (d.days * 24);
      if (c.prog >= 1) { c.prog = 1; c.ripe = true; c.ripeH = 0; }
    }
    if (m < d.wilt) { c.health -= d.drought / 24; c.dry = (c.dry || 0) + 1; }
    else c.dry = 0;
    if (T > d.tMax) c.health -= 0.012;
    if (m >= d.wilt && T < d.tMax && T > d.tMin) c.health = Math.min(1, c.health + 0.002);
    if (c.health <= 0) {
      c.dead = true; c.health = 0;
      g.stats.lost++;
      if (!g.flags.deadWarn || g.time - g.flags.deadWarn > 600) {
        g.flags.deadWarn = g.time;
        g.notify(`${d.name} morreu${m < d.wilt ? ' de seca' : ''}.`, 'bad');
      }
    }
  }

  // geada na madrugada
  if (hour === 5 && today.frost) frostHits(g, today);

  animalsHour(g, hour);
}

function frostHits(g, today) {
  const w = g.world, r = g.rng;
  const severity = Math.min(1.6, (3.5 - today.tMin) / 3.5 + 0.35);
  let hit = 0;
  for (const [i, c] of w.crops) {
    if (c.dead) continue;
    const d = CROPS[c.type];
    const x = i % w.w, y = (i / w.w) | 0;
    // baixada perto da água geia mais; plantas jovens sofrem mais
    const lowland = w.nearWater(x, y, 3) ? 1.2 : 1;
    const young = c.prog < 0.3 ? 1.25 : 1;
    const dmg = d.frost * severity * lowland * young * r.range(0.5, 1.0);
    c.health -= dmg; hit++;
    if (c.health <= 0) { c.dead = true; c.health = 0; g.stats.lost++; }
  }
  for (let i = 0; i < w.grass.length; i++) if (w.ground[i] === G.PASTURE || w.ground[i] === G.GRASS) w.grass[i] *= 1 - 0.35 * Math.min(1, severity);
  g.notify(hit ? `Geada (${today.tMin}°C)! ${hit} plantas atingidas e o pasto queimou.` : `Geada esta madrugada (${today.tMin}°C): o pasto queimou.`, 'bad');
}

export function daily(g, newDay) {
  const w = g.world, r = g.rng;
  const yesterday = g.climate.days[0];
  animalsDay(g, yesterday);

  const today = climateNextDay(g.climate, r, newDay);
  marketDay(g.market, r, newDay, today, g.climate);
  const doy = newDay % YEAR_DAYS;
  if (doy === 0) g.notify(`Ano ${Math.floor(newDay / YEAR_DAYS) + 1}: ${ENSO[g.climate.enso].name}. ${ENSO[g.climate.enso].text}`, 'info');
  if (today.event && yesterday.event !== today.event) g.notify(EVENT_TEXT[today.event], 'info');

  // perecíveis
  if (g.inv.leite > 0) { const lost = Math.ceil(g.inv.leite * 0.5); g.inv.leite -= lost; g.notify(`${lost} L de leite azedaram. Venda o leite no mesmo dia.`, 'bad'); }
  if (g.inv.ovos > 0) g.inv.ovos = Math.floor(g.inv.ovos * 0.88);

  // terra
  const n = w.w * w.h;
  for (let i = 0; i < n; i++) {
    const gr = w.ground[i];
    if (gr === G.TILLED && !w.crops.has(i)) {
      if (++w.idle[i] > 7) { w.ground[i] = G.DIRT; w.idle[i] = 0; }
      w.fert[i] = Math.min(1, w.fert[i] + 0.01); // pousio recupera devagar
    } else if (gr === G.DIRT) {
      if (r.chance(0.07)) { w.ground[i] = G.GRASS; w.grass[i] = 0.05; }
      w.fert[i] = Math.min(1, w.fert[i] + 0.008);
    } else if (gr === G.PASTURE) {
      // pasto rapado demais degrada
      if (w.grass[i] < 0.04) { if (++w.idle[i] > 6) { w.ground[i] = G.DIRT; w.idle[i] = 0; } }
      else w.idle[i] = 0;
    } else if (gr === G.GRASS && w.obj[i] === O.NONE && w.grass[i] > 0.3) {
      // mato volta onde ninguém cuida
      const x = i % w.w, y = (i / w.w) | 0;
      if (r.chance(0.006) && neighborObj(w, x, y, O.BUSH, O.TREE) && farFromFarm(w, x, y, 5)) { w.obj[i] = O.BUSH; w.hp[i] = 1; w.dirty = true; }
    } else if (w.obj[i] === O.BUSH && r.chance(0.0015)) {
      const x = i % w.w, y = (i / w.w) | 0;
      if (neighborObj(w, x, y, O.TREE) && farFromFarm(w, x, y, 6)) { w.obj[i] = O.TREE; w.hp[i] = 3; w.dirty = true; }
    }
  }
  if (w.dirty) w.recomputeComponents();
  g.stats.days++;
}

function neighborObj(w, x, y, a, b = -1) {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const nx = x + dx, ny = y + dy;
    if (!w.inside(nx, ny)) continue;
    const o = w.obj[w.idx(nx, ny)];
    if (o === a || o === b) return true;
  }
  return false;
}
function farFromFarm(w, x, y, r) { return Math.abs(x - w.farm.cx) > r + 3 || Math.abs(y - w.farm.cy) > r + 2; }
