// Jogar junto: multiplayer cooperativo via PeerJS (WebRTC direto entre navegadores).
// O anfitrião roda a simulação e é a única fonte da verdade. Convidados só andam
// (posição própria) e pedem ações; o anfitrião executa como se fosse o convidado e
// devolve o resultado e os tiles que mudaram.
//
// Cuidados (bugs comuns em multiplayer):
// - convidado nunca salva a fazenda do anfitrião por cima das suas (g.remote, sem farmId);
// - versões diferentes do jogo são recusadas com aviso (NET_VERSION);
// - 'close' do WebRTC às vezes não chega (celular): batimento + tempo limite dos dois lados;
// - id do jogador por aba (sessionStorage): duas abas no mesmo PC não se confundem e quem
//   recarrega a página volta para o mesmo lugar sem duplicar;
// - painel aberto não pausa o jogo dos outros;
// - anfitrião que fica sem servidor de sinalização tenta reconectar (sala continua);
// - mensagens de convidado são validadas (números, limites, ferramentas conhecidas).
//
// Desempenho: o empacotamento binário padrão do PeerJS é feito em JavaScript e custa
// ~80x mais que JSON nativo (medido: 6 ms contra 0,08 ms para a lista de animais).
// Por isso o canal é 'raw': cada mensagem vira texto JSON uma vez só (mesmo texto para
// todos os convidados) e as grandes são cortadas em pedaços. Mercado, clima e diário
// só vão quando mudam; animais completos, só os que mudaram.
import { TOOLS, REGADOR_MAX, MAX_LED } from './config.js';
import { serialize, deserialize } from './game.js';
import { worldToJSON, worldFromJSON, tileState, setTileState } from './world.js';
import { useTool, toggleMount, pickEggsAt } from './actions.js';
import { COMMANDS, runCommand } from './commands.js';

export const NET_VERSION = 3; // aumente quando o protocolo ou a simulação mudarem
const PREFIX = 'terraboa-v1-';
const MAX_PLAYERS = 4;
const COLORS = ['#e8c040', '#4a9ae8', '#e8604a', '#a86ae8', '#4ac8a0', '#e88ac0'];
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TOOL_IDS = new Set(TOOLS.map(t => t.id));
const randomCode = () => Array.from({ length: 5 }, () => CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0]).join('');
const num = (v, lo, hi, def = 0) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : def);
const r2 = v => Math.round(v * 100) / 100;
const CHUNK = 60000;       // caracteres por pedaço (bem abaixo do limite do canal)
const WORLD_EVERY = 3;     // mapa inteiro a cada 3 horas de jogo (ações vão na hora, por tile)
const FAST_KEYS = new Set(['x', 'y', 'step', 'face', 'timer', 'fleeing', 'seek', 'hurry', 'path', 'tx', 'ty', 'hSum', 'tSum', 'hours']);

