// node test/cria.test.mjs — manadas selvagens, chegada pelas bordas, cria por estação, ovos que chocam.
import { newGame, advance } from '../src/game.js';
import { makeAnimal, breedChance, breedText, herdArrives } from '../src/animals.js';
import { G, O, YEAR_DAYS, ANIMALS } from '../src/config.js';
import { useTool } from '../src/actions.js';

let fails = 0;
const check = (c, m) => { console.log((c ? '  ok: ' : '  FALHOU: ') + m); if (!c) fails++; };

// pasto fechado com capim e bebedouro
function pen(g, w0 = 10, h0 = 8) {
  const w = g.world, { cx, cy } = w.farm, x0 = cx - 4, y0 = cy + 5;
  for (let y = y0 - 1; y <= y0 + h0; y++) for (let x = x0 - 1; x <= x0 + w0; x++) {
    const i = w.idx(x, y);
    const border = y === y0 - 1 || y === y0 + h0 || x === x0 - 1 || x === x0 + w0;
    w.obj[i] = border ? O.FENCE : O.NONE; w.crops.delete(i);
    if (!border) { w.ground[i] = G.PASTURE; w.grass[i] = 0.9; w.moist[i] = 0.6; }
  }
  const ti = w.idx(x0, y0); w.obj[ti] = O.TROUGH; w.troughs.set(ti, { water: 10 });
  w.recomputeComponents();
  const keep = () => { w.troughs.get(ti).water = 10; for (let y = y0; y < y0 + h0; y++) for (let x = x0; x < x0 + w0; x++) w.grass[w.idx(x, y)] = 0.9; };
  return { x0, y0, keep };
}

console.log('# manadas iniciais');
{
  const g = newGame(5);
  const herds = {};
  for (const a of g.animals) if (a.herd) (herds[a.herd] = herds[a.herd] || []).push(a);
  const list = Object.values(herds);
  const mixed = list.filter(h => h.length < 2 || (h.some(a => a.sex === 'f') && h.some(a => a.sex === 'm'))).length;
  console.log(`  ${list.length} manadas, ${g.animals.length} bichos`);
  check(list.length >= 10, 'bichos soltos andam em manadas');
  check(mixed === list.length, 'toda manada tem macho e fêmea');
}

console.log('# ano inteiro sem mexer: chegadas e cria selvagem com limite');
{
  const g = newGame(6);
  const before = g.animals.length;
  let arrivals = 0, maxWild = 0;
  const notes = [];
  g.notify = (t) => notes.push(t);
  for (let d = 0; d < YEAR_DAYS * 2; d++) {
    advance(g, 1440);
    maxWild = Math.max(maxWild, g.animals.filter(a => !a.owned).length);
  }
  arrivals = notes.filter(t => t.includes('apareceu')).length;
  const young = g.animals.filter(a => a.mom).length;
  console.log(`  começou com ${before}, ficou ${g.animals.length} (máx ${maxWild}); ${arrivals} manadas chegaram; ${young} com mãe`);
  check(maxWild <= 75, 'população selvagem não explode');
  check(g.animals.length >= before * 0.8, 'população selvagem não some');
  check(young > 0, 'bichos soltos tiveram cria');
}

console.log('# chegada pela borda');
{
  const g = newGame(7), w = g.world;
  const res = herdArrives(g, 'cavalo', 3);
  check(!!res, 'manada chegou');
  if (res) {
    const a = res.herd[0];
    const edge = Math.min(a.x, a.y, w.w - a.x, w.h - a.y);
    check(edge < 4, `nasceu na borda (${res.side}, a ${edge.toFixed(1)} tiles)`);
    check(!!a.dest, 'o líder tem destino no meio do mapa');
  }
}

console.log('# vacas no pasto: estação, macho e descanso');
{
  const g = newGame(8);
  const { x0, y0, keep } = pen(g);
  g.animals = [];
  const cows = [0, 1, 2, 3].map(k => makeAnimal(g, 'gado', x0 + 1 + k, y0 + 2, { owned: true, sex: 'f', weight: 380 }));
  check(breedChance(g, cows[0]).why === 'sem macho', 'sem touro não emprenha: ' + breedText(g, cows[0]));
  makeAnimal(g, 'gado', x0 + 6, y0 + 4, { owned: true, sex: 'm', weight: 450 });
  check(breedChance(g, cows[0]).p > 0, 'com touro pode emprenhar: ' + breedText(g, cows[0]));
  let births = 0, rested = false;
  const notes = [];
  g.notify = t => notes.push(t);
  for (let d = 0; d < YEAR_DAYS; d++) {
    keep();
    for (const a of g.animals) { a.hunger = Math.max(a.hunger, 0.9); a.thirst = Math.max(a.thirst, 0.9); }
    advance(g, 1440);
    if (cows.some(c => c.rest > 0)) rested = true;
  }
  births = notes.filter(t => t.startsWith('Nasce')).length;
  const calves = g.animals.filter(a => a.mom && a.owned);
  console.log(`  1 ano: ${births} partos, ${calves.length} bezerros, ${g.animals.filter(a => a.owned).length} no pasto`);
  check(births >= 2 && births <= 8, 'cria em ritmo razoável');
  check(rested, 'vaca descansa depois do parto');
  check(calves.every(c => cows.some(m => m.id === c.mom)), 'bezerro sabe quem é a mãe');
  // estação: ovelha prefere o outono
  const s = ANIMALS.ovelha.season;
  check(s[2] > s[0], 'ovelha cruza mais no outono');
}

