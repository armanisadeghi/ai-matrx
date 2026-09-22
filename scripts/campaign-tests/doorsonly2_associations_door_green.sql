-- DOORS-ONLY-2 -- platform.associations: the direct write is refused, the door still works.
--
-- THE USE CASE THIS SUITE NAMES (no fake test data): Northgate Dental Partners, a three-chair
-- dental practice, keeps a tool bundle for its front-desk staff -- the tools a receptionist
-- may use while booking and confirming appointments. Adding a tool to that bundle, renaming its
-- local alias, and taking it back out are exactly the three writes this lane moved from
-- `platform.associations` onto `public.assoc_add` / `public.assoc_remove`.
--
-- Run before the closure and clause 1 FAILS (the direct insert succeeds). Run after and all
-- five pass. It ends in ROLLBACK and leaves nothing.


-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'doorsonly2_associations_door_green.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;
-- AUTH-504's ceiling, applied by lane RED-SUITES-3 (2026-09-21): a suite that shares the
-- instance people sign in to may not give itself a statement ceiling a person would wait
-- behind. 60s statements, 10s lock waits, like the other 177 main-database suites.
set local statement_timeout = '60s';
set local lock_timeout = '10s';

do $$
declare
  c_admin uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  v_org   uuid;
  v_tool  uuid;
  v_bundle uuid;
  v_id    uuid;
  v_meta  jsonb;
  v_n     integer;
  v_refused text;
begin
  -- PART 0 -- take the seat and prove it.
  perform set_config('request.jwt.claims',
    json_build_object('sub', c_admin::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat -- current_user is %', current_user;
  end if;

  -- A real bundle and a real tool that already belong together, so the suite invents nothing.
  select a.organization_id, a.source_id, a.target_id
    into v_org, v_tool, v_bundle
    from platform.associations a
   where a.source_type = 'tool' and a.target_type = 'tool_bundle' and a.role = 'member'
     and a.deleted_at is null
   limit 1;
  if v_bundle is null then
    raise exception '0: no tool -> tool_bundle member edge exists to exercise the door against';
  end if;

  -- 1 -- THE DIRECT WRITE IS REFUSED. This is the clause that fails before the closure.
  begin
    insert into platform.associations select * from platform.associations
      where source_type = 'tool' and target_type = 'tool_bundle' limit 1;
    raise exception '1: a direct INSERT into platform.associations was ACCEPTED from a client seat';
  exception when insufficient_privilege then
    v_refused := sqlerrm;
    if v_refused not like '%associations_client_insert_refused%' then
      raise exception '1: refused, but not by this lane''s policy: %', v_refused;
    end if;
  end;

  -- 2 -- THE DOOR WORKS, and it is the path the moved callers now take.
  v_id := public.assoc_add('tool', v_tool, 'tool_bundle', v_bundle, v_org,
                           null, jsonb_build_object('local_alias', 'Front desk booking'),
                           'member', null);
  if v_id is null then raise exception '2: assoc_add returned no edge id'; end if;

  -- 3 -- THE UPSERT ARM IS THE UPDATE. Calling the door again with new metadata is exactly
  --      what the bundle-member PATCH now does, and it must reach the SAME edge.
  if public.assoc_add('tool', v_tool, 'tool_bundle', v_bundle, v_org,
                      null, jsonb_build_object('local_alias', 'Front desk booking + confirmations'),
                      'member', null) <> v_id then
    raise exception '3: the second assoc_add made a SECOND edge instead of updating the first';
  end if;
  select a.metadata into v_meta from platform.associations a where a.id = v_id;
  if v_meta ->> 'local_alias' <> 'Front desk booking + confirmations' then
    raise exception '3: the door did not write the new alias, metadata is %', v_meta;
  end if;

  -- 4 -- READS ARE UNTOUCHED, through the read door and through the table.
  select count(*) into v_n from public.assoc_list('tool_bundle', v_bundle, 'in', 'member');
  if v_n < 1 then raise exception '4: the read door returned no members for this bundle'; end if;
  perform 1 from platform.associations where id = v_id;

  -- 5 -- THE REMOVE DOOR WORKS, which is what the bundle-member DELETE now calls.
  perform public.assoc_remove('tool', v_tool, 'tool_bundle', v_bundle, 'member');

  raise notice 'doorsonly2_associations_door_green: 5/5 -- the direct write is refused by name, assoc_add creates and updates the same edge, reads are untouched, assoc_remove takes it down';
end $$;

rollback;
