# FEATURE.md — `audio` + `tts` + `podcasts`

**Status:** `active`
**Tier:** `2`
**Last updated:** `2026-06-23`

> Combined doc covering the three audio-adjacent features. This doc lives under `features/audio/` as the umbrella.

---

## Purpose

Three sibling features that together form the audio pipeline:

- **`features/audio/`** — audio primitives: recording, playback, voice providers (LiveKit for mobile real-time)
- **`features/tts/`** — text-to-speech with swappable providers (Eleven Labs, Cartesia, etc.)
- **`features/podcasts/`** — podcast generation + episode management

---

## Entry points

**Audio — `features/audio/`**
- `components/`, `hooks/`, `services/`, `utils/`, `providers/`, `voice/`
- `constants.ts`, `types.ts` (no root barrel — import from concrete modules, e.g. `hooks/useRecordAndTranscribe`, `components/TranscriptionLoader`; `VoiceTextarea` / `VoiceInputButton` live under `components/official/`)

**TTS — `features/tts/`**
- `components/`, `hooks/`, `service/`, `constants/`, `context/`
- `types.ts`, `index.ts`, `migrations/`
- `TROUBLESHOOTING.md` (existing)
- `TASK-Eleven-labs-addition.md` (integration note)
- **Routes:** `/voice` (guest marketing landing; authed → `/voice/playground`), `/voice/playground` (`AiVoicePage`), `/voice/tester` (`TtsTesterBench`)

**Podcasts — `features/podcasts/`**
- `components/`, `hooks/`, `service.ts`, `types.ts`, `index.ts`
- `README.md` (existing)

---

## Per-feature summary

### Audio
- Low-level recording / playback hooks
- **LiveKit** for real-time voice conversations (mobile-relevant)
- Provider abstraction in `providers/` and `voice/`
- **Mobile constraint from CLAUDE.md:** LiveKit requires `npx expo prebuild` and is **not Expo Go compatible**

#### Transcription window panels (registry: `features/window-panels/registry/windowRegistryMetadata.ts`)

| Slug | Component | AI cleanup | Notes |
|---|---|---|---|
| `voice-pad` | `components/official-candidate/voice-pad/components/VoicePad.tsx` | No | Compact recorder + transcript |
| `voice-pad-advanced` | `components/official-candidate/voice-pad/components/VoicePadAdvanced.tsx` | No | Same Redux slice as `voice-pad`; UI variant. Likely retire candidate. |
| `transcription-cleanup` | `components/official-candidate/transcription-cleanup/components/TranscriptionCleanup.tsx` | Yes | "Transcription Cleanup" — system-owned cleaner agents in `ai-agents.ts` |
| `ai-voice-window` | `features/audio/voice/AiVoiceFloatingWorkspace.tsx` | N/A — TTS only | Unrelated to transcription |

The full-page `Transcript Studio` (`features/transcript-studio/`) is the most capable transcription surface; see its FEATURE.md.

#### Save-to-X capability

All transcription surfaces (window panels above, all 4 Transcript Studio columns, and the transcript processor at `/transcription/processor`) render `<ContentActionBar />` from `components/content-actions/`. This delivers Save to Notes (with append/replace), Save to Tasks, Save to Scratch, Save to Code, Save as File, Email, Print, plus copy variants — without per-surface implementation. The append/replace flow lives in `features/notes/actions/quick-save/QuickNoteSaveCore.tsx`.

### TTS
- Text → audio via provider adapters
- Chat integration: TTS in the Conversation System uses **Cartesia** (see `features/conversation/FEATURE.md` shared features)
- Eleven Labs added per `TASK-Eleven-labs-addition.md`
- Swappable providers via the service layer

### Podcasts
- Generate / persist / play podcast episodes
- Service layer handles creation pipeline
- Episode model + playback state

---

## Data model

- Audio assets — `cld_files` (AWS S3 backed via Python `/files/*`) + row references
- TTS jobs — may or may not persist (streaming often ephemeral)
- Podcasts — `pc_episodes` with metadata, audio asset references, and nullable `user_id` (creator ownership)

