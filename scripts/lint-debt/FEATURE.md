# ESLint debt inventory — `pnpm check:lint-debt`

**Status:** Live (2026-08-11) · **Scoreboard:** `/administration/reporting/lint-debt`
**Campaign handoff:** [`docs/handoffs/eslint-debt-campaign.md`](../../docs/handoffs/eslint-debt-campaign.md)

`npx eslint . --quiet` reports **2,344 errors** in this repo (2,483 at first inventory). That number was
doing active harm as a single number:

- Feature branches "failed their lint gate" for debt that predated them by
  months. One session diagnosed it as "three easy lint failures" and cited line
  numbers that did not correspond to anything in the checkout.
- The count mixed 6 genuine list-reconciliation bugs in with 1,105 React
  Compiler style notes, so nobody could tell whether it mattered.

This makes the backlog **visible and classified**, so it can be worked
worst-first instead of stared at.

---

## The three parts

| Part | Where | What it does |
|---|---|---|
| **Scanner** | `scripts/lint-debt/` (`pnpm check:lint-debt`) | Runs the repo's REAL ESLint config through the Node API, classifies every error-severity finding, ranks it. Exit 0. |
| **Scoreboard** | `/administration/reporting/lint-debt` (`features/admin/lint-debt/`) | Renders the committed snapshot: totals by class, trend, worst features/files/rules, every finding openable, one-click repair briefs. |
| **Snapshot** | `report.json` + `history.json` | Committed. The scoreboard reads these, never a live scan. |

**There is no second copy of the rules, on purpose.** `scripts/dead-ends/`
implements its own AST rules because it asks a question ESLint cannot (it reads
the entity registry). This scanner asks the opposite question — *what does our
lint config actually say about this tree?* — so any re-implementation would
create a second authority that can disagree with `npx eslint`. It shells into
the ESLint Node API with the same config resolution the CLI uses. The scanner's
total and `npx eslint . --quiet`'s total are the same number by construction.

## Errors only

