-- Configurable ambient assistant hierarchy:
-- page/section override -> module override -> system default.
-- Override rows start on the shared system guide because agent.mandate requires
-- every row to carry a valid default reference. While metadata.fallback exists,
-- the canonical resolver delegates the system layer to the broader Mandate.
-- Changing an override's own default removes that fallback automatically.

create or replace function agent.clear_mandate_fallback_on_default_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.metadata ? 'fallback'
     and row(new.default_agent_id, new.default_agent_version_id, new.use_latest)
       is distinct from
       row(old.default_agent_id, old.default_agent_version_id, old.use_latest)
  then
    new.metadata := new.metadata - 'fallback';
  end if;
  return new;
end;
$$;

drop trigger if exists mandate_clear_fallback_on_default_change on agent.mandate;
create trigger mandate_clear_fallback_on_default_change
before update of default_agent_id, default_agent_version_id, use_latest
on agent.mandate
for each row
execute function agent.clear_mandate_fallback_on_default_change();

with module_mandates(
  mandate_key,
  label,
  description,
  default_agent_id,
  use_latest,
  metadata
) as (
  values
    ('ambient.page_guidance', 'System Page Guide', 'Default conversational guide for ambient assistants across AI Matrx pages.', '6b6b4e45-4699-4860-8dea-d8a60e07d69a'::uuid, true, '{"side":"client","pin_style":"floating","hierarchy_level":"system"}'::jsonb),
    ('notes.page_guidance', 'Notes Page Guide', 'Optional ambient guide override for the Notes module.', '6b6b4e45-4699-4860-8dea-d8a60e07d69a'::uuid, true, '{"side":"client","hierarchy_level":"module","fallback":"ambient.page_guidance"}'::jsonb),
    ('data.page_guidance', 'Data Page Guide', 'Optional ambient guide override for the Data module.', '6b6b4e45-4699-4860-8dea-d8a60e07d69a'::uuid, true, '{"side":"client","hierarchy_level":"module","fallback":"ambient.page_guidance"}'::jsonb),
    ('education.page_guidance', 'Education Page Guide', 'Optional ambient guide override for all Education pages.', '6b6b4e45-4699-4860-8dea-d8a60e07d69a'::uuid, true, '{"side":"client","hierarchy_level":"module","fallback":"ambient.page_guidance"}'::jsonb)
)
insert into agent.mandate (
  mandate_key,
  label,
  description,
  output_kind,
  contract,
  default_agent_id,
  use_latest,
  is_enabled,
  organization_id,
  metadata,
  visibility
)
select
  source.mandate_key,
  source.label,
  source.description,
  'text',
  '{"accepts_user_input":true,"required_variables":[],"required_output_keys":[],"auto_context_disabled":false,"required_context_policies":[]}'::jsonb,
  source.default_agent_id,
  source.use_latest,
  source.default_agent_id is not null,
  '39c38960-d30c-4840-b0c1-c9960de95582'::uuid,
  source.metadata,
  'public'
from module_mandates source
where not exists (
  select 1 from agent.mandate existing
  where existing.mandate_key = source.mandate_key
    and existing.deleted_at is null
);

with education_overrides(mandate_key, label, description) as (
  values
    ('education.admin_guidance', 'Education Admin Guide', 'Optional ambient guide override for Education administration pages.'),
    ('education.audio_study_guidance', 'Audio Study Guide', 'Optional ambient guide override for Education audio-study pages.'),
    ('education.classes_guidance', 'Education Classes Guide', 'Optional ambient guide override for Education class pages.'),
    ('education.creator_guidance', 'Education Creator Guide', 'Optional ambient guide override for the Education creator page.'),
    ('education.data_guidance', 'Education Data Guide', 'Optional ambient guide override for the Education data page.'),
    ('education.exam_prep_guidance', 'Exam Prep Guide', 'Optional ambient guide override for Education exam-prep pages.'),
    ('education.family_guidance', 'Education Family Guide', 'Optional ambient guide override for Education family pages.'),
    ('education.fastfire_guidance', 'Fastfire Guide', 'Optional ambient guide override for Education Fastfire pages.'),
    ('education.features_guidance', 'Education Features Guide', 'Optional ambient guide override for Education feature-catalog pages.'),
    ('education.flashcards_guidance', 'Flashcards Guide', 'Optional ambient guide override for Education flashcard pages.'),
    ('education.game_guidance', 'Education Game Guide', 'Optional ambient guide override for Education game pages.'),
    ('education.grade_work_guidance', 'Grade Work Guide', 'Optional ambient guide override for Education grade-work pages.'),
    ('education.learn_guidance', 'Learning Guide', 'Optional ambient guide override for Education learning pages.'),
    ('education.levels_guidance', 'Education Levels Guide', 'Optional ambient guide override for Education level pages.'),
    ('education.library_guidance', 'Education Library Guide', 'Optional ambient guide override for the Education library.'),
    ('education.media_guidance', 'Study Media Guide', 'Optional ambient guide override for Education media pages.'),
    ('education.memory_guidance', 'Memory Guide', 'Optional ambient guide override for Education memory pages.'),
    ('education.mind_maps_guidance', 'Mind Maps Guide', 'Optional ambient guide override for Education mind-map pages.'),
    ('education.notes_guidance', 'Education Notes Guide', 'Optional ambient guide override for Education note pages.'),
    ('education.offline_guidance', 'Offline Study Guide', 'Optional ambient guide override for Education offline-study pages.'),
    ('education.planner_guidance', 'Study Planner Guide', 'Optional ambient guide override for the Education planner.'),
    ('education.practice_oral_guidance', 'Oral Practice Guide', 'Optional ambient guide override for Education oral-practice pages.'),
    ('education.practice_tests_guidance', 'Practice Tests Guide', 'Optional ambient guide override for Education practice-test pages.'),
    ('education.progress_guidance', 'Learning Progress Guide', 'Optional ambient guide override for Education progress pages.'),
    ('education.quizzes_guidance', 'Quizzes Guide', 'Optional ambient guide override for Education quiz pages.'),
    ('education.start_guidance', 'Education Start Guide', 'Optional ambient guide override for the Education start page.'),
    ('education.study_aids_guidance', 'Study Aids Guide', 'Optional ambient guide override for Education study-aid pages.'),
    ('education.subjects_guidance', 'Subjects Guide', 'Optional ambient guide override for Education subject pages.'),
    ('education.summaries_guidance', 'Summaries Guide', 'Optional ambient guide override for Education summary pages.'),
    ('education.tutor_guidance', 'Education Tutor Guide', 'Optional ambient guide override for Education tutor pages.')
)
insert into agent.mandate (
  mandate_key,
  label,
  description,
  output_kind,
  contract,
  default_agent_id,
  use_latest,
  is_enabled,
  organization_id,
  metadata,
  visibility
)
select
  mandate_key,
  label,
  description,
  'text',
  '{"accepts_user_input":true,"required_variables":[],"required_output_keys":[],"auto_context_disabled":false,"required_context_policies":[]}'::jsonb,
  '6b6b4e45-4699-4860-8dea-d8a60e07d69a'::uuid,
  true,
  true,
  '39c38960-d30c-4840-b0c1-c9960de95582'::uuid,
  '{"side":"client","hierarchy_level":"page","fallback":"education.page_guidance"}'::jsonb,
  'public'
from education_overrides source
where not exists (
  select 1 from agent.mandate existing
  where existing.mandate_key = source.mandate_key
    and existing.deleted_at is null
);
