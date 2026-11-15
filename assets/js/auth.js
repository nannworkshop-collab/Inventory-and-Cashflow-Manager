// assets/js/auth.js — Login, registrasi, session, dan konteks bisnis aktif.
// Dipakai oleh: login.js, register.js, dan semua halaman yang dilindungi (lewat requireBusiness).

import { supabase } from './supabaseClient.js';

const PENDING_KEY = 'icm_pending_business';

export async function signUp(email, password, fullName) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo:
        'https://nannworkshop-collab.github.io/Inventory-and-Cashflow-Manager/login.html'
    },
  });

  if (error) throw error;
  return data;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) throw error;
  return data;
}



// Jika konfirmasi email aktif di Supabase, data.session = null sampai email dikonfirmasi.
export async function signUp(email, password, fullName) {
  const { data, error } = await supabase.auth.signUp({
    email, password, options: { data: { full_name: fullName } },
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  await supabase.auth.signOut();
  window.location.replace('login.html');
}

export async function redirectIfLoggedIn() {
  const session = await getSession();
  if (session) window.location.replace('dashboard.html');
  return session;
}

export async function requireAuth() {
  const session = await getSession();
  if (!session) { window.location.replace('login.html'); return null; }
  return session;
}

// Bisnis pertama milik user yang sedang login (nanti bisa dikembangkan: pilih bisnis).
export async function getActiveBusiness(userId) {
  const { data, error } = await supabase
    .from('business_members')
    .select('role, businesses ( id, name )')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1);
  if (error) throw error;
  const row = data[0];
  return row ? { id: row.businesses.id, name: row.businesses.name, role: row.role } : null;
}

export async function createBusiness(name) {
  const { data, error } = await supabase.rpc('create_business', { p_name: name });
  if (error) throw error;
  return data; // uuid bisnis baru
}

// Nama bisnis disimpan sementara jika user harus konfirmasi email dulu.
export function savePendingBusiness(name) {
  try { localStorage.setItem(PENDING_KEY, name); } catch { /* storage diblokir: diabaikan */ }
}
async function claimPendingBusiness(userId) {
  let name = null;
  try { name = localStorage.getItem(PENDING_KEY); } catch { /* diabaikan */ }
  if (!name) return null;
  await createBusiness(name);
  try { localStorage.removeItem(PENDING_KEY); } catch { /* diabaikan */ }
  return getActiveBusiness(userId);
}

// Pintu masuk semua halaman yang dilindungi. Mengembalikan { session, business } atau null (sudah di-redirect).
export async function requireBusiness() {
  const session = await requireAuth();
  if (!session) return null;
  let business = await getActiveBusiness(session.user.id);
  if (!business) business = await claimPendingBusiness(session.user.id);
  if (!business) { window.location.replace('register.html'); return null; }
  return { session, business };
}
