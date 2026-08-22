import { initAuthenticatedPage } from '../layout.js';
import {
  listMeasurements,
  deleteMeasurement,
  updateMeasurementOrder,
  updateMeasurementMetadata,
  getMeasurementJsonData
} from '../measurements.js';
import { smoothFractionalOctave, rowsFromMeasurementJson, logWeightedBandAverage } from '../trf-parser.js';
import { getSmoothingFraction, setSmoothingFraction } from '../smoothing-setting.js';
import { getCoherenceThreshold, setCoherenceThreshold } from '../coherence-setting.js';
import { renderFrequencyResponseChart } from '../frequency-chart.js';
import { formatUpdatedAt } from '../format.js';
import { translateError } from '../error-messages.js';

const TRACE_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d'];

// iOS Safariはドラッグハンドルへのtouchstartを配信しないため、
// SortableJSのドラッグ並び替えはPC/Mac相当の入力デバイスに限定する。
// 画面幅だけで判定すると横向きiPad等の広い画面のタッチ端末も含んでしまうため、
// hover/pointerでマウス・トラックパッド操作かどうかも合わせて見る。
const DESKTOP_QUERY = '(min-width: 768px) and (hover: hover) and (pointer: fine)';

// スムージング済みの行を、コヒーレンス閾値以上/未満の連続区間に分割する。
// 区間の境界点は両側に含め、線が途切れずに繋がって見えるようにする。
// coherenceを持たない行（未対応形式）は常に閾値以上として扱う。
function splitByCoherence(rows, threshold) {
  const segments = [];
  let currentIsLow = null;
  let currentPoints = [];

  rows.forEach((row) => {
    const isLow = row.coherence !== undefined && row.coherence < threshold;
    if (currentIsLow === null) {
      currentIsLow = isLow;
      currentPoints = [row];
      return;
    }
    if (isLow === currentIsLow) {
      currentPoints.push(row);
      return;
    }
    currentPoints.push(row);
    segments.push({ isLowCoherence: currentIsLow, points: currentPoints });
    currentIsLow = isLow;
    currentPoints = [row];
  });

  if (currentPoints.length > 0) {
    segments.push({ isLowCoherence: currentIsLow, points: currentPoints });
  }

  return segments;
}

function stripExtension(fileName) {
  return fileName.replace(/\.[^.]+$/, '');
}

// ファイル名の先頭文字A〜Gをチェックボックスで絞り込むための定義。
const LETTER_FILTER_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

// 新しい命名規則ではファイル名の1文字目がマイク位置を表す。
// 小文字で始まるファイルも同じ位置として扱えるよう、大文字化して比較する。
function matchesLetterFilter(measurement, letters) {
  if (letters.length === 0) return true;
  return letters.includes(measurement.file_name.charAt(0).toUpperCase());
}

// 例: A_AL_M.csv → { name: 'A_AL', type: 'M' }
// ファイル名末尾の_M/_Bだけを種別として扱い、それ以外のファイルは集計表に含めない。
function parseLetterSummaryFileName(fileName) {
  const match = stripExtension(fileName).match(/^(.+)_([MB])$/i);
  if (!match) return null;
  return { name: match[1], type: match[2].toUpperCase() };
}

function fitCanvasText(context, text, maxWidth) {
  if (context.measureText(text).width <= maxWidth) return text;

  let fitted = text;
  while (fitted.length > 0 && context.measureText(`${fitted}…`).width > maxWidth) {
    fitted = fitted.slice(0, -1);
  }
  return `${fitted}…`;
}

// 検索・絞り込みの比較対象。ファイル名は拡張子を除き、測定名と連結して小文字化する。
function searchHaystack(measurement) {
  return `${stripExtension(measurement.file_name)} ${measurement.measurement_name}`.toLowerCase();
}

// スマホのキーボード（自動置換）で入力される、直立ダブルクォート"に似た
// 引用符類似文字を通常の"に正規化する。
// 例: “ ” ＂ → "
function normalizeQuotes(text) {
  return text.replace(/[“”＂]/g, '"');
}

// ダブルクォートで囲んだ部分はスペースを含む1つのフレーズとして扱い、
// それ以外はスペース区切りの単語ごとに分割する。
// 例: `"WS A" BU` → ["ws a", "bu"]
function tokenizeAndTerms(group) {
  const terms = [];
  const pattern = /"([^"]*)"|(\S+)/g;
  let match;
  while ((match = pattern.exec(group)) !== null) {
    const term = (match[1] !== undefined ? match[1] : match[2]).toLowerCase();
    if (term) terms.push(term);
  }
  return terms;
}

