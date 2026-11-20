// Build a scene.json from a layers description + mood + profile. The result is meant to be
// edited: it is a sensible first draft, not a final answer.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ENGINE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MOODS = JSON.parse(fs.readFileSync(path.join(ENGINE_DIR, 'moods.json'), 'utf8'));
export function loadProfiles() {
  const dir = path.resolve(ENGINE_DIR, '..', 'profiles');
  const all = {};
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) Object.assign(all, JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
  delete all._doc;
  return all;
}

// Scale amplitude-like params by intensity; speed scales whole cycles (kept integer).
const AMP_KEYS = ['ampX', 'ampY', 'deg', 'degX', 'degY', 'amp', 'opacity', 'strength', 'push', 'panX', 'panY', 'radius'];
function scaleFx(fx, intensity, speed) {
  const o = { ...fx };
  for (const k of AMP_KEYS) if (typeof o[k] === 'number') o[k] = +(o[k] * intensity).toFixed(4);
  if (typeof o.opacity === 'number') o.opacity = Math.min(1, o.opacity);
  if (speed !== 1 && typeof o.cycles === 'number') o.cycles = Math.max(1, Math.round(o.cycles * speed));
  return o;
}

export function buildScene({ layers, source, mood = 'calm', profile, structure = 'loop', duration, intro, intensity = 1, speed = 1, density = 1, seed = 7, fit, depthParallax = true }) {
  const M = MOODS[mood];
  if (!M) throw new Error(`unknown mood "${mood}". Available: ${Object.keys(MOODS).filter(k => !k.startsWith('_')).join(', ')}`);
  const P = profile || {};
  const canvas = { fps: P.fps || 30, structure, fit: fit || 'cover' };
  if (P.w) { canvas.w = P.w; canvas.h = P.h; } else if (P.maxSide) canvas.maxSide = P.maxSide;
  const dur = duration || (structure === 'oneshot' ? 8 : structure === 'intro-loop' ? 4 : 6);
  if (structure === 'intro-loop') { canvas.intro = intro ?? 2; canvas.loop = dur; canvas.repeats = 1; canvas.duration = canvas.intro + dur; }
  else canvas.duration = dur;
  if (P.maxDuration) canvas.duration = Math.min(canvas.duration, P.maxDuration);

  const camera = scaleFx(M.camera || {}, intensity, speed);
  const out = { canvas, source, seed, camera, layers: [], overlays: [] };
  for (const L of layers) {
    const effects = [];
    if (structure !== 'loop') for (const fx of (MOODS._intro[L.role] || [])) effects.push({ ...fx });
    for (const fx of (M.roles[L.role] || [])) effects.push(scaleFx(fx, intensity, speed));
    if (L.depthMap && depthParallax) effects.push({ type: 'depthParallax', map: L.depthMap, amp: +(8 * intensity).toFixed(2), cycles: 1 });
    if (L.effects) effects.push(...L.effects);
    out.layers.push({ ...L, effects });
  }
  for (const O of (M.overlays || [])) {
    const o = scaleFx(O, intensity, speed);
    if (typeof o.count === 'number') o.count = Math.max(1, Math.round(o.count * density));
    // particles in front of the layers fade out over small, must-read elements
    if (o.type === 'particles' && o.z !== 'back') {
      const guard = ['price', 'legal', 'cta', 'logo'].filter((r) => layers.some((L) => L.role === r));
      const keep = [...new Set([...(o.keepOut || []), ...guard])];
      if (keep.length) o.keepOut = keep;
    }
    out.overlays.push(o);
  }
  return out;
}

// Guess roles from file/layer names (works for PSD layer names and PNG file names).
export function guessRole(name) {
  const n = name.toLowerCase();
  const table = [
    [/^(bg|back|background|фон|plate)|background|backdrop/, 'background'],
    [/price|ціна|цена|sale|discount|знижк|скидк|%/, 'price'],
    [/legal|terms|умови|услови|date|дата|disclaimer/, 'legal'],
    [/logo|лого/, 'logo'],
    [/cta|button|кнопк|btn/, 'cta'],
    [/text|title|headline|заголов|текст|copy|slogan/, 'text'],
    [/fg|foreground|передн|overlay|leaf|лист/, 'foreground'],
    [/subject|product|товар|model|person|людин|hero|object|об'єкт/, 'subject'],
  ];
  for (const [re, role] of table) if (re.test(n)) return role;
  return 'decor';
}

// Default depth by role: far background, mid subject, near foreground; text/price above.
export const ROLE_DEPTH = { background: 0.05, decor: 0.4, subject: 0.6, foreground: 0.95, text: 0.7, logo: 0.7, cta: 0.7, price: 0.7, legal: 0.7 };

// Apply a brand kit (see references/brand-kit.md) to a drafted scene: brand colours on
// particles / glows / light leaks, protected layers keep only light + intro effects,
// unwanted overlay types removed. Defaults (profile, mood, …) are read by the CLI.
const LIGHT_OR_INTRO = new Set(['shine', 'glint', 'glow', 'fadeIn', 'riseIn', 'slideIn', 'popIn', 'blurIn', 'wipeIn', 'fadeOut']);
const COLOURED_PARTICLES = new Set(['dust', 'sparks', 'stars', 'bokeh', 'confetti', 'bubbles']);
function matches(patterns, L) {
  return (patterns || []).some((p) => {
    const re = new RegExp('^' + String(p).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i');
    return re.test(L.id) || re.test(L.role);
  });
}
export function applyBrand(scene, brand) {
  if (!brand) return scene;
  const pal = brand.palette || {};
  const accents = [pal.accent, pal.accent2, pal.light].filter(Boolean);
  for (const L of scene.layers) {
    if (matches(brand.protect, L)) L.effects = (L.effects || []).filter((fx) => LIGHT_OR_INTRO.has(fx.type));
    for (const fx of L.effects || []) if (fx.type === 'glow' && pal.accent) fx.color = pal.accent;
  }
  scene.overlays = (scene.overlays || []).filter((o) => !(brand.avoid || []).includes(o.type) && !(brand.avoid || []).includes(o.kind));
  for (const o of scene.overlays) {
    if (o.type === 'particles' && accents.length && COLOURED_PARTICLES.has(o.kind)) o.colors = accents;
    if (o.type === 'lightLeak' && accents.length) o.colors = accents.slice(0, 2);
    if ((o.type === 'rays' || o.type === 'fog') && pal.light) o.color = pal.light;
  }
  if (brand.name) scene.brand = brand.name;
  return scene;
}
