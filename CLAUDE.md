# Cartographer

Free, open-source D&D battlemap maker (React 19 + TypeScript + Vite + Tailwind, 2D canvas). Pushing to `main` deploys to GitHub Pages: https://pannbiffen.github.io/cartographer/

Inspired by Dungeon Scrawl: match its features, never copy its code, art or assets. Over time it should become its own product.

## Commands
- `npm run dev`: dev server on :5173. If it ever serves a blank page after edits, restart it (stale transform cache).
- `npm run build`: type-check (`tsc -b`, including e2e) and build.
- `npm run lint`: oxlint, should report nothing.
- `npm run test:e2e`: Playwright tests in `e2e/` (own server on :5174, ~25s). Add or extend a spec for every fix or feature. Helpers in `e2e/helpers.ts` map grid cells to screen points using the canvas's `data-view` attribute, so they follow the current pan and zoom.
- Visual check: run a one-off Playwright script from the scratchpad (`import { chromium } from '<repo>/node_modules/playwright/index.mjs'`) against `npx vite --port 5175`, and look at the screenshot. Stop the server with `pkill -f "vite --port 517[5]"`; a plain pattern also matches, and kills, the shell running pkill.

## Code map
- `src/App.tsx`: map state, undo history (`modifyMap` with `coalesce` keys so one stroke/drag = one undo step), keyboard shortcuts, menu definitions, autosave. A new shortcut goes in the keydown handler, the matching menu item's `shortcut` label and the README table; Escape closes open dialogs there too.
- `src/components/`: app chrome: `MenuBar` (menus are defined in `App.tsx`), `Toolbar`, `Toolbox`, `DockPanel` (right-hand properties), `Dialog` (shared modal shell) used by `ExportModal` and `PreferencesDialog`. Shared tool list, theme names and button/field classes in `options.ts`; colour tokens (`bg-ui`, `border-ui-border`, ...) in `src/index.css`, light by default and overridden per `data-ui-theme`/`data-accent` on `<html>`; never hard-code chrome colours. Size chrome in rem (Tailwind defaults), not px, so the interface-size preference scales it.
- `src/core/preferences.ts`: per-user settings (also read by the pre-paint script in `index.html`). `src/core/storage.ts`: all localStorage access, keys prefixed `cartographer.`; go through it so "Reset all local data" clears new keys too.
- `src/core/viewport.ts`: zoom limits, map bounds and zoom-to-fit.
- `src/canvas/MapCanvas.tsx`: pointer input, tools, previews.
- `src/core/renderers/mapRenderer.ts`: the single renderer used by canvas and all exports.
- `src/core/objects.ts`: doors/stairs/props/labels: hit testing, selection, edits. Replace objects; never mutate them (history shares them).
- `src/core/tools/toolGeometry.ts`: brush, tunnel and door-edge geometry.
- `src/core/export/`: PNG/WebP, tiled PDF, Universal VTT.

## Workflow
- Work on a branch per batch (`fix/...`, `feat/...`). Make one commit per logical change with a `fix:`/`feat:`/`docs:`/`chore:` prefix. Ask before merging to `main` or pushing.
- Backlog is GitHub Issues (`gh issue list`). Put `Fixes #N` in commits. Every new issue gets a `model: opus` (complex or design-heavy) or `model: sonnet` (routine, well-scoped) label, plus `enhancement`/`bug`/`ui`/`pro-parity`/`chore` as fits.
- Keep the README feature list and shortcut table in sync with the app.
- When a task is done, check whether it taught something a future session would need (a new module, convention or gotcha) and add it here in a line or two. Keep this file short: no history or per-feature notes, those belong in commits and issues.
