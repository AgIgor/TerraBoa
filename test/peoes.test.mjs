// node test/peoes.test.mjs — peões recolhem produção, guardam ou vendem, não ficam parados; armazém conserva.
import { newGame, advance, advanceWithAnimals } from '../src/game.js';
import { makeAnimal } from '../src/animals.js';
import { hireWorker } from '../src/workers.js';
import { productCap } from '../src/sim.js';
import { G, O, PROD_BASE } from '../src/config.js';

let fails = 0;
const check = (c, m) => { console.log((c ? '  ok: ' : '  FALHOU: ') + m); if (!c) fails++; };

// pasto com porteira perto da casa, bebedouro e cocho
function pen(g) {
  const w = g.world, { cx, cy } = w.farm, x0 = cx - 4, y0 = cy + 5, W = 10, H = 7;
  for (let y = y0 - 1; y <= y0 + H; y++) for (let x = x0 - 1; x <= x0 + W; x++) {
    const i = w.idx(x, y);
    const border = y === y0 - 1 || y === y0 + H || x === x0 - 1 || x === x0 + W;
    w.obj[i] = border ? O.FENCE : O.NONE; w.crops.delete(i);
    if (!border) { w.ground[i] = G.PASTURE; w.grass[i] = 0.9; w.moist[i] = 0.6; }
  }
  w.obj[w.idx(x0 + 3, y0 - 1)] = O.GATE;
  const ti = w.idx(x0, y0); w.obj[ti] = O.TROUGH; w.troughs.set(ti, { water: 0 });
  w.recomputeComponents();
  return { x0, y0, ti };
}
function farm(dest) {
  const g = newGame(77);
  const { x0, y0, ti } = pen(g);
  g.animals = [];
  for (let k = 0; k < 3; k++) makeAnimal(g, 'galinha', x0 + 2 + k, y0 + 3, { owned: true, sex: 'f' });
  const cow = makeAnimal(g, 'gado', x0 + 6, y0 + 2, { owned: true, sex: 'f', weight: 380 });
  const sheep = makeAnimal(g, 'ovelha', x0 + 7, y0 + 4, { owned: true, sex: 'f' });
  cow.milk = 10; sheep.wool = 3;
  g.world.drops.push({ x: x0 + 1, y: y0 + 5, n: 4, day: 0, f: false, sp: 'galinha' }, { x: x0 + 8, y: y0 + 1, n: 2, day: 0, f: false, sp: 'pato' });
  const k = hireWorker(g, 'tratar'); k.dest = dest;
  g.time = Math.floor(g.time / 1440) * 1440 + 1440 + 6 * 60; // amanhece
  return { g, k, cow, sheep, ti };
}

console.log('# quem trata dos bichos também recolhe a produção');
{
  const { g, k, cow, sheep, ti } = farm('guardar');
  const status = new Set();
  for (let m = 0; m < 10 * 60; m += 2) { advanceWithAnimals(g, 2, 2); status.add(k.status); for (const a of g.animals) { a.hunger = Math.max(a.hunger, 0.8); a.thirst = Math.max(a.thirst, 0.8); } }
  console.log(`  fez: ${[...status].join(', ')}`);
  console.log(`  estoque: ovos ${g.inv.ovos || 0}, leite ${g.inv.leite || 0}, lã ${g.inv.la || 0}; bebedouro ${g.world.troughs.get(ti).water}`);
  check(g.world.troughs.get(ti).water > 0, 'encheu o bebedouro');
  check((g.inv.leite || 0) >= 8 && cow.milk < 2, 'ordenhou a vaca');
  check((g.inv.la || 0) >= 2, 'tosquiou a ovelha');
  check((g.inv.ovos || 0) >= 4 && (g.inv.ovos_pato || 0) >= 2, 'recolheu ovos de galinha e de pata');
}

console.log('# vender direto');
{
  const { g, k } = farm('vender');
  const m0 = g.money;
  for (let m = 0; m < 10 * 60; m += 2) advanceWithAnimals(g, 2, 2);
  console.log(`  ganhou R$ ${(g.money - m0).toFixed(2)}; vendido pelo peão R$ ${(k.sold || 0).toFixed(2)}`);
  check(g.money > m0 && k.sold > 0, 'peão vendeu a produção');
  check(!(g.inv.leite > 0) && !(g.inv.la > 0), 'nada foi para o estoque');
}

console.log('# sem serviço da tarefa, ajuda no resto');
{
  const g = newGame(78), w = g.world, { cx, cy } = w.farm;
  g.animals = [];
  const tiles = [];
  for (let dx = -3; dx <= 2; dx++) { const i = w.idx(cx + dx, cy + 4); w.obj[i] = O.NONE; w.ground[i] = G.TILLED; w.moist[i] = 0.05; w.crops.set(i, { type: 'milho', prog: 0.4, health: 1, harvests: 0, ripe: false, dead: dx === 2 }); tiles.push(i); }
  for (const d of g.climate.days) { d.rain = 0; d.rainHours = 0; }
  const k = hireWorker(g, 'colher'); // nada maduro: deve regar e limpar
  g.time = Math.floor(g.time / 1440) * 1440 + 1440 + 7 * 60;
  let idle = 0, n = 0;
  for (let m = 0; m < 4 * 60; m += 2) { advanceWithAnimals(g, 2, 2); n++; if (/sem serviço/.test(k.status)) idle++; }
  const wet = tiles.filter(i => w.moist[i] > 0.3).length;
  console.log(`  ${wet} pés regados; parado ${Math.round(idle / n * 100)}% do tempo`);
  check(wet >= 4, 'colhedor regou as lavouras secas');
  check(!w.crops.has(tiles[5]), 'limpou o pé morto');
}

console.log('# armazém conserva');
{
  const lost = [];
  for (const withStore of [false, true]) {
    const g = newGame(79), w = g.world, { cx, cy } = w.farm;
    if (withStore) { const i = w.idx(cx + 3, cy + 6); w.obj[i] = O.ARMAZEM; }
    check(productCap(w) === PROD_BASE + (withStore ? 150 : 0), `capacidade ${productCap(w)}`);
    g.inv.leite = 100; g.inv.ovos = 40;
    g.time = Math.floor(g.time / 1440) * 1440 + 23 * 60;
    advance(g, 120);
    lost.push(100 - g.inv.leite);
  }
  console.log(`  leite perdido em 1 dia: sem armazém ${lost[0]} L, com armazém ${lost[1]} L`);
  check(lost[1] < lost[0] / 2, 'armazém segura o leite');
}

console.log(fails ? `\n${fails} FALHA(S)` : '\nTudo certo.');
process.exit(fails ? 1 : 0);
