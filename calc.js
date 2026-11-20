// Pure calculation functions. No DOM, no storage, no side effects.
// Loaded as a classic script in the browser (window.Calc) and via require() in node.

(function () {
  'use strict';

  const Calc = {};

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Calc;
  } else {
    window.Calc = Calc;
  }
})();
