# Coordinator State — windsurf-model

> Rule: a brand-new coordinator chat must be able to read this file top to
> bottom and resume with no other context.

## Operating model
- Coordinator/Builder method: one long-lived coordinator chat plans, writes
  self-contained briefs, and reviews relayed reports; disposable builder
  sessions execute exactly one job each; the human relays reports between
  them. The coordinator never edits the repo directly.
- Integration branch: `dev`. `main` stays at the fork baseline; merging
  dev -> main is the human's call.
- Build tasks branch off `origin/dev`, push their branch, and end with a
  relay report. An independent review/merge task verifies claims (scope
  diff, spot-checks, re-run gates) before merging to dev and then updates
  these docs.
- Builder guardrails live at the top of docs/BACKLOG.md and are pasted into
  every brief.

## Repo facts
- User's fork of hughes-research/windsurf-model (GPL-3.0-or-later);
  origin = github.com/ponderrr/windsurf-model. Local checkout:
  /Users/frosty/Projects/windsurf-model.
- Vite + three ^0.172, plain ES modules, no framework, no test suite.
  Standing gate: `npm run build` succeeds, plus feature-specific manual
  verification in the browser.
- App: fully procedural 3D windsurf kit (geometry lofted from catalog-photo
  silhouettes). Entry point src/main.js; per-part builders in src/.

## Live state
- 2026-07-16 — Task A merged to dev (c27809d): `sail.update(t, needNormals =
  true)` in src/sail.js skips `geo.computeVertexNormals()` while points mode
  is active; both call sites in src/main.js (animation loop and
  `window.__tick`) pass `!pointsMode`. `needsUpdate` on the position
  attribute stays unconditional; solid mode (`P`) still computes normals so
  shading stays correct. Builder-measured 1.552 -> 0.925 ms/frame (-40%) via
  60x __tick medians; reviewer re-measured 1.000 ms/frame median on the same
  method post-merge. Baselines vary by machine/pane size — the ~2.6 ms
  figure further down was a different session, not a regression. Carries one
  pre-approved lockfile commit (package-lock.json `license` field sync, no
  dependency changes).
- 2026-07-15 — `dev` created. Baseline commit: point-cloud rendering mode
  (default ON, `P` toggles solid; src/pointCloud.js — area-weighted surface
  sampling, ~220k points across 25 clouds, texture-sampled colors, clouds
  re-follow the wind-deformed cloth via position-attribute version
  tracking + barycentric weights) and binary STL export (`E`, STLExporter,
  world-space). docs scaffolding added; *.stl gitignored.

## Hard-won gotchas
- The embedded browser pane used for verification throttles rAF to ZERO:
  the render loop never runs on its own. Dev builds expose window.__tick(t)
  (manual frame step), window.__kit, and window.__stlBase64(). Drive frames
  with __tick for deterministic verification.
- Browser-pane downloads are sandboxed (anchor-click downloads vanish). To
  extract a file from the page, POST it as base64 to a localhost HTTP
  receiver, or verify in-page via __stlBase64().
- Verified perf baseline in points mode: full frame (sail.update + cloud
  follow + controls + render) ~2.6 ms, measured by timing 60x __tick.
- Point colors: texels are sampled as sRGB and converted via
  Color.setRGB(..., SRGBColorSpace); TEX_BOOST 1.3 stands in for scene
  lighting; PointsMaterial has toneMapped:false. Untextured fittings get a
  +0.09 lift so dark carbon reads on the dark background.
- sail.update() deformation is z-only; cloud follow recomputes xyz anyway
  (cheap, more robust).

## Decisions (don't re-litigate)
- Point cloud is the DEFAULT view; the solid render stays behind `P`.
- Dev-only debug handles (__kit/__tick/__stlBase64) ship, gated on
  import.meta.env.DEV.
- STL export ships open (non-watertight) surfaces; a printable thickened
  variant is out of scope unless requested.
- Bootstrap exception: the baseline was committed directly to dev with no
  review branch — one-time only; all subsequent work goes through
  branch -> review -> merge.

## Open questions
- None blocking. Note: the fork has no Netlify deploy; the README badge
  points at the upstream author's demo.
