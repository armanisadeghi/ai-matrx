-- HR domain, migration 06 of 16 (register item HRB-006, core tranche 2).
--
-- Time & Attendance: sixteen tables -- hr.kiosk_device (section 4.11, which section 18.1 puts in
-- this file because every {{ACTOR}} block below FKs it) plus the fifteen of section 7 --
-- the punch immutability trigger, the pay-period state machine, and the append-only walls.
--
-- Authority: SPEC-DATA-MODEL sections 4.11, 7.1-7.15, 17.7, 18.1 file 06.
--
-- THE GOVERNING LAW HERE IS AD-11 / AR2 LOCK 5: raw facts live in hr.punch and are NEVER
-- edited; everything computed lives in hr.work_interval and can be recomputed from the raw
-- facts at any time. A manager "punch edit" is a VOID plus a REPLACEMENT pair, never an update.
-- A recomputation sets is_current = false and superseded_by_id on the old rows and inserts new
-- ones -- the prior answer, with the rule versions that produced it, stays on disk.
--
-- THREE RESTRICTED FLIPS: kiosk_device, employment_pin, kiosk_session. All three bear a
-- credential (a device secret, a PIN hash, a session token hash) and db-rules section 6f puts
-- secrets in the `restricted` variant, never behind a visibility tier. Created `entity` at
-- p_visibility => 'personal' and flipped -- the tranche-1 correction now published as
-- section 1.4 item 3.
--
-- Idempotent. Applied live as migration `hr_06_time_attendance`.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS (EXECUTION section 8)
--
-- 1. hr.employment_pin and hr.kiosk_session take p_soft_delete => true where sections 7.10 and
--    7.11 say `soft-delete false`. Both are non-component, non-ledger `entity` variants, and
--    iam.verify_canonical's `soft_delete` check reads (verified live, function body):
--      IF v_soft_delete THEN ... ELSIF f_del THEN PASS
--      ELSIF v_variant='ledger' THEN SKIP ELSIF v_variant='component' THEN SKIP
--      ELSE status:='WARN'
--    -- and iam.canonical_certify_ok is FALSE on a single WARN. Neither table can certify
--    without the column. Closing a conformance gap that is an ADD is the standing platform
--    answer (db-rules changelog 2026-08-21 closed 17 tables this way), and it is the same call
--    core tranche 1 made for hr.record_class / hr.retention_rule. Nothing ever sets deleted_at
--    on either table: a PIN is retired by `revoked_at` + a new rotated row, a session by
--    `ended_at`. OWED SPEC CORRECTION: sections 7.10 and 7.11's soft-delete line.
--
-- 2. {{ACTOR}}.actor_token_id is carried BARE (uuid, no REFERENCES) on every table in this
--    file. Section 2 declares `actor_token_id uuid REFERENCES platform.actor_token(id)`, and
--    platform.actor_token does not exist -- it is SPEC-ESIGN's table, register item HRB-011
--    (section 16 confirms the owning spec and the table name). The FK lands with that schema,
--    exactly as section 18.1 carries hr.punch.shift_id bare until file 07. This applies to
--    every later file that expands {{ACTOR}} before HRB-011 ships.
--
-- 3. hr.overtime_preapproval.corrective_action_id is carried BARE. Section 7.12 writes
--    `REFERENCES hr.corrective_action(id)`; hr.corrective_action is file 09 (section 18.1),
--    which is also the file that adds hr.attendance_exception.corrective_action_id's FK. Both
--    columns are added to file 09's deferred-FK block.
--
-- 4. THE SIX BUSINESS RPCs SECTION 18.1 LISTS FOR THIS FILE ARE NOT BUILT HERE, deliberately,
--    and this is a scope statement rather than a gap. hr._punch_immutable and
--    hr._pay_period_transition ARE built below -- both are fully specified (section 7.1's
--    literal body; section 7.3's enumerated legal transition set). hr.punch_record,
--    hr.kiosk_authenticate, hr.set_employment_pin, hr.kiosk_claim_pairing and
--    hr.auto_close_open_punches are specified only as CONTRACTS (signature, refusal list,
--    return shape) in SPEC-TIME section 1.2 -- no body exists in any spec, and each one reads
--    hr.time_and_attendance.* knobs that section 19.2 places in file 14 (a missing knob RAISES
--    by design, so writing them now yields functions that cannot run) and resolves the derived
--    HR role grants that SPEC-ACCESS / HRB-007 has not built. They belong to the L3 lane
--    (HRB-015). The tables, their constraints and their walls -- which is what this migration
--    file owes -- are complete and certified.
-- ===================================================================================

set local lock_timeout = '20s';

-- ============================================================ 4.11 hr.kiosk_device  (RESTRICTED)
-- AR 1.17: every RLS variant assumes auth.uid(); a break-room tablet authenticating by PIN has
-- none. The four pairing columns are the ONLY path that mints a device secret.
-- The device NEVER writes a punch directly and a long-lived secret NEVER rides a punch request:
-- the device exchanges its secret once for a session, and every punch presents the session id.
do $$ begin
  if to_regclass('hr.kiosk_device') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'kiosk_device', p_token => 'hr_kiosk_device', p_label => 'Kiosk device',
      p_fields => ARRAY[
        'location_id uuid NOT NULL REFERENCES hr.location(id)',
        'device_name text NOT NULL',
        'device_secret_hash text NOT NULL',
        'device_secret_set_at timestamptz NOT NULL DEFAULT now()',
        'pairing_code_hash text',
        'pairing_code_expires_at timestamptz',
        'pairing_claimed_at timestamptz',
        'device_fingerprint text',
        $f$trust_state text NOT NULL DEFAULT 'pending' CHECK (trust_state IN ('pending','trusted','suspended','revoked'))$f$,
        'registered_by_employment_id uuid REFERENCES hr.employment(id)',
        'last_seen_at timestamptz',
        'last_seen_ip inet',
        'clock_skew_seconds integer NOT NULL DEFAULT 0',
        'max_clock_skew_seconds integer NOT NULL DEFAULT 300',
        'require_photo boolean NOT NULL DEFAULT false',
        'require_geo boolean NOT NULL DEFAULT false',
        $f$allowed_geofence jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        $f$settings jsonb NOT NULL DEFAULT '{}'::jsonb$f$
      ],
      p_variant => 'entity', p_versioned => true, p_soft_delete => true, p_visibility => 'personal',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

create index if not exists kiosk_device_location_idx on hr.kiosk_device (location_id) where deleted_at is null;
create index if not exists kiosk_device_trust_idx on hr.kiosk_device (organization_id, trust_state) where deleted_at is null;

update platform.entity_types set
  client_excluded_columns = ARRAY['device_secret_hash','pairing_code_hash'],
  taxonomy_node_id = '959be751-bf57-4770-8f9e-cc2df3209b9c'
where token = 'hr_kiosk_device';

do $$ begin
  if (select rls_variant from platform.entity_types where token = 'hr_kiosk_device') is distinct from 'restricted' then
    update platform.entity_types set rls_variant = 'restricted' where token = 'hr_kiosk_device';
    perform iam.apply_rls('hr','kiosk_device','hr_kiosk_device','restricted');
  end if;
end $$;

-- ============================================================ 7.1 hr.punch  (COMP of hr_employment)
-- THE RAW FACT. shift_id is carried bare -- hr.shift is file 07, and it is a plain FK
-- (scheduled-vs-actual), never a parentage.
do $$ begin
  if to_regclass('hr.punch') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'punch', p_token => 'hr_punch', p_label => 'Punch',
      p_fields => ARRAY[
        'employment_id uuid NOT NULL REFERENCES hr.employment(id)',
        'position_assignment_id uuid REFERENCES hr.position_assignment(id)',
        'shift_id uuid',
        $f$punch_kind text NOT NULL CHECK (punch_kind IN ('clock_in','clock_out','break_start','break_end','meal_start','meal_end','transfer'))$f$,
        'break_paid boolean',
        'occurred_at timestamptz NOT NULL',
        'device_reported_at timestamptz',
        'server_received_at timestamptz NOT NULL DEFAULT now()',
        'clock_skew_applied_seconds integer NOT NULL DEFAULT 0',
        $f$source text NOT NULL CHECK (source IN ('web','kiosk','mobile','manager_entry','import','auto_close'))$f$,
        'idempotency_key text NOT NULL',
        'geo_lat numeric(9,6)',
        'geo_lng numeric(9,6)',
        'geo_accuracy_m integer',
        'source_ip inet',
        'photo_file_id uuid REFERENCES files.files(id)',
        $f$attestation_kind text CHECK (attestation_kind IN ('meal_taken','meal_waived','meal_interrupted','rest_taken','rest_missed','hours_confirmed'))$f$,
        $f$attestation_response jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'voided_at timestamptz',
        'voided_reason text',
        'voided_by_punch_id uuid',
        'entered_reason text',
        $f$original_values jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        -- {{JURIS}}
        'work_location_id uuid NOT NULL REFERENCES hr.location(id)',
        'jurisdiction_id uuid NOT NULL REFERENCES hr.jurisdiction(id)',
        'tz text NOT NULL',
        'local_work_date date NOT NULL',
        -- {{ACTOR}}
        $f$actor_type text NOT NULL CHECK (actor_type IN ('employee','manager','hr_admin','kiosk_device','external_signer','integration','automation','ai_agent','platform_admin'))$f$,
        'actor_employment_id uuid REFERENCES hr.employment(id)',
        'actor_user_id uuid REFERENCES auth.users(id)',
        'actor_device_id uuid REFERENCES hr.kiosk_device(id)',
        'actor_agent_id uuid',
        'actor_external_ref text',
        'actor_token_id uuid',
        'actor_note text'
      ],
      p_variant => 'component', p_versioned => false, p_soft_delete => false, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => ARRAY['hr_employment:employment_id']);
  end if;
