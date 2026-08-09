# `/p/chat` → `(a)/chat` Migration

**Status:** ⏳ Not started — `(a)/chat` exists but is **not feature-complete** vs `/p/chat`
**Owner:** TBD
**Branch suggestion:** `chat-route-finish-and-cutover`
**Cross-refs:** [`INVENTORY.md §1`](./INVENTORY.md) · [`INVENTORY.md §8`](./INVENTORY.md) · [`FINAL-AUDIT-2026-05-04.md §1.1`](./FINAL-AUDIT-2026-05-04.md) · [`phases/phase-07-chat-route.md`](./phases/phase-07-chat-route.md)

> **Goal:** Finish `(a)/chat` to feature parity with `/p/chat`, then cut `/p/chat` over (or sunset it). The internal execution stack on `/p/chat` already routes to `/ai/agents/{agentId}` — what's missing on `(a)/chat` is the **route surface, the public/anon entry path, and the legacy components** that `/p/chat` still drags in from `features/prompts/`.

---

## What we lose if `/p/chat` is deleted before `(a)/chat` is finished

### Missing routes on the agent side

| `/p/chat` route | What it does | `(a)/chat` equivalent | Status |
|---|---|---|---|
| `/p/chat` (root) | Generic chat entry; renders `ChatContainer` with agent picker | `/chat` (root) → `ChatLandingClient` redirects to latest conversation or `/chat/new` | **DIFFERENT** — agent-side has no "blank canvas with picker" landing |
| `/p/chat/[requestId]` | Legacy redirect handler; UUID requestId → `/p/chat/c/[id]`, else → `/p/chat` | _none_ | **MISSING** (low priority — legacy compat) |
| `/p/chat/c/[id]` | Open by conversation ID; warm-call on server | `/chat/[conversationId]` | **MATCHED** — same behavior |
| `/p/chat/a/[id]` | Open empty chat with **agent pre-selected** by URL; warm-call on server | _none_ | 🔴 **MISSING** — no agent-direct entry route |

### Missing or different UX on the agent side

| Feature | `/p/chat` source | `(a)/chat` status |
|---|---|---|
| Anonymous / guest access | yes — `/p/chat/*` is in `app/(public)/` | 🔴 NO — `(a)/chat` requires auth (sits in `(a)` group) |
| Agent picker with system/user/builtin filtering | `AgentSelector`, `AgentPickerSheet`, `SidebarAgents`, `PromptPickerMenu` | PARTIAL — `ChatAgentPicker` exists; covers owned/system/community tabs but lacks user/builtin filtering and the floating `PromptPickerMenu` mid-chat |
| Conversation recovery / soft-delete history | `useChatPersistence`, `ChatHistorySidebar` reads `cx_conversation` | MATCHED — `(a)/chat` already reads conversations from Redux/cx tables |
| Sequential vs stacked variable inputs | `GuidedVariableInputs` (sequential), `PublicVariableInputs` (stacked) | MISSING — agent runner uses the unified variable panel; the guided sequential walk-through doesn't exist |
| Resource pickers (upload, URLs, webpage, YouTube, scraper) | `useScraperApi` (was `usePublicScraperContent`, deleted 2026-08-09), resource picker bundle | PARTIAL — agent runner has resource pills; legacy bundle (PDF optimize, YouTube transcript shortcut, etc.) not all wired |
| Voice input | `VoiceMicEngine`, `VoiceMicButton` | MISSING |
| HTML preview modal in messages | `HtmlPreviewModal` | MISSING (or different — verify) |
| PDF optimize prompt | `PdfOptimizePrompt` | MISSING |
| Mobile-specific drawer/header | `ChatMobileHeader`, sidebar drawer | PARTIAL — `(a)/chat` is mobile-friendly but the legacy mobile UX has specific affordances worth porting |
| Sidebar event side-channel | `events/sidebarEvents.ts` (custom event emitter) | DIFFERENT — agent system uses Redux events; verify no consumer relies on the custom emitter |
| Public-chat agent defaults (DEFAULT_AGENTS hardcoded) | `utils/agent-resolver.ts` | DIFFERENT — agent system reads from `agx_agent` directly; need to confirm public defaults are set up in the agent table |

