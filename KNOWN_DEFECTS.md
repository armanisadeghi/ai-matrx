# KNOWN DEFECTS — AI Matrx Admin (frontend)

The running ledger of known bugs, gaps, and "must never happen again" classes of
failure on the frontend. Mirrors the backend's `KNOWN_DEFECTS.md` in aidream.

**Rules of this file**
- When you discover a defect you can't fully fix in the moment, add it here with
  enough context to act on it cold. A defect that lives only in a chat log is a
  defect that will recur.
- When you fix a defect, move it to **Resolved** with the commit/approach — don't
  delete it (the history is the institutional memory).
- Each entry: **what**, **why it happened**, **the fence(s) that prevent the
  class**, and **what's still open**.
- CLAUDE.md links here. Read both before touching files, media, or persistence.

---

## OPEN

### D14 — War Room: live audio-session recording does NOT survive a tab-switch; agent sees only the active session's transcript
**Severity: medium — recording data persists (no data loss), but the live capture/UI drops when the user switches a tile's tab, and the thread agent can't read a tile's non-active recordings.**

**What.**
1. (`db72068b`) Recording an audio *session* (`CleanupPad` → `useChunkedRecordAndTranscribe`) is owned by the tile's Audio tab; switching the tile to another tab unmounts `CleanupPad` and tears the recording engine down (the app-root mic singleton survives, but the per-session chunking/transcription lifecycle does not). The mic *capture* now survives navigation (app-root `GlobalRecordingProvider` + `micStream`), and the false "Recording" badge is fixed (`useTilePulse` reads the live `recordings` slice), but the recording *session* should be owned above the tab (a room-level media controller) so the engine isn't unmounted.
2. (`00e37f34`) A tile's transcript context (`session_cleaned`) is built by `assistantContextBuilder` for the **active** studio session only; a tile with multiple audio sessions exposes just one → the thread agent gets `[not_found]` for the rest. The `war_room` manifest no longer over-promises `session_cleaned` (points to the data tool), but the durable fix is to hydrate ALL of the tile's audio sessions and emit a per-session transcript key.

**Why.** War Room reused the studio recorder by embedding it in the tab; the recording lifecycle + the studio context builder are both single-active-session by construction.

**The fence (not yet built).** A room-level media slice/controller that owns the active recording across tab switches; `assistantContextBuilder` (or a war-room hydration thunk) binds every `studio_session` assignment of the tile and emits per-session transcript context.

**What's open.** Both fences. Touch points: `features/transcription-cleanup/components/CleanupPad.tsx`, `features/audio/hooks/useChunkedRecordAndTranscribe.ts`, `features/transcript-studio/service/assistantContextBuilder.ts`, `features/war-room/components/tile/TileAgentPanel.tsx`, `features/war-room/service/warRoomAgentContext.ts`, `features/war-room/redux/thunks.ts`.

### D13 — Audio: TTS speaker routing relies on a global `AudioContext` constructor monkeypatch (Chromium-only, next-utterance granularity)
**Severity: low — speaker selection works for media elements everywhere it's supported; only the Cartesia TTS path uses the patch, and it's a no-op unless a non-default speaker is chosen.**

**What.** `<audio>`/`<video>` output routes cleanly via `HTMLMediaElement.setSinkId` (`InlineMediaRef`, Chrome/FF). The Cartesia `WebPlayer` builds a private per-utterance `AudioContext` with no handle, so [`installAudioContextSinkRouting`](features/audio/audioOutputSink.ts) patches the global `AudioContext` constructor to apply the chosen sink to every new context (opt-out via `NO_SINK_ROUTING` for the mic meter + capture). A device change applies to the *next* utterance, not mid-playback; Firefox/Safari have no `AudioContext.setSinkId` so TTS stays on the system default there.

**Why.** Cartesia's SDK exposes no sink handle and we chose not to fork it.

