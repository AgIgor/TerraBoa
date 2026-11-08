// Animais: movimento (por quadro), necessidades (por hora) e produção/reprodução (por dia).
import { ANIMALS, FEED_VALUE, G, O, TROUGH_MAX, HUNGER_HOURS } from './config.js';
import { tempAt, seasonIndex } from './climate.js';

const WILD_CAP = 8, WILD_TOTAL = 42; // limite de bichos soltos por espécie e no total
const EGG_HATCH_DAYS = 3, EGG_HATCH_P = 0.15, CHICKEN_CAP = 40;

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export function makeAnimal(g, sp, x, y, opts = {}) {
  const d = ANIMALS[sp], r = g.rng;
  const adult = opts.adult !== false;
  const weight = opts.weight ?? (adult ? r.range(d.adultW, (d.adultW + d.maxW) / 2) : r.range(d.birthW[0], d.birthW[1]));
  const a = {
    id: g.nextId++, sp, sex: opts.sex || (r.chance(0.5) ? 'f' : 'm'),
    x: x + 0.5, y: y + 0.5, path: [], owned: !!opts.owned, led: false,
    hunger: 0.8, thirst: 0.8, health: 1, weight, age: adult ? r.int(20, 60) : 0,
    milk: 0, preg: 0, hSum: 0, tSum: 0, hours: 0, escape: 0,
    timer: r.range(0, 3), fleeing: 0, face: r.chance(0.5) ? 1 : -1, seek: null, step: 0,
  };
  g.animals.push(a);
  return a;
}

export function animalLabel(a) {
  const d = ANIMALS[a.sp];
  if (a.weight < d.adultW * 0.6) return d.young;
  return a.sex === 'm' ? d.male : d.female;
}
export const isAdult = a => a.weight >= ANIMALS[a.sp].adultW * 0.85;

// Rebanhos selvagens espalhados pelo mapa, longe da sede.
export function spawnWild(g, count = null) {
  const w = g.world, r = g.rng;
  const groups = count || [['gado', 3, 4], ['gado', 2, 3], ['gado', 3, 4], ['porco', 2, 4], ['porco', 2, 3], ['galinha', 3, 5], ['galinha', 2, 4], ['galinha', 2, 3], ['cavalo', 2, 3], ['cavalo', 2, 3], ['ovelha', 3, 5], ['cabra', 2, 4]];
  for (const [sp, a, b] of groups) {
    for (let tries = 0; tries < 300; tries++) {
      const x = r.int(3, w.w - 4), y = r.int(3, w.h - 4);
      const i = w.idx(x, y);
      if (!w.walkableAnimal(i) || !w.compOpen.has(w.comp[i])) continue;
      if (Math.hypot(x - w.farm.cx, y - w.farm.cy) < 16) continue;
      makeHerd(g, sp, x, y, r.int(a, b));
      break;
    }
  }
}

// Uma manada: a 1ª é fêmea adulta, o 2º um macho adulto; o resto mistura adultos e filhotes (que seguem uma mãe).
function makeHerd(g, sp, x, y, n, spread = 2) {
  const w = g.world, r = g.rng, herd = g.nextId++;
  const made = [];
  for (let k = 0; k < n * 6 && made.length < n; k++) {
    const nx = x + r.int(-spread, spread), ny = y + r.int(-spread, spread);
    if (!w.inside(nx, ny) || !w.walkableAnimal(w.idx(nx, ny))) continue;
    const m = made.length;
    const moms = made.filter(b => b.sex === 'f' && b.age >= 20);
    const young = m >= 2 && moms.length && r.chance(0.2);
    const a = makeAnimal(g, sp, nx, ny, { adult: !young, sex: m === 0 ? 'f' : m === 1 ? 'm' : undefined });
    a.herd = herd;
    if (young) a.mom = r.pick(moms).id;
    made.push(a);
  }
  return made;
}

