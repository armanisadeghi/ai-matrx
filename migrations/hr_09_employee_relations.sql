-- HR domain, migration 09 of 16 (register item HRB-006, core tranche 3).
--
-- Employee Relations (D9): hr.restricted_note FIRST (three tables FK it), then
-- hr.corrective_action, hr.incident, hr.incident_party -- plus the THREE deferred
-- corrective_action_id FKs owed by files 05 and 06, plus the trigger that materialises
-- hr.incident.excluded_actor_ids.
--
-- Authority: SPEC-DATA-MODEL sections 10.1-10.4, 15, 17.7, 18.1 file 09, 18.1a.
--
-- 🚨 hr.restricted_note IS THE ONLY LANE IN THE PLATFORM THAT CLOSES THE ORG-ADMIN HOLE.
-- `restricted`'s std_select is owner OR platform super-admin, so is_org_admin_for never reaches
-- it -- which is exactly why three would-be tables (investigation narrative, medical
-- certification, raw background result) were merged into ONE rather than each inventing a
-- scheme. section 1.5 is the reason it must exist: the one class org-admin reach gets wrong is a
-- complaint whose subject IS an org admin.
--
-- Idempotent. Applied live as migration `hr_09_employee_relations`.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS (EXECUTION section 8)
--
-- 1. THREE deferred corrective_action_id FKs are added here, not the two section 18.1's file-09
--    row names. Verified live: `hr.separation`, `hr.attendance_exception` AND
--    `hr.overtime_preapproval` all carry a bare corrective_action_id column. The third is
--    section 7.12's -- it writes `REFERENCES hr.corrective_action(id)` inline, which core
--    tranche 2 could not honour because hr.corrective_action is this file, so it was carried
--    bare and recorded. All three are plain FKs and all three are NO-EDGE.
--    OWED SPEC CORRECTION: one line on section 18.1's file-09 row, adding
--    `hr.overtime_preapproval.corrective_action_id`.
--
-- 2. THE VETO TRIGGER FIRES ON hr.incident AS WELL AS hr.incident_party, where section 10.2 names
--    only the latter. The section says excluded_actor_ids is "materialised by a trigger on every
--    hr.incident_party insert/update/delete in the same transaction (subject, accused, reporter
--    where not anonymous, and each of their line managers as of the incident date)". Two of the
--    four inputs -- SUBJECT and REPORTER -- live on hr.incident itself, not on a party row. A
--    trigger only on hr.incident_party leaves a freshly-filed complaint with a subject and no
--    party rows carrying an EMPTY veto array, which means the subject of the complaint can read
--    it. That is the precise failure AR 1.12 exists to prevent, so this file wires both:
--      * BEFORE INSERT OR UPDATE on hr.incident -- assigns NEW.excluded_actor_ids directly, so
--        there is no recursion and intake is covered from the first row.
--      * AFTER INSERT/UPDATE/DELETE on hr.incident_party -- re-drives the parent, guarded by
--        `is distinct from` so an unchanged set is a no-op and no version row is written.
--    SECURITY DEFINER, deliberately: the veto must be COMPLETE or it is not a veto, and
--    hr.manager_as_of is SECURITY INVOKER -- a writer who cannot see a position assignment must
--    not thereby narrow the exclusion list.
--
-- 3. FLAG AS YOU LAND (section 18.1a) -- two of this file's three listed tokens are flagged here,
--    and the third is BLOCKED on the same platform gap tranche 2 recorded.
--      FLAGGED + regenerated: hr_restricted_note, hr_incident (investigation content).
--      NOT on section 18.1a's list, correctly: hr_corrective_action -- progressive discipline is
--        confidential but is not medical, investigation, secret or pay, and over-flagging is the
--        over-tightening defect db-rules section 6 weighs equally with a leak.
--      🚨 BLOCKED: hr_incident_party IS on section 18.1a's list and is a `component` variant.
--        Re-probed live immediately before authoring this file (rolled back): flag an existing HR
--        component, re-run iam.apply_rls, and iam.verify_canonical still returns
--        `privacy_wall=FAIL`. The P3 owner is fixing iam._apply_rls_unchecked in parallel and
--        this lane must NOT touch the generator. Same blocked class as hr_leave_ledger and
--        hr_payroll_export_line. What IS in force meanwhile: hr_incident_party is a component of
--        hr_incident, whose own wall IS up, so the platform-admin lane reaches the party row only
--        by way of a parent it can no longer read.
--        TO DO THE MOMENT THE GENERATOR FIX LANDS: one UPDATE + one iam.apply_rls for
--        hr_incident_party (and the other two tokens). Section 18.5 query I stays red until then.
-- ===================================================================================

