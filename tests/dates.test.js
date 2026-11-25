// Local calendar dates, the BST changes, and the History calendar grid.

import assert from 'node:assert/strict';
import Calc from '../calc/index.js';
import { test } from './harness.js';

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

test('weekdayDate and dayTitle', () => {
  assert.equal(Calc.weekdayDate('2026-11-20'), 'Fri 20/11/2026');
  assert.equal(Calc.dayTitle('2026-11-20', '2026-11-20'), 'Today');
  assert.equal(Calc.dayTitle('2026-11-19', '2026-11-20'), 'Yesterday');
  assert.equal(Calc.dayTitle('2026-11-21', '2026-11-20'), 'Tomorrow');
  assert.equal(Calc.dayTitle('2026-11-12', '2026-11-20'), 'Thu 12/11/2026');
  assert.equal(Calc.dayTitle('2026-03-29', '2026-03-30'), 'Yesterday'); // across BST start
});

test('isNamedDay is true for today, yesterday and tomorrow only, across BST changes', () => {
  assert.equal(Calc.isNamedDay('2026-11-20', '2026-11-20'), true);
  assert.equal(Calc.isNamedDay('2026-11-19', '2026-11-20'), true);
  assert.equal(Calc.isNamedDay('2026-11-21', '2026-11-20'), true);
  assert.equal(Calc.isNamedDay('2026-11-18', '2026-11-20'), false);
  assert.equal(Calc.isNamedDay('2026-11-22', '2026-11-20'), false);
  assert.equal(Calc.isNamedDay('2026-03-29', '2026-03-30'), true); // across BST start
  assert.equal(Calc.isNamedDay('2026-10-26', '2026-10-25'), true); // across BST end
  // Agrees with dayTitle for every day in a fortnight either side.
  for (let n = -14; n <= 14; n++) {
    const key = Calc.addDays('2026-11-20', n);
    assert.equal(Calc.isNamedDay(key, '2026-11-20'), !/\d/.test(Calc.dayTitle(key, '2026-11-20')), key);
  }
});

test('addMonths rolls over years both ways', () => {
  assert.deepEqual(Calc.addMonths(2026, 12, 1), { y: 2027, m: 1 });
  assert.deepEqual(Calc.addMonths(2027, 1, -1), { y: 2026, m: 12 });
  assert.deepEqual(Calc.addMonths(2026, 11, 0), { y: 2026, m: 11 });
  assert.deepEqual(Calc.addMonths(2026, 11, -23), { y: 2024, m: 12 });
  assert.deepEqual(Calc.addMonths(2026, 11, 14), { y: 2028, m: 1 });
});

test('formatMonth', () => {
  assert.equal(Calc.formatMonth(2026, 11), 'November 2026');
  assert.equal(Calc.formatMonth(2027, 1), 'January 2027');
});

// Every day of the month appears once, in order, with only nulls around it.
function checkGrid(weeks, y, m, daysInMonth) {
  weeks.forEach((w) => assert.equal(w.length, 7));
  const days = weeks.flat().filter(Boolean);
  assert.equal(days.length, daysInMonth);
  days.forEach((k, i) => assert.equal(k, y + '-' + String(m).padStart(2, '0') + '-' + String(i + 1).padStart(2, '0')));
}

test('monthGrid: month starting on a Sunday puts the 1st in the last column', () => {
  const g = Calc.monthGrid(2026, 11); // 1 November 2026 is a Sunday
  assert.deepEqual(g[0], [null, null, null, null, null, null, '2026-11-01']);
  assert.equal(g.length, 6);
  checkGrid(g, 2026, 11, 30);
});

test('monthGrid: month starting on a Monday has no leading blanks', () => {
  const g = Calc.monthGrid(2026, 6); // 1 June 2026 is a Monday
  assert.equal(g[0][0], '2026-06-01');
  assert.equal(g.length, 5);
  checkGrid(g, 2026, 6, 30);
});

test('monthGrid: 28-day February starting on a Monday is exactly four weeks', () => {
  const g = Calc.monthGrid(2027, 2);
  assert.equal(g.length, 4);
  assert.equal(g[3][6], '2027-02-28');
  checkGrid(g, 2027, 2, 28);
});

test('monthGrid: leap-year February has 29 days', () => {
  checkGrid(Calc.monthGrid(2028, 2), 2028, 2, 29);
});

test('monthGrid: BST change months have no missing or repeated days', () => {
  const oct = Calc.monthGrid(2026, 10); // clocks go back 25/10/2026
  checkGrid(oct, 2026, 10, 31);
  const mar = Calc.monthGrid(2027, 3); // clocks go forward 28/03/2027
  checkGrid(mar, 2027, 3, 31);
  // 28 March 2027 is a Sunday, so it sits in the last column.
  assert.ok(mar.some((w) => w[6] === '2027-03-28'));
});

test('monthRange gives the first and last day, including leap Februaries', () => {
  assert.deepEqual(Calc.monthRange(2026, 11), { from: '2026-11-01', to: '2026-11-30' });
  assert.deepEqual(Calc.monthRange(2026, 12), { from: '2026-12-01', to: '2026-12-31' });
  assert.deepEqual(Calc.monthRange(2027, 2), { from: '2027-02-01', to: '2027-02-28' });
  assert.deepEqual(Calc.monthRange(2028, 2), { from: '2028-02-01', to: '2028-02-29' });
  assert.deepEqual(Calc.monthRange(2026, 3), { from: '2026-03-01', to: '2026-03-31' }); // BST starts
});
