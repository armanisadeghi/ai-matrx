# P11 — Core-route header integrity

- **Run date:** 2026-08-26 (America/Los_Angeles)
- **Run id:** `2026-08-26T161415Z`
- **Base:** `83129f3884fd22bade6163e114aee32b578cd156`
- **Run kind:** first permanent P11 run; full static scan plus complete Education route-family rotation
- **Current state:** closed clean
- **Findings:** 0
- **Fixed:** 0
- **Approvals needed:** 0
- **Degradation:** none

## Resume and configuration reconciliation

No prior `.matrx/patrol-runs/P11/latest.json`, P11 report, automation memory,
or open P11 sighting existed, so there was no unfinished candidate to resume.
The generated prompt matches the canonical manifest's P11 automation id, name,
M/R tier, recipe, cadence, report slug, and run instruction.

## Scope scanned

- Full `pnpm check:page-headers` detector pass.
- Full strict route scroll-chain pass.
- Scoped search across `app/(core)/education` and `features/education` for
  viewport-minus-header wrappers, faux body headers, hardcoded header offsets,
  and shell-height ownership.
- All open sighting-ledger entries; none belonged to P11.
- First complete Education family rotation, including every route involved in
  the original five-file viewport-height finding class.

## Static verification

- `pnpm type-check`: **PASS** before and after the scan.
- `pnpm check:scroll-chain:strict`: **PASS** across 7,453 files, 909 route
  pages, and 255 layouts.
- `pnpm check:page-headers`: **0 `(core)` findings**. Its seven current
  warnings are unchanged `(dev)`/`(public)` routes outside P11's AppShell
  contract.
- Education has no remaining `calc(100dvh...)`, `calc(100vh...)`, `h-page`,
  `h-screen`, `min-h-screen`, or `h-dvh` route wrapper. The shared Education
  layout owns top clearance once with `h-full min-h-0` and
  `pt-[var(--shell-header-h)]`.

## Browser rotation

The exact-worktree managed preview lease was occupied by
`/Users/armanisadeghi/code/matrx-frontend`; this patrol did not reuse or stop
that server. Because there was no candidate diff, the visual scan used the
authenticated live Education surface as bounded current-UI evidence while the
isolated worktree supplied source and gate evidence.

The following routes passed at 1280x800, 800x800, and 375x812:

- `/education/overview`
- `/education/fastfire`
- `/education/fastfire/capture-test`
- `/education/grade-work`
- `/education/practice-oral`
- `/education/subjects/quick-math`
- one live `/education/subjects/quick-math/[id]` detail

`/education/overview` also passed the complete light/dark matrix at all three
widths. In every measured state, the shell header and route center were 44px
high, the center slot ended before the avatar, `.shell-main` matched the full
viewport height, `scrollWidth` equaled `clientWidth`, and the first body action
began below the glass header. Mobile navigation collapsed to the shared menu
without losing route access.

## Outcome and certification

No product or detector file changed. There was therefore no Tier-M mutation
batch and no candidate SHA for an independent certifier.

- **Certifier verdict:** NOT APPLICABLE — zero-finding, zero-mutation run.
- **Human decisions:** none.
- **Exceptions:** none proposed, approved, suppressed, or allowlisted.
- **Sighting outcomes:** no open P11 sighting existed to update.

## Unrelated baseline diagnostics

- `pnpm check:patrol-contracts` continues to report eight non-P11 automation
  status/prompt drifts; the P11 prompt itself matches its manifest.
- `pnpm check:doc-claims` reports two stale execution-runtime pointers in
  `CLAUDE.md`; the sibling history confirms those documents were consolidated.
- `pnpm check:migrations` reports the existing non-blocking 50-file drift
  baseline. P11 changed no migration or database state.

These diagnostics are retained as baseline evidence and were not counted as
P11 findings or used to reject a clean header scan.

## Recursive learning

This run proved that a shared family-level clearance owner plus a route matrix
over the formerly affected leaf archetypes gives cheap, high-confidence P11
coverage. The smallest detector improvement is a `(core)`-only reporting mode
for `check:page-headers`, so unrelated public/demo warnings cannot obscure the
patrol's actual zero-finding result.
