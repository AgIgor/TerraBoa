// Peões contratados: andam pela fazenda e fazem uma tarefa (regar, colher ou tratar dos bichos).
import { CROPS, O, WAGE, MAX_WORKERS, REGADOR_MAX, TROUGH_MAX, FEEDER_MAX, FEED_VALUE } from './config.js';
import { harvestCrop } from './actions.js';

const NAMES = ['Zé', 'Tião', 'Dito', 'Cida', 'Juca', 'Neusa', 'Bento', 'Lurdes', 'Chico', 'Rita'];
const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function hireWorker(g, task = 'colher') {
  if (g.workers.length >= MAX_WORKERS) return null;
  const used = new Set(g.workers.map(w => w.name));
  const name = NAMES.find(n => !used.has(n) && g.rng.chance(0.5)) || NAMES.find(n => !used.has(n));
  const s = g.world.spawn;
  const w = { id: g.nextId++, name, task, x: s.x + g.rng.range(-1, 1), y: s.y + 0.5, fx: 0, fy: 1, path: [], target: -1, timer: 0, water: REGADOR_MAX, step: 0, moving: false, status: 'chegando' };
  g.workers.push(w);
  return w;
}
export function fireWorker(g, id) { g.workers = g.workers.filter(w => w.id !== id); }

// Diária paga à meia-noite. Sem dinheiro, o peão vai embora.
export function workersDay(g) {
  for (const w of [...g.workers]) {
    if (g.money >= WAGE) { g.money -= WAGE; g.stats.spent += WAGE; }
    else { fireWorker(g, w.id); g.notify(`${w.name} foi embora: faltou dinheiro para a diária.`, 'bad'); }
  }
}

const walkable = (wd, x, y) => wd.walkablePlayer(x, y) || (wd.inside(x, y) && wd.obj[wd.idx(x, y)] === O.GATE);

// Caminho pelos tiles onde gente anda (porteiras abrem).
function bfs(wd, sx, sy, goal, maxN = 6000) {
  const start = wd.idx(sx, sy);
  const prev = new Map([[start, -1]]);
  const q = [start];
  for (let qi = 0; qi < q.length && qi < maxN; qi++) {
    const i = q[qi], x = i % wd.w, y = (i / wd.w) | 0;
    if (goal(i, x, y)) {
      const path = [];
      for (let c = i; c !== start; c = prev.get(c)) path.push(c);
      return { path: path.reverse(), end: i };
    }
    for (const [dx, dy] of DIRS4) {
      const nx = x + dx, ny = y + dy;
      if (!walkable(wd, nx, ny)) continue;
      const j = wd.idx(nx, ny);
      if (prev.has(j)) continue;
      prev.set(j, i); q.push(j);
    }
  }
  return null;
}

function adjacentIdx(wd, x, y, test) {
  for (const [dx, dy] of DIRS4) {
    const nx = x + dx, ny = y + dy;
    if (wd.inside(nx, ny) && test(wd.idx(nx, ny))) return wd.idx(nx, ny);
  }
  return -1;
}

// Escolhe o próximo serviço. Devolve { path, job } ou null.
function findJob(g, k) {
  const wd = g.world;
  const sx = Math.floor(k.x), sy = Math.floor(k.y);
  const claimed = new Set(g.workers.filter(o => o !== k).map(o => o.job?.i));
  if (k.task === 'colher') {
    const r = bfs(wd, sx, sy, i => { const c = wd.crops.get(i); return c && c.ripe && !c.dead && !claimed.has(i); });
    return r && { path: r.path, job: { kind: 'colher', i: r.end } };
  }
  if (k.task === 'regar') {
    if (k.water <= 0) {
      const r = bfs(wd, sx, sy, (i, x, y) => wd.nearWater(x, y));
      return r && { path: r.path, job: { kind: 'encher', i: r.end } };
    }
    const r = bfs(wd, sx, sy, i => {
      const c = wd.crops.get(i);
      return c && !c.dead && !c.ripe && wd.moist[i] < CROPS[c.type].water && !claimed.has(i);
    });
    return r && { path: r.path, job: { kind: 'regar', i: r.end } };
  }
  if (k.task === 'tratar') {
    const hasFeed = (g.inv.racao || 0) + (g.inv.milho || 0) > 0;
    const r = bfs(wd, sx, sy, (i, x, y) => adjacentIdx(wd, x, y, j => {
      if (claimed.has(j)) return false;
      if (hasFeed && wd.feeders.has(j) && wd.feeders.get(j).food < FEEDER_MAX * 0.5) return true;
      return wd.troughs.has(j) && wd.troughs.get(j).water < TROUGH_MAX * 0.5;
    }) >= 0);
    if (!r) return null;
    const x = r.end % wd.w, y = (r.end / wd.w) | 0;
    const j = adjacentIdx(wd, x, y, j => (hasFeed && wd.feeders.has(j) && wd.feeders.get(j).food < FEEDER_MAX * 0.5) || (wd.troughs.has(j) && wd.troughs.get(j).water < TROUGH_MAX * 0.5));
    if (wd.troughs.has(j) && k.water <= 0) {
      const rw = bfs(wd, sx, sy, (i, x2, y2) => wd.nearWater(x2, y2));
      return rw && { path: rw.path, job: { kind: 'encher', i: rw.end } };
    }
    return { path: r.path, job: { kind: wd.troughs.has(j) ? 'bebedouro' : 'cocho', i: j } };
  }
  return null;
}

