# FEATURE.md — `dictionary`

**Status:** `active`
**Tier:** `2`
**Last updated:** `2026-06-17`

---

## Purpose

Custom Dictionary — terminology + pronunciation entries attachable at four owner levels (**user, organization, scope type, scope**). Improves transcription accuracy (Whisper keyterm biasing + cleanup-agent context) and speech playback (TTS pronunciation). At use time the relevant dictionaries are **merged and de-duplicated by term; the most specific level wins** (scope > scope_type > organization > user) — the **persistent** set. On top of it, a surface may carry **per-task custom entries** (session-scoped, never saved) that **override** persistent for that one task.

---

## Entry points

**Routes**
- `/user-settings/voice/dictionary` — the user's personal dictionary (settings tab `voice.dictionary`).
- `/organizations/[orgId]/settings#dictionary` — org dictionary (OrgManage Dictionary section).
- `/organizations/[orgId]/scopes/[typeId]/edit` — scope-type dictionary (ScopeTypeEditView).
- `/organizations/[orgId]/scopes/[typeId]/[scopeId]/edit` — scope dictionary (ScopeEditView).
- `/dictionary/admin` — feature admin map.

**Hooks**
- `useDictionary(level, ownerId)` — per-owner CRUD + inline-policy for the manager UI.
- `useDictionaryContext(surfaceKey)` — surface consumption: selection (from surface-user-state) + resolved entries + `sttPrompt`/`ttsAliases`/`contextBlock` + `setSelection`. Also the per-task custom set: `customEntries` + `addCustomEntry`/`removeCustomEntry`/`clearCustomEntries`.

**Services**
- `features/dictionary/service/dictionaryService.ts` — **sole chokepoint** for all `dict_*` Supabase RPC access.

**Bridges (store-level, for non-React consumers)**
- `features/dictionary/sttBridge.ts` — `resolveDictionarySttPrompt(surfaceKey)` for the audio recording hooks.
- `features/dictionary/ttsBridge.ts` — `resolveDictionaryTtsAliases(surfaceKey)` for the Cartesia TTS hooks.

**Redux slice(s)**
- `features/dictionary/redux/dictionarySlice.ts` (`state.dictionary`) — owners catalogue, per-owner entry cache, per-surface resolved consumption. In-flight dedup + 30s TTL.
- `features/surfaces/redux/userStateSlice.ts` (`state.surfaceUserState`) — the generic per-user, per-surface state store the selection rides on (see below).

---

## Admin map

`/dictionary/admin` → `app/(core)/dictionary/admin/page.tsx` (`FeatureAdminMap` → `<FeatureAdminPage>`). When you add a route / window panel / component / slice, append it there.

---

## Data model

**Database tables** (Supabase, migration `migrations/dict_dictionary_system.sql`)
- `dict_entries` — one row per entry. Exactly-one-owner columns (`user_id` | `organization_id` | `scope_type_id` | `scope_id`, CHECK), `term`, `sounds_like text[]`, `pronunciation`, `ipa`, `definition`, `category`, `is_active`. Unique on `(owner cols, lower(term)) NULLS NOT DISTINCT`.
- `dict_settings` — one row per owner; `max_inline_chars` (null=200 default, 0=never, N=ceiling) — identical to the agent context-slot inline policy.
- `user_surface_state` (`migrations/user_surface_state.sql`) — generic `(user_id, feature, surface_key) → state jsonb`. `'_default'` surface_key = global default. RLS owner-only. The dictionary selection persists here under `feature='dictionary'`.
- `ui_surface.supports_dictionary` (`migrations/ui_surface_supports_dictionary.sql`) — flags surfaces that auto-inject the dictionary server-side.

**RPCs** — auth modeled on `migrations/ctx_set_entity_scopes_auth.sql`. Each comes as an inner `*_for(p_user_id,…)` function (the aidream backend calls these over its direct Postgres connection where `auth.uid()` is NULL) **+** a `SECURITY DEFINER` wrapper passing `auth.uid()` (the browser): `dict_list_owners`, `dict_resolve`, `dict_list_entries`, `dict_upsert_entries`, `dict_delete_entries`, `dict_get_settings`, `dict_set_settings`. Permissions: org membership = read AND write; personal dictionary is private.

