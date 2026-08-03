/**
 * Smaart TRF Importer for Google Sheets
 *
 * 機能:
 * 1. Google Driveフォルダ内の.trfファイルを一括読み込み
 * 2. TRF内部の測定名ごとに専用シートを作成
 * 3. 同名の測定シートがある場合は上書き
 * 4. Magnitudeを1/N octaveで平滑化
 * 5. 表示チェックがONの測定だけをグラフ化
 * 6. チェック変更時にグラフを自動更新
 *
 * 対応TRF形式:
 * - 識別子: JACKREF!
 * - ヘッダー: 612 bytes
 * - Frequency: Float32 Little Endian
 * - Magnitude: Float64 Little Endian
 * - Real: Float64 Little Endian
 * - Imaginary: Float64 Little Endian
 * - Coherence: Float64 Little Endian
 *
 * このコードは、今回確認したSmaart TRF形式を基準にしています。
 */


/* =========================================================
 * 設定
 * ======================================================= */

const CONFIG = {
  SETTINGS_SHEET: '設定',
  GRAPH_DATA_SHEET: 'グラフデータ',
  GRAPH_SHEET: '周波数特性グラフ',

  // 設定シート内のセル
  FOLDER_ID_CELL: 'B2',
  MIN_FREQUENCY_CELL: 'B3',
  MAX_FREQUENCY_CELL: 'B4',
  CHART_MIN_DB_CELL: 'B5',
  CHART_MAX_DB_CELL: 'B6',
  SMOOTHING_FRACTION_CELL: 'B7',

  // TRFバイナリ形式
  SIGNATURE: 'JACKREF!',
  SIGNATURE_OFFSET: 0,
  SIGNATURE_LENGTH: 8,

  MEASUREMENT_NAME_OFFSET: 40,
  MEASUREMENT_NAME_LENGTH: 44,

  FREQUENCY_OFFSET: 612,

  /*
   * 1データ点あたりの総バイト数
   *
   * Frequency   4 bytes
   * Magnitude   8 bytes
   * Real        8 bytes
   * Imaginary   8 bytes
   * Coherence   8 bytes
   *
   * 合計       36 bytes
   */
  BYTES_PER_POINT_TOTAL: 36,

  INVALID_MAGNITUDE: 1234.5678,

  // 初期設定値
  DEFAULT_MIN_FREQUENCY: 20,
  DEFAULT_MAX_FREQUENCY: 20000,
  DEFAULT_CHART_MIN_DB: -18,
  DEFAULT_CHART_MAX_DB: 18,
  DEFAULT_SMOOTHING_FRACTION: 6,

  // グラフサイズ
  CHART_WIDTH: 1800,
  CHART_HEIGHT: 650,

  // 周波数特性グラフシート内の配置
  GRAPH_LIST_HEADER_ROW: 4,
  GRAPH_LIST_START_ROW: 5,
  GRAPH_LIST_NAME_COLUMN: 1,   // A列
  GRAPH_LIST_CHECK_COLUMN: 2,  // B列

  GRAPH_CHART_ROW: 5,
  GRAPH_CHART_COLUMN: 3        // C列
};


const SYSTEM_SHEETS = new Set([
  CONFIG.SETTINGS_SHEET,
  CONFIG.GRAPH_DATA_SHEET,
  CONFIG.GRAPH_SHEET
]);


/* =========================================================
 * メニュー
 * ======================================================= */

/**
 * スプレッドシートを開いたときにメニューを追加します。
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Smaart TRF')
    .addItem(
      '初期設定シートを作成・更新',
      'setupSmaartImporter'
    )
    .addSeparator()
    .addItem(
      'TRFファイルを一括インポート',
      'importAllTrfFiles'
    )
    .addItem(
      'グラフを再構築',
      'rebuildAllGraphData'
    )
    .addSeparator()
    .addItem(
      'すべて表示',
      'enableAllMeasurements'
    )
    .addItem(
      'すべて非表示',
      'disableAllMeasurements'
    )
    .addToUi();
}


/* =========================================================
 * 初期設定
 * ======================================================= */

/**
 * 設定シートとシステム用シートを作成・更新します。
 *
 * 既存の設定値は可能な限り保持します。
 */
