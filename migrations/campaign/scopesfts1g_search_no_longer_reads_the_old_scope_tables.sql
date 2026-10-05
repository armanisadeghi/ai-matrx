-- chair-step: the search projection's backfill and parity stop reading the old scope tables: aidream db/generate_search_projection.py now skips a registry type whose table the record store superseded (platform.deprecated_relations → custom.record / custom.table) AND that no signed-in caller may read (scope, scope_type, context_item: client reads revoked 2026-10-05 04:31Z); this file carries ONLY its regenerated platform.search_item_backfill / search_item_parity / search_item_projected_tokens. The 107 _search_item_sync_<token> bodies are not re-issued (three of them differ live from the generator today — party, processed_document, studio_session — and are left as they are).
-- lane: FINISH-THE-SWITCH (FTS-1g, scopes to zero, item 2)
-- based-on: platform.search_item_backfill(text,uuid,integer) cb562e2277224e7196265ae2a2ca332b0a84fc81ddbc091f115936f59f65c001
-- based-on: platform.search_item_parity(text) 9f424eb4912dbb5d35adeea1ee0b8879b60e512e7d017e181776d6524155f5af
-- based-on: platform.search_item_projected_tokens() 6eb24aeb705c5cd41b016fdf725a1946ecbba545b8396327da2466f5b724c0c0
-- lock: platform
-- window-class: none — three function bodies; no DDL on any table.
--
-- Inverse: migrations/inverse/scopesfts1g_search_no_longer_reads_the_old_scope_tables_down.sql.
--
-- THE USE CASE. The nightly search backfill and parity run over every searchable type; a scope or scope type is a
-- Record now, so they no longer count the frozen old rows (which no person can read) against the projection.

-- ── backfill: one keyset slice of one type per call (every statement short) ──────────────
create or replace function platform.search_item_backfill(p_token text, p_after uuid default null,
  p_limit integer default 5000, out rows_seen integer, out last_id uuid)
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $fn$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 5000), 1), 20000);
  v_ids uuid[];
