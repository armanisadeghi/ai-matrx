# Decisions Log — Prompts → Agents Migration

Append one entry per decision. Never edit past entries; supersede with a new entry that links to the old one.

## Format

```
### YYYY-MM-DD — <short title>
**Phase:** N | all
**Decision:** <one sentence>
**Rationale:** <why>
**Consequences:** <what breaks if we reverse this, what is now true>
```

---

### 2026-04-20 — Dead concepts excluded from migration scope
**Phase:** all
**Decision:** No recipe→anything converter will be built. No prompt→agent converter will be built.
**Rationale:** All active recipes were long since converted to prompts, and all active user/system prompts have already been converted to agents. Users have no remaining source material to convert.
**Consequences:** `api/recipes/[id]/convert-to-prompt` is dead code (removed in Phase 17). No data-migration phase exists in this plan.

### 2026-04-20 — Shortcuts are multi-scope from day one
**Phase:** 1–13
**Decision:** Shortcuts, categories, and content blocks are CRUDable at admin (global), user (personal), and organization scopes from the first migration commit.
**Rationale:** The old system was admin-only and the UnifiedContextMenu already contained unused placeholders for user/org scopes. Building multi-scope as a retrofit would mean touching every shortcut file twice.
**Consequences:** `shortcut_categories` needs scope columns (Phase 1 DB migration). CRUD UI components must be scope-agnostic and mounted three times (admin/user/org routes). RLS must enforce scope boundaries.

### 2026-04-20 — Code editor: two-step replacement
**Phase:** 6 & 15
**Decision:** Phase 6 is a quick `usePromptRunner → useAgentLauncher` wrapper just to keep the one live coding feature (prompt_app component editing) working. Phase 15 is a full rebuild on agent tools with VSCode-style context slots.
**Rationale:** The new agent tool system is rich enough to eventually power a VSCode extension. Doing the big rebuild now would block too many downstream phases; doing only a wrapper permanently would lock in the weakest design.
**Consequences:** Phase 6 code will be deleted in Phase 15. Anything built in Phase 6 should be thin.

### 2026-04-20 — `(a)/chat` is an agent-runner shell
**Phase:** 7
**Decision:** The chat route lives under `(a)/chat` and is implemented as a thin shell over the existing agent runner. Agent selection spans own / system / community agents.
**Rationale:** If the execution-system is correct, chat is ~95% automatic. Resisting the temptation to build chat-specific state keeps the RTK surface clean.
**Consequences:** Chat does not get its own slices. `lib/ai/aiChatSlice` is deprecated in Phase 20.

### 2026-04-20 — Applets vision captured, not ported verbatim
**Phase:** 10
**Decision:** The `features/applet/` parent-app-with-children pattern (and its shared-context concept) is captured as an **agent-native pattern** built on `context-slots-management` — not by moving applet code over.
**Rationale:** The applets system predates real cross-app context sharing; now that context slots exist, the clean expression of that vision is an agent pattern, not a carried-over feature.
**Consequences:** `features/applet/` eventually deprecates (after Phase 10). `app/(authenticated)/apps/custom/*` routes redirect or sunset.

### 2026-04-20 — Content blocks: extend existing table, do not create `agent_content_blocks`
**Phase:** 1 (task 1.2)
**Decision:** The `public.content_blocks` table already exists and is referenced by `context_menu_unified_view`. Instead of creating a parallel `agent_content_blocks` table, extend the existing table with scope columns (`user_id`, `organization_id`, `project_id`, `task_id`) and widen its RLS.
**Rationale:** Content blocks are insertable text templates — inherently neither "prompt" nor "agent". Duplicating the table would fork data and force a later merge. The existing name is system-neutral.
**Consequences:** Phase 1 task 1.2 is a column addition + RLS expansion, not a new-table migration. Phase 19 does not drop `content_blocks`. Phase 2 simplifies — no table creation, just UI + RTK work.

