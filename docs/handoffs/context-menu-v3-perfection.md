---
status: active
updated: 2026-07-21
repos: [matrx-frontend]
vision: [features/context-menu-v3/FEATURE.md]
---

# Context Menu v3 — perfection pass (one menu, inline agent editing, consolidation)

## Vision — Arman's words

- 2026-07-19: "annihilating the v2 stuff and deleting all of that code would actually be a really nice thing to do… I want all old stuff gone."
- 2026-07-21: "I want to confirm now that this is the ONLY context menu we have and that there are not other variations." … "work with you to perfect it but you will need to update the demo pages to give me a real idea of what the core basics offer and then what is customized per route, etc." … "We need to significantly improve the structure to reduce the size and to make it easier to work with."
- On inline editing (the most important v1 feature to restore): "the feature where we edit content inline on the clientside. We can achieve this in two ways: 1) create a client-tool (if we don't already have one) that will get delegated to us from the server so we can do the streaming visualization inline and update the live content. 2) Alternatively, we can use the same xml format we've used before." — The client-tool path was chosen and built (the WidgetHandle channel already existed; XML stays dead). (inferred: the "streaming visualization" half — showing the edit happening visually beyond the text simply changing — has had no explicit design pass yet.)
- Process: "We are in rapid development mode… when we see changes, we wanna get them. And when we're at a good point, we wanna push them live… always pulling the latest code from remote as well." Multiple agent sessions commit/push concurrently in this checkout — gather, pull --rebase, push; don't treat foreign working-tree changes as a conflict.

## Resources

- Contract + architecture: `features/context-menu-v3/FEATURE.md` (load tiers incl. the T1e engine, inline-editing section, **Consolidation backlog** with the full bespoke-menu inventory).
- The engine: `features/context-menu-v3/hooks/useContextMenuActions.ts` — ALL behavior; renderers (`components/MenuContent.tsx`, `components/MobileMenuContent.tsx`) are presentation only.
- Inline edit wire: `features/context-menu-v3/utils/widget-handle.ts` (+ shell registration in `ContextMenuV3.tsx`), `features/agents/hooks/useWidgetHandle.ts` (`useOptionalWidgetHandle`), channel docs `features/agents/components/tools-management/CLIENT_SIDE_TOOLS.md`, working reference `features/code-editor/agent-code-editor/hooks/useCodeEditorWidgetHandle.ts`.
- Skills: `context-menu-v3` (surface rollout recipe), `agent-execution-redux` (launch/runtime contract).
- Test: log in at `/login` (admin@admin.com / Password1234#), demos at `/demos/context-menu` (hub has the core-vs-per-surface guide) and `/demos/context-menu/inline-edit` (live inline-edit proof page with applied-edits log).
- Environment trap: dev servers on this volume repeatedly crash or WEDGE mid-compile (`Interrupted system call` reading node_modules; one route "Compiling…" for 10+ min while the whole server stops responding) — 2026-07-21, across several sessions. Use `.claude/launch.json` `next-dev-qa2` (port 3011, own distdir); `pnpm clean:next` clears stale alternate build dirs. If it wedges, prefer verifying on the auto-deployed prod/demos Vercel builds instead of fighting it.

## Remaining work

1. **Verify inline editing end-to-end in the browser** — the only unproven link, and Arman now has a FAILING PROD REPRO (2026-07-22, www.aimatrx.com `/demos/context-menu/inline-edit`): the model DID call `widget_text_replace`, but the tool-call capture shows `isDelegated: false` + server error `missing_context` ("needs a mutable 'widget_content' context object") — i.e. the request reached aidream with NO client-tool registration, so the server ran its own widget tool instead of emitting `tool_delegated`. Prod predates `4a7e9eea4` (handle-lifecycle fixes), so first release + retest; if it still fails, the handle id isn't surviving to `build-tool-injection.ts` assembly. A purpose-built agent exists for retests: **"Inline Widget Editor"** (`agent.definition c4adab96-fac5-4f75-90f9-e8d5eb2c200d`, prompt mandates widget-tool edits). On `/demos/context-menu/inline-edit`: right-click → Agents → pick one → ask "fix the typos" → confirm the textarea updates live and edits land in the log. Menu render + agent listing already verified; the agent-stream leg was blocked only by the dev-server crashes above. If the model never calls `widget_text_*`, check the request's `client_tools` (assembled per-turn in `features/agents/redux/execution-system/utils/build-tool-injection.ts` from the handle) and whether the agent's prompt needs a nudge about the tools.
2. **Bespoke-menu consolidation campaign** — files menus + ItemContextMenu DONE (2026-07-22); next up: notes-legacy shell, rich-document own menu, code trees, coordinate menus, markdown-block menus. Inventory + status in `FEATURE.md` → "Consolidation backlog". Row-menu pattern: keep exports/props, swap internals to v3 extraSections (files + ItemContextMenu are exemplars).
3. **Act on agent.review_queue feedback** — three rows registered 2026-07-21 (inline-edit demo, hub guide, PDF region menu). When Arman reviews, handle `changes_requested`/`approved` per the `agent-review-queue` skill and update the rows.
4. **Planned demo pages** (registry cards exist, hidden from nav): `surface-mappings` (resolve agent×surface×scope → value_mappings live) and `launch-inspector` (fire a shortcut with a hand-crafted scope, inspect the assembled request). `app/(dev)/demos/context-menu/_registry.ts`.
5. **(inferred) Streaming edit visualization** — today an inline edit just changes the text. If Arman wants the v1-style "watch it stream in" affordance (highlight the patched range, pulse on apply), design it in the demo page first, then generalize.

## Done

- v2 annihilated; v3 is the only universal menu — see `features/context-menu-v3/` + FEATURE.md changelog 2026-07-19.
- Dead v1/v2-era pockets deleted (GlobalContextMenu/version-two, ContextMenuProvider, ui/context-menu example variants).
- One shared engine extracted (`hooks/useContextMenuActions.ts`); renderers are presentation-only.
- Inline agent editing wired platform-wide for editable surfaces (shell WidgetHandle + `runtime.widgetHandleId`); demo page shipped.
- Demo hub rewritten as the core-vs-per-surface guide; bespoke-menu inventory documented as the consolidation backlog.
- Full bespoke/context-menu inventory swept 2026-07-21 (results in the FEATURE.md backlog).
- PDF region right-click menu finished (the abandoned 2026-05-11 build) — `features/file-analysis/components/RegionContextMenu.tsx`, wired in StudioShell + PdfEditTab; extract/promote/redact/delete live. First caller of `promoteAnnotationToEntity`.
- Adversarial multi-agent review run on the engine + widget-handle work; 4 confirmed defects fixed (handle-lifetime ownership in destroyInstance, controlled-field native-setter writes, shell render purity, demo insert semantics) — commit 4a7e9eea4.
- Review-queue rows registered for the three reviewable surfaces (agent.review_queue, source ai-matrx).

## Decisions needed

*(none — all open items have a clear best-practice path)*
