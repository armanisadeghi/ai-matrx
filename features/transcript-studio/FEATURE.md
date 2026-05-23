# FEATURE.md — `transcript-studio`

**Status:** `scaffolded`
**Tier:** `1`
**Last updated:** `2026-05-07`

---

## Purpose

A 4-column live transcription workspace. Users record audio, see raw transcript stream into Column 1, watch an AI agent clean it in Column 2 every ~30s, see concepts extracted by a different agent in Column 3 every ~200s, and configure Column 4 with a pluggable module (default: action-item tasks; alternates: flashcards, decisions, quiz). Built for long sessions (1–3h meetings, lectures) with crash-safe IndexedDB safeguarding.

---

## Entry points

**Routes**
- `app/(a)/transcription/studio/` — full-page workspace, sidebar + active session view. Public URL: `/transcription/studio` (see `next.config.js` redirects from `/transcript-studio`).
- `app/(a)/transcription/mobile/` — mobile-first capture + audio-first assistant. Public URL: `/transcription/mobile`. Reuses the same session + segment data layer; SSR-seeds via `StudioHydrator`, resolves/creates an active session in `MobileStudioRoute`, then mounts `MobileStudioScreen`.

**Mobile capture + assistant** (`components/mobile/`)
- `MobileStudioScreen.tsx` — controller with a `capture | assistant` screen toggle; activates the session (wires realtime) and loads recording/raw/cleaned segments + documents on mount.
- `MobileCaptureScreen.tsx` — big record button + audio-reactive ring, pause/resume/stop, live transcript strip, and the recording-card list. Each re-tap of record after stop opens a new cycle.
- `RecordingCardList.tsx` / `RecordingCard.tsx` — one card per recording cycle (`studio_recording_segments`). Multi-select (checkbox + long-press) → bottom Keep/Delete bar (`confirm` + `deleteRecordingSegmentThunk`). Tap/long-press → full transcript drawer. Per-card audio playback via `useFileSrc(audio_path)` → HTML5 `<audio>`.
- `FullTranscriptDrawer.tsx` — Drawer showing one cycle's raw transcript with a `ContentActionBar`.
- `AssistantScreen.tsx` — the audio-first assistant: working-document panel + "Read aloud" (`useCartesia`), `AgentConversationDisplay` for messages, and an `AgentMicrophoneButton` + textarea + Send input.

**Hooks**
- `hooks/useStudioAssistant.ts` — creates one assistant conversation per session (kept in the slice), ensures the working document, and rebuilds the named context objects (`recording_NN_raw` / `session_cleaned` / `working_document`) before each turn.
- `service/assistantContextBuilder.ts` — builds the `setContextEntries` payload, including the mutable+persisted `working_document` rich context object (`source.kind = "studio_document"`).

**Window panel**
- `features/window-panels/windows/transcript-studio/TranscriptStudioWindow.tsx` — same `StudioView` inside a floating `WindowPanel` (`overlayId: "transcriptStudioWindow"`, slug: `"transcript-studio-window"`).
- Discoverable from the Tools grid (`Voice` category, "Transcript Studio" tile).
- URL deep-link: `?panels=studio` opens the window; `?panels=studio:<sessionId>` deep-links to a session.
- Persists `activeSessionId` to `window_sessions.data` via `useWindowPersistence` so the last-open session restores on remount.

**Components**
- `features/transcript-studio/components/StudioView.tsx` — config-driven core. Both the route and the (future) window mount this component.
- `features/transcript-studio/components/StudioLayout.tsx` — sidebar + main area shell with mobile drawer.
- `features/transcript-studio/components/StudioSidebar.tsx` — session list + new-session button.
- `features/transcript-studio/components/EmptySessionState.tsx` — empty workspace before any session is selected.
- `features/transcript-studio/components/ActiveSessionPlaceholder.tsx` — Phase 1 stub for the active session view; replaced in Phase 3+.

**Hooks** _(planned, Phases 2–7)_
- `useStudioSession()` — bridges the global recording portal ↔ studio Redux state.
- `useTriggerScheduler()` — drives the 30s / 200s cleaning + concept ticks.
- `useColumnAgent()` — generic shortcut invocation per column.
- `useScrollSync()` — 4-way time-anchored scroll coordination.

**Services**
- `features/transcript-studio/service/studioService.ts` — Supabase CRUD for `studio_sessions`. Phase 2+ will add per-segment helpers.

