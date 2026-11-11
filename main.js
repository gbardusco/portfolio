/* =====================================================================
   main.js — Portfolio "Chrono Trigger"
   A Epoch viaja entre as eras guiada pelo scroll: decolagem → flash →
   vórtice → flash → pouso. Toda a arte vem de art.js (pixel art em código).
   ===================================================================== */
(function () {
'use strict';

if (!window.Art) { document.documentElement.classList.remove('js'); return; }

/* ------------------------------------------------------- utilidades --- */
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const easeIO = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = t => 1 - Math.pow(1 - t, 3);
const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const root = document.documentElement;
const eras = $$('.era'), warps = $$('.warp');
const cssVar = (el, name, fb) => (getComputedStyle(el).getPropertyValue(name).trim() || fb);

/* escala do pixel (px CSS por pixel lógico dos cenários, 320x180) */
let PS = 5;
function setScale() { PS = Math.max(1, Math.ceil(window.innerWidth / 320)); root.style.setProperty('--ps', PS); }

/* ------------------------------------------------------- cenários ----- */
const parks = [];                                       // Epoch estacionada de cada era (null se não houver)
function buildScenes() {
  eras.forEach(function (era, ei) {
    const host = $('.scene', era);
    if (!host) return;
    const pal = { top: cssVar(era, '--sky-top', '#000000'), bot: cssVar(era, '--sky-bot', '#000000'), ground: cssVar(era, '--ground', '#000000') };
    const sc = Art.buildScene(era.dataset.scene, pal, { dock: ei === 0 ? -1 : 1 });   // início: proa p/ o portal; fim: recém-pousada
    parks[ei] = null;
    const add = function (surf, cls) { const c = surf.toCanvas(); if (cls) c.className = cls; if (cls === 'park') parks[ei] = c; host.appendChild(c); };
    add(sc.base);
    sc.fx.forEach(function (f) { add(f.s, f.cls); });
    host.setAttribute('aria-hidden', 'true');
  });
  // o espaço de scroll entre eras recebe um degradê do chão da anterior ao céu da próxima
  warps.forEach(function (w, i) {
    if (!eras[i + 1]) return;
    w.style.background = 'linear-gradient(' + cssVar(eras[i], '--ground', '#000') + ',' + cssVar(eras[i + 1], '--sky-top', '#000') + ')';
  });
}

/* ícone da aba: a Epoch vista de trás */
function buildFavicon() {
  try {
    const f = Art.epochRear().frames[0].toCanvas(), c = document.createElement('canvas');
    c.width = c.height = 48;
    const x = c.getContext('2d'); x.fillStyle = '#101c82'; x.fillRect(0, 0, 48, 48); x.drawImage(f, 0, 4);
    let l = $('link[rel="icon"]');
    if (!l) { l = document.createElement('link'); l.rel = 'icon'; document.head.appendChild(l); }
    l.type = 'image/png'; l.href = c.toDataURL('image/png');
  } catch (e) { /* mantém o ícone padrão */ }
}

/* ------------------------------------------------------ partículas ---- */
function buildParticles() {
  const count = { embers: 26, motes: 24, snow: 56, rain: 64, stars: 46 };
  $$('.particles').forEach(function (el, idx) {
    const kind = el.dataset.p, R = Art.rng(100 + idx * 13), n = count[kind] || 20, frag = document.createDocumentFragment();
    for (let i = 0; i < n; i++) {
      const s = document.createElement('span');
      const k = kind === 'rain' ? 1 : (R() < 0.25 ? 2 : 1);                  // múltiplos do pixel lógico
      const t = kind === 'rain' ? 0.7 + R() * 0.8 : kind === 'stars' ? 1.2 + R() * 2.6 : 7 + R() * 10;
      s.style.cssText = '--x:' + (R() * 100).toFixed(1) + '%;--y:' + (R() * 100).toFixed(1) + '%;--s:calc(var(--ps)*' + k + 'px);--t:' + t.toFixed(2) + 's;--d:' + (-R() * 12).toFixed(2) + 's';
      frag.appendChild(s);
    }
    el.appendChild(frag);
  });
}

/* ---------------------------------------------------- máquina de escrever */
function prepType(el) {
  const text = el.textContent.replace(/\s+/g, ' ').trim(), chars = [];
  const vis = document.createElement('span');
  vis.setAttribute('aria-hidden', 'true');
  (function walk(src, dst) {
    src.childNodes.forEach(function (n) {
      if (n.nodeType === 3) {
        n.textContent.split(/(\s+)/).forEach(function (part) {
          if (!part) return;
          if (/^\s+$/.test(part)) { dst.appendChild(document.createTextNode(' ')); return; }
          const w = document.createElement('span'); w.className = 'w';
          for (const ch of part) { const c = document.createElement('span'); c.className = 'c'; c.textContent = ch; w.appendChild(c); chars.push(c); }
          dst.appendChild(w);
        });
      } else if (n.nodeType === 1) { const cl = n.cloneNode(false); dst.appendChild(cl); walk(n, cl); }
    });
  })(el, vis);
  const sr = document.createElement('span'); sr.className = 'vh'; sr.textContent = text;     // leitores de tela
  el.textContent = ''; el.appendChild(sr); el.appendChild(vis);
  return { el: el, chars: chars, started: false, done: false, raf: 0 };
}
function finishType(t) {
  if (t.done) return;
  t.done = true; cancelAnimationFrame(t.raf);
  t.chars.forEach(function (c) { c.classList.add('on'); });
  t.el.classList.add('done');
}
function runType(t) {
  if (t.started) return;
  t.started = true;
  if (REDUCE) { finishType(t); return; }
  const t0 = performance.now(), per = 24, total = t.chars.length;
  let shown = 0;
  (function frame(now) {
    const n = Math.min(total, Math.floor((now - t0) / per) + 1);
    while (shown < n) t.chars[shown++].classList.add('on');
    if (shown >= total) finishType(t); else t.raf = requestAnimationFrame(frame);
  })(t0);
}
function initType() {
  const items = $$('[data-type]').map(prepType);
  items.forEach(function (t) { t.el.addEventListener('click', function () { if (t.started) finishType(t); }); t.el.style.cursor = 'pointer'; });
  if (!('IntersectionObserver' in window)) { items.forEach(finishType); return; }
  const io = new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { const t = items.find(function (i) { return i.el === e.target; }); io.unobserve(e.target); if (t) setTimeout(function () { runType(t); }, 250); } });
  }, { threshold: 0.6 });
  items.forEach(function (t) { io.observe(t.el); });
}
function initReveal() {
  const els = $$('.reveal');
  if (!('IntersectionObserver' in window)) { els.forEach(function (e) { e.classList.add('in'); }); return; }
  const io = new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: 0.12 });
  els.forEach(function (e) { io.observe(e); });
}

