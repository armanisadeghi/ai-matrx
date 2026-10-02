-- draft: VISION-REACH clone proof pending
-- target: branch,production
-- additive: yes
--   It ADDS two helpers, `custom.mask_history_data(jsonb, jsonb)` and
--   `custom.query_record_document(uuid, custom.record)` (EXECUTE to postgres only, as the store's
--   event trigger leaves every new custom function), and REPLACES six bodies, each declared below
--   with the body it was written against. No table, column, trigger, policy, grant or row of
--   anybody's data is touched. Locks: pg_proc row locks only.
--   Inverse: migrations/inverse/visionreach_w3_query_doors_mask_fields_down.sql
-- guard: custom/system_enabled
-- lock: custom
-- lane: VISION-REACH
-- based-on: custom.record_as_of(uuid, uuid, timestamp with time zone) cb93287880a902d77b9726d8d795e13eb032180a22bf5f08b25cd47b5ada1f58
-- based-on: custom.query_record_as_of(uuid, uuid, timestamp with time zone, date, text) ed863f0dc0dad7554f811a85e3dbf673c2ac699d384473981a06e0786639f312
-- based-on: custom.query_by_coordinates(uuid, uuid, jsonb, integer, integer, text) f779626f8a890b1e02c378ee4319d7d1f5fa01be0e5646ac60e60c111097f9a1
-- based-on: custom.query_across_homes(uuid, uuid, integer, integer, text) 038aafd6f15b52f81196cc46f5c0e057d6987126be32ff92bc183cbbf2d34d41
-- based-on: custom.query_rollup_sum(uuid, uuid[], text, text, text, integer, text) 55493d97a4089a420eca7a4f767715cadf4cd10f1de6109d9318fda46b29a8c6
-- based-on: custom.doors_not_masking_fields() 73b08724426e3e94da5309077b12e3f7239639d951668a1861bcf33ae62e6493
--
-- LANE 5 VISION-REACH, WAVE 3 — A FIELD A MEMBER MAY NOT SEE IS WITHHELD BY EVERY QUERY DOOR.
--
-- THE DEFECT (measured on the clone 2026-10-02, scripts/campaign-tests/visionreach_w3_query_doors_mask_fields.sql):
-- a member shared ONE patient record at `viewer`, whose `insurance_member_id` and
-- `outstanding_balance` Fields are `confidential`, got both values back UNMASKED from five
-- client-executable doors while custom.read_record withheld them from her in the same session:
--   custom.query_table_as_of / custom.query_record_as_of   the document, now or at a past moment
--   custom.query_by_coordinates / custom.query_across_homes the stored row (custom.choice_render(r.data))
--   custom.query_rollup_sum                                 the column's total
-- ONE CLASS: a door answering a record's document (or a number worked out of one Field) without
-- asking THE mask (custom.read_mask_for). custom.record_aggregate, custom.read_records*, drill-down
-- (platform.drill_rows -> custom.read_records_page) and the filters (custom.record_filter_sql)
-- were measured masking already and are untouched.
--
-- THE FIX: the history doors mask with the one history mask, lifted out of custom.record_as_of
-- (custom.mask_history_data) so the two cannot drift; the document doors hand back the read
-- door's document for this reader (custom.query_record_document: record_values_of -> read_mask_for
-- -> mask_document -> choice_render -> whole-value pointers, the steps read_records_by_ids takes);
-- the roll-up sum asks the aggregate door's own question (custom.agg_fields_readable_assert) of
-- every Table its walk reaches and refuses a withheld column by name. A store-owner lane (no person
-- in the session) reads exactly as before.
--
-- AND THE CENSUS LEARNS THE CLASS: custom.doors_not_masking_fields() also names a client door that
-- reaches `history.record_at` or hands back `custom.choice_render(..., r.data)` without the mask —
-- before this file it named none of the three document doors above (measured: it names exactly
-- those three with these patterns on the pre-fix bodies, and none after).

