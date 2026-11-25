// Schema migration, validation, backup export and import.

import assert from 'node:assert/strict';
import Calc from '../calc/index.js';
import { test, approx } from './harness.js';
import { oats, q } from './fixtures.js';

test('migrate drops unreadable records and counts them', () => {
  const good = { id: 'f1', name: 'Bread', unit: '100g', kcal: 200, protein: 0, carbs: 100, fat: 0 };
  const d = Calc.migrate({
    schemaVersion: 2,
    foods: ['bread', good, { id: 'f2', unit: '100g', kcal: 1 }, null],
    recipes: [{ id: 'r1', name: 'Soup', ingredients: [{ name: 'Leek', unit: '100g', amount: 200, kcal: 30 }, 'junk'], portions: 2, cookedWeight: null }, 42],
    entries: [{ id: 'e1', date: '2026-11-20', quantity: 1, perAmount: 1, unit: 'quick', source: 'quick', kcal: 100 }, { id: 'e2' }],
  });
  assert.deepEqual(d.foods, [good]);
  assert.equal(d.recipes.length, 1);
  assert.equal(d.recipes[0].ingredients.length, 1);
  assert.equal(d.entries.length, 1);
  assert.equal(d.skipped, 3 + 1 + 1 + 1);
  assert.equal(Object.keys(d).includes('skipped'), false, 'not stored');
});

test('importing a backup with a stray string food skips it', () => {
  const r = Calc.parseImport(JSON.stringify({
    app: 'batch-kcal', schemaVersion: 1, exportedAt: '2026-11-20T10:00:00Z',
    foods: ['bread', { id: 'gbj7suj8', name: 'Bread', unit: '100g', kcal: 200, protein: 0, carbs: 100, fat: 0, lastUsed: 1, lastQty: 100 }],
    recipes: [], entries: [],
  }));
  assert.equal(r.counts.foods, 1);
  assert.equal(r.skipped, 1);
  assert.equal(Calc.searchRecent(r.data.foods, '').length, 1);
});

test('migrate passes current data through and fills settings defaults', () => {
  const d = Calc.migrate({ schemaVersion: 2, foods: [], recipes: [], entries: [] });
  assert.equal(d.schemaVersion, Calc.SCHEMA_VERSION);
  assert.deepEqual(d.settings, { lastBackup: null, persistRequested: false });
});

test('migrate rejects newer versions and junk', () => {
  assert.throws(() => Calc.migrate({ schemaVersion: 99, foods: [], recipes: [], entries: [] }), /newer version/);
  assert.throws(() => Calc.migrate(null));
  assert.throws(() => Calc.migrate([]));
  assert.throws(() => Calc.migrate({ foods: [] }), /schema version/);
  assert.throws(() => Calc.migrate({ schemaVersion: 2, foods: [], recipes: [] }), /entries/);
});

test('migrate v1 -> v2 converts entries to quantity and per-unit values', () => {
  const v1 = {
    schemaVersion: 1,
    foods: [{ id: 'oats', name: 'Oats', unit: '100g', kcal: 380, protein: 13, carbs: null, fat: 7, lastUsed: 5, lastQty: 150 }],
    recipes: [],
    entries: [
      { id: 'a', date: '2026-11-20', created: 1, name: 'Oats', kcal: 570, protein: 19.5, carbs: null, fat: 10.5, source: 'food', sourceId: 'oats', amount: '150 g' },
      { id: 'b', date: '2026-11-20', created: 2, name: 'Egg', kcal: 144, protein: 12.6, carbs: 0.8, fat: 9.6, source: 'food', sourceId: null, amount: '2 items' },
      { id: 'c', date: '2026-11-20', created: 3, name: 'Egg', kcal: 72, protein: null, carbs: null, fat: null, source: 'food', sourceId: null, amount: '1 item' },
      { id: 'd', date: '2026-11-20', created: 4, name: '', kcal: 250, protein: 10, carbs: null, fat: null, source: 'quick', sourceId: null, amount: '' },
      { id: 'e', date: '2026-11-20', created: 5, name: 'Odd', kcal: 99, protein: null, carbs: null, fat: null, source: 'food', sourceId: null, amount: 'a bowl' },
    ],
    settings: { lastBackup: null, persistRequested: true },
  };
  const before = Calc.sumEntries(v1.entries.map((e) => q(e)));
  const d = Calc.migrate(v1);
  assert.equal(d.schemaVersion, Calc.SCHEMA_VERSION);
  assert.equal('lastQty' in d.foods[0], false);
  assert.equal(d.foods[0].lastUsed, 5);
  d.entries.forEach((e) => assert.equal('amount' in e, false));

  const [a, b, c, dq, odd] = d.entries;
  assert.equal(a.unit, 'g'); assert.equal(a.quantity, 150); assert.equal(a.perAmount, 100);
  approx(a.kcal, 380); approx(a.protein, 13); assert.equal(a.carbs, null); approx(a.fat, 7);
  assert.equal(a.sourceId, 'oats');
  assert.equal(b.unit, 'item'); assert.equal(b.quantity, 2); approx(b.kcal, 72);
  assert.equal(c.unit, 'item'); assert.equal(c.quantity, 1); approx(c.kcal, 72);
  assert.equal(dq.unit, 'quick'); assert.equal(dq.kcal, 250); assert.equal(dq.protein, 10);
  assert.equal(odd.unit, 'quick'); assert.equal(odd.kcal, 99); assert.equal(odd.source, 'food');

  // Day totals are unchanged by the migration.
  const after = Calc.sumEntries(d.entries);
  approx(after.kcal, before.kcal);
  approx(after.protein.total, before.protein.total);
  assert.equal(after.protein.known, before.protein.known);
  approx(after.fat.total, before.fat.total);
});