const SIDE = ['norte', 'sul', 'oeste', 'leste'];
// Uma manada nova chega andando por uma borda do mapa e segue para o meio.
export function herdArrives(g, sp, n) {
  const w = g.world, r = g.rng;
  for (let tries = 0; tries < 200; tries++) {
    const side = r.int(0, 3);
    const t = r.int(4, (side < 2 ? w.w : w.h) - 5);
    const x = side < 2 ? t : side === 2 ? 1 : w.w - 2;
    const y = side < 2 ? (side === 0 ? 1 : w.h - 2) : t;
    const i = w.idx(x, y);
    if (!w.walkableAnimal(i) || !w.compOpen.has(w.comp[i])) continue;
    if (Math.hypot(x - w.farm.cx, y - w.farm.cy) < 16) continue;
    const herd = makeHerd(g, sp, x, y, n, 1);
    if (!herd.length) continue;
    const dest = { x: r.int(Math.floor(w.w * 0.2), Math.floor(w.w * 0.8)), y: r.int(Math.floor(w.h * 0.2), Math.floor(w.h * 0.8)) };
    herd[0].dest = dest;
    return { side: SIDE[side], herd };
  }
  return null;
}

const byId = (g, id) => g.animals.find(b => b.id === id);
// Macho adulto da mesma espécie no mesmo pasto (dono) ou na mesma manada perto (selvagem)
function malesFor(g, a) {
  const w = g.world, [x, y] = tileOf(a);
  if (a.owned) {
    const c = w.inside(x, y) ? w.comp[w.idx(x, y)] : -1;
    return g.animals.filter(b => b.owned && !b.led && b.sp === a.sp && b.sex === 'm' && isAdult(b) && w.comp[w.idx(Math.floor(b.x), Math.floor(b.y))] === c);
  }
  return g.animals.filter(b => !b.owned && b.sp === a.sp && b.sex === 'm' && isAdult(b) && Math.hypot(b.x - a.x, b.y - a.y) < 8);
}

// Chance de emprenhar hoje e o motivo, para a fêmea adulta (0 se não pode).
export function breedChance(g, a) {
  const d = ANIMALS[a.sp], si = seasonIndex(g.climate.days[0].doy);
  if (a.sex !== 'f') return { p: 0, why: 'macho' };
  if (!isAdult(a)) return { p: 0, why: 'nova' };
  if (a.preg > 0) return { p: 0, why: 'prenhe' };
  if ((a.rest || 0) > 0) return { p: 0, why: 'descanso' };
  if (a.owned && a.sp === 'galinha') return { p: 0, why: 'ovos' };
  const males = malesFor(g, a);
  if (!males.length) return { p: 0, why: 'sem macho' };
  const fed = a.lastFed ?? 0.8;
  if (a.owned && (fed < 0.5 || a.health < 0.6)) return { p: 0, why: 'fraca' };
  const cond = Math.max(0.5, Math.min(1.2, a.weight / d.adultW));
  const fem = g.animals.filter(b => b.owned === a.owned && b.sp === a.sp && b.sex === 'f' && isAdult(b) && !b.preg).length || 1;
  const cover = Math.min(1, males.length * d.cover / fem);
  const p = d.breed * d.season[si] * cond * (a.comfort ?? 1) * cover;
  return { p, why: d.season[si] < 0.85 ? 'fora de época' : cover < 1 ? 'pouco macho' : 'ok' };
}

// Texto curto do estado de cria (painel e info do animal)
export function breedText(g, a) {
  const d = ANIMALS[a.sp];
  if (!a.owned) return '';
  if (!isAdult(a)) {
    const left = Math.max(1, Math.ceil((d.adultW * 0.85 - a.weight) / (d.gain * 1.1)));
    return `filhote · adulto em ~${left} d`;
  }
  if (a.sex === 'm') {
    const fem = g.animals.filter(b => b.owned && b.sp === a.sp && b.sex === 'f' && isAdult(b)).length;
    return fem ? `reprodutor (cobre até ${d.cover} fêmeas)` : `reprodutor · sem fêmea`;
  }
  if (a.preg > 0) return `prenhe · nasce em ${a.preg} d`;
  const { p, why } = breedChance(g, a);
  if (why === 'ovos') return malesFor(g, a).length ? 'ovos férteis: deixe no chão 3 dias para chocar' : 'sem galo: ovos não chocam';
  if (why === 'descanso') return `descansando do parto (${a.rest} d)`;
  if (why === 'sem macho') return `sem ${d.male.toLowerCase()} no pasto`;
  if (why === 'fraca') return 'fraca demais para emprenhar';
  return `pode emprenhar (${Math.round(p * 100)}%/dia${why === 'fora de época' ? ', fora de época' : why === 'pouco macho' ? ', pouco macho' : ''})`;
}

