import { supabase } from './supabase-client.js';

export async function loginWithPassword(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function logout() {
  await supabase.auth.signOut();
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function requireAuth() {
  const session = await getSession();
  if (!session) {
    window.location.href = './index.html';
    return null;
  }
  return session;
}

export async function getCurrentProfile() {
  const session = await getSession();
  if (!session) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('role, display_name')
    .eq('id', session.user.id)
    .single();

  if (error) throw error;
  return data;
}
