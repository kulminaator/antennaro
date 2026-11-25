/**
 * Unit tests: the four-zone terrain and the antenna site.
 *
 * These tests are the guard rail for the world layout described in README.md:
 * flat field to the east, valley to the south, bumps to the west, a mountain
 * with a taller range behind it to the north. If someone re-tunes a generator and
 * the valley stops being a valley, this fails here rather than in a screenshot.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TERRAIN, WORLD } from '../../src/config.js';
import { approxEqual } from '../../src/math/scalar.js';
import {
  ZONES, ZONE_HEIGHT_FN, ZONE_LAYOUT, createTerrainContext, generateTerrain, heightAt, naturalHeightAt,
  profileAlong, sectorWeights,
  zoneAt,
} from '../../src/terrain/generators.js';
import { HeightField } from '../../src/terrain/heightfield.js';
import { rangeFromSite, resolveSite } from '../../src/terrain/site.js';

const ctx = createTerrainContext({ seed: TERRAIN.seed, worldSize: WORLD.worldSize });
const field = generateTerrain();

/** Mean absolute height difference between neighbouring samples: a roughness proxy. */
function roughnessAlong(azimuthDeg, distance) {
  const profile = profileAlong(field, azimuthDeg, { from: distance, to: distance + 300, steps: 60 });
  let acc = 0;
  for (let i = 1; i < profile.length; i += 1) acc += Math.abs(profile[i].y - profile[i - 1].y);
  return acc / (profile.length - 1);
}

test('terrain: default world matches the configuration', () => {
  assert.equal(field.size, WORLD.gridSize);
  assert.equal(field.worldSize, WORLD.worldSize);
  assert.equal(field.size % 2, 1, 'an odd grid puts a cell exactly on the site');
  const stats = field.stats();
  assert.ok(stats.min < stats.max);
  assert.ok(stats.relief > 150, `the scene needs real relief, got ${stats.relief.toFixed(1)} m`);
  assert.ok(stats.max > TERRAIN.mountain.peak * 0.8, 'the mountain is the dominant feature');
  for (let i = 0; i < field.heights.length; i += 1) {
    assert.ok(Number.isFinite(field.heights[i]), 'no NaN heights');
  }
});

test('terrain: the four zones sit where the README says they do', () => {
  const probe = 700;
  assert.equal(zoneAt(0, -probe, ctx), ZONES.MOUNTAIN, 'north of the site: mountain');
  assert.equal(zoneAt(probe, 0, ctx), ZONES.FLAT, 'east of the site: flat field');
  assert.equal(zoneAt(0, probe, ctx), ZONES.VALLEY, 'south of the site: valley');
  assert.equal(zoneAt(-probe, 0, ctx), ZONES.BUMPS, 'west of the site: bumps');
  assert.deepEqual(ZONE_LAYOUT.map((zone) => zone.azimuthDeg), [0, 90, 180, 270]);
});

test('terrain: zone weights are a normalised blend everywhere', () => {
  for (const [x, z] of [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0.3, -0.7]]) {
    const scale = 900;
    const weights = sectorWeights(x * scale, z * scale, ctx);
    const total = Object.values(weights).reduce((acc, value) => acc + value, 0);
    assert.ok(approxEqual(total, 1, 1e-9), `weights must sum to 1 (got ${total})`);
    for (const value of Object.values(weights)) assert.ok(value >= 0 && value <= 1);
    assert.deepEqual(Object.keys(weights).sort(), Object.values(ZONES).slice().sort());
  }
});

