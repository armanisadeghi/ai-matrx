# FEATURE.md — `transcripts`

**Status:** `stable`
**Tier:** `1`
**Last updated:** `2026-06-17`

---

## Purpose

The canonical store for finished transcripts (one row, one JSONB `segments` blob) plus the processor workspace that records, uploads, transcribes, and edits them. This doc is also the **core-storage contract** for the whole `/transcripts` ecosystem — read it before building or modifying any transcription surface.

---

## The core-storage contract

Every route under `app/(core)/transcripts/` stores through exactly **two record stores and one audio store**. No third store, ever.

| Store | What lives there | Single access path |
|---|---|---|
| `transcripts` table | Finished, one-shot transcripts (JSONB `segments` blob per row) | `features/transcripts/service/transcriptsService.ts` |
| `studio_*` tables | Live session data — per-segment rows, recordings, cleaned passes, documents, settings | `features/transcript-studio/service/studioService.ts` |
| `cld_files` (universal file handler) | ALL audio/video bytes | `features/transcripts/service/audioStorageService.ts` → `fileHandler` |

**Route → store map:**

| Route | Record store |
|---|---|
| `/transcripts` (list), `/transcripts/processor` | `transcripts` |
| `/transcripts/studio` | `studio_sessions` (`source <> 'cleanup'` by default) |
| `/transcripts/scribe`, `/transcripts/scribe/[sessionId]`, `/transcripts/scribe/unsorted` | `studio_sessions` |
| `/transcripts/cleanup` | `studio_sessions` with `source='cleanup'` |

**Rules:**

- **Conversion between the two record stores goes ONLY through** `features/transcript-studio/service/transcriptBridge.ts` (`promoteTranscriptToStudio` / `saveStudioAsTranscript`). Both directions live in one file so the rules can't drift; sessions and transcripts cross-reference via `studio_sessions.transcript_id`.
- **`audio_file_path` / `video_file_path` / `studio_recording_segments.audio_path` hold `cld_files` UUIDs, NOT bucket paths.** Upload via `saveAudioToStorage`, play via `useFileSrc` / `getSignedUrl`, delete via `deleteAudioFromStorage`. No `supabase.storage` anywhere (ESLint enforces repo-wide).
- **A new transcription surface consumes one of the two record stores.** Need session-shaped data → `studio_sessions` with a new `source` value (see `features/transcription-cleanup/FEATURE.md` for the pattern). Need a finished document → `transcripts`. Inventing a third store is the failure class this contract exists to kill.
- Transcription compute (Groq Whisper) runs via `/api/audio/transcribe` + `/api/audio/transcribe-url` and the `features/audio` hooks (`useRecordAndTranscribe`, `useChunkedRecordAndTranscribe`) — never a parallel pipeline.

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
- `TranscriptViewer.tsx` mounts `UnifiedAgentContextMenu` on both the presentational rendered transcript (`isEditable={false}`) and the inline body editor (`isEditable`, `surfaceName` + `getApplicationScope` on its `ProTextarea`). Manifest: `features/surfaces/manifests/transcripts.manifest.ts`.

**Components** — `components/`: `TranscriptsListPage` (list island), `TranscriptsLayout` / `TranscriptsHeader` / `TranscriptsSidebar` (processor shell), `TranscriptViewer`, `CreateTranscriptModal` (upload / upload+transcribe), `ImportTranscriptModal`, `RecordingInterface` / `RecordingPreview` / `DraftIndicator`, `DeleteTranscriptDialog`.

---

## Admin map

The whole transcription ecosystem is catalogued at **`/transcripts/admin`** (`app/(core)/transcripts/admin/page.tsx`). Add any new transcript-related route / panel / component to that config — drift warnings catch misses.

---

## Data model

**`transcripts` table** — `id`, `user_id`, `title`, `description`, `segments jsonb` (`TranscriptSegment[]`), `metadata jsonb` (duration / wordCount / segmentCount / speakers), `audio_file_path` + `video_file_path` (**`cld_files` UUIDs**), `source_type` (`audio|video|meeting|interview|other`), `tags text[]`, `folder_name`, `is_deleted` (soft delete), `is_draft` + `draft_saved_at`, timestamps. Migration: `migrations/create_transcripts_table.sql` (applied live; the DB is the source of truth).

**Key types** — `Transcript`, `TranscriptSegment`, `CreateTranscriptInput`, `UpdateTranscriptInput` (`types.ts`).

---

## Key flows

**Record → draft → finalize (processor):** `RecordingInterface` records → `saveAudioToStorage` uploads to `cld_files` → transcription via `features/audio` hooks → `saveDraftTranscript` (`is_draft=true`) → user reviews in `RecordingPreview` → `finalizeDraft`.

