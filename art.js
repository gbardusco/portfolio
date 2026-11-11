/* =====================================================================
   art.js — todos os recursos visuais em pixel art, gerados em código.
   Nada de imagens externas: sprites e cenários nascem de pixels num
   buffer RGBA (Uint32Array) e só depois viram <canvas>.
   Funciona no navegador e no Node (o Node é usado só para pré-visualizar).
   ===================================================================== */
(function (root) {
'use strict';

const W = 320, H = 180;           // resolução lógica dos cenários

/* ------------------------------------------------------------ cor ---- */
const _c = Object.create(null);
function C(hex) {
  if (typeof hex === 'number') return hex;
  let v = _c[hex];
  if (v === undefined) {
    let h = hex[0] === '#' ? hex.slice(1) : hex;
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h, 16);
    v = ((255 << 24) | ((n & 255) << 16) | (n & 0xff00) | ((n >> 16) & 255)) >>> 0;
    _c[hex] = v;
  }
  return v;
}
const pack = (r, g, b) => ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
function mix(a, b, t) {
  a = C(a); b = C(b);
  const ar = a & 255, ag = (a >> 8) & 255, ab = (a >> 16) & 255;
  const br = b & 255, bg = (b >> 8) & 255, bb = (b >> 16) & 255;
  return pack(Math.round(ar + (br - ar) * t), Math.round(ag + (bg - ag) * t), Math.round(ab + (bb - ab) * t));
}
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bay = (x, y) => (BAY[((y & 3) << 2) | (x & 3)] + 0.5) / 16;   // limiar 0..1

/* -------------------------------------------------------- Surface ---- */
class Surface {
  constructor(w, h, buf) { this.w = w; this.h = h; this.d = buf || new Uint32Array(w * h); }
  clear(c) { this.d.fill(c === undefined ? 0 : C(c)); return this; }
  get(x, y) { return (x < 0 || y < 0 || x >= this.w || y >= this.h) ? 0 : this.d[y * this.w + x]; }
  _s(x, y, c) { if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y * this.w + x] = c; }
  set(x, y, c) { this._s(Math.floor(x), Math.floor(y), C(c)); return this; }
  rect(x, y, w, h, c) {
    c = C(c);
    const x0 = Math.max(0, Math.floor(x)), x1 = Math.min(this.w, Math.floor(x + w));
    const y0 = Math.max(0, Math.floor(y)), y1 = Math.min(this.h, Math.floor(y + h));
    if (x1 <= x0) return this;
    for (let j = y0; j < y1; j++) this.d.fill(c, j * this.w + x0, j * this.w + x1);
    return this;
  }
  disc(cx, cy, r, c) {
    c = C(c); const r2 = r * r + r * 0.6;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++)
      if (dx * dx + dy * dy <= r2) this._s(Math.round(cx) + dx, Math.round(cy) + dy, c);
    return this;
  }
  ell(cx, cy, rx, ry, c) {
    c = C(c); cx = Math.round(cx); cy = Math.round(cy);
    const ax = rx + 0.5, ay = ry + 0.5;
    for (let y = cy - ry; y <= cy + ry; y++) for (let x = cx - rx; x <= cx + rx; x++) {
      const u = (x - cx) / ax, v = (y - cy) / ay;
      if (u * u + v * v <= 1) this._s(x, y, c);
    }
    return this;
  }
  line(x0, y0, x1, y1, c) {
    c = C(c); x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this._s(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
    return this;
  }
  poly(pts, c) {                                   // preenchimento por scanline (centro do pixel)
    c = C(c);
    let y0 = Infinity, y1 = -Infinity;
    for (const p of pts) { if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(this.h - 1, Math.ceil(y1)); y++) {
      const yc = y + 0.5, xs = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) xs.push(a[0] + (yc - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
      xs.sort((m, n) => m - n);
      for (let k = 0; k + 1 < xs.length; k += 2)
        for (let x = Math.ceil(xs[k] - 0.5); x < Math.ceil(xs[k + 1] - 0.5); x++) this._s(x, y, c);
    }
    return this;
  }
  dither(x, y, w, h, c, dens) {                    // preenche com densidade (0..1) em padrão Bayer
    c = C(c);
    for (let j = Math.floor(y); j < y + h; j++) for (let i = Math.floor(x); i < x + w; i++)
      if (bay(i, j) < dens) this._s(i, j, c);
    return this;
  }
  halo(cx, cy, r, c, dens) {                       // brilho radial pontilhado
    c = C(c);
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const d = Math.hypot(x - cx, y - cy) / r;
      if (d < 1 && bay(x, y) < (1 - d) * dens) this._s(x, y, c);
    }
    return this;
  }
  blit(src, x, y, o) {                             // cópia com transparência (+ espelho / pontilhado)
    o = o || {}; x = Math.round(x); y = Math.round(y);
    for (let j = 0; j < src.h; j++) {
      const yy = y + j; if (yy < 0 || yy >= this.h) continue;
      for (let i = 0; i < src.w; i++) {
        const c = src.d[j * src.w + (o.flip ? src.w - 1 - i : i)];
        if (!(c >>> 24)) continue;
        const xx = x + i; if (xx < 0 || xx >= this.w) continue;
        if (o.dither !== undefined && ((xx + yy) & 1) !== o.dither) continue;
        this.d[yy * this.w + xx] = o.tint !== undefined ? mix(c, o.tint, o.k) : c;
      }
    }
    return this;
  }
  toCanvas() {
    const cv = document.createElement('canvas');
    cv.width = this.w; cv.height = this.h;
    const cx = cv.getContext('2d'), id = cx.createImageData(this.w, this.h);
    new Uint32Array(id.data.buffer).set(this.d);
    cx.putImageData(id, 0, 0);
    return cv;
  }
}

/* blit com escala + rotação (vizinho mais próximo, centro como âncora) */
function blitT(dst, src, cx, cy, sc, ang, o) {
  o = o || {};
  const cs = Math.cos(ang), sn = Math.sin(ang), hw = src.w / 2, hh = src.h / 2;
  const R = Math.ceil(Math.hypot(hw, hh) * sc) + 1, X = Math.round(cx), Y = Math.round(cy);
  for (let dy = -R; dy <= R; dy++) {
    const y = Y + dy; if (y < 0 || y >= dst.h) continue;
    for (let dx = -R; dx <= R; dx++) {
      const x = X + dx; if (x < 0 || x >= dst.w) continue;
      let u = (dx * cs + dy * sn) / sc + hw; const v = (-dx * sn + dy * cs) / sc + hh;
      if (o.flip) u = src.w - u;
      const ui = Math.floor(u), vi = Math.floor(v);
      if (ui < 0 || vi < 0 || ui >= src.w || vi >= src.h) continue;
      const c = src.d[vi * src.w + ui];
      if (!(c >>> 24)) continue;
      if (o.dither !== undefined && ((x + y) & 1) !== o.dither) continue;
      dst.d[y * dst.w + x] = o.tint !== undefined ? mix(c, o.tint, o.k) : c;
    }
  }
}

