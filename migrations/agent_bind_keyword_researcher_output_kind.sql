-- agent_bind_keyword_researcher_output_kind.sql
--
-- Bind the Keyword Relationship Researcher (agent.definition c4b999a2-…, slot
-- `seo.keyword_researcher`, gemini-3.6-flash) to the
-- `keyword_relationship_research` kind, and remove the two things that made
-- that binding impossible or self-contradictory.
--
-- Precedent + full reasoning: migrations/agent_bind_topic_idea_generator_output_kind.sql.
--
-- THREE CHANGES, all required together:
--
-- 1. `settings.response_format` is DROPPED. It held {"type": "json_object"},
--    and `matrx_ai.client_host.agent_source.definition_to_agent_config` lifts
--    `output_schema` into `config.response_format` ONLY when
--    `config.response_format is None` — settings win. So writing
--    `output_schema` while that key survived would have been a silent NO-OP:
--    the binding would sit in the DB, the admin UI would show it bound, and
--    the model would keep running in plain json_object mode. The bare
--    json_object mode is strictly weaker than the schema replacing it.
--
-- 2. `output_schema` is set to exactly what the server-side binder
--    `matrx_ai.kinds.response_format_for_kind('keyword_relationship_research')`
--    builds: the kind's `emitted_json_schema` through
--    `lint_output_schema(...).portable_schema` (additionalProperties:false +
--    all-required on every object node).
--
-- 3. The system prompt's output-contract block is rewritten, because it taught
--    a shape the schema FORBIDS: it demanded `"__kind": "keyword_relationship_research"`
--    at the root and `"__kind": "keyword_list"` on every list, but the kind's
--    portable schema is additionalProperties:false and declares neither. Under
--    a bound schema the model cannot emit them, so the instruction was dead
--    text pulling against the contract on every run. The consumer already
--    strips both markers (`aidream/services/seo/keyword_research.py`
--    `_normalize_artifact` → `strip_kind_key`), so removing them from the
--    prompt changes nothing downstream. The same block also shipped a literal
--    unfilled placeholder — `[OUTPUT RULES — ABSOLUTE: ...]` — plus a stray
--    unopened code fence, both sent to the model verbatim on every run; the
--    rewrite removes them.
--
-- No `__kind` in the bound schema, for the reason the topic_ideas precedent
-- established live: Gemini ignores JSON Schema `const` and invents a
-- discriminator, and `useKindRequest.readKind` prefers the model's value over
-- the caller's expectedKind, so a wrong `__kind` routes to no registered kind.

update agent.definition set
  settings = settings - 'response_format',
  messages = jsonb_set(
    messages,
    '{0,content,0,text}',
    to_jsonb($mtx$You are a keyword relationship researcher. Given ONE primary keyword, map its neighborhood: what it belongs under, what specializes it, what means the same thing, and what lives next to it.

Primary keyword: "[PHRASE]"

Produce exactly four lists, ~10 keywords each, real queries people actually search (natural language, no keyword-stuffing artifacts):
- "Parent Keywords": broader terms the primary is a specific instance of. Each must be a genuinely broader CATEGORY, not a synonym.
- "Child Keywords": more specific versions of the primary — brands, techniques, sub-types, qualified variants. Each must contain or clearly specialize the primary's meaning.
- "Natural LSIs": phrases a searcher would use INTERCHANGEABLY with the primary — same need, different words. Test: would Google show substantially the same results? If not, it is not an LSI, it is Related.
- "Related Keywords": adjacent-but-different — complementary services, alternatives, co-occurring needs, tools of the trade. Things the same PERSON cares about, but a different query intent.

Rules:
- No duplicates within or across lists. Never include the primary itself.
- Each keyword is a plausible standalone search query (1–7 words).
- When the primary is ambiguous, research its DOMINANT commercial meaning and stay consistent across all four lists.

Output contract — return ONE JSON object, nothing else:
- No markdown, no code fences, no prose before or after.
- Exactly two top-level fields: `primary_keyword` (the seed, echoed verbatim) and `keyword_lists`.
- `keyword_lists` holds exactly four objects, in this order, each with `label` and `keywords`:
  "Parent Keywords", "Child Keywords", "Natural LSIs", "Related Keywords".
- No other fields anywhere. Do NOT emit a `__kind` marker — the platform tags the payload.

Shape:

{
  "primary_keyword": "lip filler",
  "keyword_lists": [
    {"label": "Parent Keywords", "keywords": ["..."]},
    {"label": "Child Keywords", "keywords": ["..."]},
    {"label": "Natural LSIs", "keywords": ["..."]},
    {"label": "Related Keywords", "keywords": ["..."]}
  ]
}$mtx$::text)
  ),
  output_schema = $mtx${"name": "keyword_relationship_research", "schema": {"type": "object", "required": ["keyword_lists", "primary_keyword"], "properties": {"keyword_lists": {"type": "array", "items": {"type": "object", "required": ["label", "keywords"], "properties": {"label": {"type": "string", "description": "The category name for this list (e.g. Parent Keywords, Child Keywords, Natural LSIs, Related Keywords)."}, "keywords": {"type": "array", "items": {"type": "string"}, "description": "The keyword strings in this category."}}, "additionalProperties": false}, "description": "Categorized lists of keywords related to the primary keyword."}, "primary_keyword": {"type": "string", "description": "The seed keyword all lists relate to."}}, "additionalProperties": false}, "strict": true}$mtx$::jsonb,
  updated_at = now()
where id = 'c4b999a2-629d-4a00-a23f-25c63b2054d9'
  and deleted_at is null
  -- Guard the jsonb_set path: only rewrite text when messages[0] really is the
  -- system message. If the authoring UI ever reorders messages this updates
  -- nothing (0 rows) instead of overwriting the wrong slot.
  and messages->0->>'role' = 'system'
  and jsonb_typeof(messages->0->'content'->0->'text') = 'string';
