---
status: active
updated: 2026-08-08
repos: [matrx-frontend, aidream]
vision: [/Users/armanisadeghi/code/aidream/packages/matrx-ai/matrx_ai/agent_runners/PODCAST_PIPELINE.md]
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

1. **Large casts (7–20 hosts) unverified.** `scripts/podcast_e2e_matrix.py` tops out at
   `host_count=6`. GATE 2 is strict (N means N), so an agent producing 13 of 14 speakers fails the
   run. Test 10/14/20 before advertising reliability.
2. **Persisted script contains the script agent's RAW output.** Confirmed: `podcast_generator.py`
   sets `PodcastGenerationResult(script=script, …)` (~line 3220) with the unextracted string;
   `_extract_dialogue` (~line 2506) is used only for speaker resolution. So blog/show-notes/
   transcript can inherit reasoning text. Persist the extracted dialogue instead — small change
   around `_validated_script_stage` (~line 1407).
3. **`SCRIPT_AGENT_REGISTRY` not built.** Named only in `PODCAST_PIPELINE.md` §4 (custom agents slot
   in by `(format, language, host_min, host_max)`); no code references it. Today a custom
   format/language means editing `_create_script` / `_is_legacy_script_request`. Build when the
   custom-agent count grows.
4. **Wire consumers for the four remaining built-but-unconsumed agents** — `podcast.title_optimizer`
   (title options UI on the run/manage pages), `podcast.audience_adapter` (an audience picker beside
   the pre-script processing options), and the live-podcast pair `podcast.relevance_gate` +
   `podcast.live_rewrite` (needs the future live-podcast orchestrator). Slots are declared
   (`podcast_slots.py`) and admin-repinnable; only call sites are missing.
5. **Collapse the duplicate blog/show-notes slot pairs** — `podcast.blog_writer` /
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
- ElevenLabs streaming shipped, incl. `text_to_dialogue/stream` — aidream ElevenLabs provider.
- `<speaker_settings>` now emitted by script agents (name + gender) — aidream `d18b531cd`.
- `pc_*` tables moved to the `podcast` schema; FE done.
- Runs / recovery / per-asset-regen subsystem — see `features/podcasts/FEATURE.md`.