create function custom.mask_history_data(p_data jsonb, p_mask jsonb)
 returns jsonb
 language sql
 immutable
 set search_path to 'pg_catalog'
as $function$
  -- THE ONE HISTORY MASK (VISION-REACH W3, lifted byte for byte out of custom.record_as_of so
  -- the two history doors cannot drift): a stored document (or a past version of one) as a
  -- reader holding mask `p_mask` (custom.read_mask_for) may see it. A withheld key answers null;
  -- its envelope in `_values` loses its value and alternates and carries the withheld marker,
  -- keeping the version it names; every other `_` block is left out. Skipping it when the mask
  -- withholds nothing is the caller's choice; this helper always masks.
  select coalesce(
           (select jsonb_object_agg(
                     e.key,
                     case when custom.mask_says_withheld(p_mask, e.key)
                          then 'null'::jsonb else e.value end)
              from jsonb_each(coalesce(p_data, '{}'::jsonb)) e
             where left(e.key, 1) <> '_'),
           '{}'::jsonb)
         -- The envelopes carry the same values a second time; a withheld key's
         -- envelope goes with it, and the version it names is kept.
         || jsonb_build_object(
              '_values',
              coalesce(
                (select jsonb_object_agg(
                          e.key,
                          case when custom.mask_says_withheld(p_mask, e.key)
                               then (e.value - 'value' - 'alternates')
                                    || custom.withheld_marker(p_mask, e.key)
                               else e.value end)
                   from jsonb_each(coalesce(p_data -> '_values', '{}'::jsonb)) e),
                '{}'::jsonb));
$function$;

create function custom.query_record_document(p_principal uuid, p_row custom.record)
 returns jsonb
 language plpgsql
 stable
 set search_path to 'pg_catalog'
as $function$
declare
  v_mask     jsonb;
  v_visible  text[];
  v_declared text[];
  v_doc      jsonb;
begin
  -- ONE RECORD'S DOCUMENT AS THE READ DOOR HANDS IT TO THIS READER (VISION-REACH W3), for the
  -- query doors that answer whole documents (custom.query_by_coordinates, custom.query_across_homes).
  -- The same four steps custom.read_records_by_ids takes for each row, in the same order: the
  -- values (custom.record_values_of), THE mask at the rung this reader holds on this record
  -- (custom.read_mask_for + custom.mask_document — a Field she may not see is null and named in
  -- `_hidden`), the choice words, the whole-value pointers.
  if p_principal is null then
    -- THE STORE-OWNER LANE: no person in the session, and the door has already admitted the
    -- store's owner (custom.visible_predicate_sql). The stored document, exactly as before.
    return custom.choice_render(p_row.organization_id, p_row.table_id, p_row.data);
  end if;
  v_mask := custom.read_mask_for(p_principal, p_row.organization_id, p_row.table_id,
                                 custom.effective_level(p_principal, p_row.organization_id, p_row.id), 'read');
  select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_visible
    from jsonb_array_elements(v_mask -> 'visible') x;
  select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_declared
    from jsonb_array_elements(v_mask -> 'declared') x;
  v_doc := custom.choice_render(p_row.organization_id, p_row.table_id,
             custom.mask_document(custom.record_values_of(p_row), v_visible, v_mask -> 'notices', false,
                                  v_mask -> 'all_key_ids', v_declared));
  return custom.with_whole_value_pointers(v_doc, p_row.data -> '_values', p_row.data -> '_sources',
                                          v_visible, false, v_mask -> 'all_key_ids');
end;
$function$;


