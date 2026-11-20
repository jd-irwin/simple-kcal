// Run with: node test.js
'use strict';

// Fix the time zone so BST tests behave the same on any machine. Must be set before any Date use.
process.env.TZ = 'Europe/London';

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

function approx(actual, expected, msg) {
  assert.ok(Math.abs(actual - expected) < 1e-9, (msg || '') + ` expected ${expected}, got ${actual}`);
}

// ---------- Dates ----------

test('time zone is Europe/London (BST in July)', () => {
  assert.equal(new Date('2026-07-01T12:00:00Z').getTimezoneOffset(), -60);
});

test('dateKey: 00:30 BST is the new day even though UTC is still the previous day', () => {
  assert.equal(Calc.dateKey(new Date('2026-07-15T23:30:00Z')), '2026-07-16');
});

test('dateKey: 23:30 BST stays on the same day', () => {
  assert.equal(Calc.dateKey(new Date(2026, 6, 15, 23, 30)), '2026-07-15');
});

test('dateKey: around the March clock change', () => {
  assert.equal(Calc.dateKey(new Date('2026-03-28T23:30:00Z')), '2026-03-28'); // 23:30 GMT
  assert.equal(Calc.dateKey(new Date('2026-03-29T00:30:00Z')), '2026-03-29'); // 00:30 GMT
  assert.equal(Calc.dateKey(new Date('2026-03-29T23:30:00Z')), '2026-03-30'); // 00:30 BST
});

test('dateKey: around the October clock change', () => {
  assert.equal(Calc.dateKey(new Date('2026-10-24T23:30:00Z')), '2026-10-25'); // 00:30 BST
  assert.equal(Calc.dateKey(new Date('2026-10-25T23:30:00Z')), '2026-10-25'); // 23:30 GMT
});

test('addDays across both BST changes', () => {
  assert.equal(Calc.addDays('2026-03-28', 1), '2026-03-29');
  assert.equal(Calc.addDays('2026-03-29', 1), '2026-03-30');
  assert.equal(Calc.addDays('2026-03-30', -1), '2026-03-29');
  assert.equal(Calc.addDays('2026-10-24', 2), '2026-10-26');
  assert.equal(Calc.addDays('2026-10-26', -1), '2026-10-25');
});

