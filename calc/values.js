// Shared value helpers. Nutrition values are { kcal, protein, carbs, fat }; any of them may be null
// when unknown, and null must never be treated as zero.

export const MACROS = ['protein', 'carbs', 'fat'];

export function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

export function scaleNullable(v, factor) {
  return isNum(v) ? v * factor : null;
}

export function scaleValues(vals, factor) {
  const out = { kcal: scaleNullable(vals.kcal, factor) };
  MACROS.forEach((k) => { out[k] = scaleNullable(vals[k], factor); });
  return out;
}

export function orNull(v) {
  return isNum(v) ? v : null;
}

export function divideValues(vals, divisor) {
  if (!isNum(divisor) || divisor <= 0) {
    return { kcal: null, protein: null, carbs: null, fat: null };
  }
  return scaleValues(vals, 1 / divisor);
}

export function sameValues(a, b) {
  return ['kcal'].concat(MACROS).every((k) => orNull(a[k]) === orNull(b[k]));
}
