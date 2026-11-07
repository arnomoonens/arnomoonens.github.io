/* Genzaichi: your dot on any map photo. */
(() => {
  'use strict';

  const G = window.GZGeo;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => [...(el || document).querySelectorAll(s)];
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const D2R = Math.PI / 180;
  const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-5);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtM = (m) => (m == null || !isFinite(m)) ? '–'
    : m < 9.95 ? (Math.round(m * 10) / 10).toString().replace(/\.0$/, '') + '\u00a0m'
      : m < 1000 ? Math.round(m) + '\u00a0m' : (m / 1000).toFixed(m < 9950 ? 1 : 0) + '\u00a0km';
  const FIT_NAMES = { similarity: 'Rotate + scale', affine: 'Stretch', perspective: 'Perspective', flex: 'Rubber sheet' };
  const FIT_HELP = {
    auto: 'Picks the simplest fit your spots support.',
    similarity: 'For maps drawn to scale and photographed straight on.',
    affine: 'Also handles maps squashed in one direction.',
    perspective: 'For photos taken at an angle. Needs 4 spots.',
    flex: 'Bends to every spot, for hand-drawn maps that are not to scale. Needs 5 spots.',
  };

  // ---------- small persistence helpers ----------
  const Prefs = {
    get(k, d) { try { const v = localStorage.getItem('gz.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('gz.' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
  };

  const Store = (() => {
    let dbp = null;
    const mem = new Map();
    function open() {
      if (dbp) return dbp;
      dbp = new Promise((resolve) => {
        try {
          const req = indexedDB.open('genzaichi', 1);
          req.onupgradeneeded = () => req.result.createObjectStore('maps', { keyPath: 'id' });
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
          req.onblocked = () => resolve(null);
        } catch (e) { resolve(null); }
      });
      return dbp;
    }
    async function run(mode, fn) {
      const db = await open();
      if (!db) throw new Error('no db');
      return new Promise((resolve, reject) => {
        const t = db.transaction('maps', mode);
        const r = fn(t.objectStore('maps'));
        let out;
        if (r) r.onsuccess = () => { out = r.result; };
        t.oncomplete = () => resolve(out);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      });
    }
    return {
      async all() { try { return (await run('readonly', (s) => s.getAll())) || []; } catch (e) { return [...mem.values()]; } },
      async get(id) { try { return (await run('readonly', (s) => s.get(id))) || mem.get(id) || null; } catch (e) { return mem.get(id) || null; } },
      async put(rec) { mem.set(rec.id, rec); try { await run('readwrite', (s) => s.put(rec)); return true; } catch (e) { return false; } },
      async del(id) { mem.delete(id); try { await run('readwrite', (s) => s.delete(id)); } catch (e) { /* ignore */ } },
    };
  })();

  // ---------- images ----------
  function loadImage(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
      img.src = url;
    });
  }
  async function decodeBlob(blob) {
    if (window.createImageBitmap) {
      try { return await createImageBitmap(blob); } catch (e) { /* fall back */ }
    }
    return loadImage(blob);
  }
  const imgSize = (img) => [img.naturalWidth || img.width, img.naturalHeight || img.height];
  function toCanvas(img, maxSide) {
    const [w0, h0] = imgSize(img);
    const k = Math.min(1, maxSide / Math.max(w0, h0));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w0 * k));
    c.height = Math.max(1, Math.round(h0 * k));
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c;
  }
  const canvasBlob = (c, q = 0.9) => new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('encode'))), 'image/jpeg', q));
  function thumbOf(c, size = 240) {
    const k = size / Math.max(c.width, c.height);
    const t = document.createElement('canvas');
    t.width = Math.max(1, Math.round(c.width * k));
    t.height = Math.max(1, Math.round(c.height * k));
    const ctx = t.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(c, 0, 0, t.width, t.height);
    return t.toDataURL('image/jpeg', 0.78);
  }

  // Squares up a photographed board: maps the quad (in source pixels) onto a rectangle.
  async function warpQuad(img, quad, maxSide, onProgress) {
    const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    let W = (d(quad[0], quad[1]) + d(quad[3], quad[2])) / 2;
    let H = (d(quad[0], quad[3]) + d(quad[1], quad[2])) / 2;
    const k = Math.min(1, maxSide / Math.max(W, H));
    W = Math.max(16, Math.round(W * k));
    H = Math.max(16, Math.round(H * k));
    const Hm = G.homography4([[0, 0], [W, 0], [W, H], [0, H]], quad);
    if (!Hm) throw new Error('quad');
    const [sw, sh] = imgSize(img);
    const sc = document.createElement('canvas');
    sc.width = sw; sc.height = sh;
    const sctx = sc.getContext('2d', { willReadFrequently: true });
    sctx.drawImage(img, 0, 0);
    const src = sctx.getImageData(0, 0, sw, sh).data;
    sc.width = sc.height = 0;
    const out = new ImageData(W, H);
    const o = out.data;
    const [h00, h01, h02] = Hm[0], [h10, h11, h12] = Hm[1], [h20, h21, h22] = Hm[2];
    const maxX = sw - 1.001, maxY = sh - 1.001, row = sw * 4;
    for (let y = 0; y < H; y++) {
      const yy = y + 0.5;
      for (let x = 0; x < W; x++) {
        const xx = x + 0.5;
        const w = h20 * xx + h21 * yy + h22;
        let sx = (h00 * xx + h01 * yy + h02) / w - 0.5;
        let sy = (h10 * xx + h11 * yy + h12) / w - 0.5;
        sx = sx < 0 ? 0 : sx > maxX ? maxX : sx;
        sy = sy < 0 ? 0 : sy > maxY ? maxY : sy;
        const x0 = sx | 0, y0 = sy | 0, fx = sx - x0, fy = sy - y0;
        const i00 = y0 * row + x0 * 4, i10 = i00 + row;
        const oi = (y * W + x) * 4;
        for (let ch = 0; ch < 3; ch++) {
          const t = src[i00 + ch] + (src[i00 + 4 + ch] - src[i00 + ch]) * fx;
          const b = src[i10 + ch] + (src[i10 + 4 + ch] - src[i10 + ch]) * fx;
          o[oi + ch] = t + (b - t) * fy;
        }
        o[oi + 3] = 255;
      }
      if ((y & 63) === 63) { if (onProgress) onProgress(y / H); await sleep(0); }
    }
    const oc = document.createElement('canvas');
    oc.width = W; oc.height = H;
    oc.getContext('2d').putImageData(out, 0, 0);
    return { canvas: oc, H: Hm, W, Hh: H };
  }

  function parseExifTime(s, offset) {
    const m = /^(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)/.exec(s || '');
    if (!m) return null;
    const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${offset && /^[+-]\d\d:\d\d$/.test(offset) ? offset : ''}`;
    const t = Date.parse(iso);
    return isFinite(t) ? t : null;
  }

  // ---------- photo viewer ----------
  class PhotoView {
    constructor(canvas) {
      this.c = canvas;
      this.ctx = canvas.getContext('2d');
      this.img = null; this.W = 1; this.H = 1;
      this.cx = 0.5; this.cy = 0.5; this.s = 1; this.rot = 0;
      this.w = 1; this.h = 1; this.dpr = 1;
      this.bg = '#d5dde7';
      this.overlay = null; this.onTap = null; this.onView = null;
      this.onPinDown = null; this.onPinMove = null; this.onPinUp = null;
      this.ptrs = new Map(); this.g = null; this.raf = 0; this.anim = 0; this.tw = null; this.lastTap = null; this.tapTimer = 0;
      canvas.addEventListener('pointerdown', (e) => this.down(e));
      canvas.addEventListener('pointermove', (e) => this.move(e));
      canvas.addEventListener('pointerup', (e) => this.up(e, false));
      canvas.addEventListener('pointercancel', (e) => this.up(e, true));
      canvas.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
      new ResizeObserver(() => this.resize()).observe(canvas);
    }
    resize() {
      const r = this.c.getBoundingClientRect();
      if (!r.width || !r.height) return;
      this.w = r.width; this.h = r.height;
      this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      this.c.width = Math.round(this.w * this.dpr);
      this.c.height = Math.round(this.h * this.dpr);
      if (this.img && this.needFit) { this.needFit = false; this.fit(); return; }
      this.clamp();
      this.draw();
      if (this.onView) this.onView(false, true);
    }
    setImage(img, W, H, keepView) {
      this.img = img; this.W = W; this.H = H;
      if (!keepView) { if (this.w > 2) this.fit(); else this.needFit = true; }
      this.request();
    }
    fitScale() { return Math.min(this.w / this.W, this.h / this.H); }
    fit() {
      this.s = this.fitScale() * 0.97; this.cx = this.W / 2; this.cy = this.H / 2;
      this.request();
      if (this.onView) this.onView(false, true);
    }
    toScreen(u, v) {
      const dx = (u - this.cx) * this.s, dy = (v - this.cy) * this.s;
      const c = Math.cos(this.rot), s = Math.sin(this.rot);
      return [this.w / 2 + c * dx - s * dy, this.h / 2 + s * dx + c * dy];
    }
    toImage(x, y) {
      const dx = x - this.w / 2, dy = y - this.h / 2;
      const c = Math.cos(this.rot), s = Math.sin(this.rot);
      return [this.cx + (c * dx + s * dy) / this.s, this.cy + (-s * dx + c * dy) / this.s];
    }
    center() { return [this.cx, this.cy]; }
    clamp() {
      const f = this.fitScale();
      this.s = clamp(this.s, f * 0.3, Math.max(10, f * 50));
      this.cx = clamp(this.cx, -0.1 * this.W, 1.1 * this.W);
      this.cy = clamp(this.cy, -0.1 * this.H, 1.1 * this.H);
    }
    request() {
      if (!this.raf) this.raf = requestAnimationFrame(() => { this.raf = 0; this.draw(); });
    }
    draw() {
      const ctx = this.ctx, d = this.dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = this.bg;
      ctx.fillRect(0, 0, this.c.width, this.c.height);
      if (!this.img) return;
      ctx.setTransform(d, 0, 0, d, 0, 0);
      ctx.save();
      ctx.translate(this.w / 2, this.h / 2);
      ctx.rotate(this.rot);
      ctx.scale(this.s, this.s);
      ctx.translate(-this.cx, -this.cy);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.shadowColor = 'rgba(0,0,0,0.25)';
      ctx.shadowBlur = 12 / this.s;
      ctx.drawImage(this.img, 0, 0, this.W, this.H);
      ctx.restore();
      if (this.overlay) this.overlay(ctx, this);
    }
    pos(e) { const r = this.c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
    down(e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      try { this.c.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      const p = this.pos(e);
      this.ptrs.set(e.pointerId, p);
      this.stop();
      if (this.ptrs.size === 1) {
        if (this.onPinDown && this.onPinDown(p)) { this.g = { type: 'pin' }; return; }
        const t = performance.now();
        this.g = { type: 'pan', p0: p, c0: [this.cx, this.cy], t0: t, moved: false, hist: [[t, p[0], p[1]]] };
      } else if (this.ptrs.size === 2) {
        if (this.g && this.g.type === 'pin' && this.onPinUp) this.onPinUp();
        const [a, b] = [...this.ptrs.values()];
        const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        this.g = { type: 'pinch', d0: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, s0: this.s, anchor: this.toImage(m[0], m[1]) };
      }
    }
    keepAt(img, p) {
      const dx = p[0] - this.w / 2, dy = p[1] - this.h / 2;
      const c = Math.cos(this.rot), s = Math.sin(this.rot);
      this.cx = img[0] - (c * dx + s * dy) / this.s;
      this.cy = img[1] - (-s * dx + c * dy) / this.s;
    }
    move(e) {
      if (!this.ptrs.has(e.pointerId)) return;
      const p = this.pos(e);
      this.ptrs.set(e.pointerId, p);
      const g = this.g;
      if (!g) return;
      if (g.type === 'pin') { if (this.onPinMove) this.onPinMove(p); return; }
      if (g.type === 'pan' && this.ptrs.size === 1) {
        const dx = p[0] - g.p0[0], dy = p[1] - g.p0[1];
        if (!g.moved && Math.hypot(dx, dy) < 7) return;
        g.moved = true;
        const c = Math.cos(this.rot), s = Math.sin(this.rot);
        this.cx = g.c0[0] - (c * dx + s * dy) / this.s;
        this.cy = g.c0[1] - (-s * dx + c * dy) / this.s;
        g.hist.push([performance.now(), p[0], p[1]]);
        if (g.hist.length > 6) g.hist.shift();
        this.changed(true);
      } else if (g.type === 'pinch' && this.ptrs.size >= 2) {
        const [a, b] = [...this.ptrs.values()];
        const dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
        const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        this.s = g.s0 * dist / g.d0;
        this.clamp();
        this.keepAt(g.anchor, m);
        this.changed(true);
      }
    }
    up(e, cancel) {
      if (!this.ptrs.has(e.pointerId)) return;
      const p = this.ptrs.get(e.pointerId);
      this.ptrs.delete(e.pointerId);
      const g = this.g;
      if (g && g.type === 'pin') { this.g = null; if (this.onPinUp) this.onPinUp(); return; }
      if (this.ptrs.size === 1) {
        const q = [...this.ptrs.values()][0];
        const t = performance.now();
        this.g = { type: 'pan', p0: q, c0: [this.cx, this.cy], t0: t, moved: true, hist: [[t, q[0], q[1]]] };
        return;
      }
      if (this.ptrs.size) return;
      this.g = null;
      if (!g || cancel) { if (this.onView) this.onView(true, true); return; }
      if (g.type === 'pan' && !g.moved && performance.now() - g.t0 < 450) {
        const t = performance.now();
        if (this.lastTap && t - this.lastTap.t < 320 && Math.hypot(p[0] - this.lastTap.p[0], p[1] - this.lastTap.p[1]) < 32) {
          this.lastTap = null;
          clearTimeout(this.tapTimer);
          this.zoomBy(p, 2, 260);
          return;
        }
        this.lastTap = { t, p };
        clearTimeout(this.tapTimer);
        this.tapTimer = setTimeout(() => { if (this.onTap) this.onTap(p, this.toImage(p[0], p[1])); }, 240);
        return;
      }
      if (g.type === 'pan' && g.moved) { if (this.fling(g.hist)) return; }
      if (this.onView) this.onView(true, true);
    }
    fling(hist) {
      if (hist.length < 2) return false;
      const a = hist[0], b = hist[hist.length - 1];
      const dt = b[0] - a[0];
      if (dt <= 0 || performance.now() - b[0] > 70) return false;
      let vx = (b[1] - a[1]) / dt, vy = (b[2] - a[2]) / dt;
      if (Math.hypot(vx, vy) < 0.3) return false;
      let last = performance.now();
      const step = (t) => {
        const dtt = Math.min(40, t - last);
        last = t;
        const c = Math.cos(this.rot), s = Math.sin(this.rot);
        const dx = vx * dtt, dy = vy * dtt;
        this.cx -= (c * dx + s * dy) / this.s;
        this.cy -= (-s * dx + c * dy) / this.s;
        const k = Math.exp(-dtt / 260);
        vx *= k; vy *= k;
        this.changed(true);
        if (Math.hypot(vx, vy) > 0.03) this.anim = requestAnimationFrame(step);
        else { this.anim = 0; if (this.onView) this.onView(true, true); }
      };
      this.anim = requestAnimationFrame(step);
      return true;
    }
    stop() {
      if (this.anim) { cancelAnimationFrame(this.anim); this.anim = 0; }
      this.tw = null;
    }
    changed(user) { this.clamp(); this.request(); if (this.onView) this.onView(user, false); }
    zoomBy(p, k, ms) {
      const a = this.toImage(p[0], p[1]);
      const f = this.fitScale();
      const s1 = clamp(this.s * k, f * 0.3, Math.max(10, f * 50));
      // keep the tapped point under the finger
      const dx = p[0] - this.w / 2, dy = p[1] - this.h / 2;
      const c = Math.cos(this.rot), s = Math.sin(this.rot);
      this.animateTo({ s: s1, cx: a[0] - (c * dx + s * dy) / s1, cy: a[1] - (-s * dx + c * dy) / s1 }, ms || 0, true);
    }
    wheel(e) {
      e.preventDefault();
      const p = this.pos(e);
      const k = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016));
      const a = this.toImage(p[0], p[1]);
      this.s *= k;
      this.clamp();
      this.keepAt(a, p);
      this.changed(true);
      clearTimeout(this.wheelT);
      this.wheelT = setTimeout(() => { if (this.onView) this.onView(true, true); }, 160);
    }
    animateTo(t, ms, user) {
      this.stop();
      const from = { cx: this.cx, cy: this.cy, s: this.s, rot: this.rot };
      const to = { cx: t.cx != null ? t.cx : from.cx, cy: t.cy != null ? t.cy : from.cy, s: t.s != null ? t.s : from.s, rot: t.rot != null ? t.rot : from.rot };
      let dr = to.rot - from.rot;
      dr = Math.atan2(Math.sin(dr), Math.cos(dr));
      const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!ms || reduce) {
        Object.assign(this, { cx: to.cx, cy: to.cy, s: to.s, rot: from.rot + dr });
        this.changed(!!user);
        if (this.onView) this.onView(!!user, true);
        return;
      }
      const t0 = performance.now();
      const tw = {};
      this.tw = tw;
      const step = (now) => {
        if (this.tw !== tw) return;
        const k = Math.min(1, (now - t0) / ms);
        const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        this.cx = from.cx + (to.cx - from.cx) * e;
        this.cy = from.cy + (to.cy - from.cy) * e;
        this.s = from.s * Math.pow(to.s / from.s, e);
        this.rot = from.rot + dr * e;
        this.changed(!!user);
        if (k < 1) requestAnimationFrame(step);
        else { this.tw = null; if (this.onView) this.onView(!!user, true); }
      };
      requestAnimationFrame(step);
    }
  }

  // ---------- GPS ----------
  const GPS = {
    id: null, last: null, state: 'off', subs: new Set(),
    start() {
      if (this.id != null) return;
      if (!('geolocation' in navigator)) { this.set('unsupported'); return; }
      if (!window.isSecureContext) { this.set('insecure'); return; }
      if (this.state !== 'ok') this.set('waiting');
      try {
        this.id = navigator.geolocation.watchPosition((p) => this.fix(p), (e) => this.fail(e),
          { enableHighAccuracy: true, maximumAge: 1000, timeout: 27000 });
      } catch (e) { this.set('unsupported'); }
    },
    stop() {
      if (this.id != null) { try { navigator.geolocation.clearWatch(this.id); } catch (e) { /* ignore */ } this.id = null; }
    },
    fix(p) {
      const c = p.coords;
      if (!isFinite(c.latitude) || !isFinite(c.longitude)) return;
      this.last = { lat: c.latitude, lng: c.longitude, acc: c.accuracy || 50, heading: c.heading, speed: c.speed, t: Date.now() };
      Prefs.set('lastLoc', [c.latitude, c.longitude]);
      this.set('ok');
    },
    fail(e) {
      if (e.code === 1) { this.stop(); this.set('denied'); }
      else if (this.state !== 'ok') this.set(e.code === 2 ? 'unavailable' : 'waiting');
    },
    set(s) { this.state = s; this.subs.forEach((f) => f(this)); },
    fresh(ms) { return this.last && Date.now() - this.last.t < (ms || 15000) ? this.last : null; },
    // Collects fixes for a few seconds and averages the best ones.
    sample(ms, goodAcc, onTick) {
      this.start();
      const t0 = Date.now();
      const fixes = [];
      const recent = this.fresh(2500);
      let seen = this.last ? this.last.t : 0;
      if (recent) fixes.push(recent);
      // Some phones only report a position when it changes, so also ask for one directly.
      let asking = false;
      const ask = () => {
        if (asking || this.state === 'denied' || !('geolocation' in navigator)) return;
        asking = true;
        try {
          navigator.geolocation.getCurrentPosition((p) => { asking = false; this.fix(p); }, () => { asking = false; },
            { enableHighAccuracy: true, maximumAge: 0, timeout: Math.max(1500, ms - (Date.now() - t0)) });
        } catch (e) { asking = false; }
      };
      ask();
      return new Promise((resolve) => {
        const tick = () => {
          const f = this.last;
          if (f && f.t !== seen) { seen = f.t; fixes.push(f); }
          if (onTick) onTick(fixes);
          const good = fixes.filter((x) => x.acc <= goodAcc).length;
          if (Date.now() - t0 >= ms || good >= 4 || this.state === 'denied') {
            clearInterval(iv);
            // standing still with no new reports: the last fix from the past 20 s stands in
            if (!fixes.length) { const r = this.fresh(20000); if (r) fixes.push(r); }
            resolve(combineFixes(fixes));
          } else ask();
        };
        const iv = setInterval(tick, 250);
        tick();
      });
    },
  };
  function combineFixes(fixes) {
    if (!fixes.length) return null;
    const best = fixes.slice().sort((a, b) => a.acc - b.acc).slice(0, Math.max(1, Math.ceil(fixes.length / 2)));
    let sw = 0, la = 0, ln = 0;
    for (const f of best) { const w = 1 / (f.acc * f.acc); sw += w; la += w * f.lat; ln += w * f.lng; }
    return { lat: la / sw, lng: ln / sw, acc: Math.max(3, best[0].acc / Math.sqrt(Math.min(best.length, 3))), n: fixes.length };
  }

  // ---------- compass ----------
  function headingFromEuler(a, b, g) {
    const ca = Math.cos(a * D2R), sa = Math.sin(a * D2R), cb = Math.cos(b * D2R), sb = Math.sin(b * D2R);
    const cg = Math.cos(g * D2R), sg = Math.sin(g * D2R);
    // horizontal direction of the phone's top edge plus the direction its back camera faces
    const e = -sa * cb + (-ca * sg - sa * sb * cg);
    const n = ca * cb + (-sa * sg + ca * sb * cg);
    return (Math.atan2(e, n) / D2R + 360) % 360;
  }
  const Compass = {
    on: false, heading: null, sx: 0, sy: 1, state: 'off', subs: new Set(), lastEmit: 0, handler: null,
    needsPermission() { return typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function'; },
    supported() { return typeof DeviceOrientationEvent !== 'undefined'; },
    async enable(fromTap) {
      if (this.on) return true;
      if (!this.supported()) { this.state = 'unsupported'; this.emit(); return false; }
      if (this.needsPermission()) {
        if (!fromTap) { this.state = 'ask'; this.emit(); return false; }
        try {
          const r = await DeviceOrientationEvent.requestPermission();
          if (r !== 'granted') { this.state = 'denied'; this.emit(); return false; }
        } catch (e) { this.state = 'denied'; this.emit(); return false; }
      }
      this.handler = (e) => this.read(e);
      if ('ondeviceorientationabsolute' in window) window.addEventListener('deviceorientationabsolute', this.handler);
      else window.addEventListener('deviceorientation', this.handler);
      this.on = true;
      this.state = 'waiting';
      Prefs.set('compass', true);
      this.emit();
      setTimeout(() => { if (this.state === 'waiting') { this.state = 'none'; this.emit(); } }, 4000);
      return true;
    },
    read(e) {
      let mag = null;
      if (typeof e.webkitCompassHeading === 'number' && e.webkitCompassHeading >= 0) mag = e.webkitCompassHeading;
      else if ((e.absolute || e.type === 'deviceorientationabsolute') && e.alpha != null) mag = headingFromEuler(e.alpha, e.beta || 0, e.gamma || 0);
      else return;
      const so = (screen.orientation && typeof screen.orientation.angle === 'number') ? screen.orientation.angle : (window.orientation || 0);
      const at = GPS.last || (S.rec && S.rec.hint);
      const decl = at ? G.declination(at.lat, at.lng) : 0;
      const h = ((mag + so + decl) % 360 + 360) % 360;
      const r = h * D2R;
      const k = this.heading == null ? 1 : 0.22;
      this.sx += k * (Math.sin(r) - this.sx);
      this.sy += k * (Math.cos(r) - this.sy);
      this.heading = (Math.atan2(this.sx, this.sy) / D2R + 360) % 360;
      this.state = 'on';
      const t = performance.now();
      if (t - this.lastEmit > 40) { this.lastEmit = t; this.emit(); }
    },
    emit() { this.subs.forEach((f) => f(this)); },
  };

  // ---------- place lookup (OpenStreetMap) ----------
  async function fetchT(url, opts, ms) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    try { return await fetch(url, Object.assign({}, opts, { signal: ctl.signal })); } finally { clearTimeout(t); }
  }
  const Place = {
    async identify(lat, lng) {
      try { const r = await this.overpass(lat, lng); if (r) return r; } catch (e) { /* try the next source */ }
      try { return await this.reverse(lat, lng); } catch (e) { return null; }
    },
    async overpass(lat, lng) {
      const la = lat.toFixed(6), lo = lng.toFixed(6);
      const q = `[out:json][timeout:12];is_in(${la},${lo})->.a;(way(pivot.a)[name];relation(pivot.a)[name];);out tags bb;` +
        `nwr(around:220,${la},${lo})[name][~"^(tourism|historic)$"~"."];out center 15;`;
      const res = await fetchT('https://overpass-api.de/api/interpreter', { method: 'POST', body: new URLSearchParams({ data: q }) }, 15000);
      if (!res.ok) return null;
      const js = await res.json();
      return pickPlace(js.elements || [], lat, lng);
    },
    async reverse(lat, lng) {
      const u = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat.toFixed(6)}&lon=${lng.toFixed(6)}&zoom=18&namedetails=1&accept-language=en`;
      const res = await fetchT(u, {}, 10000);
      if (!res.ok) return null;
      const j = await res.json();
      const nd = j.namedetails || {};
      const a = j.address || {};
      const name = nd['name:en'] || j.name || a.tourism || a.historic || a.amenity || a.leisure || a.road;
      if (!name) return null;
      const local = nd['name:ja'] || nd.name;
      return { name, local: local && local !== name ? local : '', bbox: null };
    },
    async search(q, near) {
      let u = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(q)}&limit=6&namedetails=1&accept-language=en`;
      if (near) u += `&viewbox=${(near[1] - 0.6).toFixed(3)},${(near[0] + 0.6).toFixed(3)},${(near[1] + 0.6).toFixed(3)},${(near[0] - 0.6).toFixed(3)}`;
      const res = await fetchT(u, {}, 12000);
      if (!res.ok) throw new Error('search');
      const list = await res.json();
      return list.map((r) => {
        const nd = r.namedetails || {};
        const b = r.boundingbox;
        return {
          name: nd['name:en'] || r.name || String(r.display_name || '').split(',')[0],
          local: nd['name:ja'] || '',
          sub: r.display_name || '',
          lat: +r.lat, lng: +r.lon,
          bbox: b ? [[+b[0], +b[2]], [+b[1], +b[3]]] : null,
        };
      });
    },
  };
  function pickPlace(els, lat, lng) {
    const relevant = (t) => t.tourism || t.historic || t.amenity === 'place_of_worship' || ['park', 'garden', 'nature_reserve'].includes(t.leisure) ||
      t.landuse === 'religious' || t.boundary === 'protected_area' || t.heritage;
    const skip = (t) => t.boundary === 'administrative' || t.admin_level || t.place || t.boundary === 'postal_code' ||
      ['residential', 'commercial', 'retail', 'industrial', 'construction'].includes(t.landuse) || t.highway || t.railway || t.waterway || t.natural === 'water';
    const areas = [], near = [];
    for (const e of els) {
      const t = e.tags || {};
      if (!t.name || skip(t)) continue;
      if (e.bounds) {
        const b = e.bounds;
        const diag = G.distanceM(b.minlat, b.minlon, b.maxlat, b.maxlon);
        areas.push({ t, diag, bbox: [[b.minlat, b.minlon], [b.maxlat, b.maxlon]], rel: !!relevant(t) });
      } else {
        const c = e.center || (e.lat != null ? { lat: e.lat, lon: e.lon } : null);
        if (c) near.push({ t, d: G.distanceM(lat, lng, c.lat, c.lon) });
      }
    }
    const rel = areas.filter((a) => a.rel && a.diag < 8000).sort((a, b) => a.diag - b.diag);
    let pick = rel.find((a) => a.diag >= 150) || rel[rel.length - 1];
    if (!pick) pick = areas.filter((a) => a.diag >= 100 && a.diag < 5000).sort((a, b) => a.diag - b.diag)[0];
    const label = (t) => {
      const en = t['name:en'] || '';
      const ja = t['name:ja'] || t.name;
      return { name: en || t.name, local: en && ja && ja !== en ? ja : '' };
    };
    if (pick) return Object.assign(label(pick.t), { bbox: pick.bbox });
    if (near.length) { near.sort((a, b) => a.d - b.d); return Object.assign(label(near[0].t), { bbox: null }); }
    return null;
  }

  // ---------- real-world map (Leaflet) ----------
  const Real = {
    map: null, layers: null, base: null, markers: new Map(), me: null, meAcc: null, warp: null, programmatic: 0,
    init() {
      if (this.map || !window.L) return;
      const m = L.map('real', {
        zoomControl: false, zoomSnap: 0, zoomDelta: 0.5, wheelPxPerZoomLevel: 110, maxZoom: 21, minZoom: 2,
        tapTolerance: 12, attributionControl: true, fadeAnimation: false,
      });
      m.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
      this.layers = {
        sat: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
          maxNativeZoom: 19, maxZoom: 21, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
        }),
        street: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxNativeZoom: 19, maxZoom: 21, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
        }),
      };
      const last = Prefs.get('lastLoc', null);
      m.setView(last || [35.0116, 135.7681], last ? 16 : 13);
      this.map = m;
      this.setBase(Prefs.get('base', 'sat'));
      this.warp = new WarpLayer();
      this.warp.addTo(m);
      m.on('dragstart zoomstart', () => { if (!this.programmatic) S.mapTouched = true; });
    },
    setBase(k) {
      if (!this.map) return;
      if (this.base) this.map.removeLayer(this.base);
      this.base = this.layers[k] || this.layers.sat;
      this.base.addTo(this.map);
      this.base.bringToBack();
      Prefs.set('base', k);
    },
    set(fn) { this.programmatic++; try { fn(this.map); } finally { this.programmatic--; } },
    renderPins() {
      if (!this.map) return;
      const pts = S.rec ? S.rec.points : [];
      const keep = new Set(pts.map((p) => p.id));
      for (const [id, mk] of this.markers) if (!keep.has(id)) { this.map.removeLayer(mk); this.markers.delete(id); }
      pts.forEach((p, i) => {
        const html = pinSvg(i + 1, p, p.id === S.sel);
        let mk = this.markers.get(p.id);
        const icon = L.divIcon({ className: 'gz-pin', html, iconSize: [30, 40], iconAnchor: [15, 40] });
        if (!mk) {
          mk = L.marker([p.lat, p.lng], { icon, draggable: true, autoPan: true, keyboard: false });
          mk.on('click', () => selectPoint(p.id, false));
          mk.on('dragstart', () => { pushUndo(); });
          mk.on('drag', () => { const q = getPoint(p.id); if (q) { const ll = mk.getLatLng(); q.lat = ll.lat; q.lng = ll.lng; } });
          mk.on('dragend', () => { const q = getPoint(p.id); if (q) { const ll = mk.getLatLng(); q.lat = ll.lat; q.lng = ll.lng; q.src = q.src === 'gps' ? 'map' : q.src; } pointsChanged(); });
          mk.addTo(this.map);
          this.markers.set(p.id, mk);
        } else {
          mk.setLatLng([p.lat, p.lng]);
          mk.setIcon(icon);
        }
        if (p.id === S.sel) mk.dragging.enable(); else mk.dragging.disable();
        mk.setZIndexOffset(p.id === S.sel ? 1000 : 0);
      });
    },
    renderMe() {
      if (!this.map) return;
      const f = GPS.last;
      if (!f) { if (this.me) { this.map.removeLayer(this.me); this.map.removeLayer(this.meAcc); this.me = this.meAcc = null; } return; }
      if (!this.me) {
        this.meAcc = L.circle([f.lat, f.lng], { radius: f.acc, color: '#E2252B', weight: 1, fillOpacity: 0.12, interactive: false }).addTo(this.map);
        this.me = L.marker([f.lat, f.lng], { icon: L.divIcon({ className: '', html: '<div class="gz-me-map"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }), interactive: false, keyboard: false }).addTo(this.map);
      } else {
        this.me.setLatLng([f.lat, f.lng]);
        this.meAcc.setLatLng([f.lat, f.lng]);
        this.meAcc.setRadius(f.acc);
      }
    },
    invalidate() { if (this.map) this.map.invalidateSize({ pan: false }); },
  };

  function pinSvg(n, p, selected) {
    const fill = !p.on ? '#8a94a6' : p.src === 'gps' ? '#C2410C' : p.src === 'ai' ? '#6D28D9' : '#1D3A6E';
    const ring = selected ? '<circle cx="0" cy="-25" r="16.5" fill="none" stroke="#F2B705" stroke-width="3.5"/>' : '';
    const dash = p.src === 'ai' && !p.ok ? ' stroke-dasharray="3 2"' : '';
    return `<svg viewBox="-15 -40 30 40" aria-hidden="true">${ring}<path d="M0 0C-3-9-13-14-13-25A13 13 0 1 1 13-25C13-14 3-9 0 0Z" fill="${fill}" stroke="#fff" stroke-width="2"${dash}/>` +
      `<text x="0" y="-20.6" text-anchor="middle" font-size="13" font-weight="700" fill="#fff" font-family="BIZ UDGothic, Menlo, monospace">${n}</text></svg>`;
  }

  // Draws the photo, bent by the current fit, on top of the real map.
  const WarpLayer = window.L ? L.Layer.extend({
    onAdd(map) {
      this._map = map;
      this.canvas = L.DomUtil.create('canvas', 'gz-warp leaflet-zoom-animated');
      map.getPanes().overlayPane.appendChild(this.canvas);
      map.on('moveend resize', this.redraw, this);
      map.on('zoomanim', this._anim, this);
      this.redraw();
    },
    onRemove(map) {
      L.DomUtil.remove(this.canvas);
      map.off('moveend resize', this.redraw, this);
      map.off('zoomanim', this._anim, this);
    },
    _anim(e) {
      if (!this._tl) return;
      const scale = this._map.getZoomScale(e.zoom);
      const off = this._map._latLngToNewLayerPoint(this._tl, e.zoom, e.center);
      L.DomUtil.setTransform(this.canvas, off, scale);
    },
    redraw() {
      if (this._pending) return;
      this._pending = requestAnimationFrame(() => { this._pending = 0; this._draw(); });
    },
    _draw() {
      const map = this._map;
      if (!map || !this.canvas) return;
      const size = map.getSize();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cv = this.canvas;
      const tl = map.containerPointToLayerPoint([0, 0]);
      this._tl = map.containerPointToLatLng([0, 0]);
      L.DomUtil.setPosition(cv, tl);
      cv.style.width = size.x + 'px';
      cv.style.height = size.y + 'px';
      if (cv.width !== Math.round(size.x * dpr)) cv.width = Math.round(size.x * dpr);
      if (cv.height !== Math.round(size.y * dpr)) cv.height = Math.round(size.y * dpr);
      const ctx = cv.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      const op = Prefs.get('overlay', 0.45);
      if (!S.fit || !S.img || !(op > 0) || S.mode !== 'cal') return;
      cv.style.opacity = op;
      const W = S.rec.w, H = S.rec.h;
      const toPt = (u, v) => {
        const ll = imgToLatLng(u, v);
        if (!ll) return null;
        const p = map.latLngToContainerPoint(ll);
        return [p.x, p.y];
      };
      const type = S.fit.type;
      if (type === 'similarity' || type === 'affine') {
        const p0 = toPt(0, 0), p1 = toPt(W, 0), p2 = toPt(0, H);
        if (!p0 || !p1 || !p2) return;
        ctx.setTransform(dpr * (p1[0] - p0[0]) / W, dpr * (p1[1] - p0[1]) / W, dpr * (p2[0] - p0[0]) / H, dpr * (p2[1] - p0[1]) / H, dpr * p0[0], dpr * p0[1]);
        ctx.drawImage(S.img, 0, 0, W, H);
        return;
      }
      const nx = type === 'flex' ? 16 : 10;
      const ny = Math.max(4, Math.round(nx * H / W));
      const V = [];
      for (let j = 0; j <= ny; j++) {
        const row = [];
        for (let i = 0; i <= nx; i++) row.push(toPt(i * W / nx, j * H / ny));
        V.push(row);
      }
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const s00 = [i * W / nx, j * H / ny], s10 = [(i + 1) * W / nx, j * H / ny];
          const s01 = [i * W / nx, (j + 1) * H / ny], s11 = [(i + 1) * W / nx, (j + 1) * H / ny];
          const d00 = V[j][i], d10 = V[j][i + 1], d01 = V[j + 1][i], d11 = V[j + 1][i + 1];
          if (d00 && d10 && d11) drawTri(ctx, S.img, dpr, s00, s10, s11, d00, d10, d11);
          if (d00 && d11 && d01) drawTri(ctx, S.img, dpr, s00, s11, s01, d00, d11, d01);
        }
      }
    },
  }) : null;

  function drawTri(ctx, img, dpr, s0, s1, s2, d0, d1, d2) {
    const dx1 = s1[0] - s0[0], dy1 = s1[1] - s0[1], dx2 = s2[0] - s0[0], dy2 = s2[1] - s0[1];
    const det = dx1 * dy2 - dx2 * dy1;
    if (!det) return;
    const X1 = d1[0] - d0[0], Y1 = d1[1] - d0[1], X2 = d2[0] - d0[0], Y2 = d2[1] - d0[1];
    const a = (X1 * dy2 - X2 * dy1) / det, c = (X2 * dx1 - X1 * dx2) / det;
    const b = (Y1 * dy2 - Y2 * dy1) / det, d = (Y2 * dx1 - Y1 * dx2) / det;
    const e = d0[0] - a * s0[0] - c * s0[1], f = d0[1] - b * s0[0] - d * s0[1];
    // grow the clip triangle a little so neighbouring triangles overlap without hairline gaps
    const mx = (d0[0] + d1[0] + d2[0]) / 3, my = (d0[1] + d1[1] + d2[1]) / 3;
    const grow = (p) => { const vx = p[0] - mx, vy = p[1] - my, l = Math.hypot(vx, vy) || 1; return [p[0] + vx / l * 0.7, p[1] + vy / l * 0.7]; };
    const g0 = grow(d0), g1 = grow(d1), g2 = grow(d2);
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.beginPath();
    ctx.moveTo(g0[0], g0[1]); ctx.lineTo(g1[0], g1[1]); ctx.lineTo(g2[0], g2[1]);
    ctx.closePath();
    ctx.clip();
    ctx.transform(a, b, c, d, e, f);
    const minx = Math.max(0, Math.floor(Math.min(s0[0], s1[0], s2[0])) - 1), miny = Math.max(0, Math.floor(Math.min(s0[1], s1[1], s2[1])) - 1);
    const maxx = Math.min(S.rec.w, Math.ceil(Math.max(s0[0], s1[0], s2[0])) + 1), maxy = Math.min(S.rec.h, Math.ceil(Math.max(s0[1], s1[1], s2[1])) + 1);
    if (maxx > minx && maxy > miny) ctx.drawImage(img, minx, miny, maxx - minx, maxy - miny, minx, miny, maxx - minx, maxy - miny);
    ctx.restore();
  }

  // ---------- app state ----------
  const S = {
    screen: 'home', rec: null, img: null, proj: null, fit: null, fitFail: false, mode: 'cal', sel: null,
    undo: [], linked: true, follow: false, orient: Prefs.get('orient', 'photo'), trail: [], fixing: false,
    mapTouched: false, saveT: 0,
  };
  const photo = new PhotoView($('#photo'));

  const getPoint = (id) => S.rec && S.rec.points.find((p) => p.id === id);
  const onPoints = () => (S.rec ? S.rec.points.filter((p) => p.on) : []);

  function imgToLatLng(u, v) {
    const f = S.fit;
    if (!f) return null;
    let q = f.model.fwd(u, v);
    if (!q && f.backup) q = f.backup.fwd(u, v);
    return q ? S.proj.inv(q[0], q[1]) : null;
  }
  function latLngToImg(lat, lng) {
    const f = S.fit;
    if (!f) return null;
    const [E, N] = S.proj.fwd(lat, lng);
    let p = f.model.inv(E, N), approx = false;
    if (!p && f.backup) { p = f.backup.inv(E, N); approx = true; }
    return p && isFinite(p[0]) && isFinite(p[1]) ? { u: p[0], v: p[1], approx } : null;
  }
  const invAny = (E, N) => (S.fit.model.inv(E, N) || (S.fit.backup && S.fit.backup.inv(E, N)));
  const fwdAny = (u, v) => (S.fit.model.fwd(u, v) || (S.fit.backup && S.fit.backup.fwd(u, v)));

  function refit() {
    const rec = S.rec;
    S.fit = null;
    S.fitFail = false;
    if (!rec) return;
    if (!rec.origin && rec.points.length) rec.origin = { lat: rec.points[0].lat, lng: rec.points[0].lng };
    S.proj = rec.origin ? G.makeProj(rec.origin.lat, rec.origin.lng) : null;
    const on = onPoints();
    if (on.length >= 2 && S.proj) {
      const P = on.map((p) => [p.u, p.v]);
      const Q = on.map((p) => S.proj.fwd(p.lat, p.lng));
      const W = on.map((p) => 1 / Math.max(9, (p.acc || 6) ** 2));
      const f = G.autoFit(P, Q, W, { type: rec.fit || 'auto', width: rec.w, height: rec.h });
      if (f.model) { f.ids = on.map((p) => p.id); S.fit = f; } else S.fitFail = true;
    }
    if (Real.warp) Real.warp.redraw();
  }

  function pointError(id) {
    const f = S.fit;
    if (!f) return null;
    const i = f.ids.indexOf(id);
    if (i < 0) return null;
    return f.pointErrors ? f.pointErrors[i] : f.residuals[i];
  }

  function save() {
    clearTimeout(S.saveT);
    const rec = S.rec;
    if (!rec) return;
    S.saveT = setTimeout(() => {
      rec.updated = Date.now();
      rec.quality = S.fit && S.rec === rec ? { type: S.fit.type, loo: S.fit.loo, n: S.fit.n } : null;
      Store.put(rec);
    }, 350);
  }

  function pushUndo() {
    if (!S.rec) return;
    S.undo.push(JSON.stringify(S.rec.points));
    if (S.undo.length > 50) S.undo.shift();
  }
  function pointsChanged(msg) {
    refit();
    save();
    renderMap();
    if (msg) toast(msg);
  }

  // ---------- screens ----------
  function show(id) {
    for (const s of ['home', 'mapscreen', 'straighten']) $('#' + s).hidden = s !== id;
    if (S.screen !== id) $('#toast').hidden = true;
    S.screen = id;
    if (id === 'mapscreen') GPS.start(); else if (id === 'home') { GPS.stop(); releaseWake(); }
  }

  async function renderHome() {
    const maps = (await Store.all()).sort((a, b) => (b.updated || 0) - (a.updated || 0));
    $('#maps-wrap').hidden = !maps.length;
    $('#maps').innerHTML = maps.map((m) => {
      const n = (m.points || []).filter((p) => p.on).length;
      const chip = n >= 2 ? `<span class="chip ok">Ready${m.quality && m.quality.loo != null ? ' · ±' + esc(fmtM(m.quality.loo)) : ''}</span>`
        : `<span class="chip warn">${n ? '1 more spot' : 'Needs 2 spots'}</span>`;
      const when = new Date(m.created || Date.now()).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
      const sub = [m.place && m.place.local, when].filter(Boolean).join(' · ');
      return `<button class="map-card" data-id="${esc(m.id)}"><img src="${esc(m.thumb || '')}" alt=""><div style="min-width:0"><div class="t">${esc(m.name)}</div><div class="s">${esc(sub)}</div></div>${chip}</button>`;
    }).join('');
  }

  async function openMap(rec, fresh) {
    busy('Opening map…');
    let img;
    try { img = await decodeBlob(rec.img); } catch (e) { unbusy(); toast('This map photo could not be read.'); return; }
    unbusy();
    S.rec = rec; S.img = img; S.sel = null; S.undo = []; S.trail = []; S.fixing = false; S.follow = false; S.mapTouched = false;
    S.fresh = !!fresh;
    show('mapscreen');
    photo.rot = 0;
    photo.setImage(img, rec.w, rec.h);
    Real.init();
    refit();
    setMode(S.fit && !fresh ? 'loc' : 'cal', true);
    Real.renderPins();
    placeRealMap();
    renderMap();
    if (!rec.place) identify();
    if (Prefs.get('compass', false) && !Compass.needsPermission()) Compass.enable(false);
  }

  function setMode(m, initial) {
    S.mode = m;
    S.fixing = false;
    if (m !== 'cal') S.sel = null;
    $('#mode-cal').setAttribute('aria-pressed', String(m === 'cal'));
    $('#mode-loc').setAttribute('aria-pressed', String(m === 'loc'));
    $('#views').classList.toggle('split', m === 'cal');
    if (m === 'loc') {
      requestWake();
      if (S.orient !== 'photo') applyOrient(!initial);
      // keep the dot in view while walking, until the photo is dragged
      if (S.fit) { S.follow = true; if (GPS.fresh(60000)) setTimeout(() => centerOnMe(!initial), 50); }
    } else {
      releaseWake();
      S.follow = false;
      if (photo.rot) photo.animateTo({ rot: 0 }, 250);
    }
    requestAnimationFrame(() => {
      Real.invalidate();
      if (m === 'cal') { if (S.linked && S.fit) syncReal(); if (Real.warp) Real.warp.redraw(); }
    });
    renderMap();
  }

  function renderMap() {
    if (!S.rec || S.screen !== 'mapscreen') return;
    const rec = S.rec, n = onPoints().length, cal = S.mode === 'cal', fit = S.fit;
    $('#map-title').textContent = rec.name;
    $('#map-sub').textContent = S.identifying ? 'Finding the place…' : (rec.place && rec.place.local) || 'Tap to rename';
    $('#photo-cross').hidden = !(cal || S.fixing);
    $('#photo-label').hidden = !cal;
    $('#cal-actions').hidden = !cal || !!S.sel;
    $('#sel-actions').hidden = !cal || !S.sel;
    $('#loc-actions').hidden = cal || S.fixing;
    $('#fix-actions').hidden = !S.fixing;
    $('#link-btn').hidden = !(cal && fit);
    $('#link-btn').setAttribute('aria-pressed', String(S.linked));
    $('#link-btn use').setAttribute('href', S.linked ? '#i-link' : '#i-unlink');
    $('#north-btn').hidden = !fit;
    $('#follow-btn').hidden = cal || !fit || S.fixing;
    $('#follow-btn').setAttribute('aria-pressed', String(S.follow));
    $('#fix-btn').hidden = cal || !fit || S.fixing;
    $('#compass-btn').hidden = cal || Compass.on || !Compass.supported() || !Compass.needsPermission();
    $('#points-label').textContent = n === 1 ? '1 spot' : n + ' spots';
    $('#undo-btn').disabled = !S.undo.length;
    const sel = S.sel && getPoint(S.sel);
    if (sel) {
      $('#sel-toggle').setAttribute('aria-label', sel.on ? 'Switch this spot off' : 'Switch this spot on');
      $('#sel-toggle use').setAttribute('href', sel.on ? '#i-eye' : '#i-x');
    }
    renderStatus();
    Real.renderPins();
    Real.renderMe();
    if (Real.warp) Real.warp.redraw();
    updateNorth();
    updateScale();
    updateMe();
    photo.request();
  }

  function renderStatus() {
    const n = onPoints().length, fit = S.fit;
    let html;
    if (S.fixing) html = 'Drag the photo until the crosshair is <b>where you are standing</b>.';
    else if (S.mode === 'cal') {
      if (S.sel) {
        const p = getPoint(S.sel), i = S.rec.points.indexOf(p) + 1, err = pointError(p.id);
        html = `<b>Spot ${i}</b> · ${p.src === 'gps' ? 'your GPS position' : p.src === 'ai' ? 'suggested by Claude' : 'pinned on the map'}${err != null ? ' · off by <span class="num">' + fmtM(err) + '</span>' : ''}`;
      } else if (n === 0) {
        html = S.fresh
          ? 'At the board? Put the crosshair on its <span class="here-word" lang="ja">現在地</span> mark and tap <b>I\'m here</b>. Or line up one spot in both views and tap <b>Pin spot</b>.'
          : 'Put both crosshairs on the same spot (a gate, bridge or corner), then tap <b>Pin spot</b>.';
      } else if (n === 1) html = '<b>1 spot.</b> Line up one more, far from the first, and tap <b>Pin spot</b>.';
      else if (!fit) html = S.fitFail ? '<b>These spots don\'t work together.</b> Spread them out, not in a line.' : '';
      else if (fit.loo == null) html = `<b>Ready.</b> <button class="linkbtn" id="go-walk">Walk now</button>, or pin a ${n === 2 ? '3rd' : 'further'} spot to check accuracy.`;
      else html = `<b>${n} spots</b> · ${FIT_NAMES[fit.type]} · typical error <span class="num">±${fmtM(fit.loo)}</span>`;
    } else {
      if (!fit) html = 'Pin 2 spots first: switch to <b>Pin spots</b>.';
      else {
        const g = GPS.state, f = GPS.last;
        if (g === 'denied') html = '<b>Location is off for this page.</b> <button class="linkbtn" id="loc-help">How to turn it on</button>';
        else if (g === 'insecure') html = 'Location needs the https:// address of this page.';
        else if (g === 'unsupported') html = 'This browser cannot share your location.';
        else if (!f) html = 'Looking for GPS…';
        else {
          const age = (Date.now() - f.t) / 1000;
          html = `GPS <span class="num">±${fmtM(f.acc)}</span>` + (fit.loo != null ? ` · map fit <span class="num">±${fmtM(fit.loo)}</span>` : '') + (age > 30 ? ' · <b>last fix ' + Math.round(age) + ' s ago</b>' : '');
        }
      }
    }
    $('#status-text').innerHTML = html || '&nbsp;';
    const lh = $('#loc-help');
    if (lh) lh.onclick = showLocationHelp;
    const gw = $('#go-walk');
    if (gw) gw.onclick = () => setMode('loc');
  }

  // ---------- photo overlay: pins, residuals, trail ----------
  function drawPinShape(ctx, x, y, n, fill, selected, dashed) {
    ctx.save();
    ctx.translate(x, y);
    if (selected) {
      ctx.beginPath(); ctx.arc(0, -25, 16.5, 0, Math.PI * 2);
      ctx.strokeStyle = '#F2B705'; ctx.lineWidth = 3.5; ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-3, -9, -13, -14, -13, -25);
    ctx.arc(0, -25, 13, Math.PI, 0, false);
    ctx.bezierCurveTo(13, -14, 3, -9, 0, 0);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 1;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = 2; ctx.strokeStyle = '#fff';
    if (dashed) ctx.setLineDash([3, 2]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#fff';
    ctx.font = '700 13px "BIZ UDGothic", Menlo, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(n), 0, -24.5);
    ctx.beginPath(); ctx.arc(0, 0, 2.6, 0, Math.PI * 2);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.lineWidth = 1.2; ctx.strokeStyle = '#000'; ctx.stroke();
    ctx.restore();
  }

  photo.overlay = (ctx, v) => {
    if (!S.rec) return;
    const cal = S.mode === 'cal';
    // walked trail
    if (!cal && S.trail.length > 1 && S.fit) {
      ctx.save();
      ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(226,37,43,0.55)';
      ctx.setLineDash([2, 6]);
      ctx.beginPath();
      let started = false;
      for (const t of S.trail) {
        const r = latLngToImg(t.lat, t.lng);
        if (!r) { started = false; continue; }
        const [x, y] = v.toScreen(r.u, r.v);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    }
    const pts = S.rec.points;
    // where the fit puts each spot: a line from the pin to the fitted position
    if (cal && S.fit) {
      ctx.save();
      for (const p of pts) {
        if (!p.on) continue;
        const r = latLngToImg(p.lat, p.lng);
        if (!r) continue;
        const a = v.toScreen(p.u, p.v), b = v.toScreen(r.u, r.v);
        if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 3) continue;
        ctx.strokeStyle = '#F2B705'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        ctx.beginPath(); ctx.arc(b[0], b[1], 4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fill(); ctx.stroke();
      }
      ctx.restore();
    }
    const showPins = cal || Prefs.get('pinsInWalk', true);
    if (!showPins) return;
    pts.forEach((p, i) => {
      const [x, y] = v.toScreen(p.u, p.v);
      if (x < -40 || y < -10 || x > v.w + 40 || y > v.h + 50) return;
      const fill = !p.on ? '#8a94a6' : p.src === 'gps' ? '#C2410C' : p.src === 'ai' ? '#6D28D9' : '#1D3A6E';
      ctx.globalAlpha = cal ? 1 : 0.55;
      drawPinShape(ctx, x, y, i + 1, fill, p.id === S.sel, p.src === 'ai' && !p.ok);
      ctx.globalAlpha = 1;
    });
  };

  function pinAt(p) {
    if (!S.rec) return null;
    let best = null, bd = 24;
    S.rec.points.forEach((q) => {
      const [x, y] = photo.toScreen(q.u, q.v);
      const d = Math.min(Math.hypot(p[0] - x, p[1] - (y - 24)), Math.hypot(p[0] - x, p[1] - y) + 4);
      if (d < bd) { bd = d; best = q.id; }
    });
    return best;
  }

  let pinDrag = null;
  photo.onPinDown = (p) => {
    if (S.mode !== 'cal' || !S.sel) return false;
    if (pinAt(p) !== S.sel) return false;
    const q = getPoint(S.sel);
    const [x, y] = photo.toScreen(q.u, q.v);
    pushUndo();
    pinDrag = { id: q.id, dx: x - p[0], dy: y - p[1] };
    return true;
  };
  photo.onPinMove = (p) => {
    if (!pinDrag) return;
    const q = getPoint(pinDrag.id);
    if (!q) return;
    const [u, v] = photo.toImage(p[0] + pinDrag.dx, p[1] + pinDrag.dy);
    q.u = clamp(u, 0, S.rec.w); q.v = clamp(v, 0, S.rec.h);
    photo.request();
  };
  photo.onPinUp = () => { if (pinDrag) { pinDrag = null; pointsChanged(); } };
  photo.onTap = (p) => {
    if (S.mode !== 'cal' || S.fixing) return;
    const id = pinAt(p);
    if (id) selectPoint(id, true);
    else if (S.sel) selectPoint(null);
  };

  let syncRaf = 0;
  photo.onView = (user, ended) => {
    if (user && S.follow && !S.followMoving) { S.follow = false; $('#follow-btn').setAttribute('aria-pressed', 'false'); }
    if (user && S.mode === 'cal' && S.linked && S.fit && !S.sel) {
      if (!syncRaf) syncRaf = requestAnimationFrame(() => { syncRaf = 0; syncReal(); });
    }
    if (S.orient !== 'photo' && S.mode === 'loc' && ended && user) applyOrient(false);
    updateMe();
    updateNorth();
    updateScale();
  };

  function syncReal() {
    if (!Real.map || !S.fit || S.mode !== 'cal' || !S.linked) return;
    const [u, v] = photo.center();
    const ll = imgToLatLng(u, v);
    if (!ll) return;
    const J = G.jacobian(fwdAny, u, v, 2);
    if (!J) return;
    const mpp = Math.sqrt(Math.abs(J[0][0] * J[1][1] - J[0][1] * J[1][0])) / photo.s;
    if (!(mpp > 0)) return;
    const z = Math.log2(156543.03392 * Math.cos(ll[0] * D2R) / mpp);
    Real.set((m) => m.setView(ll, clamp(z, 3, 21), { animate: false }));
  }

  function placeRealMap() {
    if (!Real.map) return;
    const rec = S.rec;
    Real.invalidate();
    Real.set((m) => {
      if (S.fit) {
        const c = [[0, 0], [rec.w, 0], [rec.w, rec.h], [0, rec.h]].map((p) => imgToLatLng(p[0], p[1])).filter(Boolean);
        if (c.length >= 2) { m.fitBounds(L.latLngBounds(c), { padding: [12, 12], animate: false, maxZoom: 19 }); return; }
      }
      if (rec.place && rec.place.bbox) { m.fitBounds(rec.place.bbox, { padding: [12, 12], animate: false, maxZoom: 18 }); return; }
      if (rec.points.length) { const p = rec.points[rec.points.length - 1]; m.setView([p.lat, p.lng], 18, { animate: false }); return; }
      if (rec.hint) { m.setView([rec.hint.lat, rec.hint.lng], 17, { animate: false }); return; }
      const f = GPS.fresh(120000);
      if (f) m.setView([f.lat, f.lng], 17, { animate: false });
    });
  }

  // ---------- place identification ----------
  async function identify() {
    const rec = S.rec;
    let loc = rec.hint;
    if (!loc && S.fresh) {
      let f = GPS.fresh(60000);
      for (let i = 0; !f && i < 24 && S.rec === rec && GPS.state !== 'denied'; i++) { await sleep(500); f = GPS.fresh(60000); }
      if (f && f.acc < 500) loc = { lat: f.lat, lng: f.lng, acc: f.acc, from: 'gps' };
    }
    if (!loc || S.rec !== rec) { renderMap(); return; }
    if (!rec.hint) { rec.hint = loc; save(); }
    S.identifying = true;
    if (!S.mapTouched && !S.fit && !rec.points.length && Real.map) Real.set((m) => m.setView([loc.lat, loc.lng], 17, { animate: false }));
    renderMap();
    let r = null;
    try { r = await Place.identify(loc.lat, loc.lng); } finally { S.identifying = false; }
    if (S.rec !== rec) return;
    if (!r) { renderMap(); return; }
    rec.place = r;
    if (!rec.renamed) rec.name = r.name;
    save();
    if (r.bbox && !S.mapTouched && !S.fit && !rec.points.length && Real.map) Real.set((m) => m.fitBounds(r.bbox, { padding: [12, 12], animate: false, maxZoom: 18 }));
    renderMap();
    toast('This looks like ' + r.name + (r.local ? ' (' + r.local + ')' : ''));
  }

  // ---------- actions ----------
  function crossOnPhoto() {
    const [u, v] = photo.center();
    if (u < 0 || v < 0 || u > S.rec.w || v > S.rec.h) { toast('Put the photo crosshair on the map first.'); return null; }
    return [u, v];
  }

  function doMatch() {
    if (!Real.map) { toast('The real map did not load. Check your connection.'); return; }
    const uv = crossOnPhoto();
    if (!uv) return;
    const c = Real.map.getCenter();
    const mpp = 156543.03392 * Math.cos(c.lat * D2R) / Math.pow(2, Real.map.getZoom());
    pushUndo();
    S.rec.points.push({ id: uid(), u: uv[0], v: uv[1], lat: c.lat, lng: c.lng, src: 'map', acc: clamp(3 + 6 * mpp, 3, 80), on: true, t: Date.now() });
    if (!S.rec.origin) S.rec.origin = { lat: c.lat, lng: c.lng };
    pointsChanged('Spot ' + S.rec.points.length + ' pinned');
  }

  async function doHere(fixing) {
    const uv = crossOnPhoto();
    if (!uv) return false;
    if (GPS.state === 'denied') { showLocationHelp(); return false; }
    if (GPS.state === 'unsupported' || GPS.state === 'insecure') { toast('Location is not available in this browser.'); return false; }
    let stop = false;
    busy('Measuring where you are…', () => { stop = true; });
    const fix = await GPS.sample(fixing ? 3500 : 6000, 8, (fx) => {
      if (stop) return;
      const b = fx.length ? Math.min(...fx.map((f) => f.acc)) : null;
      $('#busy-text').textContent = b == null ? 'Waiting for GPS…' : `Measuring where you are… ±${fmtM(b)}`;
    });
    unbusy();
    if (stop) return false;
    if (!fix) { toast('No GPS fix yet. Step into the open and try again.'); return false; }
    pushUndo();
    S.rec.points.push({ id: uid(), u: uv[0], v: uv[1], lat: fix.lat, lng: fix.lng, src: 'gps', acc: Math.max(4, fix.acc), on: true, t: Date.now() });
    if (!S.rec.origin) S.rec.origin = { lat: fix.lat, lng: fix.lng };
    pointsChanged((fixing ? 'Thanks, fit updated' : 'Pinned your position') + ` (GPS ±${fmtM(fix.acc)})`);
    if (fix.acc > 40) toast(`GPS is rough here (±${fmtM(fix.acc)}), so this spot counts less.`);
    return true;
  }

  function selectPoint(id, centre) {
    S.sel = id || null;
    const p = id && getPoint(id);
    if (p && S.mode === 'cal') {
      if (centre) photo.animateTo({ cx: p.u, cy: p.v }, 300);
      if (Real.map) Real.set((m) => m.panTo([p.lat, p.lng], { animate: true, duration: 0.3 }));
    }
    renderMap();
  }

  function moveSelected() {
    const p = getPoint(S.sel);
    if (!p || !Real.map) return;
    const uv = crossOnPhoto();
    if (!uv) return;
    const c = Real.map.getCenter();
    pushUndo();
    p.u = uv[0]; p.v = uv[1]; p.lat = c.lat; p.lng = c.lng; p.src = p.src === 'gps' ? 'map' : p.src; p.ok = true;
    if (p.src === 'ai') p.acc = Math.min(p.acc, 8);
    pointsChanged('Spot moved');
  }

  function centerOnMe(animate) {
    const f = GPS.last;
    if (!f || !S.fit) return false;
    const r = latLngToImg(f.lat, f.lng);
    if (!r) return false;
    // outside the photo: leave the view alone, the edge arrow points the way
    const pad = 0.05 * Math.max(S.rec.w, S.rec.h);
    if (r.u < -pad || r.v < -pad || r.u > S.rec.w + pad || r.v > S.rec.h + pad) return false;
    S.followMoving = true;
    photo.animateTo({ cx: r.u, cy: r.v }, animate ? 450 : 0, false);
    setTimeout(() => { S.followMoving = false; }, 500);
    return true;
  }

  // ---------- orientation, north arrow, scale bar ----------
  function northAngleAt(u, v) {
    if (!S.fit) return null;
    const q = fwdAny(u, v);
    if (!q) return null;
    const a = invAny(q[0], q[1] + 4), b = invAny(q[0], q[1] - 4);
    if (!a || !b) return null;
    return Math.atan2(a[1] - b[1], a[0] - b[0]);
  }
  function applyOrient(animate) {
    if (!S.fit) return;
    const [u, v] = photo.center();
    const na = northAngleAt(clamp(u, 0, S.rec.w), clamp(v, 0, S.rec.h));
    if (na == null) return;
    let target = 0;
    if (S.orient === 'north') target = -Math.PI / 2 - na;
    else if (S.orient === 'heading' && Compass.heading != null) target = -Math.PI / 2 - na - Compass.heading * D2R;
    if (animate) photo.animateTo({ rot: target }, 350);
    else { photo.rot = target; photo.request(); updateMe(); updateNorth(); }
  }
  function updateNorth() {
    const btn = $('#north-btn');
    if (btn.hidden || !S.fit) return;
    const [u, v] = photo.center();
    const na = northAngleAt(clamp(u, 0, S.rec.w), clamp(v, 0, S.rec.h));
    if (na == null) return;
    const deg = (na + photo.rot) / D2R + 90;
    btn.querySelector('svg').style.transform = `rotate(${deg}deg)`;
    const badge = $('#north-badge');
    badge.textContent = S.orient === 'north' ? 'N' : S.orient === 'heading' ? 'Me' : '';
    badge.hidden = S.orient === 'photo';
    btn.setAttribute('aria-label', S.orient === 'photo' ? 'Photo shown as taken. Tap to put north up' : S.orient === 'north' ? 'North is up. Tap to turn with you' : 'Turning with you. Tap to show the photo as taken');
  }
  function updateScale() {
    const el = $('#scalebar');
    if (!S.fit || S.fixing) { el.hidden = true; return; }
    const [u, v] = photo.center();
    const J = G.jacobian(fwdAny, clamp(u, 0, S.rec.w), clamp(v, 0, S.rec.h), 2);
    if (!J) { el.hidden = true; return; }
    const mpp = Math.sqrt(Math.abs(J[0][0] * J[1][1] - J[0][1] * J[1][0])) / photo.s;
    if (!(mpp > 0)) { el.hidden = true; return; }
    const target = mpp * 90;
    const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000, 20000, 50000];
    let L = steps[0];
    for (const s of steps) if (s <= target * 1.3) L = s;
    el.hidden = false;
    el.querySelector('span').textContent = fmtM(L);
    el.querySelector('i').style.width = (L / mpp) + 'px';
  }

  function updateMe() {
    const el = $('#me'), off = $('#offmap');
    const f = GPS.last;
    if (!S.rec || !f || !S.fit || S.screen !== 'mapscreen') { el.hidden = true; off.hidden = true; return; }
    const r = latLngToImg(f.lat, f.lng);
    if (!r) { el.hidden = true; off.hidden = true; return; }
    const [x, y] = photo.toScreen(r.u, r.v);
    const [E, N] = S.proj.fwd(f.lat, f.lng);
    const J = G.jacobian(invAny, E, N, 1);
    const c = Math.cos(photo.rot), s = Math.sin(photo.rot), k = photo.s;
    const M = J ? [[k * (c * J[0][0] - s * J[1][0]), k * (c * J[0][1] - s * J[1][1])], [k * (s * J[0][0] + c * J[1][0]), k * (s * J[0][1] + c * J[1][1])]] : null;
    const margin = 18;
    const visible = x >= margin && y >= margin && x <= photo.w - margin && y <= photo.h - margin;
    el.hidden = !visible;
    el.classList.toggle('stale', Date.now() - f.t > 30000);
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    const acc = el.querySelector('.acc');
    if (M) {
      const q = f.acc / 50;
      const big = Math.abs(M[0][0] * q) > 3000 || Math.abs(M[1][1] * q) > 3000;
      acc.hidden = big;
      acc.style.transform = `matrix(${M[0][0] * q}, ${M[1][0] * q}, ${M[0][1] * q}, ${M[1][1] * q}, 0, 0)`;
    } else acc.hidden = true;
    const cone = el.querySelector('.cone');
    const h = Compass.heading != null && Compass.state === 'on' ? Compass.heading : (f.heading != null && f.speed > 0.8 ? f.heading : null);
    if (h != null && M) {
      const dE = Math.sin(h * D2R), dN = Math.cos(h * D2R);
      const sx = M[0][0] * dE + M[0][1] * dN, sy = M[1][0] * dE + M[1][1] * dN;
      cone.style.transform = `rotate(${(Math.atan2(sy, sx) / D2R + 90).toFixed(1)}deg)`;
      cone.hidden = false;
    } else cone.hidden = true;
    el.querySelector('.lbl').hidden = S.mode === 'cal';
    if (visible) { off.hidden = true; return; }
    // arrow at the edge pointing towards you
    const cxs = photo.w / 2, cys = photo.h / 2;
    const dx = x - cxs, dy = y - cys;
    const pad = 34;
    const tx = dx ? (dx > 0 ? (photo.w - pad - cxs) / dx : (pad - cxs) / dx) : Infinity;
    const ty = dy ? (dy > 0 ? (photo.h - pad - cys) / dy : (pad - cys) / dy) : Infinity;
    const t = Math.min(tx, ty, 1);
    const ex = cxs + dx * t, ey = cys + dy * t;
    const centreLL = imgToLatLng(photo.cx, photo.cy);
    const dist = centreLL ? G.distanceM(centreLL[0], centreLL[1], f.lat, f.lng) : null;
    off.hidden = false;
    off.querySelector('span').textContent = dist != null ? fmtM(dist) : 'You';
    off.querySelector('svg').style.transform = `rotate(${Math.atan2(dy, dx) / D2R}deg)`;
    const bw = off.offsetWidth || 70, bh = off.offsetHeight || 28;
    off.style.transform = `translate(${clamp(ex - bw / 2, 6, photo.w - bw - 6)}px, ${clamp(ey - bh / 2, 6, photo.h - bh - 6)}px)`;
  }

  GPS.subs.add(() => {
    const f = GPS.last;
    if (f && S.screen === 'mapscreen' && f.acc < 35) {
      const last = S.trail[S.trail.length - 1];
      if (!last || G.distanceM(last.lat, last.lng, f.lat, f.lng) > 4) { S.trail.push({ lat: f.lat, lng: f.lng }); if (S.trail.length > 600) S.trail.shift(); }
    }
    if (S.follow && S.mode === 'loc') centerOnMe(true);
    if (S.screen === 'mapscreen') {
      renderStatus();
      Real.renderMe();
      updateMe();
      photo.request();
    }
  });
  Compass.subs.add(() => {
    if (S.screen !== 'mapscreen') return;
    if (S.mode === 'loc' && S.orient === 'heading') applyOrient(false);
    updateMe();
    if (Compass.state === 'denied') toast('Compass access was declined. You can still use north-up.');
    $('#compass-btn').hidden = S.mode === 'cal' || Compass.on || !Compass.needsPermission();
  });

  // ---------- wake lock ----------
  let wake = null;
  async function requestWake() {
    try {
      if ('wakeLock' in navigator && !wake && document.visibilityState === 'visible') {
        wake = await navigator.wakeLock.request('screen');
        wake.addEventListener('release', () => { wake = null; });
      }
    } catch (e) { /* not allowed */ }
  }
  function releaseWake() { try { if (wake) wake.release(); } catch (e) { /* ignore */ } wake = null; }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (S.screen === 'mapscreen') { GPS.start(); if (S.mode === 'loc') requestWake(); }
    } else GPS.stop();
  });

  // ---------- UI helpers ----------
  let toastT = 0;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.toggle('top', !$('#sheet').hidden);
    t.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(() => { t.hidden = true; }, Math.min(6000, 1800 + msg.length * 45));
  }
  let busyStop = null;
  function busy(text, onStop) {
    $('#busy-text').textContent = text;
    $('#busy').hidden = false;
    busyStop = onStop || null;
    $('#busy-stop').hidden = !onStop;
  }
  function unbusy() { $('#busy').hidden = true; busyStop = null; }
  $('#busy-stop').onclick = () => { const f = busyStop; unbusy(); if (f) f(); };

  function openSheet(html, onMount) {
    const wrap = $('#sheet'), body = $('#sheet-body');
    body.innerHTML = '<div class="grab"></div>' + html;
    wrap.hidden = false;
    $('#toast').hidden = true;
    if (onMount) onMount(body);
    const first = body.querySelector('input, button:not(.x)');
    if (first && first.tagName === 'INPUT' && first.type !== 'range') setTimeout(() => first.focus(), 60);
  }
  function closeSheet() { $('#sheet').hidden = true; $('#sheet-body').innerHTML = ''; }
  $('#sheet').addEventListener('click', (e) => { if (e.target === $('#sheet')) closeSheet(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet(); });

  function showLocationHelp() {
    const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    openSheet(`<h2>Turn on location</h2>
      <p>${ios ? 'On iPhone: open <b>Settings › Privacy &amp; Security › Location Services</b>, make sure it is on, then set <b>Safari Websites</b> to <b>While Using</b>. Back in Safari, tap <b>aA</b> in the address bar › <b>Website Settings</b> › <b>Location: Allow</b>.' :
      'Tap the icon left of the address bar, open <b>Permissions</b> (or Site settings) and allow <b>Location</b>. Also check that location is on in your phone\'s quick settings.'}</p>
      <p>Then reload this page.</p>
      <div class="group"><button class="btn primary" id="reload-btn">Reload</button></div>`, (b) => { b.querySelector('#reload-btn').onclick = () => location.reload(); });
  }

  function openPoints() {
    const rec = S.rec, fit = S.fit, n = onPoints().length;
    const rows = rec.points.map((p, i) => {
      const err = pointError(p.id);
      const bad = err != null && fit && fit.pointErrors && err > Math.max(15, 3 * median(fit.pointErrors));
      const kind = p.src === 'gps' ? `Your GPS position (±${fmtM(p.acc)})` : p.src === 'ai' ? (p.ok ? 'Suggested by Claude, checked' : 'Suggested by Claude') : 'Pinned on the map';
      return `<div class="pt${p.on ? '' : ' off'}"><button class="n${p.src === 'ai' ? ' ai' : ''}" data-sel="${p.id}" aria-label="Show spot ${i + 1}">${i + 1}</button>
        <div class="d"><b>${p.label ? esc(p.label) : 'Spot ' + (i + 1)}</b><small>${kind}</small></div>
        <div class="err${bad ? ' bad' : ''}">${!p.on ? 'off' : err != null ? (bad ? 'check · ' : '') + fmtM(err) : ''}</div>
        <button class="btn small" data-tog="${p.id}">${p.on ? 'Turn off' : 'Turn on'}</button></div>`;
    }).join('');
    const types = ['auto', 'similarity', 'affine', 'perspective', 'flex'];
    const min = { auto: 2, similarity: 2, affine: 3, perspective: 4, flex: 5 };
    const cur = rec.fit || 'auto';
    const fitText = fit ? `Using <b>${FIT_NAMES[fit.type]}</b>${fit.loo != null ? ` · typical error <span class="num">±${fmtM(fit.loo)}</span>` : ''}` : (n >= 2 ? 'These spots don\'t give a usable fit.' : 'Pin at least 2 spots.');
    openSheet(`<h2>Spots and fit</h2>
      <p class="fitline">${fitText}</p>
      <div class="pts">${rows || '<p>No spots yet.</p>'}</div>
      <div class="group"><div class="label">How the photo is matched</div>
      <div class="radios">${types.map((t) => `<button data-fit="${t}" aria-pressed="${t === cur}" ${n < min[t] ? 'disabled' : ''}>${t === 'auto' ? 'Auto' : FIT_NAMES[t]}</button>`).join('')}</div>
      <p id="fit-help">${FIT_HELP[cur]}</p></div>
      <p>The number after each spot is how far off it is when the others are used to place it. A spot marked <b>check</b> probably sits in the wrong place.</p>`, (b) => {
      b.querySelectorAll('[data-sel]').forEach((x) => { x.onclick = () => { closeSheet(); if (S.mode !== 'cal') setMode('cal'); selectPoint(x.dataset.sel, true); }; });
      b.querySelectorAll('[data-tog]').forEach((x) => {
        x.onclick = () => { const p = getPoint(x.dataset.tog); if (!p) return; pushUndo(); p.on = !p.on; pointsChanged(); openPoints(); };
      });
      b.querySelectorAll('[data-fit]').forEach((x) => {
        x.onclick = () => { rec.fit = x.dataset.fit; pointsChanged(); openPoints(); };
      });
    });
  }
  const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

  function openMore() {
    const rec = S.rec;
    const op = Prefs.get('overlay', 0.45);
    const base = Prefs.get('base', 'sat');
    openSheet(`<h2>${esc(rec.name)}</h2>
      <div class="group">
        <button class="menu-item" data-act="points"><svg class="i"><use href="#i-list"/></svg><div>Spots and fit<small>${onPoints().length} spots${S.fit ? ' · ' + FIT_NAMES[S.fit.type] : ''}</small></div></button>
        <button class="menu-item" data-act="straighten"><svg class="i"><use href="#i-square"/></svg><div>Straighten photo<small>Square up a board photographed at an angle</small></div></button>
        <button class="menu-item" data-act="claude"><svg class="i"><use href="#i-spark"/></svg><div>Find spots with Claude<small>${Prefs.get('apiKey', '') ? 'Reads the map\'s labels and pins those places' : 'Reads the map\'s labels and pins those places (needs your API key)'}</small></div></button>
        <button class="menu-item" data-act="search"><svg class="i"><use href="#i-search"/></svg><div>Find a place on the real map</div></button>
        <button class="menu-item" data-act="rename"><svg class="i"><use href="#i-sliders"/></svg><div>Rename</div></button>
      </div>
      <div class="group"><div class="label">Real map</div>
        <div class="radios"><button data-base="sat" aria-pressed="${base === 'sat'}">Satellite</button><button data-base="street" aria-pressed="${base === 'street'}">Street map</button></div>
      </div>
      <div class="group"><label class="label" for="ov">Photo laid over the real map</label>
        <input type="range" id="ov" min="0" max="0.9" step="0.05" value="${op}"></div>
      <div class="group"><button class="menu-item" data-act="pins"><svg class="i"><use href="#i-eye"/></svg><div>${Prefs.get('pinsInWalk', true) ? 'Hide' : 'Show'} spots while walking</div></button>
        <button class="menu-item" data-act="trail"><svg class="i"><use href="#i-undo"/></svg><div>Clear the walked trail</div></button>
        <button class="menu-item danger" data-act="delete"><svg class="i"><use href="#i-trash"/></svg><div>Delete this map</div></button></div>`, (b) => {
      b.querySelector('#ov').oninput = (e) => { Prefs.set('overlay', +e.target.value); if (Real.warp) Real.warp.redraw(); };
      b.querySelectorAll('[data-base]').forEach((x) => { x.onclick = () => { Real.setBase(x.dataset.base); closeSheet(); }; });
      b.querySelectorAll('[data-act]').forEach((x) => {
        x.onclick = () => {
          const a = x.dataset.act;
          if (a === 'points') { openPoints(); return; }
          if (a === 'straighten') { closeSheet(); openStraighten(); return; }
          if (a === 'claude') { closeSheet(); askClaude(); return; }
          if (a === 'search') { openSearch(); return; }
          if (a === 'rename') { openRename(); return; }
          if (a === 'pins') { Prefs.set('pinsInWalk', !Prefs.get('pinsInWalk', true)); closeSheet(); photo.request(); return; }
          if (a === 'trail') { S.trail = []; closeSheet(); photo.request(); toast('Trail cleared'); return; }
          if (a === 'delete') {
            if (x.dataset.armed) { closeSheet(); Store.del(rec.id).then(() => { S.rec = null; goHome(); toast('Map deleted'); }); return; }
            x.dataset.armed = '1';
            x.querySelector('div').textContent = 'Tap again to delete for good';
          }
        };
      });
    });
  }

  function openRename() {
    const rec = S.rec;
    openSheet(`<h2>Rename map</h2><form id="rn"><div class="group"><input type="text" id="rn-in" maxlength="80" value="${esc(rec.name)}" aria-label="Map name"></div>
      <div class="group"><button class="btn primary" type="submit">Save</button></div></form>`, (b) => {
      b.querySelector('#rn').onsubmit = (e) => {
        e.preventDefault();
        const v = b.querySelector('#rn-in').value.trim();
        if (v) { rec.name = v; rec.renamed = true; save(); }
        closeSheet(); renderMap();
      };
    });
  }

  function openSearch() {
    openSheet(`<h2>Find a place</h2><p>Search by name, for example <i>Ryoan-ji</i> or <i>Nijo Castle</i>.</p>
      <form id="sf"><div class="group"><input type="search" id="sq" placeholder="Place name" aria-label="Place name" enterkeyhint="search"></div></form>
      <div class="results" id="sr"></div>`, (b) => {
      b.querySelector('#sf').onsubmit = async (e) => {
        e.preventDefault();
        const q = b.querySelector('#sq').value.trim();
        if (!q) return;
        const out = b.querySelector('#sr');
        out.innerHTML = '<p>Searching…</p>';
        try {
          const near = GPS.last ? [GPS.last.lat, GPS.last.lng] : (S.rec.hint ? [S.rec.hint.lat, S.rec.hint.lng] : null);
          const list = await Place.search(q, near);
          if (!list.length) { out.innerHTML = '<p>Nothing found. Try the English or Japanese name.</p>'; return; }
          out.innerHTML = list.map((r, i) => `<button data-i="${i}"><b>${esc(r.name)}</b>${r.local ? ' <span lang="ja">' + esc(r.local) + '</span>' : ''}<small>${esc(r.sub)}</small></button>`).join('');
          out.querySelectorAll('[data-i]').forEach((x) => {
            x.onclick = () => {
              const r = list[+x.dataset.i];
              closeSheet();
              if (S.mode !== 'cal') setMode('cal');
              S.linked = false;
              Real.set((m) => { if (r.bbox) m.fitBounds(r.bbox, { maxZoom: 18, animate: false }); else m.setView([r.lat, r.lng], 17, { animate: false }); });
              S.mapTouched = true;
              const rec = S.rec;
              if (!rec.place) { rec.place = { name: r.name, local: r.local, bbox: r.bbox }; if (!rec.renamed) rec.name = r.name; }
              if (!rec.hint) rec.hint = { lat: r.lat, lng: r.lng, acc: 200, from: 'search' };
              save(); renderMap();
            };
          });
        } catch (err) { out.innerHTML = '<p>Search failed. Check your connection.</p>'; }
      };
    });
  }

  function openSettings() {
    const key = Prefs.get('apiKey', '');
    openSheet(`<h2>Settings</h2>
      <div class="group"><label class="label" for="key">Claude API key (optional)</label>
      <input type="password" id="key" autocomplete="off" spellcheck="false" placeholder="sk-ant-…" value="${esc(key)}">
      <p>With a key, <b>Find spots with Claude</b> reads the labels on a map photo, finds the same places on OpenStreetMap and pins them. It costs roughly 5 to 15 cents per map on your API account. The key stays in this browser and is only sent to api.anthropic.com. Create one at console.anthropic.com.</p></div>
      <div class="group"><button class="btn primary" id="key-save">Save</button></div>
      <p>Map data © OpenStreetMap contributors. Imagery © Esri. Maps drawn with Leaflet.</p>`, (b) => {
      b.querySelector('#key-save').onclick = () => { Prefs.set('apiKey', b.querySelector('#key').value.trim()); closeSheet(); toast('Saved'); };
    });
  }

  // ---------- Claude (optional): read the board's labels and pin the places it names ----------
  // Runs on the person's own API key, straight from this page. The key is only sent to api.anthropic.com.
  const CLAUDE_MODEL = 'claude-opus-5-5';
  const AI_ACC = { high: 12, medium: 20, low: 35 };
  let sdkLoad = null;
  function loadSdk() {
    if (!sdkLoad) sdkLoad = import('./vendor/anthropic-sdk.js').catch((e) => { sdkLoad = null; throw e; });
    return sdkLoad;
  }
  const gzErr = (code, msg) => Object.assign(new Error(msg || code), { gz: code });

  // The model reads images up to 2576 px on the long edge and about 3.75 MP. Within that,
  // the pixel positions it reports are pixels of the image it was sent.
  async function photoForClaude() {
    const rec = S.rec;
    const k = Math.min(1, 2576 / Math.max(rec.w, rec.h), Math.sqrt(3.6e6 / (rec.w * rec.h)));
    const c = document.createElement('canvas');
    c.width = Math.round(rec.w * k); c.height = Math.round(rec.h * k);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(S.img, 0, 0, c.width, c.height);
    let q = 0.88, blob = await canvasBlob(c, q);
    while (blob.size > 3.3e6 && q > 0.5) { q -= 0.12; blob = await canvasBlob(c, q); }
    const data = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(',')[1]);
      r.onerror = () => rej(r.error);
      r.readAsDataURL(blob);
    });
    const out = { data, w: c.width, h: c.height, sx: rec.w / c.width, sy: rec.h / c.height };
    c.width = c.height = 0;
    return out;
  }

  // Where to look for named places, and how far around.
  function claudeAnchor() {
    const rec = S.rec;
    if (S.fit) {
      const mid = imgToLatLng(rec.w / 2, rec.h / 2);
      const cs = [[0, 0], [rec.w, 0], [rec.w, rec.h], [0, rec.h]].map((p) => imgToLatLng(p[0], p[1])).filter(Boolean);
      if (mid && cs.length) {
        const r = Math.max(...cs.map((p) => G.distanceM(mid[0], mid[1], p[0], p[1])));
        if (isFinite(r)) return { lat: mid[0], lng: mid[1], r: clamp(r * 1.2, 250, 2500), from: 'fit' };
      }
    }
    if (rec.place && rec.place.bbox) return anchorFromBox(rec.place.bbox, 'place');
    if (rec.hint) return { lat: rec.hint.lat, lng: rec.hint.lng, r: 800, from: 'hint' };
    const f = S.fresh && GPS.fresh(120000);
    if (f) return { lat: f.lat, lng: f.lng, r: 800, from: 'gps' };
    return null;
  }
  function anchorFromBox(b, from) {
    const lat = (b[0][0] + b[1][0]) / 2, lng = (b[0][1] + b[1][1]) / 2;
    return { lat, lng, r: clamp(G.distanceM(b[0][0], b[0][1], b[1][0], b[1][1]) / 2 + 200, 300, 2500), from };
  }
  const anchorFromHit = (h) => (h.bbox ? anchorFromBox(h.bbox, 'search') : { lat: h.lat, lng: h.lng, r: 800, from: 'search' });

  // Named places from OpenStreetMap that a site map might show.
  const FEATURE_KEYS = ['historic', 'tourism', 'bridge', 'barrier', 'man_made', 'natural', 'water', 'leisure', 'amenity', 'railway', 'building', 'landuse'];
  const KEEP_FIRST = new Set(['historic', 'tourism', 'bridge', 'barrier', 'man_made', 'natural', 'water']);
  const DULL_AMENITY = /^(fast_food|bank|atm|vending_machine|pharmacy|clinic|dentist|doctors|fuel|car_rental|post_box|telephone|waste_basket|bench|bicycle_parking|parking_space|charging_station|bar|pub|nightclub|kindergarten|social_facility)$/;
  async function nearbyFeatures(a) {
    const q = `[out:json][timeout:25];nwr(around:${Math.round(a.r)},${a.lat.toFixed(6)},${a.lng.toFixed(6)})[name]` +
      `[~"^(${FEATURE_KEYS.join('|')})$"~"."];out tags center qt 800;`;
    let js = null;
    for (const host of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']) {
      try {
        const res = await fetchT(host, { method: 'POST', body: new URLSearchParams({ data: q }) }, 30000);
        if (res.ok) { js = await res.json(); break; }
      } catch (e) { /* try the next server */ }
    }
    if (!js) throw gzErr('osm');
    const seen = new Set(), out = [];
    for (const e of js.elements || []) {
      const t = e.tags || {};
      const c = e.center || (e.lat != null ? { lat: e.lat, lon: e.lon } : null);
      if (!c || !t.name) continue;
      if (t.boundary || t.admin_level || t.place || (t.highway && !t.bridge)) continue;
      if (t.railway && !/^(station|halt|tram_stop)$/.test(t.railway)) continue;
      if (t.landuse && !/^(religious|cemetery)$/.test(t.landuse)) continue;
      if (t.amenity && DULL_AMENITY.test(t.amenity)) continue;
      const k = FEATURE_KEYS.find((x) => t[x]);
      if (!k) continue;
      const kind = `${k}=${t[k]}`;
      const dupe = t.name + '|' + kind;
      if (seen.has(dupe)) continue;
      seen.add(dupe);
      const alt = [...new Set([t['name:en'], t['name:ja'], t['name:ja-Latn'] || t['name:ja_rm'], t.alt_name, t.official_name]
        .filter((x) => x && x !== t.name))].slice(0, 3);
      const d = G.distanceM(a.lat, a.lng, c.lat, c.lon);
      out.push({ id: e.type[0] + e.id, name: t.name, alt, kind, lat: c.lat, lng: c.lon, d, score: d * (KEEP_FIRST.has(k) || t.heritage || t.religion ? 1 : 2.5) });
    }
    return out.sort((x, y) => x.score - y.score).slice(0, 220);
  }

  const CLAUDE_SYSTEM = 'You help a traveller line up a photo of an on-site map (a castle, garden, temple or park guide board, or a leaflet) with the real world. ' +
    'You read the map\'s labels and drawings, match them to real places from OpenStreetMap, and report pixel positions on the photo.';
  const PLACE_SCHEMA = {
    type: 'object', additionalProperties: false, required: ['place', 'place_en', 'search'],
    properties: {
      place: { type: 'string', description: 'The name of the place the map shows, as printed' },
      place_en: { type: 'string', description: 'Its usual English name' },
      search: { type: 'string', description: 'A query that finds it on OpenStreetMap, such as "Nijo Castle, Kyoto"' },
    },
  };
  const MATCH_SCHEMA = {
    type: 'object', additionalProperties: false, required: ['place', 'place_en', 'here', 'matches', 'note'],
    properties: {
      place: { type: 'string', description: 'The name of the place the map shows, as printed' },
      place_en: { type: 'string', description: 'Its usual English name' },
      here: {
        type: 'object', additionalProperties: false, required: ['found', 'x', 'y'],
        description: 'The board\'s own "You are here" (現在地) marker',
        properties: { found: { type: 'boolean' }, x: { type: 'number' }, y: { type: 'number' } },
      },
      matches: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false, required: ['id', 'label', 'x', 'y', 'confidence'],
          properties: {
            id: { type: 'string', description: 'The id from the list of real places' },
            label: { type: 'string', description: 'The label as printed on the map' },
            x: { type: 'number', description: 'Pixels from the left edge of the photo' },
            y: { type: 'number', description: 'Pixels from the top edge of the photo' },
            confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          },
        },
      },
      note: { type: 'string', description: 'One short sentence for the traveller' },
    },
  };
  const imageBlock = (img) => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: img.data } });
  function placeRequest(img) {
    return {
      max_tokens: 8000,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: PLACE_SCHEMA } },
      system: CLAUDE_SYSTEM,
      messages: [{ role: 'user', content: [imageBlock(img), { type: 'text', text: 'Which place does this map show? Read its title and labels.' }] }],
    };
  }
  function matchRequest(img, a, feats) {
    const rec = S.rec;
    const where = a.from === 'fit' ? `The map covers the area around ${a.lat.toFixed(5)}, ${a.lng.toFixed(5)}.`
      : a.from === 'place' || a.from === 'search' ? `The map should show ${(rec.place && rec.place.name) || 'a place'} near ${a.lat.toFixed(5)}, ${a.lng.toFixed(5)}.`
        : `The photo was taken at about ${a.lat.toFixed(5)}, ${a.lng.toFixed(5)}, usually right in front of the board.`;
    const fmtD = (d) => (d < 1000 ? Math.round(d / 10) * 10 + ' m' : (d / 1000).toFixed(1) + ' km');
    const lines = feats.map((f) => `${f.id} | ${f.name} | ${f.alt.join(' / ')} | ${f.kind} | ${fmtD(f.d)}`).join('\n');
    const text = `The photo is ${img.w}×${img.h} pixels. Give positions as pixel coordinates in this photo: x from the left edge, y from the top edge.

