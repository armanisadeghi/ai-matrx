---
status: active
updated: 2026-08-12
repos: [matrx-frontend]
vision: []
---

# Surface WRITE targets — make every worthy surface agent-writable

The read half (`values`) is tracked separately in `surface-canonical-fleet.md`. This doc is the
WRITE half: which surfaces still deserve `writeTargets`, and what the campaign has learned.

## Vision — Arman's words

- Assists doctrine (2026-08-08, standing ruling): *"The system uses its own AI on itself."* Every
  friction point gets asked "could an AI button/chip do this for the user?" — a write target is the
  seam that lets the answer be yes.
- (inferred, from the campaign's own bar) Not every input earns a target. A surface where an agent
  cannot plausibly produce the value is a NO, and saying so is a useful outcome.

## Resources

- **The recipe: `.claude/skills/surface-write-targets/SKILL.md`. Invoke it first** — judgment bar,
  draft/entity/ui + applyPolicy doctrine, manifest + handler recipe, mandatory live-agent verification.
- Exemplars, in the order worth reading: `tasks.manifest.ts` + `features/tasks/components/editor/TaskEditorBody.tsx`
  (THE exemplar); `images.manifest.ts` + `components/image/cloud/CloudImagesTab.tsx` (the `mode:"ui"`
  selection-and-query reference); `agents-hub.manifest.ts` + `features/agents/components/agent-listings/AgentsGrid.tsx`
  (the ONE-composite-object shape); `useVoicePlaygroundWriteHandlers.ts` (call-time state reads).
- Every adopter's full reasoning + live-run evidence: the `features/surfaces/FEATURE.md` Change Log.
- Gates: `pnpm check:surface-drift`, `pnpm type-check`. Test login `/login` admin@admin.com / Password1234#.
- **The definitive "already taken" test** — never trust a prose list:
  `for f in features/surfaces/manifests/*.manifest.ts; do grep -L "writeTargets" "$f"; done`

## Traps this campaign has paid for (pass these down in every chip)

1. **A route can lie about its mount.** `surfaceFromPathname` maps a URL prefix to a surface, but only
   the component mounting `SurfaceRuntimeProvider` supplies live values and the write tool. The agents
   hub named its surface on `/agents/all` while the emitter lived on `/agents/classic` — a run on the
   redirect target is offered no write tool and looks exactly like a broken target. Confirm the mount
   before verifying.
2. **The inline-tool layer PARSES a JSON-looking argument before the handler sees it.** A string target
   cannot receive raw JSON text; the agent then "fixes" it by double-encoding. Structured data → accept
   the OBJECT. Array targets should tolerate the double-encoded string form explicitly.
3. **`applySurfaceWrite` resolves the handler BEFORE awaiting the confirm dialog**, which can sit open
   indefinitely. Read `store.getState()` at call time, use a ref, or make interdependent fields ONE
   object target so they resolve atomically.
4. **Call-time reads do not fix write ORDERING.** A replace/append pair (or filter + selection) staged
   in one turn applies in an order the agent does not control. Say so in the descriptions.
5. **A deliberate invalid write legitimately produces one `surface-writeback` Error Inspector capture.**
   Do that test on its own page load; report the clean load's count honestly.
6. **`features/surfaces/FEATURE.md` conflicts on nearly every rebase.** Resolve with
   `git checkout origin/main -- features/surfaces/FEATURE.md`, re-apply ONLY your clauses, then confirm
   via `git diff origin/main` that removed lines are only yours. Someone once duplicated ~330 lines by
   concatenating both conflict sides.

## Remaining work — scouted assignments, highest value first

Each is one agent's task: invoke `surface-write-targets`, apply the judgment bar honestly, verify with a
real agent run, document, register in `agent.review_queue`. **Re-check the manifest still lacks
`writeTargets` on latest main before starting AND before committing** — these fan out in parallel and
the same surface gets assigned twice.

1. **`matrx-user/files`** — `features/surfaces/manifests/files.manifest.ts` (partial, `/files/all/[...path]`).
   Mount: `features/files/components/surfaces/PageShell.tsx` (several files components reference the
   surface name; only one owns the runtime). Candidates: `search_query`, `chip_filter`, `kind_filter`,
   `column_filters`, `sort_by`/`sort_direction`, `view_mode`, `selected_file_ids`. The richest remaining
   `images`-class surface. NOs: upload/download/move/rename/delete/visibility/share.
2. **`matrx-user/rag-library`** — `rag-library.manifest.ts` (partial, `/rag/library`). Mounts: BOTH
   `features/rag/components/library/LibraryPage.tsx` and `library-catalog/LibraryCatalogPage.tsx` —
   confirm which serves the route. Candidates: `library_search_query`, `library_status_filter`,
   `library_view`, `catalog_search_query`, `catalog_entitled_only`, `selected_document_id`. NOs: ingest,
   re-embed, delete (an embedding run spends money — the human press is the gate); every `documents_*` /
   `embeddings_*` count and `active_jobs` is derived.
3. **`matrx-user/marketing-site-pages`** — `marketing-site-pages.manifest.ts` (verified,
   `/marketing/brands/[brandId]/sites/[siteId]/pages`). Mount:
   `features/marketing/components/pages/PagesTable.tsx`. Candidates: `coverage_filter`, `list_query`,
   `registry_view`. A filterable registry table — the agents-hub composite shape likely fits directly.
4. **`matrx-user/extractor-chunker`** — `extractor-chunker.manifest.ts` (partial,
   `/tools/pdf-extractor/[documentId]`). Mount: `features/page-extraction/components/ChunkingConfigForm.tsx`.
   The `image-generate` composite-config class ("chunk this for semantic search with overlap").
   **Check first:** the emitted values are document CONTENT (`clean_text`, `pdf_page`, `chunk_index`), not
   the form's config — so the config targets may have no read twin. Decide whether to add the read side
   (that is `surface-authoring`) or to reject the surface, and say which.
5. **`matrx-user/marketing-competitors`** — `marketing-competitors.manifest.ts` (verified,
   `/marketing/competitors`). Mount: `features/marketing/competitors/CompetitorAutopsyWorkspace.tsx`.
   The tracked `competitors` set is genuinely agent-proposable (a decomposition action). Thin — apply the
   ~2-field bar honestly and reject if it is really just an autopsy report; `opportunities` and
   `latest_autopsy` are derived output, and `active_run` is not a target.

**Ruled out or already done** — do not reassign: war-room-thread, code-editor, scopes/context-items,
organizations, analysis-studio, education-flashcards, quick-note-save, workbooks, task-create,
admin-ai-models, crm-manager, crm, gallery, podcast, documents, voice-pad, chat-voice, images,
quick-tasks, agents-hub. Rejected on the bar while scouting: `settings` (emits only tab-navigation
state, not the setting values), `image-annotate` (thin — `presentation` + `save_folder` + flags),
`sandboxes` (runtime/status state; running commands is not a view write), `education` (derived study
snapshot). The remaining pool is now mostly report/derived surfaces — expect to reject more than you adopt.

## Done

- Agents Hub (`matrx-user/agents`) — one composite `catalog_filters` target; see `AgentsGrid.tsx`.
- Prior adopters (marketing-page, marketing-brand, keyword-intelligence, images, voice-pad, chat-voice,
  image-generate, scratchpad/working-document, agent-run, admin system-agents, content-plan family) —
  each has a `features/surfaces/FEATURE.md` Change Log entry.

## Decisions needed

*(none)*
