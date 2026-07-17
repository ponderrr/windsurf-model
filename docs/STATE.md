# Coordinator State — windsurf-model

> Rule: a brand-new coordinator chat must be able to read this file top to
> bottom and resume with no other context.

## Operating model
- Coordinator/Builder method: one long-lived coordinator chat plans, writes
  self-contained briefs, and reviews relayed reports; disposable builder
  sessions execute exactly one job each; the human relays reports between
  them. The coordinator never edits the repo directly.
- Integration branch: `dev`. `master` stays at the fork baseline; merging
  dev -> master is the human's call.
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
- 2026-07-17 — Task E merged to dev (37809eb): dissolve transition — `P` now
  runs a 0.65 s eased dissolve instead of a hard swap (→solid: points scatter
  outward 0.25–0.80 m along per-point index-hashed offsets, solid appears at
  completion; →points: solid hides immediately and the scattered points
  reassemble onto the wind-deformed surface). `P`/`+`/`-`/`C` are ignored
  mid-transition; reduced-motion users get the old instant swap; the fog
  invariant follows the internal mode flip (fog drops at →solid END, returns
  at →points START). main.js no longer owns a pointsMode boolean — mode state
  lives in the pointCloudify handle (`isPointsMode()`/`isTransitioning()`),
  and `cloud.update(tSec)` now takes the frame time from both call sites.
- 2026-07-17 — Task D merged to dev (e421630): point-cloud controls — `+`/`-`
  resize points (x1.25 per press, clamped 0.003–0.05 m on the shared
  PointsMaterial), `C` cycles texture / height gradient / depth fade colors
  (per-cloud color attributes lazily cached; texture colors bitwise-restored
  after a full cycle). Depth fade adds scene fog (0x14161a, near 4, far 12);
  invariant "fog non-null exactly while points mode && depth" verified
  through a `P` round-trip. Transient caption key feedback; dev handle
  `window.__cloud` exposes set/get size and color mode.
- 2026-07-16 — Task C merged to dev (4815acd): `G` key downloads a binary
  glTF (.glb) of the kit's solid meshes (GLTFExporter, embedded textures);
  point clouds are hidden for the parse and restored to whatever points-mode
  state was active beforehand; dev-only `window.__glbBytes()` added for
  re-parsing exports headlessly; README documents the `G` control.
- 2026-07-16 — Task B merged to dev (bf126ab): README + docs now document
  the fork's point-cloud default, `P`/`E` controls, and the fork-vs-upstream
  positioning (live demo runs upstream's solid render); new hero-points.png
  leads the README with the old hero.png recaptioned below it; STATE/BACKLOG
  `main` -> `master` wording fixed to match the repo's actual default branch.
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
  with __tick for deterministic verification. HOWEVER, the pane's screenshot
  action flushes several REAL rAF callbacks with wall-clock timestamps — a
  stray real frame can advance/complete time-based state (e.g. a dissolve
  transition) before capture. Take state-sensitive readings via __tick
  BEFORE screenshots, and freeze cloud.update (temporarily no-op __tick /
  the handle's update) when capturing mid-transition states.
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
- If the page loads while the embedded pane viewport is 0×0, camera.aspect
  becomes NaN and frameKit() NaN-poisons camera.position permanently (no
  resize recovers it) — size the pane first, then (re)load; a blank canvas
  after load means reload at a real viewport. Mtime-touch a src file to
  force a Vite reload without content changes. When recovering, prefer an
  in-page location.reload() over the browser tool's navigate — navigate can
  re-trigger the 0×0 state.
- In-page eval CANNOT dynamic-import three/addons under the dev server in a
  nested worktree (Vite fs.allow boundary + bare-specifier rewriting happens
  only in the transform pipeline). For verification that needs an addon, add
  a temporary DEV-gated hook in src/ so Vite transforms it, run the check,
  then revert the hook before committing — and prove the revert (grep +
  clean diff).

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
