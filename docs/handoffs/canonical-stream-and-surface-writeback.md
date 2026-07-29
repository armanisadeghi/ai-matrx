# Handoff — canonical pipeline streams + the surface 360 loop

**Created:** 2026-07-29 · **Repos:** matrx-frontend (this) + aidream · **DB:** `txzxabzwovsujtloxrus`
**Branch:** `claude/agent-shortcuts-content-ir-qtmsfu` (both repos)

## Why this exists

Arman asked two things: (1) find the gap that let a hand-rolled keyword-research
stream renderer get built despite the ban, and (2) extend surfaces so agents can
not only READ a page but MODIFY it — "fully 360".

The answers turned out to be the same shape of gap in both directions.

**Read direction.** Every canonical read of streamed content
(`selectKindEnvelope`, `<MarkdownStream requestId>`) is keyed on
`state.activeRequests.byRequestId[requestId]`, and that slice was fillable ONLY
by `executeInstance` → `runAiStream` → `processStream`. A run orchestrated
SERVER-side inside a pipeline endpoint (`POST /seo/keywords/research` — durable,
rejoinable, also persisting artifacts and fetching provider volume) therefore had
no `requestId` and *could not* render canonically. The doctrine's instruction
("give it a requestId") had no mechanism. The one real violation followed.

**Write direction.** `apply_surface_write` + `SurfaceWriteTarget` shipped
2026-07-23 and had **zero consumers**, `writeTargets` was code-only so nothing
server-side knew a surface accepted anything, and a rendered block had no way to
READ page state (props cannot reach a block through `BlockRenderer` — that is
deliberate and is what keeps ONE renderer).

## What shipped

### 1. `adoptForeignStream` — a pipeline stream becomes an ordinary request

- `lib/api/call-api.ts` — new `consumeStream?: (response, ids) => Promise<void>`.
  When set, callApi keeps auth / URL resolution / scope injection / v2 fallback /
  HTTP error handling and hands the caller the raw `Response` instead of draining
  it (a body can only be consumed once). `lib/api` learns nothing about agents.
- `features/agents/redux/execution-system/thunks/adopt-foreign-stream.ts` (NEW) —
  a thunk returning that consumer: `createRequest` + the REAL `processStream`,
  ids adopted from the server's `X-Request-ID` / `X-Conversation-ID` when present
  (else minted). `onAdopted` fires before the first event so the surface can
  subscribe; `onEvent` forwards every event for the caller's own typed progress.
  `forceLocalConversationId: true` (the wire conversation belongs to the server's
  pipeline, not a local Redux conversation). Terminal status is forced on a clean
  end so a row can't sit "streaming" forever.
- **Server twin** — aidream `aidream/services/ai_execution/block_stream.py`
  (`stream_agent_as_blocks`), engaged automatically by
  `run_one_agent(stream_output=True)` (`services/agent_service/run.py`): wraps the
  ambient emitter in the existing `BlockStreamingEmitter` so the run emits
  `render_block` events carrying `metadata.__ir` envelopes instead of bare chunks.
  No-op when there's no live emitter; never double-wraps.
- **Enforcement** — `matrx/no-bespoke-stream-renderer` in `eslint.config.mjs`, at
  **error**: `useLiveJsonRegion` / `openParseSession` unimportable outside
  `features/content-ir/`.
- **Both violations deleted** — `LiveResearchFeed.tsx`; the flashcards
  `CreateFromTopic` fallback session.

### 2. The surface 360 loop

- `features/surfaces/runtime/surface-ui-state.ts` (NEW) — the READ twin of
  writeback. `publishSurfaceUiState(surface, key, value)` /
  `useCurrentSurfaceUiState(key)` (deepest mounted surface wins, matching
  writeback). A tiny module store read through `useSyncExternalStore`, justified
  by the same sibling-tree problem as `SurfaceRuntimeContext`. It is a
  **projection** of state the page owns — never a store, never domain data,
  never a channel for callbacks.
- `useSurfaceWriteHandlers` (`SurfaceRuntimeContext.tsx`) — a DEEP CHILD can
  register handlers for its surface's targets by name, instead of threading state
  up to whoever owns the provider. `applySurfaceWrite` consults provider handlers
  + registered handlers (registered win).
