---
status: active
updated: 2026-07-28
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

1. **Re-verify against prod.** `POST /ai/context/preview` is confirmed live
   (present in `https://server.app.matrxserver.com/openapi.json`; `76934c9b9`
   is an ancestor of the SHA prod reports at `/health/version`), but the only
   browser pass ran against local aidream. Open the panel with the FE on the
   prod backend; confirm block + variables render and errors don't fire. Trap:
   the panel errors LOUDLY by design — an error state here is signal, not styling.
2. **Live-verify the bindings section.** `bindings` renders only when an agent
   with scope-bound variables/slots is active; no visible agent had any, so the
   UI section has never displayed real data. Create/use an agent with a
   `ctx_item` binding, open the panel with that agent, verify "Agent variable &
   slot fill". The 422 `ScopeBindingUnresolved` path is code-verified only.
3. **Itemize the always-sent baseline** in the Attached tab: attachments/resource
   payloads (`resourcePayloads` in
   `features/agents/redux/execution-system/thunks/execute-instance.thunk.ts` ~L140-152),
   `request.variables`, observational memory (~L202-229), injected tool defs.
   These are often the biggest part of what the agent sees.
4. **Make items actionable** — per-item remove (X) in the Attached tab, reusing
   the rail's `removeContextEntry` / `setConversationDocumentEnabledThunk`.
   See it, then control it.
5. **Copy-button hover check on touch.** Hover-revealed `InlineCopyButton`s are
   invisible until hover; add `pointer-coarse:opacity-100` (pattern:
   `RailPill` in `ConversationContextRail.tsx`).

## Done

- Endpoint built + deployed — `aidream/api/routers/context_preview.py` (aidream `76934c9b9`).
- Panel + overlay + hook built — `features/agents/components/context-preview/` (FE `a86cfa209`, `01a97bb9e`).
- `ContextLensBar` built (single T2-style pill) — later rehomed to `PlusAttachMenu` by a concurrent session.
- Blocking `AgentSeesSheet` deleted; its content lives on as the Attached tab.
- Browser-verified against LOCAL aidream: org-only, org+scope, two-scope
  collision, live refetch on selection change, Attached tab.

## Decisions needed (Arman)

- **Scope-TYPE-only selections.** Situation: selecting an org + a scope type
  (no specific scope) changes nothing server-side — run requests carry only
  `scope_ids`, so the preview truthfully shows just the org overview. Decide:
  is that the intended meaning of a type-only selection, or should type-only
  selections influence what the server injects (e.g. render that type's
  scope_type tier)? If the latter, the run path must change first — the preview
  only mirrors it.
