# FEATURE.md — `agent-apps`

**Status:** `🟢 green-light for prompt_apps deletion` — 61/61 prompt_apps rows migrated to `aga_apps`. Public dual-path resolver in `/p/[slug]` prefers agent path. User-facing route family mirrors `/agents/[id]`: `/agent-apps`, `/agent-apps/new`, `/agent-apps/[id]` (overview), `/agent-apps/[id]/code`, `/agent-apps/[id]/settings`, `/agent-apps/[id]/versions`, `/agent-apps/[id]/v/[version]`, `/agent-apps/[id]/run`, `/agent-apps/templates`. List page is Redux-driven (consumer namespace + memoized selectors) with 7 filter dimensions and 8 sort options including agent-name. AutoCreate AI flow, admin tabs (Dashboard/Apps/Categories/Executions/Analytics/Rate Limits), `/agents/[id]/apps`, and `/org/[slug]/agent-apps` placeholder all live. Redux thunks wired to real Supabase queries. See [MIGRATION-STATUS.md](MIGRATION-STATUS.md) for the full ledger and remaining manual smoke checklist.
**Tier:** `1`
**Last updated:** `2026-05-09`

---

## Purpose

An **Agent App** is a custom UI for a specific workflow. Where a Shortcut *auto-fills* variables, an App *provides a different way to supply them* — often one that doesn't look like AI at all. No chat box. Sometimes no model output in chat form — the agent's result is rendered as an **artifact** directly into the UI.

Successor to the legacy `features/prompt-apps/` (still live, deprecated) and `features/applet/` (fully deprecated). Do not extend the legacy surfaces.

---

## Entry points

**Routes**
- `app/(authenticated)/applets/` — legacy runner surface
- `app/(authenticated)/apps/` — target surface for agent-apps (scaffolding)
- Migration phases: `features/agents/migration/phases/phase-08-agent-apps-public.md` (public URL variant), `phase-09-admin-agent-apps.md`, `phase-10-applets-capture.md`

**Feature code** (`features/agent-apps/`)
- `components/`, `sample-code/`, `services/`, `utils/`, `types.ts`, `index.ts`

**Redux** (canonical slice lives with agents)
- `features/agents/redux/agent-apps/` — slice, selectors, types, thunks (currently stubbed)

---

## Data model

Provisional type from `features/agents/redux/agent-apps/types.ts`:

```ts
interface AgentApp {
  id: string;
  label: string;
  description: string | null;
  iconName: string | null;
  origin: "template" | "ai_generated" | "custom";
  templateId: string | null;
  sourceCode: string | null;
  primaryAgentId: string | null;
  primaryAgentVersionId: string | null;
  useLatest: boolean;                     // pin-by-version default
  embeddedShortcutIds: string[];
  scopeMappings: Record<string, string> | null;
  isActive: boolean;
  isPublic: boolean;
  userId: string | null;
  organizationId: string | null;
  projectId: string | null;
  taskId: string | null;
  createdAt: string;
  updatedAt: string;
}
```

Scope columns follow the same multi-scope model as `AgentShortcut` (see [`../scope-system/FEATURE.md`](../scope-system/FEATURE.md)).

---

## Three creation paths (the `origin` enum)

1. **`template`** — start from a library of standard scaffolds the user customizes. `templateId` references the source.
2. **`ai_generated`** — the in-app AI agent builds the App from a user description.
3. **`custom`** — engineer builds within the framework's structural rules. `sourceCode` holds the rendered component source (transformed via Babel → `new Function()` with allowlisted imports, same pattern as prompt-apps).

---

## Composition

- Apps can embed Shortcuts via `embeddedShortcutIds`.
- A Shortcut inside an App can invoke an agent from *another* App.
- This composition is where the model gets powerful. Example flow:
  - Flashcard Generator **App** renders flashcards as artifacts.
  - Inside that interface lives an "I'm Confused" **Shortcut** invoking the Tutor **agent**.
  - Also inside: a "Make Me a Quiz" **Shortcut** invoking the Quiz Maker **agent** — which renders the Quiz App (another Agent App).
  - Inside the Quiz App, missed questions can fire "Make Flashcards" → back to the Flashcard Generator agent.
  - Three agents, two apps, composed via shortcuts — user never types a prompt.