function doJob(g, k) {
  const wd = g.world, j = k.job;
  if (!j) return;
  if (j.kind === 'colher') {
    const c = wd.crops.get(j.i);
    if (c && c.ripe && !c.dead) harvestCrop(g, j.i);
  } else if (j.kind === 'encher') k.water = REGADOR_MAX;
  else if (j.kind === 'regar') {
    if (k.water > 0) { k.water--; wd.moist[j.i] = Math.min(1, wd.moist[j.i] + 0.55); }
  } else if (j.kind === 'bebedouro') {
    const t = wd.troughs.get(j.i);
    if (t) { const add = Math.min(TROUGH_MAX - t.water, k.water); t.water += add; k.water -= add; }
  } else if (j.kind === 'cocho') {
    const f = wd.feeders.get(j.i);
    const src = (g.inv.racao || 0) > 0 ? 'racao' : (g.inv.milho || 0) > 0 ? 'milho' : null;
    if (f && src) {
      const n = Math.min(g.inv[src], 5, Math.floor((FEEDER_MAX - f.food) / FEED_VALUE));
      g.inv[src] -= n; f.food += n * FEED_VALUE;
    }
  }
}

// Por quadro. dt = segundos reais já escalados pela velocidade do jogo.
export function updateWorkers(g, dt, hour) {
  const wd = g.world;
  for (const k of g.workers) {
    k.moving = false;
    if (k.path.length) {
      const i = k.path[0];
      const tx = (i % wd.w) + 0.5, ty = ((i / wd.w) | 0) + 0.5;
      const dx = tx - k.x, dy = ty - k.y, d = Math.hypot(dx, dy);
      const sp = Math.min(d, 3.2 * dt);
      if (d > 0.001) { k.x += dx / d * sp; k.y += dy / d * sp; k.fx = dx / d; k.fy = dy / d; }
      k.step += sp * 5; k.moving = true;
      if (d - sp < 0.01) k.path.shift();
      continue;
    }
    if (k.timer > 0) { k.timer -= dt; if (k.timer <= 0 && k.job) { doJob(g, k); k.job = null; } continue; }
    const working = hour >= 6 && hour < 17;
    if (!working) {
      // fim do expediente: volta para perto da casa
      const s = wd.spawn;
      if (Math.hypot(k.x - s.x, k.y - s.y) > 2.5) {
        const r = bfs(wd, Math.floor(k.x), Math.floor(k.y), (i, x, y) => Math.hypot(x + 0.5 - s.x, y + 0.5 - s.y) < 2);
        if (r) k.path = r.path;
      }
      k.status = 'descansando'; k.timer = 3; k.job = null;
      continue;
    }
    const found = findJob(g, k);
    if (!found) { k.status = 'sem serviço'; k.timer = 4; continue; }
    k.job = found.job; k.path = found.path;
    k.status = { colher: 'colhendo', regar: 'regando', encher: 'enchendo o regador', bebedouro: 'enchendo bebedouro', cocho: 'pondo ração' }[found.job.kind];
    k.timer = 1.1; // tempo do serviço ao chegar
  }
}
