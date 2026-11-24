// Search and sort of saved foods and recipes.

import assert from 'node:assert/strict';
import Calc from '../calc/index.js';
import { test } from './harness.js';
import { oats } from './fixtures.js';

test('searchRecent and searchByName', () => {
  const foods = [
    { name: 'Oat milk', lastUsed: 1 },
    { name: 'Porridge oats', lastUsed: 3 },
    { name: 'Banana', lastUsed: 2 },
  ];
  assert.deepEqual(Calc.searchRecent(foods, '').map((f) => f.name), ['Porridge oats', 'Banana', 'Oat milk']);
  assert.deepEqual(Calc.searchRecent(foods, 'OAT').map((f) => f.name), ['Porridge oats', 'Oat milk']);
  assert.deepEqual(Calc.searchRecent(foods, 'oats porr').map((f) => f.name), ['Porridge oats']);
  assert.deepEqual(Calc.searchByName(foods, '').map((f) => f.name), ['Banana', 'Oat milk', 'Porridge oats']);
  assert.deepEqual(Calc.searchByName(foods, 'zzz'), []);
});
