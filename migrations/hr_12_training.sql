-- HR domain, migration 12 of 16 (register item HRB-006, core tranche 3).
--
-- Training: the five tables of section 13, plus the THREE deferred FKs section 18.1 owes this
-- file -- hr.checklist_template_item.course_id (file 11), hr.course.current_version_id (circular
-- within this file), and hr.credential.training_assignment_id (file 05).
--
-- Authority: SPEC-DATA-MODEL sections 13.1-13.5, 15, 17.7, 18.1 file 12, 18.1a.
--
-- 🚨 AI MATRX DOES NOT BECOME A FULL LMS (v1 anti-goals): no SCORM/xAPI, no catalogs, no
-- classrooms. What these five tables buy is the thing an LMS is usually bought for and rarely
-- delivers -- a defensible answer to "prove this person completed this exact content on this
-- date", years later, after the course was rewritten.
--
-- 🚨 NO TABLE IN THIS FILE IS ON SECTION 18.1a's FLAG LIST, and that is correct rather than an
-- omission: training records carry no pay value, no medical content, no investigation narrative
-- and no secret. Over-flagging is the over-tightening defect db-rules section 6 weighs equally
-- with a leak.
--
-- Idempotent. Applied live as migration `hr_12_training`.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS (EXECUTION section 8)
--
-- 1. hr.transcript_entry GETS A DELETE WALL BUT NOT AN UPDATE WALL, even though section 13.5
--    calls it "the immutable learner transcript" and section 15 says "Transcript is insert-only".
--    The reason is the rule file 11 established and this file is the first to be bound by:
--    🚨 A TABLE CARRYING {{RETAIN}} MUST NEVER GET AN UPDATE WALL. hr.transcript_entry carries
--    record_class_key / retention_trigger_at / legal_hold_count, and file 13's
--    hr.stamp_retention_triggers writes retention_trigger_at while hr.legal_hold_item's trigger
--    maintains legal_hold_count -- both are UPDATEs on exactly this table. An update wall here
--    would break the retention lane before it shipped. hr.training_attempt has no {{RETAIN}}
--    block, so it could take one; it gets the delete wall only, matching the spec's own language
--    ("Append-only") rather than inventing more.
--
-- 2. hr.course_version IS IMMUTABLE ONCE PUBLISHED, enforced by trigger. Section 13.2 states it
--    ("a published version is retired and replaced, never edited") without giving DDL, and it is
--    load-bearing: it is THE ONLY WAY hr.transcript_entry can honestly claim "the exact content
--    version" years later. The trigger permits exactly one transition out of `published` --
--    to `retired`, with its two companion columns -- and refuses every other edit.
--
-- 3. FKs the spec declares BARE stay bare, as throughout tranches 2 and 3:
--    hr.training_assignment has no bare FKs of note, but hr.course.current_version_id IS named by
--    section 13.2 ("a plain FK back, added after this table exists") and by section 18.1's
--    file-12 row, so it IS added here. The distinction this lane has held to all along: add
--    exactly the FKs the spec names, never one it does not.
-- ===================================================================================

set local lock_timeout = '20s';

