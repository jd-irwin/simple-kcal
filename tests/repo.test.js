// Checks on the repository itself rather than the calculation code.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from './harness.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Every file the app is made of must be precached, or it breaks offline; and every precached file must exist.
test('sw.js precaches exactly the app files', () => {
  const NOT_APP = new Set(['sw.js', 'test.js', 'package.json']);
  const SKIP_DIRS = new Set(['.git', '.claude', 'tests', 'node_modules']);
  const appFiles = [];
  (function walk(dir) {
    for (const d of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = dir ? dir + '/' + d.name : d.name;
      if (d.isDirectory()) { if (!SKIP_DIRS.has(d.name)) walk(rel); continue; }
      if (/\.(html|css|js|json|png)$/.test(d.name) && !NOT_APP.has(rel)) appFiles.push(rel);
    }
  })('');
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const listed = [...sw.match(/const FILES = \[([\s\S]*?)\]/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.ok(listed.includes('./'), 'precaches ./');
  assert.deepEqual(listed.filter((f) => f !== './').sort(), appFiles.sort());
});

test('version.js and sw.js declare the same version', () => {
  const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const appVersion = read('version.js').match(/const APP_VERSION = '([^']+)'/);
  const swVersion = read('sw.js').match(/const VERSION = '([^']+)'/);
  assert.ok(appVersion && swVersion, 'version constants not found');
  assert.equal(appVersion[1], swVersion[1]);
});

// Loading each module makes Node check that every import names something the other module
// exports. In the browser a mistake there stops the whole app from starting. The modules only
// declare functions at load time, so they load without a page.
const loadErrors = [];
for (const f of fs.readdirSync(path.join(ROOT, 'ui')).sort()) {
  try {
    await import('../ui/' + f);
  } catch (e) {
    loadErrors.push('ui/' + f + ': ' + e.message);
  }
}
test('every ui module loads and its imports resolve', () => {
  assert.deepEqual(loadErrors, []);
});
