// node test/sim.test.mjs — simula a fazenda sem navegador e confere se os números fazem sentido.
import { newGame, advance, advanceWithAnimals, serialize, deserialize, dayOf } from '../src/game.js';
import { useTool } from '../src/actions.js';
import { G, O, YEAR_DAYS } from '../src/config.js';
import { COMMODITIES } from '../src/market.js';
import { makeAnimal } from '../src/animals.js';

let fails = 0;
const check = (cond, msg) => { if (!cond) { fails++; console.log('  FALHOU:', msg); } else console.log('  ok:', msg); };

console.log('# clima ao longo de 4 anos');
{
  const g = newGame(1234);
  const bySeason = [[], [], [], []];
  let frosts = 0, frostWinter = 0, frostSummer = 0, maxDry = 0;
  for (let d = 0; d < YEAR_DAYS * 4; d++) {
    advance(g, 1440);
    const t = g.climate.days[0];
    bySeason[t.season].push(t);
    if (t.frost) { frosts++; if (t.season === 3) frostWinter++; if (t.season === 1) frostSummer++; }
    maxDry = Math.max(maxDry, g.climate.dryStreak);
  }
  const names = ['Primavera', 'Verão', 'Outono', 'Inverno'];
  bySeason.forEach((arr, i) => {
    const rain = arr.reduce((s, d) => s + d.rain, 0) / arr.length * 12;
    const tmax = arr.reduce((s, d) => s + d.tMax, 0) / arr.length;
    const tmin = arr.reduce((s, d) => s + d.tMin, 0) / arr.length;
    console.log(`  ${names[i].padEnd(10)} chuva/estação ${rain.toFixed(0).padStart(4)} mm  máx ${tmax.toFixed(1)}°  mín ${tmin.toFixed(1)}°`);
  });
  console.log(`  geadas: ${frosts} (${frostWinter} no inverno), maior sequência seca: ${maxDry} dias`);
  const rainV = bySeason[1].reduce((s, d) => s + d.rain, 0), rainI = bySeason[3].reduce((s, d) => s + d.rain, 0);
  check(rainV > rainI * 3, 'verão chove bem mais que o inverno');
  check(frosts >= 1 && frostWinter >= frosts * 0.5 && frostSummer === 0, 'geada acontece, sobretudo no inverno, nunca no verão');

  console.log('# mercado');
  for (const id in COMMODITIES) {
    const h = g.market.c[id].hist;
    const mn = Math.min(...h), mx = Math.max(...h), b = COMMODITIES[id].base;
    console.log(`  ${id.padEnd(8)} base ${b.toString().padStart(5)}  min ${mn.toFixed(2).padStart(6)}  max ${mx.toFixed(2).padStart(6)}`);
    if (!(mn > b * 0.35 && mx < b * 2.6)) { fails++; console.log('  FALHOU: preço fora da faixa', id); }
  }
  console.log(`  notícias: ${g.market.news.length}; ex.: ${g.market.news.slice(0, 3).map(n => n.text).join(' | ')}`);
}

console.log('# lavoura de milho na primavera, regada');
{
  const g = newGame(42);
  const w = g.world, { cx, cy } = w.farm;
  const tiles = [];
  for (let dx = -3; dx <= 2; dx++) {
    const x = cx + dx, y = cy + 4;
    const i = w.idx(x, y);
    w.obj[i] = O.NONE; w.ground[i] = G.GRASS;
    useTool(g, 'enxada', x, y);
    g.player.plant = 0;
    const r = useTool(g, 'plantar', x, y);
    tiles.push(i);
    if (!w.crops.has(i)) console.log('   plantio falhou', r);
  }
  check(tiles.every(i => w.crops.has(i)), 'plantou 6 pés de milho');
  // cerca em volta para os bichos não comerem
  for (let x = cx - 4; x <= cx + 3; x++) for (const y of [cy + 3, cy + 5]) { const i = w.idx(x, y); w.obj[i] = O.FENCE; }
  w.obj[w.idx(cx - 4, cy + 4)] = O.FENCE; w.obj[w.idx(cx + 3, cy + 4)] = O.FENCE;
  w.recomputeComponents();
  let day = 0;
  while (day < 25 && !tiles.every(i => w.crops.get(i)?.ripe || w.crops.get(i)?.dead)) {
    for (const i of tiles) if (w.moist[i] < 0.35) w.moist[i] = 0.8; // regando
    advanceWithAnimals(g, 1440, 10);
    day++;
  }
  const crops = tiles.map(i => w.crops.get(i));
  console.log(`  dias até madurar: ${day}; saúde: ${crops.map(c => c.health.toFixed(2)).join(' ')}`);
  check(crops.every(c => c.ripe), 'milho madurou');
  check(day >= 9 && day <= 18, 'tempo de ciclo razoável (9–18 dias)');
  const before = g.inv.milho || 0;
  for (const i of tiles) useTool(g, 'mao', i % w.w, (i / w.w) | 0);
  console.log(`  colheu ${(g.inv.milho || 0) - before} sacas`);
  check((g.inv.milho || 0) - before >= 12, 'colheita de pelo menos 2 sacas por pé');
}