function setupSmaartImporter() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let settingsSheet =
    ss.getSheetByName(CONFIG.SETTINGS_SHEET);

  if (!settingsSheet) {
    settingsSheet =
      ss.insertSheet(CONFIG.SETTINGS_SHEET);
  }

  const existingFolderId = String(
    settingsSheet
      .getRange(CONFIG.FOLDER_ID_CELL)
      .getDisplayValue()
  ).trim();

  const existingMinFrequency = Number(
    settingsSheet
      .getRange(CONFIG.MIN_FREQUENCY_CELL)
      .getValue()
  );

  const existingMaxFrequency = Number(
    settingsSheet
      .getRange(CONFIG.MAX_FREQUENCY_CELL)
      .getValue()
  );

  const existingChartMinDb = Number(
    settingsSheet
      .getRange(CONFIG.CHART_MIN_DB_CELL)
      .getValue()
  );

  const existingChartMaxDb = Number(
    settingsSheet
      .getRange(CONFIG.CHART_MAX_DB_CELL)
      .getValue()
  );

  const existingSmoothingFraction = Number(
    settingsSheet
      .getRange(CONFIG.SMOOTHING_FRACTION_CELL)
      .getValue()
  );

  settingsSheet.clear();

  const settingsValues = [
    ['項目', '設定値'],
    [
      'TRF保存フォルダIDまたはURL',
      existingFolderId
    ],
    [
      '最低周波数',
      isFinitePositive_(existingMinFrequency)
        ? existingMinFrequency
        : CONFIG.DEFAULT_MIN_FREQUENCY
    ],
    [
      '最高周波数',
      isFinitePositive_(existingMaxFrequency)
        ? existingMaxFrequency
        : CONFIG.DEFAULT_MAX_FREQUENCY
    ],
    [
      'グラフ最小dB',
      Number.isFinite(existingChartMinDb)
        ? existingChartMinDb
        : CONFIG.DEFAULT_CHART_MIN_DB
    ],
    [
      'グラフ最大dB',
      Number.isFinite(existingChartMaxDb)
        ? existingChartMaxDb
        : CONFIG.DEFAULT_CHART_MAX_DB
    ],
    [
      '平滑化分母',
      isFinitePositive_(existingSmoothingFraction)
        ? existingSmoothingFraction
        : CONFIG.DEFAULT_SMOOTHING_FRACTION
    ],
    [
      '平滑化の例',
      '6を指定すると1/6 octave'
    ],
    [
      '注意',
      'グラフの平滑線とは別に、Magnitudeデータ自体を平滑化します。'
    ]
  ];

  settingsSheet
    .getRange(
      1,
      1,
      settingsValues.length,
      2
    )
    .setValues(settingsValues);

  settingsSheet
    .getRange('A1:B1')
    .setFontWeight('bold')
    .setBackground('#d9ead3');

  settingsSheet
    .getRange('A2:A9')
    .setFontWeight('bold');

  settingsSheet.setFrozenRows(1);
  settingsSheet.setColumnWidth(1, 240);
  settingsSheet.setColumnWidth(2, 520);

  if (!ss.getSheetByName(CONFIG.GRAPH_DATA_SHEET)) {
    ss.insertSheet(CONFIG.GRAPH_DATA_SHEET);
  }

  if (!ss.getSheetByName(CONFIG.GRAPH_SHEET)) {
    ss.insertSheet(CONFIG.GRAPH_SHEET);
  }

  syncGraphSeriesChecklist_(ss);

  SpreadsheetApp.getUi().alert(
    '初期設定シートを作成・更新しました。\n\n' +
    '設定シートのB2に、TRFファイルを保存している' +
    'Google DriveフォルダのIDまたはURLを入力してください。'
  );
}


/* =========================================================
 * TRF一括インポート
 * ======================================================= */

/**
 * 指定フォルダ内のすべての.trfファイルを
 * 一括インポートします。
 */
function importAllTrfFiles() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const settings = getSettings_();

  const folder =
    DriveApp.getFolderById(settings.folderId);

  const files = folder.getFiles();

  const results = [];
  const errors = [];

  let trfFileCount = 0;

  while (files.hasNext()) {
    const file = files.next();
    const fileName = file.getName();

    if (!fileName.toLowerCase().endsWith('.trf')) {
      continue;
    }

    trfFileCount++;

    try {
      const parsed = parseTrfFile_(file);

      const smoothedRows =
        smoothFractionalOctave_(
          parsed.rows,
          settings.smoothingFraction
        );

      writeMeasurementSheet_(
        ss,
        parsed,
        smoothedRows,
        fileName,
        settings.smoothingFraction
      );

      results.push({
        fileName,
        measurementName: parsed.measurementName,
        storedPointCount: parsed.storedPointCount,
        validPointCount: parsed.rows.length
      });

    } catch (error) {
      errors.push(
        `${fileName}: ${getErrorMessage_(error)}`
      );
    }
  }

  if (trfFileCount === 0) {
    throw new Error(
      '指定フォルダ内に.trfファイルがありません。'
    );
  }

  if (results.length > 0) {
    /*
     * 既存測定のチェック状態を維持し、
     * 新規測定をチェックONで追加する。
     */
    syncGraphSeriesChecklist_(ss);

    rebuildGraphData_(
      ss,
      settings.minFrequency,
      settings.maxFrequency
    );

    rebuildFrequencyResponseChart_(
      ss,
      settings
    );
  }

  showImportResult_(results, errors);
}


/* =========================================================
 * TRFバイナリ解析
 * ======================================================= */

/**
 * TRFファイルから、
 * 測定名・Frequency・Magnitudeを取得します。
 */
