// O que cada ferramenta faz num tile. Retorna { ok, msg, kind, open } ou null.
import {
  G, O, CROPS, TOOLS, PLANT_LIST, BUILD_LIST, ITEMS, REGADOR_MAX, TROUGH_MAX, FEEDER_MAX,
  FEED_VALUE, ANIMALS, LASSO_REACH, DIESEL_PER_TILE, MAX_LED, SPRINKLER,
} from './config.js';
import { hourOf, sleep } from './game.js';
import { animalLabel, settleAnimal, isAdult, startFlee } from './animals.js';

const say = (msg, kind = 'info', extra = {}) => ({ ok: kind !== 'bad', msg, kind, ...extra });

export function animalAt(g, px, py, radius = 0.7) {
  let best = null, bd = radius;
  for (const a of g.animals) {
    const d = Math.hypot(a.x - px, a.y - py);
    if (d < bd) { bd = d; best = a; }
  }
  return best;
}

// Animais no laço, na ordem em que foram laçados (o primeiro vai logo atrás do jogador)
export function ledList(g) { return g.animals.filter(a => a.led).sort((a, b) => (a.ledSeq || 0) - (b.ledSeq || 0)); }

function hasAnimalOn(g, x, y) { return g.animals.some(a => Math.floor(a.x) === x && Math.floor(a.y) === y); }

function addItem(g, id, n) { g.inv[id] = (g.inv[id] || 0) + n; }

export function useTool(g, toolId, x, y, px = x + 0.5, py = y + 0.5, opts = {}) {
  const r = useToolRaw(g, toolId, x, y, px, py, opts);
  // cerca/ponte/árvore mudaram: recalcula na hora as áreas fechadas para os animais
  if (g.world.dirty) g.world.recomputeComponents();
  return r;
}

function useToolRaw(g, toolId, x, y, px, py, opts) {
  const w = g.world;
  if (!w.inside(x, y)) return null;
  const mount = g.player.mount;
  if (mount?.kind === 'trator') {
    if (['enxada', 'plantar', 'adubo'].includes(toolId)) return tractorWork(g, toolId, x, y, opts);
    if (toolId !== 'mao') return say('Do trator só dá para arar, plantar e adubar. Desça com X.', 'bad');
  }
  if (mount?.kind === 'cavalo' && ['enxada', 'plantar', 'construir', 'machado', 'adubo', 'regador'].includes(toolId)) return say('Desça do cavalo (X) para trabalhar a terra.', 'bad');
  return useTool1(g, toolId, x, y, px, py, opts);
}

function useTool1(g, toolId, x, y, px, py, opts = {}) {
  switch (toolId) {
    case 'mao': return hand(g, x, y, px, py);
    case 'enxada': return hoe(g, x, y, opts.hoeMode);
    case 'machado': return axe(g, x, y);
    case 'regador': return water(g, x, y);
    case 'plantar': return plant(g, x, y);
    case 'construir': return build(g, x, y);
    case 'laco': return lasso(g, x, y, px, py);
    case 'adubo': return fertilize(g, x, y);
  }
  return null;
}

