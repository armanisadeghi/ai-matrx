---
status: active
updated: 2026-07-22
repos: [matrx-frontend, aidream]
vision: [/Users/armanisadeghi/code/aidream/packages/matrx-ai/matrx_ai/agent_runners/PODCAST_PIPELINE.md]
---

# Podcast system — remaining gaps

The flow is `Content → Script → Audio` with hard gates between stages; the gate law lives in
`PODCAST_PIPELINE.md` (aidream, beside the pipeline — READ FIRST). The living state of the whole
system (through 2026-07-06, incl. the runs/recovery/per-asset-regen subsystem) is
`features/podcasts/FEATURE.md` — do not restate it here.

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

1. **Chapters unwired.** `podcast_chapter_marker` agent exists server-side; the run page still
   shows a "Chapter markers" Coming-Soon card — `features/podcasts/studio/components/StudioRunView.tsx:269`.
2. **Post-prep agents unbuilt.** Post-prep defaults to NONE; the 4 full post-prep agents
   (translation / summarization / fact-checking / expansion) don't exist. FE honestly gates the
   formats via ComingSoon — `features/podcasts/generator/constants.ts:282`.
3. **Large casts (7–20 hosts) unverified.** Tested up to 6. GATE 2 is strict (N means N), so an
   agent producing 13 of 14 speakers fails the run. Test 10/14/20 before advertising reliability.
4. **Persisted script may contain agent thinking text — unverified.** `pc_episodes.script` stores
   the script agent's full output; blog/show-notes/transcript can inherit reasoning text. The clean
   dialogue is available via `_extract_dialogue`; persisting it instead is a small change in
   `_validated_script_stage` (aidream). Verify whether current output still leaks, then fix.
5. **`SCRIPT_AGENT_REGISTRY` not built.** Specced in `PODCAST_PIPELINE.md` §4 (custom agents slot
   in by `(format, language, host_min, host_max)`); today a custom format/language means editing
   `_create_script` / `_is_legacy_script_request`. Build when the custom-agent count grows.
6. **Languages: only en-US wired** — `features/podcasts/generator/constants.ts:203`; others show
   "Soon". Enable per-locale after verifying TTS voice quality.

## Done

- Podcast generate/resume streams use canonical `callApi`, so active scope is
  injected; aidream applies it on generate and restores the stored run org on
  resume.
- Server gate enforcement deployed — aidream `b3e3dfc40`; gate tests in `scripts/podcast_gate_tests.py`.
- ElevenLabs streaming shipped, incl. `text_to_dialogue/stream` — aidream ElevenLabs provider.
- `<speaker_settings>` now emitted by script agents (name + gender) — aidream `d18b531cd`.
- `pc_*` tables moved to the `podcast` schema; FE done.
- Runs / recovery / per-asset-regen subsystem — see `features/podcasts/FEATURE.md`.
