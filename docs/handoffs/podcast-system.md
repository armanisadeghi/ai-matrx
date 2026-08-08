---
status: active
updated: 2026-08-08
repos: [matrx-frontend, aidream]
vision: [/Users/armanisadeghi/code/aidream/packages/matrx-ai/matrx_ai/agent_runners/PODCAST_PIPELINE.md]
---

# Podcast system — remaining gaps

The flow is `Content → Script → Audio` with hard gates between stages; the gate law lives in
`PODCAST_PIPELINE.md` (aidream, beside the pipeline — READ FIRST). The living state of the whole
system (incl. the runs/recovery/per-asset-regen subsystem) is `features/podcasts/FEATURE.md` —
do not restate it here.

This handoff covers the **generation pipeline** (gates, casts, chapters, languages). Siblings:
live run page + research feed → `docs/handoffs/podcast-run-liveness-and-research-feed.md`;
feature image / blog / media polish → `docs/handoffs/podcast-media-and-streaming-polish.md`;
voice/cast diversity + voice-selection UX → `docs/handoffs/podcast-voice-diversity.md`.

## Vision — Arman's words

- Exact speaker count is law: "14 means 14" — GATE 2 fails a run whose script doesn't produce
  exactly `host_count` distinct speakers, by design.
- Per Arman's instruction, `partial_content` (rough notes / scraped / transcribed text) passes
  straight to the script writer with no intermediate cleaning agent.
- 2026-08-08: "No output from an agent should ever just be allowed to be manually processed by
  some stupid feature" — the cross-cutting sweep lives in aidream
  `docs/handoffs/canonical-agent-output-processing.md`.

## Resources

- FEATURE doc (source of truth): `features/podcasts/FEATURE.md`
- Pipeline contract: aidream `packages/matrx-ai/matrx_ai/agent_runners/PODCAST_PIPELINE.md`;
  pipeline code `podcast_generator.py` beside it; router `aidream/api/routers/podcast_generator.py`
- Test suites (aidream): `uv run python scripts/podcast_gate_tests.py` (free, ~30s);
  `uv run python -u scripts/podcast_e2e_matrix.py <scenario…>` (real agents/$$)
- FE: `features/podcasts/{generator,studio,components/player}/`, routes `app/(core)/podcast/`
- DB: `pc_*` tables live in the **`podcast` schema**

## Remaining work

1. **Chunked dialogue audio for 11–20 hosts.** ElevenLabs `text_to_dialogue` hard-rejects >10
   distinct voices per request (`max_voices_exceeded`, verified live 2026-08-08: 14- and 20-host
   runs passed GATE 2 and died at audio). The server now fails fast for `host_count > 10` and the
   FE caps its picker at 10 (`MAX_HOST_COUNT`). To restore 11–20: split the validated dialogue
   into segments of ≤10 distinct voices, call `text_to_dialogue` per segment, stitch the MP3s
   (the official-video compose stage shows the ffmpeg-style pattern), keep per-segment
   checkpointing so a mid-stitch crash resumes. Trap: live-MP3 streaming (`pc_studio` player)
   assumes ONE audio stream — stitched output must land as one final URL.
2. **Full-length (untruncated) 10-host run unverified.** The 10-host e2e pass used
   `truncate_audio_for_testing`. Run one full-length 10-host episode before advertising
   large-cast reliability (cost: real TTS on a full script).
3. **`SCRIPT_AGENT_REGISTRY` not built.** Named only in `PODCAST_PIPELINE.md` §4 (custom agents
   slot in by `(format, language, host_min, host_max)`); today a custom format/language means
   editing `_create_script` / `_is_legacy_script_request`. Build when the custom-agent count grows.
4. **Wire the live-podcast pair** — `podcast.relevance_gate` + `podcast.live_rewrite` need the
   future live-podcast orchestrator (Arman deprioritized until that's a real project). Slots are
   declared and admin-repinnable; only the orchestrator is missing.
5. **Legacy 2-host script agents (educational/news/persian) don't take speaker names** — they
   bake their own cast, so default no-speaker 2-host runs on the legacy path always sound like
   the same pair. Mitigated: the FE always sends a fresh previewed cast (which routes OFF the
   legacy path); the gap is API callers hitting the legacy band. Fix = add a `speaker_names`
   variable to those three agents' prompts (repin via /administration/agents/slots) or retire
   the legacy band once the multihost generic matches its quality.

## Done

- 2026-08-08 — Canonical script persistence (`_canonical_script` at GATE 2; 36 rows backfilled);
  audience adaptation stage (`target_audience` → `podcast.audience_adapter`); suggested rotated
  default casts for name-less requests; 10-voice audio cap (server fail-fast + FE cap);
  duplicate `podcast.blog_writer`/`podcast.show_notes_generator` slots retired
  (`podcast_client.*` canonical); title optimizer wired (`EpisodeTitlePanel` on the run page,
  post-episode only, slot floated to master).
- 2026-08-08 — Chapters wired (`EpisodeChaptersPanel` → `podcast.chapter_marker` →
  `pc_episodes.metadata.chapters`); post-prep live (4 agents via `_apply_post_prep`); all 24
  Gemini TTS locales enabled.
- Canonical `callApi` scope injection on generate/resume; server gate enforcement deployed
  (`scripts/podcast_gate_tests.py`); ElevenLabs streaming incl. `text_to_dialogue/stream`;
  `<speaker_settings>` required from the three generic script agents; `pc_*` → `podcast` schema.
- Runs / recovery / per-asset-regen subsystem — see `features/podcasts/FEATURE.md`.
