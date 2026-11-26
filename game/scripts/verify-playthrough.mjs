import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gameRoot = path.resolve(__dirname, '..');
const distDir = path.join(gameRoot, 'dist');
const materialsDir = path.resolve(gameRoot, '..', '..', '..', 'materials');
const shotsDir = path.resolve(gameRoot, '..', '..', '..', 'shots');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
};

function findChromiumExecutable() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    '/Volumes/Extra/Offload/home/Library/Caches/ms-playwright/chromium-1254/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    '/Volumes/Extra/Offload/home/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    '/Users/eligo/Library/Caches/ms-playwright/chromium-1254/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(`No local Chromium binary found. Checked: ${candidates.join(', ')}`);
}

function startStaticServer(rootDir) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const cleanUrl = (req.url || '/').split('?')[0];
      const relPath = cleanUrl === '/' ? 'index.html' : cleanUrl.replace(/^\/+/, '');
      const fullPath = path.join(rootDir, relPath);
      if (!fullPath.startsWith(rootDir) || !fs.existsSync(fullPath)) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const ext = path.extname(fullPath);
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
  if (!fs.existsSync(path.join(distDir, 'index.html'))) {
    throw new Error('dist/index.html missing. Run `npm run build` first.');
  }
  fs.mkdirSync(materialsDir, { recursive: true });
  fs.mkdirSync(shotsDir, { recursive: true });

  const executablePath = findChromiumExecutable();
  const { server, url } = await startStaticServer(distDir);
  const consoleErrors = [];
  const pageErrors = [];

  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu-sandbox', '--use-mock-keychain', '--password-store=basic'],
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', (err) => {
      pageErrors.push(String(err));
    });

    await page.goto(url, { waitUntil: 'networkidle' });
    // Verify all 4 real cinema oil-painting plates and studio ZONOS3 audio MP3s are served with HTTP 200
    const assetCheck = await page.evaluate(async () => {
      const urls = [
        './art/hearth_scene.png',
        './art/glaze_table.png',
        './art/kiln_fire.png',
        './art/kintsugi_dawn.png',
        './audio/shot1_valley.mp3',
        './audio/shot2_glazes.mp3',
        './audio/shot3_firing.mp3',
        './audio/shot4_kintsugi_dawn.mp3',
      ];
      const results = await Promise.all(
        urls.map(async (u) => {
          const r = await fetch(u);
          const blob = await r.blob();
          return { url: u, ok: r.ok, bytes: blob.size };
        }),
      );
      return results;
    });
    for (const item of assetCheck) {
      if (!item.ok || item.bytes < 50000) {
        throw new Error(`Missing or undersized cinema asset: ${JSON.stringify(item)}`);
      }
    }
    await page.waitForTimeout(650);

    // Verify canvas is painted with non-empty warm content
    const canvasCheck = await page.evaluate(() => {
      const c = document.querySelector('canvas');
      if (!c) return { ok: false, reason: 'no canvas' };
      const ctx = c.getContext('2d');
      const px = ctx.getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data;
      return { ok: c.width >= 1280 && c.height >= 720 && px[3] > 0, width: c.width, height: c.height, rgba: [...px] };
    });
    if (!canvasCheck.ok) {
      throw new Error(`Canvas check failed: ${JSON.stringify(canvasCheck)}`);
    }

    // Shot 1: Act I — The Cooling Hearth (listen to echo & stoke bellows)
    await page.getByTestId('listen-echo-btn').click();
    await page.getByTestId('stoke-bellows-btn').click();
    await page.getByTestId('stoke-bellows-btn').click();
    await page.waitForTimeout(350);
    await page.screenshot({
      path: path.join(materialsDir, 'game_shot_01_hearth_title.png'),
      type: 'png',
    });
    await page.screenshot({
      path: path.join(shotsDir, 'after_act1_hearth.png'),
      type: 'png',
    });

    // Advance through Act I to Act II
    await page.getByTestId('advance-btn').click();
    await page.getByTestId('advance-btn').click();
    await page.getByTestId('stoke-bellows-btn').click();
    await page.getByTestId('advance-btn').click();
    await page.waitForTimeout(300);

    // Shot 2: Act II — The Mineral Table (mix Cinnabar + Gold Leaf, advance to choice I)
    await page.getByTestId('primary-glaze-cinnabar').click();
    await page.getByTestId('secondary-glaze-gold').click();
    await page.getByTestId('advance-btn').click();
    await page.getByTestId('advance-btn').click();
    await page.getByTestId('choice-one-ledger').click();
    await page.waitForTimeout(350);
    await page.screenshot({
      path: path.join(materialsDir, 'game_shot_02_glaze_alchemy.png'),
      type: 'png',
    });

    // Advance into Act III — The Stoking Watch
    await page.getByTestId('advance-btn').click();
    await page.getByTestId('stoke-bellows-btn').click();
    await page.getByTestId('stoke-bellows-btn').click();
    await page.getByTestId('advance-btn').click();
    await page.getByTestId('advance-btn').click();
    await page.getByTestId('choice-two-lullaby').click();
    await page.waitForTimeout(350);

    // Shot 3: Act III — Stoking the Kiln Watch
    await page.screenshot({
      path: path.join(materialsDir, 'game_shot_03_stoking_kiln.png'),
      type: 'png',
    });

    // Advance into Act IV — Vitrification Hour (1300C blackbody + Interactive Kintsugi tracing!)
    await page.getByTestId('advance-btn').click();
    await page.getByTestId('stoke-bellows-btn').click();
    await page.getByTestId('stoke-bellows-btn').click();
    await page.waitForTimeout(250);

    // Real pointer drag directly on the interactive Kintsugi canvas MUST raise coverage before any button click
    await page.mouse.move(630, 230);
    await page.mouse.down();
    await page.mouse.move(612, 282, { steps: 6 });
    await page.mouse.move(648, 340, { steps: 6 });
    await page.mouse.move(622, 410, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(150);

    const dragOnlyText = await page.getByTestId('kintsugi-coverage-value').textContent();
    const dragOnlyPct = Number.parseInt((dragOnlyText || '0').replace('%', ''), 10);
    if (Number.isNaN(dragOnlyPct) || dragOnlyPct <= 0) {
      throw new Error(`Canvas pointer drag failed to register Kintsugi lacquer: coverage=${dragOnlyText}`);
    }

    await page.getByTestId('kintsugi-trace-btn').click();
    await page.getByTestId('kintsugi-trace-btn').click();
    await page.getByTestId('kintsugi-trace-btn').click();
    await page.getByTestId('advance-btn').click();
    await page.getByTestId('advance-btn').click();
    await page.getByTestId('choice-three-kintsugi').click();
    await page.waitForTimeout(350);

    const kintsugiText = await page.getByTestId('kintsugi-coverage-value').textContent();
    const kintsugiGrade = await page.getByTestId('kintsugi-grade-pill').textContent();
    const coverageNum = Number.parseInt((kintsugiText || '0').replace('%', ''), 10);
    if (Number.isNaN(coverageNum) || coverageNum < 60) {
      throw new Error(`Interactive Kintsugi repair verification failed: coverage=${kintsugiText}, grade=${kintsugiGrade}`);
    }

    await page.screenshot({
      path: path.join(shotsDir, 'after_act4_kintsugi.png'),
      type: 'png',
    });

    // Advance into Act V — Unsealing & Reveal Collectible Ceramic Relic Card
    await page.getByTestId('advance-btn').click();
    await page.getByTestId('advance-btn').click();
    await page.getByTestId('advance-btn').click();
    await page.getByTestId('advance-btn').click();
    await page.waitForTimeout(450);

    // Verify native <dialog> opened and relic card canvas rendered cleanly with Kintsugi signature
    const dialogCheck = await page.evaluate(() => {
      const dlg = document.querySelector('dialog[open]');
      const relicCanvas = dlg ? dlg.querySelector('canvas') : null;
      return {
        dialogOpen: Boolean(dlg),
        relicWidth: relicCanvas ? relicCanvas.width : 0,
        relicHeight: relicCanvas ? relicCanvas.height : 0,
        title: dlg ? dlg.querySelector('h2')?.textContent : null,
        hasSignature: dlg ? /EV-[SABC]-[0-9A-F]{4}/.test(dlg.textContent || '') : false,
      };
    });

    if (
      !dialogCheck.dialogOpen ||
      dialogCheck.relicWidth !== 1000 ||
      dialogCheck.relicHeight !== 1400 ||
      !dialogCheck.hasSignature
    ) {
      throw new Error(`Ending dialog / Relic Card verification failed: ${JSON.stringify(dialogCheck)}`);
    }

    // Shot 4: Illustrated Ending & Collectible Ceramic Relic Card Modal
    await page.screenshot({
      path: path.join(materialsDir, 'game_shot_04_relic_ending.png'),
      type: 'png',
    });
    await page.screenshot({
      path: path.join(shotsDir, 'after_act5_relic.png'),
      type: 'png',
    });

    if (consoleErrors.length > 0 || pageErrors.length > 0) {
      throw new Error(
        `Runtime errors detected: consoleErrors=${JSON.stringify(consoleErrors)}, pageErrors=${JSON.stringify(pageErrors)}`,
      );
    }

    console.log(
      JSON.stringify(
        {
          status: 'PASS',
          canvasCheck,
          dialogCheck,
          screenshots: [
            'materials/game_shot_01_hearth_title.png',
            'materials/game_shot_02_glaze_alchemy.png',
            'materials/game_shot_03_stoking_kiln.png',
            'materials/game_shot_04_relic_ending.png',
          ],
          consoleErrors: 0,
          pageErrors: 0,
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
