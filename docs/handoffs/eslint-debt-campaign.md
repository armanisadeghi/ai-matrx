---
status: active
updated: 2026-08-11
repos: [matrx-frontend]
---

# ESLint debt campaign

`npx eslint . --quiet` reports **2,358 errors** (was 2,483). This is a repo-wide
pre-existing backlog, **not** a per-branch defect — feature branches "fail their
lint gate" for debt that predates them by months. The inventory and scoreboard
are built and every class that is wrong at runtime is now down to one rule;
what remains is the correctness bulk.

## Vision — Arman's words

Not a vision-doc feature; the governing rulings are the standing ones in
`CLAUDE.md`, quoted because every one is a live trap here:

- **"SCREAM, never block."** No check may block a build or a commit.
  `pnpm check:lint-debt` always exits 0 and is deliberately NOT in
  `run-release-gates.sh`.
- **"React Compiler is on … Flipping it off means rewriting this rule in the
  same change."** The bulk of these findings ARE the compiler's correctness
  lint. Turning it off is not a fix. **Do not touch `reactCompiler`.**
- **"Never mass-convert `React.lazy` → `next/dynamic`"** — that move added ~190
  chunk groups and OOM-killed 14 straight production builds (2026-07-27).
  Relevant because the 82 `no-restricted-imports` findings sit on import
  boundaries. Read the `code-splitting` skill rule 3 **before** touching any.
