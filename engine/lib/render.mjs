// Frame capture: serve the stage over a local HTTP server (so canvases are never tainted),
// seek every frame in headless Chrome and save PNGs.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { frameCount, loopWindow } from './scene.mjs';

const ENGINE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf' };

function startServer() {
  const files = new Map();
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    if (url === '/favicon.ico') { res.writeHead(204); return res.end(); }
    let file;
    if (url.startsWith('/f/')) file = files.get(url.slice(3));
    else file = path.join(ENGINE_DIR, url === '/' ? 'stage.html' : url.slice(1));
    if (!file || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => {
    const port = server.address().port;
    const expose = (abs) => { const key = `${files.size}${path.extname(abs)}`; files.set(key, abs); return `http://127.0.0.1:${port}/f/${key}`; };
    resolve({ server, port, expose });
  }));
}

async function loadPlaywright() {
  try { return await import('playwright'); }
  catch {
    throw new Error('Playwright is not installed. Run: scripts/setup.sh');
  }
}

export async function captureFrames(scene, { outDir, dsf = 1, onProgress } = {}) {
  const { chromium } = await loadPlaywright();
  const { server, port, expose } = await startServer();
  const sc = structuredClone(scene);
  for (const L of sc.layers) { L.src = expose(L.src); if (L.mask) L.mask = expose(L.mask); for (const fx of L.effects || []) if (fx.map) fx.map = expose(fx.map); }
  for (const O of sc.overlays) if (O.sprite) O.sprite = expose(O.sprite);

  let browser;
  const args = ['--disable-gpu-vsync', '--force-color-profile=srgb', '--hide-scrollbars'];
  try { browser = await chromium.launch({ channel: 'chrome', args }); }
  catch { browser = await chromium.launch({ args }); }
  const W = sc.canvas.w, H = sc.canvas.h;
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: dsf });
  const logs = [];
  page.on('console', m => { if (m.type() === 'warning' || m.type() === 'error') logs.push(m.text()); });
  page.on('pageerror', e => logs.push(String(e)));
  await page.goto(`http://127.0.0.1:${port}/stage.html`);
  const info = await page.evaluate(s => window.__setup(s), sc);

  const framesDir = path.join(outDir, 'frames');
  fs.rmSync(framesDir, { recursive: true, force: true });
  fs.mkdirSync(framesDir, { recursive: true });
  const n = frameCount(sc);
  const fps = sc.canvas.fps;
  const stage = page.locator('#stage');
  const shoot = async (t, file) => { await page.evaluate(tt => window.__seek(tt), t); await stage.screenshot({ path: file, type: 'png', animations: 'disabled' }); };
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    await shoot(i / fps, path.join(framesDir, `${String(i).padStart(5, '0')}.png`));
    if (onProgress && (i % 15 === 0 || i === n - 1)) onProgress(i + 1, n, Date.now() - t0);
  }
  // Seam probes for the loop check: the frame right after the loop must equal its first frame.
  const win = loopWindow(sc);
  const probes = {};
  if (win) {
    const checks = path.join(outDir, 'checks'); fs.mkdirSync(checks, { recursive: true });
    await shoot(win[0], path.join(checks, 'loop-start.png'));
    await shoot(win[1], path.join(checks, 'loop-end.png'));
    await shoot(win[0] + 1 / fps, path.join(checks, 'loop-next.png'));
    probes.start = path.join(checks, 'loop-start.png'); probes.end = path.join(checks, 'loop-end.png'); probes.next = path.join(checks, 'loop-next.png');
  }
  await browser.close();
  server.close();
  return { framesDir, frames: n, info, logs, probes, ms: Date.now() - t0 };
}
