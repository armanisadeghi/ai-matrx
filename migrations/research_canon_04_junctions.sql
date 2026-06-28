-- research_canon_04_junctions
-- 2026 DB transition: the two research junction tables become platform COMPONENTS;
-- access defers up the composition chain (source/keyword -> research_topic). They carry no
-- owner/org columns, which the component RLS variant tolerates.
-- Idempotent. Applied live to txzxabzwovsujtloxrus via Supabase MCP.
insert into platform.entity_types (token, schema_name, table_name, label, default_visibility, is_component, is_versioned, is_active)
select v.token, 'public', v.tbl, v.label, 'private', true, false, true
from (values
  ('research_source_tag','rs_source_tag','Research Source Tag'),
  ('research_keyword_source','rs_keyword_source','Research Keyword Source')
) v(token,tbl,label)
where not exists (select 1 from platform.entity_types e where e.token = v.token);

insert into platform.entity_relationships (child_type, parent_type, fk_column, kind)
select 'research_source_tag','research_source','source_id','composition'
where not exists (select 1 from platform.entity_relationships r where r.child_type='research_source_tag' and r.kind='composition');

insert into platform.entity_relationships (child_type, parent_type, fk_column, kind)
select 'research_keyword_source','research_keyword','keyword_id','composition'
where not exists (select 1 from platform.entity_relationships r where r.child_type='research_keyword_source' and r.kind='composition');

select iam.apply_rls('public','rs_source_tag','research_source_tag','component');
select iam.apply_rls('public','rs_keyword_source','research_keyword_source','component');
