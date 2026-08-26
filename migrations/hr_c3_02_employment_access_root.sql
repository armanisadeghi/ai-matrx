-- HR domain C3 — migration 2 of 6 (register item HRB-007, lane core-c3-access).
--
-- 🚨 THE CONVEYANCE LEAK. This file makes `hr_employment` the ENTITY ACCESS ROOT that
-- SPEC-ACCESS §2.1 and §3.1 declare it to be, and removes the `hr_employee → hr_employment`
-- composition edge. It is the single most consequential change in the C3 lane and it is a
-- CORRECTION to a landed, certified table, so the evidence is spelled out in full.
--
-- ============================== WHAT WAS PROVEN, BEFORE ANYTHING WAS TOUCHED ==============================
-- In a rolled-back transaction against the live database, with a real `authenticated` JWT for a
-- real user who is a PLAIN MEMBER of the org (not an org admin, not a super admin, holding no HR
-- role and no derived grant):
--
--   P1  member reads hr.employee   = 1   -- correct: the DIR org-audience viewer grant §3.3 requires
--   P2  member reads hr.employment = 1   -- 🚨 SPEC-ACCESS §9 T-3 requires 0
--   P3  iam.has_access('hr_employment', …, 'viewer') = TRUE   -- §9 T-3 requires false
--   C1/C2 with the DIR grant deleted: 0 and 0  -- so the DIR grant, and nothing else, is the cause
--
-- CAUSE, read out of the live kernel rather than guessed. `hr_employment` was registered as a
-- `composition` CHILD of `hr_employee` (platform.entity_relationships), and the last loop of
-- `iam.has_access_for_base` walks a row's composition/containment PARENTS and returns true if the
-- caller reaches any of them. So the one org-audience viewer grant that makes the directory card
-- readable — the grant §2.1 and §3.3 mandate on every `hr.employee` record — handed every org
-- member the whole working record: the employment spell and, through it, every component hanging
-- off it (punches, work intervals, leave requests, position assignments, training assignments,
-- checklist runs, benefits events, engagements …). That is §9 T-3's leak case, live.
--
-- ============================== WHY THIS FILE MAY MAKE THE CALL ==============================
-- The two specs contradict each other head-on and the tie is already broken in writing:
--   · SPEC-DATA-MODEL §4.3 declares `hr.employment` a COMP of `hr_employee` and reasons that
--     "reads defer to hr.employee's own RLS … the org-audience grant is viewer only" — true of
--     WRITES, and exactly the leak on READS. It never considered that viewer conveys read of the
--     whole subtree.
--   · SPEC-ACCESS §3.1 declares `hr.employment` **`entity`, `personal`, THE access root**; §2.1
--     lists it as one of the four entity-root tokens that receive derived grants; §3.2 gives a
--     plain org member "—" on it; §9 T-3 asserts 0 rows.
--   · SPEC-ACCESS §0 settles who wins: SPEC-DATA-MODEL owns every table and token NAME, and
--     **"this spec owns the tier mapping, the variant per table, and every reach rule, which
--     SPEC-DATA-MODEL adopts verbatim."**
-- So the variant is SPEC-ACCESS's to state and it states `entity`. This is not a new ruling; it is
-- the existing one, applied.
--
-- Every alternative was worse and each is rejected on the record:
--   (a) withhold the DIR grant → the org directory becomes unreadable by org members, which §3.3
--       calls "the textbook over-tightening defect", and db-rules §6 weighs that exactly as heavily
--       as a leak;
--   (b) leave the edge and hope no org member looks → a proven leak of the entire working record;
--   (c) drop the edge and keep the `component` variant → `iam.apply_rls` REFUSES a parentless
--       component, so this is not an available shape.
--
-- BLAST RADIUS, measured not assumed: `hr.employment` holds 0 rows and so does every one of its
-- components; no `features/hr/` exists in matrx-frontend and no `services/hr/` in aidream; the
-- `employee_id` FK is UNCHANGED and stays exactly where §4.3 put it — only the registered
-- conveyance EDGE goes, which is the same NO-EDGE treatment §4.3 already applies to
-- `separation_id` for the identical reason ("so the reason never conveys through the spell").
--
-- OWED SPEC CORRECTIONS (routed, not assumed): SPEC-DATA-MODEL §4.3's header, its
-- `p_variant`/`p_visibility`/`p_parents` arguments and its "Component access" bullet;
-- SPEC-DATA-MODEL §17.3's conveyance list.
--
-- Authority: SPEC-ACCESS §0, §2.1, §3.1, §3.2, §3.3, §9 T-3. Applied live as
-- `hr_c3_02_employment_access_root`. Idempotent.

set local statement_timeout = '600s';
set local lock_timeout = '20s';

-- ============================================================ 1. the visibility column
-- The audited-tier correction (core tranche 1, SPEC-ACCESS §3): an entity with no `visibility`
-- column WARNs `no visibility enum` and one WARN makes canonical_certify_ok false. The column is
-- INERT here in exactly the same sense — it defaults to `personal`, nothing ever sets it `public`,
-- so the generated `pub_read` policy matches no row, and `personal` is the lowest tier so every
-- kernel lane that tests visibility fails closed.
do $$ begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'hr' and table_name = 'employment' and column_name = 'visibility') then
    -- personal-justified: employment is an individual person's root HR record; organization access is conveyed separately by the HR access kernel.
    alter table hr.employment
      add column visibility platform.visibility not null default 'personal'::platform.visibility;
  end if;