/* ------------------------------------------------- navegação / scroll -- */
const navLinks = $$('#timeline a');
let activeIdx = -1;
function setActive(i) {
  if (i === activeIdx) return;
  activeIdx = i;
  navLinks.forEach(function (a, k) {
    a.classList.toggle('on', k === i);
    if (k === i) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
  });
}
const progress = document.createElement('div');
progress.id = 'progress'; progress.setAttribute('aria-hidden', 'true'); progress.innerHTML = '<i></i>';
document.body.appendChild(progress);
const progressBar = progress.firstChild, hint = $('.scroll-hint');

function updateStatic() {
  const vh = window.innerHeight, mid = vh / 2;
  let a = 0;
  for (let i = 0; i < eras.length; i++) if (eras[i].getBoundingClientRect().top <= mid) a = i;
  for (let i = 0; i < warps.length; i++) {
    const r = warps[i].getBoundingClientRect();
    if (r.top <= mid && r.bottom > mid) a = (mid - r.top) / r.height < 0.5 ? i : i + 1;
  }
  setActive(a);
  const max = document.documentElement.scrollHeight - vh;
  progressBar.style.height = (max > 0 ? clamp(window.scrollY / max, 0, 1) * 100 : 0) + '%';
  if (hint) hint.style.opacity = window.scrollY > 40 ? '0' : '';
}

