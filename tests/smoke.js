// Browser smoke test: runs tests/smoke.html in headless Chrome against the real app.
// Run with: node tests/smoke.js   (needs Chrome or Chromium; set CHROME_PATH if it is not found)
// No dependencies: a tiny static server plus Chrome, which posts the results back.

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TIMEOUT_MS = 60000;
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png',
};

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ];
  return candidates.find((p) => p && fs.existsSync(p));
}

function startServer(onResult) {
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/__result') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => { res.end(); onResult(JSON.parse(body)); });
      return;
    }
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(buf);
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function main() {
  const chromePath = findChrome();
  if (!chromePath) {
    console.error('Chrome not found. Set CHROME_PATH to a Chrome or Chromium executable.');
    process.exit(2);
  }

  let finish;
  const done = new Promise((resolve) => { finish = resolve; });
  const server = await startServer(finish);
  const port = server.address().port;
  // A fresh profile each run, so no service worker or cache from an earlier run serves old files.
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'simple-kcal-smoke-'));
  const chrome = spawn(chromePath, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--user-data-dir=' + profile,
    `http://127.0.0.1:${port}/tests/smoke.html`,
  ], { stdio: 'ignore' });

  const timer = setTimeout(() => finish({ results: [], fatal: 'Timed out after ' + TIMEOUT_MS / 1000 + ' s' }), TIMEOUT_MS);
  const report = await done;
  clearTimeout(timer);
  chrome.kill();
  server.close();
  await new Promise((r) => setTimeout(r, 500));
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* Chrome may still hold files */ }

  for (const r of report.results) {
    console.log((r.ok ? '  ok   ' : '  FAIL ') + r.name + (r.ok ? '' : '\n       ' + r.error));
  }
  if (report.fatal) console.log('  FAIL ' + report.fatal);
  const passed = report.results.filter((r) => r.ok).length;
  const allPassed = !report.fatal && passed === report.total;
  console.log(`\nsmoke: ${passed} of ${report.total || '?'} steps passed`);
  process.exit(allPassed ? 0 : 1);
}

main();