end $$;

do $$ begin
  -- THE IDEMPOTENT PUNCH CONTRACT. A duplicate submit -- double tap, retry, later an offline
  -- replay -- collapses onto the existing row. This is the column that makes deferred offline
  -- queueing (AD-10) a later feature rather than a re-key.
  if not exists (select 1 from pg_constraint where conname = 'punch_idempotent') then
    alter table hr.punch add constraint punch_idempotent unique (organization_id, idempotency_key);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'punch_voided_fk') then
    alter table hr.punch add constraint punch_voided_fk
      foreign key (voided_by_punch_id) references hr.punch(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'punch_break_paid_only_on_break') then
    alter table hr.punch add constraint punch_break_paid_only_on_break
      check (break_paid is null or punch_kind in ('break_start','break_end','meal_start','meal_end'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'punch_actor_identified') then
    alter table hr.punch add constraint punch_actor_identified check (
      case actor_type
        when 'kiosk_device'    then actor_device_id is not null
        when 'external_signer' then actor_external_ref is not null
        when 'ai_agent'        then actor_agent_id is not null
        when 'integration'     then actor_external_ref is not null
        when 'automation'      then true
        else actor_user_id is not null or actor_employment_id is not null
      end);
  end if;
end $$;

-- RAW MEANS RAW. Only the void columns may ever change.
create or replace function hr._punch_immutable() returns trigger
language plpgsql as $fn$
begin
  if (to_jsonb(new) - 'voided_at' - 'voided_reason' - 'voided_by_punch_id'
                    - 'updated_at' - 'updated_by' - 'version')
     is distinct from
     (to_jsonb(old) - 'voided_at' - 'voided_reason' - 'voided_by_punch_id'
                    - 'updated_at' - 'updated_by' - 'version') then
    raise exception 'hr.punch is an immutable raw record: correct it with a void plus a new punch'
      using errcode = 'P0001';
  end if;
  return new;
end
$fn$;

comment on function hr._punch_immutable() is
  'AD-11 / AR2 LOCK 5 made structural: a punch is a raw fact. A manager correction is a void plus a replacement pair (voided_reason on the original; entered_reason + original_values on the replacement), never an UPDATE.';

drop trigger if exists _zz_punch_immutable on hr.punch;
create trigger _zz_punch_immutable before update on hr.punch
  for each row execute function hr._punch_immutable();
drop trigger if exists _zz_punch_no_delete on hr.punch;
create trigger _zz_punch_no_delete before delete on hr.punch
  for each row execute function hr._reject_delete();

create index if not exists punch_employment_time_idx on hr.punch (employment_id, occurred_at desc);
create index if not exists punch_local_day_idx on hr.punch (organization_id, local_work_date, employment_id);
create index if not exists punch_shift_idx on hr.punch (shift_id) where shift_id is not null;
create index if not exists punch_open_idx on hr.punch (employment_id, punch_kind, occurred_at desc)
  where voided_at is null;
create index if not exists punch_device_idx on hr.punch (actor_device_id, occurred_at desc)
  where actor_device_id is not null;

update platform.entity_types set taxonomy_node_id = '959be751-bf57-4770-8f9e-cc2df3209b9c'
where token = 'hr_punch';

-- ============================================================ 7.2 hr.workweek  (COMP of hr_employment)
-- AR 1.5 made structural: the workweek is a fixed, employer-designated, recurring 168-hour
-- window; it is the OT unit and the export's grouping key. week_start_dow and week_start_time
-- are STAMPED FROM THE PAY GROUP AT ROW CREATION -- changing the pay group's setting later
-- never re-cuts a past week.
do $$ begin
  if to_regclass('hr.workweek') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'workweek', p_token => 'hr_workweek', p_label => 'Workweek',
      p_fields => ARRAY[
        'employment_id uuid NOT NULL REFERENCES hr.employment(id)',
        'pay_group_id uuid NOT NULL REFERENCES hr.pay_group(id)',
        'week_start_at timestamptz NOT NULL',
        'week_end_at timestamptz NOT NULL',
        'week_start_dow smallint NOT NULL CHECK (week_start_dow between 0 and 6)',
        'week_start_time time NOT NULL',
        'week_start_local_date date NOT NULL',
        'tz text NOT NULL',
        'jurisdiction_id uuid NOT NULL REFERENCES hr.jurisdiction(id)',
        'hours_worked numeric(8,2) NOT NULL DEFAULT 0',
        'hours_regular numeric(8,2) NOT NULL DEFAULT 0',
        'hours_overtime numeric(8,2) NOT NULL DEFAULT 0',
        'hours_doubletime numeric(8,2) NOT NULL DEFAULT 0',
        'hours_paid_leave numeric(8,2) NOT NULL DEFAULT 0',
        'hours_unpaid_leave numeric(8,2) NOT NULL DEFAULT 0',
        'hours_holiday numeric(8,2) NOT NULL DEFAULT 0',
        'hours_on_call numeric(8,2) NOT NULL DEFAULT 0',
        -- hours_of_service is tracked separately from hours_worked because ACA counts paid
        -- leave and FLSA does not; the deferred benefits module cannot reconstruct it later.
        'hours_of_service numeric(8,2) NOT NULL DEFAULT 0',
        'weighted_average_regular_rate numeric(14,6)',
        'is_final boolean NOT NULL DEFAULT false',
        -- {{CALC}}
        $f$rule_version_ids uuid[] NOT NULL DEFAULT '{}'$f$,
        'engine_key text NOT NULL',
        'engine_version text NOT NULL',
        $f$calc jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'computed_at timestamptz NOT NULL DEFAULT now()'
      ],
      p_variant => 'component', p_versioned => false, p_soft_delete => false, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => ARRAY['hr_employment:employment_id']);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'workweek_unique') then
    alter table hr.workweek add constraint workweek_unique unique (employment_id, week_start_at);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'workweek_ordered') then
    alter table hr.workweek add constraint workweek_ordered check (week_end_at > week_start_at);
  end if;
end $$;

create index if not exists workweek_employment_start_idx on hr.workweek (employment_id, week_start_at desc);
create index if not exists workweek_org_week_idx on hr.workweek (organization_id, week_start_local_date);
create index if not exists workweek_calc_gin on hr.workweek using gin (calc jsonb_path_ops);

update platform.entity_types set taxonomy_node_id = '959be751-bf57-4770-8f9e-cc2df3209b9c'
where token = 'hr_workweek';