-- ============================================================ 13.1 hr.course  (DIR)
-- grants_credential / credential_valid_months / recertification_window_days are what wire a
-- course to hr.credential (section 4.8) -- a completed safety course mints a credential with an
-- expiry, and the pre-lapse reminder and the scheduling conflict check both read that expiry.
do $$ begin
  if to_regclass('hr.course') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'course', p_token => 'hr_course', p_label => 'Course',
      p_fields => ARRAY[
        'title text NOT NULL',
        'code text',
        'description text',
        $f$delivery_kind text NOT NULL DEFAULT 'self_paced' CHECK (delivery_kind IN ('self_paced','document_ack','video','live_session','external','on_the_job'))$f$,
        'provider_name text',
        'external_url text',
        'default_duration_minutes integer',
        'requires_assessment boolean NOT NULL DEFAULT false',
        'pass_score numeric(6,2)',
        'max_attempts integer',
        'grants_credential boolean NOT NULL DEFAULT false',
        'credential_name text',
        'credential_valid_months integer',
        'recertification_window_days integer',
        'is_mandated boolean NOT NULL DEFAULT false',
        'mandate_rule_class text',
        'current_version_id uuid',
        'is_active boolean NOT NULL DEFAULT true',
        $f$custom jsonb NOT NULL DEFAULT '{}'::jsonb$f$
      ],
      p_variant => 'entity', p_versioned => true, p_soft_delete => true, p_visibility => 'personal',
      p_category => true, p_listed => true, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'course_title_unique') then
    alter table hr.course add constraint course_title_unique unique (organization_id, title);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'course_assessment_scored') then
    alter table hr.course add constraint course_assessment_scored
      check (not requires_assessment or pass_score is not null);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'course_credential_named') then
    alter table hr.course add constraint course_credential_named
      check (not grants_credential or credential_name is not null);
  end if;
end $$;

create index if not exists course_active_idx on hr.course (organization_id, is_active) where deleted_at is null;
create index if not exists course_mandated_idx on hr.course (organization_id, mandate_rule_class)
  where is_mandated and deleted_at is null;
create index if not exists course_custom_gin on hr.course using gin (custom jsonb_path_ops);

update platform.entity_types set
  title_column = 'title', reference_pickable = true,
  taxonomy_node_id = '11685129-00cf-498c-9c63-08b4bee78d43'
where token = 'hr_course';

-- ============================================================ 13.2 hr.course_version  (COMP of hr_course)
-- 🚨 IMMUTABLE ONCE PUBLISHED -- the only way hr.transcript_entry can honestly claim "the exact
-- content version" years later. content_sha256 is what makes that claim checkable rather than
-- asserted.
do $$ begin
  if to_regclass('hr.course_version') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'course_version', p_token => 'hr_course_version',
      p_label => 'Course version',
      p_fields => ARRAY[
        'course_id uuid NOT NULL REFERENCES hr.course(id)',
        'version_number integer NOT NULL',
        'version_label text',
        $f$locale text NOT NULL DEFAULT 'en-US'$f$,
        $f$content_ref jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'content_file_id uuid REFERENCES files.files(id)',
        'content_sha256 text',
        $f$assessment jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'duration_minutes integer',
        $f$state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','published','retired'))$f$,
        'published_at timestamptz',
        'retired_at timestamptz',
        'retirement_reason text',
        'changelog text'
      ],
      p_variant => 'component', p_versioned => false, p_soft_delete => false, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => ARRAY['hr_course:course_id']);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'course_version_unique') then
    alter table hr.course_version add constraint course_version_unique
      unique (course_id, version_number, locale);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'course_version_published_dated') then
    alter table hr.course_version add constraint course_version_published_dated
      check (state <> 'published' or published_at is not null);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'course_version_retired_reasoned') then
    alter table hr.course_version add constraint course_version_retired_reasoned
      check (state <> 'retired' or retired_at is not null);
  end if;
end $$;

create or replace function hr._course_version_immutable() returns trigger
language plpgsql as $fn$
begin
  if old.state = 'published' then
    if new.state not in ('published','retired') then
      raise exception 'hr.course_version: a published version may only move to retired, not to %', new.state
        using errcode = 'P0001';
    end if;
    if (to_jsonb(new) - 'state' - 'retired_at' - 'retirement_reason'
                      - 'updated_at' - 'updated_by' - 'version')
       is distinct from
       (to_jsonb(old) - 'state' - 'retired_at' - 'retirement_reason'
                      - 'updated_at' - 'updated_by' - 'version') then
      raise exception 'hr.course_version: a published version is retired and replaced, never edited'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end
$fn$;