**Redux slice**
- `features/transcript-studio/redux/slice.ts` — `transcriptStudio` slice. State: `{ byId, activeSessionId, fetchStatus, ui }` where `ui[sessionId]` carries ephemeral autoscroll / cursor-time / leader-column state.

---

## Data model

**Database tables** (Supabase)
- `studio_sessions` — parent. Multi-scope (`user_id`, `organization_id`, `project_id`, `is_public`). `transcript_id` is a nullable FK to `transcripts(id)` for bidirectional conversion with the simpler transcripts feature.
- `studio_recording_segments` — one row per start/stop cycle. `audio_path` holds the durable `cld_files` fileId for the cycle's assembled audio (set by `finalizeRecordingSegmentThunk`); raw chunks link via `studio_raw_segments.recording_segment_id`. Backs the mobile recording cards.
- `studio_documents` — the assistant's collaborative working document (migration `migrations/studio_documents.sql`). Edited server-side via `ctx_patch` (aidream writeback handler `kind="studio_document"`); structurally separate from `studio_cleaned_segments` so the auto-cleanup version is never overwritten. One row per `(session_id, kind)`.
- `studio_raw_segments` — append-only chunk log (Column 1).
- `studio_cleaned_segments` — versioned cleaned text (Column 2). `superseded_at` flips when a later run replaces from the same time anchor forward.
- `studio_concept_items` — Column 3 output (themes, key ideas, entities, questions).
- `studio_module_segments` — Column 4 output (polymorphic `payload jsonb` keyed by `module_id` + `block_type`).
- `studio_runs` — agent invocation audit trail (column 2/3/4, conversation_id, status).
- `studio_session_settings` — 1:1 with session. Per-session shortcut + interval + module overrides; bounds enforced via DB CHECK constraints (`cleaning_interval_ms BETWEEN 15000 AND 120000`, `concept_interval_ms BETWEEN 60000 AND 600000`, `module_interval_ms BETWEEN 15000 AND 1800000`).

RLS uses the canonical `check_resource_access(...)` pattern. Child tables inherit access via `EXISTS` on the parent `studio_sessions` row.

**Migration**
- `migrations/transcript_studio_schema.sql`

**Key types**
- `StudioSession`, `RawSegment`, `CleanedSegment`, `ConceptItem`, `ModuleSegment`, `AgentRun`, `SessionSettings`, `StudioViewConfig` — all in `features/transcript-studio/types.ts`.

---

## Key flows

### Phase 1 (current): list + create session
1. Route SSR-fetches `studio_sessions` via `listSessionsServer`, hands them to `StudioHydrator` which seeds Redux during the first render pass.
2. `StudioView` reads `fetchStatus` and runs a client-side `fetchSessionsThunk()` if SSR didn't seed.
3. `StudioSidebar` renders the list. "New" calls `createSessionThunk({ userId, activate: true })` → inserts a `studio_sessions` row → updates Redux → activates the new session.
4. The active session renders `ActiveSessionPlaceholder` until Phase 3 wires the 4-column workspace.

### Bidirectional conversion (Phase 9)
- "Promote to Studio" on any `transcripts` row → creates a `studio_sessions` row with `transcript_id` set + migrates `transcripts.segments` JSONB into `studio_raw_segments` rows.
- "Save as Transcript" on a studio session → materializes a `transcripts` row and back-links via `transcript_id`.

### Resume-marker cleaning (Phase 5)
- Cleaning prompt embeds the last ~1000 chars of prior cleaned output ending in `[[RESUME]]`, followed by the new raw text since that anchor. The agent replies starting with `[[RESUME]]`; we strip it and replace any `studio_cleaned_segments` rows whose `t_start >= replaceFromTime`.

### Synchronized scrolling (Phase 4)
- Each segment renders a `<div data-tstart=N data-tend=M>` wrapper. A `wheel` / `touchstart` listener flips a column to "leader" for 600ms; while leader, an IntersectionObserver writes `cursorTime` to Redux. The other three columns binary-search their segments for `[t_start, t_end]` containing `cursorTime` and `scrollIntoView`. Per-column "autoscroll" flag pauses when the user scrolls past 80px from the bottom.

---

## Coexistence with `features/transcripts/`

These are sibling features. The simple `features/transcripts/` view is shaped for one-shot, finished transcripts (one JSONB segments blob per row). The studio uses per-segment rows because live append + per-segment realtime + indexed time queries don't fit a hot JSONB blob. Bidirectional one-click conversion is the integration contract — see `service/transcriptBridge.ts` (Phase 9).