- **No mass `eslint-disable`.** (inferred, from the FOUND_DEFECTS doctrine —
  track what you can't fix, loudly.) Silencing converts a visible backlog into
  an invisible one, which is strictly worse. A rule genuinely wrong for this
  codebase gets argued and changed **once** in `eslint.config.mjs`, with a
  comment saying why.

## Resources

- **Scoreboard:** `/administration/reporting/lint-debt` — classified, ranked,
  every row opens its source line, every row/bucket copies a paste-ready repair
  brief that already carries the bans above.
- **Contract + classification:** [`scripts/lint-debt/FEATURE.md`](../../scripts/lint-debt/FEATURE.md).
- **Commands:** `pnpm check:lint-debt --path=features/x` (seconds — use this to
  verify a fix), `--rule=…`, `--class=bug`, `pnpm check:lint-debt:write` (full
  pass, 6–12 min depending on machine load; refreshes the committed snapshot —
  commit it).
- **Freeze-loop doctrine** (read before ANY `set-state-in-effect` fix):
  `features/notes/FEATURE.md` § Freeze-loop doctrine. Also invoke the
  `supabase-realtime` skill when the effect touches a `.channel(` subscription —
  the two classes overlap and this one froze whole browsers ~10 times.
- **Verify a surface:** `preview_start` name `next-dev`, log in at `/login` with
  `admin@admin.com` / `Password1234#`. **Check the port first** — a shared dev
  server may already be up on 3001 or 3051 (`lsof -nP -iTCP -sTCP:LISTEN`);
  never start a second one.
- **Trap:** do not move or delete files while a scan is running. ESLint
  enumerates the tree up front and reads it after; a file that vanishes in
  between kills the run with a bare `ENOENT`.

## Remaining work

Ordered by priority. Counts are the 2026-08-11 post-fix snapshot — re-derive
from the scoreboard before starting, the tree moves daily.

**1 — `react-hooks/rules-of-hooks` (27, class `bug`).** The only real-bug rule
left. Conditional hooks crash the moment a guard flips. 17 files, all small:

| Findings | File |
|---|---|
| 4 | `components/mardown-display/blocks/table/StreamingTableRenderer.tsx` |
| 3 | `components/official/processor-extractor/ProcessorExtractor.tsx` |
| 3 | `utils/client-nav-utils.ts` — a different shape: hooks called from plain functions that are neither components nor hooks. These need renaming to `useX` or inverting the call site, not a guard move. |
| 2 each | `features/code-editor/components/code-block/MultiFileCodeEditor.tsx`, `features/code-editor/multi-file-core/useCodeEdiorBasics.ts`, `features/scraper/parts/core/PageContent.tsx` |
| 1 each | `RawJsonExplorer`, `ParseExtractorOptions`, `PicklistVariableInput`, `SmartAppletList`, `SmartAppList`, `CanvasRenderer`, `CredentialsModal` (hook inside a callback — the one that needs restructuring, not hoisting), `FileVersionsList`, `HtmlPreviewModal`, `RemovalDetails`, `BrokerForm` |

Two fix shapes, both proven in the last batch: **hoist the guard below every
hook** when nothing between them depends on the guarded value, or **split the
guard into its own thin component** above a hooked body when it does. Never
wrap a hook in a condition to "skip work" — pass a disabled flag in.

**2 — `react-hooks/refs` (589, class `correctness`).** Refs read/written during
render; tears under concurrent rendering and compiler memoization. Highly
concentrated — the top 8 files are 191 of them:

`features/agents/components/previews/DataRefHoverPreview.tsx` (34),
`features/organizations/components/OrgWorkspace.tsx` (33),
`features/transcription-cleanup/components/CleanupPad.tsx` (33 total),
`features/scraper/parts/ScrapedResultDetailTabs.tsx` (31),
`features/agents/components/tools-management/AgentToolsModal.tsx` (18),
`features/applet/home/applet-card/{Default,Enhanced}.tsx` (16 each),
`app/(public)/free/games/matrx-jump/page.tsx` (14).

The two applet-card files are near-identical — fix one, port it, and ask whether
they should be one component at all. Watch for the `useRef` + `Math.random()`
"stable id" pattern: `useId` is the primitive, and it kills a `refs` and a
`purity` finding in one line (done in `LinkComponent`).

**3 — `react-hooks/set-state-in-effect` (1,105, class `correctness`).** The
cascading-render class behind the repeated browser freezes. **Be slow here** —
a bad "fix" is worse than the finding. Preferred fixes in order: derive during
render instead of storing; move the write into the event handler that caused it;
key the component to reset state. Start with files that also carry a realtime
subscription or an autosave loop — that intersection is where the freezes came
from.

**4 — `react-hooks/static-components` (209, class `correctness`).** A component
defined inside another is a new type every render: the subtree unmounts and
remounts, losing state, focus and scroll. Mechanical fix (hoist to module scope,
pass props) and concentrated —
`components/animated/demos/bento-grids/ThreeColumnBentoGrid.tsx` (26),
`components/debug/PromptExecutionDebugPanel.tsx` (14),
`app/(admin)/…/component-displays/applet-list-table.tsx` (4).

**5 — `no-restricted-imports` (82) + `no-restricted-syntax` (15), class
`doctrine`.** Architectural bans, never silenced — the import or the shape
changes, and the message names the canonical path. **Read the `code-splitting`
skill rule 3 first** (see Vision).

**6 — the long tail** (`immutability` 122, `purity` 97, `error-boundaries` 42,
`preserve-manual-memoization` 38, `use-memo` 25, `globals` 1). Lowest value per
edit; leave until the classes above are down.

**Not worth doing:** the 4 `style` findings (`react/display-name` ×2,
`react/jsx-no-comment-textnodes` ×2). Listed for completeness only.

**Worst features, for assigning whole-feature sweeps:** `features/agents` (172),
`components/mardown-display` (143), `features/applet` (135), `app/(dev)` (108),
`components/official` (74), `components/animated` (73), `features/files` (65),
`app/(admin)` (64).

**Keep the snapshot honest.** After any batch: `pnpm check:lint-debt:write` and
commit `report.json` + `history.json`. The scoreboard shows the scan's age and
screams past 7 days; a stale snapshot means stale line numbers on every link.

## Done

- Inventory + CLI built — `scripts/lint-debt/` and its `FEATURE.md`.
- Scoreboard shipped at `/administration/reporting/lint-debt` —
  `features/admin/lint-debt/`.
- Shared source-link door promoted to `features/admin/reporting/source-links.ts`
  so the dead-ends and lint-debt consoles share one copy.
- `react/jsx-key` (6), `@next/next/no-assign-module-variable` (3),
  `@next/next/no-html-link-for-pages` (5) — cleared to zero, rules gone from the
  report entirely.
- `react-hooks/rules-of-hooks` 132 → 27 — 18 admin component-display demos, the
  four `matrx-record-list` components, `LinkComponent`, `HelpIcon`,
  `AutoCreateAgentAppForm`, `GuidedVariableInputs`, `tabbed-demo-wrapper`.