### 2026-04-20 — Separate RTK slice dirs per resource (shortcuts / categories / content blocks)
**Phase:** 1 (task 1.5)
**Decision:** Categories and content blocks each get their own sibling slice directory under `features/agents/redux/` (`agent-shortcut-categories/`, `agent-content-blocks/`) with the full `types.ts` / `converters.ts` / `slice.ts` / `selectors.ts` / `thunks.ts` / `index.ts` file set, matching the existing `agent-shortcuts/` and `agent-apps/` shape. The existing `agent-shortcuts` slice is extended in-place for cross-cutting concerns only (the `fetchUnifiedMenu` thunk and a scope-aware selector surface that re-exports the per-resource selectors).
**Rationale:** This mirrors the prevailing pattern in `features/agents/redux/` (each feature gets its own directory). Merging all three resources into a single `agent-shortcuts` slice would violate slice boundaries, create a monolithic state shape, and make later refactors — e.g. moving content blocks into the shared `@matrx/agents` package — destructive. The cost is one extra layer of imports, which is absorbed by a single re-export block in `agent-shortcuts/selectors.ts` so consumers still see one selector surface.
**Consequences:** Two new RootState keys (`agentShortcutCategory`, `agentContentBlock`) must be kept in sync across `lib/redux/rootReducer.ts`, `packages/matrx-agents/src/redux/slices.ts`, and `packages/matrx-agents/src/build-reducer-map.ts`. A shared `features/agents/redux/shared/scope.ts` module owns the `Scope` / `ScopeRef` type + helpers so all three slices index their rows by the same key format (`"${scope}:${scopeId}"`).

### 2026-04-20 — Shortcut category scope model
**Phase:** 1
**Decision:** Categories scope via nullable `user_id` / `organization_id` / `project_id` / `task_id` columns. A row with all nulls is "global" and writable only by admins. Scope precedence at read time: user > org > global (enforced at the view/hook layer, not in RLS).
**Rationale:** Matches the pattern `agx_shortcut` already uses. Keeps RLS simple (visibility), and lets the view/hook express precedence and shadowing (user row with same label as global row wins in UI).
**Consequences:** The agent-context-menu view returns all visible rows; the RTK consumer handles collapsing duplicates by precedence. Document precedence in the view's header comment.

### 2026-04-21 — Shared CRUD components: strict `{ scope, scopeId? }` prop contract
**Phase:** 1 (task 1.7), 11, 12, 13
**Decision:** Every CRUD component under `features/agent-shortcuts/components/` takes `scope: AgentScope` and optional `scopeId?: string` as props — never reads scope from the URL, pathname, or a route segment. The hooks (`useAgentShortcuts`, `useAgentShortcutCrud`) take the same pair and pass it through to RTK thunks/selectors.
**Rationale:** Phases 11 (admin), 12 (user), 13 (org) each mount the same component tree under a different route; the only difference between mounts is the scope pair. Binding scope to the route would force us to duplicate the components three times.
**Consequences:** Admin routes pass `scope="global"`, user routes `scope="user"`, org routes `scope="organization" scopeId={orgId}`. `ShortcutScopePicker` lets admins switch scope without leaving the form. The CRUD hook builds two shapes of RTK payload internally: `{ scope, scopeId }` wrapper for the category/content-block thunks, and `userId/organizationId/projectId/taskId` row fields for the shortcut thunk (which writes directly to the table).

### 2026-04-21 — Phase 3: execution goes through `launchShortcut`, not a pre-resolved variable payload
**Phase:** 3
**Decision:** `UnifiedAgentContextMenu` calls `useAgentLauncher().launchShortcut(shortcutId, applicationScope, opts)` and lets the launch-execution thunk resolve variables and context slots internally (via `mapScopeToInstance`). The component never passes a `variables` object derived from `mapScopeToAgentVariables` directly.
**Rationale:** `launchAgentExecution` already loads the shortcut row from the slice and runs `mapScopeToInstance` which correctly splits keys into variable values vs context entries (respecting `contextSlots`). Replicating that in the component would duplicate logic and omit the slot-routing branch. `mapScopeToAgentVariables` remains exported for consumers that want a flat variable record outside of execution.
**Consequences:** If the component ever needs to pre-validate mapping (e.g. show "missing variable" warnings before launching), it should call `mapScopeToAgentVariables` as a read-only helper. The runtime path always defers to the thunk. `originalText` is forwarded so widget-handle callbacks can wrap responses around the selection.

### 2026-04-21 — Phase 3: scope precedence collapsed in the hook, not the component
**Phase:** 3
**Decision:** `useUnifiedAgentContextMenu` deduplicates rows across scopes before returning `categoryGroups`. Precedence keys: categories by `(placementType, parentCategoryId, label)`; shortcuts by `keyboard_shortcut` when present else `(categoryId, label)`; content blocks by `(categoryId, blockId)`. Winner is the highest-priority scope level (`task > project > user > organization > global`).
**Rationale:** Matches the `DECISIONS.md` 2026-04-20 scope precedence entry, and keeps the component oblivious to scope — it just renders what the hook hands it. Puts the logic in a pure function (testable).
**Consequences:** If a shortcut should reuse the same label at both user and global levels without one overriding the other, the shortcut's `keyboard_shortcut` can be set differently (or the dedupe key extended in a future refinement). The current behavior matches the user-expectation that a user override shadows the global with the same label.

