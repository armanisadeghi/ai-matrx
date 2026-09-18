# Content refinement

Shared content preparation before saving to notes, tasks, message templates, or context values.

## Contract

- `useRefinableContent` owns the source, thinking-block removal, trim counts, and edit override. Trimming derives from the original source; changing a transform invalidates the prior edit override.
- `RefinableContentEditor` composes the toolbar, two `TrimControl` instances, and `NoteEditorCore`. `SetContextValueCore` uses the same trim control while retaining its destination-specific workflow.
- `TrimControl` exposes a full-range slider, progressively zoomed precision range, persistent one-character chevrons, and an exact numeric input. Zoom changes the visible range without changing the trim count. Keyboard arrows nudge one character; Home/End reach the full bounds.
- Trim counts retain the existing JavaScript string-offset semantics. A large numeric range is supported by the control; this is not a guarantee that the rich editor can render a 100-million-character document.
- A start/end adjustment requests that edge in the editor and preview. User scroll input releases that request. Embedded refinement removes full-page bottom padding so the last retained text remains visible.
- Rich edit-overlay invalidation must reset the rendered content, not remount the split editor's scroll containers. Preserve `contentResetKey` when changing `MatrxSplit`.

## Consumers

- Notes: `features/notes/actions/quick-save/QuickNoteSaveCore.tsx`
- Tasks: `features/tasks/widgets/quick-create/TaskQuickCreateCore.tsx`
- Message templates: `features/message-templates/quick-save/QuickMessageTemplateSaveCore.tsx`
- Context values: `features/scopes/actions/quick-assign/SetContextValueCore.tsx`

## Change log

- 2026-09-18 — Consolidated trim controls, added coarse/fine adjustment and visible exact nudges, and made preview scrolling follow the trimmed edge.
