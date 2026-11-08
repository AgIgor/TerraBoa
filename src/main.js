// Liga tudo: jogo, desenho, interface e controles.
import { TOOLS, REACH, LASSO_REACH, MIN_PER_SEC, SPEED, BUSH_SLOW, G, O } from './config.js';
import { burst, treeFall, shakeTile } from './fx.js';
import { newGame, advance, dayOf, hourOf } from './game.js';
import * as Saves from './saves.js';
import { updateAnimals } from './animals.js';
import { useTool, animalAt, mountAt, dismount } from './actions.js';
import { updateWorkers } from './workers.js';
import { Renderer } from './render.js';
import { UI } from './ui.js';

// Começa com o save automático (ou um mapa novo) desenhado ao fundo da tela inicial.
let g = Saves.loadFrom(Saves.AUTO) || newGame();
let started = false; // só salva depois que o jogador entrou no jogo
const R = new Renderer(document.getElementById('game'));
const ui = new UI(g);
hook(g);
ui.refreshTools();
ui.showTitle();

function hook(game) {
  game.onNotify = (t, k) => ui.toast(t, k);
}
function setGame(ng) {
  g = ng; hook(g); ui.setGame(g);
  lastDay = dayOf(g); tipPin = null; R.camInit = false; keys.clear();
}
ui.onTitle = (act, arg) => {
  if (act === 'continue') { started = true; return true; }
  if (act === 'new') {
    const seed = /^\d+$/.test(arg || '') ? +arg : undefined;
    setGame(newGame(seed));
    started = true; save();
    ui.toast('Novo jogo. Boa sorte na roça!', 'good');
    setTimeout(() => ui.open('menu', { tab: 'ajuda' }), 400);
    return true;
  }
  if (act === 'load') return loadSlot(arg);
};
function loadSlot(key) {
  const ng = Saves.loadFrom(key);
  if (!ng) { ui.toast('Não foi possível abrir esse save.', 'bad'); return false; }
  setGame(ng); started = true;
  if (key !== Saves.AUTO) save(); // o carregado vira o jogo atual do automático
  return true;
}
ui.onLoadSlot = loadSlot;
ui.onSave = save;

function save() {
  if (started) Saves.saveTo(Saves.AUTO, g);
}
window.addEventListener('beforeunload', save);
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

// ---------- entrada ----------
const keys = new Set();
const mouse = { x: innerWidth / 2, y: innerHeight / 2, down: false, inside: false, lastTile: null };
const joy = { active: false, dx: 0, dy: 0, id: null };
const isTouch = matchMedia('(pointer: coarse)').matches;
if (isTouch) document.body.classList.add('touch');

addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || ui.titleOpen) return;
  const k = e.key.toLowerCase();
  if (k === 'escape') { if (ui.isOpen()) ui.close(); else if (R.overlay) setOverlay(null); return; }
  if (ui.isOpen() && !['m', 't', 'f', 'h'].includes(k)) return;
  keys.add(k);
  if (k >= '1' && k <= '8') ui.selectTool(+k - 1);
  else if (k === 'q') ui.cycle(-1);
  else if (k === 'r') ui.cycle(1);
  else if (k === ' ') { e.preventDefault(); act(TOOLS[g.player.tool].id, true); }
  else if (k === 'e') act('mao', true);
  else if (k === 'm') ui.open('mercado', { atCoop: nearCoop() });
  else if (k === 't') ui.open('tempo');
  else if (k === 'f') ui.open('fazenda');
  else if (k === 'h') ui.open('menu');
  else if (k === 'l') cycleOverlay();
  else if (k === 'p') ui.setSpeed(0);
  else if (k === 'x') toggleMount();
});
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());

const cv = R.cv;
cv.addEventListener('pointermove', e => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.inside = true; if (mouse.down) dragUse(); });
cv.addEventListener('pointerleave', () => { mouse.inside = false; });
cv.addEventListener('pointerdown', e => {
  if (e.pointerType === 'touch' && joy.id === e.pointerId) return;
  mouse.x = e.clientX; mouse.y = e.clientY; mouse.down = true; mouse.inside = true;
  pinTip();
  if (e.button === 2) { act('mao', false); mouse.down = false; return; }
  mouse.lastTile = null;
  dragUse(true);
});
addEventListener('pointerup', () => { mouse.down = false; mouse.lastTile = null; });
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('wheel', e => {
  e.preventDefault();
  R.zoom = Math.max(1, Math.min(3.5, R.zoom * (e.deltaY > 0 ? 0.9 : 1.1)));
}, { passive: false });

