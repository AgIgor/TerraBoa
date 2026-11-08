// Interface em HTML: topo, inventário, barra de ferramentas, dica e janelas.
import { TOOLS, PLANT_LIST, BUILD_LIST, ITEMS, CROPS, CROP_LIST, ANIMALS, G, O, REGADOR_MAX, YEAR_DAYS, SEASONS, TROUGH_MAX, FEEDER_MAX, WAGE, MAX_WORKERS, WORK_TASKS, DIESEL_PER_TILE, MAX_LED } from './config.js';
import { COMMODITIES, SELLABLE, INPUTS, price, inputPrice, sell, trend } from './market.js';
import { dateText, clockText, hourOf, dayOf } from './game.js';
import { tempAt, weatherLabel, weatherIcon, ENSO, seasonParams, EVENT_TEXT, windLabel } from './climate.js';
import { animalLabel, animalValue, animalMarketQty, isAdult, makeAnimal, breedText } from './animals.js';
import { fTemp, cropStage, storageCap, grainStock } from './sim.js';
import { hireWorker, fireWorker } from './workers.js';
import * as Saves from './saves.js';
import { generateWorld } from './world.js';

const $ = id => document.getElementById(id);
const fmt = v => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt0 = v => 'R$ ' + Math.round(v).toLocaleString('pt-BR');
const pct = v => Math.round(v * 100) + '%';
const TOOL_ICON = { mao: '✋', enxada: '⛏️', machado: '🪓', regador: '🚿', plantar: '🌱', construir: '🔨', laco: '➰', adubo: '🧪' };
const PLANT_ICON = { milho: '🌽', soja: '🫘', cana: '🎋', cafe: '☕', pimenta: '🌶️', capim: '🌾' };
const GROUND_NAME = { [G.GRASS]: 'Campo nativo', [G.WATER]: 'Água', [G.SAND]: 'Areia', [G.DIRT]: 'Terra nua', [G.TILLED]: 'Terra arada', [G.PASTURE]: 'Pasto formado', [G.PATH]: 'Estrada', [G.YARD]: 'Terreiro' };
const OBJ_NAME = { [O.TREE]: 'Árvore', [O.BUSH]: 'Arbusto', [O.ROCK]: 'Pedra', [O.FENCE]: 'Cerca', [O.GATE]: 'Porteira', [O.TROUGH]: 'Bebedouro', [O.FEEDER]: 'Cocho', [O.SPRINKLER]: 'Aspersor', [O.HOUSE]: 'Casa', [O.COOP]: 'Cooperativa', [O.BRIDGE]: 'Ponte', [O.LAMP]: 'Lampião', [O.WELL]: 'Poço', [O.PAIOL]: 'Paiol (+80 sacas)', [O.SILO]: 'Silo (+400 sacas)' };