CREATE OR REPLACE FUNCTION custom.record_as_of(p_organization_id uuid, p_record_id uuid, p_at timestamp with time zone)
 RETURNS TABLE(state jsonb, replayed boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_mask jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.record_as_of');
  perform custom.assert_client_may_open(p_organization_id, p_record_id, 'custom.record_as_of',
                                        'viewer'::public.permission_level, 'record');

  -- The mask is taken on the record AS IT IS NOW, deliberately: sensitivity is a property of
  -- the Field today, not of the row in 2024. A field that is confidential now is confidential
  -- in every past version of the record, which is the only reading that cannot be walked
  -- around by asking for yesterday.
  v_mask := custom.read_mask(p_organization_id, p_record_id, 'read');

  return query
  select case
           when v_mask -> 'notices' = '{}'::jsonb then s.state
           else s.state
                || jsonb_build_object(
                     'data',
                     -- VISION-REACH W3: the one history mask (custom.mask_history_data), shared
                     -- with custom.query_record_as_of.
                     custom.mask_history_data(s.state -> 'data', v_mask))
                || jsonb_build_object('_hidden', v_mask -> 'notices')
         end,
         s.replayed
    from custom.record_state_as_of(p_record_id, p_at) s;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.query_record_as_of(p_organization_id uuid, p_record_id uuid, p_recorded_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_world_on date DEFAULT NULL::date, p_required text DEFAULT 'viewer'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_doc jsonb;
  v_out jsonb := '{}'::jsonb;
  v_eff jsonb := '{}'::jsonb;
  v_key text;
  v_ans jsonb;
  v_on  date;
  v_user  uuid := custom.query_principal();
  v_table uuid;
  v_mask  jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.query_record_as_of');
  -- Visibility first and through the same helper: history is not a side door into rows the
  -- principal may not read today.
  if not custom.query_can_see(p_organization_id, p_record_id, p_required) then
    return null;
  end if;

  -- CLOCK ONE, the system clock: what the store SAID at that moment.
  if p_recorded_at is null then
    select r.data into v_doc from custom.record r
     where r.organization_id = p_organization_id and r.id = p_record_id;
  else
    v_doc := history.record_at(p_organization_id, p_record_id, p_recorded_at);
    v_doc := coalesce(v_doc -> 'data', v_doc);
  end if;
  if v_doc is null then
    return null;
  end if;

  -- CLOCK TWO, the world clock: what was TRUE on that date, inside the document clock one just
  -- chose. IT ALWAYS RUNS. Leaving it off for "no date given" is what let a period starting in
  -- 2027 answer as the record's present value, because the fall-through read the plain key.
  v_on := coalesce(p_world_on, current_date);

  for v_key in select jsonb_object_keys(v_doc) loop
    continue when v_key = '_values';        -- the envelope itself, passed through below
    v_ans := history.value_in_force(v_doc, v_key, v_on);
    v_out := v_out || jsonb_build_object(v_key, v_ans -> 'value');
    if (v_ans ->> 'dated')::boolean then
      v_eff := v_eff || jsonb_build_object(v_key, v_ans - 'dated' - 'value');
    end if;
  end loop;

  if v_doc ? '_values' then
    v_out := v_out || jsonb_build_object('_values', v_doc -> '_values');
  end if;
  -- VISION-REACH W3 (2026-10-02): A FIELD THIS READER MAY NOT SEE IS WITHHELD HERE TOO. Before
  -- this, a member who may not read a confidential Field got its value back from this door (and
  -- from custom.query_table_as_of, which pages it) while custom.read_record withheld it from her
  -- in the same session. The mask is THE mask — custom.read_mask_for at the rung she holds on
  -- this record NOW, exactly what custom.record_as_of takes (sensitivity is a property of the
  -- Field today, so yesterday's version is masked by today's rule) — and the document is masked
  -- by the one history mask, custom.mask_history_data. A withheld key's effective date goes with
  -- it. The store-owner lane (no person in the session, already admitted by query_can_see) reads
  -- unmasked, as every server lane does.
  if v_user is not null then
    select r.table_id into v_table
      from custom.record r
     where r.organization_id = p_organization_id and r.id = p_record_id;
    v_mask := custom.read_mask_for(v_user, p_organization_id, v_table,
                                   custom.effective_level(v_user, p_organization_id, p_record_id), 'read');
    if coalesce(v_mask -> 'notices', '{}'::jsonb) <> '{}'::jsonb then
      v_out := custom.mask_history_data(v_out, v_mask);
      v_eff := coalesce((select jsonb_object_agg(e.key, e.value) from jsonb_each(v_eff) e
                          where not custom.mask_says_withheld(v_mask, e.key)), '{}'::jsonb);
      v_out := v_out || jsonb_build_object('_hidden', v_mask -> 'notices');
    end if;
  end if;
  if v_eff <> '{}'::jsonb then
    -- VISIBLE NOW, WITH ITS EFFECTIVE DATE. One entry per dated key: whether it is in force on
    -- the date asked about, and the date it starts or stopped being true.
    v_out := v_out || jsonb_build_object('_effective', v_eff);
  end if;
  return v_out;
end;
$function$;

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
  if p_table_id is not null then
    perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.query_by_coordinates');
  end if;
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

  return query execute format($q$
  with coord as (
    select ord                                        as n,
           c ->> 'role'                               as role,
           (c ->> 'target_id')::uuid                  as target_id,
           coalesce(c ->> 'direction', 'from')        as direction
      from jsonb_array_elements(coalesce($1, '[]'::jsonb))
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
        on a.organization_id = $2
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
    having count(distinct n) = $3
  )
  -- VISION-REACH W3: the record's document as the read door hands it to THIS reader — a Field
  -- she may not see is withheld and named (custom.query_record_document), never the stored row.
  select r.id, r.table_id, custom.query_record_document(custom.query_principal(), r), coalesce(s.matched, 0)
    from custom.record r
    left join satisfied s on s.rec_id = r.id
   where r.organization_id = $2
     and ($4::uuid is null or r.table_id = $4::uuid)
     and r.deleted_at is null
     and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
     and %s
     and ($3 = 0 or s.rec_id is not null)
   order by r.created_at desc, r.id
   limit $5 offset $6
  $q$, custom.visible_predicate_sql(custom.query_principal(), p_organization_id, p_table_id,
                                    p_required::public.permission_level, 'r'))
  using coalesce(p_coordinates, '[]'::jsonb), p_organization_id, v_n, p_table_id,
        custom.page_size(p_organization_id, 'custom.query_by_coordinates', p_limit, 50), greatest(coalesce(p_offset, 0), 0);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.query_across_homes(p_organization_id uuid, p_table_id uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_required text DEFAULT 'viewer'::text)
 RETURNS TABLE(record_id uuid, home_record_id uuid, data jsonb, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.query_across_homes');
  if p_organization_id is null or p_table_id is null then
    raise exception 'custom.query_across_homes: the organization and the Table are both required'
      using errcode = '22004';
  end if;

  return query execute format($q$
  with homes as (select h from custom.query_table_homes($1, $2) h)
  select r.id,
         -- The record's own Home: the nearest ancestor in its containment chain that is one
         -- of this Table's Homes. A record directly under a Home has depth 1; a record three
         -- containers down still reports the Home it ultimately sits in.
         (select c.ancestor_id
            from custom.containment_chain($1, r.id) c
            join homes on homes.h = c.ancestor_id
           order by c.depth
           limit 1),
         -- VISION-REACH W3: the document as the read door hands it to THIS reader
         -- (custom.query_record_document), never the stored row.
         custom.query_record_document(custom.query_principal(), r),
         r.created_at
    from custom.record r
   where r.organization_id = $1
     and r.table_id = $2
     and r.deleted_at is null
     and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
     and %s
   order by r.created_at desc, r.id
   limit $3 offset $4
  $q$, custom.visible_predicate_sql(custom.query_principal(), p_organization_id, p_table_id,
                                    p_required::public.permission_level, 'r'))
  using p_organization_id, p_table_id,
        custom.page_size(p_organization_id, 'custom.query_across_homes', p_limit, 50), greatest(coalesce(p_offset, 0), 0);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.query_rollup_sum(p_organization_id uuid, p_roots uuid[], p_field_key text, p_flavor text DEFAULT NULL::text, p_role text DEFAULT NULL::text, p_max_depth integer DEFAULT 33, p_required text DEFAULT 'viewer'::text)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.query_rollup_sum');
  -- VISION-REACH W3 (2026-10-02): ADDING UP A COLUMN IS READING IT. Before this, a member who may
  -- not read a confidential Field got its total from this door. Every Table the walk reaches is
  -- asked the aggregate door's own question (custom.agg_fields_readable_assert, the check
  -- custom.agg_sql makes for a measure), so a column she may not read is refused by its name.
  perform custom.agg_fields_readable_assert(p_organization_id, t.table_id, array[p_field_key], p_required)
     from (select distinct r.table_id
             from custom.query_rollup(p_organization_id, p_roots, p_flavor, p_role, p_max_depth, p_required) k
             join custom.record r on r.organization_id = p_organization_id and r.id = k.record_id
            where r.table_id is not null) t;
  return (
-- The value is read out of the Value ENVELOPE when there is one (`{"value": …}`) and out of
  -- the plain key when there is not, which is the same reading every other surface does.
  -- VISION-REACH W2: a key the record does not STORE (a formula, lookup or roll-up column, worked
  -- out when the record is read) is read through the read path's own one-column answer, so a
  -- roll-up of a formula is its real total and never a silent 0.
  select coalesce(sum(nullif(
           case when not (r.data ? p_field_key)
                  then custom.agg_value_text(custom.record_value_one(p_organization_id, r.id, p_field_key))
                when jsonb_typeof(r.data -> p_field_key) = 'object'
                      and (r.data -> p_field_key) ? 'value'
                then r.data -> p_field_key ->> 'value'
                else r.data ->> p_field_key end, '')::numeric), 0)
    from custom.query_rollup(p_organization_id, p_roots, p_flavor, p_role, p_max_depth, p_required) k
    join custom.record r on r.organization_id = p_organization_id and r.id = k.record_id
  );
end;
$function$;

CREATE OR REPLACE FUNCTION custom.doors_not_masking_fields()
 RETURNS TABLE(function_name text, identity_args text, why text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  with body as (
    select p.oid, p.proname,
           regexp_replace(pg_get_functiondef(p.oid), '--[^' || chr(10) || ']*', '', 'g') as src
      from pg_proc p
     where p.pronamespace = 'custom'::regnamespace
       and has_function_privilege('authenticated', p.oid, 'EXECUTE')
       and p.prorettype not in ('pg_catalog.trigger'::regtype, 'pg_catalog.event_trigger'::regtype)
  )
  select b.proname::text,
         pg_get_function_identity_arguments(b.oid),
         case when b.src ~* '(custom\.record_values(_of)?\M|custom\.record_state_as_of|custom\.history_changes|history\.row_versions|history\.record_versions|history\.record_at\M|custom\.choice_render\([^()]*\mr\.data\M)'
              then 'a client may execute it, it reaches a RAW value source (custom.record_values, '
                   'custom.record_values_of, custom.record_state_as_of, custom.history_changes, '
                   'history.record_at, custom.choice_render over the stored r.data, '
                   'history.row_versions or custom.record directly) and its body never reaches '
                   'custom.read_mask or the two doors that already carry it, so a Field this reader '
                   'may not see leaves the store'
              else 'a client may execute it, it reads a standard table''s custom_fields by registry '
                   'token (custom.entity_table and an EXECUTE over custom_fields) and its body never '
                   'reaches custom.entity_read_mask, so a Field this reader may not see leaves the store'
         end::text
    from body b
   where (b.src ~* '(custom\.record_values(_of)?\M|custom\.record_state_as_of|custom\.history_changes|history\.row_versions|history\.record_versions|history\.record_at\M|custom\.choice_render\([^()]*\mr\.data\M)'
          and b.src !~* '(custom\.read_mask|custom\.mask_says_withheld|custom\.read_record\M|custom\.read_records\M|custom\.record_values_versioned)')
      or (b.src ~* 'custom\.entity_table\('
          and b.src ~* '\mcustom_fields\M'
          and b.src ~* '\mexecute\s+format\M'
          and b.src !~* 'custom\.entity_read_mask')
   order by 1;
$function$;
