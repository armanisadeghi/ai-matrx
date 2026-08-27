# FEATURE.md — `transcripts`

**Status:** `stable`
**Tier:** `1`
**Last updated:** `2026-08-26`

---

## Purpose

The canonical store for finished transcripts (one row, one JSONB `segments` blob) plus the processor workspace that records, uploads, transcribes, and edits them. This doc is also the **core-storage contract** for the whole `/transcripts` ecosystem — read it before building or modifying any transcription surface.

---

## The core-storage contract

Every route under `app/(core)/transcripts/` stores through exactly **two record stores and one audio store**. No third store, ever.

| Store                                | What lives there                                                                      | Single access path                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `transcripts` table                  | Finished, one-shot transcripts (JSONB `segments` blob per row)                        | `features/transcripts/service/transcriptsService.ts`                  |
| `studio_*` tables                    | Live session data — per-segment rows, recordings, cleaned passes, documents, settings | `features/transcript-studio/service/studioService.ts`                 |
| `cld_files` (universal file handler) | ALL audio/video bytes                                                                 | `features/transcripts/service/audioStorageService.ts` → `fileHandler` |

**Route → store map:**

| Route                                                                                    | Record store                                         |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `/transcripts` (list), `/transcripts/processor`                                          | `transcripts`                                        |
| `/transcripts/studio`                                                                    | `studio_sessions` (`source <> 'cleanup'` by default) |
| `/transcripts/scribe`, `/transcripts/scribe/[sessionId]`, `/transcripts/scribe/unsorted` | `studio_sessions`                                    |
| `/transcripts/cleanup`                                                                   | `studio_sessions` with `source='cleanup'`            |

**Rules:**

- **Conversion between the two record stores goes ONLY through** `features/transcript-studio/service/transcriptBridge.ts` (`promoteTranscriptToStudio` / `saveStudioAsTranscript`). Both directions live in one file so the rules can't drift; sessions and transcripts cross-reference via `studio_sessions.transcript_id`.
- **`audio_file_path` / `video_file_path` / `studio_recording_segments.audio_path` hold `cld_files` UUIDs, NOT bucket paths.** Upload via `saveAudioToStorage`, play via `useFileSrc` / `getFileRenderUrl`, delete via `deleteAudioFromStorage`. No `direct object-store SDK` anywhere (ESLint enforces repo-wide).
- **A new transcription surface consumes one of the two record stores.** Need session-shaped data → `studio_sessions` with a new `source` value (see `features/transcription-cleanup/FEATURE.md` for the pattern). Need a finished document → `transcripts`. Inventing a third store is the failure class this contract exists to kill.
- Transcription compute runs through aidream's authenticated, catalog-routed `/audio/transcribe` + `/audio/transcribe-url` endpoints and the `features/audio` hooks (`useRecordAndTranscribe`, `useChunkedRecordAndTranscribe`) — never a parallel pipeline.
- **Eager chunk journal (recovery staging, NOT a third store):** while a recording is live, every chunk is also mirrored to `cld_files` and journaled in `transcripts.studio_recording_chunks` keyed by `safety_id` (`features/audio/services/audioChunkJournal.ts`) so a recording whose full upload never lands is recoverable from ANY device. Ephemeral — swept the moment the durable full-audio upload succeeds. Never read it for playback; `audio_path` remains the only durable audio pointer.

---

## Entry points

**Routes**

- `app/(core)/transcripts/page.tsx` — list "savior" entry. Server-fetches `transcripts` summaries (no `segments` blob), renders `TranscriptsListPage`; guests get `TranscriptsLanding`.
- `app/(core)/transcripts/processor/page.tsx` — the processor workspace (`TranscriptsLayout`): record / upload / browse / edit a single transcript.
- `app/(core)/transcripts/new/page.tsx` — server-rendered "how do you want to create one?" picker; hands off to processor / studio / cleanup.
- Studio / scribe / cleanup routes are owned by `features/transcript-studio/` and `features/transcription-cleanup/` — see their FEATURE.md files.

**Services**