function hand(g, x, y, px, py) {
  const w = g.world, i = w.idx(x, y), p = g.player;
  const o = w.obj[i];
  if (o === O.HOUSE) {
    const h = hourOf(g);
    if (h >= 19 || h < 5) { sleep(g); return say('Você dormiu. Bom dia!', 'good', { slept: true }); }
    return say('Ainda é cedo para dormir (depois das 19h).');
  }
  if (o === O.COOP) return say('Cooperativa', 'info', { open: 'market' });

  // ovos no chão
  const e = w.drops.findIndex(d => d.x === x && d.y === y);
  if (e >= 0) { const n = w.drops[e].n; w.drops.splice(e, 1); addItem(g, 'ovos', n); return say(`+${n} ovos`, 'good'); }

  // montar no trator ou no cavalo
  const mt = mountAt(g, px, py);
  if (mt) return mt;

  // animal: ordenhar, tosquiar ou ver
  const a = animalAt(g, px, py, 0.8);
  if (a && !a.ridden) {
    const d = ANIMALS[a.sp];
    if (a.owned && d.wool && (a.wool || 0) >= 1) {
      const kg = Math.floor(a.wool); a.wool -= kg; addItem(g, 'la', kg);
      return say(`Tosquiou ${kg} kg de lã`, 'good');
    }
    if (a.owned && d.milk && a.sex === 'f' && isAdult(a)) {
      const l = Math.floor(a.milk);
      if (l >= 1) { a.milk -= l; addItem(g, d.milkItem, l); return say(`Ordenhou ${l} L de ${ITEMS[d.milkItem].name.toLowerCase()}`, 'good'); }
      return say(`${animalLabel(a)} já foi ordenhada. Volte amanhã.`);
    }
    if (a.owned && d.wool) return say(`${animalLabel(a)}: lã ainda curta (${(a.wool || 0).toFixed(1)} kg)`);
    return say(`${animalLabel(a)}${a.owned ? '' : ' (solto)'}`, 'info', { inspect: a });
  }

  // cocho: põe ração ou milho
  if (o === O.FEEDER) {
    const f = w.feeders.get(i);
    const src = (g.inv.racao || 0) > 0 ? 'racao' : (g.inv.milho || 0) > 0 ? 'milho' : null;
    if (!src) return say('Sem ração nem milho para pôr no cocho. Compre na cooperativa.', 'bad');
    const room = Math.floor((FEEDER_MAX - f.food) / FEED_VALUE[src]);
    if (room <= 0) return say('O cocho está cheio.');
    const n = Math.min(room, g.inv[src], 5);
    g.inv[src] -= n; f.food += n * FEED_VALUE[src];
    return say(`Pôs ${n} sc de ${ITEMS[src].name.toLowerCase()} no cocho`, 'good');
  }
  if (o === O.TROUGH) return say(`Bebedouro: ${Math.round(w.troughs.get(i).water / TROUGH_MAX * 100)}%. Use o regador para encher.`);

  // lavoura
  const c = w.crops.get(i);
  if (c) {
    const d = CROPS[c.type];
    if (c.dead) { w.crops.delete(i); return say('Limpou a planta morta'); }
    if (!c.ripe) return say(`${d.name}: ${Math.round(c.prog * 100)}% crescida`);
    const n = harvestCrop(g, i);
    return say(`+${n} ${ITEMS[d.item].unit} de ${d.name.toLowerCase()}`, 'good');
  }
  return null;
}

// Colhe a lavoura madura do tile i. Usado pelo jogador e pelos peões.
export function harvestCrop(g, i) {
  const w = g.world, c = w.crops.get(i), d = CROPS[c.type];
  const fert = w.fert[i];
  const base = g.rng.range(d.yield[0], d.yield[1] + 0.99);
  const n = Math.max(1, Math.floor(base * (0.35 + 0.65 * c.health) * (0.55 + 0.6 * fert)));
  addItem(g, d.item, n);
  g.stats.harvested[d.item] = (g.stats.harvested[d.item] || 0) + n;
  w.fert[i] = Math.max(0.05, Math.min(1, fert - d.fertUse));
  c.harvests++;
  if (d.regrow && c.harvests < d.maxHarvests) { c.ripe = false; c.prog = d.regrow; c.ripeH = 0; }
  else { w.crops.delete(i); w.idle[i] = 0; }
  return n;
}

// Trator: trabalha um quadrado 3x3 e gasta diesel por tile.
function tractorWork(g, toolId, x, y, opts = {}) {
  const w = g.world;
  let n = 0, last = null;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!w.inside(x + dx, y + dy)) continue;
    const r = useTool1(g, toolId, x + dx, y + dy, x + dx + 0.5, y + dy + 0.5, { hoeMode: opts.hoeMode || 'till' });
    if (r && r.ok) n++;
    else if (r && r.kind === 'bad') last = r;
  }
  if (!n) return last || null;
  const cost = n * DIESEL_PER_TILE * Math.exp(g.market.dollar || 0);
  g.money -= cost; g.stats.spent += cost;
  return say('');
}

