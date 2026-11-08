// Peões contratados: andam pela fazenda e trabalham. Cada tarefa tem uma lista de serviços
// em ordem; sem serviço da principal, o peão ajuda no próximo, para não ficar parado.
import { CROPS, ANIMALS, ITEMS, O, WAGE, MAX_WORKERS, REGADOR_MAX, TROUGH_MAX, FEEDER_MAX, FEED_VALUE, WORK_HOURS, SALE_FEE } from './config.js';
import { harvestCrop } from './actions.js';
import { sell, SELLABLE } from './market.js';

const NAMES = ['Zé', 'Tião', 'Dito', 'Cida', 'Juca', 'Neusa', 'Bento', 'Lurdes', 'Chico', 'Rita'];
const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// ordem dos serviços de cada tarefa
const PLAN = {
  colher: ['colher', 'limpar', 'regar', 'ovos'],
  regar: ['regar', 'bebedouro', 'colher'],
  tratar: ['tratar', 'ovos', 'ordenhar', 'tosquiar', 'colher'],
};
const STATUS = {
  colher: 'colhendo', regar: 'regando', encher: 'enchendo o regador', bebedouro: 'enchendo bebedouro', cocho: 'pondo ração',
  ovos: 'recolhendo ovos', ordenhar: 'ordenhando', tosquiar: 'tosquiando', limpar: 'limpando lavoura morta',
};

export function hireWorker(g, task = 'colher') {
  if (g.workers.length >= MAX_WORKERS) return null;
  const used = new Set(g.workers.map(w => w.name));
  const name = NAMES.find(n => !used.has(n) && g.rng.chance(0.5)) || NAMES.find(n => !used.has(n));
  const s = g.world.spawn;
  const w = { id: g.nextId++, name, task, dest: 'guardar', x: s.x + g.rng.range(-1, 1), y: s.y + 0.5, fx: 0, fy: 1, path: [], target: -1, timer: 0, water: REGADOR_MAX, step: 0, moving: false, status: 'chegando', sold: 0 };
  g.workers.push(w);
  return w;
}
export function fireWorker(g, id) { g.workers = g.workers.filter(w => w.id !== id); }

