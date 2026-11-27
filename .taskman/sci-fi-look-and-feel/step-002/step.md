# step-002: panel chrome — glass groups, glowing titles, footer

## How to perform this step

1. In `assets/app.css`, restyle only these existing selectors (no renames):
   - `.panel`: `background: linear-gradient(165deg, rgba(14, 24, 40, 0.92), var(--bg-panel) 45%)`,
     right border `1px solid var(--line-strong)`, inset glow
     `box-shadow: inset -1px 0 24px rgba(79, 214, 255, 0.05)`; keep width,
     padding, `overflow-y: auto`, `scrollbar-width: thin`.
   - `.group`: glass card — `background: rgba(11, 19, 32, 0.62)`,
     `border: 1px solid var(--line)`, clipped sci-fi corners
     `clip-path: polygon(var(--cut, 14px) 0, 100% 0, 100% calc(100% - var(--cut, 14px)), calc(100% - var(--cut, 14px)) 100%, 0 100%, 0 var(--cut, 14px))`
     (define `--cut` in `:root`); add a faint scanline texture
     `background-image: repeating-linear-gradient(0deg, rgba(79, 214, 255, 0.028) 0 1px, transparent 1px 3px)`.
     Note: `clip-path` also cuts the border corners — that is the intended
     angular look; keep a plain `border: 1px solid var(--line)` for the edges
     the clip leaves. If the clipped border reads broken at 1px, drop the
     border and add an outer `box-shadow: 0 0 0 1px var(--line)` only if it
     survives the clip; otherwise accept the clipped hairline.
   - `.group-title`: `font-size: 0.78rem; letter-spacing: 0.16em;
     text-transform: uppercase; color: var(--accent); font-weight: 600;
     text-shadow: 0 0 10px rgba(79, 214, 255, 0.35); margin-bottom: 10px;` and
     a leading tick: `.group-title::before { content: "▸ "; opacity: 0.7; }`.
   - `.group-note`: unchanged layout, `color: var(--text-dim)`.
   - `.panel-foot`: `border-top: 1px solid var(--line)`; `.btn-ghost` stays the
     quiet footer control (dim → `--accent` on hover).
2. Verify as in step-001: server on 8147 must still be running (restart it if
   not), `node tools/timebox.js -t 120 -- node tools/browser.js shot --url
   "http://127.0.0.1:8147/" --name skinstep --width 1440 --height 820 --out .tmp/skin-002.png`,
   read the PNG: the left panel reads as a glass console with angular cards and
   glowing cyan titles, text still legible (contrast dim-on-dark >= the old).

## Expected result

The control panel looks like a spacecraft console: glassy angular group cards,
letter-spaced glowing titles, no layout shift (same widths/paddings), tests'
classes untouched.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->

- Executed: `.panel` gradient + inset glow + strong right border; `.group` glass
  card with scanline texture and `clip-path` corner cut (`--cut: 14px`); glowing
  uppercase `.group-title` with `▸` prefix. The clipped hairline reads fine at
  1 px - kept the border, no fallback needed. Verified in `.tmp/skin-002.png`:
  angular console cards, dim text still legible, no layout shift; lint green.
- Note: `.group` lost `border-radius: var(--radius)` (a clip and a radius fight);
  `--radius` itself stays for `select`/`dialog`/`boot-error`.
