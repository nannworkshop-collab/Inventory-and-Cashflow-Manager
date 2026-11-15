// assets/js/login.js — Mengatur form di login.html. Bergantung pada: auth.js, utils.js, supabaseClient.js.
import { redirectIfLoggedIn, signIn } from './auth.js';
import { isConfigured } from './supabaseClient.js';
import { $, showMessage, hideMessage, setLoading, friendlyError } from './utils.js';

const form = $('#login-form');
const message = $('#form-message');
const button = $('#submit-btn');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideMessage(message);
  if (!form.reportValidity()) return;
  setLoading(button, true, 'Masuk...');
  try {
    await signIn(form.elements.email.value.trim(), form.elements.password.value);
    window.location.replace('dashboard.html');
  } catch (error) {
    showMessage(message, friendlyError(error));
  } finally {
    setLoading(button, false);
  }
});

(async function init() {
  if (!isConfigured) {
    showMessage(message, 'Supabase belum dikonfigurasi. Isi assets/js/config.js terlebih dahulu.');
    return;
  }
  try { await redirectIfLoggedIn(); } catch (error) { showMessage(message, friendlyError(error)); }
})();