function parseTrfFile_(file) {
  const signedBytes =
    file.getBlob().getBytes();

  /*
   * Apps ScriptのByte[]は符号付きになるため、
   * 0～255のUint8Arrayへ変換する。
   */
  const bytes = new Uint8Array(
    signedBytes.map(value =>
      value < 0 ? value + 256 : value
    )
  );

  if (bytes.length <= CONFIG.FREQUENCY_OFFSET) {
    throw new Error(
      `ファイルサイズが小さすぎます: ` +
      `${bytes.length} bytes`
    );
  }

  const signature = readAscii_(
    bytes,
    CONFIG.SIGNATURE_OFFSET,
    CONFIG.SIGNATURE_LENGTH
  );

  if (signature !== CONFIG.SIGNATURE) {
    throw new Error(
      `未対応のTRF形式です。識別子: "${signature}"`
    );
  }

  const measurementName = readAscii_(
    bytes,
    CONFIG.MEASUREMENT_NAME_OFFSET,
    CONFIG.MEASUREMENT_NAME_LENGTH
  ).trim();

  if (!measurementName) {
    throw new Error(
      'TRFファイルから測定名を取得できませんでした。'
    );
  }

  /*
   * ファイルサイズ:
   *
   * 612 + データ点数 × 36
   */
  const dataBytes =
    bytes.length - CONFIG.FREQUENCY_OFFSET;

  if (
    dataBytes <= 0 ||
    dataBytes %
      CONFIG.BYTES_PER_POINT_TOTAL !== 0
  ) {
    throw new Error(
      'TRFファイルのデータ長が' +
      '想定形式と一致しません。' +
      ` ファイルサイズ: ${bytes.length} bytes`
    );
  }

  const pointCount =
    dataBytes /
    CONFIG.BYTES_PER_POINT_TOTAL;

  if (
    !Number.isInteger(pointCount) ||
    pointCount < 10 ||
    pointCount > 100000
  ) {
    throw new Error(
      `不正なデータ点数です: ${pointCount}`
    );
  }

  const frequencyOffset =
    CONFIG.FREQUENCY_OFFSET;

  const magnitudeOffset =
    frequencyOffset +
    pointCount * 4;

  const realOffset =
    magnitudeOffset +
    pointCount * 8;

  const imaginaryOffset =
    realOffset +
    pointCount * 8;

  const coherenceOffset =
    imaginaryOffset +
    pointCount * 8;

  const expectedEndOffset =
    coherenceOffset +
    pointCount * 8;

  if (expectedEndOffset !== bytes.length) {
    throw new Error(
      'TRFデータ配列の終端が' +
      'ファイルサイズと一致しません。'
    );
  }

  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength
  );

  const rows = [];

  let previousStoredFrequency =
    -Infinity;

  for (let i = 0; i < pointCount; i++) {
    const frequency =
      view.getFloat32(
        frequencyOffset + i * 4,
        true
      );

    const magnitude =
      view.getFloat64(
        magnitudeOffset + i * 8,
        true
      );

    if (!Number.isFinite(frequency)) {
      continue;
    }

    if (!Number.isFinite(magnitude)) {
      continue;
    }

    /*
     * 周波数配列が逆行する場合、
     * 未対応形式の可能性があるため停止する。
     */
    if (
      frequency > 0 &&
      frequency < previousStoredFrequency
    ) {
      throw new Error(
        `周波数配列が昇順ではありません。` +
        ` index=${i}`
      );
    }

    if (frequency > 0) {
      previousStoredFrequency =
        frequency;
    }

    if (frequency <= 0) {
      continue;
    }

    if (isInvalidMagnitude_(magnitude)) {
      continue;
    }

    rows.push({
      frequency,
      magnitude
    });
  }

  if (rows.length === 0) {
    throw new Error(
      '有効なFrequency/Magnitudeデータがありません。'
    );
  }

  rows.sort(
    (a, b) =>
      a.frequency - b.frequency
  );

  return {
    measurementName,
    sourceFileName: file.getName(),
    sourceFileId: file.getId(),
    storedPointCount: pointCount,
    rows
  };
}


/* =========================================================
 * Fractional Octave Smoothing
 * ======================================================= */

/**
 * Magnitudeを1/N octave幅で平滑化します。
 *
 * fraction = 6:
 * 1/6 octave smoothing
 *
 * 中心周波数fに対して、
 *
 * 下限 = f × 2^(-1 / (2N))
 * 上限 = f × 2^( 1 / (2N))
 *
 * の範囲に含まれるMagnitudeのdB値を
 * 算術平均します。
 */
