---
status: active
updated: 2026-07-28
repos: [matrx-frontend, aidream]
vision: [features/artifacts/docs/ARTIFACT_VISION_AND_DESIGN.md]
---

# Artifact system — render blocks become real, connected things

## Vision — Arman's words

> "Stop displaying markdown. Replace it with the actual source component."

> "All render block must do exactly as they did before unless I approve an UPGRADE to the normal rendering. The purpose of what I've asked you to do is not to modify my UI for how things render and act on the normal page. It's for you to make it so that we have persistence and the user can also link their blocks to 'real' things within our application."

> "Regardless of converting or not, changes must persist... we need to make sure that data is saved to the database and we need to ensure we bust the server cache for that message so the next turn, the model will get the proper history that matches what the user sees. No exceptions."

> "Server-side, auto-injected — not a client-passed tool... Route to the correct domain tool, not a generic 'edit artifact'."

Ratified rules R1–R8 live in the vision doc. **Governing rule: the artifact layer adds persistence + linking; it never changes how a block renders or behaves in the normal view.**

## Resources

- Vision + R1–R8: `features/artifacts/docs/ARTIFACT_VISION_AND_DESIGN.md`. Shipped: `features/artifacts/FEATURE.md`.
- Pin-as-editable-context: `features/canvas/materialization/attachBlockAsEditableContext.ts`, `features/agents/utils/canvasItemContext.ts`, aidream `context_writeback.py` `@register_writeback("canvas_item")`.
- Flashcards canonical adapter: `features/canvas/artifact-types/persistence/flashcards-canonical-adapter.ts`.
- RPCs: `cx_canvas_upsert`, `cx_message_set_content`, `cx_canvas_get_version_history`, `cx_canvas_save_user_version` (now preserves external links).

## Remaining work

1. **One-click Convert unreachable on fresh tables** — Convert only after materialize+reload. Make Convert work inline (materialize-if-needed → UDT → link). `features/canvas/artifact-types/renderers/TableArtifact.tsx`: the non-materialized branch passes no `convertToTable`; the only such prop site is inside `TableArtifactMaterialized`.

2. **Domain connections for self-contained types** — wire `code` → `code.code_files`, transcript → transcripts, etc. (flashcards/html already connect). Trap: bare ```code never auto-materializes; language discrimination required.

3. **Agent edit routing to domain tools** — writeback to canvas_items is live for pinned code/json; per-type domain tools (edit tasks → task tools, edit UDT → table tools) + global/per-artifact toggles still open.

4. **Media escape hatches** — audio expand; video editor target.

5. **Consolidation** — delete the `app/api/artifacts` middle-tier (still the only path used by `lib/redux/thunks/artifactThunks.ts`); collapse legacy `features/canvas/core/CanvasRenderer.tsx` (3 live importers: `features/cx-chat/components/core/ConversationShell.tsx`, `features/cx-conversation/ConversationShell.tsx`, `components/layout/adaptive-layout/AdaptiveLayout.tsx` — it was tiered for build perf in `5a11c2e15`, not removed); one discovery front door.

6. **Pin persistence across reload** — pins live in `instanceContext` (session). Reload drops the rail chip; R1 tag + canvas row survive. Decide: hydrate pins from R1/`userEditable` on load, or persist a pin set.

## Done

- Streaming + inline-edit persistence for render blocks — `BlockRenderer` / `artifact-renderers.tsx`.
- Table two-way Convert — `features/canvas/artifact-types/renderers/TableArtifact.tsx`.
- Generic version history — `ArtifactVersionHistory.tsx`.
- `userEditable` registry flag + ArtifactRefBlock `resolve:"latest"` (mermaid + code).
- **Pin code/JSON as editable context** — attach primitive + rewrite + writeback + rail + stream refresh.
- Attach hardening — mid-stream gate, all-identical-fence rewrite, orphan reuse, latest `base_version` on re-attach, R8 chain dedupe, BUG-B empty-delta guard.
- `cx_canvas_save_user_version` preserves `external_system`/`external_id`/org/metadata/source identity.
- HTML auto-publish + flashcards domain link.
- Single-message refresh — `refetch-single-message.thunk.ts`.
- UNBIND leg + notes materialization surface; materialization now requires a durably successful stream — see `features/artifacts/FEATURE.md` change log (2026-07-15 → 2026-07-28).

## Decisions needed

1. **Convert reach for tables.** Should Convert on a fresh table materialize-on-the-fly (one click), or should tables auto-materialize at stream-end so Convert is always present?

2. **Self-contained types' home.** Mermaid/comparison/timeline/etc. — stay canvas-library-only, or escape into dedicated features?

3. **Pin persistence.** Session-only (today) vs hydrate-on-reload from R1 code artifacts vs explicit persisted pin set?