---

## Public agent-apps

Some Apps are public (`isPublic: true`). The public URL pattern mirrors today's `/p/[slug]` for prompt-apps; see `phase-08-agent-apps-public.md` for the new target. Public apps:
- Run without authentication
- Use ephemeral invocation (no DB persistence) — see [`AGENT_INVOCATION_LIFECYCLE`](../agents/docs/AGENT_INVOCATION_LIFECYCLE.md) ephemeral branch
- Have fingerprint + IP rate limiting (inherited pattern from prompt-apps)

---

## Key flows

### Flow 1 — Engineer creates a custom App

1. Open the App builder (admin or user surface).
2. Pick `origin: "custom"`. Provide `sourceCode`, `primaryAgentId` + pin a version.
3. Define `scopeMappings` (UI context → agent variables).
4. Embed Shortcuts by ID.
5. Save → row inserted.

### Flow 2 — User opens an Agent App

1. Route loads App row. `sourceCode` is Babel-transformed and mounted with scoped imports.
2. The App's UI renders; user interacts.
3. App dispatches invocations (directly or through embedded Shortcuts) → `launchConversation` → stream back → artifacts render inline.

### Flow 3 — Public App request

1. Public URL → server fetches App row (public SELECT via RLS).
2. Client mounts with `origin.isEphemeral: true`.
3. First turn → `POST /ai/agents/{id}` with `store: false`.
4. Subsequent turns → `POST /ai/chat` with full history.

---

## Execution tracking

Every page open and every run produces a row in `aga_executions`. Tracking is **non-blocking** — it must never delay the initial paint or the click-to-API gap. Two design rules enforce that:

1. The renderer ([AgentAppPublicRendererImpl.tsx](components/AgentAppPublicRendererImpl.tsx)) calls `useAgentAppTracker(app.id)` and fires events via fire-and-forget `fetch(..., { keepalive: true })`. No callsite can `await` a tracker call — the helpers return `void`.
2. All writes happen via the dedicated endpoint [`/api/agent-apps/[id]/track`](../../app/api/agent-apps/[id]/track/route.ts), which uses the admin client (RLS-bypass) so tracking works for draft/private apps in the in-shell `/agent-apps/[id]/run` view as well as for published public apps at `/p/<slug>`.

Lifecycle:

| Event | When | Row shape |
|---|---|---|
| `visit` | `useEffect` after mount (deduped against React strict-mode double-fire) | `kind='visit'`, `task_id=uuidv4()`, `success=NULL` |
| `run_start` | Right before `dispatch(launchAgentExecution)` | `kind='run'`, `task_id=` client uuid, `success=NULL`, captures `variables_provided` / `variables_used` |
| `run_complete` | After `dispatch(...).unwrap()` resolves | UPDATE by `task_id`: `success=true`, `execution_time_ms` |
| `run_error` | `catch` branch (non-`AbortError`) | UPDATE by `task_id`: `success=false`, `error_type`, `error_message` |

Aborts (`AbortError`) intentionally leave the row at `success=NULL` — analytics treats long-pending rows as abandoned, distinct from outright errors.

The `kind` column was added in [`migrations/aga_executions_visit_run_tracking.sql`](../../migrations/aga_executions_visit_run_tracking.sql). The success-rate trigger now counts only `kind='run' AND success IS NOT NULL` rows so visits and in-flight runs don't pollute `aga_apps.success_rate` / `total_executions`. The rate-limit BEFORE-INSERT trigger has a `WHEN (NEW.kind = 'run')` clause so visits never count against quota.

Why the renderer doesn't write directly via the Supabase JS client: the in-shell `/run` route is for owners testing draft apps, where the public RLS INSERT policies (`status='published'`, `is_public=true`) would block. Routing through a Next.js endpoint that uses the admin client gives one path that works for both surfaces and keeps the secret key off the client.