test('a v1 backup file imports as v2', () => {
  const text = JSON.stringify({
    app: 'batch-kcal', schemaVersion: 1, exportedAt: '2026-11-20T10:00:00.000Z',
    foods: [], recipes: [],
    entries: [{ id: 'a', date: '2026-11-20', created: 1, name: 'Oats', kcal: 190, protein: null, carbs: null, fat: null, source: 'food', sourceId: null, amount: '50 g' }],
  });
  const r = Calc.parseImport(text);
  assert.equal(r.data.schemaVersion, Calc.SCHEMA_VERSION);
  assert.equal(r.data.entries[0].quantity, 50);
  approx(Calc.entryTotals(r.data.entries[0]).kcal, 190);
});

test('export then import round-trips', () => {
  const data = Calc.emptyData();
  data.foods.push({ id: 'a1', name: 'Oats', unit: '100g', kcal: 380, protein: 13, carbs: 60, fat: 7, lastUsed: 1 });
  data.entries.push(Object.assign({ id: 'e1', date: '2026-07-15', created: 1 }, Calc.entryFromFood(data.foods[0], 50, 'a1')));
  const text = JSON.stringify(Calc.buildExport(data, '2026-07-15T10:00:00.000Z'));
  const r = Calc.parseImport(text);
  assert.deepEqual(r.counts, { foods: 1, recipes: 0, entries: 1 });
  assert.equal(r.exportedAt, '2026-07-15T10:00:00.000Z');
  assert.deepEqual(r.data.foods, data.foods);
  assert.deepEqual(r.data.entries, data.entries);
});

test('parseImport gives clear errors', () => {
  assert.throws(() => Calc.parseImport('not json'), /could not be read/);
  assert.throws(() => Calc.parseImport('{"foo":1}'), /not a simple-kcal backup/);
  assert.throws(() => Calc.parseImport('{"app":"other-app","schemaVersion":2,"foods":[],"recipes":[],"entries":[]}'), /not a simple-kcal backup/);
  assert.throws(() => Calc.parseImport('{"app":"batch-kcal","schemaVersion":2,"foods":[],"recipes":[]}'), /entries/);
});

test('backups are stamped simple-kcal, and old batch-kcal backups still import', () => {
  const exported = Calc.buildExport(Calc.emptyData(), '2026-11-24T10:00:00.000Z');
  assert.equal(exported.app, 'simple-kcal');
  for (const app of ['simple-kcal', 'batch-kcal']) {
    const r = Calc.parseImport(JSON.stringify(Object.assign({}, exported, { app })));
    assert.deepEqual(r.counts, { foods: 0, recipes: 0, entries: 0 });
  }
});

test('isBackupStale at the 7-day boundary', () => {
  const now = Date.parse('2026-07-15T12:00:00Z');
  assert.equal(Calc.isBackupStale(null, now), true);
  assert.equal(Calc.isBackupStale('2026-07-08T12:00:00Z', now), false); // exactly 7 days
  assert.equal(Calc.isBackupStale('2026-07-08T11:59:00Z', now), true);
  assert.equal(Calc.isBackupStale('2026-07-14T12:00:00Z', now), false);
  assert.equal(Calc.isBackupStale('garbage', now), true);
});

test('schema 3: a v2 store gains an empty target; a valid target is kept, a bad one dropped', () => {
  const v2 = { schemaVersion: 2, foods: [], recipes: [], entries: [], settings: { lastBackup: null, persistRequested: true } };
  const d = Calc.migrate(v2);
  assert.equal(d.schemaVersion, 3);
  assert.equal(d.targetKcal, null);
  assert.equal(Calc.emptyData().targetKcal, null);
  assert.equal(Calc.migrate({ schemaVersion: 3, foods: [], recipes: [], entries: [], targetKcal: 2000 }).targetKcal, 2000);
  for (const bad of [0, -5, 0.4, '2000', null, undefined, NaN, Infinity]) {
    assert.equal(Calc.migrate({ schemaVersion: 3, foods: [], recipes: [], entries: [], targetKcal: bad }).targetKcal, null, String(bad));
  }
});

test('the target is exported and imported; older backups import with no target', () => {
  const data = Object.assign(Calc.emptyData(), { targetKcal: 1850 });
  const exported = Calc.buildExport(data, '2026-11-25T10:00:00.000Z');
  assert.equal(exported.targetKcal, 1850);
  assert.equal(exported.schemaVersion, 3);
  assert.equal(Calc.parseImport(JSON.stringify(exported)).data.targetKcal, 1850);
  const v2backup = { app: 'simple-kcal', schemaVersion: 2, exportedAt: '2026-11-20T10:00:00Z', foods: [], recipes: [], entries: [] };
  assert.equal(Calc.parseImport(JSON.stringify(v2backup)).data.targetKcal, null);
  assert.equal(Calc.buildExport(Calc.emptyData(), 'x').targetKcal, null);
});