export class UI {
  constructor(game) {
    this.g = game;
    this.panel = null;
    this.tab = null;
    this.atCoop = false;
    this.buildHotbar();
    $('mClose').onclick = () => this.close();
    const body = $('mBody');
    body.addEventListener('click', e => {
      const b = e.target.closest('[data-act]');
      if (b && !b.disabled) this.act(b.dataset.act, b.dataset, b);
    });
    $('modal').addEventListener('pointerdown', () => { this.pressing = true; });
    addEventListener('pointerup', () => { this.pressing = false; });
    addEventListener('pointercancel', () => { this.pressing = false; });
    $('modal').addEventListener('pointerdown', e => { if (e.target.id === 'modal') this.close(); });
    $('speeds').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      this.setSpeed(+b.dataset.speed);
    });
    $('wxBtn').onclick = () => this.open('tempo');
    $('mktBtn').onclick = () => this.open('mercado');
    $('farmBtn').onclick = () => this.open('fazenda');
    $('helpBtn').onclick = () => this.open('menu');
    this.lastInv = '';
  }
  setGame(g) { this.g = g; this.refreshTools(); }

  setSpeed(s) {
    const g = this.g;
    if (s === 0) g.paused = !g.paused;
    else { g.speed = s; g.paused = false; }
    for (const b of $('speeds').children) b.classList.toggle('on', g.paused ? b.dataset.speed === '0' : +b.dataset.speed === g.speed);
  }

  buildHotbar() {
    const hb = $('hotbar');
    hb.innerHTML = '';
    TOOLS.forEach((t, i) => {
      const b = document.createElement('button');
      b.title = `${t.name} (${t.key}) — ${t.hint}`;
      b.innerHTML = `<kbd>${t.key}</kbd><span>${TOOL_ICON[t.id]}</span><em>${t.name}</em>`;
      b.onclick = () => this.selectTool(i);
      hb.appendChild(b);
    });
  }
  selectTool(i) {
    const p = this.g.player;
    if (p.tool === i && (TOOLS[i].id === 'plantar' || TOOLS[i].id === 'construir')) this.cycle(1);
    p.tool = i;
    this.refreshTools();
  }
  cycle(d) {
    const p = this.g.player, id = TOOLS[p.tool].id;
    if (id === 'plantar') p.plant = (p.plant + d + PLANT_LIST.length) % PLANT_LIST.length;
    if (id === 'construir') p.build = (p.build + d + BUILD_LIST.length) % BUILD_LIST.length;
    this.refreshTools();
  }
  refreshTools() {
    const g = this.g, p = g.player;
    [...$('hotbar').children].forEach((b, i) => b.classList.toggle('on', i === p.tool));
    const id = TOOLS[p.tool].id, sb = $('subbar');
    let html = '';
    if (id === 'plantar') {
      html = PLANT_LIST.map((s, i) => {
        const n = g.inv[s.item] || 0;
        const name = s.id === 'capim' ? 'Capim' : CROPS[s.id].name;
        return `<button data-i="${i}" class="${i === p.plant ? 'on' : ''} ${n ? '' : 'none'}">${PLANT_ICON[s.id]} ${name}<small>${n}</small></button>`;
      }).join('') + '<span class="hintk">Q / E troca</span>';
    } else if (id === 'construir') {
      html = BUILD_LIST.map((b, i) => {
        const cost = Object.entries(b.cost).map(([k, v]) => `${v} ${k === 'madeira' ? 'mad.' : ''}`).join(' ');
        const have = Object.entries(b.cost).every(([k, v]) => (g.inv[k] || 0) >= v);
        return `<button data-i="${i}" class="${i === p.build ? 'on' : ''} ${have ? '' : 'none'}">${b.name}<small>${b.cost.madeira ? cost : (g.inv[Object.keys(b.cost)[0]] || 0) + ' un'}</small></button>`;
      }).join('') + '<span class="hintk">Q / E troca</span>';
    }
    if (sb.dataset.html !== html) {
      sb.innerHTML = html; sb.dataset.html = html;
      sb.querySelectorAll('button').forEach(b => b.onclick = () => {
        if (id === 'plantar') p.plant = +b.dataset.i; else p.build = +b.dataset.i;
        this.refreshTools();
      });
    }
    $('water').classList.toggle('show', id === 'regador');
    $('water').firstElementChild.style.width = pct(p.water / REGADOR_MAX);
  }

  toast(text, kind = 'info') {
    if (!text) return;
    const box = $('toasts');
    const last = box.lastElementChild;
    if (last && last.dataset.text === text) { last.dataset.n = (+last.dataset.n || 1) + 1; last.textContent = `${text} ×${last.dataset.n}`; clearTimeout(last._t); last._t = setTimeout(() => fade(last), 2600); return; }
    const d = document.createElement('div');
    d.className = 'toast ' + kind; d.textContent = text; d.dataset.text = text;
    box.appendChild(d);
    while (box.children.length > 5) box.firstElementChild.remove();
    d._t = setTimeout(() => fade(d), kind === 'bad' ? 4500 : 2800);
    function fade(el) { el.classList.add('out'); setTimeout(() => el.remove(), 500); }
  }

  // HUD (chamado algumas vezes por segundo)
  update() {
    const g = this.g, dt = dateText(g), today = g.climate.days[0], h = hourOf(g);
    $('money').textContent = fmt0(g.money);
    $('money').classList.toggle('neg', g.money < 0);
    $('season').textContent = `${dt.season} · Ano ${dt.year}`;
    $('date').textContent = `${dt.month} · dia ${dt.dayOfSeason}`;
    $('clock').textContent = clockText(g);
    $('wx').textContent = `${weatherIcon(today, h)} ${Math.round(tempAt(today, h))}°`;
    $('wxLabel').textContent = weatherLabel(today, h);
    // inventário
    const groups = [
      ['Colheita', ['milho', 'soja', 'cana', 'cafe', 'pimenta', 'leite', 'leite_cabra', 'leite_bufala', 'ovos', 'ovos_pato', 'la', 'fibra_lhama']],
      ['Sementes e mudas', ['sem_milho', 'sem_soja', 'muda_cana', 'muda_cafe', 'muda_pimenta', 'sem_capim']],
      ['Material', ['madeira', 'adubo', 'racao', 'bebedouro', 'aspersor', 'poco', 'silo']],
    ];
    let html = '';
    for (const [title, ids] of groups) {
      const rows = ids.filter(id => g.inv[id] > 0).map(id => `<div><span>${ITEMS[id].name}</span><b>${g.inv[id]} ${ITEMS[id].unit}</b></div>`);
      html += `<h4>${title}</h4>` + (rows.length ? rows.join('') : '<div class="empty">nada</div>');
    }
    const cap = storageCap(g.world), st = grainStock(g);
    html += `<h4>Armazém de grãos</h4><div><span>Sacas</span><b class="${st > cap ? 'down' : ''}">${st} / ${cap}</b></div>`;
    if (g.workers.length) html += '<h4>Peões</h4>' + g.workers.map(k => `<div><span>${k.name}</span><b>${k.status || ''}</b></div>`).join('');
    const own = g.animals.filter(a => a.owned);
    if (own.length) {
      html += '<h4>Rebanho</h4>' + Object.keys(ANIMALS).map(sp => {
        const n = own.filter(a => a.sp === sp).length;
        return n ? `<div><span>${ANIMALS[sp].name}</span><b>${n}</b></div>` : '';
      }).join('');
    }
    if (html !== this.lastInv) { $('inv').innerHTML = html; this.lastInv = html; }
    this.refreshTools();
    // atualização ao vivo: só o corpo, e nunca com o mouse apertado (senão o clique se perde)
    if (this.panel && this.live && !this.pressing) this.renderBody();
  }

  // ---------- dica sob o cursor ----------
  // informações do tile clicado: painel fixo no topo, abaixo da barra
  tip(info) {
    const el = $('tip');
    if (!info) { el.style.display = 'none'; this.lastTip = null; return; }
    if (info !== this.lastTip) { el.innerHTML = info; this.lastTip = info; }
    el.style.display = 'block';
    const hud = $('hud').getBoundingClientRect();
    el.style.top = (hud.bottom + 6) + 'px';
  }
  tileInfo(x, y, animal) {
    const g = this.g, w = g.world;
    if (animal) return animalInfo(g, animal);
    if (!w.inside(x, y)) return null;
    const i = w.idx(x, y), gr = w.ground[i], o = w.obj[i];
    const lines = [];
    if (o && OBJ_NAME[o]) {
      let t = `<b>${OBJ_NAME[o]}</b>`;
      if (o === O.TROUGH) t += ` · água ${pct(w.troughs.get(i).water / TROUGH_MAX)}`;
      if (o === O.FEEDER) t += ` · ração ${pct(w.feeders.get(i).food / FEEDER_MAX)}`;
      if (o === O.SPRINKLER) t += w.nearWater(x, y, 12) ? ' · molha 7×7 às 6h, 12h e 17h' : ' · <span class="down">sem água a até 12 tiles (faça um poço)</span>';
      if (o === O.WELL) t += ' · abastece aspersores a até 12 tiles e enche o regador';
      if (o === O.HOUSE) t += '<br><span class="muted">Mão: dormir (após 19h)</span>';
      if (o === O.COOP) t += '<br><span class="muted">Mão: vender e comprar</span>';
      lines.push(t);
    }
    if (w.fires.has(i)) lines.push('<b class="down">🔥 Pegando fogo!</b> <span class="muted">Regador apaga</span>');
    else if (w.ash.has(i)) lines.push('<span class="muted">Queimado (cinza aduba a terra)</span>');
    const c = w.crops.get(i);
    if (c) {
      const d = CROPS[c.type];
      if (c.dead) lines.push(`<b>${d.name}</b> · <span class="down">morta</span>`);
      else {
        lines.push(`<b>${d.name}</b> · ${c.ripe ? '<span class="up">pronta para colher</span>' : pct(c.prog) + ' crescida'}${c.harvests ? ` · ${c.harvests}ª colheita feita` : ''}`);
        lines.push(`Saúde ${bar(c.health)}`);
        if (w.moist[i] < d.wilt) lines.push('<span class="down">Murchando de sede</span>');
        else if (w.moist[i] < d.water) lines.push('<span class="muted">Pouca água: cresce devagar</span>');
      }
    }
    if (gr !== G.WATER) {
      lines.push(`<span class="muted">${GROUND_NAME[gr]}</span>`);
      lines.push(`Umidade ${bar(w.moist[i], '#4a92cf')}`);
      if (gr === G.TILLED || c || gr === G.PASTURE || gr === G.DIRT) lines.push(`Fertilidade ${bar(w.fert[i], '#9a7a3a')}`);
      if (gr === G.GRASS || gr === G.PASTURE) lines.push(`Capim ${bar(w.grass[i] / (gr === G.PASTURE ? 1 : 0.55), '#6cb848')}`);
    } else lines.push('<b>Água</b><span class="muted"> · enche o regador</span>');
    return lines.join('<br>');
  }

  // ---------- janelas ----------
  open(name, opts = {}) {
    if (this.panel === name && !opts.force) { this.close(); return; }
    this.panel = name;
    this.tab = opts.tab || ({ mercado: 'vender', fazenda: 'animais', tempo: 'previsao', menu: 'jogo' })[name];
    this.atCoop = !!opts.atCoop;
    $('modal').classList.remove('hidden');
    this.render();
  }
  close() { this.panel = null; $('modal').classList.add('hidden'); }
  isOpen() { return !!this.panel || !!this.titleOpen; }

  // ---------- tela inicial e fazendas ----------
  showTitle(view = 'main') {
    this.close();
    this.titleOpen = true;
    $('title').classList.remove('hidden');
    this.renderTitle(view);
    if (this.titleHooked) return;
    this.titleHooked = true;
    const body = $('tBody');
    body.addEventListener('click', e => {
      const b = e.target.closest('[data-tact]');
      if (!b || b.disabled) return;
      const d = b.dataset;
      switch (d.tact) {
        case 'view': return this.renderTitle(d.view);
        case 'continue': this.hideTitle(); return this.onTitle('continue');
        case 'reroll': this.newSeed = (Math.random() * 1e9) | 0; $('tSeed').value = this.newSeed; return this.drawPreview();
        case 'start': {
          const seedTxt = $('tSeed').value.trim();
          const seed = /^\d+$/.test(seedTxt) ? +seedTxt : this.newSeed;
          this.hideTitle();
          return this.onTitle('new', { name: $('tName').value, seed });
        }
        case 'play': if (this.onTitle('load', d.id)) this.hideTitle(); return;
        case 'dup': if (Saves.duplicateFarm(d.id)) this.renderTitle('farms'); else this.toast('Sem espaço para a cópia.', 'bad'); return;
        case 'export': return this.download(d.id);
        case 'import': return $('tFile').click();
        case 'rename': {
          const row = b.closest('.slot-row'), inp = row.querySelector('input');
          if (inp) { Saves.renameFarm(d.id, inp.value); if (this.g.farmId === d.id) this.g.farmName = inp.value.trim() || this.g.farmName; return this.renderTitle('farms'); }
          const nm = row.querySelector('.info b');
          nm.innerHTML = `<input value="${(nm.textContent || '').replace(/"/g, '&quot;')}" maxlength="40">`;
          nm.querySelector('input').focus();
          b.textContent = 'OK';
          return;
        }
        case 'del':
          if (d.confirm !== '1') { d.confirm = '1'; b.textContent = 'Confirmar'; return; }
          Saves.deleteFarm(d.id);
          if (this.g.farmId === d.id) this.onTitle('deleted');
          return this.renderTitle('farms');
      }
    });
    body.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.target.closest('.slot-row')?.querySelector('[data-tact=rename]')?.click(); });
    body.addEventListener('input', e => { if (e.target.id === 'tSeed') this.drawPreview(); });
    body.addEventListener('change', e => {
      if (e.target.id !== 'tFile' || !e.target.files[0]) return;
      e.target.files[0].text().then(txt => {
        const r = Saves.importFarm(txt);
        if (r.ok) { this.toast('Fazenda importada.', 'good'); this.renderTitle('farms'); }
        else this.toast(r.reason, 'bad');
      });
    });
  }
  hideTitle() { this.titleOpen = false; $('title').classList.add('hidden'); }
  download(id) {
    const f = Saves.exportFarm(id);
    if (!f) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([f.text], { type: 'application/json' }));
    a.download = f.filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  renderTitle(view) {
    const body = $('tBody');
    const farms = Saves.listFarms();
    const last = farms.find(f => f.id === Saves.lastId());
    if (view === 'main') {
      body.innerHTML = `
        ${last ? `<button class="tbtn primary" data-tact="continue"><span class="tline">${last.thumb ? `<img src="${last.thumb}" alt="">` : ''}<span>Continuar: ${esc(last.name)}<small>${Saves.describe(last)}</small></span></span></button>` : ''}
        <button class="tbtn ${last ? '' : 'primary'}" data-tact="view" data-view="new">Nova fazenda<small>Escolha o mapa e dê um nome; as outras fazendas continuam guardadas</small></button>
        <button class="tbtn" data-tact="view" data-view="farms">Minhas fazendas<small>${farms.length ? `${farms.length} salva${farms.length > 1 ? 's' : ''} · carregar, renomear, copiar, exportar` : 'Nenhuma ainda · importar arquivo'}</small></button>
        <button class="tbtn" data-tact="view" data-view="help">Como jogar<small>Controles e dicas</small></button>`;
    } else if (view === 'new') {
      this.newSeed = (Math.random() * 1e9) | 0;
      body.innerHTML = `
        <label class="tfield">Nome da fazenda<input id="tName" maxlength="40" value="${esc(Saves.suggestName())}"></label>
        <div class="tmap"><canvas id="tPrev" width="192" height="192"></canvas>
          <div class="tmapside"><label class="tfield">Semente do mapa<input id="tSeed" inputmode="numeric" value="${this.newSeed}"></label>
          <button class="tbtn" data-tact="reroll">Sortear outro mapa<small>Mesma semente = mesmo mapa</small></button>
          <p class="note">Casa no centro; azul é água, verde-escuro é mata.</p></div></div>
        <button class="tbtn primary" data-tact="start">Começar<small>R$ 600, sementes de milho, capim e madeira</small></button>
        <button class="tbtn" data-tact="view" data-view="main">Voltar</button>`;
      this.drawPreview();
    } else if (view === 'farms') {
      body.innerHTML = `<div class="slots">${farms.map(f => `<div class="slot-row">${f.thumb ? `<img class="thumb" src="${f.thumb}" alt="">` : '<span class="thumb"></span>'}
          <div class="info"><b>${esc(f.name)}${f.id === this.g.farmId && this.started ? ' <em>(aberta)</em>' : ''}</b><span>${Saves.describe(f)}</span></div>
          <div class="btns wrap"><button data-tact="play" data-id="${f.id}">Jogar</button><button data-tact="rename" data-id="${f.id}">Renomear</button>
          <button data-tact="dup" data-id="${f.id}" title="Cria uma cópia (ponto de volta)">Copiar</button><button data-tact="export" data-id="${f.id}" title="Baixa um arquivo .json">Exportar</button>
          <button data-tact="del" data-id="${f.id}">Apagar</button></div></div>`).join('') || '<p class="note">Nenhuma fazenda salva ainda.</p>'}</div>
        <input type="file" id="tFile" accept=".json,application/json" hidden>
        <p class="note">Saves ficam neste navegador (${Saves.storageKB()} KB usados). Exporte para guardar fora ou levar para outro aparelho.</p>
        <button class="tbtn" data-tact="import">Importar fazenda de um arquivo<small>.json exportado pelo Terra Boa</small></button>
        <button class="tbtn" data-tact="view" data-view="main">Voltar</button>`;
    } else if (view === 'help') {
      body.innerHTML = `<div class="thelp">${this.tab_menu_ajuda()}</div><button class="tbtn" data-tact="view" data-view="main">Voltar</button>`;
    }
  }
  drawPreview() {
    const cv = $('tPrev');
    if (!cv) return;
    const v = $('tSeed').value.trim();
    const seed = /^\d+$/.test(v) ? +v : this.newSeed;
    clearTimeout(this.prevT);
    this.prevT = setTimeout(() => drawMap(cv, generateWorld(seed)), 60);
  }
  // miniatura do mapa atual para a lista de fazendas
  thumb(g) {
    const c = document.createElement('canvas'); c.width = c.height = 72;
    drawMap(c, g.world);
    try { return c.toDataURL('image/png'); } catch { return null; }
  }

  render() {
    const g = this.g;
    this.lastBody = null;
    const tabs = {
      mercado: [['vender', 'Vender'], ['insumos', 'Comprar insumos'], ['animais', 'Animais'], ['noticias', 'Notícias']],
      fazenda: [['animais', 'Rebanho'], ['lavouras', 'Lavouras'], ['peoes', 'Peões'], ['diario', 'Diário']],
      tempo: [['previsao', 'Previsão'], ['calendario', 'Calendário de plantio']],
      menu: [['jogo', 'Fazenda e saves'], ['ajuda', 'Como jogar']],
    }[this.panel];
    const titles = { mercado: this.atCoop ? 'Cooperativa' : 'Mercado <small>(só consulta — vá até a cooperativa para negociar)</small>', fazenda: 'Fazenda', tempo: 'Tempo e clima', menu: 'Terra Boa' };
    $('mTitle').innerHTML = titles[this.panel];
    $('mTabs').innerHTML = tabs.map(([id, n]) => `<button data-t="${id}" class="${id === this.tab ? 'on' : ''}">${n}</button>`).join('');
    $('mTabs').querySelectorAll('button').forEach(b => b.onclick = () => { this.tab = b.dataset.t; this.render(); });
    this.lastBody = null;
    this.renderBody();
  }
  renderBody() {
    const body = $('mBody');
    this.live = false;
    const fn = this['tab_' + this.panel + '_' + this.tab];
    const html = fn ? fn.call(this, this.g) : '';
    if (html === this.lastBody) return; // nada mudou: não recria os botões
    this.lastBody = html;
    const scroll = body.scrollTop;
    body.innerHTML = html;
    body.scrollTop = scroll;
  }

  act(act, ds, el) {
    const g = this.g, m = g.market;
    if (act === 'sell') {
      const id = ds.id, have = g.inv[id] || 0;
      const n = ds.n === 'all' ? have : Math.min(have, +ds.n);
      if (n <= 0) return;
      const v = sell(m, id, n);
      g.inv[id] -= n; g.money += v; g.stats.earned += v;
      this.toast(`Vendeu ${n} ${ITEMS[id].unit} de ${ITEMS[id].name.toLowerCase()} por ${fmt(v)}`, 'good');
    } else if (act === 'buyi') {
      const inp = INPUTS.find(x => x.id === ds.id), n = +ds.n;
      const v = inputPrice(m, inp) * n;
      if (g.money < v) return this.toast('Dinheiro insuficiente.', 'bad');
      g.money -= v; g.stats.spent += v; g.inv[inp.id] = (g.inv[inp.id] || 0) + n;
      this.toast(`Comprou ${n} × ${inp.name.toLowerCase()} por ${fmt(v)}`, 'good');
    } else if (act === 'sella') {
      const a = g.animals.find(x => x.id === +ds.id);
      if (!a) return;
      const v = animalValue(g, a);
      if (a.ridden) return this.toast('Desça do cavalo antes de vender.', 'bad');
      sell(m, ANIMALS[a.sp].market, animalMarketQty(a));
      g.animals = g.animals.filter(x => x !== a);
      g.money += v; g.stats.earned += v;
      this.toast(`Vendeu ${animalLabel(a).toLowerCase()} por ${fmt(v)}`, 'good');
    } else if (act === 'buya') {
      const o = ANIMAL_OFFERS[+ds.i];
      const v = offerPrice(g, o);
      if (g.money < v) return this.toast('Dinheiro insuficiente.', 'bad');
      if (g.animals.filter(x => x.led).length >= MAX_LED) return this.toast(`Já está levando ${MAX_LED} animais. Solte algum antes.`, 'bad');
      const p = g.player;
      const a = makeAnimal(g, o.sp, Math.floor(p.x), Math.floor(p.y), { owned: false, sex: o.sex, weight: o.w });
      a.x = p.x; a.y = p.y + 0.6; a.led = true; a.ledSeq = g.nextId++; a.owned = false; a.bought = true;
      g.money -= v; g.stats.spent += v;
      this.toast(`Comprou ${o.name.toLowerCase()}. Leve até o pasto e clique nele com o Laço para soltar.`, 'good');
      this.close(); return;
    } else if (act === 'buyt') {
      const v = tractorPrice(g);
      if (g.money < v) return this.toast('Dinheiro insuficiente.', 'bad');
      const p = g.player;
      g.vehicles.push({ id: g.nextId++, kind: 'trator', x: p.x + 1.2, y: p.y + 0.3, fx: 1 });
      g.money -= v; g.stats.spent += v;
      this.toast('Trator entregue ao seu lado. Chegue perto e aperte X (ou mão) para subir.', 'good');
      this.close(); return;
    } else if (act === 'hire') {
      const k = hireWorker(g, ds.task || 'colher');
      if (k) this.toast(`${k.name} foi contratado (R$ ${WAGE}/dia).`, 'good');
    } else if (act === 'task') {
      const k = g.workers.find(k => k.id === +ds.id);
      if (k) { k.task = ds.task; k.path = []; k.job = null; k.timer = 0; }
    } else if (act === 'fire') {
      const k = g.workers.find(k => k.id === +ds.id);
      fireWorker(g, +ds.id);
      if (k) this.toast(`${k.name} foi dispensado.`);
    } else if (act === 'savenow') {
      const r = this.onSave ? this.onSave(true) : null;
      if (r && !r.ok) return this.toast(r.reason, 'bad');
      this.toast('Fazenda salva.', 'good');
    } else if (act === 'dupnow') {
      this.onSave && this.onSave(true);
      if (Saves.duplicateFarm(g.farmId)) this.toast('Cópia criada em Minhas fazendas (ponto de volta).', 'good');
      else this.toast('Sem espaço para a cópia.', 'bad');
    } else if (act === 'exportnow') {
      this.onSave && this.onSave(true);
      this.download(g.farmId); return;
    } else if (act === 'renamenow') {
      const v = document.getElementById('farmName').value.trim();
      if (v) { g.farmName = v; Saves.renameFarm(g.farmId, v); this.toast('Nome salvo.', 'good'); }
    } else if (act === 'title') {
      this.onSave && this.onSave(true);
      this.showTitle(); return;
    }
    this.render();
  }

  // ---------- mercado ----------
  tab_mercado_vender(g) {
    const m = g.market, dis = this.atCoop ? '' : 'disabled';
    const rows = SELLABLE.map(id => {
      const c = COMMODITIES[id], p = price(m, id), tr = trend(m, id, 7), have = g.inv[id] || 0;
      const avg = c.base;
      const rel = p / avg - 1;
      return `<tr><td><b>${c.name}</b> <span class="unit">/${c.unit}</span></td>
        <td class="num">${fmt(p)}</td>
        <td class="num ${tr >= 0 ? 'up' : 'down'}">${tr >= 0 ? '▲' : '▼'} ${Math.abs(tr * 100).toFixed(1)}%</td>
        <td class="num hide-sm ${rel >= 0 ? 'up' : 'down'}" title="Comparado à média histórica">${rel >= 0 ? '+' : ''}${(rel * 100).toFixed(0)}%</td>
        <td class="hide-sm">${spark(m.c[id].hist)}</td>
        <td class="num">${have}</td>
        <td><div class="btns">
          <button data-act="sell" data-id="${id}" data-n="1" ${dis || (have ? '' : 'disabled')}>1</button>
          <button data-act="sell" data-id="${id}" data-n="10" ${dis || (have >= 10 ? '' : 'disabled')}>10</button>
          <button data-act="sell" data-id="${id}" data-n="all" ${dis || (have ? '' : 'disabled')}>Tudo${have ? ' · ' + fmt0(have * p * (1 - 0.05 * have / c.depth)) : ''}</button>
        </div></td></tr>`;
    }).join('');
    return `<p class="note">Preços mudam todo dia: safra derruba, entressafra sobe; geada, seca, dólar e notícias mexem no mercado. Vender muito de uma vez também baixa o preço. Leite azeda em um dia; ovos estragam aos poucos.</p>
      <table class="mk"><tr><th>Produto</th><th class="num">Preço</th><th class="num">7 dias</th><th class="num hide-sm">vs média</th><th class="hide-sm">Últimos meses</th><th class="num">Estoque</th><th></th></tr>${rows}</table>`;
  }
  tab_mercado_insumos(g) {
    const m = g.market, dis = this.atCoop ? '' : 'disabled';
    const rows = INPUTS.map(inp => {
      const p = inputPrice(m, inp);
      return `<tr><td><b>${inp.name}</b></td><td class="num">${fmt(p)}</td><td class="num">${g.inv[inp.id] || 0}</td>
        <td><div class="btns">
          <button data-act="buyi" data-id="${inp.id}" data-n="1" ${dis || (g.money >= p ? '' : 'disabled')}>+1</button>
          ${inp.pack > 1 ? `<button data-act="buyi" data-id="${inp.id}" data-n="${inp.pack}" ${dis || (g.money >= p * inp.pack ? '' : 'disabled')}>+${inp.pack} · ${fmt0(p * inp.pack)}</button>` : ''}
        </div></td></tr>`;
    }).join('');
    return `<p class="note">Semente acompanha o preço do grão; adubo e aspersor seguem o dólar. Ração vai no cocho (mão) e alimenta qualquer bicho.</p>
      <table class="mk"><tr><th>Insumo</th><th class="num">Preço</th><th class="num">Você tem</th><th></th></tr>${rows}</table>`;
  }
  tab_mercado_animais(g) {
    const m = g.market, dis = this.atCoop ? '' : 'disabled';
    const own = g.animals.filter(a => a.owned).sort((a, b) => a.sp.localeCompare(b.sp) || b.weight - a.weight);
    const rows = own.map(a => `<tr><td>${animalLabel(a)} <span class="unit">#${a.id}</span></td><td class="num">${weightText(a)}</td>
      <td class="num">${pct(a.health)}</td><td class="num">${fmt(animalValue(g, a))}</td>
      <td><div class="btns"><button data-act="sella" data-id="${a.id}" ${dis}>Vender</button></div></td></tr>`).join('');
    const offers = ANIMAL_OFFERS.map((o, i) => `<tr><td>${o.name}</td><td class="num">${o.sp === 'galinha' ? '' : o.w + ' kg'}</td><td class="num">${fmt(offerPrice(g, o))}</td>
      <td><div class="btns"><button data-act="buya" data-i="${i}" ${dis || (g.money >= offerPrice(g, o) ? '' : 'disabled')}>Comprar</button></div></td></tr>`).join('');
    const quotes = [...new Set(Object.values(ANIMALS).map(d => d.market))].map(id => `${COMMODITIES[id].name}: <b>${fmt(price(m, id))}</b>/${COMMODITIES[id].unit} <span class="${trend(m, id) >= 0 ? 'up' : 'down'}">${trend(m, id) >= 0 ? '▲' : '▼'}${Math.abs(trend(m, id) * 100).toFixed(1)}%</span>`).join(' · ');
    return `<p class="note">${quotes}</p>
      <div class="grid2"><div><h3>Seu rebanho</h3>${own.length ? `<table class="mk"><tr><th>Animal</th><th class="num">Peso</th><th class="num">Saúde</th><th class="num">Vale</th><th></th></tr>${rows}</table>` : '<p class="note">Nenhum animal ainda. Laçe os soltos no campo ou compre aqui.</p>'}</div>
      <div><h3>Comprar</h3><table class="mk"><tr><th>Animal</th><th class="num">Peso</th><th class="num">Preço</th><th></th></tr>${offers}</table>
      <p class="note">O animal comprado sai daqui no laço com você.</p>
      <h3 style="margin-top:14px">Máquinas</h3><table class="mk"><tr><td>🚜 Trator <span class="unit">ara, planta e aduba 3×3 · diesel ~R$ ${(DIESEL_PER_TILE * Math.exp(g.market.dollar || 0)).toFixed(2)}/tile</span></td><td class="num">${fmt(tractorPrice(g))}</td>
      <td><div class="btns"><button data-act="buyt" ${dis || (g.money >= tractorPrice(g) ? '' : 'disabled')}>Comprar</button></div></td></tr></table></div></div>`;
  }
  tab_mercado_noticias(g) {
    const items = g.market.news.map(n => {
      const dt = dateText({ time: n.day * 1440 });
      const fx = Object.entries(n.fx).filter(([k]) => k !== 'dollar' && COMMODITIES[k]).map(([k, v]) => `${COMMODITIES[k].name} ${v > 0 ? '+' : ''}${Math.round(v * 100)}%`).join(', ');
      return `<li><span class="d">${dt.month} · ano ${dt.year}</span><div>${n.text}<div class="fx">${fx}</div></div></li>`;
    }).join('');
    return items ? `<ul class="news">${items}</ul>` : '<p class="note">Nenhuma notícia ainda.</p>';
  }

  // ---------- tempo ----------
  tab_tempo_previsao(g) {
    const h = hourOf(g), en = ENSO[g.climate.enso];
    const cards = g.climate.days.map((d, k) => {
      const dt = dateText({ time: d.day * 1440 });
      // previsão fica menos certa quanto mais longe
      const chance = d.rain > 0 ? Math.min(95, 60 + d.rain * 1.5 - k * 6) : Math.max(5, 8 + k * 7 + (d.cloud > 0.4 ? 15 : 0));
      return `<div class="${k === 0 ? 'today' : ''}"><small>${k === 0 ? 'Hoje' : k === 1 ? 'Amanhã' : dt.month + ' · ' + dt.dayOfSeason}</small>
        <div class="ic">${weatherIcon(d, k === 0 ? h : 12)}</div>
        <div class="t">${Math.round(d.tMax)}° <span>${Math.round(d.tMin)}°</span></div>
        <small>chuva ${Math.round(chance)}%${d.rain && k < 3 ? ' · ' + Math.round(d.rain) + ' mm' : ''}</small>
        <div class="lab">${d.frost ? '❄️ risco de geada' : d.event ? EVENT_TEXT[d.event].split(':')[0] : weatherLabel(d, 12)}</div></div>`;
    }).join('');
    const dt = dateText(g);
    return `<div class="fc">${cards}</div>
      <div class="grid2"><div class="card"><h3>${dt.season}, ano ${dt.year}</h3>
        <div class="kv"><span>Fenômeno do ano</span><b>${en.name}</b></div><p class="note">${en.text}</p>
        <div class="kv"><span>Dias sem chuva</span><b>${g.climate.dryStreak}</b></div>
        <div class="kv"><span>Vento hoje</span><b>${windLabel(g.climate.days[0].wind)}</b></div>
        <div class="kv"><span>Temperatura agora</span><b>${tempAt(g.climate.days[0], h).toFixed(1)} °C</b></div></div>
        <div class="card"><h3>Como o clima pega na fazenda</h3><p class="note">Chuva molha a terra e enche bebedouros. Calor seca o solo mais rápido e estressa os animais (sombra de árvore ajuda). Geada queima lavoura e pasto, principalmente café, soja e pimenta em baixadas perto da água. Veranico na época de plantio sobe o preço de soja e milho.</p></div></div>`;
  }
  tab_tempo_calendario(g) {
    const day = dayOf(g);
    const rows = CROP_LIST.map(id => {
      const d = CROPS[id];
      const e = estimateCrop(d, day % YEAR_DAYS);
      const cls = e.score > 0.7 && !e.frost ? 'ok' : e.score > 0.45 ? 'mid' : 'no';
      const verdict = cls === 'ok' ? 'Boa época' : cls === 'mid' ? 'Arriscado' : 'Fora de época';
      return `<tr><td><b>${PLANT_ICON[id]} ${d.name}</b></td><td class="${cls}">${verdict}</td><td class="num">${e.days ? '~' + e.days + ' dias' : '—'}</td>
        <td>${e.frost ? '❄️ pega o inverno' : ''} ${e.dry ? '☀️ pouca chuva' : ''}</td>
        <td class="num hide-sm">${d.tOpt[0]}–${d.tOpt[1]} °C</td><td class="hide-sm unit">${d.perennial ? 'perene' : d.regrow ? `rebrota ${d.maxHarvests - 1}×` : 'uma colheita'}</td></tr>`;
    }).join('');
    return `<p class="note">Estimativa para plantar hoje, considerando a temperatura e a chuva típicas dos próximos dias. Regar ou usar aspersor compensa a falta de chuva, mas não o frio.</p>
      <table class="mk cal"><tr><th>Cultura</th><th>Agora</th><th class="num">Colheita</th><th>Riscos</th><th class="num hide-sm">Ideal</th><th class="hide-sm">Ciclo</th></tr>${rows}</table>`;
  }

  // ---------- fazenda ----------
  tab_fazenda_animais(g) {
    this.live = true;
    const own = g.animals.filter(a => a.owned);
    if (!own.length) return '<p class="note">Nenhum animal ainda. Cerque um pasto (cerca + porteira), ponha água (bebedouro ou beira de rio) e laçe os bichos soltos (ferramenta 7). Ande devagar segurando Shift para chegar perto sem espantar.</p>';
    const rows = own.sort((a, b) => a.sp.localeCompare(b.sp)).map(a => `<tr><td>${animalLabel(a)} <span class="unit">#${a.id}</span></td><td class="num">${weightText(a)}</td>
      <td class="num">${bar(a.hunger)}</td><td class="num">${bar(a.thirst, '#4a92cf')}</td><td class="num">${bar(a.health, '#86d37a')}</td>
      <td class="unit">${[breedText(g, a), ANIMALS[a.sp].milk && a.sex === 'f' && a.milk >= 1 ? `${Math.floor(a.milk)} L p/ ordenhar` : '', (a.wool || 0) >= 1 ? `${Math.floor(a.wool)} kg de lã` : '', a.ridden ? 'montado' : '', a.comfort != null && a.comfort < 0.8 ? 'estresse térmico' : '', a.led ? 'no laço' : ''].filter(Boolean).join(' · ')}</td></tr>`).join('');
    return `<table class="mk"><tr><th>Animal</th><th class="num">Peso</th><th class="num">Comida</th><th class="num">Água</th><th class="num">Saúde</th><th></th></tr>${rows}</table>`;
  }
  tab_fazenda_lavouras(g) {
    this.live = true;
    const w = g.world, by = {};
    for (const c of w.crops.values()) {
      const s = by[c.type] || (by[c.type] = { n: 0, ripe: 0, dead: 0, prog: 0, health: 0 });
      s.n++; if (c.dead) s.dead++; else { if (c.ripe) s.ripe++; s.prog += c.prog; s.health += c.health; }
    }
    let pasture = 0, grassSum = 0;
    for (let i = 0; i < w.ground.length; i++) if (w.ground[i] === G.PASTURE) { pasture++; grassSum += w.grass[i]; }
    const rows = CROP_LIST.filter(id => by[id]).map(id => {
      const s = by[id], alive = s.n - s.dead;
      return `<tr><td><b>${PLANT_ICON[id]} ${CROPS[id].name}</b></td><td class="num">${s.n}</td><td class="num">${alive ? pct(s.prog / alive) : '—'}</td><td class="num">${s.ripe}</td><td class="num">${alive ? pct(s.health / alive) : '—'}</td><td class="num ${s.dead ? 'down' : ''}">${s.dead}</td></tr>`;
    }).join('');
    const st = g.stats;
    return `${rows ? `<table class="mk"><tr><th>Cultura</th><th class="num">Pés</th><th class="num">Crescimento</th><th class="num">Prontos</th><th class="num">Saúde</th><th class="num">Mortos</th></tr>${rows}</table>` : '<p class="note">Nenhuma lavoura. Are a terra (2), plante (5) e regue (4).</p>'}
      <div class="grid2" style="margin-top:12px"><div class="card"><h3>Pastagem</h3><div class="kv"><span>Área de pasto formado</span><b>${pasture} tiles</b></div>
      <div class="kv"><span>Capim médio</span><b>${pasture ? pct(grassSum / pasture) : '—'}</b></div><p class="note">Uma vaca come cerca de 1,2 tile de pasto cheio por dia. Pasto rapado por muitos dias degrada e vira terra nua.</p></div>
      <div class="card"><h3>Resultados</h3><div class="kv"><span>Receita total</span><b>${fmt0(st.earned)}</b></div><div class="kv"><span>Gastos</span><b>${fmt0(st.spent)}</b></div>
      <div class="kv"><span>Plantas perdidas</span><b>${st.lost}</b></div>${Object.entries(st.harvested).map(([k, v]) => `<div class="kv"><span>${ITEMS[k].name} colhido</span><b>${v} ${ITEMS[k].unit}</b></div>`).join('')}</div></div>`;
  }
  tab_fazenda_peoes(g) {
    this.live = true;
    const rows = g.workers.map(k => `<tr><td><b>${k.name}</b><br><span class="unit">${k.status || ''}</span></td>
      <td><div class="btns" style="justify-content:flex-start">${Object.entries(WORK_TASKS).map(([id, t]) => `<button data-act="task" data-id="${k.id}" data-task="${id}" title="${t.hint}" ${k.task === id ? 'style="background:rgba(226,184,74,.35);border-color:#e2b84a"' : ''}>${t.name}</button>`).join('')}</div></td>
      <td><div class="btns"><button data-act="fire" data-id="${k.id}">Dispensar</button></div></td></tr>`).join('');
    const can = g.workers.length < MAX_WORKERS;
    return `<p class="note">Cada peão ganha R$ ${WAGE} por dia, pago à meia-noite (sem dinheiro, ele vai embora). Trabalha das 6h às 17h. ${Object.values(WORK_TASKS).map(t => `<b>${t.name}:</b> ${t.hint}`).join(' ')}</p>
      ${rows ? `<table class="mk"><tr><th>Peão</th><th>Tarefa</th><th></th></tr>${rows}</table>` : ''}
      <p style="margin-top:12px;display:flex;gap:6px;flex-wrap:wrap">${Object.entries(WORK_TASKS).map(([id, t]) => `<button class="btn" data-act="hire" data-task="${id}" ${can ? '' : 'disabled'}>Contratar para ${t.name.toLowerCase()}</button>`).join('')}</p>
      ${can ? '' : `<p class="note">Máximo de ${MAX_WORKERS} peões.</p>`}`;
  }
  tab_fazenda_diario(g) {
    this.live = true;
    return `<div class="log">${g.log.map(l => `<div class="${l.kind}"><span class="unit">${clockText({ time: l.t })} · ${dateText({ time: l.t }).month}</span> ${l.text}</div>`).join('') || '<p class="note">Nada ainda.</p>'}</div>`;
  }

  // ---------- menu ----------
  tab_menu_ajuda() {
    return `<div class="help grid2"><div>
      <p><b>Mover:</b> <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> ou setas. <kbd>Shift</kbd> anda devagar (não espanta os bichos).</p>
      <p><b>Usar ferramenta:</b> clique no tile perto de você, ou <kbd>Espaço</kbd> no tile à frente. Arraste para arar, plantar ou cercar em fila.</p>
      <p><b>Mão rápida:</b> <kbd>E</kbd> colhe, ordenha, pega ovos, põe ração e fala com a cooperativa.</p>
      <p><b>Ferramentas:</b> <kbd>1</kbd>–<kbd>8</kbd>. <kbd>Q</kbd>/<kbd>R</kbd> trocam semente ou construção. Roda do mouse dá zoom.</p>
      <p><b>Montar/descer:</b> <kbd>X</kbd> (cavalo ou trator).</p>
      <p><b>Janelas:</b> <kbd>M</kbd> mercado, <kbd>T</kbd> tempo, <kbd>F</kbd> fazenda, <kbd>L</kbd> mapas do solo, <kbd>P</kbd> pausa.</p>
      </div><div>
      <ul>
        <li><b>Lavoura:</b> enxada → semente → regue. Cada cultura tem temperatura ideal; veja o calendário na janela do tempo.</li>
        <li><b>Pasto:</b> plante capim no campo. Pasto formado alimenta muito mais que o nativo.</li>
        <li><b>Animais:</b> feche um pasto com cerca e porteira, com água (bebedouro ou rio). Laçe até 4 bichos de uma vez; para soltar, clique no animal com o laço. Macho e fêmea juntos dão cria.</li>
        <li><b>Mercado:</b> só na cooperativa. Guarde grãos para vender na entressafra; leite precisa ir no mesmo dia.</li>
        <li><b>Clima:</b> chuva e calor mudam a umidade; geada no inverno pode matar café e pimenta.</li>
        <li><b>Cavalo:</b> laçe um (ou compre), solte no pasto e aperte <kbd>X</kbd> perto dele para montar. A cavalo você corre mais e laça melhor.</li>
        <li><b>Ovelha e cabra:</b> tosquie a lã e ordenhe a cabra com a mão.</li>
        <li><b>Pato, peru e coelho:</b> pata e perua botam ovos (os de pata valem mais) e chocam como a galinha. Coelho dá ninhadas grandes. O pato gosta da beira d'água.</li>
        <li><b>Lhama e búfalo:</b> tosquie a fibra da lhama (vale bem mais que lã) e ordenhe a búfala. A lhama aguenta frio; o búfalo, calor, e gosta de água.</li>
        <li><b>Armazém:</b> a casa guarda 40 sacas de grão. Paiol (+80) e silo (+400) evitam que a colheita estrague. Leite e cana estragam rápido.</li>
        <li><b>Trator e peões:</b> o trator (cooperativa) faz 3×3 de uma vez; peões (janela Fazenda) regam, colhem e tratam dos bichos.</li>
        <li><b>Rio:</b> construa ponte (6 madeiras) em cima da água. Animais também passam.</li>
        <li><b>Fogo:</b> na seca longa pode pegar fogo no campo; o vento leva para leste. Terra arada, estrada e água fazem aceiro; o regador apaga e a chuva também.</li>
        <li><b>Noite:</b> o lampião (3 madeiras) ilumina em volta.</li>
        <li><b>Cria:</b> fêmea adulta, bem tratada e no mesmo pasto que um macho emprenha. Cada espécie tem sua época (vaca e égua na primavera, ovelha e cabra no outono) e descansa depois do parto. O painel Fazenda → Animais mostra a situação de cada uma.</li>
        <li><b>Pintinhos:</b> com galo no cercado, ovos deixados no chão 3 dias podem chocar. Recolha os ovos se quiser vender.</li>
        <li><b>Bichos soltos:</b> andam em manadas e têm cria. Manadas novas chegam pelas bordas do mapa, mais na primavera. Laçou uma mãe? O filhote vem atrás e fica no seu pasto.</li>
        <li><b>Longe do rio?</b> Compre um poço na cooperativa e construa: aspersores a até 12 tiles dele funcionam, e o regador enche nele.</li>
        <li><b>Arou no lugar errado?</b> Clique com a enxada na terra arada para desfazer.</li>
        <li><b>Noite:</b> durma na casa (mão) depois das 19h. O jogo salva sozinho todo dia.</li>
      </ul></div></div>`;
  }
  tab_menu_jogo(g) {
    return `<div class="card"><label class="tfield">Nome desta fazenda<span style="display:flex;gap:6px"><input id="farmName" maxlength="40" value="${esc(g.farmName || '')}" style="flex:1"><button class="btn" data-act="renamenow">Renomear</button></span></label>
      <div class="kv" style="margin-top:8px"><span>Semente do mapa</span><b>${g.seed}</b></div><div class="kv"><span>Dias jogados</span><b>${g.stats.days}</b></div></div>
      <p class="note" style="margin-top:10px">Esta fazenda salva sozinha a cada dia e ao fechar a página. Começar uma fazenda nova não apaga esta.</p>
      <p style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" data-act="savenow">Salvar agora</button>
      <button class="btn" data-act="dupnow" title="Guarda uma cópia do jeito que está agora">Criar ponto de volta</button>
      <button class="btn" data-act="exportnow">Exportar arquivo</button>
      <button class="btn" data-act="title">Tela inicial / outras fazendas</button></p>`;
  }

}

