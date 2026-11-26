/**
 * The faint rim as pixels, not as palette numbers.
 *
 * Layer: test (browser).
 *
 * The palette tests measure the wash in the colour space the rule is written in. That is the right
 * place for the rule, and it cannot see what the renderer does on the way to the eye: the drape is
 * composited over *lit* terrain, and the frame is tone-mapped, both of which compress a designed
 * lightness step. So this test reads the canvas back and compares the same pixel with the coverage
 * drape on and off - the two reads are pixel-identical when nothing is patched (measured: max
 * difference 0.000 CIEDE2000 over 22 010 samples), so any difference that appears with the drape
 * toggled is the drape's doing.
 *
 * No coordinate is used to decide which pixel is the rim, because there is no honest one: the test
 * API's pointer pick slides along the plane the mast stands on, which is not the visible surface on
 * a hill. Instead the rim is recognised by what the rule does to a colour - it takes chroma away,
 * where the signal steps and the zone colours put chroma on. And only *interior* pixels are held to
 * the floor: the drape colours the coverage grid's vertices, so a cell's paint fades into its
 * neighbours over one cell (~30 m, a few pixels), and a pixel inside that fade is faint by design.
 * The fade is measured here too, and reported, because it is the rim's weakest ground.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { withApp } from '../harness/app.js';
import { chroma, labOf, worstDistance } from '../harness/colour.js';
import { rgbToHex } from '../../src/palette.js';

/** Sample every 4th canvas pixel: ~35 m at the default camera, finer than a coverage cell. */
const STEP_PX = 4;
/** A whole coverage cell of the same kind around a sample, so the sample is not in a fade. */
const INTERIOR_PX = 8;
const COVERAGE_OFF = '(() => { __sim.patch({ "display.showCoverage": false }); return true; })()';
const COVERAGE_ON = '(() => { __sim.patch({ "display.showCoverage": true }); return true; })()';

/**
 * Canvas pixels as an array, in canvas coordinates. The drawing buffer is copied through a 2D
 * context because a WebGL canvas gives no `getImageData` of its own; alpha separates sky, where
 * nothing was drawn and the drape cannot be judged.
 */
function samplerSource(step) {
  return `(() => {
    const canvas = document.getElementById('scene');
    const w = canvas.width;
    const h = canvas.height;
    const tmp = document.createElement('canvas');
    tmp.width = w;
    tmp.height = h;
    const ctx = tmp.getContext('2d');
    ctx.drawImage(canvas, 0, 0);
    const data = ctx.getImageData(0, 0, w, h).data;
    const out = [];
    for (let py = ${step} / 2; py < h; py += ${step}) {
      for (let px = ${step} / 2; px < w; px += ${step}) {
        const i = (py * w + px) * 4;
        if (data[i + 3] < 250) continue;
        out.push([data[i], data[i + 1], data[i + 2], px, py]);
      }
    }
    return out;
  })()`;
}

const rgb = (p) => [p[0] / 255, p[1] / 255, p[2] / 255];
const at = (p) => `${p[3]},${p[4]}`;

function percentile(list, q) {
  const s = [...list].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * q))];
}

