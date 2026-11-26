import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gameDistDir = path.resolve(__dirname, '..', 'game', 'dist');
const outDir = path.join(__dirname, 'out', 'v6_bts');
const rawVideoDir = path.join(outDir, 'gameplay_raw');
const logDir = path.join(outDir, 'logs');
const part1Mp4 = path.join(outDir, 'gameplay_part1_acts1_3.mp4');
const part2Mp4 = path.join(outDir, 'gameplay_part2_kintsugi_relic.mp4');
const fullMp4 = path.join(outDir, 'gameplay_v6_full_1080p.mp4');

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

function runFfmpegLogged(args, logName) {
  const logPath = path.join(logDir, logName);
  const fd = fs.openSync(logPath, 'w');
  const res = spawnSync('ffmpeg', args, { stdio: ['ignore', fd, fd] });
  fs.closeSync(fd);
  if (res.status !== 0) {
    const tail = fs.readFileSync(logPath, 'utf8').slice(-800);
    throw new Error(`ffmpeg failed (${res.status}) [${logName}]:\n${tail}`);
  }
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
  let act4StartSec = 17.5;
  const tStart = Date.now();
  const elapsedSec = () => (Date.now() - tStart) / 1000;

  try {
    // Capture at native 1920x1080 so every typography stroke, flame, and gold Kintsugi vein is razor-sharp!
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
      recordVideo: { dir: rawVideoDir, size: { width: 1920, height: 1080 } },
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);

    // PART 1 (0s - ~17.5s): Act I Hearth + Audio/Foley -> Act II Mineral Glaze Alchemy -> Act III 1100C Stoking
    await page.getByTestId('audio-toggle-btn').click();
    await page.waitForTimeout(700);
    await page.getByTestId('listen-echo-btn').click();
    await page.waitForTimeout(1000);
    await page.getByTestId('stoke-bellows-btn').click();
    await page.waitForTimeout(750);
    await page.getByTestId('stoke-bellows-btn').click();
    await page.waitForTimeout(750);
    await page.getByTestId('advance-btn').click();
    await page.waitForTimeout(550);
    await page.getByTestId('advance-btn').click();
    await page.waitForTimeout(550);
    await page.getByTestId('stoke-bellows-btn').click();
    await page.waitForTimeout(550);
    await page.getByTestId('advance-btn').click();

    // Act II: Mineral Table live glaze switching (Wood Ash -> Cinnabar -> Gold Leaf)
    await page.waitForTimeout(900);
    await page.getByTestId('primary-glaze-ash').click();
    await page.waitForTimeout(650);
    await page.getByTestId('primary-glaze-cinnabar').click();
    await page.waitForTimeout(700);
    await page.getByTestId('secondary-glaze-gold').click();
    await page.waitForTimeout(900);
    await page.getByTestId('advance-btn').click();
    await page.waitForTimeout(450);
    await page.getByTestId('advance-btn').click();
    await page.waitForTimeout(550);
    await page.getByTestId('choice-one-ledger').click();
    await page.waitForTimeout(800);
    await page.getByTestId('advance-btn').click();

    // Act III: 1100C Roaring Kiln blackbody surge
    await page.waitForTimeout(950);
    await page.getByTestId('stoke-bellows-btn').click();
    await page.waitForTimeout(700);
    await page.getByTestId('stoke-bellows-btn').click();
    await page.waitForTimeout(800);
    await page.getByTestId('advance-btn').click();
    await page.waitForTimeout(450);
    await page.getByTestId('advance-btn').click();
    await page.waitForTimeout(550);
    await page.getByTestId('choice-two-lullaby').click();
    await page.waitForTimeout(750);
    await page.getByTestId('advance-btn').click();
    await page.waitForTimeout(350);

    // PART 2 (~17.5s - ~37s): Act IV 1300C Blackbody + Real Mouse Kintsugi Gold Vein Tracing -> Act V Relic Card!
    act4StartSec = Math.max(12.0, elapsedSec() - 0.25);

    await page.getByTestId('stoke-bellows-btn').click();
    await page.waitForTimeout(650);
    await page.getByTestId('stoke-bellows-btn').click();
    await page.waitForTimeout(850);

    // Real smooth mouse drag across the 1920x1080 stoneware amphora cracks (x in 0.43..0.56 -> 825..1075, y in 0.315..0.62 -> 340..670)
    // Stroke 1: Primary diagonal spine from neck collar down to vessel base
    await page.mouse.move(944, 342);
    await page.mouse.down();
    await page.mouse.move(918, 416, { steps: 14 });
    await page.mouse.move(972, 502, { steps: 14 });
    await page.mouse.move(934, 588, { steps: 14 });
    await page.mouse.move(982, 668, { steps: 14 });
    await page.mouse.up();
    await page.waitForTimeout(550);

    // Stroke 2: Upper-left shoulder fork
    await page.mouse.move(918, 416);
    await page.mouse.down();
    await page.mouse.move(868, 460, { steps: 10 });
    await page.mouse.move(834, 510, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(500);

    // Stroke 3: Mid-right lightning branch across vessel belly
    await page.mouse.move(972, 502);
    await page.mouse.down();
    await page.mouse.move(1033, 534, { steps: 10 });
    await page.mouse.move(1080, 588, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(500);

    // Stroke 4: Complete remaining gold veins to 100% Grade S Masterwork Kintsugi!
    await page.getByTestId('kintsugi-trace-btn').click();
    await page.waitForTimeout(450);
    await page.getByTestId('kintsugi-trace-btn').click();
    await page.waitForTimeout(700);

    // Advance to Choice III & seal with gold leaf
    await page.getByTestId('advance-btn').click();
    await page.waitForTimeout(450);
    await page.getByTestId('advance-btn').click();
    await page.waitForTimeout(550);
    await page.getByTestId('choice-three-kintsugi').click();
    await page.waitForTimeout(1200);
    await page.getByTestId('advance-btn').click();

    // Act V: Unsealing at Dawn & The Gilded Reliquary 1000x1400 Ceramic Relic Card Reveal
    await page.waitForTimeout(950);
    await page.getByTestId('advance-btn').click();
    await page.waitForTimeout(500);
    await page.getByTestId('advance-btn').click();
    await page.waitForTimeout(550);
    await page.getByTestId('advance-btn').click();
    await page.waitForTimeout(3600);

    const video = page.video();
    await context.close();
    recordedWebm = await video.path();
  } finally {
    await browser.close();
    server.close();
  }

  // Transcode full 1920x1080 24fps capture + clean cinema-framed Act I-III and Act IV-V split clips
  runFfmpegLogged(
    [
      '-y', '-loglevel', 'warning',
      '-i', recordedWebm,
      '-vf', 'fps=24,scale=1920:1080:flags=lanczos',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-preset', 'fast', '-an',
      fullMp4,
    ],
    'gameplay_full.log',
  );

  // Fit 16:9 gameplay cleanly inside our 2.39:1 active aperture (1920x804, padded into 1920x1080 with 138px bars)
  const fitFilter =
    'fps=24,scale=1920:804:force_original_aspect_ratio=decrease:flags=lanczos,' +
    'pad=1920:1080:(ow-iw)/2:138:color=#080605,format=yuv420p';

  runFfmpegLogged(
    [
      '-y', '-loglevel', 'warning',
      '-ss', '0.6', '-to', act4StartSec.toFixed(2),
      '-i', fullMp4,
      '-vf', fitFilter,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-preset', 'fast', '-an',
      part1Mp4,
    ],
    'gameplay_part1.log',
  );

  runFfmpegLogged(
    [
      '-y', '-loglevel', 'warning',
      '-ss', act4StartSec.toFixed(2),
      '-i', fullMp4,
      '-vf', fitFilter,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-preset', 'fast', '-an',
      part2Mp4,
    ],
    'gameplay_part2.log',
  );

  fs.writeFileSync(
    path.join(outDir, 'capture_meta.json'),
    JSON.stringify({ fullMp4, part1Mp4, part2Mp4, act4StartSec: Number(act4StartSec.toFixed(2)) }, null, 2),
  );
  console.log(`[v6-capture] Recorded native 1920x1080 gameplay -> part1 & part2 (act4StartSec=${act4StartSec.toFixed(2)}s)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
