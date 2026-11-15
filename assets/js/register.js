// assets/js/register.js — Mengatur form di register.html (akun + bisnis pertama).
// Dua mode: (1) belum login -> daftar akun + buat bisnis; (2) sudah login tapi belum punya bisnis -> hanya buat bisnis.
import { getSession, getActiveBusiness, signUp, createBusiness, savePendingBusiness } from './auth.js';
import { isConfigured } from './supabaseClient.js';
import { $, showMessage, hideMessage, setLoading, friendlyError } from './utils.js';

const form = $('#register-form');
const message = $('#form-message');
const button = $('#submit-btn');
let session = null;
console.log('REGISTER.JS AKTIF');

form.addEventListener('submit', () => {
  alert('EVENT SUBMIT TERPANGGIL');
});

const debug = $('#debug-status');

if (debug) {
  debug.textContent = 'register.js berhasil dijalankan.';
  debug.style.color = 'green';
}

console.log('REGISTER SCRIPT LOADED');
console.log('FORM:', form);
console.log('MESSAGE:', message);
console.log('SUPABASE CONFIGURED:', isConfigured);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideMessage(message);
  if (!form.reportValidity()) return;
  const businessName = form.elements.business_name.value.trim();
  if (!businessName) { showMessage(message, 'Nama bisnis wajib diisi.'); return; }
  setLoading(button, true);
  try {
    if (!session) {
      console.log('MULAI SIGNUP');

const data = await signUp(
  form.elements.email.value.trim(),
  form.elements.password.value,
  form.elements.full_name.value.trim()
);

console.log('SIGNUP BERHASIL:', data);
        console.log('SIGNUP RESULT:', data);
        console.log('SESSION:', data.session);
      if (!data.session) { // konfirmasi email aktif
        savePendingBusiness(businessName);
        form.reset();
        showMessage(message, 'Pendaftaran berhasil. Cek emailmu untuk konfirmasi, lalu masuk.', 'success');
        return;
      }
    }
    await createBusiness(businessName);
    window.location.replace('index.html');
  } } catch (error) {
  console.error('SIGNUP ERROR:', error);
  showMessage(
    message,
    `${error.name}: ${error.message}`
  );
}
  } finally {
    setLoading(button, false);
  }
});

(async function init() {
  if (!isConfigured) {
    showMessage(message, 'Supabase belum dikonfigurasi. Isi assets/js/config.js terlebih dahulu.');
    return;
  }
  try {
    session = await getSession();
    if (!session) return;
    if (await getActiveBusiness(session.user.id)) { window.location.replace('index.html'); return; }
    const fields = $('#account-fields');
    fields.hidden = true;
    fields.disabled = true; // field yang disabled dilewati validasi
    $('#page-title').textContent = 'Buat bisnis';
    $('#page-subtitle').textContent = 'Satu langkah lagi: beri nama bisnismu.';
    button.textContent = 'Buat bisnis';
  } catch (error) { showMessage(message, friendlyError(error)); }
})();