function smoothFractionalOctave_(
  rows,
  fraction
) {
  if (
    !Array.isArray(rows) ||
    rows.length === 0
  ) {
    return [];
  }

  if (
    !Number.isFinite(fraction) ||
    fraction <= 0
  ) {
    throw new Error(
      `平滑化分母が不正です: ${fraction}`
    );
  }

  const sortedRows = rows
    .filter(row =>
      Number.isFinite(row.frequency) &&
      Number.isFinite(row.magnitude) &&
      row.frequency > 0
    )
    .slice()
    .sort(
      (a, b) =>
        a.frequency - b.frequency
    );

  if (sortedRows.length === 0) {
    return [];
  }

  const lowerRatio = Math.pow(
    2,
    -1 / (2 * fraction)
  );

  const upperRatio = Math.pow(
    2,
    1 / (2 * fraction)
  );

  /*
   * Magnitudeの累積和。
   */
  const prefixSums =
    new Array(sortedRows.length + 1);

  prefixSums[0] = 0;

  for (
    let i = 0;
    i < sortedRows.length;
    i++
  ) {
    prefixSums[i + 1] =
      prefixSums[i] +
      sortedRows[i].magnitude;
  }

  const smoothedRows = [];

  let leftIndex = 0;
  let rightIndex = 0;

  for (
    let centerIndex = 0;
    centerIndex < sortedRows.length;
    centerIndex++
  ) {
    const centerFrequency =
      sortedRows[centerIndex].frequency;

    const lowerFrequency =
      centerFrequency * lowerRatio;

    const upperFrequency =
      centerFrequency * upperRatio;

    while (
      leftIndex < sortedRows.length &&
      sortedRows[leftIndex].frequency <
        lowerFrequency
    ) {
      leftIndex++;
    }

    if (rightIndex < leftIndex) {
      rightIndex = leftIndex;
    }

    while (
      rightIndex < sortedRows.length &&
      sortedRows[rightIndex].frequency <=
        upperFrequency
    ) {
      rightIndex++;
    }

    const smoothingPointCount =
      rightIndex - leftIndex;

    let smoothedMagnitude;

    if (smoothingPointCount > 0) {
      const sum =
        prefixSums[rightIndex] -
        prefixSums[leftIndex];

      smoothedMagnitude =
        sum / smoothingPointCount;

    } else {
      smoothedMagnitude =
        sortedRows[centerIndex].magnitude;
    }

    smoothedRows.push({
      frequency: centerFrequency,
      rawMagnitude:
        sortedRows[centerIndex].magnitude,
      smoothedMagnitude,
      smoothingPointCount
    });
  }

  return smoothedRows;
}


/* =========================================================
 * 測定シートへの書き込み
 * ======================================================= */

/**
 * 測定名ごとの専用シートへ書き込みます。
 *
 * 同名のシートがある場合は上書きします。
 */
function writeMeasurementSheet_(
  ss,
  parsed,
  smoothedRows,
  sourceFileName,
  smoothingFraction
) {
  const sheetName =
    sanitizeSheetName_(
      parsed.measurementName
    );

  if (!sheetName) {
    throw new Error(
      '使用可能な測定シート名を作成できませんでした。'
    );
  }

  if (SYSTEM_SHEETS.has(sheetName)) {
    throw new Error(
      `測定名「${sheetName}」は` +
      'システム予約名です。'
    );
  }

  let sheet =
    ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet =
      ss.insertSheet(sheetName);
  }

  /*
   * 同名測定を完全に上書きする。
   */
  sheet.clear();

  const smoothedHeader =
    `Magnitude_1_${smoothingFraction}oct_dB`;

  const output = [
    [
      'Frequency_Hz',
      'Magnitude_Raw_dB',
      smoothedHeader
    ]
  ];

  smoothedRows.forEach(row => {
    output.push([
      row.frequency,
      row.rawMagnitude,
      row.smoothedMagnitude
    ]);
  });

  sheet
    .getRange(
      1,
      1,
      output.length,
      output[0].length
    )
    .setValues(output);

  const metadata = [
    [
      'Measurement_Name',
      parsed.measurementName
    ],
    [
      'Source_File',
      sourceFileName
    ],
    [
      'Imported_At',
      new Date()
    ],
    [
      'Stored_Point_Count',
      parsed.storedPointCount
    ],
    [
      'Valid_Point_Count',
      parsed.rows.length
    ],
    [
      'Smoothing',
      `1/${smoothingFraction} octave`
    ]
  ];

  sheet
    .getRange(
      1,
      5,
      metadata.length,
      2
    )
    .setValues(metadata);

  sheet
    .getRange('A1:C1')
    .setFontWeight('bold')
    .setBackground('#cfe2f3');

  sheet
    .getRange('E1:E6')
    .setFontWeight('bold');

  if (smoothedRows.length > 0) {
    sheet
      .getRange(
        2,
        1,
        smoothedRows.length,
        1
      )
      .setNumberFormat('0.000');

    sheet
      .getRange(
        2,
        2,
        smoothedRows.length,
        2
      )
      .setNumberFormat('0.00');
  }

  sheet
    .getRange('F3')
    .setNumberFormat(
      'yyyy/MM/dd HH:mm:ss'
    );

  sheet.setFrozenRows(1);

  sheet.setColumnWidth(1, 130);
  sheet.setColumnWidth(2, 155);
  sheet.setColumnWidth(3, 185);
  sheet.setColumnWidth(5, 170);
  sheet.setColumnWidth(6, 260);
}


/* =========================================================
 * グラフ表示チェックリスト
 * ======================================================= */

/**
 * 周波数特性グラフシートのA5:Bへ、
 * 測定名と表示チェックボックスを作成します。
 *
 * 既存測定:
 * 以前のチェック状態を維持
 *
 * 新規測定:
 * デフォルトでチェックON
 */
