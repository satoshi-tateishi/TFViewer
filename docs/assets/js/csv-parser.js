// OpenSoundMeter（https://github.com/opensoundmeter）のCSVエクスポート形式。
// ヘッダーなし、列は Frequency,Magnitude(dB),Phase(deg),Coherence の順。
// DC成分などの無効値は"*"で表現される。

export async function parseCsvFile(file) {
  const text = await file.text();
  const rows = [];

  for (const line of text.split(/\r\n|\r|\n/)) {
    if (!line.trim()) continue;

    const [frequencyText, magnitudeText, , coherenceText] = line.split(',');
    const frequency = Number(frequencyText);
    const magnitude = Number(magnitudeText);
    const coherence = Number(coherenceText);

    if (!Number.isFinite(frequency) || !Number.isFinite(magnitude) || frequency <= 0) {
      continue;
    }

    rows.push({ frequency, magnitude, coherence: Number.isFinite(coherence) ? coherence : undefined });
  }

  if (rows.length === 0) {
    throw new Error('有効なFrequency/Magnitudeデータがありません。');
  }

  rows.sort((a, b) => a.frequency - b.frequency);

  return {
    measurementName: file.name.replace(/\.csv$/i, ''),
    sourceFileName: file.name,
    storedPointCount: rows.length,
    rows
  };
}
