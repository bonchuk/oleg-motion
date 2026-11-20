/* oleg-motion runtime — runs inside headless Chrome.
 *
 * Contract: window.__setup(scene) builds the stage once; window.__seek(t) renders the
 * frame for time t (seconds). Every visual property is a pure function of t and the
 * scene seed — no Date.now(), no unseeded Math.random(), no CSS animations — so frames
 * are reproducible and a loop closes exactly when every periodic motion completes a
 * whole number of cycles over the loop length.
 */
(() => {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const osc = (p, cycles = 1, phase = 0) => Math.sin(TAU * (cycles * p + phase));
  const easeOutCubic = k => 1 - Math.pow(1 - k, 3);
  const easeInOut = k => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
  const easeOutBack = (k, s = 1.70158) => 1 + (s + 1) * Math.pow(k - 1, 3) + s * Math.pow(k - 1, 2);

  function rng(seed) { // mulberry32 — deterministic per seed
    let a = seed >>> 0;
    return () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rr = (r, a, b) => a + (b - a) * r();
  const ri = (r, a, b) => Math.floor(rr(r, a, b + 1));

  // Roles decide how much motion a layer may receive. Text, logos and CTAs move gently;
  // prices and legal copy are locked so they stay perfectly readable.
  const ROLE_RULES = {
    background: { camera: 1, motion: 1 },
    subject: { camera: 1, motion: 1 },
    foreground: { camera: 1, motion: 1 },
    decor: { camera: 1, motion: 1 },
    text: { camera: 0.35, motion: 0.5 },
    logo: { camera: 0.35, motion: 0.4 },
    cta: { camera: 0.35, motion: 0.5 },
    price: { camera: 0, motion: 0 },
    legal: { camera: 0, motion: 0 },
  };
  const LIGHT_EFFECTS = new Set(['shine', 'glow', 'glint']);
  const INTRO_EFFECTS = new Set(['popIn', 'slideIn', 'fadeIn', 'blurIn', 'wipeIn', 'riseIn', 'fadeOut']);

  const S = { scene: null, layers: [], overlays: [], W: 0, H: 0, dpr: 1, frame: 0 };

  function timing(t) {
    const c = S.scene.canvas;
    if (c.structure === 'oneshot') return { p: clamp(t / c.duration, 0, 1), loop: false };
    const start = c.structure === 'intro-loop' ? c.intro : 0;
    const T = c.structure === 'intro-loop' ? c.loop : c.duration;
    let p = ((t - start) / T) % 1; if (p < 0) p += 1;
    return { p, loop: true };
  }

  // ---------- setup ----------
  async function loadImage(src) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = src;
    await img.decode();
    return img;
  }

  function el(tag, cls, parent) { const e = document.createElement(tag); if (cls) e.className = cls; if (parent) parent.appendChild(e); return e; }

  function makeCanvas(parent, z) {
    const c = el('canvas', 'ov', parent);
    c.width = Math.round(S.W * S.dpr); c.height = Math.round(S.H * S.dpr);
    c.style.cssText = `position:absolute;left:0;top:0;width:${S.W}px;height:${S.H}px;z-index:${z};pointer-events:none`;
    const ctx = c.getContext('2d');
    ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    return { c, ctx };
  }

  window.__setup = async (scene) => {
    S.scene = scene;
    const cv = scene.canvas;
    S.W = cv.w; S.H = cv.h; S.dpr = window.devicePixelRatio || 1;
    document.body.style.cssText = `margin:0;background:${cv.background || '#000'};overflow:hidden`;
    const stage = el('div', '', document.body);
    stage.id = 'stage';
    stage.style.cssText = `position:relative;width:${S.W}px;height:${S.H}px;overflow:hidden;background:${cv.background || '#000'}`;
    S.stage = stage;

    // World = source-space container fitted into the canvas.
    const src = scene.source;
    const fit = cv.fit || 'cover';
    const sc = fit === 'cover' ? Math.max(S.W / src.w, S.H / src.h) : Math.min(S.W / src.w, S.H / src.h);
    const [fx, fy] = cv.focus || [0.5, 0.5];
    let ox = S.W / 2 - fx * src.w * sc, oy = S.H / 2 - fy * src.h * sc;
    ox = clamp(ox, Math.min(0, S.W - src.w * sc), Math.max(0, S.W - src.w * sc));
    oy = clamp(oy, Math.min(0, S.H - src.h * sc), Math.max(0, S.H - src.h * sc));
    if (fit !== 'cover') { ox = (S.W - src.w * sc) / 2; oy = (S.H - src.h * sc) / 2; }
    S.fit = { sc, ox, oy };

    if (fit === 'contain-blur') {
      const bgL = scene.layers.find(l => l.role === 'background') || scene.layers[0];
      const fill = el('div', '', stage);
      const fs = Math.max(S.W / src.w, S.H / src.h) * 1.15;
      fill.style.cssText = `position:absolute;left:${(S.W - src.w * fs) / 2}px;top:${(S.H - src.h * fs) / 2}px;width:${src.w * fs}px;height:${src.h * fs}px;background:url('${bgL.src}') center/100% 100%;filter:blur(${Math.round(Math.max(S.W, S.H) * 0.025)}px) brightness(0.8);z-index:0`;
      S.fill = fill;
    }

    const world = el('div', '', stage);
    world.style.cssText = `position:absolute;left:0;top:0;width:${src.w}px;height:${src.h}px;transform-origin:0 0;transform:translate(${ox}px,${oy}px) scale(${sc});z-index:1;perspective:${Math.max(src.w, src.h) * 1.6}px`;
    S.world = world;

    // Layers
    const layers = [...scene.layers].sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
    let zi = 10;
    for (const L of layers) {
      const node = el('div', 'L', world);
      node.style.cssText = `position:absolute;left:${L.x}px;top:${L.y}px;width:${L.w}px;height:${L.h}px;z-index:${zi};opacity:${L.opacity ?? 1};${L.blend ? `mix-blend-mode:${L.blend};` : ''}will-change:transform`;
      const img = el('img', '', node);
      img.src = L.src;
      img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
      if (L.mask) { node.style.webkitMaskImage = node.style.maskImage = `url('${L.mask}')`; node.style.webkitMaskSize = node.style.maskSize = '100% 100%'; }
      const rule = ROLE_RULES[L.role] || ROLE_RULES.decor;
      const anchor = L.anchor || [0.5, 0.5];
      node.style.transformOrigin = `${anchor[0] * 100}% ${anchor[1] * 100}%`;
      const st = { L, node, img, rule, z: zi, fx: [], imgData: null };
      for (const fx of (L.effects || [])) {
        if (!rule.motion && !LIGHT_EFFECTS.has(fx.type) && !INTRO_EFFECTS.has(fx.type)) continue; // locked roles keep only light/intro effects
        const setup = LAYER_FX[fx.type];
        if (!setup) { console.warn('unknown effect', fx.type); continue; }
        st.fx.push({ def: fx, run: await setup(st, fx) });
      }
      S.layers.push(st);
      zi += 10;
    }
    await Promise.all(S.layers.map(s => s.img.decode().catch(() => {})));

    // Static boxes (canvas coords) for keep-out zones.
    S.boxes = S.layers.map(s => ({ role: s.L.role, id: s.L.id, ...boxOf(s.L) }));

    // Overlays
    const maxZ = zi;
    for (const O of (scene.overlays || [])) {
      let z;
      if (typeof O.z === 'number') z = O.z;
      else if (O.z === 'back') z = 15; // just above the lowest layer (usually the background)
      else if (O.z === 'mid') z = Math.round(maxZ / 2) + 5;
      else z = maxZ + 50;
      const setup = OVERLAY_FX[O.type];
      if (!setup) { console.warn('unknown overlay', O.type); continue; }
      // Overlays live in the stage (canvas space), so they must sit above the world when z is high.
      const holder = O.z === 'back' || typeof O.z === 'number' || O.z === 'mid' ? world : stage;
      const run = await setup(O, holder, z);
      S.overlays.push({ O, run });
    }
    if (document.fonts) await document.fonts.ready;
    return { layers: S.layers.length, overlays: S.overlays.length, fit: S.fit };
  };

  function boxOf(L) {
    const { sc, ox, oy } = S.fit;
    return { x: ox + L.x * sc, y: oy + L.y * sc, w: L.w * sc, h: L.h * sc };
  }

  // ---------- per-frame ----------
  function cameraAt(p, t) {
    const cam = S.scene.camera || {};
    const k = cam.cycles || 1;
    const loop = S.scene.canvas.structure !== 'oneshot';
    const push = cam.push || 0;
    let scale;
    if (loop) scale = 1 + push * (0.5 - 0.5 * Math.cos(TAU * k * p));
    else scale = 1 + push * easeInOut(p);
    const panX = (cam.panX || 0) * (loop ? osc(p, k) : lerp(-1, 1, easeInOut(p)));
    const panY = (cam.panY || 0) * (loop ? osc(p, k, 0.25) : lerp(-1, 1, easeInOut(p)));
    let sx = 0, sy = 0;
    if (cam.shake) { sx = cam.shake * (0.6 * osc(p, 7) + 0.4 * osc(p, 11, 0.3)); sy = cam.shake * (0.6 * osc(p, 9, 0.1) + 0.4 * osc(p, 13, 0.7)); }
    return { scale, panX, panY, sx, sy };
  }

  window.__seek = (t) => {
    const { p } = timing(t);
    S.frame++;
    const cam = cameraAt(p, t);
    const cx = S.scene.source.w / 2, cy = S.scene.source.h / 2;
    for (const st of S.layers) {
      const depth = st.L.depth ?? 0.5;
      const f = (0.25 + 1.5 * depth) * st.rule.camera;
      const tr = { tx: 0, ty: 0, s: 1, rot: 0, rx: 0, ry: 0, op: 1, filter: [], clip: null };
      // camera: scale around the world centre, parallax offsets scaled by depth
      const s = 1 + (cam.scale - 1) * f;
      const lcx = st.L.x + st.L.w / 2, lcy = st.L.y + st.L.h / 2;
      tr.tx += (lcx - cx) * (s - 1) + (cam.panX + cam.sx) * f;
      tr.ty += (lcy - cy) * (s - 1) + (cam.panY + cam.sy) * f;
      tr.s *= s;
      for (const f2 of st.fx) f2.run && f2.run(tr, p, t, st);
      const m = st.rule.motion;
      st.node.style.transform = `translate3d(${tr.tx}px,${tr.ty}px,0) rotateX(${tr.rx * m}deg) rotateY(${tr.ry * m}deg) rotate(${tr.rot}deg) scale(${tr.s})`;
      st.node.style.opacity = String((st.L.opacity ?? 1) * tr.op);
      st.node.style.filter = tr.filter.join(' ');
      if (tr.clip !== null) st.node.style.clipPath = tr.clip;
    }
    for (const o of S.overlays) o.run && o.run(p, t);
    return S.frame;
  };

  // ---------- layer effects ----------
  // Each setup returns run(tr, p, t, st) that mutates the transform accumulator `tr`.
  const amp = (st, v) => v * (st.rule.motion || 0);
  const LAYER_FX = {
    float: (st, o) => (tr, p) => { tr.tx += amp(st, o.ampX ?? 0) * osc(p, o.cycles ?? 1, o.phase ?? 0); tr.ty += amp(st, o.ampY ?? 8) * osc(p, o.cycles ?? 1, (o.phase ?? 0) + 0.25); },
    drift: (st, o) => (tr, p) => { tr.tx += amp(st, o.ampX ?? 6) * osc(p, o.cycles ?? 1, o.phase ?? 0); tr.ty += amp(st, o.ampY ?? 4) * osc(p, o.cycles ?? 1, (o.phase ?? 0) + 0.25); },
    sway: (st, o) => { if (o.anchor) st.node.style.transformOrigin = `${o.anchor[0] * 100}% ${o.anchor[1] * 100}%`; return (tr, p) => { tr.rot += amp(st, o.deg ?? 2) * osc(p, o.cycles ?? 1, o.phase ?? 0); }; },
    breathe: (st, o) => (tr, p) => { tr.s *= 1 + amp(st, o.amp ?? 0.02) * (0.5 - 0.5 * Math.cos(TAU * ((o.cycles ?? 1) * p + (o.phase ?? 0)))); },
    tilt3d: (st, o) => (tr, p) => { tr.rx += (o.degX ?? 3) * osc(p, o.cycles ?? 1, o.phase ?? 0); tr.ry += (o.degY ?? 4) * osc(p, o.cycles ?? 1, (o.phase ?? 0) + 0.25); },
    spin: (st, o) => (tr, p) => { tr.rot += 360 * (o.turns ?? 1) * p * (st.rule.motion ? 1 : 0); },
    flutter: (st, o) => (tr, p) => { tr.ry += amp(st, o.deg ?? 18) * osc(p, o.cycles ?? 2, o.phase ?? 0); tr.rot += amp(st, (o.deg ?? 18) * 0.15) * osc(p, o.cycles ?? 2, (o.phase ?? 0) + 0.3); },

    // Light sweep masked to the layer's own alpha, so it never spills onto the background.
    shine: (st, o) => {
      const band = el('div', '', st.node);
      const col = o.color || '255,255,255';
      const rgb = col.startsWith('#') ? hexRgb(col) : col;
      band.style.cssText = `position:absolute;inset:0;pointer-events:none;mix-blend-mode:${o.blend || 'screen'};background:linear-gradient(${90 + (o.angle ?? 20)}deg, rgba(${rgb},0) 0%, rgba(${rgb},0) ${50 - (o.width ?? 0.18) * 50}%, rgba(${rgb},${o.opacity ?? 0.45}) 50%, rgba(${rgb},0) ${50 + (o.width ?? 0.18) * 50}%, rgba(${rgb},0) 100%);background-size:300% 100%;background-repeat:no-repeat`;
      band.style.webkitMaskImage = band.style.maskImage = `url('${st.L.src}')`;
      band.style.webkitMaskSize = band.style.maskSize = '100% 100%';
      const every = o.cycles ?? 1, sweep = o.sweep ?? 0.3, off = o.phase ?? 0.35;
      return (tr, p) => {
        let u = ((p * every - off) % 1 + 1) % 1; // position within this shine cycle
        const k = u < sweep ? easeInOut(u / sweep) : 1;
        band.style.backgroundPosition = `${lerp(100, 0, k)}% 0`;
        band.style.opacity = u < sweep ? '1' : '0';
      };
    },
    glow: (st, o) => (tr, p) => {
      const k = 1 - (o.pulse ?? 0.35) * (0.5 + 0.5 * osc(p, o.cycles ?? 1, o.phase ?? 0));
      const a = (o.strength ?? 0.6) * k;
      const rgb = hexRgb(o.color || '#ffd36b');
      tr.filter.push(`drop-shadow(0 0 ${(o.radius ?? 18) * k}px rgba(${rgb},${a.toFixed(3)}))`);
    },
    glint: async (st, o) => {
      // Star glints on bright spots. `points` are layer fractions, or 'auto' to find highlights.
      let pts = o.points;
      if (!pts || pts === 'auto') pts = await brightSpots(st.L.src, o.count ?? 3);
      const cvs = el('canvas', '', st.node);
      const W = Math.round(st.L.w), H = Math.round(st.L.h);
      const scale = Math.min(2, 1600 / Math.max(W, H));
      cvs.width = Math.round(W * scale); cvs.height = Math.round(H * scale);
      cvs.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;mix-blend-mode:screen';
      const ctx = cvs.getContext('2d');
      const size = (o.size ?? 0.12) * Math.min(W, H) * scale;
      const dur = o.duration ?? 0.22;
      const n = pts.length;
      return (tr, p) => {
        ctx.clearRect(0, 0, cvs.width, cvs.height);
        pts.forEach((pt, i) => {
          const start = (o.phase ?? 0.1) + i * (o.stagger ?? (1 / Math.max(1, n)) * 0.6);
          let u = (((p * (o.cycles ?? 1)) - start) % 1 + 1) % 1;
          if (u > dur) return;
          const k = Math.sin(Math.PI * (u / dur));
          drawStar(ctx, pt[0] * cvs.width, pt[1] * cvs.height, size * k, (o.rotate ?? 45) * (u / dur), o.color || '#fff8e0', k);
        });
      };
    },
    // Distortion that keeps the loop: a tiled noise displacement scrolls by whole tiles per loop.
    wave: (st, o) => {
      const id = 'wv' + Math.random().toString(36).slice(2, 8);
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.style.position = 'absolute';
      const tile = 256;
      const map = noiseTile(tile, o.scale ?? 4, S.scene.seed ?? 1);
      svg.innerHTML = `<filter id="${id}" x="0" y="0" width="100%" height="100%" filterUnits="objectBoundingBox" primitiveUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
        <feImage href="${map}" x="0" y="0" width="${tile}" height="${tile}" result="n" preserveAspectRatio="none"/>
        <feTile in="n" result="t"/>
        <feOffset in="t" dx="0" dy="0" result="o"/>
        <feDisplacementMap in="SourceGraphic" in2="o" scale="${o.amp ?? 8}" xChannelSelector="R" yChannelSelector="G"/>
      </filter>`;
      document.body.appendChild(svg);
      const off = svg.querySelector('feOffset');
      return (tr, p) => {
        const d = (p * (o.cycles ?? 1) * tile) % tile;
        off.setAttribute(o.dir === 'y' ? 'dy' : 'dx', String(d));
        tr.filter.push(`url(#${id})`);
      };
    },
    // 2.5D: displace pixels proportionally to a depth map (white = near).
    depthParallax: (st, o) => {
      const id = 'dp' + Math.random().toString(36).slice(2, 8);
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.style.position = 'absolute';
      svg.innerHTML = `<filter id="${id}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
        <feImage href="${o.map}" x="0" y="0" width="${st.L.w}" height="${st.L.h}" preserveAspectRatio="none" result="d"/>
        <feDisplacementMap in="SourceGraphic" in2="d" scale="0" xChannelSelector="R" yChannelSelector="G"/>
      </filter>`;
      document.body.appendChild(svg);
      const dm = svg.querySelector('feDisplacementMap');
      return (tr, p) => {
        dm.setAttribute('scale', String((o.amp ?? 14) * osc(p, o.cycles ?? 1, o.phase ?? 0)));
        tr.filter.push(`url(#${id})`);
      };
    },

    // ----- intro / outro (time-based, seconds) -----
    popIn: (st, o) => (tr, p, t) => { const k = clamp((t - (o.start ?? 0)) / (o.dur ?? 0.5), 0, 1); tr.s *= k <= 0 ? (o.from ?? 0.6) : lerp(o.from ?? 0.6, 1, easeOutBack(k, o.overshoot ?? 1.9)); if (o.fade !== false) tr.op *= clamp(k * 3, 0, 1); },
    fadeIn: (st, o) => (tr, p, t) => { tr.op *= easeOutCubic(clamp((t - (o.start ?? 0)) / (o.dur ?? 0.6), 0, 1)); },
    fadeOut: (st, o) => (tr, p, t) => { const end = S.scene.canvas.duration; const st0 = o.start ?? end - (o.dur ?? 0.5); tr.op *= 1 - easeInOut(clamp((t - st0) / (o.dur ?? 0.5), 0, 1)); },
    blurIn: (st, o) => (tr, p, t) => { const k = easeOutCubic(clamp((t - (o.start ?? 0)) / (o.dur ?? 0.6), 0, 1)); if (k < 1) tr.filter.push(`blur(${(o.px ?? 20) * (1 - k)}px)`); if (o.fade !== false) tr.op *= k; },
    riseIn: (st, o) => (tr, p, t) => { const k = easeOutCubic(clamp((t - (o.start ?? 0)) / (o.dur ?? 0.6), 0, 1)); tr.ty += (o.dist ?? 40) * (1 - k); tr.op *= k; },
    slideIn: (st, o) => (tr, p, t) => {
      const k = easeOutCubic(clamp((t - (o.start ?? 0)) / (o.dur ?? 0.6), 0, 1));
      const d = (o.dist ?? 0.25) * S.scene.source.w * (1 - k);
      const dir = o.from || 'left';
      if (dir === 'left') tr.tx -= d; else if (dir === 'right') tr.tx += d; else if (dir === 'up') tr.ty -= d; else tr.ty += d;
      tr.op *= clamp(k * 2, 0, 1);
    },
    wipeIn: (st, o) => (tr, p, t) => {
      const k = easeInOut(clamp((t - (o.start ?? 0)) / (o.dur ?? 0.7), 0, 1));
      const r = (1 - k) * 100;
      const dir = o.from || 'left';
      tr.clip = dir === 'left' ? `inset(0 ${r}% 0 0)` : dir === 'right' ? `inset(0 0 0 ${r}%)` : dir === 'up' ? `inset(0 0 ${r}% 0)` : `inset(${r}% 0 0 0)`;
    },
  };

  // ---------- overlays (canvas space) ----------
  const OVERLAY_FX = {
    particles: async (O, holder, z) => {
      const { c, ctx } = holder === S.world ? worldCanvas(z) : makeCanvas(holder, z);
      const r = rng((S.scene.seed ?? 1) * 7919 + (O.seed ?? 0));
      const kind = O.kind || 'dust';
      const preset = PARTICLE_KINDS[kind] || PARTICLE_KINDS.dust;
      const count = O.count ?? preset.count;
      const nDepth = O.depthLayers ?? 3;
      const sizeR = O.size || preset.size;
      const colors = O.colors || preset.colors;
      const dir = O.direction || preset.direction;
      const sprite = O.sprite ? await loadImage(O.sprite) : null;
      const unit = Math.min(S.W, S.H) / 1080; // sizes are authored for a 1080px short side
      const ps = [];
      for (let i = 0; i < count; i++) {
        const d = nDepth > 1 ? (i % nDepth) / (nDepth - 1) : 0.5; // 0 far … 1 near
        ps.push({
          x0: r(), y0: r(), d,
          size: lerp(sizeR[0], sizeR[1], 0.35 + 0.65 * d) * unit * rr(r, 0.75, 1.25),
          k: Math.max(1, Math.round((O.speed ?? preset.speed) * lerp(0.6, 1.4, d) * rr(r, 0.8, 1.2))), // whole cycles per loop
          swayA: rr(r, 0.2, 1) * (O.sway ?? preset.sway) * unit,
          swayK: ri(r, 1, 2), ph: r(), rot0: r() * 360, rotK: ri(r, -2, 2) || 1, flipK: ri(r, 1, 3),
          col: colors[ri(r, 0, colors.length - 1)],
          a: rr(r, (O.opacity || preset.opacity)[0], (O.opacity || preset.opacity)[1]),
          tw: ri(r, 1, 3),
          v: r(), // shape variant for presets that have several (leaves)
        });
      }
      const keep = keepOutRects(O.keepOut || []);
      const blurMax = (O.blur ?? preset.blur) * unit;
      return (p) => {
        ctx.clearRect(0, 0, S.W, S.H);
        for (const q of ps) {
          const m = q.size * 3;
          let x, y;
          if (dir === 'down' || dir === 'up') {
            const prog = ((q.y0 + q.k * p) % 1);
            y = dir === 'down' ? lerp(-m, S.H + m, prog) : lerp(S.H + m, -m, prog);
            x = q.x0 * S.W + q.swayA * Math.sin(TAU * (q.swayK * p + q.ph));
          } else if (dir === 'left' || dir === 'right') {
            const prog = ((q.x0 + q.k * p) % 1);
            x = dir === 'right' ? lerp(-m, S.W + m, prog) : lerp(S.W + m, -m, prog);
            y = q.y0 * S.H + q.swayA * Math.sin(TAU * (q.swayK * p + q.ph));
          } else { // float: closed elliptical drift
            x = q.x0 * S.W + q.swayA * 2 * Math.cos(TAU * (q.k * p + q.ph));
            y = q.y0 * S.H + q.swayA * 1.4 * Math.sin(TAU * (q.k * p + q.ph));
          }
          let alpha = q.a * (preset.twinkle ? 0.55 + 0.45 * Math.sin(TAU * (q.tw * p + q.ph)) : 1);
          alpha *= keepFade(x, y, keep);
          if (alpha <= 0.01) continue;
          const blur = blurMax * Math.abs(q.d - (O.focus ?? 0.5)) * 2;
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.globalCompositeOperation = O.blend || preset.blend || 'source-over';
          if (blur > 0.4) ctx.filter = `blur(${blur.toFixed(1)}px)`;
          ctx.translate(x, y);
          ctx.rotate((q.rot0 + 360 * q.rotK * p) * Math.PI / 180);
          const flip = preset.flip ? Math.cos(TAU * (q.flipK * p + q.ph)) : 1;
          ctx.scale(1, flip);
          if (sprite) ctx.drawImage(sprite, -q.size, -q.size * sprite.height / sprite.width, q.size * 2, q.size * 2 * sprite.height / sprite.width);
          else preset.draw(ctx, q.size, q.col, q.v, flip);
          ctx.restore();
        }
      };
    },
    lightLeak: async (O, holder, z) => {
      const { c, ctx } = makeCanvas(holder === S.world ? S.stage : holder, z);
      c.style.mixBlendMode = O.blend || 'screen';
      const r = rng((S.scene.seed ?? 1) * 31 + 5);
      const cols = O.colors || ['#ff9a3c', '#ff4f8b', '#ffd36b'];
      const blobs = cols.map((col, i) => ({ col, x0: rr(r, 0.1, 0.9), y0: rr(r, 0.1, 0.9), rx: rr(r, 0.15, 0.35), ry: rr(r, 0.1, 0.3), R: rr(r, 0.35, 0.6), ph: r(), k: (O.cycles ?? 1) }));
      return (p) => {
        ctx.clearRect(0, 0, S.W, S.H);
        for (const b of blobs) {
          const x = (b.x0 + b.rx * Math.cos(TAU * (b.k * p + b.ph))) * S.W;
          const y = (b.y0 + b.ry * Math.sin(TAU * (b.k * p + b.ph))) * S.H;
          const R = b.R * Math.max(S.W, S.H);
          const g = ctx.createRadialGradient(x, y, 0, x, y, R);
          const a = (O.opacity ?? 0.25) * (0.75 + 0.25 * Math.sin(TAU * (b.k * p + b.ph + 0.3)));
          g.addColorStop(0, rgba(b.col, a)); g.addColorStop(1, rgba(b.col, 0));
          ctx.fillStyle = g; ctx.fillRect(0, 0, S.W, S.H);
        }
      };
    },
    rays: async (O, holder, z) => {
      const { c, ctx } = makeCanvas(holder === S.world ? S.stage : holder, z);
      c.style.mixBlendMode = 'screen';
      const r = rng((S.scene.seed ?? 1) * 97 + 3);
      const n = O.count ?? 7;
      const beams = Array.from({ length: n }, (_, i) => ({ a: lerp(-0.5, 0.5, n > 1 ? i / (n - 1) : 0.5) * (O.spread ?? 60) + rr(r, -4, 4), w: rr(r, 2, 6), ph: r(), k: ri(r, 1, 2) }));
      return (p) => {
        ctx.clearRect(0, 0, S.W, S.H);
        const ox = (O.origin || [0.75, -0.05])[0] * S.W, oy = (O.origin || [0.75, -0.05])[1] * S.H;
        const L = Math.hypot(S.W, S.H) * 1.2;
        const base = (O.angle ?? 200) + (O.sway ?? 3) * osc(p, O.cycles ?? 1);
        for (const b of beams) {
          const ang = (base + b.a) * Math.PI / 180;
          const w = b.w * Math.PI / 180;
          const g = ctx.createRadialGradient(ox, oy, 0, ox, oy, L);
          const a = (O.opacity ?? 0.16) * (0.6 + 0.4 * Math.sin(TAU * (b.k * p + b.ph)));
          g.addColorStop(0, rgba(O.color || '#fff4d6', a)); g.addColorStop(1, rgba(O.color || '#fff4d6', 0));
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.moveTo(ox, oy);
          ctx.arc(ox, oy, L, ang - w, ang + w); ctx.closePath(); ctx.fill();
        }
      };
    },
    vignette: async (O, holder, z) => {
      const { ctx } = makeCanvas(S.stage, z);
      const g = ctx.createRadialGradient(S.W / 2, S.H / 2, Math.min(S.W, S.H) * 0.35, S.W / 2, S.H / 2, Math.hypot(S.W, S.H) * 0.6);
      g.addColorStop(0, rgba(O.color || '#000000', 0)); g.addColorStop(1, rgba(O.color || '#000000', O.strength ?? 0.35));
      ctx.fillStyle = g; ctx.fillRect(0, 0, S.W, S.H);
      return null;
    },
    grain: async (O, holder, z) => {
      const { c, ctx } = makeCanvas(S.stage, z);
      c.style.mixBlendMode = 'overlay';
      const tiles = [];
      const r = rng((S.scene.seed ?? 1) * 13);
      for (let i = 0; i < 6; i++) {
        const t = document.createElement('canvas'); t.width = t.height = 256;
        const tc = t.getContext('2d'); const im = tc.createImageData(256, 256);
        for (let j = 0; j < im.data.length; j += 4) { const v = 128 + (r() - 0.5) * 255 * (O.amount ?? 0.08) * 4; im.data[j] = im.data[j + 1] = im.data[j + 2] = v; im.data[j + 3] = 255; }
        tc.putImageData(im, 0, 0); tiles.push(ctx.createPattern(t, 'repeat'));
      }
      let n = 0;
      return () => { ctx.clearRect(0, 0, S.W, S.H); ctx.fillStyle = tiles[n++ % tiles.length]; ctx.globalAlpha = 0.5; ctx.fillRect(0, 0, S.W, S.H); ctx.globalAlpha = 1; };
    },
    fog: async (O, holder, z) => {
      const { c, ctx } = makeCanvas(holder === S.world ? S.stage : holder, z);
      c.style.mixBlendMode = O.blend || 'screen';
      const tile = 512;
      const img = await loadImage(noiseTile(tile, O.scale ?? 3, (S.scene.seed ?? 1) + 11, true, O.color || '#ffffff'));
      return (p) => {
        ctx.clearRect(0, 0, S.W, S.H);
        const sz = Math.max(S.W, S.H) * 0.9;
        const off = (p * (O.cycles ?? 1)) * sz;
        ctx.globalAlpha = O.opacity ?? 0.18;
        ctx.filter = `blur(${Math.round(sz * 0.02)}px)`;
        for (let x = -sz; x < S.W + sz; x += sz) for (let y = -sz; y < S.H + sz; y += sz) ctx.drawImage(img, x + (off % sz), y + (off * 0.3 % sz) - sz * 0.3, sz, sz);
        ctx.filter = 'none'; ctx.globalAlpha = 1;
      };
    },
    // Lens flare / glare that crosses the frame once per cycle.
    flare: async (O, holder, z) => {
      const { c, ctx } = makeCanvas(S.stage, z);
      c.style.mixBlendMode = 'screen';
      const path = O.path || [[-0.1, 0.25], [1.1, 0.05]];
      return (p) => {
        ctx.clearRect(0, 0, S.W, S.H);
        let u = ((p * (O.cycles ?? 1) - (O.phase ?? 0.2)) % 1 + 1) % 1;
        const dur = O.duration ?? 0.4;
        if (u > dur) return;
        const k = easeInOut(u / dur);
        const x = lerp(path[0][0], path[1][0], k) * S.W, y = lerp(path[0][1], path[1][1], k) * S.H;
        const a = Math.sin(Math.PI * u / dur) * (O.opacity ?? 0.8);
        const R = (O.size ?? 0.18) * Math.min(S.W, S.H);
        const g = ctx.createRadialGradient(x, y, 0, x, y, R);
        g.addColorStop(0, rgba(O.color || '#fff6dd', a)); g.addColorStop(0.25, rgba(O.color || '#ffd08a', a * 0.35)); g.addColorStop(1, rgba(O.color || '#ffb060', 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.fill();
        // anamorphic streak
        const sg = ctx.createLinearGradient(x - R * 4, y, x + R * 4, y);
        const sc = O.color || '#fff2d0'; sg.addColorStop(0, rgba(sc, 0)); sg.addColorStop(0.5, rgba(sc, a * 0.6)); sg.addColorStop(1, rgba(sc, 0));
        ctx.fillStyle = sg; ctx.fillRect(x - R * 4, y - R * 0.04, R * 8, R * 0.08);
        // ghosts along the line through the centre
        for (const [f, s2] of [[0.5, 0.18], [0.8, 0.1], [1.25, 0.14]]) {
          const gx = x + (S.W / 2 - x) * f * 2, gy = y + (S.H / 2 - y) * f * 2;
          const gr = ctx.createRadialGradient(gx, gy, 0, gx, gy, R * s2 * 3);
          gr.addColorStop(0, rgba('#9fd0ff', a * 0.18)); gr.addColorStop(1, rgba('#9fd0ff', 0));
          ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(gx, gy, R * s2 * 3, 0, TAU); ctx.fill();
        }
      };
    },
  };

  // Particle canvas placed inside the world (between layers) but drawn in canvas space.
  function worldCanvas(z) {
    const r = makeCanvas(S.stage, z);
    r.c.style.zIndex = '1';
    // stage children: [fill?, world, canvases]; to interleave with layers we insert inside world
    // with an inverse transform so its coordinates stay in canvas space.
    S.world.appendChild(r.c);
    const { sc, ox, oy } = S.fit;
    r.c.style.transformOrigin = '0 0';
    r.c.style.transform = `scale(${1 / sc}) translate(${-ox}px,${-oy}px)`;
    r.c.style.zIndex = String(z);
    return r;
  }

  const PARTICLE_KINDS = {
    dust: { count: 60, size: [1.5, 5], colors: ['#fff3c4', '#ffd36b', '#ffffff'], direction: 'up', speed: 1, sway: 30, opacity: [0.35, 0.9], blur: 3, twinkle: true, blend: 'lighter', draw: dotGlow },
    sparks: { count: 50, size: [1.5, 4], colors: ['#ffd36b', '#ffb347', '#fff1b8'], direction: 'up', speed: 2, sway: 40, opacity: [0.5, 1], blur: 2, twinkle: true, blend: 'lighter', draw: dotGlow },
    embers: { count: 40, size: [2, 6], colors: ['#ff8a3c', '#ffb347', '#ff5a2a'], direction: 'up', speed: 1, sway: 50, opacity: [0.5, 1], blur: 3, twinkle: true, blend: 'lighter', draw: dotGlow },
    stars: { count: 40, size: [2, 6], colors: ['#ffffff', '#fff6d5'], direction: 'float', speed: 1, sway: 6, opacity: [0.4, 1], blur: 0, twinkle: true, blend: 'lighter', draw: (c, s, col) => drawStar(c, 0, 0, s * 3, 0, col, 1) },
    snow: { count: 90, size: [2, 7], colors: ['#ffffff'], direction: 'down', speed: 1, sway: 30, opacity: [0.5, 0.95], blur: 4, draw: dotSoft },
    bokeh: { count: 18, size: [18, 60], colors: ['#ffe2a8', '#ffffff', '#ffc46b'], direction: 'float', speed: 1, sway: 20, opacity: [0.12, 0.35], blur: 10, twinkle: true, blend: 'lighter', draw: bokehDisc },
    leaves: { count: 14, size: [16, 34], colors: ['#f2a20c', '#e8740c', '#d4520a', '#ffc21a', '#b8860b'], direction: 'down', speed: 1, sway: 60, opacity: [0.85, 1], blur: 5, flip: true, draw: leaf },
    petals: { count: 22, size: [8, 16], colors: ['#ffc0d4', '#ffd6e2', '#ffe9f0', '#f7a8c4'], direction: 'down', speed: 1, sway: 70, opacity: [0.8, 1], blur: 4, flip: true, draw: petal },
    confetti: { count: 70, size: [6, 12], colors: ['#ff3b5c', '#ffd23f', '#3bceac', '#4d7cfe', '#ff8a3c', '#b14dff'], direction: 'down', speed: 2, sway: 40, opacity: [0.9, 1], blur: 2, flip: true, draw: confettiRect },
    hearts: { count: 18, size: [10, 20], colors: ['#ff3b6b', '#ff7aa2', '#ffffff'], direction: 'up', speed: 1, sway: 40, opacity: [0.6, 1], blur: 3, draw: heart },
    bubbles: { count: 26, size: [6, 18], colors: ['#ffffff'], direction: 'up', speed: 1, sway: 25, opacity: [0.35, 0.8], blur: 2, draw: bubble },
  };

  // ---------- drawing helpers ----------
  function dotGlow(c, s, col) { const g = c.createRadialGradient(0, 0, 0, 0, 0, s * 2.2); g.addColorStop(0, col); g.addColorStop(0.35, rgba(col, 0.55)); g.addColorStop(1, rgba(col, 0)); c.fillStyle = g; c.beginPath(); c.arc(0, 0, s * 2.2, 0, TAU); c.fill(); }
  function dotSoft(c, s, col) { const g = c.createRadialGradient(0, 0, 0, 0, 0, s); g.addColorStop(0, rgba(col, 1)); g.addColorStop(0.6, rgba(col, 0.7)); g.addColorStop(1, rgba(col, 0)); c.fillStyle = g; c.beginPath(); c.arc(0, 0, s, 0, TAU); c.fill(); }
  function bokehDisc(c, s, col) { c.fillStyle = rgba(col, 0.55); c.beginPath(); c.arc(0, 0, s, 0, TAU); c.fill(); c.strokeStyle = rgba(col, 0.8); c.lineWidth = Math.max(1, s * 0.06); c.stroke(); }
  // Leaves: three silhouettes (oval, maple, oak) with a soft gradient, midrib and veins.
  // `side` < 0 while the leaf is flipped (back side visible) → slightly darker, like real leaves.
  function leaf(c, s, col, v = 0, side = 1) {
    const back = side < 0 ? 0.78 : 1;
    const g = c.createLinearGradient(-s, -s, s, s);
    g.addColorStop(0, shade(col, 1.18 * back)); g.addColorStop(1, shade(col, 0.82 * back));
    c.fillStyle = g; c.beginPath();
    if (v < 0.4) { // oval / birch
      c.moveTo(0, -s); c.bezierCurveTo(s * 0.85, -s * 0.55, s * 0.75, s * 0.55, 0, s * 0.92);
      c.bezierCurveTo(-s * 0.75, s * 0.55, -s * 0.85, -s * 0.55, 0, -s);
    } else if (v < 0.75) { // maple: 5 pointed lobes
      const pts = [];
      const lobes = [[-90, 1], [-35, 0.88], [25, 0.62], null, [155, 0.62], [215, 0.88]];
      for (const lobe of lobes) {
        if (!lobe) { pts.push([s * 0.08, s * 0.35], [-s * 0.08, s * 0.35]); continue; } // stem notch
        const [a, len] = lobe;
        const r0 = a * Math.PI / 180;
        pts.push([Math.cos(r0 - 0.32) * s * len * 0.45, Math.sin(r0 - 0.32) * s * len * 0.45]);
        pts.push([Math.cos(r0) * s * len, Math.sin(r0) * s * len]);
        pts.push([Math.cos(r0 + 0.32) * s * len * 0.45, Math.sin(r0 + 0.32) * s * len * 0.45]);
      }
      c.moveTo(pts[0][0], pts[0][1]); for (const [x, y] of pts.slice(1)) c.lineTo(x, y); c.closePath();
    } else { // oak: wavy edge
      const n = 7;
      c.moveTo(0, -s);
      for (let i = 1; i <= n; i++) { const y = -s + (2 * s * 0.92) * i / n; const w = s * 0.55 * Math.sin(Math.PI * i / (n + 1)); c.quadraticCurveTo(w * 1.35, y - s * 0.13, i === n ? 0 : w * 0.8, y); }
      for (let i = n - 1; i >= 0; i--) { const y = -s + (2 * s * 0.92) * i / n; const w = s * 0.55 * Math.sin(Math.PI * (i + 1) / (n + 1)); c.quadraticCurveTo(-w * 1.35, y + s * 0.13, i === 0 ? 0 : -w * 0.8, y); }
    }
    c.fill();
    c.strokeStyle = rgba(shade(col, 0.45), 0.45); c.lineWidth = Math.max(0.8, s * 0.05);
    c.beginPath(); c.moveTo(0, -s * 0.85); c.lineTo(0, s * 1.15); // midrib + stem
    for (const k of [-0.45, -0.1, 0.25]) { c.moveTo(0, s * k); c.lineTo(s * 0.32, s * (k - 0.25)); c.moveTo(0, s * k); c.lineTo(-s * 0.32, s * (k - 0.25)); }
    c.stroke();
  }
  function shade(hex, f) {
    const [r, g, b] = hexRgb(hex).split(',').map(Number);
    const cl = (x) => Math.max(0, Math.min(255, Math.round(x)));
    return `#${[r * f, g * f, b * f].map((x) => cl(x).toString(16).padStart(2, '0')).join('')}`;
  }
  function petal(c, s, col) { c.fillStyle = col; c.beginPath(); c.ellipse(0, 0, s * 0.55, s, 0, 0, TAU); c.fill(); c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.ellipse(-s * 0.15, -s * 0.2, s * 0.15, s * 0.45, 0, 0, TAU); c.fill(); }
  function confettiRect(c, s, col) { c.fillStyle = col; c.fillRect(-s * 0.5, -s * 0.25, s, s * 0.5); }
  function heart(c, s, col) { c.fillStyle = col; c.beginPath(); c.moveTo(0, s * 0.35); c.bezierCurveTo(-s, -s * 0.4, -s * 0.45, -s * 1.1, 0, -s * 0.45); c.bezierCurveTo(s * 0.45, -s * 1.1, s, -s * 0.4, 0, s * 0.35); c.fill(); }
  function bubble(c, s, col) { c.strokeStyle = rgba(col, 0.8); c.lineWidth = Math.max(1, s * 0.08); c.beginPath(); c.arc(0, 0, s, 0, TAU); c.stroke(); c.fillStyle = rgba(col, 0.6); c.beginPath(); c.arc(-s * 0.35, -s * 0.35, s * 0.2, 0, TAU); c.fill(); }
  function drawStar(c, x, y, s, rotDeg, col, k) {
    if (s <= 0.5) return;
    c.save(); c.translate(x, y); c.rotate(rotDeg * Math.PI / 180);
    c.globalCompositeOperation = 'lighter';
    const core = c.createRadialGradient(0, 0, 0, 0, 0, s * 0.35);
    core.addColorStop(0, rgba('#ffffff', 0.95 * k)); core.addColorStop(0.4, rgba(col, 0.5 * k)); core.addColorStop(1, rgba(col, 0));
    c.fillStyle = core; c.beginPath(); c.arc(0, 0, s * 0.35, 0, TAU); c.fill();
    for (const [len, w] of [[1, 0.035], [0.55, 0.025]]) {
      for (let i = 0; i < 2; i++) {
        c.save(); c.rotate(i * Math.PI / 2 + (len < 1 ? Math.PI / 4 : 0));
        const g = c.createLinearGradient(-s * len, 0, s * len, 0);
        g.addColorStop(0, rgba(col, 0)); g.addColorStop(0.5, rgba('#ffffff', 0.9 * k)); g.addColorStop(1, rgba(col, 0));
        c.fillStyle = g; c.beginPath(); c.moveTo(-s * len, 0); c.lineTo(0, -s * w); c.lineTo(s * len, 0); c.lineTo(0, s * w); c.closePath(); c.fill();
        c.restore();
      }
    }
    c.restore();
  }

  function keepOutRects(roles) {
    if (!roles.length) return [];
    return S.boxes.filter(b => roles.includes(b.role) || roles.includes(b.id)).map(b => ({ ...b, pad: Math.min(S.W, S.H) * 0.03 }));
  }
  function keepFade(x, y, rects) {
    let a = 1;
    for (const b of rects) {
      const dx = Math.max(b.x - x, 0, x - (b.x + b.w)), dy = Math.max(b.y - y, 0, y - (b.y + b.h));
      const d = Math.hypot(dx, dy);
      a = Math.min(a, clamp(d / b.pad, 0, 1));
    }
    return a;
  }

  async function brightSpots(src, count) {
    const img = await loadImage(src);
    const w = 160, h = Math.max(1, Math.round(160 * img.height / img.width));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h).data;
    const cand = [];
    for (let j = 2; j < h - 2; j++) for (let i = 2; i < w - 2; i++) {
      const o = (j * w + i) * 4; if (d[o + 3] < 200) continue;
      const lum = 0.299 * d[o] + 0.587 * d[o + 1] + 0.114 * d[o + 2];
      cand.push([lum, i, j]);
    }
    cand.sort((a, b) => b[0] - a[0]);
    const pts = [];
    for (const [, i, j] of cand) {
      if (pts.every(([pi, pj]) => Math.hypot(pi - i, pj - j) > w * 0.18)) pts.push([i, j]);
      if (pts.length >= count) break;
    }
    return pts.map(([i, j]) => [i / w, j / h]);
  }

  function noiseTile(n, scale, seed, alphaFog = false, color = '#ffffff') {
    // Tileable value noise (periodic lattice) → data URL.
    const r = rng(seed * 1009 + 17);
    const g = scale;
    const lat = Array.from({ length: g * g }, () => r());
    const L = (i, j) => lat[((j % g + g) % g) * g + ((i % g + g) % g)];
    const c = document.createElement('canvas'); c.width = c.height = n;
    const x = c.getContext('2d'); const im = x.createImageData(n, n);
    const sm = k => k * k * (3 - 2 * k);
    const [cr, cg, cb] = hexRgb(color).split(',').map(Number);
    for (let py = 0; py < n; py++) for (let px = 0; px < n; px++) {
      let v = 0, amp = 1, tot = 0;
      for (let o = 0; o < 3; o++) {
        const f = (1 << o);
        const u = px / n * g * f, w2 = py / n * g * f;
        const i = Math.floor(u), j = Math.floor(w2), fu = sm(u - i), fv = sm(w2 - j);
        const a = L(i, j), b = L(i + 1, j), cc = L(i, j + 1), d = L(i + 1, j + 1);
        v += amp * lerp(lerp(a, b, fu), lerp(cc, d, fu), fv); tot += amp; amp *= 0.5;
      }
      v /= tot;
      const o4 = (py * n + px) * 4;
      if (alphaFog) { im.data[o4] = cr; im.data[o4 + 1] = cg; im.data[o4 + 2] = cb; im.data[o4 + 3] = clamp((v - 0.35) * 2.2, 0, 1) * 255; }
      else { im.data[o4] = v * 255; im.data[o4 + 1] = (1 - v) * 255; im.data[o4 + 2] = 128; im.data[o4 + 3] = 255; }
    }
    x.putImageData(im, 0, 0);
    return c.toDataURL();
  }

  function hexRgb(h) {
    if (!h.startsWith('#')) return h;
    let s = h.slice(1); if (s.length === 3) s = s.split('').map(c => c + c).join('');
    const n = parseInt(s, 16); return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
  }
  function rgba(h, a) { return `rgba(${hexRgb(h)},${a})`; }
})();
