// Desenha o mundo no canvas: chão, objetos ordenados por profundidade, bichos, clima e luz.
import { TILE, G, O, CROPS, ANIMALS, TROUGH_MAX, FEEDER_MAX, YEAR_DAYS, DAYS_PER_SEASON } from './config.js';
import { groundSprite, wetTilled, treeSprite, bushSprite, rockSprite, cropSprite, houseSprite, coopSprite, tileHash } from './art.js';
import { cropStage } from './sim.js';
import { rainAt, tempAt } from './climate.js';
import { hourOf, dayOf } from './game.js';
import { isAdult } from './animals.js';

const T = TILE;

export class Renderer {
  constructor(host) {
    this.cv = document.createElement('canvas');
    host.appendChild(this.cv);
    this.ctx = this.cv.getContext('2d');
    this.light = document.createElement('canvas');
    this.lctx = this.light.getContext('2d');
    this.zoom = window.innerWidth < 700 ? 1.6 : 2;
    this.cam = { x: 0, y: 0 };
    this.drops = [];
    this.flash = 0;
    this.overlay = null; // 'umidade' | 'fertilidade' | 'capim'
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }
  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.dpr = dpr;
    this.vw = window.innerWidth; this.vh = window.innerHeight;
    for (const c of [this.cv, this.light]) { c.width = Math.floor(this.vw * dpr); c.height = Math.floor(this.vh * dpr); }
    this.cv.style.width = this.vw + 'px'; this.cv.style.height = this.vh + 'px';
  }
  // tela -> mundo (em tiles)
  // escala efetiva presa a pixels inteiros da tela (evita frestas entre tiles)
  get z() { return Math.max(1, Math.round(this.dpr * this.zoom)) / this.dpr; }
  toWorld(sx, sy) {
    const s = T * this.z;
    return { x: this.cam.x + (sx - this.vw / 2) / s, y: this.cam.y + (sy - this.vh / 2) / s };
  }

  draw(g, ui, dt, now) {
    const { ctx, dpr } = this;
    const w = g.world, p = g.player;
    const z = this.z, s = T * z;
    // câmera segue o jogador, presa ao mapa
    const halfW = this.vw / 2 / s, halfH = this.vh / 2 / s;
    this.cam.x = clamp(p.x, Math.min(halfW, w.w / 2), Math.max(w.w - halfW, w.w / 2));
    this.cam.y = clamp(p.y, Math.min(halfH, w.h / 2), Math.max(w.h - halfH, w.h / 2));

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#1d2a14'; ctx.fillRect(0, 0, this.vw, this.vh);
    ctx.setTransform(dpr * z, 0, 0, dpr * z, Math.round(dpr * (this.vw / 2 - this.cam.x * s)), Math.round(dpr * (this.vh / 2 - this.cam.y * s)));
    ctx.imageSmoothingEnabled = false;

    const x0 = Math.max(0, Math.floor(this.cam.x - halfW) - 1), x1 = Math.min(w.w - 1, Math.ceil(this.cam.x + halfW) + 1);
    const y0 = Math.max(0, Math.floor(this.cam.y - halfH) - 1), y1 = Math.min(w.h - 1, Math.ceil(this.cam.y + halfH) + 3);
    const day = dayOf(g), doy = day % YEAR_DAYS, season = Math.floor(doy / DAYS_PER_SEASON);
    const hour = hourOf(g);
    const today = g.climate.days[0];
    const frame = Math.floor(now / 600) % 3;

    // ---- chão ----
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = w.idx(x, y), gr = w.ground[i], h = tileHash(x, y);
      const px = x * T, py = y * T;
      ctx.drawImage(groundSprite(gr, h & 3, season, (frame + h) % 3), px, py);
      if (gr === G.GRASS || gr === G.PASTURE) {
        const cap = gr === G.PASTURE ? 1 : 0.55;
        const lack = 1 - Math.min(1, w.grass[i] / cap);
        if (lack > 0.15) { ctx.fillStyle = `rgba(178,150,82,${(lack * 0.6).toFixed(2)})`; ctx.fillRect(px, py, T, T); }
      }
      if (gr === G.TILLED && w.moist[i] > 0.15) { ctx.globalAlpha = Math.min(1, (w.moist[i] - 0.15) * 1.6); ctx.drawImage(wetTilled(), px, py); ctx.globalAlpha = 1; }
      if (gr === G.WATER) shore(ctx, w, x, y, px, py);
    }
    // geada pela manhã
    if (today.frost && hour < 9.5) {
      ctx.fillStyle = `rgba(230,240,255,${(0.42 * Math.min(1, (9.5 - hour) / 3)).toFixed(2)})`;
      ctx.fillRect(x0 * T, y0 * T, (x1 - x0 + 1) * T, (y1 - y0 + 1) * T);
    }
    if (this.overlay) this.drawOverlay(ctx, w, x0, x1, y0, y1);

    // ---- objetos e seres por profundidade ----
    const list = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = w.idx(x, y), o = w.obj[i];
      const c = w.crops.get(i);
      if (c) list.push([y + 0.6, 0, i, c]);
      if (o !== O.NONE && o !== O.HOUSE && o !== O.COOP) list.push([y + (o === O.TREE ? 0.85 : 0.7), 1, i, o]);
    }
    for (const b of w.buildings) list.push([b.y + b.h, 2, b]);
    for (const e of w.drops) if (e.x >= x0 && e.x <= x1 && e.y >= y0 && e.y <= y1) list.push([e.y + 0.3, 3, e]);
    for (const a of g.animals) if (!a.ridden && a.x > x0 - 1 && a.x < x1 + 2 && a.y > y0 - 1 && a.y < y1 + 2) list.push([a.y + 0.2, 4, a]);
    for (const v of g.vehicles) if (!(p.mount?.kind === 'trator' && p.mount.id === v.id)) list.push([v.y + 0.3, 6, v]);
    for (const k of g.workers) list.push([k.y + 0.25, 7, k]);
    list.push([p.y + 0.25, 5, p]);
    list.sort((a, b) => a[0] - b[0]);

    for (const it of list) {
      switch (it[1]) {
        case 0: this.drawCrop(ctx, w, it[2], it[3], now); break;
        case 1: this.drawObj(ctx, w, it[2], it[3], season, doy, hour, now); break;
        case 2: {
          const b = it[2];
          const spr = b.kind === 'house' ? houseSprite() : coopSprite();
          ctx.drawImage(spr, b.x * T - 4, (b.y + b.h) * T - spr.height + 2);
          break;
        }
        case 3: drawEggs(ctx, it[2]); break;
        case 4: drawAnimal(ctx, it[2], now, ui.hoverAnimal === it[2]); break;
        case 5: drawPlayer(ctx, g, now); break;
        case 6: drawTractor(ctx, it[2].x * T, it[2].y * T, it[2].fx >= 0 ? 1 : -1); break;
        case 7: drawWorker(ctx, it[2]); break;
      }
    }
    // corda do laço
    ctx.strokeStyle = '#d9c38a'; ctx.lineWidth = 1;
    for (const led of g.animals) {
      if (!led.led) continue;
      ctx.beginPath(); ctx.moveTo(p.x * T + 6, p.y * T - 12);
      ctx.quadraticCurveTo((p.x + led.x) / 2 * T, (p.y + led.y) / 2 * T + 6, led.x * T, led.y * T - 10);
      ctx.stroke();
    }

    // alvo da ferramenta
    if (ui.target) {
      const { x, y, ok } = ui.target;
      ctx.strokeStyle = ok ? 'rgba(255,255,255,0.9)' : 'rgba(255,90,70,0.8)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x * T + 1, y * T + 1, T - 2, T - 2);
    }

    // ---- clima e luz (em coordenadas de tela) ----
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const rainNow = rainAt(today, Math.floor(hour));
    this.drawWeather(ctx, today, rainNow, hour, dt);
    this.drawLight(ctx, g, hour, today, rainNow, s);
  }

  drawCrop(ctx, w, i, c, now) {
    const x = i % w.w, y = (i / w.w) | 0;
    const st = cropStage(c);
    const spr = cropSprite(c.type, st, !c.dead && c.health < 0.5);
    ctx.drawImage(spr, x * T, y * T + T - spr.height + 4);
    if (c.ripe && !c.dead && Math.floor(now / 400 + i) % 6 === 0) {
      ctx.fillStyle = 'rgba(255,255,220,0.9)'; ctx.fillRect(x * T + 22, y * T - 14, 2, 2);
    }
  }

  drawObj(ctx, w, i, o, season, doy, hour, now) {
    const x = i % w.w, y = (i / w.w) | 0, px = x * T, py = y * T, h = tileHash(x, y);
    switch (o) {
      case O.TREE: {
        const kind = h % 17 === 0 ? 1 : h % 19 === 0 ? 2 : 0;
        // ipês florescem no fim do inverno (jul–set)
        const bloom = kind && (doy >= 40 || doy < 4);
        const spr = treeSprite(kind, season, bloom);
        ctx.drawImage(spr, px - 12, py + T - spr.height + 6);
        break;
      }
      case O.BUSH: ctx.drawImage(bushSprite(season, h % 6), px, py); break;
      case O.ROCK: ctx.drawImage(rockSprite(h % 3), px, py); break;
      case O.FENCE: drawFence(ctx, w, x, y, px, py); break;
      case O.GATE: drawGate(ctx, w, x, y, px, py); break;
      case O.TROUGH: {
        const t = w.troughs.get(i);
        ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(px + 3, py + 22, 28, 6);
        ctx.fillStyle = '#8a8f96'; ctx.fillRect(px + 2, py + 12, 28, 13);
        ctx.fillStyle = '#5f646b'; ctx.fillRect(px + 4, py + 14, 24, 9);
        const lv = (t?.water || 0) / TROUGH_MAX;
        if (lv > 0) { ctx.fillStyle = '#4a92cf'; ctx.fillRect(px + 4, py + 14 + 9 * (1 - lv), 24, 9 * lv); }
        break;
      }
      case O.FEEDER: {
        const f = w.feeders.get(i);
        ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(px + 3, py + 22, 28, 6);
        ctx.fillStyle = '#8a5a30'; ctx.fillRect(px + 2, py + 12, 28, 13);
        ctx.fillStyle = '#5a3818'; ctx.fillRect(px + 4, py + 14, 24, 8);
        const lv = (f?.food || 0) / FEEDER_MAX;
        if (lv > 0) { ctx.fillStyle = '#e8c040'; ctx.fillRect(px + 4, py + 14 + 8 * (1 - lv), 24, 8 * lv); }
        ctx.fillStyle = '#6e4626'; ctx.fillRect(px + 2, py + 24, 3, 5); ctx.fillRect(px + 27, py + 24, 3, 5);
        break;
      }
      case O.PAIOL: {
        ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(px + 2, py + 26, 32, 6);
        ctx.fillStyle = '#6b4526'; ctx.fillRect(px + 3, py + 18, 3, 10); ctx.fillRect(px + 26, py + 18, 3, 10);
        ctx.fillStyle = '#a8763e'; ctx.fillRect(px + 1, py - 4, 30, 24);
        ctx.fillStyle = '#8a5c2c'; for (let k = 0; k < 30; k += 5) ctx.fillRect(px + 1 + k, py - 4, 1, 24);
        ctx.fillStyle = '#e8c040'; ctx.fillRect(px + 9, py + 4, 14, 8);
        ctx.fillStyle = '#7a4a22'; ctx.beginPath(); ctx.moveTo(px - 2, py - 2); ctx.lineTo(px + 16, py - 16); ctx.lineTo(px + 34, py - 2); ctx.fill();
        break;
      }
      case O.SILO: {
        ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(px + 18, py + 28, 16, 5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#c8ccd0'; ctx.fillRect(px + 2, py - 40, 28, 68);
        ctx.fillStyle = '#a8acb0'; for (let yy = py - 34; yy < py + 26; yy += 7) ctx.fillRect(px + 2, yy, 28, 1);
        ctx.fillStyle = '#e4e8ec'; ctx.fillRect(px + 6, py - 40, 4, 68);
        ctx.fillStyle = '#b0b4b8'; ctx.beginPath(); ctx.moveTo(px, py - 40); ctx.lineTo(px + 16, py - 54); ctx.lineTo(px + 32, py - 40); ctx.fill();
        ctx.fillStyle = '#6a7078'; ctx.fillRect(px + 22, py - 36, 2, 62);
        break;
      }
      case O.SPRINKLER: {
        ctx.fillStyle = '#5a5f66'; ctx.fillRect(px + 15, py + 10, 3, 18);
        ctx.fillStyle = '#c0c4c8'; ctx.fillRect(px + 12, py + 8, 9, 4);
        const on = (hour >= 6 && hour < 7) || (hour >= 17 && hour < 18);
        if (on && w.nearWater(x, y, 8)) {
          const a = now / 300;
          ctx.strokeStyle = 'rgba(160,210,255,0.7)'; ctx.lineWidth = 1;
          for (let k = 0; k < 6; k++) {
            const ang = a + k * Math.PI / 3;
            ctx.beginPath(); ctx.moveTo(px + 16, py + 9);
            ctx.quadraticCurveTo(px + 16 + Math.cos(ang) * 30, py - 14 + Math.sin(ang) * 10, px + 16 + Math.cos(ang) * 62, py + 16 + Math.sin(ang) * 50);
            ctx.stroke();
          }
        }
        break;
      }
    }
  }

  drawOverlay(ctx, w, x0, x1, y0, y1) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = w.idx(x, y);
      if (w.ground[i] === G.WATER) continue;
      let v, col;
      if (this.overlay === 'umidade') { v = w.moist[i]; col = v < 0.15 ? [220, 80, 50] : v < 0.35 ? [230, 190, 60] : [60, 140, 230]; }
      else if (this.overlay === 'fertilidade') { v = w.fert[i]; col = v < 0.4 ? [210, 80, 50] : v < 0.65 ? [220, 190, 70] : [80, 200, 90]; }
      else { v = w.grass[i]; col = v < 0.15 ? [200, 90, 50] : v < 0.4 ? [220, 200, 70] : [70, 200, 80]; }
      ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},0.45)`;
      ctx.fillRect(x * T, y * T, T, T);
    }
  }

  drawWeather(ctx, today, rainNow, hour, dt) {
    const { vw, vh } = this;
    // chuva
    const target = rainNow > 0 ? Math.min(500, 60 + rainNow * 45) : 0;
    while (this.drops.length < target) this.drops.push({ x: Math.random() * vw, y: Math.random() * vh, v: 600 + Math.random() * 300 });
    if (this.drops.length > target) this.drops.length = Math.floor(target);
    if (this.drops.length) {
      ctx.strokeStyle = 'rgba(190,210,240,0.55)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (const d of this.drops) {
        d.y += d.v * dt; d.x -= d.v * dt * 0.15;
        if (d.y > vh) { d.y = -10; d.x = Math.random() * (vw + 100); }
        ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + 2, d.y - 10);
      }
      ctx.stroke();
      ctx.fillStyle = 'rgba(40,55,80,0.18)'; ctx.fillRect(0, 0, vw, vh);
    }
    // relâmpagos
    if (today.storm && rainNow > 0 && Math.random() < dt * 0.15) this.flash = 1;
    if (this.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${(this.flash * 0.5).toFixed(2)})`; ctx.fillRect(0, 0, vw, vh); this.flash -= dt * 4; }
    // céu nublado escurece um pouco; calor dá um tom quente
    if (!rainNow && today.cloud > 0.4) { ctx.fillStyle = `rgba(60,70,90,${((today.cloud - 0.4) * 0.25).toFixed(2)})`; ctx.fillRect(0, 0, vw, vh); }
    const T0 = tempAt(today, hour);
    if (T0 > 32) { ctx.fillStyle = `rgba(255,160,60,${Math.min(0.12, (T0 - 32) * 0.02).toFixed(2)})`; ctx.fillRect(0, 0, vw, vh); }
    // neblina nas manhãs frias
    if (hour > 4.5 && hour < 8.5 && today.tMin < 10) { ctx.fillStyle = `rgba(220,225,235,${(0.18 * Math.sin((hour - 4.5) / 4 * Math.PI)).toFixed(2)})`; ctx.fillRect(0, 0, vw, vh); }
  }

  drawLight(ctx, g, hour, today, rainNow, s) {
    let dark = 0;
    if (hour < 5) dark = 0.68;
    else if (hour < 7) dark = 0.68 * (7 - hour) / 2;
    else if (hour > 19.5) dark = 0.68;
    else if (hour > 17.5) dark = 0.68 * (hour - 17.5) / 2;
    if (dark <= 0.01) return;
    const { lctx, light, dpr } = this;
    lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    lctx.globalCompositeOperation = 'source-over';
    lctx.clearRect(0, 0, this.vw, this.vh);
    lctx.fillStyle = `rgba(12,18,48,${dark.toFixed(2)})`;
    lctx.fillRect(0, 0, this.vw, this.vh);
    lctx.globalCompositeOperation = 'destination-out';
    const hole = (wx, wy, r, a) => {
      const sx = this.vw / 2 + (wx - this.cam.x) * s, sy = this.vh / 2 + (wy - this.cam.y) * s;
      const gr = lctx.createRadialGradient(sx, sy, 0, sx, sy, r * s);
      gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      lctx.fillStyle = gr; lctx.fillRect(sx - r * s, sy - r * s, r * s * 2, r * s * 2);
    };
    const p = g.player;
    hole(p.x, p.y - 0.4, 4.2, 0.95);
    for (const b of g.world.buildings) hole(b.x + b.w / 2, b.y + b.h - 0.2, 3, 0.8);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(light, 0, 0);
    // brilho quente da lanterna
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sx = this.vw / 2 + (p.x - this.cam.x) * s, sy = this.vh / 2 + (p.y - 0.4 - this.cam.y) * s;
    const gr = ctx.createRadialGradient(sx, sy, 0, sx, sy, 3 * s);
    gr.addColorStop(0, `rgba(255,190,90,${(dark * 0.25).toFixed(2)})`); gr.addColorStop(1, 'rgba(255,190,90,0)');
    ctx.fillStyle = gr; ctx.fillRect(sx - 3 * s, sy - 3 * s, 6 * s, 6 * s);
  }
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function shore(ctx, w, x, y, px, py) {
  ctx.fillStyle = 'rgba(220,235,245,0.5)';
  const land = (nx, ny) => w.inside(nx, ny) && w.ground[w.idx(nx, ny)] !== G.WATER;
  if (land(x, y - 1)) ctx.fillRect(px, py, T, 2);
  if (land(x, y + 1)) ctx.fillRect(px, py + T - 2, T, 2);
  if (land(x - 1, y)) ctx.fillRect(px, py, 2, T);
  if (land(x + 1, y)) ctx.fillRect(px + T - 2, py, 2, T);
}

