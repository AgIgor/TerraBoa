// Comandos dos painéis (vender, comprar, peões). Sem DOM: no jogar junto o anfitrião
// roda estes mesmos comandos em nome do convidado (p = quem pediu).
import { ITEMS, ANIMALS, WAGE, MAX_LED } from './config.js';
import { INPUTS, inputPrice, sell } from './market.js';
import { animalLabel, animalValue, animalMarketQty, makeAnimal } from './animals.js';
import { hireWorker, fireWorker } from './workers.js';
import { ledList } from './actions.js';

export const fmt = v => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function tractorPrice(g) { return 2600 * Math.exp(g.market.dollar || 0); }
export const ANIMAL_OFFERS = [
  { name: 'Bezerra (fêmea)', sp: 'gado', sex: 'f', w: 160 },
  { name: 'Garrote (macho)', sp: 'gado', sex: 'm', w: 180 },
  { name: 'Leitoa', sp: 'porco', sex: 'f', w: 25 },
  { name: 'Leitão', sp: 'porco', sex: 'm', w: 25 },
  { name: 'Franga', sp: 'galinha', sex: 'f', w: 1.3 },
  { name: 'Galo', sp: 'galinha', sex: 'm', w: 1.8 },
  { name: 'Égua mansa', sp: 'cavalo', sex: 'f', w: 400 },
  { name: 'Cavalo manso', sp: 'cavalo', sex: 'm', w: 420 },
  { name: 'Ovelha', sp: 'ovelha', sex: 'f', w: 42 },
  { name: 'Carneiro', sp: 'ovelha', sex: 'm', w: 50 },
  { name: 'Cabra', sp: 'cabra', sex: 'f', w: 40 },
  { name: 'Bode', sp: 'cabra', sex: 'm', w: 45 },
  { name: 'Pata', sp: 'pato', sex: 'f', w: 2.4 },
  { name: 'Pato', sp: 'pato', sex: 'm', w: 3 },
  { name: 'Perua', sp: 'peru', sex: 'f', w: 6 },
  { name: 'Peru', sp: 'peru', sex: 'm', w: 9 },
  { name: 'Coelha', sp: 'coelho', sex: 'f', w: 2.8 },
  { name: 'Coelho', sp: 'coelho', sex: 'm', w: 3 },
  { name: 'Lhama', sp: 'lhama', sex: 'f', w: 125 },
  { name: 'Lhama macho', sp: 'lhama', sex: 'm', w: 140 },
  { name: 'Búfala', sp: 'bufalo', sex: 'f', w: 420 },
  { name: 'Búfalo', sp: 'bufalo', sex: 'm', w: 480 },
];
export function offerPrice(g, o) {
  const d = ANIMALS[o.sp], p = g.market.c[d.market].price;
  if (d.sell === 'arroba') return o.w / 15 * p * 1.3;
  if (d.sell === 'kg') return o.w * p * 1.5;
  return p * 1.15;
}

export const COMMANDS = new Set(['sell', 'buyi', 'sella', 'buya', 'buyt', 'hire', 'task', 'fire']);

const res = (msg, kind = 'info', extra = {}) => ({ msg, kind, ...extra });

// ds: dados do botão (id, n, i, task). Retorna { msg, kind, close }.
export function runCommand(g, act, ds, p = g.player) {
  const m = g.market;
  switch (act) {
    case 'sell': {
      const id = ds.id;
      if (!ITEMS[id]) return null;
      const have = g.inv[id] || 0;
      const n = ds.n === 'all' ? have : Math.min(have, +ds.n || 0);
      if (n <= 0) return null;
      const v = sell(m, id, n);
      g.inv[id] -= n; g.money += v; g.stats.earned += v;
      return res(`Vendeu ${n} ${ITEMS[id].unit} de ${ITEMS[id].name.toLowerCase()} por ${fmt(v)}`, 'good');
    }
    case 'buyi': {
      const inp = INPUTS.find(x => x.id === ds.id), n = Math.max(1, Math.min(100, +ds.n || 1));
      if (!inp) return null;
      const v = inputPrice(m, inp) * n;
      if (g.money < v) return res('Dinheiro insuficiente.', 'bad');
      g.money -= v; g.stats.spent += v; g.inv[inp.id] = (g.inv[inp.id] || 0) + n;
      return res(`Comprou ${n} × ${inp.name.toLowerCase()} por ${fmt(v)}`, 'good');
    }
    case 'sella': {
      const a = g.animals.find(x => x.id === +ds.id);
      if (!a || !a.owned) return null;
      if (a.ridden) return res('Desça do cavalo antes de vender.', 'bad');
      const v = animalValue(g, a);
      sell(m, ANIMALS[a.sp].market, animalMarketQty(a));
      g.animals = g.animals.filter(x => x !== a);
      g.money += v; g.stats.earned += v;
      return res(`Vendeu ${animalLabel(a).toLowerCase()} por ${fmt(v)}`, 'good');
    }
    case 'buya': {
      const o = ANIMAL_OFFERS[+ds.i];
      if (!o) return null;
      const v = offerPrice(g, o);
      if (g.money < v) return res('Dinheiro insuficiente.', 'bad');
      if (ledList(g, p).length >= MAX_LED) return res(`Já está levando ${MAX_LED} animais. Solte algum antes.`, 'bad');
      const a = makeAnimal(g, o.sp, Math.floor(p.x), Math.floor(p.y), { owned: false, sex: o.sex, weight: o.w });
      a.x = p.x; a.y = p.y + 0.6; a.led = true; a.ledBy = p.id || 'host'; a.ledSeq = g.nextId++; a.owned = false; a.bought = true;
      g.money -= v; g.stats.spent += v;
      return res(`Comprou ${o.name.toLowerCase()}. Leve até o pasto e clique nele com o Laço para soltar.`, 'good', { close: true });
    }
    case 'buyt': {
      const v = tractorPrice(g);
      if (g.money < v) return res('Dinheiro insuficiente.', 'bad');
      g.vehicles.push({ id: g.nextId++, kind: 'trator', x: p.x + 1.2, y: p.y + 0.3, fx: 1 });
      g.money -= v; g.stats.spent += v;
      return res('Trator entregue ao seu lado. Chegue perto e aperte X (ou mão) para subir.', 'good', { close: true });
    }
    case 'hire': {
      const k = hireWorker(g, ds.task || 'colher');
      return k ? res(`${k.name} foi contratado (R$ ${WAGE}/dia).`, 'good') : null;
    }
    case 'task': {
      const k = g.workers.find(k => k.id === +ds.id);
      if (k) { k.task = ds.task; k.path = []; k.job = null; k.timer = 0; }
      return null;
    }
    case 'fire': {
      const k = g.workers.find(k => k.id === +ds.id);
      fireWorker(g, +ds.id);
      return k ? res(`${k.name} foi dispensado.`) : null;
    }
  }
  return null;
}
