-- Seed the growing-vocabulary dimensions (db-rules §5) under the matrx-system org so
-- they are globally readable. Idempotent on (dimension, name, organization_id).
-- Applied live to txzxabzwovsujtloxrus via Supabase MCP.
insert into platform.categories (organization_id, dimension, name, slug, is_system, visibility)
select '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, v.dim, v.name, v.name, true, 'public'::platform.visibility
from (values
  ('fc_card_kind','basic'),('fc_card_kind','cloze'),('fc_card_kind','concept'),('fc_card_kind','definition'),('fc_card_kind','image_prompt'),('fc_card_kind','image_occlusion'),
  ('fc_detail_kind','helper'),('fc_detail_kind','example'),('fc_detail_kind','detailed'),('fc_detail_kind','hint'),('fc_detail_kind','mnemonic'),('fc_detail_kind','simplified'),('fc_detail_kind','spoken_front'),('fc_detail_kind','spoken_back'),
  ('study_mode','flashcards'),('study_mode','fast_fire'),('study_mode','learn'),('study_mode','test'),('study_mode','match'),('study_mode','quiz'),('study_mode','practice_test'),('study_mode','audio_review'),('study_mode','adaptive'),
  ('study_method','flashcards'),('study_method','fast_fire'),('study_method','learn'),('study_method','test'),('study_method','match'),('study_method','quiz'),('study_method','practice_test'),('study_method','audio_review'),('study_method','self_reported'),('study_method','classic_review'),
  ('association_role','member'),('association_role','expands_into'),('association_role','prerequisite_of'),('association_role','related'),('association_role','source'),('association_role','theme'),('association_role','topic'),('association_role','illustration'),('association_role','diagram'),('association_role','chart'),('association_role','photo'),('association_role','video_ref')
) v(dim,name)
where not exists (
  select 1 from platform.categories c
  where c.dimension = v.dim and c.name = v.name and c.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
);
