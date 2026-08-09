# Assists — AI assists everywhere (frontend half)

Cross-repo system-of-record: `/Users/armanisadeghi/code/common-docs/systems/assists/FEATURE.md` — read it before touching this feature in ANY repo. This doc covers only this repo's wiring.

**What it is:** the platform-wide one-click-AI-help primitive. Deterministic code, background agents, sweeps, and stream events notice things and produce **assists**; the user sees chips; accepting one dispatches the typed `action` binding through ONE registry. The standing design gate: every friction point gets asked *"could an AI button/chip do this for the user?"* BEFORE a manual affordance is designed.

## The pieces (all in this feature unless noted)

| Piece | File | Rule |
|---|---|---|
| Types + action union | `types.ts` | `AssistAction` is the source of truth for `platform.assists.action`. `toAssist` narrows rows; a row that doesn't narrow never renders. `makeEphemeralAssist` = inline chip, no ledger row. |
| Service | `service.ts` | ONE browser path to `platform.assists`. Mine-scope reads (THE VIEW LAW). `emitAssist` is idempotent by `dedupe_key`; `filterUndecidedKeys` makes dismissals durable (producers must call it before emitting). |
| Redux | `redux/assistsSlice.ts` | `state.assists`; memoized selectors; `assistEmitted` / `assistDecided` keep the dock live without refetch. |
| Emit helper | `redux/emitTracked.ts` | `emitAssistTracked` = `emitAssist` + the local Redux mirror in one call — what every client-side producer uses (lives beside the slice because service.ts must not import the slice). |
| Action registry | `runtime/assist-action-registry.ts` | Mirrors content-ir's kind-action-registry (pure, capability-scoped ctx, never throws into UI). Kinds today: `launch_agent` (agentId or slotKey), `navigate`, `surface_write` (via `applySurfaceWrite`, `origin:"user"` — the chip click is the gesture). New kind = one handler file + one side-effect import in `useAssistRunner.ts`. |
| Runner | `runtime/useAssistRunner.ts` | The ONE hook chips call. Accept = run action → decide row with receipt. Failures: toast + `captureError({source:"assists"})`. |
| Chip | `components/AssistChip.tsx` | THE canonical rendering of one assist. Never fork a second chip. |
| Dock | `components/AssistsDock.tsx` | Global stack, mounted once in `app/DeferredSingletonCore.tsx`. Renders nothing at count 0. No realtime channel (deliberate — fetch on mount + focus). |

## DB

`platform.assists` (entity token `assist`, RLS via `iam.apply_rls` variant `entity`, visibility `personal`). Producers set `created_by` = the addressee. Migration: `migrations/platform_assists_ledger.sql`. Unique live-pending index on `dedupe_key`.

## Producers live in the OWNING feature, not here

This feature owns the primitive; each producer sits beside the domain that notices:

- `features/content-ir/studio/shape-assists-producer.ts` — your shape has no custom component → "AI can build a custom UI" (ledger-backed, on `/shapes` visit, capped 5/sweep).
- `features/workflow-emit/GenericEmitRenderer.tsx` — a workflow output rendered through the generic viewer → ephemeral "Build a beautiful UI for this output" chip (the Surprise-me UI pattern).
- `features/marketing/search-console/insights-assists-producer.ts` — GSC insight findings become assists (money-page decay / CTR gap → launch `seo.page_analyzer` slot pre-filled with the code-compressed finding; unclassified backlog → navigate to the classification workbench or intake wizard). Swept once per site per session over a fixed 28d-vs-prev window anchored on the site's freshest data day; rendered inline by `components/GscAssistStrip.tsx` via `selectAssistsForSurface`.
- aidream background producers write rows via the ORM (see the system-of-record's aidream section).

## Producer rules (non-negotiable)

1. Always set a `dedupeKey` and call `filterUndecidedKeys` first — a user's dismissal is durable; re-noticing must not resurrect the chip.
2. Cap per-sweep emissions; set `expires_at`.
3. Cheapest-first (canvas doctrine rung 5): deterministic state checks before any model call.
4. The action must DO something real. A chip that opens a blank chat is banned.

## Change Log

- 2026-08-08 — GSC insights producer wired (search-console feature); extracted `emitAssistTracked` so producers stop hand-mirroring rows into Redux.
- 2026-08-08 — Created: ledger, registry (3 action kinds), runner, chip, dock, first two producers (shapes missing-component, workflow-emit surprise-UI). Error Inspector source `assists` added.
