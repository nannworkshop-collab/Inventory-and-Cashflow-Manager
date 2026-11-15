
import {
  getSession,
  getActiveBusiness,
  signUp,
  createBusiness,
  savePendingBusiness
} from './auth.js';

import { isConfigured } from './supabaseClient.js';

import {
  $,
  showMessage,
  hideMessage,
  setLoading,
  friendlyError
} from './utils.js';

const form = $('#register-form');
const message = $('#form-message');
const button = $('#submit-btn');

let session = null;

const debug = $('#debug-status');

if (debug) {
  debug.textContent = 'register.js berhasil dijalankan.';
  debug.style.color = 'green';
}

console.log('REGISTER.JS AKTIF');
console.log('FORM:', form);
console.log('SUPABASE CONFIGURED:', isConfigured);

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  console.log('EVENT SUBMIT TERPANGGIL');

  hideMessage(message);

  if (!form.reportValidity()) return;

  const businessName = form.elements.business_name.value.trim();

  if (!businessName) {
    showMessage(message, 'Nama bisnis wajib diisi.');
    return;
  }

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

      if (!data.session) {
        savePendingBusiness(businessName);
        form.reset();

        showMessage(
          message,
          'Pendaftaran berhasil. Cek emailmu untuk konfirmasi, lalu masuk.',
          'success'
        );

        return;
      }
    }

    await createBusiness(businessName);
    window.location.replace('index.html');

  } catch (error) {
    console.error('SIGNUP ERROR:', error);

    showMessage(
      message,
      `${error.name}: ${error.message}`
    );

  } finally {
    setLoading(button, false);
  }
});

(async function init() {
  if (!isConfigured) {
    showMessage(
      message,
      'Supabase belum dikonfigurasi. Isi assets/js/config.js terlebih dahulu.'
    );
    return;
  }

  try {
    session = await getSession();

    if (!session) return;

    if (await getActiveBusiness(session.user.id)) {
      window.location.replace('index.html');
      return;
    }

    const fields = $('#account-fields');
    fields.hidden = true;
    fields.disabled = true;

    $('#page-title').textContent = 'Buat bisnis';
    $('#page-subtitle').textContent =
      'Satu langkah lagi: beri nama bisnismu.';

    button.textContent = 'Buat bisnis';

  } catch (error) {
    showMessage(message, friendlyError(error));
  }
})();