// --- busca de caminho curta (BFS) ---
function bfs(w, sx, sy, radius, goal) {
  const start = w.idx(sx, sy);
  const prev = new Map([[start, -1]]);
  const q = [start];
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi], x = i % w.w, y = (i / w.w) | 0;
    if (qi > 0 && goal(i, x, y)) {
      const path = [];
      for (let c = i; c !== start; c = prev.get(c)) path.push(c);
      return path.reverse();
    }
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (!w.inside(nx, ny) || Math.abs(nx - sx) > radius || Math.abs(ny - sy) > radius) continue;
      const j = w.idx(nx, ny);
      if (prev.has(j) || !w.walkableAnimal(j)) continue;
      if (dx && dy && (!w.walkableAnimal(w.idx(x + dx, y)) || !w.walkableAnimal(w.idx(x, y + dy)))) continue;
      prev.set(j, i); q.push(j);
    }
  }
  return null;
}

function adjacentTo(w, x, y, test) {
  for (const [dx, dy] of DIRS) {
    const nx = x + dx, ny = y + dy;
    if (w.inside(nx, ny) && test(w.idx(nx, ny))) return w.idx(nx, ny);
  }
  return -1;
}

const tileOf = a => [Math.floor(a.x), Math.floor(a.y)];

// --- movimento por quadro (dt em segundos reais já multiplicado pela velocidade) ---
export function updateAnimals(g, dt) {
  const w = g.world, p = g.player;
  const chain = g.animals.filter(a => a.led).sort((a, b) => (a.ledSeq || 0) - (b.ledSeq || 0));
  for (const a of g.animals) {
    const d = ANIMALS[a.sp];
    if (a.ridden) { a.x = p.x; a.y = p.y + 0.01; a.face = p.fx >= 0 ? 1 : -1; if (p.moving) a.step += dt * 9; continue; }
    if (a.led) {
      // segue quem está na frente da fila, mantendo distância
      const k = chain.indexOf(a);
      const lead = k <= 0 ? p : chain[k - 1];
      const gap = k <= 0 ? 0.75 + d.size * 0.3 : 0.45 + (d.size + ANIMALS[lead.sp].size) * 0.35;
      const ddx = a.x - lead.x, ddy = a.y - lead.y, dd = Math.hypot(ddx, ddy) || 1;
      const tx = lead.x + ddx / dd * gap, ty = lead.y + ddy / dd * gap;
      const dx = tx - a.x, dy = ty - a.y, dist = Math.hypot(dx, dy);
      if (dist > 0.08) {
        const sp = Math.min(dist, (dist > 2 ? 9 : 6) * dt);
        a.x += dx / dist * sp; a.y += dy / dist * sp;
        if (Math.abs(dx) > 0.05) a.face = dx > 0 ? 1 : -1;
        a.step += sp * 4;
      }
      continue;
    }

    const pd = Math.hypot(p.x - a.x, p.y - a.y);
    if (!a.owned && a.fleeing <= 0 && pd < (p.sneak ? d.flee * 0.4 : d.flee)) startFlee(g, a);
    if (a.fleeing > 0) a.fleeing -= dt;

    if (a.path.length) {
      const i = a.path[0];
      const tx = (i % w.w) + 0.5, ty = ((i / w.w) | 0) + 0.5;
      // o caminho pode ter sido bloqueado (cerca nova)
      if (!w.walkableAnimal(i)) { a.path = []; continue; }
      const dx = tx - a.x, dy = ty - a.y, dist = Math.hypot(dx, dy);
      const speed = d.speed * (a.fleeing > 0 ? 2.6 : a.hurry ? (a.hurry === 2 ? 7 : 4) : 1) * (a.health < 0.4 ? 0.6 : 1);
      const sp = Math.min(dist, speed * dt);
      if (dist > 0.001) { a.x += dx / dist * sp; a.y += dy / dist * sp; }
      if (Math.abs(dx) > 0.02) a.face = dx > 0 ? 1 : -1;
      a.step += sp * 4;
      if (dist - sp < 0.01) a.path.shift();
      continue;
    }

    a.timer -= dt;
    if (a.timer > 0) continue;
    decide(g, a);
  }
}