// joystick e botões de toque
const joyEl = document.getElementById('joy');
joyEl.addEventListener('pointerdown', e => { joy.active = true; joy.id = e.pointerId; joyEl.setPointerCapture(e.pointerId); joyMove(e); });
joyEl.addEventListener('pointermove', e => { if (joy.active) joyMove(e); });
joyEl.addEventListener('pointerup', () => { joy.active = false; joy.dx = joy.dy = 0; joyEl.firstElementChild.style.transform = ''; });
function joyMove(e) {
  const r = joyEl.getBoundingClientRect();
  let dx = (e.clientX - r.left - r.width / 2) / (r.width / 2), dy = (e.clientY - r.top - r.height / 2) / (r.height / 2);
  const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
  joy.dx = dx; joy.dy = dy;
  joyEl.firstElementChild.style.transform = `translate(${dx * 40}px, ${dy * 40}px)`;
}
document.getElementById('tUse').onclick = () => act(TOOLS[g.player.tool].id, true);
document.getElementById('tHand').onclick = () => act('mao', true);
document.getElementById('tMount').onclick = () => toggleMount();

function toggleMount() {
  const p = g.player;
  let r;
  if (p.mount) r = dismount(g);
  else {
    // monta no trator ou cavalo mais perto
    const cands = [...g.vehicles, ...g.animals.filter(a => a.sp === 'cavalo' && a.owned && !a.led)]
      .map(o => [o, Math.hypot(o.x - p.x, o.y - p.y)]).filter(([, d]) => d < 2).sort((a, b) => a[1] - b[1]);
    r = cands.length ? mountAt(g, cands[0][0].x, cands[0][0].y) : null;
    if (!r) r = { msg: 'Nada para montar aqui. Chegue perto de um cavalo seu ou do trator.', kind: 'bad' };
  }
  if (r?.msg) ui.toast(r.msg, r.kind);
}
document.getElementById('layerBtn').onclick = cycleOverlay;

const OVERLAYS = [null, 'umidade', 'fertilidade', 'capim'];
const OV_NAME = { umidade: 'Umidade', fertilidade: 'Fertilidade', capim: 'Capim' };
function cycleOverlay() { setOverlay(OVERLAYS[(OVERLAYS.indexOf(R.overlay) + 1) % OVERLAYS.length]); }
function setOverlay(o) {
  R.overlay = o;
  document.getElementById('layerLabel').textContent = o ? OV_NAME[o] : 'Solo';
  document.getElementById('layerBtn').classList.toggle('on', !!o);
  if (o) ui.toast(`Mapa de ${OV_NAME[o].toLowerCase()} (L troca, Esc fecha)`);
}

function nearCoop() {
  const b = g.world.buildings.find(b => b.kind === 'coop');
  return b && Math.hypot(g.player.x - (b.x + b.w / 2), g.player.y - (b.y + b.h)) < 3.2;
}

// Tile alvo: o do mouse se estiver ao alcance; senão o da frente do jogador.
function mouseTarget() {
  const wp = R.toWorld(mouse.x, mouse.y);
  return { x: Math.floor(wp.x), y: Math.floor(wp.y), px: wp.x, py: wp.y };
}
function frontTarget() {
  const p = g.player;
  const fx = Math.round(p.fx), fy = Math.round(p.fy);
  return { x: Math.floor(p.x + fx * 0.8), y: Math.floor(p.y - 0.2 + fy * 0.8), px: p.x + fx, py: p.y + fy };
}
function inReach(t, tool) {
  const p = g.player;
  const range = tool === 'laco' ? LASSO_REACH : REACH;
  return Math.hypot(t.x + 0.5 - p.x, t.y + 0.5 - (p.y - 0.2)) <= range;
}

