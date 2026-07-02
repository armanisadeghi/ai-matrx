# Action Catalog — FEATURE.md

**Status:** Live (admin). The live noun × verb action grid + a build/test panel.

The admin surface that shows the **Matrx Action Catalog** — every noun (a table-backed resource) × every verb (`reference · view · create · update · delete`) — in one place, **live from the backend**, and lets an admin build + test an action with a few dropdowns.

## Entry point

- Route: `/administration/action-catalog` → `app/(admin)/administration/action-catalog/page.tsx`.
- **Gating:** the `(admin)` route group layout (`app/(admin)/layout.tsx`) enforces **super-admin** server-side. `ActionCatalogClient` carries the single, documented in-page gate (`selectIsAdmin`, any admin level) — the one place to lower to org-level admins later.

## Backend contract (do NOT rebuild)

- `GET /actions/catalog` on the Python brain. In-app path is **bare** (`/actions/catalog`); the public URL adds `/api` (stripped server-side). Non-sensitive, unauthenticated GET.
- Base URL is resolved from the canonical `apiConfigSlice` (`selectResolvedBaseUrl`) — the admin server toggle routes this too. NEVER hardcoded.
- Response shape aliased from OpenAPI in `types.ts` (`components["schemas"]["ActionCatalog"]` / `NounActions`; states `"yes" | "planned" | "no"`).

## Parts

| Part | File |
|---|---|
| Types (OpenAPI aliases + guards) | `types.ts` |
| Endpoint path | `endpoints.ts` |
| Fetch (one path) | `service.ts` |
| Live hook (fetch + 30s poll + refresh) | `hooks/useActionCatalog.ts` |
| (verb, noun) → Matrx envelope | `buildEnvelope.ts` |
| State color/icon primitive | `components/StateCell.tsx` |
| Grid (matrix, filters, legend) | `components/ActionCatalogGrid.tsx` |
| Builder/test panel | `components/ActionBuilderPanel.tsx` |
| Orchestrator (load/error/refresh/gate) | `components/ActionCatalogClient.tsx` |

## Reuse (no forks)

- **Fetch:** `selectResolvedBaseUrl` (`apiConfigSlice`) — same base every backend call reads.
- **Envelope render (the "test it" payoff):** `reference`/`view` with state `yes` renders LIVE through the canonical `MatrxEnvelopeBlock` + `referenceResolvers.ts` from `features/matrx-envelope/` — the same reference-chip renderer chat uses (resolves the value from Supabase, opens the entity on click). No second renderer.
- Component library: `Select`, `Input`, `Button`, `Badge`; Lucide icons; semantic tokens.

## Execute (writes)

- `create` / `update` on a state-`yes` noun: a JSON payload editor + **Execute** runs the
  action via `POST /actions/execute` (authed; the write runs as the user under RLS on the
  server). Idempotent by content key — a repeat is `already_applied`; `force` opts out.
  Per-item receipts render below. `service.ts::executeAction` attaches the Supabase JWT
  (`supabase.auth.getSession`); never writes Supabase directly.
- `delete` is soft-delete → **planned** (disabled). `planned` / `no` write cells are
  disabled + explained.

## Change Log

- 2026-07-01 — Type-safety: replaced 7 hand-written API interfaces with OpenAPI aliases
  (`components["schemas"]` in `types.ts`); derived `ActionState` / `ActionVerb` from
  `NounActions`; removed `?? ""` form-default hatches in `ActionBuilderPanel`; confirm
  consumer now passes required `force: false` on `DirectiveConfirmRequest`.
- 2026-06-24 — Added the `ask`-policy **confirm round-trip**: `confirmDirective` +
  `POST /actions/confirm` (`service.ts` / `endpoints.ts` / `types.ts`). When a directive's
  resolved apply policy is `ask`, the brain streams `directive_apply.proposed`;
  `process-stream.ts` enqueues it into the `proposedDirectives` slice
  (`features/matrx-envelope/state/`), and `<ProposedDirectivesZone>` (mounted beside the
  chat input) renders an Approve/Decline card whose Approve POSTs the envelope back to
  confirm (runs as the user, RLS; idempotent by `proposal_id`). Backend cascade:
  aidream `services/output_directives/` (agent → surface → user, default `ask`).
- 2026-06-24 — Wired the Execute button to `POST /actions/execute` (Plane-1 writer):
  create/update run live with a JSON payload editor, `force` toggle, and per-item receipts;
  delete/planned/no stay disabled.
- 2026-06-24 — Created: live action-catalog grid + builder/test panel; reuses matrx-envelope renderer for live reference tests; write-execute stubbed pending Plane 1 writer.