/* contorno de 1px (devolve sprite 2px maior em cada eixo) */
function outlined(s, col) {
  col = C(col);
  const o = new Surface(s.w + 2, s.h + 2);
  o.blit(s, 1, 1);
  const m = o.d.slice();                           // máscara original (o contorno não pode se propagar)
  const at = (x, y) => (x < 0 || y < 0 || x >= o.w || y >= o.h) ? 0 : m[y * o.w + x] >>> 24;
  for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) {
    if (m[y * o.w + x]) continue;
    if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) o.d[y * o.w + x] = col;
  }
  return o;
}
/* copia a metade superior para baixo (espelho vertical) com remapeamento opcional */
function mirrorDown(src, dst, remap) {
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
    const c = src.d[y * src.w + x]; if (!(c >>> 24)) continue;
    dst._s(x, y, c);
    dst._s(x, 2 * src.h - 1 - y, remap && remap[c] !== undefined ? remap[c] : c);
  }
}
/* espelho horizontal da metade esquerda */
function mirrorRight(src, dst) {
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
    const c = src.d[y * src.w + x]; if (!(c >>> 24)) continue;
    dst._s(x, y, c); dst._s(2 * src.w - 1 - x, y, c);
  }
}
/* troca a cor das pontas de cada linha (realce de borda) */
function edgesRows(s, right, left) {
  for (let y = 0; y < s.h; y++) {
    let a = -1, b = -1;
    for (let x = 0; x < s.w; x++) if (s.d[y * s.w + x] >>> 24) { if (a < 0) a = x; b = x; }
    if (a >= 0) { if (right) s.d[y * s.w + b] = C(right); if (left) s.d[y * s.w + a] = C(left); }
  }
}

/* ------------------------------------------------------ A EPOCH ------ */
const EP = {
  K: '#140c2a',
  body: ['#fff0a8', '#f0cf5a', '#d9a93a', '#a8741f'],
  red: ['#ff8a6a', '#e0482e', '#c0392b', '#8e2a20'],
  wh: '#a9c2ff', wl: '#6f95ff', wm: '#2e56c9', wd: '#1f3a94', wk: '#16286e',
  cl: '#e6fbff', cm: '#8be9ff', cd: '#2a8fb0',
  ml: '#a0a0c0', mm: '#6a6a8a', md: '#3a3a52',
  fo: '#ff7a1f', fy: '#ffd24a', fw: '#fff6c8', fr: '#d8501a'
};

/* Vista lateral/superior (voa para a direita). 50x26 com contorno. */
let _side = null;
function epochSide() {
  if (_side) return _side;
  const w = 48, h = 12;
  const wing = new Surface(w, h), tail = new Surface(w, h), fus = new Surface(w, h);
  // asa principal (varrida para trás)
  wing.poly([[33, 8], [12, 0], [4, 0], [14, 8]], EP.wm);
  edgesRows(wing, EP.wl, EP.wd);
  for (let x = 0; x < w; x++) for (let y = 0; y < 2; y++) if (wing.get(x, y) >>> 24) wing.set(x, y, EP.red[y === 0 ? 2 : 1]);
  wing.line(29, 7, 18, 3, EP.wd);                       // linha de painel
  // estabilizador traseiro
  tail.poly([[12, 8], [6, 5], [1, 5], [5, 8]], EP.wm);
  edgesRows(tail, EP.wl, EP.wd);
  // fuselagem: contorno superior por coluna; cor por distância ao eixo
  for (let x = 0; x < w; x++) {
    const top = x < 6 ? 9 : x < 38 ? 8 : x < 41 ? 9 : x < 44 ? 10 : 11;
    for (let y = top; y < h; y++) {
      const dist = (h - 1) - y;
      const red = x >= 8 && x <= 11;
      fus.set(x, y, red ? EP.red[Math.min(3, dist)] : EP.body[Math.min(3, dist)]);
    }
  }
  for (let y = 8; y < h; y++) { fus.set(33, y, '#fff6c8'); fus.set(34, y, '#d9a93a'); }   // faixa branca
  // bocal do motor
  for (let y = 9; y < h; y++) { fus.set(0, y, EP.md); fus.set(1, y, EP.mm); fus.set(2, y, y === 9 ? EP.ml : EP.mm); }
  fus.set(0, 11, EP.fo); fus.set(0, 10, EP.fr);
  // cabine (4 linhas após espelhar)
  for (let x = 24; x <= 35; x++) fus.set(x, 11, EP.cm);
  for (let x = 26; x <= 33; x++) fus.set(x, 10, EP.cm);
  // monta a imagem completa
  const full = new Surface(w, h * 2);
  const dark = {};
  dark[C(EP.wl)] = C(EP.wm); dark[C(EP.wm)] = C(EP.wd); dark[C(EP.wd)] = C(EP.wk);
  dark[C(EP.red[2])] = C(EP.red[3]); dark[C(EP.red[1])] = C(EP.red[2]);
  mirrorDown(wing, full, dark);
  mirrorDown(tail, full, dark);
  mirrorDown(fus, full);
  for (let x = 24; x <= 35; x++) { full.set(x, 12, EP.cd); }
  for (let x = 26; x <= 33; x++) { full.set(x, 13, EP.cd); }
  full.set(27, 10, EP.cl); full.set(28, 10, EP.cl); full.set(26, 11, EP.cl); full.set(29, 10, EP.cl);
  full.set(35, 11, EP.cl); full.set(34, 12, EP.cm);
  const spr = outlined(full, EP.K);                // 50x26

  // chamas (3 quadros) — saem pela esquerda do bocal
  const flame = [0, 1, 2].map(function (f) {
    const len = [9, 13, 7][f], fh = 8, s = new Surface(len, fh), r = rng(40 + f);
    for (let k = 0; k < len; k++) {
      const hh = Math.max(1, Math.round(3.6 * Math.pow(1 - k / len, 0.75)));
      for (let dy = -hh; dy < hh; dy++) {
        const y = 4 + dy, ad = Math.min(Math.abs(dy), Math.abs(dy + 1));
        let col = EP.fr;
        if (ad < hh - 1) col = EP.fo;
        if (ad < hh - 1 && k < len * 0.62) col = EP.fy;
        if (ad < 1 && k < len * 0.32) col = EP.fw;
        if (k > len * 0.7 && r() < 0.35) continue;
        s._s(len - 1 - k, y, C(col));
      }
    }
    return s;
  });
  _side = { spr: spr, flame: flame, w: spr.w, h: spr.h, noseX: spr.w, midY: spr.h / 2 };
  return _side;
}

