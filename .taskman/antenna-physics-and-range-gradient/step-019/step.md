# step-019: README rewritten: gains and beamwidths, the three coverage views, the round earth

## How to perform this step

1. Re-measure everything the README will quote: peak gain, H/V beamwidths, front-to-back
   and free-space range per design (`.tmp/antenna-audit.mjs` plus a `withApp` probe reading
   `antenna()` and `rf()`), the default-scene coverage numbers, the preset table, and the
   curvature numbers from `coverage().stats` (`kFactor`, `earthBulgeUnderMaxLinkM`,
   `radioHorizonM`).
2. Update: the **five designs** table to carry gain and beamwidth per design plus a
   paragraph telling the user's story - a biquad's 69-degree beam cannot hold 12 dBi, the
   app now derives gain from the beam, and the ordering test exists; the **What you see**
   and **Controls** sections for the three coverage views and the renamed
   *Fresnel zone volume* / *Terrain shadowing* controls; a new **What the colours can
   mean** subsection listing bands / gradient / zone and stating that switching between them
   changes not one decibel; a **The earth is round, and now it says so** paragraph (k,
   bulge over the last link, smooth-earth horizon, why a low mast dies in an empty valley);
   the URL table (`view`, and `fresnel=1`'s expanded meaning); and the Fresnel/legend
   paragraphs where the numbers moved.
3. Fix anything the change made stale: the 3.05 km biquad budget sentence, the "2.20 km
   Yagi" comparisons, the preset bullets, the coverage-view sentences.
4. Verify: `grep -n "3.05\|12.4 dBi\|bands and a faint row" README.md` finds nothing
   stale; every number in the file traces to a measurement recorded in this step's
   comments.

## Expected result

The README tells the truth about what the app now claims, including the story of the
antenna that could not exist.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->