**Key types** — `features/dictionary/types.ts`: `DictEntry`, `DictLevel`, `DictSelection` (carries `customEntries`), `ResolvedDictionary`, `DictConsumption` (exposes `customEntries`). Per-task entries are **request-time only — no table.**

---

## Key flows

- **Manage** — `DictionaryManager` (reusable for all four levels) → `dictionaryService` → `dict_*` RPCs. `DictionarySection` embeds it into org/scope edit flows; `DictionaryTab` mounts it for the user level.
- **Select** — `DictionarySelectorWindow` (a WindowPanel overlay, id `dictionarySelectorWindow`) writes the selection to `user_surface_state` keyed by surface; it communicates back to the parent **through that shared store, not a callback**. Its **"Add for this task"** section appends `customEntries` (per-task pronunciations) to that same selection.
- **Consume (client)** — STT: audio hooks read the resolved `sttPrompt` via `sttBridge` when a surface opts in with `transcriptionOptions.dictionarySurfaceKey`. TTS: Cartesia hooks apply pronunciation substitutions via `ttsBridge` + `parseMarkdownToText(text, { pronunciations })` when given `dictionarySurfaceKey`. The `ttsAliases` (and `sttPrompt`/`contextBlock`) already fold persistent + per-task in `buildConsumption(resolved, customEntries)`.
- **Consume (server, all TTS providers)** — a request sends `dictionary.entries` (persistent) + `dictionary.custom_entries` (per-task) + `tts_quality`. aidream's **substitution floor** (`apply_tts_dictionary`, `config/dictionary_config.py`) rewrites the spoken text on every engine — ElevenLabs `text_to_dialogue` (whose native locators don't apply), Google Gemini-TTS, Groq, xAI, OpenAI. Per-provider model/mechanism research: `aidream/docs/dictionary/providers/`.
- **Consume (server, auto-injection)** — aidream `apply_dictionary` (in all four agent-run prep sites) resolves the user's stored selection for any surface flagged `supports_dictionary` and sets `config.dictionary`; the translator (`BaseTranslator.get_system_text`) renders a definitions block for chat models and a terse pronunciation directive for TTS / non-function-calling models. (aidream-side; see that repo.)

---

## Invariants & gotchas

- **All `dict_*` Supabase access goes through `dictionaryService`** — no direct table queries elsewhere.
- **The selection lives in `user_surface_state`, never in this slice.** The slice holds the resolved RESULT per surface. The selector window and consuming surfaces stay in sync through the shared store.
- **Inline-policy control is shared, not forked** — `features/agents/components/context-slots-management/InlinePolicyControl.tsx` (+ `decodeInlinePolicy`/`encodeInlinePolicy`) is the one implementation used by both the dictionary manager and the agent context-slot builder.
- **Merge dedup is most-specific-wins** (scope > scope_type > org > user); enforced in `dict_resolve_for`. **Per-task `customEntries` win over all of it** — folded first in `buildConsumption`, kept-first on dedup. They persist in `user_surface_state` (so they survive a remount) but never reach a `dict_*` table; clear them when the task ends.
- **TTS is correct on every provider via the substitution floor, not native dictionaries.** ElevenLabs `text_to_dialogue` silently ignores `pronunciation_dictionary_locators` and `eleven_flash_v2_5` drops phoneme rules — so respelling substitution is the floor; native channels are an optimization layered only where they reliably apply.
- **Two quality modes, latest models only.** Every TTS request carries `tts_quality` (`high_quality` | `fast`); the backend resolves the latest model per tier and **refuses deprecated ids** (`config/tts_config.py` `QUALITY_TIERS`). Saved audio = HQ.
- **Renders must be deterministic** (sorted by term) so a server-injected dictionary block stays byte-identical across turns and the LLM prompt cache holds.
- **The agent is built via the Agent Factory, never hand-inserted SQL.** `migrations/dict_system_agents_and_skills.sql` seeds the 2 skills; its 3 hand-rolled agents were dropped (`migrations/dict_drop_handrolled_agents.sql`) and replaced by the factory-built `dictionary_assistant`. The `dictionary` tool is aidream migration `0102`. Ids in `features/dictionary/constants.ts`.