// Diária paga à meia-noite. Sem dinheiro, o peão vai embora. Avisa o que venderam no dia.
export function workersDay(g) {
  const sold = g.workers.filter(k => k.sold > 0.5);
  if (sold.length) {
    const tot = sold.reduce((s, k) => s + k.sold, 0);
    g.notify(`Peões venderam R$ ${tot.toFixed(2).replace('.', ',')} de produção ontem (${sold.map(k => k.name).join(', ')}).`, 'good');
  }
  for (const k of g.workers) k.sold = 0;
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
const isAdult = a => a.weight >= ANIMALS[a.sp].adultW * 0.85;

// Um tipo de serviço: devolve { path, job } ou null.
function findOne(g, k, kind, claimed) {
  const wd = g.world;
  const sx = Math.floor(k.x), sy = Math.floor(k.y);
  const refill = () => { const r = bfs(wd, sx, sy, (i, x, y) => wd.nearWater(x, y)); return r && { path: r.path, job: { kind: 'encher', i: r.end } }; };
  switch (kind) {
    case 'colher': {
      const r = bfs(wd, sx, sy, i => { const c = wd.crops.get(i); return c && c.ripe && !c.dead && !claimed.has(i); });
      return r && { path: r.path, job: { kind: 'colher', i: r.end } };
    }
    case 'limpar': {
      const r = bfs(wd, sx, sy, i => { const c = wd.crops.get(i); return c && c.dead && !claimed.has(i); }, 3000);
      return r && { path: r.path, job: { kind: 'limpar', i: r.end } };
    }
    case 'regar': {
      const dry = i => { const c = wd.crops.get(i); return c && !c.dead && !c.ripe && wd.moist[i] < CROPS[c.type].water && !claimed.has(i); };
      const r = bfs(wd, sx, sy, dry);
      if (!r) return null;
      if (k.water <= 0) return refill();
      return { path: r.path, job: { kind: 'regar', i: r.end } };
    }
    case 'bebedouro':
    case 'tratar': {
      const hasFeed = kind === 'tratar' && (g.inv.racao || 0) + (g.inv.milho || 0) > 0;
      const want = j => !claimed.has(j) && ((hasFeed && wd.feeders.has(j) && wd.feeders.get(j).food < FEEDER_MAX * 0.5) || (wd.troughs.has(j) && wd.troughs.get(j).water < TROUGH_MAX * 0.5));
      const r = bfs(wd, sx, sy, (i, x, y) => adjacentIdx(wd, x, y, want) >= 0);
      if (!r) return null;
      const x = r.end % wd.w, y = (r.end / wd.w) | 0;
      const j = adjacentIdx(wd, x, y, want);
      if (wd.troughs.has(j) && k.water <= 0) return refill();
      return { path: r.path, job: { kind: wd.troughs.has(j) ? 'bebedouro' : 'cocho', i: j } };
    }
    case 'ovos': {
      if (!wd.drops.length) return null;
      const at = new Set(wd.drops.map(e => wd.idx(e.x, e.y)));
      const r = bfs(wd, sx, sy, i => at.has(i) && !claimed.has(i), 4000);
      return r && { path: r.path, job: { kind: 'ovos', i: r.end } };
    }
    case 'ordenhar':
    case 'tosquiar': {
      const want = a => a.owned && !a.led && !a.ridden && !claimed.has('a' + a.id) && (kind === 'ordenhar'
        ? ANIMALS[a.sp].milk && a.sex === 'f' && isAdult(a) && a.milk >= 2
        : ANIMALS[a.sp].wool && (a.wool || 0) >= 2);
      const list = g.animals.filter(want);
      if (!list.length) return null;
      const spots = new Map();
      for (const a of list) {
        const ax = Math.floor(a.x), ay = Math.floor(a.y);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (wd.inside(ax + dx, ay + dy)) spots.set(wd.idx(ax + dx, ay + dy), a);
      }
      const r = bfs(wd, sx, sy, i => spots.has(i), 4000);
      if (!r) return null;
      const a = spots.get(r.end);
      return { path: r.path, job: { kind, i: r.end, a: a.id } };
    }
  }
  return null;
}

function findJob(g, k) {
  const claimed = new Set();
  for (const o of g.workers) if (o !== k && o.job) { claimed.add(o.job.i); if (o.job.a) claimed.add('a' + o.job.a); }
  for (const kind of PLAN[k.task] || PLAN.colher) {
    const f = findOne(g, k, kind, claimed);
    if (f) return f;
  }
  return null;
}

// Entrega o que o peão produziu: guarda no estoque ou vende direto (com frete).
function deliver(g, k, item, n) {
  if (n <= 0) return;
  if (k.dest === 'vender' && SELLABLE.includes(item)) {
    const v = sell(g.market, item, n) * (1 - SALE_FEE);
    g.money += v; g.stats.earned += v; k.sold = (k.sold || 0) + v;
  } else g.inv[item] = (g.inv[item] || 0) + n;
}

function doJob(g, k) {
  const wd = g.world, j = k.job;
  if (!j) return;
  if (j.kind === 'colher') {
    const c = wd.crops.get(j.i);
    if (c && c.ripe && !c.dead) {
      const item = CROPS[c.type].item, n = harvestCrop(g, j.i);
      if (k.dest === 'vender') { g.inv[item] -= n; deliver(g, k, item, n); }
    }
  } else if (j.kind === 'limpar') {
    const c = wd.crops.get(j.i);
    if (c && c.dead) wd.crops.delete(j.i);
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
      const n = Math.min(g.inv[src], 5, Math.floor((FEEDER_MAX - f.food) / FEED_VALUE[src]));
      g.inv[src] -= n; f.food += n * FEED_VALUE[src];
    }
  } else if (j.kind === 'ovos') {
    const x = j.i % wd.w, y = (j.i / wd.w) | 0;
    const e = wd.drops.findIndex(d => d.x === x && d.y === y);
    if (e >= 0) { const { n, sp } = wd.drops[e]; wd.drops.splice(e, 1); deliver(g, k, ANIMALS[sp || 'galinha'].eggItem, n); }
  } else if (j.kind === 'ordenhar' || j.kind === 'tosquiar') {
    const a = g.animals.find(b => b.id === j.a);
    if (!a || Math.hypot(a.x - k.x, a.y - k.y) > 2.2) return; // o bicho saiu de perto: tenta de novo depois
    const d = ANIMALS[a.sp];
    if (j.kind === 'ordenhar' && a.milk >= 1) { const l = Math.floor(a.milk); a.milk -= l; deliver(g, k, d.milkItem, l); }
    if (j.kind === 'tosquiar' && (a.wool || 0) >= 1) { const kg = Math.floor(a.wool); a.wool -= kg; deliver(g, k, d.woolItem || 'la', kg); }
  }
}

// Sem serviço: dá uma volta curta perto de onde está (não fica plantado).
function stroll(g, k) {
  const wd = g.world, sx = Math.floor(k.x), sy = Math.floor(k.y), r = g.rng;
  const tx = sx + r.int(-3, 3), ty = sy + r.int(-3, 3);
  if (!walkable(wd, tx, ty)) return;
  const p = bfs(wd, sx, sy, (i, x, y) => x === tx && y === ty, 200);
  if (p) k.path = p.path.slice(0, 6);
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
    const working = hour >= WORK_HOURS[0] && hour < WORK_HOURS[1];
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
    if (!found) { k.status = 'sem serviço agora'; k.timer = 1.5; if (g.rng.chance(0.5)) stroll(g, k); continue; }
    k.job = found.job; k.path = found.path;
    k.status = STATUS[found.job.kind] || 'trabalhando';
    k.timer = 0.9; // tempo do serviço ao chegar
  }
}

export { ITEMS };
