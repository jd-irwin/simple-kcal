// Navigation: switching tabs, choosing the day, and redrawing screens.
// Screens register their render function here, so nothing else needs to import every screen.

import Calc from '../calc/index.js';
import { app } from './store.js';
import { $ } from './dom.js';

const BANNER_SCREENS = ['today', 'settings'];

let currentScreen = 'today';
// Screen name -> function that redraws it from app.state, in registration order.
const renderers = new Map();

export function registerScreen(name, renderFn) {
  renderers.set(name, renderFn);
}

function hasData() {
  const c = Calc.countData(app.state);
  return c.foods + c.recipes + c.entries > 0;
}

function renderBanner() {
  const stale = hasData() && Calc.isBackupStale(app.state.settings.lastBackup, Date.now());
  $('backup-banner').hidden = !(stale && BANNER_SCREENS.includes(currentScreen));
}

// Redraws every screen. Cheap at this size, and it keeps every screen in step with the data.
export function render() {
  renderers.forEach((fn) => fn());
  renderBanner();
}

export function showScreen(name) {
  currentScreen = name;
  document.querySelectorAll('.screen').forEach((node) => {
    node.hidden = node.dataset.screen !== name;
  });
  document.querySelectorAll('.tabbar [data-tab]').forEach((btn) => {
    if (btn.dataset.tab === name) {
      btn.setAttribute('aria-current', 'page');
    } else {
      btn.removeAttribute('aria-current');
    }
  });
  if (renderers.has(name)) renderers.get(name)();
  renderBanner();
  window.scrollTo(0, 0);
}

export function setDate(key) {
  app.selectedDate = key;
  render();
}

// If the app was left open past midnight and was showing "today", move it to the new today.
function checkDayChange() {
  const now = Calc.dateKey(new Date());
  if (now === app.todayKey) return;
  if (app.selectedDate === app.todayKey) app.selectedDate = now;
  app.todayKey = now;
  render();
}

export function init() {
  document.querySelector('.tabbar').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (btn) showScreen(btn.dataset.tab);
  });
  $('backup-banner').addEventListener('click', () => showScreen('settings'));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkDayChange();
  });
}
