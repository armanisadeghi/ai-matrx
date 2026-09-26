-- chair-step: lane MOVER-CARRY-TAILS (chair brief 2026-09-26, the COPY-AGAIN-DOOR tails). REPLACES the bodies of platform.cutover_tables_copied(uuid), platform.cutover_copy_differences(uuid) and platform._cutover_seam_readiness(text,uuid); ADDS platform.cutover_older_row_changed_since(uuid,uuid,jsonb,timestamptz) and platform.cutover_difference_sentence(text,jsonb). No row of any table is written. No lock beyond the five function definitions.
-- based-on: platform.cutover_tables_copied(uuid) 40fb3edcbaaf4924c9791efbbc152978f64a2920cf7ba308a5dbbfc23dc1405b
-- based-on: platform.cutover_copy_differences(uuid) f165d0239f5a7a8fd1873dc3204bee23c93121e70f6b210162ae488611a6d584
-- based-on: platform._cutover_seam_readiness(text, uuid) f78b4b8a35f72b6d2bf64ba105d6d658ccae50c6a38250172bc569687ce73ea0
-- lane: MOVER-CARRY-TAILS
-- INVERSE: migrations/inverse/movercarry_copying_again_is_judged_by_what_it_changes_down.sql
--
-- TWO DEFECTS, ONE CLASS: the Data tables switch judged a copy by something other than what copying
-- again changes, so it named differences the owner's "Copy again" could never clear and offered the
-- button for them.
--
-- 1. "EDITED AFTER IT WAS COPIED" WAS A TIMESTAMP; THE MOVER COMPARES VALUES. Measured on production
--    2026-09-26: admin's Workspace, Table 1 · 2nd, row 6529d3a5 — a person typed "Testville" into
--    Capital at 05:32:24 and cleared it at 05:32:34. Every column the older table declares ended where
--    the copy already was; the rerun wrote the same values, the store's no-change rule kept the copy's
--    updated_at, and readiness counted the row "edited after it was copied" forever. The row also holds
--    `ticket: 1` and `test_autonumber: 1` — keys of two autonumber columns since removed from the table
--    (no field row, live or archived); the mover leaves such keys behind by design and names them,
--    because the older screen does not show them either. Now: a row is edited after its copy only when
--    the older row's DECLARED values moved since then (platform.cutover_older_row_changed_since), in the
--    older table's own words, so no conversion rule is restated here.
-- 2. THE BUTTON SHOWED FOR DIFFERENCES COPYING AGAIN CANNOT FIX (a share only the copy has, a level that
--    differs, a format that changes a column's kind, a required blank). Now each difference says whether
--    copying again clears it, each check carries copy_again_clears / copy_again_leaves, and each sentence
--    names what to do about the rest instead. The settings card shows "Copy again" only when an unmet
--    check has something it clears (matrx-frontend OrgDataSwitches).

-- ── 1. WAS THIS OLDER ROW REALLY EDITED SINCE ITS COPY? ───────────────────────────────────────────
create or replace function platform.cutover_older_row_changed_since(p_table uuid, p_row uuid, p_now jsonb, p_since timestamptz)
 returns boolean
 language sql
 stable
 set search_path to 'pg_catalog'
as $function$
  -- MOVER-CARRY-TAILS: did this older row's VALUES move since p_since (the moment its copy was last
  -- brought up to date)? Compared in the older table's own words, key by key, over the columns the
  -- older table declares — exactly the keys the mover carries (a key no column declares is what is
  -- left of a removed column and is never carried: user_tables "A KEY NO COLUMN DECLARES"). An empty
  -- cell (null, "" or []) equals an absent one. The older row as it stood at p_since is the prior image
  -- of its first saved version after p_since (public.udt_log_row_version writes one for EVERY change of
  -- a row's data, and none for a save that changed nothing). No version after p_since therefore means
  -- the data has not changed since — a save of the same values moved updated_at and nothing else; a
  -- version whose prior image is missing is answered "yes, it moved", never a guess that it did not.
  with declared as (
    select distinct trim(both '_' from regexp_replace(lower(f.field_name), '[^a-z0-9]+', '_', 'g')) as k
      from workbench.udt_dataset_fields f
     where f.table_id = p_table and f.deleted_at is null
  ), then_doc as (
    select v.prior_data as doc
      from workbench.udt_dataset_row_versions v
     where v.row_id = p_row and v.changed_at > p_since
     order by v.changed_at, v.id
     limit 1
  ), docs as (
    select 'now'::text as side, p_now as doc
    union all
    select 'then', (select doc from then_doc)
  ), carried as (
    select d.side,
           coalesce(jsonb_object_agg(x.k, x.v) filter (where x.k is not null), '{}'::jsonb) as doc
      from docs d
      left join lateral (
        select trim(both '_' from regexp_replace(lower(e.key), '[^a-z0-9]+', '_', 'g')) as k, e.value as v
          from jsonb_each(case when jsonb_typeof(d.doc) = 'object' then d.doc else '{}'::jsonb end) e
         where e.value not in ('null'::jsonb, '""'::jsonb, '[]'::jsonb)
      ) x on x.k in (select k from declared)
     group by d.side
  )
  select case
           when not exists (select 1 from then_doc) then false
           when (select doc from then_doc) is null or jsonb_typeof((select doc from then_doc)) <> 'object' then true
           else (select doc from carried where side = 'now') is distinct from (select doc from carried where side = 'then')
         end;
$function$;

comment on function platform.cutover_older_row_changed_since(uuid, uuid, jsonb, timestamptz) is
  'MOVER-CARRY-TAILS: true when the older row''s values under the columns its table declares moved since p_since (the prior image of its first saved version after p_since against p_now; empty = absent). No version after p_since = its data did not change (false); a version with no prior image = true. Read by platform.cutover_tables_copied; no client role calls it.';
revoke all on function platform.cutover_older_row_changed_since(uuid, uuid, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function platform.cutover_older_row_changed_since(uuid, uuid, jsonb, timestamptz) to service_role;

-- ── 2. THE ONE COUNT, WITH "EDITED AFTER ITS COPY" JUDGED BY VALUES ─────────────────────────────────
create or replace function platform.cutover_tables_copied(p_org uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  with older as (
    select d.id, d.table_name,
           exists (select 1 from custom.record r
                    where r.organization_id = p_org and r.id = d.id
                      and r.data_class = 'table' and r.deleted_at is null
                      and coalesce((r.data ->> 'kept_by_the_app')::boolean, false) = false) as copied
      from workbench.udt_datasets d
     where d.organization_id = p_org and d.deleted_at is null
  ), ev as (
    -- A person's test writes (COPY-WRITABLE): the row as the mover left it is what the switch puts
    -- back, so "missing" and "edited in the older table after its copy" are measured against it.
    select e.record_id, e.table_id, e.data_class, e.created, e.writes,
           (e.pre_image ->> 'updated_at')::timestamptz as pre_updated_at,
           (e.pre_image ->> 'deleted_at') is null      as pre_live
      from platform.cutover_evaluation_write e
     where e.organization_id = p_org and e.replaced_at is null
  ), rows_of_copies as (
    select count(*) filter (where r.id is null or (r.deleted_at is not null and not coalesce(ev.pre_live, false))) as missing,
           count(*) filter (where r.id is not null and (r.deleted_at is null or coalesce(ev.pre_live, false))
                              and w.updated_at > coalesce(ev.pre_updated_at, r.updated_at)
                              -- MOVER-CARRY-TAILS: a save that changed nothing a column declares (a value
                              -- typed and put back, a key of a removed column) has nothing to bring, and the
                              -- mover's rerun rightly writes nothing — so it is not "edited after its copy".
                              and platform.cutover_older_row_changed_since(w.table_id, w.id, w.data,
                                                                           coalesce(ev.pre_updated_at, r.updated_at)))
                                                                                                             as stale
      from older o
      join workbench.udt_dataset_rows w on w.table_id = o.id and w.deleted_at is null
      left join custom.record r on r.organization_id = p_org and r.id = w.id
      left join ev on ev.record_id = w.id and not ev.created
     where o.copied
  )
  select jsonb_build_object(
    'organization_id', p_org,
    'older_live',      (select count(*) from older),
    'copied',          (select count(*) from older where copied),
    'not_yet',         coalesce((select jsonb_agg(x.table_name order by x.table_name)
                                   from (select table_name from older where not copied
                                          order by table_name limit 5) x), '[]'::jsonb),
    'rows_missing',    (select missing from rows_of_copies),
    'rows_stale',      (select stale from rows_of_copies),
    'archived_older',  (select count(*) from workbench.udt_datasets d
                         where d.organization_id = p_org and d.deleted_at is not null),
    'app_kept',        (select count(*) from custom.record r
                         where r.organization_id = p_org and r.data_class = 'table' and r.deleted_at is null
                           and coalesce((r.data ->> 'kept_by_the_app')::boolean, false)),
    'archived_copies', (select count(*) from custom.record r
                         where r.organization_id = p_org and r.data_class = 'table' and r.deleted_at is not null
                           and exists (select 1 from workbench.udt_datasets d
                                        where d.id = r.id and d.organization_id = p_org and d.deleted_at is null)),
    'evaluation',      (select jsonb_build_object(
                                 'writes',   coalesce(sum(ev.writes), 0),
                                 'rows',     count(*),
                                 'edited',   count(*) filter (where ev.data_class = 'record' and not ev.created),
                                 'added',    count(*) filter (where ev.data_class = 'record' and ev.created),
                                 'settings', count(*) filter (where ev.data_class <> 'record'),
                                 'tables',   count(distinct ev.table_id))
                          from ev),
    'counted_at',      now());
$function$;

-- ── 3. THE ONE SENTENCE PER KIND OF DIFFERENCE ─────────────────────────────────────────────────────
create or replace function platform.cutover_difference_sentence(p_kind text, p_part jsonb)
 returns text
 language plpgsql
 immutable
 set search_path to 'pg_catalog'
as $function$
-- MOVER-CARRY-TAILS: the one sentence a Data tables switch check says about one kind of difference
-- (colours, checks, formats, shares) — what differs, and for each difference whether copying again
-- clears it or what to do instead. Read by platform._cutover_seam_readiness.
declare
  v_n      integer := coalesce((p_part ->> 'count')::int, 0);
  v_clears integer := least(coalesce((p_part ->> 'clears')::int, 0), coalesce((p_part ->> 'count')::int, 0));
  v_ex     text := (select string_agg(x, '; ') from jsonb_array_elements_text(coalesce(p_part -> 'examples', '[]'::jsonb)) x);
  v_left   text := (select string_agg(x, '; ') from jsonb_array_elements_text(coalesce(p_part -> 'leaves', '[]'::jsonb)) x);
  v_head   text;
  v_all    text;
  v_rest   text;
begin
  if v_n = 0 then
    return case p_kind
      when 'colours' then 'Every row, column and cell colour, colour-by and colour rule matches its older table.'
      when 'checks' then format('The older tables'' writes of the last 30 days and every row edited since its copy (%s judged%s) would all be taken by the copies.',
                                coalesce(p_part ->> 'judged', '0'),
                                case when coalesce((p_part ->> 'capped')::boolean, false) then ', the newest first' else '' end)
      when 'formats' then 'Every column keeps its format (currency, percent, email, choice, date and the rest).'
      else 'Everyone who holds an older table holds its copy at the same level, and nobody else does.' end;
  end if;

  v_head := case p_kind
    when 'colours' then format('%s %s, in %s %s', v_n, case when v_n = 1 then 'colour differs' else 'colours differ' end,
                               coalesce(p_part ->> 'tables', '1'), case when coalesce(p_part ->> 'tables', '1') = '1' then 'table' else 'tables' end)
    when 'checks' then format('%s %s the older tables took would be refused by the copies', v_n, case when v_n = 1 then 'kind of write' else 'kinds of write' end)
    when 'formats' then format('%s %s', v_n, case when v_n = 1 then 'column differs' else 'columns differ' end)
    else format('%s %s', v_n, case when v_n = 1 then 'share differs' else 'shares differ' end) end;

  v_all := case p_kind
    when 'colours' then 'Copying again brings the older table''s colours.'
    when 'checks' then 'Copying again brings the older tables'' newer choices and takes off a check the older table never enforced.'
    when 'formats' then 'Copying again brings the older table''s format.'
    else 'Copying again carries the share the copy is missing.' end;

  if v_clears >= v_n then
    v_rest := v_all;
  elsif v_clears = 0 and v_left is not null then
    -- Nothing here clears: each difference is named once, with what to do instead.
    return v_head || '. ' || case when v_n = 1 then 'Copying again does not change it: ' else 'Copying again does not change these: ' end
           || v_left || '.';
  elsif v_clears = 0 then
    v_rest := 'Copying again does not change these.';
  else
    v_rest := format('Copying again clears %s of them; for the other %s: %s.', v_clears, v_n - v_clears, coalesce(v_left, 'see each one above'));
  end if;
  return v_head || coalesce(': ' || v_ex, '') || '. ' || v_rest;
end;
$function$;

comment on function platform.cutover_difference_sentence(text, jsonb) is
  'MOVER-CARRY-TAILS: the sentence a Data tables switch check says about one kind of difference (colours, checks, formats, shares): what differs, and whether copying again clears it or what to do instead. Read by platform._cutover_seam_readiness.';
revoke all on function platform.cutover_difference_sentence(text, jsonb) from public, anon, authenticated;
grant execute on function platform.cutover_difference_sentence(text, jsonb) to service_role;

-- ── 4. WHAT THE SWITCH WOULD SHOW DIFFERENTLY, EACH DIFFERENCE SAYING WHETHER COPYING AGAIN CLEARS IT ─
create or replace function platform.cutover_copy_differences(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_palette  text[] := custom.decoration_colors();
  v_colours  jsonb;
  v_formats  jsonb;
  v_shares   jsonb;
  v_checks   jsonb := '[]'::jsonb;
  v_judged   integer := 0;
  v_cap      constant integer := 400;
  v_t        record;
  v_w        record;
  v_fields   custom.record[];
  v_judge    custom.record[];
  v_doc      jsonb;
  v_msg      text;
  v_seen     text[] := '{}';
  v_perm     boolean;
  v_relaxed  custom.record[];
  v_lists    text[];
  v_clears   boolean;
begin
  -- A. COLOURS — every colour the older SCREEN paints (the store's seven; the older grid's
  -- isStyleColor drops any other word, so a stored "purple" was never shown and is not compared),
  -- keyed as the store keys them (Field id for a column), against every colour the copy paints.
  with copies as (
    select d.id, d.table_name, d.metadata -> 'style' as style,
           coalesce(ev.pre_image -> 'data' -> 'decorations', r.data -> 'decorations', '{}'::jsonb) as deco
      from workbench.udt_datasets d
      join custom.record r on r.organization_id = p_org and r.id = d.id and r.data_class = 'table'
                          and r.deleted_at is null and not coalesce((r.data ->> 'kept_by_the_app')::boolean, false)
      left join platform.cutover_evaluation_write ev on ev.organization_id = p_org and ev.record_id = d.id
                          and ev.replaced_at is null and not ev.created
     where d.organization_id = p_org and d.deleted_at is null
  ), cols as (
    select f.table_id, f.field_name, f.display_name, f.id::text as fid, cf.data ->> 'key' as key
      from workbench.udt_dataset_fields f
      join copies c on c.id = f.table_id
      left join custom.record cf on cf.organization_id = p_org and cf.id = f.id and cf.data_class = 'field'
     where f.deleted_at is null
  ), older_leaves as (
    select c.id as t, 'row ' || left(x.key, 8) as what, array['rows', x.key] as path, to_jsonb(x.value) as val
      from copies c cross join lateral jsonb_each_text(case when jsonb_typeof(c.style -> 'rows') = 'object' then c.style -> 'rows' else '{}' end) x
     where x.value = any (v_palette)
    union all
    select c.id, 'column ' || coalesce(k.display_name, x.key), array['columns', k.fid], to_jsonb(x.value)
      from copies c cross join lateral jsonb_each_text(case when jsonb_typeof(c.style -> 'columns') = 'object' then c.style -> 'columns' else '{}' end) x
      join cols k on k.table_id = c.id and (k.field_name = x.key or k.key = x.key)
     where x.value = any (v_palette)
    union all
    select c.id, 'cell ' || left(rw.key, 8) || ' · ' || coalesce(k.display_name, x.key), array['cells', rw.key, k.fid], to_jsonb(x.value)
      from copies c cross join lateral jsonb_each(case when jsonb_typeof(c.style -> 'cells') = 'object' then c.style -> 'cells' else '{}' end) rw
           cross join lateral jsonb_each_text(case when jsonb_typeof(rw.value) = 'object' then rw.value else '{}' end) x
      join cols k on k.table_id = c.id and (k.field_name = x.key or k.key = x.key)
     where x.value = any (v_palette)
    union all
    select c.id, 'colour by', array['color_by'],
           jsonb_build_object('field', k.fid, 'target', coalesce(coalesce(c.style -> 'colorBy', c.style -> 'color_by') ->> 'target', 'row'))
      from copies c
      join cols k on k.table_id = c.id
                 and (k.field_name = coalesce(c.style -> 'colorBy', c.style -> 'color_by') ->> 'field'
                      or k.key = coalesce(c.style -> 'colorBy', c.style -> 'color_by') ->> 'field')
    union all
    select c.id, 'colour rules', array['rules'],
           jsonb_agg(ru.value || jsonb_build_object('field', k.fid) order by ru.ordinality)
      from copies c cross join lateral jsonb_array_elements(case when jsonb_typeof(c.style -> 'rules') = 'array' then c.style -> 'rules' else '[]' end) with ordinality ru
      join cols k on k.table_id = c.id and (k.field_name = ru.value ->> 'field' or k.key = ru.value ->> 'field')
     group by c.id
  ), copy_leaves as (
    select c.id as t, array['rows', x.key] as path, x.value as val
      from copies c cross join lateral jsonb_each(case when jsonb_typeof(c.deco -> 'rows') = 'object' then c.deco -> 'rows' else '{}' end) x
    union all
    select c.id, array['columns', x.key], x.value
      from copies c cross join lateral jsonb_each(case when jsonb_typeof(c.deco -> 'columns') = 'object' then c.deco -> 'columns' else '{}' end) x
    union all
    select c.id, array['cells', rw.key, x.key], x.value
      from copies c cross join lateral jsonb_each(case when jsonb_typeof(c.deco -> 'cells') = 'object' then c.deco -> 'cells' else '{}' end) rw
           cross join lateral jsonb_each(case when jsonb_typeof(rw.value) = 'object' then rw.value else '{}' end) x
    union all
    select c.id, array['color_by'], c.deco -> 'color_by' from copies c
     where jsonb_typeof(c.deco -> 'color_by') = 'object'
    union all
    select c.id, array['rules'], c.deco -> 'rules' from copies c
     where jsonb_typeof(c.deco -> 'rules') = 'array' and jsonb_array_length(c.deco -> 'rules') > 0
  ), diff as (
    select coalesce(o.t, cl.t) as t,
           coalesce(o.what, case cl.path[1] when 'rows' then 'row ' || left(cl.path[2], 8)
                                            when 'columns' then 'column ' || coalesce((select k.display_name from cols k where k.fid = cl.path[2]), 'a column')
                                            when 'cells' then 'cell ' || left(cl.path[2], 8) || ' · ' || coalesce((select k.display_name from cols k where k.fid = cl.path[3]), 'a column')
                                            when 'color_by' then 'colour by' else 'colour rules' end) as what,
           o.val as older, cl.val as copy
      from older_leaves o
      full join copy_leaves cl on cl.t = o.t and cl.path = o.path
     where o.val is distinct from cl.val
  )
  select jsonb_build_object(
           'count', count(*),
           -- MOVER-CARRY-TAILS: while the older table is the truth a rerun makes the copy paint what the
           -- older table paints (attributes._carry_decorations), so every colour difference clears.
           'clears', count(*),
           'leaves', '[]'::jsonb,
           'tables', count(distinct d.t),
           'examples', coalesce((select jsonb_agg(e.says) from (
               select format('%s: %s is %s on the older table and %s on the copy',
                             c.table_name, d2.what,
                             case when d2.older is null then 'not coloured' when jsonb_typeof(d2.older) = 'string' then d2.older #>> '{}' else 'set' end,
                             case when d2.copy is null then 'not coloured' when jsonb_typeof(d2.copy) = 'string' then d2.copy #>> '{}' else 'set differently' end) as says
                 from diff d2 join copies c on c.id = d2.t
                order by c.table_name, d2.what limit 5) e), '[]'::jsonb))
    into v_colours
    from diff d;

  -- B. FORMATS — what each older column MEANS (metadata.format) is what its copy enforces
  -- (`format`) or draws (`display_format`). A column with no copy at all is named too.
  with copies as (
    select d.id, d.table_name
      from workbench.udt_datasets d
      join custom.record r on r.organization_id = p_org and r.id = d.id and r.data_class = 'table'
                          and r.deleted_at is null and not coalesce((r.data ->> 'kept_by_the_app')::boolean, false)
     where d.organization_id = p_org and d.deleted_at is null
  ), diff as (
    select c.table_name, coalesce(f.display_name, f.field_name) as col, f.metadata -> 'format' ->> 'id' as older,
           case when cf.id is null then null
                else coalesce(coalesce(ev.pre_image -> 'data', cf.data) ->> 'format',
                              coalesce(ev.pre_image -> 'data', cf.data) -> 'display_format' ->> 'id') end as copy,
           cf.id is null as missing,
           -- MOVER-CARRY-TAILS: the rerun follows the older column's format only where the column keeps
           -- its KIND (attributes._follow_the_older_format: the store type the older column declares
           -- equals the copy's); a format that changes the kind would convert every cell and is left.
           cf.id is null
             or case f.metadata -> 'format' ->> 'id'
                  when 'choice' then 'list' when 'multi_choice' then 'list'
                  when 'relation' then 'relation' when 'person' then 'relation' when 'attachment' then 'relation'
                  when 'formula' then 'formula'
                  else case f.data_type::text when 'number' then 'range' when 'integer' then 'range'
                                              when 'date' then 'range' when 'datetime' then 'range'
                                              when 'boolean' then 'boolean' else 'text' end
                end = coalesce(coalesce(ev.pre_image -> 'data', cf.data) ->> 'type', '') as clears
      from workbench.udt_dataset_fields f
      join copies c on c.id = f.table_id
      left join custom.record cf on cf.organization_id = p_org and cf.id = f.id and cf.data_class = 'field' and cf.deleted_at is null
      left join platform.cutover_evaluation_write ev on ev.organization_id = p_org and ev.record_id = f.id
                          and ev.replaced_at is null and not ev.created
     where f.deleted_at is null
       and (cf.id is null
            or (nullif(f.metadata -> 'format' ->> 'id', '') is not null
                and f.metadata -> 'format' ->> 'id' is distinct from coalesce(coalesce(ev.pre_image -> 'data', cf.data) ->> 'format', '')
                and f.metadata -> 'format' ->> 'id' is distinct from coalesce(coalesce(ev.pre_image -> 'data', cf.data) -> 'display_format' ->> 'id', '')))
  )
  select jsonb_build_object(
           'count', count(*),
           'clears', count(*) filter (where clears),
           'examples', coalesce((select jsonb_agg(e.says) from (
               select case when d2.missing then format('%s: the column %s is not on the copy', d2.table_name, d2.col)
                           else format('%s: %s is formatted as %s on the older table and %s on the copy', d2.table_name, d2.col,
                                       d2.older, coalesce('as ' || d2.copy, 'has no format')) end as says
                 from diff d2 order by d2.table_name, d2.col limit 5) e), '[]'::jsonb),
           'leaves', coalesce((select jsonb_agg(e.says) from (
               select format('%s: %s is formatted as %s on the older table and %s on the copy, a different kind of column — set the format back on the older table, or set it on the copy after the switch',
                             d2.table_name, d2.col, d2.older, coalesce('as ' || d2.copy, 'has no format')) as says
                 from diff d2 where not d2.clears order by d2.table_name, d2.col limit 5) e), '[]'::jsonb))
    into v_formats
    from diff;

  -- C. SHARES — each older share (iam.permissions on the dataset) is the same person or
  -- organization at the same level on the copy (a record grant, or for someone outside the
  -- organization an outside invitation they hold); a public older share has no copy (a public
  -- link is its own product); and nobody holds the copy who does not hold the older table.
  with copies as (
    select d.id, d.table_name
      from workbench.udt_datasets d
      join custom.record r on r.organization_id = p_org and r.id = d.id and r.data_class = 'table'
                          and r.deleted_at is null and not coalesce((r.data ->> 'kept_by_the_app')::boolean, false)
     where d.organization_id = p_org and d.deleted_at is null
  ), older as (
    select c.id, c.table_name, p.is_public, p.permission_level::text as lvl,
           coalesce(p.granted_to_user_id, p.granted_to_organization_id) as who, p.granted_to_user_id as person
      from copies c
      join iam.permissions p on p.resource_type = 'dataset' and p.resource_id = c.id and p.status = 'active'
  ), newer as (
    select c.id, c.table_name, p.permission_level::text as lvl,
           coalesce(p.granted_to_user_id, p.granted_to_organization_id) as who
      from copies c
      join iam.permissions p on p.resource_type = 'record' and p.resource_id = c.id and p.status = 'active'
     where not coalesce(p.is_public, false)
  ), diff as (
    -- MOVER-CARRY-TAILS: each difference says whether copying again clears it and, where it does not,
    -- what does (attributes._carry_shares: a missing share for a member or the organization itself is
    -- granted; a public link, a level that differs, a share only the copy has, a person outside the
    -- organization — the grant would contact them — and another organization are not).
    select o.table_name, format('it is shared publicly on the older table, and a public link does not carry to the copy') as says,
           false as clears, 'make a share link for the copy on its Share if it should stay public' as instead
      from older o where coalesce(o.is_public, false)
    union all
    select o.table_name,
           format('%s holds the older table as %s and %s on the copy',
                  coalesce((select u.email from auth.users u where u.id = o.who),
                           (select g.name from iam.organizations g where g.id = o.who), 'someone'),
                  o.lvl, coalesce('as ' || n.lvl, 'nothing')),
           n.lvl is null and (o.who = p_org
                              or (o.person is not null and exists (select 1 from iam.organization_member m
                                                                    where m.organization_id = p_org and m.user_id = o.person))),
           case when n.lvl is not null then 'set their level on the copy''s Share'
                when o.person is not null then 'share the copy with them from its Share — that sends them an email, so copying again does not'
                else 'another organization cannot hold the copy; share it with that organization''s people from the copy''s Share' end
      from older o
      left join newer n on n.id = o.id and n.who = o.who
     where not coalesce(o.is_public, false)
       and n.lvl is distinct from o.lvl
       and not exists (select 1 from iam.invitations i
                        where i.target_type = 'custom_table' and i.target_id = o.id and i.deleted_at is null
                          and i.status in ('pending', 'accepted') and i.role = o.lvl
                          and (i.invited_user_id = o.person
                               or lower(i.email) = (select lower(u.email) from auth.users u where u.id = o.person)))
    union all
    select n.table_name,
           format('%s holds the copy as %s and has no share on the older table',
                  coalesce((select u.email from auth.users u where u.id = n.who),
                           (select g.name from iam.organizations g where g.id = n.who), 'someone'), n.lvl),
           false, 'take it off the copy''s Share, or share the older table the same way'
      from newer n
     where not exists (select 1 from older o where o.id = n.id and o.who = n.who)
  )
  select jsonb_build_object(
           'count', count(*),
           'clears', count(*) filter (where clears),
           'examples', coalesce((select jsonb_agg(e.x) from (
               select d2.table_name || ': ' || d2.says as x from diff d2 order by 1 limit 5) e), '[]'::jsonb),
           'leaves', coalesce((select jsonb_agg(e.x) from (
               select d2.table_name || ': ' || d2.says || ' — ' || d2.instead as x from diff d2 where not d2.clears order by 1 limit 5) e), '[]'::jsonb))
    into v_shares
    from diff;

  -- D. CHECKS — would the copy REFUSE what the older table takes? The older table's writes of the
  -- last 30 days (its history) and every row edited after its copy are put, as the writer sent
  -- them, through the copy's own judge (custom.validate_values) — after the conversions the mover
  -- makes (a number held as numeric text, a one-item list, a yes/no word, a number in a words
  -- column), so only a value no conversion rescues is named: words in a date column, a technician
  -- "R" under "at least 2 characters", a blank in a required column, a choice off a closed list.
  -- Formula and relation columns are the store's to compute and to resolve and are not judged.
  for v_t in
    select d.id, d.table_name
      from workbench.udt_datasets d
      join custom.record r on r.organization_id = p_org and r.id = d.id and r.data_class = 'table'
                          and r.deleted_at is null and not coalesce((r.data ->> 'kept_by_the_app')::boolean, false)
     where d.organization_id = p_org and d.deleted_at is null
     order by d.table_name
  loop
    exit when v_judged >= v_cap;
    select coalesce(d.validation_mode::text, 'permissive') <> 'strict' into v_perm
      from workbench.udt_datasets d where d.id = v_t.id;
    select array_agg(case when ev.pre_image is not null
                          then jsonb_populate_record(null::custom.record, to_jsonb(cf) || jsonb_build_object('data', ev.pre_image -> 'data'))
                          else cf end)
      into v_fields
      from custom.record cf
      left join platform.cutover_evaluation_write ev on ev.organization_id = p_org and ev.record_id = cf.id
                          and ev.replaced_at is null and not ev.created
     where cf.organization_id = p_org and cf.data_class = 'field' and cf.deleted_at is null
       and cf.data ->> 'entity_definition_id' = v_t.id::text
       and coalesce(cf.data ->> 'type', '') not in ('formula', 'relation');
    continue when v_fields is null;

    for v_w in
      (select x.data, x.prior, x.whole, x.at from (
         -- A row edited in the older table after its copy: the rerun must land it WHOLE.
         select w.data, null::jsonb as prior, true as whole, w.updated_at as at
           from workbench.udt_dataset_rows w
           left join custom.record r on r.organization_id = p_org and r.id = w.id
          where w.table_id = v_t.id and w.deleted_at is null
            and (r.id is null or w.updated_at > r.updated_at)
         union all
         -- A write of the last 30 days: only what the writer CHANGED is judged, as it was sent.
         select v.data, coalesce(v.prior_data, '{}'::jsonb), false, v.changed_at
           from workbench.udt_dataset_row_versions v
          where v.table_id = v_t.id and v.changed_at > now() - interval '30 days' and v.data is not null
       ) x order by x.at desc limit greatest(v_cap - v_judged, 0))
    loop
      v_judged := v_judged + 1;
      select coalesce(array_agg(cf), '{}'::custom.record[]),
             coalesce(jsonb_object_agg(cf.data ->> 'key',
               case
                 when val is null or jsonb_typeof(val) = 'null' then val
                 when cf.data ->> 'type' = 'text' and jsonb_typeof(val) in ('object', 'array') and not coalesce((cf.data ->> 'multi')::boolean, false)
                   then to_jsonb(val::text)
                 when coalesce((cf.data ->> 'multi')::boolean, false) and jsonb_typeof(val) <> 'array' then jsonb_build_array(val)
                 when not coalesce((cf.data ->> 'multi')::boolean, false) and jsonb_typeof(val) = 'array' and jsonb_array_length(val) = 1 then val -> 0
                 when cf.data ->> 'type' = 'range' and coalesce(cf.data -> 'config' ->> 'kind', 'number') not in ('date', 'datetime')
                      and jsonb_typeof(val) = 'string' and btrim(val #>> '{}') ~ '^-?[0-9][0-9,]*(\.[0-9]+)?$|^-?\.[0-9]+$'
                   then to_jsonb(replace(btrim(val #>> '{}'), ',', '')::numeric)
                 when cf.data ->> 'type' = 'boolean' and jsonb_typeof(val) = 'string' and lower(btrim(val #>> '{}')) in ('true', 'false')
                   then to_jsonb(lower(btrim(val #>> '{}')) = 'true')
                 when cf.data ->> 'type' = 'text' and jsonb_typeof(val) in ('number', 'boolean') then to_jsonb(val #>> '{}')
                 else val end) filter (where cf.id is not null), '{}'::jsonb)
        into v_judge, v_doc
        from unnest(v_fields) cf
        join workbench.udt_dataset_fields f on f.id = cf.id
        cross join lateral (select v_w.data -> f.field_name as val) z
       where v_w.whole or (v_w.data -> f.field_name) is distinct from (v_w.prior -> f.field_name);
      continue when cardinality(v_judge) = 0;
      begin
        perform custom.validate_values(p_org, v_judge, v_doc, null);
      exception when sqlstate '23514' then
        get stacked diagnostics v_msg = message_text;
        if not ((v_t.table_name || ': ' || v_msg) = any (v_seen)) then
          v_seen := v_seen || (v_t.table_name || ': ' || v_msg);
          -- MOVER-CARRY-TAILS: would copying again clear it? Judge the same write again as the rerun
          -- leaves the copy: on a permissive older table a check its own values break comes off
          -- (attributes._take_off_unenforced_checks), and every choice the older table holds becomes
          -- an option of the column (user_tables: off-list cells are ADDED to the option set). A
          -- required blank, words in a date column and the rest are still refused: not cleared.
          v_relaxed := null; v_lists := null;
          select array_agg(case when v_perm
                                then jsonb_populate_record(null::custom.record, to_jsonb(j) || jsonb_build_object('data', j.data || jsonb_build_object('rules', '[]'::jsonb)))
                                else j end) filter (where coalesce(j.data ->> 'type', '') <> 'list'),
                 array_agg(j.data ->> 'key') filter (where coalesce(j.data ->> 'type', '') = 'list')
            into v_relaxed, v_lists
            from unnest(v_judge) j;
          v_clears := true;
          if cardinality(coalesce(v_relaxed, '{}'::custom.record[])) > 0 then
            begin
              perform custom.validate_values(p_org, v_relaxed, v_doc - coalesce(v_lists, '{}'::text[]), null);
            exception when sqlstate '23514' then
              v_clears := false;
            end;
          end if;
          v_checks := v_checks || jsonb_build_object('table', v_t.table_name, 'says', v_msg, 'at', v_w.at, 'clears', v_clears);
        end if;
      end;
    end loop;
  end loop;

  return jsonb_build_object(
    'organization_id', p_org,
    'colours',  v_colours,
    'formats',  v_formats,
    'shares',   v_shares,
    'checks',   jsonb_build_object(
                  'count', jsonb_array_length(v_checks),
                  'clears', (select count(*) from jsonb_array_elements(v_checks) c where (c ->> 'clears')::boolean),
                  'leaves', coalesce((select jsonb_agg(e.x) from (
                      select (c ->> 'table') || ': ' || (c ->> 'says') || ' — change the value on the older table, or change the column on the copy after the switch' as x
                        from jsonb_array_elements(v_checks) c where not (c ->> 'clears')::boolean order by 1 limit 5) e), '[]'::jsonb),
                  'judged', v_judged,
                  'capped', v_judged >= v_cap,
                  'examples', coalesce((select jsonb_agg(e.x) from (
                      select (c ->> 'table') || ': ' || (c ->> 'says') as x
                        from jsonb_array_elements(v_checks) c order by 1 limit 5) e), '[]'::jsonb)),
    'compared_at', now());
end;
$function$;

-- ── 5. THE READINESS JUDGEMENT: EVERY CHECK SAYS HOW MUCH OF IT COPYING AGAIN CLEARS ────────────────
create or replace function platform._cutover_seam_readiness(p_seam text, p_org uuid)
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
