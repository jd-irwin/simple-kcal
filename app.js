(function () {
  'use strict';

  const APP_VERSION = '0.0.1';

  function showScreen(name) {
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
    window.scrollTo(0, 0);
  }

  function init() {
    document.getElementById('app-version').textContent = APP_VERSION;
    document.querySelector('.tabbar').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tab]');
      if (btn) showScreen(btn.dataset.tab);
    });
  }

  init();
})();