/* Vista traseira (voa para dentro do túnel). 36x27 + folga de 4px p/ brilho; 3 quadros de chama. */
let _rear = null;
function epochRear() {
  if (_rear) return _rear;
  const hw = 18, h = 27, half = new Surface(hw, h);
  // asa esquerda + ponteira (winglet)
  half.poly([[13, 13], [0, 8], [0, 12], [13, 20]], EP.wm);
  edgesRows(half, null, null);
  half.line(13, 13, 1, 8, EP.wl); half.line(12, 14, 2, 9, EP.wh);
  half.line(13, 20, 1, 12, EP.wd);
  half.rect(0, 3, 2, 10, EP.wm); half.rect(0, 3, 1, 9, EP.wl); half.rect(0, 3, 2, 2, EP.red[2]);
  // estabilizador horizontal
  half.poly([[13, 21], [5, 19], [5, 22], [13, 25]], EP.wd); half.line(13, 21, 6, 19, EP.wm);
  // fuselagem (cápsula)
  const HW = { 6: 2, 7: 4, 8: 5, 24: 5, 25: 3 };
  for (let y = 6; y <= 25; y++) {
    const half_w = HW[y] !== undefined ? HW[y] : 6;
    for (let x = 18 - half_w; x < hw; x++) {
      const d = 17 - x;
      half.set(x, y, EP.body[d <= 1 ? 0 : d <= 3 ? 1 : d === 4 ? 2 : 3]);
    }
  }
  // faixa vermelha na traseira
  for (let x = 13; x < hw; x++) half.set(x, 17, EP.red[2]), half.set(x, 18, EP.red[3]);
  // cabine
  for (let y = 8; y <= 14; y++) {
    const x0 = y === 8 ? 16 : y === 14 ? 15 : 14;
    for (let x = x0; x < hw; x++) half.set(x, y, y >= 13 ? EP.cd : EP.cm);
  }
  half.set(15, 10, EP.cl); half.set(15, 11, EP.cl); half.set(16, 9, EP.cl);
  // deriva vertical (centro)
  for (let y = 0; y <= 15; y++) half.set(17, y, EP.wm);
  for (let y = 0; y <= 2; y++) half.set(17, y, EP.red[1]);
  const full = new Surface(36, h);
  mirrorRight(half, full);
  for (let y = 3; y <= 15; y++) full.set(17, y, EP.wl);           // realce da deriva
  for (let y = 0; y <= 2; y++) full.set(17, y, EP.red[0]);
  // bocal do motor (octógono)
  const rows = [[16, 19], [14, 21], [14, 21], [14, 21], [14, 21], [14, 21], [16, 19]];
  rows.forEach(function (r, i) {
    for (let x = r[0]; x <= r[1]; x++) full.set(x, 18 + i, (x === r[0] || x === r[1] || i === 0 || i === 6) ? EP.md : EP.mm);
  });
  for (let y = 20; y <= 22; y++) for (let x = 16; x <= 19; x++) full.set(x, y, '#2a1210');
  const base = outlined(full, EP.K);               // 38x29
  const pad = 5, frames = [];
  for (let f = 0; f < 3; f++) {
    const s = new Surface(base.w + pad * 2, base.h + pad * 2);
    const cx = pad + 18 + 1, cy = pad + 21 + 1;     // centro do bocal
    const r = [3, 5, 4][f];
    s.halo(cx, cy, r + 5, EP.fo, 0.9);
    s.blit(base, pad, pad);
    s.disc(cx, cy, r - 1, EP.fo); s.disc(cx, cy, Math.max(1, r - 2), EP.fy);
    s.rect(cx - 1, cy - 1, 2, 2, EP.fw);
    frames.push(s);
  }
  _rear = { frames: frames, w: frames[0].w, h: frames[0].h };
  return _rear;
}

/* ----------------------------------------------- helpers de cenário -- */
function skyBands(s, y0, y1, top, bot, n) {
  top = C(top); bot = C(bot);
  if (y0 === 0) s.d.fill(bot);                      // nada de pixel transparente na base
  const cols = []; for (let i = 0; i <= n; i++) cols.push(mix(top, bot, i / n));
  const span = Math.max(1, y1 - y0 - 1);
  for (let y = y0; y < y1; y++) {
    const v = ((y - y0) / span) * n, i0 = Math.floor(v), f = v - i0;
    for (let x = 0; x < s.w; x++) s.d[y * s.w + x] = cols[Math.min(n, f > bay(x, y) ? i0 + 1 : i0)];
  }
}
/* dissolve progressivamente para uma cor entre y0 e y1 (garante a cor exata embaixo) */
function fadeTo(s, y0, y1, col) {
  col = C(col);
  for (let y = y0; y < s.h; y++) {
    const dens = y >= y1 ? 1 : (y - y0) / (y1 - y0);
    for (let x = 0; x < s.w; x++) if (dens >= 1 || bay(x, y) < dens) s.d[y * s.w + x] = col;
  }
}
function blob(s, cx, cy, rx, ry, col, dens) {
  col = C(col);
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
    const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
    if (d < 1 && bay(x, y) < (1 - d) * dens * 1.6) s._s(x, y, col);
  }
}
/* silhueta com contorno de luz no topo */
function sil(dst, fn, col, rim) {
  const t = new Surface(dst.w, dst.h);
  fn(t, C(col));
  if (rim) {
    rim = C(rim);
    for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++)
      if (t.d[y * t.w + x] && (y === 0 || !t.d[(y - 1) * t.w + x])) t.d[y * t.w + x] = rim;
  }
  dst.blit(t, 0, 0);
}
/* crista irregular (montanhas / colinas) preenchida até baixo */
function ridge(s, R, base, amp, step, col, rim, bottom, smooth) {
  col = C(col);
  const pts = [];
  for (let x = 0; x <= s.w + step; x += step) pts.push(base - (smooth ? (Math.sin(x * smooth + base) * 0.5 + 0.5) * amp : R() * amp));
  for (let x = 0; x < s.w; x++) {
    const i = Math.floor(x / step), f = (x % step) / step;
    const y = Math.round(pts[i] + (pts[i + 1] - pts[i]) * f);
    s.rect(x, y, 1, (bottom || s.h) - y, col);
    if (rim) s.set(x, y, rim);
  }
}
function cloud(s, x, y, w, h, body, shade, hi) {
  const t = new Surface(s.w, s.h), n = Math.max(2, Math.round(w / 9)), R = rng(x * 31 + y);
  for (let i = 0; i < n; i++) {
    const r = Math.round(h * (0.45 + R() * 0.5)), cx = x + Math.round((i + 0.5) * w / n);
    t.disc(cx, y + h - r, r, body);
  }
  t.rect(x - 2, y + h, w + 4, 6, 0);               // base reta
  for (let j = 0; j < t.h; j++) for (let i = 0; i < t.w; i++) {
    if (!t.d[j * t.w + i]) continue;
    if (j >= y + h - 2) t.d[j * t.w + i] = C(shade);
    else if (!t.get(i, j - 1)) t.d[j * t.w + i] = C(hi);
  }
  s.blit(t, 0, 0);
}
function tree(s, x, y, r, dk, md, lt, trunk) {
  const th = Math.round(r * 1.1);
  s.rect(x - 1, y - th, 3, th, trunk);
  const cy = y - th - Math.round(r * 0.7);
  s.disc(x, cy, r, dk); s.disc(x - 1, cy - 1, r - 1, md);
  s.disc(x - 2, cy - 2, Math.max(1, r - 3), lt);
  for (let i = 0; i < r; i++) s.set(x + r - 2 - (i % 3), cy + 1 + i - r / 2, dk);
}
function grass(s, R, y0, y1, cols, n) {
  for (let i = 0; i < n; i++) {
    const x = Math.floor(R() * s.w), y = y0 + Math.floor(R() * (y1 - y0)), c = cols[Math.floor(R() * cols.length)];
    s.set(x, y, c); if (R() < 0.6) s.set(x, y - 1, c);
  }
}

