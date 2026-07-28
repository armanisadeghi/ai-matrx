---
status: active
updated: 2026-07-28
repos: [aidream, matrx-frontend]
---

# Custom Dictionary — TTS pronunciation tail

Terminology + pronunciation entries at four owner levels (user / org / scope type / scope), merged
most-specific-wins; feeds cleanup-agent context and TTS pronunciation. The system is built and
prod-verified (aidream v0.1.536, 2026-07-13). What remains is the **spoken-audio** half: one code
asymmetry to close, then a human listen.

## Resources

- `features/dictionary/FEATURE.md` — canonical (FE).
- aidream: `aidream/aidream/services/dictionary/` (`locators.py`, `sync_engine.py`, `FEATURE.md`); auto-injection in `aidream/aidream/services/conversation_context/dictionary_inject.py`; the one substitution primitive is `DictionaryConfig.coerce` / `apply_aliases` in `packages/matrx-ai/matrx_ai/config/dictionary_config.py`.
- Podcast path: `packages/matrx-ai/matrx_ai/agent_runners/podcast_generator.py` — `_apply_dictionary_pronunciations` (def `:1812`, called `:1868`) inside `_create_audio` (`:1828`). Request plumbing: `aidream/api/routers/podcast_generator.py:86`, `graph_actions/podcast/generate.py:131`, `services/podcast/generation.py:117`.
- Provider floor: `apply_tts_dictionary` in `providers/{google,eleven_labs,openai,groq,xai}/*_api.py` + `providers/unified_client.py`.
- Test routes: `/dictionary/admin`, `/transcripts/cleanup`, and Settings → Voice → Dictionary (registry id `voice.dictionary`, `features/settings/registry.ts:415` → `DictionaryTab`; it is a catch-all route, not an app-dir page). Login admin@admin.com / Password1234#.

## Remaining work

1. **Close the podcast path asymmetry.** `_apply_dictionary_pronunciations` runs only on the **3+ speaker / ElevenLabs** branch (`podcast_generator.py:1868`). The default **1–2 host / Gemini** branch never calls it — it sets `overrides["dictionary"]` (`:1900-1901`) and relies on the Google translator folding a pronunciation *instruction* into content, i.e. a model hint rather than a text rewrite. Decide and make it one path: either apply the substitution on both branches, or document why the Gemini branch is deliberately instruction-based. Right now the common case is the unverified one.
2. **Human listen for podcast carry-through (Arman — needs ears).** Generate a podcast with a distinctive pronunciation entry and listen. Do the 1–2 host case, since that's the branch item 1 covers.
3. **No test covers TTS dictionary substitution at all** — zero references to `apply_aliases` / `apply_tts_dictionary` outside implementation and provider call sites. A small unit test over `apply_aliases` + one over `_apply_dictionary_pronunciations` would make the listen-check a one-time thing instead of a recurring one.

## Done

- Full system built + live-verified — see `features/dictionary/FEATURE.md`.
- Prod deploy re-verify 2026-07-13 (aidream v0.1.536): auto-injection on `matrx-user/transcripts-cleanup` quotes the injected Custom Dictionary block; Diagram Editor skill run clean; zero new `dictionary_recovery` / `skill_merge_recovery` rows in `public.system_error`.
- **STT keyterm biasing was removed on purpose 2026-07-17** — dictionary-derived Whisper/Groq prompts were pulled from every browser recording path and the shared AIDream audio contract, because Whisper treats that field as continuation context and could transcribe a vocabulary list that isn't in the audio. Do not re-add it. Dictionary support is TTS pronunciation + cleanup-agent context only.
