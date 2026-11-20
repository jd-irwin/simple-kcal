(function () {
  'use strict';

  const APP_VERSION = '0.1.0';
  const STORAGE_KEY = 'batchKcal.v1';
  const BANNER_SCREENS = ['today', 'settings'];

  let state = Calc.emptyData();
  // True when stored data exists but could not be read. Saving is blocked so it is never overwritten.
  let readOnly = false;
  let currentScreen = 'today';

  const $ = (id) => document.getElementById(id);

  // ---------- Storage ----------

  function load() {
    let raw;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      showLoadError('This browser is blocking storage, so nothing can be saved. Check that private browsing is off.');
      readOnly = true;
      return;
    }
    if (raw === null) {
      state = Calc.emptyData();
      return;
    }
    try {
      state = Calc.migrate(JSON.parse(raw));
    } catch (e) {
      readOnly = true;
      showLoadError('Your saved data could not be read (' + e.message + '). Nothing has been changed. Import a backup in Settings to restore it.');
    }
  }

  function save() {
    if (readOnly) return false;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      showMessage('Could not save: this phone’s storage for the app is full. Export a backup, then free some space.', true);
      return false;
    }
  }

  // 8 random base-36 characters.
  function newId() {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => (b % 36).toString(36)).join('');
  }

  function requestPersistence() {
    if (readOnly || state.settings.persistRequested) return;
    state.settings.persistRequested = true;
    save();
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(() => {});
    }
  }

  // ---------- Messages ----------

  function showLoadError(text) {
    const el = $('load-error');
    el.textContent = text;
    el.hidden = false;
  }

  function showMessage(text, isError) {
    const el = $('settings-message');
    el.textContent = text;
    el.classList.toggle('error', !!isError);
    el.hidden = false;
  }

  function clearMessage() {
    $('settings-message').hidden = true;
  }

  function plural(n, one, many) {
    return n + ' ' + (n === 1 ? one : many);
  }

  function countsText(c) {
    return plural(c.foods, 'food', 'foods') + ', ' +
      plural(c.recipes, 'recipe', 'recipes') + ' and ' +
      plural(c.entries, 'log entry', 'log entries');
  }

  // ---------- Export and import ----------

  function downloadFile(file) {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  async function exportData() {
    clearMessage();
    const now = new Date();
    const json = JSON.stringify(Calc.buildExport(state, now.toISOString()), null, 2);
    const filename = 'batch-kcal-backup-' + Calc.dateKey(now) + '.json';
    const file = new File([json], filename, { type: 'application/json' });

    const touch = window.matchMedia('(pointer: coarse)').matches;
    let done = false;
    if (touch && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: filename });
        done = true;
      } catch (e) {
        if (e.name === 'AbortError') return; // user closed the share sheet
      }
    }
    if (!done) downloadFile(file);

    state.settings.lastBackup = now.toISOString();
    save();
    render();
    showMessage('Backup exported as ' + filename + '.');
  }

  async function importFile(file) {
    clearMessage();
    let result;
    try {
      result = Calc.parseImport(await file.text());
    } catch (e) {
      showMessage(e.message, true);
      return;
    }
    const current = countsText(Calc.countData(state));
    const ok = window.confirm(
      'Replace all data with ' + countsText(result.counts) + '?\n\n' +
      'Your current ' + current + ' will be deleted.'
    );
    if (!ok) return;

    result.data.settings = Object.assign({}, state.settings, {
      lastBackup: result.exportedAt,
      persistRequested: true,
    });
    state = result.data;
    readOnly = false;
    $('load-error').hidden = true;
    if (save()) {
      render();
      showMessage('Imported ' + countsText(result.counts) + '.');
    }
  }

  // ---------- Rendering ----------

  function hasData() {
    const c = Calc.countData(state);
    return c.foods + c.recipes + c.entries > 0;
  }

  function renderBanner() {
    const stale = hasData() && Calc.isBackupStale(state.settings.lastBackup, Date.now());
    $('backup-banner').hidden = !(stale && BANNER_SCREENS.includes(currentScreen));
  }

  function renderSettings() {
    const last = state.settings.lastBackup;
    $('last-backup').textContent = last ? Calc.formatDate(Calc.dateKey(new Date(last))) : 'Never';
    $('data-counts').textContent = 'On this phone: ' + countsText(Calc.countData(state)) + '.';
    $('app-version').textContent = APP_VERSION;
  }

  function render() {
    renderSettings();
    renderBanner();
  }

  function showScreen(name) {
    currentScreen = name;
    document.querySelectorAll('.screen').forEach((el) => {
      el.hidden = el.dataset.screen !== name;
    });
    document.querySelectorAll('.tabbar [data-tab]').forEach((btn) => {
      if (btn.dataset.tab === name) {
        btn.setAttribute('aria-current', 'page');
      } else {
        btn.removeAttribute('aria-current');
      }
    });
    renderBanner();
    window.scrollTo(0, 0);
  }

  // ---------- Start ----------

  function init() {
    load();
    requestPersistence();

    document.querySelector('.tabbar').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tab]');
      if (btn) showScreen(btn.dataset.tab);
    });
    $('backup-banner').addEventListener('click', () => showScreen('settings'));
    $('export-btn').addEventListener('click', () => {
      exportData().catch((e) => showMessage('Export failed: ' + e.message, true));
    });
    $('import-btn').addEventListener('click', () => $('import-file').click());
    $('import-file').addEventListener('change', (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (file) importFile(file);
    });

    render();
  }

  // Exposed for later stages and console debugging.
  window.App = { get state() { return state; }, save, render, newId };

  init();
})();