test('browser: the faint rim is a colour the rendered map can be read by', async () => {
  await withApp(async (session) => {
    const washed = await session.evaluate(samplerSource(STEP_PX));
    await session.evaluate(COVERAGE_OFF);
    await session.settle(3);
    const bare = await session.evaluate(samplerSource(STEP_PX));
    await session.evaluate(COVERAGE_ON);
    await session.settle(2);

    const bareByKey = new Map(bare.map((p) => [at(p), p]));
    const pairs = washed.map((p) => ({ p, b: bareByKey.get(at(p)) })).filter((e) => e.b);
    // Two passes on purpose: the interior test asks about neighbouring samples, so the kind of
    // every pixel has to be known before any pixel is classified as inside or on a fade.
    const kinds = new Map();
    const metrics = new Map();
    for (const { p, b } of pairs) {
      const d = worstDistance(rgb(p), rgb(b));
      const chromaBefore = chroma(rgb(b));
      const chromaAfter = chroma(rgb(p));
      let kind = 'untouched';
      if (d > 2) kind = chromaAfter < chromaBefore - 1 ? 'rim' : (chromaAfter > chromaBefore + 4 ? 'painted' : 'other');
      kinds.set(at(p), kind);
      metrics.set(at(p), {
        d,
        chromaDrop: chromaBefore - chromaAfter,
        lightnessShift: labOf(rgb(p))[0] - labOf(rgb(b))[0],
      });
    }
    const neighbours = [[STEP_PX, 0], [-STEP_PX, 0], [0, STEP_PX], [0, -STEP_PX],
      [INTERIOR_PX, 0], [-INTERIOR_PX, 0], [0, INTERIOR_PX], [0, -INTERIOR_PX]];
    const samples = pairs.map(({ p, b }) => {
      const kind = kinds.get(at(p));
      if (kind === 'untouched' || kind === 'other') return null;
      const m = metrics.get(at(p));
      return {
        p, b, kind, ...m,
        interior: neighbours.every(([dx, dy]) => kinds.get(`${p[3] + dx},${p[4] + dy}`) === kind),
      };
    }).filter(Boolean);
    const rim = samples.filter((s) => s.kind === 'rim');
    const rimIn = rim.filter((s) => s.interior);
    const painted = samples.filter((s) => s.kind === 'painted');
    const describe = (list) => `n=${list.length} min=${Math.min(...list.map((s) => s.d)).toFixed(1)}`
      + ` p05=${percentile(list.map((s) => s.d), 0.05).toFixed(1)}`
      + ` median=${percentile(list.map((s) => s.d), 0.5).toFixed(1)}`;

    assert.ok(rimIn.length >= 300,
      `too few interior rim pixels to measure anything: ${rimIn.length} of ${rim.length} rim, ${painted.length} painted`);

    const gaps = rimIn.map((s) => s.d);
    assert.ok(percentile(gaps, 0.05) >= 10,
      `the rim fades into its own ground on the canvas: 5th percentile ${percentile(gaps, 0.05).toFixed(1)} dE000, worst ${Math.min(...gaps).toFixed(1)} over ${gaps.length} interior pixels`);
    assert.ok(percentile(gaps, 0.5) >= 13,
      `the rim is weak across the map, not only at its worst: median ${percentile(gaps, 0.5).toFixed(1)} dE000 over ${gaps.length} interior pixels`);

    // The pixels have to be the wash and not a lighting coincidence: the rule takes chroma off and
    // moves lightness by a lot, and both survive the compositing and the tone mapping.
    assert.ok(percentile(rimIn.map((s) => s.chromaDrop), 0.5) >= 1,
      `the rim pixels keep their ground's colour, so they are not the wash: median chroma drop ${percentile(rimIn.map((s) => s.chromaDrop), 0.5).toFixed(1)}`);
    assert.ok(percentile(rimIn.map((s) => Math.abs(s.lightnessShift)), 0.5) >= 5,
      `the rim pixels barely move in lightness: median shift ${percentile(rimIn.map((s) => s.lightnessShift), 0.5).toFixed(1)} L*`);

    // And the measurement has to span ground worth measuring: a rim tested over one flat backdrop
    // proves nothing about a rule whose whole point is the backdrop.
    const litL = rimIn.map((s) => labOf(rgb(s.b))[0]);
    const spread = Math.max(...litL) - Math.min(...litL);
    assert.ok(spread >= 15,
      `the rim was only measured over a narrow band of ground (L* ${Math.min(...litL).toFixed(0)} to ${Math.max(...litL).toFixed(0)}) - the sample grid is not covering the map`);

    // Reported, not asserted: the fade where a washed cell meets a cell the drape leaves alone. The
    // drape colours vertices, so over one cell the rim's colour and alpha run into its neighbour -
    // by design at the link's own edge, and the weakest place the rim has.
    const fade = rim.filter((s) => !s.interior).map((s) => s.d);
    process.stdout.write(`      rim on the canvas - interior ${describe(rimIn)}, all ${describe(rim)},`
      + ` fade band n=${fade.length} median ${fade.length ? percentile(fade, 0.5).toFixed(1) : 'n/a'} dE000,`
      + ` lit ground L* ${Math.min(...litL).toFixed(0)}-${Math.max(...litL).toFixed(0)},`
      + ` worst interior pixel ${rgbToHex(rgb(rimIn.reduce((a, b) => (a.d < b.d ? a : b)).b))}\n`);
  }, { viewport: { width: 900, height: 620 } });
});
