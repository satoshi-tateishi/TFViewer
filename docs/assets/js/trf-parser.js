// sample/GAS.js（Smaart TRF Importer for Google Sheets）のパース/平滑化ロジックを
// ブラウザのFile API / DataView向けに移植したもの。
// 対応TRF形式:
// - 識別子: JACKREF!
// - ヘッダー: 612 bytes
// - Frequency: Float32 Little Endian
// - Magnitude/Real/Imaginary/Coherence: Float64 Little Endian

export const DEFAULT_SMOOTHING_FRACTION = 3;

const SIGNATURE = 'JACKREF!';
const SIGNATURE_OFFSET = 0;
const SIGNATURE_LENGTH = 8;

const MEASUREMENT_NAME_OFFSET = 40;
const MEASUREMENT_NAME_LENGTH = 44;

const FREQUENCY_OFFSET = 612;

// Frequency 4 + Magnitude 8 + Real 8 + Imaginary 8 + Coherence 8 = 36 bytes/point
const BYTES_PER_POINT_TOTAL = 36;

const INVALID_MAGNITUDE = 1234.5678;

export async function parseTrfFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());

  if (bytes.length <= FREQUENCY_OFFSET) {
    throw new Error(`ファイルサイズが小さすぎます: ${bytes.length} bytes`);
  }

  const signature = readAscii(bytes, SIGNATURE_OFFSET, SIGNATURE_LENGTH);
  if (signature !== SIGNATURE) {
    throw new Error(`未対応のTRF形式です。識別子: "${signature}"`);
  }

  const measurementName = readAscii(bytes, MEASUREMENT_NAME_OFFSET, MEASUREMENT_NAME_LENGTH).trim();
  if (!measurementName) {
    throw new Error('TRFファイルから測定名を取得できませんでした。');
  }

  const dataBytes = bytes.length - FREQUENCY_OFFSET;
  if (dataBytes <= 0 || dataBytes % BYTES_PER_POINT_TOTAL !== 0) {
    throw new Error(`TRFファイルのデータ長が想定形式と一致しません。ファイルサイズ: ${bytes.length} bytes`);
  }

  const pointCount = dataBytes / BYTES_PER_POINT_TOTAL;
  if (!Number.isInteger(pointCount) || pointCount < 10 || pointCount > 100000) {
    throw new Error(`不正なデータ点数です: ${pointCount}`);
  }

  const frequencyOffset = FREQUENCY_OFFSET;
  const magnitudeOffset = frequencyOffset + pointCount * 4;
  const realOffset = magnitudeOffset + pointCount * 8;
  const imaginaryOffset = realOffset + pointCount * 8;
  const coherenceOffset = imaginaryOffset + pointCount * 8;
  const expectedEndOffset = coherenceOffset + pointCount * 8;

  if (expectedEndOffset !== bytes.length) {
    throw new Error('TRFデータ配列の終端がファイルサイズと一致しません。');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const rows = [];
  let previousStoredFrequency = -Infinity;

  for (let i = 0; i < pointCount; i++) {
    const frequency = view.getFloat32(frequencyOffset + i * 4, true);
    const magnitude = view.getFloat64(magnitudeOffset + i * 8, true);
    const coherence = view.getFloat64(coherenceOffset + i * 8, true);

    if (!Number.isFinite(frequency) || !Number.isFinite(magnitude)) {
      continue;
    }

    // 周波数配列が逆行する場合、未対応形式の可能性があるため停止する。
    if (frequency > 0 && frequency < previousStoredFrequency) {
      throw new Error(`周波数配列が昇順ではありません。 index=${i}`);
    }
    if (frequency > 0) {
      previousStoredFrequency = frequency;
    }

    if (frequency <= 0 || isInvalidMagnitude(magnitude)) {
      continue;
    }

    rows.push({ frequency, magnitude, coherence: Number.isFinite(coherence) ? coherence : undefined });
  }

  if (rows.length === 0) {
    throw new Error('有効なFrequency/Magnitudeデータがありません。');
  }

  rows.sort((a, b) => a.frequency - b.frequency);

  return {
    measurementName,
    sourceFileName: file.name,
    storedPointCount: pointCount,
    rows
  };
}

