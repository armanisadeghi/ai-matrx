# Directive Catalog — FEATURE.md

**Status:** Live (admin). The live noun × verb Directive grid + a build/test panel.

The admin surface that shows the **Matrx Directive Catalog** — every noun (a table-backed resource) × every verb (`reference · view · create · update · delete`) — in one place, **live from the backend**, and lets an admin build + test a Directive with a few dropdowns.

## Entry point

- Route: `/administration/agents/relationships/directives` → `app/(admin)/administration/agents/relationships/directives/page.tsx` — the **Directives tab of the Relationships hub** (the old `/administration/directive-catalog` redirects via `next.config.js`). The hub layout owns viewport height: the page wrapper is `h-full`, never a `100dvh` calc.
- **Gating:** the `(admin)` route group layout (`app/(admin)/layout.tsx`) enforces **super-admin** server-side. `DirectiveCatalogClient` carries the single, documented in-page gate (`selectIsAdmin`, any admin level) — the one place to lower to org-level admins later.

## Backend contract (do NOT rebuild)

- `GET /directives/catalog` on the Python brain. In-app path is **bare** (`/directives/catalog`); the public URL adds `/api` (stripped server-side). Non-sensitive, unauthenticated GET.
- Base URL is resolved from the canonical `apiConfigSlice` (`selectResolvedBaseUrl`) — the admin server toggle routes this too. NEVER hardcoded.
- Response shape aliased from OpenAPI in `types.ts` (`components["schemas"]["DirectiveCatalog"]` / `NounDirectives`; states `"yes" | "planned" | "no"`).

## Parts

| Part | File |
|---|---|
| Types (OpenAPI aliases + guards) | `types.ts` |
| Endpoint path | `endpoints.ts` |
| Fetch (one path) | `service.ts` |
| Live hook (fetch + 30s poll + refresh) | `hooks/useDirectiveCatalog.ts` |
| (verb, noun) → Matrx envelope | `buildEnvelope.ts` |
| State color/icon primitive | `components/StateCell.tsx` |
| Grid (matrix, filters, legend) | `components/DirectiveCatalogGrid.tsx` |
| Builder/test panel | `components/DirectiveBuilderPanel.tsx` |
| Orchestrator (load/error/refresh/gate) | `components/DirectiveCatalogClient.tsx` |

## Reuse (no forks)

- **Fetch:** `selectResolvedBaseUrl` (`apiConfigSlice`) — same base every backend call reads.
- **Envelope render (the "test it" payoff):** `reference`/`view` with state `yes` renders LIVE through the canonical `MatrxEnvelopeBlock` + `referenceResolvers.ts` from `features/matrx-envelope/` — the same reference-chip renderer chat uses (resolves the value from Supabase, opens the entity on click). No second renderer.
- Component library: `Select`, `Input`, `Button`, `Badge`; Lucide icons; semantic tokens.

## Execute (writes)

- `create` / `update` on a state-`yes` noun: a JSON payload editor + **Execute** runs the
  action via `POST /directives/execute` (authed; the write runs as the user under RLS on the
  server). Idempotent by content key — a repeat is `already_applied`; `force` opts out.
  Per-item receipts render below. `service.ts::executeDirective` attaches the Supabase JWT
  (`supabase.auth.getSession`); never writes Supabase directly.
- **Any write verb whose cell is `yes` executes** — the catalog state is the only gate
  (no verb allowlist in FE code). `delete` is a soft delete server-side; `planned` /
  `no` cells stay disabled + explained.
- **Write-state cells are controls.** A `planned`/`yes` create, update, or delete cell
  toggles the noun's single `platform.entity_types.agent_writable` flag through
  `admin_set_entity_type_agent_writable`; the adjacent `{}` affordance opens the
  server-derived schema panel. The catalog refresh resyncs the backend runtime registry,
  so enabling takes effect immediately rather than waiting for a deploy.
