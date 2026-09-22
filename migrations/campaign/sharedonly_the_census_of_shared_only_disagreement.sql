-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- SHARED-ONLY — THE CENSUS: THE LADDER, THE READ DOOR AND THE RLS MIRROR, ROW BY ROW.
--
-- The sixth independent pass's worst finding was not a broken function. It was THREE ANSWERS
-- TO ONE QUESTION. For a colleague shared one record in an organization set to
-- `shared_only`, on the same database in the same minute:
--
--   the store's own question "can she see this?"  ->  TRUE
--   every screen and every read door              ->  "You do not have access to this table"
--   the RLS policy text the mirror builds         ->  TRUE for every internal row in the
--                                                     organization, share or no share
--
-- Nine catalogue censuses were green throughout. A shape census cannot see a disagreement; it
-- can only see a missing line. So this one asks all three, for every (member, record) pair in
-- every organization that has said `shared_only`, and reports every pair where they differ.
--
--   1. THE LADDER      — `custom.has_visibility(member, 'record', row, 'viewer')`.
--   2. THE READ DOOR   — the predicate `custom.visible_predicate_sql` hands the door, built
--                        once per (member, Table) and EVALUATED on the row. Not a
--                        re-implementation: it is the same text the door puts in its WHERE.
--   3. THE RLS MIRROR  — `iam.entity_read_expr('custom','record','record')`, evaluated on the
--                        row with the member's claims in `request.jwt.claims`. It is not a
--                        live policy today (census 7 keeps `authenticated` holding no table
--                        privilege in schema `custom`), which is exactly why nothing else
--                        would ever notice it drifting.
--
-- IT CAN GO RED, and its red is two real historical states rather than an invented one:
--   `p_pretend = 'mirror_forgets_the_knob'` evaluates the mirror with the
--       `custom/member_default_visibility` conjunct removed — the mirror as it stood before
--       this lane, and as VIS-2, LEVEL-FIX and GUARD-SWITCH each recorded it.
--   `p_pretend = 'door_refuses_the_share'` evaluates the read door as NO for every row — the
--       sixth pass's own screen behaviour, where the store said yes and the door said no.
--
-- UNMEASURED IS NOT PASSED: an organization with more (member, record) pairs than the ceiling
-- returns a row saying so rather than a quiet zero.

CREATE OR REPLACE FUNCTION custom.shared_only_disagreements(p_pretend text DEFAULT null)
 RETURNS TABLE(organization_id uuid, organization_name text, member_id uuid, record_id uuid,
               table_id uuid, ladder boolean, read_door boolean, rls_mirror boolean, why text)
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
      why := format('UNMEASURED: %s (member, record) pairs, over the ceiling of %s. Raise '
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
                 (select (%s) from custom.record m where m.organization_id = r.organization_id and m.id = r.id) as rls_mirror
            from custom.record r
           where r.organization_id = %L::uuid
             and r.table_id is not distinct from %L::uuid
             and r.deleted_at is null
        $q$, v_org.id, v_org.name, v_member, v_member, v_pred, v_mirror, v_org.id, v_table)
        loop
          if coalesce(ladder, false) is distinct from coalesce(read_door, false)
             or coalesce(ladder, false) is distinct from coalesce(rls_mirror, false) then
            why := format('the ladder says %s, the read door says %s, the RLS mirror says %s',
                          coalesce(ladder, false), coalesce(read_door, false), coalesce(rls_mirror, false));
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

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes,
   signed_in_callers, anonymous_callers, declared_by, non_client_lane, reason)
select 'custom', p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid),
       platform.door_argtypes(p.proargtypes), false, false,
       'migrations/campaign/sharedonly_the_census_of_shared_only_disagreement.sql (lane SHARED-ONLY)',
       'server_only: the SHARED-ONLY census, run by pnpm check:store-doors-decide and by the lane''s suites. It answers FOR every member of every shared_only organization at once and sets request.jwt.claims while it does, so no client may ever reach it.',
       'It takes no entity id at all: it enumerates the organizations that have said shared_only and the active members of each, and asks the one ladder, the read door''s own predicate and the RLS mirror about every live record. p_pretend is a fixed word (mirror_forgets_the_knob / door_refuses_the_share) checked against a list before anything is built, so nothing a caller passes reaches the dynamic SQL.'
  from pg_catalog.pg_proc p
 where p.pronamespace = 'custom'::regnamespace
   and p.proname = 'shared_only_disagreements'
on conflict (schema_name, function_name, identity_argtypes) do nothing;

comment on function custom.shared_only_disagreements(text) is
  'SHARED-ONLY: for every organization that has said members see only what is shared with them, every (member, record) pair where the one ladder, the read door and the RLS mirror do not all say the same thing. Zero rows is the invariant. pnpm check:store-doors-decide runs it.';