**The fence / cleaner path.** A small forked sink-aware player (the SDK's `WebPlayer` is ~140 lines) routed through a media element we control — removes the global monkeypatch and gives mid-utterance re-routing. Decision deferred to the owner (the patch is guarded: installs once, Chromium-only, no-op on default, preserves prototype/`instanceof`, screams on `setSinkId` failure).

**What's open.** (a) The owner's call on patch-vs-fork; (b) the `MicDeviceMenu` caret is on `ProInput`/`ProTextarea` only — wire it onto the dedicated scribe record button if wanted; (c) `videoConference.defaultMicrophone/defaultSpeaker` are superseded by `userPreferences.audioDevices` but not yet folded in (unify when convenient); (d) real-browser sanity check that Cartesia playback + voice-agent capture behave with a non-default speaker selected.

### D12 — `selectContextPayload` drops entry-level `label` / `type`, so compact (string-valued) context objects reach the backend WITHOUT their authored label
**Severity: low — cosmetic. The model still receives the content; only the manifest label is the humanized key instead of the authored one.**

**What.** [`selectContextPayload`](features/agents/redux/execution-system/instance-context/instance-context.selectors.ts) builds the request `context` dict as `payload[entry.key] = entry.value` — it forwards ONLY the value, dropping the entry's `label` / `type` / `slotMatched`. For entries whose value is a plain string (every `recording_NN_raw` / `session_cleaned` from `assistantContextBuilder`), the backend never sees the authored `label` ("Recording 1 — raw transcript (with [t=…s]…)") and humanizes the key ("Recording 01 Raw") in the `<available_context>` manifest instead.

**Why it happened.** The wire shape predates the backend's rich-form support; the selector was written when context was a flat `key→string` map.

**The workaround in use.** An entry that needs metadata on the wire ships a **rich-form value** — a dict `{ content, type, label, description, max_inline_chars }` (the selector passes the value through untouched, so the dict survives). `working_document` (`buildWorkingDocumentContextValue`) and the `session_brief` / `project_tasks` / `project_overview` entries (`sessionResourceContext`) all do this; it is also how they control inline-vs-deferred.

**The fence (not yet built).** Make `selectContextPayload` wrap a PRIMITIVE value that carries entry metadata into rich form (`{ content: value, type, label }`) so authored labels reach the backend for every entry without each builder hand-rolling a dict. Behavior-preserving — the backend treats `{content,…}` ≤200 chars identically to a bare string. Deferred here because it touches the shared payload for EVERY agent and the only payoff is nicer manifest labels; not worth bundling into a hot fix that ships straight to main.

**What's open.** The wrap above. Until then, only rich-form values carry `label` / `max_inline_chars` to the backend.

### D11 — Per-turn context snapshot is captured client-side but NOT persisted to `cx_message.metadata` (backend-gated)
**Severity: medium — was an active "the UI lies" bug; now contained. Live turns are truthful; reloaded historical turns show NO context instead of a fake one (honest but incomplete).**

**What.** The user-message context indicator (`ContextSlotChipStrip` inside [`AgentUserMessage.tsx`](features/agents/components/messages-display/user/AgentUserMessage.tsx)) used to read the **live, conversation-level** `instanceContext`, so every historical user bubble — across every conversation — displayed the *current* context as if the model had actually received it. That is a dangerous lie: it claims per-turn context tracking that did not exist.

**Fix shipped (frontend).** [`execute-instance.thunk.ts`](features/agents/redux/execution-system/thunks/execute-instance.thunk.ts) now freezes the turn's real context entries (`selectInstanceContextEntries`) onto the optimistic user message's `metadata.context_snapshot` at submit. `AgentUserMessage` renders **only** that snapshot (`ContextSlotChipStrip entries={...}`) and never falls back to live context — no snapshot → no chips. So in-session turns are truthful and historical bubbles stop lying.

**Why it happened.** The strip was wired to a per-conversation live slice with a code comment explicitly deferring per-turn accuracy as "a follow-up." Live state is the wrong source for a historical record.

**The fence that prevents the class.** Historical record components must read a frozen per-record snapshot, never a live global/conversation slice. `ContextSlotChipStrip` keeps its live-selector behavior ONLY when no `entries` snapshot is passed (that path is reserved for "next request" surfaces above the input).

**Full spec for the durable fix:** [`features/agents/docs/CONTEXT_RECORD_SPEC.md`](features/agents/docs/CONTEXT_RECORD_SPEC.md) — verified live (2026-06-19) that NO per-turn or per-conversation context record exists anywhere in Matrx Main, and that the two purpose-built tables (`ctx_context_access_log`, `ctx_user_active_context`) are empty/unwired. The spec defines the access-log wiring + per-turn snapshot table + `metadata.context_snapshot` mirror.

**What's open.**
1. **aidream / matrx-ai backend:** persist the per-turn context the agent actually received onto `cx_message.metadata.context_snapshot` (same shape: `InstanceContextEntry[]`) when reserving the user message, plus the full snapshot per `CONTEXT_RECORD_SPEC.md`. Until then, `messageRowToRecord` returns `{}` for reloaded messages and the bubble shows no context chips after a page reload — honest, but the true context is invisible post-reload.
2. **frontend (post-backend):** once the server stamps it, reloaded conversations will automatically show the correct per-turn context with no further change (the read path already keys off `metadata.context_snapshot`).

### D10 — Picklist → `matrx` fence migration: BOUND scope-cell path not yet flipped (backend-gated)
**Severity: low — FE is fully unified on the canonical FLAT reference; the only open item is the aidream bound scope-cell reader. No data loss.**

**What (FE — DONE, hard cut).** The whole FE now emits and reads the canonical FLAT reference item (`{ list_id, item_id, label? }` — no `purpose`/`slot`/`ref`/`display`) across the 7-type taxonomy. Picklist-bound variable authoring emits the ` ```matrx ` reference fence (`kind:"reference"`, `type:"picklist_item"`) via [`referenceFence.ts`](features/matrx-envelope/referenceFence.ts) (`buildPicklistItemFence`) + `PicklistVariableInput.tsx`. Legacy shapes (old nested item, `picklist_ref` object/array) are NO LONGER silently dual-read — every legacy read is routed through [`features/matrx-envelope/legacyTranslate.ts`](features/matrx-envelope/legacyTranslate.ts), which flattens the value and fires a one-per-value `console.error` so the admin notices and migrates it.

**What (backend — still gated).** A picklist value reaches the backend two ways; only one is verified:
1. **Direct / override `variables`** (FE-controlled) — the fence string is sent as the value, substituted by `replace_variables`, resolved by aidream `substitute.py#stage_reference_fences`. **Works now.**
2. **Bound scope-cell** (server reads the persisted cell) — aidream `aidream/api/utils/scope_binding_resolution.py` still recognizes only the `_is_picklist_ref` dict. A fence-valued cell coerces to its text via `_coerce_variable_value` and would only resolve if `replace_variables` runs before `stage_reference_fences`. **Not verified end-to-end → bound path NOT flipped.**

**Why it matters / the `value_type` caveat.** New picklist context-items persist `value_type='string'` ([`componentValueType.ts`](features/scope-system/utils/componentValueType.ts)) → the fence lands in `value_text`. EXISTING bound picklist items still carry `value_type='object'`/`'array'` in the DB; when re-saved, `buildScopeValuePayload` falls back to `value_text` (a fence string isn't valid JSON), so the value lives in `value_text` while the `value_type` column still says object/array — a drift the backend reader must tolerate (read the actual populated `value_*` column, not just trust `value_type`).

**What's open.**
1. **aidream:** resolve a fence-valued BOUND scope cell — read `value_text`, and ensure `replace_variables` → `stage_reference_fences` ordering applies to the bound-variable substitution chain. Verify before relying on the bound path.
2. **aidream:** decide handling for existing `picklist_ref` scope-cell rows (back-compat decoder vs. a one-time backfill) and tolerate the `value_type` column drift above for re-saved items. Legacy rows now surface a loud FE `console.error` when rendered (see `legacyTranslate`), making them easy to find and migrate.
3. **aidream (post-FE):** once (1)+(2) hold end-to-end, retire the legacy `picklist_ref` variable path and drop it from the `validate_envelope_registry.py` parallel-encoding allowlist. Then remove the FE `@deprecated` `PicklistRefEnvelope` / `isPicklistRef` (`features/agents/types/agent-definition.types.ts`) and the `legacyTranslate.ts` seam.

### D9 — Scribe: agent edits to the working document apply all-at-once, not streamed
**Severity: low — a UX gap, not data loss. Deferred: needs an aidream change.**

**What.** When the Scribe assistant edits the working document, the edit appears all at once after the turn finishes, not token-by-token like a chat response streams.

**Why it happens.** The agent writes the doc server-side via `ctx_patch`; the client only learns of it through the `context_changed` stream event, which carries **no content** — so the client re-fetches the doc after the turn (for bound docs) and can't render incremental deltas (`instance-working-document.thunks.ts`). True live streaming requires aidream to emit working-document **deltas** as a dedicated event (like chat tokens), which the client would apply incrementally.

**Fence / status.** Deferred per the 2026-06-17 Scribe-improvements spec (Feature 8: "implement if achievable without significant work, else defer and document the blocker"). No data loss — the final content always lands; only the live-typing feel is missing.

**What's open.** aidream: stream working-document edit deltas as a dedicated event type. FE: incremental apply in `instance-working-document.thunks.ts` / the working-doc editors once the backend emits deltas.

### D8 — `item_presentation`: `session` + `message` open seed-only (no canonical table); other gap types use the generic detail window
**Severity: low — every type now opens a window; two open without DB enrichment, and the generic window is a read-only detail view (not the type's full editor).**

**What.** The opener gap is closed. `agent`, `note`, `file`/`image`/`video`/`audio`, and `picklist` open their bespoke windows; **every other recognized type opens the generic `ItemDetailWindow`** (`features/window-panels/windows/item-detail/ItemDetailWindow.tsx`), which fetches the full row via the registry's `detailSource` and renders every populated field. Two gaps remain:
1. **`session` + `message` are seed-only.** Neither has a single canonical table — `session` could be `ctx_war_room_sessions` / `studio_sessions` / `window_sessions` / `quiz_sessions`; `message` could be `cx_message` / `messages` / `dm_messages` / `sms_messages`. Rather than guess, their registry entries have `open` but no `detailSource`, so the window opens showing the agent-provided name/about + "no additional details." Pick a canonical table per type and add `detailSource` to light up full enrichment.
2. **The generic window is read-only.** It's a clean detail view, not the type's real editor (e.g. a task board card, a project workspace). Upgrading a type to a bespoke window is one branch above the generic cases in `useOpenItemPresentation` + the bespoke window itself. Candidate bespoke targets: `task`, `project`, `scope` (note: `scopeEditWindow` needs `scopeTypeId`+`organizationId`, so a by-id open must fetch those first), `document` (`workingDocumentWindow` is `conversationId`-keyed, not `udt_documents`), `email` (`emailDialogWindow` is compose-only).

**Fence.** `canOpen` only flips true when `config.open` is set; `useOpenItemPresentation` always resolves a recognized openable type to *some* window (bespoke or generic). `ItemDetailWindow` soft-fails on missing `detailSource`, missing row, RLS block, and network error — every state renders a calm message, never a throw.

### D7 — Scribe: mobile mic re-prompts + recoverable-but-orphaned audio
**Severity: high — violates the platform's "never lose audio" promise on mobile. Investigated 2026-06-14; recovery half is a known, scoped fix, the permission half needs device testing.**

**What.** On mobile, `/transcripts/scribe` (a) re-prompts for mic permission repeatedly and (b) has dropped audio + lost transcripts.

**Findings (the recorder engine itself is sound).** `useChunkedRecordAndTranscribe` already: shares one warm OS grant via `features/audio/micStream.ts` (ref-counted + 3-min keepalive, so repeated record taps don't re-prompt), persists every chunk to IndexedDB *before* transcription, runs a stop-time full-blob fallback when any chunk failed, bounds chunk fetches with `AbortController`, and flushes on `pagehide`. So the loss is NOT in capture.

**Two real causes:**
1. **Re-prompts** are not from the recorder (it reuses the warm grant). The likely source is **iOS ending/​muting the mic track on interruption** (lock screen, app switch, an incoming call, or switching the scribe Record↔Live tabs where `features/voice-agent/audio/audioCapture.ts` opens its *own* `AudioContext` and may clone the track). When the track's `readyState` flips off, `micStream.acquireMicStream` drops it and the next acquire re-prompts. There is **no `track.onended`/`onmute` handling** in `micStream.ts` and **no interruption/visibility recovery**, so this is silent and unmitigated. NOTE: graceful re-acquire on iOS inherently re-prompts — the real mitigation is keeping the grant + context warm across tab switches and surfacing the interruption loudly rather than silently re-acquiring.
2. **Lost audio/transcript** has a concrete, documented hole: the crash-safe IndexedDB id (`safetyId`, on `ChunkCompleteInfo` + `useChunkedRecordAndTranscribe.getSafetyId()`) is **never written to the `studio_recording_segments` row**. So when a recording is stranded (page reload/crash/back-to-back start before finalize, or chunks never uploaded on bad network), `reconcileStuckRecordingsThunk` can derive `t_end` from raw chunks but **cannot recover the AUDIO** — it lives only in IndexedDB keyed by a `safetyId` the row doesn't know. `AudioRecoveryProvider` handles same-device orphans by scanning IndexedDB, but isn't linked to the specific stranded segment.

**The fix.**
- **Recovery — DONE (2026-06-14).** `migrations/studio_recording_segments_safety_id.sql` (applied live + ledgered) adds `safety_id text`. `useStudioSession` persists it the FIRST chunk it learns the id (`persistRecordingSafetyIdThunk`), so a crash BEFORE finalize still carries a recovery pointer. `reconcileStuckRecordingsThunk` (runs on session load) now, for any segment with `audio_path IS NULL` + a `safety_id` whose blob is still in IndexedDB, re-uploads it via `uploadRecordingAudioThunk` and screams (loud recovery). Closes same-device-after-reload loss. **Still open:** cross-device recovery needs the blob uploaded eagerly (chunk-by-chunk to `cld_files`) rather than only kept in this device's IndexedDB — today a recording captured on a phone that never finished uploading can only be recovered from that same phone.
- **Permissions — HARDENED (2026-06-14), needs device verification.** `micStream.ts` now attaches `track.onended`/`onmute`/`onunmute` + a `navigator.permissions` microphone watcher and exposes `subscribeMicInterruption`; `useChunkedRecordAndTranscribe` raises a **loud** `MIC_INTERRUPTED` error on a hard end / permission-revoke mid-recording (chunks so far are already safe in IndexedDB) instead of silently dropping. New `features/audio/audioContext.ts` is ONE shared, resumable AudioContext for the level meter — the recorder no longer does `new AudioContext()` per instance (which churned contexts and risked iOS exhaustion → a recording that silently fails to start); capture is independent of it, so this can't affect the never-lose-audio path. The warm grant is already preserved across Record/Agent/Live tab switches (the Live tab uses `acquire/releaseMicStream`, never hard-stops). **Still needs verification on a real phone:** iOS inherently re-prompts when re-acquiring after a hard track-end — these changes make interruptions loud + cut context churn, which should reduce (not provably eliminate) the re-prompting; only a device run confirms the felt behavior. **Open next:** cross-device eager audio upload (chunk-by-chunk to `cld_files`) so a phone recording survives even if that phone never finishes the background upload.

**Fence.** Capture already never loses audio locally (IndexedDB-first). The gap is *recovery linkage* (safety_id on the row) and *interruption visibility* (loud track-end handling). Both are additive — neither weakens the existing safety net.

### D6 — Window geometry restore keyed by `overlayId`, but windows register by `id`/slug
**Severity: low — saved window size/position silently doesn't restore for affected windows; no data loss.**

**What.** `WindowPersistenceManager` builds restore entries keyed by `overlayId` (`windowEntries[overlayId] = { id: overlayId, … }`) and `restoreWindowState` only applies geometry when `state.windows[overlayId]` exists. But `WindowPanel` registers in `windowManagerSlice` under its `id` prop (the registry **slug**), which differs from `overlayId` for many windows — e.g. `agentSettingsWindow` registers as `agent-settings-window`. For those, the saved rect/state is silently skipped on load (the window opens at its default center instead). Discovered while fixing the silent-render class (D-fix 2026-06-14); the new render watchdog side-steps it for *detection* via `ackOverlayRender` (resolves the real window id), but persistence restore itself is still mismatched.

**Fence.** Cosmetic only — the window still opens and is visible (the silent-render guard guarantees that); just not at its remembered geometry. Fix is to key restore by the slug-derived window id (the same id `WindowPanel` uses), in `WindowPersistenceManager` + `restoreWindowState`.

### D3 — Agent Find Usages + Drift: never browser/prod-verified + DM sender identity
**Severity: low — built, every RPC server-verified; full checklist in [`docs/handoffs/AGENT_FIND_USAGES_DRIFT_HANDOFF.md`](docs/handoffs/AGENT_FIND_USAGES_DRIFT_HANDOFF.md).**

**What.** The Find Usages + Drift subsystem (see [`features/agents/FEATURE.md`](features/agents/FEATURE.md) → Find Usages & Drift) is verified at the data/RPC layer (registry sync 42 rows/0 broken pins; weekly scan 30 groups dedup-clean; report deterministic; remediation repins v1→v3; history-counts works post-`agx_usage_005`). Open:
1. **Never exercised in a browser or on prod.** The DM *send* has never actually inserted a row (stubbed in every test); aidream isn't deployed (startup sync / weekly cron / `/agent-usage/*` HTTP endpoints unrun over a real request); the windows, agents-page banner, DM chips, and the remediation/notify click flows weren't browser-driven (the shared `AgentUsagesEngine` WAS, via the report drill-in). Run the §5 checklist in the handoff after deploy.
2. **DM sender identity.** Drift DMs send from the platform operator's *personal* super-admin user (`4cf62e4e-…`, env-overridable via `MATRX_SYSTEM_DM_SENDER_USER_ID`). A dedicated "Matrx System" bot auth-user is the clean later swap — purely cosmetic (messages show a real human's name as sender until then).

**Fence.** The weekly scan fingerprint-dedups so a re-verify run can't double-notify; the registry sync writes only on real deployments (`strict_startup_gates`) so a laptop can't mark prod keys vanished. Broken code pins scream (`record_error` + red log) without crashing boot.

### D1 — Media durability: public/owned media must never be a signed, expiring URL
**Severity: high — silently breaks public pages days later.**

**What.** Generated podcast media (covers, audio, per-clip videos) was persisted
into `pc_episodes.image_url` / `audio_url` / `video_url` as **expiring signed S3
URLs** (`matrx-user-files.s3.amazonaws.com/…?X-Amz-Signature=…&Expires=…`). The
public episode page (`/podcast/[slug]`, viewed by anonymous users) renders these
directly, so once the signature expires the images/audio break — silently, days
after creation. Older episodes stored durable public-bucket / `cdn.matrxserver.com`
URLs and work fine; the new pipeline regressed.

**Why it happened (multiple mistakes, both sides).**
1. **Backend (root):** the media agents persist with the default
   `visibility="private"` (`packages/matrx-ai/.../providers/base_media.py:_persist_asset`),
   which yields a signed S3 URL. The orchestrator captures that URL string and
   `_persist_episode` (router `aidream/api/routers/podcast_generator.py`) writes it
   verbatim into `pc_episodes`. The *official video* already does it right
   (`visibility="public"` → permanent CDN) — proof the fix is a one-knob change.
2. **Frontend:** the public episode/show pages render media with **raw `<img>` /
   `<video>`** (`features/podcasts/components/player/PodcastEpisodePage.tsx`,
   `PodcastShowPage.tsx`, `PodcastGrid.tsx`) instead of the canonical
   `<InlineMediaRef>`, with hide-on-error and no fallback — so a broken URL just
   vanishes. This violated CLAUDE.md's "every file flow funnels through
   `@/features/files`" rule, and there was no lint rule enforcing it.

**The fences (defense in depth).**
| Layer | Status | Mechanism |
|---|---|---|
| 1. Server persists media PUBLIC at generation | **DONE (backend, pending deploy)** | `aidream/api/routers/podcast_generator.py` `_persist_episode` now runs every media URL through `aidream/services/media_durability.py#make_urls_durable(owner_user_id=...)` **before** writing `pc_episodes` — flipping each private file to public (`SyncEngine.change_visibility_async`) and minting its CDN URL. Deliberately scoped to the podcast persist boundary so the **global** media default (`base_media._persist_asset`) stays `private` — flipping that would make every AI image/audio/video on the platform public (a privacy regression). The official composed video is already public → passes through unchanged. |
| 2. DB-edge guard | **DONE + ROLLED OUT** | `migrations/mtx_public_media_url_guard.sql` — registry (`mtx_public_url_guard`) + generic trigger that, on any write of a non-durable URL to a registered column, RAISES a loud WARNING and queues a heal job (`mtx_media_heal_queue`). Reusable for any table/column. Non-blocking. `migrations/mtx_public_media_url_guard_rollout.sql` (2026-06-08) made the trigger **array-aware** (`text[]` columns checked element-by-element) and registered every other public-read media column: `pc_shows.{image_url,og_image_url,thumbnail_url}`, `aga_apps.{preview_image_url,favicon_url}`, `shared_canvas_items.thumbnail_url`, `site_metadata.{logo_url,default_share_image_url}`, `custom_app_configs.image_url`, `custom_applet_configs.image_url`, `wf_template.preview_image_url`, `pc_studio_runs.{audio_url,selected_cover_url,image_urls[],video_urls[]}`. Existing non-durable rows backfilled (incl. 2 studio-run array rows). 9 tables guarded total. |
| 3. Frontend classifier + loud logger | **DONE** | `lib/media/durability.ts` — `classifyMediaUrl` / `isDurableMediaUrl` (twin of the DB classifier) + `reportMediaDurabilityViolation()` which screams in the console when an expiring URL reaches a render/store path (so the defect can't be ignored). |
| 4. Canonical render component re-mints | **DONE (podcasts)** | `<InlineMediaRef>` now extended with ambient/preview video flags (`autoPlay`/`loop`/`muted`/`playsInline`/`controls`/`preload`), so it covers background video — no more raw `<video>`. Every podcast display surface migrated: show hero, episode hero (metadata + ambient video), grid backdrop, studio `AssetCard` (image + video). **Authed** studio uses `podcastMediaRef()` (file_id → re-mint, durable for owners); **public/anonymous** pages pass the durable URL string directly (anonymous CANNOT re-mint a file_id, so they rely on layer 1/2/heal for durability) and get the informative error fallback instead of a silently-vanishing cover. Justified exception: `PodcastAudioPlayer`'s headless `<audio>` (custom transport) stays raw + documented. |
| 5. Heal the backlog | **TOOL BUILT — run pending authorization** | The existing leaked rows are healed server-side (works cross-user, unlike a per-owner frontend drain — the 5 broken episodes span 2 users). `aidream/scripts/flip_files_public.py` (a thin CLI over `media_durability.flip_file_to_public`) flips a batch of file_ids to public + reports CDN URLs; the `pc_episodes` rewrite + `mtx_media_heal_queue` mark-healed is then applied via SQL. Dry-run verified (16 files for the 5 episodes all resolve, all `private`, 0 errors). Running the real flip mutates 2 real users' production media, so it needs an explicit go-ahead. The same primitive is what generation-time layer 1 uses, so the classifier never drifts. |

**What's still open.**
- **Agent chat audio (`audio_output` / `media_block(kind=audio)`) is served as a raw
  signed S3 URL.** Same root as podcasts: the media agent persists the generated
  `.wav` with the default `visibility="private"`, so the backend `/files/{id}/url`
  endpoint mints `matrx-user-files.s3.amazonaws.com/…?AWSAccessKeyId=…&Signature=…&Expires=…`.
  The new `components/mardown-display/blocks/audio/AudioOutputBlockRenderer.tsx`
  renders correctly via the file handler (`useFileSrc` from `file_id`) and the URL
  plays/downloads/copies, but it is still expiring + S3 — so it WILL break when the
  signature expires and the link should never be surfaced to users. **Fix is backend:**
  persist agent audio public (or proxy via an our-domain durable URL) the same way
  podcast layer 1 flips visibility. Frontend logs the resolved shape via
  `console.log("[audio-block] resolved", …)` (no longer a `console.error` overlay,
  since this is a tracked backend gap). When the backend serves durable URLs this
  note can close.
- **Run the heal on the 5-episode backlog** — `aidream/scripts/flip_files_public.py`
  is built + dry-run-verified; the real flip (16 files, 2 users) needs an explicit
  go-ahead because it mutates production media. After the flip, rewrite each
  `pc_episodes` media column to the CDN URL and mark the matching
  `mtx_media_heal_queue` rows `healed`.
- **Deploy the backend** so layer 1 (generation-time durability) goes live. Until
  then, newly generated episodes keep getting queued by the guard (but the guard +
  heal tool catch them).
- **A pg_cron + pg_net automated healer** (the fully-hands-off version): a cron job
  drains `mtx_media_heal_queue` by calling a small aidream "flip file + rewrite
  column" endpoint (wrap `flip_files_public.py`'s logic in a service-token route).
  This makes the heal continuous instead of a manual run.
- **`pc_studio_runs` array columns** (`image_urls[]`, `video_urls[]`) — 1 run is
  queued. These are internal generation records (not the public-facing break), so
  lower priority; the same primitive heals them, just element-by-element.
- **Public pages still use raw `<img>`** — DONE for podcasts. Remaining sweep:
  agent-app `appImageUrl` renders (`features/applet/home/**`, `Banner.tsx`) and the
  `/p/[slug]` public app surfaces — their source columns are already guarded
  (`aga_apps.preview_image_url`), so this is render-polish, not a durability gap.
  (Not covered by the podcast ESLint fence — a future fence could extend to these.)

**Fences that fully landed (2026-06-08).**
- **Lint enforcement** — DONE. `eslint.config.mjs` bans raw `<img>`/`<video>` in
  `features/podcasts/**` (`no-restricted-syntax`), pointing at `<InlineMediaRef>`.
  Verified: fires on a raw `<img>`, clean on the migrated pages. The headless
  `<audio>` transport in `PodcastAudioPlayer` is the one documented exception.
- **Server root fix** — wired (layer 1 above), pending deploy.
- **Heal tooling** — `aidream/services/media_durability.py` (shared classifier +
  `flip_file_to_public` / `make_url(s)_durable`) consumed by BOTH the generation
  path and the heal CLI, so the durable-vs-expiring classifier can never drift
  across the generation fix, the heal tool, the frontend (`lib/media/durability.ts`),
  and the DB guard (`mtx_is_durable_media_url`).

**Update — 2026-06-21: "owned image goes dark" regression + codebase-wide self-heal sweep.**
- **What.** Owned AI-generated images in real conversations rendered "Image
  unavailable" forever once their signature expired — a direct violation of the
  load-bearing rule (*a user's own file URL never just "expires"; re-mint from
  `file_id`*).
- **Why.** Two compounding regressions: (a) `from-image-output-data.ts` classified
  signed URLs with a **SigV4-only** regex, but our image backend mints **SigV2**
  (`AWSAccessKeyId`/`Signature`/`Expires=`), so SigV2 owned URLs were misread as
  *permanent CDN* → re-mint was skipped; (b) the global expiry-wheel that used to
  proactively re-mint was removed, deleting the safety net that had masked (a). The
  `fromCxMediaPart` adapter also dropped the top-level `file_id`, so even the
  on-demand re-mint had no identity to mint from.
- **The fences.**
  1. **Canonical signed-URL primitive** — `lib/media/signed-url.ts`
     (`isSignedUrl` / `signedUrlExpiresAtMs`) knows **both** AWS dialects. Every
     detector now routes through it (`from-image-output-data.ts`,
     `parse-signed-url-expiry.ts`, `lib/media/durability.ts`,
     `lib/media/our-file-sources.ts`, `features/files/handler/output/target.ts`,
     `components/image/cloud/resolveCloudFileUrl.ts`, and the blob-cache service
     worker `features/files/cache/service-worker/src/sw.ts`). No more dialect-blind
     classification anywhere.
  2. **Owned-file invariant in the unified hooks** — `useUnifiedImageUrl` /
     `useUnifiedVideoUrl`: never treat a signed URL as a permanent `cdnUrl`, only
     serve a signed URL with a *proven-future* expiry, always allow minting for an
     owned `file_id`, and an `onError`→invalidate+re-mint backstop in the renderers
     (`UnifiedImageBlockRenderer`, `UnifiedVideoBlockRenderer`, `InlineMediaRef`).
  3. **Raw-URL self-heal primitive** — `features/files/handler/hooks/useRemintableSrc.ts`.
     For surfaces holding only a *URL string* (markdown `![](signed-url)`, legacy
     `audioUrl` props) it recognizes our-own URLs, recovers the `file_id`, and
     re-mints on load failure. Consumed by the markdown `ImageBlock` / `VideoBlock`
     (which the splitter routes our-own image/video links to *before* the
     handler-backed `matrx_file` path) and the legacy raw-`<audio>` surfaces
     (`cx-chat` / `cx-conversation` / `prompts` assistant messages). Closes the same
     bug class in the one remaining path where owned media reached a raw element.
  4. **CLAUDE.md rule** — a one-sentence firm statement of the invariant added to
     the Media durability section.
- **What's still open (low severity, self-recovering).**
  - **File-preview previewers** (`FilePreview/previewers/SvgPreview.tsx`,
    `AudioPreview.tsx`) and **`MediaThumbnail` (`ImageThumb`)** render from a signed
    `url` / `publicUrl` with a *terminal* `onError` (icon/error UI, no in-view
    re-mint). They are NOT the dark-forever bug — the parent re-mints from `file_id`
    on every mount, so they recover on reopen; only an *in-view* expiry of a
    long-open preview fails to recover, and `publicUrl` is durable by the DB guard.
    Cheap fix when desired: route the element through `useRemintableSrc` (it
    recovers the `file_id` from the signed URL).
  - **`MediaVariableInput`** previously handed `<InlineMediaRef>` the resolved
    signed-URL string instead of the `file_id` (losing re-mint ability) — **fixed**
    2026-06-21 (now passes the bare `file_id`).

---

### D2 — Org/scope authorization boundary is open (deferred to the pre-launch security overhaul)
**Severity: critical — full multi-tenant compromise via raw supabase-js. Deferred by explicit decision (2026-06-10): app is not live; features first, dedicated security overhaul next week. Build anything NEW with proper auth anyway.**

**What.** The browser talks to Supabase directly with the user's JWT, so RLS + RPC bodies are the only write-authorization boundary — and they are open in five independent ways (all live-verified against `txzxabzwovsujtloxrus`):
1. **Org takeover.** `organization_members` INSERT policy is `WITH CHECK (true)` — any authenticated user can insert themselves as `owner` of ANY org, then passes every `EXISTS(member where role in owner/admin)` check repo-wide. No guarding trigger.
2. **Role self-escalation.** `organization_members` UPDATE has `with_check = null` with `qual: user_id = auth.uid() OR admin` — a plain member can set their own row to `owner`.
3. **Unauthenticated DEFINER RPCs.** `create_scope`, `update_scope`, `delete_scope`, `create_scope_type` perform **zero** caller checks and EXECUTE is granted to PUBLIC/anon — cross-org write/delete needing only a target UUID. `delete_scope_type` CASCADEs items → every cell + every scope of the type (irrecoverable data loss, blast radius reported only *after* deletion). (`set_entity_scopes` was fixed 2026-06-10 — `migrations/ctx_set_entity_scopes_auth.sql` is the membership-check + `REVOKE FROM anon` pattern to replicate.)
4. **Membership-graph disclosure.** `organization_members` SELECT is `qual = true` for `public` — full user↔org↔role enumeration across all orgs.
5. **Spoofable identity in `set_context_value`.** `acting_user_id` payload fallback applies when `auth.uid()` is NULL (anon path). `set_scope_context_value` (the live cell-write RPC) has NO in-function check at all.

**Why it happened.** Policies were widened to make direct client inserts work (e.g. invitation accept used to insert `organization_members` directly), and the DEFINER RPC family shipped without auth preambles.

**The fence (to build in the overhaul).** Apply the `protected-resources` doctrine to org membership + ctx mutations: deny direct writes at RLS, one DEFINER RPC family with `is_org_member`/`is_org_admin` preambles + `REVOKE FROM anon` (model: `accept_organization_invitation`, `set_context_value`'s membership check, and `ctx_set_entity_scopes_auth.sql`), DB-enforced ≥1-owner invariant, and a role-change guard trigger.

**What's still open.** All of items 1–5 except the `set_entity_scopes` fix. Also from the same audit, lower-tier: org create is non-atomic (orphan org row if the owner-member insert fails — burned slug, invisible org), last-owner removal is a client-only TOCTOU (org can reach zero owners), `transfer_organization_ownership` RPC exists but is never called, and the invite/resend API routes rely solely on RLS instead of checking `auth_is_org_admin` in code. Full prioritized audit: `~/.claude/plans/you-are-conducting-an-polymorphic-dragonfly.md`.

---

### D3 — PDF reversible-redaction keys: client-only custody until KMS escrow lands
**Severity: medium — browser data loss = permanently unrecoverable redacted text.**

**What.** Reversible-redaction session keys live ONLY in the redacting browser's
IndexedDB (`features/file-analysis/redact/session-keys.ts`); `redaction_mapping`
holds ciphertext+nonce. Clearing browser data / switching devices makes those
spans cryptographically unrecoverable. The org-recovery model exists
(`pdf_redaction_key_escrow`, applied 2026-06-11) but its WRITE PATH is
intentionally unwired: keys must be KMS-wrapped (security team's interface),
and storing raw keys server-side would silently weaken the custody model.
Mitigation today: MaskDialog's KeyHandoff acknowledgment + destructive-mode
ConfirmDialog. **Close by:** wiring wrap/unwrap once the KMS interface exists.

### D5 — Foreign user-scoped shortcut-category LABELS visible to everyone (empty groups)
**Severity: low — name disclosure + menu noise, no item leak. Fold into the D2 security overhaul.**

**What.** `shortcut_categories` carries a legacy permissive policy
`shortcut_categories_select_any USING (true)`, so every user can read every
category row — including other users' personal category labels (e.g. "School",
"Learn Coding"). After the `agx_context_menu_view` security_invoker fix
(2026-06-12, `migrations/agx_context_menu_view_security_invoker.sql`) the
*items* inside foreign categories are correctly filtered by RLS, so these
categories render as empty groups in the unified context menu.

**Why it happened.** The permissive policy predates the scoped
`shortcut_categories_read` policy and was never retired; policies OR together.

**The fence.** Drop `shortcut_categories_select_any` during the security
overhaul (the scoped read policy already covers global + own + member-org).
Check first whether any admin UI legitimately depends on listing all
categories — if so, that path moves to a super-admin RPC.

**What's still open.** The policy drop itself.

### D4 — PDF W5 scale items pending (500-page client-normal band)
**Severity: medium — degraded UX on large docs, no data risk.**

**What.** Remaining from the 2026-06-11 PDF consolidation (plan
`~/.claude/plans/feature-deep-dive-audit-rustling-hare.md`):
PdfStudioReader mounts all page blocks (no virtualization); render-all/split
build ZIPs in memory server-side (bounded but unstreamed); AI clean/extract
on >200pp runs as a held request instead of the resumable per-page job model
(Operational Default: resume from last clean page preserving overlap).
Also open: reading-order viewer tab; verify aidream variant pipeline renders
PDF page-1 grid thumbnails.

### D5 — Mermaid render block is web-only (other surfaces + chat-scoped agents pending)
**Severity: low — feature works fully on web; gaps are reach, not correctness.**

**What's deferred (by design, this build).**
1. **Extension / desktop / mobile renderers.** The server-side block pipeline
   already emits typed `mermaid` blocks (aidream `block_detector.py`
   `SPECIAL_CODE_LANGUAGES` + `mermaid_parser.py`), but those clients don't
   consume server-processed blocks yet, so they have no mermaid renderer. Tracked
   by the `is_active=false` rows in `skl_render_components` (chrome-extension /
   desktop / mobile). When a client switches to server-side processing, flip its
   row active and add the renderer — the contract is already there.
2. **`skl_resources` are not agent-reachable.** `skill_get` returns the skill
   body only (aidream `tools/implementations/skill.py`), so the per-diagram-type
   syntax reference lives inside the `mermaid-diagrams` skill body, not as
   resource rows. Revisit if/when resources get an injection path.
3. **Chat right-click surfaces assistant-message agents, not mermaid-scoped
   ones.** `MarkdownContextMenuProvider` is one instance per conversation with a
   single `surfaceName` (`matrx-user/assistant-message`); per-block surface
   switching doesn't exist. So right-clicking a mermaid block passes the diagram
   DSL as context (`data-block-source` → `diagram_source`) to whatever agent the
   user picks, but mermaid-*scoped* agents live in the workbench AI rail (reached
   via the block's Edit button), not the chat right-click menu. The captured
   round-trip ("edit and send back into the artifact") is the workbench by
   design — the chat menu is discovery + data hand-off. Per-block-type menu
   filtering is the documented v2 (dynamic-contexts extension of
   `useUnifiedAgentContextMenu`).

**Also noted (pre-existing, surfaced by this build):** `PREFERENCE_MODULE_KEYS`
in `userPreferencesSlice.ts` omits `sandbox` / `transcription` /
`agentConnections` — those modules never persist via partialize. The new
`mermaid` module WAS added (it persists); the older three are an unrelated gap
left untouched.

**The fence.** Each item is a clean one-step unlock (flip a row + add a renderer;
add a resource injection path; build dynamic-context menu filtering) — none block
the web feature.

### D6 — The SEPARATE tool-viz `dynamic/` code-runner is broken (a duplicate to delete, NOT the canonical runtime)
**Severity: low — it's a redundant duplicate; the canonical code-runner works and is what we build on.**

**Status: root cause re-scoped (2026-06-20).** Inserting a valid v2 `tool_ui` row and rendering it via `DynamicInlineRenderer` hangs (fetch OK, `@babel/standalone` + capability chunks load 200, but `compileToolUiComponent` never resolves — stuck "Loading tool display…", no error). **Originally suspected to be `compile-core`/Babel itself — that was WRONG.** The **canonical applet runtime** (Agent Apps, which shares the *same* `compile-core` Babel + `new Function` path) **renders a `fully_custom` Babel-compiled component fine in local dev** (verified: `/p/ap-world-lesson` renders). So Babel/`compile-core` are NOT the problem — the hang is specific to the tool-viz `dynamic/` runner's OWN code path (its separate `buildToolRendererScope` / fetch-compile-cache logic), which is a **narrower, duplicate** code-runner that never had a working renderer.

**Resolution path:** do NOT repair the duplicate. **Consolidate tool visualization onto the canonical applet runtime** (`features/agent-apps` + shared `compile-core`), then **delete** `features/tool-call-visualization/dynamic/` (compiler, separate scope builder, `DynamicToolRenderer`, v1 stub, `contract_version`). One canonical code-runner, zero duplicates. Tracked in `features/tool-call-visualization/OVERHAUL_STATUS.md` (Tracks 1 + 2). Until then, tools without an in-code renderer fall back to `GenericRenderer` correctly.

## RESOLVED

### R2 — All 11 remaining severed overlay callbacks (D7) were dead — deleted (2026-06-14)
**What.** The 11 `undefined /* pass via callbackGroupId */` stubs that remained after R1 (`EmailDialogWindow.onSubmit`; `ResourcePickerWindow.{onResourceSelected,onSettingsClick,onDebugClick}`; `QuickSaveCodeDialog.{onOpenChange,onSaved}`; `QuickNoteSaveOverlay.onSaved`×2; `FullscreenBrokerState.onOpen`, `FullscreenMarkdownEditor.onOpen`, `FullscreenSocketAccordion.onOpen`, `ImageViewerWindow.onIndexChange`) were each audited and confirmed to have **zero consumers** — no callsite passed a handler and the relevant opener hooks had no callers. So every one was the *delete-dead-prop* completion, not a callback-group rewire.

**Fix.** For each: removed the controller stub, removed the now-unused prop (+ destructure + internal `onOpen?.()`/guard) from the component, and removed the dead option from the opener (interface + dispatched `data` + Controller effect deps). `EmailDialogWindow` now closes synchronously on a valid submit (the dead async send path is gone). `QuickSaveCodeDialog` dropped its legacy `open`/`onOpenChange`/`onSaved` (now `isOpen`/`onClose` only); `QuickNoteSaveOverlay` dropped `onSaved`. The `resourcePickerWindow` overlay branch was deleted wholesale (it was never opened — both real consumers, `ResourcePickerButton` + `SmartAgentResourcePickerButton`, render the component directly — and `onResourceSelected` is *required*, so the branch was a latent `undefined is not a function` crash); its dead opener file `features/overlays/openers/resourcePickerWindow.tsx` was removed. `ImageViewerWindow` kept the body `ImageViewer`'s controlled-index props (the window shell legitimately uses them to sync its thumbnail sidebar) but `ImageViewerWindowProps` now `Omit`s them, closing the dead external/overlay surface.

**Result.** `grep "pass via callbackGroupId" features/overlays/OverlayController.tsx` → **0**. The `resourcePickerWindow` id is intentionally retained in `features/overlays/catalogue.ts` + `features/window-panels/registry/overlay-ids.ts` (harmless metadata) because the still-used `ResourcePickerWindow` component declares `overlayId="resourcePickerWindow"` on its `WindowPanel`; removing the `OverlayId` union member would type-error there. D7 is closed.

### R1 — Chat "Edit" / "Edit & resubmit" silently did nothing (severed editor `onSave`) + two missing RPCs (2026-06-14)
**What.** Editing a user message or "Edit & resubmit" opened the editor but Save did nothing; "Edit content" (overflow) and "HTML preview → Save" were broken the same way. Root cause: `OverlayController` hard-coded `fullScreenEditor.onSave={undefined}` (and `htmlPreview.onSave`) — a function can't travel through Redux, but the replacement callback channel was never wired (the D7 class). Compounding it, two RPCs the resubmit/delete paths called had **never been created** in the DB (`cx_message_soft_delete`, `cx_truncate_conversation_after`), so even once `onSave` fired, Overwrite + Delete would fail server-side.

**Fence.** (1) `fullScreenEditor` is now callback-aware (`features/overlays/callbacks/fullScreenEditor.ts` + `callbackManager`); the bridge prefers the callback, else self-handles via `editMessage` for any `conversationId`+`messageId`, else **screams** (toast + console.error — loud recovery, never silent). (2) `htmlPreview` self-handles its save. (3) Both RPCs built + applied (`migrations/cx_message_soft_delete_and_truncate.sql`) — SECURITY DEFINER + `auth.uid()` owner-check + GRANT (matching `cx_message_set_content`), tool-call/artifact/media cascade; dead feature-detect fallbacks removed. (4) Attachments survive edits via `mergeEditedText`. (5) The dead `editAndResubmitItem` menu factory (same landmine) was deleted. (6) Swept the severed-`onSave`-in-data pattern out of `rich-document` edit/fullscreen-editor/server-api handlers, `PromptSystemMessage`, and the admin `srv-replace-with-summary` item (callback group or self-handle). (7) **Fixed a second, independent bug** the save-fix surfaced: "Edit & resubmit → Fork" forked at `position−1` (excluding the edited message) so it silently no-op'd for any message past turn 1; now forks at the message's own position and re-runs (verified mid-conversation, original untouched). Bug *class* documented in [`features/overlays/FEATURE.md`](features/overlays/FEATURE.md); the 11 sibling severed controller callbacks tracked as **D7**.

**Still open (smaller, same class):** `rich-document/export.ts` html-preview save-back works for chat messages (bridge self-handles) but NOT for note/non-chat sources — that needs the `htmlPreview` overlay itself to become callback-aware (it isn't yet; only `fullScreenEditor` is). And `content-actions` (`ContentActionBar`/`contentActionRegistry`) has the editable `onSave` path wired to raw-Redux-data — latent (no live consumer passes `onSave` today, so read-only-safe), but it'll silently fail the day one does.
