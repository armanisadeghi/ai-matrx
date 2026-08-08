---
status: active
updated: 2026-08-08   # bindings live-verify complete
repos: [matrx-frontend, aidream]
vision: []   # vision was given in-session; captured verbatim below
---

# Context Lens + Server-Truth Context Preview

One control (`ContextLensBar`) that shows/edits the active context AND opens a
non-blocking panel proving exactly what the agent will receive — resolved by
the server through the same code path a real run uses.

## Vision — Arman's words

On the control (one component, two functions):
> "design it so that the context view part wraps it and becomes part of it so
> that we can render the two as a single component … nice and condensed … the
> word 'Context' can also double as an intro into what the component is, but
> clicking that part will also allow you to see what exactly the agent is going
> to get as context as a result of your current settings."
> "take the lens chip component and create a new version of it that gives us
> two options as a single beautiful component" — no attached-looking segments,
> no internal border.

On the API (the load-bearing requirement):
> "an API endpoint that takes a selection — whether it's an organization,
> organization plus scope type, or down to a specific scope with context items —
> and returns a response that shows exactly what will happen … not an API that
> tries to recreate or approximate the same concept independently, but one that
> ensures it is returning the exact same data and structure that will actually
> be used." Scenarios: org only · org + scope type · specific scope · context
> items spanning multiple scopes.

On the panel:
> "needs to use our adjustable, non-blocking MatrxDynamic Panel … the contents
> of it need to make it very clear to the user what the model is going to be
> seeing." Blocking side sheets are banned here.
> Showing auto-injected AND directly-set context "would be nice … possibly a
> tabbed structure but … that's not the priority for now. The biggest priority
> is to get and display the exact resolution system."

Design bar (second round): ZERO dim/disabled-looking walls of muted text — use
our semantic colors (primary touches) so it feels alive; no nested scroll areas
(the injected block auto-grows; only the panel scrolls); a hovering canonical
copy control (`InlineCopyButton`, copy → green check) on everything shown;
descriptions are fragments or absent.

## Resources

- Panel + hook: `features/agents/components/context-preview/` —
  `ContextPreviewPanel.tsx`, `AttachedContextSection.tsx`, `useContextPreview.ts`.
- Control: `features/scopes/components/active-context/ContextLensBar.tsx`
  (composes `ActiveContextLensChip` → `LensChip`, the canonical T2 face).
  **Current host: `PlusAttachMenu.tsx`** (`features/agents/components/inputs/smart-input/`)
  — a later session moved it out of `ConversationContextRail` into the `+`
  attach menu; a sibling `ComputeLensBar.tsx` copies the pattern.
- Overlay: id `contextPreviewPanel` (singleton, `isWindow:false`) — registered in
  `features/window-panels/registry/overlay-ids.ts`, `features/overlays/catalogue.ts`,
  `features/overlays/OverlayController.tsx` (SidePanelSurface block), opener
  `features/overlays/openers/contextPreviewPanel.tsx`. Invoke the
  `overlay-system` skill before touching registration.
- Server: `POST /ai/context/preview` — `aidream/api/routers/context_preview.py`
  (mounted under `/ai` in `aidream/api/app.py`). **DEPLOYED to prod** (path is in
  `https://server.app.matrxserver.com/openapi.json`). It calls the exact run-path
  functions: `resolve_agent_context_block` (`conversation_context/context_utils.py`),
  `build_agent_context` (`packages/matrx-ai/matrx_ai/context_engine.py` → the
  `resolve_full_context` RPC), `resolve_scope_bindings`
  (`conversation_context/scope_binding_resolution.py`). Docs:
  `aidream/services/conversation_context/FEATURE.md`.
- Types: generated `ContextPreviewRequest/Response` in
  `types/python-generated/api-types.ts`; regen against local server with
  `pnpm sync-types:fast` (aidream on :8000). Never hand-mirror.
- Test: dev server + one-shot login
  `http://localhost:3050/api/dev-login?token=matrx-dev-a2990c472f1cae47864bb936&next=/chat`
  (any dev port works — `pnpm dev:status`). In a conversation, open `+` →
  ContextLensBar → eye/"Context". Sidebar admin toggle "Switch to localhost"
  points the FE at a local aidream. Seed org "Castellano & Reyes, LLP" has
  scopes with cells (CSV Pharmacy / Golden State share keys — good collision demo).
- Related docs: `features/scopes/FEATURE.md` (resolution model, Surface A),
  `features/agents/components/chat/FEATURE.md`, `features/overlays/FEATURE.md`.

## Remaining work (priority order)

1. **Declare the `matrx-user/context-preview` surface** — chipped: the panel has
   no surface manifest (COMPLETENESS LAW gap). Pattern: `inheritsFrom:
   "matrx-user/chat"`, see `assistant-message.manifest.ts`.
2. **Canvas rung 6 (ambassador)** — the panel is only reachable from the chat
   composer's `+` menu. Candidate additional hosts: agent run pages, shortcut
   launch surfaces, the RunControls Context tab.

## Done

- Bindings section live-verified 2026-08-08 — standing test asset: agent
  "Context Binding Test Agent" (`agent.definition` id
  `02894aa7-18c5-4b51-901a-91118442dce4`, Castellano & Reyes org): two
  `ctx_item`-bound variables on the clients scope type (`client_type` with
  `onMissing:"error"`, `claims_administrator`) + one bound context slot
  (`client_primary_contact`). Verified in `/chat/a/<id>`: CSV Pharmacy and
  Golden State each render their own scope-filled values in "Agent variable &
  slot fill"; deselecting the Client scope renders the loud 422
  `ScopeBindingUnresolved` "Preview unavailable" state with the server detail.

- Endpoint built + DEPLOYED to prod — `aidream/api/routers/context_preview.py`; panel re-verified against prod 2026-08-08.
- Panel + overlay + hook + `ContextLensBar` built — `features/agents/components/context-preview/`; lens bar hosted in `PlusAttachMenu` ("Chat Options" `+`).
- Attached tab itemizes every always-sent wire leg (resources / variables / memory / tools) with per-item remove via the composer's own actions; touch-visible copy buttons; Copy-all-for-AI in the Resolved strip (branch `claude/context-preview-catchup`, PR #51; identical commit `450a2c244` also sits additively on `claude/wave-a-finish` after a shared-worktree branch switch).
- Blocking `AgentSeesSheet` deleted; browser-verified org-only / org+scope / two-scope collision / live refetch.

## Decisions needed (Arman)

- **Scope-TYPE-only selections.** Situation: selecting an org + a scope type
  (no specific scope) changes nothing server-side — run requests carry only
  `scope_ids`, so the preview truthfully shows just the org overview. Decide:
  is that the intended meaning of a type-only selection, or should type-only
  selections influence what the server injects (e.g. render that type's
  scope_type tier)? If the latter, the run path must change first — the preview
  only mirrors it.