Verify exact schemas in Supabase before extending.

---

## Key flows

### Flow 1 — TTS in chat

1. User toggles speak-aloud on a message
2. TTS service invokes active provider (Cartesia by default)
3. Audio streams back; player component renders in chat
4. Playback state is per-message, not global

### Flow 2 — Voice conversation (real-time)

1. LiveKit session established
2. Audio input → streaming transcription → agent invocation
3. Agent response → TTS → LiveKit outbound
4. **Mobile only workflow**; web may use a subset of this

### Flow 3 — Podcast generation

1. User initiates a podcast episode (e.g. from content source)
2. Service layer orchestrates: content → script → TTS → audio assembly → persistence
3. Episode appears in the user's library

### Flow 4 — Recording → transcript

1. Audio feature records
2. Hands off to `features/transcripts/` (see [`../scraper/FEATURE.md`](../scraper/FEATURE.md) data-ingestion doc)
3. Transcript stored; optionally task-attached

---

## Invariants & gotchas

- **One live capture, app-wide — enforced by `captureLock.ts`.** Every recorder (the global transcription session AND raw-blob recorders: `useSimpleRecorder`, the flashcard recorders) must `claimCapture({ id, stop })` before opening a `MediaRecorder` and `releaseCapture(id)` when it ends. Claiming is **start-always-wins**: a new claim synchronously stops the current holder, so two captures can never overlap. The global session presents as a single holder (`"global-recording-session"`) and manages global↔global takeover internally; raw recorders use a per-instance `useId()`. A takeover MUST be treated as a **discard** by raw recorders (never auto-deliver a half-finished blob). Never open a `MediaRecorder` without claiming the lock; never call raw `getUserMedia`/`track.stop()` — go through `micStream` (singleton) + `captureLock`.
- **One live playback, app-wide — enforced by `playbackLock.ts`.** The OUTPUT twin of `captureLock`. Every playback PATH (the unified `playbackQueue`, the streaming auto-voice `useCartesiaStreamingSpeaker`, the podcast player via `useMediaElementPlaybackSession`, and the xAI voice agent `voice-agent/audio/audioPlayback.ts`) must `claimPlayback({ id, stop })` before producing audio and `releasePlayback(id)` when it stops. Claiming is **start-always-wins**: a new claim synchronously stops the current holder, so two voices can never play at once (this killed the War Room "two voices in my ear" overlap). The queue claims `"playback-queue"` on each item start and releases when it goes idle (a preempt clears its queue); the streaming speaker claims a per-instance `useId()` from its phase funnel (busy phases claim, `idle`/`error` release, `paused` keeps the lock). The lock emits takeovers to `AudioPlaybackHost`, which **auto-surfaces the Audio window-panel** whenever playback gets "complex" (something queued, or a cross-path takeover).
- **One playback QUEUE, app-wide — `features/audio/playback/playbackQueue.ts`.** The output twin of `captureLock`. Every "speak this text" request goes through `useAudioPlayback().enqueue(...)` (or the `useTtsSpeak` convenience layer). Audio plays **one item at a time**; a request that arrives while something is playing is **queued, never overlapped**. Finished items stay in history (`status: "done"`) so the UI can offer replay; clear with `clear()`. Providers plug in via lazy `PlaybackAdapter`s (`adapters/cartesiaAdapter.ts`, `adapters/groqAdapter.ts`) — the queue module never statically imports a TTS SDK, so nothing audio-heavy lands in the app shell; adapters load on the first `speak`. The queue is mirrored into Redux (`audioPlaybackSlice`) by the always-mounted `AudioPlaybackHost`; read it via `useAudioPlayback` / the `selectors.ts` selectors. **Do not** add a second playback path or call `useCartesiaSpeaker`/`useTextToSpeech` directly in new surfaces — enqueue instead. (The streaming auto-voice `useCartesiaStreamingSpeaker`/`AudioOutputHost` now surfaces in the Audio panel via the **session registry** below — it runs its own engine, not the queue. xAI realtime + podcast PCM remain unregistered, tracked for the next waves.)
- **One audio SESSION registry, app-wide — `features/audio/session/audioSessionRegistry.ts`.** The single source of truth for EVERY audio activity (playback AND recording, live + history) that the avatar-menu **Audio panel** (`AudioControlWindow`) renders — the layer ABOVE the locks: locks enforce one-at-a-time, the registry remembers everything so the user can see and **replay** what they missed. Producers register a session (`registerSession`/`updateSession`/`endSession`, or the atomic `beginPlaybackSession`, which claims `playbackLock` AND registers in one call); the queue is projected in declaratively via `syncSource("queue", …)`. Control callbacks (pause/resume/stop/replay) live in the registry's side-table, **never Redux**. Mirrored into Redux (`audioSessionsSlice`) by the always-mounted `AudioSessionHost`; read via `useAudioSessions`. SDK-free — only producers pull TTS SDKs, lazily. Raw `<audio>`/`<video>` players join via `useMediaElementPlaybackSession` (drive `isPlaying` from the element's real play/pause events so a lock takeover stays in sync). **The one and only way in:** never produce audio-OUT without a session (the chat read-aloud, the queue, the podcast player, and the xAI voice agent all register; the raw `useSimpleRecorder`/flashcard recorders are next on the IN side) and never capture audio-IN outside `captureLock` + a recording session. A bypass trips the loud runtime guard `reportAudioBypassViolation` (`features/audio/session/bypassGuard.ts`); ESLint bans the static back door (`no-restricted-imports` on `useCartesiaStreamingSpeaker` outside the canonical TTS surfaces). Remaining back-door bans (`useCartesiaSpeaker`/`useTextToSpeech`, raw `MediaRecorder`/`getUserMedia`) land as each consumer migrates.
- **LiveKit is not Expo Go compatible.** Requires `npx expo prebuild`. Mobile builds need the native modules.
- **TTS providers are swappable.** Always go through the service layer; never pin a provider in a component.
- **Audio assets go through the universal file handler** (`fileHandler.upload(...)` / `useFileUpload` from `@/features/files`). Do not invent a parallel storage scheme. The legacy `audioStorageService.ts` is a thin wrapper that funnels through the handler.
- **Playback state is transient.** Do not persist per-message play state in the DB.
- **TTS integration with chat flows through the Conversation System's shared TTS feature** — don't wire TTS directly in a new chat surface; consume the shared hook.
- **Podcasts use the same audio asset path** as individual audio files — same Storage bucket, same ACL pattern.