// ---------- auxiliares ----------
function bar(v, col = '#e2b84a') {
  v = Math.max(0, Math.min(1, v));
  const c = v < 0.3 ? '#ee7058' : col;
  return `<span class="bar" title="${pct(v)}"><i style="width:${pct(v)};background:${c}"></i></span>`;
}
function spark(hist) {
  const h = hist.slice(-48);
  if (h.length < 2) return '';
  const mn = Math.min(...h), mx = Math.max(...h), W = 110, H = 22;
  const pts = h.map((v, i) => `${(i / (h.length - 1) * W).toFixed(1)},${(H - 2 - (v - mn) / (mx - mn || 1) * (H - 4)).toFixed(1)}`).join(' ');
  const up = h[h.length - 1] >= h[0];
  return `<svg class="spark" width="${W}" height="${H}"><polyline fill="none" stroke="${up ? '#86d37a' : '#ee7058'}" stroke-width="1.5" points="${pts}"/></svg>`;
}
function weightText(a) {
  if (a.sp === 'gado') return `${Math.round(a.weight)} kg <span class="unit">(${(a.weight / 15).toFixed(1)} @)</span>`;
  if (ANIMALS[a.sp].adultW < 20) return `${a.weight.toFixed(1)} kg`;
  return `${Math.round(a.weight)} kg`;
}
function animalInfo(g, a) {
  const d = ANIMALS[a.sp];
  const lines = [`<b>${animalLabel(a)}</b>${a.owned ? '' : ' <span class="muted">· solto no campo</span>'}`, weightText(a)];
  if (a.owned) {
    lines.push(`Comida ${bar(a.hunger)}`, `Água ${bar(a.thirst, '#4a92cf')}`, `Saúde ${bar(a.health, '#86d37a')}`);
    const bt = breedText(g, a); if (bt) lines.push(`<span class="muted">${bt}</span>`);
    if (d.milk && a.sex === 'f' && isAdult(a)) lines.push(a.milk >= 1 ? `${Math.floor(a.milk)} L para ordenhar (mão)` : '<span class="muted">já ordenhada</span>');
    if (d.wool) lines.push((a.wool || 0) >= 1 ? `${Math.floor(a.wool)} kg de lã para tosquiar (mão)` : `<span class="muted">lã crescendo (${(a.wool || 0).toFixed(1)} kg)</span>`);
    if (a.sp === 'cavalo' && isAdult(a) && !a.ridden) lines.push('<span class="muted">X ou mão: montar</span>');
    lines.push(`<span class="muted">Vale ${fmt(animalValue(g, a))}</span>`);
  } else lines.push(`<span class="muted">Laço (7) para pegar · chance ${pct(d.catch)}</span>`);
  return lines.join('<br>');
}

