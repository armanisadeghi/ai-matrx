# Handoff — Matrx Actions / Prompt Preview: finish the WindowPanel conversion

**Repo:** `matrx-frontend` (FE) + `aidream` (backend). Both on `main`. The shared `main` is edited by many concurrent sessions — commit only your own files, expect churn.

## What already shipped (do NOT redo)
- **Matrx Actions tab** — multi-select action list (canonical `verb:noun` + built-in directives + custom free-form types), stored in `matrx_actions.actions`; apply policy in `matrx_actions.apply_policy`. Never touches the authored prompt. File: `features/agents/components/settings-management/matrx-actions/MatrxActionsTab.tsx`.
- **Runtime guidance (additive, never edits the prompt)** — the action list rides the request as `matrx_actions`; the backend renders an `## Available Matrx Actions` section into the system prompt at run time. Backend helper: `aidream/services/tooling/matrx_actions.py` (`apply_matrx_actions_guidance`; `aidream/api/utils/matrx_actions.py` is a shim) — called from `aidream/api/core/agent_run.py::prepare_agent_run` and `aidream/api/routers/chat.py::run_chat_request`. Renderer: `packages/matrx-ai/matrx_ai/instructions/core.py::_actions_guidance` (driven by `SystemInstruction.action_types`).
- **Full-prompt preview (dry-run)** — `features/agents/prompt-preview/{service.ts,types.ts,PromptPreviewModal.tsx}`. `requestPromptPreview()` reuses `assembleManualRequest` + POSTs `dry_run:true, conversation_id:null, is_new:false` to `/ai/manual`; backend runs the FULL pre-LLM assembly against an ephemeral (skip_persistence) conversation and returns the rendered system prompt + messages + tools + params as JSON. **No model call, nothing saved.** Backend: `dry_run` on `AgentStartRequest`/`ChatRequest` + `aidream/api/utils/preview.serialize_preview`.

All of the above is committed and type-clean (`pnpm type-check` — my files clean).

---

## THE UNFINISHED ITEM — convert the preview to a WindowPanel

**Problem:** the dry-run preview currently renders in a **`Dialog`** (`PromptPreviewModal.tsx`). The product owner requires the proper **WindowPanel** component (draggable/resizable/minimizable) — both for the dry-run preview AND as the surface that shows the user *where the auto-injected guidance lands* (the rendered system prompt in the preview already shows this — the guidance appears inline in the returned `system_prompt`).

### Before you touch code (MANDATORY per CLAUDE.md)
1. Invoke the **`window-panels`** skill (WindowPanel component/tray/manager).
2. Invoke the **`overlay-system`** skill (opening/registering overlays; no JSX prop spread in `OverlayController`).

### The exact pattern to mirror (a system-prompt WindowPanel already exists)
Copy the shape of these 4 touchpoints — this is a solved, repeated recipe:

| Touchpoint | Existing example to mirror | You create |
|---|---|---|
| Window component | `features/window-panels/windows/agents/SystemInstructionWindow.tsx` | `features/window-panels/windows/agents/PromptPreviewWindow.tsx` |
| Opener hook | `features/overlays/openers/systemInstructionWindow.tsx` (`useOpenSystemInstructionWindow` + `...Controller`) | `features/overlays/openers/promptPreviewWindow.tsx` |
| Catalogue metadata | entry in `features/overlays/catalogue.ts` | add `promptPreviewWindow` entry |
| Render wiring | block in `features/overlays/OverlayController.tsx` (explicit JSX props, **no spread**) | add `promptPreviewWindow` block |

`SystemInstructionWindow` is tiny — it wraps `<SystemInstructionEditor conversationId=...>` in `<WindowPanel id title onClose width height overlayId ...>`. Do the same: wrap the preview UI in a `<WindowPanel>`.