-- ============================================================ 7.3 hr.pay_period  (COMP of hr_pay_group)
-- AR 1.10's state machine, with the actor and timestamp of every transition.
do $$ begin
  if to_regclass('hr.pay_period') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'pay_period', p_token => 'hr_pay_period', p_label => 'Pay period',
      p_fields => ARRAY[
        'pay_group_id uuid NOT NULL REFERENCES hr.pay_group(id)',
        'period_start_on date NOT NULL',
        'period_end_on date NOT NULL',
        'pay_date date',
        'sequence_number integer NOT NULL',
        $f$state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','submitted','approved','exported','locked','closed','reopened'))$f$,
        'opened_at timestamptz NOT NULL DEFAULT now()',
        'submitted_at timestamptz',
        'submitted_by_employment_id uuid REFERENCES hr.employment(id)',
        'approved_at timestamptz',
        'approved_by_employment_id uuid REFERENCES hr.employment(id)',
        'exported_at timestamptz',
        'locked_at timestamptz',
        'locked_by_employment_id uuid REFERENCES hr.employment(id)',
        'closed_at timestamptz',
        'reopened_at timestamptz',
        'reopen_reason text',
        -- the semimonthly case AR 1.5 proves cannot be summed period-wise: a denormalised
        -- array of the workweeks straddling this period's edges, not a junction table.
        $f$boundary_workweek_ids uuid[] NOT NULL DEFAULT '{}'$f$,
        'workflow_instance_id uuid'
      ],
      p_variant => 'component', p_versioned => true, p_soft_delete => false, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => ARRAY['hr_pay_group:pay_group_id']);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pay_period_unique') then
    alter table hr.pay_period add constraint pay_period_unique unique (pay_group_id, sequence_number);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pay_period_ordered') then
    alter table hr.pay_period add constraint pay_period_ordered check (period_end_on >= period_start_on);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pay_period_no_overlap') then
    alter table hr.pay_period add constraint pay_period_no_overlap
      exclude using gist (pay_group_id extensions.gist_uuid_ops with =,
                          daterange(period_start_on, period_end_on, '[]') with &&);
  end if;
end $$;

create index if not exists pay_period_state_idx on hr.pay_period (organization_id, state, period_end_on desc);

-- The legal transition set, enumerated in section 7.3. A reopen is deliberate and reasoned,
-- never silent. AFTER `locked`, nothing in the period is editable -- corrections are
-- hr.time_adjustment rows that land in the NEXT export tagged to this period.
create or replace function hr._pay_period_transition() returns trigger
language plpgsql as $fn$
begin
  if new.state is not distinct from old.state then
    return new;
  end if;
  if (old.state, new.state) not in (
        ('open','submitted'), ('submitted','approved'), ('approved','exported'),
        ('exported','locked'), ('locked','closed'), ('locked','reopened'),
        ('reopened','approved')) then
    raise exception 'hr.pay_period: illegal transition % -> %', old.state, new.state
      using errcode = 'P0001';
  end if;
  if new.state = 'reopened' and coalesce(btrim(new.reopen_reason), '') = '' then
    raise exception 'hr.pay_period: a reopen requires reopen_reason' using errcode = 'P0001';
  end if;
  return new;
end
$fn$;

comment on function hr._pay_period_transition() is
  'AR 1.10: open -> submitted -> approved -> exported -> locked -> closed, plus locked -> reopened -> approved. Any other pair is refused.';

drop trigger if exists _zz_pay_period_transition on hr.pay_period;
create trigger _zz_pay_period_transition before update on hr.pay_period
  for each row execute function hr._pay_period_transition();

update platform.entity_types set taxonomy_node_id = '959be751-bf57-4770-8f9e-cc2df3209b9c'
where token = 'hr_pay_period';

-- ============================================================ 7.4 hr.pay_period_employment  (COMP of hr_pay_period)
-- AR2's employee attestation, and the half that matters: A DISAGREEMENT IS PRESERVED, NOT
-- OVERWRITTEN. disputed_at + dispute_note are the employee's words and are never edited by a
-- manager; dispute_resolution is the manager's separate field. A period can be approved with an
-- open dispute -- the dispute travels to the export as evidence.
do $$ begin
  if to_regclass('hr.pay_period_employment') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'pay_period_employment', p_token => 'hr_pay_period_employment',
      p_label => 'Pay period timesheet',
      p_fields => ARRAY[
        'pay_period_id uuid NOT NULL REFERENCES hr.pay_period(id)',
        'employment_id uuid NOT NULL REFERENCES hr.employment(id)',
        $f$state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','attested','disputed','approved','exported','locked'))$f$,
        'attested_at timestamptz',
        'attestation_statement text',
        $f$attestation_response jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'disputed_at timestamptz',
        'dispute_note text',
        'dispute_resolution text',
        'dispute_resolved_at timestamptz',
        'dispute_resolved_by_employment_id uuid REFERENCES hr.employment(id)',
        'manager_approved_at timestamptz',
        'manager_approved_by_employment_id uuid REFERENCES hr.employment(id)',
        'total_hours numeric(8,2) NOT NULL DEFAULT 0',
        'total_amount numeric(14,2)',
        -- {{CALC}}
        $f$rule_version_ids uuid[] NOT NULL DEFAULT '{}'$f$,
        'engine_key text NOT NULL',
        'engine_version text NOT NULL',
        $f$calc jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'computed_at timestamptz NOT NULL DEFAULT now()'
      ],
      p_variant => 'component', p_versioned => false, p_soft_delete => false, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => ARRAY['hr_pay_period:pay_period_id']);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pay_period_employment_unique') then
    alter table hr.pay_period_employment add constraint pay_period_employment_unique
      unique (pay_period_id, employment_id);
  end if;
end $$;

create index if not exists pay_period_employment_employment_idx
  on hr.pay_period_employment (employment_id, pay_period_id);
create index if not exists pay_period_employment_dispute_idx
  on hr.pay_period_employment (organization_id, disputed_at desc) where disputed_at is not null;

update platform.entity_types set taxonomy_node_id = '959be751-bf57-4770-8f9e-cc2df3209b9c'
where token = 'hr_pay_period_employment';

-- ============================================================ 7.5 hr.time_adjustment  (COMP of hr_employment)
-- AR 1.10: original_pay_period_id makes the correction traceable to the period it fixes;
-- target_pay_period_id is the period it is actually PAID in. Never a silent edit of a locked
-- period and never a re-export (which double-pays).
do $$ begin
  if to_regclass('hr.time_adjustment') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'time_adjustment', p_token => 'hr_time_adjustment',
      p_label => 'Time adjustment',
      p_fields => ARRAY[
        'employment_id uuid NOT NULL REFERENCES hr.employment(id)',
        'original_pay_period_id uuid NOT NULL REFERENCES hr.pay_period(id)',
        'target_pay_period_id uuid REFERENCES hr.pay_period(id)',
        'work_interval_id uuid',
        'work_date date NOT NULL',
        'earning_code_id uuid NOT NULL REFERENCES hr.earning_code(id)',
        'hours_delta numeric(8,2) NOT NULL DEFAULT 0',
        'amount_delta numeric(14,2) NOT NULL DEFAULT 0',
        'rate numeric(14,6)',
        'reason_category_id uuid REFERENCES platform.categories(id)',
        'reason_note text NOT NULL',
        'workflow_instance_id uuid',
        'approved_at timestamptz',
        'approved_by_employment_id uuid REFERENCES hr.employment(id)',
        'exported_at timestamptz',
        -- {{JURIS}}
        'work_location_id uuid NOT NULL REFERENCES hr.location(id)',
        'jurisdiction_id uuid NOT NULL REFERENCES hr.jurisdiction(id)',
        'tz text NOT NULL',
        'local_work_date date NOT NULL',
        -- {{CALC}}
        $f$rule_version_ids uuid[] NOT NULL DEFAULT '{}'$f$,
        'engine_key text NOT NULL',
        'engine_version text NOT NULL',
        $f$calc jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'computed_at timestamptz NOT NULL DEFAULT now()',
        -- {{ACTOR}}
        $f$actor_type text NOT NULL CHECK (actor_type IN ('employee','manager','hr_admin','kiosk_device','external_signer','integration','automation','ai_agent','platform_admin'))$f$,
        'actor_employment_id uuid REFERENCES hr.employment(id)',
        'actor_user_id uuid REFERENCES auth.users(id)',
        'actor_device_id uuid REFERENCES hr.kiosk_device(id)',
        'actor_agent_id uuid',
        'actor_external_ref text',
        'actor_token_id uuid',
        'actor_note text'
      ],
      p_variant => 'component', p_versioned => true, p_soft_delete => false, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => ARRAY['hr_employment:employment_id']);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'time_adjustment_actor_identified') then
    alter table hr.time_adjustment add constraint time_adjustment_actor_identified check (
      case actor_type
        when 'kiosk_device'    then actor_device_id is not null
        when 'external_signer' then actor_external_ref is not null
        when 'ai_agent'        then actor_agent_id is not null
        when 'integration'     then actor_external_ref is not null
        when 'automation'      then true
        else actor_user_id is not null or actor_employment_id is not null
      end);
  end if;
