-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- DD-189 — THE DISCOVERY RESOLVERS HONOUR THE CLASS IN EVERY ARM (SECURITY)
--
-- WHAT WAS WRONG (measured live 2026-09-13, this database)
-- --------------------------------------------------------
-- DD-137b gave the access kernel (`iam.has_access_for_base`) and its mirror (`iam.entity_read_expr`)
-- a class question on every organization-shaped arm: the org-admin lane exists only for
-- `organization`/`public` (`org_role_lane`), the org-member lane only for
-- `confidential`/`organization`/`public` (`org_member_lane`), the platform-staff lane only for
-- `organization`/`public` (`platform_admin_lane`). DD-136 and DD-170 then walled those same arms at
-- `visibility >= internal` so a `personal` row is nobody's to browse.
--
-- The DISCOVERY resolvers — `iam.is_discoverable_base` and `iam.discoverable_ids`, the pair that
-- decides what an agent or a list endpoint may ENUMERATE — received none of it. DD-185 (B-77) closed
-- exactly one arm in them, the §6e every-signed-in-user system-organization arm, and said so in a
-- comment: the rest were left class-blind and visibility-blind on purpose, to be a row of their own.
-- This is that row.
--
-- These are not internal helpers. `iam` is a PostgREST-exposed schema
-- (`pgrst.db_schemas` … ,iam, …) and `iam.is_discoverable(uuid,text,uuid,permission_level)` is
-- GRANTed to `authenticated`, so any signed-in account can ask this oracle over HTTP about any row
-- id. `public.get_org_file_list` (browser, org files page) answers out of it, and aidream's workflow
-- and SEO list endpoints call `iam.discoverable_ids` / `iam.is_discoverable` for every shared list.
-- An enumeration oracle that says "yes, that row exists and you may see it" about a `private`
-- conversation is the same defect as a read, one question later.
--
-- THE FOUR ARMS CLOSED HERE, each named against the kernel arm it was supposed to mirror
--   1. `is_discoverable_base` org-admin lane — `is_org_admin_for` at viewer, with NO class question
--      and NO visibility guard at all. This is DD-136's defect, alive in the enumerator: an
--      organization admin discovered every `personal` row in their organization.
--   2. `is_discoverable_base` platform-staff lane — `is_super_admin_for` on a global-readable system
--      organization, no class question, no visibility guard: DD-170's defect, alive in the enumerator.
--   3. `is_discoverable_base` late org lanes — org admin / `has_org_access_for` at <= editor, both
--      class-blind: a plain member enumerated `private`-class rows, an org admin `confidential` ones.
--   4. `discoverable_ids` — the same three lanes, built as SQL text into the id producer.
--
-- Closed by the SAME predicate the kernel asks, in the same words, so the enumerator can never again
-- be wider than the reader. Over-tightening is the same size of bug as a stranger let in, so the
-- forcing test below asserts the owner, the organization-class org admin and the organization-class
-- member all still discover exactly what they discovered before.
--
-- ALSO IN THIS FILE
--   `iam.org_readable` — RETIRED in its token-less form and replaced by a class-aware one. It
--   answered "is this organization readable" with `global_readable system org => always true`, took
--   no token, and therefore could not consult a class at all. It is in zero policies; its only
--   callers are the three anon+authenticated SECURITY DEFINER association doors, which bypass
--   `platform.associations`' RLS entirely and used it as their ONLY gate. Live consequence: a
--   signed-out visitor could enumerate all 1,584 association edges owned by the Matrx System
--   organization, including a `processed_document` edge whose class is `private`.
--
--   `platform.create_entity_table` — the blast radius of B-77's 42710 fix, censused, and the
--   end-to-end provisioning proof it was missing for the `system` variant.
--
-- Register: DD-189. Lane B-82. Rules: db-rules FEATURE.md §0/§6d/§9; policies are GENERATED.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════ SECTION 1 — THE GUARD, INSTALLED BEFORE THE FIX
-- A guard you cannot demonstrate failing is not a guard. This one is installed FIRST, run against the
-- code that is deployed right now (RED), and run again at the end of this file (GREEN). It builds its
-- own probes through the sanctioned builder, measures with REAL identities, and tears everything down
-- before it returns — so it is re-runnable any day, not a one-shot block in a migration nobody reruns.
CREATE OR REPLACE FUNCTION iam.discovery_class_selftest()
 RETURNS TABLE(check_name text, status text, detail text)
 LANGUAGE plpgsql VOLATILE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_schema text := 'zz_dd189_selftest_' || to_hex((extract(epoch from clock_timestamp())*1000)::bigint);
  v_token  text;
  -- THE IDENTITIES. Real accounts, chosen so each arm is separable from every other arm.
  v_sysorg     constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';  -- Matrx System, global_readable, ZERO members
  v_org        constant uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';  -- admin's Workspace
  v_author     constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';  -- admin@admin.com — OWNER of every probe row
  v_orgadmin   constant uuid := '34ed4fc3-c527-4819-99bf-15c26603b261';  -- arman@titaniumsuccess.com — admin of v_org, NOT a super admin
  v_member     constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';  -- test@test.com — plain member of v_org
  v_staff      constant uuid := '7604b9d9-57f3-4c44-b75b-dc9a3ee8aacf';  -- arman26@gmail.com — super admin, member of NEITHER organization
  v_stranger   constant uuid := 'a4955b5c-d524-4d72-a90e-0658d5d51148';  -- developer111@pixelium.uk — member of neither, not staff
  r_sys uuid; r_pers uuid; r_int uuid;
  v_ids uuid[];
  v_pub_token text;
  v_conf_token text;
