import { initAuthenticatedPage } from '../layout.js';
import { listMeasurements, deleteMeasurement, updateMeasurementOrder } from '../measurements.js';
import { smoothFractionalOctave, rowsFromMeasurementJson } from '../trf-parser.js';
import { getSmoothingFraction, setSmoothingFraction } from '../smoothing-setting.js';
import { getCoherenceThreshold, setCoherenceThreshold } from '../coherence-setting.js';
import { renderFrequencyResponseChart } from '../frequency-chart.js';

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

function formatUpdatedAt(iso) {
  const date = new Date(iso);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  return `${yyyy}/${mm}/${dd} ${hh}:${mi}`;
}

export function measurementList() {
  return {
    isAdmin: false,
    canReorder: false,
    loading: true,
    errorMessage: '',
    measurements: [],
    checked: {},
    fraction: getSmoothingFraction(),
    coherenceThreshold: getCoherenceThreshold(),
    formatUpdatedAt,
    async init() {
      const result = await initAuthenticatedPage();
      this.isAdmin = result?.profile?.role === 'Admin';
      this.canReorder = ['Admin', 'Editor'].includes(result?.profile?.role);

      try {
        this.measurements = await listMeasurements();
        this.measurements.forEach((measurement) => {
          this.checked[measurement.id] = true;
        });
      } catch (error) {
        console.error(error);
        this.errorMessage = '一覧の取得に失敗しました。';
      } finally {
        this.loading = false;
        this.renderChart();
      }
    },
    async move(index, offset) {
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
        alert('削除に失敗しました。');
      }
    },
    // 色は一覧の並び順（上から順）に固定し、チェックON/OFFでは変わらない。
    // 入れ替えたい場合は▲▼で並び替える。
    colorForIndex(index) {
      return TRACE_COLORS[index % TRACE_COLORS.length];
    },
    swatchStyle(index) {
      return `background-color: ${this.colorForIndex(index)}`;
    },
    renderChart() {
      const traces = [];

      this.measurements.forEach((measurement, index) => {
        if (!this.checked[measurement.id]) return;

        const color = this.colorForIndex(index);
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
