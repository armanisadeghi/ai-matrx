-- research_canon_03_components
-- 2026 DB transition: the 8 research content tables become platform COMPONENTS of
-- research_topic (single-level composition via topic_id). Access defers to the topic;
-- created_by is null on these (backend/service-role writes) which the component variant
-- is designed for. Idempotent. Applied live to txzxabzwovsujtloxrus via Supabase MCP.

-- Drop legacy double-fire updated_at triggers (keep _stamp_actor/_touch_row + domain triggers
-- such as rs_keyword's position trigger).
drop trigger if exists set_updated_at on public.rs_keyword;
drop trigger if exists set_updated_at on public.rs_source;
drop trigger if exists set_updated_at on public.rs_tag;
drop trigger if exists set_updated_at on public.rs_synthesis;
drop trigger if exists set_updated_at on public.rs_document;
drop trigger if exists set_updated_at on public.rs_content;
drop trigger if exists set_updated_at on public.rs_analysis;
drop trigger if exists set_updated_at on public.rs_media;

insert into platform.entity_types (token, schema_name, table_name, label, default_visibility, is_component, is_versioned, is_active)
select v.token, 'public', v.tbl, v.label, 'private', true, false, true
from (values
  ('research_keyword','rs_keyword','Research Keyword'),
  ('research_source','rs_source','Research Source'),
  ('research_tag','rs_tag','Research Tag'),
  ('research_synthesis','rs_synthesis','Research Synthesis'),
  ('research_document','rs_document','Research Document'),
  ('research_content','rs_content','Research Content'),
  ('research_analysis','rs_analysis','Research Analysis'),
  ('research_media','rs_media','Research Media')
) v(token,tbl,label)
where not exists (select 1 from platform.entity_types e where e.token = v.token);

insert into platform.entity_relationships (child_type, parent_type, fk_column, kind)
select v.token, 'research_topic', 'topic_id', 'composition'
from (values
  ('research_keyword'),('research_source'),('research_tag'),('research_synthesis'),
  ('research_document'),('research_content'),('research_analysis'),('research_media')
) v(token)
where not exists (select 1 from platform.entity_relationships r where r.child_type = v.token and r.kind='composition');

select iam.apply_rls('public','rs_keyword','research_keyword','component');
select iam.apply_rls('public','rs_source','research_source','component');
select iam.apply_rls('public','rs_tag','research_tag','component');
select iam.apply_rls('public','rs_synthesis','research_synthesis','component');
select iam.apply_rls('public','rs_document','research_document','component');
select iam.apply_rls('public','rs_content','research_content','component');
select iam.apply_rls('public','rs_analysis','research_analysis','component');
select iam.apply_rls('public','rs_media','research_media','component');