begin
  -- the resolvers refuse when the caller LOOKS like a browser asking about someone else; this runs as
  -- the migration role, so the claim is cleared and the p_user_id argument is the whole identity.
  perform set_config('request.jwt.claims', '', true);

  v_token := v_schema || '_token';
  execute format('create schema %I', v_schema);
  execute format('grant usage on schema %I to authenticated', v_schema);
  -- built `organization` first: create_entity_table CERTIFIES what it builds and a `confidential`
  -- token cannot certify until suppress_platform_admin_lane is declared (DD-137b, working).
  perform platform.create_entity_table(
    v_schema, 'probe', v_token, 'DD-189 discovery-class probe',
    array['note text'], 'entity', false, false, 'internal', false, false, false, false,
    null::text[], 'organization'::platform.data_class, 'organization'::platform.list_scope);
  update platform.entity_types
     set data_class_reason = 'DD-189 self-test probe; the schema and this row are dropped before this function returns'
   where token = v_token;

  execute format('insert into %I.probe (organization_id, created_by, visibility, note) values (%L,%L,''personal'',''system-org personal'') returning id', v_schema, v_sysorg, v_author) into r_sys;
  execute format('insert into %I.probe (organization_id, created_by, visibility, note) values (%L,%L,''personal'',''real-org personal'') returning id',   v_schema, v_org,    v_author) into r_pers;
  execute format('insert into %I.probe (organization_id, created_by, visibility, note) values (%L,%L,''internal'',''real-org internal'') returning id',   v_schema, v_org,    v_author) into r_int;

  -- ── the arms that must CLOSE ────────────────────────────────────────────────────────────────
  -- C1 — THE BRIEF'S RED. A super admin who is a member of NO organization (Matrx System has zero
  -- members) discovers a CONFIDENTIAL row through the platform-staff arm. `confidential` has no
  -- platform-admin lane at all (§3.1), so this arm must not exist for this token.
  update platform.entity_types set data_class='confidential', suppress_platform_admin_lane=true where token=v_token;
  check_name := 'staff_arm_respects_class';
  status := case when iam.is_discoverable_base(v_staff, v_token, r_sys, 'viewer'::public.permission_level, true) then 'FAIL' else 'PASS' end;
  detail := 'a non-member super admin discovers a confidential row in the global-readable system org'; return next;

  -- C2 — the same arm, class `organization` (the lane DOES exist) but the row is `personal`.
  -- DD-170's wall: a table with a real visibility column is walled at >= internal.
  update platform.entity_types set data_class='organization', suppress_platform_admin_lane=false where token=v_token;
  check_name := 'staff_arm_respects_visibility';
  status := case when iam.is_discoverable_base(v_staff, v_token, r_sys, 'viewer'::public.permission_level, true) then 'FAIL' else 'PASS' end;
  detail := 'a super admin discovers a personal row in the global-readable system org'; return next;

  -- C3 — the org-admin arm, class `private` (neither org lane exists), row visibility internal.
  -- `private` is the class that isolates the ROLE arm at viewer: on `confidential` the org-MEMBER
  -- lane legitimately admits every member including the admin (§3.1), so a confidential probe at
  -- viewer proves nothing about the role arm and asserting FALSE there would be over-tightening.
  update platform.entity_types set data_class='private', suppress_platform_admin_lane=true where token=v_token;
  check_name := 'org_admin_arm_respects_class';
  status := case when iam.is_discoverable_base(v_orgadmin, v_token, r_int, 'viewer'::public.permission_level, true) then 'FAIL' else 'PASS' end;
  detail := 'an organization admin discovers a private-class row of their organization'; return next;

  -- C3b — and at ADMIN level, where `confidential` DOES separate the two lanes: org_member_lane
  -- confers at most editor, so only the role lane could admit here, and `confidential` has none.
  update platform.entity_types set data_class='confidential' where token=v_token;
  check_name := 'org_admin_arm_respects_class_at_admin_level';
  status := case when iam.is_discoverable_base(v_orgadmin, v_token, r_int, 'admin'::public.permission_level, true) then 'FAIL' else 'PASS' end;
  detail := 'an organization admin discovers a confidential row at ADMIN level, where only the role lane could admit'; return next;

  -- C4 — the org-admin arm, class `organization` (lane exists), row visibility PERSONAL: DD-136.
  update platform.entity_types set data_class='organization', suppress_platform_admin_lane=false where token=v_token;
  check_name := 'org_admin_arm_respects_visibility';
  status := case when iam.is_discoverable_base(v_orgadmin, v_token, r_pers, 'viewer'::public.permission_level, true) then 'FAIL' else 'PASS' end;
  detail := 'an organization admin discovers another person''s personal row'; return next;

  -- C5 — the org-member arm, class `private` (no org_member_lane), row visibility internal.
  update platform.entity_types set data_class='private', suppress_platform_admin_lane=true where token=v_token;
  check_name := 'org_member_arm_respects_class';
  status := case when iam.is_discoverable_base(v_member, v_token, r_int, 'viewer'::public.permission_level, true) then 'FAIL' else 'PASS' end;
  detail := 'a plain member discovers a private-class row of their organization'; return next;

  -- C6..C8 — the id producer answers the same three questions. Same door, different handle.
  update platform.entity_types set data_class='confidential', suppress_platform_admin_lane=true where token=v_token;
  v_ids := iam.discoverable_ids(v_staff, v_token, 'viewer'::public.permission_level, 0, true);
  check_name := 'ids_staff_arm_respects_class';
  status := case when r_sys = any(v_ids) then 'FAIL' else 'PASS' end;
  detail := 'discoverable_ids hands a non-member super admin a confidential system-org row'; return next;

  v_ids := iam.discoverable_ids(v_orgadmin, v_token, 'admin'::public.permission_level, 0, true);
  check_name := 'ids_org_admin_arm_respects_class';
  status := case when r_int = any(v_ids) then 'FAIL' else 'PASS' end;
  detail := 'discoverable_ids hands an organization admin a confidential row at ADMIN level'; return next;

  update platform.entity_types set data_class='private' where token=v_token;
  v_ids := iam.discoverable_ids(v_member, v_token, 'viewer'::public.permission_level, 0, true);
  check_name := 'ids_org_member_arm_respects_class';
  status := case when r_int = any(v_ids) then 'FAIL' else 'PASS' end;
  detail := 'discoverable_ids hands a plain member a private-class row'; return next;

  -- ── the lanes that must SURVIVE. Over-tightening is the same size of bug. ────────────────────
  update platform.entity_types set data_class='confidential', suppress_platform_admin_lane=true where token=v_token;
  check_name := 'owner_still_discovers';
  status := case when iam.is_discoverable_base(v_author, v_token, r_sys,  'viewer'::public.permission_level, true)
                  and iam.is_discoverable_base(v_author, v_token, r_pers, 'viewer'::public.permission_level, true)
                  and iam.is_discoverable_base(v_author, v_token, r_int,  'viewer'::public.permission_level, true)
             then 'PASS' else 'FAIL' end;
  detail := 'the author of a confidential row must keep discovering all three of their rows'; return next;

  v_ids := iam.discoverable_ids(v_author, v_token, 'viewer'::public.permission_level, 0, true);
  check_name := 'ids_owner_still_lists';
  status := case when r_sys = any(v_ids) and r_pers = any(v_ids) and r_int = any(v_ids) then 'PASS' else 'FAIL' end;
  detail := 'discoverable_ids must keep handing the author their own three rows'; return next;

  -- the CONFIDENTIAL member lane is legitimate and must survive: `confidential` keeps
  -- org_member_lane (§3.1), so every member of the row's organization — the admin included —
  -- still discovers an internal row at viewer. This is the check C3 would have broken.
  check_name := 'confidential_class_member_lane_survives';
  status := case when iam.is_discoverable_base(v_member,   v_token, r_int, 'viewer'::public.permission_level, true)
                  and iam.is_discoverable_base(v_orgadmin, v_token, r_int, 'viewer'::public.permission_level, true)
             then 'PASS' else 'FAIL' end;
  detail := 'a confidential internal row stays discoverable at viewer by every member of its organization'; return next;

  update platform.entity_types set data_class='organization', suppress_platform_admin_lane=false where token=v_token;
  check_name := 'organization_class_org_admin_still_discovers';
  status := case when iam.is_discoverable_base(v_orgadmin, v_token, r_int, 'viewer'::public.permission_level, true) then 'PASS' else 'FAIL' end;
  detail := 'an organization-class internal row stays discoverable by the organization admin'; return next;

  check_name := 'organization_class_member_still_discovers';
  status := case when iam.is_discoverable_base(v_member, v_token, r_int, 'viewer'::public.permission_level, true) then 'PASS' else 'FAIL' end;
  detail := 'an organization-class internal row stays discoverable by a plain member'; return next;

  v_ids := iam.discoverable_ids(v_orgadmin, v_token, 'viewer'::public.permission_level, 0, true);
  check_name := 'ids_organization_class_org_admin_still_lists';
  status := case when r_int = any(v_ids) then 'PASS' else 'FAIL' end;
  detail := 'discoverable_ids keeps the organization-class internal row for the organization admin'; return next;

  check_name := 'stranger_never_discovers';
  status := case when iam.is_discoverable_base(v_stranger, v_token, r_int, 'viewer'::public.permission_level, true)
                   or iam.is_discoverable_base(v_stranger, v_token, r_sys, 'viewer'::public.permission_level, true)
             then 'FAIL' else 'PASS' end;
  detail := 'a member of neither organization discovers an organization-class row'; return next;

  -- ── iam.org_readable — the organization-level oracle the association doors use as their gate ──
  -- It is class-aware only in its two-argument form. Before this migration that form does not exist,
  -- and the check reports the absence rather than raising: a guard that cannot run is a guard that
  -- reads green.
  select token into v_pub_token  from platform.entity_types where is_active and data_class='public'       and rls_variant<>'component' order by token limit 1;
  select token into v_conf_token from platform.entity_types where is_active and data_class='confidential' and rls_variant<>'component' order by token limit 1;
  check_name := 'org_readable_is_class_aware';
  if to_regprocedure('iam.org_readable(uuid,text)') is null then
    status := 'FAIL'; detail := 'iam.org_readable has no class-aware (uuid,text) form; the token-less one cannot ask the class question at all';
  elsif to_regprocedure('iam.org_readable(uuid)') is not null then
    status := 'FAIL'; detail := 'the token-less iam.org_readable(uuid) still exists — a class-blind door beside a class-aware one is not a fix';
  else
    status := case when iam.org_readable(v_sysorg, v_conf_token) then 'FAIL'
                   when not iam.org_readable(v_sysorg, v_pub_token) then 'FAIL'
                   else 'PASS' end;
    detail := format('global-readable system org: confidential token %s must be unreadable, public token %s readable', v_conf_token, v_pub_token);
  end if;
  return next;

  -- teardown, always
  delete from iam.superseded_policy where schema_name = v_schema;
  delete from platform.entity_types where token = v_token;
  execute format('drop schema %I cascade', v_schema);
  return;
