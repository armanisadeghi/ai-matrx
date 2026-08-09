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
| **ESLint rule** | `matrx/no-bare-id-text` (`eslint.config.mjs`, `warn`) | The narrow, near-zero-false-positive slice only: a raw id rendered as JSX text with no door above it. |

**The division of labour is deliberate.** ESLint sees one file at a time with
no cross-file context, so it only claims the shape it can be certain about. The
checker carries the fuzzy cases (a name whose id is in scope, a count with no
list behind it, a surface that imports no door primitive at all) because those
need whole-file reasoning and a read of the live entity registry.

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

**The scoreboard is only as fresh as the last committed snapshot.** Run
`pnpm check:dead-ends:write` and commit `report.json` + `history.json` after a
sweep; the page shows the scan's age and screams past 7 days. A live 6,800-file
AST walk is not a page load, and a static import is the only thing that
reliably resolves inside a Vercel function — this is the same snapshot pattern
the shape doctor uses (`features/content-ir/admin/shape-doctor-server.ts`).

## The rules

| Id | Severity | Fires when |
|---|---|---|
| `bare-id-text` | high when the token has a route | An id-shaped expression (`x.id`, `r.agent_id`, `fileId`) is rendered as JSX text with no door ancestor. |
| `unlinked-entity-name` | high when the token has a route | A name-shaped expression (`x.name`, `agentName`, `noteTitle`) is rendered as text **and the same object's id is in scope in that file** — the surface provably knows the identity and withheld the door. |
| `unlinked-count` | medium | `{n} agents` / `{x.length} members` with no navigation — a count is a door. |
| `no-doors-in-file` | high | A file reads records (imports a service/slice/selector), names them, and imports **no** door mechanism at all — the Inventory Law skipped wholesale. |

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
- **Skip prose** (`*Description`, `label`, `TooltipContent`) — a name inside a
  sentence is copy, not a reference.
- **Treat any ancestor with `href` / `onClick` / a JSX spread as a door**,
  including a whole-row click (the canonical `lib/entity-list` pattern).
- **Skip the id-guarded fallback** — `{x.id ? <EntityRef/> : <span>{x.name}</span>}`
  renders the name precisely *because* there is no id. Flagging it would teach
  agents to delete a correct guard.
- **Require the id in scope** before flagging a name. This is the load-bearing
  gate and it is the doctrine's own test.

**Precision was measured, not assumed — twice.** The first cut was audited
finding-by-finding against the source and scored **~31%** (`unlinked-count` and
`no-doors-in-file` both 0/9). Retuned, a second independent audit scored **~55%**
and — more valuably — found four *regressions*: skips so aggressive they silenced
real violations, including the entire extracted-row-component idiom. Neither
version shipped. Against the union of both audits' hand-checked samples the
shipped version keeps **14/14** confirmed true positives and drops **23/23**
confirmed false positives.

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
- **`onClick` must navigate** to count as a door. An accordion toggle used to
  silence every finding in the row it wrapped.
- **`restore` is a door** — a soft-deleted record's row has no "open" by design.
- **Reference verbs beat prose** — "Saved to {noteTitle}" is doctrine's own
  class and must survive the prose gate.
- **`NON_RECORD_ID_RE` is deliberately narrow.** An earlier, longer list
  suppressed `brokerId`, `call_id`, `nodeId`, `blockId` — every one a real
  record here. Suppressing a real entity is worse than ranking it low.

Measured on the shipped ruleset: **170 findings (90 high, 80 medium) across 108
files out of 6,803 scanned, in ~10s.**

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
  advisory wiring in `run-release-gates.sh`. Tuned against a finding-by-finding
  precision audit before shipping (~31% → 8/8 TP kept, 16/16 FP dropped on the
  audited samples: ~31% → 14/14 TP kept, 23/23 FP dropped). Baseline: 170
  findings / 90 high across 108 files.
