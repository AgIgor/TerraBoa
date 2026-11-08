// Clima diário: temperatura, chuva, geada e eventos (veranico, frente fria, onda de calor).
import { SEASONS, DAYS_PER_SEASON, YEAR_DAYS } from './config.js';

const FORECAST_DAYS = 5;

export const ENSO = {
  '-1': { name: 'La Niña', dt: -0.7, rain: 1.15, frost: 1.4, text: 'Ano mais frio e chuvoso; mais risco de geada.' },
  '0': { name: 'Neutro', dt: 0, rain: 1, frost: 1, text: 'Ano dentro do normal.' },
  '1': { name: 'El Niño', dt: 0.9, rain: 0.78, frost: 0.6, text: 'Ano mais quente e seco; veranicos mais longos.' },
};

export function seasonIndex(doy) { return Math.floor(doy / DAYS_PER_SEASON) % 4; }

// Interpola os parâmetros entre os centros das estações para não haver degrau.
export function seasonParams(doy) {
  const pos = (doy - DAYS_PER_SEASON / 2) / DAYS_PER_SEASON;
  const base = Math.floor(pos);
  const f = pos - base;
  const s = f * f * (3 - 2 * f);
  const a = SEASONS[((base % 4) + 4) % 4], b = SEASONS[(((base + 1) % 4) + 4) % 4];
  const mix = k => a[k] + (b[k] - a[k]) * s;
  return { tMean: mix('tMean'), amp: mix('amp'), rainP: mix('rainP'), rainMean: mix('rainMean') };
}

export function initClimate(rng) {
  const c = { enso: pickEnso(rng), spell: null, prevRain: false, days: [], dryStreak: 0 };
  for (let d = 0; d <= FORECAST_DAYS; d++) c.days.push(genDay(c, rng, d));
  return c;
}

function pickEnso(rng) {
  const r = rng.next();
  return r < 0.28 ? -1 : r < 0.7 ? 0 : 1;
}

// Gera o tempo de um dia (índice absoluto do dia).
export function genDay(c, rng, day) {
  const doy = day % YEAR_DAYS;
  const si = seasonIndex(doy);
  const S = seasonParams(doy);
  const en = ENSO[c.enso];
  let tMean = S.tMean + en.dt + rng.gauss() * 1.4;
  let rainP = S.rainP * en.rain;
  if (c.prevRain) rainP = Math.min(0.9, rainP + 0.18);
  let amp = S.amp;

  // eventos de vários dias
  if (!c.spell) {
    if ((si === 0 || si === 1) && rng.chance(0.035 / en.rain)) c.spell = { kind: 'veranico', left: rng.int(5, 9) + (c.enso === 1 ? 2 : 0) };
    else if (si === 3 && c.prevRain && rng.chance(0.45)) c.spell = { kind: 'frente', left: rng.int(2, 4) };
    else if (si === 3 && rng.chance(0.05 * en.frost)) c.spell = { kind: 'frente', left: rng.int(2, 3) };
    else if ((si === 0 || si === 1) && rng.chance(0.025 + (c.enso === 1 ? 0.02 : 0))) c.spell = { kind: 'calor', left: rng.int(3, 5) };
  }
  let event = null;
  if (c.spell) {
    event = c.spell.kind;
    if (event === 'veranico') { rainP *= 0.08; tMean += 1.8; }
    if (event === 'frente') { tMean -= 6.5 * (c.enso === -1 ? 1.15 : 1); rainP *= 0.25; amp *= 1.1; }
    if (event === 'calor') { tMean += 5; rainP *= 0.35; }
    if (--c.spell.left <= 0) c.spell = null;
  }

  let rain = 0;
  if (rng.chance(Math.min(0.92, rainP))) {
    rain = S.rainMean * (0.25 + -Math.log(1 - rng.next() * 0.98));
    rain = Math.round(rain * 10) / 10;
  }
  if (rain > 0) amp *= 0.55;
  let tMax = tMean + amp / 2 - (rain > 0 ? 1.5 : 0);
  let tMin = tMean - amp / 2;
  // geada: noite limpa e fria. A relva fica uns graus abaixo do ar.
  const frost = rain === 0 && tMin <= 3.5;
  const storm = rain >= 30 || (rain > 12 && tMax > 29 && rng.chance(0.4));
  let rainStart = 0, rainHours = 0;
  if (rain > 0) {
    rainHours = Math.max(1, Math.min(10, Math.round(rain / 6 + rng.range(1, 3))));
    rainStart = si === 1 || si === 0 ? rng.int(13, 17) : rng.int(0, 20);
  }
  c.prevRain = rain > 0;
  return {
    day, doy, season: si, tMin: round1(tMin), tMax: round1(tMax), rain, rainStart, rainHours,
    frost, storm, event, cloud: rain > 0 ? 0.85 : rng.range(0, 0.6),
  };
}

const round1 = v => Math.round(v * 10) / 10;

// Avança o clima para o próximo dia. Troca de fase ENSO no começo de cada ano.
export function climateNextDay(c, rng, newDay) {
  if (newDay % YEAR_DAYS === 0) c.enso = pickEnso(rng);
  c.days.shift();
  c.days.push(genDay(c, rng, newDay + FORECAST_DAYS));
  const today = c.days[0];
  c.dryStreak = today.rain > 0 ? 0 : c.dryStreak + 1;
  return today;
}

// Temperatura na hora h (0..24): mínima às 5h, máxima às 15h.
export function tempAt(d, h) {
  const { tMin, tMax } = d;
  if (h >= 5 && h <= 15) return tMin + (tMax - tMin) * (1 - Math.cos(Math.PI * (h - 5) / 10)) / 2;
  const t = h > 15 ? h - 15 : h + 9; // 0..14 h esfriando
  return tMax - (tMax - tMin) * (1 - Math.cos(Math.PI * t / 14)) / 2;
}

// Chuva (mm) que cai na hora h do dia
export function rainAt(d, h) {
  if (!d.rain) return 0;
  const end = d.rainStart + d.rainHours;
  return h >= d.rainStart && h < end ? d.rain / d.rainHours : 0;
}

export function weatherLabel(d, h = 12) {
  if (h != null && rainAt(d, Math.floor(h)) > 0) return d.storm ? 'Tempestade' : d.rain < 6 ? 'Garoa' : 'Chuva';
  if (d.frost && h < 9) return 'Geada';
  if (d.tMax >= 34) return 'Calor forte';
  if (d.rain > 0) return d.storm ? 'Tempestade à tarde' : 'Pancadas de chuva';
  if (d.cloud > 0.45) return 'Nublado';
  if (d.tMax < 18) return 'Frio';
  return 'Ensolarado';
}

export function weatherIcon(d, h = 12) {
  const l = weatherLabel(d, h);
  return { 'Tempestade': '⛈️', 'Tempestade à tarde': '⛈️', 'Garoa': '🌦️', 'Chuva': '🌧️', 'Pancadas de chuva': '🌦️', 'Geada': '❄️', 'Calor forte': '🔥', 'Nublado': '☁️', 'Frio': '🌥️', 'Ensolarado': '☀️' }[l] || '☀️';
}

export const EVENT_TEXT = {
  veranico: 'Veranico: dias secos no meio da época de chuva',
  frente: 'Frente fria: temperatura despenca',
  calor: 'Onda de calor',
};
