
// assets/js/auth.js

import { supabase } from './supabaseClient.js';

const PENDING_KEY = 'icm_pending_business';

// Mengambil session pengguna
export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

// Registrasi akun
export async function signUp(email, password, fullName) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo:
        'https://nannworkshop-collab.github.io/Inventory-and-Cashflow-Manager/login.html'
    }
  });

  if (error) throw error;
  return data;
}

// Login
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) throw error;
  return data;
}

// Logout
export async function signOut() {
  await supabase.auth.signOut();
  window.location.replace('login.html');
}

// Redirect jika sudah login
export async function redirectIfLoggedIn() {
  const session = await getSession();
  if (session) window.location.replace('dashboard.html');
  return session;
}

// Memastikan pengguna sudah login
export async function requireAuth() {
  const session = await getSession();

  if (!session) {
    window.location.replace('login.html');
    return null;
  }

  return session;
}

// Mengambil bisnis aktif
export async function getActiveBusiness(userId) {
  const { data, error } = await supabase
    .from('business_members')
    .select('role, businesses ( id, name )')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1);

  if (error) throw error;

  const row = data[0];

  return row
    ? {
        id: row.businesses.id,
        name: row.businesses.name,
        role: row.role
      }
    : null;
}

// Membuat bisnis
export async function createBusiness(name) {
  const { data, error } = await supabase.rpc(
    'create_business',
    { p_name: name }
  );

  if (error) throw error;
  return data;
}

// Menyimpan bisnis sementara
export function savePendingBusiness(name) {
  try {
    localStorage.setItem(PENDING_KEY, name);
  } catch {
    // Storage tidak tersedia
  }
}

// Mengklaim bisnis setelah login
async function claimPendingBusiness(userId) {
  let name = null;

  try {
    name = localStorage.getItem(PENDING_KEY);
  } catch {
    // Storage tidak tersedia
  }

  if (!name) return null;

  await createBusiness(name);

  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    // Storage tidak tersedia
  }

  return getActiveBusiness(userId);
}

// Memastikan pengguna punya bisnis
export async function requireBusiness() {
  const session = await requireAuth();
  if (!session) return null;

  let business = await getActiveBusiness(session.user.id);

  if (!business) {
    business = await claimPendingBusiness(session.user.id);
  }

  if (!business) {
    window.location.replace('register.html');
    return null;
  }

  return { session, business };
}