end $$;

comment on column hr.employment.visibility is
  'INERT. A certification requirement, never a second access authority (SPEC-ACCESS §3). Nothing writes it; §9 T-32 asserts every row is `personal`.';

comment on column hr.employment.created_by is
  'THE OWNER LANE. SPEC-ACCESS §2.1: the subject''s hr.employee.login_user_id, so the kernel''s owner arm answers a self-read first and costs nothing. NULL for an employee with no platform login (§9 T-17) — no code path may assume it is set.';

-- ============================================================ 2. the conveyance edge
-- 🚨 THE ACTUAL FIX. `employee_id` stays; only the registered edge goes.
delete from platform.entity_relationships
 where child_type = 'hr_employment' and parent_type = 'hr_employee';

-- ============================================================ 3. the variant flip
-- `is_component` is not decorative: platform.entity_types carries
-- CHECK (is_component = (rls_variant = 'component')), so the pair moves together or the UPDATE is
-- refused. It was refused on the first attempt, which is the constraint doing its job.
do $$ begin
  if (select rls_variant from platform.entity_types where token = 'hr_employment') is distinct from 'entity' then
    update platform.entity_types
       set rls_variant = 'entity', is_component = false
     where token = 'hr_employment';
  end if;
end $$;

select iam.apply_rls('hr','employment','hr_employment','entity');

-- the write guard is not part of apply_rls and must survive the regeneration
do $$ begin
  if not exists (select 1 from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
                   join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'hr' and c.relname = 'employment' and tg.tgname = '_zz_guard_hr_write') then
    create trigger _zz_guard_hr_write before insert or update or delete on hr.employment
      for each row execute function hr._guard_hr_write();
  end if;
end $$;

-- ============================================================ 4. DDL guard acknowledgement
do $$
declare r record;
begin
  for r in select distinct object_ref from platform.ddl_guard_log
            where acknowledged_at is null and object_ref like 'hr.%'
              and rule = 'org_not_null_no_backstop' loop
    perform platform.ddl_guard_ack(
      p_reason => 'HR is org-explicit by the 2026-08-21 NO-NULL-ORG ruling; no assignment trigger by design (SPEC-DATA-MODEL 1.3)',
      p_by     => 'hr-domain-migration hr_c3_02',
      p_rule   => 'org_not_null_no_backstop',
      p_object_ref => r.object_ref);
  end loop;
end $$;

-- ============================================================ 5. assertions
do $$
declare v_bad integer; v_n integer;
begin
  if exists (select 1 from platform.entity_relationships
              where child_type = 'hr_employment' and parent_type = 'hr_employee') then
    raise exception 'hr_c3_02: the hr_employee → hr_employment conveyance edge is still registered';
  end if;

  -- the FK itself must NOT have been collateral damage
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'hr' and table_name = 'employment' and column_name = 'employee_id') then
    raise exception 'hr_c3_02: employee_id was dropped; only the EDGE was meant to go';
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'hr.employment'::regclass and contype = 'f'
                    and confrelid = 'hr.employee'::regclass) then
    raise exception 'hr_c3_02: the employee_id foreign key is gone; only the EDGE was meant to go';
  end if;

  if (select rls_variant from platform.entity_types where token = 'hr_employment') <> 'entity' then
    raise exception 'hr_c3_02: hr_employment is not registered as an entity';
  end if;

  select count(*) into v_bad from iam.verify_canonical('hr','employment','hr_employment') where status in ('FAIL','WARN');
  if v_bad > 0 then
    raise exception 'hr_c3_02: hr.employment has % FAIL/WARN conformance rows after the flip', v_bad;
  end if;
  if not iam.canonical_certify_ok('hr','employment','hr_employment') then
    raise exception 'hr_c3_02: hr.employment does not certify after the flip';
  end if;

  -- the components that hang off the new root are untouched and still registered to it
  select count(*) into v_n from platform.entity_relationships where parent_type = 'hr_employment';
  if v_n < 15 then
    raise exception 'hr_c3_02: hr_employment lost its own component children (% remain)', v_n;
  end if;

  -- nothing else in the schema may have picked up a legacy owner column on the way past
  if exists (select 1 from information_schema.columns
              where table_schema = 'hr'
                and column_name in ('user_id','owner_id','author_id','creator_id')) then
    raise exception 'hr_c3_02: an hr table carries a legacy owner column; it can never certify';
  end if;

  select count(*) into v_bad from platform.ddl_guard_log
   where acknowledged_at is null and object_ref like 'hr.%';
  if v_bad > 0 then
    raise exception 'hr_c3_02: % unacked hr.%% DDL guard rows remain', v_bad;
  end if;

  -- the whole schema still certifies; a correction that decertifies a sibling is not a correction
  select count(*) into v_bad from platform.entity_types e
   where e.schema_name = 'hr' and not iam.canonical_certify_ok(e.schema_name, e.table_name, e.token);
  if v_bad > 0 then
    raise exception 'hr_c3_02: % hr tokens no longer certify', v_bad;
  end if;
end $$;