### Legacy code that must be cut alongside `/p/chat` deletion

`/p/chat` still imports from `features/prompts/**` for types and components (no `usePromptRunner`, but type-level coupling). Until these are ported, `features/prompts/` cannot be deleted:

- `features/prompts/types/core` — `PromptVariable`, `PromptSettings`
- `features/prompts/types/resources` — `Resource`
- `features/prompts/components/` — `ResourceChips`, `ResourcesContainer`, `VariableInputComponent`, `ModelSettingsDialog`
- `features/prompts/hooks/useAgentConsumer.ts` — used by `AgentPickerSheet`, `SidebarAgents`, `PromptPickerMenu`, `agent-resolver`

---

## Two-step migration plan

### Step 1 — Finish `(a)/chat` to feature parity (SAFE; no deletion yet)

Build everything missing into `(a)/chat`. Both routes coexist. Test thoroughly.

#### 1.1 Add the agent-direct entry route

Create `app/(a)/chat/a/[agentId]/page.tsx`:
- Mirrors `/p/chat/a/[id]` semantics: open an empty conversation, agent pre-selected, fire warm call on server.
- Use the same `warmAgent()` function the SSR chat already calls.
- Render `ChatRoomClient` with the agent loaded and `conversationId = null` (signals new chat).
- On first message send, `createManualInstance` fires — same behavior as the new-chat flow.

#### 1.2 Decide the auth model

`(a)/chat` is currently auth-only. `/p/chat` is anonymous-friendly. **Pick one:**

- **Option A** — Move `(a)/chat` to a public-capable group. Add a session check: if no session, render in guest mode (no history sidebar, no save-to-history). This requires shifting the route folder out of `(a)/` or adding a public sibling.
- **Option B** — Keep `(a)/chat` auth-only and leave `/p/chat` permanently as the public surface, but rewire its internals. Simpler but doesn't actually delete `/p/chat`.
- **Option C** (recommended) — Create `app/(public)/chat/...` mirror that wraps the same `ChatRoomClient` with a guest-mode prop. Keeps the agent components agnostic; routing handles the auth split.

Whichever option, the **components** under `features/agents/components/chat/` should be auth-agnostic. Pass `mode: "guest" | "user"` as a prop.

#### 1.3 Port the missing features into agent-side components

| `/p/chat` feature | Where to add it on the agent side |
|---|---|
| Sequential `GuidedVariableInputs` | `features/agents/components/agent-runner/` — add a `mode: "guided" \| "stacked"` toggle on the variable panel |
| Voice input (`VoiceMicEngine` + `VoiceMicButton`) | `features/agents/components/agent-runner/` input area — extract to a shared `features/audio/` component if not already there |
| `HtmlPreviewModal` | Promote to `features/agents/components/messages-display/` — reusable across all agent chats |
| `PdfOptimizePrompt` | `features/agents/components/agent-runner/` resource handler |
| Mid-chat agent switch (`PromptPickerMenu` equivalent) | `ChatRoomClient` — add a small picker that dispatches `loadAgent(newAgentId)` and starts a fresh instance |
| Public scraper content | RESOLVED 2026-08-09 — `usePublicScraperContent` deleted; every caller uses `useScraperApi()` (browser → Python directly, guests included) |
| Default agent list for guests | Replace `DEFAULT_AGENTS` hardcoded constant with a `is_public` query against `agx_agent` |

#### 1.4 Replace the deprecated layers

`/p/chat` runs on three deprecated layers that must NOT be ported as-is:

- `DEPRECATED-useAgentChat` — handles NDJSON streaming. Replaced by `useAgentLauncher` + `instance` Redux on the agent side. **Do not port — already exists.**
- `DEPRECATED-ChatContext` — React context with messages/agentConfig/variables/streaming reducers. Replaced by the agent execution-system slices. **Do not port.**
- `useChatPersistence` — wraps `/api/cx-chat/*` for cx_ table writes. The agent system already writes to the same cx_ tables via the execution-system thunks. **Reuse the existing thunks** — verify they cover all 8 methods (`createConversation`, `saveMessages`, `loadHistory`, `loadConversation`, `renameConversation`, `deleteConversation`, `updateConversationStatus`, `pendingConversationId` ref).