begin
  rows_seen := 0;
  case p_token
  when 'agent' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from agent.definition x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('agent', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.name::text), ''), 'Untitled agent' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), nullif(concat_ws(' · ', t.category::text), ''), coalesce(t.tags, '{}'::text[]), t.updated_at, null::text, null::text)
       from agent.definition t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'agent' and si.entity_id = any(v_ids)
       and not exists (select 1 from agent.definition t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'agent_shortcut' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from agent.shortcut x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('agent_shortcut', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.label::text), ''), 'Untitled agent shortcut' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), left(t.description::text, 140), '{}'::text[], t.updated_at, null::text, null::text)
       from agent.shortcut t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'agent_shortcut' and si.entity_id = any(v_ids)
       and not exists (select 1 from agent.shortcut t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'agent_template' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from agent.template x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('agent_template', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.name::text), ''), 'Untitled agent template' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), nullif(concat_ws(' · ', t.category::text), ''), coalesce(t.tags, '{}'::text[]), t.updated_at, null::text, null::text)
       from agent.template t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'agent_template' and si.entity_id = any(v_ids)
       and not exists (select 1 from agent.template t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'ai_api' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from ai.api x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('ai_api', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.name::text), ''), 'Untitled ai api' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), left(t.description::text, 140), '{}'::text[], t.updated_at, null::text, null::text)
       from ai.api t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'ai_api' and si.entity_id = any(v_ids)
       and not exists (select 1 from ai.api t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'ai_endpoint' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from ai.endpoint x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('ai_endpoint', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.display_name::text), ''), 'Untitled ai endpoint' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), null::text, '{}'::text[], t.updated_at, null::text, null::text)
       from ai.endpoint t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'ai_endpoint' and si.entity_id = any(v_ids)
       and not exists (select 1 from ai.endpoint t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'ai_model' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from ai.model_definition x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('ai_model', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.name::text), ''), 'Untitled ai model' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), left(t.description::text, 140), '{}'::text[], t.updated_at, null::text, null::text)
       from ai.model_definition t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'ai_model' and si.entity_id = any(v_ids)
       and not exists (select 1 from ai.model_definition t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'ai_provider' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from ai.provider x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('ai_provider', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.name::text), ''), 'Untitled ai provider' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), null::text, '{}'::text[], t.updated_at, null::text, null::text)
       from ai.provider t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'ai_provider' and si.entity_id = any(v_ids)
       and not exists (select 1 from ai.provider t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'ai_setting' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from ai.setting x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('ai_setting', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.key::text), ''), 'Untitled ai setting' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), left(t.description::text, 140), '{}'::text[], t.updated_at, null::text, null::text)
       from ai.setting t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'ai_setting' and si.entity_id = any(v_ids)
       and not exists (select 1 from ai.setting t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'anon_form' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from custom.anon_form x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('anon_form', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.title::text), ''), 'Untitled public form' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), null::text, '{}'::text[], t.updated_at, null::text, null::text)
       from custom.anon_form t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'anon_form' and si.entity_id = any(v_ids)
       and not exists (select 1 from custom.anon_form t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'app' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from app.definition x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('app', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.name::text), ''), 'Untitled app' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), nullif(concat_ws(' · ', t.category::text, t.status::text), ''), coalesce(t.tags, '{}'::text[]), t.updated_at, null::text, null::text)
       from app.definition t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'app' and si.entity_id = any(v_ids)
       and not exists (select 1 from app.definition t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'assessment' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from education.assessment x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('assessment', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.title::text), ''), 'Untitled assessment' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), nullif(concat_ws(' · ', t.source_kind::text, t.status::text), ''), '{}'::text[], t.updated_at, null::text, null::text)
       from education.assessment t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'assessment' and si.entity_id = any(v_ids)
       and not exists (select 1 from education.assessment t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'canvas_comment' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from canvas.canvas_comments x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('canvas_comment', t.id, t.organization_id, t.created_by, null::platform.visibility, coalesce(nullif(btrim(t.display_name::text), ''), 'Untitled canvas comment' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), null::text, '{}'::text[], t.updated_at, null::text, null::text)
       from canvas.canvas_comments t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'canvas_comment' and si.entity_id = any(v_ids)
       and not exists (select 1 from canvas.canvas_comments t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'canvas_item' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from canvas.canvas_items x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('canvas_item', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.title::text), ''), 'Untitled canvas item' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), nullif(concat_ws(' · ', t.source_type::text), ''), coalesce(t.tags, '{}'::text[]), t.updated_at, null::text, null::text)
       from canvas.canvas_items t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'canvas_item' and si.entity_id = any(v_ids)
       and not exists (select 1 from canvas.canvas_items t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'canvas_score' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from canvas.canvas_scores x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('canvas_score', t.id, t.organization_id, t.created_by, null::platform.visibility, coalesce(nullif(btrim(t.display_name::text), ''), 'Untitled canvas score' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), null::text, '{}'::text[], t.updated_at, null::text, null::text)
       from canvas.canvas_scores t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'canvas_score' and si.entity_id = any(v_ids)
       and not exists (select 1 from canvas.canvas_scores t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'category' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from platform.categories x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('category', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.name::text), ''), 'Untitled category' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), null::text, '{}'::text[], t.updated_at, null::text, null::text)
       from platform.categories t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'category' and si.entity_id = any(v_ids)
       and not exists (select 1 from platform.categories t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'code_file' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from code.code_files x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('code_file', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.name::text), ''), 'Untitled code file' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), null::text, coalesce(t.tags, '{}'::text[]), t.updated_at, null::text, null::text)
       from code.code_files t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'code_file' and si.entity_id = any(v_ids)
       and not exists (select 1 from code.code_files t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'code_folder' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from code.code_file_folders x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('code_folder', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.name::text), ''), 'Untitled code folder' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), left(t.description::text, 140), '{}'::text[], t.updated_at, null::text, null::text)
       from code.code_file_folders t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'code_folder' and si.entity_id = any(v_ids)
       and not exists (select 1 from code.code_file_folders t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'code_repository' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from code.code_repositories x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('code_repository', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.name::text), ''), 'Untitled code repository' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), nullif(concat_ws(' · ', t.git_url::text, t.git_branch::text), ''), '{}'::text[], t.updated_at, null::text, null::text)
       from code.code_repositories t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'code_repository' and si.entity_id = any(v_ids)
       and not exists (select 1 from code.code_repositories t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'comparison_set' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from agent.cmp_comparison_sets x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('comparison_set', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.name::text), ''), 'Untitled comparison set' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), null::text, '{}'::text[], t.updated_at, null::text, null::text)
       from agent.cmp_comparison_sets t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'comparison_set' and si.entity_id = any(v_ids)
       and not exists (select 1 from agent.cmp_comparison_sets t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'contact_submission' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from communication.contact_submissions x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('contact_submission', t.id, t.organization_id, t.created_by, null::platform.visibility, coalesce(nullif(btrim(t.name::text), ''), 'Untitled contact submission' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), nullif(concat_ws(' · ', t.status::text), ''), '{}'::text[], t.updated_at, null::text, null::text)
       from communication.contact_submissions t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'contact_submission' and si.entity_id = any(v_ids)
       and not exists (select 1 from communication.contact_submissions t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'content_ir_kind' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from content_ir.kind_definition x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('content_ir_kind', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.label::text), ''), 'Untitled content-ir kind' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), nullif(concat_ws(' · ', t.kind::text), ''), '{}'::text[], t.updated_at, null::text, null::text)
       from content_ir.kind_definition t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'content_ir_kind' and si.entity_id = any(v_ids)
       and not exists (select 1 from content_ir.kind_definition t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'content_ir_kind_instance' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from content_ir.kind_instance x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('content_ir_kind_instance', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.title::text), ''), 'Untitled saved result' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), null::text, '{}'::text[], t.updated_at, null::text, null::text)
       from content_ir.kind_instance t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'content_ir_kind_instance' and si.entity_id = any(v_ids)
       and not exists (select 1 from content_ir.kind_instance t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'conversation' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from chat.conversation x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('conversation', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.title::text), ''), nullif(btrim((select left(split_part(btrim(chat.message_search_text(m.content)), E'\n', 1), 120) from chat.message m where m.conversation_id = t.id and m.role = 'user' and m.deleted_at is null order by m.position limit 1)), ''), 'Untitled conversation' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), nullif(concat_ws(' · ', t.status::text), ''), coalesce(t.keywords, '{}'::text[]), t.updated_at, null::text, null::text)
       from chat.conversation t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'conversation' and si.entity_id = any(v_ids)
       and not exists (select 1 from chat.conversation t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'crm_deal' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from crm.deal x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('crm_deal', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.name::text), ''), 'Untitled deal' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), nullif(concat_ws(' · ', t.status::text), ''), '{}'::text[], t.updated_at, null::text, null::text)
       from crm.deal t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'crm_deal' and si.entity_id = any(v_ids)
       and not exists (select 1 from crm.deal t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'crm_outreach_list' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from crm.outreach_list x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('crm_outreach_list', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.name::text), ''), 'Untitled outreach list' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), nullif(concat_ws(' · ', t.status::text), ''), '{}'::text[], t.updated_at, null::text, null::text)
       from crm.outreach_list t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'crm_outreach_list' and si.entity_id = any(v_ids)
       and not exists (select 1 from crm.outreach_list t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'cx_agent_memory' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from chat.agent_memory x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('cx_agent_memory', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.key::text), ''), 'Untitled agent memory' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), null::text, '{}'::text[], t.updated_at, null::text, null::text)
       from chat.agent_memory t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'cx_agent_memory' and si.entity_id = any(v_ids)
       and not exists (select 1 from chat.agent_memory t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'data_store' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from rag.data_stores x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('data_store', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.name::text), ''), 'Untitled data store' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), nullif(concat_ws(' · ', t.kind::text), ''), '{}'::text[], t.updated_at, null::text, null::text)
       from rag.data_stores t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'data_store' and si.entity_id = any(v_ids)
       and not exists (select 1 from rag.data_stores t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'fc_card' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from education.fc_card x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('fc_card', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.front::text), ''), 'Untitled flashcard' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), null::text, '{}'::text[], t.updated_at, null::text, null::text)
       from education.fc_card t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'fc_card' and si.entity_id = any(v_ids)
       and not exists (select 1 from education.fc_card t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'fc_set' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from education.fc_set x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('fc_set', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.name::text), ''), 'Untitled flashcard deck' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), left(t.description::text, 140), '{}'::text[], t.updated_at, null::text, null::text)
       from education.fc_set t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'fc_set' and si.entity_id = any(v_ids)
       and not exists (select 1 from education.fc_set t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'feature_doc' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from admin.feature_docs x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('feature_doc', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.title::text), ''), 'Untitled feature doc' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), null::text, '{}'::text[], t.updated_at, null::text, null::text)
       from admin.feature_docs t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'feature_doc' and si.entity_id = any(v_ids)
       and not exists (select 1 from admin.feature_docs t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'file' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from files.files x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('file', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.file_name::text), ''), 'Untitled file' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), nullif(concat_ws(' · ', t.mime_type::text), ''), '{}'::text[], t.updated_at, null::text, null::text)
       from files.files t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'file' and si.entity_id = any(v_ids)
       and not exists (select 1 from files.files t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'flexible_data' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from platform.flexible_data x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('flexible_data', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.label::text), ''), 'Untitled flexible data' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), null::text, '{}'::text[], t.updated_at, null::text, null::text)
       from platform.flexible_data t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'flexible_data' and si.entity_id = any(v_ids)
       and not exists (select 1 from platform.flexible_data t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'folder' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from files.folders x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('folder', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.folder_name::text), ''), 'Untitled folder' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), null::text, '{}'::text[], t.updated_at, null::text, null::text)
       from files.folders t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'folder' and si.entity_id = any(v_ids)
       and not exists (select 1 from files.folders t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'game_result' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from education.game_result x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('game_result', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.display_name::text), ''), 'Untitled game result' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), nullif(concat_ws(' · ', t.source_kind::text), ''), '{}'::text[], t.updated_at, null::text, null::text)
       from education.game_result t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'game_result' and si.entity_id = any(v_ids)
       and not exists (select 1 from education.game_result t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'heatmap_save' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from workbench.heatmap_saves x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('heatmap_save', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.title::text), ''), 'Untitled heatmap save' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), left(t.description::text, 140), '{}'::text[], t.updated_at, null::text, null::text)
       from workbench.heatmap_saves t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'heatmap_save' and si.entity_id = any(v_ids)
       and not exists (select 1 from workbench.heatmap_saves t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'hr_asset' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from hr.asset x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('hr_asset', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.name::text), ''), 'Untitled asset' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), nullif(concat_ws(' · ', t.status::text), ''), '{}'::text[], t.updated_at, null::text, null::text)
       from hr.asset t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'hr_asset' and si.entity_id = any(v_ids)
       and not exists (select 1 from hr.asset t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'hr_candidate' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from hr.candidate x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('hr_candidate', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.preferred_name::text), ''), 'Untitled candidate' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), null::text, '{}'::text[], t.updated_at, null::text, null::text)
       from hr.candidate t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'hr_candidate' and si.entity_id = any(v_ids)
       and not exists (select 1 from hr.candidate t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'hr_careers_portal' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from hr.careers_portal x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('hr_careers_portal', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.display_name::text), ''), 'Untitled careers portal' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), null::text, '{}'::text[], t.updated_at, null::text, null::text)
       from hr.careers_portal t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'hr_careers_portal' and si.entity_id = any(v_ids)
       and not exists (select 1 from hr.careers_portal t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'hr_checklist_template' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from hr.checklist_template x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('hr_checklist_template', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.name::text), ''), 'Untitled checklist template' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), null::text, '{}'::text[], t.updated_at, null::text, null::text)
       from hr.checklist_template t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'hr_checklist_template' and si.entity_id = any(v_ids)
       and not exists (select 1 from hr.checklist_template t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'hr_course' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from hr.course x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('hr_course', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.title::text), ''), 'Untitled course' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), left(t.description::text, 140), '{}'::text[], t.updated_at, null::text, null::text)
       from hr.course t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'hr_course' and si.entity_id = any(v_ids)
       and not exists (select 1 from hr.course t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'hr_crew' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from hr.crew x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('hr_crew', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.name::text), ''), 'Untitled crew' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), null::text, '{}'::text[], t.updated_at, null::text, null::text)
       from hr.crew t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'hr_crew' and si.entity_id = any(v_ids)
       and not exists (select 1 from hr.crew t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'hr_deduction_code' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from hr.deduction_code x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('hr_deduction_code', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.name::text), ''), 'Untitled deduction code' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), null::text, '{}'::text[], t.updated_at, null::text, null::text)
       from hr.deduction_code t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'hr_deduction_code' and si.entity_id = any(v_ids)
       and not exists (select 1 from hr.deduction_code t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'hr_department' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from hr.department x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('hr_department', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.name::text), ''), 'Untitled department' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), null::text, '{}'::text[], t.updated_at, null::text, null::text)
       from hr.department t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'hr_department' and si.entity_id = any(v_ids)
       and not exists (select 1 from hr.department t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'hr_earning_code' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from hr.earning_code x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('hr_earning_code', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.name::text), ''), 'Untitled earning code' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), null::text, '{}'::text[], t.updated_at, null::text, null::text)
       from hr.earning_code t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'hr_earning_code' and si.entity_id = any(v_ids)
       and not exists (select 1 from hr.earning_code t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'hr_employee' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from hr.employee x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('hr_employee', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.display_name::text), ''), 'Untitled employee' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), null::text, '{}'::text[], t.updated_at, null::text, null::text)
       from hr.employee t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'hr_employee' and si.entity_id = any(v_ids)
       and not exists (select 1 from hr.employee t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'hr_holiday_calendar' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from hr.holiday_calendar x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('hr_holiday_calendar', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.name::text), ''), 'Untitled holiday calendar' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), null::text, '{}'::text[], t.updated_at, null::text, null::text)
       from hr.holiday_calendar t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'hr_holiday_calendar' and si.entity_id = any(v_ids)
       and not exists (select 1 from hr.holiday_calendar t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'hr_interview_kit' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from hr.interview_kit x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('hr_interview_kit', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.name::text), ''), 'Untitled interview kit' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), null::text, '{}'::text[], t.updated_at, null::text, null::text)
       from hr.interview_kit t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'hr_interview_kit' and si.entity_id = any(v_ids)
       and not exists (select 1 from hr.interview_kit t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'hr_job_title' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from hr.job_title x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('hr_job_title', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.title::text), ''), 'Untitled job title' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), left(t.description::text, 140), '{}'::text[], t.updated_at, null::text, null::text)
       from hr.job_title t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'hr_job_title' and si.entity_id = any(v_ids)
       and not exists (select 1 from hr.job_title t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'hr_jurisdiction' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from hr.jurisdiction x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('hr_jurisdiction', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.name::text), ''), 'Untitled jurisdiction' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), null::text, '{}'::text[], t.updated_at, null::text, null::text)
       from hr.jurisdiction t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'hr_jurisdiction' and si.entity_id = any(v_ids)
       and not exists (select 1 from hr.jurisdiction t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'hr_jurisdiction_rule_class' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from hr.jurisdiction_rule_class x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('hr_jurisdiction_rule_class', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.label::text), ''), 'Untitled jurisdiction rule class' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), left(t.description::text, 140), '{}'::text[], t.updated_at, null::text, null::text)
       from hr.jurisdiction_rule_class t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'hr_jurisdiction_rule_class' and si.entity_id = any(v_ids)
       and not exists (select 1 from hr.jurisdiction_rule_class t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'hr_leave_policy' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from hr.leave_policy x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('hr_leave_policy', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.name::text), ''), 'Untitled leave policy' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), null::text, '{}'::text[], t.updated_at, null::text, null::text)
       from hr.leave_policy t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'hr_leave_policy' and si.entity_id = any(v_ids)
       and not exists (select 1 from hr.leave_policy t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'hr_location' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from hr.location x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('hr_location', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.name::text), ''), 'Untitled location' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), null::text, '{}'::text[], t.updated_at, null::text, null::text)
       from hr.location t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'hr_location' and si.entity_id = any(v_ids)
       and not exists (select 1 from hr.location t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'hr_pay_group' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from hr.pay_group x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('hr_pay_group', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.name::text), ''), 'Untitled pay group' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), null::text, '{}'::text[], t.updated_at, null::text, null::text)
       from hr.pay_group t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'hr_pay_group' and si.entity_id = any(v_ids)
       and not exists (select 1 from hr.pay_group t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'hr_posting' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from hr.posting x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('hr_posting', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.title::text), ''), 'Untitled job posting' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), null::text, '{}'::text[], t.updated_at, null::text, null::text)
       from hr.posting t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'hr_posting' and si.entity_id = any(v_ids)
       and not exists (select 1 from hr.posting t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'hr_record_class' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from hr.record_class x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('hr_record_class', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.label::text), ''), 'Untitled record class' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), left(t.description::text, 140), '{}'::text[], t.updated_at, null::text, null::text)
       from hr.record_class t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'hr_record_class' and si.entity_id = any(v_ids)
       and not exists (select 1 from hr.record_class t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'hr_requisition' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from hr.requisition x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('hr_requisition', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.requisition_number::text), ''), 'Untitled requisition' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), null::text, '{}'::text[], t.updated_at, null::text, null::text)
       from hr.requisition t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'hr_requisition' and si.entity_id = any(v_ids)
       and not exists (select 1 from hr.requisition t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'hr_schedule' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from hr.schedule x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('hr_schedule', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.name::text), ''), 'Untitled schedule' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), null::text, '{}'::text[], t.updated_at, null::text, null::text)
       from hr.schedule t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'hr_schedule' and si.entity_id = any(v_ids)
       and not exists (select 1 from hr.schedule t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'hr_schedule_template' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from hr.schedule_template x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('hr_schedule_template', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.name::text), ''), 'Untitled schedule template' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), null::text, '{}'::text[], t.updated_at, null::text, null::text)
       from hr.schedule_template t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'hr_schedule_template' and si.entity_id = any(v_ids)
       and not exists (select 1 from hr.schedule_template t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'hr_survey' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from hr.survey x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('hr_survey', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.name::text), ''), 'Untitled survey' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), left(t.description::text, 140), '{}'::text[], t.updated_at, null::text, null::text)
       from hr.survey t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'hr_survey' and si.entity_id = any(v_ids)
       and not exists (select 1 from hr.survey t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'league_membership' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from education.league_membership x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('league_membership', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.display_name::text), ''), 'Untitled league membership' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), null::text, '{}'::text[], t.updated_at, null::text, null::text)
       from education.league_membership t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'league_membership' and si.entity_id = any(v_ids)
       and not exists (select 1 from education.league_membership t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'learn_doc' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from education.learn_doc x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('learn_doc', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.title::text), ''), 'Untitled study guide' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), null::text, coalesce(t.keywords, '{}'::text[]), t.updated_at, null::text, null::text)
       from education.learn_doc t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'learn_doc' and si.entity_id = any(v_ids)
       and not exists (select 1 from education.learn_doc t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'mandate' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from mandate.definition x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('mandate', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.label::text), ''), 'Untitled mandate' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), left(t.description::text, 140), '{}'::text[], t.updated_at, null::text, null::text)
       from mandate.definition t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'mandate' and si.entity_id = any(v_ids)
       and not exists (select 1 from mandate.definition t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'marketing_initiative' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from marketing.initiative x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('marketing_initiative', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.name::text), ''), 'Untitled initiative' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), nullif(concat_ws(' · ', t.status::text), ''), '{}'::text[], t.updated_at, null::text, null::text)
       from marketing.initiative t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'marketing_initiative' and si.entity_id = any(v_ids)
       and not exists (select 1 from marketing.initiative t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'meet_meeting' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from communication.meet_meetings x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('meet_meeting', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.title::text), ''), 'Untitled meeting' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), nullif(concat_ws(' · ', t.kind::text), ''), '{}'::text[], t.updated_at, null::text, null::text)
       from communication.meet_meetings t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'meet_meeting' and si.entity_id = any(v_ids)
       and not exists (select 1 from communication.meet_meetings t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'message_template' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from agent.message_template x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('message_template', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.label::text), ''), 'Untitled message template' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), null::text, coalesce(t.tags, '{}'::text[]), t.updated_at, null::text, null::text)
       from agent.message_template t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'message_template' and si.entity_id = any(v_ids)
       and not exists (select 1 from agent.message_template t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'note' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from workbench.notes x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('note', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.label::text), ''), 'Untitled note' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), null::text, coalesce(t.tags, '{}'::text[]), t.updated_at, null::text, null::text)
       from workbench.notes t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'note' and si.entity_id = any(v_ids)
       and not exists (select 1 from workbench.notes t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'note_folder' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from workbench.note_folders x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('note_folder', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.name::text), ''), 'Untitled note folder' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), null::text, '{}'::text[], t.updated_at, null::text, null::text)
       from workbench.note_folders t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'note_folder' and si.entity_id = any(v_ids)
       and not exists (select 1 from workbench.note_folders t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'page_extraction_job' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from docproc.page_extraction_jobs x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('page_extraction_job', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.name::text), ''), 'Untitled extraction dataset' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), nullif(concat_ws(' · ', t.kind::text), ''), '{}'::text[], t.updated_at, null::text, null::text)
       from docproc.page_extraction_jobs t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'page_extraction_job' and si.entity_id = any(v_ids)
       and not exists (select 1 from docproc.page_extraction_jobs t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'party' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from crm.party x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('party', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.display_name::text), ''), 'Untitled contact' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), null::text, '{}'::text[], t.updated_at, null::text, null::text)
       from crm.party t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null and t.record_class::text = 'contact';
    delete from platform.search_item si
     where si.entity_token = 'party' and si.entity_id = any(v_ids)
       and not exists (select 1 from crm.party t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null and t.record_class::text = 'contact');
  when 'pc_article' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from podcast.pc_articles x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('pc_article', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.title::text), ''), 'Untitled podcast article' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), nullif(concat_ws(' · ', t.kind::text, t.status::text), ''), '{}'::text[], t.updated_at, null::text, null::text)
       from podcast.pc_articles t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'pc_article' and si.entity_id = any(v_ids)
       and not exists (select 1 from podcast.pc_articles t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'pc_episode' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from podcast.pc_episodes x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('pc_episode', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.title::text), ''), 'Untitled podcast episode' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), left(t.description::text, 140), '{}'::text[], t.updated_at, null::text, null::text)
       from podcast.pc_episodes t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'pc_episode' and si.entity_id = any(v_ids)
       and not exists (select 1 from podcast.pc_episodes t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'pc_show' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from podcast.pc_shows x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('pc_show', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.title::text), ''), 'Untitled podcast show' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), left(t.description::text, 140), '{}'::text[], t.updated_at, null::text, null::text)
       from podcast.pc_shows t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'pc_show' and si.entity_id = any(v_ids)
       and not exists (select 1 from podcast.pc_shows t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'pc_studio_run' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from podcast.pc_studio_runs x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('pc_studio_run', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.title::text), ''), 'Untitled podcast studio run' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), nullif(concat_ws(' · ', t.status::text), ''), '{}'::text[], t.updated_at, null::text, null::text)
       from podcast.pc_studio_runs t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'pc_studio_run' and si.entity_id = any(v_ids)
       and not exists (select 1 from podcast.pc_studio_runs t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'processed_document' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from docproc.processed_documents x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('processed_document', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.name::text), ''), 'Untitled source' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), concat_ws(' · ', t.source_kind::text, t.origin_client::text), '{}'::text[], t.updated_at, t.source_kind::text, t.origin_client::text)
       from docproc.processed_documents t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'processed_document' and si.entity_id = any(v_ids)
       and not exists (select 1 from docproc.processed_documents t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'project' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from projects.projects x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('project', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.name::text), ''), 'Untitled project' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), nullif(concat_ws(' · ', t.status::text), ''), '{}'::text[], t.updated_at, null::text, null::text)
       from projects.projects t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'project' and si.entity_id = any(v_ids)
       and not exists (select 1 from projects.projects t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'quiz_session' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from education.quiz_sessions x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('quiz_session', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.title::text), ''), 'Untitled quiz session' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), nullif(concat_ws(' · ', t.category::text), ''), '{}'::text[], t.updated_at, null::text, null::text)
       from education.quiz_sessions t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'quiz_session' and si.entity_id = any(v_ids)
       and not exists (select 1 from education.quiz_sessions t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'research_template' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from research.rs_template x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('research_template', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.name::text), ''), 'Untitled research template' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), left(t.description::text, 140), '{}'::text[], t.updated_at, null::text, null::text)
       from research.rs_template t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'research_template' and si.entity_id = any(v_ids)
       and not exists (select 1 from research.rs_template t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'research_topic' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from research.rs_topic x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('research_topic', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.name::text), ''), 'Untitled research topic' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), nullif(concat_ws(' · ', t.status::text), ''), '{}'::text[], t.updated_at, null::text, null::text)
       from research.rs_topic t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'research_topic' and si.entity_id = any(v_ids)
       and not exists (select 1 from research.rs_topic t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'rulebook' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from platform.rulebook x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('rulebook', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.name::text), ''), 'Untitled rulebook' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), nullif(concat_ws(' · ', t.status::text), ''), '{}'::text[], t.updated_at, null::text, null::text)
       from platform.rulebook t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'rulebook' and si.entity_id = any(v_ids)
       and not exists (select 1 from platform.rulebook t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'sch_task' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from scheduler.sch_task x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('sch_task', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.title::text), ''), 'Untitled scheduled task' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), nullif(concat_ws(' · ', t.kind::text), ''), coalesce(t.tags, '{}'::text[]), t.updated_at, null::text, null::text)
       from scheduler.sch_task t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'sch_task' and si.entity_id = any(v_ids)
       and not exists (select 1 from scheduler.sch_task t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'seo_topic' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from seo.topic x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('seo_topic', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.name::text), ''), 'Untitled seo topic' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), left(t.description::text, 140), '{}'::text[], t.updated_at, null::text, null::text)
       from seo.topic t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'seo_topic' and si.entity_id = any(v_ids)
       and not exists (select 1 from seo.topic t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'shared_canvas_item' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from canvas.shared_canvas_items x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('shared_canvas_item', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.title::text), ''), 'Untitled shared canvas item' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), left(t.description::text, 140), coalesce(t.tags, '{}'::text[]), t.updated_at, null::text, null::text)
       from canvas.shared_canvas_items t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'shared_canvas_item' and si.entity_id = any(v_ids)
       and not exists (select 1 from canvas.shared_canvas_items t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'skill' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from skill.definition x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('skill', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.label::text), ''), 'Untitled skill' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), left(t.description::text, 140), '{}'::text[], t.updated_at, null::text, null::text)
       from skill.definition t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'skill' and si.entity_id = any(v_ids)
       and not exists (select 1 from skill.definition t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'skill_render_definition' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from skill.render_definition x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('skill_render_definition', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.label::text), ''), 'Untitled skill render definition' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), left(t.description::text, 140), '{}'::text[], t.updated_at, null::text, null::text)
       from skill.render_definition t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'skill_render_definition' and si.entity_id = any(v_ids)
       and not exists (select 1 from skill.render_definition t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'studio_session' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from transcripts.studio_sessions x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('studio_session', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.title::text), ''), 'Untitled transcript studio session' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), nullif(concat_ws(' · ', t.status::text), ''), '{}'::text[], t.updated_at, null::text, null::text)
       from transcripts.studio_sessions t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'studio_session' and si.entity_id = any(v_ids)
       and not exists (select 1 from transcripts.studio_sessions t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'study_goal' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from education.study_goal x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('study_goal', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.title::text), ''), 'Untitled study goal' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), nullif(concat_ws(' · ', t.status::text), ''), '{}'::text[], t.updated_at, null::text, null::text)
       from education.study_goal t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'study_goal' and si.entity_id = any(v_ids)
       and not exists (select 1 from education.study_goal t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'study_media' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from education.study_media x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('study_media', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.title::text), ''), 'Untitled study media' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), nullif(concat_ws(' · ', t.source_kind::text, t.status::text), ''), '{}'::text[], t.updated_at, null::text, null::text)
       from education.study_media t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'study_media' and si.entity_id = any(v_ids)
       and not exists (select 1 from education.study_media t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'study_plan' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from education.study_plan x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('study_plan', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.title::text), ''), 'Untitled study plan' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), nullif(concat_ws(' · ', t.status::text), ''), '{}'::text[], t.updated_at, null::text, null::text)
       from education.study_plan t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'study_plan' and si.entity_id = any(v_ids)
       and not exists (select 1 from education.study_plan t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'study_plan_block' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from education.study_plan_block x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('study_plan_block', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.label::text), ''), 'Untitled study plan block' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), nullif(concat_ws(' · ', t.status::text), ''), '{}'::text[], t.updated_at, null::text, null::text)
       from education.study_plan_block t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'study_plan_block' and si.entity_id = any(v_ids)
       and not exists (select 1 from education.study_plan_block t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'task' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from projects.tasks x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('task', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.title::text), ''), 'Untitled task' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), nullif(concat_ws(' · ', t.status::text, t.source_type::text), ''), '{}'::text[], t.updated_at, null::text, null::text)
       from projects.tasks t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'task' and si.entity_id = any(v_ids)
       and not exists (select 1 from projects.tasks t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'thread' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from projects.threads x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('thread', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.title::text), ''), 'Untitled thread' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), null::text, '{}'::text[], t.updated_at, null::text, null::text)
       from projects.threads t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'thread' and si.entity_id = any(v_ids)
       and not exists (select 1 from projects.threads t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'tool' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from tool.definition x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('tool', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.name::text), ''), 'Untitled tool' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), nullif(concat_ws(' · ', t.source_kind::text, t.category::text), ''), coalesce(t.tags, '{}'::text[]), t.updated_at, null::text, null::text)
       from tool.definition t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'tool' and si.entity_id = any(v_ids)
       and not exists (select 1 from tool.definition t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'tool_bundle' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from tool.bundle x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('tool_bundle', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.name::text), ''), 'Untitled tool bundle' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), left(t.description::text, 140), '{}'::text[], t.updated_at, null::text, null::text)
       from tool.bundle t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'tool_bundle' and si.entity_id = any(v_ids)
       and not exists (select 1 from tool.bundle t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'transcript' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from transcripts.transcripts x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('transcript', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.title::text), ''), 'Untitled transcript' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), nullif(concat_ws(' · ', t.source_type::text), ''), coalesce(t.tags, '{}'::text[]), t.updated_at, 'transcript'::text, null::text)
       from transcripts.transcripts t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'transcript' and si.entity_id = any(v_ids)
       and not exists (select 1 from transcripts.transcripts t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'udt_document' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from workbench.udt_documents x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('udt_document', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.document_name::text), ''), 'Untitled cloud document' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), left(t.description::text, 140), '{}'::text[], t.updated_at, null::text, null::text)
       from workbench.udt_documents t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'udt_document' and si.entity_id = any(v_ids)
       and not exists (select 1 from workbench.udt_documents t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'user_markdown_sample' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from users.user_markdown_samples x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('user_markdown_sample', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.name::text), ''), 'Untitled user markdown sample' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), left(t.description::text, 140), '{}'::text[], t.updated_at, null::text, null::text)
       from users.user_markdown_samples t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'user_markdown_sample' and si.entity_id = any(v_ids)
       and not exists (select 1 from users.user_markdown_samples t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'user_profile' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from users.profiles x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('user_profile', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.display_name::text), ''), 'Untitled user profile' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), null::text, '{}'::text[], t.updated_at, null::text, null::text)
       from users.profiles t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'user_profile' and si.entity_id = any(v_ids)
       and not exists (select 1 from users.profiles t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'voice' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from ai.voices x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('voice', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.name::text), ''), 'Untitled voice' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), left(t.description::text, 140), coalesce(t.tags, '{}'::text[]), t.updated_at, null::text, null::text)
       from ai.voices t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'voice' and si.entity_id = any(v_ids)
       and not exists (select 1 from ai.voices t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'war_room' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from projects.war_rooms x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('war_room', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.title::text), ''), 'Untitled war room' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), left(t.description::text, 140), '{}'::text[], t.updated_at, null::text, null::text)
       from projects.war_rooms t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'war_room' and si.entity_id = any(v_ids)
       and not exists (select 1 from projects.war_rooms t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'wbx_pattern' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from extend.wbx_pattern x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('wbx_pattern', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.name::text), ''), 'Untitled extension scrape pattern' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), nullif(concat_ws(' · ', t.kind::text), ''), '{}'::text[], t.updated_at, null::text, null::text)
       from extend.wbx_pattern t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'wbx_pattern' and si.entity_id = any(v_ids)
       and not exists (select 1 from extend.wbx_pattern t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'web_analysis_item' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from web.analysis_item x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('web_analysis_item', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.label::text), ''), 'Untitled analysis item' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), nullif(concat_ws(' · ', t.category::text), ''), '{}'::text[], t.updated_at, null::text, null::text)
       from web.analysis_item t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'web_analysis_item' and si.entity_id = any(v_ids)
       and not exists (select 1 from web.analysis_item t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'web_brand' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from web.brand x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('web_brand', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.name::text), ''), 'Untitled brand' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), nullif(concat_ws(' · ', t.status::text), ''), '{}'::text[], t.updated_at, null::text, null::text)
       from web.brand t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'web_brand' and si.entity_id = any(v_ids)
       and not exists (select 1 from web.brand t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'web_provider' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from web.provider x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('web_provider', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.label::text), ''), 'Untitled provider' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), nullif(concat_ws(' · ', t.kind::text), ''), '{}'::text[], t.updated_at, null::text, null::text)
       from web.provider t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'web_provider' and si.entity_id = any(v_ids)
       and not exists (select 1 from web.provider t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'web_site' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from web.site x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('web_site', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.name::text), ''), 'Untitled site' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), nullif(concat_ws(' · ', t.status::text), ''), '{}'::text[], t.updated_at, null::text, null::text)
       from web.site t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'web_site' and si.entity_id = any(v_ids)
       and not exists (select 1 from web.site t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'workbook' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from workbench.udt_workbooks x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('workbook', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.workbook_name::text), ''), 'Untitled workbook' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), left(t.description::text, 140), '{}'::text[], t.updated_at, null::text, null::text)
       from workbench.udt_workbooks t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'workbook' and si.entity_id = any(v_ids)
       and not exists (select 1 from workbench.udt_workbooks t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'workflow' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from workflow.definition x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('workflow', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.name::text), ''), 'Untitled workflow' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), nullif(concat_ws(' · ', t.category::text), ''), coalesce(t.tags, '{}'::text[]), t.updated_at, null::text, null::text)
       from workflow.definition t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'workflow' and si.entity_id = any(v_ids)
       and not exists (select 1 from workflow.definition t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'workflow_plan' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from workflow.plan x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('workflow_plan', t.id, t.organization_id, t.created_by, null::platform.visibility, coalesce(nullif(btrim(t.name::text), ''), 'Untitled workflow plan' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), nullif(concat_ws(' · ', t.status::text), ''), '{}'::text[], t.updated_at, null::text, null::text)
       from workflow.plan t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'workflow_plan' and si.entity_id = any(v_ids)
       and not exists (select 1 from workflow.plan t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'workflow_template' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from workflow.template x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('workflow_template', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.name::text), ''), 'Untitled workflow template' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), nullif(concat_ws(' · ', t.category::text), ''), '{}'::text[], t.updated_at, null::text, null::text)
       from workflow.template t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'workflow_template' and si.entity_id = any(v_ids)
       and not exists (select 1 from workflow.template t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'workflow_trigger' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from workflow.trigger x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('workflow_trigger', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.name::text), ''), 'Untitled workflow trigger' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), nullif(concat_ws(' · ', t.kind::text), ''), '{}'::text[], t.updated_at, null::text, null::text)
       from workflow.trigger t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'workflow_trigger' and si.entity_id = any(v_ids)
       and not exists (select 1 from workflow.trigger t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'working_document' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from workbench.working_documents x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('working_document', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.title::text), ''), 'Untitled working document' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), nullif(concat_ws(' · ', t.kind::text), ''), '{}'::text[], t.updated_at, null::text, null::text)
       from workbench.working_documents t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'working_document' and si.entity_id = any(v_ids)
       and not exists (select 1 from workbench.working_documents t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  else
    raise exception 'search_item_backfill: % is not a projected type', p_token using errcode = '22023';
  end case;
  rows_seen := cardinality(v_ids);
  last_id := v_ids[cardinality(v_ids)];
end
$fn$;

-- ── parity: eligible source rows vs projection rows, per type ──────────────────────────────
create or replace function platform.search_item_parity(p_token text default null)
returns table(entity_token text, eligible bigint, projected bigint, missing bigint, extra bigint)
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $fn$
begin
  if p_token is null or p_token = 'agent' then
    return query
      select 'agent'::text,
             (select count(*) from agent.definition t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'agent'),
             (select count(*) from agent.definition t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'agent')),
             (select count(*) from platform.search_item si where si.entity_token = 'agent'
                 and not exists (select 1 from agent.definition t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'agent_shortcut' then
    return query
      select 'agent_shortcut'::text,
             (select count(*) from agent.shortcut t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'agent_shortcut'),
             (select count(*) from agent.shortcut t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'agent_shortcut')),
             (select count(*) from platform.search_item si where si.entity_token = 'agent_shortcut'
                 and not exists (select 1 from agent.shortcut t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'agent_template' then
    return query
      select 'agent_template'::text,
             (select count(*) from agent.template t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'agent_template'),
             (select count(*) from agent.template t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'agent_template')),
             (select count(*) from platform.search_item si where si.entity_token = 'agent_template'
                 and not exists (select 1 from agent.template t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'ai_api' then
    return query
      select 'ai_api'::text,
             (select count(*) from ai.api t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'ai_api'),
             (select count(*) from ai.api t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'ai_api')),
             (select count(*) from platform.search_item si where si.entity_token = 'ai_api'
                 and not exists (select 1 from ai.api t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'ai_endpoint' then
    return query
      select 'ai_endpoint'::text,
             (select count(*) from ai.endpoint t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'ai_endpoint'),
             (select count(*) from ai.endpoint t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'ai_endpoint')),
             (select count(*) from platform.search_item si where si.entity_token = 'ai_endpoint'
                 and not exists (select 1 from ai.endpoint t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'ai_model' then
    return query
      select 'ai_model'::text,
             (select count(*) from ai.model_definition t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'ai_model'),
             (select count(*) from ai.model_definition t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'ai_model')),
             (select count(*) from platform.search_item si where si.entity_token = 'ai_model'
                 and not exists (select 1 from ai.model_definition t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'ai_provider' then
    return query
      select 'ai_provider'::text,
             (select count(*) from ai.provider t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'ai_provider'),
             (select count(*) from ai.provider t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'ai_provider')),
             (select count(*) from platform.search_item si where si.entity_token = 'ai_provider'
                 and not exists (select 1 from ai.provider t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'ai_setting' then
    return query
      select 'ai_setting'::text,
             (select count(*) from ai.setting t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'ai_setting'),
             (select count(*) from ai.setting t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'ai_setting')),
             (select count(*) from platform.search_item si where si.entity_token = 'ai_setting'
                 and not exists (select 1 from ai.setting t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'anon_form' then
    return query
      select 'anon_form'::text,
             (select count(*) from custom.anon_form t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'anon_form'),
             (select count(*) from custom.anon_form t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'anon_form')),
             (select count(*) from platform.search_item si where si.entity_token = 'anon_form'
                 and not exists (select 1 from custom.anon_form t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'app' then
    return query
      select 'app'::text,
             (select count(*) from app.definition t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'app'),
             (select count(*) from app.definition t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'app')),
             (select count(*) from platform.search_item si where si.entity_token = 'app'
                 and not exists (select 1 from app.definition t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'assessment' then
    return query
      select 'assessment'::text,
             (select count(*) from education.assessment t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'assessment'),
             (select count(*) from education.assessment t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'assessment')),
             (select count(*) from platform.search_item si where si.entity_token = 'assessment'
                 and not exists (select 1 from education.assessment t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'canvas_comment' then
    return query
      select 'canvas_comment'::text,
             (select count(*) from canvas.canvas_comments t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'canvas_comment'),
             (select count(*) from canvas.canvas_comments t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'canvas_comment')),
             (select count(*) from platform.search_item si where si.entity_token = 'canvas_comment'
                 and not exists (select 1 from canvas.canvas_comments t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'canvas_item' then
    return query
      select 'canvas_item'::text,
             (select count(*) from canvas.canvas_items t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'canvas_item'),
             (select count(*) from canvas.canvas_items t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'canvas_item')),
             (select count(*) from platform.search_item si where si.entity_token = 'canvas_item'
                 and not exists (select 1 from canvas.canvas_items t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'canvas_score' then
    return query
      select 'canvas_score'::text,
             (select count(*) from canvas.canvas_scores t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'canvas_score'),
             (select count(*) from canvas.canvas_scores t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'canvas_score')),
             (select count(*) from platform.search_item si where si.entity_token = 'canvas_score'
                 and not exists (select 1 from canvas.canvas_scores t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'category' then
    return query
      select 'category'::text,
             (select count(*) from platform.categories t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'category'),
             (select count(*) from platform.categories t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'category')),
             (select count(*) from platform.search_item si where si.entity_token = 'category'
                 and not exists (select 1 from platform.categories t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'code_file' then
    return query
      select 'code_file'::text,
             (select count(*) from code.code_files t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'code_file'),
             (select count(*) from code.code_files t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'code_file')),
             (select count(*) from platform.search_item si where si.entity_token = 'code_file'
                 and not exists (select 1 from code.code_files t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'code_folder' then
    return query
      select 'code_folder'::text,
             (select count(*) from code.code_file_folders t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'code_folder'),
             (select count(*) from code.code_file_folders t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'code_folder')),
             (select count(*) from platform.search_item si where si.entity_token = 'code_folder'
                 and not exists (select 1 from code.code_file_folders t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'code_repository' then
    return query
      select 'code_repository'::text,
             (select count(*) from code.code_repositories t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'code_repository'),
             (select count(*) from code.code_repositories t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'code_repository')),
             (select count(*) from platform.search_item si where si.entity_token = 'code_repository'
                 and not exists (select 1 from code.code_repositories t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'comparison_set' then
    return query
      select 'comparison_set'::text,
             (select count(*) from agent.cmp_comparison_sets t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'comparison_set'),
             (select count(*) from agent.cmp_comparison_sets t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'comparison_set')),
             (select count(*) from platform.search_item si where si.entity_token = 'comparison_set'
                 and not exists (select 1 from agent.cmp_comparison_sets t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'contact_submission' then
    return query
      select 'contact_submission'::text,
             (select count(*) from communication.contact_submissions t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'contact_submission'),
             (select count(*) from communication.contact_submissions t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'contact_submission')),
             (select count(*) from platform.search_item si where si.entity_token = 'contact_submission'
                 and not exists (select 1 from communication.contact_submissions t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'content_ir_kind' then
    return query
      select 'content_ir_kind'::text,
             (select count(*) from content_ir.kind_definition t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'content_ir_kind'),
             (select count(*) from content_ir.kind_definition t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'content_ir_kind')),
             (select count(*) from platform.search_item si where si.entity_token = 'content_ir_kind'
                 and not exists (select 1 from content_ir.kind_definition t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'content_ir_kind_instance' then
    return query
      select 'content_ir_kind_instance'::text,
             (select count(*) from content_ir.kind_instance t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'content_ir_kind_instance'),
             (select count(*) from content_ir.kind_instance t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'content_ir_kind_instance')),
             (select count(*) from platform.search_item si where si.entity_token = 'content_ir_kind_instance'
                 and not exists (select 1 from content_ir.kind_instance t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'conversation' then
    return query
      select 'conversation'::text,
             (select count(*) from chat.conversation t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'conversation'),
             (select count(*) from chat.conversation t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'conversation')),
             (select count(*) from platform.search_item si where si.entity_token = 'conversation'
                 and not exists (select 1 from chat.conversation t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'crm_deal' then
    return query
      select 'crm_deal'::text,
             (select count(*) from crm.deal t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'crm_deal'),
             (select count(*) from crm.deal t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'crm_deal')),
             (select count(*) from platform.search_item si where si.entity_token = 'crm_deal'
                 and not exists (select 1 from crm.deal t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'crm_outreach_list' then
    return query
      select 'crm_outreach_list'::text,
             (select count(*) from crm.outreach_list t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'crm_outreach_list'),
             (select count(*) from crm.outreach_list t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'crm_outreach_list')),
             (select count(*) from platform.search_item si where si.entity_token = 'crm_outreach_list'
                 and not exists (select 1 from crm.outreach_list t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'cx_agent_memory' then
    return query
      select 'cx_agent_memory'::text,
             (select count(*) from chat.agent_memory t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'cx_agent_memory'),
             (select count(*) from chat.agent_memory t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'cx_agent_memory')),
             (select count(*) from platform.search_item si where si.entity_token = 'cx_agent_memory'
                 and not exists (select 1 from chat.agent_memory t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'data_store' then
    return query
      select 'data_store'::text,
             (select count(*) from rag.data_stores t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'data_store'),
             (select count(*) from rag.data_stores t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'data_store')),
             (select count(*) from platform.search_item si where si.entity_token = 'data_store'
                 and not exists (select 1 from rag.data_stores t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'fc_card' then
    return query
      select 'fc_card'::text,
             (select count(*) from education.fc_card t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'fc_card'),
             (select count(*) from education.fc_card t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'fc_card')),
             (select count(*) from platform.search_item si where si.entity_token = 'fc_card'
                 and not exists (select 1 from education.fc_card t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'fc_set' then
    return query
      select 'fc_set'::text,
             (select count(*) from education.fc_set t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'fc_set'),
             (select count(*) from education.fc_set t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'fc_set')),
             (select count(*) from platform.search_item si where si.entity_token = 'fc_set'
                 and not exists (select 1 from education.fc_set t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'feature_doc' then
    return query
      select 'feature_doc'::text,
             (select count(*) from admin.feature_docs t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'feature_doc'),
             (select count(*) from admin.feature_docs t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'feature_doc')),
             (select count(*) from platform.search_item si where si.entity_token = 'feature_doc'
                 and not exists (select 1 from admin.feature_docs t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'file' then
    return query
      select 'file'::text,
             (select count(*) from files.files t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'file'),
             (select count(*) from files.files t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'file')),
             (select count(*) from platform.search_item si where si.entity_token = 'file'
                 and not exists (select 1 from files.files t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'flexible_data' then
    return query
      select 'flexible_data'::text,
             (select count(*) from platform.flexible_data t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'flexible_data'),
             (select count(*) from platform.flexible_data t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'flexible_data')),
             (select count(*) from platform.search_item si where si.entity_token = 'flexible_data'
                 and not exists (select 1 from platform.flexible_data t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'folder' then
    return query
      select 'folder'::text,
             (select count(*) from files.folders t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'folder'),
             (select count(*) from files.folders t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'folder')),
             (select count(*) from platform.search_item si where si.entity_token = 'folder'
                 and not exists (select 1 from files.folders t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'game_result' then
    return query
      select 'game_result'::text,
             (select count(*) from education.game_result t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'game_result'),
             (select count(*) from education.game_result t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'game_result')),
             (select count(*) from platform.search_item si where si.entity_token = 'game_result'
                 and not exists (select 1 from education.game_result t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'heatmap_save' then
    return query
      select 'heatmap_save'::text,
             (select count(*) from workbench.heatmap_saves t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'heatmap_save'),
             (select count(*) from workbench.heatmap_saves t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'heatmap_save')),
             (select count(*) from platform.search_item si where si.entity_token = 'heatmap_save'
                 and not exists (select 1 from workbench.heatmap_saves t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'hr_asset' then
    return query
      select 'hr_asset'::text,
             (select count(*) from hr.asset t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'hr_asset'),
             (select count(*) from hr.asset t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'hr_asset')),
             (select count(*) from platform.search_item si where si.entity_token = 'hr_asset'
                 and not exists (select 1 from hr.asset t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'hr_candidate' then
    return query
      select 'hr_candidate'::text,
             (select count(*) from hr.candidate t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'hr_candidate'),
             (select count(*) from hr.candidate t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'hr_candidate')),
             (select count(*) from platform.search_item si where si.entity_token = 'hr_candidate'
                 and not exists (select 1 from hr.candidate t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'hr_careers_portal' then
    return query
      select 'hr_careers_portal'::text,
             (select count(*) from hr.careers_portal t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'hr_careers_portal'),
             (select count(*) from hr.careers_portal t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'hr_careers_portal')),
             (select count(*) from platform.search_item si where si.entity_token = 'hr_careers_portal'
                 and not exists (select 1 from hr.careers_portal t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'hr_checklist_template' then
    return query
      select 'hr_checklist_template'::text,
             (select count(*) from hr.checklist_template t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'hr_checklist_template'),
             (select count(*) from hr.checklist_template t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'hr_checklist_template')),
             (select count(*) from platform.search_item si where si.entity_token = 'hr_checklist_template'
                 and not exists (select 1 from hr.checklist_template t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'hr_course' then
    return query
      select 'hr_course'::text,
             (select count(*) from hr.course t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'hr_course'),
             (select count(*) from hr.course t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'hr_course')),
             (select count(*) from platform.search_item si where si.entity_token = 'hr_course'
                 and not exists (select 1 from hr.course t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'hr_crew' then
    return query
      select 'hr_crew'::text,
             (select count(*) from hr.crew t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'hr_crew'),
             (select count(*) from hr.crew t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'hr_crew')),
             (select count(*) from platform.search_item si where si.entity_token = 'hr_crew'
                 and not exists (select 1 from hr.crew t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'hr_deduction_code' then
    return query
      select 'hr_deduction_code'::text,
             (select count(*) from hr.deduction_code t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'hr_deduction_code'),
             (select count(*) from hr.deduction_code t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'hr_deduction_code')),
             (select count(*) from platform.search_item si where si.entity_token = 'hr_deduction_code'
                 and not exists (select 1 from hr.deduction_code t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'hr_department' then
    return query
      select 'hr_department'::text,
             (select count(*) from hr.department t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'hr_department'),
             (select count(*) from hr.department t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'hr_department')),
             (select count(*) from platform.search_item si where si.entity_token = 'hr_department'
                 and not exists (select 1 from hr.department t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'hr_earning_code' then
    return query
      select 'hr_earning_code'::text,
             (select count(*) from hr.earning_code t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'hr_earning_code'),
             (select count(*) from hr.earning_code t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'hr_earning_code')),
             (select count(*) from platform.search_item si where si.entity_token = 'hr_earning_code'
                 and not exists (select 1 from hr.earning_code t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'hr_employee' then
    return query
      select 'hr_employee'::text,
             (select count(*) from hr.employee t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'hr_employee'),
             (select count(*) from hr.employee t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'hr_employee')),
             (select count(*) from platform.search_item si where si.entity_token = 'hr_employee'
                 and not exists (select 1 from hr.employee t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'hr_holiday_calendar' then
    return query
      select 'hr_holiday_calendar'::text,
             (select count(*) from hr.holiday_calendar t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'hr_holiday_calendar'),
             (select count(*) from hr.holiday_calendar t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'hr_holiday_calendar')),
             (select count(*) from platform.search_item si where si.entity_token = 'hr_holiday_calendar'
                 and not exists (select 1 from hr.holiday_calendar t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'hr_interview_kit' then
    return query
      select 'hr_interview_kit'::text,
             (select count(*) from hr.interview_kit t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'hr_interview_kit'),
             (select count(*) from hr.interview_kit t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'hr_interview_kit')),
             (select count(*) from platform.search_item si where si.entity_token = 'hr_interview_kit'
                 and not exists (select 1 from hr.interview_kit t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'hr_job_title' then
    return query
      select 'hr_job_title'::text,
             (select count(*) from hr.job_title t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'hr_job_title'),
             (select count(*) from hr.job_title t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'hr_job_title')),
             (select count(*) from platform.search_item si where si.entity_token = 'hr_job_title'
                 and not exists (select 1 from hr.job_title t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'hr_jurisdiction' then
    return query
      select 'hr_jurisdiction'::text,
             (select count(*) from hr.jurisdiction t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'hr_jurisdiction'),
             (select count(*) from hr.jurisdiction t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'hr_jurisdiction')),
             (select count(*) from platform.search_item si where si.entity_token = 'hr_jurisdiction'
                 and not exists (select 1 from hr.jurisdiction t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'hr_jurisdiction_rule_class' then
    return query
      select 'hr_jurisdiction_rule_class'::text,
             (select count(*) from hr.jurisdiction_rule_class t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'hr_jurisdiction_rule_class'),
             (select count(*) from hr.jurisdiction_rule_class t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'hr_jurisdiction_rule_class')),
             (select count(*) from platform.search_item si where si.entity_token = 'hr_jurisdiction_rule_class'
                 and not exists (select 1 from hr.jurisdiction_rule_class t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'hr_leave_policy' then
    return query
      select 'hr_leave_policy'::text,
             (select count(*) from hr.leave_policy t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'hr_leave_policy'),
             (select count(*) from hr.leave_policy t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'hr_leave_policy')),
             (select count(*) from platform.search_item si where si.entity_token = 'hr_leave_policy'
                 and not exists (select 1 from hr.leave_policy t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'hr_location' then
    return query
      select 'hr_location'::text,
             (select count(*) from hr.location t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'hr_location'),
             (select count(*) from hr.location t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'hr_location')),
             (select count(*) from platform.search_item si where si.entity_token = 'hr_location'
                 and not exists (select 1 from hr.location t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'hr_pay_group' then
    return query
      select 'hr_pay_group'::text,
             (select count(*) from hr.pay_group t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'hr_pay_group'),
             (select count(*) from hr.pay_group t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'hr_pay_group')),
             (select count(*) from platform.search_item si where si.entity_token = 'hr_pay_group'
                 and not exists (select 1 from hr.pay_group t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'hr_posting' then
    return query
      select 'hr_posting'::text,
             (select count(*) from hr.posting t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'hr_posting'),
             (select count(*) from hr.posting t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'hr_posting')),
             (select count(*) from platform.search_item si where si.entity_token = 'hr_posting'
                 and not exists (select 1 from hr.posting t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'hr_record_class' then
    return query
      select 'hr_record_class'::text,
             (select count(*) from hr.record_class t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'hr_record_class'),
             (select count(*) from hr.record_class t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'hr_record_class')),
             (select count(*) from platform.search_item si where si.entity_token = 'hr_record_class'
                 and not exists (select 1 from hr.record_class t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'hr_requisition' then
    return query
      select 'hr_requisition'::text,
             (select count(*) from hr.requisition t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'hr_requisition'),
             (select count(*) from hr.requisition t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'hr_requisition')),
             (select count(*) from platform.search_item si where si.entity_token = 'hr_requisition'
                 and not exists (select 1 from hr.requisition t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'hr_schedule' then
    return query
      select 'hr_schedule'::text,
             (select count(*) from hr.schedule t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'hr_schedule'),
             (select count(*) from hr.schedule t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'hr_schedule')),
             (select count(*) from platform.search_item si where si.entity_token = 'hr_schedule'
                 and not exists (select 1 from hr.schedule t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'hr_schedule_template' then
    return query
      select 'hr_schedule_template'::text,
             (select count(*) from hr.schedule_template t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'hr_schedule_template'),
             (select count(*) from hr.schedule_template t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'hr_schedule_template')),
             (select count(*) from platform.search_item si where si.entity_token = 'hr_schedule_template'
                 and not exists (select 1 from hr.schedule_template t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'hr_survey' then
    return query
      select 'hr_survey'::text,
             (select count(*) from hr.survey t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'hr_survey'),
             (select count(*) from hr.survey t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'hr_survey')),
             (select count(*) from platform.search_item si where si.entity_token = 'hr_survey'
                 and not exists (select 1 from hr.survey t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'league_membership' then
    return query
      select 'league_membership'::text,
             (select count(*) from education.league_membership t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'league_membership'),
             (select count(*) from education.league_membership t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'league_membership')),
             (select count(*) from platform.search_item si where si.entity_token = 'league_membership'
                 and not exists (select 1 from education.league_membership t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'learn_doc' then
    return query
      select 'learn_doc'::text,
             (select count(*) from education.learn_doc t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'learn_doc'),
             (select count(*) from education.learn_doc t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'learn_doc')),
             (select count(*) from platform.search_item si where si.entity_token = 'learn_doc'
                 and not exists (select 1 from education.learn_doc t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'mandate' then
    return query
      select 'mandate'::text,
             (select count(*) from mandate.definition t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'mandate'),
             (select count(*) from mandate.definition t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'mandate')),
             (select count(*) from platform.search_item si where si.entity_token = 'mandate'
                 and not exists (select 1 from mandate.definition t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'marketing_initiative' then
    return query
      select 'marketing_initiative'::text,
             (select count(*) from marketing.initiative t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'marketing_initiative'),
             (select count(*) from marketing.initiative t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'marketing_initiative')),
             (select count(*) from platform.search_item si where si.entity_token = 'marketing_initiative'
                 and not exists (select 1 from marketing.initiative t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'meet_meeting' then
    return query
      select 'meet_meeting'::text,
             (select count(*) from communication.meet_meetings t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'meet_meeting'),
             (select count(*) from communication.meet_meetings t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'meet_meeting')),
             (select count(*) from platform.search_item si where si.entity_token = 'meet_meeting'
                 and not exists (select 1 from communication.meet_meetings t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'message_template' then
    return query
      select 'message_template'::text,
             (select count(*) from agent.message_template t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'message_template'),
             (select count(*) from agent.message_template t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'message_template')),
             (select count(*) from platform.search_item si where si.entity_token = 'message_template'
                 and not exists (select 1 from agent.message_template t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'note' then
    return query
      select 'note'::text,
             (select count(*) from workbench.notes t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'note'),
             (select count(*) from workbench.notes t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'note')),
             (select count(*) from platform.search_item si where si.entity_token = 'note'
                 and not exists (select 1 from workbench.notes t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'note_folder' then
    return query
      select 'note_folder'::text,
             (select count(*) from workbench.note_folders t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'note_folder'),
             (select count(*) from workbench.note_folders t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'note_folder')),
             (select count(*) from platform.search_item si where si.entity_token = 'note_folder'
                 and not exists (select 1 from workbench.note_folders t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'page_extraction_job' then
    return query
      select 'page_extraction_job'::text,
             (select count(*) from docproc.page_extraction_jobs t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'page_extraction_job'),
             (select count(*) from docproc.page_extraction_jobs t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'page_extraction_job')),
             (select count(*) from platform.search_item si where si.entity_token = 'page_extraction_job'
                 and not exists (select 1 from docproc.page_extraction_jobs t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'party' then
    return query
      select 'party'::text,
             (select count(*) from crm.party t where t.organization_id is not null and t.deleted_at is null and t.record_class::text = 'contact'),
             (select count(*) from platform.search_item si where si.entity_token = 'party'),
             (select count(*) from crm.party t where t.organization_id is not null and t.deleted_at is null and t.record_class::text = 'contact'
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'party')),
             (select count(*) from platform.search_item si where si.entity_token = 'party'
                 and not exists (select 1 from crm.party t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null and t.record_class::text = 'contact'));
  end if;
  if p_token is null or p_token = 'pc_article' then
    return query
      select 'pc_article'::text,
             (select count(*) from podcast.pc_articles t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'pc_article'),
             (select count(*) from podcast.pc_articles t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'pc_article')),
             (select count(*) from platform.search_item si where si.entity_token = 'pc_article'
                 and not exists (select 1 from podcast.pc_articles t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'pc_episode' then
    return query
      select 'pc_episode'::text,
             (select count(*) from podcast.pc_episodes t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'pc_episode'),
             (select count(*) from podcast.pc_episodes t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'pc_episode')),
             (select count(*) from platform.search_item si where si.entity_token = 'pc_episode'
                 and not exists (select 1 from podcast.pc_episodes t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'pc_show' then
    return query
      select 'pc_show'::text,
             (select count(*) from podcast.pc_shows t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'pc_show'),
             (select count(*) from podcast.pc_shows t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'pc_show')),
             (select count(*) from platform.search_item si where si.entity_token = 'pc_show'
                 and not exists (select 1 from podcast.pc_shows t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'pc_studio_run' then
    return query
      select 'pc_studio_run'::text,
             (select count(*) from podcast.pc_studio_runs t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'pc_studio_run'),
             (select count(*) from podcast.pc_studio_runs t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'pc_studio_run')),
             (select count(*) from platform.search_item si where si.entity_token = 'pc_studio_run'
                 and not exists (select 1 from podcast.pc_studio_runs t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'processed_document' then
    return query
      select 'processed_document'::text,
             (select count(*) from docproc.processed_documents t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'processed_document'),
             (select count(*) from docproc.processed_documents t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'processed_document')),
             (select count(*) from platform.search_item si where si.entity_token = 'processed_document'
                 and not exists (select 1 from docproc.processed_documents t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'project' then
    return query
      select 'project'::text,
             (select count(*) from projects.projects t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'project'),
             (select count(*) from projects.projects t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'project')),
             (select count(*) from platform.search_item si where si.entity_token = 'project'
                 and not exists (select 1 from projects.projects t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'quiz_session' then
    return query
      select 'quiz_session'::text,
             (select count(*) from education.quiz_sessions t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'quiz_session'),
             (select count(*) from education.quiz_sessions t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'quiz_session')),
             (select count(*) from platform.search_item si where si.entity_token = 'quiz_session'
                 and not exists (select 1 from education.quiz_sessions t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'research_template' then
    return query
      select 'research_template'::text,
             (select count(*) from research.rs_template t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'research_template'),
             (select count(*) from research.rs_template t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'research_template')),
             (select count(*) from platform.search_item si where si.entity_token = 'research_template'
                 and not exists (select 1 from research.rs_template t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'research_topic' then
    return query
      select 'research_topic'::text,
             (select count(*) from research.rs_topic t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'research_topic'),
             (select count(*) from research.rs_topic t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'research_topic')),
             (select count(*) from platform.search_item si where si.entity_token = 'research_topic'
                 and not exists (select 1 from research.rs_topic t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'rulebook' then
    return query
      select 'rulebook'::text,
             (select count(*) from platform.rulebook t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'rulebook'),
             (select count(*) from platform.rulebook t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'rulebook')),
             (select count(*) from platform.search_item si where si.entity_token = 'rulebook'
                 and not exists (select 1 from platform.rulebook t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'sch_task' then
    return query
      select 'sch_task'::text,
             (select count(*) from scheduler.sch_task t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'sch_task'),
             (select count(*) from scheduler.sch_task t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'sch_task')),
             (select count(*) from platform.search_item si where si.entity_token = 'sch_task'
                 and not exists (select 1 from scheduler.sch_task t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'seo_topic' then
    return query
      select 'seo_topic'::text,
             (select count(*) from seo.topic t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'seo_topic'),
             (select count(*) from seo.topic t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'seo_topic')),
             (select count(*) from platform.search_item si where si.entity_token = 'seo_topic'
                 and not exists (select 1 from seo.topic t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'shared_canvas_item' then
    return query
      select 'shared_canvas_item'::text,
             (select count(*) from canvas.shared_canvas_items t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'shared_canvas_item'),
             (select count(*) from canvas.shared_canvas_items t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'shared_canvas_item')),
             (select count(*) from platform.search_item si where si.entity_token = 'shared_canvas_item'
                 and not exists (select 1 from canvas.shared_canvas_items t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'skill' then
    return query
      select 'skill'::text,
             (select count(*) from skill.definition t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'skill'),
             (select count(*) from skill.definition t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'skill')),
             (select count(*) from platform.search_item si where si.entity_token = 'skill'
                 and not exists (select 1 from skill.definition t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'skill_render_definition' then
    return query
      select 'skill_render_definition'::text,
             (select count(*) from skill.render_definition t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'skill_render_definition'),
             (select count(*) from skill.render_definition t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'skill_render_definition')),
             (select count(*) from platform.search_item si where si.entity_token = 'skill_render_definition'
                 and not exists (select 1 from skill.render_definition t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'studio_session' then
    return query
      select 'studio_session'::text,
             (select count(*) from transcripts.studio_sessions t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'studio_session'),
             (select count(*) from transcripts.studio_sessions t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'studio_session')),
             (select count(*) from platform.search_item si where si.entity_token = 'studio_session'
                 and not exists (select 1 from transcripts.studio_sessions t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'study_goal' then
    return query
      select 'study_goal'::text,
             (select count(*) from education.study_goal t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'study_goal'),
             (select count(*) from education.study_goal t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'study_goal')),
             (select count(*) from platform.search_item si where si.entity_token = 'study_goal'
                 and not exists (select 1 from education.study_goal t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'study_media' then
    return query
      select 'study_media'::text,
             (select count(*) from education.study_media t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'study_media'),
             (select count(*) from education.study_media t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'study_media')),
             (select count(*) from platform.search_item si where si.entity_token = 'study_media'
                 and not exists (select 1 from education.study_media t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'study_plan' then
    return query
      select 'study_plan'::text,
             (select count(*) from education.study_plan t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'study_plan'),
             (select count(*) from education.study_plan t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'study_plan')),
             (select count(*) from platform.search_item si where si.entity_token = 'study_plan'
                 and not exists (select 1 from education.study_plan t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'study_plan_block' then
    return query
      select 'study_plan_block'::text,
             (select count(*) from education.study_plan_block t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'study_plan_block'),
             (select count(*) from education.study_plan_block t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'study_plan_block')),
             (select count(*) from platform.search_item si where si.entity_token = 'study_plan_block'
                 and not exists (select 1 from education.study_plan_block t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'task' then
    return query
      select 'task'::text,
             (select count(*) from projects.tasks t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'task'),
             (select count(*) from projects.tasks t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'task')),
             (select count(*) from platform.search_item si where si.entity_token = 'task'
                 and not exists (select 1 from projects.tasks t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'thread' then
    return query
      select 'thread'::text,
             (select count(*) from projects.threads t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'thread'),
             (select count(*) from projects.threads t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'thread')),
             (select count(*) from platform.search_item si where si.entity_token = 'thread'
                 and not exists (select 1 from projects.threads t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'tool' then
    return query
      select 'tool'::text,
             (select count(*) from tool.definition t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'tool'),
             (select count(*) from tool.definition t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'tool')),
             (select count(*) from platform.search_item si where si.entity_token = 'tool'
                 and not exists (select 1 from tool.definition t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'tool_bundle' then
    return query
      select 'tool_bundle'::text,
             (select count(*) from tool.bundle t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'tool_bundle'),
             (select count(*) from tool.bundle t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'tool_bundle')),
             (select count(*) from platform.search_item si where si.entity_token = 'tool_bundle'
                 and not exists (select 1 from tool.bundle t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'transcript' then
    return query
      select 'transcript'::text,
             (select count(*) from transcripts.transcripts t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'transcript'),
             (select count(*) from transcripts.transcripts t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'transcript')),
             (select count(*) from platform.search_item si where si.entity_token = 'transcript'
                 and not exists (select 1 from transcripts.transcripts t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'udt_document' then
    return query
      select 'udt_document'::text,
             (select count(*) from workbench.udt_documents t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'udt_document'),
             (select count(*) from workbench.udt_documents t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'udt_document')),
             (select count(*) from platform.search_item si where si.entity_token = 'udt_document'
                 and not exists (select 1 from workbench.udt_documents t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'user_markdown_sample' then
    return query
      select 'user_markdown_sample'::text,
             (select count(*) from users.user_markdown_samples t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'user_markdown_sample'),
             (select count(*) from users.user_markdown_samples t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'user_markdown_sample')),
             (select count(*) from platform.search_item si where si.entity_token = 'user_markdown_sample'
                 and not exists (select 1 from users.user_markdown_samples t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'user_profile' then
    return query
      select 'user_profile'::text,
             (select count(*) from users.profiles t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'user_profile'),
             (select count(*) from users.profiles t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'user_profile')),
             (select count(*) from platform.search_item si where si.entity_token = 'user_profile'
                 and not exists (select 1 from users.profiles t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'voice' then
    return query
      select 'voice'::text,
             (select count(*) from ai.voices t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'voice'),
             (select count(*) from ai.voices t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'voice')),
             (select count(*) from platform.search_item si where si.entity_token = 'voice'
                 and not exists (select 1 from ai.voices t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'war_room' then
    return query
      select 'war_room'::text,
             (select count(*) from projects.war_rooms t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'war_room'),
             (select count(*) from projects.war_rooms t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'war_room')),
             (select count(*) from platform.search_item si where si.entity_token = 'war_room'
                 and not exists (select 1 from projects.war_rooms t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'wbx_pattern' then
    return query
      select 'wbx_pattern'::text,
             (select count(*) from extend.wbx_pattern t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'wbx_pattern'),
             (select count(*) from extend.wbx_pattern t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'wbx_pattern')),
             (select count(*) from platform.search_item si where si.entity_token = 'wbx_pattern'
                 and not exists (select 1 from extend.wbx_pattern t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'web_analysis_item' then
    return query
      select 'web_analysis_item'::text,
             (select count(*) from web.analysis_item t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'web_analysis_item'),
             (select count(*) from web.analysis_item t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'web_analysis_item')),
             (select count(*) from platform.search_item si where si.entity_token = 'web_analysis_item'
                 and not exists (select 1 from web.analysis_item t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'web_brand' then
    return query
      select 'web_brand'::text,
             (select count(*) from web.brand t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'web_brand'),
             (select count(*) from web.brand t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'web_brand')),
             (select count(*) from platform.search_item si where si.entity_token = 'web_brand'
                 and not exists (select 1 from web.brand t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'web_provider' then
    return query
      select 'web_provider'::text,
             (select count(*) from web.provider t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'web_provider'),
             (select count(*) from web.provider t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'web_provider')),
             (select count(*) from platform.search_item si where si.entity_token = 'web_provider'
                 and not exists (select 1 from web.provider t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'web_site' then
    return query
      select 'web_site'::text,
             (select count(*) from web.site t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'web_site'),
             (select count(*) from web.site t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'web_site')),
             (select count(*) from platform.search_item si where si.entity_token = 'web_site'
                 and not exists (select 1 from web.site t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'workbook' then
    return query
      select 'workbook'::text,
             (select count(*) from workbench.udt_workbooks t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'workbook'),
             (select count(*) from workbench.udt_workbooks t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'workbook')),
             (select count(*) from platform.search_item si where si.entity_token = 'workbook'
                 and not exists (select 1 from workbench.udt_workbooks t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'workflow' then
    return query
      select 'workflow'::text,
             (select count(*) from workflow.definition t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'workflow'),
             (select count(*) from workflow.definition t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'workflow')),
             (select count(*) from platform.search_item si where si.entity_token = 'workflow'
                 and not exists (select 1 from workflow.definition t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'workflow_plan' then
    return query
      select 'workflow_plan'::text,
             (select count(*) from workflow.plan t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'workflow_plan'),
             (select count(*) from workflow.plan t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'workflow_plan')),
             (select count(*) from platform.search_item si where si.entity_token = 'workflow_plan'
                 and not exists (select 1 from workflow.plan t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'workflow_template' then
    return query
      select 'workflow_template'::text,
             (select count(*) from workflow.template t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'workflow_template'),
             (select count(*) from workflow.template t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'workflow_template')),
             (select count(*) from platform.search_item si where si.entity_token = 'workflow_template'
                 and not exists (select 1 from workflow.template t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'workflow_trigger' then
    return query
      select 'workflow_trigger'::text,
             (select count(*) from workflow.trigger t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'workflow_trigger'),
             (select count(*) from workflow.trigger t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'workflow_trigger')),
             (select count(*) from platform.search_item si where si.entity_token = 'workflow_trigger'
                 and not exists (select 1 from workflow.trigger t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
  if p_token is null or p_token = 'working_document' then
    return query
      select 'working_document'::text,
             (select count(*) from workbench.working_documents t where t.organization_id is not null and t.deleted_at is null),
             (select count(*) from platform.search_item si where si.entity_token = 'working_document'),
             (select count(*) from workbench.working_documents t where t.organization_id is not null and t.deleted_at is null
                 and not exists (select 1 from platform.search_item si
                                  where si.entity_id = t.id and si.entity_token = 'working_document')),
             (select count(*) from platform.search_item si where si.entity_token = 'working_document'
                 and not exists (select 1 from workbench.working_documents t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null));
  end if;
end
$fn$;

create or replace function platform.search_item_projected_tokens()
returns text[]
language sql
immutable
set search_path to 'pg_catalog'
as $fn$ select array['agent', 'agent_shortcut', 'agent_template', 'ai_api', 'ai_endpoint', 'ai_model', 'ai_provider', 'ai_setting', 'anon_form', 'app', 'assessment', 'canvas_comment', 'canvas_item', 'canvas_score', 'category', 'code_file', 'code_folder', 'code_repository', 'comparison_set', 'contact_submission', 'content_ir_kind', 'content_ir_kind_instance', 'conversation', 'crm_deal', 'crm_outreach_list', 'cx_agent_memory', 'data_store', 'fc_card', 'fc_set', 'feature_doc', 'file', 'flexible_data', 'folder', 'game_result', 'heatmap_save', 'hr_asset', 'hr_candidate', 'hr_careers_portal', 'hr_checklist_template', 'hr_course', 'hr_crew', 'hr_deduction_code', 'hr_department', 'hr_earning_code', 'hr_employee', 'hr_holiday_calendar', 'hr_interview_kit', 'hr_job_title', 'hr_jurisdiction', 'hr_jurisdiction_rule_class', 'hr_leave_policy', 'hr_location', 'hr_pay_group', 'hr_posting', 'hr_record_class', 'hr_requisition', 'hr_schedule', 'hr_schedule_template', 'hr_survey', 'league_membership', 'learn_doc', 'mandate', 'marketing_initiative', 'meet_meeting', 'message_template', 'note', 'note_folder', 'page_extraction_job', 'party', 'pc_article', 'pc_episode', 'pc_show', 'pc_studio_run', 'processed_document', 'project', 'quiz_session', 'research_template', 'research_topic', 'rulebook', 'sch_task', 'seo_topic', 'shared_canvas_item', 'skill', 'skill_render_definition', 'studio_session', 'study_goal', 'study_media', 'study_plan', 'study_plan_block', 'task', 'thread', 'tool', 'tool_bundle', 'transcript', 'udt_document', 'user_markdown_sample', 'user_profile', 'voice', 'war_room', 'wbx_pattern', 'web_analysis_item', 'web_brand', 'web_provider', 'web_site', 'workbook', 'workflow', 'workflow_plan', 'workflow_template', 'workflow_trigger', 'working_document']::text[] $fn$;
comment on function platform.search_item_projected_tokens() is
  'The tokens 1366 attached a _search_item_sync trigger to (generated). The registry-hygiene test '
  'compares this list with the live registry.';
