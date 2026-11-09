// node test/net.test.mjs — jogar junto com um PeerJS falso (mensagens viram JSON, como na rede).
import { newGame } from '../src/game.js';
import { Net, NET_VERSION } from '../src/net.js';
import { updateAnimals, makeAnimal } from '../src/animals.js';
import { G, O } from '../src/config.js';

let fails = 0;
const check = (c, m) => { console.log((c ? '  ok: ' : '  FALHOU: ') + m); if (!c) fails++; };

// ---- relógio e PeerJS falsos ----
let clock = 1000;
globalThis.performance = { now: () => clock };
const peers = new Map();
class Emitter {
  constructor() { this.ev = {}; }
  on(e, f) { (this.ev[e] ||= []).push(f); return this; }
  once(e, f) { const w = (...a) => { this.off(e, w); f(...a); }; return this.on(e, w); }
  off(e, f) { this.ev[e] = (this.ev[e] || []).filter(x => x !== f); }
  emit(e, ...a) { for (const f of [...(this.ev[e] || [])]) f(...a); }
}
const queue = [];
const flush = () => { while (queue.length) queue.shift()(); };
class Conn extends Emitter {
  constructor(peer, metadata) { super(); this.peer = peer; this.metadata = metadata; this.open = false; }
  send(m) { if (typeof m === 'string') { globalThis.SENT = (globalThis.SENT || 0) + m.length; const t = (m.match(/^\{"t":"(\w+)"/) || [])[1]; (globalThis.BYT ||= {})[t] = ((globalThis.BYT[t]) || 0) + m.length; } const o = this.other, data = JSON.parse(JSON.stringify(m)); if (this.open && !this.dead) queue.push(() => { if (!o.dead) o.emit('data', data); }); }
  close() { if (this.dead) return; this.dead = true; this.open = false; const o = this.other; queue.push(() => { o.dead = true; o.open = false; o.emit('close'); this.emit('close'); }); }
}
let auto = 0;
class Peer extends Emitter {
  constructor(id) { super(); if (typeof id !== 'string') id = 'anon' + (++auto); this.id = id; peers.set(id, this); queue.push(() => this.emit('open', id)); }
  connect(id, opts) {
    const a = new Conn(id, opts.metadata), host = peers.get(id);
    queue.push(() => {
      if (!host) { this.emit('error', { type: 'peer-unavailable' }); return; }
      const b = new Conn(this.id, opts.metadata); a.other = b; b.other = a; a.serialization = b.serialization = opts.serialization || 'binary';
      host.emit('connection', b);
      a.open = b.open = true; b.emit('open'); a.emit('open');
    });
    return a;
  }
  reconnect() {}
  destroy() { peers.delete(this.id); }
}
globalThis.window = { Peer };
globalThis.sessionStorage = { s: {}, getItem(k) { return this.s[k] ?? null; }, setItem(k, v) { this.s[k] = v; } };

function side(g) {
  const log = [];
  const S = { g, log, left: null };
  S.net = new Net({
    game: () => S.g, setGame: ng => { S.g = ng; }, toast: (t) => log.push(t), left: r => { S.left = r; },
    changed() {}, result: (req, r) => { S.last = r; }, cmdResult: r => { S.cmd = r; }, speed: s => { S.g.speed = s; }, speedShown() {},
  });
  return S;
}
const tick = (sides, secs = 0.2) => { for (let t = 0; t < secs; t += 0.05) { clock += 50; for (const s of sides) { s.net.update(0.05); } flush(); } };
const wait = async p => { for (let k = 0; k < 20; k++) { flush(); await Promise.resolve(); } return p; };

console.log('# entrar na sala');
const host = side(newGame(55));
host.g.farmId = 'f1'; host.g.farmName = 'Sítio do Teste';
const hp = host.net.host('Ana'); await wait(); const code = await hp;
check(/^[A-Z0-9]{5}$/.test(code), 'sala criada: ' + code);
const guest = side(newGame(1)); // a fazenda própria do convidado
const own = guest.g;
sessionStorage.s = {};
const jp = guest.net.join(code.toLowerCase(), 'Beto'); await wait(); await jp;
check(guest.g !== own && guest.g.remote && !guest.g.farmId, 'convidado recebeu a fazenda do anfitrião, marcada como remota (não salva)');
check(guest.g.world.w === host.g.world.w && guest.g.seed === host.g.seed, 'mesmo mapa');
check(Object.keys(host.g.others).length === 1 && guest.g.others.host?.name === 'Ana', 'um vê o outro');

console.log('# ação do convidado');
{
  const hw = host.g.world, gp = guest.g.player;
  const x = Math.floor(gp.x) + 1, y = Math.floor(gp.y);
  const i = hw.idx(x, y);
  hw.obj[i] = O.NONE; hw.ground[i] = G.GRASS; hw.crops.delete(i); guest.g.world.obj[i] = O.NONE; guest.g.world.ground[i] = G.GRASS;
  guest.g.player.tool = 1;
  tick([host, guest]);
  guest.net.act('use', { tool: 'enxada', x, y, px: x + 0.5, py: y + 0.5, opts: { hoeMode: 'till' } }, { tool: 'enxada' });
  tick([host, guest]);
  check(hw.ground[i] === G.TILLED, 'anfitrião arou o tile pedido pelo convidado');
  check(guest.g.world.ground[i] === G.TILLED, 'convidado vê a terra arada');
}

console.log('# ação do anfitrião chega ao convidado');
{
  const hw = host.g.world, x = Math.floor(host.g.player.x) - 1, y = Math.floor(host.g.player.y) + 1, i = hw.idx(x, y);
  hw.obj[i] = O.FENCE; host.net.markAround(x, y);
  tick([host, guest]);
  check(guest.g.world.obj[i] === O.FENCE, 'cerca do anfitrião apareceu no convidado');
}

console.log('# convidado compra na cooperativa');
{
  const m0 = host.g.money, have = host.g.inv.adubo || 0;
  guest.net.cmd('buyi', { id: 'adubo', n: '1' });
  tick([host, guest]);
  check(host.g.money < m0 && host.g.inv.adubo === have + 1, 'dinheiro e estoque são da fazenda');
  check(guest.g.inv.adubo === have + 1 && Math.abs(guest.g.money - host.g.money) < 1e-6, 'convidado vê o estoque novo');
  guest.net.cmd('sell', { id: 'naoexiste', n: '5' });
  tick([host, guest]);
  check(host.g.money < m0, 'comando inválido é ignorado sem quebrar');
}

console.log('# convidado monta e anda a cavalo');
{
  const gp = guest.g.player;
  const horse = makeAnimal(host.g, 'cavalo', Math.floor(gp.x), Math.floor(gp.y) + 1, { owned: true, sex: 'm' });
  horse.x = gp.x; horse.y = gp.y + 0.8;
  tick([host, guest], 2);
  guest.net.act('mount', { x: 0, y: 0 });
  tick([host, guest]);
  check(horse.ridden && horse.riddenBy === guest.net.myId, 'cavalo montado pelo convidado no anfitrião');
  check(guest.g.player.mount?.id === horse.id, 'convidado sabe que está montado');
  gp.x += 3; tick([host, guest], 0.3); updateAnimals(host.g, 0.05);
  check(Math.abs(horse.x - gp.x) < 0.05, 'cavalo acompanha o convidado');
  // o anfitrião não pode montar no mesmo cavalo
  host.g.player.x = horse.x; host.g.player.y = horse.y;
  const { toggleMount } = await import('../src/actions.js');
  const r = toggleMount(host.g);
  check(!host.g.player.mount, 'cavalo ocupado não aceita outro: ' + r.msg);
}

console.log('# convidado leva animal no laço e cai');
{
  const gp = guest.g.player;
  guest.net.act('mount', { x: 0, y: 0 }); tick([host, guest]); // desce
  const cow = makeAnimal(host.g, 'gado', Math.floor(gp.x), Math.floor(gp.y), { owned: true, sex: 'f' });
  cow.x = gp.x + 1; cow.y = gp.y;
  tick([host, guest], 2);
  guest.net.act('use', { tool: 'laco', x: Math.floor(cow.x), y: Math.floor(cow.y), px: cow.x, py: cow.y, opts: {} });
  tick([host, guest]);
  check(cow.led && cow.ledBy === guest.net.myId, 'vaca no laço do convidado');
  check(guest.g.animals.find(a => a.id === cow.id)?.led, 'convidado vê a vaca no laço');
  // convidado some sem fechar (celular): 20 s sem resposta
  const gside = guest; const saved = gside.net.update; gside.net.update = () => {}; gside.net.hostConn.dead = true; // celular sumiu: nem responde
  for (let k = 0; k < 50; k++) { clock += 1000; host.net.update(1); host.net.heartbeat(); flush(); }
  gside.net.update = saved;
  check(!host.g.others[gside.net.myId], 'anfitrião tirou o convidado que parou de responder');
  updateAnimals(host.g, 0.05);
  check(!cow.led && cow.owned, 'vaca ficou solta na fazenda');
}

console.log('# reconectar na mesma aba não duplica');
{
  const g2 = side(newGame(2));
  const jp2 = g2.net.join(code, 'Beto'); await wait(); await jp2; // mesmo pid (sessionStorage)
  const jp3 = side(newGame(3)); sessionStorage.s = {};
  check(Object.keys(host.g.others).length === 1, 'voltou como o mesmo jogador');
  globalThis.G2 = g2;
}

console.log('# versão diferente é recusada');
{
  const old = side(newGame(4));
  sessionStorage.s = {};
  const conn = new Peer('x-old').connect('terraboa-v1-' + code, { metadata: { name: 'Velho', pid: 'pold', v: NET_VERSION + 1 } });
  let rejected = null; conn.on('data', m => { if (m.t === 'reject') rejected = m.reason; });
  tick([host], 1);
  check(rejected && /Versões diferentes/.test(rejected), 'recusou: ' + rejected);
  check(!host.g.others.pold, 'não entrou');
}

console.log('# sala cheia');
{
  const extra = [];
  for (let k = 0; k < 4; k++) { sessionStorage.s = {}; const s = side(newGame(10 + k)); extra.push(s); const p = s.net.join(code, 'P' + k).catch(e => { s.err = e.message; }); await wait(); await p; }
  check(Object.keys(host.g.others).length === 3, 'no máximo 4 jogadores (anfitrião + 3)');
  check(extra.some(s => /cheia/.test(s.err || '')), 'quem passou do limite recebeu aviso');
  for (const s of extra) if (s.net.isClient) { s.net.leave(true); }
  tick([host], 0.5);
}


console.log('# tráfego e animais sincronizados só com o que mudou');
{
  const g2 = globalThis.G2;
  tick([host, g2], 3);
  globalThis.SENT = 0; globalThis.BYT = {};
  tick([host, g2], 10);
  const kbs = globalThis.SENT / 1024 / 10 / host.net.conns.size; // por convidado
  console.log(`  ${kbs.toFixed(1)} KB/s com 1 convidado e ${host.g.animals.length} animais`, JSON.stringify(Object.fromEntries(Object.entries(globalThis.BYT).map(([k, v]) => [k, (v / 10240).toFixed(1)]))));
  check(kbs < 30, 'tráfego enxuto');
  const cow = host.g.animals.find(a => a.owned) || host.g.animals[0];
  cow.weight += 7; cow.health = 0.55;
  tick([host, g2], 2);
  const gc = g2.g.animals.find(a => a.id === cow.id);
  check(gc && Math.abs(gc.weight - cow.weight) < 0.01 && Math.abs(gc.health - 0.55) < 0.001, 'mudança num animal chegou ao convidado');
  check(g2.g.animals.length === host.g.animals.length, 'mesma quantidade de animais');
  const m0 = JSON.stringify(g2.g.market.c.milho.price);
  host.g.market.c.milho.price *= 1.1;
  tick([host, g2], 2.5);
  check(JSON.stringify(g2.g.market.c.milho.price) !== m0, 'preço novo chegou ao convidado');
}

console.log('# anfitrião fecha a sala');
{
  const g2 = globalThis.G2;
  tick([host, g2], 0.5);
  host.net.leave();
  tick([host, g2], 0.5);
  check(g2.left && /fechou/.test(g2.left), 'convidado avisado: ' + g2.left);
  check(!host.g.player.id && Object.keys(host.g.others).length === 0, 'anfitrião volta a jogar sozinho');
}

console.log(fails ? `\n${fails} FALHA(S)` : '\nTudo certo.');
process.exit(fails ? 1 : 0);
