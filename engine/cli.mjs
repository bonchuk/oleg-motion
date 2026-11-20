#!/usr/bin/env node
// oleg-motion CLI
//   render <scene.json> [--out DIR] [--formats mp4,webm,gif] [--quality draft|final] [--profile NAME]
//   scene  --layers layers.json [--mood calm] [--profile story] [--structure loop|intro-loop|oneshot]
//          [--duration 6] [--intro 2] [--intensity 1] [--speed 1] [--density 1] [--brand brand.json] [--out scene.json]
//   layers-from-dir <dir> [--out layers.json]      # folder of PNG layers → layers.json
//   moods | profiles | doctor
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadScene, imageSize, loopWindow } from './lib/scene.mjs';
import { captureFrames } from './lib/render.mjs';
import { encodeMp4, encodeWebm, encodeGif, poster, contactSheet } from './lib/encode.mjs';
import { checkSeam, checkFlashes, checkLocked, probeVideo } from './lib/check.mjs';
import { MOODS, loadProfiles, buildScene, applyBrand, guessRole, ROLE_DEPTH } from './lib/autoscene.mjs';

const argv = process.argv.slice(2);
const cmd = argv[0];
const opt = (name, def) => { const i = argv.indexOf('--' + name); return i > -1 ? argv[i + 1] : def; };
const flag = name => argv.includes('--' + name);
const pos = argv.filter((a, i) => i > 0 && !a.startsWith('--') && !argv[i - 1]?.startsWith('--'));
const log = (...a) => console.error(...a);

async function cmdRender() {
  const scenePath = pos[0];
  if (!scenePath) throw new Error('usage: render <scene.json>');
  const scene = loadScene(scenePath);
  const profiles = loadProfiles();
  const prof = profiles[opt('profile', scene.profile || 'source')] || {};
  const outDir = path.resolve(opt('out', path.join(path.dirname(path.resolve(scenePath)), 'out')));
  fs.mkdirSync(outDir, { recursive: true });
  const quality = opt('quality', 'final');
  // Supersample small canvases for crisp edges; cap the pixel budget for speed.
  const px = scene.canvas.w * scene.canvas.h;
  const dsf = Number(opt('dsf', quality === 'draft' ? 1 : (px <= 1.3e6 ? 2 : 1)));
  const formats = (opt('formats', quality === 'draft' ? 'mp4' : (scene.formats || 'mp4,webm'))).split(',').map(s => s.trim()).filter(Boolean);
  const name = opt('name', path.basename(scenePath, '.json'));
  log(`render ${scene.canvas.w}×${scene.canvas.h} @${scene.canvas.fps}fps ${scene.canvas.duration}s ${scene.canvas.structure} dsf=${dsf}`);
  const cap = await captureFrames(scene, { outDir, dsf, onProgress: (i, n, ms) => log(`  frame ${i}/${n}  ${(ms / 1000).toFixed(1)}s`) });
  const { w, h, fps } = scene.canvas;
  const report = { scene: path.resolve(scenePath), canvas: scene.canvas, frames: cap.frames, renderSeconds: +(cap.ms / 1000).toFixed(1), outputs: {}, checks: {}, warnings: cap.logs };

  if (formats.includes('mp4')) { const r = encodeMp4(cap.framesDir, path.join(outDir, `${name}.mp4`), { w, h, fps, ...(prof.mp4 || {}) }); report.outputs.mp4 = { ...r, probe: probeVideo(r.file) }; }
  if (formats.includes('webm')) { const r = encodeWebm(cap.framesDir, path.join(outDir, `${name}.webm`), { w, h, fps, ...(prof.webm || {}) }); report.outputs.webm = r; }
  if (formats.includes('gif')) { const g = { width: 480, fps: 15, maxBytes: 6000000, ...(prof.gif || {}) }; const r = encodeGif(cap.framesDir, path.join(outDir, `${name}.gif`), { w, h, fps, gifWidth: g.width, gifFps: g.fps, maxBytes: g.maxBytes }); report.outputs.gif = r; }
  report.outputs.poster = poster(cap.framesDir, path.join(outDir, `${name}-poster.jpg`), { w, h, frame: scene.canvas.structure === 'intro-loop' ? Math.min(cap.frames - 1, Math.round(scene.canvas.intro * fps)) : 0 });
  report.outputs.contactSheet = contactSheet(cap.framesDir, path.join(outDir, `${name}-sheet.jpg`), { frames: cap.frames, w, h });

  report.checks.loop = checkSeam(cap.probes);
  report.checks.flashes = checkFlashes(cap.framesDir, fps);
  report.checks.locked = checkLocked(cap.framesDir, scene, cap.info.fit, fps);
  const budget = Object.entries(report.outputs).filter(([, v]) => v && v.overBudget).map(([k]) => k);
  report.checks.budget = { ok: !budget.length, over: budget };
  if (prof.maxDuration && scene.canvas.duration > prof.maxDuration) report.checks.duration = { ok: false, max: prof.maxDuration };
  report.ok = Object.values(report.checks).every(c => !c || c.ok !== false);
  if (!flag('keep-frames')) fs.rmSync(cap.framesDir, { recursive: true, force: true });
  fs.writeFileSync(path.join(outDir, `${name}-report.json`), JSON.stringify(report, null, 2));
  printSummary(report);
}

