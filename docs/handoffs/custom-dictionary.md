---
status: blocked
updated: 2026-07-13
repos: [aidream, matrx-frontend]
---

# Custom Dictionary — activation remainder

Terminology + pronunciation entries at four owner levels (user / org / scope type / scope), merged
most-specific-wins; feeds transcription biasing, cleanup-agent context, and TTS pronunciation.
Everything is built and **prod-verified end-to-end** (aidream v0.1.536, 2026-07-13): tool path,
auto-injection on flagged surfaces, and skill loading. One human-ears check remains.

## Resources

- `features/dictionary/FEATURE.md` — canonical.
- Test routes: `/user-settings/voice/dictionary`, `/transcripts/cleanup`, `/dictionary/admin`. Login admin@admin.com / Password1234#.

## Remaining work

1. **Human listen for podcast carry-through (Arman — needs ears).** Payload plumbing +
   `_apply_dictionary_pronunciations` substitution are code-verified; whether the spoken audio
   honors pronunciations needs a human: generate a podcast with a distinctive pronunciation entry
   and listen.

## Done

- Full system built + live-verified — see `features/dictionary/FEATURE.md`.
- Prod deploy re-verify complete 2026-07-13 (v0.1.536): auto-injection on
  `matrx-user/transcripts-cleanup` quotes the injected Custom Dictionary block; Diagram Editor
  skill run clean; zero new `dictionary_recovery` / `skill_merge_recovery` rows in
  `public.system_error`.
- STT keyterm biasing on live capture wired (`useChunkedRecordAndTranscribe` global-context fallback).
