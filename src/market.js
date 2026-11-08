// Mercado: preço = base × sazonalidade × exp(passeio aleatório + choques + pressão de venda).
import { YEAR_DAYS } from './config.js';

// peak = dia do ano (0 = início de setembro) em que o preço costuma estar mais alto (entressafra).
// depth = quantas unidades o mercado absorve antes do preço cair ~10%.
export const COMMODITIES = {
  milho:   { name: 'Milho', unit: 'saca', base: 8,    amp: 0.16, peak: 14, vol: 0.030, depth: 160 },
  soja:    { name: 'Soja', unit: 'saca', base: 14,   amp: 0.12, peak: 46, vol: 0.032, depth: 160 },
  cana:    { name: 'Cana', unit: 'feixe', base: 5,    amp: 0.10, peak: 16, vol: 0.018, depth: 240 },
  cafe:    { name: 'Café', unit: 'saca', base: 40,   amp: 0.11, peak: 18, vol: 0.050, depth: 60 },
  pimenta: { name: 'Pimenta', unit: 'kg', base: 22,   amp: 0.15, peak: 6,  vol: 0.055, depth: 50 },
  leite:   { name: 'Leite', unit: 'litro', base: 1.9,  amp: 0.18, peak: 44, vol: 0.020, depth: 400 },
  ovos:    { name: 'Ovos', unit: 'unidade', base: 0.45, amp: 0.10, peak: 26, vol: 0.025, depth: 500 },
  boi:     { name: 'Boi gordo', unit: 'arroba', base: 24,   amp: 0.09, peak: 2,  vol: 0.022, depth: 120, animal: true },
  porco:   { name: 'Suíno', unit: 'kg vivo', base: 2.6,  amp: 0.10, peak: 14, vol: 0.030, depth: 900, animal: true },
  frango:  { name: 'Galinha', unit: 'cabeça', base: 15,   amp: 0.06, peak: 14, vol: 0.020, depth: 60, animal: true },
  leite_cabra: { name: 'Leite de cabra', unit: 'litro', base: 4.2, amp: 0.12, peak: 44, vol: 0.025, depth: 120 },
  la:      { name: 'Lã', unit: 'kg', base: 9, amp: 0.14, peak: 34, vol: 0.035, depth: 80 },
  madeira: { name: 'Madeira', unit: 'unidade', base: 1.6, amp: 0.06, peak: 30, vol: 0.02, depth: 300 },
  cavalo:  { name: 'Cavalo', unit: 'cabeça', base: 950, amp: 0.05, peak: 0, vol: 0.020, depth: 8, animal: true },
  cordeiro: { name: 'Cordeiro', unit: 'kg vivo', base: 5.5, amp: 0.10, peak: 22, vol: 0.030, depth: 400, animal: true },
  caprino: { name: 'Cabrito', unit: 'kg vivo', base: 5, amp: 0.08, peak: 14, vol: 0.030, depth: 400, animal: true },
};
export const SELLABLE = ['milho', 'soja', 'cana', 'cafe', 'pimenta', 'leite', 'ovos', 'leite_cabra', 'la', 'madeira'];

// Insumos: preço ligado a uma commodity (semente cara quando o grão está caro).
export const INPUTS = [
  { id: 'sem_milho', name: 'Semente de milho', pack: 10, link: 'milho', k: 0.32 },
  { id: 'sem_soja', name: 'Semente de soja', pack: 10, link: 'soja', k: 0.32 },
  { id: 'muda_cana', name: 'Muda de cana', pack: 10, link: 'cana', k: 0.6 },
  { id: 'muda_cafe', name: 'Muda de café', pack: 5, link: 'cafe', k: 0.45 },
  { id: 'muda_pimenta', name: 'Muda de pimenta', pack: 5, link: 'pimenta', k: 0.32 },
  { id: 'sem_capim', name: 'Semente de capim', pack: 20, fixed: 0.9 },
  { id: 'adubo', name: 'Adubo', pack: 5, fixed: 6, link: 'soja', k: 0, dollar: true },
  { id: 'racao', name: 'Ração', pack: 10, link: 'milho', k: 1.25 },
  { id: 'madeira', name: 'Madeira', pack: 10, fixed: 2.5 },
  { id: 'bebedouro', name: 'Bebedouro', pack: 1, fixed: 45 },
  { id: 'aspersor', name: 'Aspersor', pack: 1, fixed: 90, dollar: true },
  { id: 'silo', name: 'Silo metálico (kit)', pack: 1, fixed: 1150, dollar: true },
];