---

## Invariants

- Every segment in every column has `t_start`/`t_end` in seconds-from-session-start, paused time excluded. This is the single coordinate system for sync scrolling.
- `studio_raw_segments` is append-only from the application's perspective (RLS allows updates for editor scope, but the recorder must never patch existing rows).
- `studio_cleaned_segments` keeps superseded rows for audit; the active selector filters `superseded_at IS NULL`.
- Module switch mid-session preserves prior module segments tagged with their original `module_id`. The active selector returns segments where `module_id === session.module_id`. A "show prior modules" toggle on the column header (`studio_session_settings.show_prior_modules`) reveals the rest.
- Recording lives in a global provider (Phase 2), not in `StudioView` — recording continues across route navigations.
- All agent runs go through `useShortcutTrigger` / `launchAgentExecution`; never call agents directly.

---

## Change Log

- **2026-05-02** — Phase 1 scaffolding: 8-table schema migrated, slice + thunks + service for sessions CRUD, route + SSR hydrator + sidebar + empty state. Active-session view is a placeholder until Phase 3.
- **2026-05-03** — Phases 2–10 shipped: global recording portal, Column 1 wiring, 4-column shell + sync scroll, cleaning agent (resume marker), concept agent, module column + tasks, settings sidebar, bidirectional `transcripts` ↔ studio conversion, window-panel registration (overlayId `transcriptStudioWindow`, Tools-grid tile, `?panels=studio` deep-link).
- **2026-05-03** — Phase 11: cross-tab realtime via Postgres Changes — `transcriptStudioRealtimeMiddleware` subscribes to `studio_sessions` (user-wide) and to `studio_raw_segments` / `studio_cleaned_segments` / `studio_concept_items` / `studio_module_segments` (active-session-scoped, re-binds on session switch). All five tables added to the `supabase_realtime` publication. Three v1.5 modules registered: `flashcards` (XML `<flashcards>` block), `decisions` (`decision_tree` JSON), `quiz` (`quiz_title` JSON) — each reuses a shared `buildModuleScopeFromInputs` helper. Default shortcut ids are placeholders until the agents are authored.
- **2026-05-03** — Per-column save toolbars: every column header (Raw, Cleaned, Concepts, Module) renders `<ContentActionBar />` from `components/content-actions/` once it has content. Users can Save to Notes (with append/replace), Tasks, Scratch, Code, File, Email, etc. Saves carry session metadata (`session_id`, `session_title`, `column`, plus column-specific fields like `module_id`, `passes`, `concept_count`).
- **2026-05-04** — Realtime middleware critical fix: `studio_cleaned_segments` was subscribed with `event: "*"` and routed every echo (including UPDATEs from inline edits and from the supersede stamp `applyCleanupRun` itself fires) through `cleanedSegmentApplied`, which drops every active row whose `tStart >= segment.tStart`. Result: editing any cleaned segment wiped every later segment. Middleware now splits handlers per event type — INSERT → `cleanedSegmentApplied` (only when not superseded), UPDATE → `cleanedSegmentUpdated` (or `cleanedSegmentRemoved` when supersede stamp lands), DELETE → `cleanedSegmentRemoved`. Same pattern extended to raw / concept / module tables so cross-tab edits and deletes propagate without bleeding into supersede semantics.
- **2026-05-04** — Ordering hardening for paste/audio import: `rawSegmentsAppended` now uses `chunkIndex` as a deterministic tie-breaker on top of `tStart` (collisions can happen when paste's snapshotted `nextTStart` matches a recording chunk landing concurrently). `PasteRawContentDialog` and `AudioImportDialog` re-read the live tail (max chunkIndex / max tEnd) from the store before each insert via `useAppStore().getState()` instead of relying on the captured `useMemo` snapshot, so concurrent recording chunks can't lead to imported segments sharing a `tStart` with live ones.
- **2026-05-04** — Polish + user-control: tasks-module shortcut id wired (`c32f3884-…`); sessions auto-label from the first ~20 chars of raw text (reuses `generateLabelFromContent` from `features/notes/hooks/useAutoLabel`); inline rename via `EditableSessionTitle` in the active header and double-click / pencil in the sidebar; per-row edit + delete on every segment in every column — `EditableTextSegmentRow` for raw, cleaned, and module payloads; `EditableConceptRow` for concept items (kind / label / description). Each delete uses `ConfirmDialog`. New service mutations: `updateRawSegmentText`, `deleteRawSegment`, `updateCleanedSegmentText`, `deleteCleanedSegment`, `updateConceptItem`, `deleteConceptItem`, `updateModuleSegmentPayload`, `deleteModuleSegment`. Soft-delete session from sidebar (per-row trash) and active header. Mobile-friendly active-session view via `StudioColumnsMobile` (tab strip across all 4 columns when `useIsMobile()` is true), with icon-only Save-as-Transcript and Record buttons under the `sm:` breakpoint.
- **2026-05-04** — Layout + import polish:
  - Sidebar is now a resizable+collapsible Panel (react-resizable-panels Group at the layout level, cookie-persisted via `panels:studio-sidebar`, server-decoded in `page.tsx` via `decodeStudioSidebarCookie`). Collapse toggle (`«`) lives in the sidebar header; an "expand" button appears at the top-left of the main area when collapsed.
  - Studio actions hoisted into the global app header via `StudioHeaderPortal` → `<PageSpecificHeader>` (`#shell-header-center` / `#page-specific-header-content`). Title (editable), Save as Transcript, and Record now sit in the always-visible global header. The local studio header is reduced to subtitle + Settings + Delete on desktop. The mobile header still keeps the action buttons inline since the page-specific portal isn't rendered on phones.
  - `RecordButton` and `SaveAsTranscriptButton` shrunk to `h-7` with tighter padding.
  - `RawTranscriptColumn` gained two header buttons:
    - **Paste content** (`+`): opens `PasteRawContentDialog`. Splits pasted text on blank-line breaks, synthesizes per-paragraph timestamps, inserts each as `studio_raw_segments` rows with `source = "imported"`.
    - **Import audio** (`FileAudio`): opens `AudioImportDialog` with three tabs: *Upload file* (drag-drop or browse → `saveAudioToStorage` → signed URL → `/api/audio/transcribe-url`), *From URL* (Supabase Storage URLs only for now), *Cloud Files* (opens the existing `cloudFilesWindow` overlay; user pastes the URL back into the URL tab). Each Whisper segment becomes one `studio_raw_segments` row with timestamps shifted past any existing tail.
  - `StudioLayout` rebuilt to render exactly one branch (mobile vs desktop) via `useIsMobile()` — fixes a duplicate portal target where `<ActiveSessionView>` was mounting twice.
- **2026-05-07** — Route move: full-page studio lives at `/transcription/studio` under `app/(a)/transcription/studio/`. Permanent redirects from `/transcript-studio` in `next.config.js`. Updated in-app links (`PromoteToStudioButton`), metadata/favicon paths, and FEATURE entry points.
- **2026-05-23** (b) — Mobile studio now uses real Next.js routes: `/transcription/mobile` (sessions list), `/transcription/mobile/[sessionId]` (a session), `/transcription/mobile/unsorted`. A section `layout.tsx` SSR-seeds the session list once and frames the phone-width column; navigation uses `next/navigation` + `startTransition`. Refresh, back, and deep-links all work; `MobileStudioRoute` (internal view-state) removed. TTS hooks consolidated onto `lib/cartesia/config.ts` (see `features/audio/FEATURE.md`).
- **2026-05-23** — TTS migrated to Sonic 3.5 + latest API + user voice prefs. New `lib/cartesia/config.ts` is the single source of truth (model `sonic-3.5`, `Cartesia-Version: 2026-03-01`, default voices Skylar/reading + Daniel/assistant, speed 1.2, playback buffer 0.7) with `resolveVoiceId(purpose)` / `resolveSpeed` / `buildGenerationConfig`. Studio Read-aloud now uses the shared `useCartesiaSpeaker({ purpose: "reading" })` (Skylar default, user pref wins) instead of `useCartesia`. Standard speaker + `useCartesia` switched to `generation_config` (speed/volume/emotion), dropping the deprecated `experimentalControls`. Voice Tester updated to the same format (numeric speed/volume, single emotion). See `features/audio/FEATURE.md` for the cross-cutting details.
- **2026-05-22** (e) — Voice Tester fixes. Playback control (pause/resume/stop) is now owned by the returned run handle and driven by the `WebPlayer` — not the synthesis lifecycle — so pause works for the whole of actual playback (ends only when `WebPlayer.play()` resolves). Each run now fully tears down the previous run before starting (kills the "settings apply on the next run" staleness/overlap). Each panel reuses one player, recreated only on buffer change, to avoid AudioContext exhaustion. Added manual voice-id entry, experimental emotion controls (`voice.experimentalControls`), and `continue:false` on send.
- **2026-05-22** (d) — Admin Voice Tester (`/voice/tester`, super-admin only). Standalone side-by-side Cartesia bench (`features/tts/tester/`): one shared transcript drives two configurable panels (model incl. **sonic-3.5**, voice, speed, **client playback buffer**, **server `max_buffer_delay_ms`**, markdown-clean toggle) with time-to-first-audio / total-synth metrics. Default A/B isolates the client playback buffer (1.0s vs 0.25s) to test whether that's the cause of the standard path's choppy pauses. Not wired into the shared TTS path yet — for dialing in the ideal Sonic 3.5 config before migrating.
- **2026-05-22** (c) — Faster, non-blocking recording save. Recording stop now finalizes the row instantly (`finalizeRecordingSegmentThunk` no longer awaits the upload); the audio file uploads in the background via the new `uploadRecordingAudioThunk`, which drives a `uploadingRecordingIds` flag in the slice and a subtle inline "Saving audio" chip on the card (no blocking overlay, controls stay usable). Voice capture is now mono Opus @ 32 kbps (`useChunkedRecordAndTranscribe`), ~4× smaller uploads — transparent for speech/Whisper. Single code path (desktop + mobile go through `useStudioSession`).
- **2026-05-22** (b) — Mobile editing affordances + desktop support. Added a reusable `ActionSheet` (controlled bottom drawer, touch + mouse) powering a session "…" menu (rename via `TextInputDialog` / delete) on both the session header and the Sessions list rows, plus a "More" overflow in each recording card's swipe actions (open transcript, archive/unsort/restore, delete). Working document gained a full-screen **Focused Mode** editor (`FocusedDocumentEditor`) with debounced autosave via the new `updateWorkingDocumentContentThunk`. The Assistant screen can now **Add recording** inline (reuses `useStudioSession`) and, when a take finishes, offers a one-tap "send to assistant for review". `MobileStudioRoute` now renders inside a centered max-width column so swipe distances/tap targets stay sane on desktop. Landing page (`TranscriptionLanding`) links all three surfaces (Studio, Processor, Mobile Capture).
- **2026-05-22** — Mobile UX layer + gestures. Added the **Sessions list** as the mobile landing (`MobileSessionsList`) — the grouping layer above recordings — with new-session, swipe-to-delete, and an **Unsorted** entry; `MobileStudioRoute` now drives list → session → unsorted navigation. Added **iOS-style swipe rows** (`SwipeableRow`, motion-based): on a recording card, swipe-left reveals Archive/Delete (long-swipe deletes), swipe-right reveals Unsort. Two soft-remove states on `studio_recording_segments` (`archived_at` in-place + per-session Archived view; `detached_at` → global Unsorted pool with Restore), plus a denormalized `user_id` (trigger-filled) for the cross-session Unsorted query (migration `studio_recording_segment_archive_detach.sql`). `selectRecordingSegments` now returns active-only so archived/unsorted are excluded from the list AND the assistant context. Assistant input redesigned into one unified bar (mic + field + send) with **audio-first auto-send** on speech end (`AgentMicrophoneButton.onTranscribed`).
- **2026-05-21** — Mobile capture + audio-first assistant (`/transcription/mobile`). Closed the audio-persistence gap: recording cycles now write `studio_recording_segments` rows and upload per-cycle audio (`finalizeRecordingSegmentThunk` via `saveAudioToStorage`), with raw chunks stamped with `recording_segment_id` — each card is independently playable; auto-cleanup (`runCleaningPassThunk`) fires per stop. New `studio_documents` table + the audio-first assistant: `useStudioAssistant` creates one conversation per session and ships the session's transcripts as named context objects (`recording_NN_raw` / `session_cleaned`) plus a mutable `working_document` the agent edits via `ctx_patch` (backend writeback handler `studio_document` in aidream). New "Audio Studio Assistant" builtin `agx_agent` (`AUDIO_ASSISTANT_AGENT_ID`, seed in `migrations/studio_audio_assistant_agent.sql`). Exposed `safetyId` on `useChunkedRecordAndTranscribe` + `ChunkCompleteInfo`. Added recording-segment + document state/selectors/thunks/realtime to the slice.
