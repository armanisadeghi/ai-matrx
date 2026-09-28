-- lane: access-ladder T-11 review, part x: the read-kernel fingerprint covers the three T-11 part s
-- doors, and its member list lives in ONE place.
--
-- Why: iam.accessible_entity_candidates and iam.accessible_child_parents COPY the candidate union and
-- the child-parent lane of iam.accessible_entity_ids, and iam.candidate_admits is the confirmation the
-- files/folders read policies now call per row. None of the three was hashed by
-- iam.entity_read_kernel_fingerprint(), so a lane added to accessible_entity_ids (which IS hashed and
-- re-recorded) left the copies behind with every guard green: the generator kept emitting the lazy
-- arms, and files.files / files.folders silently stopped admitting what the kernel admits.
--
-- What changes:
--   1. iam.entity_read_kernel_members() — the ONE list of fingerprinted functions (the previous 16
--      plus the 3 doors). iam.entity_read_kernel_fingerprint() and
--      iam.entity_read_kernel_members_live() both read it, so the two lists can no longer drift apart.
--   2. The fingerprint is re-recorded: no kernel BODY changes here, only coverage, so the premise is
--      that the old 16-member hash equals the recorded one, and the kernel equivalence fixture answers
--      identically before and after.
-- Guard (proved in a rolled-back transaction, 2026-09-28): replacing iam.accessible_entity_candidates
-- with any other body now moves the fingerprint off the recorded value, and
-- iam.entity_read_expr('files','files','file') falls back to the unbounded iam.has_access lane with a
-- WARNING; before this file the same replace left the fingerprint unchanged.
-- No table is locked; no policy text changes (fingerprint == expected afterwards).
set local lock_timeout = '2s';
-- based-on: iam.entity_read_kernel_fingerprint() 2d62b1795bdabf271dac50263ae5d048d7233cb410f5e6c7553dacae2283d696
-- based-on: iam.entity_read_kernel_members_live() 999ba67a4ce6d030ba793c21e509ead0557ec40995b6bdb650f638b61c6db164
-- based-on: iam.entity_read_kernel_expected() 0514b0c10a7eebc73c56f7f7b183598cbba7bcafdde9c483362612f32ae40c0b
-- based-on: iam.entity_read_kernel_members_expected() 2bf496f59580ed25990f756f1ceca2ec8e8443dc3d9e48d07d1db6a229841da5

-- 0. THE PREMISE: the kernel is recorded as it stands, and the fixture's answers are snapshotted.
do $pre$
begin
  if iam.entity_read_kernel_fingerprint() is distinct from iam.entity_read_kernel_expected() then
    raise exception 't11x: the live access kernel (%) is not the recorded one (%); another lane moved a fingerprinted body and has not re-recorded it. Refusing rather than re-recording their change as this file''s.',
      iam.entity_read_kernel_fingerprint(), iam.entity_read_kernel_expected();
  end if;
  create temp table _t11x_answers_before (a jsonb) on commit drop;
  insert into _t11x_answers_before select platform.kernel_equivalence_answers();
  if (select k.a->>'error' from _t11x_answers_before k) is not null then
    raise exception 't11x: the kernel equivalence fixture errors before this file: %', (select k.a->>'error' from _t11x_answers_before k);
  end if;
end $pre$;

-- 1. THE ONE LIST.
create or replace function iam.entity_read_kernel_members()
returns table(schema_name text, function_name text)
language sql
immutable
as $function$
  -- Every function whose body decides (or copies what decides) a read answer the generated entity
  -- read lane mirrors. iam.entity_read_kernel_fingerprint() hashes exactly these; add a function
  -- here and it is guarded everywhere. aidream scripts/check_kernel_rerecord_pairing.py carries the
  -- same names for its file-level check: change both together.
  values
    ('iam','has_access_for'), ('iam','has_access_for_base'),
    ('iam','accessible_entity_ids'), ('iam','has_org_access_for'),
    ('files','has_access_for'), ('files','is_crawl_artifact'),
    ('files','crawl_site_conveys'),
    ('platform','entity_row_access_attrs'),
    ('public','user_can_read_via_library_grant'), ('public','library_is_open'),
    ('public','is_rulebook_curator'), ('public','is_pack_curator'),
    ('public','_edu_can_read_via_assignment'), ('public','has_permission_for'),
    ('public','is_org_admin_for'), ('public','user_can_read_data_store_via_grant'),
    -- Access ladder T-11 part s: copies of accessible_entity_ids' candidate union and child-parent
    -- lane, and the per-row confirmation the files/folders read policies call.
    ('iam','accessible_entity_candidates'), ('iam','accessible_child_parents'),
    ('iam','candidate_admits')
$function$;

comment on function iam.entity_read_kernel_members() is
  'The one list of read-kernel functions hashed by iam.entity_read_kernel_fingerprint() and listed by '
  'iam.entity_read_kernel_members_live(). Access ladder T-11 part x added the three part-s doors.';
-- iam.entity_read_kernel_fingerprint() is SECURITY INVOKER and executable by these roles (the
-- generator runs inside iam.apply_rls / platform.provision as any of them), so the list it reads is too.
-- A constant list of catalog names: no row, no identity, nothing a caller can learn.
grant execute on function iam.entity_read_kernel_members()
  to authenticated, authenticator, service_role, matrx_provisioner, svc_seo, dashboard_user;