// "|"区切りでORグループに分け、各グループ内はスペース区切りでAND判定する
// 検索クエリをパースする。例: "A B|C" → (AかつB) または (C)。
function parseSearchGroups(query) {
  return normalizeQuotes(query)
    .split('|')
    .map((group) => tokenizeAndTerms(group))
    .filter((terms) => terms.length > 0);
}

function rowsFromSummaryJson(summaryJson) {
  if (!summaryJson || !Array.isArray(summaryJson.frequency)) return [];
  return summaryJson.frequency.map((frequency, index) => ({
    frequency,
    magnitude: summaryJson.magnitude[index]
  }));
}

export function measurementList() {
  return {
    canEdit: false,
    canDelete: false,
    canReorder: false,
    isDesktop: false,
    sortableInstance: null,
    loading: true,
    errorMessage: '',
    measurements: [],
    checked: {},
    hiddenInChart: {},
    dataCache: {},
    loadingIds: {},
    pendingDelete: null,
    editingMeasurement: null,
    editFileName: '',
    editMeasurementName: '',
    editErrorMessage: '',
    savingEdit: false,
    downloadingSummaryJpeg: false,
    searchQuery: '',
    letters: LETTER_FILTER_LETTERS,
    letterFilters: [],
    showSearchHelp: false,
    bandFilterEnabled: false,
    bandLowFreq: 125,
    bandHighFreq: 4000,
    bandThreshold: -5,
    fraction: getSmoothingFraction(),
    coherenceThreshold: getCoherenceThreshold(),
    formatUpdatedAt,
    async init() {
      const desktopQuery = window.matchMedia(DESKTOP_QUERY);
      this.isDesktop = desktopQuery.matches;
      desktopQuery.addEventListener('change', (event) => {
        this.isDesktop = event.matches;
        this.$nextTick(() => this.syncSortable());
      });

      const result = await initAuthenticatedPage();
      this.canEdit = ['Admin', 'Editor'].includes(result?.profile?.role);
      this.canDelete = ['Admin', 'Editor'].includes(result?.profile?.role);
      this.canReorder = ['Admin', 'Editor'].includes(result?.profile?.role);

      try {
        this.measurements = await listMeasurements();
        this.measurements.forEach((measurement) => {
          this.checked[measurement.id] = false;
        });
      } catch (error) {
        console.error(error);
        this.errorMessage = '一覧の取得に失敗しました。';
      } finally {
        this.loading = false;
        this.renderChart();
        this.$nextTick(() => this.syncSortable());
      }
    },
    // PC/Mac相当の入力デバイスの時だけSortableJSのドラッグ並び替えを有効にする。
    // モバイルは▲▼ボタンのみ（iOS Safariのタッチ制約のため）。
    syncSortable() {
      if (this.isDesktop && !this.sortableInstance) {
        this.initSortable();
      } else if (!this.isDesktop && this.sortableInstance) {
        this.sortableInstance.destroy();
        this.sortableInstance = null;
      }
    },
    initSortable() {
      const container = document.getElementById('measurement-list');
      if (!container || typeof Sortable === 'undefined') return;

      // event.oldIndex/newIndexは信用せず、ドロップ後のDOMの実並び（data-id）を
      // 正として並び替え結果を確定させる。フィルターで一部だけ表示中だと
      // container内の子要素数がmeasurements全体と一致しないため、その場合は
      // 何もせず無視する（ハンドル自体もフィルター中はpointer-events-noneで
      // 操作できないようにしてある）。
      this.sortableInstance = new Sortable(container, {
        animation: 150,
        handle: '.drag-handle',
        onEnd: async () => {
          const orderedIds = Array.from(container.children).map((el) => el.dataset.id);
          const byId = new Map(this.measurements.map((m) => [String(m.id), m]));
          const reordered = orderedIds.map((id) => byId.get(id)).filter(Boolean);
          if (reordered.length !== this.measurements.length) return;

          const changed = reordered.some((m, i) => m.id !== this.measurements[i].id);
          if (!changed) return;

          this.measurements = reordered;
          this.renderChart();

          try {
            await updateMeasurementOrder(this.measurements.map((m) => m.id));
          } catch (error) {
            console.error(error);
            this.errorMessage = '並び順の保存に失敗しました。';
          }
        }
      });
    },
    clearSearch() {
      this.searchQuery = '';
    },
    measurementsForLetters(letters) {
      if (letters.length === 0) return [];
      return this.measurements.filter((measurement) => matchesLetterFilter(measurement, letters));
    },
    // 選択中のA〜Gに該当する測定を、ファイル名末尾の_M/_Bを除いた名前で1行にまとめる。
    // 一覧取得時に含まれるsummary_jsonを使うため、フル解像度データの追加取得は不要。
    letterSummaryRowsFor(letters) {
      const rowsByName = new Map();

      this.measurementsForLetters(letters).forEach((measurement) => {
        const parsed = parseLetterSummaryFileName(measurement.file_name);
        if (!parsed) return;

        if (!rowsByName.has(parsed.name)) {
          rowsByName.set(parsed.name, { name: parsed.name, M: null, B: null });
        }

        const rows = rowsFromSummaryJson(measurement.summary_json);
        rowsByName.get(parsed.name)[parsed.type] = logWeightedBandAverage(rows, 125, 4000);
      });

      return Array.from(rowsByName.values());
    },
    letterSummaryRows() {
      return this.letterSummaryRowsFor(this.letterFilters);
    },
    formatLetterSummaryAverage(value) {
      if (value === null) return '—';
      const roundedValue = Math.abs(value) < 0.05 ? 0 : value;
      return `${roundedValue.toFixed(1)} dB`;
    },
    async downloadAllLetterSummaryJpeg() {
      if (this.downloadingSummaryJpeg) return;
      this.downloadingSummaryJpeg = true;

      try {
        const sections = this.letters.map((letter) => ({
          letter,
          rows: this.letterSummaryRowsFor([letter])
        }));
        const canvas = document.createElement('canvas');
        const width = 1200;
        const padding = 60;
        const titleHeight = 110;
        const tableHeaderHeight = 58;
        const sectionHeight = 48;
        const rowHeight = 52;
        const totalBodyHeight = sections.reduce(
          (height, section) => height + sectionHeight + rowHeight * Math.max(section.rows.length, 1),
          0
        );
        canvas.width = width;
        canvas.height = padding * 2 + titleHeight + tableHeaderHeight + totalBodyHeight;

        const context = canvas.getContext('2d');
        if (!context) throw new Error('画像の生成に失敗しました。');

        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.textBaseline = 'middle';
        context.fillStyle = '#111827';
        context.font = 'bold 34px sans-serif';
        context.fillText('A–G 帯域平均', padding, padding + 28);
        context.fillStyle = '#6b7280';
        context.font = '22px sans-serif';
        context.fillText('125–4000 Hz', padding, padding + 72);

        const tableWidth = width - padding * 2;
        const nameWidth = 650;
        const valueWidth = (tableWidth - nameWidth) / 2;
        let y = padding + titleHeight;

        context.fillStyle = '#1f2937';
        context.fillRect(padding, y, tableWidth, tableHeaderHeight);
        context.fillStyle = '#ffffff';
        context.font = 'bold 22px sans-serif';
        context.textAlign = 'left';
        context.fillText('name', padding + 20, y + tableHeaderHeight / 2);
        context.textAlign = 'right';
        context.fillText('M', padding + nameWidth + valueWidth - 20, y + tableHeaderHeight / 2);
        context.fillText('B', width - padding - 20, y + tableHeaderHeight / 2);
        y += tableHeaderHeight;

        sections.forEach((section) => {
          context.fillStyle = '#dbeafe';
          context.fillRect(padding, y, tableWidth, sectionHeight);
          context.fillStyle = '#1e3a8a';
          context.font = 'bold 22px sans-serif';
          context.textAlign = 'left';
          context.fillText(section.letter, padding + 20, y + sectionHeight / 2);
          y += sectionHeight;

          const rows = section.rows.length > 0
            ? section.rows
            : [{ name: '該当データなし', M: null, B: null, empty: true }];
          rows.forEach((row, index) => {
            context.fillStyle = index % 2 === 0 ? '#ffffff' : '#f9fafb';
            context.fillRect(padding, y, tableWidth, rowHeight);
            context.strokeStyle = '#e5e7eb';
            context.beginPath();
            context.moveTo(padding, y + rowHeight);
            context.lineTo(width - padding, y + rowHeight);
            context.stroke();

            context.fillStyle = row.empty ? '#9ca3af' : '#111827';
            context.font = '21px sans-serif';
            context.textAlign = 'left';
            context.fillText(
              fitCanvasText(context, row.name, nameWidth - 40),
              padding + 20,
              y + rowHeight / 2
            );
            context.textAlign = 'right';
            context.fillText(
              row.empty ? '—' : this.formatLetterSummaryAverage(row.M),
              padding + nameWidth + valueWidth - 20,
              y + rowHeight / 2
            );
            context.fillText(
              row.empty ? '—' : this.formatLetterSummaryAverage(row.B),
              width - padding - 20,
              y + rowHeight / 2
            );
            y += rowHeight;
          });
        });

        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
        if (!blob) throw new Error('画像の生成に失敗しました。');

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const now = new Date();
        const date = [
          now.getFullYear(),
          String(now.getMonth() + 1).padStart(2, '0'),
          String(now.getDate()).padStart(2, '0')
        ].join('');
        link.href = url;
        link.download = `tfviewer-band-average-A-G-${date}.jpg`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.errorMessage = '';
      } catch (error) {
        console.error(error);
        this.errorMessage = error?.message || '画像の生成に失敗しました。';
      } finally {
        this.downloadingSummaryJpeg = false;
      }
    },
    // A〜Gのチェックは一覧の絞り込みとグラフ表示を連動させる。ONにするとファイル名の
    // 先頭がその文字である全件（テキスト検索や帯域フィルターの絞り込み状態には左右されない）をグラフに
    // 表示し、OFFにすると同じ全件をグラフから外す。
    // ただしOFF時、他にチェック中の文字にも該当する項目はグラフに残す。
    async toggleLetter(letter) {
      const turningOn = !this.letterFilters.includes(letter);
      this.letterFilters = turningOn
        ? [...this.letterFilters, letter]
        : this.letterFilters.filter((selected) => selected !== letter);

      if (turningOn) {
        const targets = this.measurementsForLetters([letter]);
        await Promise.all(targets.map((measurement) => this.ensureDataLoaded(measurement.id)));
        targets.forEach((measurement) => {
          if (this.dataCache[measurement.id]) this.checked[measurement.id] = true;
        });
      } else {
        const keepIds = new Set(this.measurementsForLetters(this.letterFilters).map((m) => m.id));
        this.measurementsForLetters([letter]).forEach((measurement) => {
          if (keepIds.has(measurement.id)) return;
          this.checked[measurement.id] = false;
          delete this.hiddenInChart[measurement.id];
        });
      }
      this.renderChart();
    },
    isFiltering() {
      return this.searchQuery.trim() !== '' || this.letterFilters.length > 0 || this.bandFilterEnabled;
    },
    // "|"区切りのORグループ、各グループ内はスペース区切りのANDで検索する
    // （例: "A B|C" → (AかつB)またはC）。ファイル名は拡張子を除いて比較する。
    // A〜Gのチェックボックスは、ファイル名の先頭文字がチェックした文字のいずれかなら
    // 一致と判定し（例: A,B → 先頭がAまたはB）、テキスト検索とはANDで合成する。
    // さらに、指定帯域の対数周波数重み付け平均が閾値以下の項目のみを残す
    // 絞り込みもANDで適用する。
    filteredMeasurements() {
      const groups = parseSearchGroups(this.searchQuery);
      const hasLetterFilter = this.letterFilters.length > 0;

      return this.measurements.filter((measurement) => {
        if (hasLetterFilter && !matchesLetterFilter(measurement, this.letterFilters)) return false;

        if (groups.length > 0) {
          const haystack = searchHaystack(measurement);
          const matchesAnyGroup = groups.some((terms) => terms.every((term) => haystack.includes(term)));
          if (!matchesAnyGroup) return false;
        }

        if (this.bandFilterEnabled) {
          const rows = rowsFromSummaryJson(measurement.summary_json);
          const average = logWeightedBandAverage(rows, this.bandLowFreq, this.bandHighFreq);
          if (average === null || average > this.bandThreshold) return false;
        }

        return true;
      });
    },
    // グラフ表示に必要なフル解像度データは、チェックを入れた測定だけ個別取得する。
    // 一度取得した測定はセッション中キャッシュし、再取得しない。
    async ensureDataLoaded(id) {
      if (this.dataCache[id]) return;
      this.loadingIds[id] = true;
      try {
        this.dataCache[id] = await getMeasurementJsonData(id);
      } catch (error) {
        console.error(error);
        this.errorMessage = 'データの取得に失敗しました。';
      } finally {
        delete this.loadingIds[id];
      }
    },
    // フィルターで現在表示中の項目だけを対象に一括ON/OFFする。
    // 非表示になっている項目のチェック状態には影響しない。
    async showFiltered() {
      const targets = this.filteredMeasurements();
      await Promise.all(targets.map((measurement) => this.ensureDataLoaded(measurement.id)));
      targets.forEach((measurement) => {
        if (this.dataCache[measurement.id]) this.checked[measurement.id] = true;
      });
      this.renderChart();
    },
    hideFiltered() {
      this.filteredMeasurements().forEach((measurement) => {
        this.checked[measurement.id] = false;
        delete this.hiddenInChart[measurement.id];
      });
      this.renderChart();
    },
    // 絞り込み中かどうかに関わらず、グラフに表示中のデータを常に一括クリアできる
    // 導線として、フィルター状態を無視して全項目を対象にする。
    hideAll() {
      this.measurements.forEach((measurement) => {
        this.checked[measurement.id] = false;
        delete this.hiddenInChart[measurement.id];
      });
      this.renderChart();
    },
    scrollToChart() {
      document.getElementById('compare-chart').scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    async move(measurement, offset) {
      const index = this.measurements.findIndex((m) => m.id === measurement.id);
      const target = index + offset;
      if (target < 0 || target >= this.measurements.length) return;

      const [moved] = this.measurements.splice(index, 1);
      this.measurements.splice(target, 0, moved);
      this.renderChart();

      try {
        await updateMeasurementOrder(this.measurements.map((m) => m.id));
      } catch (error) {
        console.error(error);
        this.errorMessage = '並び順の保存に失敗しました。';
      }
    },
    onFractionChange() {
      setSmoothingFraction(this.fraction);
      this.renderChart();
    },
    onCoherenceThresholdChange() {
      setCoherenceThreshold(this.coherenceThreshold);
      this.renderChart();
    },
    async toggle(id) {
      const turningOn = !this.checked[id];
      if (turningOn) {
        await this.ensureDataLoaded(id);
        if (!this.dataCache[id]) return;
      } else {
        // 次にチェックし直したときに、前回グラフ上だけで一時非表示にしていた
        // 状態を持ち越さず、必ず表示された状態から始まるようにする。
        delete this.hiddenInChart[id];
      }
      this.checked[id] = turningOn;
      this.renderChart();
    },
    // 凡例をクリックすると、チェック状態（一覧側の選択）はそのままに、
    // グラフ上の該当データだけ一時的に薄いグレー表示へ切り替える。
    // 一覧の項目数が多いと該当チェックボックスを探すのが手間なため、
    // グラフを見ながら凡例側で素早くON/OFFできるようにする。
    toggleChartVisibility(measurement) {
      this.hiddenInChart[measurement.id] = !this.hiddenInChart[measurement.id];
      this.renderChart();
    },
    startEdit(measurement) {
      if (!this.canEdit) return;
      this.editingMeasurement = measurement;
      this.editFileName = measurement.file_name;
      this.editMeasurementName = measurement.measurement_name;
      this.editErrorMessage = '';
    },
    cancelEdit() {
      if (this.savingEdit) return;
      this.editingMeasurement = null;
      this.editErrorMessage = '';
    },
    async saveEdit() {
      if (!this.editingMeasurement || !this.canEdit || this.savingEdit) return;

      const fileName = this.editFileName.trim();
      const measurementName = this.editMeasurementName.trim();
      if (!fileName || !measurementName) {
        this.editErrorMessage = 'ファイル名とmeasurement nameを入力してください。';
        return;
      }

      this.savingEdit = true;
      try {
        const updated = await updateMeasurementMetadata(
          this.editingMeasurement.id,
          fileName,
          measurementName
        );
        Object.assign(this.editingMeasurement, updated);
        this.editingMeasurement = null;
        this.editErrorMessage = '';
        this.errorMessage = '';
        this.renderChart();
      } catch (error) {
        console.error(error);
        this.editErrorMessage = translateError(error);
      } finally {
        this.savingEdit = false;
      }
    },
    remove(measurement) {
      this.pendingDelete = measurement;
    },
    cancelRemove() {
      this.pendingDelete = null;
    },
    async confirmRemove() {
      const measurement = this.pendingDelete;
      if (!measurement) return;
      this.pendingDelete = null;

      try {
        await deleteMeasurement(measurement.id, measurement.trf_path);
        this.measurements = this.measurements.filter((m) => m.id !== measurement.id);
        delete this.checked[measurement.id];
        delete this.hiddenInChart[measurement.id];
        delete this.dataCache[measurement.id];
        this.renderChart();
        this.errorMessage = '';
      } catch (error) {
        console.error(error);
        this.errorMessage = translateError(error);
      }
    },
    // 色は「現在チェックしている項目の中での順番」で割り当てる。
    // 一覧全体の並び順で固定すると、測定数が増えたときに色数（TRACE_COLORS.length）を
    // 超えて巡回し、同時に比較表示した測定同士で色が被ってしまうため。
    // 比較表示は最大でも数本程度である前提なので、チェックON/OFFのたびに
    // 色が変わり得ることよりも、表示中の色が必ず被らないことを優先する。
    colorFor(measurement) {
      if (!this.checked[measurement.id]) return '#9ca3af';
      const checkedIds = this.measurements.filter((m) => this.checked[m.id]).map((m) => m.id);
      const index = checkedIds.indexOf(measurement.id);
      return TRACE_COLORS[index % TRACE_COLORS.length];
    },
    swatchStyle(measurement) {
      return `background-color: ${this.colorFor(measurement)}`;
    },
    // グラフ左の凡例パネル用。現在チェックしている測定のみ、一覧の並び順で返す
    // （色は表示順ではなくcolorFor内のcheckedIds順で決まるため、凡例の並びと
    // グラフ上のトレース順は一致するとは限らないが、色自体は一致する）。
    checkedMeasurements() {
      return this.measurements.filter((m) => this.checked[m.id]);
    },
    // 凡例先頭の一括トグル用。表示中の全項目が既に一時非表示なら「すべて表示」に、
    // そうでなければ「すべて薄く」にラベルを切り替える（表示中の測定が0件のときは
    // ボタン自体を隠すのでfalseで問題ない）。
    allDimmed() {
      const targets = this.checkedMeasurements();
      return targets.length > 0 && targets.every((m) => this.hiddenInChart[m.id]);
    },
    toggleDimAll() {
      const dimNext = !this.allDimmed();
      this.checkedMeasurements().forEach((measurement) => {
        if (dimNext) {
          this.hiddenInChart[measurement.id] = true;
        } else {
          delete this.hiddenInChart[measurement.id];
        }
      });
      this.renderChart();
    },
    renderChart() {
      const traces = [];

      this.measurements.forEach((measurement) => {
        if (!this.checked[measurement.id]) return;
        const jsonData = this.dataCache[measurement.id];
        if (!jsonData) return;

        const isDimmed = this.hiddenInChart[measurement.id];
        const color = isDimmed ? '#d1d5db' : this.colorFor(measurement);
        const rows = rowsFromMeasurementJson(jsonData);
        // スムージングは常に全データで行い、閾値を変えても波形の形自体は変わらないようにする。
        // コヒーレンス閾値未満の区間は、線を消さずopacityを下げて視覚的に示すだけにとどめる。
        const smoothed = smoothFractionalOctave(rows, this.fraction);

        // 塗り分け用の線は見た目だけを担当し、hoverは無効にする。
        // セグメントごとに別トレースなので、hoverを有効にしたままだと
        // 近接するセグメント全部の値が同時にツールチップへ出てしまうため。
        splitByCoherence(smoothed, this.coherenceThreshold).forEach((segment, segmentIndex) => {
          traces.push({
            x: segment.points.map((row) => row.frequency),
            y: segment.points.map((row) => row.smoothedMagnitude),
            type: 'scatter',
            mode: 'lines',
            name: measurement.file_name,
            legendgroup: measurement.file_name,
            showlegend: segmentIndex === 0,
            opacity: isDimmed ? 0.25 : (segment.isLowCoherence ? 0.25 : 1),
            hoverinfo: 'skip',
            line: { width: 2, color }
          });
        });

        // hover専用の透明な全データトレース。1測定につき1本だけにすることで、
        // カーソル位置に対して常に1つの値だけが表示されるようにする。
        traces.push({
          x: smoothed.map((row) => row.frequency),
          y: smoothed.map((row) => row.smoothedMagnitude),
          type: 'scatter',
          mode: 'lines',
          name: measurement.file_name,
          legendgroup: measurement.file_name,
          showlegend: false,
          opacity: 0,
          line: { width: 2, color }
        });
      });

      renderFrequencyResponseChart('compare-chart', traces);
    }
  };
}
