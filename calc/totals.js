// Totals per day. Only known values are summed, so a missing value is never shown as zero.

import { MACROS, isNum } from './values.js';
import { entryTotals } from './entries.js';

// The most recent date before key that has at least one entry, or null if there is none.
export function previousLoggedDay(entries, key) {
  let best = null;
  for (const e of entries) {
    if (e.date < key && (best === null || e.date > best)) best = e.date;
  }
  return best;
}

export function entriesForDate(entries, key) {
  return entries
    .filter((e) => e.date === key)
    .sort((a, b) => (a.created || 0) - (b.created || 0));
}

// Sums only known values. Each macro reports how many entries had a value,
// and total is null when none did, so a missing value is never shown as zero.
export function sumEntries(entries) {
  const result = { count: entries.length, kcal: 0 };
  MACROS.forEach((k) => { result[k] = { total: null, known: 0 }; });
  entries.forEach((entry) => {
    const t = entryTotals(entry);
    if (isNum(t.kcal)) result.kcal += t.kcal;
    MACROS.forEach((k) => {
      if (isNum(t[k])) {
        result[k].total = (result[k].total || 0) + t[k];
        result[k].known += 1;
      }
    });
  });
  return result;
}

// 'none' (no entry has it), 'partial' (some do) or 'complete'.
export function macroStatus(macroTotal, count) {
  if (macroTotal.known === 0) return 'none';
  return macroTotal.known < count ? 'partial' : 'complete';
}

// { 'YYYY-MM-DD': total kcal } for every date that has at least one entry.
export function dailyKcal(entries) {
  const totals = {};
  for (const e of entries) {
    const kcal = entryTotals(e).kcal;
    totals[e.date] = (totals[e.date] || 0) + (isNum(kcal) ? kcal : 0);
  }
  return totals;
}
