-- public_mnd_list_scoped_invoker_dd137c4 — THE ELEVENTH LIST RPC, AND THE DEFINER IT LEANS ON
-- (DD-137c, step 4; VISIBILITY-BY-CLASS §3.3 chair R2 and §3.4 chokepoint 3).
--
-- WHY THIS ONE IS LAST, AND WHY IT IS NOT JUST A FLIP
-- --------------------------------------------------
-- `mnd_list_scoped` is the only one of the eleven that leans on another SECURITY DEFINER function to
-- produce its rows: `mandate._rungs(p_mandate_ids, p_user_id, p_organization_id)`, THE ONE LADDER
-- (its own comment: "Not a copy of it"). `authenticated` has no EXECUTE on it, so flipping the outer
-- function alone would give a 42501 on every call. Granting EXECUTE and stopping there would be
-- worse: it would hand every signed-in browser a definer function that resolves the ladder for ANY
-- array of mandate ids, with no access check inside it at all — which is exactly the hole §3.4
-- chokepoint 3 exists to close ("a definer function's reads and writes are not filtered by RLS at
-- all, so the class must be checked INSIDE it").
--
-- So this file does three things, and none of them is optional for the other two to be honest:
--
--   1. `mandate._rungs` checks access on every mandate id it is handed — `iam.has_access('mandate',
--      id, 'viewer')`, the kernel, the same source §3.2 made the policies and the mirror read. An id
--      the caller cannot read produces no rungs, whoever passes it and however they got it.
--   2. It is granted to `authenticated` and DECLARED in `platform.client_callable_door`, in that
--      order, because `enforce_definer_client_grants` revokes an undeclared client grant.
--   3. `mnd_list_scoped` becomes `SECURITY INVOKER` and its corpus predicate — "the system
--      organization, plus every organization I am a member of" — is DELETED. RLS on
--      `mandate.definition` answers that question already, and answers it the same way: measured
--      live for a plain member, `iam.has_access` said yes to exactly the 503 of 695 rows RLS lets
--      them read. Two answers that agree are still two answers, and one of them had to go.
--
-- WHAT IS KEPT, DELIBERATELY. `p_home` (`all` / `system` / `org:<uuid>`) is not a list scope and is
-- not touched: it narrows the corpus to one home and raises a real sentence when you name an
-- organization you do not belong to. Its membership test stays because it is the thing that makes
-- that MESSAGE honest — without it a stale organization after an org switch would silently return
-- an empty list instead of saying so. Narrowing and explaining is what a scope parameter is for;
-- deciding who may read is what RLS is for, and that half is gone.
--
-- `p_scope` here is NOT a list scope either (DD-137b7 recorded why): it feeds `p_resolution_for`,
-- which answers "whose ladder am I being shown", and ownership is `p_home`. So there is no registry
-- default to wire — the registry word would change what the screen MEANS. This file does not invent
-- one; it converts the security posture and leaves the vocabulary alone.

-- ═══════════════════════════════════════════════════ 1. the ladder checks access on what it is given
do $$
declare v_def text; v_new text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'mandate' and p.proname = '_rungs';
  if v_def is null then raise exception 'dd137c4: mandate._rungs does not exist'; end if;

  v_new := replace(v_def,
    E'    FROM mandate.definition x\n    WHERE x.id = ANY (p_mandate_ids) AND x.deleted_at IS NULL',
    E'    FROM mandate.definition x\n'
    '    WHERE x.id = ANY (p_mandate_ids) AND x.deleted_at IS NULL\n'
    '      -- DD-137c / §3.4 chokepoint 3. This function runs as its definer, so RLS never sees the\n'
    '      -- ids it is handed. Since it is now callable by every signed-in browser, the kernel is\n'
    '      -- asked here instead: an id the caller cannot read resolves to no rungs at all. The\n'
    '      -- service role, which is how the server reads, is not a client and is not narrowed.\n'
    '      AND (current_user = ''service_role'' OR iam.has_access(''mandate'', x.id, ''viewer''))');
  if v_new = v_def then
    raise exception 'dd137c4: mandate._rungs no longer contains the `d` CTE this file patches — it '
                    'changed underneath and must be re-read, never patched blind.';
  end if;
  execute v_new;
end $$;

-- The declaration comes BEFORE the grant: `enforce_definer_client_grants` takes back an undeclared
-- client EXECUTE on a SECURITY DEFINER function, silently.
insert into platform.client_callable_door(schema_name, function_name, identity_args, declared_by, reason)
select 'mandate', '_rungs', 'p_mandate_ids uuid[], p_user_id uuid, p_organization_id uuid', 'DD-137c',
       'THE ONE LADDER, reached by `mnd_list_scoped` now that it runs as its caller. It reads '
       '`mandate.definition`, `mandate.binding` and the agent tables with the definer''s rights, so '
       'it asks `iam.has_access(''mandate'', id, ''viewer'')` about every id it is handed and returns '
       'nothing for one the caller cannot read. Classes touched: `mandate` (public) and the bindings '
       'that resolve it; never a person''s content.'
 where not exists (select 1 from platform.client_callable_door d
                    where d.schema_name = 'mandate' and d.function_name = '_rungs');

grant execute on function mandate._rungs(uuid[], uuid, uuid) to authenticated;

-- ═══════════════════════════════════════════════════ 2. the list runs as its caller
do $$
declare v_def text; v_new text; v_step text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'mnd_list_scoped';
  if v_def is null then raise exception 'dd137c4: public.mnd_list_scoped does not exist'; end if;

  -- (a) run as the caller
  v_step := 'SECURITY DEFINER';
  v_new := replace(v_def, E'\n STABLE SECURITY DEFINER\n', E'\n STABLE\n');
  if v_new = v_def then raise exception 'dd137c4: could not find `%` in mnd_list_scoped', v_step; end if;

  -- (b) the corpus predicate is RLS's answer, not this function's
  v_step := 'the `owned` CTE home predicate';
  v_def := v_new;
  v_new := replace(v_def,
    E'          ELSE m.organization_id = v_sys\n'
    '               OR m.organization_id IN (SELECT mo.org_id FROM my_orgs mo)',
    E'          -- DD-137c: `all` is now every mandate RLS lets this person read — which is the same\n'
    '          -- set this predicate used to hand-compute (the system organization plus their own),\n'
    '          -- measured 503 = 503 for a plain member before the change. `system` and `org:<id>`\n'
    '          -- stay because they NARROW to one home and explain themselves when you name one you\n'
    '          -- do not belong to.\n'
    '          ELSE true');
  if v_new = v_def then raise exception 'dd137c4: could not find %', v_step; end if;

  -- (c) my_orgs is now unreferenced
  v_step := 'the my_orgs CTE';
  v_def := v_new;
  v_new := replace(v_def,
    E'  WITH my_orgs AS (\n'
    '    SELECT om.organization_id AS org_id\n'
    '    FROM iam.organization_member om\n'
    '    WHERE om.user_id = v_uid\n'
    '  ),\n'
    '  owned AS (',
    E'  WITH owned AS (');
  if v_new = v_def then raise exception 'dd137c4: could not find %', v_step; end if;
  if position('my_orgs' in v_new) > 0 then
    raise exception 'dd137c4: my_orgs is still referenced after the org predicate was deleted';
  end if;

  execute v_new;
end $$;

-- ═══════════════════════════════════════════════════════════════════ PROOF — live, real identities
do $$
declare
  v_p uuid; v_email text;
  v_ids uuid[]; v_ceiling uuid[]; v_leak uuid[];
  v_measured int := 0; v_err text; v_notes text := ''; v_n bigint;
  v_principals uuid[] := array[
    'c5e92166-e148-4e73-926e-83af0c453665'::uuid,  -- seo@titaniumsuccess.com
    '392afd39-d59c-4418-866b-451e9d93fead'::uuid,  -- projectmanager@titaniumsuccess.com
    '34ed4fc3-c527-4819-99bf-15c26603b261'::uuid   -- arman@titaniumsuccess.com
  ];
  v_probe_ids uuid[];
begin
  foreach v_p in array v_principals loop
    select u.email into v_email from auth.users u where u.id = v_p;
    v_err := null; v_ids := null; v_ceiling := null; v_n := 0;
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_p::text, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';

      select coalesce(array_agg(x.id), '{}'), coalesce(max(x.total_count), 0) into v_ids, v_n
        from public.mnd_list_scoped(p_home => 'all', p_limit => 200) x;
      select coalesce(array_agg(m.id), '{}') into v_ceiling
        from mandate.definition m where m.deleted_at is null;

      execute 'reset role';
    exception when others then
      begin execute 'reset role'; exception when others then null; end;
      v_err := format('%s: %s', sqlstate, sqlerrm);
    end;

    if v_err is not null then
      raise exception 'dd137c4 UNMEASURED — mnd_list_scoped as % could not be probed (%).',
                      v_email, v_err;
    end if;

    select coalesce(array_agg(o), '{}') into v_leak
      from unnest(v_ids) o where o <> all (v_ceiling);
    if cardinality(v_leak) > 0 then
      raise exception 'dd137c4 WIDER — mnd_list_scoped returned % mandate(s) % cannot read under '
                      'RLS, e.g. %.', cardinality(v_leak), v_email, v_leak[1];
    end if;

    if v_n > 0 then
      v_measured := v_measured + 1;
      v_notes := v_notes || format('  %s: home=all -> %s mandates, rls_ceiling=%s%s',
                                   v_email, v_n, cardinality(v_ceiling), chr(10));
    end if;
  end loop;

  if v_measured = 0 then
    raise exception 'dd137c4: no principal saw a single mandate — nothing was measured.';
  end if;

  -- THE LADDER'S OWN DOOR, proven both ways: a mandate this person CAN read produces rungs, and one
  -- they cannot read produces none — the same call, the same function, the id as the only difference.
  v_p := v_principals[1];
  select u.email into v_email from auth.users u where u.id = v_p;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_p::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select coalesce(array_agg(m.id), '{}') into v_probe_ids
    from (select id from mandate.definition where deleted_at is null limit 1) m;
  execute 'reset role';

  if cardinality(v_probe_ids) = 0 then
    raise exception 'dd137c4: % can read no mandate at all, so the ladder door cannot be measured '
                    'in the direction that matters.', v_email;
  end if;

  -- the unreadable one: a live mandate this principal cannot select
  select coalesce(array_agg(x.id), '{}') into v_ceiling from (
    select m.id from mandate.definition m
     where m.deleted_at is null and not iam.has_access_for(v_p, 'mandate', m.id, 'viewer')
     limit 1) x;
  if cardinality(v_ceiling) = 0 then
    raise exception 'dd137c4: every live mandate is readable by %, so the ladder''s refusal cannot '
                    'be measured. It is not assumed.', v_email;
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_p::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from mandate._rungs(v_probe_ids, v_p, null);
  if v_n = 0 then
    execute 'reset role';
    raise exception 'dd137c4: the ladder returned nothing for a mandate % CAN read — the access '
                    'check narrowed a legitimate caller and must not ship.', v_email;
  end if;
  select count(*) into v_n from mandate._rungs(v_ceiling, v_p, null);
  execute 'reset role';
  if v_n <> 0 then
    raise exception 'dd137c4: the ladder returned % rung(s) for mandate %, which % cannot read. The '
                    'definer door is open.', v_n, v_ceiling[1], v_email;
  end if;

  raise notice E'dd137c4 PROVEN on % principal(s):\n%  and the ladder answers for a readable '
               'mandate and refuses an unreadable one, as the same caller.', v_measured, v_notes;
exception when others then
  begin execute 'reset role'; exception when others then null; end;
  raise;
end $$;
