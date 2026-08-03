const X_RANGE_HZ = [40, 20000];

const Y_RANGE_DB = [-15, 5];
const Y_MAJOR_DTICK = 5;
const Y_MINOR_DTICK = 1;

const GRID_COLOR_MAJOR = '#000000';
const GRID_COLOR_MINOR = '#d1d5db';

// 1オクターブごとの標準中心周波数にラベル・グリッドを引く
// （31.5, 63, 125, 250, 500, 1k, 2k, 4k, 8k, 16k, ...）。
function buildXMajorTickvals() {
  const OCTAVE_BANDS = [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000, 31500];
  return OCTAVE_BANDS.filter((value) => value >= X_RANGE_HZ[0] && value <= X_RANGE_HZ[1]);
}

function formatFrequencyLabel(hz) {
  return hz >= 1000 ? `${hz / 1000}k` : String(hz);
}

const X_MAJOR_TICKVALS = buildXMajorTickvals();
const X_MAJOR_TICKTEXT = X_MAJOR_TICKVALS.map(formatFrequencyLabel);

const HOVER_TEMPLATE = '%{y:.1f} dB<extra></extra>';

export function renderFrequencyResponseChart(elementId, traces, { showLegend = false } = {}) {
  const tracesWithHover = traces.map((trace) => ({
    hovertemplate: HOVER_TEMPLATE,
    ...trace
  }));

  const layout = {
    margin: { t: 20, r: 10, l: 30, b: 40 },
    xaxis: {
      type: 'log',
      range: [Math.log10(X_RANGE_HZ[0]), Math.log10(X_RANGE_HZ[1])],
      tickmode: 'array',
      tickvals: X_MAJOR_TICKVALS,
      ticktext: X_MAJOR_TICKTEXT,
      tickangle: -90,
      showgrid: true,
      gridcolor: GRID_COLOR_MAJOR,
      gridwidth: 1,
      showspikes: true,
      spikemode: 'across',
      spikedash: 'dash',
      spikethickness: 1,
      spikecolor: '#6b7280',
      hoverformat: ',.0f'
    },
    yaxis: {
      range: Y_RANGE_DB,
      dtick: Y_MAJOR_DTICK,
      showgrid: true,
      gridcolor: GRID_COLOR_MAJOR,
      gridwidth: 1,
      zeroline: true,
      zerolinecolor: GRID_COLOR_MAJOR,
      zerolinewidth: 2.5,
      showspikes: false,
      minor: {
        dtick: Y_MINOR_DTICK,
        showgrid: true,
        gridcolor: GRID_COLOR_MINOR,
        gridwidth: 1
      }
    },
    showlegend: showLegend,
    legend: { orientation: 'v', x: 0, xanchor: 'left', y: -0.15, yanchor: 'top' },
    dragmode: false,
    hovermode: 'x',
    spikedistance: -1
  };

  const config = {
    responsive: true,
    displaylogo: false,
    displayModeBar: false,
    doubleClick: false
  };

  Plotly.newPlot(elementId, tracesWithHover, layout, config);
}