test('terrain: each zone is measurably itself', () => {
  const northProfile = profileAlong(field, 0, { from: 150, steps: 120 });
  const eastProfile = profileAlong(field, 90, { from: 150, steps: 120 });
  const southProfile = profileAlong(field, 180, { from: 150, steps: 120 });
  const westProfile = profileAlong(field, 270, { from: 150, steps: 120 });

  const maxHeight = (profile) => profile.reduce((acc, point) => Math.max(acc, point.y), -Infinity);
  const minHeight = (profile) => profile.reduce((acc, point) => Math.min(acc, point.y), Infinity);

  assert.ok(maxHeight(northProfile) > maxHeight(eastProfile) + 60, 'the mountain towers over the flat field');
  assert.ok(maxHeight(northProfile) > TERRAIN.mountain.peak * 0.8, 'the near mountain reaches its configured height');
  assert.ok(
    maxHeight(northProfile.slice(northProfile.length * 0.6)) > maxHeight(northProfile.slice(0, northProfile.length * 0.4)),
    'the distant range behind the mountain is taller than the near ridge',
  );
  assert.ok(minHeight(southProfile) < minHeight(eastProfile) - TERRAIN.valley.depth * 0.4, 'the valley cuts below the field');
  assert.ok(roughnessAlong(270, 400) > roughnessAlong(90, 400) * 1.5, 'the west is bumpier than the east');
  assert.ok(maxHeight(westProfile) < maxHeight(northProfile), 'bumps stay lower than the mountain');
  assert.ok(roughnessAlong(90, 400) < 6, 'the east stays walkable: small local gradient');
});

test('terrain: generation is deterministic and seed-sensitive', () => {
  const again = generateTerrain({ size: 65, worldSize: 1600, seed: 4242 });
  const third = generateTerrain({ size: 65, worldSize: 1600, seed: 4242 });
  assert.deepEqual(Array.from(again.heights), Array.from(third.heights), 'same seed => byte-identical grid');
  const other = generateTerrain({ size: 65, worldSize: 1600, seed: 4243 });
  assert.notDeepEqual(Array.from(again.heights), Array.from(other.heights), 'a new seed gives new ground');
  assert.equal(again.stats().cells, 65 * 65);

  // heightAt is pure: querying a point directly matches the baked grid.
  const x = -321.5;
  const z = 208.25;
  const direct = heightAt(x, z, createTerrainContext({ seed: 4242, worldSize: 1600 }));
  const probe = again.sample(x, z);
  assert.ok(Math.abs(direct - probe) < 3, `direct query ${direct.toFixed(2)} vs grid ${probe.toFixed(2)}`);
});

test('terrain: the site pad is flat so the mast does not float', () => {
  const pad = WORLD.sitePadRadius;
  const level = heightAt(0, 0, ctx);
  for (const [x, z] of [[0, 0], [pad * 0.5, 0], [0, -pad * 0.7], [-pad * 0.9, pad * 0.2]]) {
    assert.ok(approxEqual(heightAt(x, z, ctx), level, 1e-6), `pad point (${x}, ${z}) is level`);
  }
  const outside = heightAt(pad * 3, 0, ctx);
  assert.ok(Math.abs(outside - level) > 0.5, `outside the pad the real ground takes over (${outside} m)`);
  // Continuity: crossing the pad edge must not create a step bigger than the
  // local gradient over the same distance.
  const inner = heightAt(pad * 0.98, 0, ctx);
  const outer = heightAt(pad * 1.02, 0, ctx);
  assert.ok(Math.abs(inner - outer) < 1, `pad edge step is ${(outer - inner).toFixed(3)} m`);
});

