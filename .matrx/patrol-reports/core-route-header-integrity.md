# P11 — Core-route header integrity

- **Run date:** 2026-08-29 (America/Los_Angeles)
- **Run id:** `2026-08-29T161426Z`
- **Base:** `20551a187a25e2f58d83d6d35c610cc0f0618770`
- **Current state:** infrastructure blocked
- **Findings:** 6
- **Fixed in source:** 6
- **Approvals needed:** 0
- **Degradation:** required exact-worktree visual certification incomplete

## Resume and configuration reconciliation

The prior P11 run `2026-08-26T161415Z` was hash-valid, closed clean, and
already reconciled on `origin/main`; no candidate or human decision remained to
resume. The live P11 automation id, name, M/R tier, recipe, report slug,
schedule, and run instruction match `scripts/pattern-patrol/manifest.ts`.
`pnpm check:patrol-contracts` continues to report only the unrelated
`pattern-patrol-fleet-health` prompt drift.

## Scope scanned

- Structural novelty since the prior run base: 98 added `(core)` route leaves,
  led by the HR, Commerce, Product Capture, and Workflow families.
- Full `pnpm check:page-headers` and strict route scroll-chain passes.
- Focused source scan for viewport-minus-header math, hardcoded header offsets,
  faux body headers, and avatar-clearance padding in route and feature-owned
  `PageHeader` consumers.
- The sighting ledger contained no open P11 item.
- The exact-worktree preview lease was checked repeatedly and remained owned
  by `/Users/armanisadeghi/code/matrx-frontend`; it was never reused or stopped.

## Findings and standing-authority repairs

The shell already bounds `#shell-header-center` between its left and right
controls, so `pr-12`/`pr-14` inside a `PageHeader` center row reserves the
avatar width twice. Six verified callsites used that obsolete clearance hack:

1. `app/(core)/marketing/email/page.tsx`
2. `app/(core)/marketing/monitoring/page.tsx`
3. `app/(core)/marketing/outreach/page.tsx`
4. `app/(core)/marketing/pr/page.tsx`
5. `app/(core)/workflows/bakeoff/page.tsx`
6. `features/pdf/scanner/components/ScannerSurface.tsx` (`/tools/scanner`)

All six paddings were removed without changing header ownership, navigation,
actions, or route behavior. `scripts/check-page-headers.ts` now supports a
`--core-only` patrol view and follows literal feature-owned `PageHeader`
consumers in addition to route leaves and named header/nav components.

## Candidate lifecycle and adversarial verdicts

### First candidate — rejected after escaped integration

- Candidate: `81508305e1241e81803824dbe8cd27520390dc87`
- First certifier: `/root/p11_certifier_81508305`
- Verdict: **REJECTED**
- Concrete defect: the new rule scanned only `app/**` route files, so the
  feature-owned scanner `PageHeader` retained `pr-12` while `--core-only`
  falsely reported clean.

Automatic branch integration moved that uncertified candidate onto
`origin/main` through `fea935abb84ed622789775626c2124553a89b8dd` and removed
the automation worktree during certification. The worktree was restored at the
same isolated path; no work continued in the shared checkout. Scheduled release
`v0.4.1448` contains this escaped first candidate. The append-only run record
preserves the infrastructure loss, escaped delivery, and rejection.

### Corrected candidate — infrastructure blocked

- Candidate: `4b06080808465764e280fbfef3cd895abb093c24`
- Preserved ref: `refs/heads/codex/p11-20260829-repair`
- Authority projection: `refs/heads/patrol-runs/P11/2026-08-29T161426Z`
  at `f691b19a8724d5dee632d61e45251ce2f42401fc`
- Second certifier: `/root/p11_certifier_4b060808`
- Verdict: **INFRASTRUCTURE BLOCKED** — no candidate-caused defect found

The corrected candidate fixes the scanner callsite and detector scope. It
remains preserved off `origin/main`; it was not reverted or integrated because
the required exact-worktree viewport/theme matrix could not run.

## Baseline-to-candidate verification

- `pnpm type-check`: PASS before and after.
- `pnpm check:scroll-chain:strict`: PASS before and after across 7,873 files,
  1,021 route pages, and 272 layouts.
- `pnpm check:page-headers -- --core-only --strict`: PASS after the corrected
  batch; the scanner consumer is now in detector scope.
- Full `pnpm check:page-headers`: exactly seven unchanged `(dev)`/`(public)`
  warnings before and after; none is a P11 `(core)` finding.
- `git diff --check`: PASS.
- `pnpm check:doctrine`: PASS.
- `pnpm check:migrations`: command PASS with the ledger check skipped because
  this isolated worktree has no Supabase credentials; no migration was touched.
- `pnpm check:patrol-contracts`: unchanged baseline failure limited to the
  fleet-health prompt drift.
- Run record hash verification: PASS.
- Canonical authority publication: PASS after a fast-forward two-parent
  reconciliation preserved both the earlier escaped-delivery authority chain
  and the corrected candidate ancestry.

## Missing proof and retry contract

Required browser proof remains desktop 1280×800, intermediate 700–900px,
mobile 375×812, and both light/dark themes on representative Marketing,
Workflow Bake-off, and Scanner surfaces. The retry must acquire the managed
preview lease from this exact worktree, use the isolated in-app Browser, and
certify candidate `4b06080808465764e280fbfef3cd895abb093c24` before integration.

## Decisions and exceptions

- **Human decisions:** none.
- **Exceptions:** none proposed, approved, suppressed, or allowlisted.
- **Sighting outcomes:** no open P11 sighting existed to update.

## Recursive learning

This run proved that P11 detector scope must follow the canonical `PageHeader`
portal consumer, not route-file location or component naming. The smallest next
improvement is a focused detector fixture containing one route-owned and one
feature-owned `PageHeader` clearance hack so this exact false-clean regression
cannot recur.