---

## Related features

- **Depends on:** `features/conversation/` (TTS integration point), `features/files` (universal file handler — single entry point for every file flow)
- **Depended on by:** `features/transcripts/` (audio → transcripts), `features/conversation/` (TTS/voice), agent surfaces that consume audio
- **Cross-links:** [`../scraper/FEATURE.md`](../scraper/FEATURE.md) (transcripts sibling), [`../conversation/FEATURE.md`](../conversation/FEATURE.md)

---

## Cartesia TTS — single source of truth

All in-app Cartesia text-to-speech routes through **`lib/cartesia/config.ts`** — the one place that defines the model (`sonic-3.5`), API version (`2026-03-01`), system default voices (Skylar = reading, Daniel = assistant), speed (1.2), volume, and playback buffers (`0.7s` standard, `0.3s` streaming), plus the resolvers `resolveVoiceId(userVoice, purpose)` / `resolveSpeed` / `buildGenerationConfig`. **Never hardcode a model id, voice id, `cartesiaVersion`, or `WebPlayer` `bufferDuration` in a hook/component — import from the config.** This is what keeps the old failures (choppy 0.25s buffer, stale `sonic-2`/`sonic-3`, deprecated `experimentalControls`, ignored voice prefs) from creeping back.

**Canonical hook:** `features/tts/hooks/useCartesiaSpeaker` (one-shot read-aloud, prefs-aware, markdown-cleaned, pause/resume/stop). Use `{ purpose: "reading" | "assistant" }` to pick the default voice. For real-time token streaming use `useCartesiaStreamingSpeaker`. All other Cartesia hooks (`hooks/tts/useCartesia`, `hooks/tts/simple/*`) now consume the config too. User voice prefs live in `state.userPreferences.voice` (canonical selector `selectVoicePreferences`), persist to the `user_preferences` Supabase table (JSONB), and rehydrate on boot — set once, applied everywhere.