set local lock_timeout = '20s';

-- ============================================================ 10.3 hr.restricted_note  (RESTRICTED)
-- FIRST in the file: hr.incident_party.statement_note_id FKs it, and so will file 10's
-- background-check lane and file 11's records requests.
-- 🚨 subject_token/subject_id are deliberately NOT an entity_relationships edge. A note is
-- reachable ONLY by its owner; making it a component of hr.incident would hand every
-- investigation narrative to everyone who can read the incident.
do $$ begin
  if to_regclass('hr.restricted_note') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'restricted_note', p_token => 'hr_restricted_note',
      p_label => 'Restricted note',
      p_fields => ARRAY[
        'subject_token text NOT NULL',
        'subject_id uuid NOT NULL',
        $f$note_kind text NOT NULL CHECK (note_kind IN ('investigation','witness_statement','medical_certification','accommodation_detail','background_result','legal_advice','executive_only'))$f$,
        'title text',
        'body text',
        'body_file_id uuid REFERENCES files.files(id)',
        'redacted_summary text',
        'occurred_at timestamptz',
        'author_employment_id uuid REFERENCES hr.employment(id)',
        'transferred_from uuid REFERENCES auth.users(id)',
        'transferred_at timestamptz',
        -- {{RETAIN}}
        $f$record_class_key text NOT NULL DEFAULT 'restricted_note' REFERENCES hr.record_class(class_key)$f$,
        'retention_trigger_at timestamptz',
        'legal_hold_count integer NOT NULL DEFAULT 0'
      ],
      p_variant => 'entity', p_versioned => true, p_soft_delete => true, p_visibility => 'personal',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

create index if not exists restricted_note_subject_idx
  on hr.restricted_note (subject_token, subject_id) where deleted_at is null;
create index if not exists restricted_note_kind_idx
  on hr.restricted_note (organization_id, note_kind) where deleted_at is null;

-- section 18.1a: investigation / medical / accommodation / background narrative.
update platform.entity_types set
  suppress_platform_admin_lane = true,
  taxonomy_node_id = '394893a0-be07-4b4a-9b50-3a0cd984bc80'
where token = 'hr_restricted_note';

-- The flag feeds the GENERATOR (entity_types.suppress_platform_admin_lane's own comment:
-- "Changing it requires re-running iam.apply_rls for the token"), so the flip and the flag are
-- regenerated together, unconditionally. Idempotent.
do $$ begin
  update platform.entity_types set rls_variant = 'restricted'
   where token = 'hr_restricted_note' and rls_variant is distinct from 'restricted';
  perform iam.apply_rls('hr','restricted_note','hr_restricted_note','restricted');
end $$;

