// Animais: movimento (por quadro), necessidades (por hora) e produção/reprodução (por dia).
import { ANIMALS, FEED_VALUE, G, O, TROUGH_MAX } from './config.js';
import { tempAt } from './climate.js';

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
      const n = r.int(a, b);
      let made = 0;
      for (let k = 0; k < n * 4 && made < n; k++) {
        const nx = x + r.int(-2, 2), ny = y + r.int(-2, 2);
        if (!w.inside(nx, ny) || !w.walkableAnimal(w.idx(nx, ny))) continue;
        makeAnimal(g, sp, nx, ny, { adult: r.chance(0.85) || made === 0 });
        made++;
      }
      break;
    }
  }
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
      const speed = d.speed * (a.fleeing > 0 ? 2.6 : 1) * (a.health < 0.4 ? 0.6 : 1);
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
    if (a.led || a.ridden) { a.hunger = Math.max(0, a.hunger - 1 / 30); a.thirst = Math.max(0, a.thirst - 1 / 30); continue; }
    const d = ANIMALS[a.sp];
    const [x, y] = tileOf(a);
    if (!w.inside(x, y)) continue;
    const scale = Math.max(0.15, a.weight / d.adultW);
    const F = d.forage * Math.min(1.3, scale);
    a.hunger = Math.max(0, a.hunger - 1 / 24);
    a.thirst = Math.max(0, a.thirst - (1 / 24) * (tempAt(g.climate.days[0], hour) > 30 ? 1.4 : 1));

    // comer: cocho primeiro, depois capim em volta, depois lavoura (estrago!)
    let want = Math.min(1 - a.hunger, 2 / 24) * F;
    if (want > 0) {
      const fi = adjacentTo(w, x, y, j => (w.feeders.get(j)?.food || 0) > 0);
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
      for (let k = -1; k < 8 && want > 0; k++) {
        const nx = k < 0 ? x : x + DIRS[k][0], ny = k < 0 ? y : y + DIRS[k][1];
        if (!w.inside(nx, ny)) continue;
        const j = w.idx(nx, ny);
        if (!w.walkableAnimal(j)) continue;
        const take = Math.min(w.grass[j] * 0.5, want);
        if (take <= 0) continue;
        w.grass[j] -= take; a.hunger += take / F; want -= take;
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
  const owned = g.animals.filter(a => a.owned && !a.led);
  for (const a of g.animals) {
    const d = ANIMALS[a.sp];
    const hAvg = a.hours ? a.hSum / a.hours : 0.8, tAvg = a.hours ? a.tSum / a.hours : 0.8;
    a.hSum = a.tSum = a.hours = 0;
    a.age++;
    if (!a.owned) { a.health = 1; continue; }
    const [x, y] = tileOf(a);
    const shade = w.inside(x, y) && hasShade(w, x, y);
    let comfort = 1;
    if (today.tMax > d.heat) comfort -= (today.tMax - d.heat) * (shade ? 0.04 : 0.09);
    if (today.tMin < d.cold) comfort -= (d.cold - today.tMin) * 0.06;
    comfort = Math.max(0.2, comfort);
    a.comfort = comfort;
    const fed = Math.min(hAvg, tAvg);

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
        if (n > 0) w.drops.push({ x, y, n, day: today.day });
      }
    }

    if (d.wool && a.weight > d.adultW * 0.6 && fed > 0.4) a.wool = Math.min(5, (a.wool || 0) + d.wool * comfort);

    // gestação
    if (a.preg > 0) {
      if (--a.preg === 0) {
        const n = r.int(d.litter[0], d.litter[1]);
        for (let k = 0; k < n; k++) born.push([a.sp, x, y]);
        g.notify(`Nasceu${n > 1 ? 'ram' : ''} ${n} ${n > 1 ? d.young.toLowerCase() + 's' : d.young.toLowerCase()}!`, 'good');
      }
    } else if (a.sex === 'f' && isAdult(a) && fed > 0.5 && a.health > 0.6) {
      const c = w.comp[w.idx(x, y)];
      const hasMale = owned.some(b => b.sp === a.sp && b.sex === 'm' && isAdult(b) && w.comp[w.idx(Math.floor(b.x), Math.floor(b.y))] === c);
      if (hasMale && r.chance(d.breed)) a.preg = d.gestation;
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
  for (const [sp, x, y] of born) makeAnimal(g, sp, x, y, { adult: false, owned: true });

  // ovos esquecidos estragam
  w.drops = w.drops.filter(e => today.day - e.day < 4);

  // repovoamento lento da fauna selvagem
  const wild = g.animals.filter(a => !a.owned).length;
  if (wild < 12 && today.day % 6 === 0) {
    const sp = r.pick(['gado', 'porco', 'galinha', 'cavalo', 'ovelha', 'cabra']);
    spawnWild(g, [[sp, 2, 3]]);
  }
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
