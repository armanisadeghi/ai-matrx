# No Dead Ends detector — `pnpm check:dead-ends`

**Status:** Live (2026-08-09) · **Scoreboard:** `/administration/reporting/dead-ends`
**Doctrine (canonical, cross-repo):** `common-docs/policies/no-dead-ends.md`
**Fix recipe:** the `no-dead-ends` skill · **Door primitive:** `components/official/entity-ref/EntityRef.tsx`

The enforcement layer for THE DOOR LAW: *if the UI names a thing that has an
identity in our system, the UI must let the user reach it.* Documentation was
necessary and not sufficient — this repo's own history says so, which is why
the campaign has a checker AND a standing scoreboard, not a paragraph.

---

## The three parts

| Part | Where | What it does |
|---|---|---|
| **Checker** | `scripts/dead-ends/` (`pnpm check:dead-ends`) | AST rules over every `.tsx` in `features/`, `components/`, `app/`, `lib/`. Ranked report, exit 0. |
| **Scoreboard** | `/administration/reporting/dead-ends` (`features/admin/dead-ends/`) | Renders the committed snapshot: totals, trend, worst features/files, every finding openable, one-click repair briefs. |
| **ESLint rule** | `matrx/no-bare-id-text` (`eslint.config.mjs`, `warn`) | The narrow slice: a **named** id (`agentId`, `task_id`) rendered as JSX text with no door above it. |

**The division of labour is deliberate.** ESLint sees one file at a time with
no cross-file context, so it only claims the shape it can be certain about. The
checker carries the fuzzy cases (a name whose id is in scope, a count with no
list behind it, a surface that imports no door primitive at all) because those
need whole-file reasoning and a read of the live entity registry.

**The one thing ESLint structurally cannot do is name the entity.** The registry
(`features/scopes/registry/entityRegistry.ts`) is a TS module the rule cannot
read, so the rule cannot tell `{agent.id}` — a real dead end — from
`{openItem.id}`, a detail panel printing its own row. It therefore reports
**named ids only**; plain `id`/`uuid` is left entirely to the checker. That
single exclusion, plus mirrored skip-tags, non-record id/root gates, the
id-guarded-fallback skip and the "record is gone" copy gate, is what keeps the
rule a genuine narrow slice rather than a noisier parallel checker.

**Measured 2026-08-09** (`npx eslint features components app lib`, warnings
carrying this rule id):

| | Warnings | Shared with the checker's `bare-id-text` |
|---|---|---|
| Before the gates | 139 | 38 of 80 |
| Gates added, first cut | 76 | 36 of 80 |
| Shipped | **87** | 38 of 80 |

The count went back UP on the last row, and that is the right direction: two of
the new gates were **over**-suppressing. The ternary skip silenced either arm of
any conditional, not just an id-guarded fallback's false arm — so
`{show ? <span>{row.taskId}</span> : null}` stopped warning. And the transient-root
gate ran before the own-id test, so `{instance.agentId}` — a foreign key naming
a real agent — was never linted at all, which is exactly what the comment above
it said must never happen. Both now mirror `scan.ts`; +11 warnings.

Read the last row honestly: the two enforcers still disagree on about half their
findings in each direction, and **that is expected, not a bug**. The checker
suppresses ids whose entity it cannot resolve; the rule suppresses ids it cannot
name. The rule-only warnings are mostly the unnameable class (`{d.originalId}`
on a chart datum) — residual noise the registry would resolve and ESLint cannot.
Do not "fix" one enforcer to match the other's count; they answer different
questions with different information.

## LOUD, NEVER BLOCKING

Arman's standing rule: no check may block a build or a commit. `check-dead-ends`
**always exits 0**. It is wired into `scripts/run-release-gates.sh` as advisory
in **both** modes — including `--strict` — because the tree carries a known
backlog and hard-failing would block every release until the sweep lands.
Promote it into the strict list when the scoreboard reaches zero.

