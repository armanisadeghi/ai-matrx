# Phase 10 — Applets Capture (Parent-App-with-Children)

**Status:** design-complete
**Owner:** _unassigned_
**Prerequisites:** Phase 1 (context slots foundation), Phase 8 (agent-apps infra)
**Unblocks:** Phase 20 (sunset `features/applet/`)

## The applets vision (summary)

The legacy `features/applet/` system expresses a **parent-app-with-children** pattern: a `CustomAppConfig` is a container (route `/apps/custom/[slug]`) that owns an ordered `appletList: AppletListItemConfig[]`, and each child `CustomAppletConfig` renders under `/apps/custom/[slug]/[appletSlug]`. The container supplies shared chrome — header, branding, navigation between children — and each child is a self-contained mini-app with its own input containers, layout, and AI recipe. Two Redux slices reflect this shape: `customAppRuntimeSlice` holds the parent, `customAppletRuntimeSlice` holds the currently active child and swaps as the user navigates.

The *intended* payoff of the parent-child split was **context sharing**: the user's work in applet A (say, a "core-info-generator") should flow into applet B (an "applet-description-generator") without being re-entered. In practice this was never cleanly delivered. The runtime wires each applet to its own broker map and recipe (`SLUG_TO_COORDINATOR_MAP` in `AppletRunComponent.tsx` is the visible scar), and any cross-applet state had to be smuggled through ad-hoc redux couplings or URL params. The `?cid=` conversation-id persistence in the FastAPI path is the furthest the legacy system got toward sibling awareness.

Everything else in the parent-app shell — the header, the applet switcher, theming, slug routing — is chrome and can be rebuilt trivially. The *load-bearing* idea, and the one worth capturing, is: a group of AI mini-apps that **operate on the same shared working memory**.

## The agent-native equivalent

The agent system already has every primitive needed. The mapping:

| Legacy concept | Agent-native equivalent |
|---|---|
| `CustomAppConfig` (parent) | An `agent_app` row with `kind = 'composite'` (or equivalent) — a container app whose renderer is a child-switcher, not an AI runner. |
| `CustomAppletConfig` (child) | A normal `agent_app` row (Phase 8) bound to an agent version. |
| Child renders AI UI via broker map | Child is the Phase 8 Babel-transformed agent-app component, called through `useAgentLauncher`. |
| Implicit cross-applet state (never delivered) | **Explicit `ContextSlot[]` declared on the parent**; every child reads/writes the same `conversationId`-scoped `instanceContext`. |
| `SLUG_TO_COORDINATOR_MAP` routing hack | Gone. Each child's agent declares its own context slots; the parent provides the union. |

**Worked example — `email-assistant` parent with `tone-picker` and `rewriter` children:**

1. `email-assistant` is an `agent_app` with `kind = 'composite'`. Its config lists two child `agent_app` ids (`tone-picker`, `rewriter`) and declares a shared context-slot contract: `draft_text: text`, `target_tone: text`, `audience: text`.
2. On `/p/email-assistant` load, the runner creates **one** agent execution instance (one `conversationId`) and calls `initInstanceContext({ conversationId })` once.
3. The user opens `tone-picker` first. The tone-picker's agent version reads `draft_text` via `ctx_get`, outputs a tone recommendation, and the child's result handler writes `target_tone` via `setContextEntry({ conversationId, key: 'target_tone', ... })`.
4. The user switches to `rewriter` (same parent, same `conversationId`). The rewriter's agent immediately sees `draft_text` *and* `target_tone` in its context dict — no re-entry, no URL smuggling. It produces a rewritten draft and writes it back to `draft_text`.
5. Returning to `tone-picker` now sees the updated `draft_text`. The parent shell just swaps the rendered child; the shared working memory persists.

The `AgentContextSlotsManager` component is the author-time UI for declaring this contract on the parent composite app. The runtime side is `instance-context.slice.ts`, which already keys context by `conversationId` — the exact grain that one parent / many children needs.

## Schema implications

**MUST HAVE**