export function mountAt(g, px, py) {
  const p = g.player;
  if (p.mount) return null;
  const v = (g.vehicles || []).find(v => Math.hypot(v.x - px, v.y - py) < 1.1);
  if (v) { p.mount = { kind: 'trator', id: v.id }; p.x = v.x; p.y = v.y; return say('No trator: arar, plantar e adubar fazem 3×3. X desce.', 'good'); }
  const a = animalAt(g, px, py, 0.9);
  if (a && a.sp === 'cavalo' && a.owned && !a.led && isAdult(a)) {
    a.ridden = true; a.path = []; p.mount = { kind: 'cavalo', id: a.id }; p.x = a.x; p.y = a.y;
    return say(`Montou ${a.sex === 'f' ? 'na égua' : 'no cavalo'}. X desce.`, 'good');
  }
  return null;
}

export function dismount(g) {
  const p = g.player, m = p.mount, w = g.world;
  if (!m) return null;
  // procura um lugar livre do lado para descer
  let spot = null;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    if (w.walkablePlayer(Math.floor(p.x + dx), Math.floor(p.y + dy))) { spot = [Math.floor(p.x + dx) + 0.5, Math.floor(p.y + dy) + 0.5]; break; }
  }
  if (!spot) return say('Sem espaço para descer aqui.', 'bad');
  if (m.kind === 'cavalo') {
    const a = g.animals.find(a => a.id === m.id);
    if (a) { a.ridden = false; a.x = p.x; a.y = p.y; settleAnimal(w, a); }
  } else {
    const v = g.vehicles.find(v => v.id === m.id);
    if (v) { v.x = p.x; v.y = p.y; v.fx = p.fx; }
  }
  p.mount = null; p.x = spot[0]; p.y = spot[1];
  return say('Desceu.');
}

// mode: 'till' só ara, 'untill' só desfaz terra arada, vazio decide pelo tile
function hoe(g, x, y, mode) {
  const w = g.world, i = w.idx(x, y), o = w.obj[i];
  const c = w.crops.get(i);
  if (c) {
    if (c.dead) { w.crops.delete(i); return say('Limpou a planta morta'); }
    return say('Tem uma planta aqui. Use a mão para colher.');
  }
  if (o === O.BUSH) { w.obj[i] = O.NONE; w.ground[i] = G.DIRT; w.dirty = true; return say('Arrancou o mato'); }
  if (o === O.ROCK) {
    if (--w.hp[i] > 0) return say('A pedra rachou...');
    w.obj[i] = O.NONE; w.dirty = true; return say('Tirou a pedra');
  }
  if (o !== O.NONE) return null;
  const gr = w.ground[i];
  if (gr === G.TILLED) {
    if (mode === 'till') return null;
    w.ground[i] = G.DIRT; w.idle[i] = 0;
    return say('Desfez a terra arada (volta a ser campo com o tempo, ou plante capim)');
  }
  if (mode === 'untill') return null;
  if (gr === G.GRASS || gr === G.DIRT || gr === G.PASTURE || gr === G.SAND || gr === G.YARD) {
    if (gr === G.SAND) return say('Areia não serve para plantar.', 'bad');
    w.ground[i] = G.TILLED; w.grass[i] = 0; w.idle[i] = 0;
    return say('');
  }
  return null;
}