`--strict` exists for a human or a CI job that explicitly wants a hard fail on
a scoped path (`pnpm check:dead-ends --path=features/notes --strict`).

## Commands

```bash
pnpm check:dead-ends                       # scan + ranked report
pnpm check:dead-ends:write                 # + refresh report.json & history.json
pnpm check:dead-ends --path=features/notes # one feature
pnpm check:dead-ends --rule=bare-id-text   # one rule
pnpm check:dead-ends --json                # machine-readable
pnpm check:dead-ends:strict                # exit 1 on any finding
```

**`--write` refuses to run with `--path` or `--rule`** (exit 2, loud).
`report.json` is the whole-repo baseline the scoreboard reads — its totals,
worst-feature/worst-file rankings and trend all assume it — so writing a scoped
run would shrink the page to one feature and add a false trend point, looking
exactly like the campaign had been won. The scoped read is encouraged; the
scoped write is not a thing.

**An empty filter value is a typo, never "everything"** (exit 2, loud). `--path=`
and `--path=/` both reduce to an empty prefix, and every gate downstream tested
that string for truthiness — the path matcher waved every file through, the
zero-match guard skipped itself, and the `--write` refusal above stopped
refusing. The run scanned the whole repo while the operator believed it was
scoped, and could overwrite the baseline doing it. `parseArgs` now rejects both
flags when they arrive without a value; `null` — and only `null` — means no
filter. Leading and trailing slashes on a real prefix are stripped, so
`--path=/features/notes/` works.

**The scoreboard is only as fresh as the last committed snapshot.** Run
`pnpm check:dead-ends:write` and commit `report.json` + `history.json` after a
sweep; the page shows the scan's age and screams past 7 days. A live 6,800-file
AST walk is not a page load, and a static import is the only thing that
reliably resolves inside a Vercel function — this is the same snapshot pattern
the shape doctor uses (`features/content-ir/admin/shape-doctor-server.ts`).

**The snapshot's totals are reconciled against its own findings, and a
mismatch is shown, not thrown.** `parseReport` type-checks each field, which
cannot catch the failure that actually happens: the two JSON files are written
in one pass but committed as two files, so a half-commit or a hand-edit leaves
a confident "140 findings" above 12 rows. `reconcileReport`
(`features/admin/dead-ends/report-data.ts`) recomputes findings, severities,
`byRule` and the distinct-file count from the rows and names every
disagreement; the console renders them in a red alert beside the numbers. It
deliberately does not throw — the rows are still worth showing, and a parse
that takes the scoreboard down is the mistake the history validator already had
to be walked back from.

## The rules

| Id | Severity | Fires when |
|---|---|---|
| `bare-id-text` | high when the token has a route | An id-shaped expression (`x.id`, `r.agent_id`, `fileId`) is rendered as JSX text with no door ancestor. |
| `unlinked-entity-name` | high when the token has a route | A name-shaped expression (`x.name`, `agentName`, `noteTitle`) is rendered as text **and the same object's id is in scope in that file** — the surface provably knows the identity and withheld the door. |
| `unlinked-count` | medium | `{n} agents` / `{x.length} members` with no navigation — a count is a door. |
| `no-doors-in-file` | high | A file reads records (imports a service/slice/selector), **presents** them — by name, or by an id whose entity resolves — and imports **no** door mechanism at all. Debug panels, diagnostics and test clients are excluded from **both** triggers: they display raw records by design, and their individual `bare-id-text` / `unlinked-entity-name` findings still report. |

`high` means "the entity already has an `hrefFor`, so the fix is one
`<EntityRef>`". `medium` means "real, but needs a judgment call" — usually the
token has no route yet and the honest fix is a registry line.

## Precision is the product

A noisy check gets ignored, and an ignored check is *worse* than no check
because it launders the class as "already covered". The rules therefore:

- **Skip selection surfaces** (`SelectItem`, `CommandItem`, `DropdownMenuItem`,
  `option`, `TabsTrigger`…) — choosing is not referencing.