---

## Related features

- **Transcripts / Studio / Scribe / Cleanup** (`features/transcription-cleanup`, `features/transcript-studio`) — consuming surfaces. Cleanup shows the full merged view (`DictionaryContextCard`); studio mounts the compact `DictionaryIndicatorButton`.
- **Agents** (`features/agents`) — one builtin **Dictionary Assistant** (`ab1a868e-…`, Gemini 3.5 Flash) drives the `dictionary` tool; built via the aidream **Agent Factory** (`internal_agents/dictionary_assistant.md`), NOT a hand-rolled SQL seed. 2 attachable skills (`dictionary-management`, `pronunciation-authoring`); shares the inline-policy control.
- **Surfaces** (`features/surfaces`) — `user_surface_state` primitive + `supports_dictionary` flag.
- **Podcasts** — generation accepts `dictionary.entries` + `dictionary.custom_entries` + `tts_quality` (`GeneratorForm` sends HQ for saved audio). The generator's `_apply_dictionary_pronunciations` bakes the respellings into the spoken text, so per-task entries apply automatically.

---

## Doctrine compliance

- **Reused, not forked:** extended the surfaces registry (`supports_dictionary` + `user_surface_state` primitive), the agent inline-policy control (extracted + shared), the Whisper `prompt` param, the Cartesia `parseMarkdownToText` step, and the aidream unified-config translator layer.
- **No legacy:** net-new feature; nothing replaced.
- **Single chokepoints:** `dictionaryService` for `dict_*`; one `dictionary` multi-action tool; one shared inline-policy control.

---

## Current work / migration state

Complete and live-verified on web (settings CRUD, cleanup card, selector window, DB RPCs, tool drift, seeded agents/skills). Compact indicator mounted on transcript studio; the same component drops onto scribe/podcast surfaces with a one-line addition. aidream auto-injection + podcast dictionary + the `dictionary` tool are committed; **re-verify after aidream prod deploy + a tool-routing cache-bust** (`POST /admin/tool-routing/cache-bust`).

**Multi-provider TTS + per-task custom (2026-06-17):** FE typecheck-clean; backend substitution floor + quality tiers unit-verified live. **Deploy-pending re-verify:** the substitution floor on real audio per provider, the situational override end-to-end, and (decision flag) podcast 1–2-host Gemini now requesting the **pro** HQ model — higher quality, slower; revert via `tts_quality:"fast"` if the latency regresses. Google's fast tier should migrate to `gemini-3.1-flash-tts-preview` once registered in `ai_models`. Surface scope-value declarations for agent variable-binding are a future enhancement.

---

## Change log

- `2026-06-13` — Feature created. DB (dict_entries/dict_settings/user_surface_state/supports_dictionary + RPCs), FE feature (manager, sections, settings tab, selector WindowPanel, indicator, cleanup card, import/export, surface-user-state primitive), STT/TTS consumers, aidream config/translator/auto-injection/podcast, `dictionary` tool + 3 system agents + 2 skills.
- `2026-06-17` — **Multi-provider voice dictionary.** Per-task `customEntries` (DictSelection/DictConsumption + `buildConsumption` fold + selector "Add for this task" UI + payload `custom_entries`). aidream: universal `apply_tts_dictionary` substitution floor wired into all 5 backend TTS providers; two `tts_quality` modes per provider (`QUALITY_TIERS` + deprecation guards) plumbed through LLMParams→UnifiedConfig→provider and the podcast request; per-provider research at `aidream/docs/dictionary/providers/`. Fixed the ElevenLabs no-op: `text_to_dialogue` ignores native locators → substitution applies pronunciation instead.