- `service/transcriptsService.ts` — ALL `transcripts` CRUD: fetch (list / paginated / by-id / search / folder / tag), create, update, soft + hard delete, drafts (`saveDraftTranscript` / `finalizeDraft` / `getDraftTranscripts`), copy, `getSignedUrl` (mints playback URL from a `cld_files` UUID via the handler).
- `service/audioStorageService.ts` — audio bytes in/out of `cld_files`: `saveAudioToStorage` (retrying upload → `Transcripts/Recordings`), `getAudioUrl`, `downloadAudioBlob`, `deleteAudioFromStorage` (hard delete via `fileHandler.remove`).

**Context / hooks**

- `context/TranscriptsContext.tsx` — provider with optimistic updates + realtime; wraps the processor.
- `hooks/useTranscriptsSurfaceScope.ts` — runtime surface-scope builder; reads live playback/selection at call time and delegates the shape to the pure `agent-context/buildTranscriptsContextData.ts`.

**Agent context (`matrx-user/transcripts` surface)**

- `agent-context/buildTranscriptsContextData.ts` — pure live-state → `createTranscriptsScope(...)` mapper (baselines + every sourceable custom value) plus `TRANSCRIPTS_CONTEXT_MENU_PROPS`. Demo + runtime share this one shape.
- `agent-context/transcriptsExtraSections.ts` — surface-specific right-click items (Copy transcript), wired to real behavior.
- `TranscriptViewer.tsx` mounts the v3 menu on both the presentational rendered transcript (`NonEditableContextMenu`) and the inline body editor (`EditableContextMenu`, `surfaceName` + `getApplicationScope` on its `ProTextarea`). Manifest: `features/surfaces/manifests/transcripts.manifest.ts`.

**Components** — `components/`: `TranscriptsListPage` (list island), `TranscriptsLayout` / `TranscriptsHeader` / `TranscriptsSidebar` (processor shell), `TranscriptViewer`, `CreateTranscriptModal` (upload / upload+transcribe), `ImportTranscriptModal`, `RecordingInterface` / `RecordingPreview` / `DraftIndicator`, `DeleteTranscriptDialog`.

---

## Admin map

The whole transcription ecosystem is catalogued at **`/transcripts/admin`** (`app/(core)/transcripts/admin/page.tsx`). Add any new transcript-related route / panel / component to that config — drift warnings catch misses.

---

## Data model

**`transcripts` table** — `id`, `user_id`, `title`, `description`, `segments jsonb` (`TranscriptSegment[]`), `metadata jsonb` (duration / wordCount / segmentCount / speakers), `audio_file_path` + `video_file_path` (**`cld_files` UUIDs**), `source_type` (`audio|video|meeting|interview|other`), `tags text[]`, `folder_name`, `deleted_at` (canonical soft delete — the legacy `is_deleted` boolean was dropped 2026-08-12), `visibility` (canonical access driver), `is_draft` + `draft_saved_at`, timestamps. Migration: `migrations/create_transcripts_table.sql` (applied live; the DB is the source of truth).

**Key types** — `Transcript`, `TranscriptSegment`, `CreateTranscriptInput`, `UpdateTranscriptInput` (`types.ts`).

---

## Key flows

**Record → draft → finalize (processor):** `RecordingInterface` records → `saveAudioToStorage` uploads to `cld_files` → transcription via `features/audio` hooks → `saveDraftTranscript` (`is_draft=true`) → user reviews in `RecordingPreview` → `finalizeDraft`.

**Upload & transcribe:** `CreateTranscriptModal` → `saveAudioToStorage` → `getAudioUrl` (signed URL) → aidream `/audio/transcribe-url` (catalog STT) → `createTranscript` with segments + `audio_file_path = fileId`.

**Delete:** `DeleteTranscriptDialog` → `deleteTranscript` → hard-deletes audio/video from `cld_files` via the handler, then soft-deletes the row (`deleted_at = now()`).

**Promote / save-as (bridge):** list row or studio action → `transcriptBridge.ts` — see The core-storage contract above.

---

## Invariants & gotchas

- **`audio_file_path` is a `cld_files` UUID.** Treating it as a bucket path (or minting URLs outside the handler) produces URLs that expire and break — the exact defect class the universal handler exists to kill.
- `deleteTranscript` destroys audio bytes (hard delete) but only soft-deletes the row. `permanentlyDeleteTranscript` removes the row.
- The list page projects WITHOUT `segments` — never widen that select; the blob is heavy.
- Segment `seconds` is the seek coordinate; `timecode` is display-only. Keep both in sync when editing segments.

