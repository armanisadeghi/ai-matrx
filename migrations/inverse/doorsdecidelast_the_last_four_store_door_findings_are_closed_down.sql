-- INVERSE of migrations/campaign/doorsdecidelast_the_last_four_store_door_findings_are_closed.sql (lane DOORS-DECIDE-LAST).
-- Puts back the seven bodies the up file replaced (the door-row trigger, the two census bodies, the six
-- SQL-language bodies), drops custom.store_census_pair_ceiling(), and the two door rows' old signature text; the three-argument iam.accessible_entity_ids is SECURITY DEFINER with its own search_path again (its body never changed).
-- Rule-27 use only: with it applied, check:store-doors-decide is red on the same four findings again.
-- based-on: public.is_super_admin() c9c9f7922eb8cbe047b2e56c0621f8978f2ae5668d32de074f6157939ae949d6
-- based-on: iam.read_lane_v2_auth_reads_id(regclass) 47c126dc869f50bcdfba8f4f5715415a99d9aa609d694f7c27a66a17a5b5f5a0
-- based-on: iam.read_lane_v2_edge_emits(text, text, text) e80f0cd319ea1f516a57984b60d1dac1c34daf8f27f0de18846c018dcb22d5f5
-- based-on: iam.read_lane_v2_enrolled(text) 5304c635b37f9e3fe0ad4232085a272d9b2a6cf9d4c8fb2bd5db9658d46bdc5e
-- based-on: iam.entity_read_kernel_fingerprint() 2d62b1795bdabf271dac50263ae5d048d7233cb410f5e6c7553dacae2283d696
-- based-on: platform.door_identity_is_the_catalogs() d1cad734d298d1ea207829e5d05b0177d71901e782c80c32163836e2827857fc
-- based-on: custom.shared_only_disagreements(text) 5fd012fe0dd80ced2e8fdeae8b2943b1c2175c7882aed09d0e770dff0555969d
-- based-on: custom.list_door_disagreements(text, uuid, integer, boolean) db33faa7dc1eb635bd7d01da875597ba9ff99ca93377582e3cfe77324fa1ff8a
-- lane: DOORS-DECIDE-LAST

ALTER FUNCTION iam.accessible_entity_ids(text, permission_level, integer) SECURITY DEFINER;
ALTER FUNCTION iam.accessible_entity_ids(text, permission_level, integer) SET search_path TO 'pg_catalog', 'public', 'platform', 'iam';


CREATE OR REPLACE FUNCTION public.is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.is_super_admin_for((SELECT auth.uid()));
$function$;


CREATE OR REPLACE FUNCTION iam.read_lane_v2_auth_reads_id(p_rel regclass)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select exists (select 1 from pg_attribute a where a.attrelid = p_rel and a.attname = 'id' and not a.attisdropped)
     and has_schema_privilege('authenticated', (select c.relnamespace from pg_class c where c.oid = p_rel), 'USAGE')
     and has_column_privilege('authenticated', p_rel, 'id', 'SELECT')
$function$;


