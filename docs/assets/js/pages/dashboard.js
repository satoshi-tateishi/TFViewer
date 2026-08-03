import { initAuthenticatedPage } from '../layout.js';

export async function init() {
  await initAuthenticatedPage();

  Plotly.newPlot('smoke-test-chart', [{
    x: [20, 100, 1000, 10000, 20000],
    y: [0, 1, -1, 0.5, 0],
    type: 'scatter',
    mode: 'lines',
    name: '動作確認用ダミーデータ'
  }], {
    title: 'Plotly動作確認',
    xaxis: { title: 'Frequency [Hz]', type: 'log' },
    yaxis: { title: 'Magnitude [dB]', range: [-18, 18] }
  }, { responsive: true });
}
