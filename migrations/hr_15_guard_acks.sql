-- HR domain, migration 15 of 16 (register item HRB-006, core tranche 4) — THE FINAL FILE.
--
-- §18.1 file 15: "one platform.ddl_guard_ack per table for org_not_null_no_backstop (§1.3). Must
-- run after every table exists, or the ack has no row to ack."
--
-- 🚨 THIS FILE IS THE FINAL SWEEP, NOT THE ONLY ONE. §18.1's own note says so, and it is how the
-- build actually went: every file from 07 onward acked log-driven at its own foot, scoped to the
-- one rule §1.3 sanctions and failing loudly on any other. So this sweep is expected to find
-- NOTHING — and that expectation is itself asserted below. If it ever finds rows, an earlier file
-- skipped its ack and that is the defect to chase, not this file's job to paper over.
--
-- The substance of this file is therefore the CLOSING CONFORMANCE BATTERY: §18.5 queries A
-- through I, run against the whole schema in one transaction, so the 16-file migration plan ends
-- with a single artifact that either proves the schema is conformant or refuses to commit.
--
-- Authority: SPEC-DATA-MODEL §1.3, §18.1 file 15, §18.5 (queries A–I), §18.1a.
--
-- Idempotent. Applied live as migration `hr_15_guard_acks`.

set local lock_timeout = '20s';

-- ============================================================ the final ack sweep
do $$
declare r record; v_swept integer := 0;
begin
  for r in select distinct object_ref from platform.ddl_guard_log
            where acknowledged_at is null and object_ref like 'hr.%'
              and rule = 'org_not_null_no_backstop' loop
    perform platform.ddl_guard_ack(
      p_reason => 'HR is org-explicit by the 2026-08-21 NO-NULL-ORG ruling; no assignment trigger by design (SPEC-DATA-MODEL 1.3)',
      p_by     => 'hr-domain-migration hr_15',
      p_rule   => 'org_not_null_no_backstop',
      p_object_ref => r.object_ref);
    v_swept := v_swept + 1;
  end loop;

  if v_swept > 0 then
    raise warning 'hr_15: the final sweep acked % object(s) that an earlier file left unacked — check which file skipped its ack block', v_swept;
  end if;
end $$;

