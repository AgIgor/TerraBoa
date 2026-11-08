// Liga tudo: jogo, desenho, interface e controles.
import { TOOLS, REACH, LASSO_REACH, MIN_PER_SEC, SPEED, BUSH_SLOW, G, O, ANIMALS, ITEMS } from './config.js';
import { burst, treeFall, shakeTile, fx } from './fx.js';
import { unlock, sfx, ambient, footstep, animalCall, soundOn, setSound, audioDebug } from './sound.js';
import { newGame, advance, dayOf, hourOf } from './game.js';
import * as Saves from './saves.js';
import { updateAnimals } from './animals.js';
import { useTool, animalAt, toggleMount as toggleMountAt, pickEggsAt } from './actions.js';
import { Net } from './net.js';
import { updateWorkers } from './workers.js';
import { Renderer } from './render.js';
import { UI } from './ui.js';

// Converte saves antigos em fazendas e abre a última jogada (ou um mapa novo) ao fundo da tela inicial.
Saves.migrate();
let g = (Saves.lastId() && Saves.loadFarm(Saves.lastId())) || newGame();
let started = false; // só salva depois que o jogador entrou numa fazenda
const R = new Renderer(document.getElementById('game'));
const ui = new UI(g);
hook(g);
ui.refreshTools();
ui.showTitle();

function hook(game) {
  game.onNotify = (t, k) => { ui.toast(t, k); net.relay(t, k); if (k === 'bad') sfx('aviso'); else if (k === 'good') sfx('bom'); };
}

// ---------- jogar junto ----------
const net = new Net({
  game: () => g,
  setGame: ng => { setGame(ng); started = true; ui.started = true; ui.hideTitle(); ui.close(); },
  toast: (t, k) => ui.toast(t, k),
  left: reason => { backHome(); ui.toast(reason, 'bad'); },
  changed: () => { if (ui.panel === 'menu') ui.render(); },
  result: (req, r) => {
    if (req?.before) actionFx(req.tool, req.t, req.before, r || {});
    if (!r) return;
    if (r.open === 'market') { ui.open('mercado', { atCoop: true, force: true }); return; }
    if (r.msg) ui.toast(r.msg, r.kind);
    ui.refreshTools();
  },
  cmdResult: r => ui.cmdResult(r),
  speed: sp => ui.setSpeed(sp),
  speedShown: () => ui.syncSpeed(),
});
ui.net = net;
// saiu da sala (ou ela caiu): volta para a própria fazenda, que nunca foi tocada
function backHome() {
  const own = (Saves.lastId() && Saves.loadFarm(Saves.lastId())) || newGame();
  setGame(own);
  started = false; ui.started = false;
  ui.showTitle();
}
ui.onNet = async (act, d) => {
  if (act === 'nethost') {
    if (net.isClient) return ui.toast('Saia da sala do amigo antes de abrir a sua.', 'bad');
    if (!g.farmId || g.remote) return ui.toast('Abra uma fazenda sua para receber amigos.', 'bad');
    ui.toast('Abrindo sala…');
    try {
      g.player.name = d.name;
      const code = await net.host(d.name);
      save(true);
      ui.toast(`Sala ${code} aberta. Passe o código para quem vai jogar.`, 'good');
    } catch (e) { ui.toast(e.message, 'bad'); }
    if (ui.panel === 'menu') ui.render();
    return;
  }
  if (act === 'netjoin') {
    if (net.isHost) { ui.toast('Feche a sua sala antes de entrar em outra.', 'bad'); return false; }
    save(true); // guarda a fazenda própria antes de sair dela
    try {
      await net.join(d.code, d.name);
      ui.toast(`Você entrou na fazenda ${g.farmName || 'do amigo'}. Bom trabalho!`, 'good');
      return true;
    } catch (e) {
      ui.netError = e.message;
      ui.toast(e.message, 'bad');
      return false;
    }
  }
  if (act === 'netleave') {
    if (net.isClient) { net.leave(); backHome(); ui.toast('Você saiu da sala.'); }
    else if (net.isHost) { net.leave(); ui.toast('Sala fechada.'); if (ui.panel === 'menu') ui.render(); }
  }
};
function setGame(ng) {
  g = ng; hook(g); ui.setGame(g);
  lastDay = dayOf(g); tipPin = null; R.camInit = false; keys.clear();
}
function enter() { started = true; ui.started = true; }
ui.onTitle = (act, arg) => {
  if ((act === 'new' || act === 'load') && net.active) net.leave();
  if (act === 'continue') {
    if (!g.farmId) { const id = Saves.lastId(); if (id) setGame(Saves.loadFarm(id)); }
    enter(); return true;
  }
  if (act === 'new') {
    save(); // guarda a fazenda que estava aberta antes de trocar
    setGame(newGame(arg.seed));
    const r = Saves.createFarm(g, arg.name, ui.thumb(g));
    enter();
    if (!r.ok) ui.toast(r.reason, 'bad');
    else ui.toast(`${g.farmName}: boa sorte na roça!`, 'good');
    setTimeout(() => ui.open('menu', { tab: 'ajuda' }), 400);
    return true;
  }
  if (act === 'load') {
    if (started && arg === g.farmId) { enter(); return true; }
    save();
    const ng = Saves.loadFarm(arg);
    if (!ng) { ui.toast('Não foi possível abrir essa fazenda.', 'bad'); return false; }
    setGame(ng); enter();
    ui.toast(`${g.farmName} carregada.`, 'good');
    return true;
  }
  if (act === 'deleted') { started = false; ui.started = false; g.farmId = null; }
};
ui.onSave = save;