/* ------------------------------------------------------- CENÁRIOS ---- */
/* Cada cenário devolve { base: Surface, fx: [{ s: Surface, cls: string }] }.
   p = { top, bot, ground } (cores lidas do CSS da era).                 */

function sceneEnd(p, o) {
  const R = rng(7), s = new Surface(W, H), fx = [], dock = (o && o.dock) || 1;
  skyBands(s, 0, 160, p.top, p.bot, 9);
  blob(s, 60, 40, 60, 24, '#2c2068', 0.5); blob(s, 255, 62, 70, 28, '#35246f', 0.5); blob(s, 170, 112, 100, 22, '#281c5e', 0.45);
  const sc = ['#ffffff', '#cfdcff', '#ffe9a8', '#9fb4ff'];
  for (let i = 0; i < 130; i++) s.set(R() * W, R() * 135, sc[Math.floor(R() * sc.length)]);
  for (let i = 0; i < 16; i++) {
    const x = Math.floor(R() * W), y = 4 + Math.floor(R() * 110);
    s.set(x, y, '#ffffff'); s.set(x - 1, y, '#9fb4ff'); s.set(x + 1, y, '#9fb4ff'); s.set(x, y - 1, '#9fb4ff'); s.set(x, y + 1, '#9fb4ff');
  }
  // plataforma de pedra flutuante
  s.ell(160, 148, 168, 7, '#5a5a92');
  s.ell(160, 147, 166, 5, '#7676b4');
  for (let x = 0; x < W; x++) { const hh = Math.round(7 * Math.sqrt(Math.max(0, 1 - Math.pow((x - 160) / 168.5, 2)))); if (hh > 0) s.set(x, 148 - hh + 1, '#a4a4dc'); }
  s.rect(0, 148, W, 14, '#34335f');
  for (let y = 148; y < 162; y += 5) {
    s.rect(0, y, W, 1, '#2a2950');
    for (let x = ((y / 5) & 1) * 7; x < W; x += 14) s.rect(x, y, 1, 5, '#2a2950');
  }
  for (let x = 0; x < W; x++) if (R() < 0.18) s.set(x, 149 + Math.floor(R() * 12), '#46458a');
  s.rect(0, 148, W, 1, '#5a5a92');
  // poste de luz
  s.halo(197, 100, 30, '#ffd24a', 0.5);
  s.rect(196, 106, 2, 40, '#6b6b8f'); s.rect(196, 106, 1, 40, '#9a9ac4');
  s.rect(193, 143, 8, 3, '#4a4a74'); s.rect(194, 141, 6, 2, '#6b6b8f');
  s.rect(191, 98, 12, 3, '#3a3a5a'); s.rect(192, 101, 10, 6, '#ffe27a'); s.rect(193, 102, 8, 4, '#fff6c8');
  s.rect(191, 101, 1, 6, '#3a3a5a'); s.rect(202, 101, 1, 6, '#3a3a5a'); s.rect(191, 107, 12, 1, '#3a3a5a');
  s.poly([[190, 98], [204, 98], [197, 92]], '#3a3a5a');
  // Epoch estacionada (camada própria: some quando ela decola). dock<0 = proa à esquerda
  const e = epochSide(), park = new Surface(W, H);
  park.ell(258, 150, 20, 3, '#242450'); park.dither(236, 147, 44, 7, '#1a1a3c', 0.5);
  park.blit(e.spr, 232, 120, { flip: dock < 0 });
  // herói
  s.blit(hero(), 214, 124);
  // dissolve na névoa
  fadeTo(s, 152, 172, p.ground);
  // coluna de luz (camada animada)
  const b = new Surface(W, H);
  for (let y = 0; y < 146; y++) {
    const fade = Math.min(1, (146 - y) / 40);
    for (let x = 34; x < 58; x++) {
      const d = Math.abs(x - 46) / 12;
      if (d < 0.35) b._s(x, y, C('#e8fbff'));
      else if (d < 0.7) { if (bay(x, y) < 0.8 * fade + 0.2) b._s(x, y, C('#7ad0ff')); }
      else if (d < 1 && bay(x, y) < 0.35 * fade) b._s(x, y, C('#4a8cff'));
    }
  }
  b.ell(46, 146, 14, 3, '#e8fbff');
  fx.push({ s: park, cls: 'park' });
  fx.push({ s: b, cls: 'beam' });
  return { base: s, fx: fx };
}