comment on function hr._course_version_immutable() is
  'SPEC-DATA-MODEL 13.2: a published course version is retired and replaced, never edited. This is what lets hr.transcript_entry claim "the exact content version" years after the course was rewritten.';

drop trigger if exists _zz_course_version_immutable on hr.course_version;
create trigger _zz_course_version_immutable before update on hr.course_version
  for each row execute function hr._course_version_immutable();

create index if not exists course_version_course_idx on hr.course_version (course_id, version_number desc);
create index if not exists course_version_published_idx on hr.course_version (course_id, state)
  where state = 'published';

update platform.entity_types set taxonomy_node_id = '11685129-00cf-498c-9c63-08b4bee78d43'
where token = 'hr_course_version';

-- ============================================================ 13.3 hr.training_assignment  (COMP of hr_employment)
-- Bucket-2 item 9: MANDATED TRAINING IS A RULE, NOT A MANUAL ASSIGNMENT. CA SB1343 (2 hours for
-- supervisors, 1 for staff, biennial, within 6 months of hire or promotion), NY and IL annual,
-- plus CT/DE/ME/WA. `jurisdiction_mandate` rows are generated by the rule engine keyed on
-- jurisdiction + job_title.is_supervisor + hire/promotion date, and rule_version_id freezes which
-- rule generated it.
--
-- 🚨 mandate_cycle_key IS THE IDEMPOTENCY KEY FOR RULE-GENERATED ASSIGNMENTS. A biennial
-- supervisor mandate must produce EXACTLY ONE assignment per employment per cycle, and the
-- generator runs on a cadence -- so without a durable key, every run re-issues the assignment, or
-- the generator has to infer "already issued" from dates, which breaks the moment a due date is
-- extended, a waiver is granted, or the rule's effective window moves. The key is deterministic:
--   <rule_class>:<jurisdiction_key>:<rule_version_id>:<cycle_start_iso>
-- The unique constraint is what makes the generator safely re-runnable -- a second pass conflicts
-- and does nothing. It is NULL for manual and role-based assignments, and a partial unique index
-- is unnecessary because NULLs do not collide.
do $$ begin
  if to_regclass('hr.training_assignment') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'training_assignment', p_token => 'hr_training_assignment',
      p_label => 'Training assignment',
      p_fields => ARRAY[
        'employment_id uuid NOT NULL REFERENCES hr.employment(id)',
        'course_id uuid NOT NULL REFERENCES hr.course(id)',
        'course_version_id uuid NOT NULL REFERENCES hr.course_version(id)',
        $f$assignment_reason text NOT NULL CHECK (assignment_reason IN ('manual','role_based','jurisdiction_mandate','new_hire','promotion','recertification','corrective_action','incident'))$f$,
        'assigned_by_employment_id uuid REFERENCES hr.employment(id)',
        'rule_version_id uuid REFERENCES hr.jurisdiction_rule(id)',
        'source_credential_id uuid REFERENCES hr.credential(id)',
        'assigned_on date NOT NULL DEFAULT current_date',
        'due_on date',
        'recert_window_opens_on date',
        'mandate_cycle_key text',
        $f$state text NOT NULL DEFAULT 'assigned' CHECK (state IN ('assigned','in_progress','completed','failed','overdue','waived','exempt','cancelled'))$f$,
        'completed_at timestamptz',
        'best_score numeric(6,2)',
        'attempt_count integer NOT NULL DEFAULT 0',
        'waiver_reason text',
        'waived_by_employment_id uuid REFERENCES hr.employment(id)',
        'waived_at timestamptz',
        'override_note text',
        'override_by_employment_id uuid REFERENCES hr.employment(id)',
        $f$custom jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        -- {{CALC}}
        $f$rule_version_ids uuid[] NOT NULL DEFAULT '{}'$f$,
        'engine_key text NOT NULL',
        'engine_version text NOT NULL',
        $f$calc jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'computed_at timestamptz NOT NULL DEFAULT now()'
      ],
      p_variant => 'component', p_versioned => true, p_soft_delete => true, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => ARRAY['hr_employment:employment_id']);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'training_assignment_mandate_idempotent') then
    alter table hr.training_assignment add constraint training_assignment_mandate_idempotent
      unique (employment_id, mandate_cycle_key);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'training_assignment_mandate_keyed') then
    alter table hr.training_assignment add constraint training_assignment_mandate_keyed
      check (assignment_reason <> 'jurisdiction_mandate' or mandate_cycle_key is not null);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'training_assignment_unique') then
    alter table hr.training_assignment add constraint training_assignment_unique
      unique (employment_id, course_version_id, assigned_on);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'training_assignment_waiver_reasoned') then
    alter table hr.training_assignment add constraint training_assignment_waiver_reasoned
      check (state <> 'waived' or waiver_reason is not null);
  end if;