test('addDays rolls over months, years and leap days', () => {
  assert.equal(Calc.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(Calc.addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(Calc.addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(Calc.addDays('2026-01-15', 0), '2026-01-15');
});

test('formatDate gives DD/MM/YYYY', () => {
  assert.equal(Calc.formatDate('2026-07-05'), '05/07/2026');
});

// ---------- Foods ----------

test('foodValues per 100g scales by grams and keeps null macros', () => {
  const food = { unit: '100g', kcal: 380, protein: 13, carbs: null, fat: 7 };
  const v = Calc.foodValues(food, 150);
  approx(v.kcal, 570);
  approx(v.protein, 19.5);
  assert.equal(v.carbs, null);
  approx(v.fat, 10.5);
});

test('foodValues per item scales by count', () => {
  const food = { unit: 'item', kcal: 72, protein: 6.3, carbs: 0.4, fat: 4.8 };
  const v = Calc.foodValues(food, 2);
  approx(v.kcal, 144);
  approx(v.protein, 12.6);
});

// ---------- Daily totals ----------

test('sumEntries: partial macros report known count', () => {
  const entries = [
    { kcal: 100, protein: 10, carbs: null, fat: 1 },
    { kcal: 200, protein: 5, carbs: null, fat: null },
    { kcal: 50, protein: null, carbs: null, fat: null },
    { kcal: 300, protein: 20, carbs: null, fat: 2 },
    { kcal: 150, protein: null, carbs: null, fat: null },
    { kcal: 80, protein: 1.5, carbs: null, fat: null },
  ];
  const t = Calc.sumEntries(entries);
  assert.equal(t.count, 6);
  approx(t.kcal, 880);
  approx(t.protein.total, 36.5);
  assert.equal(t.protein.known, 4);
  approx(t.fat.total, 3);
  assert.equal(t.fat.known, 2);
});

test('sumEntries: no known macro gives null, never zero', () => {
  const t = Calc.sumEntries([{ kcal: 100, protein: null, carbs: null, fat: null }]);
  assert.equal(t.carbs.total, null);
  assert.equal(t.carbs.known, 0);
});

test('sumEntries: a known zero counts as known', () => {
  const t = Calc.sumEntries([{ kcal: 10, protein: 0, carbs: null, fat: null }]);
  assert.equal(t.protein.total, 0);
  assert.equal(t.protein.known, 1);
});

test('sumEntries: empty list', () => {
  const t = Calc.sumEntries([]);
  assert.equal(t.count, 0);
  assert.equal(t.kcal, 0);
  assert.equal(t.protein.total, null);
});

// ---------- Recipes ----------

const porridge = {
  ingredients: [
    { name: 'Oats', grams: 200, kcalPer100g: 380, protein: 13, carbs: 60, fat: 7 },
    { name: 'Milk', grams: 500, kcalPer100g: 50, protein: 3.5, carbs: 4.8, fat: 1.8 },
  ],
  cookedWeight: 800,
  portions: 4,
};

test('recipeTotals sums ingredients', () => {
  const t = Calc.recipeTotals(porridge.ingredients);
  approx(t.kcal, 1010);
  approx(t.protein, 43.5);
  approx(t.carbs, 144);
  approx(t.fat, 23);
  assert.equal(t.rawWeight, 700);
});

test('recipePerPortion and recipePerGram', () => {
  const p = Calc.recipePerPortion(porridge);
  approx(p.kcal, 252.5);
  approx(p.protein, 10.875);
  const g = Calc.recipePerGram(porridge);
  approx(g.kcal, 1.2625);
  approx(g.fat, 0.02875);
});

test('recipeServing by fractional portions', () => {
  const s = Calc.recipeServing(porridge, { portions: 1.5 });
  approx(s.kcal, 378.75);
  approx(s.carbs, 54);
});

test('recipeServing by grams of cooked batch', () => {
  const s = Calc.recipeServing(porridge, { grams: 200 });
  approx(s.kcal, 252.5);
  approx(s.protein, 10.875);
});

test('recipe macro is null if any ingredient lacks it', () => {
  const r = {
    ingredients: [
      porridge.ingredients[0],
      { name: 'Honey', grams: 20, kcalPer100g: 304, protein: 0.3, carbs: 82, fat: null },
    ],
    cookedWeight: 220,
    portions: 2,
  };
  const t = Calc.recipeTotals(r.ingredients);
  assert.equal(t.fat, null);
  approx(t.protein, 26.06);
  assert.equal(Calc.recipeServing(r, { portions: 1 }).fat, null);
});

test('recipe with zero portions or weight gives nulls, not Infinity', () => {
  const r = Object.assign({}, porridge, { portions: 0, cookedWeight: 0 });
  assert.equal(Calc.recipePerPortion(r).kcal, null);
  assert.equal(Calc.recipePerGram(r).kcal, null);
});

// ---------- Display ----------

test('fmtKcal and fmtMacro round for display and show a dash for null', () => {
  assert.equal(Calc.fmtKcal(378.75), '379');
  assert.equal(Calc.fmtMacro(10.875), '10.9');
  assert.equal(Calc.fmtMacro(12), '12');
  assert.equal(Calc.fmtMacro(null), '–');
  assert.equal(Calc.fmtKcal(null), '–');
});

// ---------- Data and backup ----------

test('migrate passes current data through and fills settings defaults', () => {
  const d = Calc.migrate({ schemaVersion: 1, foods: [], recipes: [], entries: [] });
  assert.equal(d.schemaVersion, Calc.SCHEMA_VERSION);
  assert.deepEqual(d.settings, { lastBackup: null, persistRequested: false });
});

test('migrate rejects newer versions and junk', () => {
  assert.throws(() => Calc.migrate({ schemaVersion: 99, foods: [], recipes: [], entries: [] }), /newer version/);
  assert.throws(() => Calc.migrate(null));
  assert.throws(() => Calc.migrate([]));
  assert.throws(() => Calc.migrate({ foods: [] }), /schema version/);
  assert.throws(() => Calc.migrate({ schemaVersion: 1, foods: [], recipes: [] }), /entries/);
});

test('export then import round-trips', () => {
  const data = Calc.emptyData();
  data.foods.push({ id: 'a1', name: 'Oats', unit: '100g', kcal: 380, protein: 13, carbs: 60, fat: 7, lastUsed: 1 });
  data.entries.push({ id: 'e1', date: '2026-07-15', created: 1, name: 'Oats', kcal: 190, protein: 6.5, carbs: 30, fat: 3.5, source: 'food', sourceId: 'a1', amount: '50 g' });
  const text = JSON.stringify(Calc.buildExport(data, '2026-07-15T10:00:00.000Z'));
  const r = Calc.parseImport(text);
  assert.deepEqual(r.counts, { foods: 1, recipes: 0, entries: 1 });
  assert.equal(r.exportedAt, '2026-07-15T10:00:00.000Z');
  assert.deepEqual(r.data.foods, data.foods);
  assert.deepEqual(r.data.entries, data.entries);
});

test('parseImport gives clear errors', () => {
  assert.throws(() => Calc.parseImport('not json'), /could not be read/);
  assert.throws(() => Calc.parseImport('{"foo":1}'), /not a Batch kcal backup/);
  assert.throws(() => Calc.parseImport('{"app":"batch-kcal","schemaVersion":1,"foods":[],"recipes":[]}'), /entries/);
});

test('isBackupStale at the 7-day boundary', () => {
  const now = Date.parse('2026-07-15T12:00:00Z');
  assert.equal(Calc.isBackupStale(null, now), true);
  assert.equal(Calc.isBackupStale('2026-07-08T12:00:00Z', now), false); // exactly 7 days
  assert.equal(Calc.isBackupStale('2026-07-08T11:59:00Z', now), true);
  assert.equal(Calc.isBackupStale('2026-07-14T12:00:00Z', now), false);
  assert.equal(Calc.isBackupStale('garbage', now), true);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
