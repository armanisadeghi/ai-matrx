# Handoff — pipeline streams + the surface 360 loop

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
- **Server twin — WRITTEN BUT PARKED, NOT ENGAGED.** aidream
  `aidream/services/ai_execution/block_stream.py` (`stream_agent_as_blocks`)
  would make pipeline runs emit `render_block` events with envelopes instead of
  bare chunks. Adversarial review found `BlockStreamingEmitter` (which it
  installs) does not implement the emitter protocol, so it is deliberately wired
  to nothing. **The frontend does not need it** — `processStream`'s own
  `StreamBlockAccumulator` already builds envelopes from the chunk stream, so
  server-built envelopes are an optimization. The four blockers are documented at
  the top of `block_stream.py`:
  1. `send_reasoning_state` missing and called **UNGUARDED** by every provider
     the moment a model opens a thinking block → `AttributeError`, billed, and
     re-raised: a paid run dies. Same for `send_resource_changed`,
     `send_citation`, `send_structured_output`, `send_injection_consumed`,
     `send_context_analysis`/`_state`/`_trimmed`.
  2. No turn-text accumulator (`send_chunk` never reaches the inner emitter, no
     `get_turn_text`) → the cancel and mid-stream-error handlers read via
     `getattr` and silently lose the partial assistant text the user already saw.
  3. `blk_N` ids restart per instance, and `keyword_research` runs TWO wrapped
     agents on one client stream → both emit `blk_0` and the FE keys upgrades by
     that id. Needs a run-scoped prefix.
  4. The wrap is None-gated, not capability-gated: `_emit_block_event` requires
     the inner emitter's `queue`/`_ended`/`cancelled`, which `SilentEmitter`,
     `ConsoleEmitter`, `CaptureEmitter` and the workflow emitters lack.
  Fix all four with a forcing-function test asserting the protocol surface is
  complete, then engage it in `run_one_agent`. Fixing it also repairs the
  pre-existing `ctx.block_mode` path, which has the same gaps.
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

## Round 2 (2026-07-29, same day) — the loop is LIVE on the marketing page

Arman's direction: prove it on the real surface, unify user-facing and internal
into ONE system, and make policy user-controllable from the binding. All built:

- **Marketing Page Workspace is the proving ground.** `matrx-user/marketing-page`
  declares `page_meta_tags` / `page_target_keyword` / `page_supporting_keywords`
  (all `entity` mode, surface default `ask`); handlers registered by
  `MarketingPageWriteTargets.tsx` (mounted in `PageWorkspace`) through the
  page's CANONICAL services (`updatePageIntent` with the version guard,
  `addPageSupportingKeywords`). Rows pre-synced live into
  `ui.ui_surface_write_target`.
- **The "LSI Variations & Metadata" agent's DB kind components are wired** (SQL
  patches on `content_ir.kind_component`, updated_at bumped so refresh-on-view
  recompiles): `meta_tag_options` gained a per-option **Use on page** button →
  `page_meta_tags`; `keyword_relationship_research` gained a per-list
  send-to-page button; `keyword_search_metrics` gained per-row + **Add all to
  page** → `page_supporting_keywords`. All call
  `runAction("apply_surface_write", { …, origin: "user" })` — the exact seam
  any user's agent-authored component gets. **To test:** open the bound agent on
  a page workspace (e.g. `/marketing/brands/…/pages/…`), run it, click Use on
  page / the send icons; the page intent + keyword chips should update through
  the canonical saves, with toasts.
- **Per-binding policy overrides, end to end:** `surface_binding` payload v2
  (`write_policies: {target: manual|ask|auto}` — DB schema widened, view
  `agent.menu_surface` exposes it, migration recorded+ledgered), binding
  service reads/writes it, `mergeValueMappingLayers` merges it with the same
  precedence as mappings (shortcut = strongest layer), the launch thunk
  registers it (`registerSurfaceWritePolicies`, keyed per agent+surface so
  re-launches replace), `applySurfaceWrite` resolves override→surface default.
  **Safety floor:** a binding can tighten but can never open a target the
  surface declared `manual`.
- **aidream is on `main`** (pushed per Arman's explicit instruction — codegen
  can't run in this environment). Non-breaking: the write-target feed degrades
  to a one-shot notice until `python db/generate.py` runs; `block_stream.py`
  stays parked. **Arman: run `db/generate.py`, commit the generated model, then
  `./scripts/release.sh`** — that activates the `<surface_write_targets>`
  injection for surface-bound agents.

### Still open (the rest of the vision, in order)

1. **Agent-facing kind skills** — update the three kinds' skills/teaching blocks
   to mention the apply affordances so agents describe them to users.
2. ~~`create_shortcut_from_agent_surface` RPC~~ — DONE 2026-07-29: the RPC now
   reads the v2 edge payload (payload-first for value_mappings — the old
   metadata-only read minted EMPTY mappings for current bindings) and nests the
   binding's `write_policies` under `__write_policies`
   (`migrations/create_shortcut_from_agent_surface_write_policies.sql`, applied
   + ledgered).
3. **Surface client tools have zero adopters** — the seam is live end-to-end
   (declare → register → inject → dispatch) but no manifest declares one yet,
   and they have no DB mirror / `check:surface-drift` coverage.
4. **Cross-agent policy residual** — launch registrations are keyed per
   launch + surface, but two agents launched on the SAME surface in one tab
   session share the surface's policy resolution (documented in
   `surface-writeback.ts`; needs per-request policy scoping if it ever bites).