end $$;

-- the compliance dashboard's whole query
create index if not exists training_assignment_due_idx on hr.training_assignment (organization_id, state, due_on)
  where state in ('assigned','in_progress','overdue');
create index if not exists training_assignment_employment_idx
  on hr.training_assignment (employment_id, assigned_on desc) where deleted_at is null;
create index if not exists training_assignment_custom_gin
  on hr.training_assignment using gin (custom jsonb_path_ops);

update platform.entity_types set taxonomy_node_id = '11685129-00cf-498c-9c63-08b4bee78d43'
where token = 'hr_training_assignment';

-- ============================================================ 13.4 hr.training_attempt  (COMP of hr_training_assignment)
-- Append-only. No {{RETAIN}} block, so the delete wall is the whole wall here.
do $$ begin
  if to_regclass('hr.training_attempt') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'training_attempt', p_token => 'hr_training_attempt',
      p_label => 'Training attempt',
      p_fields => ARRAY[
        'training_assignment_id uuid NOT NULL REFERENCES hr.training_assignment(id)',
        'attempt_number integer NOT NULL',
        'started_at timestamptz NOT NULL DEFAULT now()',
        'submitted_at timestamptz',
        'time_spent_minutes integer',
        'score numeric(6,2)',
        'passed boolean',
        $f$responses jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        $f$proctoring_evidence jsonb NOT NULL DEFAULT '{}'::jsonb$f$
      ],
      p_variant => 'component', p_versioned => false, p_soft_delete => false, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => ARRAY['hr_training_assignment:training_assignment_id']);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'training_attempt_number_unique') then
    alter table hr.training_attempt add constraint training_attempt_number_unique
      unique (training_assignment_id, attempt_number);
  end if;
end $$;

drop trigger if exists _zz_training_attempt_no_delete on hr.training_attempt;
create trigger _zz_training_attempt_no_delete before delete on hr.training_attempt
  for each row execute function hr._reject_delete();

create index if not exists training_attempt_assignment_idx
  on hr.training_attempt (training_assignment_id, attempt_number desc);

update platform.entity_types set taxonomy_node_id = '11685129-00cf-498c-9c63-08b4bee78d43'
where token = 'hr_training_attempt';

