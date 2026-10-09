# Phase 8 — Applets Public Runner

**Status:** implementation-complete (DB applied: agent_apps + related tables live); end-to-end smoke untested
**Owner:** claude (phase-08)
**Prerequisites:** Phase 5
**Unblocks:** Phase 9, Phase 10

## Goal

Build `/p/[slug]` for agents with feature parity to the prompt-apps system: Babel-transformed JSX/TSX with import allowlisting, rate-limiting (fingerprint + IP), guest execution tracking, public SELECT/private CRUD RLS.

## Success criteria
- [x] New DB tables: `agent_apps`, `agent_app_executions`, `agent_app_errors`, `agent_app_rate_limits`, `agent_app_versions`, `agent_app_categories`. Schema mirrors prompt-apps equivalents but keys off `agx_agent` / `agx_version`.
- [x] `features/applets/` feature directory with public renderer (port `PromptAppPublicRendererFastAPI` pattern), editor, creation flows.
- [x] Public API: `/api/public/applets/[slug]/execute` + `/api/public/applets/response/[taskId]`.
- [x] Babel import allowlist (`allowed-imports.ts`) ported verbatim — security-critical, review carefully.
- [x] Guest limit / fingerprint services reused unchanged (they're agent/prompt-agnostic).
- [x] `/p/[slug]` resolves Applets before falling back to prompt apps during the dual-run window.

## Design summary

**Babel allowlist.** Ported `allowed-imports.ts` verbatim (all 15 entries in `ALLOWED_IMPORTS_CONFIG`, the `createFallbackIcon` helper, `createSafeModuleProxy`, `buildComponentScope`, `patchScopeForMissingIdentifiers`, `getScopeFunctionParameters`, `isImportAllowed`, `getImportDescription`). Only cosmetic doc-comment rename + `[PromptApp]` → `[AppletRow]` log-tag rename. No imports added, no exports removed.

**Execution flow.** The public renderer posts to `/api/public/applets/[slug]/execute` on the Next.js server, which: (a) resolves slug → `agent_id` using the admin client (keeps `agent_id` off the wire); (b) runs the guest-limit + IP rate-limit + fingerprint checks; (c) inserts an `agent_app_executions` row (the DB trigger `enforce_agent_app_rate_limit` rejects the insert with `check_violation` if the rolling window cap is exceeded, and the server maps that to an HTTP 429); (d) calls the FastAPI backend at `/ai/agents/{agentId}` or `/ai/conversations/{conversationId}` for follow-ups; (e) pipes the NDJSON stream body straight back to the client with `X-Conversation-ID` and `X-Task-ID` response headers. The client never sees `agent_id` or `agent_version_id`.

**Public RPC.** `get_agent_app_public_data(p_slug, p_app_id)` returns only render-facing fields — omits `agent_id`, `agent_version_id`, ownership, and rate-limit config. Mirrors `get_prompt_app_public_data`.

**Dual-path on `/p/[slug]`.** `app/(public)/p/[slug]/page.tsx` tries `get_agent_app_public_data` first; on hit, mounts `AppletPublicRenderer`. On miss, falls through to `get_prompt_app_public_data` and mounts `PromptAppPublicRendererFastAPI`. Dev-mode logging (`[p/<slug>] resolved path=…`) guarded on `NODE_ENV !== "production"`.

**Rate-limit enforcement.** The `agent_app_rate_limits` table holds a per-(app, identifier) rolling-window counter. The `enforce_agent_app_rate_limit()` function runs `BEFORE INSERT` on `agent_app_executions`, resolves the identifier (precedence: `user_id → fingerprint → ip_address`), rolls the window if stale, increments the counter, and raises `check_violation` with message `agent_app_rate_limit_exceeded: …` when the per-app cap is exceeded. The window length (`rate_limit_window_hours`) and caps (`rate_limit_authenticated` / `rate_limit_per_ip`) are read from the `agent_apps` row.

## Files created

### Migrations (7)
- `migrations/create_agent_apps_table.sql`
- `migrations/create_agent_app_executions_table.sql`
- `migrations/create_agent_app_errors_table.sql`
- `migrations/create_agent_app_rate_limits_table.sql`
- `migrations/create_agent_app_versions_table.sql`
- `migrations/create_agent_app_categories_table.sql`
- `migrations/create_get_agent_app_public_data_rpc.sql`

### Feature directory (20)
- `features/applets/index.ts`
- `features/applets/types.ts`
- `features/applets/utils/allowed-imports.ts`  ← ported verbatim (security-critical)
- `features/applets/utils/favicon-metadata.ts`
- `features/applets/services/slug-service.ts`
- `features/applets/sample-code/templates/index.ts`
- `features/applets/sample-code/templates/form-template.ts`
- `features/applets/sample-code/templates/form-to-chat-template.ts`
- `features/applets/sample-code/templates/chat-template.ts`
- `features/applets/sample-code/templates/centered-input-template.ts`
- `features/applets/sample-code/templates/chat-with-history-template.ts`
- `features/applets/components/AppletPublicRenderer.tsx`
- `features/applets/components/AppletRenderer.tsx`
- `features/applets/components/AppletErrorBoundary.tsx`
- `features/applets/components/AppletEditor.tsx`
- `features/applets/components/AppletPreview.tsx`
- `features/applets/components/AppletHeaderCompact.tsx`
- `features/applets/components/SearchableAgentSelect.tsx`
- `features/applets/components/CreateAppletForm.tsx`
- `features/applets/components/CreateAppletModal.tsx`
- `features/applets/components/UpdateAppletModal.tsx`
- `features/applets/components/layouts/AppletListCard.tsx`
- `features/applets/components/layouts/AppletListItem.tsx`
- `features/applets/components/layouts/AppletsGrid.tsx`
- `features/applets/components/layouts/AppletActionModal.tsx`

### API routes (5)
- `app/api/public/applets/[slug]/execute/route.ts` (POST / PATCH / GET)
- `app/api/public/applets/response/[taskId]/route.ts` (GET)
- `app/api/applets/[id]/route.ts` (GET / PATCH / DELETE)
- `app/api/applets/[id]/duplicate/route.ts` (POST)
- `app/api/applets/generate-favicon/route.ts` (POST)

### Route modification
- `app/(public)/p/[slug]/page.tsx` — dual-path resolver (Applets first, prompt apps fallback)

## Blockers / open items
- **DB apply** — all 7 migrations need to run against Supabase before the route starts resolving Applets. After apply, regenerate `types/database.types.ts` and remove the `as any` casts in:
  - `app/api/public/applets/[slug]/execute/route.ts` (`adminAny()` helper + the `supabase as any` casts in GET/PATCH)
  - `app/api/applets/[id]/**` (the `(await createClient()) as unknown as any` casts)
  - `app/(public)/p/[slug]/page.tsx` (the inline `supabase as unknown as any` casts)
- **Backend endpoint naming** — the execute route calls `ENDPOINTS.ai.agentStart(agent_id)`. If the Python backend later adds a dedicated `/ai/applets/{appId}` endpoint (mirroring `/ai/apps/{appId}` for the prompt version), switch the route to hit it — it moves variable-resolution + version-pinning server-side. Until then, the Next.js route resolves the app row itself and passes `variables` + `user_input` through.
- **Agents discovery for `CreateAppletForm`** — the form accepts an `agents: AgentOption[]` prop; the admin UI that fetches and feeds this list lives in Phase 9.

## Security notes
- `allowed-imports.ts` ported without modification. `ALLOWED_IMPORTS_CONFIG` list is byte-identical to the prompt-apps source.
- `get_agent_app_public_data` explicitly excludes `agent_id`, `agent_version_id`, `user_id`, `organization_id`, `rate_limit_*`, and `metadata`. Confirmed by reading the RPC `SELECT` list in `migrations/create_get_agent_app_public_data_rpc.sql`.
- The public execute route is the **only** place `agent_id` is read; it calls the admin client server-side and passes the id into the backend fetch URL. `agent_id` never lands in a response body or response header.
- Rate-limit enforcement is a DB trigger, not app-level — the `check_violation` raise is caught in the Next.js route and mapped to HTTP 429.
- Guest-limit service is untouched (agent/prompt-agnostic). `recordGuestExecution` receives `resourceType: "other"` and `resourceName: "agent_app:<slug>"` until the enum is widened in a follow-up phase.

## Change log
| Date | Who | Change |
|---|---|---|
| 2026-07-18 | codex | Hardened the shared Applets Babel compiler: AST-level import removal now covers multiline/type-only/side-effect imports; regression-tested and live-verified through the DB kind-component consumers (`employee_card`, `employee_roster`). |
| 2026-07-15 | codex (D31) | Hardened the two surviving legacy-named app RPCs against the canonical `app.definition` model: public execution payloads now require public visibility or viewer/owner/service access; version pinning requires editor/owner/service access and is no longer anon-callable. Fixed the stale `output_format` column reference while preserving the response key as `null`. |
| 2026-04-21 | claude (phase-08) | Initial ship: 7 migrations, 24 feature files, 5 API routes, dual-path `/p/[slug]`. Status: code-complete-pending-DB. |
