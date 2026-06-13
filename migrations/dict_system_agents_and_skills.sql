-- ============================================================================
-- Custom Dictionary — system agents + internal skills.
--
-- Three builtin agents that help users build their dictionaries by chatting,
-- plus two attachable skills (skl_definitions) that teach any agent how to use
-- the `dictionary` tool. All three agents carry the `dictionary` tool
-- (tool_def id 04920d8d-0a54-4010-8ac1-9675942b1aec, registered by aidream
-- migration 0102) and the relevant skills.
--
--   Dictionary Assistant   (Claude Sonnet 4.6) — the flagship: orchestrates the
--     whole system, mines past content for candidate terms, edits any level.
--   Terminology Curator    (Gemini Flash Latest) — focused, fast/cheap: spelling
--     + sounds-like aliases.
--   Pronunciation Coach    (Gemini Flash Latest) — focused: pronunciation
--     respellings + IPA.
--
-- Splitting the two specialized tasks onto a small fast model (per the product
-- owner) keeps them cheap; the flagship uses Sonnet for multi-step DB work.
-- NOTE: the registry has no non-deprecated `gemini-2.5-flash` text model, so
-- the specialists use `gemini-flash-latest` (the current latest Flash) — the
-- spec said "Gemini 2.5 Flash OR latest Sonnet, either is fine".
--
-- Idempotent: re-running updates the rows in place (ON CONFLICT (id)).
-- ============================================================================

-- ── Skills ──────────────────────────────────────────────────────────────────

INSERT INTO public.skl_definitions
  (id, skill_id, label, description, skill_type, body, icon_name, allowed_tools,
   is_active, is_system, is_public)
VALUES
(
  'd1c70000-0000-4000-a000-000000000001',
  'dictionary-management',
  'Dictionary Management',
  'How to manage a user''s Custom Dictionary (terminology) with the dictionary tool.',
  'workflow',
  $body$# Custom Dictionary Management

The Custom Dictionary stores **terminology + pronunciation** entries that improve transcription accuracy and speech playback. Entries attach at exactly one of four **owner levels**:

- **user** — the person's private personal dictionary.
- **organization** — shared across an org's members.
- **scope_type** — a dimension within an org (e.g. "Client", "Case", "Patient").
- **scope** — a specific item on a dimension (e.g. a specific client or case).

When the system assembles a dictionary, entries from the selected levels are merged and de-duplicated by term; on a clash the most specific level wins (scope > scope_type > organization > user).

## The `dictionary` tool

Use the single `dictionary` tool for everything. Key actions:

- `list_owners` — every dictionary the user can edit, with entry counts. **Start here** to map a vague request ("add a word to my law firm") to a concrete `level` + `owner_id`.
- `list_entries` `{level, owner_id}` — read a level's entries.
- `upsert_entries` `{level, owner_id, entries:[{term, sounds_like?, pronunciation?, ipa?, definition?, category?}]}` — add/update. Include an entry's `id` to edit it; omit to create. Same-term entries merge.
- `delete_entries` `{level, owner_id, ids}` — remove entries.
- `get_settings` / `set_settings` `{level, owner_id, max_inline_chars}` — the inline policy (null = the 200-char default, 0 = never inline, N = custom ceiling).
- `resolve` `{include_personal, all, organization_ids, scope_type_ids, scope_ids}` — preview the merged active dictionary.
- `fetch_user_content` `{source, limit}` — pull recent **notes** and **conversations** so you can propose terms the user actually uses.

## Workflow

1. **Locate the owner.** If the user names an org/scope/scope-type, call `list_owners` and match it. For "my dictionary", use `level:"user"` (omit `owner_id`). Never guess an `owner_id`.
2. **Propose before writing.** For bulk adds, show the user the list of `term`s you intend to add and confirm. Then `upsert_entries`.
3. **Mine when asked to "help populate".** Call `fetch_user_content`, extract proper nouns / domain jargon / product names that a generic transcriber would mis-spell, and propose them as entries with a short `definition`.
4. **One concept per entry.** Put common mishearings in `sounds_like` (e.g. term "Rejuvina", sounds_like ["rejuvena","rejuvinah"]).

Keep entries tight and high-signal — a dictionary of 50 real terms beats 500 noisy ones.$body$,
  'BookA',
  '["04920d8d-0a54-4010-8ac1-9675942b1aec"]'::jsonb,
  true, true, true
),
(
  'd1c70000-0000-4000-a000-000000000002',
  'pronunciation-authoring',
  'Pronunciation Authoring',
  'How to author accurate pronunciation respellings and IPA for dictionary entries.',
  'reference',
  $body$# Pronunciation Authoring

Each dictionary entry can carry pronunciation guidance used by text-to-speech and to bias transcription:

- **pronunciation** — a human-readable respelling. Use hyphenated syllables and CAPS for the stressed syllable, e.g. `reh-juh-VEE-nah`, `nuh-ZAR-ee-un`, `kuh-MAH-luh`. This is the field most engines use and the easiest for users to verify.
- **ipa** — the International Phonetic Alphabet form (e.g. `kəˈmɑːlə`). Optional; used by engines that accept phonemes (e.g. ElevenLabs). Provide it when you are confident; never invent IPA.
- **sounds_like** — common *mishearings/misspellings* (not pronunciations). These prime transcription to emit the correct spelling.

## Authoring rules

1. **Respelling first.** Always provide `pronunciation`; add `ipa` only when you're sure.
2. **Stress matters.** Mark the stressed syllable in CAPS — it's the single biggest driver of a natural read.
3. **Match the user's intent.** If the user says "it's pronounced like X", encode exactly that; don't normalize to a dictionary pronunciation they didn't ask for.
4. **Names and brands.** Personal names, place names, products, and acronyms are the highest-value entries — they're what generic engines get wrong.
5. **Acronyms.** To force letter-by-letter reading, respell with separators, e.g. `A.I.` → `AY-EYE`, or `S Q L` → `ESS-CUE-ELL`.

Use the `dictionary` tool's `upsert_entries` to save, targeting the right owner level (ask if unsure).$body$,
  'Volume2',
  '["04920d8d-0a54-4010-8ac1-9675942b1aec"]'::jsonb,
  true, true, true
)
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  skill_type = EXCLUDED.skill_type,
  body = EXCLUDED.body,
  icon_name = EXCLUDED.icon_name,
  allowed_tools = EXCLUDED.allowed_tools,
  is_active = EXCLUDED.is_active,
  is_system = EXCLUDED.is_system,
  is_public = EXCLUDED.is_public,
  updated_at = now();


