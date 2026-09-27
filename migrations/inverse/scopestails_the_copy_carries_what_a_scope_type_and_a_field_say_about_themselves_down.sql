-- INVERSE of migrations/campaign/scopestails_the_copy_carries_what_a_scope_type_and_a_field_say_about_themselves.sql (lane SCOPES-TAILS).
-- chair-step: puts back the five bodies it replaced, byte for byte as production held them (the two store halves without the own words, custom._ctx_upsert_doc by containment only, the scopes switch's readiness without own_words_copied, its press step without the carry-back), then drops the three functions it added. Carried words already written into Tables' and Fields' metadata stay (metadata, harmless; the next copy keeps them).
-- based-on: custom._ctx_store_type(uuid, uuid, jsonb) ec8b1609623a85e763843f979953e7d3802e724f885675287da8121b82688dab
-- based-on: custom._ctx_store_item(uuid, uuid, uuid, jsonb) af2d9a9d6fd0fb45ce45f6f2d98f6ce042f9e2191736d3f464765fb65d1e32d7
-- based-on: custom._ctx_upsert_doc(uuid, uuid, uuid, text, jsonb, jsonb, timestamp with time zone, uuid) ee97492288c9acd6cad77cf6ef5d3b892811a5b15b53c1ce4e8e7188326ecd3a
-- based-on: platform._cutover_seam_readiness(text, uuid) 266188f6b8c9cff98212d9c92170a359a136bc28d9cb486f307fd2a53d77ae9c
-- based-on: platform._cutover_seam_apply(text, uuid, text, uuid, uuid) 51c0723355a61756a0a5f3ea4a9ddf1b0645a6fcf03dc8c04c45a0af9a39420f
-- lane: SCOPES-TAILS
-- window-class: function bodies and three dropped functions. Applied directly (owner, 2026-09-24).

CREATE OR REPLACE FUNCTION custom._ctx_store_type(p_org uuid, p_type uuid, p_spec jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_home     uuid := custom._ctx_id('organization-home', p_org::text);
  v_singular text := coalesce(nullif(p_spec ->> 'label_singular', ''), nullif(p_spec ->> 'label_plural', ''), 'Record');
  v_deleted  timestamptz := nullif(p_spec ->> 'deleted_at', '')::timestamptz;
  v_carried  jsonb := '{}'::jsonb;
  v_stamp    jsonb;
  v_doc      jsonb;
  v_fields   jsonb;
  v_desc     text;
  v_live     boolean;
  v_did      text;
begin
  -- THE ORGANIZATION'S HOME (common.home_record): every Table of the context copy lives inside it.
  insert into custom.record (id, organization_id, table_id, data_class, data, metadata)
  select v_home, p_org, '11111111-0000-4000-8000-000000000004'::uuid, 'record',
         jsonb_build_object('name', coalesce(nullif(o.name, ''), 'This organization')),
         jsonb_build_object('moved_from', jsonb_build_object('table', 'iam.organizations', 'id', p_org::text,
                            'note', 'the organization''s own home for everything moved out of the old stores'))
    from iam.organizations o where o.id = p_org
  on conflict do nothing;

  if (p_spec -> 'max_assignments_per_entity') is not null and jsonb_typeof(p_spec -> 'max_assignments_per_entity') <> 'null' then
    v_carried := v_carried || jsonb_build_object('max_assignments_per_entity', p_spec -> 'max_assignments_per_entity');
  end if;
  if jsonb_typeof(p_spec -> 'default_variable_keys') = 'array' and jsonb_array_length(p_spec -> 'default_variable_keys') > 0 then
    v_carried := v_carried || jsonb_build_object('default_variable_keys', p_spec -> 'default_variable_keys');
  end if;
  v_stamp := jsonb_build_object('moved_from', jsonb_build_object('table', 'context.scope_types', 'id', p_type::text)
                                || case when v_carried <> '{}'::jsonb then jsonb_build_object('carried', v_carried) else '{}'::jsonb end);

  v_live := exists (select 1 from custom.record r where r.organization_id = p_org and r.id = p_type);
  v_fields := case when v_live then custom._ctx_table_fields(p_org, p_type) else '[]'::jsonb end;
  if jsonb_array_length(v_fields) = 0 then
    v_fields := '[{"name": "name"}, {"name": "description"}]'::jsonb;
  end if;

  v_doc := jsonb_build_object(
    'name', v_singular,
    'slug', custom._ctx_slug(coalesce(nullif(p_spec ->> 'slug', ''), v_singular), 'table'),
    'label_singular', v_singular,
    'label_plural', coalesce(nullif(p_spec ->> 'label_plural', ''), v_singular || 's'),
    'icon', p_spec -> 'icon', 'color', p_spec -> 'color',
    'type', 'entity', 'display', 'page', 'ordered', false, 'weight', 'light',
    'retention_days', greatest(30, coalesce(history.retention_floor_days(p_org), 0)),
    'default_sort', '[{"field": "name", "direction": "asc"}]'::jsonb,
    'row_order', 'sorted', 'agent_writable', true,
    'fields', v_fields, 'title_field', 'name', 'parent_id', v_home::text,
    'kept_by_the_app', true, 'kept_for', 'context', 'offered_as_context', true);
  if v_doc -> 'icon' is null then v_doc := v_doc || '{"icon": null}'::jsonb; end if;
  if v_doc -> 'color' is null then v_doc := v_doc || '{"color": null}'::jsonb; end if;

  -- A LIVE TABLE BEFORE ITS FIELDS; an archived one after them (a Field is judged against its Table).
  if v_deleted is null then
    v_did := custom._ctx_upsert_doc(p_org, p_type, custom.table_kernel_id(), 'table', v_doc, v_stamp, null,
                                    nullif(p_spec ->> 'created_by', '')::uuid);
  end if;

  -- THE TWO FIELDS EVERY SCOPE RECORD HAS AS COLUMNS (name, and description or scope_description).
  select case when exists (select 1 from custom.record f
                            where f.organization_id = p_org and f.table_id = custom.field_kernel_id()
                              and f.data ->> 'entity_definition_id' = p_type::text
                              and f.metadata -> 'moved_from' ->> 'table' = 'context.context_items'
                              and f.data ->> 'key' = 'description')
              then 'scope_description' else 'description' end into v_desc;
  if v_deleted is null then
    perform custom._ctx_upsert_doc(p_org, custom._ctx_id('scope-column-field', p_type::text, 'name'),
      custom.field_kernel_id(), 'field',
      custom._ctx_field_doc('name', 'Name', '{"behavior":"text"}'::jsonb, p_type, true, 0, 'internal', 'exclude', 'manual', null, null, false),
      jsonb_build_object('moved_from', jsonb_build_object('table', 'context.scopes', 'id', p_type::text,
                         'note', 'the name column, which was never a context item')), null);
    perform custom._ctx_upsert_doc(p_org, custom._ctx_id('scope-column-field', p_type::text, 'description'),
      custom.field_kernel_id(), 'field',
      custom._ctx_field_doc(v_desc, 'Description', '{"behavior":"text"}'::jsonb, p_type, false, 1, 'internal', 'exclude', 'manual', null, null, false),
      jsonb_build_object('moved_from', jsonb_build_object('table', 'context.scopes', 'id', p_type::text,
                         'note', format('the %s column, which was never a context item', v_desc))), null);
    -- The field list, now that every Field exists.
    v_doc := v_doc || jsonb_build_object('fields', custom._ctx_table_fields(p_org, p_type));
    perform custom._ctx_upsert_doc(p_org, p_type, custom.table_kernel_id(), 'table', v_doc, v_stamp, null);
  else
    -- ARCHIVED: what the old side's cascade took with it is archived by its own rows; the Table last.
    update custom.record f set deleted_at = v_deleted
     where f.organization_id = p_org and f.table_id = custom.field_kernel_id()
       and f.data ->> 'entity_definition_id' = p_type::text
       and f.id in (custom._ctx_id('scope-column-field', p_type::text, 'name'),
                    custom._ctx_id('scope-column-field', p_type::text, 'description'))
       and f.deleted_at is null;
    v_did := custom._ctx_upsert_doc(p_org, p_type, custom.table_kernel_id(), 'table',
                                    v_doc || jsonb_build_object('fields', case when v_live then custom._ctx_table_fields(p_org, p_type) else v_fields end),
                                    v_stamp, v_deleted);
  end if;
  return jsonb_build_object('table', p_type, 'did', v_did);
end;
$function$;

CREATE OR REPLACE FUNCTION custom._ctx_store_item(p_org uuid, p_type uuid, p_item uuid, p_spec jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_old      custom.record;
  v_as_text  boolean;
  v_shape    jsonb;
  v_base     text := custom._ctx_slug(coalesce(nullif(p_spec ->> 'key', ''), nullif(p_spec ->> 'slug', ''), 'field'));
  v_key      text;
  v_n        int;
  v_used     text[];
  v_carried  jsonb := '{}'::jsonb;
  v_active   boolean := coalesce((p_spec ->> 'is_active')::boolean, true);
  v_archived timestamptz;
  v_doc      jsonb;
  v_did      text;
  v_col      uuid := custom._ctx_id('scope-column-field', p_type::text, 'description');
  v_colkey   text;
  v_tdoc     jsonb;
begin
  if not custom._ctx_table_live(p_org, p_type) then
    -- A Field of an archived Table is left as it was archived (context_follow._old_wins_documents).
    return jsonb_build_object('field', p_item, 'did', 'table_archived');
  end if;
  select * into v_old from custom.record r where r.organization_id = p_org and r.id = p_item;
  v_as_text := coalesce((v_old.metadata -> 'moved_from' -> 'carried' ->> 'as_text')::boolean, false);
  v_shape := custom._ctx_item_shape(p_spec, v_as_text);

  -- ONE KEY PER FIELD IN A TABLE (scopes._item_keys). A Field keeps the key it has — a key is how
  -- every saved value finds it — unless the item's own key changed.
  if v_old.id is not null and (v_old.data ->> 'key' = v_base or v_old.data ->> 'key' ~ ('^' || v_base || '_[0-9]+$')) then
    v_key := v_old.data ->> 'key';
  else
    select array_agg(f.data ->> 'key') into v_used
      from custom.record f
     where f.organization_id = p_org and f.table_id = custom.field_kernel_id()
       and f.data ->> 'entity_definition_id' = p_type::text and f.id <> p_item
       and f.id <> v_col;
    v_used := coalesce(v_used, '{}') || array['name'];
    v_key := v_base; v_n := 2;
    while v_key = any (v_used) loop
      v_key := v_base || '_' || v_n; v_n := v_n + 1;
    end loop;
  end if;

  -- AN ITEM CALLED "description" KEEPS ITS KEY; the scope's own column steps aside to
  -- scope_description on that Table, and every Record's value moves with it.
  select f.data ->> 'key' into v_colkey from custom.record f where f.organization_id = p_org and f.id = v_col;
  if v_key = 'description' and v_colkey = 'description' then
    select r.data into v_tdoc from custom.record r where r.organization_id = p_org and r.id = p_type;
    update custom.record set data = data || jsonb_build_object('fields',
             (data -> 'fields') || '[{"name": "scope_description"}]'::jsonb)
     where organization_id = p_org and id = p_type;
    update custom.record set data = data || '{"key": "scope_description"}'::jsonb,
                             metadata = metadata || jsonb_build_object('moved_from', jsonb_build_object('table', 'context.scopes', 'id', p_type::text,
                                        'note', 'the scope_description column, which was never a context item'))
     where organization_id = p_org and id = v_col;
    perform custom._ctx_rekey(p_org, p_type, 'description', 'scope_description');
  end if;

  if coalesce(p_spec ->> 'status', 'active') <> 'active' then
    v_carried := v_carried || jsonb_build_object('status', p_spec ->> 'status');
  end if;
  if not v_active then
    v_carried := v_carried || '{"is_active": false}'::jsonb;
  end if;
  if coalesce((v_shape ->> 'as_text')::boolean, false) then
    v_carried := v_carried || jsonb_build_object('as_text', true, 'value_type', coalesce(p_spec ->> 'value_type', 'string'));
  end if;
  v_archived := nullif(p_spec ->> 'deleted_at', '')::timestamptz;
  if v_archived is null and not v_active then
    v_archived := coalesce(v_old.deleted_at, nullif(p_spec ->> 'updated_at', '')::timestamptz, now());
  end if;

  v_doc := custom._ctx_field_doc(
    v_key, coalesce(nullif(p_spec ->> 'display_name', ''), v_key), v_shape, p_type, false,
    coalesce((p_spec ->> 'sort_order')::int, 0) + 2,
    custom._ctx_word('sensitivity', p_spec ->> 'sensitivity'),
    custom._ctx_word('policy', p_spec ->> 'fetch_hint'),
    custom._ctx_word('source', p_spec ->> 'source_type'),
    nullif(p_spec ->> 'review_interval_days', '')::int,
    coalesce((select jsonb_agg(d) from jsonb_array_elements_text(coalesce(p_spec -> 'depends_on', '[]'::jsonb)) d), '[]'::jsonb),
    true);

  -- THE TABLE DECLARES THE KEY FIRST.
  update custom.record t
     set data = t.data || jsonb_build_object('fields', (t.data -> 'fields') || jsonb_build_array(jsonb_build_object('name', v_key)))
   where t.organization_id = p_org and t.id = p_type
     and not exists (select 1 from jsonb_array_elements(t.data -> 'fields') e where e ->> 'name' = v_key);

  v_did := custom._ctx_upsert_doc(p_org, p_item, custom.field_kernel_id(), 'field', v_doc,
             jsonb_build_object('moved_from', jsonb_build_object('table', 'context.context_items', 'id', p_item::text)
                                || case when v_carried <> '{}'::jsonb then jsonb_build_object('carried', v_carried) else '{}'::jsonb end),
             v_archived, nullif(p_spec ->> 'created_by', '')::uuid);

  -- A KEY THE ITEM STOPPED USING: its values move with it.
  if v_old.id is not null and v_old.data ->> 'key' is distinct from v_key then
    perform custom._ctx_rekey(p_org, p_type, v_old.data ->> 'key', v_key);
  end if;

  -- The field list in the mover's order, now that the Field exists.
  update custom.record t set data = t.data || jsonb_build_object('fields', custom._ctx_table_fields(p_org, p_type))
   where t.organization_id = p_org and t.id = p_type
     and t.data -> 'fields' is distinct from custom._ctx_table_fields(p_org, p_type);
  return jsonb_build_object('field', p_item, 'key', v_key, 'did', v_did);
end;
$function$;

CREATE OR REPLACE FUNCTION custom._ctx_upsert_doc(p_org uuid, p_id uuid, p_kernel uuid, p_class text, p_doc jsonb, p_stamp jsonb, p_deleted timestamp with time zone, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_dropped text[] := array(select k from unnest(array['format', 'display_format', 'unit', 'default', 'review_interval_days',
                                                        'relation_target', 'relation_max', 'on_target_delete', 'compute_on',
                                                        'parity_type', 'table_token']) k
                            where not (p_doc ? k));
  v_touched boolean;
begin
  if exists (select 1 from custom.record r where r.organization_id = p_org and r.id = p_id) then
    update custom.record r
       set data = (r.data - v_dropped) || p_doc,
           deleted_at = p_deleted,
           metadata = r.metadata || p_stamp
     where r.organization_id = p_org and r.id = p_id
       and (not (r.data @> p_doc) or r.deleted_at is distinct from p_deleted
            or not (r.metadata @> p_stamp) or r.data ?| v_dropped)
    returning true into v_touched;
    return case when v_touched then 'updated' else 'current' end;
  end if;
  insert into custom.record (id, organization_id, table_id, data_class, data, metadata, deleted_at, created_by)
  values (p_id, p_org, p_kernel, p_class, p_doc, p_stamp, p_deleted, coalesce(p_created_by, auth.uid()));
  return 'made';
end;
$function$;

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
    select count(*), count(t.id),
           coalesce(sum(greatest(
             (select count(*) from workbench.udt_structured_list_items i where i.list_id = l.id and i.deleted_at is null)
             - coalesce((select count(*) from custom.record c
                          where c.organization_id = l.organization_id and c.table_id = l.id
                            and c.data_class = 'record' and c.deleted_at is null), 0), 0)), 0),
           string_agg(case when t.id is null then coalesce(nullif(btrim(l.list_name), ''), 'Untitled list') end, ', '
                      order by l.list_name)
      into v_ln, v_lc, v_lmiss, v_lnames
      from workbench.udt_structured_lists l
      left join custom.record t
        on t.organization_id = l.organization_id and t.id = l.id and t.data_class = 'table' and t.deleted_at is null
     where l.organization_id = p_org and l.deleted_at is null;

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
       and x.consumed_at is null and x.deleted_at is null;

    v_checks := v_checks || jsonb_build_object(
      'key', 'follow_current', 'says', 'No edit is waiting to be copied', 'met', v_lag = 0,
      'detail', case when v_lag = 0 then 'The copy has every edit made in the current screens.'
                     else format('%s edits made in the current screens are waiting for the copy.', v_lag) end);
  end if;

  if p_seam = 'scopes_screens' then
    -- SCOPES-WRITE-THROUGH. (1) THE COPY HAS EVERY EDIT: no follow row waiting for this organization.
    select count(*) into v_lag
      from custom.io_outbox x
     where x.organization_id = p_org and x.event_key = 'context.follow'
       and x.consumed_at is null and x.deleted_at is null;
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
$function$;

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
                              'writer_now', custom.context_writer(p_org));
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
$function$;

drop function if exists platform._cutover_scope_own_words_back(uuid);
drop function if exists platform.cutover_scope_own_words(uuid);
drop function if exists custom._ctx_own_words(text, jsonb);