**Imperative read-aloud modal:** `showAudioModal({ text, title, description })` from `utils/audio/audioModal.ts` opens a dynamic modal that auto-plays the text via the canonical `useCartesiaSpeaker` (through `SpeakerGroupCore`). The single host `<AudioModalHost />` is mounted in `app/Providers.tsx` (alongside `ConfirmDialogHost`), so the helper is callable app-wide with nothing TTS-related loaded until first use. Used by the flashcard read-aloud buttons (`hooks/flashcard-app/useFlashcard.ts`).

**Known legacy not yet migrated (tracked):** `components/voice/TextToSpeechPlayer.tsx` (still live via fast-fire `hooks/ai/useDynamicVoiceAiProcessing`), the voice-assistant server actions (`actions/ai-actions/*`), and `app/api/voice*` routes still reference `sonic-english`. Migrate them to the config when next touched. (The `components/audio` + `hooks/tts` `TextToSpeechPlayer` copies and the `flash-cards/audio` demo routes were deleted in the 2026-05-23 consolidation below.)

## Recorded audio MIME — single source of truth (never send a raw recorder type)

WebM and MP4 are *containers*: identical magic bytes carry audio or video. When a multipart `file` part reaches the server with no Content-Type, `application/octet-stream`, a `video/*` type, or a parameterized recorder type (`audio/webm;codecs=opus`), the magic-byte sniffer cannot disambiguate and defaults WebM → `video/webm` / MP4 → `video/mp4` (the MP4 branch short-circuits first). Result: every mic recording lands in cld_files tagged as **video** and renders with a video player.

`MediaRecorder` needs `;codecs=opus` to record, and the assembled `Blob.type` is often empty — so the recorder MIME is never safe to forward verbatim. The browser sets a multipart part's Content-Type from `File.type`, so a clean `audio/*` `File.type` is the strongest portable signal.

**Invariant:** every boundary where an audio `Blob` becomes a `File` that leaves the browser (Groq transcription routes, cld_files upload, the URL-based fallback) MUST go through **`features/audio/utils/audio-mime.ts`** — `toAudioFile(blob, { prefix })` (clean type + matching extension) or `normalizeAudioContentType(type, name)` when only the string is needed. Never hand-build `new File([audioBlob], name, { type })` at a send/upload site. This is independent of (and survives) any server-side sniffer fix.

## Audio device + permission system — pick your mic/speaker, once

The canonical "what mic/speaker is selected and is the mic permission granted" system. **One manager, one hook, one persisted store, one provider** — every picker consumes it; nothing forks device/permission plumbing.

