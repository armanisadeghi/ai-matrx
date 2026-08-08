---
status: active
updated: 2026-08-08
repos: [matrx-frontend, aidream]
vision:
  [
    /Users/armanisadeghi/code/aidream/packages/matrx-ai/matrx_ai/agent_runners/PODCAST_PIPELINE.md,
  ]
---

# Podcast system — remaining gaps

The flow is `Content → Script → Audio` with hard gates between stages; the gate law lives in
`PODCAST_PIPELINE.md` (aidream, beside the pipeline — READ FIRST). The living state of the whole
system (through 2026-07-06, incl. the runs/recovery/per-asset-regen subsystem) is
`features/podcasts/FEATURE.md` — do not restate it here.

This handoff covers the **generation pipeline** (gates, casts, chapters, languages). Two siblings own
adjacent podcast work: live run page + research feed →
`docs/handoffs/podcast-run-liveness-and-research-feed.md`; feature image / blog / media polish →
`docs/handoffs/podcast-media-and-streaming-polish.md`.

## Vision — Arman's words

- Exact speaker count is law: "14 means 14" — GATE 2 fails a run whose script doesn't produce
  exactly `host_count` distinct speakers, by design.
- Per Arman's instruction, `partial_content` (rough notes / scraped / transcribed text) passes
  straight to the script writer with no intermediate cleaning agent — the script writer handles
  raw notes.

## Resources

- FEATURE doc (source of truth): `features/podcasts/FEATURE.md`
- Pipeline contract: aidream `packages/matrx-ai/matrx_ai/agent_runners/PODCAST_PIPELINE.md`;
  pipeline code `podcast_generator.py` beside it; router `aidream/api/routers/podcast_generator.py`
- Test suites (aidream): `uv run python scripts/podcast_gate_tests.py` (free, ~30s);
  `uv run python -u scripts/podcast_e2e_matrix.py <scenario…>` (real agents/$$)
- FE: `features/podcasts/{generator,studio,components/player}/`, routes `app/(core)/podcast/`
- DB: `pc_*` tables now live in the **`podcast` schema** (episodes, articles, shows, …)

## Remaining work

1. **Persisted script contains the script agent's RAW output.** Confirmed: `podcast_generator.py`
   sets `PodcastGenerationResult(script=script, …)` (~line 3220) with the unextracted string;
   `_extract_dialogue` (~line 2506) is used only for speaker resolution. So blog/show-notes/
   transcript can inherit reasoning text. Persist the extracted dialogue instead — small change
   around `_validated_script_stage` (~line 1407).
2. **`SCRIPT_AGENT_REGISTRY` not built.** Named only in `PODCAST_PIPELINE.md` §4 (custom agents slot
   in by `(format, language, host_min, host_max)`); no code references it. Today a custom
   format/language means editing `_create_script` / `_is_legacy_script_request`. Build when the
   custom-agent count grows.
3. **Wire consumers for the four remaining built-but-unconsumed agents** — `podcast.title_optimizer`
   (title options UI on the run/manage pages), `podcast.audience_adapter` (an audience picker beside
   the pre-script processing options), and the live-podcast pair `podcast.relevance_gate` +
   `podcast.live_rewrite` (needs the future live-podcast orchestrator). Slots are declared
   (`podcast_slots.py`) and admin-repinnable; only call sites are missing.
4. **Collapse the duplicate blog/show-notes slot pairs** — `podcast.blog_writer` /
   `podcast.show_notes_generator` (server, still `migration_status=placeholder`) duplicate the live
   `podcast_client.blog_writer` / `podcast_client.show_notes` slots; pick ONE slot per logical
   output (decision flagged in both rows' metadata).

## Done

- 2026-08-08 — Chapters wired: run page `EpisodeChaptersPanel` → floating `podcast.chapter_marker`
  slot → `pc_episodes.metadata.chapters`. Post-prep live: 4 agents built + wired through
  `_apply_post_prep` (slots `podcast.post_prep_*`); GeneratorForm pre-script layer interactive.
  Languages: all 24 Gemini TTS locales `enabled: true` (stale "only en-US" claim removed).
- Podcast generate/resume streams use canonical `callApi`, so active scope is
  injected; aidream applies it on generate and restores the stored run org on
  resume.
- Server gate enforcement deployed — aidream `b3e3dfc40`; gate tests in `scripts/podcast_gate_tests.py`.
- Live audio is verified end to end in the authenticated studio for both bands:
  Gemini 2-host PCM reached `Listen live`, advanced Play→Pause from 0:00 to
  0:02 while the rendered edge grew to 0:08, then handed off to the canonical
  episode; ElevenLabs 3-host MP3 advanced its actual MediaSource element from
  0.0s to 2.7s while buffering grew from 0.36s to 5.88s, supported pause/seek
  state, and handed off to a permanent 3:38 file. The implementation is
  `streamingPcmPlayer.ts` + `streamingMp3Player.ts`, selected in
  `useStudioRun.ts` from `encoding`/`mime_type`.
- ElevenLabs streaming includes `text_to_dialogue.stream`; the provider emits
  ordered MP3 `audio_stream_chunk` events before generation completes and one
  persisted-file `audio_stream_end`. The strict `LLMParams.tts_voice` contract
  accepts homogeneous `{text, voice_id}` dialogue lists (the UI test caught and
  fixed the previous validation failure before the provider call).
- `<speaker_settings>` now emitted by script agents (name + gender) — aidream `d18b531cd`.
- `pc_*` tables moved to the `podcast` schema; FE done.
- Runs / recovery / per-asset-regen subsystem — see `features/podcasts/FEATURE.md`.
