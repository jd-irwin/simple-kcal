// Entry point: loads the data, wires up every screen and dialog, and draws the app.
// Calculation lives in calc/ (pure, tested by node test.js); screens and dialogs live in ui/.

import { app, load, requestPersistence, save, newId } from './ui/store.js';
import { toast } from './ui/messages.js';
import * as nav from './ui/nav.js';
import * as messages from './ui/messages.js';
import * as today from './ui/today.js';
import * as add from './ui/add.js';
import * as library from './ui/library.js';
import * as history from './ui/history.js';
import * as settings from './ui/settings.js';
import * as amount from './ui/amount.js';
import * as food from './ui/food.js';
import * as apply from './ui/apply.js';
import * as recipe from './ui/recipe.js';
import * as ingredient from './ui/ingredient.js';
import * as entry from './ui/entry.js';
import * as copy from './ui/copy.js';
import * as pans from './ui/pans.js';

// Screens register in this order, which is the order render() draws them.
const MODULES = [nav, messages, today, add, library, history, settings, amount, food, apply, recipe, ingredient, entry, copy, pans];

function init() {
  load();
  requestPersistence();

  // Every dialog's Cancel button closes it.
  document.querySelectorAll('dialog [data-close]').forEach((btn) => {
    btn.addEventListener('click', () => btn.closest('dialog').close());
  });
  MODULES.forEach((m) => m.init());

  nav.render();
  if (app.startupNotice) toast(app.startupNotice);
  registerServiceWorker();
}

// Offline support. Skipped when opened as a local file; a failure only means no offline cache.
function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// Exposed for console debugging.
window.App = { get state() { return app.state; }, save, render: nav.render, newId };

init();
