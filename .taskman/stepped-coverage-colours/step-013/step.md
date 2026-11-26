# step-013: GUIDELINES: the colour-scale rule, with its measurements

## How to perform this step
1. In GUIDELINES section 4 (configuration centrality), replace the range-gradient sentence (it names
   `RF.gradientMaxMarginDb` and `COLOURS.gradientStops`) with the stepped scale: `RF.levelMarginsDb`,
   `RF.levelNames`, `COLOURS.levels`, and the measured reason for four steps.
2. In section 7 (domain notes), replace the "The gradient is keyed to margin" bullet with the rule
   for the stepped scale, recording the measurement method (CIE L*, CIEDE2000, dichromat
   simulation, drape composited over the terrain ramp at `opacity 0.88`) and the numbers: shipped
   gradient `L* 76/89/76` with 41 % / 24 % of cell pairs separable, shipped bands 93-98 % of cells
   in one band, new steps 22.8/11.5/15.1/18.0, the 3/4/5-step ceiling 19.5/12.5/9.5, and the zone
   ramp 9.4 -> 26.5 under protanopia. Also update the view list bullet (`bands | gradient | zone`).
3. Verify: `grep -n "gradientMaxMarginDb\|gradientStops\|rangeGradientRgb" GUIDELINES.md` is empty.

## Expected result
GUIDELINES states the colour rule and the measurements behind it, with no dead references.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet points. This section starts empty and is append-only. -->

- Section 4: `RF.gradientMaxMarginDb` and `COLOURS.gradientStops` are out of the tunables list and
  `RF.levelMarginsDb` + `RF.levelNames` + `COLOURS.levels` + `RF.overlayOpacity` are in, each with
  the measurement that fixes its value. The drape opacity entry names why it moved out of
  `coveragemesh.js`: while it was a literal there, no test could say what it cost.
- Section 7: "One drape, three readings" is now "two readings", and carries the decision that the
  legacy `bands`/`gradient` spellings are translated in `main.js` rather than normalised by the
  reducer - the reducer rejects unknown select values for every field, and one field silently
  accepting a retired value would quietly special-case the rule. Two new bullets: the stepped
  scale (lightness ordering, the 3/4/5-step ceiling, the ruler being calibrated in the test file)
  and "two views, two vocabularies of colour" (why the zone ramp gave up its amber: 10.7 dE000
  from the yellow step).
- Section "Browser test conventions" gained the exception it never stated. The rule read "never
  scrape DOM ids", while `tests/browser/app-boot.test.js` had been reading the About dialog for
  two tasks and `tests/browser/curvature.test.js` the curvature sentence; this task added the
  legend, making three. The rule now says which three claims are not state and why the DOM is
  their only home, and that reading a *number* out of the panel is still forbidden because the
  API reports it.
- Superseded figures are quoted with their configuration rather than deleted: L* 76/89/76 with its
  ends 0.4 apart, 93-98 % of a map in one band, the old zone ramp's 9.4 under protanopia, the
  retired amber's 10.7 against yellow.
