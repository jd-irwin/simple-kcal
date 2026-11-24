// Log entries: snapshots of per-unit values, totals from quantity / perAmount, linking to saved foods.

import assert from 'node:assert/strict';
import Calc from '../calc/index.js';
import { test, approx } from './harness.js';
import { oats, egg } from './fixtures.js';

test('entryFromFood per 100 g copies per-unit values with perAmount 100', () => {
  const e = Calc.entryFromFood(oats, 150, 'oats');
  assert.deepEqual(e, {
    name: 'Oats', source: 'food', sourceId: 'oats', quantity: 150, unit: 'g', perAmount: 100,
    kcal: 380, protein: 13, carbs: null, fat: 7,
  });
});

test('entryTotals per 100 g scales by quantity / 100 and keeps null macros', () => {
  const t = Calc.entryTotals(Calc.entryFromFood(oats, 150, 'oats'));
  approx(t.kcal, 570);
  approx(t.protein, 19.5);
  assert.equal(t.carbs, null);
  approx(t.fat, 10.5);
});

test('entryTotals per item scales by count', () => {
  const e = Calc.entryFromFood(egg, 2, 'egg');
  assert.equal(e.unit, 'item');
  assert.equal(e.perAmount, 1);
  const t = Calc.entryTotals(e);
  approx(t.kcal, 144);
  approx(t.protein, 12.6);
});

test('unsaved food entry has no sourceId', () => {
  assert.equal(Calc.entryFromFood(oats, 50).sourceId, null);
});

test('changing quantity rescales without changing per-unit values', () => {
  const e = Calc.entryFromFood(oats, 150, 'oats');
  const e2 = Calc.setEntryQuantity(e, 200);
  assert.equal(e.quantity, 150); // original untouched
  assert.equal(e2.quantity, 200);
  assert.equal(e2.kcal, 380);
  approx(Calc.entryTotals(e2).kcal, 760);
  approx(Calc.entryTotals(e2).kcal / Calc.entryTotals(e).kcal, 4 / 3);
});

test('setEntryNutrition changes per-unit values only', () => {
  const e = Object.assign({ id: 'x', date: '2026-11-20' }, Calc.entryFromFood(oats, 150, 'oats'));
  const e2 = Calc.setEntryNutrition(e, { kcal: 400, protein: 14, carbs: undefined, fat: null });
  assert.equal(e.kcal, 380); // original untouched
  assert.equal(e2.kcal, 400);
  assert.equal(e2.carbs, null);
  assert.equal(e2.fat, null);
  assert.equal(e2.quantity, 150);
  assert.equal(e2.unit, 'g');
  assert.equal(e2.perAmount, 100);
  assert.equal(e2.sourceId, 'oats');
  approx(Calc.entryTotals(e2).kcal, 600);
});

test('nutritionChanged', () => {
  const a = { name: 'Oats', unit: '100g', kcal: 380, protein: 13, carbs: null, fat: 7 };
  assert.equal(Calc.nutritionChanged(a, Object.assign({}, a, { name: 'Porridge oats' })), false);
  assert.equal(Calc.nutritionChanged(a, Object.assign({}, a, { carbs: undefined })), false);
  assert.equal(Calc.nutritionChanged(a, Object.assign({}, a, { kcal: 370 })), true);
  assert.equal(Calc.nutritionChanged(a, Object.assign({}, a, { carbs: 60 })), true);
  assert.equal(Calc.nutritionChanged(a, Object.assign({}, a, { unit: 'item' })), true);
});

test('quick add totals equal its values', () => {
  const e = Calc.entryFromQuick({ name: '', kcal: 250, protein: 10, carbs: null, fat: undefined });
  assert.equal(e.unit, 'quick');
  assert.equal(e.quantity, 1);
  assert.equal(e.perAmount, 1);
  assert.equal(e.fat, null);
  assert.deepEqual(Calc.entryTotals(e), { kcal: 250, protein: 10, carbs: null, fat: null });
});

test('linkedEntryCounts and applyToEntries touch linked entries only', () => {
  const today = '2026-11-20';
  const entries = [
    Object.assign({ id: 1, date: today }, Calc.entryFromFood(oats, 50, 'oats')),
    Object.assign({ id: 2, date: '2026-11-19' }, Calc.entryFromFood(oats, 80, 'oats')),
    Object.assign({ id: 3, date: today }, Calc.entryFromFood(oats, 60)),            // unsaved
    Object.assign({ id: 4, date: today }, Calc.entryFromQuick({ kcal: 100 })),      // quick
    Object.assign({ id: 5, date: today }, Calc.entryFromFood(egg, 2, 'egg')),       // other food
  ];
  assert.deepEqual(Calc.linkedEntryCounts(entries, oats, today), { today: 1, all: 2 });

  const fixed = Object.assign({}, oats, { kcal: 370, carbs: 60 });

  const none = Calc.applyToEntries(entries, fixed, 'none', today);
  assert.deepEqual(none, entries);

  const t = Calc.applyToEntries(entries, fixed, 'today', today);
  assert.equal(t[0].kcal, 370);
  assert.equal(t[0].carbs, 60);
  assert.equal(t[0].quantity, 50);
  assert.equal(t[1].kcal, 380); // other day untouched
  assert.equal(t[2], entries[2]);
  assert.equal(t[3], entries[3]);
  assert.equal(t[4], entries[4]);
  assert.equal(entries[0].kcal, 380); // input not mutated

  const all = Calc.applyToEntries(entries, fixed, 'all', today);
  assert.equal(all[0].kcal, 370);
  assert.equal(all[1].kcal, 370);
  assert.equal(all[1].quantity, 80);
  assert.equal(all[2].kcal, 380);
});

test('applyToEntries skips entries whose unit no longer matches the food', () => {
  const entries = [Object.assign({ id: 1, date: '2026-11-20' }, Calc.entryFromFood(oats, 50, 'oats'))];
  const nowPerItem = Object.assign({}, oats, { unit: 'item', kcal: 150 });
  assert.deepEqual(Calc.linkedEntryCounts(entries, nowPerItem, '2026-11-20'), { today: 0, all: 0 });
  assert.equal(Calc.applyToEntries(entries, nowPerItem, 'all', '2026-11-20')[0].kcal, 380);
});

test('defaultQty uses the latest linked entry, else 100 g or 1 item', () => {
  const entries = [
    Object.assign({ created: 10 }, Calc.entryFromFood(oats, 45, 'oats')),
    Object.assign({ created: 30 }, Calc.entryFromFood(oats, 60, 'oats')),
    Object.assign({ created: 20 }, Calc.entryFromFood(oats, 80, 'oats')),
    Object.assign({ created: 40 }, Calc.entryFromFood(oats, 999)), // unsaved, not linked
  ];
  assert.equal(Calc.defaultQty(oats, entries), 60);
  assert.equal(Calc.defaultQty(oats, []), 100);
  assert.equal(Calc.defaultQty(egg, entries), 1);
  assert.equal(Calc.defaultQty(Object.assign({}, oats, { unit: 'item' }), entries), 1); // unit changed
});
