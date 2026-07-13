---
status: active
updated: 2026-07-13
repos: [aidream, matrx-frontend]
---

# Custom Dictionary — activation remainder

Terminology + pronunciation entries at four owner levels (user / org / scope type / scope), merged
most-specific-wins; feeds transcription biasing, cleanup-agent context, and TTS pronunciation.
Frontend done. The `dictionary` tool path is now **prod-verified end-to-end**; two aidream fixes
(auto-injection binding + skill loading) are committed and wait on the next deploy.

## Resources

- `features/dictionary/FEATURE.md` — canonical (Change log `2026-07-13` records the prod pass).
- Dictionary Assistant agent: `ab1a868e-b866-4ade-9383-fd63b0928c7c`; `dictionary` tool_def `04920d8d-0a54-4010-8ac1-9675942b1aec`.
- aidream: `aidream/services/conversation_context/dictionary_inject.py` (auto-injection; the ArrayArg fix), `packages/matrx-ai/matrx_ai/skills/models.py` (`SkillBody.version`), recovery errors land in `public.system_error` (`kind='dictionary_recovery'` / `'skill_merge_recovery'`).
- Cache-busts (admin JWT): `POST /admin/tool-routing/cache-bust`, `POST /ai/agents/{id}/invalidate-cache`.
- Test routes: `/user-settings/voice/dictionary`, `/transcripts/cleanup`, `/dictionary/admin`. Login admin@admin.com / Password1234#.

## Remaining work

1. **After the next aidream prod deploy, re-verify auto-injection.** Run the Dictionary Assistant on
   `POST /ai/agents/ab1a868e-…` with `client.surface = "matrx-user/transcripts-cleanup"` and ask the
   model to quote its injected Custom Dictionary block (it answered "NO BLOCK" pre-fix). Also confirm
   `public.system_error` stays free of new `dictionary_recovery` / `skill_merge_recovery` rows.
2. **Human listen for podcast carry-through.** Payload plumbing + `_apply_dictionary_pronunciations`
   substitution are verified; whether the spoken audio honors pronunciations needs ears — generate a
   podcast with a distinctive pronunciation entry and listen.

## Done

- Full system built + live-verified — see `features/dictionary/FEATURE.md`.
- Prod tool path verified 2026-07-13: cache-bust run (336 tools), Dictionary Assistant calls the
  `dictionary` tool and writes `dict_entries` on prod. Fixed the agent's missing tool assignment
  (`agent.definition.tools` was empty — the model improvised with generic `data` tools).
- Auto-injection root-caused + fixed: `dict_resolve_for` was called with jsonb args instead of
  `uuid[]` (every call failed since day one; best-effort swallow hid it). `ArrayArg` fix verified
  against the live DB — deploy-pending.
- Skill loading fixed: `SkillBody.version` typed `str` vs DB integer stripped ALL skills from every
  agent run that included one — deploy-pending.
- STT keyterm biasing on live capture wired: `useChunkedRecordAndTranscribe` falls back to the
  global-active-context STT prompt when no explicit surface key — covers `GlobalRecordingProvider`.