console.log('# ovos férteis chocam; sem galo não');
for (const galo of [true, false]) {
  const g = newGame(9), w = g.world;
  const { x0, y0 } = pen(g);
  g.animals = [];
  for (let k = 0; k < 4; k++) makeAnimal(g, 'galinha', x0 + 2 + k, y0 + 3, { owned: true, sex: 'f' });
  if (galo) makeAnimal(g, 'galinha', x0 + 3, y0 + 5, { owned: true, sex: 'm' });
  const start = g.animals.length;
  for (let d = 0; d < 20; d++) {
    for (const a of g.animals) { a.hunger = 1; a.thirst = 1; }
    advance(g, 1440);
  }
  const chicks = g.animals.filter(a => a.owned && a.sp === 'galinha').length - start;
  console.log(`  ${galo ? 'com' : 'sem'} galo: ${chicks} pintinhos em 20 dias (${g.animals.filter(a => a.owned).length} galinhas no total)`);
  if (galo) check(chicks > 0 && chicks <= 20, 'ovos esquecidos chocaram');
  else check(chicks === 0, 'sem galo nenhum pintinho');
}

console.log('# filhote solto segue a mãe para dentro do pasto');
{
  const g = newGame(10);
  const { x0, y0 } = pen(g);
  const mom = makeAnimal(g, 'gado', x0 + 2, y0 + 2, { owned: true, sex: 'f', weight: 360 });
  const calf = makeAnimal(g, 'gado', x0 + 3, y0 + 2, { adult: false });
  calf.mom = mom.id;
  advance(g, 1440);
  check(calf.owned, 'bezerro ficou com o dono da mãe');
}

console.log('# bichos novos: pata bota ovo de pata, lhama dá fibra, búfala dá leite');
{
  const g = newGame(12), w = g.world;
  const { x0, y0 } = pen(g);
  g.animals = [];
  const pata = makeAnimal(g, 'pato', x0 + 2, y0 + 2, { owned: true, sex: 'f' });
  makeAnimal(g, 'pato', x0 + 3, y0 + 2, { owned: true, sex: 'm' });
  const lhama = makeAnimal(g, 'lhama', x0 + 5, y0 + 3, { owned: true, sex: 'f' });
  const bufala = makeAnimal(g, 'bufalo', x0 + 7, y0 + 5, { owned: true, sex: 'f', weight: 500 });
  for (let d = 0; d < 12; d++) { for (const a of g.animals) { a.hunger = 1; a.thirst = 1; } advance(g, 1440); }
  const ninho = w.drops.find(e => e.sp === 'pato');
  check(!!ninho && ninho.f, 'pata botou ovo fértil');
  if (ninho) {
    g.player.x = ninho.x + 1.5; g.player.y = ninho.y + 0.5;
    const r = useTool(g, 'mao', ninho.x, ninho.y, ninho.x + 0.5, ninho.y + 0.5);
    check((g.inv.ovos_pato || 0) > 0, 'recolheu ovos de pata: ' + (r && r.msg));
  }
  for (const [a, item, nome] of [[lhama, 'fibra_lhama', 'fibra'], [bufala, 'leite_bufala', 'leite']]) {
    g.player.x = a.x - 1; g.player.y = a.y;
    const r = useTool(g, 'mao', Math.floor(a.x), Math.floor(a.y), a.x, a.y);
    check((g.inv[item] || 0) > 0, `${nome}: ${r && r.msg}`);
  }
  const tipos = new Set(newGame(13).animals.map(a => a.sp));
  check(tipos.size === Object.keys(ANIMALS).length, `todas as ${tipos.size} espécies aparecem soltas no mapa`);
}

console.log(fails ? `\n${fails} FALHA(S)` : '\nTudo certo.');
process.exit(fails ? 1 : 0);
