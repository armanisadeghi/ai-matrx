-- Personal-Visibility Rulings — Group A (DB-only batch), approved by Arman 2026-08-12.
-- Source of truth: common-docs/operations/personal-visibility-rulings.md (§ "RESOLVED — Arman's
-- rulings" + § "Execution routing" item 1).
--
-- Three things, all idempotent:
--   1. Catalog/scraped tables whose 'personal' default is flat-wrong flip to 'public' — both the
--      column DEFAULT and platform.entity_types.default_visibility. A 'personal' default on a
--      platform catalog is a latent lockout for every future row an admin forgets to flip; those
--      tables only work today because every existing row was manually set 'public'.
--      (Precedent: agent.slot_definition, a 'system' variant, already defaults 'public'.)
--      research.youtube_search is scraped/derived data → 'public' per db-rules §6a-1.
--   2. The 3 stray 'personal' rows on those tables (tool.bundle ×1 'code_ingest',
--      research.youtube_search ×2) flip to 'public'.
--   3. Nine platform.entity_types rows with a NULL default_visibility get backfilled to match
--      their table's LIVE column default (registry hygiene, no behavior change):
--      users.profiles is 'internal'; the other eight are 'personal'.
--
-- NOT in scope (owned elsewhere, deliberately untouched): workflow.definition (aidream
-- workflow-writer chip, ruling R3) and agent.slot_binding (Fork 2, agent schema).

-- 1. Column defaults → public.
alter table ai.model_definition  alter column visibility set default 'public'::platform.visibility;
alter table ai.provider          alter column visibility set default 'public'::platform.visibility;
alter table tool.definition      alter column visibility set default 'public'::platform.visibility;
alter table tool.bundle          alter column visibility set default 'public'::platform.visibility;
alter table research.youtube_search alter column visibility set default 'public'::platform.visibility;

-- 1b. Registry default_visibility → public for the same five.
update platform.entity_types
set default_visibility = 'public'::platform.visibility
where (schema_name, table_name) in (
        ('ai', 'model_definition'),
        ('ai', 'provider'),
        ('tool', 'definition'),
        ('tool', 'bundle'),
        ('research', 'youtube_search')
      )
  and default_visibility is distinct from 'public'::platform.visibility;

-- 2. Stray 'personal' rows on the flipped tables → public.
update tool.bundle
set visibility = 'public'::platform.visibility
where visibility = 'personal'::platform.visibility;

update research.youtube_search
set visibility = 'public'::platform.visibility
where visibility = 'personal'::platform.visibility;

-- 3. Registry NULL backfills — each matches that table's live column default.
update platform.entity_types
set default_visibility = 'internal'::platform.visibility
where (schema_name, table_name) = ('users', 'profiles')
  and default_visibility is null;

update platform.entity_types
set default_visibility = 'personal'::platform.visibility
where (schema_name, table_name) in (
        ('chat', 'agent_run'),
        ('communication', 'sms_consent'),
        ('communication', 'sms_conversations'),
        ('communication', 'sms_notification_preferences'),
        ('communication', 'sms_notifications'),
        ('communication', 'sms_phone_numbers'),
        ('education', 'quiz_sessions'),
        ('public', 'heatmap_saves')
      )
  and default_visibility is null;