function axe(g, x, y) {
  const w = g.world, i = w.idx(x, y), o = w.obj[i];
  if (o === O.TREE) {
    if (--w.hp[i] > 0) return say('Toc!');
    w.obj[i] = O.NONE; w.dirty = true; addItem(g, 'madeira', 4);
    return say('+4 madeira', 'good');
  }
  if (o === O.BUSH) { w.obj[i] = O.NONE; w.dirty = true; addItem(g, 'madeira', 1); return say('+1 madeira', 'good'); }
  const refund = { [O.FENCE]: ['madeira', 1], [O.GATE]: ['madeira', 3], [O.FEEDER]: ['madeira', 3], [O.TROUGH]: ['bebedouro', 1], [O.SPRINKLER]: ['aspersor', 1], [O.PAIOL]: ['madeira', 15], [O.SILO]: ['silo', 1], [O.BRIDGE]: ['madeira', 4] }[o];
  if (refund) {
    w.obj[i] = O.NONE; w.dirty = true;
    w.troughs.delete(i); w.feeders.delete(i); w.sprinklers.delete(i);
    addItem(g, refund[0], refund[1]);
    return say(`Desmontou (+${refund[1]} ${ITEMS[refund[0]].name.toLowerCase()})`);
  }
  return null;
}

function water(g, x, y) {
  const w = g.world, i = w.idx(x, y), p = g.player;
  if (w.ground[i] === G.WATER) { p.water = REGADOR_MAX; return say('Regador cheio', 'good'); }
  if (w.obj[i] === O.TROUGH) {
    if (p.water <= 0) return say('Regador vazio. Encha na água.', 'bad');
    const t = w.troughs.get(i), add = Math.min(TROUGH_MAX - t.water, p.water);
    t.water += add; p.water -= add;
    return say(`Bebedouro ${Math.round(t.water / TROUGH_MAX * 100)}%`, 'good');
  }
  if (w.obj[i] !== O.NONE) return null;
  if (p.water <= 0) return say('Regador vazio. Encha na água.', 'bad');
  // regador molha bem o tile e um pouco em volta (3x3)
  p.water--;
  w.moist[i] = Math.min(1, w.moist[i] + 0.6);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if ((!dx && !dy) || !w.inside(x + dx, y + dy)) continue;
    const j = w.idx(x + dx, y + dy);
    if (w.ground[j] !== G.WATER) w.moist[j] = Math.min(1, w.moist[j] + 0.35);
  }
  return say('');
}

function plant(g, x, y) {
  const w = g.world, i = w.idx(x, y), p = g.player;
  const sel = PLANT_LIST[p.plant];
  if ((g.inv[sel.item] || 0) <= 0) return say(`Sem ${ITEMS[sel.item].name.toLowerCase()}. Compre na cooperativa.`, 'bad');
  if (w.obj[i] !== O.NONE || w.crops.has(i)) return null;
  const gr = w.ground[i];
  if (sel.id === 'capim') {
    if (gr === G.PASTURE) return say('Já é pasto.');
    if (gr !== G.GRASS && gr !== G.DIRT && gr !== G.TILLED && gr !== G.YARD) return say('Capim precisa de terra (não areia nem estrada).', 'bad');
    w.ground[i] = G.PASTURE; w.grass[i] = Math.min(w.grass[i], 0.08); w.idle[i] = 0;
    g.inv[sel.item]--;
    return say('');
  }
  if (gr !== G.TILLED) return say('Are a terra com a enxada antes.', 'bad');
  w.crops.set(i, { type: sel.id, prog: 0, health: 1, harvests: 0, ripe: false, dead: false, planted: g.time });
  g.inv[sel.item]--;
  return say('');
}

