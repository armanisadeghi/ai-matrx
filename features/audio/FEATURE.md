# FEATURE.md — `audio` + `tts` + `podcasts`

**Status:** `active`
**Tier:** `2`
**Last updated:** `2026-05-07`

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

- Audio assets — Supabase Storage + row references
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

- **LiveKit is not Expo Go compatible.** Requires `npx expo prebuild`. Mobile builds need the native modules.
- **TTS providers are swappable.** Always go through the service layer; never pin a provider in a component.
- **Audio assets follow Supabase Storage patterns.** Do not invent a parallel storage scheme.
- **Playback state is transient.** Do not persist per-message play state in the DB.
- **TTS integration with chat flows through the Conversation System's shared TTS feature** — don't wire TTS directly in a new chat surface; consume the shared hook.
- **Podcasts use the same audio asset path** as individual audio files — same Storage bucket, same ACL pattern.

---

## Related features

- **Depends on:** `features/conversation/` (TTS integration point), Supabase Storage
- **Depended on by:** `features/transcripts/` (audio → transcripts), `features/conversation/` (TTS/voice), agent surfaces that consume audio
- **Cross-links:** [`../scraper/FEATURE.md`](../scraper/FEATURE.md) (transcripts sibling), [`../conversation/FEATURE.md`](../conversation/FEATURE.md)

---

## Cartesia TTS — single source of truth

All in-app Cartesia text-to-speech routes through **`lib/cartesia/config.ts`** — the one place that defines the model (`sonic-3.5`), API version (`2026-03-01`), system default voices (Skylar = reading, Daniel = assistant), speed (1.2), volume, and playback buffers (`0.7s` standard, `0.3s` streaming), plus the resolvers `resolveVoiceId(userVoice, purpose)` / `resolveSpeed` / `buildGenerationConfig`. **Never hardcode a model id, voice id, `cartesiaVersion`, or `WebPlayer` `bufferDuration` in a hook/component — import from the config.** This is what keeps the old failures (choppy 0.25s buffer, stale `sonic-2`/`sonic-3`, deprecated `experimentalControls`, ignored voice prefs) from creeping back.

**Canonical hook:** `features/tts/hooks/useCartesiaSpeaker` (one-shot read-aloud, prefs-aware, markdown-cleaned, pause/resume/stop). Use `{ purpose: "reading" | "assistant" }` to pick the default voice. For real-time token streaming use `useCartesiaStreamingSpeaker`. All other Cartesia hooks (`hooks/tts/useCartesia`, `hooks/tts/simple/*`) now consume the config too. User voice prefs live in `state.userPreferences.voice` (canonical selector `selectVoicePreferences`), persist to the `user_preferences` Supabase table (JSONB), and rehydrate on boot — set once, applied everywhere.

**Imperative read-aloud modal:** `showAudioModal({ text, title, description })` from `utils/audio/audioModal.ts` opens a dynamic modal that auto-plays the text via the canonical `useCartesiaSpeaker` (through `SpeakerGroupCore`). The single host `<AudioModalHost />` is mounted in `app/Providers.tsx` (alongside `ConfirmDialogHost`), so the helper is callable app-wide with nothing TTS-related loaded until first use. Used by the flashcard read-aloud buttons (`hooks/flashcard-app/useFlashcard.ts`).

**Known legacy not yet migrated (tracked):** `components/voice/TextToSpeechPlayer.tsx` (still live via fast-fire `hooks/ai/useDynamicVoiceAiProcessing`), the voice-assistant server actions (`actions/ai-actions/*`), and `app/api/voice*` routes still reference `sonic-english`. Migrate them to the config when next touched. (The `components/audio` + `hooks/tts` `TextToSpeechPlayer` copies and the `flash-cards/audio` demo routes were deleted in the 2026-05-23 consolidation below.)

## Change log

