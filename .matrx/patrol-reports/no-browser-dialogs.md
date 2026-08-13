# P7 — No browser dialogs

- Run date: 2026-08-12
- Run kind: recurring full-repository pass plus approved Tier M batch
- Registry scope: full repository every run
- Prior baseline: stale after an independent UI-hygiene batch; this run rebuilt it from source

## Scope scanned

- Full executable-source scan under `app/`, `components/`, `features/`, and `lib/` for explicit `window.confirm/alert/prompt` and bare `confirm/alert/prompt` calls.
- ESLint scope triage excluded the approved imported asynchronous `confirm({...})` host, locally declared functions, prose/comments, and fixtures such as safe-HTML strings.
- The open P7 ledger entry was independently verified rather than trusted.
- Generated output, dependencies, and build output were excluded; no generated file was touched.

## Rebuilt baseline and outcomes

- Verified before mutation: **27 executable calls in 18 files** — 16 alerts in 9 files, 10 confirms in 8 files, and 1 prompt in 1 file.
- Auto-approved and attempted: **16 standalone alerts in 9 files**. Each unused literal/template alert mapped unambiguously to `toast.success`, `toast.error`, or `toast.info` from the captured `@/lib/toast` wrapper. Messages, guards, control flow, state, and chunk boundaries were preserved.
- Certification rejected the batch because the required browser matrix could not finish. All nine product files were fully reverted, so **0 fixes ship and all 27 calls remain open**.
- Manual approval still required: **11 calls in 9 files** — 10 synchronous confirms in 8 files and 1 token prompt. These remain Tier R because replacing them changes interaction timing, control flow, or sensitive-input UX.
- Excluded as uncertain: **0 verified findings**.

## Tier M alert batch

- `app/(admin)/administration/ui/official-components/component-displays/floating-sheet.tsx`
- `app/(admin)/administration/ui/official-components/component-displays/placeholder.tsx`
- `app/(admin)/administration/ui/official-components/component-displays/simple-card-grid.tsx`
- `app/(admin)/administration/ui/official-components/component-displays/simple-card.tsx`
- `app/(dev)/demos/general/resizable-demo/resizable-builder/page.dev.tsx`
- `app/(dev)/demos/settings-primitives/page.dev.tsx`
- `app/(dev)/demos/tests/_maps/components/SearchControl.tsx`
- `app/(dev)/demos/tests/google-apis/search-console/components/DataTable.tsx`
- `app/(dev)/demos/tests/slack/with-brokers/components/BrokerForm.tsx`

The attempted product diff contained exactly two kinds of edit: captured-toast imports and 16 `alert(...)` calls changed to severity-matched toast calls. The batch was below the 15-file ceiling. The entire product diff was reverted after rejection.

## Verification and certification

- Before the mandatory revert, the attempted-batch P7 scan was clean and all 16 target warnings were removed. After revert, the 16 alerts correctly reappear in the open baseline.
- `pnpm check:doctrine`: pass.
- `pnpm check:tsconfig`: pass.
- `pnpm check:ui-primitives`: pass with unrelated existing repository warnings.
- Changed-file ESLint: no browser-dialog warnings. Existing DataTable static-component errors and old warnings reproduce on `HEAD` and are not caused by this batch.
- Repository `pnpm type-check`: currently red only in five files outside this batch (one administration page and four API routes); no changed P7 file appears. This shared-checkout baseline failure is recorded loudly and was not suppressed or widened.
- Adversarial certifier: **REJECTED**. Settings Primitives passed desktop 1280×800 light/dark and mobile 390×844 light/dark; exercised actions rendered captured toasts with no native dialog, runtime error, or mobile overflow. The only allowed managed preview then became runaway at 26.8 GB before the resizable, admin official-component, Search Console, Maps, and Slack surfaces could complete their required matrices. The certifier stopped it to protect the machine. Partial representative coverage is not certifiable, so the product batch was fully reverted and not released.

## Remaining executable baseline — manual route

### Synchronous confirms

- `app/(transitional)/_apps/app-builder/applets/[id]/edit/components/EditTabLayout.tsx:50,81`
- `app/(transitional)/_apps/app-builder/apps/[id]/edit/components/AppletsEditTab.tsx:39`
- `app/(transitional)/_apps/app-builder/apps/[id]/edit/components/EditTabLayout.tsx:44,74`
- `app/(transitional)/_apps/app-builder/apps/[id]/edit/components/LegacyEditorTab.tsx:28`
- `app/(transitional)/_apps/app-builder/containers/[id]/ContainerDetailLayoutClient.tsx:47`
- `app/(transitional)/_apps/app-builder/fields/[id]/FieldDetailLayoutClient.tsx:45`
- `app/(transitional)/_apps/builder/unified-concept/field-builder/FieldComponentsList.tsx:39`
- `features/administration/hindsight/components/EnrollmentDetailPanel.tsx:242`

### Sensitive token prompt

- `app/(dev)/demos/tests/slack/page.dev.tsx:54`

## Remaining executable baseline — auto-approved retry

The 16 standalone alerts in the nine attempted batch files remain eligible under the narrow automatic gate, but mutation is paused until a stable preview can support the complete certification matrix.

## Guidance and automation improvement

- The Pattern Patrol constitution, operator prompt, and local skill now encode three-way routing: auto-approved, manual approval proposal, or unresolved with missing evidence. An empty auto-approved set is never a terminal `N findings, 0 fixed` run.
- The P7 registry row and live automation prompt auto-approve only standalone, return-unused, literal/template alerts with an unambiguous captured-toast severity and no timing/control-flow/state/chunk change.
- Confirms, prompts, ambiguous/nonliteral alerts, and acknowledgement-dependent alerts always route to manual review.
- `CLAUDE.md` now names the captured `@/lib/toast` wrapper, including `toast.info`, rather than bare `sonner`.

## Cadence health and candidates

- The preceding month is not all clean, so no longer cadence is proposed.
- This first batch was rejected and fully reverted. Mutation is paused for this run; retry only when the managed preview is stable enough to certify every changed surface.
- No recurring unregistered class was observed, so no Candidate-bench nomination was added.
