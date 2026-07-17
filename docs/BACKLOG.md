# Backlog — windsurf-model

## Guardrails (copy into every builder brief)
- Branch off `origin/dev`, never `master`. Every build task ends with
  `git push -u origin <branch>`.
- Shared checkout at /Users/frosty/Projects/windsurf-model: verify the
  current branch before every commit, stage by explicit path, never
  `git add -A` or `git add .`.
- Do not disturb running services: a Vite dev server may be live on :5173.
  Start your own on another port (`npm run dev -- --port 5180`) if needed
  and stop it when done.
- Locked without explicit coordinator sign-off: LICENSE, .github/,
  docs/superpowers/, the catalog photo PNGs (repo root *.png and
  src/board_map.png), package.json and package-lock.json.
- No secrets committed. No new runtime dependencies (three + vite only)
  unless the brief says so.
- Generated exports (*.stl, *.glb, ...) are gitignored — never commit them.
- Debug/test-only code must stay behind `import.meta.env.DEV`.
- Verification honesty: report exactly what you verified and how; declare
  anything you could not verify as an honest gap. Never fabricate numbers.

## Ranked queue
~~1. A — Points-mode perf: skip per-frame computeVertexNormals() (and any
   other solid-only per-frame work) while point mode is active; make sure
   toggling back to solid restores correct shading. Gate: __tick timing
   before/after, solid mode visually intact after a toggle round-trip.~~
~~2. B — README refresh: document `P` and `E` in the Controls table; update
   hero imagery/copy for the point-cloud default look; make clear this fork
   adds the point-cloud + export features on top of upstream.~~
~~3. C — GLB export: `G` key downloads a binary .glb (GLTFExporter, embedded
   textures); caption updated; verify by re-parsing the exported blob. Also
   add two README micro-edits while touching this area: a `G` row in the
   Controls table, and a one-line Quick-start disambiguation that the
   hosted demo is the upstream solid-render version.~~
~~4. D — Point-cloud controls: `+`/`-` adjust point size; `C` cycles color
   mode (texture / height gradient / depth fade); current mode surfaced in
   the caption. Also expose the same via the dev __hooks for testability.~~
~~5. E — Dissolve transition: toggling `P` animates points scattering out /
   reassembling instead of a hard swap.~~
6. F — Viewport-zero guard: make frameKit()/the resize handler no-ops (or
   clamp) when innerWidth/innerHeight is 0 so a hidden-pane load can't
   NaN-poison the camera; verify by loading at 0×0 then resizing.
7. G — Dedupe three.js: console warns 'Multiple instances of Three.js being
   imported' since the GLB exporter import; fix via vite
   resolve.dedupe:['three'] (or optimizeDeps.include) in a minimal vite
   config; gate: warning gone, build passes, E/G exports still parse.

## Done
- 2026-07-17 — Task E (37809eb on dev): dissolve transition — 0.65 s eased
  scatter/reassemble on `P` (per-point hashed scatter 0.25–0.80 m, wind
  keeps deforming the cloth mid-transition), keys ignored while
  transitioning, reduced-motion instant-swap fallback, fog invariant held
  at both flip boundaries.
- 2026-07-17 — Task D (e421630 on dev): point-cloud controls — `+`/`-` size
  steps (x1.25, clamped 0.003–0.05 m), `C` color cycle
  texture/height/depth, depth-mode scene fog with the fog invariant held
  through a `P` round-trip, caption feedback, `window.__cloud` dev handle.
- 2026-07-16 — Task C (4815acd on dev): `G` key binary glTF export
  (GLTFExporter, embedded textures) — kit meshes only, point clouds hidden
  for the parse and restored to the active points-mode state afterward.
  GLB ~2.83 MB (2,829,328-2,829,364 B observed across export calls; size
  varies slightly with sail/mast animation phase at export time).
- 2026-07-16 — Task B (bf126ab on dev): README + docs refresh — `P`/`E`
  Controls rows, point-cloud hero shot (old solid hero recaptioned below),
  fork-vs-upstream positioning paragraph, `main` -> `master` wording fixes.
- 2026-07-16 — Task A (c27809d on dev): skip per-frame
  computeVertexNormals() while points mode is active. Builder-measured
  1.552 -> 0.925 ms/frame (-40%); reviewer re-measured 1.000 ms/frame
  median post-merge.
- 2026-07-15 — Task 0 baseline (54532d7 on dev): point-cloud mode + STL
  export committed; docs scaffolding; *.stl ignored.