/* pequeno herói (sprite de 14x22, simétrico) */
let _hero = null;
function hero() {
  if (_hero) return _hero;
  const pal = { K: '#140c2a', h: '#8a4b2a', H: '#c0703a', s: '#f6c9a0', S: '#d8a070', e: '#140c2a', t: '#2e56c9', T: '#6f95ff', b: '#c0392b', p: '#3a3a6a', f: '#5a3a2a', w: '#ffffff' };
  const L = [          // metade esquerda (7 colunas); a coluna 6 é a mais próxima do eixo
    '.....hh',
    '..h.hHH',
    '.hhhhHh',
    '.hhhhhh',
    'hhhhhhh',
    'hhssssh',
    '.hsssss',
    '.hseSes',
    '..sssss',
    '..sSsss',
    '...ssSS',
    '..bbbbb',
    '.tTtttt',
    '.tTtttt',
    's.tttbb',
    's.tttbb',
    'S.ttttt',
    '..ppppp',
    '...ppp.',
    '...ppp.',
    '..ffff.',
    '..ffff.'
  ];                  // pernas nas colunas 3-5; a coluna 6 (e o espelho) fica vazia = vão central, só 2 pernas
  const half = new Surface(7, L.length);
  L.forEach(function (row, y) { for (let x = 0; x < 7; x++) { const ch = row[x]; if (ch !== '.') half.set(x, y, pal[ch]); } });
  const full = new Surface(14, L.length);
  mirrorRight(half, full);
  _hero = outlined(full, pal.K);
  return _hero;
}

function scenePrehist(p) {
  const R = rng(11), s = new Surface(W, H), fx = [];
  skyBands(s, 0, 130, p.top, p.bot, 12);
  s.halo(74, 100, 50, '#ffb070', 0.7);
  s.disc(74, 100, 25, '#ffbf6a'); s.disc(74, 100, 20, '#ffd98a'); s.disc(74, 100, 13, '#fff0b8');
  // pterodáctilos
  [[40, 36, 1], [58, 46, 1], [236, 26, -1], [262, 40, -1], [150, 20, 1]].forEach(function (a) {
    const x = a[0], y = a[1], d = a[2], c = '#3a1426';
    s.set(x, y, c); s.set(x + d, y, c); s.set(x - d, y - 1, c); s.set(x - 2 * d, y - 2, c); s.set(x - 3 * d, y - 2, c);
    s.set(x + d, y - 1, c); s.set(x + 2 * d, y - 2, c); s.set(x + 3 * d, y - 2, c); s.set(x + 4 * d, y - 1, c); s.set(x + 2 * d, y, c);
  });
  ridge(s, R, 114, 30, 14, '#a23c48', '#d05a52', 140);
  ridge(s, R, 122, 20, 11, '#6e2638', '#9a3a48', 146);
  // vulcão
  const vx = 254, vt = 56, vb = 140;
  s.poly([[vx - 8, vt], [vx + 8, vt], [vx + 66, vb], [vx - 72, vb]], '#2e0f22');
  s.poly([[vx - 8, vt], [vx + 1, vt], [vx - 4, vb], [vx - 72, vb]], '#5a2238');
  s.poly([[vx - 8, vt], [vx - 3, vt], [vx - 22, vb], [vx - 72, vb]], '#7a3042');
  s.halo(vx, vt - 2, 26, '#ff5a1f', 0.8);
  s.rect(vx - 8, vt - 1, 16, 2, '#ff5a1f'); s.rect(vx - 5, vt - 2, 10, 1, '#ffb347');
  [[-3, 1], [2, 1], [-6, 2], [5, 2]].forEach(function (a, i) {
    let x = vx + a[0], y = vt + 1;
    for (let k = 0; k < 26 + i * 6; k++) { s.set(x, y, k % 5 === 4 ? '#ffb347' : '#ff7a3a'); y++; if (R() < 0.5) x += a[1] * (R() < 0.6 ? 1 : 0); }
  });
  // saurópode em silhueta
  sil(s, function (t, c) {
    const x = 150, y = 138;
    t.ell(x, y - 24, 21, 10, c);
    t.poly([[x + 12, y - 30], [x + 20, y - 30], [x + 31, y - 68], [x + 26, y - 70]], c);
    t.ell(x + 30, y - 70, 6, 3, c); t.rect(x + 34, y - 69, 3, 2, c);
    t.poly([[x - 17, y - 30], [x - 20, y - 18], [x - 58, y - 8], [x - 22, y - 32]], c);
    [-15, -7, 7, 15].forEach(function (o) { t.rect(x + o - 2, y - 17, 5, 17, c); });
  }, '#2a0f20', '#8a3a48');
  ridge(s, R, 134, 8, 9, '#3a7a3a', '#5c9c48', 150, 0.06);
  ridge(s, R, 146, 6, 7, p.ground, '#3a7040', H, 0.09);
  s.rect(0, 160, W, 20, p.ground);
  grass(s, R, 150, 180, ['#2f6a35', '#3d8a4a', '#14381f'], 160);
  // samambaias / cicadáceas
  [[26, 168], [118, 172], [214, 170], [296, 166]].forEach(function (a) {
    const x = a[0], y = a[1];
    s.rect(x - 1, y - 12, 3, 12, '#14381f'); s.rect(x, y - 12, 1, 12, '#3a2a1a');
    for (let k = -4; k <= 4; k++) {
      const ang = k * 0.38 - Math.PI / 2, len = 14 - Math.abs(k);
      for (let t = 1; t <= len; t++) {
        const px = x + Math.cos(ang) * t * 1.1, py = y - 12 + Math.sin(ang) * t * 0.7 + (t * t) / (len * 1.6);
        s.set(px, py, t % 4 === 0 ? '#5cae5c' : '#1f5a2a');
      }
    }
  });
  // fumaça (camada animada): coluna que sobe, balança e se espalha em bigorna
  const f = new Surface(W, H);
  const puffs = [];
  for (let i = 0; i < 15; i++) puffs.push([vx + Math.round(Math.sin(i * 0.8) * 5) + i, vt - 4 - i * 3.6, 4 + Math.floor(i * 0.75)]);
  [[-26, 0, 11], [-12, -3, 13], [6, -2, 14], [22, 1, 12], [34, 3, 9]].forEach(function (a) { puffs.push([vx + 12 + a[0], 8 + a[1], a[2]]); });
  puffs.forEach(function (q, i) { f.disc(q[0], q[1], q[2], i % 2 ? '#3e1c2e' : '#35172a'); });
  puffs.forEach(function (q, i) { f.disc(q[0] - 1, q[1] - 2, Math.max(1, q[2] - 2), i % 2 ? '#5c2c3e' : '#52263a'); });
  puffs.forEach(function (q) { f.disc(q[0] - 2, q[1] - 3, Math.max(1, q[2] - 5), '#7a4052'); });
  fx.push({ s: f, cls: 'cloud-drift' });
  return { base: s, fx: fx };
}

