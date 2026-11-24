// Messages: the load error, Settings messages and the toast with optional Undo.

import { $ } from './dom.js';

const TOAST_MS = 5000;

export function showLoadError(text) {
  const node = $('load-error');
  node.textContent = text;
  node.hidden = false;
}

export function showMessage(text, isError) {
  const node = $('settings-message');
  node.textContent = text;
  node.classList.toggle('error', !!isError);
  node.hidden = false;
}

export function clearMessage() {
  $('settings-message').hidden = true;
}

let toastTimer = null;
let toastUndo = null;

export function toast(text, undo) {
  clearTimeout(toastTimer);
  $('toast-text').textContent = text;
  toastUndo = undo || null;
  $('toast-undo').hidden = !undo;
  $('toast').hidden = false;
  toastTimer = setTimeout(hideToast, TOAST_MS);
}

function hideToast() {
  clearTimeout(toastTimer);
  $('toast').hidden = true;
  toastUndo = null;
}

export function init() {
  $('toast-undo').addEventListener('click', () => {
    const undo = toastUndo;
    hideToast();
    if (undo) undo();
  });
}