// Notícias aleatórias. p = chance por dia. fx = choque no log-preço.
const NEWS = [
  { p: 0.010, text: 'China amplia compras de soja do Brasil', fx: { soja: 0.12, milho: 0.03 } },
  { p: 0.008, text: 'Safra recorde nos EUA derruba grãos em Chicago', fx: { soja: -0.12, milho: -0.13 } },
  { p: 0.008, text: 'Dólar dispara frente ao real', fx: { soja: 0.07, milho: 0.05, cafe: 0.08, boi: 0.04, pimenta: 0.06, dollar: 0.10 } },
  { p: 0.008, text: 'Real se valoriza; exportações perdem força', fx: { soja: -0.06, milho: -0.04, cafe: -0.07, pimenta: -0.05, dollar: -0.08 } },
  { p: 0.006, text: 'Vietnã tem quebra na safra de pimenta-do-reino', fx: { pimenta: 0.28 } },
  { p: 0.005, text: 'Estoques mundiais de café em alta', fx: { cafe: -0.15 } },
  { p: 0.006, text: 'Governo aumenta mistura de etanol na gasolina', fx: { cana: 0.14, milho: 0.04 } },
  { p: 0.004, text: 'Embargo suspende exportação de carne bovina', fx: { boi: -0.14 } },
  { p: 0.005, text: 'Frigoríficos disputam boi: oferta curta', fx: { boi: 0.10 } },
  { p: 0.004, text: 'Peste suína na Ásia aumenta procura por carne de porco', fx: { porco: 0.18, milho: 0.03 } },
  { p: 0.004, text: 'Gripe aviária fecha granjas: ovo e frango sobem', fx: { ovos: 0.22, frango: 0.15 } },
  { p: 0.006, text: 'Laticínios reduzem preço pago ao produtor', fx: { leite: -0.12 } },
  { p: 0.005, text: 'Indústria de ração compra milho em peso', fx: { milho: 0.10 } },
  { p: 0.004, text: 'Indústria têxtil volta a comprar lã nacional', fx: { la: 0.18 } },
  { p: 0.004, text: 'Lã importada do Uruguai derruba preço', fx: { la: -0.15 } },
  { p: 0.004, text: 'Queijarias artesanais procuram leite de cabra', fx: { leite_cabra: 0.16, caprino: 0.05 } },
  { p: 0.003, text: 'Festa de Páscoa aquece venda de cordeiro', fx: { cordeiro: 0.12 } },
  { p: 0.003, text: 'Temporada de rodeios: cavalos valorizados', fx: { cavalo: 0.10 } },
  { p: 0.004, text: 'Diesel sobe nas bombas', fx: { dollar: 0.05 } },
  { p: 0.004, text: 'Construção civil aquecida: madeira valoriza', fx: { madeira: 0.15 } },
];

function seasonal(c, doy) { return 1 + c.amp * Math.cos(2 * Math.PI * (doy - c.peak) / YEAR_DAYS); }

export function initMarket(rng) {
  const m = { c: {}, news: [], dollar: 0 };
  for (const id in COMMODITIES) m.c[id] = { x: rng.gauss() * 0.04, shock: 0, impact: 0, hist: [] };
  for (const id in COMMODITIES) m.c[id].price = calcPrice(m, id, 0);
  // um ano de histórico antes do início, para os gráficos já terem curva
  for (let d = 0; d < YEAR_DAYS; d++) marketDay(m, rng, d + 1, null, null);
  for (const id in COMMODITIES) {
    const s = m.c[id];
    s.price = calcPrice(m, id, 0);
    s.hist[s.hist.length - 1] = Math.round(s.price * 100) / 100;
  }
  m.news = [];
  return m;
}

function calcPrice(m, id, doy) {
  const c = COMMODITIES[id], s = m.c[id];
  return c.base * seasonal(c, doy) * Math.exp(s.x + s.shock + s.impact);
}

export function price(m, id) { return m.c[id].price; }
export function buyPrice(m, id) { return m.c[id].price * 1.18; } // comprar sai mais caro que vender

export function inputPrice(m, inp) {
  let p = inp.fixed != null ? inp.fixed : 0;
  if (inp.link && inp.k) p += m.c[inp.link].price * inp.k;
  if (inp.dollar) p *= Math.exp(m.dollar);
  return p;
}