#### 1.5 Audit `/api/cx-chat/*` consumers

Today the agent system has its own write paths to cx_ tables. The four `/api/cx-chat/*` routes (`shared`, `request`, `history`, `messages`) are called from `/p/chat`'s `useChatPersistence`. Either:

- Wire `(a)/chat` to call the same routes (consistent), or
- Confirm the agent execution-system thunks fully replace them and these routes become dead code at deletion time.

Pick one model and document it in `features/agents/docs/STREAMING_SYSTEM.md`.

### Step 2 — Cut over and delete (gated on Step 1 verified)

Once `(a)/chat` matches every checkbox above:

1. Add a 302 redirect from `/p/chat`, `/p/chat/c/[id]`, `/p/chat/a/[id]`, `/p/chat/[requestId]` → corresponding `(a)/chat` (or `/chat`) URL.
2. Soak the redirect in production for 1–2 weeks; watch logs for 404s and unexpected query strings.
3. Delete `app/(public)/p/chat/**`.
4. Delete `features/public-chat/**`.
5. Delete `app/api/cx-chat/**` if Step 1.5 confirmed they're dead, or leave them as the canonical persistence API.
6. Delete the deprecated layers: `DEPRECATED-useAgentChat.ts`, `DEPRECATED-ChatContext.tsx`, `useChatPersistence.ts` if subsumed.
7. Now `features/prompts/types/{core,resources}` are no longer imported by chat — clears one of the last blockers for `features/prompts/` deletion.

---

## Critical gotchas (don't miss these)

1. **URL-driven vs Redux-driven state**
   `/p/chat` reads agent + conversation IDs from URL params and pushes UI state into `DEPRECATED-ChatContext`. `(a)/chat` reads from Redux instance state. The migration must preserve URL semantics — bookmarks, shared links, and the warm-call optimization all rely on URL → state hydration.

2. **Warm calls are SSR-only**
   `/p/chat/c/[id]` and `/p/chat/a/[id]` fire `warmAgent()` server-side. This must replicate on `(a)/chat/[conversationId]` and the new `(a)/chat/a/[agentId]`. Without it, first-message latency regresses.

3. **Conversation auto-creation is a side-effect**
   `/p/chat`'s first message flow creates the `cx_conversation` row implicitly. The agent system also auto-creates on `createManualInstance`. Verify both paths create a row with the same shape (status, title, system_instruction, anon_owner where applicable).

4. **Message content conversion**
   `cx_message` stores content blocks as JSONB. `/p/chat` converts via `cx-content-converter.ts` — DB blocks → markdown + `<reasoning>` tags for display. The agent system has its own converter (`AgentConversationDisplay`); confirm the output is bit-identical for shared conversations.

5. **Anonymous identity tracking**
   `/p/chat` allows guest conversations. They're owned by `anon_owner` (cookie/fingerprint) — NOT by `auth.users`. The `(a)/chat` execution system assumes a user session. If we keep guest support, the cx_ writes must accept null `user_id` and `anon_owner` instead — verify the existing schema and RLS support this.

6. **Streaming abort lifecycle**
   `/p/chat` cancels NDJSON streams via abort controller in `DEPRECATED-useAgentChat`. The agent system has `cancelInstance` and active-request tracking. Confirm the cancel UX is identical (button state, cleanup, partial-message handling).

7. **Sidebar event side-channel**
   `features/public-chat/events/sidebarEvents.ts` is a custom EventTarget. If any non-public-chat code listens to it (search `addEventListener("public-chat:")`), preserve or migrate the event before deletion.

8. **Default agents for guests**
   `DEFAULT_AGENTS` is hardcoded in `utils/agent-resolver.ts`. After migration, public defaults should come from `is_public = true AND visibility = 'public'` query on `agx_agent`. Confirm the production agent table has at least 3-5 public agents flagged before flipping the cutover.

