import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, 'out');
const logDir = path.join(outDir, 'logs');
const materialsDir = path.resolve(__dirname, '..', '..', '..', 'materials');

const audioPath = path.join(outDir, 'trailer_soundtrack_66s.wav');
const gameplayCapturePath = path.join(outDir, 'gameplay_capture_24fps.mp4');
const introMp4 = path.join(outDir, 'trailer_seg_intro.mp4');
const gameplaySegMp4 = path.join(outDir, 'trailer_seg_gameplay.mp4');
const btsOutroMp4 = path.join(outDir, 'trailer_seg_bts_outro.mp4');
const concatRawMp4 = path.join(outDir, 'trailer_concat_nosub.mp4');
const srtPath = path.join(materialsDir, 'The_Last_Kiln_Game_and_BTS_Trailer_1080p.srt');
const finalMp4Path = path.join(materialsDir, 'The_Last_Kiln_Game_and_BTS_Trailer_1080p.mp4');

const FPS = 24;
const INTRO_SEC = 3.2;
const GAMEPLAY_SEC = 35.0;
const BTS_OUTRO_SEC = 27.8; // Total = 66.0s

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
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

function runFfmpegLogged(args, logName) {
  fs.mkdirSync(logDir, { recursive: true });
  const logPath = path.join(logDir, logName);
  const fd = fs.openSync(logPath, 'w');
  const res = spawnSync('ffmpeg', args, { stdio: ['ignore', fd, fd] });
  fs.closeSync(fd);
  if (res.status !== 0) {
    const tail = fs.readFileSync(logPath, 'utf-8').slice(-900);
    throw new Error(`ffmpeg (${logName}) failed with exit ${res.status}:\n${tail}`);
  }
}

function startLocalServer(rendererRoot, materialsRoot) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const cleanUrl = (req.url || '/').split('?')[0];
      let fullPath;
      if (cleanUrl.startsWith('/materials/')) {
        const rel = cleanUrl.slice('/materials/'.length);
        fullPath = path.join(materialsRoot, rel);
        if (!fullPath.startsWith(materialsRoot)) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }
      } else {
        const rel = cleanUrl === '/' ? 'trailer.html' : cleanUrl.replace(/^\/+/, '');
        fullPath = path.join(rendererRoot, rel);
        if (!fullPath.startsWith(rendererRoot)) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }
      }
      if (!fs.existsSync(fullPath)) {
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
      resolve({ server, url: `http://127.0.0.1:${addr.port}/trailer.html` });
    });
  });
}

