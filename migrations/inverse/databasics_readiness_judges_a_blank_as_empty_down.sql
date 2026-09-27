-- Inverse of databasics_readiness_judges_a_blank_as_empty.sql: the body it replaced, byte for byte.
-- based-on: platform.cutover_copy_differences(uuid) 7d87c17bc9dd69d99c572b77ac5b2d1b946dbe5b8f8c0a1da64d9de249c6edb8

CREATE OR REPLACE FUNCTION platform.cutover_copy_differences(p_org uuid)
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
  v_cap      integer := coalesce(nullif(platform.knob_resolve('cutover', 'readiness_writes_cap', p_org) #>> '{}', '')::integer, 400);
  v_total    bigint := 0;
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
  v_share    jsonb := '{}'::jsonb;
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
           -- MOVER-DELETIONS: a share the mover carried (the copy's Table records whom its older table
           -- shared with, metadata.older_shares_seen) that the older table has since taken away is taken
           -- back by the rerun (platform.cutover_carry_removals); one a person added on the copy is not.
           coalesce((select t.metadata -> 'older_shares_seen' ? n.who::text
                       from custom.record t
                      where t.organization_id = p_org and t.id = n.id and t.data_class = 'table'
                        and jsonb_typeof(t.metadata -> 'older_shares_seen') = 'array'), false),
           'take it off the copy''s Share, or share the older table the same way'
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
  --
  -- MOVER-SUITE-GREEN (2026-09-26): WHICH writes are judged. At most v_cap per organization, and
  -- every table's newest writes first, in turn: each table's newest write, then each table's
  -- second newest, and so on. Before, the tables were walked by NAME and each took its newest
  -- writes until the cap ran out, so one busy table early in the alphabet ("Grid Parity Fixture",
  -- 511 writes in 30 days in admin's Workspace) used the whole cap and no table after it was ever
  -- judged — readiness said "No copy refuses a write its older table takes" about tables it never
  -- looked at. v_share holds each table's budget.
  -- READINESS-CAP (2026-09-26): the honest total, before the cap trims it — a bounded budget
  -- only tells a person the truth about it if it also says how big the whole pile was.
  with t as (
    select d.id
      from workbench.udt_datasets d
      join custom.record r on r.organization_id = p_org and r.id = d.id and r.data_class = 'table'
                          and r.deleted_at is null and not coalesce((r.data ->> 'kept_by_the_app')::boolean, false)
     where d.organization_id = p_org and d.deleted_at is null
       and exists (select 1 from custom.record cf
                    where cf.organization_id = p_org and cf.data_class = 'field' and cf.deleted_at is null
                      and cf.data ->> 'entity_definition_id' = d.id::text
                      and coalesce(cf.data ->> 'type', '') not in ('formula', 'relation'))
  ), writes as (
    select w.table_id, w.updated_at as at
      from workbench.udt_dataset_rows w
      join t on t.id = w.table_id
      left join custom.record r on r.organization_id = p_org and r.id = w.id
     where w.deleted_at is null and (r.id is null or w.updated_at > r.updated_at)
    union all
    select v.table_id, v.changed_at
      from workbench.udt_dataset_row_versions v
      join t on t.id = v.table_id
     where v.changed_at > now() - interval '30 days' and v.data is not null
  )
  select count(*) into v_total from writes;

  with t as (
    select d.id
      from workbench.udt_datasets d
      join custom.record r on r.organization_id = p_org and r.id = d.id and r.data_class = 'table'
                          and r.deleted_at is null and not coalesce((r.data ->> 'kept_by_the_app')::boolean, false)
     where d.organization_id = p_org and d.deleted_at is null
       and exists (select 1 from custom.record cf
                    where cf.organization_id = p_org and cf.data_class = 'field' and cf.deleted_at is null
                      and cf.data ->> 'entity_definition_id' = d.id::text
                      and coalesce(cf.data ->> 'type', '') not in ('formula', 'relation'))
  ), writes as (
    select w.table_id, w.updated_at as at
      from workbench.udt_dataset_rows w
      join t on t.id = w.table_id
      left join custom.record r on r.organization_id = p_org and r.id = w.id
     where w.deleted_at is null and (r.id is null or w.updated_at > r.updated_at)
    union all
    select v.table_id, v.changed_at
      from workbench.udt_dataset_row_versions v
      join t on t.id = v.table_id
     where v.changed_at > now() - interval '30 days' and v.data is not null
  ), ranked as (
    select writes.table_id, row_number() over (partition by writes.table_id order by writes.at desc) as rn, writes.at from writes
  ), taken as (
    select ranked.table_id from ranked order by ranked.rn, ranked.at desc limit v_cap
  )
  select coalesce(jsonb_object_agg(x.table_id::text, x.n), '{}'::jsonb) into v_share
    from (select taken.table_id, count(*) as n from taken group by taken.table_id) x;

  for v_t in
    select d.id, d.table_name
      from workbench.udt_datasets d
      join custom.record r on r.organization_id = p_org and r.id = d.id and r.data_class = 'table'
                          and r.deleted_at is null and not coalesce((r.data ->> 'kept_by_the_app')::boolean, false)
     where d.organization_id = p_org and d.deleted_at is null
     order by d.table_name
  loop
    exit when v_judged >= v_cap;
    continue when coalesce((v_share ->> v_t.id::text)::integer, 0) = 0;
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
       ) x order by x.at desc
         limit least(coalesce((v_share ->> v_t.id::text)::integer, 0), greatest(v_cap - v_judged, 0)))
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
                  'total', v_total,
                  'capped', v_total > v_cap,
                  'examples', coalesce((select jsonb_agg(e.x) from (
                      select (c ->> 'table') || ': ' || (c ->> 'says') as x
                        from jsonb_array_elements(v_checks) c order by 1 limit 5) e), '[]'::jsonb)),
    'compared_at', now());
end;
$function$;