Warnings are excluded (`--quiet`'s behaviour). This repo's warnings are the
loud-but-advisory doctrine rules — `matrx/no-bare-id-text`,
`no-barrel-files`, `matrx/no-banned-lucide-icons` — which already have their own
scoreboards and campaigns. Including them would triple the snapshot for a
campaign that is not about them.

## Classification — the field the campaign is steered by

`RULE_CLASS` in `types.ts`. Four classes, each with its own doctrine sentence
that ships inside every repair brief:

| Class | Meaning | Baseline (2026-08-11) |
|---|---|---|
| `bug` | Wrong at runtime today. Fix on sight. | **0** |
| `correctness` | A real hazard class (crashes, cascading renders, torn refs, remounted subtrees) that is usually but not always live. | 2,234 |
| `doctrine` | This repo's own architectural bans. Never silenced — the import or the shape changes. | 106 |
| `style` | True idiom. Lowest priority; never worth a risky edit. | 4 |

**A rule with no `RULE_CLASS` entry defaults to `style` AND is shouted about** —
by the CLI, and again on the scoreboard through `reconcileReport`. That is
deliberate: a newly-enabled rule must not be able to slip into the bottom of the
priority list unnoticed. Add the entry in the same change that turns a rule on.

Baseline by rule:

| Rule | Class | Count |
|---|---|---|
| `react-hooks/set-state-in-effect` | correctness | 1,105 |
| `react-hooks/refs` | correctness | 591 |
| `react-hooks/static-components` | correctness | 209 |
| `react-hooks/immutability` | correctness | 122 |
| `react-hooks/purity` | correctness | 97 |
| `matrx/no-raw-agent-list-query` | doctrine | 1 |
| `react-hooks/error-boundaries` | correctness | 42 |
| `react-hooks/preserve-manual-memoization` | correctness | 38 |
| `react-hooks/use-memo` | correctness | 25 |
| `react/no-children-prop` | correctness | 2 |
| `react-hooks/globals` | correctness | 1 |
| `no-restricted-imports` | doctrine | 86 |
| `no-restricted-syntax` | doctrine | 19 |
| `react/display-name` | style | 2 |
| `react/jsx-no-comment-textnodes` | style | 2 |

`react/jsx-key`, `@next/next/no-assign-module-variable`,
`@next/next/no-html-link-for-pages` and `react-hooks/rules-of-hooks` were all
cleared to zero on 2026-08-11 and no longer appear — **the `bug` class is
empty**. They stay in `RULE_CLASS` — a rule at zero is one regression away
from being back, and an unclassified rule is a rule at the bottom of the list.

## How much of `correctness` is actually broken today

The count is big; the live damage is not. Measured 2026-08-11 by classifying
every finding, not by reading the number:

- **`set-state-in-effect` (1,107).** Only **61** are self-feeding — the effect
  writes a value that is in its own dependency array, which is the shape that
  can actually loop. **All 61 converge behind a guard or early return.** There
  is currently no unguarded self-feeding effect in the tree. The freeze-loop
  class this rule exists to catch is, today, already defended. The remaining
  ~1,046 are the "derive it instead of storing it" idiom: real quality debt,
  an extra render each, not a hang.
- **`refs` (591).** Split by what the flagged line does: ~151 write a ref
  during render (unsafe under concurrent rendering, benign in practice today),
  ~26 read a ref into a value used for rendering — and of those only **~5
  genuinely derive user-visible output** (an Undo button's `disabled`, a dirty
  indicator, a progress readout). Those five are correct *by coincidence*: the
  ref mutation happens to sit next to a state update that re-renders. Only 3
  put a ref inside a dependency array (a dep that can never fire).
- **`static-components` (209).** Mechanical and genuinely user-visible —
  remounting a subtree loses focus, scroll and child state. **152 are in
  product code**, not demos.

**The findings are NOT mostly demo code.** By zone: 965 of the
`set-state-in-effect` and 572 of the `refs` findings are in product paths;
admin and `(dev)` demos together hold a small minority. Do not dismiss this
backlog as "just the demos".

Redo this analysis rather than trusting these numbers after a big sweep — the
method is a one-off script over `report.json`, not a committed tool, precisely
because the interesting question changes each time.

## The two bans every repair brief carries

Both were violated here before, so they are printed into every generated brief
rather than left in a doc:

1. **No mass `eslint-disable`.** That converts a visible backlog into an
   invisible one — strictly worse than the backlog. If a rule is genuinely wrong
   for this codebase, argue it and change `eslint.config.mjs` **once**, with a
   comment explaining why.
2. **No React Compiler config changes.** `reactCompiler: true` is settled
   doctrine (CLAUDE.md); the bulk of these findings ARE its correctness lint, and
   turning it off is not a fix.

A third, for the `no-restricted-imports` slice specifically: **never
mass-convert `React.lazy` → `next/dynamic`** while cleaning imports. That exact
move added ~190 chunk groups and OOM-killed 14 straight production builds
(2026-07-27). Read the `code-splitting` skill rule 3 first.

## LOUD, NEVER BLOCKING

Arman's standing rule: no check may block a build or a commit. `check-lint-debt`
**always exits 0**. It is deliberately NOT wired into `run-release-gates.sh` —
a 6-minute full-repo ESLint pass is not a release gate, and with a 2,483-error
backlog it could only ever be advisory noise on every release. Promote it when
the scoreboard is near zero.

`--strict` exists for a human or a CI job that explicitly wants a hard fail on a
scoped path (`pnpm check:lint-debt --path=features/notes --strict`).

## Commands

```bash
pnpm check:lint-debt                        # scan + ranked report
pnpm check:lint-debt:write                  # + refresh report.json & history.json
pnpm check:lint-debt --class=bug            # one class
pnpm check:lint-debt --rule=react/jsx-key   # one rule
pnpm check:lint-debt --path=features/notes  # one feature (scoped scans are FAST)
pnpm check:lint-debt --limit=0              # print every finding
pnpm check:lint-debt --json                 # machine-readable
pnpm check:lint-debt:strict                 # exit 1 on any finding
```

**A scoped run is the one you want day to day.** A full pass takes ~6 minutes;
`--path=features/x` takes seconds. Use the scoped form to verify a fix, and the
full `--write` only to refresh the baseline.

**`--write` refuses to run with `--path`, `--rule` or `--class`** (exit 2,
loud). `report.json` is the whole-repo baseline the scoreboard reads — its
totals, rankings and trend all assume it — so writing a scoped run would shrink
the page to one feature and add a false trend point, looking exactly like the
campaign had been won. Same guard, same reasoning, as `scripts/dead-ends`.

**An empty filter value is a typo, never "everything"** (exit 2, loud).
`--path=` and `--path=/` both reduce to an empty prefix, and every gate
downstream tests that string for truthiness — the scan would run whole-repo
while the operator believed it was scoped, and could overwrite the baseline
doing it.

## Known limits

- **Do not move or delete files while a scan is running.** ESLint enumerates the
  tree up front and reads the files afterwards; a file that disappears in
  between crashes the whole run with a bare `ENOENT` (observed twice while
  building this). Nothing to fix on our side — just finish the scan first.
- **`filesScanned` (11,523) counts every file ESLint linted**, including ones
  with no findings and ones only warnings fired on. It is not comparable to the
  dead-ends checker's `filesScanned`, which counts only `.tsx` under four roots.
- **Line numbers drift.** The snapshot pins a commit, but source links point at
  `main` (see `features/admin/reporting/source-links.ts` for why — a branch sha
  gets garbage-collected and every link 404s). A stale snapshot means stale line
  numbers; the page says so past 7 days.
- **The report is 1.2 MB.** It is a static import into a server component, which
  is fine, but the console must page the table (it does — `pageSize={50}`) and
  must never map 2,483 rows into DOM at once.

## Change Log

- **2026-08-11** — Created. Baseline 2,483 errors / 1,185 files: 146 bug,
  2,236 correctness, 97 doctrine, 4 style. Scoreboard + snapshot + classification
  shipped; `features/admin/reporting/source-links.ts` promoted out of
  `features/admin/dead-ends/` so both scoreboards share one door primitive.
- **2026-08-11** — First sweep: 2,483 → 2,358, real bugs 146 → 27. `jsx-key`,
  `no-assign-module-variable` and `no-html-link-for-pages` cleared entirely;
  `rules-of-hooks` 132 → 27. No `eslint-disable` added, no rule config changed.
- **2026-08-11** — **`bug` class reaches 0.** `rules-of-hooks` 27 → 0
  (2,358 → 2,344). Added the severity analysis above: of 2,234 `correctness`
  findings, none is a live freeze loop and ~5 are confirmed user-visible bugs.
  `doctrine` rose 97 → 106 from other work landing on main — the scoreboard
  catching new debt is it working, not a regression in this campaign.