-- ============================================================ 10.1 hr.corrective_action  (CONF)
-- AR 1.11 -- the artifact that decides wrongful-termination suits and unemployment claims, and
-- the documented basis the termination cascade currently fires without.
-- `employee_statement` is the employee's OWN WORDS and is never edited by the issuer -- the same
-- preserved-disagreement rule as timesheet attestation (section 7.4).
do $$ begin
  if to_regclass('hr.corrective_action') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'corrective_action', p_token => 'hr_corrective_action',
      p_label => 'Corrective action',
      p_fields => ARRAY[
        'employment_id uuid NOT NULL REFERENCES hr.employment(id)',
        $f$level text NOT NULL CHECK (level IN ('coaching','verbal','written','final_written','pip','suspension','termination_recommendation'))$f$,
        'incident_on date NOT NULL',
        'issued_on date NOT NULL',
        'issued_by_employment_id uuid NOT NULL REFERENCES hr.employment(id)',
        'policy_cited text',
        'policy_document_file_id uuid REFERENCES files.files(id)',
        'summary text NOT NULL',
        'expected_improvement text',
        'consequence_if_unmet text',
        'follow_up_on date',
        'follow_up_outcome text',
        $f$outcome text CHECK (outcome IN ('resolved','escalated','expired','rescinded','led_to_separation'))$f$,
        'outcome_on date',
        'employee_acknowledged_at timestamptz',
        $f$employee_acknowledgement_kind text CHECK (employee_acknowledgement_kind IN ('esign','wet_signature','verbal_witnessed','refused'))$f$,
        'employee_statement text',
        'esign_request_id uuid',
        'attendance_exception_id uuid REFERENCES hr.attendance_exception(id)',
        'prior_action_id uuid',
        $f$confidentiality_tier text NOT NULL DEFAULT 'confidential' CHECK (confidentiality_tier IN ('confidential','restricted'))$f$,
        -- {{RETAIN}}
        $f$record_class_key text NOT NULL DEFAULT 'employee_relations' REFERENCES hr.record_class(class_key)$f$,
        'retention_trigger_at timestamptz',
        'legal_hold_count integer NOT NULL DEFAULT 0'
      ],
      p_variant => 'entity', p_versioned => true, p_soft_delete => true, p_visibility => 'personal',
      p_category => true, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

do $$ begin
  -- prior_action_id chains the progressive-discipline ladder.
  if not exists (select 1 from pg_constraint where conname = 'corrective_action_prior_fk') then
    alter table hr.corrective_action add constraint corrective_action_prior_fk
      foreign key (prior_action_id) references hr.corrective_action(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'corrective_action_dates_ordered') then
    alter table hr.corrective_action add constraint corrective_action_dates_ordered check (
      issued_on >= incident_on
      and (outcome_on is null or outcome_on >= issued_on)
      and (follow_up_on is null or follow_up_on >= issued_on));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'corrective_action_no_self_issue') then
    alter table hr.corrective_action add constraint corrective_action_no_self_issue
      check (issued_by_employment_id <> employment_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'corrective_action_outcome_dated') then
    alter table hr.corrective_action add constraint corrective_action_outcome_dated
      check (outcome is null or outcome_on is not null);
  end if;
end $$;

create index if not exists corrective_action_employment_idx
  on hr.corrective_action (employment_id, issued_on desc) where deleted_at is null;
create index if not exists corrective_action_followup_idx
  on hr.corrective_action (organization_id, follow_up_on)
  where follow_up_on is not null and outcome is null and deleted_at is null;

-- NOT flagged: section 18.1a's list does not include it. Progressive discipline is confidential
-- but is not medical, investigation, secret-bearing or pay.
update platform.entity_types set taxonomy_node_id = '394893a0-be07-4b4a-9b50-3a0cd984bc80'
where token = 'hr_corrective_action';

do $$ begin
  if (select rls_variant from platform.entity_types where token = 'hr_corrective_action') is distinct from 'restricted' then
    update platform.entity_types set rls_variant = 'restricted' where token = 'hr_corrective_action';
    perform iam.apply_rls('hr','corrective_action','hr_corrective_action','restricted');
  end if;
end $$;

