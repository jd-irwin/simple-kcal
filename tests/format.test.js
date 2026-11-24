// Display formatting and number parsing.

import assert from 'node:assert/strict';
import Calc from '../calc/index.js';
import { test } from './harness.js';
import { oats, egg } from './fixtures.js';

test('formatEntryAmount', () => {
  assert.equal(Calc.formatEntryAmount(Calc.entryFromFood(oats, 150)), '150 g');
  assert.equal(Calc.formatEntryAmount(Calc.entryFromFood(egg, 1)), '1 item');
  assert.equal(Calc.formatEntryAmount({ quantity: 1.5, unit: 'portion' }), '1.5 portions');
  assert.equal(Calc.formatEntryAmount(Calc.entryFromQuick({ kcal: 1 })), '');
});

test('fmtKcal and fmtMacro round for display and show a dash for null', () => {
  assert.equal(Calc.fmtKcal(378.75), '379');
  assert.equal(Calc.fmtMacro(10.875), '10.9');
  assert.equal(Calc.fmtMacro(12), '12');
  assert.equal(Calc.fmtMacro(null), '–');
  assert.equal(Calc.fmtKcal(null), '–');
});

test('formatAmount', () => {
  assert.equal(Calc.formatAmount(150, 'g'), '150 g');
  assert.equal(Calc.formatAmount(1, 'portion'), '1 portion');
  assert.equal(Calc.formatAmount(1, 'quick'), '');
  assert.equal(Calc.formatAmount(1, 'item'), '1 item');
  assert.equal(Calc.formatAmount(2.5, 'item'), '2.5 items');
  assert.equal(Calc.formatAmount(1 / 3, 'item'), '0.33 items');
});

test('parseNumber', () => {
  assert.equal(Calc.parseNumber(''), null);
  assert.equal(Calc.parseNumber('   '), null);
  assert.equal(Calc.parseNumber(undefined), null);
  assert.equal(Calc.parseNumber('12'), 12);
  assert.equal(Calc.parseNumber(' 12.5 '), 12.5);
  assert.equal(Calc.parseNumber('12,5'), 12.5);
  assert.equal(Calc.parseNumber('.5'), 0.5);
  assert.equal(Calc.parseNumber('0'), 0);
  assert.ok(Number.isNaN(Calc.parseNumber('-3')));
  assert.ok(Number.isNaN(Calc.parseNumber('abc')));
  assert.ok(Number.isNaN(Calc.parseNumber('1.2.3')));
});
