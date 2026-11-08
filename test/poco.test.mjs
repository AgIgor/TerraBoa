// node test/poco.test.mjs — poço longe do rio abastece aspersor e regador
import { newGame, advance } from '../src/game.js';
import { useTool } from '../src/actions.js';
import { G, O, BUILD_LIST, SPRINKLER } from '../src/config.js';
let fails = 0;
const check = (c, m) => { console.log((c ? '  ok: ' : '  FALHOU: ') + m); if (!c) fails++; };
const g = newGame(77), w = g.world;
let spot = null;
for (let y = 5; y < w.h - 5 && !spot; y++) for (let x = 5; x < w.w - 5 && !spot; x++)
  if (!w.nearWater(x, y, SPRINKLER.water + 2)) spot = [x, y];
check(!!spot, 'achou lugar longe da água: ' + spot);
const [x, y] = spot;
for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const i = w.idx(x + dx, y + dy); w.obj[i] = O.NONE; w.crops.delete(i); w.ground[i] = G.GRASS; w.moist[i] = 0.05; }
g.inv.aspersor = 1; g.inv.poco = 1;
g.player.x = x + 1.5; g.player.y = y + 2.5;
g.player.build = BUILD_LIST.findIndex(b => b.id === 'aspersor');
useTool(g, 'construir', x, y);
check(!w.nearWater(x, y, SPRINKLER.water), 'sem poço o aspersor não tem água');
g.player.build = BUILD_LIST.findIndex(b => b.id === 'poco');
const r = useTool(g, 'construir', x + 3, y);
check(w.obj[w.idx(x + 3, y)] === O.WELL, 'poço construído: ' + (r && r.msg));
check(w.nearWater(x, y, SPRINKLER.water), 'aspersor agora tem água');
for (const d of g.climate.days) d.rain = 0;
g.time = Math.floor(g.time / 1440) * 1440 + 5 * 60 + 30;
advance(g, 60);
check(w.moist[w.idx(x - 2, y + 2)] >= SPRINKLER.moist - 0.05, 'aspersor molhou a terra (umidade ' + w.moist[w.idx(x - 2, y + 2)].toFixed(2) + ')');
g.player.water = 0; g.player.x = x + 2.5; g.player.y = y + 1.5;
const rr = useTool(g, 'regador', x + 3, y);
check(g.player.water > 0, 'regador encheu no poço: ' + (rr && rr.msg));
console.log(fails ? `\n${fails} FALHA(S)` : '\nTudo certo.');
process.exit(fails ? 1 : 0);
