// assets/js/supabaseClient.js — Satu-satunya tempat client Supabase dibuat.
// File lain cukup: import { supabase } from './supabaseClient.js';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

// Pengaman: tolak kunci rahasia (service_role / sb_secret_) di frontend.
function isSecretKey(key) {
  if (key.startsWith('sb_secret_')) return true;
  try { return JSON.parse(atob(key.split('.')[1])).role === 'service_role'; }
  catch { return false; }
}
if (isSecretKey(SUPABASE_ANON_KEY)) {
  throw new Error('Kunci rahasia terdeteksi di config.js. Pakai anon/publishable key saja.');
}

export const isConfigured =
  SUPABASE_URL.startsWith('https://') && !SUPABASE_ANON_KEY.startsWith('ISI_');

// Jika belum dikonfigurasi, pakai nilai sementara agar halaman tetap tampil
// dan bisa menampilkan pesan yang jelas (bukan layar kosong).
export const supabase = createClient(
  isConfigured ? SUPABASE_URL : 'https://belum-dikonfigurasi.supabase.co',
  isConfigured ? SUPABASE_ANON_KEY : 'belum-dikonfigurasi'
);