export function startFlee(g, a) {
  const w = g.world, p = g.player;
  const [x, y] = tileOf(a);
  let best = null, bestD = -1;
  for (let k = 0; k < 10; k++) {
    const path = bfs(w, x, y, 6, (i, nx, ny) => Math.hypot(nx + 0.5 - p.x, ny + 0.5 - p.y) > 5 && g.rng.chance(0.35));
    if (!path) continue;
    const e = path[path.length - 1];
    const dd = Math.hypot((e % w.w) + 0.5 - p.x, ((e / w.w) | 0) + 0.5 - p.y);
    if (dd > bestD) { bestD = dd; best = path; }
    if (bestD > 6) break;
  }
  if (best) { a.path = best.slice(0, 6); a.fleeing = 2.5; }
}

function decide(g, a) {
  const w = g.world, r = g.rng;
  const [x, y] = tileOf(a);
  if (!w.inside(x, y)) return;
  a.timer = r.range(1.5, 4.5);

  if (a.seek === 'water') {
    const path = bfs(w, x, y, 12, (i, nx, ny) => w.nearWater(nx, ny) || adjacentTo(w, nx, ny, j => (w.troughs.get(j)?.water || 0) > 0.2) >= 0);
    if (path) { a.path = path; return; }
  }
  if (a.seek === 'food') {
    const path = bfs(w, x, y, 9, (i, nx, ny) => {
      if (w.grass[i] > 0.3) return true;
      if (!a.owned) { const c = w.crops.get(i); if (c && !c.dead && c.prog > 0.3) return true; }
      return adjacentTo(w, nx, ny, j => (w.feeders.get(j)?.food || 0) > 0.1) >= 0;
    });
    if (path) { a.path = path; return; }
  }
  // filhote fica perto da mãe; selvagem fica perto da manada
  a.hurry = false;
  const mom = a.mom && !isAdult(a) ? byId(g, a.mom) : null;
  if (a.mom && !mom) a.mom = null;
  let near = null;
  if (mom && !mom.ridden) near = [mom.x, mom.y, mom.led ? 1.2 : 2.2];
  else if (!a.owned && a.herd && !a.dest) {
    const lead = g.animals.find(b => b.herd === a.herd && !b.owned);
    if (lead && lead !== a) near = [lead.x, lead.y, 4];
  }
  if (near && Math.hypot(near[0] - a.x, near[1] - a.y) > near[2]) {
    const [tx, ty] = near;
    const path = bfs(w, x, y, 10, (i, nx, ny) => Math.hypot(nx + 0.5 - tx, ny + 0.5 - ty) <= near[2] * 0.7);
    if (path) { a.path = path.slice(0, 8); a.hurry = mom ? (mom.led ? 2 : Math.hypot(tx - a.x, ty - a.y) > 4 ? 1 : 0) : 0; a.timer = 0.3; return; }
  }
  // manada recém-chegada: o líder caminha para o meio do mapa
  if (a.dest) {
    if (Math.hypot(a.dest.x - x, a.dest.y - y) < 4 || a.owned) a.dest = null;
    else {
      a.stuck = a.stuck || 0;
      const sx = Math.sign(a.dest.x - x), sy = Math.sign(a.dest.y - y);
      const path = []; let cx = x, cy = y;
      for (let k = 0; k < 3; k++) {
        const opts = DIRS.filter(([dx, dy]) => dx * sx + dy * sy > 0 && w.inside(cx + dx, cy + dy) && w.walkableAnimal(w.idx(cx + dx, cy + dy)));
        if (!opts.length) {
          // obstáculo: contorna pelo caminho mais curto que chegue mais perto do destino
          if (k === 0) {
            const d0 = Math.hypot(a.dest.x - x, a.dest.y - y);
            const around = bfs(w, x, y, 12, (i, nx, ny) => Math.hypot(a.dest.x - nx, a.dest.y - ny) < d0 - 5);
            if (around) { a.path = around; a.timer = 0.5; return; }
            if (++a.stuck > 4) a.dest = null;
          }
          break;
        }
        const [dx, dy] = r.pick(opts); cx += dx; cy += dy; path.push(w.idx(cx, cy));
      }
      if (path.length) { a.path = path; a.timer = r.range(0.5, 1.5); return; }
    }
  }
  // passeio: anda um pouco ou fica parado pastando
  if (r.chance(0.45)) {
    const n = r.int(1, 3);
    let cx = x, cy = y;
    const path = [];
    for (let k = 0; k < n; k++) {
      const [dx, dy] = DIRS[r.int(0, 7)];
      const nx = cx + dx, ny = cy + dy;
      if (!w.inside(nx, ny)) break;
      const j = w.idx(nx, ny);
      if (!w.walkableAnimal(j)) break;
      if (dx && dy && (!w.walkableAnimal(w.idx(cx + dx, cy)) || !w.walkableAnimal(w.idx(cx, cy + dy)))) break;
      // animal com dono evita sair da área dele; selvagem prefere ficar longe da sede
      if (!a.owned && Math.hypot(nx - w.farm.cx, ny - w.farm.cy) < 6) break;
      path.push(j); cx = nx; cy = ny;
    }
    a.path = path;
  }
}

