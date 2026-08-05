import { supabase } from './supabase-client.js';

// auth.usersのemailと結合するため、直接テーブルselectではなく
// security definer RPC（呼び出し元がAdminであることをDB側で検証済み）を使う。
export async function listUsers() {
  const { data, error } = await supabase.rpc('admin_list_users');
  if (error) throw error;
  return data;
}

export async function updateUserRole(id, role) {
  const { error } = await supabase.from('profiles').update({ role }).eq('id', id);
  if (error) throw error;
}

export async function setUserDisabled(id, disabled) {
  const { error } = await supabase.from('profiles').update({ disabled }).eq('id', id);
  if (error) throw error;
}