function syncGraphSeriesChecklist_(ss) {
  let graphSheet =
    ss.getSheetByName(CONFIG.GRAPH_SHEET);

  if (!graphSheet) {
    graphSheet =
      ss.insertSheet(CONFIG.GRAPH_SHEET);
  }

  const startRow =
    CONFIG.GRAPH_LIST_START_ROW;

  const nameColumn =
    CONFIG.GRAPH_LIST_NAME_COLUMN;

  const checkColumn =
    CONFIG.GRAPH_LIST_CHECK_COLUMN;

  /*
   * 現在のチェック状態を保存する。
   */
  const existingStates = new Map();
  const lastRow = graphSheet.getLastRow();

  if (lastRow >= startRow) {
    const rowCount =
      lastRow - startRow + 1;

    const existingValues =
      graphSheet
        .getRange(
          startRow,
          nameColumn,
          rowCount,
          2
        )
        .getValues();

    existingValues.forEach(
      ([measurementName, checked]) => {
        const name = String(
          measurementName || ''
        ).trim();

        if (name) {
          existingStates.set(
            name,
            checked === true
          );
        }
      }
    );
  }

  const measurementNames = ss
    .getSheets()
    .filter(sheet =>
      isMeasurementSheet_(sheet)
    )
    .map(sheet => sheet.getName())
    .sort(
      (a, b) =>
        a.localeCompare(b, 'ja')
    );

  /*
   * 既存一覧をクリアする。
   * C列以降には触れない。
   */
  const clearRowCount = Math.max(
    graphSheet.getMaxRows() -
      startRow + 1,
    1
  );

  graphSheet
    .getRange(
      startRow,
      nameColumn,
      clearRowCount,
      2
    )
    .clearContent()
    .clearDataValidations();

  /*
   * 見出し
   */
  graphSheet
    .getRange(
      CONFIG.GRAPH_LIST_HEADER_ROW,
      nameColumn
    )
    .setValue('測定名');

  graphSheet
    .getRange(
      CONFIG.GRAPH_LIST_HEADER_ROW,
      checkColumn
    )
    .setValue('表示');

  graphSheet
    .getRange(
      CONFIG.GRAPH_LIST_HEADER_ROW,
      nameColumn,
      1,
      2
    )
    .setFontWeight('bold')
    .setBackground('#d9ead3');

  graphSheet.setColumnWidth(
    nameColumn,
    220
  );

  graphSheet.setColumnWidth(
    checkColumn,
    70
  );

  if (measurementNames.length === 0) {
    return [];
  }

  const output =
    measurementNames.map(name => [
      name,

      existingStates.has(name)
        ? existingStates.get(name)
        : true
    ]);

  graphSheet
    .getRange(
      startRow,
      nameColumn,
      output.length,
      2
    )
    .setValues(output);

  graphSheet
    .getRange(
      startRow,
      checkColumn,
      output.length,
      1
    )
    .insertCheckboxes();

  return measurementNames;
}


/**
 * チェックONの測定名を取得します。
 */
function getEnabledMeasurementNames_(ss) {
  const graphSheet =
    ss.getSheetByName(CONFIG.GRAPH_SHEET);

  if (!graphSheet) {
    return [];
  }

  const startRow =
    CONFIG.GRAPH_LIST_START_ROW;

  const lastRow =
    graphSheet.getLastRow();

  if (lastRow < startRow) {
    return [];
  }

  const values =
    graphSheet
      .getRange(
        startRow,
        CONFIG.GRAPH_LIST_NAME_COLUMN,
        lastRow - startRow + 1,
        2
      )
      .getValues();

  return values
    .filter(
      ([measurementName, checked]) =>
        String(
          measurementName || ''
        ).trim() !== '' &&
        checked === true
    )
    .map(([measurementName]) =>
      String(measurementName).trim()
    );
}


/**
 * すべての測定を表示ONにします。
 */
function enableAllMeasurements() {
  setAllMeasurementChecks_(true);
}


/**
 * すべての測定を表示OFFにします。
 */
function disableAllMeasurements() {
  setAllMeasurementChecks_(false);
}


/**
 * 全測定のチェック状態を変更します。
 */
function setAllMeasurementChecks_(checked) {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const graphSheet =
    ss.getSheetByName(CONFIG.GRAPH_SHEET);

  if (!graphSheet) {
    throw new Error(
      '周波数特性グラフシートがありません。'
    );
  }

  const startRow =
    CONFIG.GRAPH_LIST_START_ROW;

  const lastRow =
    graphSheet.getLastRow();

  if (lastRow < startRow) {
    return;
  }

  const names =
    graphSheet
      .getRange(
        startRow,
        CONFIG.GRAPH_LIST_NAME_COLUMN,
        lastRow - startRow + 1,
        1
      )
      .getDisplayValues();

  const values = names.map(([name]) => [
    String(name).trim()
      ? checked
      : false
  ]);

  graphSheet
    .getRange(
      startRow,
      CONFIG.GRAPH_LIST_CHECK_COLUMN,
      values.length,
      1
    )
    .setValues(values);

  rebuildAllGraphData();
}


/* =========================================================
 * 全測定データの統合
 * ======================================================= */

/**
 * チェックONの測定だけを、
 * グラフデータシートへ統合します。
 */