// --- necessidades (uma vez por hora de jogo) ---
export function animalsHour(g, hour) {
  const w = g.world;
  for (const a of g.animals) {
    if (a.led || a.ridden) { a.hunger = Math.max(0, a.hunger - 1 / (HUNGER_HOURS * 1.2)); a.thirst = Math.max(0, a.thirst - 1 / (HUNGER_HOURS * 1.2)); continue; }
    const d = ANIMALS[a.sp];
    const [x, y] = tileOf(a);
    if (!w.inside(x, y)) continue;
    const scale = Math.max(0.15, a.weight / d.adultW);
    const F = d.forage * Math.min(1.3, scale);
    a.hunger = Math.max(0, a.hunger - 1 / HUNGER_HOURS);
    a.thirst = Math.max(0, a.thirst - (1 / HUNGER_HOURS) * (tempAt(g.climate.days[0], hour) > 30 ? 1.4 : 1));

    // comer: primeiro o capim em volta, depois o cocho, por último a lavoura (estrago!)
    let want = Math.min(1 - a.hunger, 3 / HUNGER_HOURS) * F;
    if (want > 0) {
      for (let k = -1; k < 8 && want > 0; k++) {
        const nx = k < 0 ? x : x + DIRS[k][0], ny = k < 0 ? y : y + DIRS[k][1];
        if (!w.inside(nx, ny)) continue;
        const j = w.idx(nx, ny);
        if (!w.walkableAnimal(j) || w.grass[j] < 0.08) continue;
        const take = Math.min((w.grass[j] - 0.04) * 0.5, want);
        if (take <= 0) continue;
        w.grass[j] -= take; a.hunger += take / F; want -= take;
      }
      const fi = want > 0 ? adjacentTo(w, x, y, j => (w.feeders.get(j)?.food || 0) > 0) : -1;
      if (fi >= 0) {
        const f = w.feeders.get(fi), take = Math.min(f.food, want);
        f.food -= take; a.hunger += take / F; want -= take;
      }
      const ci = w.idx(x, y);
      const crop = w.crops.get(ci);
      if (want > 0 && crop && !crop.dead && crop.prog > 0.2) {
        crop.health -= 0.35; crop.eaten = (crop.eaten || 0) + 1;
        a.hunger = Math.min(1, a.hunger + 0.4);
        want = 0;
        if (crop.health <= 0) crop.dead = true;
        if (!g.flags.cropWarn || g.time - g.flags.cropWarn > 360) {
          g.flags.cropWarn = g.time;
          g.notify(`${a.owned ? 'Seu' : 'Um'} ${animalLabel(a).toLowerCase()} está comendo a lavoura! Cerque a plantação.`, 'bad');
        }
      }
      a.hunger = Math.min(1, a.hunger);
    }
    // beber
    if (w.nearWater(x, y)) a.thirst = 1;
    else {
      const ti = adjacentTo(w, x, y, j => (w.troughs.get(j)?.water || 0) > 0);
      if (ti >= 0 && a.thirst < 0.9) {
        const t = w.troughs.get(ti), need = (1 - a.thirst) * d.water * Math.min(1.3, scale);
        const take = Math.min(t.water, need);
        t.water -= take; a.thirst += take / (d.water * Math.min(1.3, scale));
        a.thirst = Math.min(1, a.thirst);
      }
    }
    a.seek = a.thirst < 0.45 ? 'water' : a.hunger < 0.6 ? 'food' : null;
    a.hSum += a.hunger; a.tSum += a.thirst; a.hours++;
  }
}