-- ============================================================ 13.5 hr.transcript_entry  (COMP of hr_employment)
-- AR2's IMMUTABLE TRANSCRIPT. Every identifier is snapshotted as text alongside its FK, so the
-- record stays interpretable after a course is renamed, re-versioned or retired -- the same
-- frozen-identifier rule as hr.payroll_export_line (7.9) and hr.asset_assignment (12.6).
-- 🚨 DELETE WALL ONLY, NO UPDATE WALL -- this table carries {{RETAIN}} and file 13's retention
-- lane must be able to write retention_trigger_at and legal_hold_count. See RECORDED DECISION 1.
do $$ begin
  if to_regclass('hr.transcript_entry') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'transcript_entry', p_token => 'hr_transcript_entry',
      p_label => 'Transcript entry',
      p_fields => ARRAY[
        'employment_id uuid NOT NULL REFERENCES hr.employment(id)',
        'employee_id uuid NOT NULL REFERENCES hr.employee(id)',
        'training_assignment_id uuid REFERENCES hr.training_assignment(id)',
        'course_id uuid REFERENCES hr.course(id)',
        'course_version_id uuid REFERENCES hr.course_version(id)',
        'course_title_snapshot text NOT NULL',
        'course_version_label_snapshot text',
        'content_sha256_snapshot text',
        'assignment_reason text NOT NULL',
        'assigned_on date',
        'due_on date',
        'completed_at timestamptz NOT NULL',
        'score numeric(6,2)',
        'passed boolean NOT NULL',
        'attempts integer NOT NULL DEFAULT 1',
        $f$evidence jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'certificate_file_id uuid REFERENCES files.files(id)',
        'credential_id uuid REFERENCES hr.credential(id)',
        'override_note text',
        'override_by_employment_id uuid REFERENCES hr.employment(id)',
        'rule_version_id uuid REFERENCES hr.jurisdiction_rule(id)',
        -- {{RETAIN}}
        $f$record_class_key text NOT NULL DEFAULT 'training_record' REFERENCES hr.record_class(class_key)$f$,
        'retention_trigger_at timestamptz',
        'legal_hold_count integer NOT NULL DEFAULT 0'
      ],
      p_variant => 'component', p_versioned => false, p_soft_delete => false, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => ARRAY['hr_employment:employment_id']);
  end if;
end $$;

drop trigger if exists _zz_transcript_entry_no_delete on hr.transcript_entry;
create trigger _zz_transcript_entry_no_delete before delete on hr.transcript_entry
  for each row execute function hr._reject_delete();

create index if not exists transcript_entry_employment_idx
  on hr.transcript_entry (employment_id, completed_at desc);
create index if not exists transcript_entry_employee_idx
  on hr.transcript_entry (employee_id, completed_at desc);
create index if not exists transcript_entry_course_idx on hr.transcript_entry (course_id, completed_at desc);

update platform.entity_types set taxonomy_node_id = '11685129-00cf-498c-9c63-08b4bee78d43'
where token = 'hr_transcript_entry';

-- ============================================================ the deferred FKs
-- Section 18.1's file-12 row names exactly these three. All plain FKs; the credential link is
-- NO-EDGE (a training assignment must never convey through a credential).
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'checklist_template_item_course_fk') then
    alter table hr.checklist_template_item add constraint checklist_template_item_course_fk
      foreign key (course_id) references hr.course(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'course_current_version_fk') then
    alter table hr.course add constraint course_current_version_fk
      foreign key (current_version_id) references hr.course_version(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'credential_training_assignment_fk') then
    alter table hr.credential add constraint credential_training_assignment_fk
      foreign key (training_assignment_id) references hr.training_assignment(id);
  end if;
end $$;

create index if not exists checklist_template_item_course_idx on hr.checklist_template_item (course_id)
  where course_id is not null and deleted_at is null;
create index if not exists credential_training_assignment_idx on hr.credential (training_assignment_id)
  where training_assignment_id is not null and deleted_at is null;

-- ============================================================ the write guard, per table
do $$
declare t text;
begin
  foreach t in array ARRAY['course','course_version','training_assignment','training_attempt',
                           'transcript_entry'] loop
    if not exists (select 1 from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
                     join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'hr' and c.relname = t and tg.tgname = '_zz_guard_hr_write') then
      execute format(
        'create trigger _zz_guard_hr_write before insert or update or delete on hr.%I for each row execute function hr._guard_hr_write()', t);
    end if;
  end loop;
end $$;