end $$;

create index if not exists time_adjustment_pending_export_idx
  on hr.time_adjustment (target_pay_period_id) where exported_at is null;
create index if not exists time_adjustment_employment_idx
  on hr.time_adjustment (employment_id, work_date desc);

update platform.entity_types set taxonomy_node_id = '959be751-bf57-4770-8f9e-cc2df3209b9c'
where token = 'hr_time_adjustment';

-- ============================================================ 7.6 hr.work_interval  (COMP of hr_employment)
-- THE ONE COMPUTED-HOURS TABLE. Leave usage, holiday pay and on-call all produce rows here, so
-- the export grain AR 1.6 demands is one table and one index, not a union of four.
-- RECOMPUTATION NEVER DELETES: a rerun sets is_current = false and superseded_by_id on the old
-- rows and inserts new ones. leave_request_id and shift_id are carried bare (files 08 / 07).
do $$ begin
  if to_regclass('hr.work_interval') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'work_interval', p_token => 'hr_work_interval',
      p_label => 'Work interval',
      p_fields => ARRAY[
        'employment_id uuid NOT NULL REFERENCES hr.employment(id)',
        'position_assignment_id uuid REFERENCES hr.position_assignment(id)',
        'workweek_id uuid NOT NULL REFERENCES hr.workweek(id)',
        'pay_period_id uuid REFERENCES hr.pay_period(id)',
        'shift_id uuid',
        'leave_request_id uuid',
        'holiday_id uuid REFERENCES hr.holiday(id)',
        $f$interval_kind text NOT NULL CHECK (interval_kind IN ('worked','paid_break','unpaid_break','leave','holiday','on_call','premium_only'))$f$,
        $f$hours_category text NOT NULL CHECK (hours_category IN ('worked','paid_leave','unpaid_leave','holiday','on_call','premium'))$f$,
        'earning_code_id uuid NOT NULL REFERENCES hr.earning_code(id)',
        'started_at timestamptz',
        'ended_at timestamptz',
        'hours numeric(8,4) NOT NULL',
        'rate numeric(14,6)',
        'amount numeric(14,2)',
        'is_overtime boolean NOT NULL DEFAULT false',
        $f$source_punch_ids uuid[] NOT NULL DEFAULT '{}'$f$,
        -- how far the neutral rounding rule moved the raw pair: a number a wage claim will ask
        -- for and that cannot be reconstructed from the rounded value alone.
        'rounding_applied_minutes numeric(6,2) NOT NULL DEFAULT 0',
        'superseded_by_id uuid',
        'is_current boolean NOT NULL DEFAULT true',
        -- {{JURIS}}
        'work_location_id uuid NOT NULL REFERENCES hr.location(id)',
        'jurisdiction_id uuid NOT NULL REFERENCES hr.jurisdiction(id)',
        'tz text NOT NULL',
        'local_work_date date NOT NULL',
        -- {{CALC}}
        $f$rule_version_ids uuid[] NOT NULL DEFAULT '{}'$f$,
        'engine_key text NOT NULL',
        'engine_version text NOT NULL',
        $f$calc jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'computed_at timestamptz NOT NULL DEFAULT now()'
      ],
      p_variant => 'component', p_versioned => false, p_soft_delete => false, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => ARRAY['hr_employment:employment_id']);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'work_interval_superseded_fk') then
    alter table hr.work_interval add constraint work_interval_superseded_fk
      foreign key (superseded_by_id) references hr.work_interval(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'work_interval_hours_positive') then
    alter table hr.work_interval add constraint work_interval_hours_positive check (hours >= 0);
  end if;
end $$;

drop trigger if exists _zz_work_interval_no_delete on hr.work_interval;
create trigger _zz_work_interval_no_delete before delete on hr.work_interval
  for each row execute function hr._reject_delete();

create index if not exists work_interval_workweek_idx on hr.work_interval (workweek_id) where is_current;
create index if not exists work_interval_export_grain_idx
  on hr.work_interval (organization_id, pay_period_id, employment_id, local_work_date, earning_code_id)
  where is_current;
create index if not exists work_interval_shift_idx on hr.work_interval (shift_id) where shift_id is not null;
create index if not exists work_interval_calc_gin on hr.work_interval using gin (calc jsonb_path_ops);

update platform.entity_types set taxonomy_node_id = '959be751-bf57-4770-8f9e-cc2df3209b9c'
where token = 'hr_work_interval';

-- ============================================================ 7.7 hr.attendance_exception  (COMP of hr_employment)
-- AR 1.9's missing half made a first-class object: the table that joins section 7 to section 8.
-- auto_closed_estimate says the day's hours are an ESTIMATE and no export may treat them as
-- attested until a human resolves it; unapproved_overtime NEVER suppresses the OT line, it only
-- flags the week; ip_verification_failed is raised on `warn` mode only (on `block` the punch
-- never exists). corrective_action_id is bare -- its FK lands in file 09.
do $$ begin
  if to_regclass('hr.attendance_exception') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'attendance_exception', p_token => 'hr_attendance_exception',
      p_label => 'Attendance exception',
      p_fields => ARRAY[
        'employment_id uuid NOT NULL REFERENCES hr.employment(id)',
        'shift_id uuid',
        'punch_id uuid REFERENCES hr.punch(id)',
        'work_interval_id uuid REFERENCES hr.work_interval(id)',
        $f$exception_kind text NOT NULL CHECK (exception_kind IN ('late_arrival','early_departure','no_show','unscheduled_work','missed_punch','orphan_punch','auto_closed_estimate','unapproved_overtime','worked_through_break','meal_not_provided','rest_not_provided','over_scheduled_hours','call_off','left_early_approved','ip_verification_failed'))$f$,
        $f$severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warn','violation'))$f$,
        'detected_at timestamptz NOT NULL DEFAULT now()',
        'variance_minutes numeric(8,2)',
        'scheduled_start_at timestamptz',
        'scheduled_end_at timestamptz',
        'actual_start_at timestamptz',
        'actual_end_at timestamptz',
        $f$resolution_state text NOT NULL DEFAULT 'open' CHECK (resolution_state IN ('open','acknowledged','excused','corrected','escalated','closed'))$f$,
        'resolution_note text',
        'resolved_at timestamptz',
        'resolved_by_employment_id uuid REFERENCES hr.employment(id)',
        'premium_earning_code_id uuid REFERENCES hr.earning_code(id)',
        'corrective_action_id uuid',
        -- {{JURIS}}
        'work_location_id uuid NOT NULL REFERENCES hr.location(id)',
        'jurisdiction_id uuid NOT NULL REFERENCES hr.jurisdiction(id)',
        'tz text NOT NULL',
        'local_work_date date NOT NULL',
        -- {{CALC}}
        $f$rule_version_ids uuid[] NOT NULL DEFAULT '{}'$f$,
        'engine_key text NOT NULL',
        'engine_version text NOT NULL',
        $f$calc jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'computed_at timestamptz NOT NULL DEFAULT now()'
      ],
      p_variant => 'component', p_versioned => true, p_soft_delete => false, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => ARRAY['hr_employment:employment_id']);
  end if;
end $$;

create index if not exists attendance_exception_open_idx
  on hr.attendance_exception (organization_id, resolution_state, detected_at desc);
