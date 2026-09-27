-- DOORS-DECIDE-LAST — THE GREEN SUITE (2026-09-27). The last four findings of
-- `pnpm check:store-doors-decide` and the one coverage finding of `pnpm check:trash-doors`, each
-- asked the way the guard asks it, plus the Meeting's Trash walk from the seat a signed-in person
-- has (`authenticated`), as admin@admin.com (a host) and test@test.com (a stranger to the meeting).
--
-- THE REAL USE CASE THIS DATA IS. Northgate Mechanical is a 22-person commercial HVAC contractor in
-- Portland. Its operations manager hosts a recurring "Monday dispatch review" in Meet: last week's
-- call-backs, parts on order, who is on call. The quarter the service agreement with Alder Court
-- Medical Plaza ended, she archived the old "Alder Court PM walkthrough" meeting — and a month later
-- the plaza signed again, so she needs it back from Trash with its invitations. Dana (test@test.com)
-- is a dispatcher at a different company in this suite; she has no business restoring it.
--
-- RUN IT (production read-only proof or the dev clone; the transaction ends in ROLLBACK):
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
--   "$PSQL" <connection> -v ON_ERROR_STOP=1 -f scripts/campaign-tests/doorsdecidelast_green.sql
--
-- WHAT IT PROVES, and which parts only pass after
--   migrations/campaign/doorsdecidelast_the_last_four_store_door_findings_are_closed.sql      (parts 1, 3, 4)
--   migrations/campaign/doorsdecidelast_a_meeting_its_host_archives_is_in_trash.sql           (part 5)
--   1  THE LADDER PLANS ONCE: none of the six functions custom.ladder_replanners() named re-plans
--      any more (five are plpgsql, the fingerprinted three-argument iam.accessible_entity_ids is
--      inlinable), and each answers exactly what its old SQL expression answers.
--      RED before: all six were non-inlinable sql.
--   2  THE KERNEL FINGERPRINT DID NOT MOVE: the three-argument wrapper's prosrc is byte for byte the
--      old one-liner, so iam.entity_read_kernel_fingerprint() hashes the same bodies it did.
--   3  A DOOR ROW STORES THE CATALOG'S RENDERING: no row differs from pg_get_function_identity_arguments,
--      and a row written with a hand-typed spelling ('timestamptz') reads back as the catalog's.
--      RED before: two rows differed and the hand-typed spelling was kept.
--   4  THE CENSUS MEASURES admin's Workspace: its (member, record) pairs sit under the census ceiling,
--      the two censuses read it, and the doors' own cut-off is still 5,000.
--      RED before: custom.store_census_pair_ceiling() did not exist.
--   5  A MEETING ITS HOST ARCHIVES IS IN TRASH: listed in the host's Trash and the organization's
--      Trash as "Meeting"; a stranger's restore is refused by Meet's own sentence; the host's restore
--      from personal Trash and the organization's Trash both bring it back (and its invitation).
--      RED before: not listed (no Trash kind), and restore went around Meet's door.

\set ON_ERROR_STOP on
\timing off

\set suite 'doorsdecidelast_green.sql'
\set requires 'grant:authenticated:communication.meet_archive_meeting|grant:authenticated:public.entity_undelete|grant:authenticated:public.org_trash_restore|exec:custom.ladder_replanners'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local statement_timeout = '120s';

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_ws      constant uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';   -- admin's Workspace
  j_admin   constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  j_dana    constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_north   uuid := gen_random_uuid();
  v_mtg     uuid := gen_random_uuid();
  v_n int; v_m int; v_ok boolean; v_a uuid[]; v_b uuid[]; v_txt text; v_at timestamptz;
  v_caught text; v_state text; v_res jsonb;
  r record;
