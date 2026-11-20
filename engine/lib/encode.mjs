// Encoding: PNG frames → MP4 (H.264), WebM (VP9), GIF, poster.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const run = args => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });

// Exact output size, square pixels, limited-range BT.709 — the combination browsers and
// admin uploaders expect. Frames may be supersampled (dsf>1), so always rescale.
function vf(w, h) { return `scale=${w}:${h}:flags=lanczos:out_range=tv,setsar=1,format=yuv420p`; }
const COLOR = ['-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709'];

export function encodeMp4(framesDir, file, { w, h, fps, crf = 20, profile = 'high', level, maxBytes, maxrate }) {
  const attempt = (c) => {
    const args = ['-framerate', String(fps), '-i', path.join(framesDir, '%05d.png'), '-vf', vf(w, h), ...COLOR,
      '-c:v', 'libx264', '-preset', 'slow', '-crf', String(c), '-profile:v', profile, '-pix_fmt', 'yuv420p',
      '-g', String(fps * 2), '-movflags', '+faststart', '-an'];
    if (level) args.push('-level', String(level));
    if (maxrate) args.push('-maxrate', maxrate, '-bufsize', maxrate.replace(/M$/, '') * 1.25 + 'M');
    run([...args, file]);
    return fs.statSync(file).size;
  };
  let c = crf, size = attempt(c);
  while (maxBytes && size > maxBytes && c < 30) { c += 2; size = attempt(c); }
  return { file, bytes: size, crf: c, overBudget: maxBytes ? size > maxBytes : false };
}

export function encodeWebm(framesDir, file, { w, h, fps, crf = 34, maxBytes }) {
  const attempt = (c) => {
    run(['-framerate', String(fps), '-i', path.join(framesDir, '%05d.png'), '-vf', vf(w, h), ...COLOR,
      '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', String(c), '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', '-an', file]);
    return fs.statSync(file).size;
  };
  let c = crf, size = attempt(c);
  while (maxBytes && size > maxBytes && c < 50) { c += 4; size = attempt(c); }
  return { file, bytes: size, crf: c, overBudget: maxBytes ? size > maxBytes : false };
}

// GIF: reduced fps and width keep files reasonable; a per-video palette avoids banding.
export function encodeGif(framesDir, file, { w, h, fps, gifFps = 15, gifWidth = 640, maxBytes }) {
  const attempt = (gw, gf) => {
    const gh = Math.round(gw * h / w / 2) * 2;
    const filters = `fps=${gf},scale=${gw}:${gh}:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff:max_colors=200[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle`;
    run(['-framerate', String(fps), '-i', path.join(framesDir, '%05d.png'), '-filter_complex', filters, '-loop', '0', file]);
    return fs.statSync(file).size;
  };
  let gw = Math.min(gifWidth, w), gf = Math.min(gifFps, fps), size = attempt(gw, gf);
  while (maxBytes && size > maxBytes && gw > 240) { gw = Math.round(gw * 0.8); if (gf > 10) gf -= 2; size = attempt(gw, gf); }
  return { file, bytes: size, width: gw, fps: gf, overBudget: maxBytes ? size > maxBytes : false };
}

export function poster(framesDir, file, { w, h, frame = 0 }) {
  run(['-i', path.join(framesDir, `${String(frame).padStart(5, '0')}.png`), '-vf', `scale=${w}:${h}:flags=lanczos`, '-q:v', '2', file]);
  return { file, bytes: fs.statSync(file).size };
}

// Contact sheet for visual self-review: evenly spaced frames in a grid.
export function contactSheet(framesDir, file, { frames, w, h, count = 8 }) {
  const cols = 4, rows = Math.ceil(count / cols);
  const step = Math.max(1, Math.floor(frames / count));
  const tw = Math.min(480, Math.round(1600 / cols));
  const th = Math.round(tw * h / w / 2) * 2;
  run(['-i', path.join(framesDir, '%05d.png'), '-vf', `select='not(mod(n\\,${step}))',scale=${tw}:${th},tile=${cols}x${rows}:padding=4:color=white`, '-frames:v', '1', file]);
  return file;
}
