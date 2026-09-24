-- LANE ACCESS-IS-PERSONAL — A RECORD ITS OWNER MARKED PERSONAL IS NOT CARRIED BY MEMBERSHIP.
--
-- THE USE CASE (_gridprim_clinic.sql): Cedar Ridge Veterinary Clinic's practice manager, Dr. Ana
-- Whitfield (admin@admin.com), keeps one appointment on the shared day sheet marked personal —
-- her own dog Biscuit's annual wellness visit. The front desk, Marisol Vega (test@test.com), is a
-- member whose membership lets her EDIT the day sheet (the clinic's `member_default_level` is
-- editor). Found by GRID-PRIMITIVES on the clone: Marisol saw the personal row.
--
-- THE RULE (doctrine, not taste). `personal` = the owner and grants addressed to the row only
-- (access STATE §Visibility, "personal = owner+grants only"); the organization lanes honour the
-- row's own visibility (DD-136, `iam.has_access_for_base`: `v_vis >= 'internal'` guards the
-- member lane); the Table edge deliberately carries no row below `internal`
-- (`custom.carrying_edges_of` arm 3: "a row somebody marked personal is reached by a grant and by
-- its creator and by nothing else"). Rule 9's "union only, no deny" is untouched: this narrows a
-- lane addressed to NOBODY (membership), it denies nothing a grant gave.
--
-- THE LEAK. Arm 2 of `custom.reaches_directly` asks `iam.effective_level`, whose role-default
-- half, `iam.member_lane_confers`, answered the clinic's editor default for the personal row with
-- no look at the row's visibility — so the per-row ladder, every set-based page that asks it about
-- a representative of the `personal` class, and every level read (`custom.my_level`, the masks)
-- admitted her.
--
-- WHAT MAKES IT FAIL: Marisol reaching Biscuit's row by the ladder, by `custom.read_record`, or
-- in the Table's visible set; or losing a row she should keep (an internal visit, her own
-- personal note, a row Dr. Whitfield shared with her by name); or the owner losing her own row.
-- RED before accesspersonal_a_personal_record_is_not_carried_by_membership.sql, GREEN after.

\set ON_ERROR_STOP on
\timing off
\set suite 'accesspersonal_personal_record_green.sql'
\set requires 'function:custom.query_visible_ids'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '180s';
\i scripts/campaign-tests/_gridprim_clinic.sql

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org uuid; v_appts uuid; v_biscuit uuid; v_juniper uuid; v_moose uuid; v_mine uuid;
  v_ids uuid[]; v_doc jsonb; v_lvl text;
begin
  select v into v_org from gp where k = 'org';
  select v into v_appts from gp where k = 'appts';
  select v into v_biscuit from gp where k = 'r1';   -- Biscuit (Hollis): Dr. Whitfield's own dog
  select v into v_juniper from gp where k = 'r2';   -- an ordinary internal visit
  select v into v_moose   from gp where k = 'r3';   -- personal too, then shared with Marisol by name

  -- The owner marks two of her own rows personal (the fixture runs as the store's owning role).
  update custom.record set visibility = 'personal' where organization_id = v_org and id in (v_biscuit, v_moose);
  if (select count(*) from custom.record where organization_id = v_org and id in (v_biscuit, v_moose)
       and visibility = 'personal' and created_by = c_admin) <> 2 then
    raise exception 'AP-setup: the two rows are not Dr. Whitfield''s personal rows';
  end if;
  -- …and shares ONE of them with Marisol by name, at viewer. A grant addressed to the row.
  insert into iam.permissions (resource_type, resource_id, granted_to_user_id, permission_level, created_by, status)
  values ('record', v_moose, c_dana, 'viewer', c_admin, 'active');

  -- ══ the ladder, per row ══
  if custom.has_visibility(c_dana, 'record', v_biscuit, 'viewer') then
    raise exception 'AP-1 LEAK: Marisol (member, clinic default editor) reaches Dr. Whitfield''s PERSONAL appointment through the ladder';
  end if;
  if not custom.has_visibility(c_dana, 'record', v_juniper, 'editor') then
    raise exception 'AP-2: Marisol lost the internal visit she edits by membership';
  end if;
  if not custom.has_visibility(c_dana, 'record', v_moose, 'viewer') then
    raise exception 'AP-3: the personal row shared with Marisol BY NAME is not hers to read (a grant addressed to the row must admit)';
  end if;
  if custom.has_visibility(c_dana, 'record', v_moose, 'editor') then
    raise exception 'AP-4: a viewer grant on a personal row was raised to editor by the clinic default';
  end if;
  if not custom.has_visibility(c_admin, 'record', v_biscuit, 'admin') then
    raise exception 'AP-5: the owner lost her own personal row';
  end if;
  raise notice 'AP ladder PASS — personal row: owner yes, member no; shared-by-name personal row: viewer yes, editor no; internal row: member editor yes.';

  -- ══ the seat, through the doors ══
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_dana_j, true);
  begin
    v_doc := custom.read_record(v_org, v_biscuit);
    raise exception 'AP-6 LEAK: custom.read_record handed Marisol the personal appointment: %', v_doc ->> 'patient';
  exception when insufficient_privilege then null;
  end;
  select array_agg(x) into v_ids from custom.query_visible_ids(v_org, v_appts) x;
  if v_biscuit = any (v_ids) then
    raise exception 'AP-7 LEAK: the Table''s visible set lists the personal appointment for Marisol';
  end if;
  if not (v_juniper = any (v_ids)) or not (v_moose = any (v_ids)) then
    raise exception 'AP-8: Marisol''s visible set lost a row she keeps (internal %, shared-by-name %)',
      v_juniper = any (v_ids), v_moose = any (v_ids);
  end if;
  -- Her OWN personal note stays hers.
  v_mine := custom.record_write(v_org, v_appts, jsonb_build_object('patient', 'Front desk: call Nakamura re: Olive''s meds', 'species', 'Cat', 'visit_status', 'Scheduled', 'visit_on', '2026-09-22'));
  perform set_config('role', 'postgres', true);
  update custom.record set visibility = 'personal' where organization_id = v_org and id = v_mine;
  if not custom.has_visibility(c_dana, 'record', v_mine, 'admin') then
    raise exception 'AP-9: Marisol lost her own personal note';
  end if;
  if custom.has_visibility(c_admin, 'record', v_mine, 'viewer') then
    raise notice 'NOTE — the owner of the organization reaches Marisol''s personal note (organization admin arm; VIS-N-3 emergency door is a separate question).';
  end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  v_doc := custom.read_record(v_org, v_biscuit);
  if v_doc ->> 'patient' is distinct from 'Biscuit (Hollis)' then
    raise exception 'AP-10: the owner could not read her own personal appointment';
  end if;
  raise notice 'AP doors PASS — read_record refuses Marisol the personal row; the visible set omits it and keeps the internal row and the shared-by-name one; her own personal note is hers; the owner reads hers.';
  raise notice 'ACCESS-IS-PERSONAL personal-record GREEN — every part passed.';
end $t$;
rollback;
