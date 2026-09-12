# Windows Panels — Phase 0 Baseline

Captured on 2026-04-23 before the modernization work begins. Delete this file at the end of Phase 12, once equivalent numbers live in `FEATURE.md`.

All downstream phase PRs must include a short "Bundle delta vs baseline" note in the PR description. The CI script `scripts/check-bundle-size.ts` (added in this phase) produces the numbers.

---

## File inventory (LOC)

Captured via `wc -l` on `main` @ `c943733c5`.

### Shell + runtime

| File | LOC | Notes |
|------|-----|-------|
| `features/window-panels/WindowPanel.tsx` | 1,456 | Shell — to be decomposed in Phase 6 |
| `features/window-panels/components/SidebarWindowToggle.tsx` | 1,402 | Tools grid — eagerly loaded, 56 Lucide icons; targeted by Phase 3 |
| `components/overlays/OverlayController.tsx` | 2,586 | Hand-written render branches; replaced by `UnifiedOverlayController` in Phase 2 |
| `features/window-panels/registry/windowRegistry.ts` | 794 | Pure data — expanded (not replaced) in Phase 1 |
| `features/window-panels/WindowPersistenceManager.tsx` | 246 | GC effect added in Phase 4 |
| `features/window-panels/WindowTray.tsx` | 216 | Responsive chip sizing in Phase 5 |
| `features/window-panels/WindowTraySync.tsx` | 53 | Extends in Phase 5 |
| `features/window-panels/hooks/useWindowPanel.ts` | 347 | Rect clamping added in Phase 5 |
| `features/window-panels/hooks/usePanelPersistence.ts` | 54 | **Delete** in Phase 4/9 (localStorage sidecar) |
| `features/window-panels/service/windowPersistenceService.ts` | 127 | Supabase CRUD; unchanged |
| `features/window-panels/components/LayoutIcon.tsx` | 252 | Unchanged |
| `features/window-panels/components/WindowSidebar.tsx` | 55 | Unchanged |
| `features/window-panels/components/EmbedSiteFrame.tsx` | 30 | Unchanged |
| `features/window-panels/utils/windowArrangements.ts` | 253 | Unchanged |
| `features/window-panels/utils/withGlobalState.tsx` | 119 | **Delete** in Phase 9 (zero imports) |
| `features/window-panels/FloatingPanel.tsx` | 235 | **Delete** in Phase 9 (zero imports) |

### Redux slices (outside feature dir)

| File | LOC | Notes |
|------|-----|-------|
| `lib/redux/slices/overlaySlice.ts` | 865 | Drift removal + instance GC in Phase 4 |
| `lib/redux/slices/windowManagerSlice.ts` | 490 | Restore-clamp in Phase 5; possible split in Phase 13 |

### URL sync

| File | LOC | Notes |
|------|-----|-------|
| `features/window-panels/url-sync/UrlPanelManager.tsx` | — | Drops LS sidecar in Phase 4; reads registry in Phase 8 |
| `features/window-panels/url-sync/UrlPanelRegistry.ts` | — | Registry of hydrator functions |
| `features/window-panels/url-sync/initUrlHydration.ts` | — | Audit + fill in Phase 8 |
| `features/window-panels/url-sync/useUrlSync.ts` | — | Reads registry in Phase 8 |

### Totals

| Metric | Value |
|--------|-------|
| `features/window-panels/**` files (.ts/.tsx) | 95 |
| `features/window-panels/**` LOC | 22,817 |
| `windows/` components (recursive) | 75 files |
| Registered overlays (registry) | 59 |
| `dynamic()` imports in `OverlayController.tsx` | ~102 |
| `useAppSelector` calls in `OverlayController.tsx` | ~98 |
| Lucide icons statically imported in `SidebarWindowToggle.tsx` | 56 |

### Expected post-Phase-12 deltas (targets)

