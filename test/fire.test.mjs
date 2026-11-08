// node test/fire.test.mjs — fogo: vento, aceiro, regador, chuva, início na seca; granizo; lampião.
import { newGame, advance } from '../src/game.js';
import { ignite, fireHour } from '../src/fire.js';
import { useTool } from '../src/actions.js';
import { G, O, BUILD_LIST, YEAR_DAYS } from '../src/config.js';

let fails = 0;
const check = (c, m) => { console.log((c ? '  ok: ' : '  FALHOU: ') + m); if (!c) fails++; };

// campo seco de 30x15 com um aceiro (terra arada) na coluna 20
function field(g) {
  const w = g.world, x0 = 10, y0 = 10;
  for (let y = y0; y < y0 + 15; y++) for (let x = x0; x < x0 + 30; x++) {
    const i = w.idx(x, y);
    w.ground[i] = x === x0 + 20 || x === x0 + 21 ? G.TILLED : G.GRASS; w.obj[i] = O.NONE; w.crops.delete(i);
    w.grass[i] = 0.55; w.moist[i] = 0.05;
  }
  return { x0, y0 };
}
const sunny = g => { const d = g.climate.days[0]; d.rain = 0; d.wind = 1.2; };

console.log('# espalha com o vento e para no aceiro');
{
  const g = newGame(31), w = g.world; g.animals = [];
  const { x0, y0 } = field(g); sunny(g);
  ignite(g, w.idx(x0 + 5, y0 + 7));
  let maxE = 0, maxW = 99, crossed = false;
  for (let h = 0; h < 30; h++) {
    fireHour(g, 12);
    for (const i of w.fires.keys()) { const x = i % w.w; maxE = Math.max(maxE, x - x0); maxW = Math.min(maxW, x - x0); if (x - x0 > 21) crossed = true; }
  }
  const burned = [...w.ash.keys()].length;
  console.log(`  queimou ${burned} tiles; chegou de ${maxW} a ${maxE} (começou em 5)`);
  check(burned > 25, 'fogo se espalhou pelo capim seco');
  check(maxE - 5 > 5 - maxW, 'andou mais para leste (a favor do vento)');
  check(!crossed, 'não atravessou o aceiro de terra arada');
}

console.log('# regador e chuva apagam');
{
  const g = newGame(32), w = g.world; g.animals = [];
  const { x0, y0 } = field(g); sunny(g);
  const i = w.idx(x0 + 3, y0 + 3); ignite(g, i);
  g.player.x = x0 + 2.5; g.player.y = y0 + 3.5;
  const r = useTool(g, 'regador', x0 + 3, y0 + 3);
  check(!w.fires.has(i), 'regador apagou: ' + r.msg);
  ignite(g, w.idx(x0 + 8, y0 + 8)); ignite(g, w.idx(x0 + 9, y0 + 8));
  const d = g.climate.days[0]; d.rain = 20; d.rainStart = 0; d.rainHours = 24;
  for (let h = 0; h < 3; h++) fireHour(g, 10);
  check(w.fires.size === 0, 'chuva apagou o fogo');
}

console.log('# começa sozinho na seca longa');
{
  let started = 0;
  for (let s = 0; s < 6; s++) {
    const g = newGame(100 + s); g.animals = [];
    // força uma seca longa de inverno
    advance(g, 1440 * 36);
    g.climate.dryStreak = 20;
    for (let d = 0; d < 10 && !g.world.fires.size && !g.world.ash.size; d++) {
      for (const day of g.climate.days) { day.rain = 0; day.rainHours = 0; }
      g.climate.dryStreak = 20;
      advance(g, 1440);
    }
    if (g.world.fires.size || g.world.ash.size) started++;
  }
  console.log(`  ${started}/6 mapas tiveram fogo em até 10 dias de seca`);
  check(started >= 2, 'seca longa provoca fogo de vez em quando');
}

console.log('# granizo e lampião');
{
  const g = newGame(40), w = g.world, { cx, cy } = w.farm;
  const i = w.idx(cx - 2, cy + 5); w.obj[i] = O.NONE; w.ground[i] = G.TILLED;
  w.crops.set(i, { type: 'cafe', prog: 0.5, health: 1, harvests: 0, ripe: false, dead: false });
  const d = g.climate.days[0]; d.rain = 30; d.rainStart = 10; d.rainHours = 4; d.storm = true; d.hail = true;
  g.time = Math.floor(g.time / 1440) * 1440 + 9 * 60;
  advance(g, 60 * 4);
  check(w.crops.get(i).health < 0.85, `granizo machucou o café (saúde ${w.crops.get(i).health.toFixed(2)})`);
  g.player.build = BUILD_LIST.findIndex(b => b.id === 'lampiao');
  g.player.x = cx + 0.5; g.player.y = cy + 4.5;
  const li = w.idx(cx + 1, cy + 6); w.obj[li] = O.NONE;
  useTool(g, 'construir', cx + 1, cy + 6);
  check(w.obj[li] === O.LAMP, 'lampião construído');
  let hails = 0; for (let k = 0; k < 4; k++) { const gg = newGame(200 + k); for (let dd = 0; dd < YEAR_DAYS; dd++) { advance(gg, 1440); if (gg.climate.days[0].hail) hails++; } }
  console.log(`  ${hails} dias de granizo em 4 anos`);
  check(hails >= 1 && hails < 40, 'granizo acontece, mas é raro');
}

console.log(fails ? `\n${fails} FALHA(S)` : '\nTudo certo.');
process.exit(fails ? 1 : 0);