// 中心周波数fに対して [f * 2^(-1/2N), f * 2^(1/2N)] の範囲のMagnitudeを算術平均する。
// fraction=6 なら 1/6 octave smoothing。
export function smoothFractionalOctave(rows, fraction = DEFAULT_SMOOTHING_FRACTION) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }
  if (!Number.isFinite(fraction) || fraction <= 0) {
    throw new Error(`平滑化分母が不正です: ${fraction}`);
  }

  const sortedRows = rows
    .filter((row) => Number.isFinite(row.frequency) && Number.isFinite(row.magnitude) && row.frequency > 0)
    .slice()
    .sort((a, b) => a.frequency - b.frequency);

  if (sortedRows.length === 0) {
    return [];
  }

  const lowerRatio = Math.pow(2, -1 / (2 * fraction));
  const upperRatio = Math.pow(2, 1 / (2 * fraction));

  const prefixSums = new Array(sortedRows.length + 1);
  prefixSums[0] = 0;
  for (let i = 0; i < sortedRows.length; i++) {
    prefixSums[i + 1] = prefixSums[i] + sortedRows[i].magnitude;
  }

  const smoothedRows = [];
  let leftIndex = 0;
  let rightIndex = 0;

  for (let centerIndex = 0; centerIndex < sortedRows.length; centerIndex++) {
    const centerFrequency = sortedRows[centerIndex].frequency;
    const lowerFrequency = centerFrequency * lowerRatio;
    const upperFrequency = centerFrequency * upperRatio;

    while (leftIndex < sortedRows.length && sortedRows[leftIndex].frequency < lowerFrequency) {
      leftIndex++;
    }
    if (rightIndex < leftIndex) {
      rightIndex = leftIndex;
    }
    while (rightIndex < sortedRows.length && sortedRows[rightIndex].frequency <= upperFrequency) {
      rightIndex++;
    }

    const smoothingPointCount = rightIndex - leftIndex;
    const smoothedMagnitude = smoothingPointCount > 0
      ? (prefixSums[rightIndex] - prefixSums[leftIndex]) / smoothingPointCount
      : sortedRows[centerIndex].magnitude;

    smoothedRows.push({
      frequency: centerFrequency,
      rawMagnitude: sortedRows[centerIndex].magnitude,
      smoothedMagnitude,
      smoothingPointCount,
      coherence: sortedRows[centerIndex].coherence
    });
  }

  return smoothedRows;
}

// 帯域内平均をlog周波数軸上の台形積分で計算する。線形周波数間隔のデータは
// 高域ほど点密度が高くなるため、単純な算術平均だと高域に偏った値になる。
// 各点の重みを隣接点とのlog周波数間隔に比例させることで、点密度に依存しない
// 帯域平均レベルを得る。
export function logWeightedBandAverage(rows, lowFrequency, highFrequency) {
  const inBand = rows
    .filter((row) => Number.isFinite(row.frequency) && Number.isFinite(row.magnitude)
      && row.frequency >= lowFrequency && row.frequency <= highFrequency)
    .sort((a, b) => a.frequency - b.frequency);

  if (inBand.length === 0) return null;
  if (inBand.length === 1) return inBand[0].magnitude;

  const logFrequencies = inBand.map((row) => Math.log(row.frequency));
  let weightedSum = 0;
  let totalWeight = 0;

  inBand.forEach((row, index) => {
    const prevLogFrequency = index > 0 ? logFrequencies[index - 1] : logFrequencies[index];
    const nextLogFrequency = index < inBand.length - 1 ? logFrequencies[index + 1] : logFrequencies[index];
    const weight = (nextLogFrequency - prevLogFrequency) / 2;
    weightedSum += row.magnitude * weight;
    totalWeight += weight;
  });

  return totalWeight > 0 ? weightedSum / totalWeight : inBand[0].magnitude;
}