function sceneMedieval(p) {
  const R = rng(23), s = new Surface(W, H), fx = [];
  skyBands(s, 0, 125, p.top, p.bot, 10);
  ridge(s, R, 112, 18, 16, '#8fb8d8', '#b4d4ea', 150, 0.04);
  ridge(s, R, 122, 10, 12, '#6aa8a0', '#8cc4b4', 150, 0.05);
  // colina do castelo
  const cx = 236;
  for (let x = cx - 70; x < cx + 70; x++) {
    const y = Math.round(126 - 26 * Math.exp(-Math.pow((x - cx) / 34, 2)));
    s.rect(x, y, 1, 150 - y, '#5d9a4c'); s.set(x, y, '#86c06a');
  }
  // castelo
  const stone = '#aab3c9', shade = '#838ca8', dark = '#5e6784', roof = '#2e56c9', roofL = '#6f95ff';
  function battle(x0, x1, y) { for (let x = x0; x < x1; x += 4) { s.rect(x, y - 3, 2, 3, stone); s.rect(x, y - 3, 1, 3, '#c8d0e2'); } }
  function tower(x, w, top, base, roofH) {
    s.rect(x, top, w, base - top, stone); s.rect(x + w - 3, top, 3, base - top, shade); s.rect(x, top, 1, base - top, '#c8d0e2');
    battle(x - 1, x + w + 1, top);
    s.rect(x - 1, top, w + 2, 1, dark);
    if (roofH) {
      s.poly([[x - 2, top - 3], [x + w + 2, top - 3], [x + w / 2, top - 3 - roofH]], roof);
      s.poly([[x - 2, top - 3], [x + w / 2, top - 3], [x + w / 2, top - 3 - roofH]], roofL);
      s.rect(x + Math.floor(w / 2), top - 6 - roofH, 1, 5, '#2a1a3a'); s.rect(x + Math.floor(w / 2) + 1, top - 6 - roofH, 4, 3, '#d8402a');
    }
  }
  s.rect(cx - 46, 92, 92, 36, stone); s.rect(cx - 46, 92, 92, 3, shade); battle(cx - 46, cx + 46, 92);
  for (let y = 96; y < 128; y += 4) for (let x = cx - 46 + ((y / 4) & 1) * 3; x < cx + 46; x += 6) s.set(x, y, shade);
  tower(cx - 40, 14, 70, 128, 14); tower(cx + 26, 14, 70, 128, 14);
  tower(cx - 16, 32, 74, 128, 0); tower(cx - 7, 14, 46, 74, 20);
  s.rect(cx - 5, 120, 10, 8, '#4a3a2a'); s.disc(cx, 120, 5, '#4a3a2a'); s.rect(cx - 1, 116, 2, 12, '#2a1a12');
  [[cx - 34, 84], [cx + 32, 84], [cx - 2, 58], [cx - 10, 100], [cx + 8, 100], [cx - 30, 104], [cx + 28, 104]].forEach(function (a) { s.rect(a[0], a[1], 2, 5, '#2a3556'); });
  s.rect(cx - 46, 126, 92, 2, dark);
  // colinas frontais
  ridge(s, R, 138, 9, 14, '#4c8a40', '#7ab85a', 160, 0.05);
  ridge(s, R, 150, 7, 10, p.ground, '#5aa04a', H, 0.07);
  s.rect(0, 164, W, 16, p.ground);
  // caminho
  s.poly([[cx - 4, 128], [cx + 4, 128], [cx + 40, 180], [cx - 50, 180]], '#c4a574');
  s.poly([[cx - 4, 128], [cx + 1, 128], [cx - 8, 180], [cx - 50, 180]], '#b09060');
  for (let i = 0; i < 40; i++) s.set(cx - 30 + R() * 60, 140 + R() * 40, '#8a6a40');
  // árvores e flores
  [[30, 150, 9], [60, 156, 7], [118, 148, 6], [296, 152, 8], [182, 156, 6]].forEach(function (a) { tree(s, a[0], a[1], a[2], '#2f6a35', '#4c8a40', '#7ab85a', '#5a3a2a'); });
  grass(s, R, 150, 180, ['#3a6a30', '#6aa850', '#5a9a46'], 150);
  for (let i = 0; i < 40; i++) { const x = Math.floor(R() * W), y = 162 + Math.floor(R() * 18); s.set(x, y, R() < 0.5 ? '#ffe45a' : '#ffffff'); }
  const f = new Surface(W, H);
  [[30, 20, 56, 12], [160, 36, 44, 10], [250, 14, 52, 12], [90, 58, 36, 8]].forEach(function (a) { cloud(f, a[0], a[1], a[2], a[3], '#ffffff', '#c9dff2', '#ffffff'); });
  fx.push({ s: f, cls: 'cloud-drift' });
  return { base: s, fx: fx };
}