- **Skip "you are here" headings** (`h1`, `h2`, `DialogTitle`, `PageHeader`,
  `BreadcrumbPage`) — the user is already on that record.
- **Skip prose** — a name inside a sentence is copy, not a reference. Two
  mechanisms: a fixed list of container tags (`DialogDescription`,
  `AlertDescription`, `CardDescription`, `FormDescription`, … — a *named list*,
  not a `*Description` suffix rule, so a custom `FooDescription` is NOT skipped)
  and structural sentence detection around the expression.
- **Treat any ancestor with `href` / `onClick` / a JSX spread as a door**,
  including a whole-row click (the canonical `lib/entity-list` pattern).
- **Skip the id-guarded fallback** — `{x.id ? <EntityRef/> : <span>{x.name}</span>}`
  renders the name precisely *because* there is no id. Flagging it would teach
  agents to delete a correct guard.
- **Require the id in scope** before flagging a name. This is the load-bearing
  gate and it is the doctrine's own test.

**Precision was measured, not assumed — four times.** Each cut was audited
finding-by-finding against the source by an independent adversarial reviewer,
and none of the audited versions shipped as-is:

| Audit | Score | What it found |
|---|---|---|
| 1 | ~31% | `unlinked-count` and `no-doors-in-file` both 0/9 |
| 2 | ~55% | four *regressions* — skips so aggressive they silenced real violations, including the whole extracted-row-component idiom |
| 3 | ~50% | the id-prop + selector detail-surface shape (`function X({ agentId })` → `const agent = useAppSelector(…)`), which no parameter check could see |
| 4 (PR review) | — | the self-subject walk stopped at the first enclosing function; the extracted-row-with-callsite-`key` idiom was silently suppressed; `onActivate` was not recognised as a door |

Against the union of the hand-checked samples, the shipped version keeps
**14/14** confirmed true positives and drops **20/20** confirmed false positives.

Treat those tallies as *sample* results at a moment in time, not a precision
figure for the whole report. The denominators moved between rounds because the
rules moved — an earlier revision of this file claimed 28/28 against a rule set
that no longer exists. If you need a current number, re-audit a fresh sample;
do not cite this line as if it were a standing measurement.

Additional gates, each traceable to a real false positive:

- **Entity-scoped id oracle** — `row.name` needs `row.id` / `row.uuid` / an id
  named for the *same* entity. Accepting any `<root>.<x>Id` let `requestId` on
  an in-flight upload satisfy the gate for a file.
- **`NON_RECORD_ID_RE`** — a `requestId`, `tabId` or `blockId` identifies a UI
  thing, not a record; there is nothing to open.
- **Self-subject** — the record's own detail page, editor or confirm modal
  printing its own id. Detected structurally (bound by a parameter of the
  nearest enclosing function that is *not* a `.map()` row callback), so a row
  callback's `{r.task_id}` still reports.
- **Row doors** — an "Open" control in the same *keyed row*, matched on the
  text a human reads (label, `title`, `aria-label`) and never on identifiers.
  A row variable named `view` used to read as a View button. Delete/Copy-only
  rows are explicitly not doors, and the door must lead to the *same* entity —
  an app link in a row does not open the row's task.
- **Prose** — mid-sentence and sentence-initial copy, climbing inline wrappers
  (`<span className="font-medium">{name}</span> will be copied…`). Prettier's
  `{" "}` counts as text, or nothing matches.
- **Count gates** — must name an entity, must not be counting a collection the
  same file renders *or hands to a child component*, must not be pagination or
  prose phrasing. This rule went 91 → 4.
- **Rows are never "self-subject"** — a `.map()` callback, a named helper passed
  to `.map()`, or any function whose JSX carries a `key`. Without all three,
  `function NoteRow({ note })` read as "the note's own page" and the most common
  list idiom in this repo went silent.
- **Self-subject sees the id-prop shape** — `function AgentSettingsForm({ agentId })`
  then `const agent = useAppSelector(…)`. The parameter is the *id*; the record
  is looked up from it, so a parameter check alone never matched. Also covers the
  no-props variant (`const [project, setProject] = useState(…)`, never iterated).
