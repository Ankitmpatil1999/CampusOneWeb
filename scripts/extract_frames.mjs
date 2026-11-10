import http from 'http';
import fs from 'fs';
import path from 'path';
import { chromium } from '@playwright/test';

const v1Path = 'C:/Users/Ankit/.gemini/antigravity/brain/6ddcf0f0-d701-4e4b-82fa-929a3680e429/.user_uploaded/media_1794216184662_b692c387.mp4';
const v2Path = 'C:/Users/Ankit/.gemini/antigravity/brain/6ddcf0f0-d701-4e4b-82fa-929a3680e429/.user_uploaded/media_1794216467456_4c2efe85.mp4';

const server = http.createServer((req, res) => {
  let filePath = '';
  if (req.url === '/v1') filePath = v1Path;
  else if (req.url === '/v2') filePath = v2Path;
  else {
    res.writeHead(404);
    res.end();
    return;
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = (end - start) + 1;
    const stream = fs.createReadStream(filePath, { start, end });
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'video/mp4',
    });
    stream.pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

server.listen(9876, async () => {
  console.log('HTTP server running on 9876');

  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  });

  const baseOut = 'C:/Users/Ankit/.gemini/antigravity/brain/6ddcf0f0-d701-4e4b-82fa-929a3680e429';

  async function processVideo(url, prefix) {
    const page = await browser.newPage({ viewport: { width: 420, height: 880 } });
    await page.goto('about:blank');
    await page.setContent(`
      <!DOCTYPE html>
      <html>
      <body style="margin:0; background:#000;">
        <video id="vid" controls muted playsinline style="width:100vw; height:100vh; object-fit:contain;"></video>
      </body>
      </html>
    `, { waitUntil: 'domcontentloaded' });

    console.log(`Setting src to ${url}...`);
    const info = await page.evaluate(async (videoUrl) => {
      const v = document.getElementById('vid');
      v.src = videoUrl;
      v.load();
      await new Promise((resolve) => {
        v.onloadeddata = resolve;
        setTimeout(resolve, 5000);
      });
      return { duration: v.duration || 10, width: v.videoWidth, height: v.videoHeight };
    }, url);

    console.log(`${prefix} Video loaded:`, info);

    const duration = info.duration > 0 && isFinite(info.duration) ? info.duration : 10;
    const step = Math.max(1, duration / 6);
    let frameIndex = 0;
    for (let t = 0.5; t <= duration; t += step) {
      await page.evaluate(async (time) => {
        const v = document.getElementById('vid');
        v.currentTime = time;
        await new Promise(r => {
          v.onseeked = r;
          setTimeout(r, 600);
        });
      }, t);
      await page.waitForTimeout(300);
      const outPath = path.join(baseOut, `${prefix}_frame_${frameIndex}_t${Math.round(t)}s.png`);
      await page.screenshot({ path: outPath });
      console.log(`Saved screenshot to ${outPath}`);
      frameIndex++;
      if (frameIndex >= 7) break;
    }
    await page.close();
  }

  try {
    console.log('Processing Video 1...');
    await processVideo('http://localhost:9876/v1', 'video1');
    console.log('Processing Video 2...');
    await processVideo('http://localhost:9876/v2', 'video2');
  } catch (err) {
    console.error('Error processing videos:', err);
  } finally {
    await browser.close();
    server.close();
    console.log('Done extraction!');
  }
});