test('terrain: the pad is cut level with the ground the mast stands on', () => {
  // Two bugs this pins, both from grading the pad to something other than the
  // ground under the mast: a fixed datum buries the mast on a hilltop and puts it
  // on a pedestal in the valley; averaging the surrounding ground (worse over the
  // wide blend reach) lets a ridge flank lift the platform tens of metres above
  // the ground beside it, so the hillside appears to grow sideways under it.
  const pad = WORLD.sitePadRadius;
  const spots = Object.entries({
    'ridge corner': { x: 500, z: -600 },
    'ridge corner W': { x: -500, z: -600 },
    'high ground': { x: 0, z: -900 },
    'valley floor': { x: 0, z: 900 },
    'map centre': { x: 0, z: 0 },
  });
  for (const [label, spot] of spots) {
    const placed = createTerrainContext({ seed: TERRAIN.seed, worldSize: WORLD.worldSize, siteX: spot.x, siteZ: spot.z });
    const ground = naturalHeightAt(spot.x, spot.z, placed);
    assert.ok(approxEqual(placed.padElevation, ground, 1e-9), `${label}: pad sits ${placed.padElevation - ground} m off the ground`);
    assert.ok(approxEqual(heightAt(spot.x, spot.z, placed), ground, 1e-9), `${label}: the mast is not on the ground`);
    assert.ok(approxEqual(heightAt(spot.x + pad * 0.9, spot.z - pad * 0.4, placed), ground, 1e-9), `${label}: the platform is not level`);

    // A bench, not a landform: within the flat disc the pad may only differ from
    // the natural surface by the relief that is already there.
    let low = Infinity;
    let high = -Infinity;
    for (let a = 0; a < 16; a += 1) {
      for (const r of [pad * 0.5, pad]) {
        const ring = naturalHeightAt(spot.x + r * Math.cos((a / 16) * Math.PI * 2),
          spot.z + r * Math.sin((a / 16) * Math.PI * 2), placed);
        low = Math.min(low, ring);
        high = Math.max(high, ring);
      }
    }
    assert.ok(ground >= low - 1e-9 && ground <= high + 1e-9,
      `${label}: ground at the mast ${ground.toFixed(0)} m, ground around it ${low.toFixed(0)}..${high.toFixed(0)} m`);
  }
  // High ground stays high: one fixed number for every pad is a valley number.
  const hill = createTerrainContext({ seed: TERRAIN.seed, worldSize: WORLD.worldSize, siteX: 0, siteZ: -900 });
  assert.ok(hill.padElevation > 100, `a mountaintop pad should be up the mountain, got ${hill.padElevation.toFixed(0)} m`);
});

test('terrain: the valley channel stays south of the site instead of cutting the map', () => {
  // The valley floor is measured across x, so without a meridional fade it runs
  // the whole north-south length of the map: a trench through the mountain sector
  // and through the site at the centre, which then needs a 30 m fill under it.
  const valley = ZONE_HEIGHT_FN[ZONES.VALLEY];
  for (const z of [-1100, -800, -400, -200, -100]) {
    assert.ok(valley(0, z, ctx) >= valley(500, z, ctx) - 5,
      `z=${z}: the valley axis (${valley(0, z, ctx).toFixed(0)} m) is still cut below its shoulder (${valley(500, z, ctx).toFixed(0)} m)`);
  }
  // And in the south it is still the valley the README describes: a floor with
  // raised rims either side of it.
  assert.ok(valley(0, 900, ctx) < valley(500, 900, ctx) - 20, 'the southern valley stopped being a valley');
  const floor = naturalHeightAt(0, 900, ctx);
  const rim = Math.max(naturalHeightAt(350, 900, ctx), naturalHeightAt(-350, 900, ctx));
  const outside = naturalHeightAt(900, 900, ctx);
  assert.ok(rim > floor + 20, `valley floor ${floor.toFixed(0)} m should be well below its rim ${rim.toFixed(0)} m`);
  assert.ok(rim > outside, `the rim (${rim.toFixed(0)} m) should stand above the ground beyond it (${outside.toFixed(0)} m)`);
  // The site at the centre no longer sits in a pothole that has to be filled in.
  assert.ok(Math.abs(ctx.padElevation) < 20, `the pad at the map centre needs a ${ctx.padElevation.toFixed(0)} m fill`);
});

test('terrain: profileAlong walks outward from the origin', () => {
  const profile = profileAlong(field, 45, { steps: 10 });
  assert.equal(profile.length, 11);
  assert.equal(profile[0].distance, 0);
  assert.ok(approxEqual(profile[0].y, heightAt(0, 0, ctx), 1e-4), 'the profile starts on the pad the grid baked');
  for (let i = 1; i < profile.length; i += 1) {
    assert.ok(profile[i].distance > profile[i - 1].distance, 'distances increase');
    assert.equal(profile[i].y, field.sample(profile[i].x, profile[i].z), 'samples agree with the grid');
  }
  assert.equal(profileAlong(field, 0, { steps: 4, from: 100, to: 200 })[4].distance, 200);
});