- **Apply policy** — `applyPolicy: "manual" | "ask" | "auto"` on
  `SurfaceWriteTarget` + `origin: "user" | "agent"` on `applySurfaceWrite`.
  A user click is always consent. Agent-originated: `manual` (the DEFAULT —
  nothing becomes agent-writable by omission) is refused loudly; `ask` uses the
  canonical `confirm()` primitive in place; `auto` applies. A decline is a
  distinct `{ok:false, declined:true}` outcome and is deliberately silent.
- **Agents can now SEE the write half** — new `ui.ui_surface_write_target`
  (applied + ledgered + live-verified), mirrored by `manifest-sync.service.ts`,
  read by aidream `surface_resolver` into `SurfaceManifest.write_targets`,
  exposed on `GET /surfaces/{client}/{surface}/manifest`, and injected into every
  surface-bound run as a `<surface_write_targets>` block beside the surface
  intro. Manual targets are deliberately NOT advertised (advertising a target the
  platform will refuse reads as a broken promise).
- **First real adopters** — `KeywordResearchBlock` + `KeywordClassificationBatchBlock`
  dropped their three interaction props; they read `keyword_selection` UI state
  and write the `keyword_selection` target declared on
  `matrx-user/keyword-intelligence` (`mode: "ui"`, `applyPolicy: "ask"`).
  The SAME block is interactive on that surface and read-only in chat.
- **Chrome** — the Surface Context window shows agent-writable counts and
  screams about a declared-but-unwired target (previously only discoverable by
  an agent hitting the runtime failure).

## 🚨 Verification debt — this is NOT verified

The environment this was written in could not complete `pnpm install`
(`codeload.github.com` returns 403 through the agent proxy for the
`uidotdev/usehooks` git dependency; `git ls-remote` to the same host works, so
it is a tarball-fetch restriction). Consequences:

- **`pnpm type-check` NEVER RAN.** Types were reasoned about by reading the
  slice/selector/prop definitions, and three adversarial reviewers audited the
  diff, but nothing was compiler-verified. **Run it first.**
- **No browser verification.** Nothing was exercised live.
- **aidream:** Python deps are not installed either — no imports, no tests run.
  Every touched file passes `ast.parse` only.

## Next steps, in order

1. `pnpm type-check` in matrx-frontend. Fix what falls out.
2. **`python db/generate.py` in aidream** — `ui.ui_surface_write_target` exists
   live but its ORM model does not, so `uim.surface_write_target` is absent.
   `surface_resolver` degrades LOUDLY (a `report_recovery` naming the exact fix)
   and every surface reports zero write targets until this runs. Nothing crashes,
   but the agent-facing half of the loop is inert until then.
3. **`pnpm db-types`** in matrx-frontend. The `ui_surface_write_target` type block
   in `types/database.types.ts` was hand-inserted (the Supabase CLI has no access
   token in this environment) to match exactly what the generator emits — the
   regeneration should be a no-op diff. **If it is not, the generator wins.**
4. Run the manifest sync (admin surfaces page) so the `keyword_selection` target
   actually lands in `ui.ui_surface_write_target`. The table is empty right now.
5. Browser-verify: `/marketing/keyword-research` (live research renders as real
   kind components; rejoin-after-refresh still falls back to the saved artifact)
   and the Keyword Intelligence window's Research tab (selection checkboxes still
   work, driven through the write seam).
6. aidream tests + deploy. Both halves must ship — a frontend expecting
   `render_block` events from a server still sending bare chunks renders nothing
   live (it degrades to the saved-artifact path, it does not break).

## Open decisions for Arman

- **`ask` uses an inline `confirm()`, not a persistent inbox.** The existing
  `proposedDirectivesSlice` inbox is envelope-shaped and resolves via a REST
  `/actions/confirm` round-trip to the server — the wrong lifecycle for a
  client-side page write with no server directive behind it. An inline confirm
  also matches the interaction (the page is open, the user is looking at it). If
  you want surface writes to queue in the same visible inbox as directives, that
  is a deliberate follow-up, not an oversight.
- **`writeTargets` are NOT inherited** down the surface parent chain (values
  are). A child surface does not implicitly gain the right to write its parent's
  fields. Say so if you want the opposite.
- **4 pipeline call sites** now stream as render blocks
  (`seo/keyword_research.py` ×2, `seo/page_agents.py` ×2). The page-agent
  surfaces have not been migrated to render them — they will simply keep
  ignoring the events until someone wires `adoptForeignStream` there. Cheap
  follow-up, high value.