/* rolagem com duração proporcional à distância (a viagem fica visível) */
let scrollAnim = null;
function cancelScroll() { if (scrollAnim) { scrollAnim.stop = true; scrollAnim = null; } }
function scrollToY(y) {
  cancelScroll();
  const y0 = window.scrollY, dist = y - y0;
  if (Math.abs(dist) < 2) return;
  if (REDUCE) { window.scrollTo(0, y); return; }
  const dur = clamp(Math.abs(dist) / (window.innerHeight * 2.2) * 1000, 650, 6500), t0 = performance.now(), me = { stop: false };
  scrollAnim = me;
  (function step(now) {
    if (me.stop) return;
    const k = clamp((now - t0) / dur, 0, 1);
    window.scrollTo(0, y0 + dist * easeIO(k));
    if (k < 1) requestAnimationFrame(step); else scrollAnim = null;
  })(t0);
}
['wheel', 'touchstart', 'keydown', 'mousedown'].forEach(function (ev) { window.addEventListener(ev, cancelScroll, { passive: true }); });
/* roda do mouse: rolagem suave com inércia, limitada (não "dispara" a viagem sem querer) */
let wTarget = 0, wActive = false, wLast = 0;
function inTextZone(y) {                               // o centro da tela (em y) está dentro de uma era?
  const mid = y + window.innerHeight / 2;
  return eras.some(function (e) { const t = e.getBoundingClientRect().top + window.scrollY; return mid >= t && mid <= t + e.offsetHeight; });
}
function wStep(now) {
  const dt = clamp((now - wLast) / 1000, 0.001, 0.05); wLast = now;
  const d = wTarget - window.scrollY;
  if (Math.abs(d) < 1) { window.scrollTo(0, wTarget); wActive = false; return; }
  let step = d * (1 - Math.exp(-dt * 8));
  if (Math.abs(step) < 1) step = Math.sign(d);
  window.scrollTo(0, window.scrollY + step);
  requestAnimationFrame(wStep);
}
function onWheel(e) {
  if (REDUCE || e.ctrlKey || e.defaultPrevented || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;   // zoom, horizontal e movimento reduzido: nativo
  e.preventDefault(); cancelScroll();
  const vh = window.innerHeight, max = document.documentElement.scrollHeight - vh;
  const dy = e.deltaMode === 1 ? e.deltaY * 32 : e.deltaMode === 2 ? e.deltaY * vh : e.deltaY;
  if (!wActive) wTarget = window.scrollY;
  const k = inTextZone(wTarget) ? 0.45 : 0.9;           // texto: bem mais devagar; trecho da viagem: quase normal
  wTarget = clamp(wTarget + clamp(dy, -150, 150) * k, 0, max);
  wTarget = clamp(wTarget, window.scrollY - vh * 0.5, window.scrollY + vh * 0.5);   // sem acumular embalo demais
  if (!wActive) { wActive = true; wLast = performance.now(); requestAnimationFrame(wStep); }
}
window.addEventListener('wheel', onWheel, { passive: false });
function go(el, hash) {
  scrollToY(el.getBoundingClientRect().top + window.scrollY);
  try { history.replaceState(null, '', hash); } catch (e) { /* file:// em alguns navegadores */ }
}
function initLinks() {
  navLinks.forEach(function (a) {
    a.addEventListener('click', function (e) { e.preventDefault(); const t = eras[+a.dataset.i]; if (t) go(t, '#' + t.id); });
  });
  $$('a[data-go]').forEach(function (a) {
    a.addEventListener('click', function (e) { const t = document.getElementById((a.getAttribute('href') || '').slice(1)); if (t) { e.preventDefault(); go(t, a.getAttribute('href')); } });
  });
}

/* =====================================================================
   A VIAGEM — canvas de baixa resolução (pixel de verdade), renderizado
   por software num buffer RGBA e ampliado sem suavização.
   ===================================================================== */
const ov = $('#overlay'), cv = $('#warp-canvas'), flashEl = $('#flash'), hud = $('#year-box'), yearEl = $('#year'), destEl = $('#dest');
let ctx, img, fb, LW = 0, LH = 0, PX = 4, ANG, INV, DST2, THR;
const pal = new Uint32Array(8);
const LS = [5, 10, 17, 26, 37, 50, 68, 92], SS = [70, 75, 80, 82, 85, 88, 85, 45], HS = [0, 0, 0, 4, 10, 18, 28, 40];
const SN = 130, S_ANG = new Float32Array(SN), S_Z = new Float32Array(SN);
let SV = null;

function hsl(h, s, l) {
  h = (((h % 360) + 360) % 360) / 360; s /= 100; l /= 100;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = function (t) { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return Art.pack(Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255));
}
function makePal(h) { for (let i = 0; i < 8; i++) pal[i] = hsl(h + HS[i], SS[i], LS[i]); }

function sizeCanvas() {
  const vw = window.innerWidth, vh = window.innerHeight;
  PX = clamp(Math.round(Math.min(vw / 230, vh / 170)), 2, 7);
  while (Math.ceil(vw / PX) * Math.ceil(vh / PX) > 70000) PX++;                  // limita o custo por quadro (retrato mobile, telas enormes)
  LW = Math.ceil(vw / PX); LH = Math.ceil(vh / PX);
  cv.width = LW; cv.height = LH;
  cv.style.width = LW * PX + 'px'; cv.style.height = LH * PX + 'px';
  ctx = cv.getContext('2d');
  img = ctx.createImageData(LW, LH);
  fb = new Art.Surface(LW, LH, new Uint32Array(img.data.buffer));
  const n = LW * LH; ANG = new Float32Array(n); INV = new Float32Array(n); DST2 = new Float32Array(n); THR = new Float32Array(n);
  const cx = LW / 2, cy = LH / 2, ref = LH * 0.5;
  for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) {
    const i = y * LW + x, dx = x + 0.5 - cx, dy = y + 0.5 - cy, r = Math.sqrt(dx * dx + dy * dy);
    ANG[i] = Math.atan2(dy, dx) / (Math.PI * 2) + 0.5; INV[i] = ref / (r + 0.8); DST2[i] = r * r; THR[i] = Art.bay(x, y);
  }
}
function seedStreaks() { for (let i = 0; i < SN; i++) { S_ANG[i] = Math.random() * Math.PI * 2; S_Z[i] = Math.random(); } }