### Steps
1. **Extract the preview UI** from `PromptPreviewModal.tsx` into a reusable content component `PromptPreviewContent({ conversationId })` (the `useEffect` that calls `requestPromptPreview(store.getState(), conversationId)` + the loading/error/preview render + the copy buttons — everything currently inside `<DialogContent>`). Keep `service.ts` / `types.ts` unchanged.
2. **`PromptPreviewWindow.tsx`** — mirror `SystemInstructionWindow.tsx`: props `{ isOpen, onClose, conversationId }`, `WINDOW_ID = "prompt-preview-window"`, `OVERLAY_ID = "promptPreviewWindow"`, render `<WindowPanel ... overlayId={OVERLAY_ID}><PromptPreviewContent conversationId={conversationId} /></WindowPanel>`. Suggested size: `width={720} height={720} minWidth={480} minHeight={420}`.
3. **`openers/promptPreviewWindow.tsx`** — mirror `systemInstructionWindow.tsx` exactly (`useOpenPromptPreviewWindow()` dispatching `openOverlay({ overlayId: "promptPreviewWindow", data: { conversationId } })` + a `...Controller`).
4. **Register** in `features/overlays/catalogue.ts` + `features/overlays/OverlayController.tsx` (follow the `systemInstructionWindow` entries verbatim — the overlay-system skill lists all ~10 registration sites; a window overlay uses catalogue + OverlayController + the opener, which is what SystemInstructionWindow uses).
5. **Rewire the trigger.** `features/agents/components/inputs/smart-input/RunControlsTabPanel.tsx` currently renders `<PromptPreviewModal ... open={previewOpen} .../>` with local state in the **creator tab** ("Preview full prompt" button). Replace it with the opener hook — the file already uses `useOpenChatDebugWindow` / `useOpenAgentMemoryWindow` the same way (imports at ~lines 68-69). So: `const openPreview = useOpenPromptPreviewWindow();` and the button's `onClick={() => openPreview({ conversationId })}`. Remove the `previewOpen` local state + the `<PromptPreviewModal>` mount.
6. **Delete `PromptPreviewModal.tsx`** (the Dialog wrapper) once the window replaces it — no shims, no dead file (house rule). Keep `PromptPreviewContent`, `service.ts`, `types.ts`.
7. `pnpm type-check` clean; then verify (below).

---

## Secondary items (list them, do them if time; #A is quick verification)

**A. E2E-verify the runtime Matrx Actions guidance (only backend-unit-tested so far).** Local dev + login (`admin@admin.com` / `Password1234#`). Agent builder → **Model Settings → Matrx Actions** → add several actions incl. a custom one (e.g. `create:task`, `create_project_with_tasks`, `create:invoice`). Then run-controls (gear) → **creator tab → Preview full prompt** → the returned **system prompt** must contain an `## Available Matrx Actions` section listing all of them, and your **authored system prompt text must be unchanged** (open the System message — it should NOT contain the guidance). Confirms additive runtime injection end-to-end. (Backend requires the aidream changes deployed/running locally.)

**B. Saved-agent path parity (optional).** The runtime guidance is wired on both the manual/draft path (`run_chat_request`, what the builder + preview use) and the saved-agent path (`prepare_agent_run`). If you touch it, keep both in sync via the shared `apply_matrx_actions_guidance`.

## Known related bug — NOT part of this feature (flagged by owner, separate ticket)
There is a **save-on-run bug**: editing an agent and running it auto-persists the draft even though the UI shows unsaved/dirty (the Run action calls `useAgentSaveAction`/`saveAgent`). This is unrelated to Matrx Actions (the draft/`config_overrides` + preview paths do NOT save), but it's the reason physical prompt-injection was catastrophic before it was removed. Owner will decide when to fix; do not fold it into this handoff's work unless asked.

---

## Fast facts
- Preview reachable today via `RunControlsTabPanel` creator tab (still a Dialog).
- No output_schema coupling anymore; do NOT reintroduce single-action logic.
- Backend `SystemInstruction.action_types` (a **list**) is the guidance input — already supports many actions.
- Feature doc + change log: `features/agents/FEATURE.md` (search "Matrx Actions = multi-select") — update its "TODO: move the preview from a Dialog to a WindowPanel" line when done.