${where}

Named places from OpenStreetMap around there (id | name | other names | type | distance):
${lines}

Find 3 to 8 features that are drawn on the map and are in this list. Good choices:
- small features with an exact spot: gates, bridges, turrets, small halls, shrines, stations, monuments
- spread over the whole map, including near its edges and corners
Avoid large areas (a whole garden, pond or the grounds) unless nothing better exists, and features shown only as text with no drawing.

For each one give x and y at the centre of its drawn symbol on the map (not the centre of its text label), the label as printed, the list id, and your confidence. Leave a feature out rather than guess.
If the board has its own "You are here" (現在地) marker, give its position in "here"; otherwise set found to false and x, y to 0.
If this isn't a map, or nothing matches, return no matches and say why in note. Write note in plain English for the traveller, one sentence at most.`;
    return {
      max_tokens: 32000,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: MATCH_SCHEMA } },
      system: CLAUDE_SYSTEM,
      messages: [{ role: 'user', content: [imageBlock(img), { type: 'text', text }] }],
    };
  }

  async function claudeCall(mod, key, params, onText, signal) {
    const client = new mod.default({ apiKey: key, dangerouslyAllowBrowser: true });
    const stream = client.beta.messages.stream({
      model: CLAUDE_MODEL,
      // if a safety check declines, Anthropic's recommended fallback model answers instead
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      ...params,
    }, { signal });
    if (onText) stream.on('text', onText);
    const msg = await stream.finalMessage();
    if (msg.stop_reason === 'refusal') throw gzErr('refusal');
    if (msg.stop_reason === 'max_tokens') throw gzErr('cut');
    const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    try { return JSON.parse(text); } catch (e) { throw gzErr('json'); }
  }

  function claudeErrorText(e, mod) {
    if (e && e.gz === 'refusal') return 'Claude declined to read this photo.';
    if (e && e.gz === 'cut') return 'Claude\'s answer was cut off. Try again.';
    if (e && e.gz === 'json') return 'Claude\'s answer could not be read. Try again.';
    if (e && e.gz === 'osm') return 'Could not load nearby places from OpenStreetMap. Try again in a minute.';
    if (e && e.gz === 'notfound') return e.message;
    if (e && e.gz === 'nofeatures') return 'OpenStreetMap has no named places around here to match.';
    if (mod) {
      if (e instanceof mod.AuthenticationError) return 'Claude did not accept the API key. Check it in Settings.';
      if (e instanceof mod.PermissionDeniedError) return 'This API key is not allowed to use ' + CLAUDE_MODEL + '.';
      if (e instanceof mod.RateLimitError) return 'Claude is busy or the key has hit its limit. Try again in a minute.';
      if (e instanceof mod.BadRequestError) return 'Claude could not take this request: ' + String(e.message || '').slice(0, 160);
      if (e instanceof mod.APIConnectionError) return 'Could not reach Claude. Check your connection.';
      if (e instanceof mod.APIError) return 'Claude had a problem' + (e.status ? ' (' + e.status + ')' : '') + '. Try again.';
    } else if (e && /import|module|fetch/i.test(String(e.message))) return 'Could not load the Claude helper. Check your connection.';
    return 'Something went wrong while asking Claude.';
  }

  // Keep only suggestions that agree with each other and with spots already pinned.
  function consensus(pts, proj) {
    const n = pts.length;
    if (n < 4) return pts.map(() => true);
    const P = pts.map((p) => [p.u, p.v]);
    const Q = pts.map((p) => proj.fwd(p.lat, p.lng));
    const useAffine = n >= 6;
    const thr = Math.max(25, (useAffine ? 0.15 : 0.2) * G.rmsRadius(Q));
    let best = null;
    const tryModel = (m) => {
      if (!m) return;
      let cnt = 0, sum = 0;
      const inl = P.map((p, t) => {
        const q = m.fwd(p[0], p[1]);
        const r = q ? Math.hypot(q[0] - Q[t][0], q[1] - Q[t][1]) : Infinity;
        const ok = r <= thr;
        if (ok) { cnt++; sum += r; }
        return ok;
      });
      if (!best || cnt > best.cnt || (cnt === best.cnt && sum < best.sum)) best = { cnt, sum, inl };
    };
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (!useAffine) { tryModel(G.fitSimilarity([P[i], P[j]], [Q[i], Q[j]])); continue; }
        for (let k = j + 1; k < n; k++) tryModel(G.fitAffine([P[i], P[j], P[k]], [Q[i], Q[j], Q[k]]));
      }
    }
    if (!best || best.cnt < Math.max(3, Math.ceil(0.6 * n))) return pts.map(() => true);
    return best.inl;
  }

  function askKey(then) {
    openSheet(`<h2>Find spots with Claude</h2>
      <p>Claude reads the labels on your map photo, finds the same places on OpenStreetMap and pins them for you. It runs on your own Claude API key and costs roughly 5 to 15 cents per map.</p>
      <div class="group"><label class="label" for="key2">Claude API key</label>
      <input type="password" id="key2" autocomplete="off" spellcheck="false" placeholder="sk-ant-…"></div>
      <p>The key stays on this phone and is only sent to api.anthropic.com. You can create one at console.anthropic.com.</p>
      <div class="group"><button class="btn primary" id="key2-go">Save and find spots</button></div>`, (b) => {
      b.querySelector('#key2-go').onclick = () => {
        const k = b.querySelector('#key2').value.trim();
        if (!k) { b.querySelector('#key2').focus(); return; }
        Prefs.set('apiKey', k);
        closeSheet();
        then();
      };
    });
  }

  async function askClaude() {
    const key = Prefs.get('apiKey', '');
    if (!key) { askKey(askClaude); return; }
    const rec = S.rec;
    if (!rec || !S.img) return;
    const ctl = new AbortController();
    const t0 = Date.now();
    let phase = 'Getting ready…';
    const paint = () => { $('#busy-text').textContent = phase + (Date.now() - t0 > 4000 ? ' ' + Math.round((Date.now() - t0) / 1000) + ' s' : ''); };
    const say = (s) => { phase = s; paint(); };
    busy(phase, () => ctl.abort());
    const tick = setInterval(paint, 1000);
    let mod = null;
    try {
      mod = await loadSdk();
      const img = await photoForClaude();
      let a = claudeAnchor();
      if (!a) {
        say('Claude is reading the map\'s title…');
        const pl = await claudeCall(mod, key, placeRequest(img), null, ctl.signal);
        say('Looking up ' + (pl.place_en || pl.place) + '…');
        const hits = await Place.search(pl.search || pl.place_en || pl.place, Prefs.get('lastLoc', null)).catch(() => []);
        if (!hits.length) throw gzErr('notfound', `Claude read “${pl.place_en || pl.place}”, but it wasn't found on the map. Try Find a place first.`);
        a = anchorFromHit(hits[0]);
        if (!rec.place) rec.place = { name: pl.place_en || pl.place, local: pl.place !== pl.place_en ? pl.place : '', bbox: hits[0].bbox };
      }
      if (ctl.signal.aborted) return;
      say('Loading nearby places from OpenStreetMap…');
      let feats = await nearbyFeatures(a);
      if (feats.length < 2) throw gzErr('nofeatures');
      if (ctl.signal.aborted) return;
      say('Claude is reading the map…');
      let out = await claudeCall(mod, key, matchRequest(img, a, feats), () => { if (!/pinning/.test(phase)) say('Claude is pinning spots…'); }, ctl.signal);
      // Wrong area? Look up the place Claude read and try once more.
      if ((out.matches || []).length < 2 && a.from !== 'fit' && (out.place_en || out.place)) {
        const hits = await Place.search(out.place_en || out.place, [a.lat, a.lng]).catch(() => []);
        const h = hits[0];
        if (h && G.distanceM(h.lat, h.lng, a.lat, a.lng) > Math.max(600, a.r) && !ctl.signal.aborted) {
          a = anchorFromHit(h);
          say('Trying again around ' + (out.place_en || out.place) + '…');
          feats = await nearbyFeatures(a);
          if (feats.length >= 2) out = await claudeCall(mod, key, matchRequest(img, a, feats), null, ctl.signal);
        }
      }
      if (S.rec !== rec) return;
      applyClaude(out, a, img, feats);
    } catch (e) {
      if (ctl.signal.aborted || (mod && e instanceof mod.APIUserAbortError)) return;
      const msg = claudeErrorText(e, mod);
      openSheet(`<h2>Claude could not help this time</h2><p>${esc(msg)}</p>
        <div class="group"><button class="btn" id="cl-close">Close</button></div>`, (b) => { b.querySelector('#cl-close').onclick = closeSheet; });
    } finally {
      clearInterval(tick);
      unbusy();
    }
  }

  function applyClaude(out, a, img, feats) {
    const rec = S.rec;
    const byId = new Map(feats.map((f) => [f.id, f]));
    const diag = Math.hypot(rec.w, rec.h);
    const near = (u, v, list) => list.some((p) => Math.hypot(p.u - u, p.v - v) < 0.012 * diag);
    const added = [];
    for (const m of out.matches || []) {
      const f = byId.get(String(m.id || '').trim());
      const u = +m.x * img.sx, v = +m.y * img.sy;
      if (!f || !(u >= 0 && v >= 0 && u <= rec.w && v <= rec.h) || near(u, v, rec.points.concat(added))) continue;
      const label = String(m.label || f.name).slice(0, 60);
      const osm = [f.name !== label ? f.name : null, f.alt.find((x) => /[A-Za-z]/.test(x) && x !== label)].filter(Boolean).join(' · ') || f.name;
      added.push({ id: uid(), u, v, lat: f.lat, lng: f.lng, src: 'ai', acc: AI_ACC[m.confidence] || 25, on: true, t: Date.now(), label, osm, conf: m.confidence });
    }
    // The board's 現在地 marker is where the photo was taken, if the phone knew that.
    const h = out.here;
    const at = rec.hint && (rec.hint.from === 'photo' || (rec.hint.from === 'gps' && S.fresh)) ? rec.hint : null;
    if (h && h.found && at) {
      const u = +h.x * img.sx, v = +h.y * img.sy;
      if (u >= 0 && v >= 0 && u <= rec.w && v <= rec.h && !near(u, v, rec.points.concat(added))) {
        added.push({ id: uid(), u, v, lat: at.lat, lng: at.lng, src: 'ai', acc: Math.max(10, at.acc || 15), on: true, t: Date.now(),
          label: '現在地 (You are here)', osm: 'where you took the photo', conf: 'medium' });
      }
    }
    if (!rec.place && (out.place_en || out.place)) rec.place = { name: out.place_en || out.place, local: out.place && out.place !== out.place_en ? out.place : '', bbox: null };
    if (rec.place && !rec.renamed) rec.name = rec.place.name;
    if (!added.length) {
      save();
      renderMap();
      openSheet(`<h2>No spots found</h2><p>${esc(out.note || 'Claude could not match this map to places on OpenStreetMap.')}</p>
        <p>You can still pin spots yourself: line up the same spot in both views and tap <b>Pin spot</b>.</p>
        <div class="group"><button class="btn primary" id="cl-close">OK</button></div>`, (b) => { b.querySelector('#cl-close').onclick = closeSheet; });
      return;
    }
    const prior = onPoints();
    const keep = consensus(prior.concat(added), G.makeProj(a.lat, a.lng));
    added.forEach((p, i) => { if (!keep[prior.length + i]) { p.on = false; p.reject = true; } });
    pushUndo();
    rec.points.push(...added);
    S.sel = null;
    pointsChanged();
    photo.fit();
    placeRealMap();
    const nOn = added.filter((p) => p.on).length;
    const rows = added.map((p) => `<div class="pt${p.on ? '' : ' off'}"><span class="n ai">${rec.points.indexOf(p) + 1}</span>
      <div class="d"><b>${esc(p.label)}</b><small>${esc(p.osm)}${p.on ? ' · ' + esc(p.conf || '') + ' confidence' : ' · switched off, it did not fit the others'}</small></div></div>`).join('');
    openSheet(`<h2>Claude pinned ${nOn} spot${nOn === 1 ? '' : 's'}</h2>
      ${out.note ? `<p>${esc(out.note)}</p>` : ''}
      <div class="pts">${rows}</div>
      <p>Purple pins are Claude's suggestions. Tap one to see it in both views, and use <b>Move to crosshairs</b> if it is a little off.</p>
      <div class="group">${S.fit ? '<button class="btn primary" id="cl-walk">Walk now</button>' : ''}<button class="btn" id="cl-close">Check the spots</button></div>`, (b) => {
      b.querySelector('#cl-close').onclick = closeSheet;
      const w = b.querySelector('#cl-walk');
      if (w) w.onclick = () => { closeSheet(); setMode('loc'); };
    });
  }

  // ---------- straighten ----------
  const ST = { img: null, quad: null, k: 1, ox: 0, oy: 0, sw: 1, sh: 1, drag: -1 };
  async function openStraighten() {
    const rec = S.rec;
    busy('Opening photo…');
    try { ST.img = await decodeBlob(rec.src); } catch (e) { unbusy(); toast('The original photo could not be read.'); return; }
    unbusy();
    ST.sw = rec.sw; ST.sh = rec.sh;
    ST.quad = rec.corners ? rec.corners.map((p) => p.slice()) : [[0.06 * ST.sw, 0.06 * ST.sh], [0.94 * ST.sw, 0.06 * ST.sh], [0.94 * ST.sw, 0.94 * ST.sh], [0.06 * ST.sw, 0.94 * ST.sh]];
    show('straighten');
    requestAnimationFrame(layoutST);
  }
  function layoutST() {
    const st = $('#st-stage').getBoundingClientRect();
    const cv = $('#st-canvas');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(st.width * dpr); cv.height = Math.round(st.height * dpr);
    ST.dpr = dpr; ST.w = st.width; ST.h = st.height;
    ST.k = Math.min((st.width - 40) / ST.sw, (st.height - 40) / ST.sh);
    ST.ox = (st.width - ST.sw * ST.k) / 2; ST.oy = (st.height - ST.sh * ST.k) / 2;
    drawST();
  }
  function drawST() {
    const cv = $('#st-canvas'), ctx = cv.getContext('2d'), d = ST.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0d1522'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.drawImage(ST.img, ST.ox, ST.oy, ST.sw * ST.k, ST.sh * ST.k);
    const P = ST.quad.map((p) => [ST.ox + p[0] * ST.k, ST.oy + p[1] * ST.k]);
    ctx.beginPath();
    ctx.rect(0, 0, ST.w, ST.h);
    ctx.moveTo(P[0][0], P[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(P[i][0], P[i][1]); ctx.closePath();
    ctx.fillStyle = 'rgba(5,10,20,0.55)'; ctx.fill('evenodd');
    // perspective grid inside the quad
    const Hq = G.homography4([[0, 0], [1, 0], [1, 1], [0, 1]], P);
    if (Hq) {
      ctx.strokeStyle = 'rgba(242,183,5,0.55)'; ctx.lineWidth = 1;
      for (let i = 1; i < 4; i++) {
        const a = G.applyH(Hq, i / 4, 0), b = G.applyH(Hq, i / 4, 1), c = G.applyH(Hq, 0, i / 4), e = G.applyH(Hq, 1, i / 4);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.moveTo(c[0], c[1]); ctx.lineTo(e[0], e[1]); ctx.stroke();
      }
    }
    ctx.strokeStyle = '#F2B705'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(P[i][0], P[i][1]); ctx.closePath(); ctx.stroke();
    $$('.handle').forEach((h, i) => { h.style.left = P[i][0] + 'px'; h.style.top = P[i][1] + 'px'; });
  }
  function drawLoupe(i, px, py) {
    const L2 = $('#st-loupe'), ctx = L2.getContext('2d');
    const p = ST.quad[i], zoom = 3, R = 130;
    L2.hidden = false;
    const lx = clamp(px - R / 2, 4, ST.w - R - 4), ly = py - R - 40 < 4 ? py + 40 : py - R - 40;
    L2.style.left = lx + 'px'; L2.style.top = ly + 'px';
    const srcSize = (R / ST.k) / zoom;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 260, 260);
    ctx.save();
    ctx.beginPath(); ctx.arc(130, 130, 130, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(ST.img, p[0] - srcSize / 2, p[1] - srcSize / 2, srcSize, srcSize, 0, 0, 260, 260);
    ctx.restore();
    ctx.strokeStyle = '#F2B705'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(130, 100); ctx.lineTo(130, 160); ctx.moveTo(100, 130); ctx.lineTo(160, 130); ctx.stroke();
  }
  $$('.handle').forEach((h) => {
    const i = +h.dataset.i;
    h.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { h.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      const r = $('#st-stage').getBoundingClientRect();
      const P = [ST.ox + ST.quad[i][0] * ST.k, ST.oy + ST.quad[i][1] * ST.k];
      ST.drag = i; ST.dOff = [P[0] - (e.clientX - r.left), P[1] - (e.clientY - r.top)];
      drawLoupe(i, P[0], P[1]);
    });
    h.addEventListener('pointermove', (e) => {
      if (ST.drag !== i) return;
      const r = $('#st-stage').getBoundingClientRect();
      const x = e.clientX - r.left + ST.dOff[0], y = e.clientY - r.top + ST.dOff[1];
      ST.quad[i] = [clamp((x - ST.ox) / ST.k, -0.02 * ST.sw, 1.02 * ST.sw), clamp((y - ST.oy) / ST.k, -0.02 * ST.sh, 1.02 * ST.sh)];
      drawST();
      drawLoupe(i, ST.ox + ST.quad[i][0] * ST.k, ST.oy + ST.quad[i][1] * ST.k);
    });
    const end = () => { if (ST.drag === i) { ST.drag = -1; $('#st-loupe').hidden = true; } };
    h.addEventListener('pointerup', end);
    h.addEventListener('pointercancel', end);
    h.addEventListener('keydown', (e) => {
      const step = (e.shiftKey ? 20 : 4) / ST.k;
      const m = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (!m) return;
      e.preventDefault();
      ST.quad[i] = [ST.quad[i][0] + m[0], ST.quad[i][1] + m[1]];
      drawST();
    });
  });
  $('#st-cancel').onclick = () => { ST.img = null; show('mapscreen'); renderMap(); };
  $('#st-reset').onclick = () => { ST.quad = [[0, 0], [ST.sw, 0], [ST.sw, ST.sh], [0, ST.sh]]; drawST(); };
  $('#st-apply').onclick = async () => {
    const rec = S.rec;
    const full = ST.quad.every((p, i) => Math.hypot(p[0] - [0, ST.sw, ST.sw, 0][i], p[1] - [0, 0, ST.sh, ST.sh][i]) < 2);
    busy('Straightening…');
    try {
      // old photo pixels -> source pixels
      const Hold = rec.corners ? G.homography4([[0, 0], [rec.w, 0], [rec.w, rec.h], [0, rec.h]], rec.corners) : [[rec.sw / rec.w, 0, 0], [0, rec.sh / rec.h, 0], [0, 0, 1]];
      let canvas, Hnew, W, H;
      if (full) {
        canvas = toCanvas(ST.img, 4096); W = rec.sw; H = rec.sh; Hnew = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
      } else {
        const r = await warpQuad(ST.img, ST.quad, 2560, (k) => { $('#busy-text').textContent = 'Straightening… ' + Math.round(k * 100) + '%'; });
        canvas = r.canvas; W = r.W; H = r.Hh; Hnew = r.H;
      }
      const HnewInv = G.inv3(Hnew);
      pushUndo();
      for (const p of rec.points) {
        const s = G.applyH(Hold, p.u, p.v);
        const q = G.applyH(HnewInv, s[0], s[1]);
        p.u = q[0]; p.v = q[1];
      }
      rec.img = full ? rec.src : await canvasBlob(canvas, 0.9);
      rec.w = W; rec.h = H;
      rec.corners = full ? null : ST.quad.map((p) => p.slice());
      rec.thumb = thumbOf(canvas, 240);
      canvas.width = canvas.height = 0;
      S.img = await decodeBlob(rec.img);
      ST.img = null;
      unbusy();
      show('mapscreen');
      photo.setImage(S.img, rec.w, rec.h);
      S.undo = [];
      pointsChanged(full ? 'Using the whole photo' : 'Photo straightened');
    } catch (e) {
      unbusy();
      toast('Straightening failed. Try placing the corners again.');
    }
  };

  // ---------- new map ----------
  async function newFromFile(file) {
    busy('Preparing photo…');
    try {
      let exif = null;
      try { exif = G.readExif(await file.slice(0, 512 * 1024).arrayBuffer()); } catch (e) { /* no EXIF */ }
      const img = await loadImage(file);
      const c = toCanvas(img, 2560);
      try { URL.revokeObjectURL(img.src); } catch (e) { /* ignore */ }
      const blob = await canvasBlob(c, 0.9);
      const taken = exif && exif.time ? parseExifTime(exif.time, exif.offset) : null;
      const fresh = !taken || Math.abs(Date.now() - taken) < 45 * 60 * 1000;
      const d = new Date(taken || Date.now());
      const rec = {
        id: uid(), name: 'Map of ' + d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ', ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
        renamed: false, created: Date.now(), updated: Date.now(), src: blob, img: blob, w: c.width, h: c.height, sw: c.width, sh: c.height,
        corners: null, points: [], fit: 'auto', place: null, origin: null, thumb: thumbOf(c, 240),
        hint: exif && exif.lat != null ? { lat: exif.lat, lng: exif.lng, acc: exif.accuracy || 25, from: 'photo' } : null,
      };
      c.width = c.height = 0;
      await Store.put(rec);
      unbusy();
      await openMap(rec, fresh);
      try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* ignore */ }
    } catch (e) {
      unbusy();
      toast('That photo could not be opened. Try a JPEG or PNG.');
    }
  }

  async function goHome() {
    S.rec = null; S.img = null; S.sel = null; S.fixing = false;
    show('home');
    await renderHome();
  }

  // ---------- wiring ----------
  $('#new-btn').onclick = () => { const f = $('#file'); f.value = ''; f.click(); };
  $('#file').onchange = (e) => { const f = e.target.files && e.target.files[0]; if (f) newFromFile(f); };
  $('#maps').onclick = async (e) => {
    const b = e.target.closest('.map-card');
    if (!b) return;
    const rec = await Store.get(b.dataset.id);
    if (rec) openMap(rec, false);
  };
  $('#settings-btn').onclick = openSettings;
  $('#back-btn').onclick = () => { save(); goHome(); };
  $('#title-btn').onclick = openRename;
  $('#mode-cal').onclick = () => setMode('cal');
  $('#mode-loc').onclick = () => {
    if (!S.fit) { toast(onPoints().length < 2 ? 'Pin 2 spots first.' : 'Spread your spots out, then try again.'); return; }
    setMode('loc');
    if (!GPS.last) GPS.start();
  };
  $('#match-btn').onclick = doMatch;
  $('#here-btn').onclick = () => doHere(false);
  $('#undo-btn').onclick = () => {
    if (!S.undo.length) return;
    S.rec.points = JSON.parse(S.undo.pop());
    if (S.sel && !getPoint(S.sel)) S.sel = null;
    pointsChanged('Undone');
  };
  $('#more-btn').onclick = openMore;
  $('#more-btn2').onclick = openMore;
  $('#points-btn').onclick = openPoints;
  $('#sel-done').onclick = () => selectPoint(null);
  $('#sel-move').onclick = moveSelected;
  $('#sel-toggle').onclick = () => { const p = getPoint(S.sel); if (!p) return; pushUndo(); p.on = !p.on; pointsChanged(p.on ? 'Spot switched on' : 'Spot switched off'); };
  $('#sel-del').onclick = () => {
    const p = getPoint(S.sel);
    if (!p) return;
    pushUndo();
    S.rec.points = S.rec.points.filter((q) => q.id !== p.id);
    S.sel = null;
    pointsChanged('Spot deleted. Undo brings it back.');
  };
  $('#link-btn').onclick = () => { S.linked = !S.linked; if (S.linked) syncReal(); renderMap(); toast(S.linked ? 'The real map follows the photo' : 'The real map moves on its own'); };
  $('#layer-btn').onclick = () => { const k = Prefs.get('base', 'sat') === 'sat' ? 'street' : 'sat'; Real.setBase(k); toast(k === 'sat' ? 'Satellite' : 'Street map'); };
  $('#search-btn').onclick = openSearch;
  $('#follow-btn').onclick = () => {
    S.follow = !S.follow;
    $('#follow-btn').setAttribute('aria-pressed', String(S.follow));
    if (S.follow && !centerOnMe(true)) toast(GPS.last ? 'You are outside this map.' : 'Waiting for GPS…');
  };
  $('#north-btn').onclick = async () => {
    const order = ['photo', 'north', 'heading'];
    let next = order[(order.indexOf(S.orient) + 1) % 3];
    if (next === 'heading') {
      if (!Compass.on) await Compass.enable(true);
      if (!Compass.on || Compass.state === 'none' || Compass.state === 'denied') next = 'photo';
    }
    if (S.mode !== 'loc' && next !== 'photo') { setMode('loc'); }
    S.orient = next;
    Prefs.set('orient', next);
    applyOrient(true);
    updateNorth();
    toast(next === 'photo' ? 'Photo as taken' : next === 'north' ? 'North up' : 'Turns with you');
  };
  $('#compass-btn').onclick = async () => {
    const ok = await Compass.enable(true);
    renderMap();
    if (ok) toast('Compass on. The cone shows where you face.');
  };
  $('#fix-btn').onclick = () => {
    S.fixing = true;
    S.follow = false;
    centerOnMe(true);
    renderMap();
  };
  $('#fix-cancel').onclick = () => { S.fixing = false; renderMap(); };
  $('#fix-ok').onclick = async () => {
    const ok = await doHere(true);
    if (ok) { S.fixing = false; renderMap(); }
  };
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  window.addEventListener('resize', () => { if (S.screen === 'straighten') layoutST(); });

  function readBg() { photo.bg = getComputedStyle(document.documentElement).getPropertyValue('--canvas-bg').trim() || '#d5dde7'; photo.request(); }
  readBg();
  if (window.matchMedia) { try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', readBg); } catch (e) { /* old Safari */ } }

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
  }

  // test hooks
  window.__gz = { S, ST, photo, Real, GPS, Compass, G, refit, renderMap, setMode, doMatch, selectPoint, pointsChanged, Store, latLngToImg, imgToLatLng, openMap, goHome, pickPlace, layoutST };

  renderHome();
})();