/* túnel: anéis que fluem + raios em espiral, posterizado em 8 tons */
function drawTunnel(phase, rot, maskR) {
  const d = fb.d, n = LW * LH, m2 = maskR * maskR;
  for (let i = 0; i < n; i++) {
    if (DST2[i] > m2) continue;
    const inv = INV[i], dep = inv * 0.9 + phase;
    let idx = ((dep - Math.floor(dep)) * 5) | 0;
    const tw = ANG[i] * 9 + inv * 0.35 + rot, g = tw - Math.floor(tw);
    if (g < 0.11) idx += 3; else if (g < 0.16) idx += 1;
    if (inv > 3) idx += (inv - 3) | 0; else if (inv < 0.6) idx -= 1;
    d[i] = pal[idx < 0 ? 0 : idx > 7 ? 7 : idx];
  }
}
function stepStreaks(dt, v) {
  for (let i = 0; i < SN; i++) {
    S_Z[i] -= v * dt;
    if (S_Z[i] < 0.02) { S_Z[i] += 0.98; S_ANG[i] = Math.random() * Math.PI * 2; }
    else if (S_Z[i] > 1) { S_Z[i] -= 0.98; S_ANG[i] = Math.random() * Math.PI * 2; }
  }
}
function drawStreaks(len) {
  const cx = LW / 2, cy = LH / 2, mr = Math.hypot(LW, LH) * 0.55;
  for (let i = 0; i < SN; i++) {
    const z = S_Z[i], r1 = mr * Math.pow(1 - z, 1.7), r2 = mr * Math.pow(1 - Math.min(0.99, z + len), 1.7);
    const ca = Math.cos(S_ANG[i]), sa = Math.sin(S_ANG[i]);
    fb.line(cx + ca * r1, cy + sa * r1, cx + ca * r2, cy + sa * r2, pal[4 + (((1 - z) * 3.99) | 0)]);
  }
}
/* escurecimento pontilhado (dissolve retrô) */
function dim(dens) {
  if (dens <= 0) return;
  const d = fb.d, n = LW * LH;
  for (let i = 0; i < n; i++) if (THR[i] < dens) d[i] = 0xFF000000;
}
/* anel do portal (Time Gate) */
function drawRing(R, t) {
  if (R < 1) return;
  const cx = LW / 2, cy = LH / 2, x0 = Math.max(0, Math.floor(cx - R - 6)), x1 = Math.min(LW - 1, Math.ceil(cx + R + 6));
  const y0 = Math.max(0, Math.floor(cy - R - 6)), y1 = Math.min(LH - 1, Math.ceil(cy + R + 6)), ph = (t * 18) | 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dd = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    if (dd <= R && dd > R - 3) fb.d[y * LW + x] = ((x + y + ph) & 3) < 2 ? 0xFFFFFFFF : pal[6];
    else if (dd > R && dd <= R + 1.5) fb.d[y * LW + x] = pal[3];
    else if (dd > R && dd < R + 6 && Art.bay(x, y) < 0.5 * (1 - (dd - R) / 6)) fb.d[y * LW + x] = pal[5];
  }
}
/* centro da Epoch estacionada da era i, em pixels lógicos do canvas da viagem */
function dockPos(i) {
  const c = parks[i]; if (!c) return null;
  const r = c.getBoundingClientRect();
  return { x: (r.left + Art.DOCK.x * PS) / PX, y: (r.top + Art.DOCK.y * PS) / PX, s: PS / PX };
}
let echoHue = -1, echoFrames = null;
function echoSet(hue, frames) {
  const hq = Math.round((((hue % 360) + 360) % 360) / 6) * 6;
  if (hq !== echoHue || !echoFrames) {
    echoHue = hq;
    const col = hsl(hq, 80, 44);
    echoFrames = frames.map(function (f) {
      const o = new Art.Surface(f.w, f.h);
      for (let i = 0; i < f.d.length; i++) { const c = f.d[i]; o.d[i] = (c >>> 24) ? Art.mix(c, col, 0.45) : 0; }
      return o;
    });
  }
  return echoFrames;
}
function sideVariants() {
  if (SV) return SV;
  const E = Art.epochSide();
  SV = E.flame.map(function (fl) {
    const s = new Art.Surface(E.w + 28, E.h);          // sprite centrado, chama à esquerda
    s.blit(fl, 14 - fl.w, Math.round(E.h / 2) - 4); s.blit(E.spr, 14, 0);
    return s;
  });
  return SV;
}

