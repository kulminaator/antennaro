# step-002: terrain: rescale the landscape so a 5.2 km map still has mountains in it

## How to perform this step

1. Read `src/terrain/generators.js` and the `TERRAIN` block of `src/config.js`. Note
   which parameters are fractions of `ctx.half` (so they scaled automatically with the
   bigger map: the valley's `northLimit`/`southLimit`, the distant range's
   `centreZ`, blend fractions) and which are **absolute metres** (so they are now
   relatively smaller: `regionalAmplitude`, each zone's `roughness`, `relief`,
   `peak`, `depth`, `rimHeight`, `halfWidth`, `bumpScale`, `meanderAmplitude`,
   `wavelengthM`).
2. Raise the absolute amplitudes by roughly the world factor (about 2.2x, tune by
   measurement, not by taste) so the map keeps the README's character: a mountain with
   a taller range behind it to the north, a valley with raised rims to the south,
   bumps to the west that actually graze a ray, and an east field that stays walkable.
   Do not change the shape logic, only the numbers, and keep the odd-cell-count and
   C0-continuity invariants intact.
3. Measure, do not eyeball. In bare Node, print per azimuth (N/E/S/W): the maximum
   height within the first 2600 m, and the mean |step| of `profileAlong` (the existing
   roughness proxy). Compare against the values the old 2400 m map produced (they are in
   `tests/unit/terrain.test.js` assertions and can be recovered with `git show
   HEAD~N:src/config.js` if needed). Target: the same *ratios* - mountain is still the
   dominant feature, relief still above 150 m scaled, the east still smooth.
4. Screenshot check (server backgrounded, everything timeboxed, stop browser and
   server afterwards): default view and `?preset=valley-reach`, into
   `.tmp/reach-terrain-*.png`, then read both images. The ridges must still cast
   coverage-scale shadows and the valley must read as a channel, not a dent.
5. Expect `tests/unit/terrain.test.js` to fail on absolute coordinates and heights -
   that is step-007's job. Do not weaken those assertions here; note the failures in
   this step's comments so step-007 knows what to fix.

## Expected result

The 5.2 km map is the same landscape, bigger: relief, shadow-casting ridges and a real
valley, verified by numbers and by two screenshots.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->
