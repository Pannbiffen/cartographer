# Cartographer

Free, open-source D&D battlemap maker (React 19 + TypeScript + Vite + Tailwind, 2D canvas). Pushing to `main` deploys to GitHub Pages: https://pannbiffen.github.io/cartographer/

Inspired by Dungeon Scrawl: match its features, never copy its code, art or assets. Over time it should become its own product.

## Commands
- `npm run dev`: dev server on :5173. If it ever serves a blank page after edits, restart it (stale transform cache).
- `npm run build`: type-check (`tsc -b`, including e2e) and build.
- `npm run lint`: oxlint, should report nothing.
- `npm run test:e2e`: Playwright tests in `e2e/` (own server on :5174, ~25s). Add or extend a spec for every fix or feature. Helpers in `e2e/helpers.ts` map grid cells to screen points for the default 1440x900 view of the starter map.

## Code map
- `src/App.tsx`: map state, undo history (`modifyMap` with `coalesce` keys so one stroke/drag = one undo step), shortcuts, autosave.
- `src/canvas/MapCanvas.tsx`: pointer input, tools, previews.
- `src/core/renderers/mapRenderer.ts`: the single renderer used by canvas and all exports.
- `src/core/objects.ts`: doors/stairs/props/labels: hit testing, selection, edits. Replace objects; never mutate them (history shares them).
- `src/core/tools/toolGeometry.ts`: brush, tunnel and door-edge geometry.
- `src/core/export/`: PNG/WebP, tiled PDF, Universal VTT.

## Workflow
- Work on a branch per batch (`fix/...`, `feat/...`). Make one commit per logical change with a `fix:`/`feat:`/`docs:`/`chore:` prefix. Ask before merging to `main` or pushing.
- Backlog is GitHub Issues (`gh issue list`). Put `Fixes #N` in commits. Every new issue gets a `model: opus` (complex or design-heavy) or `model: sonnet` (routine, well-scoped) label, plus `enhancement`/`bug`/`ui`/`pro-parity`/`chore` as fits.
- Keep the README feature list and shortcut table in sync with the app.
