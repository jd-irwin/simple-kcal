// Run with: node test.js
'use strict';

const assert = require('node:assert/strict');
const Calc = require('./calc.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
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

test('calc.js loads as an object', () => {
  assert.equal(typeof Calc, 'object');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
