import { supabase } from './supabase-client.js';
import { parseTrfFile, buildRawMeasurementJson } from './trf-parser.js';

export async function listMeasurements() {
  const { data, error } = await supabase
    .from('measurements')
    .select('id, file_name, measurement_name, trf_path, json_data, updated_at')
    .order('file_name', { ascending: true });

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

// 同じファイル名が既に存在する場合は上書きする。
// 過去データは保持しない方針のため、置き換えられた古いTRFファイルは
// DB更新の成功を確認したうえでStorageから削除する。
export async function importMeasurementFile(file, uploadedBy) {
  const parsed = await parseTrfFile(file);
  const jsonData = buildRawMeasurementJson(parsed.rows);

  const { data: existing, error: lookupError } = await supabase
    .from('measurements')
    .select('id, trf_path')
    .eq('file_name', file.name)
    .maybeSingle();

  if (lookupError) throw lookupError;

  const trfPath = await uploadTrfFile(file);

  try {
    if (existing) {
      const { error } = await supabase
        .from('measurements')
        .update({
          measurement_name: parsed.measurementName,
          trf_path: trfPath,
          json_data: jsonData,
          uploaded_by: uploadedBy
        })
        .eq('id', existing.id);

      if (error) throw error;

      await removeTrfFile(existing.trf_path);

      return {
        fileName: file.name,
        measurementName: parsed.measurementName,
        pointCount: parsed.rows.length,
        overwritten: true
      };
    }

    const { error } = await supabase
      .from('measurements')
      .insert({
        file_name: file.name,
        measurement_name: parsed.measurementName,
        trf_path: trfPath,
        json_data: jsonData,
        uploaded_by: uploadedBy
      });

    if (error) throw error;

    return {
      fileName: file.name,
      measurementName: parsed.measurementName,
      pointCount: parsed.rows.length,
      overwritten: false
    };
  } catch (error) {
    await removeTrfFile(trfPath);
    throw error;
  }
}

export async function deleteMeasurement(id, trfPath) {
  const { error } = await supabase.from('measurements').delete().eq('id', id);
  if (error) throw error;
  await removeTrfFile(trfPath);
}
