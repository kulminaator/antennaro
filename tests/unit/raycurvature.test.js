/**
 * Unit tests: how the ray sits on a round earth.
 *
 * `earthBulgeM()` is a magnitude, and a magnitude alone cannot say which way the ray
 * moves. This file is where the *direction* lives, because the direction is the whole
 * difference between a model that hides what is over the horizon and one that reveals
 * it: in the equivalent-round-earth transform the terrain is planar (which is what a
 * height field is), so it is the **ray** that bends down toward the terrain.
 *
 * Nothing here quotes a metre reading of a real map. Everything is derived from
 * `earthBulgeM()` and `radioHorizonM()` - the same two formulas the read-out quotes to
 * users - so the tests say the geometry is consistent, not that it produces a picture
 * that happens to look right today.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ANTENNA, RF } from '../../src/config.js';
import { HeightField } from '../../src/terrain/heightfield.js';
import { earthBulgeM, radioHorizonM } from '../../src/propagation/rf.js';
import { hasLineOfSight, rayProfile } from '../../src/propagation/los.js';

const FREQ_HZ = 868e6;

/** A flat world `worldSize` across, tall enough in cells to be sampled finely. */
function plane(worldSize, size = 401) {
  return new HeightField({ size, worldSize });
}

test('los: the round earth puts ground between two points that can see each other flat', () => {
  const field = plane(40000);
  const mastM = 10;
  const totalM = 30000;
  const from = { x: -totalM / 2, y: mastM, z: 0 };
  const to = { x: totalM / 2, y: 0, z: 0 };
  const profile = rayProfile(field, from, to, { samples: 96, freqHz: FREQ_HZ });

  // Derived, not remembered: over the flat chord the straight ray stands at the average
  // of its two ends halfway along, while the earth's surface bows up toward that chord by
  // `earthBulgeM`. With k = 1.413 that is 12.5 m of bulge against 5 m of ray, so the
  // ground should be about 7.5 m above the ray and the path blocked.
  const bulge = earthBulgeM(totalM / 2, totalM / 2);
  const chordHeightM = (from.y + to.y) / 2;
  assert.ok(bulge > chordHeightM,
    `this geometry is only interesting if the bulge beats the ray: ${bulge} m vs ${chordHeightM} m`);
  assert.ok(profile.worstExcess > 0,
    `the earth must bury the ray, but the profile reports a worst excess of ${profile.worstExcess} m`);
  assert.ok(profile.maxExcessDistance > totalM * 0.25 && profile.maxExcessDistance < totalM * 0.75,
    `the block should be mid-path, not at an end: ${profile.maxExcessDistance} m of ${totalM} m`);
  assert.ok(!hasLineOfSightHere(profile), 'a profile buried under the earth is not line of sight');
});

test('los: the ray is the chord minus the bulge, at every sample', () => {
  const field = plane(40000);
  const from = { x: -15000, y: 10, z: 0 };
  const to = { x: 15000, y: 4, z: 0 };
  const profile = rayProfile(field, from, to, { samples: 24, freqHz: FREQ_HZ });
  const { points, totalDistance } = profile;

  for (const point of points) {
    const t = point.distance / totalDistance;
    const chord = from.y + (to.y - from.y) * t;
    const expected = chord - earthBulgeM(point.distance, totalDistance - point.distance);
    assert.ok(Math.abs(point.rayY - expected) < 1e-3,
      `at ${point.distance.toFixed(0)} m the ray is ${point.rayY} m, the chord less the bulge is ${expected} m`);
  }
  // The ends are anchored: a bulge that moved an antenna would silently raise or lower
  // every path on the map, and `earthBulgeM` is zero when either leg is.
  assert.equal(points[0].rayY, from.y, 'the transmitter does not float');
  assert.ok(Math.abs(points[points.length - 1].rayY - to.y) < 1e-9, 'the receiver does not sink');
});