- **Manager (framework-free):** `features/audio/audioDevices.ts` — permission state (`granted|denied|prompt|unknown`), `ensurePermission()` (prompts ONLY when needed; unlocks labels by reusing the warm `micStream` singleton — no throwaway `getUserMedia`), `listDevices()` (split input/output, refresh on `devicechange`), `applyInputDevice` / `applyOutputDevice`, `resolveDeviceId(id→label→default)`. Obeys the browser facts: labels only after a grant; Chrome's `permissions.query` is trusted + subscribed, **Safari's is not** (inferred from the getUserMedia result); deviceIds stored WITH labels because iOS regenerates ids each load.
- **Hook:** `features/audio/useAudioDevices.ts` — bridges the manager (runtime) and the persisted choice (Redux). Returns `{ permissionState, inputs, outputs, selectedInputId, selectedOutputId, selectedInputLabel, selectedOutputLabel, setInput, setOutput, requestPermission, refresh, outputSelectionSupported }`.
- **Persisted choice:** `userPreferences.audioDevices` (`AudioDevicePreferences` — id+label for in/out; `""` = system default). Auto-syncs (Supabase JSONB + IDB + cross-tab) via the existing prefs engine. `selectAudioDevicePreferences` + per-property selectors. **Future:** fold the legacy free-text `videoConference.defaultMicrophone/defaultSpeaker` into this store (left untouched for now).
- **App-root provider:** `providers/AudioDeviceProvider.tsx` (thin) + `AudioDeviceProviderImpl.tsx` (`next/dynamic ssr:false`, AudioOutputHost pattern) — mounted above `GlobalRecordingProvider` in `app/Providers.tsx`. Wires listeners once, installs the AudioContext sink patch, and applies the persisted mic/speaker EARLY (before the first recording) — re-resolving by label when the device list changes.
- **Input device → mic singleton:** `setInput` calls `micStream.setPreferredInputDeviceId` (applied as an `{ideal}` constraint on the next acquire — graceful if the device is gone).
- **Output device → speaker (`setSinkId`):** `features/audio/audioOutputSink.ts` is the output half. `<audio>`/`<video>` route via `HTMLMediaElement.setSinkId` through `InlineMediaRef` (using `useOutputSinkRef`, re-applied on device change). Cartesia TTS's `WebPlayer` builds a hard-private, per-utterance `AudioContext` with no handle, so `installAudioContextSinkRouting()` patches the `AudioContext` constructor to auto-route every new playback context to the chosen sink — **except** contexts marked `NO_SINK_ROUTING` (the mic-level meter and the voice-agent capture keep-alive, which are silent/input-only). **All `setSinkId` is feature-detected; Safari has neither API and no-ops** (the speaker picker is hidden behind `outputSelectionSupported`, with a "choose output in macOS/iOS settings" note).
- **UI:** the **Devices tab** of the unified `audioControlWindow` (`AudioControlWindow` — Playback / Recording / Devices tabs) = `AudioDevicesPanel` (mic + speaker pickers, permission + Grant button, live "Test mic" meter, "Test speaker" tone). Opened from the avatar-menu **Audio** entry (`SETTINGS_ITEMS`); the `useOpenAudioDevices` opener targets the Devices tab via overlay `data`. The reusable `components/audio/MicDeviceMenu.tsx` caret sits next to the mic in `ProInput` / `ProTextarea`.

## Change log

