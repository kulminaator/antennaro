/**
 * Read-out panel (HUD): what the current configuration actually delivers.
 *
 * Layer: L5 (UI adapter). Pure presentation: `update(data)` receives already
 * computed numbers and writes them into a DOM tree built once at construction.
 * It never imports the physics modules, so it cannot accidentally recompute or
 * reinterpret anything.
 */

import { coverageLegendItems } from '../palette.js';
import { SECTOR_LABELS } from '../propagation/coverage.js';
import { formatDb } from '../math/scalar.js';

const STAT_ROWS = Object.freeze([
  Object.freeze({ key: 'peakGain', label: 'Peak gain' }),
  Object.freeze({ key: 'beamH', label: 'Azimuth -3 dB' }),
  Object.freeze({ key: 'beamV', label: 'Elevation -3 dB' }),
  Object.freeze({ key: 'fb', label: 'Front / back' }),
  Object.freeze({ key: 'eirp', label: 'EIRP at boresight' }),
  Object.freeze({ key: 'wavelength', label: 'Wavelength' }),
  Object.freeze({ key: 'fsRange', label: 'Free-space range' }),
  Object.freeze({ key: 'link', label: 'Cells with link' }),
  Object.freeze({ key: 'maxRange', label: 'Max linked range' }),
  Object.freeze({ key: 'best', label: 'Best RSSI' }),
  Object.freeze({ key: 'median', label: 'Median RSSI' }),
  Object.freeze({ key: 'worst', label: 'Worst RSSI' }),
  Object.freeze({ key: 'blocked', label: 'Shadowed cells' }),
]);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * @param {{root:HTMLElement}} options
 * @returns {{update:(data:object)=>void, dispose:()=>void}}
 */
export function createHud(options) {
  const { root } = options;
  /** @type {Map<string, HTMLElement>} */
  const cells = new Map();
  /** @type {Map<string, HTMLElement>} */
  const sectors = new Map();
  let legendList = null;

  const headline = el('div', 'hud-headline', 'Ready');
  const subtitle = el('div', 'hud-subtitle', '');
  const statsList = el('dl', 'hud-stats');
  for (const row of STAT_ROWS) {
    statsList.appendChild(el('dt', null, row.label));
    const value = el('dd', `stat-${row.key}`, '--');
    cells.set(row.key, value);
    statsList.appendChild(value);
  }

  const sectorTable = el('table', 'hud-sectors');
  const head = el('tr');
  head.appendChild(el('th', null, 'Dir'));
  head.appendChild(el('th', null, 'Linked'));
  head.appendChild(el('th', null, 'Range'));
  sectorTable.appendChild(head);
  for (const label of SECTOR_LABELS) {
    const tr = el('tr');
    tr.appendChild(el('th', null, label));
    const linked = el('td', `sector-linked-${label}`, '--');
    const range = el('td', `sector-range-${label}`, '--');
    sectors.set(label, { linked, range });
    tr.appendChild(linked);
    tr.appendChild(range);
    sectorTable.appendChild(tr);
  }

  legendList = el('ul', 'hud-legend');
  const notes = el('p', 'hud-notes', '');
  const perf = el('p', 'hud-perf', '');

  root.replaceChildren();
  const card = el('section', 'hud-card');
  card.appendChild(headline);
  card.appendChild(subtitle);
  card.appendChild(statsList);
  card.appendChild(el('h3', 'hud-subtitle', 'Link availability by direction'));
  card.appendChild(sectorTable);
  card.appendChild(el('h3', 'hud-subtitle', 'Coverage legend'));
  card.appendChild(legendList);
  card.appendChild(notes);
  card.appendChild(perf);
  root.appendChild(card);

  function set(key, text) {
    const node = cells.get(key);
    if (node) node.textContent = text;
  }

  function renderLegend(coverage) {
    legendList.replaceChildren();
    for (const item of coverageLegendItems(coverage)) {
      const li = el('li', 'legend-item');
      const swatch = el('span', 'legend-swatch');
      swatch.style.background = item.colour;
      li.appendChild(swatch);
      li.appendChild(el('span', 'legend-label', item.label));
      li.appendChild(el('span', 'legend-count', `${item.count}`));
      legendList.appendChild(li);
    }
  }

  function update(data) {
    const { antenna, coverage, rf, view, state } = data;
    if (!antenna || !coverage || !rf) return;

    headline.textContent = antenna.label;
    subtitle.textContent = `${antenna.aimText} - ${state.heightM.toFixed(1)} m above ground`;

    set('peakGain', `${antenna.peakGainDbi.toFixed(2)} dBi`);
    set('beamH', antenna.hBeamwidthDeg >= 359 ? 'omnidirectional' : `${antenna.hBeamwidthDeg.toFixed(0)} deg`);
    set('beamV', `${antenna.vBeamwidthDeg.toFixed(0)} deg`);
    set('fb', antenna.frontToBackDb > 0.5 ? `${antenna.frontToBackDb.toFixed(1)} dB` : 'n/a');
    set('eirp', `${formatDb(rf.eirpDbm)} dBm`);
    set('wavelength', `${(rf.wavelengthM * 100).toFixed(1)} cm`);
    set('fsRange', `${(rf.freeSpaceRangeM / 1000).toFixed(2)} km`);

    const cov = coverage.stats;
    set('link', `${cov.linkAvailabilityPct.toFixed(1)} % (${cov.linkedCells}/${cov.evaluatedCells})`);
    set('maxRange', cov.maxLinkedRangeM > 0
      ? `${cov.maxLinkedRangeM.toFixed(0)} m @ ${cov.maxLinkedBearingDeg.toFixed(0)} deg`
      : 'none');
    set('best', `${formatDb(cov.bestDbm)} dBm`);
    set('median', `${formatDb(cov.medianDbm)} dBm`);
    set('worst', `${formatDb(cov.worstDbm)} dBm`);
    set('blocked', `${cov.blockedPct.toFixed(1)} % (> 6 dB diffracted)`);

    for (const sector of cov.sectors) {
      const row = sectors.get(sector.label);
      if (!row) continue;
      row.linked.textContent = `${sector.linkedPct.toFixed(0)} %`;
      row.range.textContent = sector.maxRangeM > 0 ? `${sector.maxRangeM.toFixed(0)} m` : '-';
    }

    renderLegend(coverage);
    notes.textContent = 'Antenna hardware is drawn enlarged to stay visible; the mast is true scale. '
      + 'Free space + terrain diffraction only: no clutter, vegetation, multipath or receiver noise figure.';
    if (view) {
      perf.textContent = `${view.fps.toFixed(0)} fps - ${view.calls} draw calls - `
        + `${view.triangles.toLocaleString('en-US')} tris - camera ${view.azimuthDeg.toFixed(0)}/${view.elevationDeg.toFixed(0)}/${(view.distance / 1000).toFixed(2)} km`;
    }
  }

  function dispose() {
    cells.clear();
    sectors.clear();
    root.replaceChildren();
  }

  return { update, dispose };
}