### 2026-04-21 — Phase 3: SSR fast-path via additive RPC, not legacy swap
**Phase:** 3
**Decision:** Shipped `migrations/get_ssr_agent_shell_data_rpc.sql` as a new RPC mirroring `get_ssr_shell_data` but reading from `agent_context_menu_view`. The existing `get_ssr_shell_data` RPC and `DeferredShellData.tsx` are unchanged. The Phase 3 hook uses `selectContextMenuHydrated` as a "warm" signal but still dispatches `fetchUnifiedMenu` to populate the agent slices from the view.
**Rationale:** Flipping `DeferredShellData` to the agent view now would regress every consumer of `context_menu_unified_view` still in production. Keeping both RPCs lets Phase 5 flip the wiring in one controlled swap once every call site is on v2.
**Consequences:** Phase 5 will update `DeferredShellData` to call `get_ssr_agent_shell_data` and write into a new `agentContextMenuCache` slice (or extend the existing one). Phase 16/18 removes the legacy RPC.

### 2026-04-21 — Phase 10: join table over self-FK for composite agent-apps
**Phase:** 10
**Decision:** Parent→child linkage for composite agent-apps lives in a new `agent_app_children (parent_id, child_id, slug, label, slot_order, required_slots, writes_slots)` join table, not a `agent_apps.parent_agent_app_id` self-FK. Single-app rows carry no parent columns; composite rows get `app_kind = 'composite'` + `shared_context_slots jsonb`.
**Rationale:** A child agent-app may be reused under multiple composites (e.g. a generic `rewriter` under both `email-assistant` and `doc-helper`); ordering, per-link slug, and the `required_slots`/`writes_slots` contract are properties of the *relationship*, not the child. A self-FK would either preclude reuse or require a second table anyway. Keeping single-app rows free of parent columns also avoids `NULL` noise on ~99% of rows.
**Consequences:** Phase 8's `agent_apps` migration adds `app_kind` and `shared_context_slots`; Phase 10 ships `agent_app_children`. The composite editor must prevent cycles (parent/child can't transitively embed itself). A validator at publish time can check each child's declared context slots are covered by the parent's `shared_context_slots`.

