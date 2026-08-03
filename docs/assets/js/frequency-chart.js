const X_RANGE_HZ = [20, 20000];

const Y_RANGE_DB = [-15, 5];
const Y_MAJOR_DTICK = 5;
const Y_MINOR_DTICK = 1;

const GRID_COLOR_MAJOR = '#000000';
const GRID_COLOR_MINOR = '#d1d5db';

// Smaartの表示に合わせ、各桁の1/2/3/4/6/8倍の位置にグリッドを引く
// （例: 20,30,40,60,80,100,200,300,400,600,800,1k,2k...）。
function buildXMajorTickvals() {
  const digits = [1, 2, 3, 4, 6, 8];
  const values = [];
  for (let decade = 10; decade <= 10000; decade *= 10) {
    digits.forEach((digit) => {
      const value = digit * decade;
      if (value >= X_RANGE_HZ[0] && value <= X_RANGE_HZ[1]) {
        values.push(value);
      }
    });
  }
  return values;
}

const X_MAJOR_TICKVALS = buildXMajorTickvals();

function formatFrequencyLabel(hz) {
  return hz >= 1000 ? `${hz / 1000}k` : String(hz);
}

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
      zeroline: false,
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