/* ---- estado da viagem ---- */
let raf = 0, last = 0, lastY = window.scrollY, energy = 0, face = 1, phase = 0, rot = 0, pd = 0, prevP = 0, kick = 0, clock = 0, curWarp = -1, active = false;
let lastYearTxt = '', lastDest = '', lastHud = -1;
const hist = [];

const LEAD = 0.45;      // a viagem só começa quando o início do espaço de scroll chega a 45% da altura da tela (dá tempo de ler o fim do texto)
function findWarp() {
  const a = window.innerHeight * LEAD;
  for (let i = 0; i < warps.length; i++) {
    const r = warps[i].getBoundingClientRect();
    if (r.top < a && r.bottom > 0) return { i: i, p: (a - r.top) / (r.height + a) };
  }
  return null;
}
function fmtYear(v, scr) {
  let s = Math.round(Math.abs(v)).toLocaleString('pt-BR');
  if (scr > 0) {                                      // dígitos finais "girando" (slot machine)
    const a = s.split('');
    for (let i = a.length - 1, k = 0; i >= 0 && k < scr; i--) if (/\d/.test(a[i])) { a[i] = String((Math.random() * 10) | 0); k++; }
    s = a.join('');
  }
  return s + (v < 0 ? ' a.C.' : ' d.C.');
}
function hudUpdate(p, wi) {
  const eF = eras[wi], eT = eras[wi + 1], u = clamp((p - 0.12) / 0.76, 0, 1);
  let txt;
  if (p < 0.12) txt = eF.dataset.yearLabel;
  else if (p > 0.88) txt = eT.dataset.yearLabel;
  else if (eF.dataset.era === 'end' && u < 0.1) txt = '? ? ? ?';
  else if (eT.dataset.era === 'end' && u > 0.9) txt = '? ? ? ?';
  else txt = fmtYear(lerp(+eF.dataset.year, +eT.dataset.year, easeIO(u)), energy > 0.15 ? 1 + Math.floor(energy * 2.2) : 0);
  if (txt !== lastYearTxt) { yearEl.textContent = txt; lastYearTxt = txt; }
  const dest = '→ ' + (face >= 0 ? eT : eF).dataset.name;
  if (dest !== lastDest) { destEl.textContent = dest; lastDest = dest; }
  const o = sstep(0.06, 0.14, p) * (1 - sstep(0.86, 0.94, p));
  if (o !== lastHud) { hud.style.opacity = o.toFixed(3); lastHud = o; }
}

