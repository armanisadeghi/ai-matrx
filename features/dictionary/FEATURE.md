# FEATURE.md — `dictionary`

**Status:** `active`
**Tier:** `2`
**Last updated:** `2026-06-13`

---

## Purpose

Custom Dictionary — terminology + pronunciation entries attachable at four owner levels (**user, organization, scope type, scope**). Improves transcription accuracy (Whisper keyterm biasing + cleanup-agent context) and speech playback (TTS pronunciation). At use time the relevant dictionaries are **merged and de-duplicated by term; the most specific level wins** (scope > scope_type > organization > user).

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
- `useDictionaryContext(surfaceKey)` — surface consumption: selection (from surface-user-state) + resolved entries + `sttPrompt`/`ttsAliases`/`contextBlock` + `setSelection`.

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

**Key types** — `features/dictionary/types.ts`: `DictEntry`, `DictLevel`, `DictSelection`, `ResolvedDictionary`, `DictConsumption`.

---

## Key flows

- **Manage** — `DictionaryManager` (reusable for all four levels) → `dictionaryService` → `dict_*` RPCs. `DictionarySection` embeds it into org/scope edit flows; `DictionaryTab` mounts it for the user level.
- **Select** — `DictionarySelectorWindow` (a WindowPanel overlay, id `dictionarySelectorWindow`) writes the selection to `user_surface_state` keyed by surface; it communicates back to the parent **through that shared store, not a callback**.
- **Consume (client)** — STT: audio hooks read the resolved `sttPrompt` via `sttBridge` when a surface opts in with `transcriptionOptions.dictionarySurfaceKey`. TTS: Cartesia hooks apply pronunciation substitutions via `ttsBridge` + `parseMarkdownToText(text, { pronunciations })` when given `dictionarySurfaceKey`.
- **Consume (server, auto-injection)** — aidream `apply_dictionary` (in all four agent-run prep sites) resolves the user's stored selection for any surface flagged `supports_dictionary` and sets `config.dictionary`; the translator (`BaseTranslator.get_system_text`) renders a definitions block for chat models and a terse pronunciation directive for TTS / non-function-calling models. (aidream-side; see that repo.)

---

## Invariants & gotchas

- **All `dict_*` Supabase access goes through `dictionaryService`** — no direct table queries elsewhere.
- **The selection lives in `user_surface_state`, never in this slice.** The slice holds the resolved RESULT per surface. The selector window and consuming surfaces stay in sync through the shared store.
- **Inline-policy control is shared, not forked** — `features/agents/components/context-slots-management/InlinePolicyControl.tsx` (+ `decodeInlinePolicy`/`encodeInlinePolicy`) is the one implementation used by both the dictionary manager and the agent context-slot builder.
- **Merge dedup is most-specific-wins** (scope > scope_type > org > user); enforced in `dict_resolve_for`.
- **Renders must be deterministic** (sorted by term) so a server-injected dictionary block stays byte-identical across turns and the LLM prompt cache holds.
- The 3 system agents + 2 skills are seeded by `migrations/dict_system_agents_and_skills.sql`; the `dictionary` tool by aidream migration `0102`. Agent/skill/tool ids are in `features/dictionary/constants.ts`.

---

## Related features

- **Transcripts / Studio / Scribe / Cleanup** (`features/transcription-cleanup`, `features/transcript-studio`) — consuming surfaces. Cleanup shows the full merged view (`DictionaryContextCard`); studio mounts the compact `DictionaryIndicatorButton`.
- **Agents** (`features/agents`) — 3 builtin agents (Dictionary Assistant = Claude Sonnet; Terminology Curator + Pronunciation Coach = Gemini Flash) drive the `dictionary` tool; 2 attachable skills (`dictionary-management`, `pronunciation-authoring`); shares the inline-policy control.
- **Surfaces** (`features/surfaces`) — `user_surface_state` primitive + `supports_dictionary` flag.
- **Podcasts** — generation accepts a resolved dictionary (request `dictionary` field).

---

## Doctrine compliance

- **Reused, not forked:** extended the surfaces registry (`supports_dictionary` + `user_surface_state` primitive), the agent inline-policy control (extracted + shared), the Whisper `prompt` param, the Cartesia `parseMarkdownToText` step, and the aidream unified-config translator layer.
- **No legacy:** net-new feature; nothing replaced.
- **Single chokepoints:** `dictionaryService` for `dict_*`; one `dictionary` multi-action tool; one shared inline-policy control.

---

## Current work / migration state

Complete and live-verified on web (settings CRUD, cleanup card, selector window, DB RPCs, tool drift, seeded agents/skills). Compact indicator mounted on transcript studio; the same component drops onto scribe/podcast surfaces with a one-line addition. aidream auto-injection + podcast dictionary + the `dictionary` tool are committed; **re-verify after aidream prod deploy + a tool-routing cache-bust** (`POST /admin/tool-routing/cache-bust`). Surface scope-value declarations for agent variable-binding (vs the auto-injection path already shipped) are a future enhancement.

---

## Change log

- `2026-06-13` — Feature created. DB (dict_entries/dict_settings/user_surface_state/supports_dictionary + RPCs), FE feature (manager, sections, settings tab, selector WindowPanel, indicator, cleanup card, import/export, surface-user-state primitive), STT/TTS consumers, aidream config/translator/auto-injection/podcast, `dictionary` tool + 3 system agents + 2 skills.