function rebuildGraphData_(
  ss,
  minFrequency,
  maxFrequency
) {
  let graphDataSheet =
    ss.getSheetByName(
      CONFIG.GRAPH_DATA_SHEET
    );

  if (!graphDataSheet) {
    graphDataSheet =
      ss.insertSheet(
        CONFIG.GRAPH_DATA_SHEET
      );
  }

  const enabledNames = new Set(
    getEnabledMeasurementNames_(ss)
  );

  const measurementSheets = ss
    .getSheets()
    .filter(sheet =>
      isMeasurementSheet_(sheet)
    )
    .filter(sheet =>
      enabledNames.has(sheet.getName())
    )
    .sort(
      (a, b) =>
        a.getName().localeCompare(
          b.getName(),
          'ja'
        )
    );

  graphDataSheet.clear();

  /*
   * すべて非表示の場合。
   */
  if (measurementSheets.length === 0) {
    graphDataSheet
      .getRange('A1')
      .setValue('Frequency_Hz');

    return false;
  }

  const allFrequencies = new Map();
  const measurementData = [];

  measurementSheets.forEach(sheet => {
    const lastRow =
      sheet.getLastRow();

    if (lastRow < 2) {
      return;
    }

    const values =
      sheet
        .getRange(
          2,
          1,
          lastRow - 1,
          3
        )
        .getValues();

    const magnitudeMap = new Map();

    values.forEach(row => {
      const frequency =
        Number(row[0]);

      const smoothedMagnitude =
        Number(row[2]);

      if (
        !Number.isFinite(frequency) ||
        !Number.isFinite(
          smoothedMagnitude
        )
      ) {
        return;
      }

      if (
        frequency < minFrequency ||
        frequency > maxFrequency
      ) {
        return;
      }

      const key =
        normalizeFrequency_(frequency);

      allFrequencies.set(
        key,
        frequency
      );

      magnitudeMap.set(
        key,
        smoothedMagnitude
      );
    });

    if (magnitudeMap.size > 0) {
      measurementData.push({
        name: sheet.getName(),
        magnitudeMap
      });
    }
  });

  if (measurementData.length === 0) {
    graphDataSheet
      .getRange('A1')
      .setValue('Frequency_Hz');

    return false;
  }

  const frequencyKeys = Array
    .from(allFrequencies.keys())
    .sort((a, b) => a - b);

  const output = [
    [
      'Frequency_Hz',
      ...measurementData.map(
        item => item.name
      )
    ]
  ];

  frequencyKeys.forEach(key => {
    output.push([
      allFrequencies.get(key),

      ...measurementData.map(item =>
        item.magnitudeMap.has(key)
          ? item.magnitudeMap.get(key)
          : null
      )
    ]);
  });

  graphDataSheet
    .getRange(
      1,
      1,
      output.length,
      output[0].length
    )
    .setValues(output);

  graphDataSheet
    .getRange(
      1,
      1,
      1,
      output[0].length
    )
    .setFontWeight('bold')
    .setBackground('#ead1dc');

  if (output.length > 1) {
    graphDataSheet
      .getRange(
        2,
        1,
        output.length - 1,
        1
      )
      .setNumberFormat('0.000');

    graphDataSheet
      .getRange(
        2,
        2,
        output.length - 1,
        output[0].length - 1
      )
      .setNumberFormat('0.00');
  }

  graphDataSheet.setFrozenRows(1);
  graphDataSheet.setFrozenColumns(1);

  graphDataSheet.autoResizeColumns(
    1,
    output[0].length
  );

  return true;
}


/* =========================================================
 * グラフ作成
 * ======================================================= */

/**
 * チェックONの測定だけを使用して、
 * 周波数特性グラフを再作成します。
 */
function rebuildFrequencyResponseChart_(
  ss,
  settings
) {
  const dataSheet =
    ss.getSheetByName(
      CONFIG.GRAPH_DATA_SHEET
    );

  let graphSheet =
    ss.getSheetByName(
      CONFIG.GRAPH_SHEET
    );

  if (!graphSheet) {
    graphSheet =
      ss.insertSheet(
        CONFIG.GRAPH_SHEET
      );
  }

  /*
   * 既存グラフだけを削除する。
   * チェックリストは残す。
   */
  graphSheet
    .getCharts()
    .forEach(chart => {
      graphSheet.removeChart(chart);
    });

  /*
   * タイトル部分を更新する。
   */
  graphSheet
    .getRange('A1:B3')
    .clearContent();

  graphSheet
    .getRange('A1')
    .setValue(
      'Smaart Transfer Function'
    )
    .setFontSize(16)
    .setFontWeight('bold');

  graphSheet
    .getRange('A2')
    .setValue(
      `表示範囲: ` +
      `${settings.minFrequency} Hz ～ ` +
      `${settings.maxFrequency} Hz`
    );

  graphSheet
    .getRange('A3')
    .setValue(
      `Magnitude smoothing: ` +
      `1/${settings.smoothingFraction} octave`
    );

  /*
   * 前回のメッセージを消去する。
   */
  graphSheet
    .getRange(
      CONFIG.GRAPH_CHART_ROW,
      CONFIG.GRAPH_CHART_COLUMN
    )
    .clearContent();

  if (
    !dataSheet ||
    dataSheet.getLastRow() < 2 ||
    dataSheet.getLastColumn() < 2
  ) {
    graphSheet
      .getRange(
        CONFIG.GRAPH_CHART_ROW,
        CONFIG.GRAPH_CHART_COLUMN
      )
      .setValue(
        '表示する測定にチェックを入れてください。'
      );

    return;
  }

  const dataRange =
    dataSheet.getRange(
      1,
      1,
      dataSheet.getLastRow(),
      dataSheet.getLastColumn()
    );

  const chart = graphSheet
    .newChart()

    /*
     * 折れ線グラフ。
     */
    .setChartType(
      Charts.ChartType.LINE
    )

    .addRange(dataRange)
    .setNumHeaders(1)

    /*
     * C5からグラフを配置する。
     */
    .setPosition(
      CONFIG.GRAPH_CHART_ROW,
      CONFIG.GRAPH_CHART_COLUMN,
      0,
      0
    )

    .setOption(
      'title',
      'Frequency Response'
    )

    .setOption(
      'hAxis',
      {
        title: 'Frequency [Hz]',

        // 小数点以下を非表示
        format: '#',

        logScale: true,

        viewWindow: {
          min: settings.minFrequency,
          max: settings.maxFrequency
        },

        // 横軸の主目盛線
        gridlines: {
          count: 10
        },

        // 横軸の補助目盛線
        minorGridlines: {
          count: 10
        }
      }
    )

    .setOption(
      'vAxis',
      {
        title: 'Magnitude [dB]',

        viewWindow: {
          min: settings.chartMinDb,
          max: settings.chartMaxDb
        },

        // 縦軸の主目盛線は自動
        gridlines: {
          count: -1
        },

        // 縦軸の補助目盛線
        minorGridlines: {
          count: 5
        }
      }
    )

    .setOption(
      'legend',
      {
        position: 'right',

        textStyle: {
          fontSize: 11
        }
      }
    )

    // ポイントなし
    .setOption('pointSize', 0)

    // 線の太さ
    .setOption('lineWidth', 2)

    /*
     * 折れ線を平滑線で表示する。
     *
     * 1/N octave smoothingとは別の、
     * 描画上の平滑化です。
     */
    .setOption(
      'curveType',
      'function'
    )

    .setOption(
      'interpolateNulls',
      false
    )

    .setOption(
      'width',
      CONFIG.CHART_WIDTH
    )

    .setOption(
      'height',
      CONFIG.CHART_HEIGHT
    )

    .build();

  graphSheet.insertChart(chart);
}