- `agent_apps.app_kind` (enum: `'single' | 'composite'`, default `'single'`) — distinguishes a leaf runner from a child-switcher container. Without this, the renderer can't branch.
- A parent→child linkage. **Decision: use a dedicated join table `agent_app_children`**, not a self-FK.
  - Columns: `parent_id uuid references agent_apps(id) on delete cascade`, `child_id uuid references agent_apps(id) on delete restrict`, `slot_order int not null`, `label text`, `slug text not null` (the segment used in `/p/[parent-slug]/[child-slug]`), `created_at timestamptz default now()`.
  - PK `(parent_id, child_id)`; unique `(parent_id, slug)`; index on `(parent_id, slot_order)`.
- `agent_apps.shared_context_slots jsonb` on composite rows — the `ContextSlot[]` contract visible to all children. Children's own agent-level context slots are a subset the parent is expected to satisfy; a validator at publish time can flag unsatisfied child slots.

**NICE TO HAVE**

- `agent_app_children.required_slots jsonb` — per-child, names of the shared slots this child *requires* to be set before it can execute. Enables a "gated" UX ("set draft_text first").
- `agent_app_children.writes_slots jsonb` — documentation of which shared slots a child is expected to write. Not enforced; useful for lint-style warnings in the composite editor.
- `agent_apps.composite_layout` (enum: `'tabs' | 'wizard' | 'freeform'`) — hint to the composite renderer. Defaults to `'tabs'`.

**Why a join table, not a self-FK?**

1. Ordering. A self-FK forces `children.sort_index` on the child row, which is parent-global state living on a child that may (theoretically) be reused across parents.
2. Reuse. A child agent-app may legitimately appear under more than one composite (e.g. a generic `rewriter` under both `email-assistant` and `doc-helper`). A self-FK precludes this without a second table anyway.
3. Per-link metadata. Slug, label override, and `required_slots` are properties of the **relationship**, not of either endpoint.
4. Single-agent-app rows stay clean — no `parent_id: null` noise on 99% of rows.

## Runtime model

- **One execution instance per parent load, not per child.** The parent's `page.tsx` creates the `conversationId` (via `createInstance` / `initInstanceContext`) and passes it down. Navigating between siblings does *not* re-init — it swaps the rendered child component while the conversation and context dict persist. This is the whole point.
- **Siblings discover shared slots via the parent's `shared_context_slots`, not via peer introspection.** A child never queries "what does my sibling know"; it queries the context dict keyed by the shared-slot names the parent published. This keeps children loosely coupled.
- **Persistence:** `instanceContext` state is Redux-only today and dies with the tab. For composite apps, extend the `conversations` table (or add `conversation_context_snapshots`) so a user's parent session is restorable. Children never own persistence; the parent shell does, and only at the composite level.
- **Slot namespacing:** shared slots use the parent's declared key verbatim (`draft_text`). Child-local slots (ones the child needs but the parent does *not* promise to share) stay in the child's own `agent.context_slots` and are written as `${child_slug}__${key}` in the shared dict to avoid collisions. A child can opt a local slot into the shared namespace by listing it under `agent_app_children.writes_slots`, which promotes it to the bare key.
- **Child execution:** each child still goes through `useAgentLauncher`, passing the shared `conversationId`. The launch thunk's existing `mapScopeToInstance` resolves variables; the only new behavior is that `initInstanceContext` is skipped when the conversation already exists.
- **Leaving the parent:** the conversation survives as-is. Re-entering via `/p/[parent-slug]?cid=…` rehydrates the context dict from the snapshot and re-enters the last child.

## Migration path for existing applets

A codebase survey for live applets turned up:

- `SLUG_TO_COORDINATOR_MAP` in `features/applet/runner/AppletRunComponent.tsx` lists five hardcoded applet slugs: `core-info-generator`, `applet-description-generator`, `candidate-write-up-not-used` (self-annotated as unused), `interview-transcript-analyzer`, `lsi-variations`.
- Actual `custom_app_configs` / `custom_applet_configs` rows live in the database, not the repo, so the true live count requires a DB query before Phase 20.

Best-guess mappings (to validate against a DB dump):

| Legacy parent/applet(s) | Proposed agent-native shape |
|---|---|
| App with `core-info-generator` + `applet-description-generator` | Composite `app-ideator`; children share `app_description: text`, `core_features: json`. |
| App with `interview-transcript-analyzer` | Single agent-app (no siblings observed); port as a leaf. |
| App with `lsi-variations` | Single agent-app (no siblings observed); port as a leaf. |
| `candidate-write-up-not-used` | Drop on sunset; marked unused in the source. |

