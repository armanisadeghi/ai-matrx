---
status: active
updated: 2026-07-07
repos: [matrx-frontend, aidream]
vision: [features/artifacts/docs/ARTIFACT_VISION_AND_DESIGN.md]
---

# Artifact system — render blocks become real, connected things

## Vision — Arman's words

> "Stop displaying markdown. Replace it with the actual source component."

> "All render block must do exactly as they did before unless I approve an UPGRADE to the normal rendering. The purpose of what I've asked you to do is not to modify my UI for how things render and act on the normal page. It's for you to make it so that we have persistence and the user can also link their blocks to 'real' things within our application. Modifications to their appearance and functionality is not permitted in the normal view, unless authorized by me."

> "nothing was actually being properly changed to a real artifact that actually connected with the core render block, which is the only thing that matters. Look at flashcards because they are likely to be the one and only one that actually works and does something useful"

> "Regardless of converting or not, changes must persist... we need to make sure that data is saved to the database and we need to ensure we bust the server cache for that message so the next turn, the model will get the proper history that matches what the user sees. No exceptions."

> "Now, if it's converted to a udt or a workbook, we modify it to ensure that we maintain the markdown for the agent to see, but now we render the referenced item instead... Changes will NOT change the agent's history, but they WILL now be added as context for the agent for collaboration."

> "Server-side, auto-injected — not a client-passed tool... Route to the correct domain tool, not a generic 'edit artifact'. If the artifact is a task list, the agent is editing the tasks. If it's a user data table, it's editing the UDT table... A global toggle to turn all agent artifact-editing on/off, plus a per-artifact switch."

> "do not create double-nested titles and never include description at the top of a component, unless it's there with purpose and the quality is guaranteed to be very very high and not generic."

> "do not write your own code to override things that are already working. If I tell you something is working, leave it alone. Only do what I ask you to do."

> "we need to get back to what we were actually here to do, which is to create dozens of other artifacts!"

Ratified rules R1–R8 live in the vision doc. **The governing rule outranks everything: the artifact layer adds persistence + linking; it never changes how a block renders or behaves in the normal view.**

## Resources

- **Vision + ratified R1–R8:** `features/artifacts/docs/ARTIFACT_VISION_AND_DESIGN.md`. Shipped reality: `features/artifacts/FEATURE.md`.
- **THE reference for "connected"** (copy this shape): `features/canvas/artifact-types/persistence/flashcards-canonical-adapter.ts` — `onMaterialize` creates real `education.fc_set` + `fc_card` rows and links `external_system='fc_set'`.
- **The entire domain-connection surface:** `features/canvas/artifact-types/persistence/artifact-adapters.ts` — `ADAPTERS = { generic, flashcards, quiz, html }`. Everything else gets `GENERIC_ADAPTER` (no `onMaterialize`, no link).
- Convert path: `features/canvas/artifact-types/renderers/TableArtifact.tsx`; the button renders in `components/mardown-display/blocks/table/StreamingTableRenderer.tsx` → `renderTableActionButton()` (~686), toolbar gated on `!isStreamActive && metadata?.isComplete`.
- Render dispatch: `components/mardown-display/chat-markdown/block-registry/BlockRenderer.tsx` early-branch (~266) → `features/canvas/artifact-types/artifact-renderers.tsx` (`ArtifactRendererProps.onContentChange` = the inline-edit write-back).
- Materialization: `features/canvas/materialization/{planMaterialization,materializeMessageArtifacts,artifactWire}.ts`. Service: `features/canvas/services/canvasArtifactService.ts`.
- **DB after the 2026 changeover — re-verify before every query:** `canvas.canvas_items`, `canvas.canvas_item_state`, `chat.message`, `chat.artifact`, `workspace.tasks`, `workbench.udt_datasets`, `education.fc_set`/`fc_card`, `code.code_files`. `ctx_task_associations` is retired to `graveyard` (tasks already use `platform.associations`).
- RPCs: `cx_canvas_upsert`, `cx_message_set_content` (→ `UPDATE chat.message`), `cx_canvas_get_version_history`, `cx_canvas_save_user_version`.
- aidream: `api/utils/artifact_context.py` — read-only `conversation_artifacts` context each turn. **Prod deploy pending.**
- Skills: `db-change` + `db-table-retrofit` (**DB is mid-retrofit — do not change RPCs/schema**), `context-docs`, `ui-dense` / `ui-sharp`.
- Test: form login `/login` → `admin@admin.com` / `Password1234#`. **The agent sandbox preview cannot hydrate authed data pages — Arman verifies in his browser.**

