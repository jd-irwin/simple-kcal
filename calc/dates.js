// Dates are local calendar dates ('YYYY-MM-DD'), never UTC. Months are 1-12.

function pad2(n) {
  return String(n).padStart(2, '0');
}

// Date -> 'YYYY-MM-DD' in the device's local time zone.
export function dateKey(date) {
  return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
}

function parseKey(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) throw new Error('Invalid date key: ' + key);
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

// Add n calendar days. Built at local noon so DST changes can never shift the day.
export function addDays(key, n) {
  const p = parseKey(key);
  return dateKey(new Date(p.y, p.m - 1, p.d + n, 12));
}

// 'YYYY-MM-DD' -> 'DD/MM/YYYY'
export function formatDate(key) {
  const p = parseKey(key);
  return pad2(p.d) + '/' + pad2(p.m) + '/' + p.y;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

// { y, m } n months from y/m, rolling over years.
export function addMonths(y, m, n) {
  const i = y * 12 + (m - 1) + n;
  return { y: Math.floor(i / 12), m: (i % 12 + 12) % 12 + 1 };
}

// 'November 2026'
export function formatMonth(y, m) {
  return MONTHS[m - 1] + ' ' + y;
}

// Weeks (Monday first) of date keys for a month; days outside the month are null.
export function monthGrid(y, m) {
  const first = new Date(y, m - 1, 1, 12);
  const daysInMonth = new Date(y, m, 0, 12).getDate();
  const lead = (first.getDay() + 6) % 7; // Monday = 0
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(y + '-' + pad2(m) + '-' + pad2(d));
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// 'Fri 20/11/2026'
export function weekdayDate(key) {
  const p = parseKey(key);
  const wd = WEEKDAYS[new Date(p.y, p.m - 1, p.d, 12).getDay()];
  return wd + ' ' + formatDate(key);
}

// True for the days dayTitle shows by name (today, yesterday, tomorrow) rather than by date.
export function isNamedDay(key, todayKey) {
  return key === todayKey || key === addDays(todayKey, -1) || key === addDays(todayKey, 1);
}

// 'Today', 'Yesterday', 'Tomorrow', or 'Thu 12/11/2026'
export function dayTitle(key, todayKey) {
  if (key === todayKey) return 'Today';
  if (key === addDays(todayKey, -1)) return 'Yesterday';
  if (key === addDays(todayKey, 1)) return 'Tomorrow';
  return weekdayDate(key);
}
