// History screen: a month calendar of kcal per day, with averages.

import Calc from '../calc/index.js';
import { app } from './store.js';
import { showScreen, setDate, registerScreen } from './nav.js';
import { $ } from './dom.js';
import { plural } from './text.js';

// Month shown on the History tab: { y, m } with m 1-12.
let historyMonth = monthOf(app.todayKey);

function monthOf(key) {
  return { y: Number(key.slice(0, 4)), m: Number(key.slice(5, 7)) };
}

function renderHistory() {
  const { y, m } = historyMonth;
  $('month-title').textContent = Calc.formatMonth(y, m);
  const totals = Calc.dailyKcal(app.state.entries);
  const container = $('cal-days');
  container.textContent = '';
  for (const week of Calc.monthGrid(y, m)) {
    for (const key of week) {
      if (!key) {
        const blank = document.createElement('span');
        blank.className = 'cal-blank';
        container.appendChild(blank);
        continue;
      }
      const has = key in totals;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cal-day';
      btn.dataset.date = key;
      if (key === app.todayKey) btn.classList.add('is-today');
      // Future days are only tappable if something has been logged on them.
      if (key > app.todayKey && !has) btn.disabled = true;
      const num = document.createElement('span');
      num.className = 'cal-num';
      num.textContent = String(Number(key.slice(8)));
      btn.appendChild(num);
      const kcal = document.createElement('span');
      kcal.className = 'cal-kcal';
      kcal.textContent = has ? Calc.fmtKcal(totals[key]) : '';
      btn.appendChild(kcal);
      btn.setAttribute('aria-label', Calc.weekdayDate(key) + (has ? ', ' + Calc.fmtKcal(totals[key]) + ' kcal' : ', nothing logged'));
      container.appendChild(btn);
    }
  }
  renderAverages();
}

// Fills one average tile: '2021 kcal', '16 logged days', and how it compares with the target.
function fillAverage(prefix, avg) {
  const none = avg.days === 0;
  $(prefix + '-kcal').textContent = none ? '–' : Calc.fmtKcal(avg.average) + ' kcal';
  $(prefix + '-days').textContent = none ? 'Nothing logged yet' : plural(avg.days, 'logged day', 'logged days');
  const progress = none ? null : Calc.targetProgress(avg.average, app.state.targetKcal);
  const target = $(prefix + '-target');
  target.hidden = !progress;
  target.classList.toggle('is-over', !!progress && progress.over > 0);
  if (!progress) return;
  if (progress.over > 0) target.textContent = progress.over + ' over target';
  else if (progress.left > 0) target.textContent = progress.left + ' under target';
  else target.textContent = 'On target';
}

function renderAverages() {
  const { y, m } = historyMonth;
  const month = Calc.monthRange(y, m);
  $('avg-month-label').textContent = Calc.formatMonth(y, m);
  fillAverage('avg-month', Calc.averageKcal(app.state.entries, month.from, month.to, app.todayKey));
  fillAverage('avg-week', Calc.averageKcal(app.state.entries, Calc.addDays(app.todayKey, -7), Calc.addDays(app.todayKey, -1), app.todayKey));
}

function changeMonth(n) {
  historyMonth = Calc.addMonths(historyMonth.y, historyMonth.m, n);
  renderHistory();
}

export function init() {
  registerScreen('history', renderHistory);
  $('prev-month').addEventListener('click', () => changeMonth(-1));
  $('next-month').addEventListener('click', () => changeMonth(1));
  $('month-title-btn').addEventListener('click', () => {
    historyMonth = monthOf(app.todayKey);
    renderHistory();
  });
  $('cal-days').addEventListener('click', (e) => {
    const btn = e.target.closest('.cal-day');
    if (!btn || btn.disabled) return;
    setDate(btn.dataset.date);
    showScreen('today');
  });
}