const SUMMARY_FRACTION = 6;

// 一覧表示・帯域平均フィルター用の軽量な要約データを作る。
// フル解像度（1測定あたり1万点超）を毎回全件配信すると通信量が大きくなるため、
// 対数周波数軸上で1/6 oct間隔に間引いた点（1測定あたり数十点）だけを保存する。
// フル解像度データは、グラフ表示のためにチェックを入れた測定だけ別途取得する。
export function buildSummarySeries(rows, fraction = SUMMARY_FRACTION) {
  const sortedRows = rows
    .filter((row) => Number.isFinite(row.frequency) && Number.isFinite(row.magnitude) && row.frequency > 0)
    .slice()
    .sort((a, b) => a.frequency - b.frequency);

  if (sortedRows.length === 0) {
    return { frequency: [], magnitude: [] };
  }

  const lowerRatio = Math.pow(2, -1 / (2 * fraction));
  const upperRatio = Math.pow(2, 1 / (2 * fraction));
  const stepRatio = Math.pow(2, 1 / fraction);

  const minFrequency = sortedRows[0].frequency;
  const maxFrequency = sortedRows[sortedRows.length - 1].frequency;

  const centerFrequencies = [];
  for (let f = minFrequency; f < maxFrequency; f *= stepRatio) {
    centerFrequencies.push(f);
  }
  centerFrequencies.push(maxFrequency);

  const frequency = [];
  const magnitude = [];
  let leftIndex = 0;
  let rightIndex = 0;

  centerFrequencies.forEach((centerFrequency) => {
    const lowerFrequency = centerFrequency * lowerRatio;
    const upperFrequency = centerFrequency * upperRatio;

    while (leftIndex < sortedRows.length && sortedRows[leftIndex].frequency < lowerFrequency) {
      leftIndex++;
    }
    if (rightIndex < leftIndex) {
      rightIndex = leftIndex;
    }
    while (rightIndex < sortedRows.length && sortedRows[rightIndex].frequency <= upperFrequency) {
      rightIndex++;
    }

    const count = rightIndex - leftIndex;
    if (count > 0) {
      let sum = 0;
      for (let i = leftIndex; i < rightIndex; i++) {
        sum += sortedRows[i].magnitude;
      }
      frequency.push(centerFrequency);
      magnitude.push(sum / count);
    }
  });

  return { frequency, magnitude };
}

// 保存用JSON。平滑化は表示側でグローバル設定に応じて都度計算するため、
// ここではraw値のみを保持する。コヒーレンスは全点で取得できた場合のみ保存する
// （欠けている形式・データでは閾値フィルタを適用しないため）。
export function buildRawMeasurementJson(rows) {
  const json = {
    frequency: rows.map((row) => row.frequency),
    magnitude_raw: rows.map((row) => row.magnitude)
  };

  if (rows.every((row) => Number.isFinite(row.coherence))) {
    json.coherence = rows.map((row) => row.coherence);
  }

  return json;
}

export function rowsFromMeasurementJson(jsonData) {
  return jsonData.frequency.map((frequency, index) => ({
    frequency,
    magnitude: jsonData.magnitude_raw[index],
    coherence: jsonData.coherence ? jsonData.coherence[index] : undefined
  }));
}

function readAscii(bytes, offset, maxLength) {
  const chars = [];
  for (let i = 0; i < maxLength; i++) {
    const position = offset + i;
    if (position >= bytes.length) break;
    const value = bytes[position];
    if (value === 0) break;
    chars.push(String.fromCharCode(value));
  }
  return chars.join('');
}

function isInvalidMagnitude(value) {
  return Math.abs(value - INVALID_MAGNITUDE) < 0.0001;
}