**Action before Phase 20:** run `select slug, applet_list from custom_app_configs where is_public = true` and the analogous private query; compare to the list above and fill in gaps. Each live parent becomes one `agent_apps` row with `app_kind = 'composite'`; each live child becomes one `agent_apps` row plus one `agent_app_children` link.

If the DB survey shows **no** active composite usage (only single-applet "parents"), skip the composite migration entirely — every applet becomes a plain Phase 8 agent-app and the parent shell is dropped.

## What NOT to carry over

- `SLUG_TO_COORDINATOR_MAP` — hardcoded slug→coordinator hack that only exists because child-agent binding wasn't data-driven. Obsolete under Phase 8's `agent_apps → agent_version` FK.
- `brokerMap: BrokerMapping[]` on `CustomAppletConfig` — brokers are prompt-system infrastructure; agents use variables + context slots. Do not port.
- `useAppletRecipe` / `useAppletRecipeFastAPI` dual hooks and the `isFastApiPath = useFastApi || fastApiResult.hasAgent` toggle. The agent path is the only path; the toggle is dead code the day Phase 14's dual-run ends.
- `compiledRecipeId` on `CustomAppletConfig` — recipes are dead (per 2026-04-20 DECISIONS entry). No field needed.
- `setActiveAppletId` / per-applet Redux activation. Under the new model the active child is a URL concern; Redux tracks the conversation, not the UI position.
- `AppletLayoutManager` / `ResponseLayoutManager` layout enums (`flat-accordion` et al.) that exist only because legacy applets had no standard result shape. Agent apps have structured outputs already; the composite renderer picks tab/wizard layout via `composite_layout`, not per-child overrides.

## Sunset plan for features/applet/

`features/applet/` is deprecated the moment Phase 10 ships the composite agent-app schema and the first migrated composite is live (target: end of Phase 14 dual-run). Actual deletion happens in **Phase 20**, gated on: (a) a 14-day read of `custom_app_configs` / `custom_applet_configs` write traffic showing zero active authoring, (b) every live applet from the DB survey has a mapped agent-app, (c) all `/apps/custom/[slug]/...` routes either 302 to their `/p/[slug]/...` agent-app equivalent or render a hard sunset page. Phase 20's checklist should include dropping `customAppRuntimeSlice`, `customAppletRuntimeSlice`, `AppletRunComponent.tsx`, and the entire `features/applet/` directory in a single commit, plus removing `AppletListItemConfig` and `CustomAppletConfig` types.

## Open questions for human review

1. **Composite discoverability under `/p/[slug]`.** Phase 8's public renderer assumes `slug → single agent-app`. Should composite apps live at `/p/[parent-slug]` with children at `/p/[parent-slug]/[child-slug]`, or should composites get a distinct prefix (`/c/[slug]`) to keep the Phase 8 renderer's single-app assumption intact?
2. **Conversation persistence scope.** Does a composite conversation (`instanceContext` + message history) persist per-user forever, or expire (1d / 7d / 30d) like chat conversations do elsewhere? This drives whether we extend `conversations` or build `conversation_context_snapshots`.
3. **Cross-child slot authoring ergonomics.** When a composite editor publishes, do we auto-validate that every child's required `context_slots` are covered by the parent's `shared_context_slots` (hard error), or only warn and let the author publish a composite with gaps (soft warn)?
4. **Child reuse across composites.** Do we actively promote a single `rewriter` agent-app being embedded in many composites (argues for the join table as designed), or is each composite expected to fork its children (argues for a simpler self-FK)? The join-table schema is the more permissive choice, but editor UX is easier if children are 1:1.
5. **Guest (unauthenticated) composite execution.** Phase 8 allows guest rate-limited runs on `/p/[slug]`. For composites, is the `conversationId` still minted for guests (so `draft_text` can flow across children in a single session), or are composites authenticated-only to avoid building a guest context-persistence path?

## Change log
| Date | Who | Change |
|---|---|---|
| 2026-07-15 | codex | Repaired legacy applet runtime and builder type contracts so the full repo TypeScript compiler is green; migration design and status are unchanged. |
| 2026-04-21 | claude | Expanded the stub into a self-contained design doc. Picked join table over self-FK, one shared execution instance per composite, and a `${child_slug}__${key}` namespacing rule. Logged three corresponding DECISIONS entries. No prototype code. |
