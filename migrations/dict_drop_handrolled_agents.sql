-- ============================================================================
-- Drop the three hand-rolled Custom Dictionary agents.
--
-- The original dict_system_agents_and_skills.sql hand-inserted three agx_agent
-- rows (Dictionary Assistant / Terminology Curator / Pronunciation Coach). That
-- was the WRONG creation path — platform agents must be born through the Agent
-- Factory (scripts/build_agents.py / internal_agents/<name>.md), which authors a
-- proper structured prompt + versioning. The hand-rolled rows were bare and
-- inconsistent.
--
-- The dictionary assistant is now the factory-built `dictionary_assistant`
-- (agx_agent ab1a868e-b866-4ade-9383-fd63b0928c7c, Gemini 3.5 Flash) created via
-- the factory and configured with the `dictionary` tool + the two skills below.
-- This migration removes the three obsolete rows (+ their version snapshots).
--
-- The two skl_definitions seeded by the original migration STAY — the
-- factory-built agent consumes them (skill_config.included).
-- ============================================================================

DELETE FROM public.agx_version WHERE agent_id IN (
  'a91c7000-0000-4000-a000-000000000001',
  'a91c7000-0000-4000-a000-000000000002',
  'a91c7000-0000-4000-a000-000000000003'
);

DELETE FROM public.agx_agent WHERE id IN (
  'a91c7000-0000-4000-a000-000000000001',
  'a91c7000-0000-4000-a000-000000000002',
  'a91c7000-0000-4000-a000-000000000003'
);