- **Shape inspection is generated, never authored.** `DirectiveShapePanel` renders Minimum,
  Defaults, Full, and raw JSON Schema views for canonical actions and Plane-2 Custom Actions.
  `schemaExamples.ts` derives copy-ready examples from the server schema; there are no
  noun-specific example maps.

## Server-derived, not hand-authored (2026-07-26)

The catalog is COMPUTED server-side from `platform.entity_types` + the envelope shape
registry, and the payload is enriched: per-noun `label` / `title_column` /
`identity_fields` (required fields of the registered reference item model) / per-verb
write `schemas`, plus a `functions` section (Plane-2 registered procedures + deprecated
legacy named directives) and the server's alias map. Consequences here:

- `buildEnvelope.ts::refFieldsForNoun(noun, catalogNoun)` derives identity fields from
  the catalog row; the hand `REF_FIELDS` map is only uuid/label polish + offline
  fallback — **never add entries for new nouns**.
- `isReferenceVerb` = "not a write verb" (`types.ts::isWriteVerb`); a server-added verb
  is a write by default, no FE edit.
- The grid renders the `functions` section below the matrix (search-filtered).
- The mirrored manifest also generates `features/matrx-envelope/catalog-nouns.generated.ts`
  (`pnpm gen:directive-nouns`, auto-run by `check-protocol-sync --fix`) — the slim table the
  reference resolvers derive from.

## Change Log

- 2026-07-27 — Made easy write capabilities directly toggleable from the matrix; added
  clickable Directive/Custom Action shape inspection with generated minimum/default/full copy
  payloads and raw JSON Schema.

- 2026-07-26 — Catalog is server-computed; FE derives identity fields, write gating,
  and the Custom Actions section from the payload. Verb allowlist + delete explainer copy
  removed; `CustomActionEntry` type added.

- 2026-07-13 — Route moved into the Relationships hub as the Directives tab
  (`/administration/agents/relationships/directives`); old route deleted + redirected.
  `DirectiveCatalogClient` unchanged (zero route coupling).
- 2026-07-04 — Added to admin dashboard catalog (Tool Registry). Release gate `pnpm check:admin-catalog` prevents future omissions.
- 2026-07-01 — Type-safety: replaced 7 hand-written API interfaces with OpenAPI aliases
  (`components["schemas"]` in `types.ts`); derived `DirectiveState` / `DirectiveVerb` from
  `NounDirectives`; removed `?? ""` form-default hatches in `DirectiveBuilderPanel`; confirm
  consumer now passes required `force: false` on `DirectiveConfirmRequest`.
- 2026-07-26 — `confirmDirective` uses `parseHttpError` → `BackendApiError` so callers
  show the gentle `user_message` from `/directives/confirm` (plus structured
  `details.issues` on the wire), not a Pydantic dump.
- 2026-06-24 — Added the `ask`-policy **confirm round-trip**: `confirmDirective` +
  `POST /directives/confirm` (`service.ts` / `endpoints.ts` / `types.ts`). When a directive's
  resolved apply policy is `ask`, the brain streams `directive_apply.proposed`;
  `process-stream.ts` enqueues it into the `proposedDirectives` slice
  (`features/matrx-envelope/state/`), and `<ProposedDirectivesZone>` (mounted beside the
  chat input) renders an Approve/Decline card whose Approve POSTs the envelope back to
  confirm (runs as the user, RLS; idempotent by `proposal_id`). Backend cascade:
  aidream `services/output_directives/` (agent → surface → user, default `ask`).
- 2026-06-24 — Wired the Execute button to `POST /directives/execute` (Plane-1 writer):
  create/update run live with a JSON payload editor, `force` toggle, and per-item receipts;
  delete/planned/no stay disabled.
- 2026-06-24 — Created: live directive-catalog grid + builder/test panel; reuses matrx-envelope renderer for live reference tests; write-execute stubbed pending Plane 1 writer.