// --- um dia: peso, saúde, leite, ovos, crias, fugas ---
export function animalsDay(g, today) {
  const w = g.world, r = g.rng;
  const born = [];
  const wildCount = {};
  for (const a of g.animals) if (!a.owned) wildCount[a.sp] = (wildCount[a.sp] || 0) + 1;
  for (const a of g.animals) {
    const d = ANIMALS[a.sp];
    const hAvg = a.hours ? a.hSum / a.hours : 0.8, tAvg = a.hours ? a.tSum / a.hours : 0.8;
    a.hSum = a.tSum = a.hours = 0;
    a.age++;
    if (a.rest > 0) a.rest--;
    if (!a.owned) {
      a.health = 1; a.lastFed = 0.8;
      // filhote solto que seguiu a mãe para dentro do seu pasto fica com você
      const m = a.mom ? byId(g, a.mom) : null;
      const [wx, wy] = tileOf(a);
      if (m && m.owned && w.inside(wx, wy) && !w.compOpen.has(w.comp[w.idx(wx, wy)])) {
        a.owned = true; a.herd = null;
        g.notify(`O ${d.young.toLowerCase()} seguiu a mãe e ficou no seu pasto.`, 'good');
      } else {
        wildBreed(g, a, born, wildCount);
        continue;
      }
    }
    const [x, y] = tileOf(a);
    const shade = w.inside(x, y) && hasShade(w, x, y);
    let comfort = 1;
    if (today.tMax > d.heat) comfort -= (today.tMax - d.heat) * (shade ? 0.04 : 0.09);
    if (today.tMin < d.cold) comfort -= (d.cold - today.tMin) * 0.06;
    comfort = Math.max(0.2, comfort);
    a.comfort = comfort;
    const fed = Math.min(hAvg, tAvg);
    a.lastFed = fed;

    if (fed > 0.45) a.weight = Math.min(d.maxW, a.weight + d.gain * comfort * Math.min(1, fed + 0.2) * (a.weight < d.adultW ? 1.2 : 0.7));
    else a.weight = Math.max(d.birthW[1], a.weight - d.gain * 0.6);

    if (hAvg < 0.12) a.health -= 0.3;
    if (tAvg < 0.12) a.health -= 0.4;
    if (comfort < 0.5) a.health -= 0.05;
    if (hAvg > 0.4 && tAvg > 0.4) a.health = Math.min(1, a.health + 0.12);
    if (a.health <= 0) {
      a.dead = true;
      g.notify(`${animalLabel(a)} morreu de ${tAvg < hAvg ? 'sede' : 'fome'}. Confira cocho, pasto e água.`, 'bad');
      continue;
    }
    if (a.health < 0.5 && !a.warned) { a.warned = true; g.notify(`${animalLabel(a)} está fraco: falta ${tAvg < hAvg ? 'água' : 'comida'}.`, 'bad'); }
    if (a.health > 0.7) a.warned = false;

    if (isAdult(a) && a.sex === 'f') {
      if (d.milk) a.milk = Math.min(d.milk * 2.2, a.milk + d.milk * comfort * Math.min(1, fed * 1.3));
      if (a.sp === 'galinha' && fed > 0.4 && w.inside(x, y)) {
        const n = Math.round(r.range(2, 5) * comfort * Math.min(1, fed * 1.2));
        if (n > 0) {
          // ovos da mesma galinha no mesmo lugar se juntam num ninho
          const nest = w.drops.find(e => e.x === x && e.y === y && e.day === today.day);
          const fertile = malesFor(g, a).length > 0;
          if (nest) { nest.n += n; nest.f = nest.f || fertile; } else w.drops.push({ x, y, n, day: today.day, f: fertile });
        }
      }
    }

    if (d.wool && a.weight > d.adultW * 0.6 && fed > 0.4) a.wool = Math.min(5, (a.wool || 0) + d.wool * comfort);

    // gestação
    if (a.preg > 0) {
      if (--a.preg === 0) {
        const n = r.int(d.litter[0], d.litter[1]);
        for (let k = 0; k < n; k++) born.push([a.sp, x, y, a.id, true]);
        a.rest = d.rest;
        g.notify(`Nasceu${n > 1 ? 'ram' : ''} ${n} ${n > 1 ? d.young.toLowerCase() + 's' : d.young.toLowerCase()}!`, 'good');
      }
    } else {
      const { p } = breedChance(g, a);
      if (p > 0 && r.chance(p)) { a.preg = d.gestation; g.notify(`${animalLabel(a)} ficou prenhe! Nasce em ${d.gestation} dias.`, 'good'); }
    }

    // animal fora de cerca pode fugir
    const ci = w.inside(x, y) ? w.comp[w.idx(x, y)] : -1;
    if (a.ridden || a.led) a.escape = 0;
    else if (ci < 0 || w.compOpen.has(ci)) {
      a.escape++;
      if (a.escape >= 2 && r.chance(0.5)) {
        a.owned = false; a.escape = 0;
        g.notify(`${animalLabel(a)} fugiu! O pasto não está fechado.`, 'bad');
      }
    } else a.escape = 0;
  }
  g.animals = g.animals.filter(a => !a.dead);
  for (const [sp, x, y, mom, owned] of born) {
    const m = byId(g, mom);
    const b = makeAnimal(g, sp, x, y, { adult: false, owned });
    b.mom = mom; if (m && !owned) b.herd = m.herd;
  }

  // ovos férteis esquecidos 3 dias podem chocar; o resto estraga
  let chicks = g.animals.filter(a => a.owned && a.sp === 'galinha').length;
  const keep = [];
  // no máximo uma ninhada choca por dia (uma galinha choca de cada vez)
  let brood = r.chance(EGG_HATCH_P * ANIMALS.galinha.season[today.season]);
  for (const e of w.drops) {
    const age = today.day - e.day;
    if (brood && e.f && age >= EGG_HATCH_DAYS && chicks < CHICKEN_CAP) {
      brood = false;
      const i = w.idx(e.x, e.y);
      const closed = !w.compOpen.has(w.comp[i]);
      const n = Math.min(e.n, r.int(1, 3));
      const hen = g.animals.find(a => a.sp === 'galinha' && a.sex === 'f' && a.owned && Math.hypot(a.x - e.x - 0.5, a.y - e.y - 0.5) < 6);
      for (let k = 0; k < n; k++) { const c = makeAnimal(g, 'galinha', e.x, e.y, { adult: false, owned: closed }); if (hen) c.mom = hen.id; }
      chicks += n;
      g.notify(`Chocaram ${n} pintinho${n > 1 ? 's' : ''}!${closed ? '' : ' Fora da cerca eles fogem.'}`, 'good');
      continue;
    }
    if (age < 4 + (e.f ? 1 : 0)) keep.push(e);
  }
  w.drops = keep;

  // manadas novas chegam pelas bordas (mais na primavera e no verão), até um limite
  const wild = g.animals.filter(a => !a.owned).length;
  const arrive = [0.3, 0.22, 0.12, 0.06][today.season] * (wild < 15 ? 2 : 1);
  if (wild < WILD_TOTAL && r.chance(arrive)) {
    const all = ['gado', 'porco', 'galinha', 'cavalo', 'ovelha', 'cabra'];
    const low = all.filter(s => (wildCount[s] || 0) < 4);
    const sp = r.pick(low.length ? low : all.filter(s => (wildCount[s] || 0) < WILD_CAP));
    if (sp) {
      const res = herdArrives(g, sp, r.int(2, 4));
      if (res) g.notify(`Uma manada de ${res.herd.length} ${ANIMALS[sp].name.toLowerCase()}${sp === 'gado' ? '' : 's'} selvage${res.herd.length > 1 ? 'ns' : 'm'} apareceu ao ${res.side} do mapa.`, 'info');
    }
  }
}