The legacy `app/api/public/agent-apps/[slug]/execute/route.ts` (deleted on `2026-05-09`) was the previous home of `aga_executions` writes; the renderer migrated to `launchAgentExecution` on `2026-04-25`, which left a tracking gap from then until this entry. Older `prompt_app_executions` writes live in the legacy `app/api/public/apps/[slug]/execute/route.ts` and are not relevant to agent-apps.

---

## Invariants & gotchas

- **Pin-by-version default.** Apps embed specific `primaryAgentVersionId`. `useLatest: true` is rare and risky — same contract as Shortcuts.
- **Redux canonical location is under `features/agents/redux/agent-apps/`.** Do not create a parallel slice.
- **`sourceCode` executes in a sandbox.** Import allowlisting, variable validation — mirror the prompt-apps security model.
- **Apps do not have a chat window by default.** Rendering agent output via artifacts is the norm; the model produces structured output, the UI renders it as real components, user actions feed back into the next turn.
- **Composition is the design intent.** Apps embed Shortcuts; Shortcuts can point at agents from other Apps. Do not design against composition.
- **Legacy context:** `features/prompt-apps/` and `features/applet/` are predecessors. Do not extend them. See `features/agents/migration/INVENTORY.md` for the legacy ↔ agent map.

---

## Related features

- **Depends on:** `features/agents/`, `features/agent-shortcuts/`, `features/artifacts/` (rendering), `features/agent-context/` (variable/scope resolution)
- **Depended on by:** Public URL consumers, admin/user/org app libraries
- **Cross-links:** `features/agents/docs/AGENT_INVOCATION_LIFECYCLE.md` (ephemeral branch), `features/agents/agent-system-mental-model.md` §6, `features/tool-call-visualization/FEATURE.md`

---

## Current work / migration state

Thunks stub and throw. Backing DB table not yet created. UI rendering path in build. Track progress in:
- `features/agents/migration/phases/phase-08-agent-apps-public.md`
- `features/agents/migration/phases/phase-09-admin-agent-apps.md`
- `features/agents/migration/phases/phase-10-applets-capture.md`

---

## Change log