---

## Related features

- `features/transcript-studio/` — live-session sibling store + the bridge (read its FEATURE.md "Coexistence" section).
- `features/transcription-cleanup/` — cleanup page on studio storage (`source='cleanup'`).
- `features/audio/` — recording + transcription hooks and the transcribe API routes.
- `features/files/handler/` — the universal file handler all audio goes through.

---

## Doctrine compliance

**Primitives reused** — `fileHandler` / `useFileSrc` (`features/files`), `useRecordAndTranscribe` / `useChunkedRecordAndTranscribe` (`features/audio`), Supabase clients (`@/utils/supabase/client|server`), `ConfirmDialog`, official UI components.

**Primitives introduced** — `transcripts` table + `transcriptsService` (the canonical finished-transcript store; predates the studio) and `audioStorageService` (thin retry/validation wrapper over `fileHandler` — the handler itself stays generic).

---

## Change log

- `2026-08-26` — **Transcript mode navigation now matches the compact Agents shell header at every width.** Removed the copied 44px mobile/tablet minimums from `TranscriptsModeController`; large mobile targets remain inside drawers and sheets, never in the fixed-height header center. `check:page-headers` now rejects this regression in header/mode/nav components using the shared nav-item styles.
- `2026-08-15` — **Transcript runs became durable: a pass survives a page reload on every `/transcripts` surface.** `transcripts.studio_runs` was written but never READ back — no `listAgentRuns`, nothing dispatching `runsLoaded` — so column status and the watch door lived only in the tab that launched the pass (FOUND_DEFECTS D169, now closed). Three writes close it: `bindAgentRunConversation` stamps the run's conversation the moment it exists (not at the end of the pass), `listAgentRuns` + `fetchAgentRunsThunk` hydrate the rows on load (`ActiveSessionView`, `ScribeScreen`), and the shared [`redux/reattachStudioRun.ts`](../transcript-studio/redux/reattachStudioRun.ts) rejoins every row still running — floating its `LiveRunWindow`, following it to terminal on aidream's runtime spine, and settling the row from SERVER truth. Modelled on `features/marketing/data/useSiteCommandRun.ts`, and shared with the cleanup pad rather than copied. A studio pass's replace-window is not recorded on the row, so a recovered studio output can be READ but not re-applied — the row says so instead of pretending; the one-write fix is logged in [`docs/handoffs/live-run-streaming-sweep.md`](../../docs/handoffs/live-run-streaming-sweep.md). `<WatchRunButton>` also stopped being a dead end now that it appears on a cold page: a FINISHED run opens its conversation in a new tab (the live window would have been empty), while a running one still floats. Live-verified on `/transcripts/studio` (doors present after a reload, the conversation opens) and `/transcripts/cleanup` (full rejoin + restore).

