/**
 * Read-out panel (HUD): what the current configuration actually delivers.
 *
 * Layer: L5 (UI adapter). Pure presentation: `update(data)` receives already
 * computed numbers and writes them into a DOM tree built once at construction.
 * It never imports the physics modules, so it cannot accidentally recompute or
 * reinterpret anything.
 */

import { coverageLegendItems, fresnelZoneLegendItems, rangeGradientLegendItems } from '../palette.js';
import { SECTOR_LABELS } from '../propagation/coverage.js';
import { formatDb } from '../math/scalar.js';

const STAT_ROWS = Object.freeze([
  Object.freeze({ key: 'site', label: 'Site position' }),
  Object.freeze({ key: 'peakGain', label: 'Peak gain' }),
  Object.freeze({ key: 'beamH', label: 'Azimuth -3 dB' }),
  Object.freeze({ key: 'beamV', label: 'Elevation -3 dB' }),
  Object.freeze({ key: 'fb', label: 'Front / back' }),
  Object.freeze({ key: 'eirp', label: 'EIRP at boresight' }),
  Object.freeze({ key: 'wavelength', label: 'Wavelength' }),
  Object.freeze({ key: 'fsRange', label: 'Free-space range' }),
  Object.freeze({ key: 'rangeLimit', label: 'Range limit' }),
  Object.freeze({ key: 'curvature', label: 'Curvature' }),
  Object.freeze({ key: 'link', label: 'Cells with link' }),
  Object.freeze({ key: 'avail', label: 'Served within reach' }),
  Object.freeze({ key: 'maxRange', label: 'Max linked range' }),
  Object.freeze({ key: 'best', label: 'Best RSSI' }),
  Object.freeze({ key: 'median', label: 'Median RSSI' }),
  Object.freeze({ key: 'worst', label: 'Worst RSSI' }),
  Object.freeze({ key: 'blocked', label: 'Shadowed cells' }),
  Object.freeze({ key: 'fresnel', label: 'First Fresnel zone' }),
]);

/**
 * One line answering the question the coverage picture cannot: is this edge the
 * antenna's reach, or the app's own work area? Each sentence names the limit *and* the
 * number that would apply without it, because that is the thing a user cannot infer
 * from a drape that simply stops.
 */
const LIMIT_SENTENCES = Object.freeze({
  budget: (c) => `the link: budget ${km(c.budgetRangeM)}, last link ${km(c.maxLinkedRangeM)}`,
  'study-range': (c) => `our study range ${km(c.studyRangeM)} - `
    + `the link would reach ${km(c.budgetRangeM)}`,
  'map-edge': (c) => `edge of the map ${km(c.nearestMapEdgeM)} - `
    + `the link would reach ${km(c.budgetRangeM)}`,
});

const LEGEND_TITLES = Object.freeze({
  bands: 'Coverage legend',
  gradient: 'Range gradient legend',
  zone: 'Fresnel zone legend',
});

/**
 * What the legend's rows do not say. The banded and gradient legends carry a row per
 * absence, so they need no note; the zone rows are clearance categories, which count a
 * measured path whether or not it linked, so the faint rim it paints needs a sentence.
 */
const LEGEND_NOTES = Object.freeze({
  zone: 'every row counts paths the ground was asked about, link or no link: '
    + 'faint pixels are measured and failed, blank ground was never measured',
});

const km = (metres) => `${(metres / 1000).toFixed(2)} km`;

/**
 * How the earth's shape shows up in this picture. Two numbers are in play and they pull
 * in opposite directions: the bulge under the longest link is centimetres on a map this
 * small, while the smooth-earth horizon is several maps wide - so the honest sentence is
 * usually "the curve is real and it is not your problem". It is printed anyway, with the
 * factor that produced it, because a reader who suspects the round earth is hiding their
 * signal should be able to do the arithmetic and see.
 */