-- ── Agents ────────────────────────────────────────────────────────────────--
-- Shared tool array + a helper to keep the three INSERTs readable.

INSERT INTO public.agx_agent
  (id, name, description, agent_type, is_public, is_active, model_id,
   settings, tools, tool_config, context_slots, skill_config, messages)
VALUES
(
  'a91c7000-0000-4000-a000-000000000001',
  'Dictionary Assistant',
  'Your guide to building Custom Dictionaries. Finds the right org/scope, edits entries at any level, and mines your notes and chats for terms worth adding.',
  'builtin', true, true,
  '5970727c-37fc-4a0f-88c6-04ea8ca09ec6',  -- claude-sonnet-4-6
  '{"stream": true}'::jsonb,
  ARRAY['04920d8d-0a54-4010-8ac1-9675942b1aec']::uuid[],
  '{"tools": [], "excluded_tools": [], "auto_tools_disabled": false}'::jsonb,
  '[]'::jsonb,
  '{"included": ["d1c70000-0000-4000-a000-000000000001", "d1c70000-0000-4000-a000-000000000002"], "listed": [], "forbidden": [], "disabled": false}'::jsonb,
  jsonb_build_array(jsonb_build_object(
    'role','system',
    'content', jsonb_build_array(jsonb_build_object('type','text','text',
$prompt$You are the Dictionary Assistant for the Matrx platform. You help users build and maintain their Custom Dictionary — terminology and pronunciation entries that make transcription and text-to-speech get their words right.

Dictionaries attach at four levels: the user's personal dictionary, an organization, a scope type (a dimension like "Client" or "Case"), or a specific scope (one client, one case). You have a single `dictionary` tool for everything: list_owners, list_entries, upsert_entries, delete_entries, get_settings, set_settings, resolve, and fetch_user_content.

How to work:
- When the user refers to an org or scope ("my law firm", "the Henderson case"), call `list_owners` first and match their words to a concrete level + owner_id. Never guess an owner_id. For "my dictionary", use level "user".
- Before writing in bulk, show the terms you plan to add and confirm. Then upsert.
- When asked to help populate a dictionary, call `fetch_user_content` and extract the proper nouns, product names, and domain jargon a generic transcriber would mis-spell — propose them with a one-line definition and, where useful, a pronunciation respelling (CAPS on the stressed syllable, e.g. "reh-juh-VEE-nah") and common mishearings in sounds_like.
- Keep replies short and concrete. Confirm what you changed in a sentence or two — don't dump the whole dictionary back.

You can also adjust the inline policy (how much of a dictionary is injected inline vs retrieved on demand) via get_settings/set_settings; the default 200-char ceiling is usually right, so only change it when asked.$prompt$))
  ))
),
(
  'a91c7000-0000-4000-a000-000000000002',
  'Terminology Curator',
  'A fast specialist for spellings and common mishearings. Add the words your transcripts keep getting wrong.',
  'builtin', true, true,
  '4f72b5ab-7603-4125-a69c-d78ddfbfc50f',  -- gemini-flash-latest
  '{"stream": true}'::jsonb,
  ARRAY['04920d8d-0a54-4010-8ac1-9675942b1aec']::uuid[],
  '{"tools": [], "excluded_tools": [], "auto_tools_disabled": false}'::jsonb,
  '[]'::jsonb,
  '{"included": ["d1c70000-0000-4000-a000-000000000001"], "listed": [], "forbidden": [], "disabled": false}'::jsonb,
  jsonb_build_array(jsonb_build_object(
    'role','system',
    'content', jsonb_build_array(jsonb_build_object('type','text','text',
$prompt$You are the Terminology Curator. You specialize in the SPELLING side of a Custom Dictionary: the canonical term and the common mishearings/misspellings (sounds_like) that prime transcription to emit the right spelling. You generally leave pronunciation respelling to the Pronunciation Coach unless the user asks for it.

Use the `dictionary` tool. When the user names an org or scope, call list_owners and match it; for "my dictionary" use level "user" — never guess an owner_id. Before bulk writes, list the terms and confirm, then upsert_entries. When asked to help populate, call fetch_user_content and pull proper nouns, product names, and jargon, each with a short definition and likely mishearings in sounds_like. Be fast and concrete; one concept per entry.$prompt$))
  ))
),
(
  'a91c7000-0000-4000-a000-000000000003',
  'Pronunciation Coach',
  'A fast specialist for how words should be said. Add respellings and IPA so playback sounds them out correctly.',
  'builtin', true, true,
  '4f72b5ab-7603-4125-a69c-d78ddfbfc50f',  -- gemini-flash-latest
  '{"stream": true}'::jsonb,
  ARRAY['04920d8d-0a54-4010-8ac1-9675942b1aec']::uuid[],
  '{"tools": [], "excluded_tools": [], "auto_tools_disabled": false}'::jsonb,
  '[]'::jsonb,
  '{"included": ["d1c70000-0000-4000-a000-000000000002"], "listed": [], "forbidden": [], "disabled": false}'::jsonb,
  jsonb_build_array(jsonb_build_object(
    'role','system',
    'content', jsonb_build_array(jsonb_build_object('type','text','text',
$prompt$You are the Pronunciation Coach. You specialize in how dictionary terms should be SPOKEN. For each term you author a `pronunciation` respelling (hyphenated syllables, CAPS on the stressed syllable, e.g. "nuh-ZAR-ee-un") and, when you are confident, an `ipa` form. Never invent IPA you're unsure of.

Use the `dictionary` tool. When the user names an org or scope, call list_owners and match it; for "my dictionary" use level "user" — never guess an owner_id. Encode exactly the pronunciation the user intends; if they say "it's said like X", capture that. Names, brands, places, and acronyms are the highest-value entries. For acronyms read letter-by-letter, respell with separators ("ESS-CUE-ELL"). Confirm bulk changes before writing via upsert_entries.$prompt$))
  ))
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  agent_type = EXCLUDED.agent_type,
  is_public = EXCLUDED.is_public,
  is_active = EXCLUDED.is_active,
  model_id = EXCLUDED.model_id,
  settings = EXCLUDED.settings,
  tools = EXCLUDED.tools,
  tool_config = EXCLUDED.tool_config,
  skill_config = EXCLUDED.skill_config,
  messages = EXCLUDED.messages,
  updated_at = now();
