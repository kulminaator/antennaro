# step-005: browser tests: relocate without reshaping the world

## How to perform this step

1. Read `tests/browser/relocate.test.js` fully. It currently proves the pad travels
   with the mast; that is now the opposite of the contract. Rewrite it through
   `window.__sim` only (GUIDELINES.md §9), keeping its structure and the
   `session.errors()` assertions:
   - "relocating the site moves the pad, the rig and the coverage" becomes **a
     relocation moves the rig, the coverage and the pixels, and not one metre of
     ground**: capture `heightAt()` at ~8 fixed points spread over the map (including
     the old site and the new one) before and after `patch({site:{x:365,z:-400}})`,
     assert every one is identical (`almost(..., 1e-6)`), while `scene().sitePosition`
     moved, `pixelStats()` changed and `site().groundY` equals `heightAt(365,-400)`.
   - "the site pad stops at its own reach" becomes **the ridge keeps its shape**: at
     the ridge-shoulder site, assert the ground 60 m east of the mast is still far
     below the mast foot (the cliff the pad used to fill in) - compare the site with
     the mast there against the site with the mast elsewhere, and require the relief
     to be the same within a centimetre.
   - The hilltop/valley test keeps its meaning, reworded: the mast rides the natural
     ground - `groundY` high on the mountain, low in the valley - and the same spot
     reports the same `groundY` regardless of where the rest of the map's mast used to
     be.
   - The drag tests (`grabSite`/`dragSiteTo`/`releaseSite`) keep their assertions
     about the site moving in 5 m steps; the comment that says the pad regrades to the
     landing ground must say the mast simply lands on the ground there.
   - The reset test keeps `reset-site` / `reset-all` bringing the mast home, but its
     `heightAt(0, 0)`-equals-`groundY` assertion no longer talks about a pad.
2. If a test needs the terrain to look the same before and after, say so explicitly in
   the message: "moving the antenna changed the map" is the regression this file now
   guards.
3. Verify, timeboxed and with no orphan browsers:

   ```bash
   node tools/browser.js stop --all
   node tools/timebox.js -t 500 -- node tools/test.js --browser --only tests/browser/relocate.test.js
   node tools/browser.js status --all
   ```

   All green. If the run hangs, check for orphan browsers first (`stop --all`) before
   believing the code is at fault.

## Expected result

`tests/browser/relocate.test.js` proves in the running app that relocation moves
everything that belongs to the antenna and nothing that belongs to the map.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->
