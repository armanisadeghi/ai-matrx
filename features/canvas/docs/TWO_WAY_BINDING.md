# Two-way binding — artifacts ⇄ editable surfaces

**Status:** EXPORT (forward) leg LIVE · EDIT registry-driven (mermaid + code) LIVE · UNBIND LIVE (chat + notes, inertness-gated).
The design for how content that became a living artifact stays *ownable as text*: users must never feel their note/chat content got trapped inside an object they can't read or take back.

## The model

Once a block materializes (`materializeBlocks.ts`), the **artifact row is the durable record** and the surface holds only a reference: the standard R1 text form `<artifact type id version title>body</artifact>` (`artifactWire.ts#wrapArtifactText`), written via the caller's `persistRewrite`. Three ways out of (or around) that binding:

| Path | What it is | Status |
|---|---|---|
| EDIT | change the artifact through its own editor; every ref updates | LIVE for mermaid + code (registry `userEditable`); other types when they get editors |
| EXPORT | read the artifact back as clean markdown (copy/share) — non-destructive | **LIVE** |
| UNBIND | replace the ref with the markdown export; surface owns plain text again | **LIVE** — `unbindArtifact.ts`, inertness-gated |

## (a) EDIT — artifacts stay the source of truth

- Surfaces NEVER edit the inline body (the UI ignores it once a real UUID is present — R3, `isMaterializedArtifactId`). Edits go through the artifact's own editor/adapter.
- Persist edits as **new versions** via the existing canvas version RPC `cx_canvas_save_user_version` (`canvasArtifactService.saveUserVersion`) — version rows are never overwritten. `content` accepts a string OR a structured value object (a NEW zero-loss `content.data` object carrying `__kind` — never mutate the prior version's object in place).
- Refresh propagation exists and is generic: editors dispatch `CANVAS_ITEM_UPDATED_EVENT` + `invalidateCanvasItemCache` (`hooks/useCanvasItem.ts`); any mounted ref of the chain refetches.
- **`ArtifactTypeDef.userEditable` is the ONE edit switch** (`artifact-type-registry.ts`): flagged types resolve refs `{ resolve: "latest" }` in `ArtifactRefBlock` (registry-driven — no per-type hard-codes) and `ArtifactVersionHistory` is the browse/restore surface. **Flag a type only when its editor actually exists and saves versions** — today: `mermaid` (MermaidWorkbench → `useMermaidArtifactSave`) and `code` (attach-as-editable-context + aidream `canvas_item` writeback). Guard: `userEditable resolution` tests in `materialization/__tests__/unbindArtifact.test.ts`.
- Interactive per-viewer STATE (quiz answers, study progress) is not EDIT — it goes to `canvas_item_state` via `useArtifactState` / the persistence adapters.

## (b) UNBIND — "give me my text back" (LIVE)

Primitive: **`features/canvas/materialization/unbindArtifact.ts`** — replaces every `<artifact id>` tag of the artifact's version CHAIN in the source content with `exportArtifactMarkdown(latest).markdown`, persisted through the same owner-checked `persistRewrite` the materializer used (chat: `cx_message_set_content` — status-preserving, archives the prior body to `content_history`).

Semantics (enforced by the primitive + its tests — change them only with this doc):
- **The artifact row is KEPT, orphaned — not soft-deleted.** The same id can be referenced from other surfaces, `canvas_item_state` and adapter-linked domain records hang off it, and it stays discoverable in the canvas library. Deleting it is a separate, explicit user action.
- **Per-reference, not per-artifact** — detaches THIS surface only.
- **Latest chain version exports** — user edits made after materialization survive the detach.
- **Inertness is checked mechanically, not by type allowlist:** the replacement markdown runs through `planMaterialization`; if it would plan ANY artifact, unbind refuses (`reason: "not_inert"`) — no re-materialize loop on the next reconcile pass. Structured-kind prose exports pass; `code` passes (re-fenced with its stored language — bare code fences never auto-materialize); fences that re-detect (mermaid/html/svg/chart/react) refuse and stay EDIT/EXPORT-only until a materialization-skip marker exists.
- **Loud, reversible-by-history:** a failed rewrite aborts (never a dangling half-state), mirroring the materializer's abort invariant. **Known asymmetry (2026-07-15 adversarial review):** the CHAT path is atomic (one RPC, abort-clean), but the NOTES path is optimistic — `applyContent` flips the local editor text before `saveNote` resolves, so a rejected save briefly shows detached text locally (with a failure toast) while the DB still holds the ref; a reload restores truth. This matches the notes feature's normal flush-then-save model; make notes abort-clean only by changing that model, not by forking a second save path here.

UI: **"Detach as text"** (Unlink icon) in the shared `ArtifactBlock` header chrome, behind `confirm()` — wired by `useUnbindArtifact.ts`. Source resolution: an enclosing **`UnbindSurfaceContext`** provider (non-chat surfaces) wins; otherwise chat (message content from the messages slice, `cxMessageContentRewriter`, then `flipMessageToDbRender.ts` — shared with attach — so the ref disappears in-session). Mermaid refs render `MermaidBlock` (no ArtifactBlock chrome) → no detach affordance, consistent with the gate.

## (c) EXPORT — LIVE (the forward leg)

- Primitive: `features/canvas/export/exportArtifactMarkdown.ts` — pure, no IO. Structured `content.data` (self-describing `__kind` object) → the kind registry's **`toMarkdown` facet** (`KindDefinition.toMarkdown`, implementations in `features/content-ir/kinds/*`, shared helpers + `genericKindMarkdown` fallback in `kinds/kind-markdown-utils.ts`); string content passes through as-is (it IS markdown/wire text).
- UI: **Copy as Markdown** in the shared artifact chrome (`components/mardown-display/blocks/artifact/ArtifactBlock.tsx` header actions) — covers inline artifacts and materialized refs alike via `artifactContentToMarkdown`.
- Facet law: human-readable markdown, never a JSON dump (fenced json only for inherently-code payloads: schema_proposal's Schema body, the generic fallback); unknown keys surface under "Additional details" — nothing silently vanishes.

## (d) Notes integration — LIVE

Notes is the first non-chat materialization surface. All pieces ride the canonical notes save path (`handleChangeFlush` → `updateNoteContent` → `saveNote`, same as content cleanup — NEVER a parallel write):

1. **Render:** the notes preview renders through MarkdownStream → block dispatch, so `<artifact id>` tags already route to `ArtifactRefBlock` (render-by-id) with zero notes-side code.
2. **Materialize:** explicit user action — **"Convert blocks to artifacts"** in the note editor context menu (`notesEditorExtraSections.ts#onConvertBlocksToArtifacts`) → `useNoteArtifactMaterialization.ts` → `materializeBlocks({ system: "note", id: noteId })`. A note is USER text; nothing auto-rewrites it (no reconcile pass for notes).
3. **Unbind:** `NoteContentEditor` provides `UnbindSurfaceContext` (null while read-only/access-loading), so every ref's "Detach as text" writes back through the note's own save path.
4. **String-surface adapters:** `materialization/textSurface.ts` (`textToContentBlocks` / `contentBlocksToText`) — any string-bodied surface (transcripts next) reuses these; `contentBlocksToText` fails LOUDLY on a non-text block.
5. Note-save flows preserve unknown `<artifact>` tags verbatim (plain textarea; TUI/rich modes not verified for wire-form fidelity — verify before enabling materialize there).

## Open work items

- [ ] Materialization-skip marker so fence-backed types (mermaid/html/svg/chart/react) can unbind (today: refused by the inertness gate, EDIT/EXPORT-only).
- [ ] Structured-kind editors (flashcards first) writing new `content.data` versions through `cx_canvas_save_user_version` (service already accepts objects).
- [ ] BACKWARD parse (markdown → structured value) for round-trip editing of structured kinds — deliberately deferred; unbind-then-re-emit covers the need until a real inverse parser is justified.
- [ ] Transcripts as the next `UnbindSurfaceContext` + `textSurface` consumer.
- [ ] Optional second export surface: "Copy as Markdown" in the canvas pane header (`CanvasPane.tsx`).

## Change log

- `2026-07-15` — UNBIND shipped (`unbindArtifact.ts` + `useUnbindArtifact` + `UnbindSurfaceContext` + ArtifactBlock "Detach as text"); inertness gate is mechanical (`planMaterialization` re-plan); notes wired as the first non-chat surface (convert action + unbind provider + `textSurface.ts`); `flipMessageToDbRender.ts` extracted from attach; `saveUserVersion` accepts structured objects. Browser-verified in notes AND chat (materialize → detach → reload inert; rows kept). Tests: `__tests__/unbindArtifact.test.ts`.