// Texto(s) a mandar para uma mensagem
function encode(m, seqRef) {
  const s = JSON.stringify(m);
  if (s.length <= CHUNK) return [s];
  const id = ++seqRef.n, n = Math.ceil(s.length / CHUNK), out = [];
  for (let k = 0; k < n; k++) out.push(JSON.stringify({ t: 'part', id, k, n, d: s.slice(k * CHUNK, (k + 1) * CHUNK) }));
  return out;
}
// Lê o que chegou (texto, ou objeto de um anfitrião/convidado antigo); junta pedaços.
function decode(conn, raw) {
  let m;
  try { m = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
  if (!m || m.t !== 'part') return m;
  const b = conn._parts && conn._parts.id === m.id ? conn._parts : (conn._parts = { id: m.id, got: 0, d: new Array(m.n) });
  if (b.d[m.k] == null) { b.d[m.k] = m.d; b.got++; }
  if (b.got < m.n) return null;
  conn._parts = null;
  try { return JSON.parse(b.d.join('')); } catch { return null; }
}

function myPid() {
  try {
    let id = sessionStorage.getItem('terraboa-pid');
    if (!id) { id = 'p' + Math.random().toString(36).slice(2, 10); sessionStorage.setItem('terraboa-pid', id); }
    return id;
  } catch { return 'p' + Math.random().toString(36).slice(2, 10); }
}

function loadPeer() {
  if (window.Peer) return Promise.resolve();
  return new Promise((ok, no) => {
    const s = document.createElement('script');
    s.src = 'lib/peerjs.min.js';
    s.onload = () => (window.Peer ? ok() : no(new Error('O PeerJS não carregou.')));
    s.onerror = () => no(new Error('Não consegui carregar o PeerJS.'));
    document.head.appendChild(s);
  });
}

const errText = e => {
  const t = e?.type;
  if (t === 'peer-unavailable') return 'Sala não encontrada. Confira o código (e se a sala ainda está aberta).';
  if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed') return 'Sem conexão com o servidor de salas. Confira a internet.';
  if (t === 'browser-incompatible') return 'Este navegador não suporta jogar junto (WebRTC).';
  return e?.message || 'Falha na conexão.';
};

// estado do jogador que vai pela rede
const pubPlayer = p => ({
  id: p.id || 'host', name: p.name || 'Anfitrião', color: p.color || COLORS[0],
  x: r2(p.x), y: r2(p.y), fx: r2(p.fx), fy: r2(p.fy), moving: !!p.moving, sneak: !!p.sneak, step: r2(p.step || 0),
  tool: p.tool | 0, mount: p.mount || null, water: p.water,
});
// animal sem o que é só da simulação
const pubAnimal = a => { const { path, tx, ty, ...o } = a; return o; };
const pubWorker = k => { const { path, job, ...o } = k; return o; };

export class Net {
  // hooks: game() -> g, setGame(g), toast(t, k), left(reason), changed(), result(req, r), speed(s)
  constructor(hooks) {
    this.h = hooks;
    this.role = null;
    this.peer = null;
    this.conns = new Map();   // anfitrião: id do jogador -> { conn, id, last, ping }
    this.hostConn = null;
    this.myId = 'host';
    this.code = '';
    this.seq = 0;
    this.pending = new Map(); // convidado: seq -> pedido (para efeitos ao voltar)
    this.dirty = new Set();   // anfitrião: tiles mudados a mandar
    this.notes = [];
    this.t = { fast: 0, full: 0, slow: 0, ping: 0 };
    this.sentHour = -1; this.lastWorld = 0;
    this.partSeq = { n: 0 };
    this.sig = {};            // anfitrião: o que já foi mandado (mercado, clima, diário)
    this.animSig = new Map(); // anfitrião: id do animal -> texto do que foi mandado
    this.animPos = new Map(); // anfitrião: id do animal -> posição/estado já mandados
  }
  get g() { return this.h.game(); }
  get active() { return !!this.role; }
  get isHost() { return this.role === 'host'; }
  get isClient() { return this.role === 'client'; }

  playerList() {
    const g = this.g;
    const all = this.isHost ? [g.player, ...Object.values(g.others || {})] : [...Object.values(g.others || {}), g.player];
    return all.map(p => ({ id: p.id || 'host', name: p.name || 'Anfitrião', color: p.color || COLORS[0], ping: this.isHost && p !== g.player ? this.conns.get(p.id)?.ping : null }));
  }

  open(id) {
    return new Promise((resolve, reject) => {
      const peer = id ? new window.Peer(id, { debug: 1 }) : new window.Peer({ debug: 1 });
      let done = false;
      const fail = e => { if (done) return; done = true; clearTimeout(timer); try { peer.destroy(); } catch { /* */ } reject(e); };
      const timer = setTimeout(() => fail({ type: 'network' }), 15000);
      peer.once('open', () => { if (done) return; done = true; clearTimeout(timer); peer.off('error', fail); this.peer = peer; resolve(); });
      peer.once('error', fail);
    });
  }

  // ================= anfitrião =================
  async host(name) {
    await loadPeer();
    this.leave(true);
    let code = null;
    for (let tries = 0; tries < 4 && !code; tries++) {
      const c = randomCode();
      try { await this.open(PREFIX + c); code = c; } catch (e) { if (e?.type !== 'unavailable-id') throw new Error(errText(e)); }
    }
    if (!code) throw new Error('Não consegui criar a sala. Tente de novo.');
    const g = this.g;
    this.role = 'host'; this.code = code; this.myId = 'host';
    g.player.id = 'host'; g.player.name = name; g.player.color = COLORS[0];
    g.others = {};
    this.dirty.clear(); this.notes = [];
    this.peer.on('connection', c => this.onGuest(c));
    this.startBeat();
    // sem servidor de sinalização ninguém novo entra, mas quem já está continua: tenta voltar
    this.peer.on('disconnected', () => { if (this.isHost) setTimeout(() => { try { this.peer?.reconnect(); } catch { /* */ } }, 2000); });
    this.peer.on('error', e => { if (this.isHost && e?.type !== 'peer-unavailable') console.warn('[net]', e?.type, e?.message); });
    this.h.changed();
    return code;
  }

  onGuest(conn) {
    conn.on('open', () => {
      const g = this.g, md = conn.metadata || {};
      const refuse = reason => {
        try { if (conn.serialization === 'raw') this.sendTo(conn, { t: 'reject', reason }); else conn.send({ t: 'reject', reason }); } catch { /* */ }
        setTimeout(() => { try { conn.close(); } catch { /* */ } }, 800);
      };
      if (md.v !== NET_VERSION) return refuse('Versões diferentes do Terra Boa. Atualizem a página (Ctrl+F5 no PC) nos dois aparelhos e tentem de novo.');
      const id = String(md.pid || conn.peer).replace(/[^\w-]/g, '').slice(0, 24) || conn.peer;
      if (id === 'host') return refuse('Id inválido.');
      const old = this.conns.get(id);
      if (!old && Object.keys(g.others).length >= MAX_PLAYERS - 1) return refuse(`Sala cheia (até ${MAX_PLAYERS} jogadores).`);
      if (old && old.conn !== conn) { old.replaced = true; try { old.conn.close(); } catch { /* */ } }
      let p = g.others[id];
      if (!p) {
        const used = new Set([g.player.color, ...Object.values(g.others).map(o => o.color)]);
        p = { id, color: COLORS.find(c => !used.has(c)) || COLORS[1], x: g.player.x + 0.8, y: g.player.y + 0.6, fx: 0, fy: 1, tool: 0, plant: 0, build: 0, water: REGADOR_MAX, mount: null, sneak: false, moving: false, step: 0 };
        g.others[id] = p;
      }
      p.name = String(md.name || 'Convidado').slice(0, 20);
      const e = { conn, id, last: performance.now(), ping: null };
      this.conns.set(id, e);
      conn.on('data', raw => { if (this.conns.get(id) !== e) return; const m = decode(conn, raw); if (m) this.fromGuest(e, p, m); });
      const gone = () => { if (this.conns.get(id) === e) this.dropGuest(id, 'saiu'); };
      conn.on('close', gone);
      conn.on('error', gone);
      this.sendTo(conn, { t: 'welcome', v: NET_VERSION, you: id, save: serialize(g), me: pubPlayer(p), players: this.playersFull(), name: g.farmName || '' });
      this.animSig.clear(); this.animPos.clear(); this.sig = {}; // o novo convidado recebe tudo no próximo envio
      this.note(`${p.name} entrou na fazenda.`, 'good');
      this.h.changed();
    });
  }

  playersFull() { const g = this.g; return [g.player, ...Object.values(g.others)].map(pubPlayer); }

  dropGuest(id, why) {
    const g = this.g, e = this.conns.get(id);
    this.conns.delete(id);
    const p = g.others?.[id];
    if (p) {
      // o trator fica onde o convidado estava; cavalo e animais no laço ficam soltos ali (updateAnimals)
      if (p.mount?.kind === 'trator') { const v = g.vehicles.find(v => v.id === p.mount.id); if (v) { v.x = p.x; v.y = p.y; } }
      delete g.others[id];
      this.note(`${p.name} ${why === 'sem resposta' ? 'caiu (sem resposta)' : 'saiu'}.`);
    }
    if (e) { try { e.conn.close(); } catch { /* */ } }
    this.h.changed();
  }

  // executa algo como se g.player fosse o convidado
  runAs(p, fn) {
    const g = this.g, me = g.player;
    g.player = p;
    try { return fn(); } finally { g.player = me; }
  }

  fromGuest(e, p, m) {
    if (!m || typeof m !== 'object') return;
    const g = this.g, w = g.world;
    e.last = performance.now();
    switch (m.t) {
      case 'me': {
        p.x = num(m.x, 0.2, w.w - 0.2, p.x); p.y = num(m.y, 0.2, w.h - 0.2, p.y);
        p.fx = num(m.fx, -1, 1, p.fx); p.fy = num(m.fy, -1, 1, p.fy);
        p.moving = !!m.moving; p.sneak = !!m.sneak; p.step = num(m.step, 0, 1e9, 0);
        p.tool = num(m.tool, 0, TOOLS.length - 1, 0) | 0; p.plant = num(m.plant, 0, 20, 0) | 0; p.build = num(m.build, 0, 30, 0) | 0;
        if (p.mount?.kind === 'trator') { const v = g.vehicles.find(v => v.id === p.mount.id); if (v) { v.x = p.x; v.y = p.y; v.fx = p.fx; } }
        break;
      }
      case 'act': {
        const x = num(m.x, -1, w.w, -1) | 0, y = num(m.y, -1, w.h, -1) | 0;
        let r = null;
        if (m.kind === 'use' && TOOL_IDS.has(m.tool)) {
          const opts = m.opts && typeof m.opts === 'object' ? { hoeMode: m.opts.hoeMode === 'untill' ? 'untill' : m.opts.hoeMode === 'till' ? 'till' : undefined } : {};
          r = this.runAs(p, () => useTool(g, m.tool, x, y, num(m.px, -1, w.w, x + 0.5), num(m.py, -1, w.h, y + 0.5), opts));
        } else if (m.kind === 'mount') r = this.runAs(p, () => toggleMount(g));
        else if (m.kind === 'eggs') r = this.runAs(p, () => pickEggsAt(g, x, y));
        if (r?.slept) { this.note(`${p.name} foi dormir. Bom dia!`, 'good'); this.sendWorld(); }
        const tiles = [];
        if (w.inside(x, y)) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (w.inside(x + dx, y + dy)) tiles.push(tileState(w, w.idx(x + dx, y + dy)));
        this.markAround(x, y); // os outros também veem
        this.sendTo(e.conn, { t: 'res', seq: m.seq, r: r ? { msg: r.msg, kind: r.kind, slept: !!r.slept, open: r.open || null } : null, tiles, you: { water: p.water, mount: p.mount, x: p.x, y: p.y }, drops: w.drops, inv: g.inv, money: g.money });
        break;
      }
      case 'cmd': {
        if (!COMMANDS.has(m.act)) break;
        const ds = {};
        for (const k of ['id', 'n', 'i', 'task', 'dest']) if (m.ds && m.ds[k] != null) ds[k] = String(m.ds[k]).slice(0, 30);
        const r = this.runAs(p, () => runCommand(g, m.act, ds, p));
        this.sendTo(e.conn, { t: 'cres', r, inv: g.inv, money: g.money });
        this.t.full = 99; this.t.slow = 99; // animal comprado/vendido e preço novo aparecem logo
        break;
      }
      case 'speed': this.h.speed(num(m.s, 0, 3, 1) | 0); break;
      case 'ping': this.sendTo(e.conn, { t: 'pong', at: m.at }); break;
      case 'pong': e.ping = Math.round(performance.now() - m.at); break;
    }
  }

  // tiles mudados por uma ação do próprio anfitrião
  markAround(x, y, r = 2) {
    if (!this.isHost || !this.conns.size) return;
    const w = this.g.world;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (w.inside(x + dx, y + dy)) this.dirty.add(w.idx(x + dx, y + dy));
  }
  note(text, kind = 'info') {
    if (this.isHost && this.conns.size) this.notes.push([text, kind]);
    this.h.toast(text, kind);
  }
  // notificações da simulação (morte, fogo, cria...) chegam para todos
  relay(text, kind) { if (this.isHost && this.conns.size) this.notes.push([text, kind]); }

  sendTo(conn, m) {
    if (!conn?.open) return;
    try { for (const s of encode(m, this.partSeq)) conn.send(s); } catch { /* canal fechando */ }
  }
  // um texto só para todos (não empacota de novo para cada convidado)
  broadcast(m) {
    if (!this.conns.size) return;
    const out = encode(m, this.partSeq);
    for (const e of this.conns.values()) if (e.conn.open) { try { for (const s of out) e.conn.send(s); } catch { /* */ } }
  }
  sendWorld() {
    this.lastWorld = performance.now();
    if (this.conns.size) this.broadcast({ t: 'world', w: worldToJSON(this.g.world) });
  }

  // ================= convidado =================
  async join(code, name) {
    await loadPeer();
    this.leave(true);
    code = String(code).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    try { await this.open(); } catch (e) { throw new Error(errText(e)); }
    const conn = this.peer.connect(PREFIX + code, { reliable: true, serialization: 'raw', metadata: { name, pid: myPid(), v: NET_VERSION } });
    this.role = 'client'; this.code = code; this.hostConn = conn;
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('A sala não respondeu. Confira o código.')), 15000);
        this.welcomeWait = { resolve: () => { clearTimeout(timer); resolve(); }, reject: e => { clearTimeout(timer); reject(e); } };
        conn.on('error', e => this.welcomeWait?.reject(new Error(errText(e))));
        this.peer.on('error', e => this.welcomeWait?.reject(new Error(errText(e))));
        conn.on('data', raw => { const m = decode(conn, raw); if (m) this.fromHost(m); });
      });
    } catch (e) {
      this.welcomeWait = null;
      this.leave(true);
      throw e;
    }
    this.welcomeWait = null;
    this.lastHost = performance.now(); this.warned = false;
    this.startBeat();
    conn.on('close', () => this.hostLost('A conexão com o anfitrião caiu.'));
    this.peer.on('disconnected', () => { /* a conexão direta continua; não precisa do servidor */ });
  }

  fromHost(m) {
    if (!m || typeof m !== 'object') return;
    this.lastHost = performance.now();
    if (this.warned) { this.warned = false; this.h.toast('Conexão voltou.', 'good'); }
    const g = this.g;
    switch (m.t) {
      case 'reject':
        if (this.welcomeWait) this.welcomeWait.reject(new Error(m.reason));
        else this.hostLost(m.reason);
        return;
      case 'welcome': {
        if (m.v !== NET_VERSION) { this.welcomeWait?.reject(new Error('Versões diferentes do jogo. Atualizem a página.')); return; }
        const ng = deserialize(m.save);
        ng.remote = true; ng.farmId = null; ng.farmName = m.name || ng.farmName;
        ng.player = { ...m.me, id: m.you, plant: 0, build: 0 };
        ng.others = {};
        for (const p of m.players) if (p.id !== m.you) ng.others[p.id] = { ...p, tx: p.x, ty: p.y };
        for (const a of ng.animals) { a.tx = a.x; a.ty = a.y; }
        this.myId = m.you;
        this.h.setGame(ng);
        this.welcomeWait?.resolve();
        this.h.changed();
        return;
      }
      case 'st': {
        g.time = m.time; g.speed = m.speed; g.paused = m.paused; g.money = m.money; g.inv = m.inv;
        g.world.drops = m.drops;
        if (m.tiles) this.applyTiles(m.tiles);
        // jogadores
        const seen = new Set();
        for (const s of m.pl) {
          seen.add(s.id);
          if (s.id === this.myId) { g.player.water = s.water; g.player.mount = s.mount; continue; }
          const o = g.others[s.id];
          if (o) { const { x, y, ...rest } = s; Object.assign(o, rest); o.tx = x; o.ty = y; }
          else { g.others[s.id] = { ...s, tx: s.x, ty: s.y }; this.h.changed(); }
        }
        for (const id of Object.keys(g.others)) if (!seen.has(id)) { delete g.others[id]; this.h.changed(); }
        // animais: posição e estado de laço/montaria
        const byId = new Map(g.animals.map(a => [a.id, a]));
        for (const [id, x, y, face, fl, ledBy, ridBy] of m.an) {
          const a = byId.get(id);
          if (!a) { this.needFull = true; continue; }
          a.tx = x; a.ty = y; a.face = face;
          a.ridden = !!(fl & 1); a.led = !!(fl & 2); a.owned = !!(fl & 4);
          a.ledBy = ledBy || null; a.riddenBy = ridBy || null;
        }
        if (m.gone) { const gone = new Set(m.gone); g.animals = g.animals.filter(a => !gone.has(a.id)); }
        // peões e veículos
        const wk = new Map(g.workers.map(k => [k.id, k]));
        g.workers = m.wk.map(s => { const k = wk.get(s.id); if (k) { const { x, y, ...rest } = s; Object.assign(k, rest); k.tx = x; k.ty = y; return k; } return { ...s, tx: s.x, ty: s.y, path: [] }; });
        const myTractor = g.player.mount?.kind === 'trator' ? g.player.mount.id : null;
        g.vehicles = m.vh.map(v => (v.id === myTractor ? g.vehicles.find(o => o.id === v.id) || v : v));
        for (const [t, k] of m.notes || []) this.h.toast(t, k);
        this.h.speedShown?.();
        return;
      }
      case 'full': {
        // só os animais que mudaram (os que sumiram saem pelo 'st')
        const byId = new Map(g.animals.map(a => [a.id, a]));
        for (const s of m.animals) {
          const a = byId.get(s.id);
          if (a) { const { x, y, ...rest } = s; Object.assign(a, rest); if (x != null) { a.tx = x; a.ty = y; } }
          else g.animals.push({ ...s, path: [], tx: s.x, ty: s.y });
        }
        this.needFull = false;
        return;
      }
      case 'slow':
        for (const k of ['climate', 'market', 'flags', 'stats', 'log', 'nextId']) if (m[k] !== undefined) g[k] = m[k];
        if (m.name) g.farmName = m.name;
        return;
      case 'world': {
        const w = worldFromJSON(m.w);
        w.recomputeComponents();
        g.world = w;
        return;
      }
      case 'res': {
        const req = this.pending.get(m.seq);
        this.pending.delete(m.seq);
        if (m.tiles) this.applyTiles(m.tiles);
        if (m.drops) g.world.drops = m.drops;
        if (m.inv) g.inv = m.inv;
        if (m.money != null) g.money = m.money;
        const p = g.player, wasMount = p.mount?.id;
        p.water = m.you.water; p.mount = m.you.mount;
        if ((p.mount?.id || null) !== (wasMount || null)) { p.x = m.you.x; p.y = m.you.y; }
        this.h.result(req, m.r);
        return;
      }
      case 'cres':
        if (m.inv) g.inv = m.inv;
        if (m.money != null) g.money = m.money;
        this.h.cmdResult(m.r);
        return;
      case 'note': this.h.toast(m.text, m.kind); return;
      case 'ping': this.send({ t: 'pong', at: m.at }); return;
      case 'bye': this.hostLost('O anfitrião fechou a sala.'); return;
    }
  }

  applyTiles(tiles) {
    const w = this.g.world;
    for (const s of tiles) setTileState(w, s);
    if (w.dirty) w.recomputeComponents();
  }

  send(m) { this.sendTo(this.hostConn, m); }
  act(kind, data, req = null) {
    const seq = ++this.seq;
    if (req) this.pending.set(seq, req);
    if (this.pending.size > 60) this.pending.delete(this.pending.keys().next().value);
    this.send({ t: 'act', seq, kind, ...data });
  }
  cmd(act, ds) { this.send({ t: 'cmd', act, ds }); }
  speed(s) { this.send({ t: 'speed', s }); }

  hostLost(reason) {
    if (!this.isClient) return;
    this.leave(true);
    this.h.left(reason);
  }

  // Batimento por timer, independente do quadro: aba em segundo plano para o
  // requestAnimationFrame, mas a conexão continua viva (o jogo só fica parado).
  startBeat() {
    clearInterval(this.beat);
    this.beat = setInterval(() => this.heartbeat(), 1000);
  }
  heartbeat() {
    if (!this.role) return;
    const now = performance.now();
    if (this.isClient) {
      this.send({ t: 'ping', at: now });
      const quiet = now - (this.lastHost || now);
      if (quiet > 8000 && !this.warned) { this.warned = true; this.h.toast('O anfitrião não responde… esperando.', 'bad'); }
      if (quiet > 45000) this.hostLost('O anfitrião parou de responder.');
      return;
    }
    for (const e of [...this.conns.values()]) if (now - e.last > 45000) this.dropGuest(e.id, 'sem resposta');
    this.broadcast({ t: 'ping', at: now });
  }
  // anfitrião saiu ou voltou para a janela do jogo
  hostVisible(vis) {
    if (!this.isHost || !this.conns.size) return;
    this.broadcast({ t: 'note', text: vis ? `${this.g.player.name || 'O anfitrião'} voltou ao jogo.` : `${this.g.player.name || 'O anfitrião'} saiu da janela do jogo: o tempo fica parado até voltar.`, kind: vis ? 'good' : 'info' });
  }

  // ================= os dois lados, a cada quadro =================
  update(dt) {
    if (!this.role) return;
    const g = this.g, now = performance.now();
    this.t.fast += dt; this.t.full += dt; this.t.slow += dt; this.t.ping += dt;
    if (this.isClient) {
      // suaviza quem vem da rede (10 vezes por segundo) até o próximo pacote
      const k = Math.min(1, dt * 12);
      for (const a of g.animals) if (a.tx != null && !(a.ridden && a.riddenBy === this.myId)) { a.x += (a.tx - a.x) * k; a.y += (a.ty - a.y) * k; a.step = (a.step || 0) + Math.hypot(a.tx - a.x, a.ty - a.y) * 4; }
      for (const o of Object.values(g.others)) if (o.tx != null) { o.x += (o.tx - o.x) * k; o.y += (o.ty - o.y) * k; }
      for (const o of g.workers) if (o.tx != null) { o.x += (o.tx - o.x) * k; o.y += (o.ty - o.y) * k; }
      if (this.t.fast >= 0.1) {
        this.t.fast = 0;
        const p = g.player;
        this.send({ t: 'me', x: r2(p.x), y: r2(p.y), fx: r2(p.fx), fy: r2(p.fy), moving: p.moving, sneak: p.sneak, step: r2(p.step), tool: p.tool, plant: p.plant, build: p.build });
      }
      return;
    }
    // anfitrião
    if (!this.conns.size) { this.dirty.clear(); this.notes = []; return; }
    const block = Math.floor(g.time / 60 / WORLD_EVERY);
    if (block !== this.sentHour && now - this.lastWorld > 5000) { this.sentHour = block; this.sendWorld(); }
    if (this.t.full >= 1.5) {
      this.t.full = 0;
      // só os animais cujo estado (fora posição) mudou desde o último envio
      const changed = [];
      const alive = new Set();
      for (const a of g.animals) {
        alive.add(a.id);
        const o = {};
        for (const k in a) if (!FAST_KEYS.has(k)) o[k] = typeof a[k] === 'number' ? Math.round(a[k] * 1000) / 1000 : a[k];
        const sig = JSON.stringify(o);
        if (this.animSig.get(a.id) !== sig) { this.animSig.set(a.id, sig); o.x = r2(a.x); o.y = r2(a.y); changed.push(o); }
      }
      for (const id of this.animSig.keys()) if (!alive.has(id)) this.animSig.delete(id);
      if (changed.length) this.broadcast({ t: 'full', animals: changed });
    }
    if (this.t.slow >= 2) {
      this.t.slow = 0;
      const out = { t: 'slow', flags: g.flags, stats: g.stats, nextId: g.nextId, name: g.farmName || '' };
      const mk = Object.values(g.market.c).map(c => c.price.toFixed(3)).join() + '|' + (g.market.news?.length || 0) + '|' + (g.market.dollar || 0).toFixed(4);
      if (mk !== this.sig.market) { this.sig.market = mk; out.market = g.market; }
      const cl = JSON.stringify(g.climate.days[0]) + g.climate.days.length + (g.climate.dryStreak || 0);
      if (cl !== this.sig.climate) { this.sig.climate = cl; out.climate = g.climate; }
      const lg = g.log.length + '|' + (g.log[0]?.t ?? '') + (g.log[0]?.text ?? '');
      if (lg !== this.sig.log) { this.sig.log = lg; out.log = g.log.slice(0, 30); }
      this.broadcast(out);
    }
    if (this.t.fast >= 0.1) {
      this.t.fast = 0;
      const w = g.world;
      const tiles = this.dirty.size ? [...this.dirty].map(i => tileState(w, i)) : null;
      this.dirty.clear();
      const notes = this.notes.length ? this.notes : null;
      this.notes = [];
      this.broadcast({
        t: 'st', time: g.time, speed: g.speed, paused: g.paused, money: g.money, inv: g.inv, drops: w.drops, tiles, notes,
        pl: this.playersFull(),
        ...this.animalDelta(g),
        wk: g.workers.map(pubWorker), vh: g.vehicles,
      });
    }
  }

  // só os animais que andaram ou mudaram de laço/montaria, e os que sumiram
  animalDelta(g) {
    const an = [], seen = new Set();
    for (const a of g.animals) {
      seen.add(a.id);
      const e = [a.id, r2(a.x), r2(a.y), a.face, (a.ridden ? 1 : 0) | (a.led ? 2 : 0) | (a.owned ? 4 : 0), a.ledBy || 0, a.riddenBy || 0];
      const key = e.join();
      if (this.animPos.get(a.id) !== key) { this.animPos.set(a.id, key); an.push(e); }
    }
    const gone = [];
    for (const id of this.animPos.keys()) if (!seen.has(id)) { this.animPos.delete(id); gone.push(id); }
    return gone.length ? { an, gone } : { an };
  }

  leave(silent) {
    const g = this.h.game?.();
    if (this.isHost) {
      this.broadcast({ t: 'bye' });
      if (g) {
        // animais que estavam com convidados ficam na fazenda
        for (const id of Object.keys(g.others || {})) delete g.others[id];
        delete g.player.id;
      }
    }
    clearInterval(this.beat);
    const peer = this.peer;
    this.peer = null; this.hostConn = null; this.conns.clear(); this.pending.clear(); this.dirty.clear(); this.notes = [];
    this.animSig.clear(); this.animPos.clear(); this.sig = {};
    this.role = null; this.code = ''; this.myId = 'host';
    if (peer) setTimeout(() => { try { peer.destroy(); } catch { /* já fechado */ } }, 300); // deixa o 'bye' sair
    if (!silent) this.h.changed();
  }
}

export { MAX_LED };
