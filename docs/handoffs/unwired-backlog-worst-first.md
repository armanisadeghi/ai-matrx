# Handoff — the unwired backlog, worst-first

**Owner:** unclaimed · **Opened:** 2026-08-14 · **Scoreboard:** `/administration/reporting/unwired`
**Governing law:** `/Users/armanisadeghi/code/common-docs/policies/unfinished-work-alarm.md` — nothing on this
page may be deleted, dropped, or "cleaned up" on an agent's authority. Finish it, or report what finishing takes.

`pnpm check:unwired` reports **981 findings** after the 2026-08-14 detector pass (was 1,270; the 289-finding
drop was four false-positive *categories*, not triage — see `scripts/unwired/FEATURE.md` § Change Log).
This doc carries the intent hunt already done on the largest items so the next builder does not repeat it.

## Done — wired 2026-08-14

- **`AgentExecutionDebugPanel`** (777 lines) → mounted from `components/debug/DebugIndicatorManager.tsx`.
  It is the strict superset successor of `PromptExecutionDebugPanel` (589 lines): same execution-system
  selectors, same `onClose` contract, ten sections vs six (adds streaming, model-settings,
  assembled-request, ui-state). `instanceId` is the same value `adminDebugSlice` stores as `runId`.
- **`TransformableCard` + `EnhancedDraggableCardBody`** (430 + 337 lines) → mounted from the new
  `/demos/draggable-cards` page. Their only consumer had been a `(legacy)` route that died with the group.

## Dispatched — briefs 1, 3, 4, 5, 6, 7, 9 are live chips

Briefs 3, 4, 5, 6, 7 and 9 below, plus the aidream `module-unreached` scope fix, were handed to focused
sessions on 2026-08-14. Check with Arman before starting one of them from this page — you may be the second
agent on it. Briefs 1 and 2 remain unclaimed and need a written ruling from Arman rather than code.

## Briefs — real remaining work

Each brief is self-contained; paste one into a session and it can be worked without this page.

### 1. `PromptExecutionDebugPanel` — superseded predecessor, needs Arman's ruling
`components/debug/PromptExecutionDebugPanel.tsx` (517 lines). Was the only mount in
`DebugIndicatorManager` until 2026-08-14, when its superset successor `AgentExecutionDebugPanel` took the
slot. It is now finished-and-superseded, not unfinished. **What's missing:** a decision. Either Arman names
it dead in writing (then delete it and its `adminDebugSlice` remnants), or it earns a second debug slot.
Do not delete on your own authority.

### 2. `TerminalTab` — xterm terminal replaced by `SimpleTerminal`
`features/code/terminal/TerminalTab.tsx` (625 lines). `SimpleTerminal`'s own docblock records why: the
streaming `/exec/stream` path silently produced no output when the SSE stream completed with zero events,
so the buffered `/exec` endpoint won. `BottomPanel` → `SessionsHost` → `SimpleTerminal` is the live chain.
**What's missing:** either a working PTY upgrade end-to-end (`SandboxProcessAdapter.openPty` + a proxy that
can complete the 101 handshake off Vercel) so xterm can be reattached, or Arman's written call. Doc lie
corrected in `features/code/SYSTEM_STATE.md` §1.5 on 2026-08-14.

### 3. `LinkAgentToShortcutModal` — never-consumed Phase-1 build
`features/agent-shortcuts/components/LinkAgentToShortcutModal.tsx` (483 lines). Textbook rung-2 death:
`features/agents/migration/phases/phase-01-agent-shortcuts-foundation.md` states outright *"No routes
mounted; Phases 11/12/13 will consume."* Those phases never landed. **What's missing:** the shortcut
management surface that opens it. Before building one, run the Inventory Law — `features/agent-shortcuts/`
already ships `ShortcutList` / `ShortcutForm` / `DuplicateShortcutModal` with the same `ScopeProps`
contract, and `AddToSetDialog.tsx:96` cites this modal as its shape reference.