| File/metric | Before | Target after | Delta |
|-------------|--------|--------------|-------|
| `OverlayController.tsx` (renamed to `UnifiedOverlayController.tsx`) | 2,586 | ≤ 250 | −2,300+ |
| `SidebarWindowToggle.tsx` (splits) | 1,402 | ≤ 400 (index) | −1,000+ |
| `WindowPanel.tsx` (split) | 1,456 | ≤ 250 (index) | −1,200+ |
| `overlaySlice.ts` (`initialState` drift removed) | 865 | ≤ 450 | −400+ |
| Dead-code files (FloatingPanel, withGlobalState, usePanelPersistence, TODO-persistence-spec, INVENTORY) | 235 + 119 + 54 + ~350 | 0 | −750+ |
| Files to add window (PR-to-add) | 4 | 2 | — |
| Initial-bundle growth from window-panels system | — | 0 | 0 |

---

## Bundle measurement procedure

### One-time baseline capture

From a clean checkout on `main`:

```bash
pnpm install --frozen-lockfile
rm -rf .next
ANALYZE=true pnpm build          # opens analyzer in browser; ignore and let it finish
pnpm tsx scripts/check-bundle-size.ts --capture
```

The `--capture` flag writes the snapshot to `features/window-panels/_baselines/bundle-before.json` (ignored by `git clean` but checked into the repo as the comparison target).

### Per-phase verification

After each phase PR is ready:

```bash
rm -rf .next
pnpm build
pnpm tsx scripts/check-bundle-size.ts
```

Exits `0` if every tracked route is within **+2 KB** of baseline.
Exits `1` with a diff table if any route grew beyond threshold.

Use `pnpm tsx scripts/check-bundle-size.ts --update-baseline` **only** after an intentional, reviewed change.

### What the script tracks

- `/` (public landing) — should never regress
- `/dashboard` (primary authenticated page) — shell-mount route, SidebarWindowToggle ships here
- `/tasks`, `/agents`, `/notes` — representative authenticated feature pages
- `/apps/custom/:slug` — rewrite target; representative dynamic route

For each, the script sums the byte size of every JS chunk referenced in `.next/app-build-manifest.json` (client bundles only; server chunks excluded) and compares to `bundle-before.json`.

---

## Redux state snapshot (manual capture)

Not yet captured. After merging PR-00 (this phase), capture manually:

1. `pnpm dev`
2. Log in via the nonce handshake: `openssl rand -hex 16 > .dev-login-nonce`, then `http://localhost:3000/api/dev-login?nonce=<that value>&next=/dashboard`.
3. Open Redux DevTools → `State` tab → click the ⋯ menu → `Raw` → copy.
4. Sequentially open: Notes, Quick Tasks, Agent Run, Scraper, Quick Data. Minimize the Agent Run. Restore.
5. Copy the state tree again.
6. Save both snapshots to `features/window-panels/_baselines/redux-before-{clean,active}.json`.

Used as a sanity-check reference for Phase 2 (unified controller) and Phase 4 (instance GC) — state shape should remain backward compatible.

---

## Known hot spots entering modernization

1. **`SidebarWindowToggle.tsx` eagerly loaded for every authenticated user** — 1,402 lines + 56 icons. The single biggest bundle win is available in Phase 3.
2. **`OverlayController.tsx` hand-maintained** — every new window requires edits in 4 places; drift is inevitable. Phase 2 collapses to one registry loop.
3. **`overlaySlice.ts` `initialState` must be hand-synced with the registry** — audit flagged 47-key initial state. Phase 4 starts empty.
4. **`usePanelPersistence.ts` + localStorage sidecar still active** — running alongside the DB path. Phase 4 kills it with a one-time migration.
5. **Mobile is 50% done** — `useIsMobile()` branch exists but hardcodes fullscreen. Phase 5 adds drawer + card + safe tray.
6. **Heavy-session windows lose state on reload** — acknowledged in `INVENTORY.md:166`. Phase 7 addresses with `heavySnapshot` + `onReopenAfterReload`.
7. **No guardrails** — no ESLint rule preventing direct window imports, no build-time registry check, no test coverage. Phases 10 and 12 close this.

---

## Phase completion checklist for Phase 0

- [x] Line-count snapshot captured (this doc).
- [x] Module structure + hot-spot list documented.
- [x] `scripts/check-bundle-size.ts` created.
- [x] `package.json` script added (`check:bundle`, `check:bundle:capture`).
- [ ] User runs `pnpm check:bundle:capture` once from clean `main` to generate `bundle-before.json`. (Runtime step — not performed by this PR.)
- [ ] User captures Redux snapshots (procedure above). (Runtime step.)
