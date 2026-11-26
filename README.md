# Antenna & Terrain Simulator

A browser-based 3D sandbox for one question: **where does the link actually hold?**

Try it out right away: <https://kulminaator.github.io/antennaro/>

An antenna stands on the ground wherever you put it - a 5.2 km square map, sampled
every 15 m. Around it, four kinds of
ground: a mountain to the north with a taller range behind it, an open flat
field to the east, a valley to the south, and rolling bumps to the west. Pick a
design, set the height and aim, and the simulator draws the radiation lobe and
paints the predicted signal level onto the terrain. Drag the mast (or use the two
placement sliders) and the mast, its hardware, its lobe and its coverage go with
it, while the mountain, the valley and every other hill stay exactly where they
are: the map never reshapes itself to suit the antenna. Put the mast on a ridge and
it stands on the ridge, with the ground falling away beside it.

![An omni dipole at the centre of a 5.2 km map, painted in the range gradient: a warm
core right at the mast, pale yellow arms where the link still has room, and pink for the
points that only just make the receiver - 770 of the 836 linked cells, because this budget
is 0.94 km and there is nowhere to hide. The wedge missing on the right is the west: this
antenna is omnidirectional, so a direction with no colour is ground, not gain (0 % of the
walked points link in each of SW, W and NW). The wide translucent band beyond the pink is
ground the sweep asked about and lost to the terrain, painted faint on purpose; beyond that
the map is bare, because the antenna's own budget cannot reach it and it was never measured.
The read-out says the same thing in words: "the link: budget 0.94 km, last link 0.94 km",
"836 of 30624 points (2.7 % of the map)", "29.6 % of ground a link could reach", "73.7 %
(> 6 dB diffracted)", and under it "Curvature - k 1.41 - the ray bows 0.012 m over the last
0.94 km link; the earth curves away long before this map ends".](docs/screenshot.png)

## Run it

There is nothing to install and nothing to build: the repository *is* the app.
Start any static file server in the project root and open it.

```bash
python3 -m http.server 8080     # or: npx serve .  /  php -S 127.0.0.1:8080
```

Then open <http://localhost:8080>. You need a browser with **WebGL2** - any
current Chrome, Firefox, Edge or Safari.

The only third-party library, a fixed minified build of three.js, is committed
under `vendor/three/` with its license and a hash manifest, so the page fetches
nothing from a CDN and runs the same bytes for everyone. Node.js (22 or newer) is
only needed for the development tools and the test suite - see
[Development](#development).

Two conveniences if you do have Node around: `npm run dev` serves the same thing
on port 8080 with no-cache headers and a `/-/health` endpoint, and
`npm run browser -- shot` takes screenshots headlessly.

If the page shows a red **"Startup failed"** banner, the banner repeats the
browser's own error. It is almost always a missing file under `vendor/three/` or
an edited import map, and `npm run vendor` tells you which.

## What you see

- **The ground**, coloured by height, with the four zones labelled on the map:
  `MOUNTAIN + DISTANT RANGE` (north), `FLAT FIELD` (east), `VALLEY` (south),
  `BUMPY LAND` (west).
- **The mast and antenna hardware** at the site, which is a position on the map and
  not the middle of it. The mast is drawn at true height;
  the antenna body is enlarged so you can see what it is - treat the hardware as
  "not to scale". The foot of the mast *is* the drawn ground: the same sample the
  mesh is draped from and the coverage grid reads, so *Antenna height* is measured
  from the real surface under the mast and the mast can neither float nor sink. On a
  ridge flank that is blunt arithmetic - a 10 m mast below a crest sits below the
  crest, and the coverage says so. Nothing is flattened, cut or filled to make the
  antenna's location comfortable, and moving the mast moves no earth.
- **The radiation lobe**: a 3D surface of the antenna's own gain, cut off 30 dB
  below the peak. It shows the shape of the antenna, not its range.
- **The coverage overlay**: signal painted onto the ground, measured where
  the terrain actually is - so the far side of a ridge goes dark. The map is 5.2 km
  across, the ground is sampled every 15 m and the coverage every 30 m, and the sweep
  looks at the **whole map**, not a disc around the mast. One control, *Coverage view*,
  decides what the colours mean - signal bands, a continuous range gradient, or first
  Fresnel zone clearance ([What the colours can mean](#what-the-colours-can-mean)).
  Whatever you pick, three *opacity* meanings stay the same: solid where a link works, a
  faint wash where the sweep asked and the terrain defeated the link, and no paint at all
  where the free-space budget cannot reach the receiver - ground that was never consulted,
  and that therefore makes no claim.
  **The outer edge of the colour is where the link dies.** If something of ours would cut
  the search off first - the study range you set, or the edge of the map - a pale ring
  appears at that radius, the still-alive directions are marked `>=` in the direction
  table, and the read-out names the limit that bit and what the link would have reached
  without it.
- **The first Fresnel zone volume** (optional, off by default): *Fresnel zone volume*
  in the Display group draws a semi-transparent tube along the boresight - the first
  Fresnel zone of a reference link from the mast to where the beam lands. It is only the
  tube. Which language the coverage drape is painted in is the *Coverage view* select
  above it, and setting that to *Fresnel zone clearance* colours the map green where the
  ground leaves the zone clear, amber where it eats into it, purple where it stands above
  the ray. The two are separate switches because the volume and the verdict answer
  different questions, and because a toggle that also repaints the map is a control whose
  label lies after the second click.

The legend under the numbers changes with the view, and describes the pixels actually
under it - see below.

The read-out panel on the right reports what the current configuration delivers:
peak gain, the −3 dB beamwidths, front-to-back ratio, EIRP at boresight,
wavelength, the free-space range, the **range limit** (one line saying whether what you
are looking at ends because of the link, your study range, or the edge of the map), a
**curvature** line saying what the round earth was worth on the last link, how
many cells have a link both as a share of the map and as a share of the ground a link
could reach, the best / median / worst signal, how many cells are shadowed, how many of
the *linked* cells keep their first Fresnel zone clear, and a per-direction table
across the eight compass sectors (N, NE, E, SE, S, SW, W, NW) showing how much of
each sector has a link and how far that link reaches - a range printed as `>= 1400 m`
was still alive where we stopped looking.

Below the numbers is the legend. In the **signal bands** view it is four colour bands and
a faint row, keyed to your receiver sensitivity (at the default −80 dBm that is
`>= -35 dBm`, `>= -50`, `>= -65`, `>= -80`, then `< -80 dBm (faint: terrain stops the
link)`), plus a row for the bare "out of budget - not measured, not painted" area.
Changing sensitivity moves the boundaries - the colours mean "margin over what the client
can hear", not "signal quality" in the abstract. In the **range gradient** view the same
ground is counted three ways instead of four, against the ramp's own scale: on the default
map 8 points have 20 dB or more to spare, 58 have 10-20, 770 have 0-10, 1992 were measured
and lost, and 27 796 were never measured. In the **zone** view it is three rows - cut,
partly cut, clear - quoting the receiver height the verdict was computed for, plus the
same unmeasured row and a line saying that faint means measured-and-failed. Every legend
row is a count, and the counts of any of the three legends add up to the same 30 624
points the sweep can account for: a legend that describes different pixels to the ones
under it is a bug, and there is a test for it.

## Controls

Left panel, top to bottom:

| Group | What you set |
| --- | --- |
| **Scenario** | Five ready-made setups to load (see below). |
| **Antenna design** | Which of the five designs, plus that design's own parameters (number of directors, loop turns, patch size, ...). |
| **Placement and aim** | Site position: east offset and south offset, −2500 to +2500 m in 5 m steps (the same numbers a drag writes). Height above ground (0.5–40 m, measured from the ground under the mast), azimuth (0–360°, 0 = north), mechanical tilt (−60° to +60°, negative is downtilt). |
| **Radio and link budget** | Band (433 / 868 / 915 / 2400 / 5800 MHz), transmitter power (−10…43 dBm), feeder loss, receiver sensitivity, zone receiver height, study range (100 m to 6 km), clutter loss, and *Terrain shadowing (diffraction loss)* - off means the decibels ignore the ground, while the zone verdict and the earth's curvature are still walked over it. |
| **Terrain** | The terrain seed. Same seed always gives the same ground. |
| **Display** | Coverage overlay, coverage view (bands / range gradient / Fresnel zone clearance), radiation pattern, Fresnel zone volume, terrain mesh, zone labels. |

Buttons: **New terrain** (fresh random seed), **Reset view** (camera back to
start, centred on the site), **Reset placement** (site back to the middle of the
map), **Save PNG** (download the current view), **Reset all** (everything, the site
included).

At the foot of the panel, **About** opens a small dialog with the three things that
are not physics: where it runs (https://kulminaator.github.io/antennaro/), where the
source lives (https://github.com/kulminaator/antennaro),
the licence this simulator ships under (MIT, `LICENSE`), and the fact that the picture
is drawn by three.js - MIT-licensed, vendored into `vendor/three/`, whose copyright
notice and full licence text the dialog quotes from the files that travel with the
code. An open dialog is not part of the simulation: it is not in the state, not in a
patch, and not in the URL.

Some designs (Yagi, biquad, patch) also offer **electrical downtilt**: the beam
tips down while the hardware stays level, which is how a real sector panel is
often tilted.

### Move the camera

| Input | Effect |
| --- | --- |
| Drag | Orbit around the site |
| Drag the mast | Move the site: mast, hardware, lobe and coverage go with it; not one metre of ground does |
| Wheel | Zoom in / out |
| Right-drag or shift-drag | Pan |
| Arrow keys | Orbit |
| `+` / `-` | Zoom |
| `h` | Hide the interface (press again to bring it back) |

The cursor turns into a grab hand over the hardware, and grabs take priority over
orbiting, so you can always move the mast instead of swinging the camera - even
when the site has been moved off the middle of the map. Dragging and the two
placement sliders write the same state, so a drag can be undone with **Reset
placement** and shared with a link.

### Shareable links

Everything on the panel can be set from the URL, which makes a configuration easy
to paste into a bug report:

```
http://localhost:8080/?design=yagi&seed=1234&height=24&azimuth=180&tilt=-6&siteX=400&siteZ=-200&frequency=2400&sensitivity=-95&range=1600
```

| Parameter | Sets | |
| --- | --- | --- |
| `preset` | one of the five scenarios | `site-sector`, `valley-reach`, `flat-field`, `mountain-shadow`, `bumps-hills` |
| `design` | antenna design | `omni-dipole`, `omni-collinear`, `yagi`, `biquad-reflector`, `patch` |
| `seed` | terrain seed | same number, same ground |
| `height`, `azimuth`, `tilt` | mast height (m), azimuth and tilt (deg) | |
| `siteX`, `siteZ` | site position east / south, metres | off the map centre; both default to 0 |
| `frequency` | band in MHz | `433`, `868`, `915`, `2400`, `5800` |
| `sensitivity`, `range` | receiver sensitivity (dBm), study range (m) | both clamped to what the model allows, and the clamp is reported - see below |
| `view` | how the coverage is painted | `bands`, `gradient`, `zone` |
| `fresnel` | the Fresnel-zone volume, and the view that goes with it | `fresnel=1` turns the tube on **and** sets `view=zone`; `view` alone changes the colours without the tube |
| `manual`, `nohud` | testing aids: no animation loop, no read-out panel | |

A value outside the model is clamped rather than obeyed, and the clamp is not swallowed:
`window.__simBoot.overrides` lists what was asked for and what was applied, so a picture
limited by a bad link can be told apart from one limited by a URL that asked for the
impossible. `?range=99999&siteX=99999` on a 5.2 km map, for instance, applies 6000 m - the
widest work area there is, past the map itself - and 2500 m of east offset, and says so.

![The same map in the *Reach down the valley* scenario: a 10-director Yagi 24 m above the
centre, azimuth 180 and 6 deg of mechanical tilt, so the beam runs down the valley to the
south - the drape is a tongue, not a disc. 19 cells have 20 dB or more to spare (the warm
core at the mast), 209 have 10-20 dB along the valley floor, and 1791 are the dying pink rim
that ends at 2481 m on a bearing of 181 deg against a 2.50 km free-space budget: the picture
ends in the middle of the map, not at its edge. The rising ground behind the mast stays
bare, and the read-out says so - 2019 of 30624 points, 84.2 % of the ground a link could
reach.](docs/screenshot-valley.png)

## The five designs

| Design | Peak gain | -3 dB beamwidth (H x V) | Beam | What it is good at |
| --- | --- | --- | --- | --- |
| **Omni half-wave dipole** | 2.15 dBi | 360 x 78 deg | All directions, fat vertical lobe | Reference omni. Radiates everywhere, wastes power up and down. |
| **Omni collinear** | 7.17 dBi | 360 x 45 deg | All directions, flattened vertical lobe | Long-range omni on a tower: more power at the horizon, less directly overhead. |
| **Yagi-Uda** | 9.56 dBi | 42 x 66 deg | Narrow beam, deep null behind | Reaching one far place - straight down the flat field, or into the far end of the valley. |
| **Biquad with plate reflector** | 8.13 dBi | 69 x 69 deg | Wide, forgiving sector | Covering a broad area in one direction, e.g. a campsite or a farm yard. |
| **Microstrip patch** | 6.66 dBi | 72 x 68 deg | Neat sector, low profile | Sector coverage near the mast, especially with electrical downtilt. |

At the defaults above (10 dBm into a receiver that hears −80 dBm at 868 MHz) those gains
buy free-space ranges of 2.20, 1.86, 1.67, 1.57 and 0.94 km in that same order. Every
number in the two first columns is a pair: the gain of each directional design is
*derived from* the beamwidth next to it, so the biquad cannot keep the 12.4 dBi it used to
carry - a 69 x 69 degree beam does not hold that much - and the ordering of these five by
gain and by reach is a browser test
([Antenna physics](#antenna-physics-why-a-wide-antenna-cannot-have-long-reach)).

Aim controls only matter for the three directional designs - an omni does not
care which way it faces, and the panel says so.

## Presets worth trying

Every one of them is tuned so that **its own link** is the last thing to give out: none
of the five is cut off by the study range or by the edge of the map, and a unit test fails
if one ever is (`coverage: no preset is cut off by our own limits`). None of them chooses a
colour scheme either - a scenario is ground, antenna and aim, so a preset loads in whatever
coverage view you had picked, and `?preset=valley-reach&fresnel=1` still gets you the zone
picture (`panel: a scenario chooses ground and antenna, never the coverage view`).

- **Reach down the valley** - long Yagi pointed south, tilted into the valley floor (the
  picture above). 2.48 km of link against a 2.50 km budget, and 99.8 % of those 2019 linked
  points keep the first zone clear: an open valley is good real estate.
- **Mountain shadow** - a high omni looking north; watch the dead zone appear behind the
  ridge, and the second dead zone in the far range's shadow. 7019 linked points, last one
  at 2.04 km of a 2.04 km budget - the only preset whose farthest link is the budget itself
  to the metre, because two ridges now charge what they take.
- **Down the flat field** - Yagi east, where the link budget rather than the ground is
  the limit: the last link sits at 2000 m of a 2020 m budget, and 95 % of its 1806 linked
  points are zone-clear. This only works with the mast at 25 m; the same antenna at 10 m
  dies at 750 m and keeps only 24 % of its 289 links zone-clear, because a terminal on the
  ground has a radio horizon.
- **Over the bumps** - biquad west: 3.32 km of budget, and the ground lets it reach
  1.42 km across 534 points. Gain helps; grazing rays over the humps do not.
- **Sector around the site** - patch panel with electrical downtilt: the beam is tipped
  into the ground, so the served ring hugs the mast. 2806 linked points, the last at
  2.20 km against a 3.08 km budget. It has the lowest zone-clear share of the five
  (72.8 %), and the reason is distance, not the tilt: the 2044 cells that keep the zone
  clear sit a median 911 m out, the 762 that fail a median 1310 m - the downtilt costs this
  antenna range, and the outer ring is where the ground gets into the zone.

## What the numbers mean

The prediction is a link budget evaluated per map cell:

```
RSSI = transmitter power - feeder loss + antenna gain toward that cell
       - free-space path loss - diffraction loss over the ground - clutter loss
```

Antenna gain comes from a model of each design's pattern, evaluated in the
direction of the cell, so pointing matters and so does tilt. Free-space loss uses
the real wavelength for your band: doubling distance or doubling frequency costs
about 6 dB. Terrain shadowing is knife-edge diffraction walked along the actual
ground profile on a standard-atmosphere curved earth, and it is charged where the ray
really crosses more than one obstruction: the profile is cut into screens - runs of
samples the ray cannot pass - and the screens are added in the **Deygout** way, each one
measured from the shadow the screens before it cast. Which is why a ridge can cost 2 dB
on one path and 25 dB on another, and why the second ridge behind it is no longer free.

At the default 10 dBm into a receiver that hears −80 dBm, the five designs have these
free-space ranges, and that is the order the pictures follow when the ground allows it:
Yagi 2.20 km, biquad 1.86 km, collinear 1.67 km, patch 1.57 km, dipole 0.94 km. A
directional design's gain here is *derived from the beam it draws* (see
[Antenna physics](#antenna-physics-why-a-wide-antenna-cannot-have-long-reach) below), so
no slider can buy a gain its beamwidth would not survive.

### How a shadow begins, and how fine the ground has to be

Two details of that diffraction were got wrong here first, and both are worth stating.

**A shadow starts at 0 dB.** A ray that clears a ridge by a metre costs a fraction of a dB; a
ray that exactly grazes it costs about 6 dB, which is what a knife edge charges at zero
clearance. This app used to charge nothing at all until the ray dipped *below* the ground and
then jump to the diffraction of a buried ray, so a cell crossing a brow went from 0 dB to
about 6 dB in one 30 m step: a hard line on the map where the physics has a curve. The screen
parameter is signed now - positive where ground stands above the ray, negative where the ray
has room - and it runs continuously through zero, so the loss grows from nothing as the ray
begins to be covered and passes the grazing figure at the shadow line. A ray that merely
clips a crest is no longer free, and a ray that clears it by a metre is no longer charged as
though it were buried.

**The ray walk samples the mesh it walks over.** A crest 15 m wide is simply not there for a
ray that samples every 100 m, and this map has crests that narrow: with the old fixed sample
cap a path could be mis-stated by 6.5 dB because the one sample that mattered fell in the
valley either side of the ridge. A path is now walked at **one sample per terrain cell** -
15 m here - with `RF.profileMaxSamples` left as a ceiling on absurd path lengths rather than a
limit this map reaches. That takes the worst case to 1.9 dB, and sampling finer than the mesh
buys literally nothing, because there is no finer ground to see. The rule lives in one
function, `pathSamples()`, so the sweep and `window.__sim.rayTo` cannot disagree; and
`diffraction: the ray walk is dense enough to see the mesh it walks over` slides a ridge
across the old coarse grid by fractions of a cell and fails if the coarse walk ever stops
being measurably worse - which is how this test notices the day someone weakens the rule.

The last piece is what happens when a path crosses more than one obstruction. Contiguous runs
of obstructed samples collapse into *screens* - a long slope is one screen, not one charged
sample after another - and each screen is diffracted from the shadow the screens before it
cast: Deygout's method, with the total floored at whatever the single worst screen costs
alone. Broken ground offers more screens than are worth superposing, so the **three tallest**
are kept (`RF.diffractionEdgeLimit`) and the rest dropped. That cap is worth 0.6 dB of the
mean and moves no cell across the sensitivity line on either the default or the loudest
configuration - but it is a choice, not a free optimisation: on 2 % of the paths from the
default mast the screens it discards would have added more than 10 dB, all of them on cells
already deep in shadow, and `diffraction: the first screen is charged in full, the ones
behind it are not` pins that the cap keeps the tallest rather than the earliest.

How often any of this matters, measured: **29.8 %** of the paths the default configuration
walks cross two or more screens (844 of 2828), and on the loudest link the panel allows -
43 dBm into a −124 dBm receiver, where every cell on the map gets walked - **72.2 %**. Adding
the second screen moved 22.1 % of the cells of the default map, by up to 15.7 dB, and it is
why the ridge behind a ridge is no longer free. One visible consequence: the read-out's
**Shadowed cells** line - the share of walked cells diffracted by more than 6 dB - now reads
73.7 % on the default configuration, where most of those cells still link.

### What the edge of the colour is

It is worth being exact about this, because a coverage picture whose edge means the wrong
thing is worse than no picture. Three things can end the colour, and the app tells you
which one did:

- **The link.** The budget runs out: the free-space figure falls below your receiver
  sensitivity and the ground cannot do anything about it. This is the answer you want,
  and by default it is what you get - the read-out prints
  `the link: budget 0.94 km, last link 0.94 km`.
- **Your study range.** *Study range* is a work area, not a prediction: it says how far
  from the mast the sweep is willing to look. The default, 3800 m, is the whole map seen
  from its middle - so by default the edge you see is the link's own, and no ring is drawn,
  because a ring that cannot bind only teaches you to ignore the one time it can. The slider
  runs to 6 km, deliberately past the map: mast positions are not all equal, and a mast in a
  corner has 7.2 km of ground on the other side of the picture, so a 6 km work area really
  does cut something there (in the other directions from that same mast the wall 100 m away
  cuts first, and the direction table says which is which). Lower the range and the ring
  appears, points beyond it are not measured at all (no paint, no counts), and any direction
  that was still linked where the search stopped is printed as `>= <range>`. The read-out
  then says `our study range 1.40 km - the link would reach 1.67 km`.
- **The edge of the map.** A big enough antenna on a small enough map: the search walks
  off the world. Then it says `edge of the map 0.30 km - the link would reach 11.82 km`.

Two shares are printed, because one number without its denominator is how a small link on
a big map gets read as a broken antenna: *Cells with link* is the share of the whole map
(the default dipole serves 836 of 30624 evaluated points - 2.7 %), while *Served within
reach* is the share of the ground where a link was physically possible at all (29.6 %).
The Fresnel percentages are stated over a third denominator, the linked set, because a
zone verdict about a point that cannot receive anything is not information.

Beyond the budget radius the app does not walk a ray; it stores the free-space upper
bound and paints nothing. That is a shortcut, not an approximation: diffraction and
clutter can only subtract, so if free space alone already misses your sensitivity the
ground cannot rescue the link. `coverage: the budget pre-filter cannot move the link
boundary` proves it on the real map - same linked set, same bands, bit-identical
decibels at every walked point, and every dismissed point demonstrably unreachable.

### Antenna physics: why a wide antenna cannot have long reach

Gain and beamwidth are the same fact stated twice. An antenna that puts 12.4 dBi into a
beam 69 degrees wide in both planes is not a strong antenna, it is two numbers that were
never reconciled - a 69 x 69 degree beam holds about 9.4 dBi, and that ceiling is
arithmetic, not a preference. This app now derives every directional design's gain from
the beamwidths it draws, times an aperture efficiency for the losses a real build has
(0.60 for a Yagi, 0.75 for a biquad, 0.55 for a patch; `ANTENNA.apertureEfficiency`), so
the lobe on screen and the decibels in the link budget cannot disagree. The gains and
beamwidths that come out of it are the two first columns of
[The five designs](#the-five-designs), and the free-space ranges they buy are listed there
too; a unit test recomputes the Kraus arithmetic in the model and refuses any design whose
gain exceeds what its own beam can hold.

The two omni designs keep an array-factor gain instead - a half-wave dipole is 2.15 dBi and
N in-phase sections add `10*log10(N)` less a decibel for the feed - because a 360 degree
azimuth plane is not a main lobe and the beam-to-gain arithmetic above does not apply to it.
The reflector plate on the biquad still earns its keep, but in the front-to-back ratio
(17 dB at a close plate, 26 dB at a far one), which is what a plate actually buys.

### Why two antennas of different gain can look the same size

They are not the same, and the numbers say so; but on this ground the difference is often
not in *range*. Up the east-looking corridor from the centre, with the mast at the tallest
the panel allows (40 m), the five designs reach 0.93, 1.56, 1.67, 1.86 and 2.18 km in
exactly the order of their gains - dipole, patch, collinear, biquad, Yagi - and every one of
them finishes within 1 % of its own free-space figure. On ground that flat and that clear,
gain is the only thing answering, and the biquad bug would have shown up here as a design
reaching past a wider-beamed one with less gain. That ordering is a browser
test, so the app cannot quietly stop showing the difference.

Move the same antennas to the map centre at the default 10 m mast, still aimed east, and the
order scrambles: the Yagi reaches 0.81 km of its 2.20 km budget, the patch 0.93 km of 1.57
km, and the biquad - lowest gain of the three - reaches furthest at 0.97 km of 1.86 km.
Nothing is broken. A narrow beam pointed at the rise east of the centre drives straight into
it, while a wide beam spills past the same rise onto ground that is still in sight. Gain is a
property of the antenna; range is a property of the antenna *and* the ground, and the map
is where you see which of them is answering.

### What the colours can mean

One control, three views, and only the *colour* of a cell changes between them. The
alpha channel - solid, faint, blank - is the same in all three, because that part of the
message is not a matter of taste.

| View | A cell's colour answers | Scale |
| --- | --- | --- |
| **signal bands** | which of four RSSI steps is this point in? | keyed to your receiver sensitivity: `+45`, `+30`, `+15`, `0 dB` above it |
| **range gradient** | how much room does this link have left? | continuous yellow through pale yellow to pink, `0` to `30 dB` of margin over the receiver |
| **Fresnel zone clearance** | how much of the first Fresnel zone has the ground left me? | purple (zone cut) through amber (partly cut) to green (`>= 60 %` clear) |

The gradient is there because the bands hide the thing people actually read off a map. On
the default configuration the banded view paints 816 of the 836 linked cells in *one*
colour (the remaining 20 are a band higher); the gradient splits the same 816 into 8 strong,
58 weaker and 770 at the limit, and that split is the difference between "it links"
and "it links, this far, with this much to spare".

| ![The valley scenario in the signal-bands view: 1958 of its 2019 linked points are one colour, because they all land between -80 and -65 dBm; 59 are a band brighter, 2 two bands above that. The read-out is identical to the gradient picture - best -48.1, median -77.4, worst -119.4 dBm - because a view changes a cell's colour and nothing else.](docs/screenshot-bands.png) | ![The same scenario, same sweep, same 2019 linked points, in the range gradient: 19 strong near the mast, 209 with room to spare, 1791 at the dying pink rim, and a warm core you can only see once the bands are taken away.](docs/screenshot-valley.png) |
| --- | --- |
| *signal bands* | *range gradient* |

The scale is deliberately absolute:
`RF.gradientMaxMarginDb` is 30 dB of margin, not "the best cell on this map", because a
ramp that quietly re-normalises itself to whatever is on screen makes two screenshots of
two different links incomparable. 30 dB is measured, not chosen - over the ground a link
actually lights up, margin spans 0-30 dB on the default dipole, 0-34 on the flat-field
scenario and 12-107 on the loudest link the panel allows, and a top of 45 painted nearly
every map pink.

The three views are presentation, not physics, and one browser test insists:
`browser: the coverage view repaints the drape, and no view changes a decibel` walks
`gradient -> bands -> zone -> gradient` and asserts that the whole coverage statistics
object is `deepEqual` at every stop, while the pixels do move. Switching a view repaints
the grid the sweep already computed; it does not run a second model.

### The earth is round, and now it hides things

Rays are traced over a curved earth: the standard `k = 1.413` effective radius, the same
figure the diffraction uses, so the profile a ridge is measured against already bows. The
height field is a planar datum, so the transform leaves the ground where it is and bends the
**ray** down toward it - which is the direction that matters. For a long time this app did
the opposite, adding the bulge to the ray instead of subtracting it: every ray was lifted
over every obstacle and the round earth was quietly helping the link. `rayProfile` now
reports a ray that exactly grazes the ground at the radio horizon of the two heights it is
walked between - clear inside it, the earth itself the obstruction beyond it - and
`tests/unit/raycurvature.test.js` pins exactly that, because a sign is the one thing a
propagation model can get wrong without anything looking broken.

What the curve is worth here depends entirely on how high the mast is, and both halves of
that are measured rather than asserted. Over a featureless plane with the loudest budget the
panel allows (43 dBm into a −124 dBm receiver, a free-space budget of eleven thousand
kilometres) every mast height still links every point of the map, the farthest being 3677 m
away at a corner - so the curvature is not what *ends* a picture on this map, and
`coverage: the earth is never what ends the coverage inside this map` keeps it that way. But
at the panel's lowest mast, 0.5 m, **the earth is the obstruction for 2232 of those
points**, every one of them between 3024 m and the corner at 3677 m, which is exactly where a
0.5 m mast loses sight of a terminal standing on the ground: 3.0 km. Raise the mast to one
metre and the count is nil. `coverage: the earth does hide part of this map, from the mast
height that can see it` pins the other half.

So there are two horizons in play and the read-out quotes both. The one it names is the
textbook radio horizon for the mast and the *zone receiver height* - 21.9 km at the default
10 m mast with a 4 m terminal, 35.3 km for the loudest configuration, 11.5 km even for a
0.5 m mast with a terminal up at 4 m - and all of those are off this 5.2 km map. The other
one, against a terminal lying on the ground, is 3.0 km at 0.5 m of mast and inside the map
until the mast passes about 2 m. On the default configuration the row reads
`k 1.41 - the ray bows 0.012 m over the last 0.94 km link; the earth curves away long before
this map ends`; at 0.5 m the same row adds `a terminal on the ground is out of sight past
3.00 km`, because at that height it is no longer a fact about textbooks.

What the curve does to the decibels on real ground is small, and it is worth knowing how
small: on the default configuration, of the 2828 cells whose path the sweep walked, three
differ from the same map with a flat earth by more than 0.05 dB, the worst by 1.24 dB at
870 m. Curvature is not a drama knob here. What it does is decide *which side of a ridge
brow* a cell sits on - and once a screen is behind a screen, that is where the multi-edge
sum above starts to compound ([What the numbers mean](#what-the-numbers-mean)). It is not
optional either: Fresnel verdicts are walked over the curved surface even when *Terrain
shadowing (diffraction loss)* is off, and a unit test compares the two
(`coverage: switching the terrain off for dB does not flatten the earth for the zone` -
0.228 against 0.156 first-zone radii on a grazing path).

And the reason a real low mast dies in an empty valley - the horizon - is still visible
here as a *height* effect, because it is the same geometry seen from the inside: the flat
field scenario at 10 m of mast links 289 points and reaches 750 m of a 2020 m budget, at
24 % zone-clear; lift the same antenna to the 25 m the preset ships with and it links 1806
points over 2000 m at 95 % zone-clear. Nothing about the horizon moved. What moved is that
the ray and its first zone now have room to pass over the ground between.

### Decibels are not the same as a working link

Diffraction loss answers "how much does that hill cost?". It does not answer "is
this a link I trust?". For the second question the tool also checks the **first
Fresnel zone**: the ellipsoidal bubble of active space between the two antennas,
whose radius halfway along a path of length `D` is

```
r1 = sqrt(lambda * D / 4)      (at 1.4 km: 11 m at 868 MHz, 4.3 m at 5.8 GHz)
```

Anything standing inside that bubble disturbs the wave even when the straight ray
between the antennas is clear. The rule of thumb used here is the usual one: a path
is **clear** when the ground stays at least 60 % of `r1` below the ray everywhere
along it. The two measures are one physics seen twice - the diffraction parameter
this app charges decibels with is exactly `v = sqrt(2) * h / r1`, where `h` is the
height of the ray above the ground - so the zone flag is deliberately **not** an
extra loss term. Charging the same ridge twice would be a bug, not a model.

The point of reporting both is the population where they disagree: cells that make
their link budget with the zone cut. On the default map at 868 MHz the omni dipole
links 836 points and 101 of them (12.1 %) do it with the first zone cut - links that
work on paper and misbehave in the field. Stated the other way round, 87.9 % of the
linked points are zone-clear; the 27796 points the budget dismissed are not in that
number, because the app never asked the ground about them.

Two things follow from the criterion being a *ratio*, and both are visible in the
app rather than hidden in a constant:

- **It depends on the band.** A longer wavelength is a fatter zone, so more of it to
  cut. With the same ground and the same receiver, of the points that actually link:
  77.1 % clear at 433 MHz, 87.9 % at 868 MHz, 92.9 % at 2.4 GHz, 93.3 % at 5.8 GHz. Read
  that last one carefully: at 5.8 GHz only 15 points link at all on the default
  configuration, because a 140 m budget leaves almost nothing to have an opinion about.
  The percentage is honest; the sample is the story.
- **It depends on how high the receiving terminal is.** Measured against a receiver
  lying on the ground, the zone closes to nothing at the receiver and the criterion
  is always failed - over flat ground a 10 m mast is only zone-clear inside
  `2.2 * (h1 + h2) / lambda`, which is 89 m at 868 MHz and not much better anywhere
  else. So the app asks for a *zone receiver height* (default 4 m: a client on a
  roof or a short pole) and prints that number in the legend and in
  `window.__sim.fresnel()`. Move the slider and the map changes; the decibels do
  not, because the diffraction loss is still charged for the ray that ends on the
  cell's own ground.

The drawn volume is the zone of one reference link - the boresight out to where it
reaches the ground, at a terminal one receiver-height above it - because that is the
largest zone the antenna has to keep clear anywhere it is looking. Its radius is
widened by a fixed factor so it is visible next to a five-kilometre map; at
`FRESNEL.radialExaggeration: 1` you would see the truth, which is a hairline.

![The same valley scenario again, this time in the Fresnel-zone view: the drape is green where the ground leaves the first zone clear and amber where it eats into it, with a few purple patches where the ground stands above the ray - 99.8 % of the 2019 linked points are clear and only 5 are cut, because an open valley is good real estate - and the pale translucent band running out along the beam is the first-zone volume itself. Every number in the read-out is identical to the valley pictures above: this is a different question about the same sweep.](docs/screenshot-fresnel.png)

Green keeps at least 60 % of the first zone clear, amber is partly cut, purple is
cut outright - the ground stands above the ray. The zone legend also carries the
"out of budget - not measured, not painted" row and a line saying that its three rows
count every path the ground was asked about, link or no link: the faint rim is a measured
failure, the blank ground was never measured. The read-out panel puts the same
numbers in words: how much of the *linked* set is clear, how many cells have the budget
but not the zone, and the worst clearance on the map with the distance it happened at.

### What this does not model

It is a planning toy, not a propagation site survey. Deliberately left out:
reflections and multipath fading (the zone flag hints at where ground reflection
would matter, it does not compute it), building and tree clutter (approximated by
one flat "clutter loss" slider), rain and vegetation loss, antenna noise and
interference, receiver desensitisation, terrain-pipe losses inside the valley
beyond diffraction, ducting and temperature-inversion propagation, urban
empirical models (Okumura-Hata and friends), and everything about the return path
(this is one-way RSSI). Terrain shadowing itself is a *knife-edge* model, applied
per obstruction and summed Deygout-style along the path: it knows about several ridges
in a row now, but it does not know that ground can also *reflect*, that a real surface
has a reflection coefficient and a grazing angle, or that two paths arriving a
microsecond apart are not the same as one path that is 6 dB quieter.
The hardware geometry is drawn to be recognisable, not to scale.

Two honest oddities in the diffraction model are worth naming, because both can look like
bugs if you go looking for monotonicity. Deygout's sum is floored at whatever the single
worst screen costs on its own, so the total never falls below one screen; but it is not
monotone in the height of a *near* screen, because lifting the ridge you are looking over
throws a deeper shadow on everything behind it - measured here as 13.31 dB with an 8 m near
ridge and 9.99 dB with a 12 m one, from the same mast. The alternative considered here,
Bullington's rule of taking the worst single-screen loss along the path, is neither monotone
nor reciprocal - the same two ridges driven from opposite ends disagreed by 3 dB - so it is
not the safer choice, only a different mistake. Both behaviours are pinned by
`tests/unit/multiedge.test.js` rather than hidden.

Two limits of the *tool* are worth naming here as well, because both can be mistaken for
physics. The study range is a work area chosen for the sweep - 3800 m by default, which is
the whole map from its middle, and up to 6 km, which is more than the map and can still bind
on a mast standing in a corner - so by default nothing is cut off, and if you lower it the
ring and the `>=` marks say so.
And inside the sweep, ground beyond the free-space budget is never ray-walked: that is a
shortcut whose worst case is provably a point that could not have linked anyway (see
[What the edge of the colour is](#what-the-edge-of-the-colour-is)), and its result is
painted as "not measured" rather than as a verdict.

## Development

Contributors: see [GUIDELINES.md](GUIDELINES.md) for the architecture rules,
testing policy and tooling. Quick version (needs Node 22+):

```bash
npm run vendor      # verify the vendored three.js against its manifest
npm run lint        # architecture + licensing + static-hosting rules
npm run test:unit   # pure maths + state, no browser
npm run test        # unit + headless-browser tests
npm run verify      # all of the above
```

## Deploying it anywhere

Because the entry point sits at the repository root and every URL in the page is
relative, it can be hosted from a sub-path without changes:

- **GitHub Pages**: push the repository, then set Pages to build from the
  `main` branch / root. No workflow, no build step.
- **Any web host**: copy `index.html`, `assets/`, `src/` and `vendor/`. Nothing else.
- **Double-clicking `index.html`** does not work - browsers refuse to load ES
  modules from `file://`. Serve it, even locally.

## Licence

The simulator is MIT licensed - see [LICENSE](LICENSE), © 2026 martin roos.

three.js is MIT licensed by its own authors; the exact shipped build, its
license text and the hashes of the upstream files it was built from live in
[`vendor/three/`](vendor/three) (`LICENSE.txt`, `NOTICE.md`, `manifest.json`).
Running `npm run vendor` verifies that the file the browser loads is byte for
byte the audited one.