- **OWN identity vs FOREIGN key.** Self-subject suppresses `note.id` on the
  note's own page — never `slot.summary_agent_id` or `instance.agentId`. Those
  point at a *different* record, which is the doctrine's headline complaint:
  knowing the twin exists and not linking it is worse than saying nothing.
- **A handler that receives the record's own id is a door** —
  `onClick={() => handleClick(file.id)}` IS the row opening itself, whatever
  the callback is named. Handler verbs are matched on camel SEGMENTS, not with
  `\b`: there is no word boundary inside `onActivate`, and a boundary-anchored
  regex missed the most common "open this row" callback name in the repo.
- **A component rendered as `<Row key={…} record={…} />` is a ROW**, even
  though the `key` sits at the callsite rather than inside it. Without this the
  extracted-row idiom read as the record's own surface and went silent.
- **"Could not be found" copy is not a dead end** — there is no record to open.
- **`onClick` must navigate** to count as a door. An accordion toggle used to
  silence every finding in the row it wrapped.
- **`restore` is a door** — a soft-deleted record's row has no "open" by design.
- **Reference verbs beat prose** — "Saved to {noteTitle}" is doctrine's own
  class and must survive the prose gate.
- **`NON_RECORD_ID_RE` is deliberately narrow.** An earlier, longer list
  suppressed `brokerId`, `call_id`, `nodeId`, `blockId` — every one a real
  record here. Suppressing a real entity is worse than ranking it low.

Measured on the shipped ruleset: **140 findings (73 high, 67 medium) across 82
files out of 6,806 scanned, in ~9s.**

## Known limits — stated, not hidden

- **A row bound to `r` / `row` / `item` names no entity**, and the name rule
  requires a resolvable token, so `{r.title}` in such a list is invisible to
  `unlinked-entity-name`. This is the biggest remaining recall hole. Closing it
  needs the row's declared TYPE, which means a full TS program — a different
  cost class. `bare-id-text` still covers those rows when the id names its
  entity.
- **Names passed as ATTRIBUTES** (`<ListRow title={registry.name} />`) are not
  examined; only text position is. This repo does that often, so real
  violations hide there.
- **Analysis is per-file and ancestor-based.** A door in a parent component's
  file, or a body extracted into a sibling component, is not seen.
- **Only `features/`, `components/`, `app/` and `lib/` are scanned.** `hooks/`,
  `utils/`, `providers/` and `packages/` are invisible to the scoreboard — a
  surface rendered from there is not covered at all.
- **Any `{...spread}` ancestor counts as a door** (its props may carry `href`).
  Deliberate — precision over recall — but a spread can mask a finding.
- **`idIsInScope` matches the whole file**, so `row.id` anywhere in a long file
  satisfies the gate for an unrelated `row` in another component. A standing
  precision tax on `unlinked-entity-name`.
- **Entity inference is name-based.** `broker` and tool-call ids have no token
  in `entityRegistry.ts`, so they rank as unresolved rather than as the records
  they are. Registering them there fixes it — not a change here.

## Truth vs code, not a hardcoded list

`entity-tokens.ts` parses the **live** `features/scopes/registry/entityRegistry.ts`
for tokens and which of them carry an `hrefFor`. Add a route to a token and the
next run re-ranks itself with no edit here. If the registry moves or changes
shape the loader **throws loudly** rather than degrading to an empty token map
that would silently downgrade every finding.

## The allowlist has reasons, by type

`allowlist.ts` exports `DeadEndAllowlistEntry[]` where `reason` and `addedBy`
are **required fields** — a bare path list cannot compile. The scoreboard
renders every exemption with its reason beside the findings, because an
exemption nobody can see is how the class comes back.

Before adding an entry, ask whether the honest fix is a registry line instead.
A missing door is almost always a missing `hrefFor`, not a false positive.

## Adding a rule