### 2026-04-21 — Phase 10: one execution instance per composite, shared by all children
**Phase:** 10
**Decision:** A composite agent-app creates a single `conversationId` (and therefore one `instanceContext` record) at parent-page load. Navigating between child siblings swaps the rendered child component but reuses the same conversation. `initInstanceContext` runs once; child launches through `useAgentLauncher` skip it when the conversation already exists.
**Rationale:** This is the whole point of the composite pattern — shared working memory across sibling mini-apps. Per-child instances would reintroduce the exact gap that made legacy applets' context-sharing never land. The `instanceContext` slice already keys by `conversationId`, so the grain fits natively.
**Consequences:** The composite renderer owns conversation lifecycle; children never call `createInstance` on their own. Persistence (if implemented per open question #2) is a composite-level concern. Destroying the conversation on parent unmount destroys all child state simultaneously — intentional.

### 2026-04-21 — Phase 10: shared-slot namespacing convention
**Phase:** 10
**Decision:** Shared context slots declared on a composite's `shared_context_slots` use their bare key (`draft_text`). A child's own `context_slots` that are *not* promoted to the shared contract get written to the shared context dict under `${child_slug}__${key}` to prevent collisions between siblings that happen to declare the same local slot name. Promotion to the bare key is opt-in via `agent_app_children.writes_slots`.
**Rationale:** Keeps the common case readable (`draft_text` in both children) while making cross-child collisions impossible by construction. The namespacing is applied at the composite runtime layer, so child agent definitions stay oblivious — they still read/write their own declared keys.
**Consequences:** Children that expect to write to a shared key *must* be listed under `writes_slots`; otherwise their writes land in their private namespace and siblings won't see them. The composite editor surfaces this as an explicit toggle per child per slot.

### 2026-04-21 — Mobile form UX: Drawer swap via `useIsMobile()`
**Phase:** 1 (task 1.7)
**Decision:** Every form/modal in `features/agent-shortcuts/components/` renders through `Dialog` on desktop and `Drawer` (vaul bottom-sheet) on mobile, gated by `useIsMobile()` from `@/hooks/use-mobile`. Form body and footer markup is shared — only the outer container swaps.
**Rationale:** CLAUDE.md and `.claude/skills/ios-mobile-first/SKILL.md` forbid Dialogs on mobile. Splitting each form into a shared body and conditionally rendering Dialog/Drawer is the lowest-duplication path.
**Consequences:** All forms use `text-[16px]` on inputs to prevent iOS zoom, `pb-safe` on drawer footers, and `max-h-[92dvh]` on drawer content. Phases 3 (unified context menu), 7 (chat), 11–13 (route UIs) should follow the same pattern.

### 2026-04-21 — Phase 8: dual-path resolution on `/p/[slug]` — agents first
**Phase:** 8, 16
**Decision:** `app/(public)/p/[slug]/page.tsx` resolves agent apps first via `get_agent_app_public_data(p_slug, p_app_id)`; on miss it falls through to the existing `get_prompt_app_public_data` path. Both resolvers return the public-safe subset and mount their respective renderer. Dev-only `console.log("[p/<slug>] resolved path=…")` indicates which path fired; production is silent.
**Rationale:** Slugs across the two tables share a namespace via the existing `validate_slugs` RPC which checks both tables at creation time. Ordering agents first means any newly-authored agent app immediately wins the route once its row lands, while legacy prompt apps keep working without a cutover date. Removing the prompt-app fallback is Phase 16's job.
**Consequences:** The page executes two RPC calls (resolver + conditional fallback) — acceptable overhead during dual-run. Phase 16 removes the prompt-app branch and the `PromptAppPublicRendererFastAPI` import.

### 2026-04-21 — Phase 8: public execute is a Next.js streaming proxy, not a direct FastAPI call
**Phase:** 8
**Decision:** The public renderer posts to `/api/public/agent-apps/[slug]/execute` instead of calling the Python backend directly. The Next.js route resolves the slug → `agent_id` server-side (hiding `agent_id` from the wire), runs guest-limit + IP + DB-trigger rate-limit checks, calls `/ai/agents/{agentId}` (or the conversation-continue endpoint for follow-ups), and pipes the NDJSON response body back to the client with `X-Conversation-ID` and `X-Task-ID` headers.
**Rationale:** Keeping `agent_id` server-side is the stated security requirement. Piping the stream is the lowest-latency way to avoid switching to a polling model. The prompt-apps FastAPI renderer could skip this because the Python backend had a dedicated `/ai/apps/{appId}` endpoint that resolved the pinned prompt version server-side; the equivalent `/ai/agent-apps/{appId}` endpoint does not exist yet.
**Consequences:** The stream is proxied through Next.js — adds one hop of latency. If/when the Python backend adds `/ai/agent-apps/{appId}`, switch the execute route to call it and drop the agent-id resolution locally. Until then, the renderer never constructs a direct backend URL.

### 2026-04-21 — Phase 8: rate-limit enforcement is a DB trigger
**Phase:** 8
**Decision:** `agent_app_rate_limits` is a per-(app, identifier) counter table. Enforcement lives in `enforce_agent_app_rate_limit()` — a `BEFORE INSERT` trigger on `agent_app_executions` that resolves the identifier (`user_id → fingerprint → ip_address`), rolls the window if stale, increments the counter, and raises `check_violation` (`agent_app_rate_limit_exceeded: …`) when the cap is exceeded. The window length and caps are read from the `agent_apps` row (`rate_limit_window_hours`, `rate_limit_authenticated`, `rate_limit_per_ip`).
**Rationale:** Matches the prompt-apps design note that "database triggers + `prompt_app_rate_limits` table" enforce the limit. Putting the logic in the DB means race-free counting without a separate lock service, and the Next.js route stays oblivious to the specific cap math.
**Consequences:** The Next.js route catches the Postgres error, inspects the message for the `agent_app_rate_limit_exceeded` prefix, and returns HTTP 429. If the trigger signature ever changes, the string match needs to move in lockstep. `agent_apps` also carries `app_kind` + `shared_context_slots` columns (Phase 10 composite support) so Phase 10 doesn't need to ALTER the freshly-created table.