exception when others then
  -- a self-test that leaves a schema behind poisons the next run; tear down, then re-raise verbatim.
  begin
    delete from iam.superseded_policy where schema_name = v_schema;
    delete from platform.entity_types where token = v_token;
    execute format('drop schema if exists %I cascade', v_schema);
  exception when others then null; end;
  raise;
end;
$function$;

COMMENT ON FUNCTION iam.discovery_class_selftest() IS
  'DD-189 — the discovery resolvers (iam.is_discoverable_base, iam.discoverable_ids) and iam.org_readable answer to the data class and to visibility in every arm, proven with real identities against real probes. Proven RED against the code deployed 2026-09-13 08:45Z and GREEN in the same migration.';
REVOKE ALL ON FUNCTION iam.discovery_class_selftest() FROM PUBLIC;

-- ── RED. The code that is deployed RIGHT NOW, asked the questions above. ──────────────────────────
do $dd189_red$
declare v_fails text; n int;
begin
  create temporary table _dd189_red on commit drop as
    select * from iam.discovery_class_selftest();
  select count(*) filter (where status='FAIL'),
         string_agg(check_name, ', ' order by check_name) filter (where status='FAIL')
    into n, v_fails from _dd189_red;
  if n = 0 then
    raise exception 'DD-189: the RED run found NOTHING. Either the resolvers were already fixed under this lane, or the probe cannot reach the arms it claims to measure — both make this migration a no-op dressed as a fix.';
  end if;
  raise notice 'DD-189 RED (deployed code) — % FAIL: %', n, v_fails;
  -- the baselines must ALREADY pass, or the probe is measuring the wrong thing
  if exists (select 1 from _dd189_red where status='FAIL' and check_name in
       ('owner_still_discovers','ids_owner_still_lists','confidential_class_member_lane_survives','organization_class_org_admin_still_discovers',
        'organization_class_member_still_discovers','ids_organization_class_org_admin_still_lists','stranger_never_discovers')) then
    raise exception 'DD-189: a NO-OVER-TIGHTENING baseline failed before any change was made — the probe is wrong, not the kernel.';
  end if;
