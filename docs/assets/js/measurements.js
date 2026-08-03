import { supabase } from './supabase-client.js';
import { parseTrfFile, buildRawMeasurementJson } from './trf-parser.js';
import { parseCsvFile } from './csv-parser.js';

export async function listMeasurements() {
  const { data, error } = await supabase
    .from('measurements')
    .select('id, file_name, measurement_name, trf_path, json_data, updated_at, sort_order')
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return data;
}

// 一覧の並び替え結果を全員共通の並び順としてDBへ保存する。
export async function updateMeasurementOrder(orderedIds) {
  const results = await Promise.all(
    orderedIds.map((id, index) =>
      supabase.from('measurements').update({ sort_order: index }).eq('id', id)
    )
  );
  const failed = results.find((r) => r.error);
  if (failed) throw failed.error;
}

async function nextSortOrder() {
  const { data, error } = await supabase
    .from('measurements')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data?.sort_order ?? -1) + 1;
}

function buildSourceStoragePath(extension) {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  return `${yyyy}/${mm}/${crypto.randomUUID()}.${extension}`;
}

async function uploadSourceFile(file, extension, contentType) {
  const path = buildSourceStoragePath(extension);
  const { error } = await supabase.storage.from('trf').upload(path, file, {
    contentType,
    upsert: false
  });

  if (error) throw error;
  return path;
}

async function removeTrfFile(path) {
  await supabase.storage.from('trf').remove([path]);
}

// 同じファイル名が既に存在する場合は上書きする。TRF/CSVいずれの形式も対応。
// 過去データは保持しない方針のため、置き換えられた古い測定ファイルは
// DB更新の成功を確認したうえでStorageから削除する。
export async function importMeasurementFile(file, uploadedBy) {
  const isCsv = file.name.toLowerCase().endsWith('.csv');
  const parsed = isCsv ? await parseCsvFile(file) : await parseTrfFile(file);
  const jsonData = buildRawMeasurementJson(parsed.rows);

  const { data: existing, error: lookupError } = await supabase
    .from('measurements')
    .select('id, trf_path')
    .eq('file_name', file.name)
    .maybeSingle();

  if (lookupError) throw lookupError;

  const trfPath = isCsv
    ? await uploadSourceFile(file, 'csv', 'text/csv')
    : await uploadSourceFile(file, 'trf', 'application/octet-stream');

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
        uploaded_by: uploadedBy,
        sort_order: await nextSortOrder()
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
