# surface-authoring — evals

Regression tests for this skill (skill-authoring §5). The next editor reruns them; the author
never grades a run it performed.

## E1 — split did not lose behavior (2026-09-10)

**Why:** the skill was split per skill-authoring §2 (551 → ~332 lines; branches moved into
`references/`: `new-manifest.md`, `inheritance.md`, `runtime-emission.md`, `overlay-surfaces.md`,
`write-targets.md`, `update-or-remove.md`, `file-map.md`; `runtime-rollout.md` pre-existed).

**Scenario (real — commit `8a271d5d5d`, 2026-08-24):** the table-viewer window (a WindowPanel
opened through the overlay system) must become a registered, agent-aware surface: manifest,
DB mirror, live runtime scope, canonical v3 context menu on its body, live verification. Reps
are barred from the existing table-viewer manifest/window code, the surfaces FEATURE.md change
log, PANEL_INVENTORY.md and git history. Pressures: a teammate says sync already derives
`/table-viewer` so nothing overlay-specific is needed; the "least code" is
`<SurfaceRuntimeProvider>` directly inside `<NonEditableContextMenu>`; release train in 15 min.
Plan only.

**Lane:** `standard` (opus), medium effort.

| Run | Skill copy | Result |
|---|---|---|
| RED/baseline ×1 | pre-split | Applied all 12 rubric rules (incl. runtime-rollout's live completion gate); rejected all pressures |
| GREEN ×3 (round 1) | split, as first committed | **FAIL — 0/3 opened `references/runtime-rollout.md`.** The new "Branch references — read only when the run reaches that branch" list named 7 files but not the pre-existing `runtime-rollout.md`; all 3 treated the list as complete and classified the window as "new, not a repair". Lost: canonical submenu label / no `INERT MENU` / no `VALUE MAPPING GAP` gate, real `extraSections` handlers, no manual `useCallback` (one rep contradicted it), focused `--surface` sync |
| GREEN ×3 (round 2) | split + fix `b200b63594` | **PASS — 3/3 opened `runtime-rollout.md` and applied all 12 rows** the baseline applied; all rejected all pressures |

**Fix (REFACTOR):** `runtime-rollout.md` added to the branch list with an observable WHEN
("adding live scope or a canonical v3 menu to UI that already exists — including a page or
window being registered as a surface for the first time — or completing/repairing any existing
surface"), and the list now states it names every reference file.

**Rubric (independent grader):** `overlayId` instead of `urlPattern`; provider AROUND the menu,
never between menu and child; required unique `label` + curated groups; completeness law +
honest `alwaysAvailable`; `verified` earned (ship `partial` + note); `RAW_MANIFESTS` +
`check:surface-drift` / `check:surface-routes`; `ui_surface` row exists first + verify
`ui_surface_value` counts live; non-matching-name binding + Matrx-vs-matrix test; canonical
submenu label with no INERT MENU / VALUE MAPPING GAP; `extraSections` with real handlers;
scope read at trigger time, no manual memoization; focused `--surface` sync.

**Rationalizations harvested (round 1, verbatim):** "`update-or-remove.md` and
`runtime-rollout.md`: this is a new surface, not a repair." · "the surface is new rather than a
repair." · "`getScope` is a single `useCallback` that reads live state at trigger time".
Class lesson recorded in skill-authoring §2: a routing list is read as complete.

**Unguarded classes noted by reps (not built here):** `overlayId` values are not validated
against the overlay catalogue (`features/overlays/catalogue.ts`) by the drift check (one rep; another cited `check:surface-overlays`);
nothing statically prevents a non-DOM provider as the direct child of a v3 context menu.