-- ============================================================ §18.5 THE CLOSING CONFORMANCE BATTERY
-- Queries A–I, every one of them, over the whole hr schema. This is the artifact the 16-file
-- plan ends on: it either proves conformance or refuses to commit.
do $$
declare v_bad integer; v_detail text;
begin
  -- ---------- A. no restricted HR table may be a composition/containment child (§17.3)
  -- 🚨 THE CONVEYANCE TRAP. iam.has_access_for_base walks entity_relationships for
  -- composition/containment and returns true if the caller can reach ANY parent, so a
  -- confidential child of a DIR parent would be org-readable.
  select count(*), string_agg(er.child_type, ', ') into v_bad, v_detail
    from platform.entity_relationships er
    join platform.entity_types c on c.token = er.child_type
   where c.schema_name = 'hr' and c.rls_variant = 'restricted';
  if v_bad > 0 then
    raise exception 'hr_15 QUERY A: % restricted hr table(s) carry an entity_relationships edge: %', v_bad, v_detail;
  end if;

  -- ---------- B. no HR component may carry a visibility column (§6d-1)
  select count(*), string_agg(c.table_name, ', ') into v_bad, v_detail
    from information_schema.columns c
    join platform.entity_types e on e.schema_name = c.table_schema and e.table_name = c.table_name
   where c.table_schema = 'hr' and c.column_name = 'visibility' and e.is_component;
  if v_bad > 0 then
    raise exception 'hr_15 QUERY B: % hr component(s) carry a visibility column: %', v_bad, v_detail;
  end if;

  -- ---------- C. every HR table is registered and classified
  select count(*), string_agg(t.table_name, ', ') into v_bad, v_detail
    from information_schema.tables t
    left join platform.entity_types e
      on e.schema_name = 'hr' and e.table_name = t.table_name and e.is_active
   where t.table_schema = 'hr' and t.table_type = 'BASE TABLE'
     and (e.token is null or e.taxonomy_node_id is null);
  if v_bad > 0 then
    raise exception 'hr_15 QUERY C: % hr table(s) unregistered or unclassified: %', v_bad, v_detail;
  end if;

  -- ---------- D. no HR table carries an org-assignment trigger (§1.3, NO NULL ORG)
  select count(*), string_agg(c.relname, ', ') into v_bad, v_detail
    from pg_trigger tg
    join pg_class c on c.oid = tg.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'hr' and not tg.tgisinternal
     and tg.tgfoid in (to_regproc('public._stamp_org_default'),
                       to_regproc('platform.inherit_org_from_parent'));
  if v_bad > 0 then
    raise exception 'hr_15 QUERY D: % hr table(s) carry an org-assignment trigger: %', v_bad, v_detail;
  end if;

  -- ---------- E. every HR token has a retention policy pinned to 'never'
  select count(*), string_agg(e.token, ', ') into v_bad, v_detail
    from platform.entity_types e
    left join platform.retention_policy p on p.entity_token = e.token and p.enabled
   where e.schema_name = 'hr' and (p.id is null or p.mode <> 'never');
  if v_bad > 0 then
    raise exception 'hr_15 QUERY E: % hr token(s) are not pinned to mode=never: %', v_bad, v_detail;
  end if;

  -- ---------- F. every hr base table carries the write guard (R-CORE B4)
  -- SPEC-ACCESS law 2: no client ever writes any hr.* table through PostgREST.
  select count(*), string_agg(c.relname, ', ') into v_bad, v_detail
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'hr' and c.relkind = 'r'
     and not exists (select 1 from pg_trigger t
                      where t.tgrelid = c.oid and not t.tgisinternal
                        and t.tgname = '_zz_guard_hr_write');
  if v_bad > 0 then
    raise exception 'hr_15 QUERY F: % hr table(s) lack _zz_guard_hr_write: %', v_bad, v_detail;
  end if;

  -- ---------- G. every {{RETAIN}}-bearing table resolves to a seeded record class (U-15/DX-2)
  -- A table whose record_class_key DEFAULT names an unseeded class cannot accept an insert at
  -- all — a DDL-time blocker, not a design gap.
  --
  -- 🚨 BUILD-PROVEN CORRECTION TO §18.5's PUBLISHED QUERY G (core tranche 4). As written it is
  --     left join hr.record_class rc on rc.class_key = (select column_default ...)
  --     where ... and rc.class_key is null
  -- which FALSE-POSITIVES on two whole classes of object, and did: it flagged five, all of them
  -- correct as built.
  --   (a) VIEWS. hr.v_access_audit and hr.v_compensation_current expose the column but have no
  --       column_default, so the join finds nothing and the view is reported as broken. A view
  --       has no defaults by definition; the query must restrict to BASE TABLEs.
  --   (b) TABLES WHOSE record_class_key HAS NO DEFAULT — hr.legal_hold_item, hr.access_audit
  --       (both nullable) and hr.disposition_event (NOT NULL, writer-supplied). §§14.4/14.5/14.6
  --       declare them exactly that way ON PURPOSE: the class is a property of the record being
  --       held, audited or destroyed, not of the table holding the reference, so the writer
  --       supplies it and the FK to hr.record_class enforces validity. There is nothing to
  --       default and nothing wrong.
  -- The corrected query checks only what the rule is actually about: a DEFAULT that names a class
  -- which is not seeded. OWED SPEC CORRECTION: §18.5's query G body.
  select count(*), string_agg(c.table_name, ', ') into v_bad, v_detail
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
     and t.table_type = 'BASE TABLE'
   where c.table_schema = 'hr' and c.column_name = 'record_class_key'
     and c.column_default is not null
     and not exists (select 1 from hr.record_class rc
                      where rc.class_key = replace(replace(c.column_default, '''::text', ''), '''', ''));
  if v_bad > 0 then
    raise exception 'hr_15 QUERY G: % table(s) default to an unseeded record class: %', v_bad, v_detail;
  end if;

  -- ---------- H. nothing resolves a jurisdiction or timezone from a SCHEDULE row (D17)
  -- The shift owns the location; there is no defensible per-schedule value when the shifts span
  -- states.
  select count(*) into v_bad from information_schema.columns
   where table_schema = 'hr' and table_name = 'schedule'
     and column_name in ('jurisdiction_id','tz');
  if v_bad > 0 then
    raise exception 'hr_15 QUERY H: hr.schedule carries % jurisdiction/tz column(s) — D17 forbids it', v_bad;
  end if;

  -- ---------- I. every token on the §18.1a flag list carries the privacy wall (D19)
  select count(*), string_agg(token, ', ' order by token) into v_bad, v_detail
    from platform.entity_types
   where schema_name = 'hr'
     and token in ('hr_restricted_note','hr_incident','hr_incident_party','hr_leave_case',
                   'hr_accommodation_request','hr_eeo_response','hr_kiosk_device','hr_kiosk_session',
                   'hr_employment_pin','hr_access_audit','hr_compensation','hr_offer',
                   'hr_tax_withholding','hr_payroll_export_line','hr_employee_private')
     and coalesce(suppress_platform_admin_lane, false) = false;
  if v_bad > 0 then
    raise exception 'hr_15 QUERY I: % flag-list token(s) lack suppress_platform_admin_lane: %', v_bad, v_detail;
  end if;

  -- ---------- the standing guard: zero unacked rows under ANY rule
  select count(*) into v_bad from platform.ddl_guard_log
   where acknowledged_at is null and object_ref like 'hr.%';
  if v_bad > 0 then
    select string_agg(distinct rule, ', ') into v_detail from platform.ddl_guard_log
     where acknowledged_at is null and object_ref like 'hr.%';
    raise exception 'hr_15: % unacked DDL guard row(s) remain on hr.* under rule(s): %', v_bad, v_detail;
  end if;

  -- ---------- the closing gate: 100% certification
  select count(*) into v_bad from platform.entity_types
   where schema_name = 'hr' and not iam.canonical_certify_ok(schema_name, table_name, token);
  if v_bad > 0 then
    select string_agg(token, ', ') into v_detail from platform.entity_types
     where schema_name = 'hr' and not iam.canonical_certify_ok(schema_name, table_name, token);
    raise exception 'hr_15: % hr token(s) do not certify: %', v_bad, v_detail;
  end if;

  -- ---------- and the §3 legacy-owner-column wall, one last time
  if exists (select 1 from information_schema.columns c
               join platform.entity_types e
                 on e.schema_name = c.table_schema and e.table_name = c.table_name
              where c.table_schema = 'hr'
                and c.column_name in ('user_id','owner_id','author_id','creator_id')) then
    raise exception 'hr_15: an hr table carries a legacy owner column; it can never certify';
  end if;
end $$;

-- ============================================================ the closing record
comment on schema hr is
  'The AI Matrx HR schema. Built across migrations hr_00 .. hr_15 per /projects/hr-domain/specs/SPEC-DATA-MODEL.md. EVERY table is created through platform.create_entity_table with p_org_default => false (NO NULL ORG, db-rules §2), carries _zz_guard_hr_write (SPEC-ACCESS law 2: no client writes an hr.* table through PostgREST), is classified to a taxonomy node, and passes iam.canonical_certify_ok. Confidential tiers are the `restricted` variant reached through audited SECURITY DEFINER RPCs, never a visibility tier. Retention is HR-owned: hr.retention_rule holds cited legal periods, hr.retention_due_on resolves them, and every platform.retention_policy row for an hr token is mode=never so the platform sweeper stays out. Conformance queries A-I live in §18.5 and are asserted in hr_15.';
