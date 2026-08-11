-- agent_disable_grounding_on_structured_gemini_agents.sql
--
-- Turn OFF Google Search grounding (`settings.internal_web_search`) on every
-- ACTIVE Gemini agent that must return a STRUCTURED response.
--
-- WHY (FOUND_DEFECTS.md D155): with Search grounding on, Gemini drops a
-- contiguous span of the answer at grounding-citation boundaries. Proven at the
-- SSE-chunk level over raw HTTP with none of our code in the path, and
-- independently reported on Google's own developer forum
-- (https://discuss.ai.google.dev/t/176967 — same models, same signature,
-- finishReason STOP not MAX_TOKENS). There is NO recovery path: the response
-- carries no cumulative or final full-text payload to reconcile against
-- (55 SSE events / 55 deltas, longest delta 338 chars vs 5,775 total; part keys
-- are only `text` and `thoughtSignature`).
--
-- Measured corruption rates (raw HTTP, gemini-3.6-flash unless noted):
--   $ref schema + Search .................. 6/16      no tools ............. 0/16
--   inlined schema + Search ............... 4/16      url_context ONLY ..... 0/16
--   NO schema at all + Search ............. 6/16      gemini-3.5-flash ..... 5/16
--   streaming + Search (± urlContext) ..... 2/16      gemini-pro-latest .... 1/12
--   one high-load round ................... 7/12
-- Grounding is necessary and sufficient; schema shape is irrelevant; no Gemini
-- model tested is immune.
--
-- SCOPE — deliberately narrow, per Arman 2026-08-11: only response types the
-- bug actually breaks. A structured agent returns JSON that must PARSE, so a
-- dropped span is a hard, visible failure. Agents returning prose are NOT
-- touched here (a paragraph missing a sentence still reads fine) — that is a
-- separate, open question because it is undetectable.
--   included: internal_web_search = true AND a Gemini model AND
--             (output_schema IS NOT NULL OR a STRUCTURAL slot output_kind).
--   excluded: generic output_kinds ('text','json','number','boolean',
--             'string_list') — those are prose/passthrough, not parse-critical.
--             e.g. "Research Keyword Synthesis Agent" (output_kind='text').
--
-- `internal_url_context` is deliberately LEFT ON. It was measured separately:
-- url_context alone, with the same bound schema, is 0/16 — it does not trigger
-- the drop. Only google_search does. Reading a URL the user supplied is a real
-- capability and there is no reason to give it up.
--
-- Nothing is lost by provider-switching here: Google is the only provider that
-- offers grounding at all, so this puts the Gemini models exactly where every
-- other provider already is.

update agent.definition
set settings = (settings::jsonb || '{"internal_web_search": false}'::jsonb),
    updated_at = now()
where deleted_at is null
  and id in (
    'ca4894e1-5d42-498c-bb09-d99882d73480',  -- Education Matrx — Flashcard Set Builder
    'a6f760c5-4919-410c-8dc0-ac128e4576ac',  -- Education Matrx — Flashcard Set Builder (Copy)
    '1fd0cb1f-5b95-49f0-a7f8-79308dc50f58',  -- Flashcard Generator (K)
    '6a4d3db5-64d8-4b6e-99c1-ba79dabf6be7',  -- Flashcard Generator (K)
    '5ca54dd9-6de6-4364-842f-2ec4a0274ce0',  -- Keyword Classifier
    'c4b999a2-629d-4a00-a23f-25c63b2054d9',  -- Keyword Relationship Researcher
    'e5906994-034f-4ea0-b383-787f68bfab02',  -- Site Strategy Interviewer
    'be502ddf-bbdc-407e-b948-dbe515e85603',  -- Source Authority Ranker
    '944cf37f-585e-4d7b-8afe-26c8faeb6d38',  -- Topic Assigner + Lazy Tree Growth
    '2edcbd85-91e0-4f0a-9890-1e7d262e2c62',  -- Topic Idea Generator
    '0cd86da2-2679-4c10-9746-e6723779fe94'   -- YouTube Video Transcription Analysis
  );