function act(tool, keyboard) {
  let t = !keyboard || isTouch ? null : (mouse.inside ? mouseTarget() : null);
  if (keyboard && t && !inReach(t, tool)) t = null;
  if (!t) t = keyboard ? frontTarget() : mouseTarget();
  if (!inReach(t, tool)) { ui.toast('Longe demais. Chegue mais perto.', 'bad'); return; }
  doUse(tool, t);
}
function dragUse(first) {
  const t = mouseTarget();
  const tool = TOOLS[g.player.tool].id;
  const key = t.x + ',' + t.y;
  if (!first && (mouse.lastTile === key || ['mao', 'laco', 'machado'].includes(tool))) return;
  if (!inReach(t, tool)) { if (first) ui.toast('Longe demais. Chegue mais perto.', 'bad'); return; }
  // a enxada decide no primeiro tile do arraste: começou em terra arada = desfazer, senão = arar
  if (first && tool === 'enxada') {
    const w = g.world, i = w.idx(t.x, t.y);
    mouse.hoeMode = w.inside(t.x, t.y) && w.ground[i] === G.TILLED && !w.crops.has(i) ? 'untill' : 'till';
  }
  mouse.lastTile = key;
  doUse(tool, t, tool === 'enxada' ? { hoeMode: mouse.hoeMode } : {});
}
// guarda o estado dos tiles em volta para saber o que a ação mudou (efeitos visuais)
function snapTiles(w, x, y) {
  const out = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!w.inside(x + dx, y + dy)) continue;
    const i = w.idx(x + dx, y + dy);
    out.push({ x: x + dx, y: y + dy, i, o: w.obj[i], gr: w.ground[i], crop: w.crops.get(i)?.harvests ?? (w.crops.has(i) ? 0 : -1), m: w.moist[i] });
  }
  return out;
}
function actionFx(tool, t, before, r) {
  const w = g.world;
  for (const b of before) {
    const o = w.obj[b.i], gr = w.ground[b.i], cx = b.x + 0.5, cy = b.y + 0.6;
    const crop = w.crops.get(b.i), harv = crop ? crop.harvests : -1;
    if (b.o === O.TREE && o === O.TREE && b.x === t.x && b.y === t.y && tool === 'machado') { shakeTile(b.i); burst(cx, cy, 'madeira', 7, 12); burst(cx, cy - 0.6, 'folha', 3, 34, 0.6, 10); }
    else if (b.o === O.TREE && o !== O.TREE) treeFall(cx, cy);
    else if (b.o === O.BUSH && o !== O.BUSH) burst(cx, cy, 'folha', 14, 10, 0.4, 50);
    else if (b.o === O.ROCK) { if (o === O.ROCK) shakeTile(b.i); burst(cx, cy, 'pedra', o === O.ROCK ? 6 : 14, 8); }
    else if (b.o !== o && o !== O.NONE) burst(cx, cy, 'poeira', 6, 2, 0.4, 16);   // construiu
    else if (b.o !== o && o === O.NONE) burst(cx, cy, 'madeira', 8, 8);            // desmontou
    if (b.gr !== gr && gr === G.TILLED) burst(cx, cy, 'terra', 7, 3);
    else if (b.gr !== gr && gr === G.PASTURE) burst(cx, cy, 'semente', 6, 10, 0.4, 20);
    else if (b.gr !== gr) burst(cx, cy, 'terra', 5, 3);
    if (b.crop === -1 && harv === 0) burst(cx, cy, 'semente', 5, 10, 0.3, 20);       // plantou
    if (b.crop >= 0 && (harv === -1 || harv > b.crop)) burst(cx, cy - 0.2, 'palha', 9, 14); // colheu ou limpou
    if (tool === 'regador' && w.moist[b.i] > b.m + 0.3) burst(cx, cy, 'agua', 10, 14, 0.4, 25);
  }
  if (tool === 'regador' && /cheio/.test(r.msg || '')) burst(t.x + 0.5, t.y + 0.5, 'agua', 12, 2, 0.4, 60);
  if (/ovos/.test(r.msg || '')) burst(t.x + 0.5, t.y + 0.6, 'palha', 6, 4);
  if (/lã/.test(r.msg || '')) burst(t.px, t.py, 'la', 14, 14, 0.5, 30);
}

function doUse(tool, t, opts = {}) {
  const p = g.player;
  const dx = t.x + 0.5 - p.x, dy = t.y + 0.5 - p.y;
  if (Math.hypot(dx, dy) > 0.3) { const l = Math.hypot(dx, dy); p.fx = dx / l; p.fy = dy / l; }
  const w = g.world, inside = w.inside(t.x, t.y);
  const before = inside ? snapTiles(w, t.x, t.y) : null;
  const r = useTool(g, tool, t.x, t.y, t.px, t.py, opts);
  if (r && r.ok !== false && before) actionFx(tool, t, before, r);
  if (!r) return;
  if (r.open === 'market') { ui.open('mercado', { atCoop: true, force: true }); return; }
  if (r.slept) save();
  if (r.msg) ui.toast(r.msg, r.kind);
  ui.refreshTools();
}

