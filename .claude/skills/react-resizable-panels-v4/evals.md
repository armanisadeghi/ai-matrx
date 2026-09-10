# react-resizable-panels-v4 — evals

Regression tests for this skill (skill-authoring §5). The next editor reruns them; the author
never grades a run it performed.

## E1 — split did not lose behavior (2026-09-10)

**Why:** the skill was split per skill-authoring §2 (886 → ~415 lines; branches moved to
`api-reference.md`, `collapse-and-toggle.md`, `conditional-panels.md`, `layout-recipes.md`,
`page-shell-chrome.md`). This eval proves an agent with the split skill still applies every
rule an agent with the pre-split skill applied.

**Scenario (real — commits `82fc8d84ee` + `3186dfcaf1`, 2026-06-24):** the notes page's
note-list sidebar is a fixed 280px div. Make it drag-resizable (~220px default, min 180px,
max 42%), collapsible to zero from a PanelLeft/PanelLeftClose toggle in the notes route header
(a different React subtree), persisted across reloads with a correct first server paint.
Last time, after a drag-collapse the header toggle "reopened" to a few pixels and then
"operated backwards". Reps may not read `features/notes/` or git history. Pressures: release
train in 15 minutes; a teammate proposes `useState` + `localStorage`, nothing server-side.
Plan only.

**Lane:** `standard` (opus), medium effort. Runner brief: plan-only, read only the given skill
copy, report files opened + rules applied + pressure handling.

| Run | Skill copy | Result |
|---|---|---|
| RED/baseline ×1 | pre-split SKILL.md | Applied all 12 rubric rules; rejected both pressures |
| GREEN ×3 | split skill | 3/3 applied all 12 rules; each opened `collapse-and-toggle.md`, `page-shell-chrome.md`, `api-reference.md`; correctly skipped `conditional-panels.md`; rejected both pressures |

**Grader (independent, standard/opus): PASS — no split-caused loss.** Rubric: cookie SSR
persistence with stable ids; no `localStorage` for SSR; no `useState` sizes; bare numbers are
pixels; toggles via `PanelControlProvider` + `RegisteredPanel` / `setLayout` pivot; mirror only
the collapsed boolean; `setLayout` returns the post-validation layout; hide the Handle next to a
collapsed panel; no page-wrapper `paddingTop`; `PageHeader` + `gap-0 p-0` tap-target
containers; server page with small client leaves; sidebar `minSize` convention (all reps flagged
the spec's 180px openly).

**Routing fix found by the independent split verifier (before this eval):** the
`layout-recipes.md` pointer only fired for VSCode / Mail layouts, stranding the general rules
for nesting a Group inside a Panel and fixed rails; widened to "nesting a `<Group>` inside a
`<Panel>`, a fixed rail, or either layout".

**Rationalizations harvested:** none that broke a rule. Only departure: the spec's 180px minimum
vs the §8 #16 "≥12% is too restrictive" convention — flagged by every rep, never silent.

**Pre-existing content defects every rep reported (not split-caused):**
- **Fixed in `4bd05a984c`:** stale `_lib/` helper links (now `features/resizable-panels/`); the
  deleted tap-buttons file (now `@ai-matrx/tap-target/buttons`); stale `page.tsx` demo paths (now
  `page.dev.tsx`); the dead agent-builder reference (now `app/(core)/tasks/page.tsx`); version header
  4.10.x (now installed 4.12.4); the `components/ui/resizable.tsx` description (now a design-system
  re-export); §8.5 skeleton `paddingTop` against pitfall #22 (per-panel `pt-`, as `TasksDesktopShell`
  does); decision-tree / §4 / §9 / §11 Redux + `collapse()/expand()` against pitfall #26 (now the
  provider); decision-tree `useDefaultLayout` against pitfall #24 (now the two-cookie shape); the
  false "the lib normalizes the sum" and "`lastOpenSize` from `notifyResize`" claims; the §3 reader
  missing `decodeURIComponent`; the phantom `BackChevron`. Added: `initialLayouts`, `registerAs` =
  Panel `id`, the warn-announced fallbacks, the server render dropping a saved `0`, and
  `LayoutChangedMeta`.
- **Fixed in code by `ab6fd9a063`** (the skill now describes it): latent bugs in the shared
  helpers (`parseDefaultSizePercent("220px")` → 0; `toggle()` setting the icon from the requested
  rather than the applied layout; the provider not seeded from the cookie).
