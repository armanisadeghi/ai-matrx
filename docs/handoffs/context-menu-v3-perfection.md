---
status: active
updated: 2026-07-28
repos: [matrx-frontend]
vision: [features/context-menu-v3/FEATURE.md]
---

# Context Menu v3 — perfection pass (inline agent editing)

## Vision — Arman's words

- 2026-07-19: "annihilating the v2 stuff and deleting all of that code would actually be a really nice thing to do… I want all old stuff gone."
- 2026-07-21: "I want to confirm now that this is the ONLY context menu we have and that there are not other variations." … "work with you to perfect it but you will need to update the demo pages to give me a real idea of what the core basics offer and then what is customized per route, etc." … "We need to significantly improve the structure to reduce the size and to make it easier to work with."
- On inline editing (the most important v1 feature to restore): "the feature where we edit content inline on the clientside. We can achieve this in two ways: 1) create a client-tool (if we don't already have one) that will get delegated to us from the server so we can do the streaming visualization inline and update the live content. 2) Alternatively, we can use the same xml format we've used before." — The client-tool path was chosen and built (the WidgetHandle channel already existed; XML stays dead).
- Process: "We are in rapid development mode… when we see changes, we wanna get them. And when we're at a good point, we wanna push them live… always pulling the latest code from remote as well." Multiple agent sessions commit/push concurrently in this checkout — gather, pull --rebase, push; don't treat foreign working-tree changes as a conflict.

## Resources

- Contract + architecture: `features/context-menu-v3/FEATURE.md` (load tiers, inline-editing section, consolidation inventory).
- The engine: `features/context-menu-v3/hooks/useContextMenuActions.ts` — ALL behavior; renderers (`components/MenuContent.tsx`, `components/MobileMenuContent.tsx`) are presentation only.
- Inline edit wire: `features/context-menu-v3/utils/widget-handle.ts` (+ shell registration in `ContextMenuV3.tsx`), `features/agents/hooks/useWidgetHandle.ts`, per-turn assembly in `features/agents/redux/execution-system/utils/build-tool-injection.ts`, channel docs `features/agents/components/tools-management/CLIENT_SIDE_TOOLS.md`, working reference `features/code-editor/agent-code-editor/hooks/useCodeEditorWidgetHandle.ts`.
- Skills: `context-menu-v3` (surface rollout recipe), `agent-execution-redux` (launch/runtime contract), `agent-review-queue`.
- Test: log in at `/login` (admin@admin.com / Password1234#), demos at `/demos/context-menu` (hub = core-vs-per-surface guide), `/demos/context-menu/inline-edit`, `/demos/context-menu/surface-mappings`, `/demos/context-menu/launch-inspector`.
- Retest agent: **"Inline Widget Editor"** — `agent.definition c4adab96-fac5-4f75-90f9-e8d5eb2c200d` (prompt mandates widget-tool edits). Diagram-side sibling: `bdaf5ee0-…`.
- Environment trap: dev servers on this volume repeatedly crash or WEDGE mid-compile (`Interrupted system call` reading node_modules; a route "Compiling…" for 10+ min). Use `.claude/launch.json` `next-dev-qa2` (port 3011, own distdir); `pnpm clean:next` clears stale build dirs. If it wedges, verify on the auto-deployed Vercel build instead.

## Remaining work

1. **Verify inline editing end-to-end in the browser** — the only unproven link. Arman's prod repro (2026-07-22, www.aimatrx.com `/demos/context-menu/inline-edit`): the model DID call `widget_text_replace`, but the capture showed `isDelegated: false` + server error `missing_context` ("needs a mutable 'widget_content' context object") — the request reached aidream with NO client-tool registration, so the server ran its own widget tool instead of emitting `tool_delegated`. That repro predates the handle-lifecycle fixes (`4a7e9eea4`), which are now on main and released — so retest first. If it still fails, the handle id isn't surviving to `build-tool-injection.ts` assembly; check the request's `client_tools`. Repro: right-click → Agents → "Inline Widget Editor" → "fix the typos" → the textarea must update live and the edit must land in the applied-edits log.
2. **Act on `agent.review_queue` feedback** — 11 rows from this campaign are still `pending` (verified in DB 2026-07-28); none have verdicts yet except the PDF row, whose feedback ("none of them are working correctly… I want an agent to go through this with me in detail") is owned by `docs/handoffs/pdf-features-fix-session.md`. When Arman reviews, handle `changes_requested`/`approved` per the `agent-review-queue` skill.
3. **(inferred) Streaming edit visualization** — today an inline edit just changes the text. If Arman wants the v1-style "watch it stream in" affordance (highlight the patched range, pulse on apply), design it in the demo page first, then generalize. No design pass has happened.

## Done

- v2 annihilated; v3 is the only universal menu; dead v1/v2 pockets deleted — `features/context-menu-v3/` + FEATURE.md changelog 2026-07-19.
- One shared action engine extracted; renderers are presentation-only — `hooks/useContextMenuActions.ts`.
- Inline agent editing wired platform-wide for editable surfaces (shell WidgetHandle + `runtime.widgetHandleId`) + demo page.
- Bespoke-menu consolidation campaign COMPLETE 2026-07-22 — files, ItemContextMenu, rich-document (ContextMenuMount + variants/ContextMenu deleted), code trees, user-lists, transcript/task/profile blocks, json-explorer, processor-extractor all on v3. Deliberate exceptions: notes-legacy shell menus (die with legacy NotesLayout) and PDF region plumbing polish.
- PDF region right-click menu finished — `features/file-analysis/components/RegionContextMenu.tsx`.
- Demo pages shipped + browser-verified: hub guide, `surface-mappings`, `launch-inspector`.
- Adversarial multi-agent review; 4 defects fixed — commit `4a7e9eea4`.

## Decisions needed

*(none — all open items have a clear best-practice path)*
