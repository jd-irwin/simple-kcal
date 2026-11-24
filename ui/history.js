// History screen: a month calendar of kcal per day.

import Calc from '../calc/index.js';
import { app } from './store.js';
import { showScreen, setDate, registerScreen } from './nav.js';
import { $ } from './dom.js';

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