-- ============================================================ 10.2 hr.incident  (CONF)
-- The OSHA block is the Form 301 / Log 300 field set captured in v1 EVEN THOUGH THE REPORT
-- GENERATOR SHIPS LATER (AR 1.12) -- these fields are impossible to capture after the fact for
-- injuries that already happened. osha_privacy_case drives the name-suppressed 300-log render.
--
-- 🚨 AR 1.12: subject_excluded is a DECLARED, PER-ROW EXCEPTION to AD-2's manager-sees-their-team
-- rule. The subject of a complaint must not see it, and the reporter's own manager may be the
-- accused. The investigation narrative and witness statements live in hr.restricted_note, which
-- no org admin can read at all.
do $$ begin
  if to_regclass('hr.incident') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'incident', p_token => 'hr_incident', p_label => 'Incident',
      p_fields => ARRAY[
        $f$incident_kind text NOT NULL CHECK (incident_kind IN ('injury','illness','near_miss','safety','complaint','ethics','harassment','discrimination','other'))$f$,
        'subject_employment_id uuid REFERENCES hr.employment(id)',
        'reporter_employment_id uuid REFERENCES hr.employment(id)',
        'reported_anonymously boolean NOT NULL DEFAULT false',
        'subject_excluded boolean NOT NULL DEFAULT false',
        $f$excluded_actor_ids uuid[] NOT NULL DEFAULT '{}'$f$,
        'occurred_at timestamptz NOT NULL',
        'reported_at timestamptz NOT NULL DEFAULT now()',
        'establishment_id uuid REFERENCES hr.establishment(id)',
        'summary text NOT NULL',
        $f$state text NOT NULL DEFAULT 'intake' CHECK (state IN ('intake','investigating','action_pending','resolved','closed','referred'))$f$,
        'assigned_to_employment_id uuid REFERENCES hr.employment(id)',
        'follow_up_on date',
        'resolution_summary text',
        'resolved_at timestamptz',
        'osha_case_number text',
        'osha_recordable boolean',
        'osha_privacy_case boolean NOT NULL DEFAULT false',
        $f$osha_outcome text CHECK (osha_outcome IN ('death','days_away','job_transfer_restriction','other_recordable'))$f$,
        'osha_days_away integer',
        'osha_days_restricted integer',
        'injury_body_part text',
        'injury_nature text',
        'injury_object_substance text',
        'injury_event_description text',
        'treatment_beyond_first_aid boolean',
        'treatment_facility text',
        'physician_name text',
        'hospitalized_overnight boolean',
        'emergency_room boolean',
        'date_of_death date',
        'work_restrictions text',
        'return_to_work_on date',
        'leave_case_id uuid REFERENCES hr.leave_case(id)',
        'workers_comp_claim_ref text',
        'provider_ref text',
        'corrective_action_id uuid REFERENCES hr.corrective_action(id)',
        $f$custom jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        -- {{RETAIN}}
        $f$record_class_key text NOT NULL DEFAULT 'employee_relations' REFERENCES hr.record_class(class_key)$f$,
        'retention_trigger_at timestamptz',
        'legal_hold_count integer NOT NULL DEFAULT 0'
      ],
      p_variant => 'entity', p_versioned => true, p_soft_delete => true, p_visibility => 'personal',
      p_category => true, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'incident_anonymous_has_no_reporter') then
    alter table hr.incident add constraint incident_anonymous_has_no_reporter
      check (not reported_anonymously or reporter_employment_id is null);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'incident_osha_days_nonneg') then
    alter table hr.incident add constraint incident_osha_days_nonneg check (
      (osha_days_away is null or osha_days_away >= 0)
      and (osha_days_restricted is null or osha_days_restricted >= 0));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'incident_resolved_dated') then
    alter table hr.incident add constraint incident_resolved_dated
      check (state not in ('resolved','closed') or resolved_at is not null);
  end if;
end $$;

create index if not exists incident_subject_idx on hr.incident (subject_employment_id, occurred_at desc)
  where deleted_at is null;
create index if not exists incident_state_idx on hr.incident (organization_id, state, occurred_at desc)
  where deleted_at is null;
create index if not exists incident_osha_idx on hr.incident (organization_id, occurred_at)
  where osha_recordable and deleted_at is null;
create index if not exists incident_excluded_gin on hr.incident using gin (excluded_actor_ids);
create index if not exists incident_custom_gin on hr.incident using gin (custom jsonb_path_ops);

-- 🚨 excluded_actor_ids is in client_excluded_columns: THE EXCLUDED PERSON MUST NOT BE ABLE TO
-- READ THE LIST THEY ARE ON. section 18.1a: investigation content.
update platform.entity_types set
  client_excluded_columns = ARRAY['excluded_actor_ids'],
  suppress_platform_admin_lane = true,
  taxonomy_node_id = '394893a0-be07-4b4a-9b50-3a0cd984bc80'
where token = 'hr_incident';

do $$ begin
  update platform.entity_types set rls_variant = 'restricted'
   where token = 'hr_incident' and rls_variant is distinct from 'restricted';
  perform iam.apply_rls('hr','incident','hr_incident','restricted');