function addNews(m, day, text, fx) {
  m.news.unshift({ day, text, fx });
  if (m.news.length > 30) m.news.length = 30;
}

function applyFx(m, fx) {
  for (const k in fx) {
    if (k === 'dollar') m.dollar = Math.max(-0.3, Math.min(0.3, m.dollar + fx[k]));
    else m.c[k].shock += fx[k];
  }
}

// Um dia de mercado. weather = dia de hoje (o clima da região mexe nas safras de todo mundo).
export function marketDay(m, rng, day, weather, climate) {
  const doy = day % YEAR_DAYS;
  for (const id in COMMODITIES) {
    const c = COMMODITIES[id], s = m.c[id];
    s.x = s.x * 0.94 + c.vol * rng.gauss();
    s.shock *= 0.93;
    s.impact *= 0.82;
  }
  m.dollar *= 0.97;

  for (const n of NEWS) if (rng.chance(n.p)) { applyFx(m, n.fx); addNews(m, day, n.text, n.fx); }

  // clima regional
  if (weather) {
    if (weather.frost && weather.tMin <= 1.5 && !m.frostCooldown) {
      const k = rng.range(0.7, 1.2) * (weather.tMin < 0 ? 1.5 : 1);
      const fx = { cafe: 0.25 * k, cana: 0.06 * k, milho: 0.05 * k, leite: 0.04 };
      applyFx(m, fx);
      addNews(m, day, weather.tMin < 0 ? 'Geada forte queima cafezais em Minas: café dispara' : 'Geada atinge lavouras; mercado de café reage', fx);
      m.frostCooldown = 6;
    }
    if (m.frostCooldown) m.frostCooldown--;
    const si = Math.floor(doy / 12);
    if (climate && climate.dryStreak === 6 && (si === 0 || si === 1)) {
      const fx = { soja: 0.10, milho: 0.09, leite: 0.05, boi: 0.03 };
      applyFx(m, fx);
      addNews(m, day, 'Estiagem no plantio preocupa: soja e milho sobem', fx);
    }
    if (climate && climate.dryStreak === 14) {
      const fx = { leite: 0.08, boi: 0.06, cana: 0.06, cafe: 0.05 };
      applyFx(m, fx);
      addNews(m, day, 'Seca prolongada: pastos secos e menos leite no campo', fx);
    }
    if (weather.rain >= 45) {
      const fx = { soja: 0.03, cafe: 0.02 };
      applyFx(m, fx);
      addNews(m, day, 'Chuvas fortes atrapalham a colheita na região', fx);
    }
  }

  for (const id in COMMODITIES) {
    const s = m.c[id];
    s.shock = Math.max(-0.6, Math.min(0.8, s.shock));
    s.prev = s.price;
    s.price = calcPrice(m, id, doy);
    s.hist.push(Math.round(s.price * 100) / 100);
    if (s.hist.length > 96) s.hist.shift();
  }
}

// Vende qty unidades. O preço cai à medida que o mercado local enche.
export function sell(m, id, qty) {
  const c = COMMODITIES[id], s = m.c[id];
  let total = 0;
  for (let left = qty; left > 0;) {
    const chunk = Math.min(left, Math.max(1, Math.ceil(c.depth / 40)));
    total += chunk * s.price;
    s.impact -= 0.1 * chunk / c.depth;
    s.price = s.price * Math.exp(-0.1 * chunk / c.depth);
    left -= chunk;
  }
  return total;
}

export function buy(m, id, qty) {
  const c = COMMODITIES[id], s = m.c[id];
  const total = buyPrice(m, id) * qty;
  s.impact += 0.05 * qty / c.depth;
  s.price *= Math.exp(0.05 * qty / c.depth);
  return total;
}

export function trend(m, id, days = 7) {
  const h = m.c[id].hist;
  if (h.length < 2) return 0;
  const a = h[Math.max(0, h.length - 1 - days)];
  return (m.c[id].price - a) / a;
}

// Saves antigos: cria as commodities que ainda não existiam.
export function ensureMarket(m, day) {
  for (const id in COMMODITIES) {
    if (m.c[id]) continue;
    m.c[id] = { x: 0, shock: 0, impact: 0, hist: [] };
    m.c[id].price = calcPrice(m, id, day % YEAR_DAYS);
    m.c[id].hist.push(m.c[id].price);
  }
}