console.log('# lavoura sem água no inverno seca');
{
  const g = newGame(7);
  const w = g.world, { cx, cy } = w.farm;
  advance(g, 1440 * 37); // pula para o inverno
  const x = cx - 2, y = cy + 4, i = w.idx(x, y);
  w.obj[i] = O.NONE; w.ground[i] = G.TILLED;
  w.crops.set(i, { type: 'soja', prog: 0, health: 1, harvests: 0, ripe: false, dead: false });
  w.moist[i] = 0.3;
  advance(g, 1440 * 8);
  const c = w.crops.get(i);
  console.log(`  soja após 8 dias secos: prog ${c.prog.toFixed(2)}, saúde ${c.health.toFixed(2)}, morta ${c.dead}`);
  check(c.dead || c.health < 0.5, 'soja sofre sem chuva no inverno');
}

console.log('# vaca no pasto cercado com água');
{
  const g = newGame(99);
  const w = g.world, { cx, cy } = w.farm;
  // pasto 8x6 abaixo da casa
  const x0 = cx - 4, y0 = cy + 5;
  for (let y = y0 - 1; y <= y0 + 6; y++) for (let x = x0 - 1; x <= x0 + 8; x++) {
    const i = w.idx(x, y);
    const border = y === y0 - 1 || y === y0 + 6 || x === x0 - 1 || x === x0 + 8;
    w.obj[i] = border ? O.FENCE : O.NONE;
    if (!border) { w.ground[i] = G.PASTURE; w.grass[i] = 0.9; w.moist[i] = 0.6; }
  }
  const ti = w.idx(x0, y0); w.obj[ti] = O.TROUGH; w.troughs.set(ti, { water: 10 });
  w.recomputeComponents();
  const cow = makeAnimal(g, 'gado', x0 + 3, y0 + 2, { owned: true, sex: 'f', weight: 380 });
  const bull = makeAnimal(g, 'gado', x0 + 5, y0 + 3, { owned: true, sex: 'm', weight: 420 });
  check(!w.compOpen.has(w.comp[w.idx(x0 + 3, y0 + 2)]), 'pasto reconhecido como fechado');
  let milk = 0;
  for (let d = 0; d < 20; d++) {
    w.troughs.get(ti).water = 10;
    advanceWithAnimals(g, 1440, 5);
    milk += Math.floor(cow.milk); cow.milk -= Math.floor(cow.milk);
  }
  const grassLeft = (() => { let s = 0; for (let y = y0; y < y0 + 6; y++) for (let x = x0; x < x0 + 8; x++) s += w.grass[w.idx(x, y)]; return s / 48; })();
  console.log(`  20 dias: leite ${milk} L, peso boi ${bull.weight.toFixed(0)} kg, saúde vaca ${cow.health.toFixed(2)}, prenhe ${cow.preg}, capim médio ${grassLeft.toFixed(2)}, animais ${g.animals.filter(a => a.owned).length}`);
  check(g.animals.includes(cow) && cow.health > 0.6, 'vaca saudável');
  check(milk > 60, 'produziu leite');
  check(bull.weight > 420, 'boi engordou');
  check(cow.owned && bull.owned, 'ninguém fugiu do pasto fechado');
}

console.log('# salvar e carregar');
{
  const g = newGame(5);
  advanceWithAnimals(g, 1440 * 3, 10);
  const s = serialize(g);
  const h = deserialize(s);
  check(dayOf(h) === dayOf(g) && h.animals.length === g.animals.length && h.world.crops.size === g.world.crops.size, 'estado restaurado');
  advance(g, 1440); advance(h, 1440);
  check(Math.abs(g.market.c.soja.price - h.market.c.soja.price) < 1e-9, 'simulação continua igual depois de carregar');
  console.log(`  save: ${(s.length / 1024).toFixed(0)} KB`);
}

console.log(fails ? `\n${fails} FALHA(S)` : '\nTudo certo.');
process.exit(fails ? 1 : 0);