function tractorPrice(g) { return 2600 * Math.exp(g.market.dollar || 0); }
const ANIMAL_OFFERS = [
  { name: 'Bezerra (fêmea)', sp: 'gado', sex: 'f', w: 160 },
  { name: 'Garrote (macho)', sp: 'gado', sex: 'm', w: 180 },
  { name: 'Leitoa', sp: 'porco', sex: 'f', w: 25 },
  { name: 'Leitão', sp: 'porco', sex: 'm', w: 25 },
  { name: 'Franga', sp: 'galinha', sex: 'f', w: 1.3 },
  { name: 'Galo', sp: 'galinha', sex: 'm', w: 1.8 },
  { name: 'Égua mansa', sp: 'cavalo', sex: 'f', w: 400 },
  { name: 'Cavalo manso', sp: 'cavalo', sex: 'm', w: 420 },
  { name: 'Ovelha', sp: 'ovelha', sex: 'f', w: 42 },
  { name: 'Carneiro', sp: 'ovelha', sex: 'm', w: 50 },
  { name: 'Cabra', sp: 'cabra', sex: 'f', w: 40 },
  { name: 'Bode', sp: 'cabra', sex: 'm', w: 45 },
  { name: 'Pata', sp: 'pato', sex: 'f', w: 2.4 },
  { name: 'Pato', sp: 'pato', sex: 'm', w: 3 },
  { name: 'Perua', sp: 'peru', sex: 'f', w: 6 },
  { name: 'Peru', sp: 'peru', sex: 'm', w: 9 },
  { name: 'Coelha', sp: 'coelho', sex: 'f', w: 2.8 },
  { name: 'Coelho', sp: 'coelho', sex: 'm', w: 3 },
  { name: 'Lhama', sp: 'lhama', sex: 'f', w: 125 },
  { name: 'Lhama macho', sp: 'lhama', sex: 'm', w: 140 },
  { name: 'Búfala', sp: 'bufalo', sex: 'f', w: 420 },
  { name: 'Búfalo', sp: 'bufalo', sex: 'm', w: 480 },
];
function offerPrice(g, o) {
  const d = ANIMALS[o.sp], p = g.market.c[d.market].price;
  if (d.sell === 'arroba') return o.w / 15 * p * 1.3;
  if (d.sell === 'kg') return o.w * p * 1.5;
  return p * 1.15;
}

