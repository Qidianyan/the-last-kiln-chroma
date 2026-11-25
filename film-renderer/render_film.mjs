import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, 'out');
const audioPath = path.join(outDir, 'soundtrack_84s.wav');
const materialsDir = path.resolve(__dirname, '..', '..', '..', 'materials');
const finalMp4Path = path.join(materialsDir, 'The_Last_Kiln_ShortFilm_1080p.mp4');

const FPS = 24;
const DURATION_SEC = 84;
const TOTAL_FRAMES = FPS * DURATION_SEC; // 2016 frames

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

function findChromiumExecutable() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    '/Volumes/Extra/Offload/home/Library/Caches/ms-playwright/chromium-1254/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    '/Volumes/Extra/Offload/home/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    '/Users/eligo/Library/Caches/ms-playwright/chromium-1254/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`Chromium binary not found. Checked: ${candidates.join(', ')}`);
}

function startLocalServer(rootDir) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const cleanUrl = (req.url || '/').split('?')[0];
      const rel = cleanUrl === '/' ? 'film.html' : cleanUrl.replace(/^\/+/, '');
      const fullPath = path.join(rootDir, rel);
      if (!fullPath.startsWith(rootDir) || !fs.existsSync(fullPath)) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const ext = path.extname(fullPath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      fs.createReadStream(fullPath).pipe(res);
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ server, url: `http://127.0.0.1:${addr.port}/film.html` });
    });
  });
}

async function main() {
  if (!fs.existsSync(audioPath)) {
    throw new Error(`Soundtrack WAV missing at ${audioPath}. Run build_audio.py first.`);
  }
  fs.mkdirSync(materialsDir, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });

  const executablePath = findChromiumExecutable();
  const { server, url } = await startLocalServer(__dirname);

  console.log(`[film-v2] Launching headless Chromium for ${TOTAL_FRAMES} frames (1920x1080 @ ${FPS}fps, 2.39:1 cinema plates)...`);
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu-sandbox', '--use-mock-keychain', '--password-store=basic'],
  });

  const ffmpegArgs = [
    '-y',
    '-loglevel', 'warning',
    '-f', 'image2pipe',
    '-vcodec', 'mjpeg',
    '-framerate', String(FPS),
    '-i', 'pipe:0',
    '-i', audioPath,
    '-map', '0:v:0',
    '-map', '1:a:0',
    '-c:v', 'libx264',
    '-vf', 'scale=in_range=full:out_range=tv,format=yuv420p',
    '-pix_fmt', 'yuv420p',
    '-color_range', 'tv',
    '-crf', '17',
    '-preset', 'fast',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ar', '48000',
    '-movflags', '+faststart',
    '-shortest',
    finalMp4Path,
  ];

  const ffmpeg = spawn('ffmpeg', ffmpegArgs, { stdio: ['pipe', 'inherit', 'inherit'] });
  const ffmpegExit = new Promise((resolve, reject) => {
    ffmpeg.on('error', reject);
    ffmpeg.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}`));
    });
  });

  const startMs = Date.now();
  try {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });

    const loadedCount = await page.evaluate(async () => window.preloadFilmAssets());
    console.log(`[film-v2] Preloaded ${loadedCount} cinema concept-art plates cleanly.`);

    for (let frame = 0; frame < TOTAL_FRAMES; frame += 1) {
      const dataUrl = await page.evaluate(
        ([idx, total]) => {
          window.renderFilmFrame(idx, total);
          return document.getElementById('film-canvas').toDataURL('image/jpeg', 0.96);
        },
        [frame, TOTAL_FRAMES],
      );

      const comma = dataUrl.indexOf(',');
      const jpgBuffer = Buffer.from(dataUrl.slice(comma + 1), 'base64');
      if (!ffmpeg.stdin.write(jpgBuffer)) {
        await once(ffmpeg.stdin, 'drain');
      }

      if ((frame + 1) % 240 === 0 || frame === TOTAL_FRAMES - 1) {
        const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
        console.log(`[film-v2] Rendered ${frame + 1}/${TOTAL_FRAMES} frames (${elapsed}s)`);
      }
    }

    ffmpeg.stdin.end();
    await ffmpegExit;
    const totalSec = ((Date.now() - startMs) / 1000).toFixed(1);
    const sizeMb = (fs.statSync(finalMp4Path).size / (1024 * 1024)).toFixed(2);
    console.log(`[film-v2] Completed ${finalMp4Path} (${sizeMb} MB) in ${totalSec}s`);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