// Bichos soltos também têm cria, na época, com limite por espécie.
function wildBreed(g, a, born, wildCount) {
  const d = ANIMALS[a.sp], r = g.rng;
  const [x, y] = tileOf(a);
  if (a.preg > 0) {
    if (--a.preg === 0) {
      const n = r.int(d.litter[0], d.litter[1]);
      for (let k = 0; k < n; k++) born.push([a.sp, x, y, a.id, false]);
      wildCount[a.sp] = (wildCount[a.sp] || 0) + n;
      a.rest = d.rest;
    }
    return;
  }
  let total = 0; for (const k in wildCount) total += wildCount[k];
  if ((wildCount[a.sp] || 0) >= WILD_CAP || total >= WILD_TOTAL - 4) return;
  const { p } = breedChance(g, a);
  if (p > 0 && r.chance(p * 0.25)) { a.preg = d.gestation; wildCount[a.sp] = (wildCount[a.sp] || 0) + d.litter[1]; }
}

function hasShade(w, x, y) {
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const nx = x + dx, ny = y + dy;
    if (w.inside(nx, ny) && w.obj[w.idx(nx, ny)] === O.TREE) return true;
  }
  return false;
}

// Valor de venda do animal hoje
export function animalValue(g, a) {
  const d = ANIMALS[a.sp], price = g.market.c[d.market].price, hf = a.health * 0.3 + 0.7;
  if (d.sell === 'arroba') return (a.weight / 15) * price * hf;
  if (d.sell === 'kg') return a.weight * price * hf;
  return price * Math.min(1, a.weight / d.adultW) * hf;
}
// Quantidade que entra no mercado ao vender o animal (para a pressão de preço)
export function animalMarketQty(a) {
  const d = ANIMALS[a.sp];
  return d.sell === 'arroba' ? Math.round(a.weight / 15) : d.sell === 'kg' ? Math.round(a.weight) : 1;
}

// Larga o animal no tile livre mais perto do ponto.
export function settleAnimal(w, a) {
  const x0 = Math.floor(a.x), y0 = Math.floor(a.y);
  for (let r = 0; r < 6; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = x0 + dx, y = y0 + dy;
    if (w.inside(x, y) && w.walkableAnimal(w.idx(x, y))) { a.x = x + 0.5; a.y = y + 0.5; return true; }
  }
  return false;
}

export function troughFill(w, i, amount) {
  const t = w.troughs.get(i);
  if (!t) return 0;
  const add = Math.min(TROUGH_MAX - t.water, amount);
  t.water += add;
  return add;
}
export { FEED_VALUE, G };
