-- draft: SCOPES-ON-THE-STORE unproven — builder cut off by the weekly usage limit 2026-10-03; clone proof + independent verify before removing this line
-- chair-step: it REPLACES three bodies so that a scope type's search index title is its label (plural, as the scope tree names it; singular and then the slug as fallbacks) instead of its slug: the store's change-feed twin custom._context_side_effects, the older table's search trigger function platform._search_item_sync_scope_type, and the scope_type branch of the canonical reindex platform.search_item_backfill. Signatures, SECURITY DEFINER, search_path and grants unchanged. Existing index rows are not edited: they take the label the next time the type is written or when platform.search_item_backfill('scope_type', null, 20000) is run.
-- lane: SCOPES-ON-THE-STORE
-- based-on: custom._context_side_effects(jsonb) 1ce88feb98f19316d34ed85ba2284ad507fa7b49040b0d70365f9b37d2a749c8
-- based-on: platform._search_item_sync_scope_type() f1ea6f4f06192de2b67abe21aeed720051eeca538bfbab5eb07ce4e75be72d7b
-- based-on: platform.search_item_backfill(text, uuid, integer) 635c31dead60d55ef87c4d2136c3809eccd502f8e8df4580d64d9bb762247c63
-- lock: custom, platform
--
-- Inverse: migrations/inverse/scopesrefusals_a_scope_type_is_found_by_its_label_down.sql.
-- Guard: scripts/campaign-tests/scopesrefusals_a_scope_type_is_found_by_its_label_red_green.sql.