1. Add the id to `DeadEndRuleId` + `RULE_TITLES` + `RULE_DOCTRINE` in `types.ts`.
2. Add its sentence to `describeFinding()` in `describe.ts` (the `switch` is
   exhaustive — TypeScript will point at what's missing).
3. Implement it in `classifyExpression()` (or as a file-level rule) in `scan.ts`,
   with its skip contexts stated in a comment.
4. Add the counter to the `byRule` literal in `check-dead-ends.ts`.
5. Run against a feature you know well and read **every** finding before
   shipping. If more than ~1 in 10 is noise, the rule is not ready.

The dashboard needs no change — it iterates `byRule` and renders titles from
the same maps.

## Files

| File | Role |
|---|---|
| `check-dead-ends.ts` | CLI: walk, run, rank, print, `--write` the snapshot |
| `scan.ts` | The AST rules, skip contexts, and door detection |
| `entity-tokens.ts` | Live entity-registry reader + noun→token inference |
| `describe.ts` | ONE message builder, shared by the CLI and the dashboard |
| `types.ts` | The published report contract (the dashboard depends on it) |
| `allowlist.ts` | Deliberate exemptions, `reason` required by type |
| `report.json` | Committed snapshot the dashboard renders |
| `history.json` | Append-only totals per `--write`, capped at 120 points — the trend, with no new DB table |

**Why no table?** `docs/official/db-rules.md` sets a high bar for a new table,
and a trend of one integer per scan does not clear it. The history is a small
committed file that versions with the code it describes — a scan result is a
property of a commit, so the repo is the right home. If per-run history ever
needs to outlive the file (multiple branches, per-agent attribution), the
existing `public.ts_check_runs` shape is the model to reuse — do not invent a
new one.

## Change Log

- **2026-08-09** — Built. Checker (4 rules), scoreboard at
  `/administration/reporting/dead-ends`, `matrx/no-bare-id-text` ESLint rule,
  advisory wiring in `run-release-gates.sh`. Retuned after each of four
  finding-by-finding adversarial audits (~31% → ~55% → ~50% → PR review);
  against the union of their samples, 14/14 true positives kept and 20/20 false
  positives dropped. Baseline: 140 findings / 73 high across 82 files.
  Post-merge review then caught six more defects in the ESLint half — see the
  2026-08-09 (later) entry.
- **2026-08-09 (later)** — `matrx/no-bare-id-text` measured for the first time:
  139 warnings against the checker's 80 `bare-id-text` findings, i.e. the
  "narrow slice" was the noisier of the two. Gated down to 76 (named ids only,
  the missing "you are here" skip tags, non-record ids/roots, id-guarded
  fallback, "record is gone" copy), then back up to **87** when review found
  two of those gates over-suppressing (the ternary skip covered both arms of
  any conditional; the transient-root gate ran before the own-id test and hid
  every foreign key). Checker output unchanged throughout.
- **2026-08-09 (later still)** — `no-doors-in-file` only fired when a surface
  rendered a record's NAME, so a list presenting records purely as ids was
  invisible to the Inventory Law rule however door-less it was. Widened to
  named ids, with diagnostics excluded (measured: without that exclusion the
  widening added 14 files, 8 of them debug panels). 9 → **16** door-less files;
  totals 140 / 73 high. Highest-value new finding:
  `ConversationHistorySidebar.tsx`, a sidebar listing conversations by id with
  zero door primitives imported.
- **2026-08-09 (evening)** — two consistency defects closed. `--path=` /
  `--rule=` with no value silently scanned the whole repo *and* bypassed the
  `--write` refusal, because every downstream gate tested the string for
  truthiness; both now exit 2. And the dashboard's snapshot parse checked field
  types but never that `totals` / `byRule` agreed with the findings list, so a
  half-committed `report.json` would print a total the rows could not support —
  `reconcileReport` now names every disagreement in a red alert on the page
  (shown, not thrown). Committed snapshot reconciles clean; counts unchanged.