function drawFrame(p, wi, dt) {
  const inV = p >= 0.09 && p <= 0.91, E = Art.epochRear();
  const sc3 = LW >= 400 ? 4 : LW >= 250 ? 3 : 2, sc2 = LW >= 420 ? 3 : LW >= 200 ? 2 : 1.5;
  const hF = +eras[wi].dataset.hue, hT = +eras[wi + 1].dataset.hue, dh = ((hT - hF + 540) % 360) - 180;
  const prog = clamp((p - 0.09) / 0.82, 0, 1), mid = Math.sin(Math.PI * prog);
  makePal(hF + dh * prog);
  const sideBob = Math.sin(clock * 3) * 1.2, fr = ((clock * 14) | 0) % 3;
  const bell = function (c) { return clamp(1 - Math.abs(p - c) / 0.03, 0, 1); };
  let fl = Math.max(bell(0.09), bell(0.91)); fl = fl * fl * (3 - 2 * fl) * (0.35 + 0.65 * clamp(energy * 2, 0, 1));
  fl = Math.max(fl, kick * kick);
  flashEl.style.opacity = fl.toFixed(3);
  ov.classList.toggle('vortex', inV);

  if (inV) {
    /* ---------- VÓRTICE ---------- */
    phase += dt * (0.35 + 2.6 * energy) * face;
    rot += dt * (0.05 + 0.25 * energy) * face;
    const pulse = Math.pow(Math.max(0, Math.sin(clock * 3.1)), 8);
    phase += pulse * dt * 1.5 * face;
    drawTunnel(phase, rot, Infinity);
    stepStreaks(dt, (0.15 + 0.9 * energy) * face);
    drawStreaks(0.02 + 0.09 * energy);
    // posição da Epoch: balanço, banking e tremor
    const bank = 0.22 * Math.sin(clock * 0.9 + 1.3 * Math.sin(clock * 0.37));
    const ex = LW / 2 + Math.sin(clock * 0.9) * LW * 0.05 + Math.sin(clock * 0.9 + 1.3 * Math.sin(clock * 0.37)) * LW * 0.03;
    const ey = LH * 0.56 + Math.sin(clock * 2.2) * 3 * (1 + energy);
    const shake = 1.6 * mid * (0.25 + energy);
    const sx = Math.round((Math.random() - 0.5) * 2 * shake), sy = Math.round((Math.random() - 0.5) * 2 * shake);
    cv.style.transform = (sx || sy) ? 'translate(' + sx * PX + 'px,' + sy * PX + 'px)' : '';
    hist.unshift([ex, ey, bank]); if (hist.length > 14) hist.pop();
    const frame = E.frames[fr], s = sc3 * (1 + 0.05 * pulse);
    if (energy > 0.25) {                                                              // ecos (afterimages)
      const ef = echoSet(hF + dh * prog, E.frames)[fr];
      for (let k = 3; k >= 1; k--) {
        const h = hist[Math.min(hist.length - 1, k * 3)];
        Art.blitT(fb, ef, h[0], h[1], s * (1 + 0.08 * k), h[2], { dither: k & 1 });
      }
    }
    // rastros de luz nas pontas das asas
    const ca = Math.cos(bank), sa = Math.sin(bank), cx0 = LW / 2, cy0 = LH / 2;
    [[-17, -5.5], [17, -5.5]].forEach(function (w) {
      const tx = ex + (w[0] * ca - w[1] * sa) * sc3, ty = ey + (w[0] * sa + w[1] * ca) * sc3;
      const vx = tx - cx0, vy = ty - cy0, vl = Math.hypot(vx, vy) || 1, len = (8 + 26 * energy) * (0.6 + 0.4 * sc3 / 3);
      for (let k = 0; k < len; k++) fb.set(tx + vx / vl * k, ty + vy / vl * k, pal[k < len * 0.35 ? 7 : k < len * 0.7 ? 6 : 4]);
    });
    Art.blitT(fb, frame, ex, ey, s, bank);
  } else {
    /* ---------- DECOLAGEM (p<0.09) e POUSO (p>0.91) ---------- */
    fb.clear(0); cv.style.transform = '';
    const takeoff = p < 0.09, u = takeoff ? p / 0.09 : (p - 0.91) / 0.09;
    makePal(takeoff ? hF : hT);
    dim(0.5 * (takeoff ? easeIO(u) : 1 - easeIO(u)));
    const R = Math.min(LW, LH) * 0.34 * (takeoff ? easeOut(u) : 1 - easeIO(u));
    if (R >= 1) { drawTunnel(clock * 1.4 * face, clock * 0.2, R); drawRing(R, clock); }
    const v = sideVariants()[fr];
    let x, y, s, heading = face;
    const dk = takeoff ? (wi === 0 ? dockPos(0) : null) : (wi === eras.length - 2 ? dockPos(eras.length - 1) : null);
    if (takeoff) {
      const e = easeOut(u);
      if (dk) { x = lerp(dk.x, LW * 0.5, e); y = lerp(dk.y, LH * 0.5, e); s = lerp(dk.s, sc2, e); heading = -face; }   // decola do cais, rumo ao portal
      else { x = lerp(-LW * 0.22, LW * 0.5, e); y = lerp(LH * 0.64, LH * 0.5, e); s = sc2 * lerp(0.55, 1, e); }
    } else {
      const e = easeIO(u);
      if (dk) { x = lerp(LW * 0.5, dk.x, e); y = lerp(LH * 0.5, dk.y, e); s = lerp(sc2, dk.s, e); }                    // pousa no cais do Fim do Tempo
      else { x = lerp(LW * 0.5, LW * 1.2, e); y = lerp(LH * 0.5, LH * 0.4, e); s = sc2 * lerp(1, 0.35, e); }
    }
    Art.blitT(fb, v, x, y + sideBob, s, 0, { flip: heading < 0 });
  }
  ctx.putImageData(img, 0, 0);
  hudUpdate(p, wi);
}

