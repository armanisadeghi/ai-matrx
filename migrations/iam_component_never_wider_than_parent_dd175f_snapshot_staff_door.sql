-- iam_component_never_wider_than_parent_dd175f_snapshot_staff_door — DD-175: the two snapshot
-- components' platform-staff door, closed the way the other 132 already close it.
--
-- WHAT dd175c LEFT OPEN, AND WHY IT LEFT IT
-- ----------------------------------------
-- dd175c generated `workbench.udt_document_snapshots` and `workbench.udt_workbook_snapshots` as
-- components, which is what the register row asked for — and both still FAIL
-- `component_not_wider_than_parent`, because `iam.apply_rls` RE-EMITTED the platform-staff door it
-- was meant to remove:
--
--   platform_admin_all  ALL  to authenticated  USING ((select is_platform_admin()))
--   std_select                                 USING ((select is_platform_admin()) OR (document_id in …))
--
-- The staff prefix is NOT decided by the class. `iam.platform_admin_read_prefix` and
-- `iam._apply_rls_unchecked`'s `v_admin` both read ONE registry column —
-- `platform.entity_types.suppress_platform_admin_lane` — and both snapshot tokens carry `false`.
-- `iam.class_lanes` says their resolved class is `private` (through `udt_document` / `workbook`),
-- and `iam.verify_canonical`'s `data_class_derivations` check has been saying so all along:
-- "DD-137b10: this component resolves to class private through its parent, so the platform-staff
-- lane is closed on it too — our own staff go through the door like anyone."
--
-- THE FLEET ALREADY AGREES, MEASURED RATHER THAN ASSUMED (2026-09-13)
-- ------------------------------------------------------------------
-- Of the 134 live component tokens whose resolved class closes the platform-admin lane,
-- **132 carry `suppress_platform_admin_lane = true`** and exactly **2 do not** — these two. So this
-- is not a new mechanism, a new column or a new rule: it is the two tokens that were never
-- declared, being declared the way every one of their 132 siblings is. A second, implicit mechanism
-- (teaching `platform_admin_read_prefix` to ask `iam.class_lanes`) would change nothing observable
-- today and would put two sources in front of one answer; `verify_canonical`'s
-- `data_class_derivations` is already the guard that keeps the column and the class in step.
--
-- WHAT THIS COSTS A PLATFORM ADMIN, NAMED: the rows they could read ONLY through that door — the
-- snapshots of documents and workbooks whose own parent row their own policy refuses. Measured on
-- 2026-09-13 before this file: admin@admin.com read 243 udt_document_snapshots of which 106 sat
-- under a refused parent, and 111 udt_workbook_snapshots of which 87 did. Those are exactly the
-- rows DD-175 exists to close, and the owner's own snapshots are untouched (asserted below).

update platform.entity_types
   set suppress_platform_admin_lane = true
 where token in ('udt_document_snapshot','udt_workbook_snapshot')
   and is_active
   and coalesce(suppress_platform_admin_lane, false) = false;

comment on column platform.entity_types.suppress_platform_admin_lane is
  'THE PRIVACY WALL. True = AI Matrx staff get no read arm on this token: iam._apply_rls_unchecked empties the v_admin prefix, creates no platform_admin_all policy, and drops the is_super_admin arms. DD-137b10 requires it on every component and ledger whose resolved class is private or confidential — our own staff go through the door like anyone. iam.verify_canonical''s data_class_derivations check enforces it.';

-- ── THE TWO HAND-WRITTEN READ DOORS, SUPERSEDED BY NAME ──────────────────────────────────────────
-- `udt_document_snapshots_select` and `udt_workbook_snapshots_select` predate the generator. Each
-- opens `(select is_platform_admin()) OR exists (select 1 from <parent> where id = <fk> and (…))`,
-- so even with the staff prefix gone from the generated set they would keep the staff door open on
-- their own — a permissive policy grants everything it matches, beside every other policy.
--
-- Nothing is lost by removing them, and that is checked rather than hoped: their parent arm admits
-- `d.created_by = auth.uid()`, `d.visibility = 'public'` and `iam.has_access('<parent>', d.id,
-- 'viewer')`, and the generated `std_select` resolves `iam.accessible_entity_ids('<parent>')`, whose
-- own trusted set opens with the owner arm and the public arm and whose candidate lanes are
-- confirmed through `iam.has_access_for_base` — the same three lanes, asked of the same parent. The
-- owner proof at the bottom of this file is what makes that a measurement rather than a reading.
do $$
begin
  if exists (select 1 from pg_policies where schemaname='workbench'
              and tablename='udt_document_snapshots' and policyname='udt_document_snapshots_select') then
    perform iam.supersede_bespoke_policies('workbench','udt_document_snapshots',
      array['udt_document_snapshots_select'],
      'DD-175: a hand-written read door that ORs (select is_platform_admin()) beside the parent arm. '
      'The token is a component of udt_document, whose class is private, so the platform-staff lane '
      'is closed on it (DD-137b10) — this policy granted it back on its own. Its parent arm '
      '(created_by / visibility=public / iam.has_access) is exactly what the generated std_select '
      'now resolves through iam.accessible_entity_ids(''udt_document''), proven by the owner probe '
      'in this migration.');
  end if;
  if exists (select 1 from pg_policies where schemaname='workbench'
              and tablename='udt_workbook_snapshots' and policyname='udt_workbook_snapshots_select') then
    perform iam.supersede_bespoke_policies('workbench','udt_workbook_snapshots',
      array['udt_workbook_snapshots_select'],
      'DD-175: a hand-written read door that ORs (select is_platform_admin()) beside the parent arm. '
      'The token is a component of workbook, whose class is private, so the platform-staff lane is '
      'closed on it (DD-137b10) — this policy granted it back on its own. Its parent arm is exactly '
      'what the generated std_select now resolves through iam.accessible_entity_ids(''workbook'').');
  end if;