create index if not exists attendance_exception_employment_idx
  on hr.attendance_exception (employment_id, detected_at desc);

update platform.entity_types set taxonomy_node_id = '959be751-bf57-4770-8f9e-cc2df3209b9c'
where token = 'hr_attendance_exception';

-- ============================================================ 7.8 hr.payroll_export  (COMP of hr_pay_period)
-- AR2's "exports idempotent + versioned with acknowledgment/failure records". The export is
-- ONE-WAY: hours and earnings out, never a paycheck back (AR 1.6).
do $$ begin
  if to_regclass('hr.payroll_export') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'payroll_export', p_token => 'hr_payroll_export',
      p_label => 'Payroll export',
      p_fields => ARRAY[
        'pay_period_id uuid NOT NULL REFERENCES hr.pay_period(id)',
        $f$export_format text NOT NULL CHECK (export_format IN ('quickbooks_online','quickbooks_iif','gusto_csv','adp_csv','generic_csv','json'))$f$,
        'export_version integer NOT NULL DEFAULT 1',
        'idempotency_key text NOT NULL',
        'generated_at timestamptz NOT NULL DEFAULT now()',
        'line_count integer NOT NULL DEFAULT 0',
        'total_hours numeric(12,2)',
        'total_amount numeric(14,2)',
        'artifact_file_id uuid REFERENCES files.files(id)',
        'artifact_sha256 text',
        $f$delivery_state text NOT NULL DEFAULT 'generated' CHECK (delivery_state IN ('generated','sent','acknowledged','failed','superseded'))$f$,
        'sent_at timestamptz',
        'acknowledged_at timestamptz',
        'acknowledgement_ref text',
        'failure_reason text',
        'supersedes_export_id uuid',
        $f$includes_adjustment_ids uuid[] NOT NULL DEFAULT '{}'$f$,
        -- {{ACTOR}}
        $f$actor_type text NOT NULL CHECK (actor_type IN ('employee','manager','hr_admin','kiosk_device','external_signer','integration','automation','ai_agent','platform_admin'))$f$,
        'actor_employment_id uuid REFERENCES hr.employment(id)',
        'actor_user_id uuid REFERENCES auth.users(id)',
        'actor_device_id uuid REFERENCES hr.kiosk_device(id)',
        'actor_agent_id uuid',
        'actor_external_ref text',
        'actor_token_id uuid',
        'actor_note text'
      ],
      p_variant => 'component', p_versioned => true, p_soft_delete => false, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => ARRAY['hr_pay_period:pay_period_id']);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'payroll_export_idempotent') then
    alter table hr.payroll_export add constraint payroll_export_idempotent
      unique (organization_id, idempotency_key);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payroll_export_supersedes_fk') then
    alter table hr.payroll_export add constraint payroll_export_supersedes_fk
      foreign key (supersedes_export_id) references hr.payroll_export(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payroll_export_actor_identified') then
    alter table hr.payroll_export add constraint payroll_export_actor_identified check (
      case actor_type
        when 'kiosk_device'    then actor_device_id is not null
        when 'external_signer' then actor_external_ref is not null
        when 'ai_agent'        then actor_agent_id is not null
        when 'integration'     then actor_external_ref is not null
        when 'automation'      then true
        else actor_user_id is not null or actor_employment_id is not null
      end);
  end if;
end $$;

create index if not exists payroll_export_period_idx on hr.payroll_export (pay_period_id, generated_at desc);
create index if not exists payroll_export_delivery_idx on hr.payroll_export (organization_id, delivery_state, generated_at desc);

update platform.entity_types set taxonomy_node_id = '959be751-bf57-4770-8f9e-cc2df3209b9c'
where token = 'hr_payroll_export';

-- ============================================================ 7.9 hr.payroll_export_line  (COMP of hr_payroll_export)
-- FROZEN AT GENERATION. Every identifier is denormalised as text so re-reading a two-year-old
-- export never resolves through a table whose rows have since changed. Append-only: no update,
-- no delete.
do $$ begin
  if to_regclass('hr.payroll_export_line') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'payroll_export_line', p_token => 'hr_payroll_export_line',
      p_label => 'Payroll export line',
      p_fields => ARRAY[
        'payroll_export_id uuid NOT NULL REFERENCES hr.payroll_export(id)',
        'employment_id uuid NOT NULL REFERENCES hr.employment(id)',
        'employee_number text NOT NULL',
        'external_employee_id text',
        'work_date date NOT NULL',
        'position_assignment_id uuid REFERENCES hr.position_assignment(id)',
        'job_title_snapshot text',
        'earning_code text NOT NULL',
        'external_earning_code text',
        'hours_category text NOT NULL',
        'hours numeric(8,4) NOT NULL DEFAULT 0',
        'rate numeric(14,6)',
        'amount numeric(14,2)',
        'jurisdiction_key text NOT NULL',
        'original_pay_period_id uuid REFERENCES hr.pay_period(id)',
        $f$source_work_interval_ids uuid[] NOT NULL DEFAULT '{}'$f$,
        'source_version integer NOT NULL',
        -- {{CALC}}
        $f$rule_version_ids uuid[] NOT NULL DEFAULT '{}'$f$,
        'engine_key text NOT NULL',
        'engine_version text NOT NULL',
        $f$calc jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'computed_at timestamptz NOT NULL DEFAULT now()'
      ],
      p_variant => 'component', p_versioned => false, p_soft_delete => false, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => ARRAY['hr_payroll_export:payroll_export_id']);
  end if;
end $$;

-- Section 7.9's "Append-only trigger; no update, no delete." hr._reject_delete() already exists
-- (file 00); this is its update-side sibling, written here because this is the first table in
-- the schema whose spec text forbids UPDATE outright.
create or replace function hr._reject_update() returns trigger
language plpgsql as $fn$
begin
  raise exception '% is frozen at generation: it is append-only and admits no UPDATE', tg_table_name
    using errcode = 'P0001';
end
$fn$;

comment on function hr._reject_update() is
  'Shared append-only wall for tables frozen at write (SPEC-DATA-MODEL 7.9). Sibling of hr._reject_delete().';

drop trigger if exists _zz_payroll_export_line_no_update on hr.payroll_export_line;
create trigger _zz_payroll_export_line_no_update before update on hr.payroll_export_line
  for each row execute function hr._reject_update();
drop trigger if exists _zz_payroll_export_line_no_delete on hr.payroll_export_line;
create trigger _zz_payroll_export_line_no_delete before delete on hr.payroll_export_line
  for each row execute function hr._reject_delete();

create index if not exists payroll_export_line_export_idx on hr.payroll_export_line (payroll_export_id, work_date);
create index if not exists payroll_export_line_employment_idx on hr.payroll_export_line (employment_id, work_date desc);

update platform.entity_types set taxonomy_node_id = '959be751-bf57-4770-8f9e-cc2df3209b9c'
where token = 'hr_payroll_export_line';

-- ============================================================ 7.10 hr.employment_pin  (RESTRICTED)
-- AD-1 permits an employee with NO LOGIN (hourly, kiosk-only) and AR 1.17 is the consequence:
-- such a person has no auth.uid(). The PIN is that person's only credential.
-- A PIN is NEVER compared in the client. Rotation is a NEW ROW with rotated_from_id set and the
-- old row revoked -- never an update of pin_hash -- so a PIN history exists without a PIN ever
-- being readable.
do $$ begin
  if to_regclass('hr.employment_pin') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'employment_pin', p_token => 'hr_employment_pin',
      p_label => 'Employment PIN',
      p_fields => ARRAY[
        'employment_id uuid NOT NULL REFERENCES hr.employment(id)',
        'pin_hash text NOT NULL',
        $f$pin_algo text NOT NULL DEFAULT 'bcrypt' CHECK (pin_algo IN ('bcrypt','argon2id'))$f$,
        'pin_length smallint NOT NULL DEFAULT 4 CHECK (pin_length between 4 and 10)',
        'set_at timestamptz NOT NULL DEFAULT now()',
        'set_by_employment_id uuid REFERENCES hr.employment(id)',
        'must_reset boolean NOT NULL DEFAULT true',
        'failed_attempt_count integer NOT NULL DEFAULT 0',
        'last_failed_at timestamptz',
        'locked_until timestamptz',
        'last_used_at timestamptz',
        'rotated_from_id uuid',
        'revoked_at timestamptz',
        'revoked_reason text'
      ],
      p_variant => 'entity', p_versioned => false, p_soft_delete => true, p_visibility => 'personal',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'employment_pin_one_active') then
    alter table hr.employment_pin add constraint employment_pin_one_active
      exclude using gist (employment_id extensions.gist_uuid_ops with =)
      where (revoked_at is null);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'employment_pin_rotated_fk') then
    alter table hr.employment_pin add constraint employment_pin_rotated_fk
      foreign key (rotated_from_id) references hr.employment_pin(id);
  end if;