- `2026-05-09` — claude (Phase 1e/1f/1g/1h — shell + slot + hook foundation, Tier-2 / Tier-3 / history / embed). The architectural push from the [build-out plan](../../.claude/plans/we-are-going-to-synchronous-ritchie.md) lands end-to-end: every app row picks a `shell_kind` (chat / form_to_result / widget / fully_custom), every shell consumes the universal [`useAgentApp()`](hooks/useAgentApp.ts) hook, and customisation tiers compose cleanly on top of the same primitives. **Tier-2 slot overrides ([`SlotRenderer.tsx`](components/shells/SlotRenderer.tsx))**: shells dispatch each customisable slot through SlotRenderer; when `slot_overrides[slot] === 'custom'`, the matching `slot_code[slot]` source compiles in the existing Babel sandbox and renders with the same hook output the default would have received. Slot stubs ([`slot-stubs.ts`](utils/slot-stubs.ts)) seed the Settings → Layout editor on toggle. **Tier-3 fully-custom ([`AgentAppFullyCustomShell.tsx`](components/shells/AgentAppFullyCustomShell.tsx))**: replaces the legacy `CustomComponentRenderer` for `shell_kind='fully_custom'`. Custom apps receive the full `useAgentApp()` output as props plus legacy callback aliases (`onExecute`, `error: { type, message }`, `rateLimitInfo`) so existing rows keep running unmodified — verification that the migration is a no-op for in-the-wild apps. New idiomatic reference at [`fact-checker-hooked.tsx`](sample-code/apps/fact-checker-hooked.tsx). **History sidebar + continuation ([`HistorySidebar.tsx`](components/run/HistorySidebar.tsx))**: `/agent-apps/[id]/run` now wraps the renderer in [`AgentAppRunWithHistory`](components/run/AgentAppRunWithHistory.tsx); past conversations bound to the app's agent (filtered to `sourceFeature='agent-app'`) list in a left rail, click → `loadConversation` rehydrates onto the same surfaceKey, the active shell picks up the loaded conversation, subsequent submits continue automatically. **Iframe embed ([`?embed=widget`](../../app/(public)/p/[slug]/page.tsx))**: a query param on the public route forces the widget shell regardless of the row's configured shell_kind. Settings → Sharing grew an [`EmbedSnippet`](components/builder/EmbedSnippet.tsx) component that surfaces the embed URL plus a copy-paste iframe snippet with adjustable height. `AgentAppRenderer` learned an optional `shellOverride` for the same purpose at the wrapper level. The compile path used by every customisation tier is centralised in [`compile-slot.ts`](utils/compile-slot.ts) so the renderer, the slot system, and the code-tab live preview all share one Babel sandbox configuration. Deferred to a follow-up: deleting the legacy starter snippets in `sample-code/templates/` (still wired into the templates page + create form).
- `2026-05-09` — claude (Phase 1d follow-up — execution tracking): wired the missing `aga_executions` write path. Added `kind` column ('visit' | 'run') in [`migrations/aga_executions_visit_run_tracking.sql`](../../migrations/aga_executions_visit_run_tracking.sql); updated the success-rate trigger to count only `kind='run' AND success IS NOT NULL` rows so visits and in-flight runs don't skew aggregates; added `WHEN (NEW.kind = 'run')` on the rate-limit BEFORE-INSERT trigger so visits don't count against quota. New endpoint [`/api/agent-apps/[id]/track`](../../app/api/agent-apps/[id]/track/route.ts) handles all four lifecycle events (`visit`, `run_start`, `run_complete`, `run_error`) using `createAdminClient()` so it works for draft apps (in-shell `/run` view) and published public apps (`/p/<slug>`). New [`features/agent-apps/tracking/useAgentAppTracker.ts`](tracking/useAgentAppTracker.ts) hook fires `fetch(..., { keepalive: true })` fire-and-forget — never awaited. Renderer ([AgentAppPublicRendererImpl.tsx](components/AgentAppPublicRendererImpl.tsx)) calls `trackVisit()` once on mount (deduped against strict-mode double-fire) and `startRun(variables)` right before `dispatch(launchAgentExecution)`; the returned `RunTracker.complete()` / `.error()` fire after the dispatch resolves or throws. Aborts intentionally leave the row at `success=NULL`. See the new "Execution tracking" section above.
- `2026-05-09` — claude (Phase 1d — round 3): full CRUD on `aga_apps`. (a) `/agent-apps/[id]/preview` renamed to `/agent-apps/[id]/run` because what it actually does is run the app full-screen inside the management shell; "Preview" is reserved for an inline mini-render that lands with the live editor. The overview action row is now all `variant="outline"` so no button reads as "selected to do something" — the header tab strip owns the "you are here" signal. (b) `AgentAppHydratorServer` fetches the bound agent alongside the app and runs both client hydrators, so every sub-route reads from a Redux store with the agent loaded. The overview now shows a Variables card from the agent's `variableDefinitions` (name, widget type, default, options, required) plus a Context Slots card — the user pointed out these determine the app's UI capabilities and were completely hidden. (c) Clicking the agent badge or the "Open agent" link in the agent-binding card now opens `agentAdvancedEditorWindow` overlay instead of route-navigating away — the user stays on the app page. The badge now also surfaces "pinned" / "latest" labels honestly. (d) Settings gained a full "Agent binding" card: `SearchableAgentSelect` to swap the bound agent + the shared `AgentVersionPicker` from agent-shortcuts (version dropdown + "always use latest" toggle with caution banner). Switching agents clears the version pin. (e) Settings gained a Scope card (organization_id / project_id / task_id UUID inputs), a Rate Limits card (per-IP, window hours, authenticated, with non-negative-int validation), and an Icons & preview image card (URL paste fields — full file-handler upload is Phase 5). (f) Category picker placeholder + empty state rewritten to make the custom-create path obvious — the user hit a UX dead-end thinking only system options were allowed. (g) Plan file Phase 1d documents the full feedback set; three deferred items spawned as separate tasks: (i) run tracking is broken — `aga_executions` writes need to be wired non-blockingly, (ii) composite apps roadmap (`app_kind = 'composite'`, `shared_context_slots`), (iii) many-to-many scope migration design.
- `2026-05-09` — claude (Phase 1 polish — round 2): URL state sync, smart back, hero cleanup, real category/tag pickers, in-shell preview, duplicate fix. (a) `useAgentAppConsumerUrlSync` writes filter/sort/search state to `?tab=&sort=&q=&cats=&tags=&agents=&arch=&vis=` via `router.replace` so back/forward + refresh + shareable links restore the filtered list. (b) `useSmartBack` + `AgentAppBackButton` swap the hardcoded `<Link>` in the route header for `router.back()` so the user lands where they came from (with filters intact); falls back to `/agent-apps` when history is shallow. (c) `AgentAppOverviewContent` rebuilt: 64-px favicon hero with 3xl name + base tagline + max-3xl description, full `https://www.aimatrx.com/p/<slug>` line as a labeled copyable URL, `LabeledPill` row where every value names what it is ("Status: Published", "Agent: Tutor"), removed the duplicate Identity card. (d) `AgentAppCategoryPicker` — searchable popover backed by `aga_categories`, type-to-filter, "Use 'foo' as custom category" entry for free-form values; future-friendly for `parent_id` hierarchy. (e) `AgentAppTagsInput` — chip-style multi-tag input with Enter/comma to add, X to remove, backspace at empty, case-insensitive uniqueness; replaces the comma-separated text field. (f) Settings now uses both pickers, plus a labeled Public URL card showing `siteConfig.url/p/` as a static prefix and `<slug>` as a monospace value with a copy button (slug edit deferred — destructive). (g) New `/agent-apps/[id]/preview` sub-route hosts `AgentAppRenderer` (the public renderer + AgentApp→PublicAgentApp projection) inside the management shell; tab strip gains a Preview tab between Overview and Code. (h) `/api/agent-apps/[id]/duplicate` — slug-uniqueness check now uses the admin client (RLS-bypass) so it actually sees collisions owned by other users; the previous version exited the loop "all clear" on RLS-hidden collisions and died on the DB unique constraint with a swallowed error. Postgres error details are now forwarded to the response body in dev. Duplicates default to `is_public=false`.
- `2026-05-09` — claude (Phase 1a + 1b + 1c foundation): list page rebuilt as a Redux consumer + sub-route restructure mirroring `/agents/[id]`. (a) `features/agent-apps/redux/agent-app-consumers/` — slice + selectors + `useAgentAppConsumer` hook, with filter logic factored as a list of pure predicates and sort logic as a comparator map keyed by enum so adding new dimensions (success rate, cost, user feedback, etc.) is a single-spot change. Filters: tab (mine/shared/all), sort (8 options incl. agent-name + executions + last-run), search, categories, tags, agents (filter apps by powering agent — joined to the live agents slice for names), archive, public/private visibility. (b) `features/agent-apps/components/agent-app-listings/` — `AgentAppCard` (status pill, agent badge, executions, success rate, hover actions) + `AgentAppsGrid` (search/sort/tabs/filter-popover + delete confirm via `confirm()` from `ConfirmDialogHost`). Old `/agent-apps/AgentAppsListClient.tsx` removed. (c) `/agent-apps/[id]` is now an overview page, not the editor; the editor moved to `/agent-apps/[id]/code` (CodeWorkspace unchanged). New sub-routes: `/settings` (identity/status/visibility/delete with per-field save via `saveAppField`), `/versions` (real `aga_versions` snapshot list), `/v/[version]` (read-only snapshot detail), `/run` (302 redirect to `/p/[slug]`). Each carries dynamic metadata + favicon letter via `createDynamicRouteMetadata`. (d) `features/agent-apps/route/AgentAppHydratorServer.tsx` + `AgentAppHydrator.tsx` seed the slice once at the layout level so every sub-route reads from one Redux state without re-fetching. (e) `features/agent-apps/components/route-header/AgentAppHeader{,Tabs}.tsx` — back-arrow + name + tab strip (Overview / Code / Versions / Settings). (f) `lib/agent-apps/data.ts` — server-only helpers `getAgentApp`, `getAgentAppVersions`, `getAgentAppVersion`. (g) `AgentAppCard` hover actions point at the new sub-routes (open public, manage, code, versions, settings, duplicate, copy URL, delete). Earlier in the same turn: deleted the deprecated public-execute APIs and fixed the templates preview bug (empty `allowed_imports` → "?" icons everywhere).
- `2026-05-06` — claude: `/agent-apps/[id]` editor now renders the full `CodeWorkspace` (Monaco, agent panel, terminal, AI patch review) instead of the legacy bare `<Textarea>`. The Monaco buffer is the agent app's `aga_apps.component_code` opened via the existing `aga-app:` library-source adapter, so saves go through the standard `useSaveActiveTab` → `agaAppsAdapter.save()` path with optimistic-concurrency guards. A new `"render-preview"` tab kind in `features/code/` runs the live buffer through `AgentAppPublicRenderer` (Babel + scope sandbox unchanged) — registered by `features/agent-apps/code-preview/registerAgentAppRenderPreview.ts`. The chat panel auto-binds to the app's `agent_id` via `?agentId=` URL injection. Old `AgentAppEditor.tsx` is now unused but left in place pending the next sweep.
- `2026-04-26` — 🟢 **GREEN-LIGHT for prompt_apps deletion.** All parity work complete. (a) Ported AutoCreate AI-assisted creation flow: `AutoCreateAgentAppForm.tsx` (1490 LOC) + `useAutoCreateApp.ts` + `config-instructions.ts` duplicated from prompt-apps and retargeted to `aga_apps` (the AI generator's `promptObject` input field name preserved verbatim — that's the contract the builtin expects). (b) Built `CreateAgentAppFormWrapper` with searchable agent picker driving Auto + Manual tabs, mounted at `/agent-apps/new`. (c) Admin Analytics page wired to the per-row aggregate counters on `aga_apps` (overview cards + per-app cards). (d) Admin Rate-Limits page duplicated from prompt-apps, retargeted to `aga_rate_limits` via `fetchAgentAppRateLimits` / `unblockAgentAppRateLimit`. (e) `QuickHtmlShareModal` ported verbatim. (f) 5 hand-rolled `fetch(.../warm)` callsites migrated to `warmAgent` / `warmConversation` helpers (warm endpoint now centrally honors the in-header server picker). (g) Final 7 prompt_apps that were skipped on pass 1 due to renamed agent variables (`metro_name`/`metro_area_name` → `region_name`, `state` → `state_name`, orphan `presentation_style`) migrated via `migrate_remaining_7_prompt_apps.sql` with explicit per-slug `variable_schema` patches; all default text content preserved. Final DB state: 61/61 migrated, 0 broken `agent_id` FKs, 58 publicly renderable, 0 unmigrated.
- `2026-04-26` — User-facing `/agent-apps/` route family shipped: `page.tsx` (list via `AgentAppsListClient` + `AgentAppsGrid`), `new/page.tsx` (server fetches `agx_agent` rows, mounts `CreateAgentAppForm` via `NewAgentAppClient`), `[id]/page.tsx` (loads from `aga_apps`, mounts `AgentAppEditor` via `AgentAppEditPageClient`), `templates/page.tsx` + `templates/[mode]/page.tsx` (preview each display mode with mock streaming). Ported `TemplatePreviewRenderer` from prompt-apps verbatim with imports retargeted. `/agents/[id]/apps` now queries `aga_apps WHERE agent_id = :id` directly via the new `getAppsForAgent` server fetcher in `lib/agents/data.ts` and renders via `AgentAppsGrid`. `/org/[slug]/agent-apps/` placeholder mirrors the prompt-apps "Coming Soon" page. DELETE route on `/api/agent-apps/[id]` now applies `.eq("user_id", user.id)` belt-and-suspenders ownership check. Redux slice rebased: `features/agents/redux/agent-apps/types.ts` re-exports the canonical `AgentApp` from `features/agent-apps/types.ts`; the aspirational `label`/`primaryAgentId`/`embeddedShortcutIds` shape is gone. All thunks (`fetchAppsInitial`, `fetchAppById`, `saveApp`, `saveAppField`, `createApp`, `deleteApp`) now hit Supabase against `aga_apps` and dispatch through the slice. Composition thunks (`addEmbeddedShortcut`/`removeEmbeddedShortcut`) remain stubbed pending Phase 10 / applets.
- `2026-04-25` — `AgentAppPublicRenderer` now delegates execution to `dispatch(launchAgentExecution({ agentId, displayMode: "direct", variables, userInput, ... }))` — the same orchestrator thunk used by `useShortcutTrigger`, `useAgentLauncher`, the `/chat` route, and the AI code editor. Streaming state, request lifecycle, conversation creation, URL routing (`/ai/agents/{id}` ↔ `/ai/conversations/{id}`), `is_new` / `is_version` flags, auth-header injection (Bearer JWT for authed, fingerprint for guests), and server-picker resolution all live inside the launcher — the renderer just subscribes by `requestId` via `selectAccumulatedText` and `selectRequest`. The two-phase rewrite that came before this entry (calling Python directly with hand-rolled body shapes) is gone — that was still reinventing the wheel. `displayMode: "direct"` keeps the user's TSX (Babel sandbox) as the UI surface; the launcher does not open any overlay. Added `"agent-app"` to the `SourceFeature` union for telemetry. Bespoke `/api/public/agent-apps/[slug]/execute` route remains marked DEPRECATED — no longer reachable from any client code path.
- `2026-04-25` — `get_aga_public_data` RPC extended to return `agent_id`, `agent_version_id`, `use_latest`. The Phase-8 "agent_id off the wire" rule was a self-imposed constraint not used elsewhere in the system (shortcuts always exposed `agx_shortcut.agent_id` to the client). Matching the shortcut model unlocks the standard launcher path. `PublicAgentApp` updated to keep those fields.
- `2026-04-25` — Migrated 54 of 61 `prompt_apps` rows into `aga_apps` via `migrations/migrate_prompt_apps_to_aga_apps.sql`. IDs preserved (`agent_id := prompt_id` — verified 100% match against `agx_agent`). All migrated rows force `use_latest=true` because legacy `prompt_version_id`s are orphaned in `agx_version`. `status='published'` rows flipped to `is_public=true` so the dual-path resolver in `/p/[slug]` can serve them publicly. 7 apps with variable-name mismatches (`metro_name → region_name`, `state → state_name`, orphan `presentation_style`) skipped pending manual fix; they remain on the legacy prompt-app path. `success_rate` normalized from mixed 0..100 / 0..1 to 0..1 fraction. Aggregate counters carried over; raw `prompt_app_executions` not migrated.
- `2026-04-25` — Renamed 18 runtime references of `"agent_apps"` to `"aga_apps"` across `app/(public)/p/[slug]/page.tsx`, `app/api/agent-apps/**`, `app/api/public/agent-apps/[slug]/execute/route.ts`, `lib/services/agent-apps-admin-service.ts`. The deployed table has always been `aga_apps`; sibling tables (`aga_executions`, `aga_errors`, `aga_rate_limits`, `aga_categories`, `aga_versions`) were already correctly referenced. The main-table mismatch had gone unnoticed only because no rows had ever flowed through these code paths until this migration.
- `2026-04-25` — Admin route imports: `AgentAppsGrid`, editor shell components, and `AgentApp` type now use direct paths (`components/layouts/…`, `components/…`, `types`) instead of `@/features/agent-apps` barrel.
- `2026-04-22` — claude: initial FEATURE.md extracted from `agent-system-mental-model.md` §6.
- `2026-04-22` — claude: `POST /api/agent-apps` now accepts `scope: "global"` for admins, writing rows with all scope columns null via `createAdminClient()`. New admin UI lives at `administration/system-agents/apps/` (list + `apps/new/` form). This is distinct from `administration/agent-apps/` (moderation of user-published apps). `fetchAgentAppsAdmin` gained a `scope: "global" | "user"` filter.

---

> **Keep-docs-live:** when `AgentApp` type stabilizes, update the type block here. When the DB table ships, update the Data model. When the public URL pattern lands, update Key flows.