// Salva a fazenda aberta. Miniatura só quando pedido (manual) ou uma vez por dia.
function save(withThumb = false) {
  if (!started || !g.farmId || g.remote) return { ok: true }; // convidado nunca salva a fazenda do anfitrião

  return Saves.saveFarm(g, withThumb ? ui.thumb(g) : undefined);
}
window.addEventListener('beforeunload', () => { if (net.isHost) net.broadcast({ t: 'bye' }); save(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); net.hostVisible(!document.hidden); });

// ---------- entrada ----------
addEventListener('pointerdown', () => unlock(), true);
addEventListener('keydown', () => unlock(), true);
R.onThunder = () => sfx('trovao');
const soundBtn = document.getElementById('soundBtn');
function showSound() { if (soundBtn) soundBtn.querySelector('span').textContent = soundOn() ? '🔊' : '🔇'; }
if (soundBtn) soundBtn.onclick = () => { setSound(!soundOn()); unlock(); showSound(); ui.toast(soundOn() ? 'Som ligado' : 'Som desligado'); };
showSound();
ui.onSound = showSound;
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
  if (net.isClient) { net.act('mount', { x: 0, y: 0 }); return; }
  const r = toggleMountAt(g);
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
  const snd = new Set();
  const msg = r.msg || '';
  if (r.kind === 'bad') snd.add('erro');
  for (const b of before) {
    const o = w.obj[b.i], gr = w.ground[b.i];
    const crop = w.crops.get(b.i), harv = crop ? crop.harvests : -1;
    if (b.o === O.TREE && o === O.TREE && b.x === t.x && b.y === t.y && tool === 'machado') snd.add('machado');
    else if (b.o === O.TREE && o !== O.TREE) snd.add('arvore');
    else if (b.o === O.BUSH && o !== O.BUSH) snd.add('mato');
    else if (b.o === O.ROCK) snd.add('pedra');
    else if (b.o !== o && o !== O.NONE) snd.add('construir');
    else if (b.o !== o && o === O.NONE) snd.add('desmontar');
    if (b.gr !== gr && gr === G.TILLED) snd.add('enxada');
    else if (b.gr !== gr && gr === G.PASTURE) snd.add('plantar');
    else if (b.gr !== gr) snd.add('enxada');
    if (b.crop === -1 && harv === 0) snd.add('plantar');
    if (b.crop >= 0 && (harv === -1 || harv > b.crop)) snd.add('colher');
    if (tool === 'regador' && w.moist[b.i] > b.m + 0.3) snd.add('agua');
  }
  if (tool === 'regador' && /cheio|Apagou/.test(msg)) snd.add(/cheio/.test(msg) ? 'encher' : 'agua');
  if (/ovos/.test(msg)) snd.add('ovos');
  if (/Ordenhou/.test(msg)) snd.add('leite');
  if (/Tosquiou/.test(msg)) snd.add('tosquia');
  if (/Fertilidade/.test(msg)) snd.add('adubo');
  if (tool === 'laco' && r.kind !== 'bad') snd.add('laco');
  if (/Laçou|Levando/.test(msg)) { snd.add('laco'); setTimeout(() => sfx('pegou'), 250); }
  if (/Errou o laço/.test(msg)) { snd.delete('erro'); snd.add('laco'); }
  if (/Montou/.test(msg)) animalCall('cavalo', true, 0.8);
  if (/dormiu|Bom dia/.test(msg)) snd.add('bom');
  if (snd.size > 1) snd.delete('erro');
  for (const k of snd) sfx(k);
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
  // convidado: o anfitrião faz e devolve o resultado (efeitos aparecem quando voltar)
  if (net.isClient) { net.act('use', { tool, x: t.x, y: t.y, px: t.px, py: t.py, opts }, { tool, t, before }); return; }
  const r = useTool(g, tool, t.x, t.y, t.px, t.py, opts);
  net.markAround(t.x, t.y);
  if (r?.slept && net.isHost) { net.note(`${g.player.name || 'O anfitrião'} foi dormir. Bom dia!`, 'good'); net.sendWorld(); }
  if (r && r.ok !== false && before) actionFx(tool, t, before, r);
  else if (r?.kind === 'bad') sfx('erro');
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
  const st0 = Math.floor(p.step / Math.PI);
  p.step += Math.hypot(sx, sy) * (p.mount ? 3 : 5);
  if (Math.floor(p.step / Math.PI) !== st0 && !(p.mount?.kind === 'trator')) footstep(g);
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
  if (!w.drops.some(d => d.x === ex && d.y === ey)) { eggAsk = null; return; }
  if (net.isClient) { const k = ex + ',' + ey; if (eggAsk !== k) { eggAsk = k; net.act('eggs', { x: ex, y: ey }); } return; }
  const r = pickEggsAt(g, ex, ey);
  if (r?.msg) { ui.toast(r.msg, r.kind); sfx('ovos'); }
}

let eggAsk = null;
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
  // em sala, painel aberto não pausa o jogo (os outros continuam jogando)
  const running = !g.paused && (net.active || !ui.isOpen());
  if (net.isClient) { /* o anfitrião simula; aqui só suaviza o que chega */ }
  else if (running) {
    updateAnimals(g, dt * Math.sqrt(g.speed));
    updateWorkers(g, dt * Math.sqrt(g.speed), hourOf(g));
    advance(g, dt * MIN_PER_SEC * g.speed);
  } else updateAnimals(g, 0);
  net.update(dt);
  ambient(g, dt, fx, { paused: !running && !net.isClient });
  if (dayOf(g) !== lastDay) { lastDay = dayOf(g); const r = save(true); if (r && !r.ok) ui.toast(r.reason, 'bad'); }

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
window.__net = net;
window.__snd = { sfx, animalCall, ambient: (dt) => ambient(g, dt, fx), debug: audioDebug };