CREATE OR REPLACE FUNCTION custom._context_side_effects(p_events jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  c_tk constant uuid := '11111111-0000-4000-8000-000000000001';   -- custom.table_kernel_id()
  c_fk constant uuid := '11111111-0000-4000-8000-000000000002';   -- custom.field_kernel_id()
  e      record;
  r      custom.record;
  x      record;
  v_type uuid;
  v_key  text;
  v_rs   jsonb;
  v_held uuid;
begin
  -- WHICH EVENTS ARE ABOUT THE CONTEXT SYSTEM: a Record in a Table kept for context (a scope), a Table
  -- kept for context (a scope type), a Field of one (a context field). A Table record that is gone
  -- (purged) is carried too, so its search row can go; everything else is left alone at the cost of
  -- one primary-key read per event.
  -- LANE 9 W2-W: A STORE-FIRST SCOPE DOOR HOLDS ITS OWN ROW BACK. The door writes the store first and the old
  -- row second; the old row's own triggers (the sweep wake, the search sync, the dataset provisioning) must run
  -- first, as they did when the old row was the writer, so the door names its row here for its first store
  -- write and runs this twin for it itself once the old row is written (custom.context_scope_write,
  -- custom.context_type_write). Every other event, and every other row in the same statement, is unchanged.
  v_held := nullif(current_setting('custom.context_door_row', true), '')::uuid;
  for e in
    select ev.org, ev.id, ev.table_id, bool_or(ev.operation = 'created') as created
      from (select (je ->> 0)::uuid as org, (je ->> 1)::uuid as id, (je ->> 2)::uuid as table_id, je ->> 3 as operation
              from jsonb_array_elements(coalesce(p_events, '[]'::jsonb)) je) ev
     where case
             when ev.table_id = c_tk then
               not exists (select 1 from custom.record t where t.organization_id = ev.org and t.id = ev.id)
               or exists (select 1 from custom.record t where t.organization_id = ev.org and t.id = ev.id
                            and t.data ->> 'kept_for' = 'context')
             when ev.table_id = c_fk then
               exists (select 1 from custom.record f
                         join custom.record t on t.organization_id = f.organization_id
                                             and t.id::text = f.data ->> 'entity_definition_id'
                                             and t.table_id = c_tk and t.data ->> 'kept_for' = 'context'
                        where f.organization_id = ev.org and f.id = ev.id)
             else
               exists (select 1 from custom.record t where t.organization_id = ev.org and t.id = ev.table_id
                         and t.table_id = c_tk and t.data ->> 'kept_for' = 'context')
           end
       and ev.id is distinct from v_held
     group by 1, 2, 3
  loop
    select * into r from custom.record where organization_id = e.org and id = e.id;

    if e.table_id = c_tk then
      -- ── A SCOPE TYPE (twin of platform._search_item_sync_scope_type, public._notify_suggestion_sweep_scope_type)
      if r.id is null or r.deleted_at is not null then
        perform platform._search_item_drop('scope_type', e.id);
        continue;
      end if;
      -- The old title is the type's slug in the old grammar (hyphens); the store keeps it with
      -- underscores (measured 2026-09-28: 83 of 83 equal once read back).
      perform platform._search_item_put('scope_type', r.id, r.organization_id, r.created_by, null::platform.visibility,
        coalesce(nullif(btrim(r.data ->> 'label_plural'), ''), nullif(btrim(r.data ->> 'label_singular'), ''), nullif(btrim(replace(r.data ->> 'slug', '_', '-')), ''), 'Untitled scope type' || coalesce(' ' || to_char(r.created_at, 'YYYY-MM-DD'), '')),
        left(coalesce(nullif(r.data ->> 'description', ''), r.metadata #>> '{moved_from,carried,description}'), 140),
        '{}'::text[], r.updated_at, null::text, null::text);
      if e.created then
        insert into rag.kg_sweep_queue (change_type, entity_id, scope_type_id, organization_id, created_by)
        select 'scope_type', r.id, r.id, r.organization_id, null
         where not exists (select 1 from rag.kg_sweep_queue q where q.change_type = 'scope_type' and q.entity_id = r.id);
        if found then
          perform pg_notify('suggestion_sweep', json_build_object('change_type', 'scope_type', 'entity_id', r.id::text,
            'scope_type_id', r.id::text, 'organization_id', r.organization_id::text, 'created_by', null)::text);
        end if;
      end if;

    elsif e.table_id = c_fk then
      -- ── A CONTEXT FIELD (twin of public._notify_suggestion_sweep_context_item and the item half of
      --    context.provision_scope_datasets_trigger). An inactive or archived field wakes nothing.
      continue when r.id is null or r.deleted_at is not null
                 or not coalesce((r.metadata #>> '{moved_from,carried,is_active}')::boolean, true);
      v_type := (r.data ->> 'entity_definition_id')::uuid;
      if e.created then
        insert into rag.kg_sweep_queue (change_type, entity_id, scope_type_id, organization_id, created_by)
        select 'context_item', r.id, v_type, r.organization_id, r.created_by
         where not exists (select 1 from rag.kg_sweep_queue q where q.change_type = 'context_item' and q.entity_id = r.id);
        if found then
          perform pg_notify('suggestion_sweep', json_build_object('change_type', 'context_item', 'entity_id', r.id::text,
            'scope_type_id', v_type::text, 'organization_id', r.organization_id::text, 'created_by', r.created_by::text)::text);
        end if;
      end if;
      -- Where a Field says it is bound to a dataset template: its own document (lane
      -- SCOPES-STORE-HOMES' home), or what the copy carried before that home existed.
      v_rs := coalesce(r.data -> 'reference_source', r.metadata #> '{moved_from,carried,reference_source}');
      if v_rs ->> 'container_type' = 'dataset_template' then
        for x in select s.id from custom.record s
                  where s.organization_id = r.organization_id and s.table_id = v_type
                    and s.data_class = 'record' and s.deleted_at is null
        loop
          perform custom.scope_table_provision(r.organization_id, r.id, x.id, null);
        end loop;
      end if;

    else
      -- ── A SCOPE (twin of platform._search_item_sync_scope, public._notify_suggestion_sweep_scope
      --    and the scope half of context.provision_scope_datasets_trigger)
      if r.id is null or r.deleted_at is not null then
        perform platform._search_item_drop('scope', e.id);
        continue;
      end if;
      select f.data ->> 'key' into v_key from custom.record f
       where f.organization_id = r.organization_id and f.id = custom._ctx_id('scope-column-field', r.table_id::text, 'description');
      perform platform._search_item_put('scope', r.id, r.organization_id, r.created_by, r.visibility,
        coalesce(nullif(btrim(r.data ->> 'name'), ''), 'Untitled scope' || coalesce(' ' || to_char(r.created_at, 'YYYY-MM-DD'), '')),
        left(r.data ->> coalesce(v_key, 'description'), 140),
        '{}'::text[], r.updated_at, null::text, null::text);
      if e.created then
        insert into rag.kg_sweep_queue (change_type, entity_id, scope_type_id, organization_id, created_by)
        select 'scope', r.id, r.table_id, r.organization_id, r.created_by
         where not exists (select 1 from rag.kg_sweep_queue q where q.change_type = 'scope' and q.entity_id = r.id);
        if found then
          perform pg_notify('suggestion_sweep', json_build_object('change_type', 'scope', 'entity_id', r.id::text,
            'scope_type_id', r.table_id::text, 'organization_id', r.organization_id::text, 'created_by', r.created_by::text)::text);
        end if;
        for x in select f.id from custom.record f
                  where f.organization_id = r.organization_id and f.table_id = c_fk and f.deleted_at is null
                    and f.data ->> 'entity_definition_id' = r.table_id::text
                    and coalesce((f.metadata #>> '{moved_from,carried,is_active}')::boolean, true)
                    and coalesce(f.data -> 'reference_source', f.metadata #> '{moved_from,carried,reference_source}') ->> 'container_type' = 'dataset_template'
        loop
          perform custom.scope_table_provision(r.organization_id, x.id, r.id, null);
        end loop;
      end if;
    end if;
  end loop;
end
$function$;

CREATE OR REPLACE FUNCTION platform._search_item_sync_scope_type()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  if tg_op = 'DELETE' then
    perform platform._search_item_drop('scope_type', old.id);
    return null;
  end if;
  if tg_op = 'UPDATE'
     and (old.label_plural, old.label_singular, old.slug, old.organization_id, old.created_by, old.deleted_at, old.description) is not distinct from (new.label_plural, new.label_singular, new.slug, new.organization_id, new.created_by, new.deleted_at, new.description)
       and date_trunc('hour', new.updated_at) = date_trunc('hour', old.updated_at) then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.id is distinct from old.id then
    perform platform._search_item_drop('scope_type', old.id);
  end if;
  if new.organization_id is not null and new.deleted_at is null then
    perform platform._search_item_put('scope_type', new.id, new.organization_id, new.created_by, null::platform.visibility, coalesce(nullif(btrim(new.label_plural::text), ''), nullif(btrim(new.label_singular::text), ''), nullif(btrim(new.slug::text), ''), 'Untitled scope type' || coalesce(' ' || to_char(new.created_at, 'YYYY-MM-DD'), '')), left(new.description::text, 140), '{}'::text[], new.updated_at, null::text, null::text);
  else
    perform platform._search_item_drop('scope_type', new.id);
  end if;
  return null;
end
$function$;

CREATE OR REPLACE FUNCTION platform.search_item_backfill(p_token text, p_after uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 5000, OUT rows_seen integer, OUT last_id uuid)
 RETURNS record
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
    perform platform._search_item_put('party', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.display_name::text), ''), 'Untitled entity' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), null::text, '{}'::text[], t.updated_at, null::text, null::text)
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
    perform platform._search_item_put('processed_document', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.name::text), ''), 'Untitled processed document' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), concat_ws(' · ', t.source_kind::text, t.origin_client::text), '{}'::text[], t.updated_at, t.source_kind::text, t.origin_client::text)
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
  when 'scope' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from context.scopes x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('scope', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.name::text), ''), 'Untitled scope' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), left(t.description::text, 140), '{}'::text[], t.updated_at, null::text, null::text)
       from context.scopes t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'scope' and si.entity_id = any(v_ids)
       and not exists (select 1 from context.scopes t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
  when 'scope_type' then
    select coalesce(array_agg(t.id order by t.id), '{}') into v_ids
      from (select x.id from context.scope_types x where (p_after is null or x.id > p_after)
             order by x.id limit v_limit) t;
    if cardinality(v_ids) = 0 then return; end if;
    perform platform._search_item_put('scope_type', t.id, t.organization_id, t.created_by, null::platform.visibility, coalesce(nullif(btrim(t.label_plural::text), ''), nullif(btrim(t.label_singular::text), ''), nullif(btrim(t.slug::text), ''), 'Untitled scope type' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), left(t.description::text, 140), '{}'::text[], t.updated_at, null::text, null::text)
       from context.scope_types t where t.id = any(v_ids) and t.organization_id is not null and t.deleted_at is null;
    delete from platform.search_item si
     where si.entity_token = 'scope_type' and si.entity_id = any(v_ids)
       and not exists (select 1 from context.scope_types t where t.id = si.entity_id and t.organization_id is not null and t.deleted_at is null);
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
    perform platform._search_item_put('studio_session', t.id, t.organization_id, t.created_by, t.visibility, coalesce(nullif(btrim(t.title::text), ''), 'Untitled audio session' || coalesce(' ' || to_char(t.created_at, 'YYYY-MM-DD'), '')), nullif(concat_ws(' · ', t.status::text), ''), '{}'::text[], t.updated_at, null::text, null::text)
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
$function$;
