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
| `voice-pad-ai` | `components/official-candidate/voice-pad/components/VoicePadAi.tsx` | Yes | "Transcription Cleanup" — system-owned cleaner agents in `ai-agents.ts` |
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
- Podcasts — episode table with metadata, audio asset references

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

## Change log

- `2026-05-21` — `useChunkedRecordAndTranscribe` exposes the crash-safe `safetyId` (via `getSafetyId()` on its return and on every `ChunkCompleteInfo`) so subscribers can reassemble a recording cycle's audio with `audioSafetyStore.getAudioBlob(safetyId)`. Consumed by the transcript-studio mobile capture flow; additive — existing consumers unaffected.
- `2026-05-07` — Transcript management UI route is `/transcription/processor` (permanent redirect from `/transcripts` in `next.config.js`).
- `2026-05-03` — VoicePadAi: replaced 6 hardcoded user-owned cleaner agents with 3 system-owned agents in `ai-agents.ts`; added `contextVariableKey` field on the agent shape so context can be wired as a regular variable for agents that don't use a context slot. All transcription window panels (voicePad, voicePadAdvanced, voicePadAi) and the transcript processor viewer now expose `ContentActionBar` for Save to Notes/Tasks/Scratch/etc.
- `2026-04-25` — Removed `features/audio` barrel `index.ts` files; consumers import from source files (and official voice components) per project no-barrel policy.
- `2026-04-22` — claude: initial combined FEATURE.md for audio + tts + podcasts.

---

> **Keep-docs-live:** new TTS provider, LiveKit version bumps that affect mobile, or podcast pipeline changes must update this doc. Cross-check the Conversation System FEATURE.md when TTS behavior in chat changes.