function printSummary(r) {
  const kb = b => (b / 1024).toFixed(0) + ' KB';
  log(`\nrendered ${r.frames} frames in ${r.renderSeconds}s`);
  for (const [k, v] of Object.entries(r.outputs)) if (v && v.file) log(`  ${k.padEnd(12)} ${v.file}${v.bytes ? '  ' + kb(v.bytes) : ''}${v.overBudget ? '  OVER BUDGET' : ''}`); else if (typeof v === 'string') log(`  ${k.padEnd(12)} ${v}`);
  const c = r.checks;
  if (c.loop) log(`  loop seam    ${c.loop.ok ? 'ok' : 'VISIBLE'} (seam ${c.loop.seamDiff} vs step ${c.loop.typicalStep})`);
  log(`  flashes      ${c.flashes.ok ? 'ok' : 'FAIL'} (max ${c.flashes.worstPerSecond}/s)`);
  if (c.locked) log(`  locked text  ${c.locked.ok ? 'ok' : 'MOVES'} ${c.locked.layers.map(l => l.id + ':' + l.maxDiff).join(' ')}`);
  log(`  budget       ${c.budget.ok ? 'ok' : 'over: ' + c.budget.over.join(',')}`);
  if (r.warnings.length) log(`  browser warnings: ${r.warnings.slice(0, 5).join(' | ')}`);
  log(r.ok ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED — see report');
}

function cmdScene() {
  const layersPath = opt('layers');
  if (!layersPath) throw new Error('usage: scene --layers layers.json [--mood calm] [--profile story]');
  const abs = path.resolve(layersPath);
  const L = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const profiles = loadProfiles();
  const brand = opt('brand') ? JSON.parse(fs.readFileSync(path.resolve(opt('brand')), 'utf8')) : null;
  const D = brand?.defaults || {};
  const profName = opt('profile', D.profile || 'source');
  const profile = profiles[profName];
  if (!profile) throw new Error(`unknown profile ${profName}. Available: ${Object.keys(profiles).join(', ')}`);
  const out = path.resolve(opt('out', path.join(path.dirname(abs), 'scene.json')));
  const rel = p => path.relative(path.dirname(out), path.resolve(path.dirname(abs), p));
  const layers = L.layers.map(l => { const { text, ...rest } = l; return { ...rest, src: rel(l.src), ...(l.mask ? { mask: rel(l.mask) } : {}), ...(l.depthMap ? { depthMap: rel(l.depthMap) } : {}), ...(text ? { note: text } : {}) }; });
  const scene = buildScene({
    layers, source: L.source, mood: opt('mood', D.mood || 'calm'), profile, structure: opt('structure', D.structure || 'loop'),
    duration: opt('duration') ? Number(opt('duration')) : D.duration, intro: opt('intro') ? Number(opt('intro')) : D.intro,
    intensity: Number(opt('intensity', D.intensity ?? 1)), speed: Number(opt('speed', D.speed ?? 1)), density: Number(opt('density', D.density ?? 1)), seed: Number(opt('seed', 7)), fit: opt('fit'), depthParallax: !flag('no-depth-parallax'),
  });
  scene.profile = profName;
  applyBrand(scene, brand);
  if (D.formats) scene.formats = D.formats;
  fs.writeFileSync(out, JSON.stringify(scene, null, 2));
  log(`scene written: ${out}`);
  console.log(out);
}

function cmdLayersFromDir() {
  const dir = path.resolve(pos[0] || '.');
  const files = fs.readdirSync(dir).filter(f => /\.(png|jpe?g|webp)$/i.test(f)).sort();
  if (!files.length) throw new Error('no images in ' + dir);
  const sizes = files.map(f => ({ f, ...imageSize(path.join(dir, f)) }));
  const big = sizes.reduce((a, b) => (a.w * a.h >= b.w * b.h ? a : b));
  const layers = sizes.map((s, i) => {
    const role = guessRole(path.parse(s.f).name);
    return { id: path.parse(s.f).name.replace(/[^\w-]+/g, '_'), src: s.f, role, depth: ROLE_DEPTH[role], z: i, x: 0, y: 0, w: s.w, h: s.h };
  });
  // Background first, then by name order (file names like 01_bg.png control stacking).
  layers.sort((a, b) => (a.role === 'background' ? -1 : 0) - (b.role === 'background' ? -1 : 0) || a.z - b.z);
  layers.forEach((l, i) => (l.z = i));
  const sameSize = sizes.every(s => s.w === big.w && s.h === big.h);
  const out = path.resolve(opt('out', path.join(dir, 'layers.json')));
  fs.writeFileSync(out, JSON.stringify({ source: { w: big.w, h: big.h }, layers, note: sameSize ? 'all layers are full-canvas PNGs' : 'layers differ in size: set x/y for the smaller ones' }, null, 2));
  log(`layers.json written: ${out}`);
  for (const l of layers) log(`  ${l.role.padEnd(10)} ${l.src}`);
  console.log(out);
}

function cmdDoctor() {
  const ok = (name, fn) => { try { const v = fn(); log(`  ✓ ${name} ${v || ''}`); return true; } catch (e) { log(`  ✗ ${name} — ${e.message.split('\n')[0]}`); return false; } };
  log('core:');
  ok('ffmpeg', () => execFileSync('ffmpeg', ['-version']).toString().split('\n')[0]);
  ok('libx264', () => { if (!execFileSync('ffmpeg', ['-hide_banner', '-encoders']).toString().includes('libx264')) throw new Error('missing'); });
  ok('libvpx-vp9', () => { if (!execFileSync('ffmpeg', ['-hide_banner', '-encoders']).toString().includes('libvpx-vp9')) throw new Error('missing (WebM disabled)'); });
  ok('node', () => process.version);
  ok('playwright', () => { execFileSync(process.execPath, ['-e', "import('playwright').then(()=>0)"], { cwd: path.dirname(new URL(import.meta.url).pathname) }); });
  const venvPy = path.join(process.env.OLEG_MOTION_HOME || path.join(process.env.HOME, '.cache', 'oleg-motion'), 'venv', 'bin', 'python');
  log('optional (python venv for PSD and auto-layers):');
  if (!ok('venv', () => { if (!fs.existsSync(venvPy)) throw new Error('not created — run scripts/setup.sh --ml'); return venvPy; })) return;
  for (const [mod, what] of [['PIL', 'Pillow'], ['psd_tools', 'PSD import'], ['cv2', 'OpenCV'], ['rembg', 'subject cut-out'], ['ocrmac', 'text detection (macOS)'], ['simple_lama_inpainting', 'LaMa inpainting'], ['transformers', 'depth model']]) {
    ok(`${what} (${mod})`, () => execFileSync(venvPy, ['-c', `import ${mod}`], { stdio: 'pipe' }) && '');
  }
}

const cmds = {
  render: cmdRender, scene: cmdScene, 'layers-from-dir': cmdLayersFromDir, doctor: cmdDoctor,
  moods: () => { for (const [k, v] of Object.entries(MOODS)) if (!k.startsWith('_')) console.log(`${k.padEnd(10)} ${v.label}`); },
  profiles: () => { for (const [k, v] of Object.entries(loadProfiles())) console.log(`${k.padEnd(20)} ${v.label}${v.w ? `  ${v.w}×${v.h}` : ''}`); },
};
if (!cmds[cmd]) { log('commands: ' + Object.keys(cmds).join(', ')); process.exit(1); }
Promise.resolve(cmds[cmd]()).catch(e => { log('error: ' + e.message); process.exit(1); });
