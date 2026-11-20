// Automatic checks on rendered frames: loop seam, flashes, locked layers, file budgets.
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// Read frames as tiny grayscale grids through ffmpeg (no image libraries needed).
function grayGrid(input, { gw = 16, gh = 16, isPattern = true, fps } = {}) {
  const args = ['-v', 'error'];
  if (isPattern && fps) args.push('-framerate', String(fps));
  args.push('-i', input, '-vf', `scale=${gw}:${gh}:flags=area,format=gray`, '-f', 'rawvideo', '-');
  const buf = execFileSync('ffmpeg', args, { maxBuffer: 1 << 28 });
  const n = gw * gh, frames = [];
  for (let o = 0; o + n <= buf.length; o += n) frames.push(buf.subarray(o, o + n));
  return frames;
}
const meanAbs = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };

export function checkSeam(probes) {
  if (!probes?.start) return null;
  const [s] = grayGrid(probes.start, { gw: 64, gh: 64, isPattern: false });
  const [e] = grayGrid(probes.end, { gw: 64, gh: 64, isPattern: false });
  const [nx] = grayGrid(probes.next, { gw: 64, gh: 64, isPattern: false });
  const seam = meanAbs(s, e), step = meanAbs(s, nx);
  // The jump across the loop point should look like an ordinary frame-to-frame change.
  const ratio = step > 0.05 ? seam / step : (seam < 0.5 ? 0 : 99);
  return { seamDiff: +seam.toFixed(3), typicalStep: +step.toFixed(3), ratio: +ratio.toFixed(2), ok: seam < 0.6 || ratio <= 2 };
}

// WCAG 2.3.1 approximation: a "flash" is a pair of opposing luminance changes ≥10% over
// ≥25% of the frame; more than 3 per second fails.
export function checkFlashes(framesDir, fps) {
  const frames = grayGrid(path.join(framesDir, '%05d.png'), { gw: 8, gh: 8, fps });
  const events = [];
  for (let i = 1; i < frames.length; i++) {
    let up = 0, down = 0;
    for (let k = 0; k < 64; k++) { const d = frames[i][k] - frames[i - 1][k]; if (d > 25.5) up++; else if (d < -25.5) down++; }
    if (up >= 16) events.push({ i, dir: 1 }); else if (down >= 16) events.push({ i, dir: -1 });
  }
  let flashes = 0; const times = [];
  for (let j = 1; j < events.length; j++) if (events[j].dir !== events[j - 1].dir) { flashes++; times.push(events[j].i / fps); }
  let worst = 0;
  for (const t of times) worst = Math.max(worst, times.filter(x => x >= t && x < t + 1).length);
  return { flashes, worstPerSecond: worst, ok: worst <= 3 };
}

// Locked layers (price/legal) must not change. Compare their screen rectangles across frames.
export function checkLocked(framesDir, scene, fit, fps) {
  // Intro/outro animate locked layers on purpose; check only the steady (loop) part.
  const c = scene.canvas;
  const from = c.structure === 'intro-loop' ? Math.ceil(c.intro * fps) : 0;
  const hasOutro = l => (l.effects || []).some(e => e.type === 'fadeOut');
  const locked = scene.layers.filter(l => ['price', 'legal'].includes(l.role) && !hasOutro(l) && (c.structure !== 'oneshot' || !(l.effects || []).some(e => /In$/.test(e.type))));
  if (!locked.length) return null;
  const res = [];
  for (const L of locked) {
    const x = Math.max(0, Math.round(fit.ox + L.x * fit.sc)), y = Math.max(0, Math.round(fit.oy + L.y * fit.sc));
    const w = Math.max(8, Math.round(L.w * fit.sc)), h = Math.max(8, Math.round(L.h * fit.sc));
    const frames = execCrop(framesDir, fps, x, y, w, h).slice(from);
    let worst = 0; for (let i = 1; i < frames.length; i++) worst = Math.max(worst, meanAbs(frames[0], frames[i]));
    res.push({ id: L.id, maxDiff: +worst.toFixed(2), ok: worst < 6 });
  }
  return { layers: res, ok: res.every(r => r.ok) };
}
function execCrop(framesDir, fps, x, y, w, h) {
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-framerate', String(fps), '-i', path.join(framesDir, '%05d.png'), '-vf', `crop=${w}:${h}:${x}:${y},scale=32:16:flags=area,format=gray`, '-f', 'rawvideo', '-'], { maxBuffer: 1 << 28 });
  const n = 32 * 16, out = []; for (let o = 0; o + n <= buf.length; o += n) out.push(buf.subarray(o, o + n)); return out;
}

export function probeVideo(file) {
  const j = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,profile,level,width,height,pix_fmt,color_range,sample_aspect_ratio,r_frame_rate,codec_type:format=duration,size', '-of', 'json', file]).toString());
  const v = j.streams.find(s => s.codec_type === 'video');
  return { codec: v.codec_name, profile: v.profile, level: v.level, w: v.width, h: v.height, pix_fmt: v.pix_fmt, color_range: v.color_range, sar: v.sample_aspect_ratio, fps: v.r_frame_rate, audio: j.streams.some(s => s.codec_type === 'audio'), duration: +j.format.duration, bytes: +j.format.size };
}

// Safe zones: must-read layers (text, price, legal, CTA) should keep ≥10 % from every edge
// (title-safe), logos ≥5 % (action-safe). A layer partly outside the frame fails; inside the
// frame but closer than the safe margin is a warning — designs often bleed on purpose, so the
// warning says whether the source already had the same margin.
export function checkSafeZones(scene, fit) {
  const c = scene.canvas, src = scene.source;
  const res = [];
  for (const L of scene.layers) {
    const need = ['text', 'price', 'legal', 'cta'].includes(L.role) ? 0.10 : L.role === 'logo' ? 0.05 : null;
    if (need == null) continue;
    const x1 = fit.ox + L.x * fit.sc, y1 = fit.oy + L.y * fit.sc;
    const x2 = x1 + L.w * fit.sc, y2 = y1 + L.h * fit.sc;
    const cut = x1 < -1 || y1 < -1 || x2 > c.w + 1 || y2 > c.h + 1;
    const margin = Math.min(x1 / c.w, (c.w - x2) / c.w, y1 / c.h, (c.h - y2) / c.h);
    const srcMargin = Math.min(L.x / src.w, (src.w - L.x - L.w) / src.w, L.y / src.h, (src.h - L.y - L.h) / src.h);
    res.push({ id: L.id, role: L.role, margin: +margin.toFixed(3), need, cut, sourceMargin: +srcMargin.toFixed(3),
      status: cut ? 'cut' : margin >= need ? 'ok' : (srcMargin < need && margin >= srcMargin - 0.01 ? 'as-designed' : 'tight') });
  }
  if (!res.length) return null;
  return { layers: res, ok: !res.some((r) => r.status === 'cut'), warn: res.some((r) => r.status === 'tight') };
}