test('los: a path past the radio horizon is buried, and a flat earth has no horizon', () => {
  // Both ends at the same height is the one geometry where the profile and the textbook
  // horizon are provably the same statement: the ray's lowest point relative to the
  // terrain is dead centre, where the bulge is `D^2 / (8 k R)`, and
  // `radioHorizonM(h, h)` is `2 * sqrt(2 k R h)` - the distance at which those two
  // numbers are equal. So this test fails if either formula drifts away from the other.
  const heightM = ANTENNA.heightLimitsM.min;
  const horizonM = radioHorizonM(heightM, heightM);
  assert.ok(Number.isFinite(horizonM) && horizonM > 0, 'a round earth must have a horizon');
  const field = plane(3 * horizonM, 601);
  const at = (fraction) => {
    const half = (fraction * horizonM) / 2;
    return rayProfile(field, { x: -half, y: heightM, z: 0 }, { x: half, y: heightM, z: 0 },
      { samples: 96, freqHz: FREQ_HZ });
  };

  assert.ok(at(0.8).worstExcess < 0, 'well inside the horizon nothing is in the way');
  assert.ok(at(0.8).maxExcess === 0, 'and a clear path is charged no obstruction at all');
  assert.ok(at(1.2).worstExcess > 0, 'past the horizon the earth itself is the obstacle');
  assert.ok(at(1.2).maxExcessDistance > horizonM * 0.4 && at(1.2).maxExcessDistance < horizonM,
    'and it is buried where the geometry says: at the middle of the path');

  // Control: with the bulge forced to zero the long link must be clear. This is what
  // stops "fix the sign" from being satisfied by deleting the curvature altogether.
  const flat = rayProfile(field,
    { x: -(1.2 * horizonM) / 2, y: heightM, z: 0 },
    { x: (1.2 * horizonM) / 2, y: heightM, z: 0 },
    { samples: 96, freqHz: FREQ_HZ, kFactor: 0 });
  assert.ok(flat.worstExcess < 0, 'a flat earth has no horizon, so nothing blocks it');
  assert.ok(RF.kFactor > 0, 'and the app ships a round earth, so the case above is real');
});

/**
 * The headline invariant, for the height pairs the app actually talks about.
 *
 * `radioHorizonM()` is printed to users; `rayProfile()` decides coverage. If they are
 * the same piece of geometry then the distance at which the horizon formula says "the
 * two antennas can just see each other" must be the distance at which the profile
 * reports its ray exactly grazing the ground - not approximately, and not in one
 * direction only. That is what this asserts, for three pairs: the lowest mast the panel
 * allows with an equal-height terminal, that same mast with the terminal height the
 * Fresnel verdict is stated for, and the default 10 m mast with that terminal.
 *
 * Nothing quotes a metre of this map or that one; every distance is a multiple of the
 * horizon the pair itself implies, so the test survives a k-factor change, a band change
 * and a map resize.
 */
test('los: the radio horizon is exactly where the ray starts to graze the ground', () => {
  const pairs = [
    ['lowest mast, equal terminals', ANTENNA.heightLimitsM.min, ANTENNA.heightLimitsM.min],
    ['lowest mast, zone terminal', ANTENNA.heightLimitsM.min, RF.fresnelRxHeightM],
    ['default mast, zone terminal', 10, RF.fresnelRxHeightM],
  ];
  for (const [title, h1, h2] of pairs) {
    const horizonM = radioHorizonM(h1, h2);
    const field = new HeightField({ size: 801, worldSize: 4 * horizonM });
    const link = (fraction) => {
      const half = (fraction * horizonM) / 2;
      return {
        from: { x: -half, y: h1, z: 0 },
        to: { x: half, y: h2, z: 0 },
        profile: rayProfile(field, { x: -half, y: h1, z: 0 }, { x: half, y: h2, z: 0 },
          { samples: 192, freqHz: FREQ_HZ }),
      };
    };

    const inside = link(0.7);
    const grazing = link(1);
    const beyond = link(1.3);
    assert.ok(inside.profile.worstExcess < 0, `${title}: inside the horizon nothing is in the way`);
    assert.ok(hasLineOfSight(field, inside.from, inside.to, { samples: 192 }),
      `${title}: and the line-of-sight answer agrees`);
    // The tangency is exact; the walk only misses it by the sample spacing, and the
    // clearance near a tangency is quadratic in the miss (miss^2 / (2 k R)).
    assert.ok(Math.abs(grazing.profile.worstExcess) < 0.02,
      `${title}: at ${horizonM.toFixed(0)} m the ray should graze, not sink: ${grazing.profile.worstExcess} m`);
    assert.ok(beyond.profile.worstExcess > 0, `${title}: past the horizon the earth is the obstacle`);
    assert.ok(!hasLineOfSight(field, beyond.from, beyond.to, { samples: 192 }),
      `${title}: and that is not line of sight`);

    // Control, same geometry, flat earth: no horizon, no obstacle. Without this a
    // "fix" that drops the curvature term altogether would still satisfy everything
    // above at 0.7x and 1.3x... except that it would not, because 1.3x would be clear -
    // which is exactly the bug this whole file exists to keep out.
    const flat = rayProfile(field, beyond.from, beyond.to,
      { samples: 192, freqHz: FREQ_HZ, kFactor: 0 });
    assert.ok(flat.worstExcess < 0, `${title}: a flat earth hides nothing`);
    assert.ok(Number.isFinite(horizonM) && horizonM > 0, `${title}: a round earth has a horizon`);
  }
});

/** Local reading of the profile so the first test states its own expectation. */
function hasLineOfSightHere(profile) {
  return profile.maxExcess <= 0;
}
