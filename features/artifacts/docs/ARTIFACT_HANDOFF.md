# Artifact System — Handoff (2026-06-19)

Pick-up doc for the next agent. The artifact system is the most important feature in the app. Source of truth for the vision: [`ARTIFACT_VISION_AND_DESIGN.md`](./ARTIFACT_VISION_AND_DESIGN.md). Shipped reality: [`../FEATURE.md`](../FEATURE.md).

## The governing principle (do not lose this)
**Everything generated becomes an artifact UNLESS Arman says otherwise. Nothing is allowed to die as text.** The app is a two-way collaborative environment — every structured/durable output must persist *outside* the chat, be versioned, render-by-id (never re-parsed/re-created), and — where a domain system exists — **two-way sync** to it. A markdown table the agent makes is real data, not chat text. This was the #1 thing the prior agent kept getting wrong (treated materialization as opt-in; it is opt-OUT).

## DONE + on `origin/main` (verify with `git show HEAD:<path>`)
- **R1 pipeline (the heart):** materialized blocks store as canonical text `<artifact type id version>body</artifact>`; UUID-id → render-by-id (R3, `artifact-types/artifactId.ts`); idempotent; `artifact_ref` block type deleted; 19 live messages migrated. Model reads artifacts natively (Wave 1). Versioning IS in place (`canvas_items.version` + `parent_canvas_id` + `cx_canvas_save_user_version`).
- **Enrolled materializable types (~24):** flashcards, quiz, presentation, timeline, research, resources, progress, troubleshooting, decision-tree, comparison, diagram, recipe, math_problem, mermaid, **svg, chart, questionnaire, html, react, table, transcript, structured_info, tree**, tasks. (code/iframe/image = `<artifact>`-wrapper-only.) To enroll a type the recipe is: registry entry (`artifact-type-registry.ts`) + `CanvasContentType` (`canvasSlice.ts`) + discovery map (`canvasArtifactService.ts`) + a `renderers/XArtifact.tsx` + RENDERERS map (`artifact-renderers.tsx`). For fence types also add to `SPECIAL_CODE_LANGUAGES` (`content-splitter-v2.ts` — the stream accumulator imports it).
- **Interaction state → `canvas_item_state`** via `useArtifactState` (progress/recipe/decision-tree/troubleshooting/comparison/presentation; questionnaire answers migrated off `_matrxState`). Tasks = tracked proposal + Convert via `ctx_task_associations`. Flashcards→`user_flashcard_*`, quiz→`quiz_sessions`.
- **aidream R8 (committed, DEPLOY-PENDING):** `aidream/api/utils/artifact_context.py` injects `conversation_artifacts` (latest copy + status + interaction state) each turn via `chat.py` `_prepare`. **Needs a server deploy to take effect.**
- **html/react security:** `isPublic` prop on `ArtifactRendererProps`; `PublicCanvasRenderer` passes it; html→SandboxedHtml / react→read-only CodeBlock on public surfaces (never execute author content for anonymous viewers).
- **Quiz "Unknown Data Event" fix** (`normalize-content-blocks.ts#reconstructPersistedBlock`) + **Copy-for-AI** button on `UnknownDataEventBlock` (the canonical failure→agent affordance).

## NEXT — in priority order (each with the approach)

1. **code (the big one) — language-aware materialization.** A `code` block is heterogeneous: diff, yaml, tiny inline snippets, AND real code share `block.type="code"`. Do NOT blanket-add `code` to `standaloneAliases` — it routes ALL of them (incl. diff/yaml) through the unified branch and breaks their special rendering in `BlockRenderer`'s `case "code"`. Approach: materialize only "real code" (a fenced code block with a real language, not diff/yaml/small-inline) — likely a language-aware check in `planMaterialization` + a `code`-specific resolve, keeping diff/yaml/InlineCodeSnippet inline. Then the **code-editor round-trip**: edit in the `/code` editor → new `canvas_items` version → render-by-id reflects it (a `code` domain adapter; `CodeBlock` already has `onCodeChange`).

2. **table ↔ UDT two-way sync.** `table` already materializes (persist + versioned). Now wire the live two-way mirror to a real `udt_datasets` table — `features/data-tables/save-to-table.ts` (`appendToTable`/`replaceTable`) + `service.ts` (`upsertRow`/`upsertCell`/`bulkWrite`) are already two-way-capable. Build a `table` domain adapter (the tasks↔ctx_tasks pattern): "Save to table" links `canvas_items.external_system='udt_datasets'`; thereafter edits round-trip both ways. Component: `StreamingTableRenderer` (editable, `onContentChange`).

3. **UDT pick list.** DB (`udt_picklists`/`udt_picklist_items`) + Python API exist; **no render component**. Build `blocks/picklist/PicklistBlock.tsx` + a client service + enroll (`picklist` fence in `SPECIAL_CODE_LANGUAGES` + registry + `PicklistArtifact`).

4. **Two-way domain adapters for the rest:** transcript↔transcription system (`features/transcripts`), and media (file/audio/image/youtube/podcast) "connected to source" durability + back-sync. Each is a custom adapter linking `canvas_items.external_system/_id` to the feature's record (model: flashcards/quiz/tasks adapters).

5. **Edit mode** for transcript/structured_info/tree — currently read-only viewers (they persist + render now; editing + serialize-back is the next layer; Arman specifically wants a *syncing tree editor*).

6. **Copy-for-AI rollout:** extend the `UnknownDataEventBlock` pattern (page + conversation_id + message_id + error + payload wrapped in `<artifact_failure>`) to every artifact/canvas failure point — `ArtifactRefBlock`'s "couldn't load saved artifact" state, `SafeBlockRenderer` error boundary, the artifact error cards. Arman wants this on ALL aspects of the canvas/artifact system.

7. **Verify the quiz fix live** — the reconstruction renders the quiz; confirm progress restores from `_matrxState` on a healthy server. Consider migrating quizzes off `_matrxState` → `quiz_sessions`/materialized (like questionnaire) to kill the legacy persistence entirely.

8. **NOT artifacts (confirmed with Arman):** `search_results`, `function_result`, `workflow_step` are transient execution events — only persist on an explicit user action, never auto-materialize.

## Verification reality
- **Local dev server degraded all session** (app-wide `/chat` + `/artifacts` shimmer; NOT a code issue — 7 restarts + `rm -rf .next-preview` + clean build, no console errors, type-clean; same server rendered fine earlier). Most recent enrollments (html/react/table/transcript/etc. + the quiz fix) are **type-clean + equivalence-proven** against svg/chart/recipe/progress which WERE live-verified this session, but await a live click-test on a healthy `pnpm dev`.
- **Verify pattern:** insert an admin-owned `cx_conversation` (needs `initial_agent_id`!) + a `cx_message` with the raw block, dev-login token `matrx-dev-a2990c472f1cae47864bb936`, load `/chat/<id>`, check `canvas_items`/`cx_message` content/`canvas_item_state` in Supabase MCP (project `txzxabzwovsujtloxrus`). RESTART the dev server first.
- **aidream:** run `PYTHONPATH=. .venv/bin/python` a script calling `resolve_conversation_artifacts_context(conv_id, user_id)` to test the context helper against the live DB (it works — verified on a 12-artifact conv).

## Concurrency note
Arman commits/releases the working tree in parallel — your changes may land under his commit messages + releases. Always `git fetch` + verify HEAD tree content (not just commit ancestry). On push reject: `git stash -u && git pull --rebase origin main && git push && git stash pop`.
