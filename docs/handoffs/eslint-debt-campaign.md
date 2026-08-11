---
status: active
updated: 2026-08-11
repos: [matrx-frontend]
---

# ESLint debt campaign

`npx eslint . --quiet` reports **2,344 errors** (2,483 at first inventory). This
is a repo-wide pre-existing backlog, **not** a per-branch defect — feature
branches "fail their lint gate" for debt that predates them by months.

**The `bug` class is at 0.** Every rule that is wrong at runtime today has been
cleared. What remains is `correctness` (2,234), `doctrine` (106) and `style` (4).

**Read `scripts/lint-debt/FEATURE.md` § "How much of `correctness` is actually
broken today" before planning work here.** The headline is: no live freeze
loop, ~5 confirmed user-visible bugs, and the rest is quality debt. Sizing the
remaining work off the raw 2,234 will send you chasing the wrong things.

## Vision — Arman's words

The governing rulings are the standing ones in `CLAUDE.md`, quoted because each
is a live trap here:

- **"SCREAM, never block."** `pnpm check:lint-debt` always exits 0 and is
  deliberately NOT in `run-release-gates.sh`.
- **"React Compiler is on … Flipping it off means rewriting this rule in the
  same change."** The bulk of these findings ARE its correctness lint.
  **Do not touch `reactCompiler`.**
- **"Never mass-convert `React.lazy` → `next/dynamic`"** — that move added ~190
  chunk groups and OOM-killed 14 production builds (2026-07-27). Relevant
  because the 86 `no-restricted-imports` findings sit on import boundaries.
  Read the `code-splitting` skill rule 3 **before** touching any.
- **No mass `eslint-disable`.** (inferred, from the FOUND_DEFECTS doctrine.)
  Silencing turns a visible backlog into an invisible one. A rule genuinely
  wrong for this codebase gets changed **once** in `eslint.config.mjs`, with a
  comment saying why.

## Resources

- **Scoreboard:** `/administration/reporting/lint-debt` — classified, ranked,
  every row opens its source line, every row/bucket copies a repair brief that
  already carries the bans above.
- **Contract + severity analysis:** [`scripts/lint-debt/FEATURE.md`](../../scripts/lint-debt/FEATURE.md).
- **Commands:** `pnpm check:lint-debt --path=features/x` (seconds — use this to
  verify a fix), `--rule=`, `--class=`, `pnpm check:lint-debt:write` (full pass,
  6–12 min; refreshes the committed snapshot — commit it).
- **Freeze-loop doctrine** (before ANY `set-state-in-effect` fix):
  `features/notes/FEATURE.md` § Freeze-loop doctrine. Invoke the
  `supabase-realtime` skill when the effect touches a `.channel(`.
- **Dev server:** check what is already listening
  (`lsof -nP -iTCP -sTCP:LISTEN | grep node`) and REUSE it. Several sessions run
  concurrently on this box and ports drift (3050/3051/3052 have all been live).
  Never start a second one. Log in at `/login` — `admin@admin.com` / `Password1234#`.
- **Trap:** do not move or delete files while a scan is running. ESLint
  enumerates the tree up front and reads it after; a file that vanishes in
  between kills the run with a bare `ENOENT`.

## Remaining work

Ordered by value per edit. Re-derive counts from the scoreboard before
starting — the tree moves daily and other sessions add debt.

**1 — the ~5 confirmed user-visible `refs` bugs.** Values the user SEES derived
from a `ref.current` read during render, so they are correct only by
coincidence: `use2048.ts:186` (`canUndo` drives a disabled Undo button on a
PUBLIC page), `CodeInlinePreview.tsx:65` (dirty indicator),
`useDesiredValueSlice.ts:50` (same), `ProcessingProgressDialog.tsx:523`
(progress readout), `useAppletRecipeFastAPI.ts:129` (rendered list). The other
~20 in that shape are benign (`const supabase = supabaseRef.current` and
friends) — do not touch them.

**2 — `react-hooks/static-components` (209; 152 in product code).** Mechanical
and genuinely user-visible: a component defined inside another remounts its
subtree every render, losing focus, scroll and child state. Worst product
files: `ContainerComparisonDetails.tsx` (11),
`agent-apps/apps/page.tsx` (7), `ShortcutDirectory.tsx` (7),
`ShortcutList.tsx` (7), `DeprecatedModelsAudit.tsx` (7),
`TasksTableView.tsx` (6). Fix = hoist to module scope, pass props. Nothing else.

**3 — `react-hooks/refs`, the remaining ~586.** ~151 write a ref during render
(unsafe under concurrent rendering; benign today), 3 put a ref in a dependency
array (a dep that can never fire — a lie in the deps). Concentrated:
`DataRefHoverPreview.tsx` (34), `OrgWorkspace.tsx` (33), `CleanupPad.tsx` (27),
`ScrapedResultDetailTabs.tsx` (31), `AgentToolsModal.tsx` (18),
`applet-card/{Default,Enhanced}.tsx` (16 each — near-identical files; fix one,
port it, and ask whether they should be one component).

**4 — `no-restricted-imports` (86) + `no-restricted-syntax` (19).**
Architectural bans, never silenced — the import or the shape changes, and the
message names the canonical path. **Read the `code-splitting` skill rule 3
first.**

**5 — `react-hooks/set-state-in-effect` (1,107).** Biggest number, lowest
urgency per finding: all 61 self-feeding effects already converge behind a
guard, so there is no live freeze loop. Treat as quality debt — derive during
render, or move the write into the handler that caused it. **Never "fix" one by
adding another effect.** Do this last, and in small verified batches.

**6 — the long tail** (`immutability` 122, `purity` 97, `error-boundaries` 42,
`preserve-manual-memoization` 38, `use-memo` 25, `globals` 1).

**Not worth doing:** the 4 `style` findings.

**Keep the snapshot honest.** After any batch: `pnpm check:lint-debt:write` and
commit `report.json` + `history.json`. The page shows the scan's age and screams
past 7 days; a stale snapshot means stale line numbers on every link.

## Done

- Inventory + CLI — `scripts/lint-debt/` and its `FEATURE.md`.
- Scoreboard — `/administration/reporting/lint-debt` (`features/admin/lint-debt/`).
- Shared source-link door promoted to `features/admin/reporting/source-links.ts`.
- **`bug` class cleared to 0**: `react/jsx-key` (6),
  `@next/next/no-assign-module-variable` (3),
  `@next/next/no-html-link-for-pages` (5), `react-hooks/rules-of-hooks` (132).
  All four rules are gone from the report entirely.
- Severity analysis of the `correctness` bulk — see the FEATURE.md section.

## Decisions needed

**Should `check:lint-debt` become a blocking gate once `correctness` is down?**
Right now it is advisory and out of the release gates, which is correct for a
2,344-error backlog. There is no obvious threshold at which it should flip, and
"never blocking" is a standing rule, so this stays advisory until Arman says
otherwise. No action needed unless he wants a different answer.
