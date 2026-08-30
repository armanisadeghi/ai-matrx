# P11 — Core-route header integrity

- **Run date:** 2026-08-29 (America/Los_Angeles)
- **Run id:** `2026-08-29T161426Z`
- **Base:** `20551a187a25e2f58d83d6d35c610cc0f0618770`
- **Current state:** closed
- **Findings:** 6
- **Fixed in source:** 6
- **Approvals needed:** 0
- **Degradation:** none remaining

## Resume and configuration reconciliation

The prior P11 run `2026-08-26T161415Z` was hash-valid, closed clean, and
already reconciled on `origin/main`; no candidate or human decision remained to
resume. The live P11 automation id, name, M/R tier, recipe, report slug,
schedule, and run instruction match `scripts/pattern-patrol/manifest.ts`.
The current 2026-08-29 contract requires `executionEnvironment=local` in the
canonical `/Users/armanisadeghi/code/matrx-frontend` checkout and forbids
worktrees; that live ruling supersedes the historical worktree wording retained
in earlier append-only events.
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
- The canonical managed preview is running from
  `/Users/armanisadeghi/code/matrx-frontend` on port 3001 and contains the
  corrected candidate in its ancestry.

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

### Corrected candidate — certified and delivered

- Candidate: `4b06080808465764e280fbfef3cd895abb093c24`
- Integration merge: `a6e0cc9b340cb7e8ccb742235d78625c0aeb8e56`
- First containing release: `v0.4.1449`
- Authority projection: `refs/heads/patrol-runs/P11/2026-08-29T161426Z`
  at `49237b0c9d51df3fdbaa47b53c8accb6b729ab5e`
- Second certifier: `/root/p11_certifier_4b060808`
- Verdict: **CERTIFIED** — no candidate-caused defect found

The corrected candidate fixes the scanner callsite and detector scope. It is
already an ancestor of `origin/main` through the integration merge above and
has shipped in `v0.4.1449` and every newer release. This preserves the
historical release-before-certification escape while reconciling the corrected
candidate's exact certification, integration, and first containing release.

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
- `pnpm check:migrations`: command PASS in the original candidate batch with
  its credentialed ledger check skipped; no migration was touched.
- `pnpm check:patrol-contracts`: unchanged baseline failure limited to the
  fleet-health prompt drift.
- Run record hash verification: PASS.
- Canonical authority publication: PASS at
  `49237b0c9d51df3fdbaa47b53c8accb6b729ab5e`; the 17-event record is hash-valid
  and preserves the earlier escaped-delivery and rejection history.

## Visual certification

The isolated in-app Browser captured and the independent certifier inspected
all 18 required states: Marketing, Workflow Bake-off, and Scanner at 1280×800,
800×800, and 375×812 in both light and dark. Every state had one shell-owned
header, exact full-height body geometry, correct top clearance, no
header/content or avatar/action collision, no page-level horizontal overflow,
and closed theme menus. Scanner's Camera, Photos, Files, and Save controls
remained visible and reachable. Fresh per-route tabs reported zero console
errors.

`/marketing/pr` now intentionally redirects to `/marketing/brands` because of
a post-candidate route change; Bake-off and Scanner retain their original
product paths. The canonical preview briefly became unresponsive at 72.3 GB RSS
after its persistent cache reached 107 GB. A managed preview restart cleared
that cache and recovered all routes; this was infrastructure evidence, not a
candidate regression, and no valid work was reverted.

## Decisions and exceptions

- **Human decisions:** none.
- **Exceptions:** none proposed, approved, suppressed, or allowlisted.
- **Sighting outcomes:** no open P11 sighting existed to update.

## Recursive learning

This run proved that P11 detector scope must follow the canonical `PageHeader`
portal consumer, not route-file location or component naming. The smallest next
improvement is a focused detector fixture containing one route-owned and one
feature-owned `PageHeader` clearance hack so this exact false-clean regression
cannot recur. The process improvement is to validate in-app Browser capability
when a visual-certification task is dispatched and to monitor persistent preview
cache growth before it reaches machine-scale size.

## 2026-08-30 eradication waves

The user reported widespread top-header overlap, and the current strict detector
proved falsely clean because it checks header composition but not whether the
rendered body root reserves `--shell-header-h`. A render-path inventory found 179
core routes with `PageHeader`/`RouteHeader`; shared-shell owners were eliminated
before treating a route as a finding.

- Wave 1 fixed four route files: all loading/error/success states for class,
  project, and organization invitation acceptance, plus Welcome. Exact candidate
  `fb564b058e28fb4bbcb260a3ae26e21deac43d97` was independently CERTIFIED and
  integrated through `b4c55f5c5c`.
- Wave 2 fixed ten core-route families in a final 15-file ownership batch:
  Agent Apps create, Agent Apps, Agent Run, Agent Shortcuts, Agent Surface Batch,
  Marketing Automations, Marketing Capabilities, Podcast Studio, Organization
  Configuration, and Organization Shortcut Edit. Shared Agent panels remain
  shell-neutral; core hosts own the canonical offset; admin hosts preserve their
  prior non-shell visual spacing.
- The adversarial certifier rejected two intermediate wave-2 candidates for
  concrete double-offset regressions. Final exact candidate
  `c245945c9fb3f65f6df937536d192d22781915e3` is CERTIFIED, preserved as an
  ancestor of main integration `87d68803eb`, and unreleased after `v0.4.1499`.
- A concurrent WIP integrator swept the initial wave-2 bytes into
  `de83ae2cdd` before certification. The permanent record preserves that escape;
  the bad shared-component ownership was subsequently repaired and certified.

All completed batches passed repository type-check, strict page-header,
strict scroll-chain, and diff checks. No approval or exception is required.
The eradication remains open: remaining render paths need classification, and
the detector needs a body-owner/render-path rule so a missing offset cannot
again report clean.