// Estima o ciclo plantando hoje usando o clima médio dos próximos dias.
function estimateCrop(d, doy) {
  let prog = 0, n = 0, sum = 0, frost = false, rainSum = 0;
  for (let k = 0; k < 80 && prog < 1; k++) {
    const dd = (doy + k) % YEAR_DAYS;
    const S = seasonParams(dd);
    let f = 0;
    for (let h = 0; h < 24; h += 3) {
      const T = S.tMean + S.amp / 2 * Math.cos(Math.PI * (h - 15) / 12);
      f += fTemp(T, d) / 8;
    }
    if (dd >= 36 && dd < 46 && d.frost > 0.5) frost = true;
    rainSum += S.rainP;
    prog += f / d.days; sum += f; n++;
  }
  const score = n ? sum / n : 0;
  return { days: prog >= 1 ? n : 0, score, frost, dry: rainSum / n < 0.25 };
}

const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Desenha o mapa inteiro em miniatura (um pixel por tile).
const MAP_COL = { [G.WATER]: [59, 125, 179], [G.SAND]: [217, 199, 143], [G.DIRT]: [141, 107, 71], [G.TILLED]: [110, 76, 46], [G.PATH]: [176, 145, 94], [G.YARD]: [184, 154, 106] };
const OBJ_COL = { [O.TREE]: [38, 96, 36], [O.BUSH]: [70, 128, 52], [O.ROCK]: [130, 132, 128], [O.FENCE]: [107, 69, 38], [O.GATE]: [150, 110, 70], [O.HOUSE]: [190, 70, 50], [O.COOP]: [60, 120, 70], [O.BRIDGE]: [154, 106, 58], [O.PAIOL]: [168, 118, 62], [O.SILO]: [200, 204, 208] };
function drawMap(cv, w) {
  const tmp = document.createElement('canvas'); tmp.width = w.w; tmp.height = w.h;
  const tc = tmp.getContext('2d'), img = tc.createImageData(w.w, w.h);
  for (let i = 0; i < w.w * w.h; i++) {
    let col = OBJ_COL[w.obj[i]] || MAP_COL[w.ground[i]];
    if (!col) { const gv = w.grass[i]; col = w.ground[i] === G.PASTURE ? [70, 160, 60] : [95 + (1 - gv) * 60, 150 - (1 - gv) * 20, 70]; }
    if (w.crops.has(i)) col = [150, 170, 60];
    img.data.set([col[0], col[1], col[2], 255], i * 4);
  }
  tc.putImageData(img, 0, 0);
  const c = cv.getContext('2d');
  c.imageSmoothingEnabled = false;
  c.clearRect(0, 0, cv.width, cv.height);
  c.drawImage(tmp, 0, 0, cv.width, cv.height);
}
