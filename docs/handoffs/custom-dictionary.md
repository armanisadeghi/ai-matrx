---
status: active
updated: 2026-07-07
repos: [aidream, matrx-frontend]
---

# Custom Dictionary — activation remainder

Terminology + pronunciation entries at four owner levels (user / org / scope type / scope), merged
most-specific-wins; feeds transcription biasing, cleanup-agent context, and TTS pronunciation.
**Frontend is done and live-verified.** What remains is the aidream production activation plus one
FE wiring gap.

## Resources

- `features/dictionary/FEATURE.md` — canonical; **line ~103 tracks the same deploy-pending items** (keep in sync, don't duplicate its detail).
- FE constants / launch: `features/dictionary/constants.ts`; `features/dictionary/hooks/useOpenDictionaryAssistant.ts` (uses `launchAgent` since commit `59408366e`).
- Dictionary Assistant agent: `ab1a868e-b866-4ade-9383-fd63b0928c7c` (spec `aidream/internal_agents/dictionary_assistant.md`); `dictionary` tool_def `04920d8d-0a54-4010-8ac1-9675942b1aec` (aidream migration `0102`).
- Recorder plumbing: `TranscriptionOptions.dictionarySurfaceKey` → `useAudioTranscription` / `useChunkedRecordAndTranscribe`; capture host is `GlobalRecordingProvider`.
- Test routes: `/user-settings/voice/dictionary` (manager + Ask assistant), `/transcripts/cleanup` (merged card + Sources selector), transcript studio / scribe / podcast-studio Advanced (indicator button), `/dictionary/admin`.

## Remaining work

1. **aidream prod deploy + cache bust + re-verify** (tracked at `features/dictionary/FEATURE.md:103`). Deploy `server.app.matrxserver.com`, then `POST /admin/tool-routing/cache-bust` (ToolRegistry + surface-manifest caches). Then verify in production: (a) the Dictionary Assistant calls the `dictionary` tool in a real chat and writes an entry; (b) server auto-injection on flagged surfaces (e.g. `matrx-user/transcripts-cleanup`) — chat models get the definitions block, TTS/non-FC models the pronunciation directive; (c) podcast generation carries the dictionary into script + audio agents.
2. **STT keyterm biasing on studio/scribe recorders.** The opt-in mechanism is fully wired, but `GlobalRecordingProvider` doesn't pass a `dictionarySurfaceKey`, so live capture is never Whisper-biased. Thread the active surface's key into the provider's transcription options.

## Done

- Full system built + live-verified: DB (`dict_*` tables/RPCs, isolation-tested), management UI at all four levels, CSV/JSON import, merged-view card + selector window, indicator buttons, TTS substitution, `dictionary` tool executed end-to-end, Dictionary Assistant built via Agent Factory (Gemini 3.5 Flash) — see `features/dictionary/FEATURE.md`.
- Assistant launches as a floating-chat widget via `launchAgent` (`useOpenDictionaryAssistant.ts`, fixed in `59408366e`); global shortcut row `5c1c7000-0000-4000-a000-000000000001` seeded.
