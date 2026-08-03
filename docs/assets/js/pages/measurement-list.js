import { initAuthenticatedPage } from '../layout.js';
import { listMeasurements, deleteMeasurement } from '../measurements.js';
import { smoothFractionalOctave, rowsFromMeasurementJson } from '../trf-parser.js';
import { getSmoothingFraction, setSmoothingFraction } from '../smoothing-setting.js';
import { renderFrequencyResponseChart } from '../frequency-chart.js';

const TRACE_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d'];

export function measurementList() {
  return {
    isAdmin: false,
    loading: true,
    errorMessage: '',
    measurements: [],
    checked: {},
    fraction: getSmoothingFraction(),
    async init() {
      const result = await initAuthenticatedPage();
      this.isAdmin = result?.profile?.role === 'administrator';

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
        this.$nextTick(() => this.initSortable());
      }
    },
    initSortable() {
      const container = document.getElementById('measurement-list');
      if (!container) return;

      // SortableJSがDOMを並び替えた後、その並びをそのままAlpineの配列へ反映する。
      // 凡例の順序はグラフのtrace配列順=この配列順で決まる。
      new Sortable(container, {
        animation: 150,
        handle: '.drag-handle',
        onEnd: (event) => {
          if (event.oldIndex === event.newIndex) return;
          const moved = this.measurements.splice(event.oldIndex, 1)[0];
          this.measurements.splice(event.newIndex, 0, moved);
          this.renderChart();
        }
      });
    },
    onFractionChange() {
      setSmoothingFraction(this.fraction);
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
    // 入れ替えたい場合はDnDで並び替える。
    colorForIndex(index) {
      return TRACE_COLORS[index % TRACE_COLORS.length];
    },
    swatchStyle(index) {
      return `background-color: ${this.colorForIndex(index)}`;
    },
    renderChart() {
      const traces = this.measurements
        .map((measurement, index) => ({ measurement, color: this.colorForIndex(index) }))
        .filter(({ measurement }) => this.checked[measurement.id])
        .map(({ measurement, color }) => {
          const rows = rowsFromMeasurementJson(measurement.json_data);
          const smoothed = smoothFractionalOctave(rows, this.fraction);

          return {
            x: smoothed.map((row) => row.frequency),
            y: smoothed.map((row) => row.smoothedMagnitude),
            type: 'scatter',
            mode: 'lines',
            name: measurement.file_name,
            line: { width: 2, color }
          };
        });

      renderFrequencyResponseChart('compare-chart', traces);
    }
  };
}
