import { supabase } from './supabase-client.js';

export async function listActiveMicrophoneHeadsForSelect() {
  const { data, error } = await supabase
    .from('microphone_heads')
    .select('id, management_number, manufacturer, model')
    .is('deleted_at', null)
    .order('management_number', { ascending: true });

  if (error) throw error;
  return data;
}

export async function listMeasurementTypes() {
  const { data, error } = await supabase
    .from('measurement_types')
    .select('id, name')
    .order('name', { ascending: true });

  if (error) throw error;
  return data;
}

function buildTrfStoragePath() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  return `${yyyy}/${mm}/${crypto.randomUUID()}.trf`;
}

async function uploadTrfFile(file) {
  const path = buildTrfStoragePath();
  const { error } = await supabase.storage.from('trf').upload(path, file, {
    contentType: 'application/octet-stream',
    upsert: false
  });

  if (error) throw error;
  return path;
}

async function removeTrfFile(path) {
  await supabase.storage.from('trf').remove([path]);
}

// Storageへのアップロード後にDB登録が失敗した場合、
// アップロード済みファイルを削除してロールバックする。
export async function registerMeasurement({
  microphoneHeadId,
  measurementTypeId,
  measurementName,
  measuredAt,
  measuredBy,
  note,
  smoothingFraction,
  jsonData,
  file
}) {
  const trfPath = await uploadTrfFile(file);

  try {
    const { data, error } = await supabase
      .from('measurements')
      .insert({
        microphone_head_id: microphoneHeadId,
        measurement_type_id: measurementTypeId,
        measurement_name: measurementName,
        measured_at: measuredAt,
        measured_by: measuredBy,
        trf_path: trfPath,
        original_file_name: file.name,
        smoothing_fraction: smoothingFraction,
        json_data: jsonData,
        note
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    await removeTrfFile(trfPath);
    throw error;
  }
}
