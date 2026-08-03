import { initAuthenticatedPage } from '../layout.js';
import { parseTrfFile, smoothFractionalOctave, DEFAULT_SMOOTHING_FRACTION } from '../trf-parser.js';
import { renderFrequencyResponseChart } from '../frequency-chart.js';

export function trfTest() {
  return {
    fraction: DEFAULT_SMOOTHING_FRACTION,
    result: null,
    smoothedRows: [],
    loading: false,
    errorMessage: '',
    async init() {
      await initAuthenticatedPage();
    },
    async onFileSelected(event) {
      const file = event.target.files[0];
      if (!file) return;

      this.loading = true;
      this.errorMessage = '';
      this.result = null;

      try {
        this.result = await parseTrfFile(file);
        this.resmooth();
      } catch (error) {
        console.error(error);
        this.errorMessage = error.message;
      } finally {
        this.loading = false;
      }
    },
    resmooth() {
      if (!this.result) return;

      this.smoothedRows = smoothFractionalOctave(this.result.rows, this.fraction);

      renderFrequencyResponseChart('trf-chart', [
        {
          x: this.smoothedRows.map((r) => r.frequency),
          y: this.smoothedRows.map((r) => r.rawMagnitude),
          type: 'scatter',
          mode: 'lines',
          name: 'Raw',
          line: { width: 1, color: '#9ca3af' }
        },
        {
          x: this.smoothedRows.map((r) => r.frequency),
          y: this.smoothedRows.map((r) => r.smoothedMagnitude),
          type: 'scatter',
          mode: 'lines',
          name: `1/${this.fraction} oct smoothed`,
          line: { width: 2, color: '#2563eb' }
        }
      ], { showLegend: true });
    }
  };
}