const isFenceLike = (w, x, y) => w.inside(x, y) && (w.obj[w.idx(x, y)] === O.FENCE || w.obj[w.idx(x, y)] === O.GATE);

function drawFence(ctx, w, x, y, px, py) {
  const cx = px + 16, base = py + 24;
  ctx.fillStyle = '#8a5f36';
  if (isFenceLike(w, x + 1, y)) { ctx.fillRect(cx, base - 12, 16, 2); ctx.fillRect(cx, base - 6, 16, 2); }
  if (isFenceLike(w, x - 1, y)) { ctx.fillRect(px, base - 12, 16, 2); ctx.fillRect(px, base - 6, 16, 2); }
  if (isFenceLike(w, x, y - 1)) { ctx.fillStyle = '#7a522c'; ctx.fillRect(cx - 1, py - 8, 2, 24); }
  if (isFenceLike(w, x, y + 1)) { ctx.fillStyle = '#7a522c'; ctx.fillRect(cx - 1, base - 8, 2, 16); }
  ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(cx - 3, base, 7, 3);
  ctx.fillStyle = '#6b4526'; ctx.fillRect(cx - 2, base - 16, 5, 17);
  ctx.fillStyle = '#9a6e42'; ctx.fillRect(cx - 2, base - 16, 5, 2);
}
function drawGate(ctx, w, x, y, px, py) {
  const horiz = isFenceLike(w, x - 1, y) || isFenceLike(w, x + 1, y) || !(isFenceLike(w, x, y - 1) || isFenceLike(w, x, y + 1));
  ctx.fillStyle = '#c99a5a';
  if (horiz) {
    ctx.fillStyle = '#6b4526'; ctx.fillRect(px, py + 8, 4, 17); ctx.fillRect(px + 28, py + 8, 4, 17);
    ctx.fillStyle = '#c99a5a';
    for (const yy of [11, 16, 21]) ctx.fillRect(px + 4, py + yy, 24, 2);
    ctx.save(); ctx.translate(px + 4, py + 22); ctx.rotate(-0.42); ctx.fillRect(0, 0, 27, 2); ctx.restore();
  } else {
    ctx.fillStyle = '#6b4526'; ctx.fillRect(px + 14, py - 6, 5, 6); ctx.fillRect(px + 14, py + 24, 5, 6);
    ctx.fillStyle = '#c99a5a';
    for (const xx of [12, 16, 20]) ctx.fillRect(px + xx, py, 2, 24);
  }
}