## Remaining work

1. **One-click Convert is unreachable in practice** (tables: 3 linked of 72). `TableArtifact`'s non-materialized branch passes no `convertToTable`, so a freshly-streamed table falls through to `StreamingTableRenderer`'s older "Save" modal; the real one-click Convert only renders once the table has materialized **and the page reloaded**. Make Convert work on the inline table (materialize-if-needed → create UDT → `setExternalLink`). Trap: the in-session Redux message is deliberately not remounted after the DB rewrite, so the block keeps rendering through the non-materialized branch.

2. **Give each applicable type its flashcards-style domain connection.** Only `flashcards` (23/34) and `html` (8/11) auto-connect. `quiz` registers an adapter but links nothing (0/7 — confirm it self-persists by design, else fix). `mermaid`(24), `diagram`(15), `comparison`(9), `svg`(9), `recipe`(8), `decision-tree`(7), `timeline`(7) have zero domain link. Wire, copying the canonical flashcards adapter: `code` → `code.code_files`, `transcript` → transcripts, `document`/markdown → `notes`. Trap: bare ```code fences have `standaloneAliases: []` so they never materialize, and csv/json/yaml share the `code` splitter type — they must NOT become code artifacts.

3. **Versioning write-side** (DB-coupled — do after the retrofit). Every edit → new version; un-hardcode `wantLatest` (currently mermaid-only) in `components/mardown-display/blocks/artifact/ArtifactRefBlock.tsx:45`. Trap: `cx_canvas_save_user_version` must carry `external_system`/`external_id` forward, or restoring a version silently unlinks a converted UDT/code artifact.

4. **Agent two-way edit** (aidream). Server-side, auto-injected, routed to the real per-type domain tool — never a generic "edit artifact". Global + per-artifact toggles enforced server-side via `is_resource_read_only`. Extend the existing `@register_writeback` family (`note`, `studio_document`, `cx_working_document`). Deploy `artifact_context.py` first.

5. **Media escape hatches.** Image done. Audio has no expand affordance at all; video has no editor target. Editors already accept a `file_id` (`features/image-studio/`).

6. **Consolidation.** Delete the `app/api/artifacts/route.ts` middle-tier (React→Next→Supabase, violates the no-middle-tier rule; `cx_artifact`/`chat.artifact` then has one access path). Collapse legacy `CanvasRenderer`/`CanvasHeader` into `CanvasPane`/`CanvasBody`. Pick one discovery front door (`/artifacts` vs `/canvas/discover`).

7. **Markdown files / documents / promote-to-context.** Wire "save response as markdown" → `notes`. "Save to Document" converts markdown→Univer and discards the source (lossy, agent can't re-read it). Add the "make this part of the agent's context?" prompt after a save+trim — `ContextAssignmentField` exists and is unwired.

## Done

- Streaming restored for every render block — see `BlockRenderer.tsx` early-branch.
- Inline-edit persistence restored for all editable blocks — see `artifact-renderers.tsx` (`onContentChange`).
- Table two-way (Convert → UDT, Revert, live `UserTableViewer`) — see `TableArtifact.tsx`.
- `UserTableViewer` densified + `TableSkeleton` + markdown cells + `hideHeader` — see `components/user-generated-table-data/`.
- Minimal artifact wrapper (transparent, hover-reveal actions) — see `ArtifactBlock.tsx`.
- Generic version history (browse / original / restore / diff) — see `features/canvas/components/ArtifactVersionHistory.tsx`.
- Image escape hatch → `/images/edit/[file_id]` — see `ImageBlock.tsx`.
- HTML auto-publish + idempotent link — see `persistence/html-adapter.ts`.
- Single-message refresh primitive — see `refetch-single-message.thunk.ts`.

## Decisions needed

1. **Convert reach.** The one-click "Convert to table" only appears after a table has been saved as an artifact and the page reloaded; in the moment you generate a table you get the older "Save" modal instead. Only 3 of 72 tables have ever been converted. **Decide:** should clicking Convert on a fresh table create the artifact on the fly (one click, always available), or should tables be saved as artifacts automatically at stream-end so Convert is always present?

2. **What "connected" means for self-contained types.** Flashcards auto-creates a real, reusable set inside its own feature. Mermaid, comparison, timeline, recipe, svg and diagram only ever exist as canvas rows shown in the `/artifacts` library — about 79 of them, none linked to anything. **Decide:** should those escape into dedicated features of their own, or is the canvas/artifacts library their intended home?