function scenePresent(p) {
  const R = rng(31), s = new Surface(W, H), fx = [];
  skyBands(s, 0, 128, p.top, p.bot, 10);
  ridge(s, R, 112, 16, 18, '#a8dca8', '#c8eec0', 150, 0.04);
  ridge(s, R, 122, 10, 12, '#7ccb7c', '#a0e090', 150, 0.05);
  // vilarejo distante
  [[40, 118], [58, 120], [76, 117], [200, 118], [222, 120], [300, 118]].forEach(function (a) {
    s.rect(a[0], a[1], 9, 7, '#f4efe0'); s.poly([[a[0] - 1, a[1]], [a[0] + 10, a[1]], [a[0] + 4.5, a[1] - 5]], a[0] % 2 ? '#c0392b' : '#2e56c9'); s.rect(a[0] + 3, a[1] + 3, 2, 4, '#5a3a2a');
  });
  ridge(s, R, 136, 9, 14, '#58b05a', '#86d870', 160, 0.05);
  ridge(s, R, 148, 6, 10, p.ground, '#62c05a', H, 0.07);
  s.rect(0, 160, W, 20, p.ground);
  // casa grande
  const hx = 258, hy = 150;
  s.ell(hx + 20, hy + 1, 30, 3, '#2a6a30');
  s.rect(hx, hy - 36, 40, 36, '#f4efe0'); s.rect(hx + 32, hy - 36, 8, 36, '#d6ccb2'); s.rect(hx, hy - 36, 40, 1, '#ffffff');
  s.poly([[hx - 5, hy - 36], [hx + 45, hy - 36], [hx + 20, hy - 58]], '#c0392b');
  s.poly([[hx - 5, hy - 36], [hx + 20, hy - 36], [hx + 20, hy - 58]], '#e0583f');
  s.rect(hx - 5, hy - 37, 50, 2, '#8e2a20');
  s.rect(hx + 30, hy - 64, 6, 14, '#8a4a3a'); s.rect(hx + 30, hy - 64, 6, 2, '#5a2a22');
  s.rect(hx + 16, hy - 24, 9, 24, '#5a3a2a'); s.rect(hx + 16, hy - 24, 9, 1, '#3a2418'); s.set(hx + 22, hy - 12, '#ffd24a');
  [[hx + 4, hy - 28], [hx + 29, hy - 28]].forEach(function (a) { s.rect(a[0], a[1], 8, 9, '#3a2418'); s.rect(a[0] + 1, a[1] + 1, 6, 7, '#8be9ff'); s.rect(a[0] + 1, a[1] + 1, 3, 3, '#e6fbff'); s.rect(a[0] + 3, a[1] + 1, 1, 7, '#3a2418'); });
  // cerca
  for (let x = 196; x < 250; x += 6) { s.rect(x, hy - 9, 2, 10, '#c9a878'); s.rect(x, hy - 9, 1, 10, '#e4cc9a'); }
  s.rect(196, hy - 6, 52, 2, '#b08c5c');
  // árvores
  [[26, 156, 12], [70, 162, 8], [150, 154, 7], [180, 160, 6], [310, 158, 7]].forEach(function (a) { tree(s, a[0], a[1], a[2], '#2f8a3a', '#4aae4a', '#8ae070', '#6a4a2a'); });
  // trilha
  s.poly([[hx + 14, hy], [hx + 26, hy], [hx + 40, 180], [hx - 30, 180]], '#d8c08c');
  s.poly([[hx + 14, hy], [hx + 19, hy], [hx - 4, 180], [hx - 30, 180]], '#c4a874');
  grass(s, R, 152, 180, ['#2f7a35', '#6ac060', '#58b05a'], 150);
  for (let i = 0; i < 50; i++) { const x = Math.floor(R() * W), y = 160 + Math.floor(R() * 20); s.set(x, y, ['#ffe45a', '#ffffff', '#ff7aa8'][Math.floor(R() * 3)]); }
  const f = new Surface(W, H);
  [[20, 16, 60, 12], [140, 30, 48, 10], [230, 12, 56, 12], [70, 56, 34, 8], [190, 62, 30, 7]].forEach(function (a) { cloud(f, a[0], a[1], a[2], a[3], '#ffffff', '#cfe6f6', '#ffffff'); });
  fx.push({ s: f, cls: 'cloud-drift' });
  return { base: s, fx: fx };
}

function sceneZeal(p) {
  const R = rng(47), s = new Surface(W, H), fx = [];
  skyBands(s, 0, 140, p.top, p.bot, 12);
  for (let i = 0; i < 90; i++) s.set(R() * W, R() * 95, ['#ffffff', '#cfc4ff', '#9fb4ff'][Math.floor(R() * 3)]);
  s.halo(70, 56, 50, '#cfc4ff', 0.6); s.disc(70, 56, 24, '#e6dcff'); s.disc(70, 56, 20, '#f4eeff');
  s.disc(78, 52, 18, '#e0d4ff'); s.rect(52, 46, 6, 1, '#cfc4ff'); s.rect(60, 60, 10, 1, '#cfc4ff');
  function island(cx, cy, rx, hh, tower) {
    for (let y = 0; y < hh; y++) {
      const k = 1 - Math.pow(y / hh, 1.25), half = Math.max(1, Math.round(rx * k));
      for (let x = cx - half; x <= cx + half; x++) {
        const lit = (x - cx) < -half * 0.2;
        s.set(x, cy + 3 + y, (y % 7 === 6 || bay(x, y) < 0.18) ? '#4a3a98' : lit ? '#8a78d8' : '#6a58b8');
      }
    }
    s.ell(cx, cy, rx, 4, '#c9bcff'); s.ell(cx, cy - 1, rx - 2, 3, '#e8e1ff');
    s.rect(cx - rx + 4, cy - 3, rx * 2 - 8, 1, '#ffffff');
    if (tower) {
      const tx = cx - 4, ty = cy - 4;
      s.rect(tx, ty - 18, 9, 18, '#f2eeff'); s.rect(tx + 6, ty - 18, 3, 18, '#cfc6f5'); s.rect(tx, ty - 18, 1, 18, '#ffffff');
      s.rect(tx - 2, ty - 20, 13, 3, '#4a6aff'); s.disc(tx + 4, ty - 21, 5, '#4a6aff'); s.disc(tx + 3, ty - 22, 3, '#7a96ff');
      s.rect(tx + 4, ty - 32, 1, 6, '#cfc6f5');
      s.rect(tx + 3, ty - 12, 3, 5, '#4a6aff');
      s.halo(tx + 4, ty - 34, 8, '#7af0ff', 0.9);
      s.poly([[tx + 4, ty - 40], [tx + 7, ty - 35], [tx + 4, ty - 30], [tx + 1, ty - 35]], '#7af0ff');
      s.set(tx + 3, ty - 37, '#ffffff');
    }
  }
  island(230, 66, 40, 34, true); island(150, 100, 22, 22, false); island(300, 108, 26, 24, true); island(34, 112, 30, 26, false);
  for (let y = 70; y < 146; y++) { if (y % 3) { s.set(212, y, '#bfe8ff'); s.set(213, y, '#e6fbff'); } }   // cachoeira
  // mar de nuvens
  const base = p.ground, lt = '#e2daff', sh = '#9b8aee';
  for (let i = 0; i < 44; i++) {
    const cx = i * 8 - 6 + Math.round(R() * 5), r = 7 + Math.floor(R() * 9), cy = 150 + Math.round(R() * 8);
    s.disc(cx, cy - r + 4, r, lt);
  }
  s.rect(0, 154, W, H - 154, base);
  for (let x = 0; x < W; x++) for (let y = 154; y < 168; y++) if (bay(x, y) < (168 - y) / 14 * 0.7) s.set(x, y, sh);
  for (let i = 0; i < 40; i++) s.set(R() * W, 160 + R() * 20, '#cfc4ff');
  s.rect(0, 172, W, 8, base);
  const f = new Surface(W, H);
  [[30, 80, 50, 9], [200, 126, 60, 10], [96, 134, 40, 8]].forEach(function (a) { cloud(f, a[0], a[1], a[2], a[3], '#efe9ff', '#b9a8ff', '#ffffff'); });
  fx.push({ s: f, cls: 'cloud-drift' });
  return { base: s, fx: fx };
}