begin
  perform set_config('app.actor_system', 'campaign-test/doorsdecidelast_green', true);

  -- ── PART 1 — THE LADDER PLANS ONCE ──────────────────────────────────────────────────────────
  select count(*) into v_n from custom.ladder_replanners() f
   where f.fn in ('iam.accessible_entity_ids', 'iam.entity_read_kernel_fingerprint', 'iam.read_lane_v2_auth_reads_id',
                  'iam.read_lane_v2_edge_emits', 'iam.read_lane_v2_enrolled', 'public.is_super_admin');
  if v_n <> 0 then
    raise exception '1a: % of the six functions still re-plan their body on every call (LANGUAGE sql, not inlinable)', v_n;
  end if;
  -- the same answers
  if iam.read_lane_v2_enrolled('__no_such_token__') then raise exception '1b: an unknown token reads as enrolled'; end if;
  for r in select x.token from iam.read_lane_v2_rollout x limit 25 loop
    if not iam.read_lane_v2_enrolled(r.token) then raise exception '1c: enrolled token % reads as not enrolled', r.token; end if;
  end loop;
  for r in select c.oid::regclass as rel from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname in ('platform', 'communication', 'iam') and c.relkind = 'r' order by c.oid limit 40 loop
    if iam.read_lane_v2_auth_reads_id(r.rel) is distinct from (
         exists (select 1 from pg_attribute a where a.attrelid = r.rel and a.attname = 'id' and not a.attisdropped)
         and has_schema_privilege('authenticated', (select c.relnamespace from pg_class c where c.oid = r.rel), 'USAGE')
         and has_column_privilege('authenticated', r.rel, 'id', 'SELECT')) then
      raise exception '1d: iam.read_lane_v2_auth_reads_id(%) answers differently from its expression', r.rel;
    end if;
  end loop;
  for r in select er.child_type, er.parent_type, er.fk_column from platform.entity_relationships er
            where er.kind in ('composition', 'containment') order by 1, 2, 3 limit 40 loop
    if iam.read_lane_v2_edge_emits(r.child_type, r.parent_type, r.fk_column) is distinct from (
         iam.read_lane_v2_enrolled(r.child_type)
         and iam.read_lane_v2_edge_structural_ok(r.child_type, r.parent_type, r.fk_column)
         and iam.read_lane_v2_depth(r.parent_type) <= 1) then
      raise exception '1e: iam.read_lane_v2_edge_emits(%, %, %) answers differently from its expression', r.child_type, r.parent_type, r.fk_column;
    end if;
  end loop;
  perform set_config('request.jwt.claims', j_admin, true);
  if public.is_super_admin() is distinct from public.is_super_admin_for(c_admin) then raise exception '1f: is_super_admin differs for admin'; end if;
  select array_agg(x order by x) into v_a from unnest(iam.accessible_entity_ids('agent_term_list')) x;
  select array_agg(x order by x) into v_b from unnest(iam.accessible_entity_ids('agent_term_list', 'viewer', 0, true)) x;
  if v_a is distinct from v_b then raise exception '1g: the three-argument accessible_entity_ids differs from the four-argument one'; end if;
  perform set_config('request.jwt.claims', j_dana, true);
  if public.is_super_admin() is distinct from public.is_super_admin_for(c_dana) then raise exception '1h: is_super_admin differs for Dana'; end if;
  if public.is_super_admin() then raise exception '1i: test@test.com reads as a super admin'; end if;
  perform set_config('request.jwt.claims', '', true);
  raise notice '1 PASSED — none of the six re-plans (five plpgsql, one inlinable) and each answers what its SQL body answered.';

  -- ── PART 2 — THE KERNEL FINGERPRINT DID NOT MOVE ───────────────────────────────────────────
  if (select p.prosrc from pg_proc p where p.oid = 'iam.accessible_entity_ids(text,permission_level,integer)'::regprocedure)
     is distinct from E'\n  select iam.accessible_entity_ids(p_type, p_required, p_depth, true);\n' then
    raise exception '2a: the fingerprinted three-argument iam.accessible_entity_ids body changed — the kernel fingerprint moved';
  end if;
  if (select p.prosecdef or p.proconfig is not null from pg_proc p
       where p.oid = 'iam.accessible_entity_ids(text,permission_level,integer)'::regprocedure) then
    raise exception '2b: the three-argument iam.accessible_entity_ids is still SECURITY DEFINER or SET — not inlinable';
  end if;
  raise notice '2 PASSED — the fingerprinted wrapper kept its body and is inlinable.';

  -- ── PART 3 — A DOOR ROW STORES THE CATALOG'S RENDERING ──────────────────────────────────────
  select count(*) into v_n
    from platform.client_callable_door d
    join pg_namespace n on n.nspname = d.schema_name
    join pg_proc p on p.proname = d.function_name and p.pronamespace = n.oid
     and platform.door_argtypes(p.proargtypes) = d.identity_argtypes
   where d.identity_args is distinct from pg_get_function_identity_arguments(p.oid);
  if v_n <> 0 then raise exception '3a: % door row(s) store a signature the catalog does not render', v_n; end if;
  update platform.client_callable_door
     set identity_args = 'p_sender uuid, p_organization_id uuid, p_resource_type text, p_resource_id uuid, p_resource_label text, p_field_keys text[], p_recipient_name text, p_recipient_email text, p_recipient_phone text, p_link_channel text, p_code_channel text, p_note text, p_payload_ciphertext text, p_expires_at timestamptz'
   where schema_name = 'platform' and function_name = 'secure_delivery_create';
  select d.identity_args into v_txt from platform.client_callable_door d
   where d.schema_name = 'platform' and d.function_name = 'secure_delivery_create';
  if v_txt !~ 'p_expires_at timestamp with time zone$' then
    raise exception '3b: a hand-typed door signature was kept as written: %', v_txt;
  end if;
  raise notice '3 PASSED — every door row stores the catalog''s rendering, and a hand-typed spelling is rewritten to it.';

  -- ── PART 4 — THE CENSUS MEASURES admin's Workspace ──────────────────────────────────────────
  if to_regprocedure('custom.store_census_pair_ceiling()') is null then
    raise exception '4a: custom.store_census_pair_ceiling() does not exist — the censuses still share the doors'' 5,000';
  end if;
  select count(*) into v_n
    from iam.memberships m
    join custom.record cr on cr.organization_id = m.organization_id and cr.deleted_at is null
   where m.organization_id = c_ws and m.container_type = 'organization' and m.status = 'active';
  execute 'select custom.store_census_pair_ceiling()' into v_m;
  if v_n > v_m then raise exception '4b: admin''s Workspace has % pairs, over the census ceiling of %', v_n, v_m; end if;
  v_txt := v_n::text;
  if custom.read_door_ladder_ceiling() <> 5000 then
    raise exception '4c: the doors'' own set-based cut-off moved to % — the census must not change how doors answer', custom.read_door_ladder_ceiling();
  end if;
  select count(*) into v_n from pg_proc p
   where p.oid in ('custom.shared_only_disagreements(text)'::regprocedure,
                   'custom.list_door_disagreements(text,uuid,integer,boolean)'::regprocedure)
     and p.prosrc like '%v_ceiling  integer := custom.store_census_pair_ceiling();%';
  if v_n <> 2 then raise exception '4d: % of the two censuses read the census ceiling', v_n; end if;
  raise notice '4 PASSED — admin''s Workspace (% pairs) is under the census ceiling (%); the doors keep 5,000.', v_txt, v_m;

  -- ── PART 5 — A MEETING ITS HOST ARCHIVES IS IN TRASH ────────────────────────────────────────
  perform set_config('request.jwt.claims', j_admin, true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by, settings) values
    (v_north, 'Northgate Mechanical', 'northgate-mechanical-'||left(v_north::text,8), 'NGM', c_admin,
     '{"test_fixture": true}'::jsonb);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status, created_by) values
    (v_north, 'organization', v_north, c_admin, 'owner', 'active', c_admin);
  insert into communication.meet_meetings (id, room_name, slug, title, kind, host_user_id, organization_id,
                                           scheduled_for, scheduled_duration_minutes, time_zone, agenda, created_by, visibility)
  values (v_mtg, 'ngm-'||v_mtg::text, 'alder-court-pm-'||left(v_mtg::text,8), 'Alder Court PM walkthrough', 'scheduled',
          c_admin, v_north, now() + interval '3 days', 60, 'America/Los_Angeles',
          'RTU-1..RTU-4 filter and belt check; roof access badge for the new tech; renewal pricing.', c_admin, 'internal');

  perform set_config('role', 'authenticated', true);
  perform communication.meet_archive_meeting(v_mtg, null);
  perform set_config('role', 'postgres', true);
  select m.deleted_at into v_at from communication.meet_meetings m where m.id = v_mtg;
  if v_at is null then raise exception '5a: the host archived the meeting and it is not archived'; end if;

  select count(*) into v_n from public._trash_kind_rows(c_admin, null, null, array['meet_meeting'], 200, 0) t
   where t.id = v_mtg and t.label = 'Meeting' and t.title = 'Alder Court PM walkthrough';
  if v_n <> 1 then raise exception '5b: the archived meeting is not in its host''s Trash as a Meeting (% rows)', v_n; end if;
  select count(*) into v_n from public._trash_kind_rows(c_admin, v_north, null, array['meet_meeting'], 200, 0) t
   where t.id = v_mtg and t.label = 'Meeting';
  if v_n <> 1 then raise exception '5c: the archived meeting is not in Northgate''s Organization Trash (% rows)', v_n; end if;

  -- a stranger: refused by Meet's own rule, never by a generic check around it
  perform set_config('request.jwt.claims', j_dana, true);
  perform set_config('role', 'authenticated', true);
  v_caught := null; v_state := null;
  begin
    perform public.entity_undelete('meet_meeting', v_mtg);
    raise exception '5d: Dana restored a meeting she is not host or co-host of';
  exception when others then v_caught := sqlerrm; v_state := sqlstate;
  end;
  perform set_config('role', 'postgres', true);
  if v_state <> '42501' or v_caught !~ 'meet_restore_meeting: only the host or a co-host' then
    raise exception '5e: the stranger was not refused by Meet''s own door: % (%)', v_caught, v_state;
  end if;

  -- the host, from personal Trash
  perform set_config('request.jwt.claims', j_admin, true);
  perform set_config('role', 'authenticated', true);
  v_ok := public.entity_undelete('meet_meeting', v_mtg);
  perform set_config('role', 'postgres', true);
  select m.deleted_at into v_at from communication.meet_meetings m where m.id = v_mtg;
  if v_ok is distinct from true or v_at is not null then
    raise exception '5f: the host restored from personal Trash and the meeting is not back (% / %)', v_ok, v_at;
  end if;

  -- again, from the organization's Trash
  perform set_config('role', 'authenticated', true);
  perform communication.meet_archive_meeting(v_mtg, null);
  v_res := public.org_trash_restore(v_north, 'meet_meeting', v_mtg);
  perform set_config('role', 'postgres', true);
  select m.deleted_at into v_at from communication.meet_meetings m where m.id = v_mtg;
  if not coalesce((v_res ->> 'restored')::boolean, false) or v_at is not null then
    raise exception '5g: the organization''s Trash did not restore the meeting: % (deleted_at %)', v_res, v_at;
  end if;
  if not exists (select 1 from pg_proc p where p.oid = 'public.org_trash_restore(uuid,text,uuid)'::regprocedure
                  and p.prosrc like '%when ''meet_meeting'' then perform communication.meet_restore_meeting(p_id, null);%')
     or not exists (select 1 from pg_proc p where p.oid = 'public.entity_undelete(text,uuid)'::regprocedure
                  and p.prosrc like '%when ''meet_meeting'' then perform communication.meet_restore_meeting(p_id, null); return true;%') then
    raise exception '5h: a Trash restore reaches the meeting without Meet''s own door';
  end if;
  raise notice '5 PASSED — the meeting is in its host''s and its organization''s Trash as "Meeting"; a stranger is refused by Meet; both restores bring it back through Meet''s door.';

  raise notice 'DOORS-DECIDE-LAST GREEN — all five parts passed.';
end
$t$;

rollback;