async function renderCanvasSegment(page, fnName, durationSec, outputMp4, logName) {
  const totalFrames = Math.round(durationSec * FPS);
  const logPath = path.join(logDir, logName);
  const logFd = fs.openSync(logPath, 'w');

  const ffmpeg = spawn(
    'ffmpeg',
    [
      '-y', '-loglevel', 'warning',
      '-f', 'image2pipe',
      '-vcodec', 'mjpeg',
      '-framerate', String(FPS),
      '-i', 'pipe:0',
      '-c:v', 'libx264',
      '-vf', 'scale=in_range=full:out_range=tv,format=yuv420p',
      '-pix_fmt', 'yuv420p',
      '-color_range', 'tv',
      '-crf', '16',
      '-preset', 'fast',
      '-an',
      outputMp4,
    ],
    { stdio: ['pipe', logFd, logFd] },
  );

  const ffmpegExit = new Promise((resolve, reject) => {
    ffmpeg.on('error', reject);
    ffmpeg.on('close', (code) => {
      fs.closeSync(logFd);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg (${logName}) exited ${code}`));
    });
  });

  for (let frame = 0; frame < totalFrames; frame += 1) {
    const localT = frame / FPS;
    const dataUrl = await page.evaluate(
      ([fn, t, dur]) => {
        window[fn](t, dur);
        return document.getElementById('trailer-canvas').toDataURL('image/jpeg', 0.96);
      },
      [fnName, localT, durationSec],
    );
    const comma = dataUrl.indexOf(',');
    const buf = Buffer.from(dataUrl.slice(comma + 1), 'base64');
    if (!ffmpeg.stdin.write(buf)) {
      await once(ffmpeg.stdin, 'drain');
    }
  }

  ffmpeg.stdin.end();
  await ffmpegExit;
  console.log(`[trailer] Rendered ${fnName} (${totalFrames} frames -> ${path.basename(outputMp4)})`);
}

function getVideoDuration(filePath) {
  const res = spawnSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath],
    { encoding: 'utf-8' },
  );
  if (res.status !== 0) throw new Error(`ffprobe failed on ${filePath}`);
  return Number.parseFloat(res.stdout.trim());
}

async function main() {
  for (const reqFile of [audioPath, gameplayCapturePath, srtPath]) {
    if (!fs.existsSync(reqFile)) {
      throw new Error(`Required input missing: ${reqFile}`);
    }
  }
  fs.mkdirSync(logDir, { recursive: true });

  const executablePath = findChromiumExecutable();
  const { server, url } = await startLocalServer(__dirname, materialsDir);
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu-sandbox', '--use-mock-keychain', '--password-store=basic'],
  });

  const t0 = Date.now();
  try {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });
    const count = await page.evaluate(async () => window.preloadTrailerAssets());
    console.log(`[trailer] Preloaded ${count} trailer visual assets.`);

    await renderCanvasSegment(page, 'renderIntroFrame', INTRO_SEC, introMp4, 'trailer_seg_intro.log');
    await renderCanvasSegment(page, 'renderBtsOutroFrame', BTS_OUTRO_SEC, btsOutroMp4, 'trailer_seg_bts.log');
  } finally {
    await browser.close();
    server.close();
  }

  // Pace live recorded Playwright gameplay cleanly into exact 35.0s with 2.39:1 top matte header & gold trim
  const rawDur = getVideoDuration(gameplayCapturePath);
  const speedRatio = GAMEPLAY_SEC / Math.max(1, rawDur);
  const gpFilter = [
    `setpts=${speedRatio.toFixed(5)}*PTS`,
    `fps=${FPS}`,
    'drawbox=x=0:y=138:w=1920:h=2:color=#DBA13C@0.42:t=fill',
    'drawbox=x=0:y=942:w=1920:h=2:color=#DBA13C@0.42:t=fill',
    "drawtext=fontfile=/System/Library/Fonts/Supplemental/Georgia.ttf:text='THE LAST KILN OF EMBER VALLEY':fontcolor=#DBA13C:fontsize=20:x=74:y=59",
    "drawtext=fontfile=/System/Library/Fonts/Supplemental/Georgia.ttf:text='LIVE PLAYTHROUGH  |  600-1300C KILN PHYSICS & GLAZE ALCHEMY':fontcolor=#C8BBA8:fontsize=19:x=w-tw-74:y=59",
    'fade=t=in:st=0:d=0.45',
    `fade=t=out:st=${(GAMEPLAY_SEC - 0.45).toFixed(2)}:d=0.45`,
    'format=yuv420p',
  ].join(',');

  runFfmpegLogged(
    [
      '-y', '-loglevel', 'warning',
      '-i', gameplayCapturePath,
      '-vf', gpFilter,
      '-t', String(GAMEPLAY_SEC),
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-color_range', 'tv',
      '-crf', '16',
      '-preset', 'fast',
      '-an',
      gameplaySegMp4,
    ],
    'trailer_seg_gameplay.log',
  );
  console.log(`[trailer] Paced real gameplay (${rawDur.toFixed(1)}s -> ${GAMEPLAY_SEC.toFixed(1)}s)`);

  // Concatenate 3 segments cleanly (exact 66.0s)
  const concatListPath = path.join(outDir, 'trailer_concat.txt');
  fs.writeFileSync(
    concatListPath,
    [introMp4, gameplaySegMp4, btsOutroMp4].map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n') + '\n',
    'utf-8',
  );

  runFfmpegLogged(
    [
      '-y', '-loglevel', 'warning',
      '-f', 'concat', '-safe', '0',
      '-i', concatListPath,
      '-c', 'copy',
      concatRawMp4,
    ],
    'trailer_concat.log',
  );

  // Mux studio ZONOS3 + chamber cello -14 LUFS audio & burn .srt strictly inside the 138px bottom black bar
  const escapedSrt = srtPath.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");
  const subStyle =
    'FontName=Georgia,FontSize=9.5,PrimaryColour=&H00F0F7FB&,OutlineColour=&H80090B0F&,BorderStyle=1,Outline=0.7,Shadow=0,Alignment=2,MarginV=7,MarginL=36,MarginR=36';

  runFfmpegLogged(
    [
      '-y', '-loglevel', 'warning',
      '-i', concatRawMp4,
      '-i', audioPath,
      '-map', '0:v:0',
      '-map', '1:a:0',
      '-vf', `drawbox=x=0:y=944:w=1920:h=136:color=#0F0B09:t=fill,subtitles='${escapedSrt}':force_style='${subStyle}',format=yuv420p`,
      '-c:v', 'libx264',
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
    ],
    'trailer_final_mux_sub.log',
  );

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const sizeMb = (fs.statSync(finalMp4Path).size / (1024 * 1024)).toFixed(2);
  console.log(`[trailer] Completed ${finalMp4Path} (${sizeMb} MB) in ${elapsed}s`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