function sceneFuture(p) {
  const R = rng(59), s = new Surface(W, H), fx = [];
  skyBands(s, 0, 130, p.top, p.bot, 10);
  s.halo(240, 40, 36, '#3ff0c8', 0.35); s.disc(240, 40, 14, '#16302e'); s.disc(238, 38, 11, '#1f4440');
  for (let i = 0; i < 70; i++) s.set(R() * W, R() * 60, ['#9fffe8', '#ffffff', '#5a8a8a'][Math.floor(R() * 3)]);
  const neon = ['#3ff0c8', '#3ff0c8', '#ffb347', '#ff4fd8'];
  function skyline(base, minH, maxH, col, lit, n) {
    let x = -4;
    while (x < W) {
      const w = 10 + Math.floor(R() * 18), h = minH + Math.floor(R() * (maxH - minH)), y = base - h;
      const ruin = R() < 0.6;
      for (let k = 0; k < w; k += 2) { const j = ruin ? Math.floor(R() * 7) : 0; s.rect(x + k, y + j, 2, h + 2 - j, col); }
      if (R() < 0.3) s.rect(x + Math.floor(w / 2), y - 12, 1, 12, col);
      if (lit) for (let wy = y + 5; wy < base - 4; wy += 5) for (let wx = x + 2; wx < x + w - 2; wx += 4)
        if (s.get(wx, wy) && R() < 0.22) { const c = neon[Math.floor(R() * neon.length)]; s.rect(wx, wy, 2, 2, c); if (R() < 0.3) s.halo(wx, wy, 4, c, 0.4); }
      x += w + Math.floor(R() * 3);
    }
  }
  skyline(128, 24, 52, '#0e1a1c', false); skyline(136, 22, 60, '#0a1214', true);
  // cúpula
  s.ell(40, 142, 40, 28, '#16282a');
  for (let x = 0; x < 80; x++) for (let y = 110; y < 140; y++) if (s.get(x, y) === C('#16282a') && R() < 0.05) s.set(x, y, '#3ff0c8');
  s.line(14, 126, 26, 114, '#05060d'); s.line(26, 114, 22, 108, '#05060d'); s.ell(52, 124, 6, 4, '#05060d');
  s.dither(2, 112, 76, 14, '#1f4440', 0.15);
  // letreiro neon com gráfico de barras (o ZeroCharts mora aqui)
  const bx = 246, by = 66;
  s.rect(bx - 2, by + 24, 4, 70, '#0a1214'); s.rect(bx + 40, by + 24, 4, 70, '#0a1214');
  s.halo(bx + 22, by + 14, 34, '#3ff0c8', 0.5);
  s.rect(bx - 4, by - 2, 52, 32, '#3ff0c8'); s.rect(bx - 3, by - 1, 50, 30, '#05100f');
  [8, 14, 11, 20, 26, 17].forEach(function (hh, i) {
    const c = i % 2 ? '#ff4fd8' : '#3ff0c8';
    s.rect(bx + 1 + i * 7, by + 27 - hh, 5, hh, c); s.rect(bx + 1 + i * 7, by + 27 - hh, 5, 1, '#ffffff');
  });
  s.rect(bx, by + 27, 46, 1, '#3ff0c8');
  // chão enferrujado
  ridge(s, R, 146, 4, 18, p.ground, '#4a4e40', H, 0.1);
  s.rect(0, 152, W, 28, p.ground);
  for (let y = 156; y < 180; y += 8) s.rect(0, y, W, 1, '#1c1f19');
  for (let x = 0; x < W; x += 24) s.rect(x + (((x / 24) & 1) * 12), 152, 1, 28, '#1c1f19');
  for (let i = 0; i < 70; i++) s.set(R() * W, 152 + R() * 28, R() < 0.5 ? '#4a2a1a' : '#3a3e32');
  for (let i = 0; i < 6; i++) { const x = 20 + i * 52 + Math.floor(R() * 20), y = 162 + Math.floor(R() * 12); s.rect(x, y, 22, 2, '#1a3a3a'); s.dither(x, y, 22, 2, '#3ff0c8', 0.6); }
  s.rect(120, 140, 30, 5, '#3a3e32'); s.rect(120, 140, 30, 1, '#6a6e5a'); s.rect(128, 134, 4, 6, '#2a2e24');
  s.rect(0, 174, W, 6, p.ground);
  const g = new Surface(W, H);
  g.halo(bx + 22, by + 14, 38, '#3ff0c8', 0.9); g.rect(bx - 4, by - 2, 52, 32, 0);
  fx.push({ s: g, cls: 'beam' });
  return { base: s, fx: fx };
}

const SCENES = { end: sceneEnd, prehist: scenePrehist, medieval: sceneMedieval, present: scenePresent, zeal: sceneZeal, future: sceneFuture };
function buildScene(kind, pal, opt) { return SCENES[kind](pal, opt); }
/* centro (em px lógicos do cenário) da Epoch estacionada */
const DOCK = { x: 257, y: 133 };

/* converte um sprite em SVG (retângulos por linha) — usado em favicon etc. */
function toSVG(s, px) {
  px = px || 1; let out = '';
  for (let y = 0; y < s.h; y++) {
    let x = 0;
    while (x < s.w) {
      const c = s.d[y * s.w + x];
      if (!(c >>> 24)) { x++; continue; }
      let x2 = x; while (x2 + 1 < s.w && s.d[y * s.w + x2 + 1] === c) x2++;
      const hex = '#' + [c & 255, (c >> 8) & 255, (c >> 16) & 255].map(function (v) { return ('0' + v.toString(16)).slice(-2); }).join('');
      out += '<rect x="' + x * px + '" y="' + y * px + '" width="' + (x2 - x + 1) * px + '" height="' + px + '" fill="' + hex + '"/>';
      x = x2 + 1;
    }
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + s.w * px + ' ' + s.h * px + '" shape-rendering="crispEdges">' + out + '</svg>';
}

const Art = { W: W, H: H, Surface: Surface, C: C, mix: mix, pack: pack, rng: rng, bay: bay, blitT: blitT, outlined: outlined,
  epochSide: epochSide, epochRear: epochRear, hero: hero, buildScene: buildScene, DOCK: DOCK, toSVG: toSVG };
root.Art = Art;
if (typeof module !== 'undefined' && module.exports) module.exports = Art;
})(typeof window !== 'undefined' ? window : globalThis);
