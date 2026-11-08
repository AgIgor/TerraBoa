// Saves por fazenda: cada jogo tem um id e um nome, e o salvamento automático grava só na fazenda aberta.
// Começar um jogo novo cria outra fazenda — nunca sobrescreve as existentes.
import { serialize, deserialize, dateText } from './game.js';

const PREFIX = 'terraboa-farm-';
const INDEX = 'terraboa-farms';
const LAST = 'terraboa-last';
const LEGACY = [['terraboa-save-v1', 'Minha fazenda'], ['terraboa-slot-1', 'Espaço 1'], ['terraboa-slot-2', 'Espaço 2'], ['terraboa-slot-3', 'Espaço 3']];

const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { localStorage.setItem(k, v); }, // pode lançar erro de cota
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
function readIndex() { try { return JSON.parse(ls.get(INDEX) || '{}'); } catch { return {}; } }
function writeIndex(ix) { try { ls.set(INDEX, JSON.stringify(ix)); } catch (e) { console.warn('índice de saves', e); } }
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export function summary(g) {
  const d = dateText(g);
  return {
    year: d.year, season: d.season, month: d.month, day: d.dayOfSeason, money: Math.round(g.money),
    animals: g.animals.filter(a => a.owned).length, crops: g.world.crops.size, seed: g.seed, days: g.stats.days,
  };
}

// Grava a fazenda aberta. Retorna { ok, reason }.
export function saveFarm(g, thumb) {
  if (!g.farmId) return { ok: false, reason: 'sem fazenda' };
  try {
    ls.set(PREFIX + g.farmId, serialize(g));
  } catch (e) {
    console.warn('save falhou', e);
    return { ok: false, reason: 'O navegador está sem espaço para saves. Apague ou exporte alguma fazenda.' };
  }
  const ix = readIndex();
  const old = ix[g.farmId] || { created: Date.now() };
  ix[g.farmId] = { ...old, name: g.farmName || old.name || 'Fazenda', ...summary(g), savedAt: Date.now(), thumb: thumb || old.thumb };
  writeIndex(ix);
  ls.set(LAST, g.farmId);
  return { ok: true };
}

export function createFarm(g, name, thumb) {
  g.farmId = newId();
  g.farmName = (name || '').trim() || nextName();
  return saveFarm(g, thumb);
}

export function loadFarm(id) {
  const s = ls.get(PREFIX + id);
  if (!s) return null;
  try {
    const g = deserialize(s);
    g.farmId = id;
    g.farmName = readIndex()[id]?.name || g.farmName || 'Fazenda';
    try { ls.set(LAST, id); } catch {}
    return g;
  } catch (e) { console.warn('save inválido', e); return null; }
}

export function listFarms() {
  const ix = readIndex();
  return Object.entries(ix)
    .filter(([id]) => ls.get(PREFIX + id) != null)
    .map(([id, m]) => ({ id, ...m }))
    .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
}

export function lastId() {
  const id = ls.get(LAST);
  return id && ls.get(PREFIX + id) != null ? id : listFarms()[0]?.id || null;
}

export function deleteFarm(id) {
  ls.del(PREFIX + id);
  const ix = readIndex(); delete ix[id]; writeIndex(ix);
  if (ls.get(LAST) === id) ls.del(LAST);
}

export function renameFarm(id, name) {
  const ix = readIndex();
  if (!ix[id]) return;
  ix[id].name = name.trim() || ix[id].name;
  writeIndex(ix);
}

// Cópia da fazenda (ponto de volta). Retorna o id novo ou null.
export function duplicateFarm(id) {
  const s = ls.get(PREFIX + id);
  if (!s) return null;
  const ix = readIndex();
  const nid = newId();
  try { ls.set(PREFIX + nid, s); } catch { return null; }
  ix[nid] = { ...ix[id], name: `${ix[id]?.name || 'Fazenda'} (cópia)`, savedAt: Date.now(), created: Date.now() };
  writeIndex(ix);
  return nid;
}

// Arquivo para guardar fora do navegador ou levar para outro aparelho.
export function exportFarm(id) {
  const s = ls.get(PREFIX + id);
  if (!s) return null;
  const meta = readIndex()[id] || {};
  const name = (meta.name || 'fazenda').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').toLowerCase();
  return { filename: `terraboa-${name}.json`, text: JSON.stringify({ terraboa: 1, name: meta.name, save: JSON.parse(s) }) };
}

export function importFarm(text) {
  let o;
  try { o = JSON.parse(text); } catch { return { ok: false, reason: 'Arquivo inválido.' }; }
  const saveObj = o.terraboa ? o.save : o; // aceita também o save cru
  let g;
  try { g = deserialize(JSON.stringify(saveObj)); } catch { return { ok: false, reason: 'Esse arquivo não é um save do Terra Boa.' }; }
  const r = createFarm(g, `${o.name || 'Fazenda importada'}`);
  return { ...r, id: g.farmId };
}

function nextName() {
  const used = new Set(listFarms().map(f => f.name));
  for (let k = 1; ; k++) { const n = `Fazenda ${k}`; if (!used.has(n)) return n; }
}
export const suggestName = nextName;

// Uso aproximado do armazenamento (KB)
export function storageKB() {
  let n = 0;
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('terraboa')) n += (localStorage.getItem(k) || '').length; } } catch {}
  return Math.round(n / 1024);
}

// Converte os saves do sistema antigo (automático + 3 espaços) em fazendas, uma vez.
export function migrate() {
  let lastFromAuto = null;
  for (const [key, name] of LEGACY) {
    const s = ls.get(key);
    if (!s) continue;
    let g;
    try { g = deserialize(s); } catch { continue; }
    const r = createFarm(g, name);
    if (r.ok) {
      ls.del(key);
      if (key === LEGACY[0][0]) lastFromAuto = g.farmId;
    }
  }
  ls.del('terraboa-meta');
  if (lastFromAuto) try { ls.set(LAST, lastFromAuto); } catch {}
}

export function describe(f) {
  const when = f.savedAt ? new Date(f.savedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  return `Ano ${f.year} · ${f.season}, ${f.month} · R$ ${(f.money ?? 0).toLocaleString('pt-BR')} · ${f.animals ?? 0} animais${when ? ' · ' + when : ''}`;
}