end $$;

create index if not exists employment_pin_employment_idx on hr.employment_pin (employment_id)
  where revoked_at is null;

update platform.entity_types set
  client_excluded_columns = ARRAY['pin_hash','pin_algo'],
  taxonomy_node_id = '959be751-bf57-4770-8f9e-cc2df3209b9c'
where token = 'hr_employment_pin';

do $$ begin
  if (select rls_variant from platform.entity_types where token = 'hr_employment_pin') is distinct from 'restricted' then
    update platform.entity_types set rls_variant = 'restricted' where token = 'hr_employment_pin';
    perform iam.apply_rls('hr','employment_pin','hr_employment_pin','restricted');
  end if;
end $$;

-- ============================================================ 7.11 hr.kiosk_session  (RESTRICTED)
-- 🚨 TWO SESSION KINDS IN ONE TABLE, and conflating them is the trap (R-L3 U-05).
--   employment_id IS NULL  -> a DEVICE session; TTL in HOURS  (kiosk_session_ttl_hours, 12)
--   employment_id set      -> a PERSON-BOUND session; TTL in MINUTES (kiosk_session_ttl_minutes, 2)
-- The 12-hour value never gates a person's session. No schema change is needed -- the
-- discriminator is employment_id.
do $$ begin
  if to_regclass('hr.kiosk_session') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'kiosk_session', p_token => 'hr_kiosk_session',
      p_label => 'Kiosk session',
      p_fields => ARRAY[
        'kiosk_device_id uuid NOT NULL REFERENCES hr.kiosk_device(id)',
        'employment_id uuid REFERENCES hr.employment(id)',
        'session_token_hash text NOT NULL',
        $f$auth_method text NOT NULL CHECK (auth_method IN ('pin','pin_photo','badge','manager_override'))$f$,
        'started_at timestamptz NOT NULL DEFAULT now()',
        'expires_at timestamptz NOT NULL',
        'ended_at timestamptz',
        $f$end_reason text CHECK (end_reason IN ('completed','expired','timeout','revoked','device_suspended','superseded'))$f$,
        'failed_attempt_count integer NOT NULL DEFAULT 0',
        'punch_count integer NOT NULL DEFAULT 0',
        'client_ip inet',
        'user_agent text',
        'geo_lat numeric(9,6)',
        'geo_lng numeric(9,6)',
        'geo_within_fence boolean',
        'photo_file_id uuid REFERENCES files.files(id)',
        'override_by_employment_id uuid REFERENCES hr.employment(id)',
        'override_reason text'
      ],
      p_variant => 'entity', p_versioned => false, p_soft_delete => true, p_visibility => 'personal',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'kiosk_session_token_unique') then
    alter table hr.kiosk_session add constraint kiosk_session_token_unique
      unique (organization_id, session_token_hash);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'kiosk_session_window_ordered') then
    alter table hr.kiosk_session add constraint kiosk_session_window_ordered
      check (expires_at > started_at);
  end if;
  -- manager_override is the AUDITED path for a forgotten PIN: a named manager and a reason.
  if not exists (select 1 from pg_constraint where conname = 'kiosk_session_override_reasoned') then
    alter table hr.kiosk_session add constraint kiosk_session_override_reasoned
      check (auth_method <> 'manager_override'
             or (override_by_employment_id is not null and override_reason is not null));
  end if;
end $$;

create index if not exists kiosk_session_device_idx on hr.kiosk_session (kiosk_device_id, started_at desc);
create index if not exists kiosk_session_open_idx on hr.kiosk_session (kiosk_device_id, expires_at)
  where ended_at is null;
create index if not exists kiosk_session_employment_idx on hr.kiosk_session (employment_id, started_at desc)
  where employment_id is not null;

update platform.entity_types set
  client_excluded_columns = ARRAY['session_token_hash'],
  taxonomy_node_id = '959be751-bf57-4770-8f9e-cc2df3209b9c'
where token = 'hr_kiosk_session';

do $$ begin
  if (select rls_variant from platform.entity_types where token = 'hr_kiosk_session') is distinct from 'restricted' then
    update platform.entity_types set rls_variant = 'restricted' where token = 'hr_kiosk_session';
    perform iam.apply_rls('hr','kiosk_session','hr_kiosk_session','restricted');
  end if;
end $$;

-- ============================================================ 7.12 hr.overtime_preapproval  (COMP of hr_employment)
-- 🚨 D24(a): UNAPPROVED OVERTIME IS STILL PAID -- and flagged. The FLSA pays hours suffered or
-- permitted to be worked, approved or not. This table NEVER gates an hr.work_interval row. Any
-- implementation in which a missing pre-approval suppresses, withholds or zeroes an OT line is
-- a wage violation and a defect.
do $$ begin
  if to_regclass('hr.overtime_preapproval') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'overtime_preapproval', p_token => 'hr_overtime_preapproval',
      p_label => 'Overtime pre-approval',
      p_fields => ARRAY[
        'employment_id uuid NOT NULL REFERENCES hr.employment(id)',
        'workweek_id uuid REFERENCES hr.workweek(id)',
        'requested_by_employment_id uuid NOT NULL REFERENCES hr.employment(id)',
        $f$request_kind text NOT NULL DEFAULT 'advance' CHECK (request_kind IN ('advance','retroactive','standing'))$f$,
        'covers_from timestamptz NOT NULL',
        'covers_to timestamptz NOT NULL',
        'requested_hours numeric(8,2)',
        'approved_hours numeric(8,2)',
        'reason_category_id uuid REFERENCES platform.categories(id)',
        'reason_note text',
        $f$shift_ids uuid[] NOT NULL DEFAULT '{}'$f$,
        $f$state text NOT NULL DEFAULT 'requested' CHECK (state IN ('requested','approved','denied','expired','withdrawn','auto_flagged'))$f$,
        'workflow_instance_id uuid',
        'decided_at timestamptz',
        'decided_by_employment_id uuid REFERENCES hr.employment(id)',
        'actual_ot_hours numeric(8,2)',
        'variance_hours numeric(8,2)',
        'unapproved_ot_flagged boolean NOT NULL DEFAULT false',
        'corrective_action_id uuid',
        -- {{CALC}}
        $f$rule_version_ids uuid[] NOT NULL DEFAULT '{}'$f$,
        'engine_key text NOT NULL',
        'engine_version text NOT NULL',
        $f$calc jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'computed_at timestamptz NOT NULL DEFAULT now()',
        -- {{ACTOR}}
        $f$actor_type text NOT NULL CHECK (actor_type IN ('employee','manager','hr_admin','kiosk_device','external_signer','integration','automation','ai_agent','platform_admin'))$f$,
        'actor_employment_id uuid REFERENCES hr.employment(id)',
        'actor_user_id uuid REFERENCES auth.users(id)',
        'actor_device_id uuid REFERENCES hr.kiosk_device(id)',
        'actor_agent_id uuid',
        'actor_external_ref text',
        'actor_token_id uuid',
        'actor_note text'
      ],
      p_variant => 'component', p_versioned => true, p_soft_delete => true, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => ARRAY['hr_employment:employment_id']);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'overtime_preapproval_window_ordered') then
    alter table hr.overtime_preapproval add constraint overtime_preapproval_window_ordered
      check (covers_to > covers_from);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'overtime_preapproval_retroactive_decided') then
    alter table hr.overtime_preapproval add constraint overtime_preapproval_retroactive_decided
      check (request_kind <> 'retroactive' or state <> 'requested');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'overtime_preapproval_actor_identified') then
    alter table hr.overtime_preapproval add constraint overtime_preapproval_actor_identified check (
      case actor_type
        when 'kiosk_device'    then actor_device_id is not null
        when 'external_signer' then actor_external_ref is not null
        when 'ai_agent'        then actor_agent_id is not null
        when 'integration'     then actor_external_ref is not null
        when 'automation'      then true
        else actor_user_id is not null or actor_employment_id is not null
      end);
  end if;