const CURVATURE_SENTENCES = Object.freeze({
  beyondMap: (c) => `k ${c.kFactor.toFixed(2)} - the ray bows ${shortMetres(c.earthBulgeUnderMaxLinkM)} `
    + `over the last ${km(c.maxLinkedRangeM)} link; the earth curves away long before this map ends`,
  horizonBeyondLink: (c) => `k ${c.kFactor.toFixed(2)} - ray bows ${shortMetres(c.earthBulgeUnderMaxLinkM)} `
    + `over ${km(c.maxLinkedRangeM)}; a smooth earth would let these heights reach ${km(c.radioHorizonM)}`,
  horizonBinding: (c) => `k ${c.kFactor.toFixed(2)} - the smooth-earth horizon ${km(c.radioHorizonM)} is `
    + `inside the last link ${km(c.maxLinkedRangeM)}: the curve, not the budget, ends it`,
  noLink: (c) => `k ${c.kFactor.toFixed(2)} - nothing linked, so nothing curved over`,
});

/** Metres, with enough decimals to be meaningful: this term is small at this scale. */
function shortMetres(value) {
  if (!(value > 0)) return '0 m';
  if (value < 0.1) return `${value.toFixed(3)} m`;
  if (value < 10) return `${value.toFixed(2)} m`;
  return `${value.toFixed(1)} m`;
}

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
  const legendList = el('ul', 'hud-legend');
  let legendTitle = null;

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
  const sectorNote = el('p', 'hud-notes', '');

  const notes = el('p', 'hud-notes', '');
  const perf = el('p', 'hud-perf', '');

  root.replaceChildren();
  const card = el('section', 'hud-card');
  card.appendChild(headline);
  card.appendChild(subtitle);
  card.appendChild(statsList);
  card.appendChild(el('h3', 'hud-subtitle', 'Link availability by direction'));
  card.appendChild(sectorTable);
  card.appendChild(sectorNote);
  legendTitle = el('h3', 'hud-subtitle', 'Coverage legend');
  card.appendChild(legendTitle);
  card.appendChild(legendList);
  card.appendChild(notes);
  card.appendChild(perf);
  root.appendChild(card);

  function set(key, text) {
    const node = cells.get(key);
    if (node) node.textContent = text;
  }

  function renderLegend(coverage, view) {
    // The legend describes the pixels beneath it, so it changes when the drape does -
    // one entry per value of `display.coverageView`, and nothing else decides.
    legendTitle.textContent = LEGEND_TITLES[view] ?? LEGEND_TITLES.bands;
    const items = (view === 'zone'
      ? fresnelZoneLegendItems(coverage.stats)
      : (view === 'gradient' ? rangeGradientLegendItems(coverage) : coverageLegendItems(coverage)));
    legendList.replaceChildren();
    for (const item of items) {
      const li = el('li', 'legend-item');
      const swatch = el('span', 'legend-swatch');
      swatch.style.background = item.colour;
      // The swatch has to be as faint as the pixels it describes; a legend that paints
      // the failed-link rim at full strength would not match the map beneath it.
      swatch.style.opacity = String(item.alpha ?? 1);
      li.appendChild(swatch);
      li.appendChild(el('span', 'legend-label', item.label));
      li.appendChild(el('span', 'legend-count', `${item.count}`));
      legendList.appendChild(li);
    }
    const note = LEGEND_NOTES[view];
    if (note) legendList.appendChild(el('li', 'legend-note', note));
  }

  function update(data) {
    const { antenna, coverage, rf, view, state } = data;
    if (!antenna || !coverage || !rf) return;

    headline.textContent = antenna.label;
    subtitle.textContent = `${antenna.aimText} - ${state.heightM.toFixed(1)} m above ground`;

    // Spelled out in compass words, because the frame is +X east / +Z south and a
    // bare pair of numbers invites the wrong reading.
    const place = state.site ?? { x: 0, z: 0 };
    set('site', `${Math.abs(place.x).toFixed(0)} m ${place.x >= 0 ? 'E' : 'W'} / `
      + `${Math.abs(place.z).toFixed(0)} m ${place.z >= 0 ? 'S' : 'N'}`);

    set('peakGain', `${antenna.peakGainDbi.toFixed(2)} dBi`);
    set('beamH', antenna.hBeamwidthDeg >= 359 ? 'omnidirectional' : `${antenna.hBeamwidthDeg.toFixed(0)} deg`);
    set('beamV', `${antenna.vBeamwidthDeg.toFixed(0)} deg`);
    set('fb', antenna.frontToBackDb > 0.5 ? `${antenna.frontToBackDb.toFixed(1)} dB` : 'n/a');
    set('eirp', `${formatDb(rf.eirpDbm)} dBm`);
    set('wavelength', `${(rf.wavelengthM * 100).toFixed(1)} cm`);
    set('fsRange', `${(rf.freeSpaceRangeM / 1000).toFixed(2)} km`);

    const cov = coverage.stats;
    // The binding limit in words. When it is `'budget'` that is good news: the picture
    // ends where the link does. Otherwise the user is looking at a border of the app.
    set('rangeLimit', (LIMIT_SENTENCES[cov.limitingFactor] ?? LIMIT_SENTENCES.budget)(cov));
    // Which of the two curvature numbers has anything to say about this picture. On a map
    // smaller than the horizon - every map this app draws - that is the "beyondMap" one.
    set('curvature', cov.linkedCells === 0
      ? CURVATURE_SENTENCES.noLink(cov)
      : (cov.radioHorizonM <= cov.maxLinkedRangeM
        ? CURVATURE_SENTENCES.horizonBinding(cov)
        : (cov.radioHorizonM <= cov.worldSizeM
          ? CURVATURE_SENTENCES.horizonBeyondLink(cov)
          : CURVATURE_SENTENCES.beyondMap(cov))));
    // Two shares, each labelled with what it is a share *of*: the map, and the ground
    // where a link was even possible. Quoting one number without its denominator is how
    // a big map next to a small link gets read as a poor antenna.
    set('link', `${cov.linkedCells} of ${cov.evaluatedCells} points (${cov.mapCoveragePct.toFixed(1)} % of the map)`);
    set('avail', `${cov.linkAvailabilityPct.toFixed(1)} % of ground a link could reach`);
    set('maxRange', cov.maxLinkedRangeM > 0
      ? `${cov.maxLinkedRangeM.toFixed(0)} m @ ${cov.maxLinkedBearingDeg.toFixed(0)} deg`
      : 'none');
    set('best', `${formatDb(cov.bestDbm)} dBm`);
    set('median', `${formatDb(cov.medianDbm)} dBm`);
    set('worst', `${formatDb(cov.worstDbm)} dBm`);
    set('blocked', `${cov.blockedPct.toFixed(1)} % (> 6 dB diffracted)`);
    // The zone verdict next to the decibels, because that is the whole point of it:
    // links that make the budget with the zone cut work on paper and misbehave outside.
    set('fresnel', `${cov.fresnelClearPct.toFixed(1)} % of linked points clear - `
      + `${cov.fresnelObstructedLinkedCells} linked with the zone cut - `
      + `worst ${cov.worstClearance.toFixed(1)} r1 @ ${cov.worstClearanceDistanceM.toFixed(0)} m`);

    let clipped = null;
    for (const sector of cov.sectors) {
      const row = sectors.get(sector.label);
      if (!row) continue;
      row.linked.textContent = `${sector.linkedPct.toFixed(0)} %`;
      row.linked.title = `${sector.linked} of ${sector.evaluated - sector.excluded} points where a link was possible`;
      const reach = sector.maxRangeM > 0 ? `${sector.maxRangeM.toFixed(0)} m` : '-';
      row.range.textContent = sector.clippedBy ? `>= ${reach}` : reach;
      row.range.title = sector.clippedBy
        ? `the link was still alive here: we stopped looking at ${sector.limitM.toFixed(0)} m (${sector.limitKind})`
        : 'farthest linked point in this direction';
      if (sector.clippedBy && (!clipped || sector.limitM < clipped.limitM)) clipped = sector;
    }
    sectorNote.textContent = clipped
      ? `>= the link was still alive where we stopped looking: ${clipped.limitKind} at `
        + `${km(clipped.limitM)} (a ${clipped.label} link would go further).`
      : '';

    renderLegend(coverage, state.display?.coverageView ?? 'bands');
    notes.textContent = 'Antenna hardware is drawn enlarged to stay visible; the mast is true scale. '
      + 'A pale ring, when drawn, is the area this sweep evaluated - our work area, not a signal limit. '
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