- `2026-06-28` — **Podcast player + xAI voice agent joined the single audio system (Wave 2).** New reusable `features/audio/session/useMediaElementPlaybackSession.ts` binds any raw `HTMLMediaElement` to `playbackLock` + a registry session; wired into `PodcastAudioPlayer` (now drives `isPlaying` from the element's real play/pause events, so a lock takeover that pauses it stays in sync — and a podcast can no longer overlap a read-aloud). The xAI voice agent (`voice-agent/audio/audioPlayback.ts`) now claims the lock + registers a "Voice agent" session per contiguous speaking burst (start on first PCM chunk, end on drain/interrupt/stop). Both surface in the Audio panel. (Still pending: the audio-IN side — register `useSimpleRecorder` + flashcard recorders as recording sessions [Wave 3].)
- `2026-06-28` — **Unified audio SESSION registry — the chat read-aloud is finally visible in the Audio panel (Wave 1).** New canonical `features/audio/session/audioSessionRegistry.ts` (framework-free, SDK-free) — the single source of truth for EVERY audio activity (playback + recording, live + history), mirrored to Redux (`audioSessionsSlice`) by `AudioSessionHost` and read via `useAudioSessions`. Fixed the reported bug: the chat message read-aloud (`useCartesiaStreamingSpeaker`, incl. the app-root auto-voice singleton) registered NOTHING the panel could see — it now registers a session (live → replayable history) with pause/resume/stop/replay, so the avatar-menu Audio panel shows and controls it (verified end-to-end: a chat reply appears in the panel's History, replayable). The `playbackQueue` is projected into the registry (`syncSource`), so Speaker-button TTS shares one timeline. Rebuilt `AudioControlWindow` into **three synced tabs — Playback / Recording / Devices** (was Player / Devices) with speaker-active + mic-level feedback. Lockdown: runtime `reportAudioBypassViolation` (`bypassGuard.ts`) screams on any unregistered play/capture; ESLint bans direct `useCartesiaStreamingSpeaker` imports outside the canonical TTS surfaces. (Next waves: bring podcasts + xAI realtime + the raw `useSimpleRecorder`/flashcard recorders into the registry; migrate + ban the remaining `useCartesiaSpeaker`/`useTextToSpeech`/raw-recorder back doors.)
- `2026-06-24` — **App-wide single-OUTPUT arbitration (`playbackLock.ts`) + auto-surfacing panel + unified Audio window.** New `playbackLock` (output twin of `captureLock`) makes overlapping playback structurally impossible across paths — fixed the War Room bug where the streaming auto-voice played over a queued utterance ("two voices in my ear"). Wired the `playbackQueue` (claims `"playback-queue"`) and `useCartesiaStreamingSpeaker` (per-instance `useId()`, claim/release from its phase funnel) into it; start-always-wins. `AudioPlaybackHost` now also **auto-opens the Audio panel** when playback gets complex (a second utterance queues, or a cross-path takeover fires). Merged the separate **Audio devices** + **Audio player** windows into ONE `audioControlWindow` with **Player / Devices** tabs (desktop) / stacked sections (mobile, no tabs); the `useOpenAudioDevices` opener now targets the unified window's Devices tab via overlay `data`, and the avatar menu collapsed to a single **Audio** entry. (The old `audioDevices` overlay + `AudioDevicesWindow` are now unused — full removal deferred to T16 via the remove-window-panel skill.)
- `2026-06-24` — **Unified playback QUEUE (`features/audio/playback/`).** New single, app-wide audio-output queue — the playback twin of `captureLock`. `playbackQueue.ts` (framework-free singleton) plays one TTS/audio item at a time and **queues** anything requested while playing (never overlaps), keeping finished items in history for replay. Lazy `PlaybackAdapter`s for Cartesia (token→WS→WebPlayer) and Groq/PlayAI (WAV blob→HTMLAudio + `setSinkId`) keep all TTS SDKs out of the app shell — they load on first `speak`. Mirrored into Redux via `audioPlaybackSlice` + the always-mounted `AudioPlaybackHost`; consumed through `useAudioPlayback` / `useTtsSpeak`. Routed the batch Speaker components (`SpeakerButton`/`SpeakerGroup`/`SpeakerCompactGroup` cores) off their individual `useCartesiaSpeaker` instances onto the shared queue, so two speaker buttons now queue instead of double-playing. (Still pending: window-panel queue UI + controls [T6/T14]; bringing streaming auto-voice, xAI realtime, and podcast PCM into the queue [T13].)
- `2026-06-24` — **App-wide single-capture arbitration (`captureLock.ts`).** New canonical, framework-agnostic primitive enforcing "one live mic capture, anywhere" with **start-always-wins** semantics — a new claim synchronously stops the current holder. Wired into every recorder: `GlobalRecordingProvider` (claims `"global-recording-session"` on begin, releases on finalize/error — guarded so an internal global→global takeover never releases the incoming recording), `useSimpleRecorder` (per-`useId()`, discards its blob on takeover instead of auto-delivering — covers the Create-Transcript modal + WhatsApp voice messages), `useFastFireFlashcards`, and `useAudioRecorder` (multi-key flashcard hook presents as a single holder: claimed while any key records, released when all stop). Also finished migrating `useFastFireFlashcards` off raw `getUserMedia` / its own `AudioContext` / `track.stop()` onto the `acquireMicStream`/`releaseMicStream` singleton + shared `AudioContext` (the last direct-`getUserMedia` capture surface). Concurrent recording is now structurally impossible across the whole app, not just within the transcription session.
- `2026-06-23` — **Universal audio device + permission system.** New canonical manager (`features/audio/audioDevices.ts`) + hook (`useAudioDevices.ts`) + persisted `userPreferences.audioDevices` module + app-root `AudioDeviceProvider`. Users can now pick mic & speaker (remembered, synced), permission is requested once (never re-prompted when granted; Safari-aware), and output routes via `setSinkId` (`audioOutputSink.ts` — `HTMLMediaElement` for `InlineMediaRef` `<audio>`/`<video>`, an `AudioContext` constructor patch for Cartesia TTS; Safari no-ops). New `audioDevices` overlay (`AudioDevicesWindow`/`AudioDevicesPanel`: pickers + permission + live mic meter + speaker test) opened from the avatar menu; reusable `MicDeviceMenu` caret added to `ProInput`/`ProTextarea`. **Leak fix:** `useSimpleRecorder` + `hooks/flashcard-app/useAudioRecorder` no longer call `getUserMedia` directly / `track.stop()` — they route through the `acquireMicStream`/`releaseMicStream` singleton (the flashcard hook had NO unmount cleanup at all → mic-indicator leak; now releases every held key on unmount/error). Audited `useChunkedRecordAndTranscribe` + `voice-agent/audioCapture` — both already balanced.
- `2026-06-14` — Fixed mic recordings being stored/displayed as **video**. Added `features/audio/utils/audio-mime.ts` (`toAudioFile` / `normalizeAudioContentType` / `audioExtensionForType`) as the single normalizer for outbound audio, and routed every send/upload site through it: `useAudioTranscription`, `useChunkedRecordAndTranscribe` (per-chunk send), `audioFallbackUpload` (staged upload), and `transcripts/service/audioStorageService.saveAudioToStorage` (recordings → `audio/webm`; imports keep their true type — mp3 → `audio/mpeg`, m4a/mp4 → `audio/mp4`). See the invariant above.
- `2026-06-14` — **Mic interruption hardening + one shared AudioContext (KNOWN_DEFECTS D7).** `micStream.ts` now attaches `track.onended`/`onmute`/`onunmute` and a `navigator.permissions` microphone watcher, and exposes `subscribeMicInterruption(reason)` (`ended` | `muted` | `unmuted` | `permission-revoked`) — every one screams (loud-recovery doctrine) where iOS interruptions were previously silent. On a hard end / permission-revoke mid-recording, `useChunkedRecordAndTranscribe` raises a loud `MIC_INTERRUPTED` error (chunks so far are already in IndexedDB) instead of dropping audio invisibly. New `audioContext.ts` is ONE shared, resumable AudioContext for the level meter — the recorder no longer `new AudioContext()`s per instance (context churn → iOS exhaustion → a recording that silently fails to start). **Capture is independent of the AudioContext** (MediaRecorder reads the MediaStream directly), so this can't touch the never-lose-audio path. Re-prompt frequency should drop; the felt behavior needs verification on a real phone.
- `2026-06-11` — `useCartesiaStreamingSpeaker` gained an **incremental streaming API** alongside the one-shot `speak()`: `beginStream()` / `streamText(cumulativeText)` / `finishStream(finalText)`. Opens one Cartesia context and feeds completed sentences (sentence-boundary buffering via `lastSentenceBoundary`, soft-cap flush at 400 chars) into it via `ws.send`→`ws.continue`, starting playback on the first chunk. An internal op-queue serializes begin→push→finish so async sends never reorder. Used by Scribe's Agent+ voice-out (`features/transcript-studio/hooks/useAutoVoiceResponse.ts`) to speak responses as they stream in. `stop()` + unmount abort the stream session.
- `2026-06-09` — Fixed Cartesia read-aloud 404 ("No API schema exists for the requested Cartesia-Version"). The `/api/cartesia` access-token route minted tokens with the SDK's default version (`2024-06-10`) while `useCartesiaSpeaker` opens the websocket at `CARTESIA_API_VERSION` (`2026-03-01`) — Cartesia rejects the version mismatch with a 404 on websocket connect. The route now mints the token with `cartesiaVersion: CARTESIA_API_VERSION`. **Invariant: the access-token mint version MUST equal the websocket `cartesiaVersion`.** (Note: `@cartesia/cartesia-js` is intentionally pinned at v2.2.9 — v3 removed the `WebPlayer` export every speaker hook depends on.)
- `2026-06-07` — `pc_episodes.user_id` migration: episode ownership FK to `auth.users`; admin `createEpisode` stamps auth user; added `fetchEpisodesByUser`.
- `2026-05-23` — Audio modal consolidated onto the canonical TTS system. `components/audio/AudioModal.tsx` now auto-plays via `useCartesiaSpeaker` (through `SpeakerGroupCore`) instead of the old per-modal `TextToSpeechPlayer`; the modal is `next/dynamic` and driven by a single global `<AudioModalHost />` (replaces the never-mounted `AudioModalProvider`, which left flashcard read-aloud broken). Deleted dead/duplicate trash: `components/audio/TextToSpeechPlayer.tsx`, `hooks/tts/TextToSpeechPlayer.tsx`, `components/audio/example-usage.tsx`, `components/audio/QuickAudioHelp.tsx`, `hooks/tts/useAudioExplanation.ts`, and the demo routes `app/(authenticated)/flash-cards/audio/**` + `app/(authenticated)/flash-cards/modal-test/**`. Flashcard UI unchanged.
- `2026-06-23` — Added `/voice` guest marketing landing (`VoiceLanding` + `ModuleLanding` shell); authed users redirect to `/voice/playground`. Registered favicon (`Vc`, pink-700) and sub-route metadata for playground (`Vp`) and tester (`Vt`).
- `2026-05-26` — Renamed `voicePadAi` overlay → `transcriptionCleanup` (slug `transcription-cleanup`, component `TranscriptionCleanup.tsx` under `components/official-candidate/transcription-cleanup/`). Renamed `/transcription/mobile` route → `/transcription/scribe` (component `ScribeScreen.tsx` under `features/transcript-studio/components/scribe/`); legacy `/transcription/mobile/*` 308-redirects to `/transcription/scribe/*` via `next.config.js`.
- `2026-05-23` — TTS consolidated onto `lib/cartesia/config.ts` (Sonic 3.5 + `2026-03-01` + `generation_config`). Migrated `useCartesiaSpeaker`, `useCartesiaStreamingSpeaker`, `useCartesia`, and `hooks/tts/simple/*` off hardcoded models/buffers/`experimentalControls`; default voices Skylar/Daniel via `resolveVoiceId(purpose)`; user voice/speed prefs respected everywhere. Mobile transcript studio moved to real per-session routes (`/transcription/scribe/[sessionId]`, `/unsorted`).
- `2026-05-21` — `useChunkedRecordAndTranscribe` exposes the crash-safe `safetyId` (via `getSafetyId()` on its return and on every `ChunkCompleteInfo`) so subscribers can reassemble a recording cycle's audio with `audioSafetyStore.getAudioBlob(safetyId)`. Consumed by the transcript-studio mobile capture flow; additive — existing consumers unaffected.
- `2026-05-07` — Transcript management UI route is `/transcription/processor` (permanent redirect from `/transcripts` in `next.config.js`).
- `2026-05-03` — Transcription Cleanup pad (formerly `VoicePadAi`): replaced 6 hardcoded user-owned cleaner agents with 3 system-owned agents in `ai-agents.ts`; added `contextVariableKey` field on the agent shape so context can be wired as a regular variable for agents that don't use a context slot. All transcription window panels (voicePad, voicePadAdvanced, transcriptionCleanup) and the transcript processor viewer now expose `ContentActionBar` for Save to Notes/Tasks/Scratch/etc.
- `2026-04-25` — Removed `features/audio` barrel `index.ts` files; consumers import from source files (and official voice components) per project no-barrel policy.
- `2026-04-22` — claude: initial combined FEATURE.md for audio + tts + podcasts.

---

> **Keep-docs-live:** new TTS provider, LiveKit version bumps that affect mobile, or podcast pipeline changes must update this doc. Cross-check the Conversation System FEATURE.md when TTS behavior in chat changes.