9. **`useAgentConsumer` divergence**
   The agent's filter/sort hook (`features/agents/hooks/useAgentConsumer.ts`) is NOT a drop-in replacement for `features/prompts/hooks/useAgentConsumer.ts` — they wrap different slices. Verify behavior parity (search debounce, favorites, access-filter scopes) before swapping.

10. **`ChatPageShell` keybindings**
    `(a)/chat`'s shell hardcodes Cmd+K (new), Cmd+J (picker), `/` (focus input). `/p/chat` may have different bindings. Decide whose keybindings win.

---

## Implementation checklist

### Phase 1 — `(a)/chat` parity build

- [ ] Create `app/(a)/chat/a/[agentId]/page.tsx` with `warmAgent()`.
- [ ] Decide auth model (Option A / B / C above) and document in `features/agents/docs/`.
- [ ] Add guided variable input mode to `agent-runner`.
- [ ] Port `VoiceMicEngine` + `VoiceMicButton` (or extract to `features/audio/`).
- [ ] Port `HtmlPreviewModal` to `messages-display/`.
- [ ] Port `PdfOptimizePrompt` to `agent-runner/`.
- [ ] Add mid-chat agent switch picker.
- [ ] Wire public scraper content into chat input.
- [ ] Replace `DEFAULT_AGENTS` constant with a Supabase query for public agents.
- [ ] Decide `useChatPersistence` fate (keep API routes or delete; pick one).
- [ ] Verify warm-call parity on `/chat/[conversationId]` and `/chat/a/[agentId]`.

### Phase 2 — Cutover

- [ ] Add 302 redirects from every `/p/chat*` URL to its `(a)/chat*` counterpart.
- [ ] Production soak: 1-2 weeks. Watch 404s, weird query strings, anon flow.
- [ ] Add Sentry/log query for `[p-chat-redirect]` to confirm volume tapering.

### Phase 3 — Delete

- [ ] Remove `app/(public)/p/chat/**`.
- [ ] Remove `features/public-chat/**`.
- [ ] Remove `app/api/cx-chat/**` if subsumed.
- [ ] Update `features/agents/migration/INVENTORY.md` change log.

---

## Files touched (manifest)

### Add

- `app/(a)/chat/a/[agentId]/page.tsx` (new)
- `app/(public)/chat/**` (if Option C from §1.2 chosen)
- `features/agents/components/agent-runner/GuidedVariableInputs.tsx` (port from public-chat)
- `features/agents/components/agent-runner/VoiceMic*.tsx` (port from public-chat or extract to features/audio)
- `features/agents/components/messages-display/HtmlPreviewModal.tsx` (port)
- `features/agents/components/agent-runner/PdfOptimizePrompt.tsx` (port)

### Modify

- `app/(a)/chat/page.tsx` — possibly redirect to `/chat/new` instead of latest conversation if guest mode is added
- `app/(a)/chat/layout.tsx` — extend metadata to cover new sub-routes
- `app/(a)/chat/[conversationId]/page.tsx` — confirm warm-call parity
- `app/(a)/chat/new/page.tsx` — extend agent picker with user/builtin filter tabs
- `features/agents/components/chat/ChatRoomClient.tsx` — accept `mode: "guest" | "user"` prop
- `features/agents/components/chat/ChatAgentPicker.tsx` — add user/builtin tabs and the mid-chat switcher variant
- `features/agents/hooks/useAgentLauncher.ts` — verify NDJSON cancel matches `DEPRECATED-useAgentChat` semantics
- `features/agents/docs/STREAMING_SYSTEM.md` — document the persistence-API decision

### Delete (Step 2)

- `app/(public)/p/chat/**` (4 routes)
- `features/public-chat/**` (~35 files)
- `app/api/cx-chat/**` (4 route files) — only if subsumed

---

## Change log

| Date | Who | Change |
|---|---|---|
| 2026-05-04 | claude (audit-legacy-systems) | Created — audit of `/p/chat` route surface, all `features/public-chat/` files, `/api/cx-chat/*` endpoints, `useChatPersistence` API, and gap analysis vs `(a)/chat`. |
