// Estado do jogo, avanço do tempo e salvamento. Sem DOM.
import { MONTHS, YEAR_DAYS, DAYS_PER_SEASON, SEASONS, REGADOR_MAX } from './config.js';
import { RNG } from './rng.js';
import { generateWorld, worldToJSON, worldFromJSON } from './world.js';
import { initClimate } from './climate.js';
import { initMarket, ensureMarket } from './market.js';
import { spawnWild, updateAnimals } from './animals.js';
import { updateWorkers } from './workers.js';
import { hourly, daily } from './sim.js';

export const SAVE_KEY = 'terraboa-save-v1';

export function newGame(seed = (Math.random() * 1e9) | 0) {
  const rng = new RNG(seed);
  const world = generateWorld(seed);
  const g = {
    version: 1, seed, rng, world,
    time: 6 * 60,          // minutos desde o início (dia 0, 6h)
    speed: 1, paused: false,
    money: 600,
    inv: { sem_milho: 20, sem_capim: 30, madeira: 40, muda_pimenta: 4, adubo: 2 },
    player: { x: world.spawn.x, y: world.spawn.y, fx: 0, fy: 1, tool: 0, plant: 0, build: 0, water: REGADOR_MAX, led: null, mount: null, sneak: false, moving: false, step: 0 },
    climate: initClimate(rng),
    market: initMarket(rng),
    animals: [], nextId: 1, workers: [], vehicles: [],
    flags: {}, stats: { days: 0, earned: 0, spent: 0, lost: 0, harvested: {} },
    log: [],
  };
  attach(g);
  spawnWild(g);
  return g;
}

// Funções que não vão para o save
function attach(g) {
  g.notify = (text, kind = 'info') => {
    g.log.unshift({ t: g.time, text, kind });
    if (g.log.length > 60) g.log.length = 60;
    if (g.onNotify) g.onNotify(text, kind);
  };
}

export const dayOf = g => Math.floor(g.time / 1440);
export const hourOf = g => (g.time % 1440) / 60;

export function dateText(g) {
  const d = dayOf(g), doy = d % YEAR_DAYS;
  const year = Math.floor(d / YEAR_DAYS) + 1;
  const s = SEASONS[Math.floor(doy / DAYS_PER_SEASON)];
  return { day: d, doy, year, season: s.name, month: MONTHS[Math.floor(doy / 4)], dayOfSeason: (doy % DAYS_PER_SEASON) + 1 };
}

export function clockText(g) {
  const m = Math.floor(g.time % 1440);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60 - (m % 10)).padStart(2, '0')}`;
}

// Avança o relógio (minutos de jogo), rodando a simulação a cada hora cheia.
export function advance(g, minutes) {
  while (minutes > 0) {
    const toHour = 60 - (g.time % 60);
    const step = Math.min(minutes, toHour);
    g.time += step;
    minutes -= step;
    if (g.time % 60 === 0) {
      const h = (g.time % 1440) / 60;
      if (h === 0) daily(g, dayOf(g));
      hourly(g, h);
    }
  }
}

// Avança com os animais andando (usado nos testes e ao dormir).
export function advanceWithAnimals(g, minutes, stepMin = 2) {
  for (let t = 0; t < minutes; t += stepMin) {
    updateAnimals(g, stepMin / 10);
    updateWorkers(g, stepMin / 10, hourOf(g));
    advance(g, Math.min(stepMin, minutes - t));
  }
}

export function sleep(g) {
  const h = hourOf(g);
  const target = (h >= 6 ? 24 - h + 6 : 6 - h) * 60;
  advanceWithAnimals(g, Math.round(target), 10);
}

// ---- salvar / carregar ----
export function serialize(g) {
  const { rng, world, notify, onNotify, ...rest } = g;
  return JSON.stringify({
    ...rest, rngState: rng.s, world: worldToJSON(world),
    animals: g.animals.map(a => ({ ...a, path: [], led: false })),
    workers: g.workers.map(k => ({ ...k, path: [], job: null, timer: 0 })),
  });
}

export function deserialize(json) {
  const o = JSON.parse(json);
  const g = { ...o };
  g.rng = new RNG(0); g.rng.s = o.rngState;
  delete g.rngState;
  g.world = worldFromJSON(o.world);
  g.workers ||= []; g.vehicles ||= [];
  g.player.mount ||= null;
  ensureMarket(g.market, dayOf(g));
  attach(g);
  return g;
}