/**
 * 現在のチェック状態に従い、
 * グラフデータとグラフを再構築します。
 */
function rebuildAllGraphData() {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const settings = getSettings_();

  /*
   * 測定シートの増減を反映しつつ、
   * 既存チェック状態を維持する。
   */
  syncGraphSeriesChecklist_(ss);

  rebuildGraphData_(
    ss,
    settings.minFrequency,
    settings.maxFrequency
  );

  rebuildFrequencyResponseChart_(
    ss,
    settings
  );
}


/* =========================================================
 * チェック変更時の自動更新
 * ======================================================= */

/**
 * 周波数特性グラフシートのB5:Bにある
 * チェックボックスが変更されたら、
 * グラフを自動更新します。
 */
function onEdit(e) {
  if (!e || !e.range) {
    return;
  }

  const range = e.range;
  const sheet = range.getSheet();

  if (
    sheet.getName() !==
      CONFIG.GRAPH_SHEET
  ) {
    return;
  }

  const firstRow = range.getRow();
  const lastRow =
    range.getLastRow();

  const firstColumn =
    range.getColumn();

  const lastColumn =
    range.getLastColumn();

  /*
   * B5:B以外の変更では動作しない。
   * 複数セル貼り付けにも対応。
   */
  const affectsChecklist =
    lastRow >=
      CONFIG.GRAPH_LIST_START_ROW &&
    firstColumn <=
      CONFIG.GRAPH_LIST_CHECK_COLUMN &&
    lastColumn >=
      CONFIG.GRAPH_LIST_CHECK_COLUMN;

  if (!affectsChecklist) {
    return;
  }

  const lock =
    LockService.getDocumentLock();

  /*
   * 連続クリック時の競合を避ける。
   */
  if (!lock.tryLock(5000)) {
    return;
  }

  try {
    const ss = e.source;
    const settings = getSettings_();

    rebuildGraphData_(
      ss,
      settings.minFrequency,
      settings.maxFrequency
    );

    rebuildFrequencyResponseChart_(
      ss,
      settings
    );

  } catch (error) {
    console.error(error);

  } finally {
    lock.releaseLock();
  }
}


/* =========================================================
 * 設定値の取得
 * ======================================================= */

/**
 * 設定シートから設定値を取得します。
 */