end $$;

-- ============================================================ 10.4 hr.incident_party  (COMP)
do $$ begin
  if to_regclass('hr.incident_party') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'incident_party', p_token => 'hr_incident_party',
      p_label => 'Incident party',
      p_fields => ARRAY[
        'incident_id uuid NOT NULL REFERENCES hr.incident(id)',
        $f$party_role text NOT NULL CHECK (party_role IN ('witness','involved','accused','reporter','investigator','responder','third_party'))$f$,
        'employment_id uuid REFERENCES hr.employment(id)',
        'external_name text',
        $f$external_contact jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'statement_note_id uuid REFERENCES hr.restricted_note(id)',
        'interviewed_at timestamptz',
        'position integer'
      ],
      p_variant => 'component', p_versioned => true, p_soft_delete => true, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => ARRAY['hr_incident:incident_id']);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'incident_party_identified') then
    alter table hr.incident_party add constraint incident_party_identified
      check (employment_id is not null or external_name is not null);
  end if;
end $$;

create index if not exists incident_party_incident_idx on hr.incident_party (incident_id, position)
  where deleted_at is null;
create index if not exists incident_party_employment_idx on hr.incident_party (employment_id)
  where employment_id is not null and deleted_at is null;

-- section 18.1a: investigation content. This flag was BLOCKED when this file first applied --
-- the privacy wall could not certify on a `component` variant -- and the P3 owner landed the
-- generator fix (in iam.entity_read_expr, re-proven 466/466) the same day. It was applied as
-- migration `hr_09a_incident_party_privacy_wall` and is folded back in here, so a re-run of
-- hr_09 alone reproduces the full state.
update platform.entity_types set
  suppress_platform_admin_lane = true,
  taxonomy_node_id = '394893a0-be07-4b4a-9b50-3a0cd984bc80'
where token = 'hr_incident_party';

do $$ begin
  perform iam.apply_rls('hr','incident_party','hr_incident_party','component');
end $$;

-- ============================================================ 10.2 the veto materialiser
-- 🚨 SPEC-ACCESS section 5 evaluates subject exclusion as an ARRAY-MEMBERSHIP TEST on
-- hr.incident.excluded_actor_ids, NOT a join -- the veto runs last, overrides every capability
-- including hr_owner and break-glass, and a join would put a subquery inside the hottest deny
-- path in the schema. This is the trigger pair that keeps that array true.
--
-- Membership, per section 10.2: the subject, every `accused` party, the reporter where the report
-- is not anonymous, and each of THEIR line managers as of the incident date.
--
-- SECURITY DEFINER: the veto must be COMPLETE or it is not a veto. hr.manager_as_of is SECURITY
-- INVOKER, so a writer who cannot see a position assignment must not thereby narrow the list.
create or replace function hr._incident_excluded_actors_refresh() returns trigger
language plpgsql security definer set search_path = hr, public
as $fn$
declare
  v_on      date;
  v_direct  uuid[];
begin
  v_on := (new.occurred_at)::date;

  v_direct := array(
    select distinct x from (
      select new.subject_employment_id as x
      union all
      select case when new.reported_anonymously then null else new.reporter_employment_id end
      union all
      select ip.employment_id
        from hr.incident_party ip
       where ip.incident_id = new.id
         and ip.party_role = 'accused'
         and ip.deleted_at is null
    ) s
    where x is not null);

  new.excluded_actor_ids := array(
    select distinct y from (
      select unnest(v_direct) as y
      union all
      select hr.manager_as_of(d, v_on) from unnest(v_direct) d
    ) t
    where y is not null);

  return new;
end
$fn$;

comment on function hr._incident_excluded_actors_refresh() is
  'Materialises hr.incident.excluded_actor_ids -- subject, accused parties, non-anonymous reporter, and each of their line managers as of the incident date (SPEC-DATA-MODEL 10.2). SPEC-ACCESS 5 reads this array as a membership test, never a join, because the veto sits in the hottest deny path in the schema.';