**Upload & transcribe:** `CreateTranscriptModal` → `saveAudioToStorage` → `getAudioUrl` (signed URL) → `/api/audio/transcribe-url` (Groq Whisper) → `createTranscript` with segments + `audio_file_path = fileId`.

**Delete:** `DeleteTranscriptDialog` → `deleteTranscript` → hard-deletes audio/video from `cld_files` via the handler, then soft-deletes the row (`is_deleted=true`).

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

- `2026-06-23` — **Transcripts surface fully agent-wired (`matrx-user/transcripts`).** Added pure `agent-context/buildTranscriptsContextData.ts` (baselines + customs, shared by the runtime hook) + `transcriptsExtraSections.ts`. `TranscriptViewer` now mounts the context menu on both the presentational transcript (read-only, `getApplicationScope` from the live DOM selection) and the inline body editor (`isEditable`, with `ProTextarea` carrying `surfaceName` + `getApplicationScope`); metadata title/description swapped to `ProInput`/`ProTextarea`. No manifest/SurfaceValue change (every emitted value was already declared).
- `2026-06-17` — **Studio uses shared transcripts mode nav.** `StudioLayout` portals `TranscriptsListHeader` (All / New / Process / Studio / Scribe / Clean) into the shell header — same escape hatch as `/transcripts` and `/transcripts/cleanup`. Session actions live in `ActiveSessionView`'s local toolbar instead of `StudioHeaderPortal` (removed).
- `2026-06-17` — **Hub tree row UX.** Grouped table uses a dedicated tree-gutter column (chevron on expandable parents, `CornerDownRight` on children) with aligned name column — fixes child rows visually attaching to the wrong parent.
- `2026-06-17` — **Hub grouping is table-only.** Removed grouped cards; grouping uses the same `TranscriptsHubTable` with parent-only sort/filter, collapsed-by-default fold rows, child rows on muted background + indent. Group toggle auto-switches to table; toolbar toggles use primary active state.
- `2026-06-17` — **Hub parent grouping fix.** Grouping loads all accessible active recording segments (not only the current paginated hub page) and hydrates missing parent sessions into the tree so Studio sessions with multi-recording children group correctly even when the parent session is off the first page.
- `2026-06-17` — **Hub parent grouping toggle.** `/transcripts` search bar gains a tree icon (`transcripts-hub-group` in localStorage). When on, recordings nest under their session/cleanup parent, detached unsorted nest under the source session when loaded, and linked sessions/cleanup nest under the processor transcript. Collapsible groups in card and table views; active recordings fetched on demand via `fetchActiveRecordingHubItems`.
- `2026-06-17` — **Hub session/cleanup cards show recording + character counts.** New `migrations/studio_session_metrics_rpc.sql` adds `studio_session_metrics(p_session_ids uuid[])` — `SECURITY INVOKER` (RLS-respecting), returning per-session `recording_count` (non-detached recordings) + `char_count` (active cleaned text length, raw fallback). `transcriptsHubService.enrichSessionMetrics` calls it ONCE per page after the PostgREST page lands (no N+1; best-effort — a failure leaves counts null, cards just omit the line). `SessionHubItem`/`CleanupHubItem` gained `recordingCount`/`charCount`; `TranscriptsHubCard` renders "N recordings · M chars" in the metadata row (each omitted when zero). Applied live + ledgered + `db-types` regenerated.
- `2026-06-15` — **Imported audio stays visible; only mic recordings are hidden.** `saveAudioToStorage` now takes a `{ source: "recording" | "import" }` option. `recording` (default) is unchanged — tagged `origin: "transcripts"`, relocated/hidden by the backend under `system-files/transcripts/...`. `import` (only `AudioImportDialog`) is treated as an ordinary VISIBLE user file: no `origin` tag (backend leaves it in place), original filename preserved, stored under `Transcripts/Imports`. Rationale: a file the user deliberately chose is theirs to see; hiding it (the prior behavior — everything went through `origin: "transcripts"`) was wrong. No backend change needed — anything not in the origin→system-folder map is untouched.
- `2026-06-15` — Processor UX: `?focus=` deep-link selects the target recording; header + per-segment copy icons always visible; sidebar inline rename; inline transcript text editor.
- `2026-06-10` — claude: Created as the canonical core-storage contract for all `/transcripts` routes (two record stores + `cld_files` audio, bridge-only conversion). Corrected README's stale Supabase-Storage-bucket claims; fixed stale `types.ts` comments.

---

> **Keep-docs-live rule (CLAUDE.md):** after any substantive change to this feature, update this file's status, add flows you introduced/removed, and append to the Change log.