function drawEggs(ctx, e) {
  const px = e.x * T + 10, py = e.y * T + 18;
  ctx.fillStyle = '#c9a060'; ctx.beginPath(); ctx.ellipse(px + 6, py + 4, 9, 4, 0, 0, Math.PI * 2); ctx.fill();
  for (let k = 0; k < Math.min(5, e.n); k++) {
    ctx.fillStyle = k % 2 ? '#f5efe0' : '#e8d2b0';
    ctx.beginPath(); ctx.ellipse(px + k * 3, py + 2 - (k % 2), 2.2, 3, 0, 0, Math.PI * 2); ctx.fill();
  }
}

// ---------- animais ----------
const COAT = ['nelore', 'holandesa', 'caracu'];
function drawAnimal(ctx, a, now, hover) {
  const d = ANIMALS[a.sp];
  const grow = 0.5 + 0.5 * Math.min(1, a.weight / d.adultW);
  const x = a.x * T, y = a.y * T;
  const bob = Math.sin(a.step) * 1.2;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(0, 2, 13 * d.size * grow + 2, 4 * grow + 1, 0, 0, Math.PI * 2); ctx.fill();
  ctx.scale(a.face * grow, grow);
  const legPh = Math.sin(a.step);
  if (a.sp === 'gado') {
    const coat = COAT[a.id % 3];
    const body = coat === 'nelore' ? '#e8e4dc' : coat === 'caracu' ? '#b0703a' : '#f4f2ee';
    legs(ctx, [-9, -4, 5, 10], 0, 9, legPh, '#5a4a3a');
    ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(0, -9 + bob * 0.3, 14, 8, 0, 0, Math.PI * 2); ctx.fill();
    if (coat === 'nelore') { ctx.fillStyle = '#d4cec2'; ctx.beginPath(); ctx.ellipse(-4, -15, 5, 3, 0, 0, Math.PI * 2); ctx.fill(); }
    if (coat === 'holandesa') { ctx.fillStyle = '#222'; ctx.beginPath(); ctx.ellipse(-5, -10, 5, 4, 0.4, 0, Math.PI * 2); ctx.ellipse(6, -7, 4, 3, -0.3, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(14, -13, 6, 5, 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d9a6a0'; ctx.beginPath(); ctx.ellipse(19, -11, 3, 2.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#222'; ctx.fillRect(15, -15, 1.5, 1.5);
    if (a.sex === 'm') { ctx.fillStyle = '#e8dcb8'; ctx.fillRect(11, -20, 2, 4); ctx.fillRect(15, -20, 2, 4); }
    else if (isAdult(a)) { ctx.fillStyle = '#e8b0b0'; ctx.fillRect(-2, -3, 4, 2); }
    ctx.strokeStyle = body; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-13, -10); ctx.lineTo(-16, -2 + Math.sin(now / 300 + a.id) * 1.5); ctx.stroke();
    if (a.owned) { ctx.fillStyle = '#f0c020'; ctx.fillRect(10, -18, 3, 3); }
  } else if (a.sp === 'porco') {
    legs(ctx, [-6, -2, 3, 7], 0, 6, legPh, '#c87a7a');
    ctx.fillStyle = a.id % 4 === 0 ? '#e0b0a0' : '#f0a8a8';
    ctx.beginPath(); ctx.ellipse(0, -7 + bob * 0.3, 11, 7, 0, 0, Math.PI * 2); ctx.fill();
    if (a.id % 4 === 0) { ctx.fillStyle = '#3a2a2a'; ctx.beginPath(); ctx.ellipse(-3, -8, 4, 3, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#f0a8a8'; ctx.beginPath(); ctx.ellipse(10, -8, 5, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e07c84'; ctx.beginPath(); ctx.ellipse(14.5, -7, 2.5, 2.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d88890'; ctx.beginPath(); ctx.moveTo(8, -13); ctx.lineTo(11, -16); ctx.lineTo(12, -11); ctx.fill();
    ctx.fillStyle = '#222'; ctx.fillRect(11, -10, 1.5, 1.5);
    ctx.strokeStyle = '#e09098'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(-12, -9, 2, 0, Math.PI * 1.5); ctx.stroke();
    if (a.owned) { ctx.fillStyle = '#f0c020'; ctx.fillRect(9, -15, 2.5, 2.5); }
  } else if (a.sp === 'cavalo') {
    drawHorse(ctx, a, legPh, bob);
  } else if (a.sp === 'ovelha') {
    const fluff = 0.8 + Math.min(1, (a.wool || 0) / 4) * 0.45;
    legs(ctx, [-6, -3, 3, 6], 0, 6, legPh, '#3a3a3a');
    ctx.fillStyle = '#f2eee2';
    for (const [bx, by, br] of [[-5, -9, 5], [0, -11, 5.5], [5, -9, 5], [-2, -6, 5], [3, -6, 5]]) { ctx.beginPath(); ctx.arc(bx, by + bob * 0.3, br * fluff, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#d8d2c2'; ctx.beginPath(); ctx.arc(-2, -7, 3 * fluff, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2e2a26'; ctx.beginPath(); ctx.ellipse(10, -11, 3.6, 4.4, 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(7, -14, 3, 2);
    if (a.sex === 'm' && isAdult(a)) { ctx.strokeStyle = '#c8b890'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(9, -13, 2.5, Math.PI, Math.PI * 2.4); ctx.stroke(); }
    ctx.fillStyle = '#fff'; ctx.fillRect(11, -12, 1, 1);
    if (a.owned) { ctx.fillStyle = '#f0c020'; ctx.fillRect(7, -15, 2, 2); }
  } else if (a.sp === 'cabra') {
    const col = ['#8a7a6a', '#e8e2d6', '#5a4030'][a.id % 3];
    legs(ctx, [-6, -3, 3, 6], 0, 8, legPh, '#4a3a2e');
    ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, -9 + bob * 0.3, 9, 5.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(9, -14, 3.5, 3, 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(10, -13); ctx.lineTo(13, -9); ctx.lineTo(11, -11); ctx.fill();
    ctx.fillStyle = '#d8d0c0'; ctx.fillRect(10, -10, 1.5, 3);
    ctx.strokeStyle = '#5a4a3a'; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(8, -16); ctx.quadraticCurveTo(5, a.sex === 'm' ? -22 : -19, 3, a.sex === 'm' ? -20 : -17); ctx.stroke();
    ctx.fillStyle = '#222'; ctx.fillRect(10, -15, 1.2, 1.2);
    ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(-8, -11); ctx.lineTo(-10, -14); ctx.stroke();
    if (a.owned) { ctx.fillStyle = '#f0c020'; ctx.fillRect(7, -17, 2, 2); }
  } else {
    const rooster = a.sex === 'm' && isAdult(a);
    const chick = a.weight < d.adultW * 0.6;
    const col = chick ? '#f6dc5a' : a.id % 3 === 0 ? '#b8682c' : '#f4f0e6';
    ctx.strokeStyle = '#e0a020'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-1, -3); ctx.lineTo(-1 + legPh, 2); ctx.moveTo(2, -3); ctx.lineTo(2 - legPh, 2); ctx.stroke();
    if (rooster) { ctx.fillStyle = '#2a5a3a'; ctx.beginPath(); ctx.moveTo(-6, -8); ctx.quadraticCurveTo(-13, -18, -9, -4); ctx.fill(); ctx.fillStyle = '#9a2a1a'; ctx.beginPath(); ctx.moveTo(-6, -7); ctx.quadraticCurveTo(-12, -14, -8, -3); ctx.fill(); }
    ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, -7 + bob * 0.4, 7, 5.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(6, -12, 3.6, 0, Math.PI * 2); ctx.fill();
    if (!chick) { ctx.fillStyle = '#d82a2a'; ctx.fillRect(5, rooster ? -18 : -17, rooster ? 4 : 3, rooster ? 3 : 2); ctx.fillRect(8, -10, 1.5, 2); }
    ctx.fillStyle = '#f0b020'; ctx.beginPath(); ctx.moveTo(9, -12); ctx.lineTo(12, -11); ctx.lineTo(9, -10); ctx.fill();
    ctx.fillStyle = '#222'; ctx.fillRect(6.5, -13, 1.2, 1.2);
    if (a.owned) { ctx.fillStyle = '#2a7ad0'; ctx.fillRect(-1, 0, 3, 1.5); }
  }
  ctx.restore();
  // balão de necessidade
  if (a.owned && (hover || a.thirst < 0.3 || a.hunger < 0.25 || a.health < 0.5)) {
    const icon = a.thirst < 0.3 ? '💧' : a.hunger < 0.25 ? '🌾' : a.health < 0.5 ? '🤒' : null;
    if (icon) { ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(icon, x, y - 24 * grow - 4); }
  }
  if (hover) { ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(x, y + 2, 14 * d.size * grow + 4, 5 * grow + 2, 0, 0, Math.PI * 2); ctx.stroke(); }
}
function legs(ctx, xs, top, len, ph, col) {
  ctx.fillStyle = col;
  xs.forEach((lx, k) => { const off = (k % 2 ? ph : -ph) * 1.5; ctx.fillRect(lx + off, top - 4, 2.5, len - Math.abs(off) * 0.3); });
}

// ---------- cavalo ----------
const HORSE = ['#7a4a26', '#3a2a20', '#c8a878', '#e8e4dc'];
function drawHorse(ctx, a, legPh, bob) {
  const coat = HORSE[a.id % 4], mane = a.id % 4 === 2 ? '#f0e8d0' : '#2a1a10';
  legs(ctx, [-9, -5, 6, 10], 0, 13, legPh, coat === '#e8e4dc' ? '#c8c4bc' : '#4a3020');
  ctx.fillStyle = coat; ctx.beginPath(); ctx.ellipse(0, -14 + bob * 0.3, 13, 7, 0, 0, Math.PI * 2); ctx.fill();
  // pescoço e cabeça
  ctx.beginPath(); ctx.moveTo(8, -18); ctx.lineTo(15, -28); ctx.lineTo(19, -26); ctx.lineTo(13, -12); ctx.fill();
  ctx.beginPath(); ctx.ellipse(19, -26, 6, 3.4, 0.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = mane; ctx.fillRect(12, -29, 3, 12);
  ctx.beginPath(); ctx.moveTo(-12, -15); ctx.quadraticCurveTo(-18, -10, -15, -2); ctx.lineTo(-13, -3); ctx.quadraticCurveTo(-15, -9, -11, -12); ctx.fill();
  ctx.fillStyle = '#111'; ctx.fillRect(18, -28, 1.5, 1.5);
  ctx.fillStyle = coat; ctx.beginPath(); ctx.moveTo(15, -30); ctx.lineTo(16, -34); ctx.lineTo(18, -30); ctx.fill();
  if (a.owned) { ctx.fillStyle = '#8a4a20'; ctx.fillRect(14, -27, 1.5, 4); ctx.fillRect(17, -24, 5, 1.2); } // cabresto
  if (a.ridden) { ctx.fillStyle = '#5a2e14'; ctx.fillRect(-6, -22, 11, 5); ctx.fillStyle = '#8a4a20'; ctx.fillRect(-1, -17, 2, 7); }
}

// ---------- trator ----------
function drawTractor(ctx, x, y, face) {
  ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.scale(face, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(0, 3, 20, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2a2a2a'; ctx.beginPath(); ctx.arc(-10, -6, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#c8b030'; ctx.beginPath(); ctx.arc(-10, -6, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3a8a3a'; ctx.fillRect(-12, -22, 26, 12); ctx.fillRect(2, -16, 16, 9);
  ctx.fillStyle = '#2a6a2a'; ctx.fillRect(4, -14, 12, 1); ctx.fillRect(4, -11, 12, 1);
  ctx.fillStyle = '#555'; ctx.fillRect(12, -27, 2.5, 9);
  ctx.fillStyle = '#2a2a2a'; ctx.beginPath(); ctx.arc(11, -3, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#c8b030'; ctx.beginPath(); ctx.arc(11, -3, 2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1a1a1a'; ctx.fillRect(-14, -25, 3, 4);
  ctx.restore();
}

// ---------- gente ----------
const PAL_PLAYER = { shirt: '#b8362e', stripe: '#8a2420', pants: '#4a5a7a', hat: 'palha' };
const PAL_WORKER = [
  { shirt: '#3a6ab0', stripe: '#2a4a80', pants: '#5a4a3a', hat: 'bone', cap: '#d8d0b0' },
  { shirt: '#5a8a3a', stripe: '#3a6a2a', pants: '#3a3a4a', hat: 'bone', cap: '#c83a2a' },
  { shirt: '#d8a030', stripe: '#a87820', pants: '#4a5a7a', hat: 'palha' },
];
// seated = deslocamento vertical quando está montado (sem pernas andando)
function drawFarmer(ctx, f, pal, toolId, seated = 0, label = null) {
  const x = Math.round(f.x * T), y = Math.round(f.y * T);
  const dir = Math.abs(f.fx) > Math.abs(f.fy) ? (f.fx > 0 ? 'r' : 'l') : (f.fy < 0 ? 'u' : 'd');
  const walk = f.moving && !seated ? Math.sin(f.step) : 0;
  const bob = f.moving && !seated ? Math.abs(Math.sin(f.step)) * 1.2 : 0;
  ctx.save(); ctx.translate(x, y + seated);
  ctx.fillStyle = pal.pants;
  if (seated) { ctx.fillRect(-5, -9, 3, 7); ctx.fillRect(2, -9, 3, 7); }
  else {
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(0, 2, 8, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = pal.pants;
    ctx.fillRect(-4, -8, 3, 8 + walk * 1.5); ctx.fillRect(1, -8, 3, 8 - walk * 1.5);
    ctx.fillStyle = '#3a2618'; ctx.fillRect(-4, -1 + walk * 1.5, 3, 2); ctx.fillRect(1, -1 - walk * 1.5, 3, 2);
  }
  ctx.translate(0, -bob);
  ctx.fillStyle = pal.shirt; ctx.fillRect(-6, -19, 12, 12);
  ctx.fillStyle = pal.stripe; ctx.fillRect(-6, -15, 12, 1); ctx.fillRect(-6, -11, 12, 1); ctx.fillRect(-2, -19, 1, 12); ctx.fillRect(2, -19, 1, 12);
  ctx.fillStyle = '#5a3a20'; ctx.fillRect(-6, -9, 12, 2);
  ctx.fillStyle = '#e0a878';
  if (dir === 'l' || dir === 'r') {
    const s = dir === 'r' ? 1 : -1;
    ctx.fillRect(s * 2 - 1.5, -17 + walk, 3, 8);
    drawTool(ctx, toolId, s * 3, -9 + walk, s);
  } else {
    ctx.fillRect(-8, -17 - walk, 2.5, 8); ctx.fillRect(5.5, -17 + walk, 2.5, 8);
    if (dir === 'd') drawTool(ctx, toolId, 7, -9 + walk, 1);
  }
  ctx.fillStyle = '#e8b088'; ctx.fillRect(-4, -26, 8, 7);
  if (dir !== 'u') {
    ctx.fillStyle = '#2a1a10';
    if (dir === 'd') { ctx.fillRect(-2.5, -23, 1.5, 1.5); ctx.fillRect(1, -23, 1.5, 1.5); ctx.fillStyle = '#7a4a2a'; ctx.fillRect(-2, -20.5, 4, 1); }
    else ctx.fillRect(dir === 'r' ? 1.5 : -3, -23, 1.5, 1.5);
  }
  if (pal.hat === 'palha') {
    ctx.fillStyle = '#d8b860'; ctx.beginPath(); ctx.ellipse(0, -26, 9.5, 3.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8cc78'; ctx.fillRect(-5, -31, 10, 5);
    ctx.fillStyle = '#8a3a2a'; ctx.fillRect(-5, -27.5, 10, 1.5);
  } else {
    ctx.fillStyle = pal.cap; ctx.fillRect(-4.5, -29, 9, 4);
    if (dir === 'd') ctx.fillRect(-4, -26, 8, 1.5);
    else if (dir === 'r') ctx.fillRect(2, -26, 5, 1.5);
    else if (dir === 'l') ctx.fillRect(-7, -26, 5, 1.5);
  }
  if (dir === 'u') drawTool(ctx, toolId, -7, -10, -1);
  ctx.restore();
  if (label) {
    ctx.font = '7px system-ui, sans-serif'; ctx.textAlign = 'center';
    const tw = ctx.measureText(label).width + 6;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x - tw / 2, y - 44, tw, 10);
    ctx.fillStyle = '#fff'; ctx.fillText(label, x, y - 36.5);
  }
}

const TOOL_IDS = ['mao', 'enxada', 'machado', 'regador', 'plantar', 'construir', 'laco', 'adubo'];
function drawPlayer(ctx, g, now) {
  const p = g.player;
  const tool = TOOL_IDS[p.tool];
  if (p.mount?.kind === 'cavalo') {
    const h = g.animals.find(a => a.id === p.mount.id);
    if (h) {
      h.x = p.x; h.y = p.y; h.face = p.fx >= 0 ? 1 : -1;
      if (p.moving) h.step = p.step * 1.4;
      drawAnimal(ctx, h, now, false);
      const side = Math.abs(p.fx) < 0.2;
      drawFarmer(ctx, { ...p, fx: side ? h.face : p.fx, fy: side ? 0 : p.fy }, PAL_PLAYER, tool, -13);
      return;
    }
  }
  if (p.mount?.kind === 'trator') {
    const face = p.fx >= 0 ? 1 : -1;
    drawTractor(ctx, p.x * T, p.y * T, face);
    drawFarmer(ctx, { ...p, x: p.x - face * 0.12, fx: face, fy: 0 }, PAL_PLAYER, tool, -11);
    return;
  }
  drawFarmer(ctx, p, PAL_PLAYER, tool);
  if (p.sneak) { ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.fillText('🤫', p.x * T, p.y * T - 36); }
}
function drawWorker(ctx, k) {
  const tool = { regar: 'regador', colher: 'mao', tratar: 'regador' }[k.task];
  drawFarmer(ctx, k, PAL_WORKER[k.id % PAL_WORKER.length], tool, 0, k.name);
}
function drawTool(ctx, id, x, y, s) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, 1);
  switch (id) {
    case 'enxada': ctx.fillStyle = '#8a6038'; ctx.fillRect(0, -10, 1.5, 14); ctx.fillStyle = '#9aa0a8'; ctx.fillRect(-1, 3, 5, 2); break;
    case 'machado': ctx.fillStyle = '#8a6038'; ctx.fillRect(0, -8, 1.5, 11); ctx.fillStyle = '#b0b6be'; ctx.fillRect(1, -8, 4, 4); break;
    case 'regador': ctx.fillStyle = '#4a8a5a'; ctx.fillRect(-1, -2, 6, 5); ctx.fillRect(5, -3, 3, 1.5); break;
    case 'plantar': ctx.fillStyle = '#c8a870'; ctx.fillRect(-1, -2, 5, 5); break;
    case 'laco': ctx.strokeStyle = '#d9c38a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(3, -1, 3.5, 0, Math.PI * 2); ctx.stroke(); break;
    case 'construir': ctx.fillStyle = '#8a6038'; ctx.fillRect(0, -6, 1.5, 9); ctx.fillStyle = '#707680'; ctx.fillRect(-1, -7, 4, 3); break;
    case 'adubo': ctx.fillStyle = '#e8e0c8'; ctx.fillRect(-1, -3, 6, 6); break;
  }
  ctx.restore();
}
