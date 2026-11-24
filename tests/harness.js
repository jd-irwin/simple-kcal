// Minimal test runner shared by the *.test.js files. Tests run when their file is imported.

import assert from 'node:assert/strict';

let passed = 0;
let failed = 0;

export function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok   ' + name);
  } catch (err) {
    failed++;
    console.log('  FAIL ' + name);
    console.log('       ' + err.message);
  }
}

export function approx(actual, expected, msg) {
  assert.ok(Math.abs(actual - expected) < 1e-9, (msg || '') + ` expected ${expected}, got ${actual}`);
}

export function results() {
  return { passed, failed };
}
