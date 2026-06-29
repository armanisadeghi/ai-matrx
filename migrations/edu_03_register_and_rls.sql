-- Register the 7 education tokens, the fc_detail→fc_card composition, the shareable
-- content (fc_set, fc_card), and apply canonical RLS per variant. Idempotent.
-- Applied live to txzxabzwovsujtloxrus via Supabase MCP.

insert into platform.entity_types (token, schema_name, table_name, label, default_visibility, is_component, is_versioned, is_active)
select v.token, 'education', v.tbl, v.label, 'private', v.is_comp, true, true
from (values
  ('fc_set','fc_set','Flashcard Set', false),
  ('fc_card','fc_card','Flashcard', false),
  ('fc_detail','fc_detail','Flashcard Detail', true),
  ('study_session','study_session','Study Session', false),
  ('study_attempt','study_attempt','Study Attempt', false),
  ('item_mastery','item_mastery','Item Mastery', false),
  ('study_goal','study_goal','Study Goal', false)
) v(token,tbl,label,is_comp)
where not exists (select 1 from platform.entity_types e where e.token = v.token);

insert into platform.entity_relationships (child_type, parent_type, fk_column, kind)
select 'fc_detail','fc_card','card_id','composition'
where not exists (select 1 from platform.entity_relationships r where r.child_type='fc_detail' and r.kind='composition');

insert into platform.shareable_resource_registry
  (resource_type, schema_name, table_name, id_column, owner_column, is_public_column, display_label, url_path_template, rls_uses_has_permission)
select * from (values
  ('fc_set','education','fc_set','id','created_by','visibility','Flashcard Set','/education/flashcards/{id}',true),
  ('fc_card','education','fc_card','id','created_by','visibility','Flashcard','/education/flashcards/card/{id}',true)
) v(resource_type, schema_name, table_name, id_column, owner_column, is_public_column, display_label, url_path_template, rls_uses_has_permission)
where not exists (select 1 from platform.shareable_resource_registry s where s.resource_type = v.resource_type);

select iam.apply_rls('education','fc_set','fc_set','entity');
select iam.apply_rls('education','fc_card','fc_card','entity');
select iam.apply_rls('education','fc_detail','fc_detail','component');
select iam.apply_rls('education','study_session','study_session','entity');
select iam.apply_rls('education','study_attempt','study_attempt','ledger');
select iam.apply_rls('education','item_mastery','item_mastery','entity');
select iam.apply_rls('education','study_goal','study_goal','entity');