drop trigger if exists _zz_incident_excluded_actors on hr.incident;
create trigger _zz_incident_excluded_actors before insert or update on hr.incident
  for each row execute function hr._incident_excluded_actors_refresh();

-- The party side re-drives the parent. `is distinct from` makes an unchanged set a no-op, so
-- _touch_row does not bump `version` and _version_capture writes no history row -- the same
-- guard section 4.9's convenience refresher uses and for the same reason.
create or replace function hr._incident_party_redrive_veto() returns trigger
language plpgsql security definer set search_path = hr, public
as $fn$
declare v_incident uuid;
begin
  if tg_op = 'DELETE' then v_incident := old.incident_id; else v_incident := new.incident_id; end if;
  if v_incident is null then return null; end if;
  -- A no-op UPDATE re-fires the BEFORE trigger on hr.incident, which recomputes the array from
  -- the current party rows. Assigning `subject_excluded` to itself keeps the statement honest
  -- about touching nothing else.
  update hr.incident i set subject_excluded = i.subject_excluded where i.id = v_incident;
  return null;
end
$fn$;

comment on function hr._incident_party_redrive_veto() is
  'Re-drives hr.incident''s excluded_actor_ids after any hr.incident_party change (SPEC-DATA-MODEL 10.2). The parent''s own BEFORE trigger does the computation; this only asks it to run.';

drop trigger if exists _zz_incident_party_redrive_veto on hr.incident_party;
create trigger _zz_incident_party_redrive_veto
  after insert or update or delete on hr.incident_party
  for each row execute function hr._incident_party_redrive_veto();

-- ============================================================ the deferred FKs
-- Section 18.1's file-09 row names two; live inspection found THREE bare corrective_action_id
-- columns. See RECORDED TECHNICAL DECISION 1. All three are plain FKs and all three are NO-EDGE:
-- a corrective action must never convey through a separation, a timesheet exception or an
-- overtime request.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'separation_corrective_action_fk') then
    alter table hr.separation add constraint separation_corrective_action_fk
      foreign key (corrective_action_id) references hr.corrective_action(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'attendance_exception_corrective_action_fk') then
    alter table hr.attendance_exception add constraint attendance_exception_corrective_action_fk
      foreign key (corrective_action_id) references hr.corrective_action(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'overtime_preapproval_corrective_action_fk') then
    alter table hr.overtime_preapproval add constraint overtime_preapproval_corrective_action_fk
      foreign key (corrective_action_id) references hr.corrective_action(id);
  end if;
end $$;

-- ============================================================ the write guard, per table
do $$
declare t text;
begin
  foreach t in array ARRAY['restricted_note','corrective_action','incident','incident_party'] loop
    if not exists (select 1 from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
                     join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'hr' and c.relname = t and tg.tgname = '_zz_guard_hr_write') then
      execute format(
        'create trigger _zz_guard_hr_write before insert or update or delete on hr.%I for each row execute function hr._guard_hr_write()', t);
    end if;
  end loop;
end $$;

-- ============================================================ DDL guard acknowledgement
-- Log-driven, scoped to the one rule section 1.3 sanctions in advance. Any unacked row under any
-- other rule still fails, below.
do $$
declare r record;
begin
  for r in select distinct object_ref from platform.ddl_guard_log
            where acknowledged_at is null
              and object_ref like 'hr.%'
              and rule = 'org_not_null_no_backstop' loop
    perform platform.ddl_guard_ack(
      p_reason => 'HR is org-explicit by the 2026-08-21 NO-NULL-ORG ruling; no assignment trigger by design (SPEC-DATA-MODEL 1.3)',
      p_by     => 'hr-domain-migration hr_09',
      p_rule   => 'org_not_null_no_backstop',
      p_object_ref => r.object_ref);
  end loop;
end $$;