CREATE OR REPLACE FUNCTION iam.read_lane_v2_edge_emits(p_child text, p_parent text, p_fk text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select iam.read_lane_v2_enrolled(p_child)
     and iam.read_lane_v2_edge_structural_ok(p_child, p_parent, p_fk)
     and iam.read_lane_v2_depth(p_parent) <= 1
$function$;


CREATE OR REPLACE FUNCTION iam.read_lane_v2_enrolled(p_token text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select exists (select 1 from iam.read_lane_v2_rollout r where r.token = p_token)
$function$;


CREATE OR REPLACE FUNCTION iam.entity_read_kernel_fingerprint()
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$

  -- Ordered by IDENTITY, so the hash is stable across catalog reordering AND across
  -- databases. It used to end `order by … p.oid::text`, which is neither: an OID is
  -- assigned per database, so production's three iam.has_access_for_base overloads sorted
  -- 1700097/1700098/4422507 and the rehearsal branch's sorted 109931/56365/56366 (as TEXT),
  -- and the same sixteen bodies hashed differently on the two databases. The value this
  -- returns is unchanged on production: 2c20acc18f73ab979f0eb8f0e39c8c42, measured both
  -- ways, read-only, 2026-09-17.
  select md5(string_agg(p.prosrc, '|' order by n.nspname, p.proname,
                        pg_get_function_identity_arguments(p.oid)))
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where (n.nspname, p.proname) in (
    ('iam','has_access_for'), ('iam','has_access_for_base'),
    ('iam','accessible_entity_ids'), ('iam','has_org_access_for'),
    ('files','has_access_for'), ('files','is_crawl_artifact'),
    ('files','crawl_site_conveys'),
    ('platform','entity_row_access_attrs'),
    ('public','user_can_read_via_library_grant'), ('public','library_is_open'),
    ('public','is_rulebook_curator'), ('public','is_pack_curator'),
    ('public','_edu_can_read_via_assignment'), ('public','has_permission_for'),
    ('public','is_org_admin_for'), ('public','user_can_read_data_store_via_grant')
  );
$function$;


CREATE OR REPLACE FUNCTION platform.door_identity_is_the_catalogs()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'platform', 'public', 'pg_catalog'
AS $function$
declare
  v_candidates int;
  v_render     text;
begin
  if new.identity_argtypes is null then
    -- A row written by a lane that predates this column, or by hand. Resolve it
    -- from the catalog the same way the backfill did, and say so.
    select count(*) into v_candidates
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = new.schema_name and p.proname = new.function_name
       and pg_get_function_identity_arguments(p.oid) = new.identity_args;
    if v_candidates = 1 then
      select platform.door_argtypes(p.proargtypes) into new.identity_argtypes
        from pg_catalog.pg_proc p
        join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname = new.schema_name and p.proname = new.function_name
         and pg_get_function_identity_arguments(p.oid) = new.identity_args;
      return new;
    end if;
    select count(*) into v_candidates
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = new.schema_name and p.proname = new.function_name;
    if v_candidates = 1 then
      select platform.door_argtypes(p.proargtypes) into new.identity_argtypes
        from pg_catalog.pg_proc p
        join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname = new.schema_name and p.proname = new.function_name;
      return new;
    end if;
    raise exception
      'platform.client_callable_door: cannot register a door for %.% — the identity_args you gave (%) name no live function of that name under this session search_path (%), and % overload(s) exist, so the row cannot be resolved to one. Register the door from a migration that runs under the same search_path as the function definition, or pass identity_argtypes yourself: platform.door_argtypes(proargtypes) of the function you mean. (DD-223.)',
      new.schema_name, new.function_name, new.identity_args,
      current_setting('search_path'), v_candidates
      using errcode = '23514';
  end if;

  if not exists (
        select 1 from pg_catalog.pg_proc p
        join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname = new.schema_name and p.proname = new.function_name
         and platform.door_argtypes(p.proargtypes) = new.identity_argtypes) then
    select coalesce(string_agg(format('%s(%s)', p.proname, pg_get_function_identity_arguments(p.oid)), ', '), '(no function of that name)')
      into v_render
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = new.schema_name and p.proname = new.function_name;
    raise exception
      'platform.client_callable_door: the identity_argtypes on this row name no live function %.% — the catalog holds: %. A door row is a stand-down for the §6d-4 guard, so it may only name a function that exists. (DD-223.)',
      new.schema_name, new.function_name, v_render
      using errcode = '23514';
  end if;
  return new;
end $function$;


CREATE OR REPLACE FUNCTION custom.shared_only_disagreements(p_pretend text DEFAULT NULL::text)
 RETURNS TABLE(organization_id uuid, organization_name text, member_id uuid, record_id uuid, table_id uuid, ladder boolean, read_door boolean, rls_mirror boolean, why text)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_org      record;
  v_member   uuid;
  v_table    uuid;
  v_pairs    bigint;
  v_ceiling  integer := custom.read_door_ladder_ceiling();
  v_pred     text;
  v_mirror   text;
  v_claims   text;
  v_saved    text;
  -- THE MIRROR, ONCE PER MEMBER. `v_orgs` is every organization this run will judge, so one
  -- evaluation serves all of them; `v_mirror_ids` caches the answer per member id.
  v_orgs     uuid[];
  v_mirror_ids jsonb := '{}'::jsonb;
  v_ids      uuid[];
begin
  if p_pretend is not null and p_pretend not in ('mirror_forgets_the_knob', 'door_refuses_the_share') then
    raise exception 'custom.shared_only_disagreements: p_pretend is null, ''mirror_forgets_the_knob'' or ''door_refuses_the_share'', not %', p_pretend;
  end if;

  -- The mirror's own text, once. The `pretend` variant is the SAME expression with the one
  -- conjunct this lane added taken back out, so a red run is the mirror as it really was.
  v_mirror := iam.entity_read_expr('custom', 'record', 'record');
  if p_pretend = 'mirror_forgets_the_knob' then
    v_mirror := replace(v_mirror,
      ' and (not custom.store_is_open(organization_id) or iam.member_lane_open(organization_id))', '');
  end if;

  v_saved := coalesce(current_setting('request.jwt.claims', true), '');

  -- 🚨 THE ONE-PER-MEMBER MIRROR IS SCOPED TO THE ORGANIZATIONS THIS RUN WILL ACTUALLY JUDGE.
  -- An organization over `custom.read_door_ladder_ceiling()` is reported `unmeasured` and its
  -- rows are never compared, so sweeping them into the per-member mirror query buys nothing and
  -- costs everything: a 100,007-record organization landed on this database at 08:36Z and the
  -- mirror query went from ~200 rows per member to ~100,200, which is what a census that used
  -- to return in 178 s dying on the clock looked like. The ceiling decides the scope, once.
  select coalesce(array_agg(o.id), '{}'::uuid[]) into v_orgs
    from iam.organizations o
   where custom.store_is_open(o.id)
     and not iam.member_lane_open(o.id)
     and (select count(*)
            from iam.memberships m
            join custom.record r on r.organization_id = o.id and r.deleted_at is null
           where m.organization_id = o.id
             and m.container_type = 'organization'
             and m.status = 'active') <= v_ceiling;

  for v_org in
    select o.id, o.name
      from iam.organizations o
     where custom.store_is_open(o.id)
       and not iam.member_lane_open(o.id)
     order by o.name
  loop
    -- UNMEASURED IS NOT PASSED.
    select count(*) into v_pairs
      from iam.memberships m
      join custom.record r on r.organization_id = v_org.id and r.deleted_at is null
     where m.organization_id = v_org.id
       and m.container_type = 'organization'
       and m.status = 'active';
    if v_pairs > v_ceiling then
      organization_id := v_org.id; organization_name := v_org.name;
      member_id := null; record_id := null; table_id := null;
      ladder := null; read_door := null; rls_mirror := null;
      why := format('unmeasured: %s (member, record) pairs, over the ceiling of %s. Raise '
                 || 'custom.read_door_ladder_ceiling(), or census this organization on its own.',
                 v_pairs, v_ceiling);
      return next;
      continue;
    end if;

    for v_member in
      select m.user_id from iam.memberships m
       where m.organization_id = v_org.id and m.container_type = 'organization'
         and m.status = 'active'
       order by m.user_id
    loop
      v_claims := json_build_object('sub', v_member::text, 'role', 'authenticated')::text;
      perform set_config('request.jwt.claims', v_claims, true);

      -- 🚨 THE MIRROR IS ASKED ONCE PER MEMBER, NOT ONCE PER ROW. Its verdict is a function
      -- of the member and the row's own columns; the expensive part of it
      -- (`iam.accessible_entity_ids` -> `custom.visible_record_ids`, the per-row ladder over
      -- every record on the database) depends on the member ALONE. Evaluated inside a
      -- correlated per-row subquery it was re-entered for every row and the census never
      -- returned. Evaluated here it runs once and answers for every row of every
      -- `shared_only` organization this member belongs to. Same text, same verdict.
      if v_mirror_ids -> v_member::text is null then
        execute format($q$
          select coalesce(array_agg(id), '{}'::uuid[])
            from custom.record
           where organization_id = any (%L::uuid[])
             and deleted_at is null
             and (%s)
        $q$, v_orgs, v_mirror) into v_ids;
        v_mirror_ids := v_mirror_ids || jsonb_build_object(v_member::text, to_jsonb(v_ids));
      end if;
      select coalesce(array_agg(x::uuid), '{}'::uuid[]) into v_ids
        from jsonb_array_elements_text(v_mirror_ids -> v_member::text) x;

      for v_table in
        select distinct r.table_id from custom.record r
         where r.organization_id = v_org.id and r.deleted_at is null
         order by 1
      loop
        -- THE DOOR'S OWN PREDICATE, built the way the door builds it.
        if p_pretend = 'door_refuses_the_share' then
          v_pred := 'false';
        else
          v_pred := custom.visible_predicate_sql(v_member, v_org.id, v_table,
                                                 'viewer'::public.permission_level, 'r');
        end if;

        -- THE THREE ANSWERS, IN ONE PASS OVER THE TABLE'S ROWS, compared in the next.
        for organization_id, organization_name, member_id, record_id, table_id,
            ladder, read_door, rls_mirror in execute format($q$
          select %L::uuid, %L::text, %L::uuid, r.id, r.table_id,
                 custom.has_visibility(%L::uuid, 'record', r.id, 'viewer'::public.permission_level) as ladder,
                 (%s) as read_door,
                 (r.id = any (%L::uuid[])) as rls_mirror
            from custom.record r
           where r.organization_id = %L::uuid
             and r.table_id is not distinct from %L::uuid
             and r.deleted_at is null
        $q$, v_org.id, v_org.name, v_member, v_member, v_pred, v_ids, v_org.id, v_table)
        loop
          -- THE TWO THINGS THAT MUST BE EQUAL, AND THE ONE THAT MAY ONLY BE NARROWER.
          --
          -- The ladder and the read door are the SAME question asked two ways - per row and
          -- set-based - so anything but equality is a defect on one of them, in either
          -- direction. That is `doors-disagree`.
          --
          -- The RLS mirror is built from the PLATFORM KERNEL (`iam.has_access_for_base`) and
          -- the store's ladder has three arms above it: `iam.effective_level`, the store's own
          -- carrying walk, and knowing a Table because a record inside it is visible. No policy
          -- TEXT can carry those while schema `custom` holds no table privilege for any client
          -- role, because every one of them lives behind a SECURITY DEFINER door the client
          -- cannot execute. So the mirror being NARROWER is a measured, named consequence
          -- (`mirror-admits-less`) rather than a silent one - it is returned, counted, and
          -- `pnpm check:store-doors-decide` turns it into a FAILURE the moment census 7 finds a
          -- table privilege in schema `custom`, which is the moment the policy text starts
          -- deciding a real read.
          --
          -- The mirror being WIDER is never excused (`mirror-admits-more`): that is a stranger
          -- let in by a policy while every door refuses them, and it is exactly the shape of
          -- the hole `custom/member_default_visibility` left in this function until today.
          if coalesce(ladder, false) is distinct from coalesce(read_door, false) then
            why := format('doors-disagree: the one ladder says %s and the read door says %s about the same row',
                          coalesce(ladder, false), coalesce(read_door, false));
            return next;
          elsif coalesce(rls_mirror, false) and not coalesce(ladder, false) then
            why := 'mirror-admits-more: the RLS policy text admits this row and every door refuses it';
            return next;
          elsif coalesce(ladder, false) and not coalesce(rls_mirror, false) then
            why := 'mirror-admits-less: the doors admit this row through an arm of the store ladder that sits above '
                || 'the platform kernel the mirror is built from - harmless while schema custom '
                || 'holds no table privilege, a refusal for a legitimate person the day it does';
            return next;
          end if;
        end loop;
      end loop;
    end loop;
  end loop;

  perform set_config('request.jwt.claims', v_saved, true);
  return;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.list_door_disagreements(p_pretend text, p_only_organization uuid, p_sample integer, p_exhaustive boolean)
 RETURNS TABLE(organization_id uuid, organization_name text, member_id uuid, table_id uuid, record_id uuid, door text, why text)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_org      record;
  v_member   uuid;
  v_tbl      uuid;
  v_homes    integer;
  v_rows     bigint;
  v_pairs    bigint;
  v_ceiling  integer := custom.read_door_ladder_ceiling();
  v_claims   text;
  v_saved    text;
  v_cand     uuid[];
  v_truth    uuid[];
  v_id       uuid;
  v_door     text;
  v_ids      uuid[];
  v_count    bigint;
  v_shortcut boolean;
  v_broke    text;
  v_strict   boolean;
  v_knows    boolean;
  v_pred     text;
  v_route    record;
  v_body     text;
begin
  if p_pretend is not null and p_pretend <> 'a_home_of_a_table_is_the_whole_table' then
    raise exception 'custom.list_door_disagreements: p_pretend is null or ''a_home_of_a_table_is_the_whole_table'', not %', p_pretend;
  end if;
  v_saved := coalesce(current_setting('request.jwt.claims', true), '');

  -- ═══ THE ROUTE, READ FROM THE CATALOGUE BEFORE ANYTHING IS BELIEVED ═══
  -- The fast path compares the SET every list-shaped door is built from against the per-row
  -- ladder `custom.read_record` decides with. That substitution is honest only while each
  -- door is still built on that set, so it is checked rather than assumed. The second column
  -- is the body the route lives in: `custom.record_aggregate` builds its predicate inside
  -- `custom.agg_sql`, every other door builds it in its own body.
  if not p_exhaustive then
    for v_route in
      select * from (values
        ('custom.read_records',         'read_records',         'custom\.(visible_set|visible_predicate_sql|query_visible_ids)'),
        ('custom.query_visible_ids',    'query_visible_ids',    'custom\.(visible_set|visible_predicate_sql|query_visible_ids)'),
        ('custom.query_across_homes',   'query_across_homes',   'custom\.(visible_set|visible_predicate_sql|query_visible_ids)'),
        ('custom.query_by_coordinates', 'query_by_coordinates', 'custom\.(visible_set|visible_predicate_sql|query_visible_ids)'),
        ('custom.query_table_as_of',    'query_table_as_of',    'custom\.(visible_set|visible_predicate_sql|query_visible_ids)'),
        -- EXPORT-FIX (2026-09-20): `custom.io_export` no longer builds a predicate of its own
        -- at all — it takes its rows FROM `custom.read_records`, the read door, whose own row
        -- in this very list still requires the direct reach to `custom.visible_set`. So the
        -- route is checked one hop further out, not waived: if `read_records` ever stops
        -- reaching the set, THAT row goes red and this door is measured against a door that is
        -- itself red. Accepting `custom.read_records` for `read_records` ITSELF would be a
        -- waiver (`pg_get_functiondef` prints the function's own name), which is why the
        -- accepted pattern is held PER DOOR rather than widened for everybody.
        ('custom.io_export',            'io_export',            'custom\.(visible_set|visible_predicate_sql|query_visible_ids|read_records)'),
        ('custom.record_aggregate',     'agg_sql',              'custom\.(visible_set|visible_predicate_sql|query_visible_ids)')
      ) as t(door, carries_the_route, reaches_the_set)
    loop
      select string_agg(pg_get_functiondef(p.oid), E'\n') into v_body
        from pg_catalog.pg_proc p
       where p.pronamespace = 'custom'::regnamespace
         and p.proname = v_route.carries_the_route;
      if v_body is null
         or regexp_replace(v_body, '--[^' || chr(10) || ']*', '', 'g')
            !~ v_route.reaches_the_set then
        organization_id := null; organization_name := null; member_id := null;
        table_id := null; record_id := null; door := v_route.door;
        why := format('unmeasured: this census compares custom.visible_set against '
                   || 'custom.has_visibility because every list-shaped door builds its rows '
                   || 'from custom.visible_set - and custom.%s, which is where %s builds its '
                   || 'predicate, no longer reaches it. Run '
                   || 'pnpm check:store-doors-decide --exhaustive, which calls the doors '
                   || 'themselves, and fix the door or this census before believing a green '
                   || 'answer here.', v_route.carries_the_route, v_route.door);
        return next;
      end if;
    end loop;
  end if;

  for v_org in
    select o.id, o.name, not iam.member_lane_open(o.id) as shared_only_org
      from iam.organizations o
     where custom.store_is_open(o.id)
       and (p_only_organization is null or o.id = p_only_organization)
     order by o.name
  loop
    v_strict := v_org.shared_only_org;
    -- UNMEASURED IS NOT PASSED — the same rule census 12 keeps.
    select count(*) into v_pairs
      from (select m.user_id
              from iam.memberships m
             where m.organization_id = v_org.id
               and m.container_type = 'organization'
               and m.status = 'active'
            union
            -- PORTAL (2026-09-20): A PORTAL PRINCIPAL IS A PERSON THIS CENSUS MUST ASK ABOUT.
            -- She is deliberately NOT a member - that is the whole of VIS-31 - so a census
            -- that enumerated memberships alone had nothing to say about the one kind of
            -- person whose entire access comes from a grant and a carried edge.
            select pp.user_id
              from custom.portal_principal pp
              join custom.portal p on p.id = pp.portal_id and p.is_active
             where pp.organization_id = v_org.id and pp.is_active and pp.user_id is not null
           ) people
      join custom.record r on r.organization_id = v_org.id and r.deleted_at is null;
    if v_pairs > v_ceiling then
      organization_id := v_org.id; organization_name := v_org.name;
      member_id := null; table_id := null; record_id := null; door := null;
      why := format('unmeasured: %s (member, record) pairs, over the ceiling of %s. Raise '
                 || 'custom.read_door_ladder_ceiling(), or census this organization on its own '
                 || 'with p_only_organization.', v_pairs, v_ceiling);
      return next;
      continue;
    end if;

    for v_member in
      select people.user_id from (
        select m.user_id from iam.memberships m
         where m.organization_id = v_org.id and m.container_type = 'organization'
           and m.status = 'active'
        union
        -- PORTAL (2026-09-20): the outsiders this organization let in, asked exactly as a
        -- member is asked. Her `request.jwt.claims` go on the session below like anybody
        -- else's, and every door decides for itself.
        select pp.user_id from custom.portal_principal pp
          join custom.portal p on p.id = pp.portal_id and p.is_active
         where pp.organization_id = v_org.id and pp.is_active and pp.user_id is not null
      ) people
       order by people.user_id
    loop
      v_claims := json_build_object('sub', v_member::text, 'role', 'authenticated')::text;
      perform set_config('request.jwt.claims', v_claims, true);

      for v_tbl in
        select distinct r.table_id from custom.record r
         where r.organization_id = v_org.id and r.deleted_at is null and r.table_id is not null
         order by 1
      loop
        -- HOW MANY HOMES? More than one and every row is checked, because that is the shape the
        -- defect lived in. `custom.carrying_edges_of` on the TABLE names its containers.
        select count(*) into v_homes from custom.carrying_edges_of('record', v_tbl);
        select count(*) into v_rows from custom.record r
         where r.organization_id = v_org.id and r.table_id = v_tbl and r.deleted_at is null;

        -- EXHAUSTIVE WHERE THE DEFECT LIVES. A Table in more than one Home and an
        -- organization that has said `shared_only` are judged row by row, always. Elsewhere a
        -- Table bigger than the sample is sampled with a FIXED SEED, so the same rows are
        -- judged every run and a regression cannot hide behind a lucky draw.
        if p_exhaustive or v_homes > 1 or v_strict or p_sample <= 0 or v_rows <= p_sample then
          select coalesce(array_agg(r.id order by r.id), '{}'::uuid[]) into v_cand
            from custom.record r
           where r.organization_id = v_org.id and r.table_id = v_tbl and r.deleted_at is null;
        else
          select coalesce(array_agg(x.id), '{}'::uuid[]) into v_cand
            from (select r.id from custom.record r
                   where r.organization_id = v_org.id and r.table_id = v_tbl and r.deleted_at is null
                   order by pg_catalog.md5(r.id::text || 'store-doors-decide') limit p_sample) x;
        end if;
        if coalesce(pg_catalog.array_length(v_cand, 1), 0) = 0 then continue; end if;

        -- WHAT THE OLD LINE WOULD HAVE DONE, for the red half only.
        v_shortcut := false;
        if p_pretend = 'a_home_of_a_table_is_the_whole_table' then
          v_shortcut := custom.reaches_directly(v_member, 'record', v_tbl,
                                                'viewer'::public.permission_level);
        end if;

        if not p_exhaustive then
          -- ═══ THE FAST PATH: ONE QUERY, TWO SETS ═══
          -- The truth is `custom.has_visibility` - the line `custom.read_record` itself
          -- decides the row with, before it works out a single column. The door's answer is
          -- `custom.visible_set`, rendered by `custom.visible_predicate_sql` exactly as the
          -- doors render it, plus the screen gate every list door runs first
          -- (`custom.assert_may_know_table`): a door that refuses the Table returns no rows,
          -- so a refusal is the empty set here too.
          v_knows := true;
          begin
            perform custom.assert_may_know_table(v_org.id, v_tbl, 'custom.list_door_disagreements');
          exception
            when insufficient_privilege then v_knows := false;
            when others then
              organization_id := v_org.id; organization_name := v_org.name;
              member_id := v_member; table_id := v_tbl; record_id := null;
              door := 'custom.assert_may_know_table';
              why := format('unmeasured: custom.assert_may_know_table raised %s (%s) on this '
                         || 'Table, so this census did not learn whether its doors open at '
                         || 'all. That is a door dying on data, not an answer about access.',
                            sqlstate, sqlerrm);
              return next;
              v_knows := null;
          end;
          if v_knows is null then continue; end if;

          begin
            if not v_knows then
              v_pred := 'false';
            elsif v_shortcut then
              -- THE PRETEND: the whole Table, exactly as the old shortcut handed it over.
              v_pred := 'r.visibility >= ''internal''::platform.visibility';
            else
              v_pred := custom.visible_predicate_sql(v_member, v_org.id, v_tbl,
                                                     'viewer'::public.permission_level, 'r');
            end if;
          exception
            when others then
              organization_id := v_org.id; organization_name := v_org.name;
              member_id := v_member; table_id := v_tbl; record_id := null;
              door := 'custom.visible_set';
              why := format('unmeasured: custom.visible_predicate_sql raised %s (%s), so this '
                         || 'census never learned what the list doors would return.',
                            sqlstate, sqlerrm);
              return next;
              v_pred := null;
          end;
          if v_pred is null then continue; end if;

          for record_id, door, why in execute format($q$
            select q.id,
                   'custom.visible_set'::text,
                   format('doors-disagree: the set every list-shaped door is built from '
                       || '(custom.visible_set, through custom.read_records, '
                       || 'custom.query_visible_ids, custom.query_across_homes, '
                       || 'custom.query_by_coordinates, custom.query_table_as_of, '
                       || 'custom.io_export and custom.record_aggregate) %%s this row and '
                       || 'custom.read_record %%s it',
                       case when q.in_set then 'carries' else 'withholds' end,
                       case when q.truth then 'opens' else 'refuses' end)
              from (select r.id,
                           coalesce(custom.has_visibility(%L::uuid, 'record', r.id,
                                    'viewer'::public.permission_level), false) as truth,
                           coalesce((%s), false) as in_set
                      from custom.record r
                     where r.organization_id = %L::uuid
                       and r.table_id = %L::uuid
                       and r.deleted_at is null
                       and r.id = any (%L::uuid[])) q
             where q.truth is distinct from q.in_set
             order by q.id
          $q$, v_member, v_pred, v_org.id, v_tbl, v_cand)
          loop
            organization_id := v_org.id; organization_name := v_org.name;
            member_id := v_member; table_id := v_tbl;
            return next;
          end loop;

          continue;
        end if;

        -- ═══ THE EXHAUSTIVE PATH: EVERY DOOR CALLED, EXACTLY AS IT WAS ═══
        -- THE TRUTH, ROW BY ROW: the door a person uses to OPEN one record. It raises when she
        -- may not, which is the answer, so each one is caught.
        v_truth := '{}'::uuid[];
        v_broke := null;
        foreach v_id in array v_cand loop
          begin
            perform custom.read_record(v_org.id, v_id, true);
            v_truth := v_truth || v_id;
          exception
            -- 🚨 ONLY A PERMISSION REFUSAL MEANS "SHE MAY NOT SEE IT" (LEAK-T10, second pass).
            -- The first version of this census read EVERY exception as a refusal, and on the
            -- main database `custom.read_record` raises 22023 — "this rule points at a field
            -- with title instead of with its id" — for a Table whose Rule row is malformed.
            -- That is a BREAKAGE, not an answer, and reading it as "no" made the census report
            -- twelve list-door LEAKS that were not leaks. A door that cannot answer is
            -- unmeasured; a census that guesses is worse than no census.
            when insufficient_privilege then null;
            when others then v_broke := sqlstate || ' (' || sqlerrm || ')';
          end;
          exit when v_broke is not null;
        end loop;
        if v_broke is not null then
          organization_id := v_org.id; organization_name := v_org.name;
          member_id := v_member; table_id := v_tbl; record_id := null; door := 'custom.read_record';
          why := format('unmeasured: custom.read_record raised %s on a row of this Table, so there '
                     || 'is no truth to compare the list doors against. That is a door dying on '
                     || 'data, not an answer about access - fix it before believing anything about '
                     || 'this Table.', v_broke);
          return next;
          continue;
        end if;

        -- EACH LIST-SHAPED DOOR, CALLED. A refusal is the empty set.
        foreach v_door in array array['custom.read_records', 'custom.query_visible_ids',
                                      'custom.query_across_homes', 'custom.query_by_coordinates',
                                      'custom.query_table_as_of']
        loop
          begin
            if v_door = 'custom.read_records' then
              select coalesce(array_agg(d.id), '{}'::uuid[]) into v_ids
                from custom.read_records(v_org.id, v_tbl, true, 1000, 0) d;
            elsif v_door = 'custom.query_visible_ids' then
              select coalesce(array_agg(d), '{}'::uuid[]) into v_ids
                from custom.query_visible_ids(v_org.id, v_tbl, 'viewer') d;
            elsif v_door = 'custom.query_across_homes' then
              select coalesce(array_agg(d.record_id), '{}'::uuid[]) into v_ids
                from custom.query_across_homes(v_org.id, v_tbl, 1000, 0, 'viewer') d;
            elsif v_door = 'custom.query_by_coordinates' then
              select coalesce(array_agg(d.record_id), '{}'::uuid[]) into v_ids
                from custom.query_by_coordinates(v_org.id, v_tbl, '[]'::jsonb, 1000, 0, 'viewer') d;
            else
              select coalesce(array_agg(d.record_id), '{}'::uuid[]) into v_ids
                from custom.query_table_as_of(v_org.id, v_tbl, now(), null, 1000, 0, 'viewer') d;
            end if;
          exception
            -- REFUSING HER OUTRIGHT IS AN ANSWER, and the answer is "no rows".
            when insufficient_privilege then v_ids := '{}'::uuid[];
            -- ANYTHING ELSE IS THE CENSUS FAILING TO MEASURE, and a census that reports its own
            -- broken call as a defect is worse than no census. It says so instead.
            when others then
              organization_id := v_org.id; organization_name := v_org.name;
              member_id := v_member; table_id := v_tbl; record_id := null; door := v_door;
              why := format('unmeasured: %s raised %s (%s), so this census did not learn what it '
                         || 'returns. Fix the call or the door before believing the green above.',
                            v_door, sqlstate, sqlerrm);
              return next;
              v_ids := null;
          end;
          if v_ids is null then continue; end if;

          -- THE PRETEND: the whole Table, exactly as the old shortcut handed it over — every
          -- live row the Table edge carries, which is every row at or above `internal`.
          if v_shortcut then
            select coalesce(array_agg(r.id), '{}'::uuid[]) into v_ids
              from custom.record r
             where r.organization_id = v_org.id and r.table_id = v_tbl
               and r.deleted_at is null
               and r.visibility >= 'internal'::platform.visibility;
          end if;

          foreach v_id in array v_cand loop
            if (v_id = any (v_ids)) is distinct from (v_id = any (v_truth)) then
              organization_id := v_org.id; organization_name := v_org.name;
              member_id := v_member; table_id := v_tbl; record_id := v_id; door := v_door;
              why := format('doors-disagree: %s %s this row and custom.read_record %s it',
                            v_door,
                            case when v_id = any (v_ids) then 'returns' else 'withholds' end,
                            case when v_id = any (v_truth) then 'opens' else 'refuses' end);
              return next;
            end if;
          end loop;
        end loop;

        -- THE TWO DOORS THAT CARRY NO IDS: their COUNT must be the count `read_record` opens.
        -- Only meaningful when the candidate set is the whole Table; a sample would compare a
        -- sample against a full count and name a row that is not a defect.
        if p_exhaustive or v_homes > 1 or p_sample <= 0 or v_rows <= p_sample then
          foreach v_door in array array['custom.io_export', 'custom.record_aggregate'] loop
            begin
              if v_door = 'custom.io_export' then
                select jsonb_array_length(custom.io_export(v_org.id, v_tbl, null, 1000, 'viewer') -> 'rows')
                  into v_count;
              else
                -- ONE GROUP (`p_group_by = []`), so `row_count` IS the number of rows the
                -- aggregate could see.
                select coalesce(sum(a.row_count), 0) into v_count
                  from custom.record_aggregate(v_org.id, v_tbl, '[]'::jsonb, '[]'::jsonb,
                                               null, '{}'::jsonb, 1000, 'viewer') a;
              end if;
            exception
              when insufficient_privilege then v_count := 0;
              when others then
                organization_id := v_org.id; organization_name := v_org.name;
                member_id := v_member; table_id := v_tbl; record_id := null; door := v_door;
                why := format('unmeasured: %s raised %s (%s), so this census did not learn what it '
                           || 'counts.', v_door, sqlstate, sqlerrm);
                return next;
                v_count := null;
              end;
              if v_count is null then continue; end if;
            if v_shortcut then
              select count(*) into v_count from custom.record r
               where r.organization_id = v_org.id and r.table_id = v_tbl
                 and r.deleted_at is null
                 and r.visibility >= 'internal'::platform.visibility;
            end if;
            if coalesce(v_count, 0) is distinct from coalesce(pg_catalog.array_length(v_truth, 1), 0)::bigint then
              organization_id := v_org.id; organization_name := v_org.name;
              member_id := v_member; table_id := v_tbl; record_id := null; door := v_door;
              why := format('doors-disagree: %s counts %s row(s) of this Table and custom.read_record '
                         || 'opens %s of them', v_door, coalesce(v_count, 0),
                            coalesce(pg_catalog.array_length(v_truth, 1), 0));
              return next;
            end if;
          end loop;
        end if;
      end loop;
    end loop;
  end loop;

  perform set_config('request.jwt.claims', v_saved, true);
  return;
end;
$function$;

drop function if exists custom.store_census_pair_ceiling();



-- The old trigger keeps whatever text it is given, so the two rows take back their old spelling.
update platform.client_callable_door set identity_args = 'p_team_id uuid'
 where schema_name = 'iam' and function_name = '_team_caller';
update platform.client_callable_door set identity_args = 'p_sender uuid, p_organization_id uuid, p_resource_type text, p_resource_id uuid, p_resource_label text, p_field_keys text[], p_recipient_name text, p_recipient_email text, p_recipient_phone text, p_link_channel text, p_code_channel text, p_note text, p_payload_ciphertext text, p_expires_at timestamptz'
 where schema_name = 'platform' and function_name = 'secure_delivery_create';
