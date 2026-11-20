// Scene loading: resolve paths, fill defaults, read image sizes.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export function imageSize(file) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=s=x:p=0', file]).toString().trim();
  const [w, h] = out.split('x').map(Number);
  if (!w || !h) throw new Error(`cannot read image size: ${file}`);
  return { w, h };
}

const STRUCTURES = new Set(['loop', 'intro-loop', 'oneshot']);

export function loadScene(scenePath) {
  const abs = path.resolve(scenePath);
  const dir = path.dirname(abs);
  const raw = JSON.parse(fs.readFileSync(abs, 'utf8'));
  return normalizeScene(raw, dir);
}

export function normalizeScene(raw, baseDir) {
  const s = structuredClone(raw);
  const res = p => (p && !/^(https?:|data:)/.test(p) ? path.resolve(baseDir, p) : p);
  s.layers = (s.layers || []).map((L, i) => ({ id: L.id || `layer${i}`, z: L.z ?? i, depth: L.depth ?? 0.5, role: L.role || 'decor', ...L, src: res(L.src), mask: res(L.mask) }));
  if (!s.layers.length) throw new Error('scene has no layers');
  for (const L of s.layers) {
    if (!fs.existsSync(L.src)) throw new Error(`layer ${L.id}: file not found ${L.src}`);
    for (const fx of L.effects || []) if (fx.map) fx.map = res(fx.map);
  }
  for (const O of s.overlays || []) if (O.sprite) O.sprite = res(O.sprite);

  // Source space: explicit, or the size of the background / first layer.
  if (!s.source) {
    const ref = s.layers.find(l => l.role === 'background') || s.layers[0];
    s.source = imageSize(ref.src);
  }
  for (const L of s.layers) {
    if (L.w == null || L.h == null) {
      const sz = imageSize(L.src);
      if (L.w == null && L.h == null) { L.w = sz.w; L.h = sz.h; }
      else if (L.w == null) L.w = L.h * sz.w / sz.h;
      else L.h = L.w * sz.h / sz.w;
    }
    L.x ??= 0; L.y ??= 0;
  }

  const c = s.canvas = { fps: 30, duration: 6, structure: 'loop', fit: 'cover', background: '#000000', ...(s.canvas || {}) };
  if (!c.w || !c.h) {
    // keep the source proportions; cap the long side so huge originals stay renderable
    const k = Math.min(1, (c.maxSide || 1920) / Math.max(s.source.w, s.source.h));
    c.w = Math.round(s.source.w * k); c.h = Math.round(s.source.h * k);
  }
  c.w = even(c.w); c.h = even(c.h);
  if (!STRUCTURES.has(c.structure)) throw new Error(`canvas.structure must be one of ${[...STRUCTURES].join(', ')}`);
  if (c.structure === 'intro-loop') {
    c.intro ??= 1.2; c.loop ??= c.duration; c.repeats ??= 1;
    c.duration = c.intro + c.loop * c.repeats;
  }
  if (!c.focus) c.focus = autoFocus(s);
  s.seed ??= 7;
  s.camera ??= {};
  s.overlays ??= [];
  return s;
}

const even = n => Math.round(n / 2) * 2;

// Default focus: centre of the text/price/logo block, else the subject, else the middle.
function autoFocus(s) {
  const pick = roles => s.layers.filter(l => roles.includes(l.role));
  const group = pick(['text', 'price', 'logo', 'cta', 'legal']).length ? pick(['text', 'price', 'logo', 'cta', 'legal']) : pick(['subject']);
  if (!group.length) return [0.5, 0.5];
  const x1 = Math.min(...group.map(l => l.x)), y1 = Math.min(...group.map(l => l.y));
  const x2 = Math.max(...group.map(l => l.x + l.w)), y2 = Math.max(...group.map(l => l.y + l.h));
  return [((x1 + x2) / 2) / s.source.w, ((y1 + y2) / 2) / s.source.h];
}

export function frameCount(scene) {
  return Math.round(scene.canvas.duration * scene.canvas.fps);
}

// Time window that must repeat seamlessly (null for one-shots).
export function loopWindow(scene) {
  const c = scene.canvas;
  if (c.structure === 'loop') return [0, c.duration];
  if (c.structure === 'intro-loop') return [c.intro, c.intro + c.loop];
  return null;
}