function showOverlay(on) {
  if (on === active) return;
  active = on;
  ov.style.visibility = on ? 'visible' : 'hidden';
  document.body.classList.toggle('warping', on);
  parks.forEach(function (c) { if (c) c.style.visibility = on ? 'hidden' : ''; });
  if (!on) { cv.style.transform = ''; ov.classList.remove('vortex'); flashEl.style.opacity = 0; lastHud = -1; }
}
function tick(now) {
  raf = 0;
  const dt = clamp((now - last) / 1000, 0.001, 0.05); last = now; clock += dt;
  const y = window.scrollY, dy = y - lastY; lastY = y;
  const w = findWarp();
  if (!w) { showOverlay(false); return; }
  if (w.i !== curWarp) { curWarp = w.i; pd = w.p; prevP = w.p; hist.length = 0; lastYearTxt = lastDest = ''; }
  if (Math.abs(dy) > 0.5) face = dy > 0 ? 1 : -1;
  const target = clamp(Math.abs(dy) / dt / (window.innerHeight * 1.4), 0, 1.4);
  energy += (target - energy) * (1 - Math.exp(-dt * (target > energy ? 12 : 2.5)));
  pd += (w.p - pd) * (1 - Math.exp(-dt * 18));
  [0.09, 0.91].forEach(function (c) { if ((prevP - c) * (pd - c) < 0) kick = 1; });      // cruzou um flash
  prevP = pd; kick = Math.max(0, kick - dt / 0.4);
  drawFrame(pd, w.i, dt);
  showOverlay(true);
  raf = requestAnimationFrame(tick);
}
function wake() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); } }

/* ---------------------------------------------------------- init ------ */
let pending = false;
function onScroll() {
  if (!pending) { pending = true; requestAnimationFrame(function () { pending = false; updateStatic(); }); }
  if (!REDUCE) wake();
}
function onResize() { setScale(); if (!REDUCE) { sizeCanvas(); } onScroll(); }

function init() {
  setScale();
  buildScenes(); buildFavicon(); buildParticles();
  initReveal(); initType(); initLinks();
  const yr = $('#yr'); if (yr) yr.textContent = new Date().getFullYear();
  if (!REDUCE && ov && cv) { sizeCanvas(); seedStreaks(); }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize);
  window.addEventListener('load', onScroll);
  updateStatic();
  if (!REDUCE) wake();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