// ---------- movimento ----------
function movePlayer(dt) {
  const p = g.player, w = g.world;
  let mx = 0, my = 0;
  if (!ui.isOpen()) {
    if (keys.has('a') || keys.has('arrowleft')) mx -= 1;
    if (keys.has('d') || keys.has('arrowright')) mx += 1;
    if (keys.has('w') || keys.has('arrowup')) my -= 1;
    if (keys.has('s') || keys.has('arrowdown')) my += 1;
    if (joy.active) { mx = joy.dx; my = joy.dy; }
  }
  p.sneak = keys.has('shift') || (joy.active && Math.hypot(joy.dx, joy.dy) < 0.55);
  const l = Math.hypot(mx, my);
  p.moving = l > 0.1;
  if (!p.moving) return;
  if (l > 1) { mx /= l; my /= l; }
  p.fx = mx / Math.max(l, 1e-6); p.fy = my / Math.max(l, 1e-6);
  if (l <= 1) { const k = Math.hypot(p.fx, p.fy); p.fx /= k; p.fy /= k; }
  let speed = p.mount ? SPEED[p.mount.kind] : p.sneak ? SPEED.sneak : SPEED.walk;
  if (w.inBush(p.x, p.y)) speed *= p.mount?.kind === 'cavalo' ? 0.6 : BUSH_SLOW;
  if (p.mount) p.sneak = false;
  const sx = mx * speed * dt, sy = my * speed * dt;
  // pés do jogador: caixa pequena; montado, a caixa é mais larga
  const rx = p.mount ? 0.32 : 0.18;
  const free = (x, y) => w.playerFree(x, y, rx, 0.1, 0.06);
  if (free(p.x + sx, p.y)) p.x += sx;
  if (free(p.x, p.y + sy)) p.y += sy;
  p.x = Math.max(0.3, Math.min(w.w - 0.3, p.x));
  p.y = Math.max(0.3, Math.min(w.h - 0.2, p.y));
  p.step += Math.hypot(sx, sy) * (p.mount ? 3 : 5);
  // mato farfalha; poeira nos pés em chão de terra
  const fi = w.idx(Math.floor(p.x), Math.floor(p.y));
  if (w.obj[fi] === O.BUSH) { shakeTile(fi, 0.12); if (Math.random() < dt * 6) burst(p.x, p.y, 'folha', 1, 10, 0.35, 18); }
  else {
    const gr = w.ground[fi];
    const dusty = gr === G.DIRT || gr === G.PATH || gr === G.YARD || gr === G.TILLED || gr === G.SAND;
    if (dusty && Math.random() < dt * (p.mount ? 12 : 3.5)) burst(p.x - p.fx * 0.2, p.y + 0.05, 'poeira', 1, 1, 0.12, 8);
  }
  if (p.mount?.kind === 'trator') { const v = g.vehicles.find(v => v.id === p.mount.id); if (v) { v.x = p.x; v.y = p.y; v.fx = p.fx; } }
  // pega ovos ao passar por cima
  const ex = Math.floor(p.x), ey = Math.floor(p.y);
  const e = w.drops.findIndex(d => d.x === ex && d.y === ey);
  if (e >= 0) { const n = w.drops[e].n; w.drops.splice(e, 1); g.inv.ovos = (g.inv.ovos || 0) + n; ui.toast(`+${n} ovos`, 'good'); }
}

let tipPin = null;
function pinTip() {
  const t = mouseTarget();
  tipPin = { sx: mouse.x, sy: mouse.y, tx: t.x, ty: t.y, animal: animalAt(g, t.px, t.py, 0.75), until: performance.now() + 7000 };
  hudT = 0;
}

// ---------- laço principal ----------
let last = performance.now(), hudT = 0, lastDay = dayOf(g);
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  movePlayer(dt);
  const running = !g.paused && !ui.isOpen();
  if (running) {
    updateAnimals(g, dt * Math.sqrt(g.speed));
    updateWorkers(g, dt * Math.sqrt(g.speed), hourOf(g));
    advance(g, dt * MIN_PER_SEC * g.speed);
  } else updateAnimals(g, 0);
  if (dayOf(g) !== lastDay) { lastDay = dayOf(g); save(); }

  // alvo e dica
  const tool = TOOLS[g.player.tool].id;
  let target = null, hoverAnimal = null;
  if (mouse.inside && !isTouch) {
    const t = mouseTarget();
    target = { x: t.x, y: t.y, ok: inReach(t, tool) };
    hoverAnimal = animalAt(g, t.px, t.py, 0.75);
  } else {
    const t = frontTarget();
    target = { x: t.x, y: t.y, ok: true };
  }
  R.draw(g, { target, hoverAnimal }, dt, now);

  hudT -= dt;
  if (hudT <= 0) {
    hudT = 0.25;
    ui.update();
    // informações do último tile clicado, num painel fixo no topo; somem depois de alguns segundos
    const pin = tipPin;
    if (pin && !ui.isOpen() && now < pin.until) {
      const a = pin.animal && g.animals.includes(pin.animal) ? pin.animal : null;
      ui.tip(ui.tileInfo(pin.tx, pin.ty, a));
    } else { tipPin = null; ui.tip(null); }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// para depurar no console
window.__game = () => g;
window.__R = R;