end $$;

-- Regenerate whatever the certifier still reports open. Derived from the check, never hand-typed,
-- so it is idempotent and cannot drift from the machinery (the same loop dd175c runs).
do $$
declare r record; v_done text[] := '{}';
begin
  for r in
    select distinct et.token, et.schema_name, et.table_name
      from platform.entity_types et
      join platform.entity_relationships er on er.child_type = et.token and er.kind in ('composition','containment')
     where et.is_active and et.rls_variant = 'component'
       and to_regclass(format('%I.%I', et.schema_name, et.table_name)) is not null
       and exists (select 1 from information_schema.columns c
                    where c.table_schema = et.schema_name and c.table_name = et.table_name
                      and c.column_name = er.fk_column)
     order by et.token
  loop
    continue when not exists (
      select 1 from iam.verify_canonical(r.schema_name, r.table_name, r.token, 'component') v
       where v.check_name = 'component_not_wider_than_parent' and v.status = 'FAIL');
    perform iam.apply_rls(r.schema_name, r.table_name, r.token, 'component');
    v_done := array_append(v_done, r.token);
  end loop;
  raise notice 'dd175f: regenerated % component token(s): %',
    cardinality(v_done), coalesce(array_to_string(v_done, ', '), '(none)');
end $$;

-- ── THE STAFF DOOR IS GONE, THE OWNER IS NOT ─────────────────────────────────────────────────────
do $$
declare
  v_admin uuid; v_owner uuid; v_doc uuid; v_staff bigint; v_own bigint; v_pol int;
begin
  select id into v_admin from auth.users where email = 'admin@admin.com';

  select count(*) into v_pol from pg_policy pol
    join pg_class cl on cl.oid = pol.polrelid
    join pg_namespace ns on ns.oid = cl.relnamespace
   where ns.nspname = 'workbench'
     and cl.relname in ('udt_document_snapshots','udt_workbook_snapshots')
     and pol.polpermissive and pol.polcmd in ('r','*')
     and not exists (select 1 from unnest(pol.polroles) rr join pg_roles ro on ro.oid = rr
                      where ro.rolname = 'service_role')
     and coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') ~ 'is_platform_admin|is_super_admin';
  if v_pol <> 0 then
    raise exception 'dd175f: % readable policy/policies on the two snapshot tables still carry a '
      'platform-staff arm after the regeneration.', v_pol;
  end if;

  -- a legitimate reader is still a reader: the OWNER of a document still reads its snapshots
  select d.created_by, d.id into v_owner, v_doc
    from workbench.udt_documents d
    join workbench.udt_document_snapshots s on s.document_id = d.id
   where d.created_by is not null and d.deleted_at is null
   group by d.created_by, d.id
   order by count(*) desc limit 1;
  if v_owner is null then
    raise exception 'dd175f: no udt_document with snapshots and an owner exists, so the '
      'owner-still-reads proof cannot run. An unrun forcing test is not a forcing test.';
  end if;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner::text, 'role','authenticated')::text, true);
  perform set_config('role','authenticated', true);
  execute format('select count(*) from workbench.udt_document_snapshots where document_id = %L', v_doc)
    into v_own;
  perform set_config('role','postgres', true);

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin::text, 'role','authenticated')::text, true);
  perform set_config('role','authenticated', true);
  select count(*) into v_staff from workbench.udt_document_snapshots s
   where not exists (select 1 from workbench.udt_documents d where d.id = s.document_id);
  perform set_config('role','postgres', true);
  perform set_config('request.jwt.claims', '', true);

  if v_own = 0 then
    raise exception 'dd175f: the OWNER of udt_document % reads 0 of its own snapshots — the '
      'regeneration took a lane it had no business taking.', v_doc;
  end if;
  if v_staff <> 0 then
    raise exception 'dd175f: admin@admin.com still reads % udt_document_snapshots whose parent '
      'document their own policy refuses.', v_staff;
  end if;
  raise notice 'dd175f: the owner still reads % snapshots of document %; admin@admin.com reads 0 '
    'snapshots under a document they may not read.', v_own, v_doc;
end $$;