CREATE OR REPLACE FUNCTION iam.entity_read_kernel_fingerprint()
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
begin
  -- lane DOORS-DECIDE-LAST: the identical query, in plpgsql so its plan is kept for the session.
  -- Ordered by IDENTITY, so the hash is stable across catalog reordering AND across
  -- databases. It used to end `order by … p.oid::text`, which is neither: an OID is
  -- assigned per database, so production's three iam.has_access_for_base overloads sorted
  -- 1700097/1700098/4422507 and the rehearsal branch's sorted 109931/56365/56366 (as TEXT),
  -- and the same sixteen bodies hashed differently on the two databases.
  -- Access ladder T-11 part x: the member list is iam.entity_read_kernel_members(), shared with
  -- iam.entity_read_kernel_members_live().
  return (
  select md5(string_agg(p.prosrc, '|' order by n.nspname, p.proname,
                        pg_get_function_identity_arguments(p.oid)))
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where (n.nspname::text, p.proname::text) in (
    select m.schema_name, m.function_name from iam.entity_read_kernel_members() m
  ));
end;
$function$;

CREATE OR REPLACE FUNCTION iam.entity_read_kernel_members_live()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  select coalesce(jsonb_object_agg(n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
                                   md5(p.prosrc)), '{}'::jsonb)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where (n.nspname::text, p.proname::text) in (
    select m.schema_name, m.function_name from iam.entity_read_kernel_members() m
  );
$function$;

-- 2. THE RE-RECORD. Coverage only: the answers are identical, and the members that moved are exactly
-- the three doors (plus any member whose snapshot the previous re-record left stale, named in the
-- evidence).
do $rerecord$
declare
  c_new constant text[] := array[
    'iam.accessible_child_parents(p_child_type text)',
    'iam.accessible_entity_candidates(p_type text)',
    'iam.candidate_admits(p_type text, p_id uuid)']::text[];
  v_after jsonb; v_snap jsonb; v_chk jsonb; v_from text; v_to text; v_live jsonb; v_rec jsonb;
  v_moved text[]; v_pre jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('platform.kernel_fingerprint_rerecord'));
  v_from := iam.entity_read_kernel_expected();
  v_to := iam.entity_read_kernel_fingerprint();
  if v_to = v_from then
    raise exception 't11x: the fingerprint did not move after adding three members; nothing re-recorded.';
  end if;
  v_after := platform.kernel_equivalence_answers();
  select k.a into v_snap from _t11x_answers_before k;
  if v_after->>'error' is not null or v_snap is null or (v_after->'answers') is distinct from (v_snap->'answers') then
    raise exception 't11x: the fixture''s answers moved under a coverage-only change; nothing re-recorded.';
  end if;
  v_chk := platform.kernel_equivalence_check();
  if v_chk->>'error' is not null or (v_chk->>'lost')::int <> 0 or (v_chk->>'missing')::int <> 0 then
    raise exception 't11x: the kernel equivalence check reports lost or missing answers: %', v_chk - 'answers';
  end if;
  v_live := iam.entity_read_kernel_members_live();
  v_rec := coalesce(iam.entity_read_kernel_members_expected()->'members', '{}'::jsonb);
  if not (v_live ?& c_new) then
    raise exception 't11x: the live member list lacks one of the three doors: %', c_new;
  end if;
  select coalesce(array_agg(k order by k), '{}'::text[]) into v_moved from (
    select k from jsonb_object_keys(v_live) k where (v_rec->>k) is distinct from (v_live->>k)
    union
    select k from jsonb_object_keys(v_rec) k where not v_live ? k
  ) s;
  execute format($ddl$CREATE OR REPLACE FUNCTION iam.entity_read_kernel_expected()
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $f$
  SELECT %L::text
$f$$ddl$, v_to);
  execute format($ddl$CREATE OR REPLACE FUNCTION iam.entity_read_kernel_members_expected()
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
AS $f$
  SELECT %L::jsonb
$f$$ddl$, jsonb_build_object('fingerprint', v_to, 'members', v_live)::text);
  if iam.entity_read_kernel_fingerprint() is distinct from iam.entity_read_kernel_expected() then
    raise exception 't11x: re-recorded % but the live fingerprint reads %', iam.entity_read_kernel_expected(), iam.entity_read_kernel_fingerprint();
  end if;
  v_pre := platform.provision_preflight();
  if exists (select 1 from jsonb_array_elements(coalesce(v_pre->'findings', '[]'::jsonb)) f
              where f->>'rule_id' = 'preflight.read_kernel') then
    raise exception 't11x: the provisioner preflight still names the read kernel after the re-record: %', v_pre;
  end if;
  insert into platform.kernel_fingerprint_record
    (fingerprint_from, fingerprint_to, members_changed, ruling, fixture_version, evidence, via, target)
  values (v_from, v_to, v_moved,
          'ACCESS LADDER T-11 part x (review of 5c2374d963): coverage only. The three part-s doors '
          '(iam.accessible_entity_candidates, iam.accessible_child_parents, iam.candidate_admits) copy or '
          'confirm iam.accessible_entity_ids'' lanes for the files/folders read policies and are now '
          'fingerprinted; the member list is iam.entity_read_kernel_members(). No kernel body changed.',
          v_chk->>'version',
          jsonb_build_object('fixture_answers_identical_before_and_after', true,
                             'answers', jsonb_array_length(jsonb_path_query_array(v_after->'answers', '$.keyvalue()')),
                             'members_added', to_jsonb(c_new),
                             'check_against_recorded_expectation', v_chk - 'answers'),
          'matrx-frontend migrations/access_ladder_t11x_kernel_fingerprint_covers_candidate_doors.sql',
          'iam.entity_read_kernel_fingerprint coverage (T-11 part s doors)');
  raise notice 't11x: kernel re-recorded % -> % (moved: %)', v_from, v_to, v_moved;
end $rerecord$;