end $$;

create index if not exists overtime_preapproval_state_idx
  on hr.overtime_preapproval (organization_id, state, covers_from desc);
create index if not exists overtime_preapproval_approved_idx
  on hr.overtime_preapproval (employment_id, covers_from desc) where state = 'approved';

update platform.entity_types set taxonomy_node_id = '959be751-bf57-4770-8f9e-cc2df3209b9c'
where token = 'hr_overtime_preapproval';

-- ============================================================ 7.13 hr.overtime_alert_rule  (DIR)
-- 🚨 THIS TABLE IS THE RULE. hr.overtime_alert (7.14) is the fired INSTANCE. The two names
-- differ by a suffix; read the sentence before writing either. A rule with no instances has
-- simply never tripped.
-- It is a TABLE, not a knob, because a threshold is scoped (this location, that crew, those job
-- titles) and an org will hold several at once -- the knob ladder resolves one value per scope
-- rung, which cannot express a rule set.
do $$ begin
  if to_regclass('hr.overtime_alert_rule') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'overtime_alert_rule', p_token => 'hr_overtime_alert_rule',
      p_label => 'Overtime alert rule',
      p_fields => ARRAY[
        'name text NOT NULL',
        $f$scope_kind text NOT NULL DEFAULT 'organization' CHECK (scope_kind IN ('organization','location','department','crew','pay_group','job_title'))$f$,
        'scope_id uuid',
        $f$threshold_kind text NOT NULL CHECK (threshold_kind IN ('weekly_hours','daily_hours','percent_of_ot_threshold','projected_weekly_hours','consecutive_days'))$f$,
        'threshold_value numeric(8,2) NOT NULL',
        'grace_minutes integer NOT NULL DEFAULT 0',
        $f$evaluation_cadence text NOT NULL DEFAULT 'on_punch' CHECK (evaluation_cadence IN ('on_punch','every_15_min','hourly','daily'))$f$,
        $f$notify_channels text[] NOT NULL DEFAULT '{push,sms,email}'$f$,
        $f$notify_roles text[] NOT NULL DEFAULT '{}'$f$,
        'notify_employee boolean NOT NULL DEFAULT true',
        $f$alert_tier text NOT NULL DEFAULT 'warn' CHECK (alert_tier IN ('info','warn','urgent'))$f$,
        'cooldown_minutes integer NOT NULL DEFAULT 60',
        'is_active boolean NOT NULL DEFAULT true'
      ],
      p_variant => 'entity', p_versioned => true, p_soft_delete => true, p_visibility => 'personal',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'overtime_alert_rule_name_unique') then
    alter table hr.overtime_alert_rule add constraint overtime_alert_rule_name_unique
      unique (organization_id, name);
  end if;
end $$;

create index if not exists overtime_alert_rule_scope_idx
  on hr.overtime_alert_rule (organization_id, scope_kind, scope_id)
  where is_active and deleted_at is null;

update platform.entity_types set
  title_column = 'name',
  taxonomy_node_id = '959be751-bf57-4770-8f9e-cc2df3209b9c'
where token = 'hr_overtime_alert_rule';

-- ============================================================ 7.14 hr.overtime_alert  (COMP of hr_employment)
-- WHY A LEDGER AND NOT A NOTIFICATION. An `on_punch` rule at a busy site fires the same
-- conclusion dozens of times an hour. dedupe_key + cooldown_until make the second through
-- fortieth evaluations increment suppressed_count instead of paging a manager forty times.
-- Without this table the cooldown would live in application memory -- resetting on every deploy
-- and differing per worker process.
do $$ begin
  if to_regclass('hr.overtime_alert') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'overtime_alert', p_token => 'hr_overtime_alert',
      p_label => 'Overtime alert',
      p_fields => ARRAY[
        'employment_id uuid NOT NULL REFERENCES hr.employment(id)',
        'overtime_alert_rule_id uuid REFERENCES hr.overtime_alert_rule(id)',
        'workweek_id uuid REFERENCES hr.workweek(id)',
        'dedupe_key text NOT NULL',
        'threshold_kind text NOT NULL',
        'threshold_value numeric(8,2) NOT NULL',
        'observed_value numeric(8,2) NOT NULL',
        'projected_value numeric(8,2)',
        $f$alert_tier text NOT NULL DEFAULT 'warn' CHECK (alert_tier IN ('info','warn','urgent'))$f$,
        'fired_at timestamptz NOT NULL DEFAULT now()',
        'cooldown_until timestamptz',
        'suppressed_count integer NOT NULL DEFAULT 0',
        'last_suppressed_at timestamptz',
        $f$recipient_employment_ids uuid[] NOT NULL DEFAULT '{}'$f$,
        $f$channels_sent text[] NOT NULL DEFAULT '{}'$f$,
        $f$notification_ids uuid[] NOT NULL DEFAULT '{}'$f$,
        'delivered_at timestamptz',
        'read_at timestamptz',
        'acknowledged_at timestamptz',
        'acknowledged_by_employment_id uuid REFERENCES hr.employment(id)',
        $f$outcome text CHECK (outcome IN ('acknowledged','preapproved','shift_shortened','ignored','expired'))$f$,
        'overtime_preapproval_id uuid REFERENCES hr.overtime_preapproval(id)',
        'attendance_exception_id uuid REFERENCES hr.attendance_exception(id)',
        -- {{CALC}}
        $f$rule_version_ids uuid[] NOT NULL DEFAULT '{}'$f$,
        'engine_key text NOT NULL',
        'engine_version text NOT NULL',
        $f$calc jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'computed_at timestamptz NOT NULL DEFAULT now()',
        -- {{ACTOR}}
        $f$actor_type text NOT NULL CHECK (actor_type IN ('employee','manager','hr_admin','kiosk_device','external_signer','integration','automation','ai_agent','platform_admin'))$f$,
        'actor_employment_id uuid REFERENCES hr.employment(id)',
        'actor_user_id uuid REFERENCES auth.users(id)',
        'actor_device_id uuid REFERENCES hr.kiosk_device(id)',
        'actor_agent_id uuid',
        'actor_external_ref text',
        'actor_token_id uuid',
        'actor_note text'
      ],
      p_variant => 'component', p_versioned => false, p_soft_delete => false, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => ARRAY['hr_employment:employment_id']);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'overtime_alert_dedupe') then
    alter table hr.overtime_alert add constraint overtime_alert_dedupe
      unique (organization_id, dedupe_key, fired_at);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'overtime_alert_actor_identified') then
    alter table hr.overtime_alert add constraint overtime_alert_actor_identified check (
      case actor_type
        when 'kiosk_device'    then actor_device_id is not null
        when 'external_signer' then actor_external_ref is not null
        when 'ai_agent'        then actor_agent_id is not null
        when 'integration'     then actor_external_ref is not null
        when 'automation'      then true
        else actor_user_id is not null or actor_employment_id is not null
      end);
  end if;
end $$;

drop trigger if exists _zz_overtime_alert_no_delete on hr.overtime_alert;
create trigger _zz_overtime_alert_no_delete before delete on hr.overtime_alert
  for each row execute function hr._reject_delete();

create index if not exists overtime_alert_open_idx
  on hr.overtime_alert (organization_id, dedupe_key, cooldown_until desc);
create index if not exists overtime_alert_week_idx on hr.overtime_alert (workweek_id, fired_at desc);

update platform.entity_types set taxonomy_node_id = '959be751-bf57-4770-8f9e-cc2df3209b9c'
where token = 'hr_overtime_alert';

