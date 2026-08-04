import { initAuthenticatedPage } from '../layout.js';
import { listMeasurements, deleteMeasurement, updateMeasurementOrder, getMeasurementJsonData } from '../measurements.js';
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

function rowsFromSummaryJson(summaryJson) {
  if (!summaryJson || !Array.isArray(summaryJson.frequency)) return [];
  return summaryJson.frequency.map((frequency, index) => ({
    frequency,
    magnitude: summaryJson.magnitude[index]
  }));
}

export function measurementList() {
  return {
    canDelete: false,
    canReorder: false,
    isDesktop: false,
    sortableInstance: null,
    loading: true,
    errorMessage: '',
    measurements: [],
    checked: {},
    dataCache: {},
    loadingIds: {},
    searchQuery: '',
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
    isFiltering() {
      return this.searchQuery.trim() !== '' || this.bandFilterEnabled;
    },
    // スペース区切りのキーワードすべてを含む項目だけを残すAND検索と、
    // 指定帯域の対数周波数重み付け平均が閾値以下の項目のみを残す絞り込みを両方適用する。
    filteredMeasurements() {
      const terms = this.searchQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);

      return this.measurements.filter((measurement) => {
        if (terms.length > 0) {
          const haystack = `${measurement.file_name} ${measurement.measurement_name}`.toLowerCase();
          if (!terms.every((term) => haystack.includes(term))) return false;
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
      }
      this.checked[id] = turningOn;
      this.renderChart();
    },
    async remove(measurement) {
      if (!confirm(`${measurement.file_name} を削除しますか？`)) return;

      try {
        await deleteMeasurement(measurement.id, measurement.trf_path);
        this.measurements = this.measurements.filter((m) => m.id !== measurement.id);
        delete this.checked[measurement.id];
        delete this.dataCache[measurement.id];
        this.renderChart();
      } catch (error) {
        console.error(error);
        alert(translateError(error));
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
    renderChart() {
      const traces = [];

      this.measurements.forEach((measurement) => {
        if (!this.checked[measurement.id]) return;
        const jsonData = this.dataCache[measurement.id];
        if (!jsonData) return;

        const color = this.colorFor(measurement);
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
            opacity: segment.isLowCoherence ? 0.25 : 1,
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
