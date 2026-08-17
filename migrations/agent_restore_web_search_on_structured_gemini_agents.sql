-- agent_restore_web_search_on_structured_gemini_agents.sql
--
-- REVERTS agent_disable_grounding_on_structured_gemini_agents.sql.
--
-- WHY: that migration was wrong. On Google, `settings.internal_web_search` IS
-- the web-search tool — matrx-ai `providers/google/translator.py:261` turns it
-- directly into `types.Tool(googleSearch=types.GoogleSearch())`. There is no
-- separate "grounding" switch on Gemini and no second web-search path. Turning
-- it off did not disable a passive citation feature; it took web search away
-- from 11 agents, several of which exist to search the web (Topic Idea
-- Generator, Keyword Relationship Researcher, Source Authority Ranker, Site
-- Strategy Interviewer, Topic Assigner). All 11 carry `tools = []` and
-- `custom_tools = []`, so they had NO other way to reach the web — they were
-- left blind.
--
-- For the record, the same flag on other providers maps to that provider's own
-- web search (openai `web_search_preview`, anthropic/xai equivalents), so this
-- setting is "can this agent search the web", never a citation-only toggle.
--
-- The underlying defect (FOUND_DEFECTS D155 — Google drops a span of the answer
-- when Search grounding is on, corrupting structured output ~8-58% of runs) is
-- REAL and remains OPEN. It is a capability-vs-reliability trade, and disabling
-- the capability is not the answer: the fix is to stop asking ONE call to
-- search AND emit structured JSON (search in call 1, structure in call 2 with
-- no tools — measured 0/16 corrupt).

update agent.definition
set settings = (settings::jsonb || '{"internal_web_search": true}'::jsonb),
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