test('terrain: every zone height function is finite across the map', () => {
  const ctxLocal = createTerrainContext({ seed: 7, worldSize: 2000 });
  const half = ctxLocal.half;
  for (const zone of Object.values(ZONES)) {
    for (let i = 0; i < 40; i += 1) {
      const x = -half + (i / 39) * 2 * half;
      const z = -half + ((i * 7) % 39) / 39 * 2 * half;
      const value = ZONE_HEIGHT_FN[zone](x, z, ctxLocal);
      assert.ok(Number.isFinite(value), `${zone} produced ${value} at (${x.toFixed(0)}, ${z.toFixed(0)})`);
      assert.ok(Math.abs(value) < 5000, `${zone} height ${value} is implausible`);
    }
  }
});

test('site: resolveSite clamps to the map and stacks the phase centre', () => {
  const small = new HeightField({ size: 11, worldSize: 1000 }).fillFromFunction((x, z) => 2 * x + 0 * z);
  const site = resolveSite(small, { x: 10_000, z: -10_000, heightM: 12 });
  assert.equal(site.x, small.half, 'x clamps into the world');
  assert.equal(site.z, -small.half, 'z clamps into the world');
  assert.equal(site.heightM, 12);
  assert.ok(approxEqual(site.groundY, small.sample(site.x, site.z)));
  assert.ok(approxEqual(site.y, site.groundY + 12), 'phase centre = ground + height');

  const defaultSite = resolveSite(small);
  assert.deepEqual({ x: defaultSite.x, z: defaultSite.z, heightM: defaultSite.heightM }, { x: 0, z: 0, heightM: 0 });
  assert.equal(resolveSite(small, { heightM: -5 }).heightM, 0, 'a mast cannot be buried');
  assert.equal(Object.isFrozen(defaultSite), true, 'site records are immutable');
});

test('site: rangeFromSite reports metres and compass bearing', () => {
  const site = resolveSite(field);
  const east = rangeFromSite(site, 500, 0);
  assert.ok(approxEqual(east.horizontalM, 500));
  assert.ok(approxEqual(east.azimuthDeg, 90));
  assert.ok(approxEqual(rangeFromSite(site, 0, -500).azimuthDeg, 0), 'north is -Z');
  assert.ok(approxEqual(rangeFromSite(site, 0, 500).azimuthDeg, 180));
  assert.ok(approxEqual(rangeFromSite(site, -500, 0).azimuthDeg, -90), 'west is reported as -90');
});

test('terrain: the flattened pad travels with the site', () => {
  const pad = WORLD.sitePadRadius / 2;
  const moved = createTerrainContext({ seed: TERRAIN.seed, worldSize: WORLD.worldSize, siteX: 400, siteZ: -260 });

  // Level wherever the mast lands, so relocating never leaves it floating or buried.
  const level = heightAt(400, -260, moved);
  for (const [x, z] of [[400, -260], [400 + pad, -260], [400, -260 - pad]]) {
    assert.ok(approxEqual(heightAt(x, z, moved), level, 1e-6), `pad point (${x}, ${z}) is level`);
  }

  // The pad is a property of the site, not of the map: with the site gone, the
  // ground it used to flatten is natural ground again.
  assert.ok(approxEqual(heightAt(0, 0, moved), naturalHeightAt(0, 0, moved), 1e-6),
    `the abandoned centre is still a pad (${heightAt(0, 0, moved).toFixed(2)} m)`);
  assert.ok(approxEqual(heightAt(30, 0, ctx), heightAt(0, 0, ctx), 1e-6),
    'the default context keeps its pad over the centre');
  assert.ok(!approxEqual(heightAt(30, 0, moved), heightAt(0, 0, moved), 1e-6),
    'the moved pad still flattens ground it no longer owns');

  // Relocating the antenna does not relocate the mountain.
  assert.equal(zoneAt(0, -700, moved), ZONES.MOUNTAIN, 'the zones stay keyed to the map centre');
  assert.equal(zoneAt(400 + 700, -260, moved), ZONES.FLAT, 'east of the old centre is still the flat field');
});
