import { supabase } from './supabase-client.js';

export const STATUS_OPTIONS = [
  { value: 'active', label: '稼働中' },
  { value: 'repair', label: '修理中' },
  { value: 'lending', label: '貸出中' },
  { value: 'retired', label: '廃棄' }
];

export function statusLabel(value) {
  return STATUS_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

export async function listMicrophoneHeads(filters = {}) {
  let query = supabase
    .from('microphone_head_summaries')
    .select('*')
    .order('management_number', { ascending: true });

  if (filters.managementNumber) {
    query = query.ilike('management_number', `%${filters.managementNumber}%`);
  }
  if (filters.manufacturer) {
    query = query.ilike('manufacturer', `%${filters.manufacturer}%`);
  }
  if (filters.model) {
    query = query.ilike('model', `%${filters.model}%`);
  }
  if (filters.status) {
    query = query.eq('status', filters.status);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getMicrophoneHead(id) {
  const { data, error } = await supabase
    .from('microphone_heads')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

export async function listMeasurementsForHead(id) {
  const { data, error } = await supabase
    .from('measurements')
    .select('id, measurement_name, measured_at, note, measurement_types(name)')
    .eq('microphone_head_id', id)
    .order('measured_at', { ascending: false });

  if (error) throw error;
  return data;
}

export async function createMicrophoneHead(input) {
  const { data, error } = await supabase
    .from('microphone_heads')
    .insert(input)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateMicrophoneHead(id, input) {
  const { data, error } = await supabase
    .from('microphone_heads')
    .update(input)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function softDeleteMicrophoneHead(id) {
  return updateMicrophoneHead(id, { deleted_at: new Date().toISOString() });
}
