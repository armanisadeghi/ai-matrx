-- chair-step: the inverse of chairsec_a_a_door_that_changes_a_row_asks_that_row.sql. It puts the five
-- custom.* door bodies (dashboard_declare, dashboard_run, dashboards, doc_template_save, rule_declare)
-- back byte for byte as they were on production 2026-10-02 before that file ran. No grants change.
-- based-on: custom.dashboard_declare(uuid, uuid, text, jsonb, jsonb, uuid) d1e43105a9bf97e89a7f42f44df871d505906b37f329c8bda8035caea4db88f2
-- based-on: custom.dashboard_run(uuid, uuid, jsonb, jsonb, text) 9a2045b51d771437611196533cda6d7e1cec098eab9ccd95565270e5c97f0964
-- based-on: custom.dashboards(uuid, uuid) 71baa63ad4e6c3530847e5b8b4faa2d039dc1eaad4645da3d35a231f9fbfc4d1
-- based-on: custom.doc_template_save(uuid, uuid, text, text, uuid) 80df3351909c073cd2b51ddf3bc3f40d538db7a06bd1edfed403e66bd8c443c8
-- based-on: custom.rule_declare(uuid, jsonb, uuid) 3d872cc65cf4ff3e290113bbec4f7206c5e9c3b4e7c598cbd4814f955488d880

