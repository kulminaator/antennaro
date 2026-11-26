# step-012: README: re-measure and rewrite the colour story

## How to perform this step
1. Re-measure what the README quotes, with a scratch script in `.tmp/`: the per-step cell counts and
   percentages on the default scene and each preset at the new thresholds; the loudest configuration's
   counts; the legend totals. Quote each number with its configuration.
2. Rewrite these places (found by `grep -n "gradient\|bands\|pink\|amber" README.md`): the title
   caption, the "What you see" legend paragraph, the legend walkthrough (four named steps), the
   Display control row, the URL table's `view` values (`steps`, `zone`, plus a note that
   `bands`/`gradient` still resolve), the "What the colours can mean" table and its two-image pair
   with the new counts (the old claim was that the bands painted 816 of 836 cells one colour - say
   what the new steps do instead, with numbers), and the Fresnel caption that says amber.
3. Keep the honest structure: absolute scale, why it is not normalised, and why four steps rather
   than five (measured separation ceiling).
4. Verify: `grep -n "gradient\|pink\|amber" README.md` returns only sentences that are true of the
   new picture; every number in the colour sections was produced by the step's own script.

## Expected result
README describes the four steps with re-measured numbers and no stale colour claims.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet points. This section starts empty and is append-only. -->

- README rewritten around the stepped scale: hero caption, the *Coverage view* bullet, the
  zone-colour bullet, the legend paragraphs, the Display and URL tables, the valley picture
  caption, and the whole "What the colours can mean" section.
- `docs/screenshot-bands.png` is gone and `docs/screenshot-zone.png` is new. The two-signal-views
  pair table no longer makes sense with one signal view; the pair is now *signal steps* against
  *Fresnel zone clearance* over the same sweep, which is the claim the table was really there for
  (a view changes a cell's colour and nothing else) and the two pictures now differ visibly,
  which the old bands/gradient pair did not.
- All four shots were re-taken at 1440x820 and read back before writing a word of caption. Every
  read-out digit in them matches the reference numbers measured during the propagation task:
  default 836 of 30624 / 29.6 % / 936 m @ 153 deg / -50.1, -90.2, -116.7 dBm / 73.7 % / 87.9 %;
  valley 2019 of 30624 / 84.2 % / 2481 m @ 181 deg / -48.1, -77.4, -119.4 dBm / 99.8 %.
- One caption claim was measured rather than remembered. The pale patch inside the valley tongue
  could have been anything; `.tmp/valley-hole.mjs` says 16 asked-and-lost cells on a bearing of
  150-152 deg at 1518 m, where the ground stands 442 m above the ray and the link is 35 dB short.
  (The old caption's "19 strong, 209 with room, 1791 at the dying pink rim" was the retired
  gradient's thirds, so it could not survive; "the rising ground behind the mast stays bare"
  still holds and stayed.)
- Superseded numbers are quoted with their config, not laundered: 816/836 = 97.6 % of the default
  map's linked cells in one band; the gradient's stops at L* 76/89/76 with its ends 0.4 apart;
  23 % of cell pairs separated under deuteranopia. The paragraph saying the bands were "honest but
  useless" and the gradient "worse" is now the README's explanation of why the scale changed, so a
  future reader does not reintroduce either.