-- ============================================================ 7.15 hr.auto_close_rule  (DIR)
-- A 16-hour cap is right for a warehouse and wrong for a live-in care shift at the same
-- employer, and HOW to close is a real per-scope choice with different wage consequences --
-- which is why this is rule rows and not the single max_shift_hours knob.
-- 🚨 An auto-closed punch is an ESTIMATE and is never silently authoritative: the rule writes a
-- source='auto_close', actor_type='automation' punch (a NEW raw fact; the original is never
-- edited) plus an auto_closed_estimate exception, and with blocks_period_lock set -- the
-- default -- the pay period cannot reach `locked` while that exception is open.
do $$ begin
  if to_regclass('hr.auto_close_rule') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'auto_close_rule', p_token => 'hr_auto_close_rule',
      p_label => 'Auto-close rule',
      p_fields => ARRAY[
        'name text NOT NULL',
        $f$scope_kind text NOT NULL DEFAULT 'organization' CHECK (scope_kind IN ('organization','location','department','crew','pay_group','job_title'))$f$,
        'scope_id uuid',
        $f$trigger_kind text NOT NULL CHECK (trigger_kind IN ('max_shift_hours','end_of_local_day','scheduled_end_plus','next_punch_in','pay_period_lock'))$f$,
        'max_shift_hours numeric(6,2)',
        'grace_minutes integer NOT NULL DEFAULT 0',
        $f$close_at_strategy text NOT NULL DEFAULT 'scheduled_end' CHECK (close_at_strategy IN ('scheduled_end','max_hours_reached','last_activity','shift_end_minus_break','zero_hours'))$f$,
        'apply_break_deduction boolean NOT NULL DEFAULT false',
        'break_deduction_minutes integer',
        $f$raises_exception_kind text NOT NULL DEFAULT 'auto_closed_estimate'$f$,
        $f$exception_severity text NOT NULL DEFAULT 'warn' CHECK (exception_severity IN ('info','warn','violation'))$f$,
        'notify_manager boolean NOT NULL DEFAULT true',
        'notify_employee boolean NOT NULL DEFAULT true',
        'blocks_period_lock boolean NOT NULL DEFAULT true',
        'is_active boolean NOT NULL DEFAULT true',
        'priority integer NOT NULL DEFAULT 0'
      ],
      p_variant => 'entity', p_versioned => true, p_soft_delete => true, p_visibility => 'personal',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'auto_close_rule_name_unique') then
    alter table hr.auto_close_rule add constraint auto_close_rule_name_unique
      unique (organization_id, name);
  end if;
end $$;

create index if not exists auto_close_rule_scope_idx
  on hr.auto_close_rule (organization_id, scope_kind, scope_id, priority desc)
  where is_active and deleted_at is null;

update platform.entity_types set
  title_column = 'name',
  taxonomy_node_id = '959be751-bf57-4770-8f9e-cc2df3209b9c'
where token = 'hr_auto_close_rule';

-- ============================================================ the write guard, per table
do $$
declare t text;
begin
  foreach t in array ARRAY['kiosk_device','punch','workweek','pay_period','pay_period_employment',
                           'time_adjustment','work_interval','attendance_exception','payroll_export',
                           'payroll_export_line','employment_pin','kiosk_session',
                           'overtime_preapproval','overtime_alert_rule','overtime_alert',
                           'auto_close_rule'] loop
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
declare t text;
begin
  foreach t in array ARRAY['kiosk_device','punch','workweek','pay_period','pay_period_employment',
                           'time_adjustment','work_interval','attendance_exception','payroll_export',
                           'payroll_export_line','employment_pin','kiosk_session',
                           'overtime_preapproval','overtime_alert_rule','overtime_alert',
                           'auto_close_rule'] loop
    perform platform.ddl_guard_ack(
      p_reason => 'HR is org-explicit by the 2026-08-21 NO-NULL-ORG ruling; no assignment trigger by design (SPEC-DATA-MODEL 1.3)',
      p_by     => 'hr-domain-migration hr_06',
      p_rule   => 'org_not_null_no_backstop',
      p_object_ref => 'hr.' || t);
  end loop;
end $$;

-- ============================================================ assertions
do $$
declare r record; v_bad integer;
begin
  for r in select unnest(ARRAY['kiosk_device','punch','workweek','pay_period','pay_period_employment',
                               'time_adjustment','work_interval','attendance_exception','payroll_export',
                               'payroll_export_line','employment_pin','kiosk_session',
                               'overtime_preapproval','overtime_alert_rule','overtime_alert',
                               'auto_close_rule']) as t loop
    select count(*) into v_bad from iam.verify_canonical('hr', r.t, 'hr_' || r.t) where status in ('FAIL','WARN');
    if v_bad > 0 then
      raise exception 'hr_06: hr.% has % FAIL/WARN conformance rows', r.t, v_bad;
    end if;
    if not iam.canonical_certify_ok('hr', r.t, 'hr_' || r.t) then
      raise exception 'hr_06: hr.% does not certify', r.t;
    end if;
    if not exists (select 1 from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
                     join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'hr' and c.relname = r.t and tg.tgname = '_zz_guard_hr_write') then
      raise exception 'hr_06: hr.% is missing _zz_guard_hr_write', r.t;
    end if;
    if (select taxonomy_node_id from platform.entity_types where token = 'hr_' || r.t) is null then
      raise exception 'hr_06: hr_% has no taxonomy_node_id', r.t;
    end if;
  end loop;

  -- the three secret-bearing tables are restricted (db-rules 6f)
  select count(*) into v_bad from platform.entity_types
   where token in ('hr_kiosk_device','hr_employment_pin','hr_kiosk_session')
     and rls_variant <> 'restricted';
  if v_bad > 0 then
    raise exception 'hr_06: % secret-bearing table(s) are not restricted', v_bad;
  end if;

  -- section 17.3 / the conveyance trap: no restricted hr table is a composition child
  select count(*) into v_bad from platform.entity_relationships er
    join platform.entity_types c on c.token = er.child_type
   where c.schema_name = 'hr' and c.rls_variant = 'restricted';
  if v_bad > 0 then
    raise exception 'hr_06: % restricted hr table(s) carry an entity_relationships edge', v_bad;
  end if;

  -- the immutability walls
  if not exists (select 1 from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
                   join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname='hr' and c.relname='punch' and tg.tgname='_zz_punch_immutable') then
    raise exception 'hr_06: hr.punch is missing its immutability trigger';
  end if;
  if not exists (select 1 from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
                   join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname='hr' and c.relname='pay_period' and tg.tgname='_zz_pay_period_transition') then
    raise exception 'hr_06: hr.pay_period is missing its state-machine trigger';
  end if;
  select count(*) into v_bad from (values ('punch','_zz_punch_no_delete'),
                                          ('work_interval','_zz_work_interval_no_delete'),
                                          ('overtime_alert','_zz_overtime_alert_no_delete'),
                                          ('payroll_export_line','_zz_payroll_export_line_no_delete'),
                                          ('payroll_export_line','_zz_payroll_export_line_no_update')) as w(t, trg)
   where not exists (select 1 from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
                       join pg_namespace n on n.oid = c.relnamespace
                      where n.nspname='hr' and c.relname = w.t and tg.tgname = w.trg);
  if v_bad > 0 then
    raise exception 'hr_06: % append-only wall(s) missing', v_bad;
  end if;

  -- section 18.5 query H, now non-vacuous only after file 07; the exclusion constraints of this file
  if not exists (select 1 from pg_constraint where conname = 'pay_period_no_overlap' and contype = 'x') then
    raise exception 'hr_06: exclusion constraint pay_period_no_overlap is missing';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'employment_pin_one_active' and contype = 'x') then
    raise exception 'hr_06: exclusion constraint employment_pin_one_active is missing';
  end if;

  if exists (select 1 from information_schema.columns c
               join platform.entity_types e
                 on e.schema_name = c.table_schema and e.table_name = c.table_name
              where c.table_schema = 'hr'
                and c.column_name in ('user_id','owner_id','author_id','creator_id')) then
    raise exception 'hr_06: an hr table carries a legacy owner column; it can never certify';
  end if;

  select count(*) into v_bad from platform.ddl_guard_log
   where acknowledged_at is null and object_ref like 'hr.%';
  if v_bad > 0 then
    raise exception 'hr_06: % unacked DDL guard rows remain on hr.*', v_bad;
  end if;
end $$;
