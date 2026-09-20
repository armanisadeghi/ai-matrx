-- STORE-REL 4's inverse — the nine doors without the VIS-5 question, so every one of them
-- describes a Table the caller may not know exists again.

drop function if exists custom.tables_described_without_asking();

-- ── tables_at_home, as it stood before STORE-REL
CREATE OR REPLACE FUNCTION custom.tables_at_home(p_organization_id uuid, p_home_ids uuid[])
 RETURNS TABLE(table_id uuid, home_record_id uuid, kind text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.tables_at_home');
  return query
select h.table_id, h.home_record_id, h.kind
    from custom.home h
   where h.organization_id = p_organization_id
     and h.home_record_id = any (p_home_ids);
end;
$function$;

-- ── query_table_homes, as it stood before STORE-REL
CREATE OR REPLACE FUNCTION custom.query_table_homes(p_organization_id uuid, p_table_id uuid)
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.query_table_homes');
  return query
-- Both ways a Table declares a Home: the containment parent it was declared under, and
  -- every carrying `home` relation `custom.home_add` writes. One list, deduplicated, because
  -- "every Home" must not depend on which mechanism named it.
  select home_record_id from custom.home
   where organization_id = p_organization_id and table_id = p_table_id
  union
  select home_record_id from custom.home_relations()
   where organization_id = p_organization_id and table_id = p_table_id;
end;
$function$;

-- ── io_export, as it stood before STORE-REL
CREATE OR REPLACE FUNCTION custom.io_export(p_organization_id uuid, p_table_id uuid, p_columns text[] DEFAULT NULL::text[], p_limit integer DEFAULT 10000, p_required text DEFAULT 'viewer'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_cols  text[];
  v_token text;
  v_rows  jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.io_export');
  perform custom.assert_store_door(p_organization_id, 'custom.io_export');

  select t.data ->> 'token' into v_token from custom.record t
   where t.organization_id = p_organization_id and t.id = p_table_id;

  -- The column list is the TABLE's own Fields unless the caller named one. Exporting whatever
  -- keys happen to be in the documents would ship whatever an older shape left behind.
  v_cols := coalesce(p_columns,
    (select array_agg(f.data ->> 'key' order by coalesce((f.data ->> 'sort')::int, 0),
                                                 f.data ->> 'key')
       from custom.applicable_fields(p_organization_id, p_table_id, null) f),
    (select array_agg(k order by k)
       from (select distinct jsonb_object_keys(r.data) k
               from custom.record r
              where r.organization_id = p_organization_id
                and r.table_id = p_table_id
                and r.deleted_at is null) ks
      where left(k, 1) <> '_'),
    array[]::text[]);

  -- THE READ DOOR DECIDES WHICH ROWS. `custom.query_visible_ids` answers SETOF uuid, so it is
  -- an id set and not a joinable row source; an export that selected from custom.record
  -- directly would hand a viewer every row in the organization, which is the single worst bug
  -- an export can have.
  select coalesce(jsonb_agg(r.doc order by r.created_at, r.id), '[]'::jsonb) into v_rows
    from (select rec.id, rec.created_at,
                 (select coalesce(jsonb_object_agg(c, coalesce(lv.vals -> c, 'null'::jsonb)),
                                  '{}'::jsonb)
                    from unnest(v_cols) c) as doc
            from custom.record rec
     cross join lateral (select custom.record_values(p_organization_id, rec.id) as vals) lv
           where rec.organization_id = p_organization_id
             and rec.table_id = p_table_id
             and rec.deleted_at is null
             and rec.id in (select custom.query_visible_ids(p_organization_id, p_table_id, p_required))
           order by rec.created_at, rec.id
           limit greatest(1, least(coalesce(p_limit, 10000), 100000))) r;

  return jsonb_build_object('table_id', p_table_id, 'token', v_token,
                            'columns', to_jsonb(v_cols), 'rows', v_rows);
end;
$function$;

-- ── table_capacity, as it stood before STORE-REL
CREATE OR REPLACE FUNCTION custom.table_capacity(p_organization_id uuid, p_table_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_records bigint;
  v_ceiling integer;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.table_capacity');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_capacity');

  v_ceiling := custom.table_record_ceiling(p_organization_id);
  select count(*) into v_records
    from custom.record r
   where r.organization_id = p_organization_id
     and r.table_id = p_table_id
     and r.deleted_at is null;

  return jsonb_build_object(
    'records',   v_records,
    'ceiling',   v_ceiling,
    'remaining', greatest(v_ceiling - v_records, 0),
    'over',      v_records > v_ceiling,
    'knob',      'custom/table_record_ceiling',
    'says',      case
                   when v_records > v_ceiling then
                     format('this table holds %s records, which is more than the %s it is set up for', v_records, v_ceiling)
                   else
                     format('this table holds %s of the %s records it is set up for', v_records, v_ceiling)
                 end);
end $function$;

-- ── applicable_fields, as it stood before STORE-REL
CREATE OR REPLACE FUNCTION custom.applicable_fields(p_organization_id uuid, p_table_id uuid, p_record_type text DEFAULT NULL::text)
 RETURNS SETOF custom.record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  -- The decision comes BEFORE the read, so a foreign organization id and an invented one
  -- answer identically: both are refused, neither is told whether the table exists.
  perform custom.assert_store_door(p_organization_id, 'custom.applicable_fields');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.applicable_fields');

  return query
    select f.*
      from custom.record f
     where f.organization_id = p_organization_id
       and f.table_id = custom.field_kernel_id()
       and f.deleted_at is null
       and (f.data ->> 'entity_definition_id')::uuid = p_table_id
       and (jsonb_array_length(coalesce(f.data -> 'applies_to_types', '[]'::jsonb)) = 0
            or (p_record_type is not null
                and coalesce(f.data -> 'applies_to_types', '[]'::jsonb) ? p_record_type));
end $function$;

-- ── record_aggregate, as it stood before STORE-REL
CREATE OR REPLACE FUNCTION custom.record_aggregate(p_organization_id uuid, p_table_id uuid, p_group_by jsonb DEFAULT '[]'::jsonb, p_measures jsonb DEFAULT '[]'::jsonb, p_bucket jsonb DEFAULT NULL::jsonb, p_filter jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 200, p_required text DEFAULT 'viewer'::text)
 RETURNS TABLE(groups jsonb, measures jsonb, row_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.record_aggregate');
  return query execute custom.agg_sql(p_organization_id, p_table_id, p_group_by, p_measures,
                                      p_bucket, p_filter, p_limit, p_required);
end;
$function$;

-- ── agg_explain, as it stood before STORE-REL
CREATE OR REPLACE FUNCTION custom.agg_explain(p_organization_id uuid, p_table_id uuid, p_group_by jsonb DEFAULT '[]'::jsonb, p_measures jsonb DEFAULT '[]'::jsonb, p_bucket jsonb DEFAULT NULL::jsonb, p_filter jsonb DEFAULT '{}'::jsonb, p_required text DEFAULT 'viewer'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_plan jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.agg_explain');
  execute 'explain (analyze, format json, timing off, summary off) ' ||
          custom.agg_sql(p_organization_id, p_table_id, p_group_by, p_measures,
                         p_bucket, p_filter, 200, p_required)
    into v_plan;
  return v_plan;
end;
$function$;

-- ── read_records, as it stood before STORE-REL
CREATE OR REPLACE FUNCTION custom.read_records(p_organization_id uuid, p_table_id uuid, p_by_id boolean DEFAULT false, p_limit integer DEFAULT 200, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, document jsonb, level permission_level)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me       uuid := auth.uid();
  v_rec      record;
  v_level    public.permission_level;
  v_visible  text[];
  v_declared text[];
  v_notices  jsonb;
  v_key_ids  jsonb;
begin
  if v_me is null then
    raise exception 'Nobody is signed in, so there is nothing to read.'
      using errcode = '42501',
            hint = 'DOOR-1: the read door resolves the reader from the session and takes no principal argument. Sign in, or call it from a lane that carries a person.';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 1000 then p_limit := 200; end if;

  -- STEP 2, once per table per request: which fields this caller may see, at which level.
  -- The level used for the field question is the caller's level on the TABLE, so a page of
  -- a hundred records asks the field question once, not a hundred times (DOOR-10's shape).
  v_level := custom.effective_level(v_me, p_organization_id, p_table_id);

  select coalesce(array_agg(f.field_key), '{}'::text[])
    into v_visible
    from iam.visible_field_ids(v_me, p_organization_id, p_table_id, v_level, 'read') f;

  select coalesce(jsonb_object_agg(f.data ->> 'key', custom.hidden_field_notice(f, 'read')), '{}'::jsonb),
         coalesce(jsonb_object_agg(f.data ->> 'key', f.id::text), '{}'::jsonb),
         coalesce(array_agg(f.data ->> 'key'), '{}'::text[])
    into v_notices, v_key_ids, v_declared
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = p_table_id;

  -- Only the fields that are actually hidden get a notice.
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
    into v_notices
    from jsonb_each(v_notices) e
   where not (e.key = any (v_visible));

  -- STEP 1, per row: Visibility. `custom.visible_record_ids` is the set-based answer, and
  -- the door reads it rather than asking per row (VIS-N-1).
  for v_rec in
    select r.id, custom.record_values(r.organization_id, r.id) as doc
      from custom.record r
     where custom.has_visibility(v_me, 'record', r.id, 'viewer')
       and r.organization_id = p_organization_id
       and r.table_id = p_table_id
       and r.deleted_at is null
     order by r.created_at desc
     limit p_limit offset p_offset
  loop
    id := v_rec.id;
    document := custom.mask_document(v_rec.doc, v_visible, v_notices, p_by_id, v_key_ids, v_declared);
    level := v_level;
    return next;
  end loop;
end;
$function$;

-- ── query_by_coordinates, as it stood before STORE-REL
CREATE OR REPLACE FUNCTION custom.query_by_coordinates(p_organization_id uuid, p_table_id uuid DEFAULT NULL::uuid, p_coordinates jsonb DEFAULT '[]'::jsonb, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_required text DEFAULT 'viewer'::text)
 RETURNS TABLE(record_id uuid, table_id uuid, data jsonb, coordinates_matched integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_n integer;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.query_by_coordinates');
  if p_organization_id is null then
    raise exception 'custom.query_by_coordinates: organization_id is required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;
  if jsonb_typeof(coalesce(p_coordinates, '[]'::jsonb)) <> 'array' then
    raise exception 'custom.query_by_coordinates: p_coordinates is a JSON ARRAY of coordinates, one object per relation end; got %',
                    jsonb_typeof(p_coordinates)
      using errcode = '22023',
            hint = 'e.g. [{"role":"client","target_id":"…"},{"role":"project","target_id":"…","direction":"to"}]. An empty array means no coordinate constraint, which is the whole Table.';
  end if;

  select count(*) into v_n from jsonb_array_elements(coalesce(p_coordinates, '[]'::jsonb));

  return query
  with coord as (
    select ord                                        as n,
           c ->> 'role'                               as role,
           (c ->> 'target_id')::uuid                  as target_id,
           coalesce(c ->> 'direction', 'from')        as direction
      from jsonb_array_elements(coalesce(p_coordinates, '[]'::jsonb))
           with ordinality as t(c, ord)
  ),
  -- ONE pass over the edges: every record that satisfies at least one coordinate, with the
  -- count of DISTINCT coordinates it satisfies. Two edges answering the same coordinate count
  -- once, which is why `distinct co.n` and not `count(*)`.
  hit as (
    select case when co.direction = 'to' then a.source_id else a.target_id end as other_id,
           case when co.direction = 'to' then a.target_id else a.source_id end as rec_id,
           co.n
      from coord co
      join platform.associations a
        on a.organization_id = p_organization_id
       and a.deleted_at is null
       and a.relation_field_id is not null
       and (co.role is null or a.role = co.role)
       and ((co.direction = 'from' and a.source_type = 'record'
             and a.target_id = co.target_id)
         or (co.direction = 'to'
             and a.source_id = co.target_id))
  ),
  satisfied as (
    select rec_id, count(distinct n)::integer as matched
      from hit
     group by rec_id
    having count(distinct n) = v_n
  )
  select r.id, r.table_id, r.data, coalesce(s.matched, 0)
    from custom.query_visible_ids(p_organization_id, p_table_id, p_required) v
    join custom.record r
      on r.organization_id = p_organization_id and r.id = v
    left join satisfied s on s.rec_id = v
   where v_n = 0 or s.rec_id is not null
   order by r.created_at desc, r.id
   limit greatest(coalesce(p_limit, 50), 0)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$function$;

