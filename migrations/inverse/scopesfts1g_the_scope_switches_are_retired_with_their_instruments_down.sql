-- chair-step: INVERSE of migrations/campaign/scopesfts1g_the_scope_switches_are_retired_with_their_instruments.sql (lane FINISH-THE-SWITCH, FTS-1g): the two scope switches live again, their readiness/press branches and the three instruments back as they were.
-- lane: FINISH-THE-SWITCH (FTS-1g)
-- lock: platform

update platform.cutover_seam set retired_at = null where seam_key in ('agent_context', 'scopes_screens');

CREATE OR REPLACE FUNCTION platform._cutover_scope_own_words_back(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_types int; v_items int; v_scopes int;
  v_was text := custom._ctx_mark('bridge');
  v_skipped jsonb;
  c_statuses constant text[] := enum_range(null::public.context_item_status)::text[];
begin
  -- WHAT THE OLD TABLES WOULD REFUSE, named first and then left alone.
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_skipped from (
    select format('scope type %s: %s', t.id, string_agg(w, ', ')) as x
      from context.scope_types t join custom.record r on r.organization_id = p_org and r.id = t.id,
           lateral (select 'sort_order' w where r.data ? 'sort_order' and case when jsonb_typeof(r.data -> 'sort_order') = 'number' then abs((r.data ->> 'sort_order')::numeric) > 32767 else true end
                    union all select 'max_assignments_per_entity' where r.data ? 'max_assignments_per_entity' and case when jsonb_typeof(r.data -> 'max_assignments_per_entity') = 'number' then abs((r.data ->> 'max_assignments_per_entity')::numeric) > 32767 else true end) b
     where t.organization_id = p_org group by t.id
    union all
    select format('context field %s: %s', i.id, string_agg(w, ', '))
      from context.context_items i join context.scope_types t on t.id = i.scope_type_id and t.organization_id = p_org
      join custom.record r on r.organization_id = p_org and r.id = i.id,
           lateral (select 'description' w where char_length(r.data ->> 'description') > 500
                    union all select 'status' where r.data ? 'status' and not (r.data ->> 'status' = any (c_statuses))
                    union all select 'max_items' where r.data ? 'max_items' and case when jsonb_typeof(r.data -> 'max_items') = 'number' then (r.data ->> 'max_items')::numeric not between 1 and 2147483647 else true end
                    union all select 'allowed_scope_type_ids' where r.data ? 'allowed_scope_type_ids' and exists (
                        select 1 from jsonb_array_elements_text(r.data -> 'allowed_scope_type_ids') a
                         where a !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) b
     group by i.id
    union all
    select format('scope %s: %s', s.id, string_agg(w, ', '))
      from context.scopes s join custom.record r on r.organization_id = p_org and r.id = s.id,
           lateral (select 'slug' w where r.data ? 'slug' and coalesce(r.data ->> 'slug', '') !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
                    union all select 'sort_order' where r.data ? 'sort_order' and case when jsonb_typeof(r.data -> 'sort_order') = 'number' then abs((r.data ->> 'sort_order')::numeric) > 32767 else true end) b
     where s.organization_id = p_org group by s.id
  ) z;

  with kept as (
    select t.id, r.data as c
      from context.scope_types t
      join custom.record r on r.organization_id = p_org and r.id = t.id
     where t.organization_id = p_org
       and r.data ?| array['description', 'sort_order', 'max_assignments_per_entity', 'default_variable_keys']
       and not exists (select 1 from jsonb_array_elements_text(v_skipped) x where x like 'scope type ' || t.id::text || ':%')
  ), want as (
    select k.id,
           case when k.c ? 'description' then k.c ->> 'description' end as description,
           case when jsonb_typeof(k.c -> 'sort_order') = 'number' and abs((k.c ->> 'sort_order')::numeric) <= 32767
                then (k.c ->> 'sort_order')::numeric::smallint end as sort_order,
           case when jsonb_typeof(k.c -> 'max_assignments_per_entity') = 'number' and abs((k.c ->> 'max_assignments_per_entity')::numeric) <= 32767
                then (k.c ->> 'max_assignments_per_entity')::numeric::smallint end as max_a,
           case when k.c ? 'default_variable_keys' then array(select jsonb_array_elements_text(k.c -> 'default_variable_keys')) end as dvk,
           k.c
      from kept k
  )
  update context.scope_types t
     set description = case when w.c ? 'description' then w.description else t.description end,
         sort_order  = case when w.c ? 'sort_order' then w.sort_order else t.sort_order end,
         max_assignments_per_entity = case when w.c ? 'max_assignments_per_entity' then w.max_a else t.max_assignments_per_entity end,
         default_variable_keys = case when w.c ? 'default_variable_keys' then w.dvk else t.default_variable_keys end
    from want w
   where t.id = w.id
     and ((w.c ? 'description' and t.description is distinct from w.description)
       or (w.c ? 'sort_order' and t.sort_order is distinct from w.sort_order)
       or (w.c ? 'max_assignments_per_entity' and t.max_assignments_per_entity is distinct from w.max_a)
       or (w.c ? 'default_variable_keys' and t.default_variable_keys is distinct from w.dvk));
  get diagnostics v_types = row_count;

  with kept as (
    select i.id, r.data as c
      from context.context_items i
      join context.scope_types t on t.id = i.scope_type_id and t.organization_id = p_org
      join custom.record r on r.organization_id = p_org and r.id = i.id
     where r.data ?| array['description', 'status', 'status_note', 'category', 'tags', 'max_items', 'custom_component',
                           'reference_source', 'allowed_scope_type_ids', 'allowed_reference_types']
       and not exists (select 1 from jsonb_array_elements_text(v_skipped) x where x like 'context field ' || i.id::text || ':%')
  ), want as (
    select k.id, k.c,
           k.c ->> 'description' as description,
           -- Every cast is guarded as well as filtered: the planner may compute a column before it
           -- applies the filter that named the row (a status not among the fifteen would abort the press).
           case when k.c ->> 'status' = any (c_statuses) then (k.c ->> 'status')::public.context_item_status end as status,
           k.c ->> 'status_note' as status_note,
           k.c ->> 'category' as category,
           case when k.c ? 'tags' then array(select jsonb_array_elements_text(k.c -> 'tags')) end as tags,
           case when jsonb_typeof(k.c -> 'max_items') = 'number' and (k.c ->> 'max_items')::numeric between 1 and 2147483647
                then (k.c ->> 'max_items')::numeric::int end as max_items,
           case when k.c ? 'allowed_scope_type_ids' then array(
             select (case when a ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then a end)::uuid
               from jsonb_array_elements_text(k.c -> 'allowed_scope_type_ids') a) end as ast,
           case when k.c ? 'allowed_reference_types' then array(select jsonb_array_elements_text(k.c -> 'allowed_reference_types')) end as art
      from kept k
  )
  update context.context_items i
     set description = case when w.c ? 'description' then w.description else i.description end,
         status      = case when w.c ? 'status' then w.status else i.status end,
         status_note = case when w.c ? 'status_note' then w.status_note else i.status_note end,
         category    = case when w.c ? 'category' then w.category else i.category end,
         tags        = case when w.c ? 'tags' then w.tags else i.tags end,
         max_items   = case when w.c ? 'max_items' then w.max_items else i.max_items end,
         custom_component = case when w.c ? 'custom_component' then w.c -> 'custom_component' else i.custom_component end,
         reference_source = case when w.c ? 'reference_source' then w.c -> 'reference_source' else i.reference_source end,
         allowed_scope_type_ids  = case when w.c ? 'allowed_scope_type_ids' then w.ast else i.allowed_scope_type_ids end,
         allowed_reference_types = case when w.c ? 'allowed_reference_types' then w.art else i.allowed_reference_types end
    from want w
   where i.id = w.id
     and ((w.c ? 'description' and i.description is distinct from w.description)
       or (w.c ? 'status' and i.status is distinct from w.status)
       or (w.c ? 'status_note' and i.status_note is distinct from w.status_note)
       or (w.c ? 'category' and i.category is distinct from w.category)
       or (w.c ? 'tags' and i.tags is distinct from w.tags)
       or (w.c ? 'max_items' and i.max_items is distinct from w.max_items)
       or (w.c ? 'custom_component' and i.custom_component is distinct from w.c -> 'custom_component')
       or (w.c ? 'reference_source' and i.reference_source is distinct from w.c -> 'reference_source')
       or (w.c ? 'allowed_scope_type_ids' and i.allowed_scope_type_ids is distinct from w.ast)
       or (w.c ? 'allowed_reference_types' and i.allowed_reference_types is distinct from w.art));
  get diagnostics v_items = row_count;

  with kept as (
    select s.id, r.data as c
      from context.scopes s
      join custom.record r on r.organization_id = p_org and r.id = s.id
     where s.organization_id = p_org
       and r.data ?| array['slug', 'sort_order']
       and not exists (select 1 from jsonb_array_elements_text(v_skipped) x where x like 'scope ' || s.id::text || ':%')
  )
  , want as (
    select k.id, k.c, k.c ->> 'slug' as slug,
           case when jsonb_typeof(k.c -> 'sort_order') = 'number' and abs((k.c ->> 'sort_order')::numeric) <= 32767
                then (k.c ->> 'sort_order')::numeric::smallint end as sort_order
      from kept k
  )
  update context.scopes s
     set slug       = case when w.c ? 'slug' then w.slug else s.slug end,
         sort_order = case when w.c ? 'sort_order' then w.sort_order else s.sort_order end
    from want w
   where s.id = w.id
     and ((w.c ? 'slug' and s.slug is distinct from w.slug)
       or (w.c ? 'sort_order' and s.sort_order is distinct from w.sort_order));
  get diagnostics v_scopes = row_count;

  perform custom._ctx_mark(v_was);
  return jsonb_build_object('scope_types', v_types, 'context_fields', v_items, 'scopes', v_scopes,
                            'not_carried', v_skipped);
end;
$function$
;

CREATE OR REPLACE FUNCTION platform.cutover_scope_rows_copied(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
-- SCOPES-ROWS-COPIED (2026-09-28). Every live row of the older scope tables that has no live twin in
-- the record store, BY ID, per kind, for one organization — read over the owner's connection (the
-- switch's readiness runs inside its SECURITY DEFINER doors, context_parity.py over the server's own
-- connection; no client role may call it), so no person's seat decides what is counted. The five kinds: scope types (their Table), context items
-- (their Field), scopes, Tag scopes among them (their Record), current values (the Record's current
-- source names that very old value row — the SC-2' provenance rule, the same one the nightly raw
-- parity applies), and "<kind> -> scope" tags (the store holds the same two ends as a record edge).
-- Reads only. Examples name the organization and the scope type, first five.
declare
  v_org_name text;
  v_types bigint := 0; v_items bigint := 0; v_scopes bigint := 0; v_tag_scopes bigint := 0;
  v_values bigint := 0; v_tags bigint := 0;
  l_types bigint := 0; l_items bigint := 0; l_scopes bigint := 0; l_values bigint := 0; l_tags bigint := 0;
  v_by_type jsonb := '[]'::jsonb;
  v_examples jsonb := '[]'::jsonb;
  g record;
begin
  if p_org is null then
    raise exception 'platform.cutover_scope_rows_copied: name the organization whose scope rows to count'
      using errcode = '22004';
  end if;
  select o.name into v_org_name from iam.organizations o where o.id = p_org;

  for g in
    with lt as (
      select t.id, coalesce(nullif(btrim(t.label_plural), ''), t.slug, 'Untitled scope type') as name,
             (t.slug = 'tag') as is_tag,
             exists (select 1 from custom.record r
                      where r.organization_id = p_org and r.id = t.id
                        and r.data_class = 'table' and r.deleted_at is null) as held
        from context.scope_types t
       where t.organization_id = p_org and t.deleted_at is null
    ), li as (
      select i.id, i.scope_type_id,
             exists (select 1 from custom.record f
                      where f.organization_id = p_org and f.id = i.id
                        and f.data_class = 'field' and f.deleted_at is null) as held
        from context.context_items i join lt on lt.id = i.scope_type_id
       where i.deleted_at is null and i.is_active
    ), ls as (
      select s.id, s.scope_type_id, r.data as rdata
        from context.scopes s
        join lt on lt.id = s.scope_type_id
        left join custom.record r
          on r.organization_id = p_org and r.id = s.id and r.data_class = 'record' and r.deleted_at is null
       where s.organization_id = p_org and s.deleted_at is null
    ), cv as (
      select v.id, ls.scope_type_id,
             coalesce(ls.rdata -> '_sources'
                        -> (ls.rdata -> '_values' -> (f.data ->> 'key') ->> 'src')
                        ->> 'old_value_id', '') = v.id::text as held
        from context.context_item_values v
        join ls on ls.id = v.scope_id
        join li on li.id = v.context_item_id
        left join custom.record f
          on f.organization_id = p_org and f.id = v.context_item_id and f.data_class = 'field'
       where v.is_current
    ), tg as (
      select o.target_id, ls.scope_type_id,
             exists (select 1 from platform.associations e
                      where e.target_type in ('record', 'custom_record') and e.target_id = o.target_id
                        and e.source_type = o.source_type and e.source_id = o.source_id
                        and e.deleted_at is null) as held
        from (select distinct a.source_type, a.source_id, a.target_id
                from platform.associations a
               where a.target_type = 'scope' and a.deleted_at is null
                 and a.target_id in (select id from ls)) o
        join ls on ls.id = o.target_id
    )
    select lt.id, lt.name, lt.is_tag, lt.held,
           (select count(*) from li where li.scope_type_id = lt.id) as items,
           (select count(*) from li where li.scope_type_id = lt.id and not li.held) as items_missing,
           (select count(*) from ls where ls.scope_type_id = lt.id) as scopes,
           (select count(*) from ls where ls.scope_type_id = lt.id and ls.rdata is null) as scopes_missing,
           (select count(*) from cv where cv.scope_type_id = lt.id) as vals,
           (select count(*) from cv where cv.scope_type_id = lt.id and not cv.held) as values_missing,
           (select count(*) from tg where tg.scope_type_id = lt.id) as tags,
           (select count(*) from tg where tg.scope_type_id = lt.id and not tg.held) as tags_missing
      from lt
     order by lt.name, lt.id
  loop
    l_types := l_types + 1; l_items := l_items + g.items; l_scopes := l_scopes + g.scopes;
    l_values := l_values + g.vals; l_tags := l_tags + g.tags;
    v_types := v_types + case when g.held then 0 else 1 end;
    v_items := v_items + g.items_missing;
    v_scopes := v_scopes + g.scopes_missing;
    v_tag_scopes := v_tag_scopes + case when g.is_tag then g.scopes_missing else 0 end;
    v_values := v_values + g.values_missing;
    v_tags := v_tags + g.tags_missing;
    if not g.held or g.items_missing + g.scopes_missing + g.values_missing + g.tags_missing > 0 then
      v_by_type := v_by_type || jsonb_build_object(
        'scope_type_id', g.id, 'scope_type', g.name, 'is_tag', g.is_tag, 'table_missing', not g.held,
        'items', g.items, 'items_missing', g.items_missing,
        'scopes', g.scopes, 'scopes_missing', g.scopes_missing,
        'values', g.vals, 'values_missing', g.values_missing,
        'tags', g.tags, 'tags_missing', g.tags_missing);
      if jsonb_array_length(v_examples) < 5 then
        v_examples := v_examples || to_jsonb(
          format('%s → %s: ', coalesce(v_org_name, p_org::text), g.name)
          || array_to_string(array_remove(array[
               case when not g.held then 'the scope type has no table' end,
               case when g.scopes_missing > 0 then format('%s of %s scopes %s no record', g.scopes_missing, g.scopes,
                                                          case when g.scopes_missing = 1 then 'has' else 'have' end) end,
               case when g.items_missing > 0 then format('%s of %s context items %s no field', g.items_missing, g.items,
                                                         case when g.items_missing = 1 then 'has' else 'have' end) end,
               case when g.values_missing > 0 then format('%s of %s current values %s not on the copy', g.values_missing, g.vals,
                                                          case when g.values_missing = 1 then 'is' else 'are' end) end,
               case when g.tags_missing > 0 then format('%s of %s tags %s no copy', g.tags_missing, g.tags,
                                                        case when g.tags_missing = 1 then 'has' else 'have' end) end
             ], null), ', '));
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'organization_id', p_org,
    'organization', v_org_name,
    'count', v_types + v_items + v_scopes + v_values + v_tags,
    'by_kind', jsonb_build_object(
      'scope_types', v_types, 'context_items', v_items, 'scopes', v_scopes, 'tag_scopes', v_tag_scopes,
      'current_values', v_values, 'tag_edges', v_tags),
    'live', jsonb_build_object(
      'scope_types', l_types, 'context_items', l_items, 'scopes', l_scopes,
      'current_values', l_values, 'tag_edges', l_tags),
    'by_type', v_by_type,
    'examples', v_examples,
    'measured_at', now());
end;
$function$
;

CREATE OR REPLACE FUNCTION platform.cutover_scope_own_words(p_org uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  with pairs as (
    select 'type'::text as kind, coalesce(nullif(t.label_plural, ''), t.label_singular) as what,
           custom._ctx_own_words('type', to_jsonb(t)) as said,
           coalesce((select jsonb_object_agg(e.key, e.value) from jsonb_each(r.data) e
                      where e.key in ('description', 'sort_order', 'max_assignments_per_entity', 'default_variable_keys')), '{}'::jsonb) as kept
      from context.scope_types t
      join custom.record r on r.organization_id = p_org and r.id = t.id and r.deleted_at is null
     where t.organization_id = p_org and t.deleted_at is null
    union all
    select 'field', coalesce(nullif(t.label_plural, ''), t.label_singular) || ' · ' || coalesce(nullif(i.display_name, ''), i.key),
           custom._ctx_own_words('item', to_jsonb(i)),
           coalesce((select jsonb_object_agg(e.key, e.value) from jsonb_each(r.data) e
                      where e.key in ('description', 'status', 'status_note', 'category', 'tags', 'max_items', 'custom_component',
                                      'reference_source', 'allowed_scope_type_ids', 'allowed_reference_types')), '{}'::jsonb)
      from context.context_items i
      join context.scope_types t on t.id = i.scope_type_id and t.organization_id = p_org and t.deleted_at is null
      join custom.record r on r.organization_id = p_org and r.id = i.id and r.deleted_at is null
     where i.deleted_at is null
    union all
    select 'scope', coalesce(nullif(t.label_singular, ''), 'Scope') || ' · ' || s.name,
           custom._ctx_own_words('scope', to_jsonb(s)),
           coalesce((select jsonb_object_agg(e.key, e.value) from jsonb_each(r.data) e where e.key in ('slug', 'sort_order')), '{}'::jsonb)
      from context.scopes s
      join context.scope_types t on t.id = s.scope_type_id and t.deleted_at is null
      join custom.record r on r.organization_id = p_org and r.id = s.id and r.deleted_at is null
     where s.organization_id = p_org and s.deleted_at is null
  ), differ as (
    select kind, what,
           (select string_agg(k, ', ' order by k) from (select jsonb_object_keys(said) k union select jsonb_object_keys(kept)) ks
             where said -> k is distinct from kept -> k) as words
      from pairs where said is distinct from kept
  )
  select jsonb_build_object(
    'count', (select count(*) from differ),
    'by_kind', jsonb_build_object('types', (select count(*) from differ where kind = 'type'),
                                  'fields', (select count(*) from differ where kind = 'field'),
                                  'scopes', (select count(*) from differ where kind = 'scope')),
    'examples', coalesce((select jsonb_agg(x) from (select format('%s (%s)', what, words) as x from differ
                                                     order by case kind when 'type' then 0 when 'field' then 1 else 2 end, what limit 5) s), '[]'::jsonb))
$function$
;

CREATE OR REPLACE FUNCTION platform._cutover_seam_readiness(p_seam text, p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  s platform.cutover_seam;
  v_checks jsonb := '[]'::jsonb;
  v_n bigint; v_c bigint; v_missing bigint; v_stale bigint; v_lag bigint;
  v_tn bigint; v_tc bigint; v_sn bigint; v_sc bigint; v_in bigint; v_ic bigint;
  v_names text;
  v_pre jsonb;
  v_count jsonb;
  v_any bigint; v_hooks bigint;
  v_ev jsonb;
  v_diff jsonb;
  v_part jsonb;
  v_rest text;
  v_ln bigint; v_lc bigint; v_lmiss bigint; v_lnames text;
  v_rm jsonb; v_rmn bigint;
begin
  select * into s from platform.cutover_seam where seam_key = p_seam and retired_at is null;
  if s.seam_key is null then
    return jsonb_build_object('ready', false, 'checked_at', now(), 'checks', jsonb_build_array(
      jsonb_build_object('key', 'known', 'says', 'This switch exists', 'met', false,
                         'detail', format('There is no switch called %s.', p_seam))));
  end if;

  if s.press_kind = 'platform_switch' then
    return jsonb_build_object('ready', false, 'checked_at', now(), 'checks', jsonb_build_array(
      jsonb_build_object('key', 'pressed_here', 'says', 'Switched for one organization', 'met', false,
                         'detail', 'This one switches for everyone at once, in its own rehearsed step, not from an organization''s settings.')));
  elsif s.press_kind = 'already_switched' then
    return jsonb_build_object('ready', false, 'checked_at', now(), 'checks', jsonb_build_array(
      jsonb_build_object('key', 'already', 'says', 'Already on the new system', 'met', true,
                         'detail', s.flip_does)));
  end if;

  if p_seam = 'older_tables' then
    -- ONE COUNT, shared with the mover's census (lane CUTOVER-CENSUS): the organization's live
    -- older tables against their live same-id copies; archived older tables and the option lists
    -- the app keeps are never counted on either side.
    v_count := platform.cutover_tables_copied(p_org);
    v_n := (v_count ->> 'older_live')::bigint;
    v_c := (v_count ->> 'copied')::bigint;
    v_missing := (v_count ->> 'rows_missing')::bigint;
    v_stale := (v_count ->> 'rows_stale')::bigint;
    select string_agg(x, ', ' order by x) into v_names
      from jsonb_array_elements_text(v_count -> 'not_yet') x;

    -- MOVER-CARRY-TAILS: every check of this switch says how many of its differences copying again
    -- clears (copy_again_clears) and how many it leaves (copy_again_leaves); the settings card offers
    -- "Copy again" only when one unmet check has something it clears, and each sentence says what to
    -- do about the rest instead.
    v_checks := v_checks || jsonb_build_object(
      'key', 'copied', 'says', 'Every table is copied into the new system', 'met', v_c = v_n,
      'copy_again_clears', greatest(v_n - v_c, 0), 'copy_again_leaves', 0,
      'detail', case when v_n = 0 then 'This organization has no older tables left.'
                     else format('%s of %s tables copied.', v_c, v_n)
                          || case when v_c < v_n then ' Not yet: ' || v_names || case when v_n - v_c > 5 then format(' and %s more', v_n - v_c - 5) else '' end || '.' else '' end end);

    -- LISTS-AFTER-SWITCH: the press archives the organization's live older pick lists too, and
    -- refuses (rolled back whole) when a list's Table-of-choices copy or any live choice is not in
    -- the store. Said here, before the press, with Copy again offered to bring them.
    -- The older pick-list tables (workbench.udt_structured_lists / _items) were dropped 2026-10-05:
    -- no organization has an older pick list left, so there is nothing to copy.
    v_ln := 0; v_lc := 0; v_lmiss := 0; v_lnames := null;

    v_checks := v_checks || jsonb_build_object(
      'key', 'lists_copied', 'says', 'Every pick list is copied into the new system',
      'met', v_lc = v_ln and v_lmiss = 0,
      'copy_again_clears', greatest(v_ln - v_lc, 0) + v_lmiss, 'copy_again_leaves', 0,
      'detail', case when v_ln = 0 then 'This organization has no older pick lists left.'
                     when v_lc = v_ln and v_lmiss = 0 then format('%s of %s pick lists copied, every choice in its copy.', v_lc, v_ln)
                     else format('%s of %s pick lists copied.', v_lc, v_ln)
                          || case when v_lnames is not null then ' Not yet: ' || v_lnames || '.' else '' end
                          || case when v_lmiss > 0 then format(' %s choices are not in their copies yet.', v_lmiss) else '' end
                          || ' Copying again brings them.' end);

    -- MOVER-DELETIONS: what the older side REMOVED since the copy — a row, a column, a list's choice,
    -- a whole table or list — that its copy still holds, and what the rerun archived whose older
    -- original is back. The rerun (platform.cutover_carry_removals) archives each on the copy, never a
    -- hard delete; until it runs, the switch would bring each one back to life.
    v_rm := platform.cutover_older_removals(p_org);
    v_rmn := coalesce((v_rm ->> 'count')::bigint, 0);
    v_checks := v_checks || jsonb_build_object(
      'key', 'removals_carried', 'says', 'Nothing removed from an older table or list is still on its copy',
      'met', v_rmn = 0, 'counts', v_rm -> 'by_kind',
      'copy_again_clears', v_rmn, 'copy_again_leaves', 0,
      'detail', case when v_rmn = 0
                     then 'Every row, column, choice, table and list removed on the older side is gone from its copy too, and no copy has a choice its older list never had.'
                     else format('%s %s the older side does not have %s still on the copies: %s. Copying again archives %s on the copies (restorable, never deleted).',
                                 v_rmn, case when v_rmn = 1 then 'thing' else 'things' end,
                                 case when v_rmn = 1 then 'is' else 'are' end,
                                 (select string_agg(x, '; ') from jsonb_array_elements_text(v_rm -> 'examples') x)
                                   || case when v_rmn > 5 then format(' and %s more', v_rmn - 5) else '' end,
                                 case when v_rmn = 1 then 'it' else 'them' end) end);

    v_checks := v_checks
      || jsonb_build_object('key', 'rows_present', 'says', 'No row is missing from a copy',
           'met', v_missing = 0, 'copy_again_clears', v_missing, 'copy_again_leaves', 0,
           'detail', case when v_missing = 0 then 'Every row of every copied table is in its copy.'
                          else format('%s rows are not in their copies yet. Copying the table again brings them.', v_missing) end)
      || jsonb_build_object('key', 'rows_current', 'says', 'No row was edited in an older table after it was copied',
           'met', v_stale = 0, 'copy_again_clears', v_stale, 'copy_again_leaves', 0,
           'detail', case when v_stale = 0 then 'Every copy is as current as its older table.'
                          else format('%s rows were edited in the older tables after they were copied. Copying again brings the edits.', v_stale) end);

    -- WHAT THE COPIES WOULD SHOW DIFFERENTLY (CUTOVER-READINESS). The rows checks above never looked
    -- at a table's colours, its columns' checks and formats, or who it is shared with, so the switch
    -- could show a copy that looks, refuses and opens differently from the older table while saying
    -- "ready". Each is compared here as the switch will leave the copy, and each difference is named.
    v_diff := platform.cutover_copy_differences(p_org);
    foreach v_rest in array array['colours', 'checks', 'formats', 'shares'] loop
      v_part := coalesce(v_diff -> v_rest, '{}'::jsonb);
      v_checks := v_checks || jsonb_build_object(
        'key', v_rest || '_match',
        'says', case v_rest when 'colours' then 'Every copy shows the colours its older table shows'
                            when 'checks' then 'No copy refuses a write its older table takes'
                            when 'formats' then 'Every column means on its copy what it means on its older table'
                            else 'Every copy is shared exactly as its older table' end,
        'met', coalesce((v_part ->> 'count')::int, 0) = 0,
        'counts', v_diff -> v_rest,
        'copy_again_clears', coalesce((v_part ->> 'clears')::int, 0),
        'copy_again_leaves', greatest(coalesce((v_part ->> 'count')::int, 0) - coalesce((v_part ->> 'clears')::int, 0), 0),
        'detail', platform.cutover_difference_sentence(v_rest, v_part));
    end loop;

    -- WHAT THE SWITCH REPLACES FIRST (COPY-WRITABLE). People may test the copies while the switch
    -- is off; the switch puts every row they changed back to the older table's version and
    -- archives the rows they added, and logs the counts. Always met: it is what the press does,
    -- said before it is pressed.
    v_ev := v_count -> 'evaluation';
    v_checks := v_checks
      || jsonb_build_object('key', 'test_edits_replaced', 'says', 'Test edits on the copies are replaced by the older tables first',
           'met', true,
           'counts', v_ev,
           'detail', case when coalesce((v_ev ->> 'rows')::bigint, 0) = 0
                          then 'Nobody has changed a copy while testing; nothing is replaced.'
                          else format('%s %s changed while testing, in %s %s: %s edited %s put back to the older table''s version, %s added %s archived (never deleted), %s table or column %s put back. Each table''s counts are kept in a log.',
                                      v_ev ->> 'rows', case when (v_ev ->> 'rows')::bigint = 1 then 'row was' else 'rows were' end,
                                      v_ev ->> 'tables', case when (v_ev ->> 'tables')::bigint = 1 then 'table' else 'tables' end,
                                      v_ev ->> 'edited', case when (v_ev ->> 'edited')::bigint = 1 then 'row is' else 'rows are' end,
                                      v_ev ->> 'added', case when (v_ev ->> 'added')::bigint = 1 then 'row is' else 'rows are' end,
                                      v_ev ->> 'settings', case when (v_ev ->> 'settings')::bigint = 1 then 'setting is' else 'settings are' end) end);

    -- What the switch cannot carry by itself (CUTOVER-PLAN D8, F19): an automation on "any older
    -- table" names no table to follow, and an outbound webhook subscribed to older row events has
    -- no copy to listen to. Either would go silent at the switch, so each holds it back, named.
    select count(*) into v_any from scheduler.sch_trigger t
     where t.organization_id = p_org and t.deleted_at is null and t.enabled and t.type = 'event'
       and t.config ->> 'entity_type' = 'user_table_row' and coalesce(t.config ->> 'table_id', '') = '';
    select count(*) into v_hooks from files.webhooks w
     where w.organization_id = p_org and w.is_active
       and w.event_types && array['row.created','row.updated','row.deleted','row.archived','row.restored']::text[];
    v_checks := v_checks
      || jsonb_build_object('key', 'automations_follow', 'says', 'Every "when a row changes" automation names its table',
           'met', v_any = 0, 'copy_again_clears', 0, 'copy_again_leaves', v_any,
           'detail', case when v_any = 0 then 'Each one moves to its table''s copy at the switch and back with Switch back.'
                          else format('%s automations run on a change to any older table. Pick the table each one watches first, so it can follow it.', v_any) end)
      || jsonb_build_object('key', 'webhooks_follow', 'says', 'No outbound webhook listens for older-table row changes',
           'met', v_hooks = 0, 'copy_again_clears', 0, 'copy_again_leaves', v_hooks,
           'detail', case when v_hooks = 0 then 'Nothing outside the platform is waiting on older-table changes.'
                          else format('%s outbound webhooks still listen for older-table row changes. Point each at its table''s changes in the new system first.', v_hooks) end);

  elsif p_seam = 'agent_context' then
    select count(*), count(*) filter (where r.id is not null and r.deleted_at is null)
      into v_tn, v_tc
      from context.scope_types t
      left join custom.record r on r.organization_id = p_org and r.id = t.id
     where t.organization_id = p_org and t.deleted_at is null;
    select count(*), count(*) filter (where r.id is not null and r.deleted_at is null)
      into v_sn, v_sc
      from context.scopes x
      join context.scope_types t on t.id = x.scope_type_id and t.deleted_at is null
      left join custom.record r on r.organization_id = p_org and r.id = x.id
     where x.organization_id = p_org and x.deleted_at is null;
    select count(*), count(*) filter (where r.id is not null and r.deleted_at is null)
      into v_in, v_ic
      from context.context_items i
      join context.scope_types t on t.id = i.scope_type_id and t.deleted_at is null
      left join custom.record r on r.organization_id = p_org and r.id = i.id
     where t.organization_id = p_org and i.deleted_at is null and i.is_active;

    v_checks := v_checks || jsonb_build_object(
      'key', 'copied', 'says', 'Every scope type, scope and context field is copied',
      'met', v_tc = v_tn and v_sc = v_sn and v_ic = v_in,
      'detail', case when v_tn = 0 then 'This organization has no scopes.'
                     else format('%s of %s scope types, %s of %s scopes, %s of %s context fields copied.',
                                 v_tc, v_tn, v_sc, v_sn, v_ic, v_in) end);

    select count(*) into v_lag
      from custom.io_outbox x
     where x.organization_id = p_org and x.event_key = 'context.follow'
       and not custom.io_outbox_consumed_by(x.id, 'context-follow', x.consumed_at) and x.deleted_at is null;

    v_checks := v_checks || jsonb_build_object(
      'key', 'follow_current', 'says', 'No edit is waiting to be copied', 'met', v_lag = 0,
      'detail', case when v_lag = 0 then 'The copy has every edit made in the current screens.'
                     else format('%s edits made in the current screens are waiting for the copy.', v_lag) end);
  end if;

  if p_seam = 'scopes_screens' then
    -- SCOPES-ROWS-COPIED (2026-09-28). (−1) EVERY ROW IS IN THE STORE, BY ID, COUNTED AS THE OWNER. The
    -- parity check below is a compare through a test seat, and a seat sees only the organizations it
    -- belongs to: Titanium's 843 Tag scopes with no Record read as "0 defects" and ready. This counts
    -- every live older row with no live store twin — scope types, context items, scopes (Tag scopes
    -- named apart), current values and "<kind> -> scope" tags — for this organization, whoever asks.
    v_part := platform.cutover_scope_rows_copied(p_org);
    v_rmn := coalesce((v_part ->> 'count')::bigint, 0);
    v_checks := v_checks || jsonb_build_object(
      'key', 'rows_copied', 'says', 'Every scope row is in the new system',
      'met', v_rmn = 0, 'counts', v_part -> 'by_kind',
      'copy_again_clears', v_rmn, 'copy_again_leaves', 0,
      'measured_at', v_part -> 'measured_at',
      'detail', case when v_rmn = 0
                     then format('Every scope type, context field, scope, current value and tag is in the new system (%s scopes, %s tags counted by id).',
                                 v_part -> 'live' ->> 'scopes', v_part -> 'live' ->> 'tag_edges')
                     else (select string_agg(x, '; ') from jsonb_array_elements_text(v_part -> 'examples') x)
                          || case when jsonb_array_length(v_part -> 'by_type') > 5
                                  then format(' and %s more scope types', jsonb_array_length(v_part -> 'by_type') - 5) else '' end
                          || '. Copying again brings them.' end);
    -- SCOPES-TAILS. (0) EVERY WORD A SCOPE TYPE OR A CONTEXT FIELD SAYS ABOUT ITSELF IS ON ITS COPY: a
    -- type's description and sort order, a field's category, tags and status note. Copying again
    -- brings each one; Switch back carries the copy's words back to the current screens.
    v_part := platform.cutover_scope_own_words(p_org);
    v_rmn := coalesce((v_part ->> 'count')::bigint, 0);
    v_checks := v_checks || jsonb_build_object(
      'key', 'own_words_copied', 'says', 'Every scope type''s, context field''s and scope''s own words are on its copy',
      'met', v_rmn = 0, 'counts', v_part -> 'by_kind',
      'copy_again_clears', v_rmn, 'copy_again_leaves', 0,
      'detail', case when v_rmn = 0
                     -- SCOPES-STORE-HOMES: every word the old screens read, at its home in the store.
                     then 'Every scope type''s description, order, assignment limit and suggested variables; every context field''s description, status, status note, category, tags, item limit, custom component, dataset source and allowed types; and every scope''s slug and order is on its copy.'
                     else format('%s %s what the current screens show: %s. Copying again brings %s.',
                                 v_rmn, case when v_rmn = 1 then 'copy does not say' else 'copies do not say' end,
                                 (select string_agg(x, '; ') from jsonb_array_elements_text(v_part -> 'examples') x)
                                   || case when v_rmn > 5 then format(' and %s more', v_rmn - 5) else '' end,
                                 case when v_rmn = 1 then 'it' else 'them' end) end);
    -- SCOPES-WRITE-THROUGH. (1) THE COPY HAS EVERY EDIT: no follow row waiting for this organization.
    select count(*) into v_lag
      from custom.io_outbox x
     where x.organization_id = p_org and x.event_key = 'context.follow'
       and not custom.io_outbox_consumed_by(x.id, 'context-follow', x.consumed_at) and x.deleted_at is null;
    v_checks := v_checks || jsonb_build_object(
      'key', 'follow_current', 'says', 'No edit is waiting to be copied', 'met', v_lag = 0,
      'detail', case when v_lag = 0 then 'The copy has every edit made in the current screens.'
                     else format('%s edits made in the current screens are waiting for the copy.', v_lag) end);
    -- (2) PARITY: the newest context parity run for this organization found no defect, and nothing
    -- changed in its scopes after that run.
    declare
      m platform.cutover_seam_measure;
      v_changed timestamptz;
    begin
      -- NOTHING TO COMPARE IS MET (found by lane FINAL-SWITCH's rehearsal): an organization with no
      -- live scope type hands every agent nothing on both systems, so there is no parity to measure,
      -- and the switch must never hold it for want of a measurement.
      if not exists (select 1 from context.scope_types t where t.organization_id = p_org and t.deleted_at is null) then
        v_checks := v_checks || jsonb_build_object(
          'key', 'parity', 'says', 'Agents are handed the same context by both systems', 'met', true,
          'detail', 'This organization has no scopes: both systems hand an agent nothing, so there is nothing to compare.');
      else
      select * into m from platform.cutover_seam_measure x
       where x.seam_key = 'scopes_screens' and x.organization_id = p_org and x.key = 'parity'
       order by x.measured_at desc limit 1;
      select greatest(
               (select max(t.updated_at) from context.scope_types t where t.organization_id = p_org),
               (select max(sc.updated_at) from context.scopes sc where sc.organization_id = p_org),
               (select max(i.updated_at) from context.context_items i join context.scope_types t on t.id = i.scope_type_id where t.organization_id = p_org),
               (select max(v.created_at) from context.context_item_values v join context.scopes sc on sc.id = v.scope_id where sc.organization_id = p_org))
        into v_changed;
      v_checks := v_checks || jsonb_build_object(
        'key', 'parity', 'says', 'Agents are handed the same context by both systems',
        'met', m.id is not null and m.met and (v_changed is null or m.measured_at >= v_changed),
        'measured_at', m.measured_at,
        'detail', case when m.id is null
                         then 'Not measured yet for this organization: uv run python scripts/context_parity.py --organization ' || p_org::text || ' --record (aidream).'
                       when not m.met then m.says
                       when v_changed is not null and m.measured_at < v_changed
                         then format('Measured %s, but this organization''s scopes changed after that (%s); measure again.', m.measured_at, v_changed)
                       else m.says end);
      end if;
    end;
  end if;

  for v_pre in select * from jsonb_array_elements(s.prerequisites) loop
    v_checks := v_checks || jsonb_build_object(
      'key', v_pre ->> 'key', 'says', v_pre ->> 'says',
      'met', coalesce((v_pre ->> 'met')::boolean, false),
      'detail', v_pre ->> 'evidence',
      -- When a measured fact was last measured (the census writes it; every release re-runs it).
      'measured_at', v_pre ->> 'measured_at');
  end loop;

  return jsonb_build_object(
    'ready', not exists (select 1 from jsonb_array_elements(v_checks) c where not (c ->> 'met')::boolean),
    'checked_at', now(),
    'checks', v_checks);
end;
$function$
;

CREATE OR REPLACE FUNCTION platform._cutover_seam_apply(p_seam text, p_org uuid, p_to text, p_actor uuid, p_press uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_feature text; v_key text;
  v_before jsonb;
  v_last platform.cutover_seam_press;
  v_ids uuid[] := '{}';
  v_id uuid;
  v_w jsonb;
  v_t record;
  v_rekeyed jsonb := '[]'::jsonb;
  v_cfg jsonb;
  v_resynced jsonb := '[]'::jsonb;
  v_lists uuid[] := '{}';
  v_note text := format('switched %s on the organization''s settings page (press %s)', p_to, p_press);
begin
  if p_seam = 'older_tables' then
    v_feature := 'data_tables'; v_key := 'older_tables_moved';
  elsif p_seam = 'agent_context' then
    v_feature := 'custom'; v_key := 'agent_context_reads_the_copy';
  elsif p_seam = 'scopes_screens' then
    -- SCOPES-WRITE-THROUGH: which system writes this organization's scopes. Both sides are equal at
    -- every commit, so either direction is the setting and nothing else.
    v_feature := 'custom'; v_key := 'scopes_written_in_the_store';
    -- SWITCH BACK CARRIES THE COPY'S OWN WORDS BACK (lane SCOPES-TAILS): a scope type's description or
    -- sort order, a field's category, tags or status note that the copy says and the current screens
    -- do not are written back first. Only a word the copy HAS is carried; a copy that says nothing
    -- never erases what the screens show.
    if p_to = 'old' then
      v_cfg := platform._cutover_scope_own_words_back(p_org);
    end if;
    select o.value into v_before from platform.knob_override o
     where o.feature = v_feature and o.key = v_key and o.scope_kind = 'organization'
       and o.scope_id = p_org and o.organization_id = p_org;
    v_w := platform._knob_override_write(v_feature, v_key, 'organization', p_org, p_org,
                                         case when p_to = 'new' then 'true'::jsonb else 'false'::jsonb end, v_note, p_actor);
    if not coalesce((v_w ->> 'ok')::boolean, false) then
      raise exception 'the setting %.% could not be written: %', v_feature, v_key, v_w::text using errcode = '22023';
    end if;
    return jsonb_build_object('setting', v_feature || '.' || v_key,
                              'setting_before', coalesce(v_before, 'null'::jsonb),
                              'setting_now', p_to = 'new',
                              'writer_now', custom.context_writer(p_org))
           || case when v_cfg is not null then jsonb_build_object('own_words_carried_back', v_cfg) else '{}'::jsonb end;
  else
    raise exception 'the switch % has no press step', p_seam using errcode = '22023';
  end if;

  select o.value into v_before from platform.knob_override o
   where o.feature = v_feature and o.key = v_key and o.scope_kind = 'organization'
     and o.scope_id = p_org and o.organization_id = p_org;

  if p_to = 'new' then
    if p_seam = 'older_tables' then
      -- THE COPY IS RE-SYNCED FROM THE OLDER TABLE FIRST (COPY-WRITABLE, chair ruling 2026-09-25):
      -- the older table is the truth at this moment, so every test edit people made on a copy is
      -- put back and every row they added is archived, with a log row per table. Then the flip.
      v_resynced := platform._cutover_copy_resync(p_org, p_press, p_actor);
      for v_id in
        select d.id from workbench.udt_datasets d
         where d.organization_id = p_org and d.deleted_at is null
         order by d.id
      loop
        perform workbench.udt_dataset_archive(v_id, v_id, v_note);
        v_ids := v_ids || v_id;
      end loop;
      -- PICK LISTS MOVE WITH THE TABLES (lane OLDER-DOORS-AFTER-SWITCH). The mover copied each
      -- older list into the store as a Table of choices under the same id; the press archives
      -- the older list with the same pointer (its copy refused if it is not there), so an
      -- organization never has a live older list beside its copy. Switch back restores them.
      for v_id in
        select l.id from workbench.udt_structured_lists l
         where l.organization_id = p_org and l.deleted_at is null
         order by l.id
      loop
        perform workbench.udt_structured_list_archive(v_id, v_id, v_note);
        v_lists := v_lists || v_id;
      end loop;
      -- "WHEN A ROW CHANGES, RUN AN AGENT" FOLLOWS THE TABLE (CUTOVER-PLAN D8). An automation on
      -- an older table listens for older row events, which stop the moment the table is archived;
      -- it is re-keyed to the copy's record events (same table id, same column keys — the mover
      -- keeps them; row.deleted becomes record.archived, the store's own word). Its config before
      -- is kept on the press and on the automation, so Switch back puts it back exactly.
      for v_t in
        select t.id, t.config from scheduler.sch_trigger t
         where t.organization_id = p_org and t.deleted_at is null and t.type = 'event'
           and t.config ->> 'entity_type' = 'user_table_row'
           and (t.config ->> 'table_id')::uuid = any (v_ids)
         order by t.id
         for update
      loop
        v_cfg := v_t.config
          || jsonb_build_object('entity_type', 'record:' || (v_t.config ->> 'table_id'))
          || case when v_t.config ? 'actions' then jsonb_build_object('actions', (
               select coalesce(jsonb_agg(distinct case a when 'row.deleted' then 'record.archived'
                                                     else regexp_replace(a, '^row\.', 'record.') end), '[]'::jsonb)
                 from jsonb_array_elements_text(v_t.config -> 'actions') a)) else '{}'::jsonb end;
        update scheduler.sch_trigger
           set config = v_cfg,
               metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('cutover_rekeyed',
                 jsonb_build_object('press', p_press, 'at', clock_timestamp(), 'config_before', v_t.config)),
               updated_at = now(), updated_by = p_actor
         where id = v_t.id;
        v_rekeyed := v_rekeyed || jsonb_build_object('id', v_t.id, 'config_before', v_t.config, 'config_now', v_cfg);
      end loop;
    end if;
    v_w := platform._knob_override_write(v_feature, v_key, 'organization', p_org, p_org,
                                         'true'::jsonb, v_note, p_actor);
    if not coalesce((v_w ->> 'ok')::boolean, false) then
      raise exception 'the setting %.% could not be written: %', v_feature, v_key, v_w::text using errcode = '22023';
    end if;
    return jsonb_build_object('archived', to_jsonb(v_ids), 'archived_lists', to_jsonb(v_lists),
                              'rekeyed', v_rekeyed,
                              'resynced', v_resynced,
                              'setting', v_feature || '.' || v_key,
                              'setting_before', coalesce(v_before, 'null'::jsonb), 'setting_now', true);
  end if;

  -- p_to = 'old': undo exactly what the last switch to new did.
  v_last := platform._cutover_seam_last_done(p_seam, p_org);
  if p_seam = 'older_tables' and v_last.id is not null then
    for v_id in select (jsonb_array_elements_text(coalesce(v_last.did -> 'archived', '[]'::jsonb)))::uuid loop
      perform workbench.udt_dataset_unarchive(v_id);
      v_ids := v_ids || v_id;
    end loop;
    -- The pick lists that press archived come back with them (lane OLDER-DOORS-AFTER-SWITCH).
    for v_id in select (jsonb_array_elements_text(coalesce(v_last.did -> 'archived_lists', '[]'::jsonb)))::uuid loop
      perform workbench.udt_structured_list_unarchive(v_id);
      v_lists := v_lists || v_id;
    end loop;
    -- Every automation the switch re-keyed listens to its older table again, exactly as before.
    for v_t in select * from jsonb_array_elements(coalesce(v_last.did -> 'rekeyed', '[]'::jsonb)) as r(x) loop
      update scheduler.sch_trigger
         set config = v_t.x -> 'config_before',
             metadata = coalesce(metadata, '{}'::jsonb) - 'cutover_rekeyed',
             updated_at = now(), updated_by = p_actor
       where id = (v_t.x ->> 'id')::uuid and deleted_at is null;
      v_rekeyed := v_rekeyed || jsonb_build_object('id', v_t.x ->> 'id', 'config_now', v_t.x -> 'config_before');
    end loop;
  end if;
  v_before := case when v_last.id is null then null
                   when v_last.did -> 'setting_before' = 'null'::jsonb then null
                   else v_last.did -> 'setting_before' end;
  v_w := platform._knob_override_write(v_feature, v_key, 'organization', p_org, p_org,
                                       v_before, v_note, p_actor);
  if not coalesce((v_w ->> 'ok')::boolean, false) then
    raise exception 'the setting %.% could not be put back: %', v_feature, v_key, v_w::text using errcode = '22023';
  end if;
  return jsonb_build_object('unarchived', to_jsonb(v_ids), 'unarchived_lists', to_jsonb(v_lists),
                            'rekeyed_back', v_rekeyed,
                            'setting', v_feature || '.' || v_key,
                            'setting_restored_to', coalesce(v_before, 'null'::jsonb),
                            'undid_press', v_last.id);
end;
$function$
;

revoke all on function platform.cutover_scope_rows_copied(uuid), platform.cutover_scope_own_words(uuid), platform._cutover_scope_own_words_back(uuid) from public;
grant execute on function platform.cutover_scope_rows_copied(uuid), platform.cutover_scope_own_words(uuid), platform._cutover_scope_own_words_back(uuid) to service_role, svc_seo, dashboard_user;
