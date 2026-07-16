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
2. B — README refresh: document `P` and `E` in the Controls table; update
   hero imagery/copy for the point-cloud default look; make clear this fork
   adds the point-cloud + export features on top of upstream.
3. C — GLB export: `G` key downloads a binary .glb (GLTFExporter, embedded
   textures); caption updated; verify by re-parsing the exported blob.
4. D — Point-cloud controls: `+`/`-` adjust point size; `C` cycles color
   mode (texture / height gradient / depth fade); current mode surfaced in
   the caption. Also expose the same via the dev __hooks for testability.
5. E — Dissolve transition: toggling `P` animates points scattering out /
   reassembling instead of a hard swap.

## Done
- 2026-07-16 — Task A (c27809d on dev): skip per-frame
  computeVertexNormals() while points mode is active. Builder-measured
  1.552 -> 0.925 ms/frame (-40%); reviewer re-measured 1.000 ms/frame
  median post-merge.
- 2026-07-15 — Task 0 baseline (54532d7 on dev): point-cloud mode + STL
  export committed; docs scaffolding; *.stl ignored.
