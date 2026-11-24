// Display formatting (round for display only) and parsing typed numbers.

import { isNum } from './values.js';

const DASH = '–';

export function fmtKcal(n) {
  return isNum(n) ? String(Math.round(n)) : DASH;
}

export function fmtMacro(n) {
  return isNum(n) ? String(Math.round(n * 10) / 10) : DASH;
}

// Quantity for display: up to 2 decimal places, no trailing zeros.
export function fmtQty(n) {
  return String(Math.round(n * 100) / 100);
}

// Entry unit + quantity for display: '150 g', '1 item', '2.5 items', '1.5 portions', '' for quick add.
export function formatAmount(qty, unit) {
  if (unit === 'g') return fmtQty(qty) + ' g';
  if (unit === 'item') return fmtQty(qty) + (qty === 1 ? ' item' : ' items');
  if (unit === 'portion') return fmtQty(qty) + (qty === 1 ? ' portion' : ' portions');
  return '';
}

export function formatEntryAmount(entry) {
  return formatAmount(entry.quantity, entry.unit);
}

// '' -> null, '12.5' or '12,5' -> 12.5, anything else (including negatives) -> NaN.
export function parseNumber(str) {
  const s = String(str == null ? '' : str).trim().replace(',', '.');
  if (s === '') return null;
  if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
  return Number(s);
}
