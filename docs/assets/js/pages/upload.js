import { initAuthenticatedPage } from '../layout.js';
import {
  parseTrfFile,
  smoothFractionalOctave,
  buildMeasurementJson,
  DEFAULT_SMOOTHING_FRACTION,
  SMOOTHING_FRACTION_OPTIONS
} from '../trf-parser.js';
import {
  listActiveMicrophoneHeadsForSelect,
  listMeasurementTypes,
  registerMeasurement
} from '../measurements.js';

function todayDateString() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function uploadForm() {
  return {
    session: null,
    microphoneHeads: [],
    measurementTypes: [],
    fractionOptions: SMOOTHING_FRACTION_OPTIONS,
    loadingOptions: true,
    isDragging: false,
    parsing: false,
    registering: false,
    errorMessage: '',
    selectedFile: null,
    parsedFileName: '',
    parsedResult: null,
    smoothedRows: [],
    form: {
      microphoneHeadId: '',
      measurementTypeId: '',
      measuredAt: todayDateString(),
      note: '',
      measurementName: '',
      smoothingFraction: DEFAULT_SMOOTHING_FRACTION
    },
    get canRegister() {
      return (
        this.form.microphoneHeadId &&
        this.form.measurementTypeId &&
        this.form.measuredAt &&
        this.form.measurementName &&
        this.parsedResult &&
        !this.registering
      );
    },
    async init() {
      const result = await initAuthenticatedPage();
      this.session = result?.session ?? null;

      try {
        [this.microphoneHeads, this.measurementTypes] = await Promise.all([
          listActiveMicrophoneHeadsForSelect(),
          listMeasurementTypes()
        ]);
      } catch (error) {
        console.error(error);
        this.errorMessage = '選択肢の取得に失敗しました。';
      } finally {
        this.loadingOptions = false;
      }
    },
    onDrop(event) {
      this.isDragging = false;
      const file = event.dataTransfer?.files?.[0];
      if (file) this.handleFile(file);
    },
    onFileSelected(event) {
      const file = event.target.files?.[0];
      if (file) this.handleFile(file);
    },
    async handleFile(file) {
      this.selectedFile = file;
      this.parsedFileName = file.name;
      this.parsedResult = null;
      this.errorMessage = '';
      this.parsing = true;

      try {
        this.parsedResult = await parseTrfFile(file);
        this.form.measurementName = this.parsedResult.measurementName;
        this.resmooth();
      } catch (error) {
        console.error(error);
        this.errorMessage = error.message;
      } finally {
        this.parsing = false;
      }
    },
    resmooth() {
      if (!this.parsedResult) return;

      this.smoothedRows = smoothFractionalOctave(this.parsedResult.rows, this.form.smoothingFraction);

      Plotly.newPlot('preview-chart', [
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
          name: `1/${this.form.smoothingFraction} oct smoothed`,
          line: { width: 2, color: '#2563eb' }
        }
      ], {
        margin: { t: 20, r: 10, l: 40, b: 40 },
        xaxis: { title: 'Frequency [Hz]', type: 'log', range: [Math.log10(20), Math.log10(20000)] },
        yaxis: { title: 'Magnitude [dB]', range: [-18, 18] },
        legend: { orientation: 'h' }
      }, { responsive: true });
    },
    async register() {
      if (!this.canRegister) return;

      this.registering = true;
      this.errorMessage = '';

      try {
        const saved = await registerMeasurement({
          microphoneHeadId: this.form.microphoneHeadId,
          measurementTypeId: this.form.measurementTypeId,
          measurementName: this.form.measurementName,
          measuredAt: this.form.measuredAt,
          measuredBy: this.session.user.id,
          note: this.form.note,
          smoothingFraction: this.form.smoothingFraction,
          jsonData: buildMeasurementJson(this.smoothedRows),
          file: this.selectedFile
        });

        window.location.href = `./microphone-detail.html?id=${saved.microphone_head_id}`;
      } catch (error) {
        console.error(error);
        this.errorMessage = '登録に失敗しました。';
      } finally {
        this.registering = false;
      }
    }
  };
}