- `2026-08-15` — **Surface wayfinding ported off the retired landing page; the hub's empty state stopped lying.** `features/transcript-studio/components/landing/TranscriptionLanding.tsx` (528 lines) has had no mounter since `/transcripts` became the canonical entry LIST view — a legitimate demotion (CLAUDE.md § "Feature entry pages are LIST views"), but the wayfinding it carried had nowhere to go, and the marketing half is already served to guests by `features/auth/.../landings/TranscriptsLanding.tsx`. **`constants/transcriptsRoutes.ts` is now THE surface register**: each of the six modes carries a `blurb` saying what that surface is FOR, and both consumers read it — the header `TranscriptsModeController` (tooltip on EVERY viewport now, not just `<lg`: below `lg` it supplies the hidden label, at `lg+` it supplies what "Studio"/"Scribe"/"Clean" actually DO) and the new `components/TranscriptsSurfaceGuide.tsx`. The guide renders **only inside the empty state** — never above the list, so a user with transcripts gets zero page shift — as four linked rows (Studio · Process · Scribe · Clean), which is THE DOOR LAW: a name the user cannot decode is unreachable in practice. `NavItemTooltip` gained an optional `description` (extended, not forked). **Two shared-shell defects fixed in `lib/entity-list` while here, so every consumer gets them** (`/agents/all` included): (1) the cards and rows views rendered *literally nothing* on an empty list — the empty state and its `emptyAction` door existed only in the table branch, so a user whose saved view style was "cards" met a blank page; (2) an empty RESULT was reported as an empty LIST — "Nothing here yet — record your first" to someone with 117 rows who mistyped a search, with the actual way out (clear the search) nowhere on screen. The page now resolves ONE empty state (using the existing `countActiveFilters`, never a hand-rolled twin) and hands it to every view, so they cannot disagree; the narrowed variant says what happened and its button clears the search AND the filters (`resetFilters` alone leaves the term in place, which would have left the user staring at the same empty result). Verified in-browser on desktop: tooltip copy, both empty-state variants, the clear button, and a DOM check that the Clean row reaches `/transcripts/cleanup`; `/transcripts` also confirmed rendering at a 375px mobile viewport, though the empty state specifically could not be re-checked there because the shared dev server OOM-died at its 96 GB cap on every restart. ~~**`TranscriptionLanding.tsx` is deliberately left in place**~~ — **RULING 2026-08-15: Arman retired it, in writing.** Deleted; the wayfinding ported here is now its only surviving form.
- `2026-08-15` — **agent-copy: the hub's copy config was DEAD, and the viewer had no record payload.** Two separate findings. (1) `browse/listConfig.tsx` already carried a `copy` block, but with `showRow: false` AND `showToolbar: false` — `MatrxDataTable` gates every copy control on those two flags, so the hub rendered no per-row pair, no view copy and no ExportMenu. The config was configuration that did nothing; an import-grep for `agent-copy/CopyButtons` cannot see this class of gap, which is why it read as "no coverage" rather than "broken coverage". Both flags are on now (the toolbar brings its ExportMenu for free), and the block gained `agentRow`, `rowAttributes`, `listAttributes` and a `keyFieldsAiVariant` (reused from marketing `copy-payloads.ts`, not forked). `rowKind` changed `transcript` → `transcript-hub-item` and `listKind` → `transcript-hub-list`: the hub is heterogeneous and its rows carry metadata only, so letting a bodyless row share the `transcript` slug with the viewer's segment-carrying record would tell a future agent the two are interchangeable — the real per-row kind now travels in `rowAttributes.kind`. `listAttributes` reports `rows_total` from the RPC's `total_count` so a paged view states what it is a slice OF. (2) New `features/transcripts/format.ts` holds the shared summaries/projections AND the pure `shortenTranscript(segments, opts)` builder — no React, callable by any AI feature without clicking. `TranscriptViewer` gained the record pair: default "Transcript (full)", variants "Details only" and "Last 50 segments", and an **`aiCustom` composer** with the four honest levers for this shape (segments from the end · timestamps on/off · speaker labels on/off · per-segment char cap). A transcript is the "massive" size class, and it is the one surface in this cluster with real knobs. **Omitted segments are always stubbed**, never silently dropped: the builder emits `[N earlier segments omitted — covering HH:MM:SS to HH:MM:SS]` so the agent knows the conversation did not start where the text does. The payload also honors the what-I-see law — while the inline body editor is open the LIVE textarea buffer is authoritative and the payload is flagged `UNSAVED EDIT IN PROGRESS`, because copying stored segments after the user edited them would hand the agent text no longer on screen. The existing plain "Copy transcript text" button and `ReferenceCopyButton` are untouched. Also added an `ExportMenu` (JSON record · CSV segments · TXT body). `pnpm type-check` clean; the two pre-existing `react-hooks/preserve-manual-memoization` lint errors in `TranscriptViewer` are unchanged (verified identical on the baseline). Not wired: per-segment pairs, because segments are rendered by the shared `AdvancedTranscriptViewer` in `components/mardown-display/`, which is outside this cluster and has other consumers.
- `2026-08-12` — **Legacy booleans cut (canonical-DB changeover).** `transcripts.transcripts` dropped `is_deleted`/`is_public`; `deleted_at` is the only soft-delete signal and `visibility` the only access driver. All service reads switched to `.is("deleted_at", null)`, delete stamps `deleted_at`; `trx_list_scoped` + `get_user_dashboard_metrics` repointed in the same migration (`migrations/transcripts_drop_legacy_booleans.sql`). Both tables certified via `iam.canonical_certify_ok`.
- `2026-08-11` — **Every AI pass under `/transcripts` streams live (THE FLOATING LAW).** The Studio's four passes, Scribe's re-clean, and the Clean pad's up-to-four concurrent runs no longer sit behind a spinner. Details in [`features/transcript-studio/FEATURE.md`](../transcript-studio/FEATURE.md) and [`features/transcription-cleanup/FEATURE.md`](../transcription-cleanup/FEATURE.md); the rule itself is [`features/window-panels/FEATURE.md`](../window-panels/FEATURE.md) § THE FLOATING LAW. **Any new transcription surface that launches an agent inherits it — bind the run and float it, never a loader.**
- `2026-08-10` — **Transcripts viewer is agent-writable (4 surface write targets).** `matrx-user/transcripts` now declares `writeTargets`, and `TranscriptViewer`'s existing `SurfaceRuntimeProvider` (which had `getScope` but no `getWriteHandlers`) registers handlers for all four. `transcript_title`, `transcript_description` and `transcript_speaker_label` are `mode:"entity"`, `applyPolicy:"ask"`, and go through the canonical `updateTranscript` thunk — the same path `handleUpdateMetadata` and the per-segment edit dialog already use, so there is no second write path and no raw supabase; `transcript_speaker_label` rewrites one speaker's label across every segment it appears in via the existing `{segments}` write. `transcript_body` is `mode:"draft"`: it stages into `setEditContent` and opens the inline editor, so the proposed text lands under the existing Save/Cancel bar and nothing persists until the user saves. Mode was chosen per field by whether the read twin can observe the buffer — `getEditorApplicationScope` already overrides `content` with the live textarea while `isEditingContent` is true (so the body draft is visible evidence), whereas `editTitle`/`editDescription` only render while `isEditingMetadata` is true and no declared value ever reflects them. Every handler validates its own shape and THROWS on a bad one (the writeback seam turns the throw into the agent's error), and refuses when no transcript is open. Tags and folder are deliberately NOT writable despite `UpdateTranscriptInput` accepting them: this viewer shows tags read-only and has no folder control, so an agent could set something the user cannot see staged or fix in place. Deletion, Promote-to-Studio, source/audio identity and playback transport stay undeclared. Live-verified end to end with a real Badass Agent run on a throwaway transcript (both entity writes persisted and confirmed by SQL; the body draft staged without touching stored `segments`; decline, forced-invalid input, and an undeclared tags/folder ask all behaved); zero `surface-writeback` error captures.
- `2026-08-08` — **Hub rebuilt on the canonical entity-list shell.**
  `/transcripts` is now the second consumer of `lib/entity-list` (config in
  `features/transcripts/browse/`): ONE server-paged list over the new
  `trx_list_scoped` / `trx_list_scope_counts` / `trx_list_facets` RPCs
  (`migrations/trx_list_scoped.sql`, applied + ledgered), collapsing the five
  hub row shapes to one `kind`-typed row (transcript | session | cleanup |
  unsorted) with mine/orgs/shared/public scopes, relevance-ranked search
  (`trx_search_score`, agx tiers), per-column server filters (duration /
  word-count buckets included), true counts, and inline title rename routed
  per kind. The sectioned hub stack was deleted (`TranscriptsHubTable`,
  hub cards/sections, grouping/sort/filter utils, `transcriptsHubService`,
  hub types/constants). Nested session→recording grouping is dropped pending
  a MatrxDataTable hierarchy concept (a decision in `.matrx/ARMAN_TASKS.md`);
  row actions are read-only (open/copy) — chip `TASK-EL-TRXACTIONS`.
- `2026-08-08` — **Transcript hub review repair.** `/transcripts` now exposes
  an explicit Mine / organization scope control (Mine by default) and applies
  that scope to processor, studio, cleanup, detached-recording, active-recording,
  and parent-hydration reads. Phone and tablet list/nested views reuse the
  canonical hub card instead of clipping desktop table columns; the route has
  one semantic H1, compact shell navigation, and large mobile action targets
  inside drawers and content surfaces. The
  required live relationship inspection also removed the forbidden
  `_mirror_proj` / `_mirror_task` triggers and `transcripts_project_id_fkey`
  through `transcripts_remove_forbidden_relationship_dependencies.sql`.
- 2026-07-28 — D75 fixed: TranscriptsSidebar row wrapper is a role=button div (keyboard Enter/Space), killing the nested-button DOM violation.

- `2026-07-26` — **TranscriptsContext DELETED → Redux.** The app-root `TranscriptsProvider` (wrapped every authenticated route to serve this one route family) is gone: list state lives in `features/transcripts/redux/transcriptsSlice.ts` (+ thunks owning the realtime channel, refetch-on-change now debounced 500ms), consumed via `features/transcripts/hooks/useTranscripts.ts` — identical API surface, so components changed one import line. Nothing transcripts-related mounts globally anymore.
- `2026-07-24` — Surface-manifest canonicalization: `matrx-user/transcripts` now declares canonical value groups (`transcript_identity` / `playback` / `segments` / `speakers` / `editor_state`) and 12 previously-undeclared loaded values (created/updated timestamps, draft flag, metadata recordingDate/wordCount, segment/speaker counts, video file id, live audio duration/volume, plus `current_segment` and `playback_state` composites). Emitter (`buildTranscriptsContextData` / `useTranscriptsSurfaceScope` / `TranscriptViewer`) emits them all, and `editor_mode` now truthfully reports `edit-segments` while the inline body editor is open. DB manifest sync pending.
- `2026-07-22` — Mine-scoped `searchTranscripts` / `getTranscriptsByFolder` / `getTranscriptsByTag` in `transcriptsService.ts` (`.eq("user_id", userId)`) and added `// VIEW LAW:` comments in `transcriptsHubService.ts`, clearing THE VIEW LAW's bare-RLS guard findings for this feature.
- `2026-07-20` — Removed the obsolete Audio Recorder Test suite from the transcripts admin resource map after the demo tree was deleted.
- `2026-07-15` — Routed upload and recording transcription through aidream's authenticated catalog STT endpoints; removed the duplicate Next Groq middle tier.

- `2026-07-10` — **Header Surface Agents chrome: live scope.** `TranscriptViewer` mounts `SurfaceRuntimeProvider` (`matrx-user/transcripts`); Run uses editor scope while body-editing, otherwise viewer scope.
- `2026-07-08` — **Cross-device audio recovery via eager chunk upload (FOUND_DEFECTS D7).** New `features/audio/services/audioChunkJournal.ts`: while recording, `useChunkedRecordAndTranscribe` fire-and-forgets each chunk to `cld_files` (hidden `.matrx-tmp/transcripts` staging, `ephemeral: true`) and journals it in `transcripts.studio_recording_chunks` keyed by `safety_id` (migration `migrations/studio_recording_chunks.sql`, applied + ledgered + db-types regenerated; owner-only canonical RLS via `iam.apply_rls`). `reconcileStuckRecordingsThunk` gains a second recovery layer: when a segment has `audio_path IS NULL` and the blob is NOT in this device's IndexedDB, it reassembles the audio from the journaled chunks (index-order concat, byte-identical to the live full-blob assembly) and re-uploads via `uploadRecordingAudioThunk`. Journal is swept on durable upload success, card delete, and recovery-banner dismiss. IndexedDB safety net untouched — the journal is an additional layer.
- `2026-07-06` — **Hub layout: three independent views.** `/transcripts` toolbar now exposes mutually exclusive List / Grid / Nested list modes (`transcripts-hub-view`: `list` | `grid` | `nested`); nested grouping is no longer a separate toggle layered on table view. Legacy `cards`/`table` + `transcripts-hub-group` prefs migrate on read.
- `2026-06-23` — **Transcripts surface fully agent-wired (`matrx-user/transcripts`).** Added pure `agent-context/buildTranscriptsContextData.ts` (baselines + customs, shared by the runtime hook) + `transcriptsExtraSections.ts`. `TranscriptViewer` now mounts the context menu on both the presentational transcript (read-only, `getApplicationScope` from the live DOM selection) and the inline body editor (`isEditable`, with `ProTextarea` carrying `surfaceName` + `getApplicationScope`); metadata title/description swapped to `ProInput`/`ProTextarea`. No manifest/SurfaceValue change (every emitted value was already declared).
- `2026-06-17` — **Studio uses shared transcripts mode nav.** `StudioLayout` portals `TranscriptsListHeader` (All / New / Process / Studio / Scribe / Clean) into the shell header — same escape hatch as `/transcripts` and `/transcripts/cleanup`. Session actions live in `ActiveSessionView`'s local toolbar instead of `StudioHeaderPortal` (removed).
- `2026-06-17` — **Hub tree row UX.** Grouped table uses a dedicated tree-gutter column (chevron on expandable parents, `CornerDownRight` on children) with aligned name column — fixes child rows visually attaching to the wrong parent.
- `2026-06-17` — **Hub grouping is table-only.** Removed grouped cards; grouping uses the same `TranscriptsHubTable` with parent-only sort/filter, collapsed-by-default fold rows, child rows on muted background + indent. Group toggle auto-switches to table; toolbar toggles use primary active state.
- `2026-06-17` — **Hub parent grouping fix.** Grouping loads all accessible active recording segments (not only the current paginated hub page) and hydrates missing parent sessions into the tree so Studio sessions with multi-recording children group correctly even when the parent session is off the first page.
- `2026-06-17` — **Hub parent grouping toggle.** `/transcripts` search bar gains a tree icon (`transcripts-hub-group` in localStorage). When on, recordings nest under their session/cleanup parent, detached unsorted nest under the source session when loaded, and linked sessions/cleanup nest under the processor transcript. Collapsible groups in card and table views; active recordings fetched on demand via `fetchActiveRecordingHubItems`.
- `2026-06-17` — **Hub session/cleanup cards show recording + character counts.** New `migrations/studio_session_metrics_rpc.sql` adds `studio_session_metrics(p_session_ids uuid[])` — `SECURITY INVOKER` (RLS-respecting), returning per-session `recording_count` (non-detached recordings) + `char_count` (active cleaned text length, raw fallback). `transcriptsHubService.enrichSessionMetrics` calls it ONCE per page after the PostgREST page lands (no N+1; best-effort — a failure leaves counts null, cards just omit the line). `SessionHubItem`/`CleanupHubItem` gained `recordingCount`/`charCount`; `TranscriptsHubCard` renders "N recordings · M chars" in the metadata row (each omitted when zero). Applied live + ledgered + `db-types` regenerated.
- `2026-06-15` — **Imported audio stays visible; only mic recordings are hidden.** `saveAudioToStorage` now takes a `{ source: "recording" | "import" }` option. `recording` (default) is unchanged — tagged `origin: "transcripts"`, relocated/hidden by the backend under `system-files/transcripts/...`. `import` (only `AudioImportDialog`) is treated as an ordinary VISIBLE user file: no `origin` tag (backend leaves it in place), original filename preserved, stored under `Transcripts/Imports`. Rationale: a file the user deliberately chose is theirs to see; hiding it (the prior behavior — everything went through `origin: "transcripts"`) was wrong. No backend change needed — anything not in the origin→system-folder map is untouched.
- `2026-06-15` — Processor UX: `?focus=` deep-link selects the target recording; header + per-segment copy icons always visible; sidebar inline rename; inline transcript text editor.
- `2026-06-10` — claude: Created as the canonical core-storage contract for all `/transcripts` routes (two record stores + `cld_files` audio, bridge-only conversion). Corrected README's stale deprecated file backend-bucket claims; fixed stale `types.ts` comments.
- `2026-07-22` — claude: THE VIEW LAW rollout. `fetchTranscripts`/`fetchTranscriptsPaginated` now take a `ListScope` (default "mine") via `lib/list-scope/applyListScope`; `getDraftTranscripts` and the processor/session/cleanup hub lists in `transcriptsHubService.ts` gained explicit `user_id` mine-scoping. `TranscriptsContext` carries the declared scope + `setScope`; `TranscriptsSidebar` wires the new `ListScopeSwitcher` (Mine + org chips; no Shared yet — no shared-with-me RPC for transcripts) as the reference implementation.

---

> **Keep-docs-live rule (CLAUDE.md):** after any substantive change to this feature, update this file's status, add flows you introduced/removed, and append to the Change log.
