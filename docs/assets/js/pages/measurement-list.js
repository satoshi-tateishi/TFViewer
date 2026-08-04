import { initAuthenticatedPage } from '../layout.js';
import { listMeasurements, deleteMeasurement, updateMeasurementOrder } from '../measurements.js';
import { smoothFractionalOctave, rowsFromMeasurementJson, logWeightedBandAverage } from '../trf-parser.js';
import { getSmoothingFraction, setSmoothingFraction } from '../smoothing-setting.js';
import { getCoherenceThreshold, setCoherenceThreshold } from '../coherence-setting.js';
import { renderFrequencyResponseChart } from '../frequency-chart.js';
import { formatUpdatedAt } from '../format.js';
import { translateError } from '../error-messages.js';

const TRACE_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d'];

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

export function measurementList() {
  return {
    canDelete: false,
    canReorder: false,
    loading: true,
    errorMessage: '',
    measurements: [],
    checked: {},
    searchQuery: '',
    bandFilterEnabled: false,
    bandLowFreq: 125,
    bandHighFreq: 4000,
    bandThreshold: -5,
    fraction: getSmoothingFraction(),
    coherenceThreshold: getCoherenceThreshold(),
    formatUpdatedAt,
    async init() {
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
      }
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
          const rows = rowsFromMeasurementJson(measurement.json_data);
          const average = logWeightedBandAverage(rows, this.bandLowFreq, this.bandHighFreq);
          if (average === null || average > this.bandThreshold) return false;
        }

        return true;
      });
    },
    // フィルターで現在表示中の項目だけを対象に一括ON/OFFする。
    // 非表示になっている項目のチェック状態には影響しない。
    showFiltered() {
      this.filteredMeasurements().forEach((measurement) => {
        this.checked[measurement.id] = true;
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
    toggle(id) {
      this.checked[id] = !this.checked[id];
      this.renderChart();
    },
    async remove(measurement) {
      if (!confirm(`${measurement.file_name} を削除しますか？`)) return;

      try {
        await deleteMeasurement(measurement.id, measurement.trf_path);
        this.measurements = this.measurements.filter((m) => m.id !== measurement.id);
        delete this.checked[measurement.id];
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

        const color = this.colorFor(measurement);
        const rows = rowsFromMeasurementJson(measurement.json_data);
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
