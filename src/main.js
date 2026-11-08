// Liga tudo: jogo, desenho, interface e controles.
import { TOOLS, REACH, LASSO_REACH, MIN_PER_SEC, SPEED } from './config.js';
import { newGame, advance, serialize, deserialize, dayOf, hourOf, SAVE_KEY } from './game.js';
import { updateAnimals } from './animals.js';
import { useTool, animalAt, ledAnimal, mountAt, dismount } from './actions.js';
import { updateWorkers } from './workers.js';
import { Renderer } from './render.js';
import { UI } from './ui.js';

let g = load() || newGame();
const R = new Renderer(document.getElementById('game'));
const ui = new UI(g);
hook(g);
ui.refreshTools();
if (!g.flags.welcomed) {
  g.flags.welcomed = true;
  setTimeout(() => ui.open('menu'), 300);
}

function hook(game) {
  game.onNotify = (t, k) => ui.toast(t, k);
}
ui.onSave = save;
ui.onNew = () => {
  try { localStorage.removeItem(SAVE_KEY); } catch {}
  g = newGame(); hook(g); ui.setGame(g);
  g.flags.welcomed = true;
  ui.toast('Novo jogo. Boa sorte na roça!', 'good');
};

function save() {
  try { localStorage.setItem(SAVE_KEY, serialize(g)); } catch (e) { console.warn('save falhou', e); }
}
function load() {
  try {
    const s = localStorage.getItem(SAVE_KEY);
    return s ? deserialize(s) : null;
  } catch (e) { console.warn('save inválido', e); return null; }
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
  if (e.target.tagName === 'INPUT') return;
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
cv.addEventListener('pointerleave', () => { mouse.inside = false; ui.tip(0, 0, null); });
cv.addEventListener('pointerdown', e => {
  if (e.pointerType === 'touch' && joy.id === e.pointerId) return;
  mouse.x = e.clientX; mouse.y = e.clientY; mouse.down = true; mouse.inside = true;
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
  mouse.lastTile = key;
  doUse(tool, t);
}
function doUse(tool, t) {
  const p = g.player;
  const dx = t.x + 0.5 - p.x, dy = t.y + 0.5 - p.y;
  if (Math.hypot(dx, dy) > 0.3) { const l = Math.hypot(dx, dy); p.fx = dx / l; p.fy = dy / l; }
  const r = useTool(g, tool, t.x, t.y, t.px, t.py);
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
  const speed = p.mount ? SPEED[p.mount.kind] : p.sneak ? SPEED.sneak : SPEED.walk;
  if (p.mount) p.sneak = false;
  const sx = mx * speed * dt, sy = my * speed * dt;
  const free = (x, y) => {
    const r = 0.26;
    for (const [cx, cy] of [[x - r, y - 0.18], [x + r, y - 0.18], [x - r, y + 0.12], [x + r, y + 0.12]])
      if (!w.walkablePlayer(Math.floor(cx), Math.floor(cy))) return false;
    return true;
  };
  if (free(p.x + sx, p.y)) p.x += sx;
  if (free(p.x, p.y + sy)) p.y += sy;
  p.x = Math.max(0.3, Math.min(w.w - 0.3, p.x));
  p.y = Math.max(0.3, Math.min(w.h - 0.2, p.y));
  p.step += Math.hypot(sx, sy) * (p.mount ? 3 : 5);
  if (p.mount?.kind === 'trator') { const v = g.vehicles.find(v => v.id === p.mount.id); if (v) { v.x = p.x; v.y = p.y; v.fx = p.fx; } }
  // pega ovos ao passar por cima
  const ex = Math.floor(p.x), ey = Math.floor(p.y);
  const e = w.drops.findIndex(d => d.x === ex && d.y === ey);
  if (e >= 0) { const n = w.drops[e].n; w.drops.splice(e, 1); g.inv.ovos = (g.inv.ovos || 0) + n; ui.toast(`+${n} ovos`, 'good'); }
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
    if (mouse.inside && !ui.isOpen() && !isTouch) ui.tip(mouse.x, mouse.y, ui.tileInfo(target.x, target.y, hoverAnimal));
    else ui.tip(0, 0, null);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// para depurar no console
window.__game = () => g;
window.__R = R;
