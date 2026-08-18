# P12 · Surface Values completeness

Run: `20260818T161811Z`

Base: `e855e0e0788f4c9055a7eaf7f46ee0877486d9a9`

Scope: first-run full inventory (routes, registered overlays, readiness, runtime-provider and Locate evidence, plus direct dialog/drawer/tab candidate counts)

## Outcome

- Verified open surface units: **254**
  - **149** registered overlay ids have no canonical Surface manifest.
  - **105** declared surfaces have not earned verified readiness: 92 partial + 13 stub.
- Product findings fixed: **0**. The declaration backlog requires per-surface data-meaning audits and bounded family batches; mass-generating manifests would violate the completeness law.
- Patrol machinery fixed: **1**. `pnpm check:surface-overlays` now performs the missing overlay-id ↔ manifest comparison and prints the exact 149-item backlog on every run.
- Human decisions required: **1 existing product decision** — whether `/education/learn` stays intentionally non-emitting, receives a thin client identity shell, or becomes client-rendered. The thin client identity shell preserves server-rendered article content and is the lowest-risk option if agent reachability is required.
- Exceptions proposed or approved: **0**.
- Certification: **pending exact-candidate adversarial review**.

## Baseline diagnostics

- Worktree: clean detached automation checkout at the base SHA; dependencies installed locally with `pnpm install --offline --frozen-lockfile`.
- `pnpm check:surface-drift`: PASS — 184 manifests, 4,402 values, 372 write targets, 6 client tools.
- `pnpm check:surface-routes`: PASS — 556 `(core)` routes; 531 resolved, 25 deliberately unmapped, 0 undeclared.
- `pnpm type-check`: baseline and post-change FAIL identically by class — 31 pre-existing errors across 14 files from the `context_slots` → `context_policies` migration plus unrelated education, flashcard, and SMS errors. No P12-owned file appeared in the diagnostics.
- `pnpm check:doctrine`: PASS.
- `pnpm check:reuse-index`: command PASS with an unrelated four-path stale-index warning; no changed P12 path is involved.
- `pnpm check:migrations`: command PASS with two unrelated pre-existing drift warnings (`agx_config_normalization_matrx_actions_ui_gates.sql`, `crm_ui_surface_outreach_lists.sql`).
- Managed preview: no machine-wide preview was running at baseline.

## Inventory evidence

### Declared surfaces

| Readiness | Count | Meaning                                                             |
| --------- | ----: | ------------------------------------------------------------------- |
| Verified  |    79 | Browser-earned contract evidence recorded                           |
| Partial   |    92 | At least one declaration/emitter/Locate/mirror/browser item remains |
| Stub      |    13 | Vocabulary only or no live emitter                                  |
| Total     |   184 | Current code manifests                                              |

The 13 stubs are `agent-shortcuts`, `ai-work`, `ai-work-composer`, `ai-work-conversations`, `image-manager`, `vision-interview`, `artifacts`, `assists`, `reports`, `camera`, `vault`, `legal-ca-wc`, and `education-learn`. `/work/new` remains the highest-value stub because it already launches agents but still uses an ad-hoc `surfaceKey` instead of `runtime.surfaceName` and a typed live scope.

### Registered overlays

- `OVERLAY_IDS`: 174 canonical ids.
- Manifests declaring `overlayId`: 25.
- Undeclared overlay ids: **149**.
- The static registry corroborates 160 interactive entries. Of those, **136** lack manifests: 102 windows, 23 widgets, 6 modals, and 5 sheets.
- Fourteen controller ids are not in the static metadata registry. One (`contextPreviewPanel`) has a manifest; the other 13 remain in the 149-item declaration backlog.

The complete exact backlog is the output of:

```bash
pnpm check:surface-overlays
```

The detector reports missing declarations without failing because this is the active C/R campaign backlog. It fails only for an unambiguous phantom manifest overlay id or duplicate manifests claiming one overlay.

### Direct interactive-surface candidates

Static candidate inventory outside the canonical overlay comparison:

- 326 TSX files render a `Dialog` or `AlertDialog` root.
- 115 TSX files render a `Drawer` or `Sheet` root.
- 77 TSX files render a `Tabs` root.
- 443 unique TSX files render at least one of those roots.
- 259 TSX files mount a `SurfaceRuntimeProvider`.
- 183 Locate anchors exist across 63 TSX files.

These 443 files are a triage pool, not 443 verified findings: many are subordinate interactions inside an already-declared host surface. The next detector gap is to classify roots with independent identity/state while excluding wrappers and subordinate confirmations.

## Finding routes

### Standing-authority repair backlog

1. Process undeclared overlay ids in bounded family batches (maximum 15 files), starting with persistent user-work windows whose data meaning is already explicit: code workspaces/editors, Cloud Files, Notes, Projects, Messages, transcription cleanup, and the Agent run/editor family.
2. Each batch must add the canonical manifest, honest readiness, live provider, typed scope helper, Locate anchors, DB mirror sync, and browser proof. A manifest-only batch does not close a finding.
3. Promote partial surfaces only from recorded Surface Context evidence: declared/live parity, no runtime-only keys, Locate behavior, and relevant state transitions.

### Missing evidence or machinery

1. Direct dialog/drawer/tab discovery still needs an identity/state-aware classifier. Raw JSX counts cannot decide whether a child interaction deserves its own bound agents.
2. The stale `check:registry` command named in the overlay/window documentation is not present in `package.json`; the overlay coverage detector does not depend on it.
3. The existing canonical fleet handoff's “sole stub” statement is stale: current code has 13 stubs. This report and the permanent run record use live manifest evidence instead.

### Genuine human decision

`matrx-user/education-learn` is entirely server-rendered for public SEO. The existing handoff presents three legitimate outcomes: remain non-emitting by design, add a thin client identity shell while keeping the article server-rendered, or convert the reader to a client component. No patrol agent may choose the product reachability tradeoff merely to clear the stub count.

## Recursive learning

The route detector closed only one inventory axis. Comparing the canonical overlay-id union directly to manifest `overlayId` declarations is the smallest stable next axis; the new detector turns a 149-item blind spot into a repeatable, environment-free patrol input.
