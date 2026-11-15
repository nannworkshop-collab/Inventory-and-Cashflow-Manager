// assets/js/settings.js — Mengatur settings.html: ubah profil sendiri dan nama bisnis.
// Hak akses ditegakkan database (GRANT kolom + RLS di 003_rls.sql); tampilan hanya menyesuaikan.
import { initShell } from './shell.js';
import { supabase } from './supabaseClient.js';
import { $, showMessage, hideMessage, showToast, setLoading, friendlyError } from './utils.js';

let ctx = null;
const ROLE_LABEL = { owner: 'Pemilik', admin: 'Admin', staff: 'Staf' };
const message = $('#page-message');

async function loadProfile() {
  const { data, error } = await supabase.from('profiles').select('id,full_name,phone').eq('id', ctx.session.user.id).maybeSingle();
  if (error) throw error;
  $('#full_name').value = data?.full_name ?? '';
  $('#phone').value = data?.phone ?? '';
}

// Update yang ditolak RLS tidak menghasilkan error, hanya 0 baris -> kita periksa sendiri.
async function save(table, values, id, deniedText) {
  const { data, error } = await supabase.from(table).update(values).eq('id', id).select('id');
  if (error) throw error;
  if (data.length === 0) throw new Error(deniedText);
}

$('#profile-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  hideMessage(message);
  if (!ctx || !event.target.reportValidity()) return;
  const button = $('#profile-submit');
  setLoading(button, true, 'Menyimpan...');
  try {
    await save('profiles', { full_name: $('#full_name').value.trim(), phone: $('#phone').value.trim() || null },
      ctx.session.user.id, 'Profil tidak ditemukan.');
    showToast('Profil disimpan.');
  } catch (error) {
    showMessage(message, friendlyError(error));
  } finally {
    setLoading(button, false);
  }
});

$('#business-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  hideMessage(message);
  if (!ctx || !event.target.reportValidity()) return;
  const name = $('#business_name').value.trim();
  if (!name) { showMessage(message, 'Nama bisnis wajib diisi.'); return; }
  const button = $('#business-submit');
  setLoading(button, true, 'Menyimpan...');
  try {
    await save('businesses', { name }, ctx.business.id, 'Hanya pemilik atau admin yang boleh mengubah nama bisnis.');
    $('#business-name').textContent = name;
    showToast('Nama bisnis disimpan.');
  } catch (error) {
    showMessage(message, friendlyError(error));
  } finally {
    setLoading(button, false);
  }
});

(async function init() {
  ctx = await initShell();
  if (!ctx) return;
  $('#account-email').textContent = ctx.session.user.email;
  $('#account-role').textContent = ROLE_LABEL[ctx.business.role] || ctx.business.role;
  $('#business_name').value = ctx.business.name;
  if (!['owner', 'admin'].includes(ctx.business.role)) {
    $('#business_name').disabled = true;
    $('#business-submit').hidden = true;
    $('#business-note').hidden = false;
  }
  try { await loadProfile(); } catch (error) { showMessage(message, friendlyError(error)); }
})();
