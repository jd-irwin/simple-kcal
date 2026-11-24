// Today screen: the selected day's totals and entries.

import Calc from '../calc/index.js';
import { app } from './store.js';
import { showScreen, setDate, registerScreen } from './nav.js';
import { MACROS, MACRO_NAMES, macroLine, entryName } from './text.js';
import { $, makeRow } from './dom.js';
import { openEntry } from './entry.js';

function renderToday() {
  $('day-title').textContent = Calc.dayTitle(app.selectedDate, app.todayKey);
  // A named day (Today, Yesterday, Tomorrow) also shows its date underneath.
  $('day-subtitle').textContent = Calc.isNamedDay(app.selectedDate, app.todayKey) ? Calc.weekdayDate(app.selectedDate) : '';

  const entries = Calc.entriesForDate(app.state.entries, app.selectedDate);
  const totals = Calc.sumEntries(entries);
  $('total-kcal').textContent = Calc.fmtKcal(totals.kcal);

  const notes = [];
  MACROS.forEach((k) => {
    const t = totals[k];
    $('total-' + k).textContent = t.total === null ? '–' : Calc.fmtMacro(t.total) + ' g';
    if (Calc.macroStatus(t, totals.count) === 'partial') {
      notes.push(MACRO_NAMES[k] + ' from ' + t.known + ' of ' + totals.count + ' entries');
    }
  });
  $('macro-note').textContent = notes.join('. ') + (notes.length ? '.' : '');
  $('macro-note').hidden = notes.length === 0;

  const list = $('entry-list');
  list.replaceChildren();
  entries.forEach((entry) => {
    const totals = Calc.entryTotals(entry);
    const sub = [Calc.formatEntryAmount(entry), macroLine(totals)].filter(Boolean).join(' · ');
    list.append(makeRow(entryName(entry), sub, Calc.fmtKcal(totals.kcal) + ' kcal', () => openEntry(entry)));
  });
  $('entry-empty').hidden = entries.length > 0;
}

export function init() {
  registerScreen('today', renderToday);
  $('prev-day').addEventListener('click', () => setDate(Calc.addDays(app.selectedDate, -1)));
  $('next-day').addEventListener('click', () => setDate(Calc.addDays(app.selectedDate, 1)));
  $('day-title-btn').addEventListener('click', () => setDate(app.todayKey));
  $('today-add').addEventListener('click', () => showScreen('add'));
}