function build(g, x, y) {
  const w = g.world, i = w.idx(x, y), p = g.player;
  const b = BUILD_LIST[p.build];
  if (w.obj[i] !== O.NONE || w.crops.has(i)) return null;
  const gr = w.ground[i];
  if (b.water && gr !== G.WATER) return say('A ponte vai em cima da água.', 'bad');
  if (!b.water && gr === G.WATER) return say('Não dá para construir na água (só ponte).', 'bad');
  if (Math.floor(p.x) === x && Math.floor(p.y) === y) return null;
  if (hasAnimalOn(g, x, y)) return say('Tem um animal aí.', 'bad');
  for (const k in b.cost) if ((g.inv[k] || 0) < b.cost[k]) return say(`Falta ${ITEMS[k].name.toLowerCase()} (${b.cost[k]}). ${k === 'madeira' ? 'Corte árvores ou compre.' : 'Compre na cooperativa.'}`, 'bad');
  for (const k in b.cost) g.inv[k] -= b.cost[k];
  w.obj[i] = b.obj; w.dirty = true;
  if (b.obj === O.TROUGH) w.troughs.set(i, { water: 0 });
  if (b.obj === O.FEEDER) w.feeders.set(i, { food: 0 });
  if (b.obj === O.SPRINKLER) {
    w.sprinklers.add(i);
    if (!w.nearWater(x, y, SPRINKLER.water)) return say(`Aspersor instalado, mas não há água a até ${SPRINKLER.water} tiles: ele não vai funcionar.`, 'bad');
    return say(`Aspersor ligado: molha 7×7 às ${SPRINKLER.hours.join('h, ')}h.`, 'good');
  }
  return say('');
}

function lasso(g, x, y, px, py) {
  const w = g.world, p = g.player;
  const a = animalAt(g, px, py, 1.1);
  if (!a || a.ridden) return say('Mire num animal.', 'bad');
  // clicar num animal que está no laço solta ele ali
  if (a.led) {
    a.led = false; a.path = [];
    settleAnimal(w, a);
    a.owned = true;
    const ci = w.comp[w.idx(Math.floor(a.x), Math.floor(a.y))];
    if (w.compOpen.has(ci)) return say(`${animalLabel(a)} solto, mas a área não está cercada: ele pode fugir!`, 'bad');
    return say(`${animalLabel(a)} solto no pasto`, 'good');
  }
  if (Math.hypot(a.x - p.x, a.y - p.y) > LASSO_REACH) return say('Longe demais para o laço.', 'bad');
  const n = ledList(g).length;
  if (n >= MAX_LED) return say(`Já está levando ${n} animais. Clique num deles para soltar.`, 'bad');
  const take = () => { a.led = true; a.path = []; a.fleeing = 0; a.ledSeq = g.nextId++; };
  if (a.owned) { take(); return say(`Levando ${animalLabel(a).toLowerCase()} (${n + 1} no laço)`); }
  const onHorse = p.mount?.kind === 'cavalo';
  const chance = Math.min(0.95, ANIMALS[a.sp].catch * (p.sneak ? 1.25 : 1) * (onHorse ? 1.45 : 1) * (a.fleeing > 0 && !onHorse ? 0.6 : 1));
  if (g.rng.chance(chance)) {
    take();
    const lb = animalLabel(a).toLowerCase();
    return say(`Laçou ${/a$/.test(lb) ? 'uma' : 'um'} ${lb}! (${n + 1} no laço) Clique nele com o laço para soltar.`, 'good');
  }
  if (!a.owned) startFlee(g, a);
  return say('Errou o laço! O animal se assustou.', 'bad');
}

function fertilize(g, x, y) {
  const w = g.world, i = w.idx(x, y);
  if ((g.inv.adubo || 0) <= 0) return say('Sem adubo. Compre na cooperativa.', 'bad');
  const gr = w.ground[i];
  if (gr !== G.TILLED && gr !== G.PASTURE && !w.crops.has(i)) return say('Adube terra arada, lavoura ou pasto.', 'bad');
  if (w.fert[i] > 0.92) return say('A terra já está fértil.');
  g.inv.adubo--;
  w.fert[i] = Math.min(1, w.fert[i] + 0.35);
  return say(`Fertilidade ${Math.round(w.fert[i] * 100)}%`, 'good');
}

export function toolName(i) { return TOOLS[i].name; }
