// Day totals, partial macros and per-day kcal for the calendar.

import assert from 'node:assert/strict';
import Calc from '../calc/index.js';
import { test, approx } from './harness.js';
import { oats, egg, q, porridge } from './fixtures.js';

test('sumEntries uses quantity / perAmount', () => {
  const entries = [
    Calc.entryFromFood(oats, 50, 'oats'),   // 190 kcal, P 6.5, C -, F 3.5
    Calc.entryFromFood(egg, 2, 'egg'),      // 144 kcal, P 12.6, C 0.8, F 9.6
    Calc.entryFromQuick({ kcal: 100 }),     // 100 kcal
  ];
  const t = Calc.sumEntries(entries);
  approx(t.kcal, 434);
  approx(t.protein.total, 19.1);
  assert.equal(t.protein.known, 2);
  approx(t.carbs.total, 0.8);
  assert.equal(t.carbs.known, 1);
  approx(t.fat.total, 13.1);
});

test('sumEntries: partial macros report known count', () => {
  const entries = [
    q({ kcal: 100, protein: 10, carbs: null, fat: 1 }),
    q({ kcal: 200, protein: 5, carbs: null, fat: null }),
    q({ kcal: 50, protein: null, carbs: null, fat: null }),
    q({ kcal: 300, protein: 20, carbs: null, fat: 2 }),
    q({ kcal: 150, protein: null, carbs: null, fat: null }),
    q({ kcal: 80, protein: 1.5, carbs: null, fat: null }),
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
  const t = Calc.sumEntries([q({ kcal: 100 })]);
  assert.equal(t.carbs.total, null);
  assert.equal(t.carbs.known, 0);
});

test('sumEntries: a known zero counts as known', () => {
  const t = Calc.sumEntries([q({ kcal: 10, protein: 0 })]);
  assert.equal(t.protein.total, 0);
  assert.equal(t.protein.known, 1);
});

test('sumEntries: empty list', () => {
  const t = Calc.sumEntries([]);
  assert.equal(t.count, 0);
  assert.equal(t.kcal, 0);
  assert.equal(t.protein.total, null);
});

test('entriesForDate filters and sorts by created', () => {
  const es = [
    { id: 'b', date: '2026-11-20', created: 20 },
    { id: 'x', date: '2026-11-19', created: 5 },
    { id: 'a', date: '2026-11-20', created: 10 },
  ];
  assert.deepEqual(Calc.entriesForDate(es, '2026-11-20').map((e) => e.id), ['a', 'b']);
  assert.deepEqual(Calc.entriesForDate(es, '2026-11-18'), []);
});

test('macroStatus', () => {
  assert.equal(Calc.macroStatus({ total: null, known: 0 }, 3), 'none');
  assert.equal(Calc.macroStatus({ total: 5, known: 2 }, 3), 'partial');
  assert.equal(Calc.macroStatus({ total: 5, known: 3 }, 3), 'complete');
});

test('dailyKcal sums grams, portions and quick add per day', () => {
  const oats = { id: 'f1', name: 'Oats', unit: '100g', kcal: 380, protein: 13, carbs: 60, fat: 7 };
  const recipe = Object.assign({ name: 'Porridge' }, porridge);
  const entries = [
    Object.assign({ date: '2026-11-20' }, Calc.entryFromFood(oats, 50, 'f1')),          // 190
    Object.assign({ date: '2026-11-20' }, Calc.entryFromRecipe(recipe, 1.5, 'portion', 'r1')), // 378.75
    Object.assign({ date: '2026-11-20' }, Calc.entryFromQuick({ kcal: 100 })),           // 100
    Object.assign({ date: '2026-11-21' }, Calc.entryFromRecipe(recipe, 300, 'g', null)),  // 378.75
  ];
  const t = Calc.dailyKcal(entries);
  approx(t['2026-11-20'], 668.75);
  approx(t['2026-11-21'], 378.75);
  assert.deepEqual(Object.keys(t).sort(), ['2026-11-20', '2026-11-21']);
});

test('dailyKcal: a day of 0 kcal entries is 0, a day with no entries is absent', () => {
  const t = Calc.dailyKcal([Object.assign({ date: '2026-11-22' }, Calc.entryFromQuick({ name: 'Water', kcal: 0 }))]);
  assert.equal(t['2026-11-22'], 0);
  assert.equal('2026-11-23' in t, false);
  assert.deepEqual(Calc.dailyKcal([]), {});
});

test('previousLoggedDay finds the latest earlier day with entries, skipping gaps', () => {
  const at = (date) => Object.assign({ date }, Calc.entryFromQuick({ kcal: 1 }));
  const entries = [at('2026-11-20'), at('2026-11-23'), at('2026-11-23'), at('2026-11-25'), at('2026-11-26')];
  assert.equal(Calc.previousLoggedDay(entries, '2026-11-25'), '2026-11-23'); // 24th was skipped
  assert.equal(Calc.previousLoggedDay(entries, '2026-11-24'), '2026-11-23');
  assert.equal(Calc.previousLoggedDay(entries, '2026-11-27'), '2026-11-26');
  assert.equal(Calc.previousLoggedDay(entries, '2026-11-21'), '2026-11-20');
  assert.equal(Calc.previousLoggedDay(entries, '2026-11-20'), null); // nothing earlier
  assert.equal(Calc.previousLoggedDay([], '2026-11-25'), null);
  assert.equal(Calc.previousLoggedDay([at('2026-12-31')], '2027-01-01'), '2026-12-31'); // across a year
});

test('targetProgress: none without a target, left and over from the rounded total', () => {
  assert.equal(Calc.targetProgress(1500, null), null);
  assert.equal(Calc.targetProgress(1500, 0), null);
  assert.deepEqual(Calc.targetProgress(1500, 2000), { percent: 75, left: 500, over: 0 });
  assert.deepEqual(Calc.targetProgress(2150, 2000), { percent: 100, left: 0, over: 150 });
  assert.deepEqual(Calc.targetProgress(2000, 2000), { percent: 100, left: 0, over: 0 });
  assert.deepEqual(Calc.targetProgress(0, 2000), { percent: 0, left: 2000, over: 0 });
  // 1449.5 shows as 1450, so 550 left (not 550.5 or 551): the shown numbers add up.
  assert.deepEqual(Calc.targetProgress(1449.5, 2000), { percent: 72.5, left: 550, over: 0 });
  assert.equal(Calc.fmtKcal(1449.5), '1450');
  assert.equal(Calc.targetProgress(null, 2000).left, 2000);
});

test('averageKcal counts logged days in range before today only', () => {
  const at = (date, kcal) => Object.assign({ date }, Calc.entryFromQuick({ kcal }));
  const entries = [
    at('2026-10-31', 5000),                      // before the range
    at('2026-11-01', 1800),                      // first day of range
    at('2026-11-02', 1000), at('2026-11-02', 1200), // two entries make one day of 2200
    // 3rd to 9th: nothing logged, so not counted as 0
    at('2026-11-10', 0),                         // logged, at 0 kcal: counts
    at('2026-11-24', 2000),                      // yesterday
    at('2026-11-25', 900),                       // today: not finished, excluded
    at('2026-11-27', 3000),                      // future: excluded
  ];
  const nov = Calc.averageKcal(entries, '2026-11-01', '2026-11-30', '2026-11-25');
  assert.equal(nov.days, 4);
  approx(nov.average, (1800 + 2200 + 0 + 2000) / 4);
  const week = Calc.averageKcal(entries, Calc.addDays('2026-11-25', -7), Calc.addDays('2026-11-25', -1), '2026-11-25');
  assert.deepEqual(week, { days: 1, average: 2000 });
  // A past month counts every logged day in it.
  assert.deepEqual(Calc.averageKcal(entries, '2026-10-01', '2026-10-31', '2026-11-25'), { days: 1, average: 5000 });
  // Nothing logged: no average, never 0.
  assert.deepEqual(Calc.averageKcal(entries, '2026-12-01', '2026-12-31', '2026-11-25'), { days: 0, average: null });
  assert.deepEqual(Calc.averageKcal([], '2026-11-01', '2026-11-30', '2026-11-25'), { days: 0, average: null });
});

test('average compared with a target uses the rounded average', () => {
  // 2049.6 shows as 2050; with a 2000 target that is 50 over, not 49.6.
  assert.deepEqual(Calc.targetProgress(2049.6, 2000), { percent: 100, left: 0, over: 50 });
  assert.equal(Calc.fmtKcal(2049.6), '2050');
});