function getSettings_() {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const sheet =
    ss.getSheetByName(
      CONFIG.SETTINGS_SHEET
    );

  if (!sheet) {
    throw new Error(
      '設定シートがありません。\n' +
      'Smaart TRFメニューから' +
      '「初期設定シートを作成・更新」を' +
      '実行してください。'
    );
  }

  const folderValue = String(
    sheet
      .getRange(
        CONFIG.FOLDER_ID_CELL
      )
      .getDisplayValue()
  ).trim();

  if (!folderValue) {
    throw new Error(
      '設定シートのB2に、' +
      'Google DriveフォルダIDまたはURLを' +
      '入力してください。'
    );
  }

  const minFrequency = Number(
    sheet
      .getRange(
        CONFIG.MIN_FREQUENCY_CELL
      )
      .getValue()
  );

  const maxFrequency = Number(
    sheet
      .getRange(
        CONFIG.MAX_FREQUENCY_CELL
      )
      .getValue()
  );

  const chartMinDb = Number(
    sheet
      .getRange(
        CONFIG.CHART_MIN_DB_CELL
      )
      .getValue()
  );

  const chartMaxDb = Number(
    sheet
      .getRange(
        CONFIG.CHART_MAX_DB_CELL
      )
      .getValue()
  );

  const smoothingFraction = Number(
    sheet
      .getRange(
        CONFIG.SMOOTHING_FRACTION_CELL
      )
      .getValue()
  );

  if (
    !Number.isFinite(minFrequency) ||
    minFrequency <= 0
  ) {
    throw new Error(
      '最低周波数の設定が不正です。'
    );
  }

  if (
    !Number.isFinite(maxFrequency) ||
    maxFrequency <= minFrequency
  ) {
    throw new Error(
      '最高周波数は最低周波数より' +
      '大きい値を設定してください。'
    );
  }

  if (
    !Number.isFinite(chartMinDb) ||
    !Number.isFinite(chartMaxDb) ||
    chartMaxDb <= chartMinDb
  ) {
    throw new Error(
      'グラフのdB表示範囲が不正です。'
    );
  }

  if (
    !Number.isFinite(
      smoothingFraction
    ) ||
    smoothingFraction <= 0
  ) {
    throw new Error(
      '平滑化分母には' +
      '1以上の数値を設定してください。'
    );
  }

  return {
    folderId:
      extractDriveId_(folderValue),

    minFrequency,
    maxFrequency,
    chartMinDb,
    chartMaxDb,
    smoothingFraction
  };
}


/* =========================================================
 * 補助関数
 * ======================================================= */

/**
 * 測定データ用シートか判定します。
 */
function isMeasurementSheet_(sheet) {
  if (
    SYSTEM_SHEETS.has(sheet.getName())
  ) {
    return false;
  }

  if (sheet.getLastRow() < 2) {
    return false;
  }

  const headers =
    sheet
      .getRange(1, 1, 1, 3)
      .getDisplayValues()[0];

  return (
    headers[0] === 'Frequency_Hz' &&
    headers[1] ===
      'Magnitude_Raw_dB' &&
    /^Magnitude_1_.+oct_dB$/.test(
      headers[2]
    )
  );
}


/**
 * DriveフォルダURLまたはIDから、
 * ID部分を取り出します。
 */
function extractDriveId_(value) {
  const text =
    String(value || '').trim();

  const folderUrlMatch =
    text.match(
      /\/folders\/([a-zA-Z0-9_-]+)/
    );

  if (folderUrlMatch) {
    return folderUrlMatch[1];
  }

  const idMatch =
    text.match(
      /[a-zA-Z0-9_-]{20,}/
    );

  if (idMatch) {
    return idMatch[0];
  }

  throw new Error(
    'Google DriveフォルダIDまたはURLが不正です。'
  );
}


/**
 * バイト列からNULL終端ASCII文字列を読み取ります。
 */
function readAscii_(
  bytes,
  offset,
  maxLength
) {
  const chars = [];

  for (
    let i = 0;
    i < maxLength;
    i++
  ) {
    const position = offset + i;

    if (position >= bytes.length) {
      break;
    }

    const value = bytes[position];

    if (value === 0) {
      break;
    }

    chars.push(
      String.fromCharCode(value)
    );
  }

  return chars.join('');
}


/**
 * TRF内のMagnitude無効値を判定します。
 */
function isInvalidMagnitude_(value) {
  return Math.abs(
    value -
      CONFIG.INVALID_MAGNITUDE
  ) < 0.0001;
}


/**
 * 周波数を比較用キーへ変換します。
 *
 * 浮動小数点誤差を避けるため、
 * 小数点以下4桁へ丸めます。
 */
function normalizeFrequency_(frequency) {
  return Math.round(
    Number(frequency) * 10000
  ) / 10000;
}


/**
 * Google Sheetsで使用可能な
 * シート名へ変換します。
 */
function sanitizeSheetName_(name) {
  let sanitized =
    String(name || '')
      .trim()
      .replace(
        /[\\\/\?\*\[\]\:]/g,
        '_'
      )
      .replace(/^'+|'+$/g, '');

  if (sanitized.length > 100) {
    sanitized =
      sanitized.substring(0, 100);
  }

  return sanitized;
}


/**
 * 正の有限数か判定します。
 */
function isFinitePositive_(value) {
  return (
    Number.isFinite(value) &&
    value > 0
  );
}


/**
 * Errorなどからメッセージを取得します。
 */
function getErrorMessage_(error) {
  if (
    error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }

  return String(error);
}


/**
 * インポート結果を表示します。
 */
function showImportResult_(
  results,
  errors
) {
  const lines = [];

  lines.push(
    `成功: ${results.length}件`
  );

  results.forEach(result => {
    lines.push(
      `・${result.fileName}` +
      ` → ${result.measurementName}` +
      `（有効${result.validPointCount}点）`
    );
  });

  if (errors.length > 0) {
    lines.push('');
    lines.push(
      `失敗: ${errors.length}件`
    );

    errors.forEach(error => {
      lines.push(`・${error}`);
    });
  }

  SpreadsheetApp.getUi().alert(
    lines.join('\n')
  );
}