- `2026-06-09` — Fixed Cartesia read-aloud 404 ("No API schema exists for the requested Cartesia-Version"). The `/api/cartesia` access-token route minted tokens with the SDK's default version (`2024-06-10`) while `useCartesiaSpeaker` opens the websocket at `CARTESIA_API_VERSION` (`2026-03-01`) — Cartesia rejects the version mismatch with a 404 on websocket connect. The route now mints the token with `cartesiaVersion: CARTESIA_API_VERSION`. **Invariant: the access-token mint version MUST equal the websocket `cartesiaVersion`.** (Note: `@cartesia/cartesia-js` is intentionally pinned at v2.2.9 — v3 removed the `WebPlayer` export every speaker hook depends on.)
- `2026-06-07` — `pc_episodes.user_id` migration: episode ownership FK to `auth.users`; admin `createEpisode` stamps auth user; added `fetchEpisodesByUser`.
- `2026-05-23` — Audio modal consolidated onto the canonical TTS system. `components/audio/AudioModal.tsx` now auto-plays via `useCartesiaSpeaker` (through `SpeakerGroupCore`) instead of the old per-modal `TextToSpeechPlayer`; the modal is `next/dynamic` and driven by a single global `<AudioModalHost />` (replaces the never-mounted `AudioModalProvider`, which left flashcard read-aloud broken). Deleted dead/duplicate trash: `components/audio/TextToSpeechPlayer.tsx`, `hooks/tts/TextToSpeechPlayer.tsx`, `components/audio/example-usage.tsx`, `components/audio/QuickAudioHelp.tsx`, `hooks/tts/useAudioExplanation.ts`, and the demo routes `app/(authenticated)/flash-cards/audio/**` + `app/(authenticated)/flash-cards/modal-test/**`. Flashcard UI unchanged.
- `2026-05-26` — Renamed `voicePadAi` overlay → `transcriptionCleanup` (slug `transcription-cleanup`, component `TranscriptionCleanup.tsx` under `components/official-candidate/transcription-cleanup/`). Renamed `/transcription/mobile` route → `/transcription/scribe` (component `ScribeScreen.tsx` under `features/transcript-studio/components/scribe/`); legacy `/transcription/mobile/*` 308-redirects to `/transcription/scribe/*` via `next.config.js`.
- `2026-05-23` — TTS consolidated onto `lib/cartesia/config.ts` (Sonic 3.5 + `2026-03-01` + `generation_config`). Migrated `useCartesiaSpeaker`, `useCartesiaStreamingSpeaker`, `useCartesia`, and `hooks/tts/simple/*` off hardcoded models/buffers/`experimentalControls`; default voices Skylar/Daniel via `resolveVoiceId(purpose)`; user voice/speed prefs respected everywhere. Mobile transcript studio moved to real per-session routes (`/transcription/scribe/[sessionId]`, `/unsorted`).
- `2026-05-21` — `useChunkedRecordAndTranscribe` exposes the crash-safe `safetyId` (via `getSafetyId()` on its return and on every `ChunkCompleteInfo`) so subscribers can reassemble a recording cycle's audio with `audioSafetyStore.getAudioBlob(safetyId)`. Consumed by the transcript-studio mobile capture flow; additive — existing consumers unaffected.
- `2026-05-07` — Transcript management UI route is `/transcription/processor` (permanent redirect from `/transcripts` in `next.config.js`).
- `2026-05-03` — Transcription Cleanup pad (formerly `VoicePadAi`): replaced 6 hardcoded user-owned cleaner agents with 3 system-owned agents in `ai-agents.ts`; added `contextVariableKey` field on the agent shape so context can be wired as a regular variable for agents that don't use a context slot. All transcription window panels (voicePad, voicePadAdvanced, transcriptionCleanup) and the transcript processor viewer now expose `ContentActionBar` for Save to Notes/Tasks/Scratch/etc.
- `2026-04-25` — Removed `features/audio` barrel `index.ts` files; consumers import from source files (and official voice components) per project no-barrel policy.
- `2026-04-22` — claude: initial combined FEATURE.md for audio + tts + podcasts.

---

> **Keep-docs-live:** new TTS provider, LiveKit version bumps that affect mobile, or podcast pipeline changes must update this doc. Cross-check the Conversation System FEATURE.md when TTS behavior in chat changes.
