# Custom Dictionary — Handoff

**Date:** 2026-06-13 · **Status:** Core complete + live-verified; two items remain (one product decision, one deploy step). · **Feature doc:** [`features/dictionary/FEATURE.md`](../../features/dictionary/FEATURE.md)

Terminology + pronunciation entries at four owner levels (**user / organization / scope type / scope**), merged + de-duplicated at use time (most-specific wins). Improves transcription accuracy (Whisper keyterm biasing + cleanup-agent LLM context) and TTS pronunciation. Spans `matrx-frontend` + `aidream`.

---

## What is DONE and live-verified

| Area | State | How verified |
|---|---|---|
| DB: `dict_entries`, `dict_settings`, `user_surface_state`, `ui_surface.supports_dictionary` + `dict_*` RPCs | Applied | Live SQL round-trip; merge precedence + dedup; **user isolation** (cross-user read + non-member org write both raise `42501`) |
| Management UI: settings tab (`voice.dictionary`), org/scope-type/scope `DictionarySection`, CSV/JSON import + template, inline-policy override | Done | Settings CRUD UI→DB→render+toast (created/read/deleted a real entry in-browser) |
| Cleanup page merged-view card + selector `WindowPanel` | Done | Card showed merged entry with source badge; selector listed personal + orgs + scope types |
| Compact `DictionaryIndicatorButton` | Mounted on transcript **studio**, **scribe**, **podcast studio (Advanced)** | Studio + podcast-Advanced verified by screenshot |
| STT biasing (`parseMarkdownToText` pronunciations; Whisper `prompt`) + TTS substitution | Wired (opt-in per surface) | Unit-correct; see weakness #1 for the gap |
| `dictionary` tool (read+write, user-scoped) | Live | **Executed end-to-end** against the DB (list_owners/upsert/list/delete) as a real user; scoping via `ctx.user_id → dict_*_for` |
| **Dictionary Assistant** agent | Built via Agent Factory | `ab1a868e-b866-4ade-9383-fd63b0928c7c`, `builtin`, public, **Gemini 3.5 Flash**, carries the tool + 2 skills; real structured prompt |
| aidream config / translator / 4-site auto-injection / podcast field | Committed | Unit-tested renders; **needs deploy — see below** |

### Key IDs / locations
- Agent: `ab1a868e-b866-4ade-9383-fd63b0928c7c` (spec: `aidream/internal_agents/dictionary_assistant.md`)
- `dictionary` tool_def: `04920d8d-0a54-4010-8ac1-9675942b1aec` (aidream migration `0102`)
- Skills: `d1c70000-…-0001` (dictionary-management), `…-0002` (pronunciation-authoring)
- FE constants: `features/dictionary/constants.ts`

---

## REMAINING — Item 1 (product decision): shortcut + widget launch

The Dictionary Assistant is built and works, but is **not yet launched as a widget**. Per the product owner it should open as a small pop-up / side-panel (a **shortcut** with a panel `displayMode` — `floating-chat` / `sidebar` / `chat-assistant`), **not** the full `/chat` route.

- **Interim state:** `features/dictionary/hooks/useOpenDictionaryAssistant.ts` (used by the "Ask assistant" button in `DictionaryManager`) currently `router.push`es to `/chat/a/<agentId>`. This is functional but is the chat-screen behavior the owner asked us to avoid.
- **To finish:** create an `agx_shortcut` row pointing at agent `ab1a868e-…` with a panel `displayMode` (recommend `floating-chat` or `sidebar`), then change `useOpenDictionaryAssistant` to launch that shortcut via the shortcut launch path (`features/agents/redux/execution-system/thunks/launch-conversation.thunk.ts` / `createInstanceFromShortcut`) instead of `router.push`. The product owner said they would set up the widget; coordinate on shortcut **scope** (system-wide vs per-user) and **category** before creating the row. Shortcut model + displayMode list: `features/agent-shortcuts/FEATURE.md`.

---

## REMAINING — Item 2 (deploy step): activate the aidream server pieces

The aidream changes (the `dictionary` tool executor + DB row, the 4-site auto-injection, the translator render, the podcast dictionary field) are committed but only take effect in production after:

1. **Deploy aidream** (`server.app.matrxserver.com`).
2. **Bust the caches:** `POST /admin/tool-routing/cache-bust` — clears the ToolRegistry (so the `dictionary` tool is dispatchable) and the surface-manifest cache (so `supports_dictionary` is read).

Then re-verify in production (not yet done — local-only so far):
- The Dictionary Assistant calls the `dictionary` tool in a real chat and writes an entry.
- Server auto-injection: a flagged surface (e.g. `matrx-user/transcripts-cleanup`) gets `config.dictionary` set; chat models receive the definitions block, TTS/non-FC models the pronunciation directive.
- Podcast generation carries the dictionary into the script + audio agents.

---

## Weaknesses & improvement opportunities (true improvements)

1. **STT keyterm biasing isn't active on the studio/scribe recorders yet.** The mechanism is opt-in via `TranscriptionOptions.dictionarySurfaceKey` and is fully wired through `useAudioTranscription` / `useChunkedRecordAndTranscribe`. But the studio/scribe capture goes through `GlobalRecordingProvider`, which doesn't yet pass a `dictionarySurfaceKey`. **Fix:** thread the active surface's key into the provider's transcription options so live capture is biased by the user's dictionary. (The cleanup-page LLM context is already covered server-side via `supports_dictionary`; this is specifically the Whisper-prompt biasing on the recorders.)
2. **Prompt-cache stability on server auto-injection.** `apply_dictionary` re-resolves each turn. It renders deterministically (sorted), so identical data → identical block → cache holds; but a mid-conversation dictionary edit mutates the cached prefix. **Improvement:** freeze the resolved block per conversation (resolve on turn 1, reuse) or gate refresh on `_is_cache_likely_alive`.
3. **ElevenLabs multi-word streaming substitution.** Single-word pronunciation substitutions are reliable; a multi-word term can straddle a flush boundary in the live ElevenLabs path. Low impact (most terms are single tokens); document/accept or hold back trailing words per flush.
4. **Surface scope-value declarations.** Auto-injection (the shipped path) covers the LLM context. A future enhancement: declare `dictionary_terms` etc. as bindable `ui_surface_value`s so power users can map the dictionary into a custom agent variable via surface bindings.
5. **Mobile (RN) + Chrome extension.** Inherit the data layer (RPCs/services) but have no dictionary UI yet — deliberately out of scope this pass.
6. **Skills were hand-seeded via SQL** (`migrations/dict_system_agents_and_skills.sql`). Skills (not agents) are reasonable to seed this way, but if a canonical skill-authoring pipeline exists, migrate them to it for consistency. (The three hand-rolled *agents* that file created were dropped via `migrations/dict_drop_handrolled_agents.sql` and rebuilt through the Agent Factory — see FEATURE.md.)
7. **Specialist agents dropped.** The original 3-agent split (Terminology Curator / Pronunciation Coach) had no invocation path and was removed in favor of one capable assistant. If structured one-shot helpers are wanted (e.g. "suggest terms from my notes" → JSON list), build them as **task agents via the Agent Factory** with real variables + `json_schema` output and wire them to manager buttons.

---

## Model note

`gemini-2.5-flash` is **deprecated** in the `ai_model` registry. The assistant uses **`gemini-3.5-flash`** (`979205fd-…`) per the product owner. The two specialist agents that briefly used `gemini-flash-latest` were deleted.