## Round 3 (2026-07-29) — policy UI, draft content, client tools

Three parallel builders + an adversarial reviewer; all six reviewer findings
(D1–D6) fixed before commit. What shipped:

- **Write-policy UI everywhere the binding lives.** The unused "Playground"
  right panel in the agent-surfaces admin shell is now **Agent access**
  (`features/surfaces/admin/columns/AgentAccessColumn.tsx`): per-target
  Default / Manual / Ask / Auto on the binding's `write_policies`, via the
  shared `WritePolicyEditor` (`features/surfaces/components/bind/`), which
  renders the manual floor as locked — an override can never open a target the
  surface declared `manual`. The same editor sits in the batch bindings editor
  and both bind panels; every save path round-trips the other half of the edge
  payload (reviewer findings D2/D3).
- **Shortcuts carry policies with NO DDL** — stored inside the shortcut's
  `value_mappings` JSONB under the reserved `__write_policies` key;
  `features/agents/redux/agent-shortcuts/converters.ts` is the ONE
  serializer pair (parse strips the key so `isValueMappingMap` consumers never
  see it; pack nests it back; all three save seams auto-fill the missing half
  so a one-sided patch can't clear the other). ShortcutEditorNext gained the
  "Agent write access" section; launch treats shortcut policies as the
  strongest mapping layer.
- **`page_draft_content` write target** (draft/ask) on marketing-page — stages
  agent-proposed body markdown (`{markdown, mode: replace|append}`) into the
  page's UNSAVED draft editor state (`PageDraftContentCard`), never straight to
  the DB. Plus the `page_keywords` UI-state publish from
  `MarketingPageWriteTargets` so keyword kind components can mark what's
  already on the page.
- **Surface client tools (vision tier 3)** — `SurfaceManifest.clientTools`
  (declare) + `useSurfaceClientTools` (page registers handlers) +
  automatic inline-spec injection in `build-tool-injection.ts` (only
  declared+mounted+handled tools are offered; skipped under the
  disable-injection brake) + `dispatch-surface-client-tool.thunk.ts` in the
  delegated-call router (never throws, always resumes the loop). Runtime:
  `features/surfaces/runtime/surface-client-tools.ts`, deepest-declaring
  mounted surface wins, same walk as `applySurfaceWrite`.
- **Reviewer fixes**: D1 surface-name import (canonical const lives in
  `features/marketing/lib/marketing-page-scope.ts`), D2/D3 policy round-trip on
  every binding save path, D4 policy registrations are surface-scoped + keyed
  (stale launches can't leak policies across surfaces), D5 `versionRef`
  (post-write version tracking so consecutive applies don't trip the
  optimistic lock), D6 `-- migrate: skip:` marker moved into the first 25
  lines of `surface_binding_write_policies.sql` (ledger checksum updated).

## Adversarial review — what it caught

Three reviewers audited the diff before it was committed. Everything
substantiated is fixed in `160b68be`; the notable ones, because they show what
to distrust in similar work:

- The launcher still gated its entire live panel on a field the migration
  deleted, so the change rendered **nothing** on its primary surface. A partial
  rename across two consumers.
- The new lint rule errored on the canonical implementation its own message
  points you at, and its name-only check was bypassable by namespace import,
  re-export, or `await import()`.
- Read and write used **different** surface resolution (single deepest runtime
  vs. walking the stack), which silently disabled the blocks in an
  overlay-hosted window and could leak one surface's selection onto another's.
- The whole `applyPolicy` gate was **dead code** — the only client seam never
  passed `origin` — while the DB was already advertising `ask` to the server.
- An adopted stream fired the "no assistant reservation arrived" alarm on every
  successful run and wrote a phantom message record.
- The adopter's AbortController was never wired to the fetch, so a heartbeat
  timeout aborted nothing and leaked the body for the life of the tab.

Still open from review, judged not worth blocking on (fix opportunistically):
`listLiveWriteTargets()` is called in the Surface Context window's render body
and re-invokes every mounted provider's `getWriteHandlers()` on each 400ms poll;
`useSurfaceUiState`'s exact-surface form is now the rarely-used one and could be
folded into the stack-walking form.

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
