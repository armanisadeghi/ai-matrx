# Two-way binding — artifacts ⇄ editable surfaces

**Status:** EXPORT (forward) leg LIVE · EDIT partially live (mermaid is the model) · UNBIND designed, not built.
The design for how content that became a living artifact stays *ownable as text*: users must never feel their note/chat content got trapped inside an object they can't read or take back.

## The model

Once a block materializes (`materializeBlocks.ts`), the **artifact row is the source of truth** and the surface holds only a reference: the canonical R1 text form `<artifact type id version title>body</artifact>` (`artifactWire.ts#wrapArtifactText`), written via the caller's `persistRewrite`. Three ways out of (or around) that binding:

| Path | What it is | Status |
|---|---|---|
| EDIT | change the artifact through its own editor; every ref updates | live for mermaid; the pattern to generalize |
| EXPORT | read the artifact back as clean markdown (copy/share) — non-destructive | **LIVE** |
| UNBIND | replace the ref with the markdown export; surface owns plain text again | designed below, not built |

## (a) EDIT — artifacts stay the source of truth

- Surfaces NEVER edit the inline body (the UI ignores it once a real UUID is present — R3, `isMaterializedArtifactId`). Edits go through the artifact's own editor/adapter.
- Persist edits as **new versions** via the existing canvas version RPC `cx_canvas_save_user_version` (`canvasArtifactService.ts`) — version rows are never overwritten.
- Refresh propagation exists and is generic: editors dispatch `CANVAS_ITEM_UPDATED_EVENT` + `invalidateCanvasItemCache` (`hooks/useCanvasItem.ts`); any mounted ref of the chain refetches.
- Refs to editable types resolve `{ resolve: "latest" }` so they show the newest chain version. Today `ArtifactRefBlock` hard-codes this for `mermaid` only — generalizing it (registry-driven, e.g. an `ArtifactTypeDef.userEditable` flag) is the first EDIT work item.
- Structured (kind) artifacts: an editor writes a NEW zero-loss `content.data` value object (never mutates in place); rehydration stays `kindServerDataFromStoredValue` — no re-parse.

## (b) UNBIND — "give me my text back"

Replace the `<artifact id>` tag in the source body with `exportArtifactMarkdown(row).markdown`, persisted through the same owner-checked `persistRewrite` the materializer used (chat: `cx_message_set_content` — status-preserving, archives the prior body to `content_history`).

Rules:
- **The artifact row is KEPT, orphaned — not soft-deleted.** The same id can be referenced from other surfaces/messages, `canvas_item_state` and adapter-linked domain records hang off it, and it stays discoverable in the canvas library. Deleting it is a separate, explicit user action.
- Unbind is per-reference, not per-artifact: it detaches THIS surface only.
- After unbind the text must be **inert** — it must not re-materialize on the next reconcile pass (`reconcileSourceBlocks`). Structured-kind markdown exports are naturally inert (prose, not a JSON region). Fence-backed types (html / code / mermaid / svg / chart) are NOT: restoring the raw fence would re-materialize into a fresh row on reload. Ship unbind for structured + prose types first; fence-backed types need a materialization-skip marker (or stay EDIT/EXPORT-only) — see open items.
- Loud, reversible-by-history: the pre-unbind body is in `content_history`; a failed rewrite aborts (never leave a dangling half-state), mirroring the materializer's abort invariant.

## (c) EXPORT — LIVE (the forward leg)

- Primitive: `features/canvas/export/exportArtifactMarkdown.ts` — pure, no IO. Structured `content.data` (self-describing `__kind` object) → the kind registry's **`toMarkdown` facet** (`KindDefinition.toMarkdown`, implementations in `features/content-ir/kinds/*`, shared helpers + `genericKindMarkdown` fallback in `kinds/kind-markdown-utils.ts`); string content passes through as-is (it IS markdown/wire text).
- UI: **Copy as Markdown** in the shared artifact chrome (`components/mardown-display/blocks/artifact/ArtifactBlock.tsx` header actions) — covers inline artifacts and materialized refs alike via `artifactContentToMarkdown`.
- Facet law: human-readable markdown, never a JSON dump (fenced json only for inherently-code payloads: schema_proposal's Schema body, the generic fallback); unknown keys surface under "Additional details" — nothing silently vanishes.

## (d) Notes integration — what's missing when it lands

`materializeBlocks` + `reconcileSourceBlocks` already take any `(source_system, source_id)` + `persistRewrite`, so notes can materialize today. The missing surface-side pieces:

1. Note render path must route `<artifact id>` tags through `ArtifactRefBlock` (chat's BlockRenderer already does).
2. **Edit affordance** on the ref: "Open in canvas / edit" from within the note (the EDIT path above), not a bespoke note-side editor.
3. **Unbind UI** on the ref ("Detach as text"), calling the unbind primitive with the note's `persistRewrite`.
4. Note-save flows must preserve unknown `<artifact>` tags verbatim (an editor that re-serializes the body must not mangle the wire form).

## Open work items

- [ ] `unbindArtifact` primitive in `features/canvas/materialization/` (source ref + artifact id → export → rewrite via `persistRewrite`; keep-row rule above) + chat ref-chrome UI.
- [ ] Inertness guard for fence-backed types on unbind (materialization-skip marker, or gate unbind to structured/prose kinds).
- [ ] Generalize `resolve: "latest"` beyond mermaid via a registry flag (`ArtifactTypeDef.userEditable`), not per-type hard-codes in `ArtifactRefBlock`.
- [ ] Structured-kind editors (flashcards first) writing new `content.data` versions through `cx_canvas_save_user_version`.
- [ ] BACKWARD parse (markdown → structured value) for round-trip editing of structured kinds — deliberately deferred; unbind-then-re-emit covers the need until a real inverse parser is justified.
- [ ] Notes integration items 1–4 above, when notes materialization is switched on.
- [ ] Optional second export surface: "Copy as Markdown" in the canvas pane header (`CanvasPane.tsx`).