-- ============================================================ DDL guard acknowledgement
do $$
declare r record;
begin
  for r in select distinct object_ref from platform.ddl_guard_log
            where acknowledged_at is null and object_ref like 'hr.%'
              and rule = 'org_not_null_no_backstop' loop
    perform platform.ddl_guard_ack(
      p_reason => 'HR is org-explicit by the 2026-08-21 NO-NULL-ORG ruling; no assignment trigger by design (SPEC-DATA-MODEL 1.3)',
      p_by     => 'hr-domain-migration hr_12',
      p_rule   => 'org_not_null_no_backstop',
      p_object_ref => r.object_ref);
  end loop;
end $$;

-- ============================================================ assertions
do $$
declare r record; v_bad integer; v_rules text;
begin
  for r in select unnest(ARRAY['course','course_version','training_assignment','training_attempt',
                               'transcript_entry']) as t loop
    select count(*) into v_bad from iam.verify_canonical('hr', r.t, 'hr_' || r.t) where status in ('FAIL','WARN');
    if v_bad > 0 then
      raise exception 'hr_12: hr.% has % FAIL/WARN conformance rows', r.t, v_bad;
    end if;
    if not iam.canonical_certify_ok('hr', r.t, 'hr_' || r.t) then
      raise exception 'hr_12: hr.% does not certify', r.t;
    end if;
    if not exists (select 1 from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
                     join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'hr' and c.relname = r.t and tg.tgname = '_zz_guard_hr_write') then
      raise exception 'hr_12: hr.% is missing _zz_guard_hr_write', r.t;
    end if;
    if (select taxonomy_node_id from platform.entity_types where token = 'hr_' || r.t) is null then
      raise exception 'hr_12: hr_% has no taxonomy_node_id', r.t;
    end if;
  end loop;

  -- the mandate idempotency key, which is what makes the generator re-runnable
  if not exists (select 1 from pg_constraint where conname = 'training_assignment_mandate_idempotent') then
    raise exception 'hr_12: training_assignment_mandate_idempotent is missing -- the mandate generator would re-issue every run';
  end if;
  if to_regprocedure('hr._course_version_immutable()') is null then
    raise exception 'hr_12: the published-course-version wall is missing';
  end if;

  -- the three deferred FKs section 18.1 owes this file
  select count(*) into v_bad from (values ('checklist_template_item_course_fk'),
                                          ('course_current_version_fk'),
                                          ('credential_training_assignment_fk')) as w(c)
   where not exists (select 1 from pg_constraint where conname = w.c);
  if v_bad > 0 then
    raise exception 'hr_12: % deferred FK(s) missing', v_bad;
  end if;

  -- section 17.3 / the conveyance trap
  select count(*) into v_bad from platform.entity_relationships er
    join platform.entity_types c on c.token = er.child_type
   where c.schema_name = 'hr' and c.rls_variant = 'restricted';
  if v_bad > 0 then
    raise exception 'hr_12: % restricted hr table(s) carry an entity_relationships edge', v_bad;
  end if;

  if exists (select 1 from information_schema.columns c
               join platform.entity_types e
                 on e.schema_name = c.table_schema and e.table_name = c.table_name
              where c.table_schema = 'hr'
                and c.column_name in ('user_id','owner_id','author_id','creator_id')) then
    raise exception 'hr_12: an hr table carries a legacy owner column; it can never certify';
  end if;

  select string_agg(distinct rule, ', ') into v_rules from platform.ddl_guard_log
   where acknowledged_at is null and object_ref like 'hr.%'
     and rule <> 'org_not_null_no_backstop';
  if v_rules is not null then
    raise exception 'hr_12: unacked DDL guard rows on hr.* under unsanctioned rule(s): %', v_rules;
  end if;

  select count(*) into v_bad from platform.ddl_guard_log
   where acknowledged_at is null and object_ref like 'hr.%';
  if v_bad > 0 then
    raise exception 'hr_12: % unacked DDL guard rows remain on hr.*', v_bad;
  end if;
end $$;
