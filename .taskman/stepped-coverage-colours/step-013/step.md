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