CREATE OR REPLACE FUNCTION custom.dashboard_declare(p_organization_id uuid, p_table_id uuid, p_name text, p_blocks jsonb DEFAULT '[]'::jsonb, p_presentation jsonb DEFAULT '{}'::jsonb, p_dashboard_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_blocks jsonb := '[]'::jsonb;
  v_name   text;
  v_doc    jsonb;
  v_id     uuid;
  b        jsonb;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.dashboard_declare');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.dashboard_declare');

  v_name := nullif(btrim(coalesce(p_name, '')), '');
  if v_name is null then
    raise exception 'A dashboard has to be called something.'
      using errcode = '22004',
            hint = 'SCR-16: the name is what a person clicks to switch between dashboards.';
  end if;

  if p_table_id is null then
    raise exception 'A dashboard has to say what it is a dashboard about.'
      using errcode = '22004',
            hint = 'p_table_id names the Table most of its blocks ask about. A single block may still name another table_id of its own.';
  end if;

  -- SAME RUNG AS A FORM AND A RULE, AND FOR THE SAME REASON: this publishes something
  -- about a Table that everybody in the organization then sees on that Table's own page.
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.dashboard_declare',
                                          'admin'::public.permission_level, 'table');

  if jsonb_typeof(coalesce(p_blocks, '[]'::jsonb)) is distinct from 'array' then
    raise exception 'A dashboard''s blocks are a list.'
      using errcode = '22004',
            hint = 'Send [] for a dashboard with no blocks yet, or a list of block objects.';
  end if;

  for b in select e from jsonb_array_elements(coalesce(p_blocks, '[]'::jsonb)) e loop
    v_blocks := v_blocks || custom.dashboard_block_normalize(p_organization_id, p_table_id, b);
  end loop;

  v_doc := jsonb_build_object(
    'name', v_name,
    'subject_table_id', p_table_id,
    'blocks', v_blocks,
    'presentation', case when jsonb_typeof(coalesce(p_presentation, '{}'::jsonb)) = 'object'
                         then coalesce(p_presentation, '{}'::jsonb) else '{}'::jsonb end);

  if p_dashboard_id is null then
    insert into custom.record (organization_id, table_id, data_class, data)
    values (p_organization_id, custom.presentation_kernel_id(), custom.dashboard_class(), v_doc)
    returning id into v_id;
    return v_id;
  end if;

  -- RE-STATING A DASHBOARD, not patching one. The whole document moves at once so a save
  -- that dropped a block cannot half-land, and the version moves so History names who did
  -- it — the same shape custom.form_declare's update arm has.
  update custom.record
     set data = v_doc, updated_at = now(), version = version + 1
   where organization_id = p_organization_id
     and id = p_dashboard_id
     and table_id = custom.presentation_kernel_id()
     and data_class = custom.dashboard_class()
     and deleted_at is null
  returning id into v_id;
  if v_id is null then
    raise exception 'There is no such dashboard in this organization.' using errcode = '23503',
            hint = 'A dashboard id from another organization reads as absent — organizations are hard walls (REC-29).',
            detail = jsonb_build_object('dashboard_id', p_dashboard_id)::text;
  end if;
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.dashboard_run(p_organization_id uuid, p_dashboard_id uuid, p_filter jsonb DEFAULT '{}'::jsonb, p_compare jsonb DEFAULT NULL::jsonb, p_grain text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_doc     jsonb;
  v_name    text;
  v_subject uuid;
  v_out     jsonb := '[]'::jsonb;
  v_rows    jsonb;
  v_block   jsonb;
  v_merged  jsonb;
  v_started timestamptz;
  v_grain   text;
  v_cmp     jsonb;
  v_windows jsonb;
  v_note    text;
  v_extra   jsonb;
  v_tgt     jsonb;
  v_mk      text;
  v_op      text;
  v_cur     numeric;
  v_pri     numeric;
  v_additive boolean;
  v_tval    numeric;
  v_tnote   text;
  b         jsonb;
  k         text;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.dashboard_run');

  select d.data into v_doc
    from custom.record d
   where d.organization_id = p_organization_id
     and d.id = p_dashboard_id
     and d.table_id = custom.presentation_kernel_id()
     and d.data_class = custom.dashboard_class()
     and d.deleted_at is null;
  if v_doc is null then
    raise exception 'There is no such dashboard in this organization.' using errcode = '02000',
            hint = 'A dashboard id from another organization reads as absent — organizations are hard walls (REC-29).',
            detail = jsonb_build_object('dashboard_id', p_dashboard_id)::text;
  end if;

  v_name    := v_doc ->> 'name';
  v_subject := nullif(v_doc ->> 'subject_table_id', '')::uuid;

  -- READING A DASHBOARD IS KNOWING ITS TABLE, and nothing more, because a dashboard holds no
  -- record: every number below is produced by custom.record_aggregate under THIS caller's own
  -- principal, and this caller could ask that door the same question about the same Table
  -- directly. Asking about the dashboard RECORD instead protected nothing and, under
  -- custom/member_default_visibility = shared_only, refused an organization's own members
  -- their own organization's dashboard (measured 2026-09-20).
  perform custom.assert_may_know_table(p_organization_id, v_subject, 'custom.dashboard_run');

  -- S3: THE CANVAS'S DATE GRAIN AND COMPARISON, judged once for the whole run — a picker that
  -- sends a grain the store does not cut is the caller's mistake, not eight blocks' mistakes.
  v_grain := lower(nullif(btrim(coalesce(p_grain, '')), ''));
  if v_grain is not null and not (v_grain = any (custom.agg_buckets())) then
    raise exception '"%" is not a date grain', v_grain
      using errcode = '22023',
            hint = format('A dashboard can be cut by %s.', array_to_string(custom.agg_buckets(), ', '));
  end if;
  if p_compare is not null and jsonb_typeof(p_compare) <> 'null' then
    perform custom.agg_compare_windows(p_organization_id,
      case when jsonb_typeof(p_compare) = 'object' and not (p_compare ? 'key')
           then p_compare || '{"key": "created_at"}'::jsonb else p_compare end, null);
  end if;

  for b in select e from jsonb_array_elements(coalesce(v_doc -> 'blocks', '[]'::jsonb)) e loop
    -- RE-JUDGED ON THE WAY OUT, NOT TRUSTED BECAUSE IT WAS JUDGED ON THE WAY IN. A Field
    -- can be deleted or renamed after a block was saved, and a block naming a Table THIS
    -- caller may not know is refused here by the same wall — so a canvas that reaches
    -- somebody else's Table loses that ONE block and answers the rest.
    begin
      v_block := custom.dashboard_block_normalize(p_organization_id, v_subject, b);
    exception when others then
      v_out := v_out || jsonb_build_object(
        'title', coalesce(b ->> 'title', 'Block'),
        'kind', coalesce(b ->> 'kind', 'number'),
        'refused', sqlerrm,
        'sqlstate', sqlstate);
      continue;
    end;

    -- ONE FILTER BAR ACROSS EVERY PANEL (SCR-16, Linear Insights). The canvas's filter is
    -- merged over each block's own, and the block's own wins on a key they share.
    v_merged := coalesce(v_block -> 'filter', '{}'::jsonb);
    if p_filter is not null and jsonb_typeof(p_filter) = 'object' then
      for k in select kk from jsonb_object_keys(p_filter) kk loop
        if not (v_merged ? k) then
          v_merged := v_merged || jsonb_build_object(k, p_filter -> k);
        end if;
      end loop;
    end if;

    -- S3: the canvas's grain re-cuts every bucketed block; the block's own comparison wins over
    -- the canvas's, as its own filter does.
    if v_grain is not null and jsonb_typeof(v_block -> 'bucket') = 'object' then
      v_block := jsonb_set(v_block, '{bucket,by}', to_jsonb(v_grain));
    end if;
    v_cmp := null; v_windows := null; v_note := null;
    if v_block ->> 'kind' <> 'stuck' then
      v_cmp := coalesce(v_block -> 'compare',
                        case when p_compare is not null and jsonb_typeof(p_compare) = 'object' then p_compare end);
      if v_cmp is not null and nullif(v_cmp ->> 'key', '') is null
         and jsonb_typeof(v_block -> 'bucket') is distinct from 'object' then
        v_note := 'This block has no date to compare along, so it shows this period alone. Give it a bucket, or give its comparison a date field.';
        v_cmp := null;
      end if;
    end if;

    v_started := clock_timestamp();
    begin
      if v_cmp is not null then
        v_windows := custom.agg_compare_windows(p_organization_id, v_cmp,
                       case when jsonb_typeof(v_block -> 'bucket') = 'object' then v_block -> 'bucket' end);
      end if;
      if v_block ->> 'kind' = 'stuck' then
        select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) into v_rows
          from custom.dashboard_stuck(p_organization_id,
                                      (v_block ->> 'table_id')::uuid,
                                      v_block ->> 'state_key',
                                      (v_block ->> 'days')::integer,
                                      v_merged,
                                      (v_block ->> 'limit')::integer,
                                      'viewer') s;
      else
        select coalesce(jsonb_agg(
                 jsonb_build_object('groups', a.groups, 'measures', a.measures, 'row_count', a.row_count)
                 || case when v_cmp is null then '{}'::jsonb else jsonb_build_object(
                      'prior_groups', a.prior_groups, 'prior_measures', a.prior_measures,
                      'prior_row_count', a.prior_row_count, 'delta', a.delta,
                      'position', a.compare -> 'position') end), '[]'::jsonb)
          into v_rows
          from custom.record_aggregate(p_organization_id,
                                       (v_block ->> 'table_id')::uuid,
                                       coalesce(v_block -> 'group_by', '[]'::jsonb),
                                       coalesce(v_block -> 'measures', '[]'::jsonb),
                                       v_block -> 'bucket',
                                       v_merged,
                                       (v_block ->> 'limit')::integer,
                                       'viewer',
                                       v_cmp) a;
      end if;
      -- AGG-WITHHELD: the aggregate door answers a column this reader may not read as a withheld
      -- STATE (null + `_withheld`), not an error; this block keeps saying so in its own words, as
      -- it did when that was a refusal — the other blocks still draw.
      if v_block ->> 'kind' <> 'stuck' and exists (
           select 1 from jsonb_array_elements(v_rows) r where r -> 'measures' ? '_withheld') then
        v_out := v_out || (v_block || jsonb_build_object(
          'refused', (select w.value ->> 'says'
                        from jsonb_array_elements(v_rows) r
                        cross join lateral jsonb_each(r -> 'measures' -> '_withheld') w
                       where r -> 'measures' ? '_withheld' limit 1),
          'sqlstate', '42501'));
        continue;
      end if;
    exception when others then
      -- NOTHING FAILS SILENTLY: one block that refuses is one block that says why, and the
      -- other seven still answer. A canvas that went blank because one Field was renamed
      -- would be the screen telling a lie about the whole organization.
      v_out := v_out || (v_block || jsonb_build_object('refused', sqlerrm, 'sqlstate', sqlstate));
      continue;
    end;

    -- ── S3: the totals and the target, worked out HERE from the rows the store just answered,
    -- so the tile, the chart and the ring can never disagree with each other ─────────────
    v_extra := '{}'::jsonb;
    if v_block ->> 'kind' <> 'stuck' then
      v_tgt := v_block -> 'target';
      v_mk := coalesce(v_tgt ->> 'measure',
                       case when (v_block -> 'measures' -> 0 ->> 'op') = 'count' or (v_block -> 'measures' -> 0 ->> 'op') is null
                            then 'count' else (v_block -> 'measures' -> 0 ->> 'op') || '_' || (v_block -> 'measures' -> 0 ->> 'key') end);
      v_op := split_part(v_mk, '_', 1);
      -- A total across groups is a sum only for a measure that adds up; an average of averages
      -- is not the average, so a one-row answer is the only total such a measure has.
      v_additive := v_op in ('count', 'sum', 'filled', 'empty');
      if v_additive or jsonb_array_length(v_rows) = 1 then
        select sum(case when jsonb_typeof(r -> 'measures' -> v_mk) = 'number' then (r -> 'measures' ->> v_mk)::numeric end),
               sum(case when jsonb_typeof(r -> 'prior_measures' -> v_mk) = 'number' then (r -> 'prior_measures' ->> v_mk)::numeric end)
          into v_cur, v_pri
          from jsonb_array_elements(v_rows) r;
        v_cur := coalesce(v_cur, case when v_additive then 0 end);
        if v_cmp is not null then
          v_pri := coalesce(v_pri, case when v_additive then 0 end);
        else
          v_pri := null;
        end if;
        v_extra := v_extra || jsonb_build_object('totals', jsonb_build_object(
          'measure', v_mk, 'current', v_cur, 'prior', v_pri,
          'change', v_cur - v_pri,
          'change_pct', case when v_pri is null or v_cur is null or v_pri = 0 then null
                             else round((v_cur - v_pri) / abs(v_pri) * 100, 1) end));
      else
        v_cur := null;
      end if;
      if v_tgt is not null then
        -- S3: A TARGET READ FROM A GOAL COLUMN is that column added up over exactly the records
        -- this block's own number read — the same merged filter, the same current window, the
        -- same reader through the same door — so the goal and the number cannot disagree about
        -- which jobs they are about. A column this reader may not read refuses the TARGET by
        -- name and the block still draws its number.
        v_tval := null; v_tnote := null;
        if v_tgt ? 'field' then
          begin
            perform custom.dashboard_target_field_assert(p_organization_id, (v_block ->> 'table_id')::uuid, v_tgt ->> 'field');
            select case when jsonb_typeof(a.measures -> ((v_tgt ->> 'op') || '_' || (v_tgt ->> 'field'))) = 'number'
                        then (a.measures ->> ((v_tgt ->> 'op') || '_' || (v_tgt ->> 'field')))::numeric end
              into v_tval
              from custom.record_aggregate(p_organization_id,
                                           (v_block ->> 'table_id')::uuid,
                                           '[]'::jsonb,
                                           jsonb_build_array(jsonb_build_object('op', v_tgt ->> 'op', 'key', v_tgt ->> 'field')),
                                           null,
                                           v_merged,
                                           1,
                                           'viewer',
                                           case when v_cmp is null then null
                                                else v_cmp || jsonb_build_object('key',
                                                       coalesce(nullif(v_cmp ->> 'key', ''), v_block -> 'bucket' ->> 'key')) end) a
             limit 1;
            if v_tval is null and v_tgt ->> 'op' = 'sum' then v_tval := 0; end if;
          exception when others then
            v_tval := null;
            v_tnote := sqlerrm;
          end;
        else
          v_tval := (v_tgt ->> 'value')::numeric;
        end if;
        v_extra := v_extra || jsonb_build_object('target', v_tgt || jsonb_build_object(
          'value', v_tval,
          'current', v_cur,
          'progress', case when v_cur is null or v_tval is null or v_tval = 0 then null
                           else round(v_cur / v_tval, 4) end,
          'pace', case
            when v_tval is null then null
            when jsonb_typeof(v_block -> 'bucket') is distinct from 'object' then null
            when v_tgt ->> 'per' = 'bucket' then v_tval
            when coalesce((v_windows ->> 'bucket_count')::integer, 0) > 0
              then round(v_tval / (v_windows ->> 'bucket_count')::integer, 2)
            else null end)
          || case when v_tnote is null then '{}'::jsonb else jsonb_build_object('refused', v_tnote) end);
      end if;
    end if;

    v_out := v_out || (v_block || v_extra || jsonb_build_object(
      'rows', v_rows,
      'filter', v_merged,
      'compare', v_windows,
      'ms', round(extract(epoch from (clock_timestamp() - v_started)) * 1000.0, 1))
      || case when v_note is null then '{}'::jsonb else jsonb_build_object('compare_refused', v_note) end);
  end loop;

  return jsonb_build_object(
    'dashboard_id', p_dashboard_id,
    'name', v_name,
    'subject_table_id', v_subject,
    'presentation', coalesce(v_doc -> 'presentation', '{}'::jsonb),
    'filter', coalesce(p_filter, '{}'::jsonb),
    'grain', v_grain,
    'compare', case when jsonb_typeof(p_compare) = 'object' then p_compare end,
    'calendar', custom.agg_calendar(p_organization_id),
    'blocks', v_out);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.dashboards(p_organization_id uuid, p_table_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(dashboard_id uuid, table_id uuid, name text, blocks jsonb, presentation jsonb, block_count integer, version integer, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.dashboards');
  return query
    select d.id,
           nullif(d.data ->> 'subject_table_id', '')::uuid,
           d.data ->> 'name',
           coalesce(d.data -> 'blocks', '[]'::jsonb),
           coalesce(d.data -> 'presentation', '{}'::jsonb),
           jsonb_array_length(coalesce(d.data -> 'blocks', '[]'::jsonb)),
           d.version,
           d.created_at,
           d.updated_at
      from custom.record d
     where d.organization_id = p_organization_id
       and d.table_id = custom.presentation_kernel_id()
       and d.data_class = custom.dashboard_class()
       and d.deleted_at is null
       -- ONE WALL, AND IT IS THE TABLE'S. A dashboard holds no record and reveals none; what
       -- it names is a Table, so the question is the Table's own (VIS-5) and the answer is
       -- the same one custom.forms gives. The dashboard record's own visibility is NOT asked
       -- here: under custom/member_default_visibility = shared_only it hid an organization's
       -- dashboards from the organization's own members, silently, by returning nothing.
       and nullif(d.data ->> 'subject_table_id', '')::uuid
             in (select v from custom.query_visible_ids(p_organization_id,
                                                        custom.table_kernel_id()) v)
       and (p_table_id is null or nullif(d.data ->> 'subject_table_id', '')::uuid = p_table_id)
     order by d.created_at desc;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.doc_template_save(p_organization_id uuid, p_table_id uuid, p_name text, p_body text, p_template_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_id      uuid;
  v_bad     record;
  v_tname   text;
  v_ver     integer;
  v_labels  text;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.doc_template_save');
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.doc_template_save', 'editor'::public.permission_level, 'table');
  -- THE DOOR. One call to the ONE predicate. This is a SECURITY DEFINER door, so
  -- `current_user` in here is already the definer; `custom.assert_store_door` judges
  -- `custom.caller_role()` — what the caller actually held — and resolves the guard this
  -- file is headed with, custom/system_enabled, through platform.knob_resolve.
  perform custom.assert_store_door(p_organization_id, 'custom.doc_template_save');

  if p_organization_id is null or p_table_id is null then
    raise exception 'custom.doc_template_save: organization_id and the table the template renders are both required'
      using errcode = '22004';
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'a document template needs a name - it is what a person picks it by'
      using errcode = '23514', hint = 'REC-68.';
  end if;

  select t.data ->> 'name' into v_tname
    from custom.record t
   where t.organization_id = p_organization_id
     and t.id = p_table_id
     and t.table_id = custom.table_kernel_id()
     and t.deleted_at is null;
  if v_tname is null then
    raise exception 'this template says it renders records of something that is not a table of this organization'
      using errcode = '23503',
            hint = 'REC-68: a template renders the records of ONE Table, and its tokens are that Table''s Fields.';
  end if;

  -- ── REC-68, THE REFUSAL. A token naming no Field is refused AT SAVE, BY NAME. ──────
  -- It names the token it refused and the Fields that ARE available, because a refusal
  -- that does not say what to write instead is a dead end.
  select * into v_bad
    from custom.doc_unresolved_tokens(p_organization_id, p_table_id, p_body)
   order by raw
   limit 1;
  if v_bad.raw is not null then
    select string_agg(format('%s (%s)', f.label, f.id), ', ' order by f.sort, f.key)
      into v_labels
      from custom.field f
     where f.organization_id = p_organization_id
       and f.entity_definition_id = p_table_id;
    raise exception 'the template "%" points at % and %', btrim(p_name), v_bad.raw, v_bad.why
      using errcode = '23503',
            hint = format('REC-68: a token names a Field of %s by its id, never by a name, so renaming a field never breaks a template. The fields you can merge here are: %s.',
                          v_tname, coalesce(v_labels, 'none - this table has declared no fields yet'));
  end if;

  -- ── the positive path: it is a Record, written the way every Record is written ─────
  if p_template_id is null then
    insert into custom.record (organization_id, table_id, data_class, data)
    values (p_organization_id, null, 'doc_template', jsonb_build_object(
      'renders_table_id', p_table_id,
      'name', btrim(p_name),
      'body', coalesce(p_body, ''),
      'template_version', 1))
    returning id into v_id;
    return v_id;
  end if;

  -- REC-68 + VAL-10: EVERY SAVE OF AN EXISTING TEMPLATE IS A NEW TEMPLATE VERSION. A
  -- signature seals a document version (VAL-10), so a template whose body could move under
  -- a sealed document without the version moving would make the seal meaningless.
  select coalesce((r.data ->> 'template_version')::integer, 1) into v_ver
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_template_id
     and r.data_class = 'doc_template' and r.deleted_at is null;
  if v_ver is null then
    raise exception 'there is no such document template in this organization' using errcode = '02000',
            detail = jsonb_build_object('template_id', p_template_id)::text;
  end if;

  update custom.record r
     set data = r.data
                || jsonb_build_object('renders_table_id', p_table_id,
                                      'name', btrim(p_name),
                                      'body', coalesce(p_body, ''),
                                      'template_version', v_ver + 1)
   where r.organization_id = p_organization_id and r.id = p_template_id
  returning r.id into v_id;
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.rule_declare(p_organization_id uuid, p_spec jsonb, p_rule_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_scope uuid;
  v_id    uuid;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.rule_declare');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.rule_declare');

  if jsonb_typeof(p_spec) is distinct from 'object' then
    raise exception 'A rule has to be written down before it can be saved.'
      using errcode = '22004',
            hint = 'REC-15: the spec is {name, kind: predicate|expression, uses: [...], scope_table_id, applies_to_types: [], expr: {...}}. A subscription Rule (DOOR-18) carries a `subscription` block beside those.';
  end if;

  v_scope := nullif(p_spec ->> 'scope_table_id', '')::uuid;
  if v_scope is null then
    raise exception 'A rule has to say what it is a rule about.'
      using errcode = '22004',
            hint = 'REC-15: scope_table_id names the Table record whose records this Rule speaks about. custom._rule_shape_guard refuses it otherwise, in its own words.';
  end if;

  -- A RULE DECIDES WHAT A TABLE WILL ACCEPT, so writing one is an admin act on that
  -- Table — the same rung custom.field_declare asks for, and for the same reason: this
  -- is the table's shape, not one of its rows.
  perform custom.assert_client_may_change(p_organization_id, v_scope, 'custom.rule_declare',
                                          'admin'::public.permission_level, 'table');

  if p_rule_id is null then
    -- `data_class = 'rule'` is the whole point of this door. Everything else about the
    -- document is judged by custom._rule_shape_guard on the way in.
    insert into custom.record (organization_id, table_id, data_class, data)
    values (p_organization_id, custom.rule_kernel_id(), 'rule', p_spec)
    returning id into v_id;
    return v_id;
  end if;

  -- REC-19: a Rule has versions, and History knows which version produced a Value. The
  -- version moves here for the same reason it moves on any other record.
  update custom.record
     set data = p_spec, updated_at = now(), version = version + 1
   where organization_id = p_organization_id
     and id = p_rule_id
     and table_id = custom.rule_kernel_id()
     and deleted_at is null
  returning id into v_id;
  if v_id is null then
    raise exception 'There is no such rule in this organization.' using errcode = '23503',
            hint = 'A rule id from another organization reads as absent — organizations are hard walls (REC-29).',
            detail = jsonb_build_object('rule_id', p_rule_id)::text;
  end if;
  return v_id;
end;
$function$;
