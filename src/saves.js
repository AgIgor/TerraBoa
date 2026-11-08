// Saves no navegador: um automático (o mesmo de antes) e 3 espaços manuais.
// Cada save guarda um resumo à parte para listar sem abrir o arquivo inteiro.
import { serialize, deserialize, dateText, SAVE_KEY } from './game.js';

export const AUTO = SAVE_KEY;
export const SLOTS = ['terraboa-slot-1', 'terraboa-slot-2', 'terraboa-slot-3'];
const META = 'terraboa-meta';

function readMeta() {
  try { return JSON.parse(localStorage.getItem(META) || '{}'); } catch { return {}; }
}
function writeMeta(m) { try { localStorage.setItem(META, JSON.stringify(m)); } catch {} }

export function summary(g) {
  const d = dateText(g);
  const own = g.animals.filter(a => a.owned).length;
  return { year: d.year, season: d.season, month: d.month, day: d.dayOfSeason, money: Math.round(g.money), animals: own, crops: g.world.crops.size, savedAt: Date.now(), seed: g.seed };
}

export function saveTo(key, g) {
  try {
    localStorage.setItem(key, serialize(g));
    const m = readMeta(); m[key] = summary(g); writeMeta(m);
    return true;
  } catch (e) { console.warn('save falhou', e); return false; }
}

export function loadFrom(key) {
  try {
    const s = localStorage.getItem(key);
    return s ? deserialize(s) : null;
  } catch (e) { console.warn('save inválido', e); return null; }
}

export function remove(key) {
  try { localStorage.removeItem(key); } catch {}
  const m = readMeta(); delete m[key]; writeMeta(m);
}

export function has(key) { try { return !!localStorage.getItem(key); } catch { return false; } }

// Lista com resumo. Saves antigos sem resumo são lidos uma vez para gerar o resumo.
export function list() {
  const m = readMeta();
  const out = [];
  for (const key of [AUTO, ...SLOTS]) {
    if (!has(key)) { out.push({ key, empty: true }); continue; }
    if (!m[key]) { const g = loadFrom(key); if (g) { m[key] = summary(g); m[key].savedAt = 0; writeMeta(m); } }
    out.push({ key, ...(m[key] || {}) });
  }
  return out;
}

export function describe(s) {
  if (s.empty) return 'vazio';
  const when = s.savedAt ? new Date(s.savedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  return `Ano ${s.year} · ${s.season}, ${s.month} · R$ ${(s.money ?? 0).toLocaleString('pt-BR')} · ${s.animals ?? 0} animais${when ? ' · salvo ' + when : ''}`;
}
