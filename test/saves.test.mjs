// node test/saves.test.mjs — fazendas: criar, não sobrescrever, migrar saves antigos, copiar, exportar/importar.
const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
  key: i => [...store.keys()][i],
  get length() { return store.size; },
};
const { newGame, serialize, advance } = await import('../src/game.js');
const S = await import('../src/saves.js');

let fails = 0;
const check = (c, m) => { console.log((c ? '  ok: ' : '  FALHOU: ') + m); if (!c) fails++; };

console.log('# migração dos saves antigos');
const old = newGame(1); old.money = 1234;
store.set('terraboa-save-v1', serialize(old));
store.set('terraboa-slot-2', serialize(newGame(2)));
store.set('terraboa-meta', '{}');
S.migrate();
let farms = S.listFarms();
check(farms.length === 2, 'dois saves antigos viraram duas fazendas');
check(!store.has('terraboa-save-v1') && !store.has('terraboa-slot-2') && !store.has('terraboa-meta'), 'chaves antigas removidas');
const autoId = S.lastId();
check(S.loadFarm(autoId)?.money === 1234, 'o antigo automático é o "continuar"');

console.log('# nova fazenda não sobrescreve');
const a = S.loadFarm(autoId);
a.money = 5000; S.saveFarm(a);
const b = newGame(3);
S.createFarm(b, 'Sítio Novo');
b.money = 10; S.saveFarm(b);
check(S.lastId() === b.farmId, 'a nova vira a última jogada');
check(S.loadFarm(autoId).money === 5000, 'fazenda anterior intacta depois de criar outra');
check(S.listFarms().length === 3, 'três fazendas na lista');
check(S.listFarms().find(f => f.id === b.farmId).name === 'Sítio Novo', 'nome guardado');

console.log('# copiar, renomear, exportar, importar, apagar');
const cid = S.duplicateFarm(b.farmId);
check(cid && S.loadFarm(cid).money === 10, 'cópia tem o mesmo estado');
advance(b, 1440); b.money = 99; S.saveFarm(b);
check(S.loadFarm(cid).money === 10, 'cópia não muda quando a original avança (ponto de volta)');
S.renameFarm(cid, 'Antes da geada');
check(S.listFarms().find(f => f.id === cid).name === 'Antes da geada', 'renomeou');
const ex = S.exportFarm(b.farmId);
check(ex && ex.filename.endsWith('.json') && ex.text.length > 1000, 'exportou arquivo ' + ex.filename);
const im = S.importFarm(ex.text);
check(im.ok && S.loadFarm(im.id).money === 99, 'importou de volta como fazenda nova');
check(!S.importFarm('{"x":1}').ok && !S.importFarm('lixo').ok, 'recusa arquivo que não é save');
S.deleteFarm(cid);
check(!S.listFarms().some(f => f.id === cid), 'apagou só a cópia');
console.log(`  ${S.listFarms().length} fazendas, ${S.storageKB()} KB usados`);

console.log(fails ? `\n${fails} FALHA(S)` : '\nTudo certo.');
process.exit(fails ? 1 : 0);