### 4. `TaskDetailPage` + `TaskContent` — a second tasks detail UI
`features/tasks/components/TaskDetailPage.tsx` (778) and `TaskContent.tsx` (338). `/tasks/[id]` renders
`TaskEditor`, not these. Both are still maintained — the 2026-08-12 label-vocabulary change lists
`TaskDetailPage` among its six updated import sites, so agents keep paying upkeep on an unreachable screen.
**What's missing:** a capability diff of `TaskDetailPage` vs `TaskEditor`. Anything the detail page has and
the editor lacks gets ported into `TaskEditor`; then Arman rules on the shell.

### 5. `TranscriptionLanding` — landing superseded by the entry list
`features/transcript-studio/components/landing/TranscriptionLanding.tsx` (528 lines). `FEATURE.md`
2026-05-22 describes it as the page linking Studio / Processor / Mobile Capture; `/transcripts` was then
rebuilt as the canonical entry list. **What's missing:** the three-surface wayfinding it carried has no home
on the list page. Port it as a header/empty-state affordance on `/transcripts` (feature entry pages are
LIST views — do not restore a forced landing), then rule on the file.

### 6. `features/content-manager/PageListView` — stranded fork of a live CMS component
`features/content-manager/components/PageListView.tsx` (393 lines) is the only file in
`features/content-manager/`. `features/cms/components/PageListView.tsx` is mounted at `/cms/[siteId]` and
declared on the CMS admin map. **What's missing:** a diff of the two. Merge anything the fork has into the
live CMS component (reuse-first: extend ours, never keep a second), then rule on the stranded directory.

### 7. `NotesLayout` + `NotesTreeView` — the legacy notes shell
`features/notes/components/NotesLayout.tsx` (431), `features/notes/actions/NotesTreeView.tsx` (287).
`features/notes/FEATURE.md` 2026-07-10 records the deliberate migration of Utilities + Quick Notes to the
canonical `NotesView`, and 2026-06-24 already names the canonical stack "a strict superset". The
`/demos/notes-salvage` page now only *mentions* `NotesLayout` in prose — it does not render it, so the
FEATURE.md claim that it renders there is stale. **What's missing:** confirm the superset claim item by
item (the 2026-06-24 entry names RAG indexing, sidebar drag-edge auto-scroll, mobile New Folder, and the
declarative single/split frame as salvage targets), land the survivors on `NotesView`, then rule.

### 8. `TransformableCard` / `EnhancedDraggableCardBody` — DONE 2026-08-14
Their only mounter was `/legacy/demo/component-demo/draggables/transformable-cards-demo`, which died with
the `(legacy)` route group. `app/(dev)/demos/draggable-cards/page.dev.tsx` now mounts both under
`DraggableCardProvider`, exercising free drag + pill collapse, snap points, drop-container assignment, and
live position state.

### 9. `useVoiceChatWithAutoSleep` + `useVoiceChatCdn` — unclaimed TTS voice-chat hooks
`hooks/tts/useVoiceChatWithAutoSleep.ts` (366), `hooks/tts/useVoiceChatCdn.ts` (314). Not yet hunted.
**Before touching:** read `features/audio/FEATURE.md` and the Cartesia token primitive rule — there is ONE
sanctioned auth path (`accessToken.ts` + `connectCartesiaTts`), so any wiring must go through it and must
not become a second connection path.

## Category false positives — fixed in the scanner, not allowlisted

Recorded here because the same shapes will recur: directory-name exclusions hiding real mounters,
intra-module singleton factories, components consumed by call or as a registry value, and SCREAMING_SNAKE
constants classified as components. Details and tests: `scripts/unwired/FEATURE.md`.

Genuinely allowlisted (5 rows, all one class): `features/agent-apps/sample-code/apps/*` — reference source
for user-authored agent apps; the runtime compiles the equivalent source from the database.

Still reported but **not** unfinished: `aidream/services/runtime/workflow_ab.py` (598 lines) has two
documented consumers (`scripts/run_seo_workflow_ab.py`, `scripts/run_knowledge_workflow_ab.py`) and two
test modules. aidream's `module-unreached` rule reaches only from *server* entry points, so an operator CLI
harness is invisible to it. Fixing that belongs in `aidream/scripts/check_unwired.py`; it is already
tracked in aidream's `FOUND_DEFECTS.md` row 11.