-- ============================================================ assertions
do $$
declare r record; v_bad integer; v_rules text;
begin
  for r in select unnest(ARRAY['restricted_note','corrective_action','incident','incident_party']) as t loop
    select count(*) into v_bad from iam.verify_canonical('hr', r.t, 'hr_' || r.t) where status in ('FAIL','WARN');
    if v_bad > 0 then
      raise exception 'hr_09: hr.% has % FAIL/WARN conformance rows', r.t, v_bad;
    end if;
    if not iam.canonical_certify_ok('hr', r.t, 'hr_' || r.t) then
      raise exception 'hr_09: hr.% does not certify', r.t;
    end if;
    if not exists (select 1 from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
                     join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'hr' and c.relname = r.t and tg.tgname = '_zz_guard_hr_write') then
      raise exception 'hr_09: hr.% is missing _zz_guard_hr_write', r.t;
    end if;
    if (select taxonomy_node_id from platform.entity_types where token = 'hr_' || r.t) is null then
      raise exception 'hr_09: hr_% has no taxonomy_node_id', r.t;
    end if;
  end loop;

  -- the three CONF/RESTRICTED flips
  select count(*) into v_bad from platform.entity_types
   where token in ('hr_restricted_note','hr_corrective_action','hr_incident')
     and rls_variant <> 'restricted';
  if v_bad > 0 then
    raise exception 'hr_09: % employee-relations table(s) are not restricted', v_bad;
  end if;

  -- section 18.1a, for the two this file CAN flag
  select count(*) into v_bad from platform.entity_types
   where token in ('hr_restricted_note','hr_incident','hr_incident_party')
     and not suppress_platform_admin_lane;
  if v_bad > 0 then
    raise exception 'hr_09: % investigation-content token(s) lack suppress_platform_admin_lane', v_bad;
  end if;

  -- the excluded person must not read the list they are on
  if not (select client_excluded_columns @> ARRAY['excluded_actor_ids']
            from platform.entity_types where token = 'hr_incident') then
    raise exception 'hr_09: hr_incident does not exclude excluded_actor_ids from clients';
  end if;

  -- section 17.3 / the conveyance trap: hr.restricted_note must never become a component
  select count(*) into v_bad from platform.entity_relationships er
    join platform.entity_types c on c.token = er.child_type
   where c.schema_name = 'hr' and c.rls_variant = 'restricted';
  if v_bad > 0 then
    raise exception 'hr_09: % restricted hr table(s) carry an entity_relationships edge', v_bad;
  end if;

  -- the veto machinery
  if to_regprocedure('hr._incident_excluded_actors_refresh()') is null then
    raise exception 'hr_09: the veto materialiser is missing';
  end if;
  select count(*) into v_bad from (values ('incident','_zz_incident_excluded_actors'),
                                          ('incident_party','_zz_incident_party_redrive_veto')) as w(t, trg)
   where not exists (select 1 from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
                       join pg_namespace n on n.oid = c.relnamespace
                      where n.nspname='hr' and c.relname = w.t and tg.tgname = w.trg);
  if v_bad > 0 then
    raise exception 'hr_09: % veto trigger(s) missing', v_bad;
  end if;

  -- the three deferred FKs
  select count(*) into v_bad from (values ('separation_corrective_action_fk'),
                                          ('attendance_exception_corrective_action_fk'),
                                          ('overtime_preapproval_corrective_action_fk')) as w(c)
   where not exists (select 1 from pg_constraint where conname = w.c);
  if v_bad > 0 then
    raise exception 'hr_09: % deferred corrective_action FK(s) missing', v_bad;
  end if;

  if exists (select 1 from information_schema.columns c
               join platform.entity_types e
                 on e.schema_name = c.table_schema and e.table_name = c.table_name
              where c.table_schema = 'hr'
                and c.column_name in ('user_id','owner_id','author_id','creator_id')) then
    raise exception 'hr_09: an hr table carries a legacy owner column; it can never certify';
  end if;

  select string_agg(distinct rule, ', ') into v_rules from platform.ddl_guard_log
   where acknowledged_at is null and object_ref like 'hr.%'
     and rule <> 'org_not_null_no_backstop';
  if v_rules is not null then
    raise exception 'hr_09: unacked DDL guard rows on hr.* under unsanctioned rule(s): %', v_rules;
  end if;

  select count(*) into v_bad from platform.ddl_guard_log
   where acknowledged_at is null and object_ref like 'hr.%';
  if v_bad > 0 then
    raise exception 'hr_09: % unacked DDL guard rows remain on hr.*', v_bad;
  end if;
end $$;