end
$dd189_red$;

-- ═══════════════════════════════════════════════ SECTION 2 — THE ENUMERATOR ASKS THE CLASS
CREATE OR REPLACE FUNCTION iam.is_discoverable_base(p_user_id uuid, p_type text, p_id uuid, p_required public.permission_level, p_include_public boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'platform', 'iam', 'rag'
AS $function$
declare
  v_schema text; v_table text; v_is_component boolean; v_uid uuid := p_user_id;
  v_vis platform.visibility; v_owner uuid; v_org uuid; v_found boolean;
  v_parent_type text; v_parent_col text; v_parent_id uuid; rec record;
  -- 🚨 DD-189 (2026-09-13) — THE SAME SOURCE THE KERNEL AND THE MIRROR READ.
  -- iam.has_access_for_base decides these lanes at runtime from iam.class_lanes; this function is
  -- the ENUMERATOR for the same rows and must never be wider than the reader. One answer, one place.
  v_lanes platform.lane_set;
  -- DD-136's / DD-170's visibility wall, computed once and shared by both role arms exactly as the
  -- kernel shares it: a table with a real visibility column is walled at >= internal; a table with
  -- none at all (and not a parented COMPONENT, whose access is its parent's by contract, db-rules
  -- §6d-1) keeps the arm it always had, because platform.entity_row_access_attrs hard-codes
  -- o_vis := 'personal' for such a table and a bare `>= internal` would strip 305 org-scoped tables.
  v_role_guard boolean;
begin
  if v_uid is null then return false; end if;
  select schema_name, table_name, coalesce(is_component, false) into v_schema, v_table, v_is_component
  from platform.entity_types where token = p_type and is_active;
  if v_schema is null then return false; end if;
  if v_is_component then
    select parent_type, fk_column into v_parent_type, v_parent_col
    from platform.entity_relationships where child_type = p_type and kind = 'composition' limit 1;
    if v_parent_type is null then return false; end if;
    execute format('select %I from %I.%I where id=$1', v_parent_col, v_schema, v_table) into v_parent_id using p_id;
    if v_parent_id is null then return false; end if;
    return iam.is_discoverable_base(v_uid, v_parent_type, v_parent_id, p_required, p_include_public);
  end if;
  v_lanes := iam.class_lanes(p_type);
  if p_required = 'viewer' and public.user_can_read_via_library_grant(v_uid, p_type, p_id) then return true; end if;
  if p_type = 'seo_starter_pack' and public.is_pack_curator(v_uid, p_id) then return true; end if;
  select * into v_vis, v_owner, v_org, v_found from platform.entity_row_access_attrs(v_schema, v_table, p_id);
  if not coalesce(v_found, false) then return false; end if;
  if v_owner = v_uid then return true; end if;
  v_role_guard := coalesce(v_vis >= 'internal'::platform.visibility, false)
                  or (not iam.table_has_visibility(v_schema, v_table)
                      and not iam.token_is_parented_component(p_type));
  -- 🚨 DD-189 — THE ORG-ADMIN LANE, class-gated and visibility-walled (kernel: DD-136/DD-136b).
  -- This arm used to be `is_org_admin_for` and nothing else: no class, no visibility. It is how an
  -- organization admin enumerated every `personal` row in their organization after DD-136 had
  -- already closed the read, and how they enumerated `confidential` and `private` rows whose class
  -- has no org-role lane at all.
  if p_required = 'viewer' and v_org is not null
     and v_lanes.org_role_lane and v_role_guard
     and public.is_org_admin_for(v_uid, v_org) then return true; end if;
  if p_include_public and v_vis = 'public' and p_required = 'viewer' then return true; end if;
  -- DD-185: the §6e arm follows the class here too (unchanged by DD-189).
  if p_include_public and p_required = 'viewer' and v_vis >= 'internal'::platform.visibility and v_org is not null
     and (iam.class_lanes(p_type)).resolved_class in ('organization','public')
     and v_org in (select organization_id from iam.system_orgs where global_readable) then return true; end if;
  -- 🚨 DD-189 — THE PLATFORM-STAFF LANE, class-gated and visibility-walled (kernel: DD-137b/DD-170).
  -- `confidential` and `private` close the staff lane by definition (§3.1 derivation two), and even
  -- where the lane exists a `personal` row is nobody's to browse.
  if v_lanes.platform_admin_lane
     and v_org is not null and v_org in (select organization_id from iam.system_orgs where global_readable)
     and v_role_guard
     and public.is_super_admin_for(v_uid) then return true; end if;
  if public.has_permission_for(v_uid, p_type, p_id, p_required) then return true; end if;
  if exists (
    select 1 from iam.memberships m
    join iam.membership_grant g on g.member_role = m.role and g.container_type in (p_type, '*')
    where m.container_type = p_type and m.container_id = p_id and m.user_id = v_uid and m.deleted_at is null and m.status = 'active' and g.confers >= p_required
  ) then return true; end if;
  -- 🚨 DD-189 — THE LATE ORG LANES, each answering to the class that owns it (kernel, verbatim).
  -- The `visibility >= internal` guard is DD-136's and is unchanged: the class says whether the lane
  -- exists, the row's own value says how far it reaches.
  if v_vis >= 'internal'::platform.visibility and v_org is not null then
    if v_lanes.org_role_lane and public.is_org_admin_for(v_uid, v_org) then return true; end if;
    if v_lanes.org_member_lane
       and p_required <= 'editor'::public.permission_level and iam.has_org_access_for(v_uid, v_org) then return true; end if;
  end if;
  if v_vis >= 'internal'::platform.visibility then
    for rec in select parent_type, fk_column from platform.entity_relationships where child_type = p_type and kind = 'containment' loop
      execute format('select %I from %I.%I where id=$1', rec.fk_column, v_schema, v_table) into v_parent_id using p_id;
      if v_parent_id is not null and iam.is_discoverable_base(v_uid, rec.parent_type, v_parent_id, p_required, false) then return true; end if;
    end loop;
  end if;
  return false;
end;
$function$;

CREATE OR REPLACE FUNCTION iam.discoverable_ids(p_user_id uuid, p_type text, p_required public.permission_level, p_depth integer, p_include_public boolean)
 RETURNS uuid[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'platform', 'iam'
AS $function$
declare
  v_uid uuid := p_user_id;
  v_schema text;
  v_table text;
  v_is_component boolean;
  v_tbl text;
  v_owner_col text;
  v_has_org boolean;
  v_has_vis boolean;
  v_parent_type text;
  v_parent_col text;
  v_parent_ids uuid[];
  v_more uuid[];
  v_trusted text;
  v_sql text;
  v_ids uuid[] := '{}';
  rec record;
  -- 🚨 DD-189 (2026-09-13) — THE ID PRODUCER ASKS THE SAME QUESTION AS THE KERNEL.
  -- This function builds its lanes as SQL TEXT, which is exactly why they were missed: a lane that
  -- is a string concatenation does not look like an access decision. It is one. Every arm below is
  -- the arm iam.has_access_for_base runs, so the enumerator can never be wider than the reader.
  v_lanes platform.lane_set;
  -- true when a role arm may exist for this token at all: the table carries a real visibility
  -- column (and the arm is then walled at >= internal), or it carries none and is not a parented
  -- COMPONENT — the same two-part test the kernel and iam.is_discoverable_base use (DD-136b).
  v_role_arm_exists boolean;
begin
  if v_uid is null or p_depth > 4 then return '{}'::uuid[]; end if;
  if auth.role() = 'anon' then return '{}'::uuid[]; end if;
  if auth.role() = 'authenticated'
     and ((select auth.uid()) is null or (select auth.uid()) is distinct from p_user_id)
  then return '{}'::uuid[]; end if;

  select et.schema_name, et.table_name, coalesce(et.is_component, false)
    into v_schema, v_table, v_is_component
  from platform.entity_types et
  where et.token = p_type and et.is_active;
  if v_schema is null then return '{}'::uuid[]; end if;
  v_tbl := format('%I.%I', v_schema, v_table);

  select c.column_name into v_owner_col
  from information_schema.columns c
  where c.table_schema = v_schema and c.table_name = v_table
    and c.column_name in ('created_by', 'owner_id', 'user_id')
  order by case c.column_name
    when 'created_by' then 1 when 'owner_id' then 2 else 3 end
  limit 1;
  select exists (
    select 1 from information_schema.columns c
    where c.table_schema = v_schema and c.table_name = v_table
      and c.column_name = 'organization_id'
  ) into v_has_org;
  select exists (
    select 1 from information_schema.columns c
    where c.table_schema = v_schema and c.table_name = v_table
      and c.column_name = 'visibility'
      and c.udt_schema = 'platform' and c.udt_name = 'visibility'
  ) into v_has_vis;

  if v_is_component then
    select er.parent_type, er.fk_column into v_parent_type, v_parent_col
    from platform.entity_relationships er
    where er.child_type = p_type and er.kind = 'composition'
    limit 1;
    if v_parent_type is null then return '{}'::uuid[]; end if;
    v_parent_ids := iam.discoverable_ids(
      v_uid, v_parent_type, p_required, p_depth + 1, p_include_public
    );
    v_sql := format(
      'select coalesce(array_agg(t.id), ''{}'') from %s t '
      || 'where t.%I = any($1)%s',
      v_tbl, v_parent_col,
      case when v_owner_col is not null
        then format(' or (t.%I is null and t.%I = $2)', v_parent_col, v_owner_col)
        else '' end
    );
    execute v_sql into v_ids using v_parent_ids, v_uid;
    return coalesce(v_ids, '{}'::uuid[]);
  end if;

  v_lanes := iam.class_lanes(p_type);
  v_role_arm_exists := v_has_vis or not iam.token_is_parented_component(p_type);

  v_trusted := case when v_owner_col is not null
    then format('t.%I = $1', v_owner_col) else 'false' end;
  -- DD-189: the two org lanes, each gated on the class that owns it. `confidential` keeps its
  -- member lane and loses its role lane; `private` loses both; `organization`/`public` keep both,
  -- which is why classifying a table `organization` changes nothing about it.
  if v_has_vis and v_has_org then
    if p_required <= 'editor'::public.permission_level then
      if v_lanes.org_member_lane then
        v_trusted := v_trusted
          || ' or (t.visibility >= ''internal'' and t.organization_id in ('
          || 'select om.organization_id from iam.organization_member om where om.user_id = $1))';
      end if;
    else
      if v_lanes.org_role_lane then
        v_trusted := v_trusted
          || ' or (t.visibility >= ''internal'' and t.organization_id in ('
          || 'select om.organization_id from iam.organization_member om '
          || 'where om.user_id = $1 and om.role in (''owner'', ''admin'')))';
      end if;
    end if;
  end if;
  -- DD-189: the platform-staff arm. It had no class question and no visibility guard at all — the
  -- id-producer half of DD-170, and the reason a super admin's shared-workflow list could enumerate
  -- personal and confidential rows owned by the global-readable system organization.
  if v_has_org and v_lanes.platform_admin_lane and v_role_arm_exists
     and public.is_super_admin_for(v_uid) then
    v_trusted := v_trusted
      || case when v_has_vis then ' or (t.visibility >= ''internal'' and t.organization_id in ('
                                  || 'select so.organization_id from iam.system_orgs so where so.global_readable))'
              else ' or t.organization_id in (select so.organization_id '
                   || 'from iam.system_orgs so where so.global_readable)' end;
  end if;
  if p_required = 'viewer'::public.permission_level then
    if p_include_public and v_has_vis then
      v_trusted := v_trusted || ' or t.visibility = ''public''';
      -- DD-185's §6e arm (unchanged by DD-189).
      if v_has_org and v_lanes.resolved_class in ('organization','public') then
        v_trusted := v_trusted
          || ' or (t.visibility >= ''internal'' and t.organization_id in ('
          || 'select so.organization_id from iam.system_orgs so where so.global_readable))';
      end if;
    end if;
    -- DD-189: the viewer org-admin arm — class-gated and visibility-walled like the kernel's.
    if v_has_org and v_lanes.org_role_lane and v_role_arm_exists then
      v_trusted := v_trusted
        || case when v_has_vis then ' or (t.visibility >= ''internal'' and t.organization_id in ('
                                    || 'select om.organization_id from iam.organization_member om where om.user_id = $1 '
                                    || 'and om.role in (''owner'', ''admin'')))'
                else ' or t.organization_id in (select om.organization_id '
                     || 'from iam.organization_member om where om.user_id = $1 '
                     || 'and om.role in (''owner'', ''admin''))' end;
    end if;
  end if;

  v_sql := format(
    'select coalesce(array_agg(t.id), ''{}'') from %s t where %s',
    v_tbl, v_trusted
  );
  execute v_sql into v_ids using v_uid;
  v_ids := coalesce(v_ids, '{}'::uuid[]);

  for rec in
    select distinct c.id from (
      select p.resource_id as id
      from iam.permissions p
      where p.resource_type = p_type
        and (
          p.granted_to_user_id = v_uid
          or p.granted_to_organization_id in (
            select om.organization_id
            from iam.organization_member om where om.user_id = v_uid
          )
        )
        and p.status <> 'rejected'
        and (p.expires_at is null or p.expires_at > now())
      union
      select m.container_id
      from iam.memberships m
      where m.container_type = p_type
        and m.user_id = v_uid and m.deleted_at is null
    ) c
    where not (c.id = any(v_ids))
  loop
    if iam.is_discoverable_base(
      v_uid, p_type, rec.id, p_required, p_include_public
    ) then v_ids := v_ids || rec.id; end if;
  end loop;

  if v_has_vis then
    for rec in
      select er.parent_type, er.fk_column
      from platform.entity_relationships er
      where er.child_type = p_type and er.kind = 'containment'
    loop
      if exists (
        select 1 from information_schema.columns c
        where c.table_schema = v_schema and c.table_name = v_table
          and c.column_name = rec.fk_column
      ) then
        v_parent_ids := iam.discoverable_ids(
          v_uid, rec.parent_type, p_required, p_depth + 1, false
        );
        if coalesce(array_length(v_parent_ids, 1), 0) > 0 then
          v_sql := format(
            'select coalesce(array_agg(t.id), ''{}'') from %s t '
            || 'where t.visibility >= ''internal'' and t.%I = any($1) '
            || 'and not (t.id = any($2))',
            v_tbl, rec.fk_column
          );
          execute v_sql into v_more using v_parent_ids, v_ids;
          v_ids := v_ids || coalesce(v_more, '{}'::uuid[]);
        end if;
      end if;
    end loop;
  end if;

  return coalesce((
    select array_agg(distinct x) from unnest(v_ids) x
  ), '{}'::uuid[]);
end;
$function$;

-- ════════════════════════════ SECTION 3 — iam.org_readable RETIRED IN ITS CLASS-BLIND FORM
-- THE VERDICT, stated plainly because the brief asks for one: **retired, not patched.**
-- `iam.org_readable(uuid)` cannot be made class-aware — it takes an organization and nothing else,
-- and a data class is a property of the TOKEN. Its global-readable clause is the §6e arm DD-174 and
-- DD-185 closed everywhere else, and it fires for a caller who is not signed in at all. It is in
-- ZERO policies; its only three callers are the association doors, and every one of them has a token
-- in hand for the row it is about to reveal. So the name survives with the argument it always needed
-- and the token-less arity is dropped: a class-blind door beside a class-aware one is not a fix
-- (closing-a-class-means-removing-the-door).
CREATE OR REPLACE FUNCTION iam.org_readable(p_org uuid, p_token text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  -- Membership is unconditional and unchanged: a member of the organization reads its rows.
  select iam.has_org_access(p_org)
      or (exists (select 1 from iam.system_orgs s
                   where s.organization_id = p_org and s.global_readable)
          -- THE §6e ARM, ASKING THE CLASS (DD-174/DD-185, now here too). `public` carries an anon
          -- lane, so a signed-out visitor keeps reading a public-class row owned by the system
          -- organization. `organization` has no anon lane, so the arm needs a signed-in caller.
          -- `confidential` and `private` have no such lane at all and the arm does not exist.
          and case (iam.class_lanes(p_token)).resolved_class
                when 'public'       then true
                when 'organization' then (select auth.uid()) is not null
                else false
              end);
$function$;

COMMENT ON FUNCTION iam.org_readable(uuid, text) IS
  'DD-189 (2026-09-13) — is this organization readable FOR A ROW OF THIS TOKEN. Replaces the token-less iam.org_readable(uuid), which granted every global-readable system-organization row to every caller including anonymous ones because it had no token and so could not consult iam.class_lanes.';

-- The three association doors, repointed. Each gates on the token of the side it REVEALS: the caller
-- already holds the side it passed in, so the counterpart is the thing whose class decides.
CREATE OR REPLACE FUNCTION public.assoc_for_entity(p_type text, p_id uuid)
 RETURNS TABLE(id uuid, direction text, other_type text, other_id uuid, role text, label text, "position" integer, metadata jsonb, organization_id uuid, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select a.id, 'outgoing'::text, a.target_type, a.target_id, a.role, a.label, a.position, a.metadata, a.organization_id, a.created_at
    from platform.associations_live a
   where a.source_type = p_type and a.source_id = p_id and iam.org_readable(a.organization_id, a.target_type)
  union all
  select a.id, 'incoming'::text, a.source_type, a.source_id, a.role, a.label, a.position, a.metadata, a.organization_id, a.created_at
    from platform.associations_live a
   where a.target_type = p_type and a.target_id = p_id and iam.org_readable(a.organization_id, a.source_type)
  order by 7 nulls last, 10;
$function$;

CREATE OR REPLACE FUNCTION public.assoc_for_sources(p_source_type text, p_source_ids uuid[], p_target_type text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, source_id uuid, target_type text, target_id uuid, role text, label text, "position" integer, metadata jsonb, organization_id uuid, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select a.id, a.source_id, a.target_type, a.target_id, a.role, a.label, a.position, a.metadata, a.organization_id, a.created_at
    from platform.associations_live a
   where a.source_type = p_source_type
     and a.source_id = any(coalesce(p_source_ids, '{}'::uuid[]))
     and (p_target_type is null or a.target_type = p_target_type)
     and iam.org_readable(a.organization_id, a.target_type)
  order by 7 nulls last, 10;
$function$;

CREATE OR REPLACE FUNCTION public.assoc_for_targets(p_target_type text, p_target_ids uuid[])
 RETURNS TABLE(id uuid, target_id uuid, source_type text, source_id uuid, role text, label text, "position" integer, metadata jsonb, organization_id uuid, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select a.id, a.target_id, a.source_type, a.source_id, a.role, a.label, a.position, a.metadata, a.organization_id, a.created_at
    from platform.associations_live a
   where a.target_type = p_target_type and a.target_id = any(coalesce(p_target_ids, '{}'::uuid[]))
     and iam.org_readable(a.organization_id, a.source_type)
  order by 7 nulls last, 10;
$function$;

-- The door record, then the drop. Nothing may reference the class-blind form when it goes.
do $dd189_retire$
declare v_refs text;
begin
  select string_agg(n.nspname||'.'||p.proname, ', ')
    into v_refs
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.prosrc ~ 'org_readable\s*\('
     and not (n.nspname='iam' and p.proname='org_readable')
     and p.prosrc !~ 'org_readable\s*\([^)]+,';
  if v_refs is not null then
    raise exception 'DD-189: these functions still call the token-less iam.org_readable and would break on the drop: %', v_refs;
  end if;
  if exists (select 1 from pg_policies where coalesce(qual,'')||coalesce(with_check,'') ~ 'org_readable') then
    raise exception 'DD-189: a POLICY calls iam.org_readable — the census said zero. Re-census before dropping.';
  end if;
end
$dd189_retire$;

insert into platform.deprecated_relations(old_ref, new_ref, reason, deprecated_at)
values ('iam.org_readable(uuid)', 'iam.org_readable(uuid, text)',
        'DD-189 (2026-09-13): the token-less form answered "readable" for every row of a global_readable system organization, to every caller including anonymous ones, because with no token it could not consult iam.class_lanes. Its only callers were public.assoc_for_entity / assoc_for_sources / assoc_for_targets — anon+authenticated SECURITY DEFINER doors that bypass platform.associations RLS and used it as their ONLY gate. All three now pass the token of the side they reveal.',
        now())
on conflict do nothing;

DROP FUNCTION iam.org_readable(uuid);

-- ═══════════════════════════════════════════════════════════ SECTION 4 — GREEN, same guard
do $dd189_green$
declare v_fails text; n int; n_red int;
begin
  create temporary table _dd189_green on commit drop as
    select * from iam.discovery_class_selftest();
  select count(*) filter (where status='FAIL'),
         string_agg(check_name||': '||detail, E'\n    ' order by check_name) filter (where status='FAIL')
    into n, v_fails from _dd189_green;
  if n > 0 then
    raise exception E'DD-189 GREEN FAILED — % check(s) still fail:\n    %', n, v_fails;
  end if;
  select count(*) filter (where status='FAIL') into n_red from _dd189_red;
  raise notice 'DD-189 GREEN — iam.discovery_class_selftest(): % FAIL -> 0 FAIL over % checks',
    n_red, (select count(*) from _dd189_green);
end
$dd189_green$;

-- The ACCESS kernel must not have moved: iam.entity_read_expr bounds its definer call only while
-- iam.entity_read_kernel_fingerprint() matches its pin, and a fingerprint that moved unnoticed
-- rewrites every regenerated policy into the slow unbounded shape. The discovery resolvers and
-- iam.org_readable are deliberately NOT in that set — they mirror nothing — and this asserts it.
do $dd189_pin$
begin
  if iam.entity_read_kernel_fingerprint() is distinct from iam.entity_read_kernel_expected() then
    raise exception 'DD-189: the access-kernel fingerprint MOVED (% vs pinned %). This file was supposed to touch only the discovery resolvers and iam.org_readable, none of which the fingerprint covers.',
      iam.entity_read_kernel_fingerprint(), iam.entity_read_kernel_expected();
  end if;
  raise notice 'DD-189 — access-kernel fingerprint unchanged (%); no policy regeneration is owed by this file.', iam.entity_read_kernel_expected();
end
$dd189_pin$;

-- ═══════════════════ SECTION 5 — platform.create_entity_table: THE BLAST RADIUS, AND THE PROOF
--
-- THE WINDOW, from the ledger rather than from memory. `platform._admit_entity_type_attaches_carrier`
-- was created by aidream's `wf_054_dd176_entity_types_admission_attaches_carrier.sql`, applied
-- 2026-09-13 07:12:37.884Z. B-77's fix landed in `iam_system_org_arm_follows_the_class_dd185.sql`
-- at 2026-09-13 08:45:51.177Z. Between those two instants — 93 minutes — every `entity` and `system`
-- call to the ONE builder `platform._ddl_guard` admits raised 42710 (`_stamp_actor_tier` already
-- exists), because the admission trigger had already attached the carrier on the entity_types INSERT.
--
-- THE CENSUS, measured 2026-09-13 against this database:
--   * 35 migrations were applied inside the window. NONE of them calls create_entity_table (checked
--     file by file in both repos), so nothing was provisioned wrongly.
--   * There is NO runtime caller. Every call site in five repos is a migration file, and both
--     appliers run a file as ONE transaction — so a 42710 aborted the whole file and left no ledger
--     row and no table behind. There is no silent-failure path and no partial-provisioning path to
--     find: a caller could not swallow this error, because no caller is code that runs twice.
--   * Zero half-provisioned tables exist: every active registry row has a physical table, every
--     registered `entity`/`system` table has RLS enabled, and every `entity`-variant table carries
--     EXACTLY ONE `platform._stamp_actor_tier` trigger (257 of 257) — never two, which is what a
--     partially-applied double-attach would have left.
-- The blast radius is therefore ZERO rows and ZERO tables. What it cost was 93 minutes in which the
-- sanctioned builder could not build, and the only reason anyone found out is that DD-185's forcing
-- test needed to build a table. The asserts below are what was missing: a proof that runs.
do $dd189_census$
declare n int; v_list text;
begin
  select count(*), string_agg(et.schema_name||'.'||et.table_name, ', ')
    into n, v_list
    from platform.entity_types et
   where et.is_active and to_regclass(format('%I.%I', et.schema_name, et.table_name)) is null;
  if n > 0 then raise exception 'DD-189 census: % registry row(s) name a table that does not exist (half-provisioned): %', n, v_list; end if;

  select count(*), string_agg(et.schema_name||'.'||et.table_name, ', ')
    into n, v_list
    from platform.entity_types et
    join pg_class c on c.oid = to_regclass(format('%I.%I', et.schema_name, et.table_name))
   where et.is_active and et.rls_variant in ('entity','system') and not c.relrowsecurity;
  if n > 0 then raise exception 'DD-189 census: % registered entity/system table(s) have RLS disabled: %', n, v_list; end if;

  select count(*), string_agg(x.tok, ', ')
    into n, v_list
    from (select et.token as tok,
                 (select count(*) from pg_trigger tg
                   where tg.tgrelid = to_regclass(format('%I.%I', et.schema_name, et.table_name))
                     and not tg.tgisinternal
                     and tg.tgfoid = 'platform._stamp_actor_tier()'::regprocedure) as n
            from platform.entity_types et where et.is_active and et.rls_variant = 'entity') x
   where x.n <> 1;
  if n > 0 then raise exception 'DD-189 census: % entity-variant table(s) do not carry exactly one _stamp_actor_tier trigger (the double-attach signature): %', n, v_list; end if;
  raise notice 'DD-189 census — 0 half-provisioned tables, 0 entity tables with a duplicated or missing actor-tier carrier.';
end
$dd189_census$;

-- The forcing test B-77 could not finish: an `entity` table AND a `system` table, provisioned END TO
-- END through the sanctioned builder and certified by iam.verify_canonical, then torn down. B-77
-- proved only the `entity` half; `system` is the other variant the double-attach broke and nobody
-- has built one since the fix.
CREATE OR REPLACE FUNCTION platform.provisioner_selftest()
 RETURNS TABLE(check_name text, status text, detail text)
 LANGUAGE plpgsql VOLATILE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_schema text := 'zz_dd189_provision_' || to_hex((extract(epoch from clock_timestamp())*1000)::bigint);
  v_tok_e text; v_tok_s text;
  v_carriers int; v_fails text;
begin
  execute format('create schema %I', v_schema);
  v_tok_e := v_schema || '_entity';
  v_tok_s := v_schema || '_system';

  perform platform.create_entity_table(
    v_schema, 'probe_entity', v_tok_e, 'DD-189 provisioner probe (entity)',
    array['note text'], 'entity', false, false, 'internal', false, false, false, false,
    null::text[], 'organization'::platform.data_class, 'organization'::platform.list_scope);
  select count(*) into v_carriers from pg_trigger tg
   where tg.tgrelid = format('%I.probe_entity', v_schema)::regclass
     and not tg.tgisinternal and tg.tgfoid = 'platform._stamp_actor_tier()'::regprocedure;
  select string_agg(v.check_name||coalesce(': '||v.detail,''), '; ')
    into v_fails from iam.verify_canonical(v_schema,'probe_entity',v_tok_e) v where v.status='FAIL';
  check_name := 'provisions_entity_end_to_end';
  status := case when v_carriers = 1 and v_fails is null then 'PASS' else 'FAIL' end;
  detail := format('carrier triggers=%s; verify_canonical FAILs=%s', v_carriers, coalesce(v_fails,'none'));
  return next;

  perform platform.create_entity_table(
    v_schema, 'probe_system', v_tok_s, 'DD-189 provisioner probe (system)',
    array['note text'], 'system', false, false, 'internal', false, false, false, false,
    null::text[], 'public'::platform.data_class, 'organization'::platform.list_scope);
  select count(*) into v_carriers from pg_trigger tg
   where tg.tgrelid = format('%I.probe_system', v_schema)::regclass
     and not tg.tgisinternal and tg.tgfoid = 'platform._stamp_actor_tier()'::regprocedure;
  select string_agg(v.check_name||coalesce(': '||v.detail,''), '; ')
    into v_fails from iam.verify_canonical(v_schema,'probe_system',v_tok_s) v where v.status='FAIL';
  check_name := 'provisions_system_end_to_end';
  status := case when v_carriers = 1 and v_fails is null then 'PASS' else 'FAIL' end;
  detail := format('carrier triggers=%s; verify_canonical FAILs=%s', v_carriers, coalesce(v_fails,'none'));
  return next;

  delete from iam.superseded_policy where schema_name = v_schema;
  delete from platform.entity_types where token in (v_tok_e, v_tok_s);
  execute format('drop schema %I cascade', v_schema);
  return;
exception when others then
  begin
    delete from iam.superseded_policy where schema_name = v_schema;
    delete from platform.entity_types where token in (v_tok_e, v_tok_s);
    execute format('drop schema if exists %I cascade', v_schema);
  exception when others then null; end;
  raise;
end;
$function$;

COMMENT ON FUNCTION platform.provisioner_selftest() IS
  'DD-189 — platform.create_entity_table builds an `entity` table AND a `system` table end to end, each certified by iam.verify_canonical and carrying exactly one actor-tier carrier trigger. Written because the double-attach of 2026-09-13 07:12-08:45Z made every entity/system call raise 42710 and no test could see it.';
REVOKE ALL ON FUNCTION platform.provisioner_selftest() FROM PUBLIC;

do $dd189_prov$
declare v_fails text;
begin
  select string_agg(p.check_name||' ('||p.detail||')', '; ' order by p.check_name)
    into v_fails from platform.provisioner_selftest() p where p.status = 'FAIL';
  if v_fails is not null then
    raise exception 'DD-189: platform.create_entity_table cannot provision end to end: %', v_fails;
  end if;
  raise notice 'DD-189 — platform.provisioner_selftest(): entity and system both provisioned, certified and torn down.';
end
$dd189_prov$;
