import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gameDistDir = path.resolve(__dirname, '..', 'game', 'dist');
const outDir = path.join(__dirname, 'out');
const rawVideoDir = path.join(outDir, 'gameplay_raw');
const logDir = path.join(outDir, 'logs');
const gameplayMp4 = path.join(outDir, 'gameplay_capture_24fps.mp4');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
  '.svg': 'image/svg+xml',
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

function startStaticServer(rootDir) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const cleanUrl = (req.url || '/').split('?')[0];
      const rel = cleanUrl === '/' ? 'index.html' : cleanUrl.replace(/^\/+/, '');
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
      resolve({ server, url: `http://127.0.0.1:${addr.port}/` });
    });
  });
}

async function main() {
  if (!fs.existsSync(path.join(gameDistDir, 'index.html'))) {
    throw new Error(`Game dist missing at ${gameDistDir}. Build the game first.`);
  }
  fs.rmSync(rawVideoDir, { recursive: true, force: true });
  fs.mkdirSync(rawVideoDir, { recursive: true });
  fs.mkdirSync(logDir, { recursive: true });

  const executablePath = findChromiumExecutable();
  const { server, url } = await startStaticServer(gameDistDir);
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu-sandbox', '--use-mock-keychain', '--password-store=basic'],
  });

  let recordedWebm = '';
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
      recordVideo: { dir: rawVideoDir, size: { width: 1280, height: 720 } },
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });

    // Act I: The Cooling Hearth — oil backdrop, memory wave echo, live bellows thermal climb (~9.5s)
    await page.waitForTimeout(1600);
    await page.getByTestId('listen-echo-btn').click();
    await page.waitForTimeout(1500);
    await page.getByTestId('stoke-bellows-btn').click();
    await page.waitForTimeout(1100);
    await page.getByTestId('stoke-bellows-btn').click();
    await page.waitForTimeout(1100);
    await page.getByTestId('advance-btn').click();
    await page.waitForTimeout(1000);
    await page.getByTestId('advance-btn').click();
    await page.waitForTimeout(900);
    await page.getByTestId('stoke-bellows-btn').click();
    await page.waitForTimeout(900);
    await page.getByTestId('advance-btn').click();

    // Act II: The Mineral Table — live glaze switching (Wood Ash -> Cinnabar -> Gold Leaf) (~9.5s)
    await page.waitForTimeout(1500);
    await page.getByTestId('primary-glaze-ash').click();
    await page.waitForTimeout(1000);
    await page.getByTestId('primary-glaze-cinnabar').click();
    await page.waitForTimeout(1100);
    await page.getByTestId('secondary-glaze-gold').click();
    await page.waitForTimeout(1200);
    await page.getByTestId('advance-btn').click();
    await page.waitForTimeout(900);
    await page.getByTestId('advance-btn').click();
    await page.waitForTimeout(1100);
    await page.getByTestId('choice-one-ledger').click();
    await page.waitForTimeout(1300);
    await page.getByTestId('advance-btn').click();

    // Act III: The Stoking Watch — intense roaring kiln oil backdrop & bellows stoking (~8.5s)
    await page.waitForTimeout(1500);
    await page.getByTestId('stoke-bellows-btn').click();
    await page.waitForTimeout(1000);
    await page.getByTestId('stoke-bellows-btn').click();
    await page.waitForTimeout(1000);
    await page.getByTestId('advance-btn').click();
    await page.waitForTimeout(900);
    await page.getByTestId('advance-btn').click();
    await page.waitForTimeout(1000);
    await page.getByTestId('choice-two-lullaby').click();
    await page.waitForTimeout(1200);
    await page.getByTestId('advance-btn').click();

    // Act IV: Vitrification Hour — push past 1250C-1300C, pour gold leaf into glowing seams (~8s)
    await page.waitForTimeout(1400);
    await page.getByTestId('stoke-bellows-btn').click();
    await page.waitForTimeout(900);
    await page.getByTestId('stoke-bellows-btn').click();
    await page.waitForTimeout(1000);
    await page.getByTestId('advance-btn').click();
    await page.waitForTimeout(800);
    await page.getByTestId('advance-btn').click();
    await page.waitForTimeout(900);
    await page.getByTestId('choice-three-kintsugi').click();
    await page.waitForTimeout(1600);
    await page.getByTestId('advance-btn').click();

    // Act V: Unsealing at Dawn & Collectible Ceramic Relic Card reveal (~6.5s)
    await page.waitForTimeout(1300);
    await page.getByTestId('advance-btn').click();
    await page.waitForTimeout(900);
    await page.getByTestId('advance-btn').click();
    await page.waitForTimeout(1000);
    await page.getByTestId('advance-btn').click();
    await page.waitForTimeout(3200);

    const video = page.video();
    await context.close();
    recordedWebm = await video.path();
  } finally {
    await browser.close();
    server.close();
  }

  // Convert Playwright .webm into clean 24fps 16:9 clip fitted cleanly inside our 2.39:1 stage
  const logFd = fs.openSync(path.join(logDir, 'gameplay_transcode.log'), 'w');
  const res = spawnSync(
    'ffmpeg',
    [
      '-y', '-loglevel', 'warning',
      '-i', recordedWebm,
      '-vf', 'fps=24,scale=1920:804:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:138:color=#0F0B09',
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-crf', '16',
      '-preset', 'fast',
      '-an',
      gameplayMp4,
    ],
    { stdio: ['ignore', logFd, logFd] },
  );
  fs.closeSync(logFd);
  if (res.status !== 0) {
    throw new Error(`ffmpeg gameplay transcode failed (code ${res.status})`);
  }
  console.log(`[gameplay-capture] Recorded real playthrough -> ${gameplayMp4}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
