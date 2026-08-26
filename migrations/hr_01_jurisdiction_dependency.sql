-- HR domain, migration 01 of 16 (register item HRB-005) -- SPEC-JURISDICTION's six tables.
--
-- Authority: /projects/hr-domain/specs/SPEC-JURISDICTION.md sections 1.0-1.3, 4.1, 4.4, 6.1;
-- ordering per /projects/hr-domain/specs/SPEC-DATA-MODEL.md section 18.1 file 01, which runs
-- that spec's DDL here because 20+ FKs in later files point at hr.jurisdiction(id) and
-- hr.jurisdiction_rule(id). R-CORE B5 is why all SIX land here and not four.
--
-- SEEDS: the US political geography only -- federal plus all 50 states and DC, which section 1.1
-- says is populated at seed time and which nothing can insert a location without. The RULE
-- content (16 rule classes, federal/CA rule rows, the fixture set) is legal research and belongs
-- to C5 / HRB-009, whose own gates decide advisory-vs-active. A rule row with no citation is a
-- guess, and this file does not make guesses.
--
-- Idempotent. Applied live as migration `hr_01_jurisdiction_dependency`.

set local lock_timeout = '20s';

-- ============================================================ 1. hr.jurisdiction  (SYS)
do $$ begin
  if to_regclass('hr.jurisdiction') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'jurisdiction', p_token => 'hr_jurisdiction',
      p_label => 'Jurisdiction',
      p_fields => ARRAY[
        'key text NOT NULL',
        $f$level text NOT NULL CHECK (level IN ('federal','state','county','city'))$f$,
        'parent_key text',
        'name text NOT NULL',
        'iso_code text',
        'fips_code text',
        'is_active boolean NOT NULL DEFAULT true'
      ],
      p_variant => 'system', p_versioned => true, p_soft_delete => true, p_visibility => 'internal',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

do $$ begin
  -- A FULL unique, not the partial one section 1.1 sketches: parent_key is an FK-BY-KEY and a
  -- partial unique index cannot back a foreign key. Correct anyway -- section 1.1 says a
  -- jurisdiction key is never re-used and a retired locality is kept is_active=false, never
  -- deleted, because historical records point at it.
  if not exists (select 1 from pg_constraint where conname = 'jurisdiction_key_unique') then
    alter table hr.jurisdiction add constraint jurisdiction_key_unique unique (key);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'jurisdiction_parent_key_fk') then
    alter table hr.jurisdiction add constraint jurisdiction_parent_key_fk
      foreign key (parent_key) references hr.jurisdiction(key);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'jurisdiction_federal_has_no_parent') then
    alter table hr.jurisdiction add constraint jurisdiction_federal_has_no_parent
      check ((level = 'federal') = (parent_key is null));
  end if;
end $$;

create index if not exists jurisdiction_level_idx on hr.jurisdiction (level) where deleted_at is null;
create index if not exists jurisdiction_parent_idx on hr.jurisdiction (parent_key) where deleted_at is null;

update platform.entity_types set
  title_column = 'name', reference_pickable = true,
  taxonomy_node_id = '394893a0-be07-4b4a-9b50-3a0cd984bc80',
  governed_columns = ARRAY['created_by','organization_id','deleted_at','key','level','parent_key']
where token = 'hr_jurisdiction';

-- ============================================================ 2. hr.jurisdiction_rule_class  (SYS)
do $$ begin
  if to_regclass('hr.jurisdiction_rule_class') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'jurisdiction_rule_class', p_token => 'hr_jurisdiction_rule_class',
      p_label => 'Jurisdiction rule class',
      p_fields => ARRAY[
        'slug text NOT NULL UNIQUE',
        'label text NOT NULL',
        'description text NOT NULL',
        $f$parameter_schema jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        $f$precedence_mode text NOT NULL CHECK (precedence_mode IN ('most_protective','most_specific','additive','legality_constraint'))$f$,
        'comparator text NOT NULL',
        'supports_preemption boolean NOT NULL DEFAULT false',
        $f$org_configurable text NOT NULL CHECK (org_configurable IN ('no','more_generous_only','within_bounds'))$f$,
        'absence_semantics text NOT NULL',
        $f$consumer_engines text[] NOT NULL DEFAULT '{}'$f$,
        'produces_money boolean NOT NULL DEFAULT false',
        'is_active boolean NOT NULL DEFAULT true'
      ],
      p_variant => 'system', p_versioned => true, p_soft_delete => true, p_visibility => 'internal',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

update platform.entity_types set
  title_column = 'label', reference_pickable = true,
  taxonomy_node_id = '394893a0-be07-4b4a-9b50-3a0cd984bc80',
  governed_columns = ARRAY['created_by','organization_id','deleted_at','slug','precedence_mode','comparator','produces_money']
where token = 'hr_jurisdiction_rule_class';

-- ============================================================ 3. hr.jurisdiction_rule  (SYS)
do $$ begin
  if to_regclass('hr.jurisdiction_rule') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'jurisdiction_rule', p_token => 'hr_jurisdiction_rule',
      p_label => 'Jurisdiction rule',
      p_fields => ARRAY[
        'rule_class_id uuid NOT NULL REFERENCES hr.jurisdiction_rule_class(id)',
        'jurisdiction_key text NOT NULL REFERENCES hr.jurisdiction(key)',
        'effective_from date NOT NULL',
        'effective_to date',
        $f$applicability jsonb NOT NULL DEFAULT '[]'::jsonb$f$,
        $f$parameters jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        $f$status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','advisory','active','superseded'))$f$,
        'basis text NOT NULL',
        $f$citation jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'verification_due date',
        'supersedes_id uuid',
        'correction_of_id uuid',
        $f$source_scope text NOT NULL DEFAULT 'statutory' CHECK (source_scope IN ('statutory','org_policy'))$f$
      ],
      p_variant => 'system', p_versioned => true, p_soft_delete => true, p_visibility => 'internal',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'jurisdiction_rule_window_ordered') then
    alter table hr.jurisdiction_rule add constraint jurisdiction_rule_window_ordered
      check (effective_to is null or effective_to > effective_from);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'jurisdiction_rule_supersedes_fk') then
    alter table hr.jurisdiction_rule add constraint jurisdiction_rule_supersedes_fk
      foreign key (supersedes_id) references hr.jurisdiction_rule(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'jurisdiction_rule_correction_of_fk') then
    alter table hr.jurisdiction_rule add constraint jurisdiction_rule_correction_of_fk
      foreign key (correction_of_id) references hr.jurisdiction_rule(id);
  end if;
  -- Section 2.5: "Ties at the same level are impossible (unique per class x jurisdiction x
  -- effective range, enforced by an exclusion constraint)". organization_id is in the key so an
  -- org's own override row never collides with the statutory row it overrides.
  if not exists (select 1 from pg_constraint where conname = 'jurisdiction_rule_one_per_window') then
    alter table hr.jurisdiction_rule add constraint jurisdiction_rule_one_per_window
      exclude using gist (
        organization_id extensions.gist_uuid_ops with =,
        rule_class_id extensions.gist_uuid_ops with =,
        jurisdiction_key extensions.gist_text_ops with =,
        daterange(effective_from, effective_to, '[)') with &&)
      where (status <> 'superseded' and deleted_at is null);
  end if;
end $$;

create index if not exists jurisdiction_rule_class_key_from_idx
  on hr.jurisdiction_rule (rule_class_id, jurisdiction_key, effective_from desc);
create index if not exists jurisdiction_rule_key_idx on hr.jurisdiction_rule (jurisdiction_key);
create index if not exists jurisdiction_rule_applicability_gin
  on hr.jurisdiction_rule using gin (applicability jsonb_path_ops);
create index if not exists jurisdiction_rule_parameters_gin
  on hr.jurisdiction_rule using gin (parameters jsonb_path_ops);

update platform.entity_types set
  taxonomy_node_id = '394893a0-be07-4b4a-9b50-3a0cd984bc80',
  governed_columns = ARRAY['created_by','organization_id','deleted_at','rule_class_id','jurisdiction_key','status','effective_from','effective_to','source_scope']
where token = 'hr_jurisdiction_rule';

-- ============================================================ 4. hr.jurisdiction_rule_test  (COMP)
do $$ begin
  if to_regclass('hr.jurisdiction_rule_test') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'jurisdiction_rule_test', p_token => 'hr_jurisdiction_rule_test',
      p_label => 'Jurisdiction rule fixture',
      p_fields => ARRAY[
        'rule_class_id uuid NOT NULL REFERENCES hr.jurisdiction_rule_class(id)',
        'code text NOT NULL UNIQUE',
        'title text NOT NULL',
        'jurisdiction_key text NOT NULL REFERENCES hr.jurisdiction(key)',
        'as_of_date date NOT NULL',
        'pinned_rule_id uuid REFERENCES hr.jurisdiction_rule(id)',
        $f$facts jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        $f$input jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        $f$expected jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        $f$expected_status text NOT NULL DEFAULT 'pending_verification' CHECK (expected_status IN ('asserted','pending_verification'))$f$,
        $f$assertion_mode text NOT NULL DEFAULT 'exact' CHECK (assertion_mode IN ('exact','property'))$f$
      ],
      p_variant => 'component', p_versioned => true, p_soft_delete => true, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => ARRAY['hr_jurisdiction_rule_class:rule_class_id']);
  end if;
end $$;

create index if not exists jurisdiction_rule_test_class_idx
  on hr.jurisdiction_rule_test (rule_class_id) where deleted_at is null;
create index if not exists jurisdiction_rule_test_pinned_idx
  on hr.jurisdiction_rule_test (pinned_rule_id) where pinned_rule_id is not null;

update platform.entity_types set
  title_column = 'title',
  taxonomy_node_id = '394893a0-be07-4b4a-9b50-3a0cd984bc80'
where token = 'hr_jurisdiction_rule_test';

-- ============================================================ 5. hr.recalculation_batch  (WORK)
-- Created BEFORE the snapshot: hr.calculation_snapshot.recalculation_batch_id FKs it.
do $$ begin
  if to_regclass('hr.recalculation_batch') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'recalculation_batch', p_token => 'hr_recalculation_batch',
      p_label => 'Recalculation batch',
      p_fields => ARRAY[
        $f$"trigger" text NOT NULL CHECK ("trigger" IN ('rule_correction','engine_defect','input_correction','manual'))$f$,
        'triggering_rule_id uuid REFERENCES hr.jurisdiction_rule(id)',
        'triggering_rule_version integer',
        'reason text NOT NULL CHECK (length(btrim(reason)) >= 40)',
        $f$scope jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        $f$state text NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed','approved','running','complete','rejected'))$f$,
        'approved_by uuid REFERENCES auth.users(id)',
        'approved_at timestamptz',
        'snapshots_superseded integer NOT NULL DEFAULT 0',
        'adjustments_created integer NOT NULL DEFAULT 0'
      ],
      p_variant => 'entity', p_versioned => true, p_soft_delete => true, p_visibility => 'personal',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'recalculation_batch_approved_pair') then
    alter table hr.recalculation_batch add constraint recalculation_batch_approved_pair
      check ((approved_by is null) = (approved_at is null));
  end if;
end $$;

create index if not exists recalculation_batch_state_idx
  on hr.recalculation_batch (organization_id, state) where deleted_at is null;
create index if not exists recalculation_batch_rule_idx
  on hr.recalculation_batch (triggering_rule_id) where triggering_rule_id is not null;

update platform.entity_types set
  taxonomy_node_id = '394893a0-be07-4b4a-9b50-3a0cd984bc80',
  governed_columns = ARRAY['created_by','organization_id','deleted_at','state','approved_by','approved_at','scope']
where token = 'hr_recalculation_batch';

-- ============================================================ 6. hr.calculation_snapshot  (LEDGER)
-- employment_id is created bare here and gains its FK in file 04 (hr.employment does not exist
-- yet) -- the same deferred-FK pattern section 18.1 uses for shift_id and crew_id.
do $$ begin
  if to_regclass('hr.calculation_snapshot') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'calculation_snapshot', p_token => 'hr_calculation_snapshot',
      p_label => 'Calculation snapshot',
      p_fields => ARRAY[
        'subject_type text NOT NULL',
        'subject_id uuid NOT NULL',
        'employment_id uuid',
        'calculation_kind text NOT NULL',
        'jurisdiction_key text NOT NULL REFERENCES hr.jurisdiction(key)',
        'as_of_date date NOT NULL',
        'engine_key text NOT NULL',
        'engine_version text NOT NULL',
        $f$resolution jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        $f$applicability_facts jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        $f$inputs jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        $f$outputs jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        $f$clamps jsonb NOT NULL DEFAULT '[]'::jsonb$f$,
        'prospective boolean NOT NULL DEFAULT false',
        'supersedes_id uuid',
        'superseded_by_id uuid',
        'recalculation_batch_id uuid REFERENCES hr.recalculation_batch(id)',
        $f$actor_type text NOT NULL CHECK (actor_type IN ('employee','manager','hr_admin','kiosk_device','external_signer','integration','automation','ai_agent','platform_admin'))$f$,
        'actor_id uuid',
        'computed_at timestamptz NOT NULL DEFAULT now()'
      ],
      p_variant => 'ledger', p_versioned => false, p_soft_delete => false, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'calculation_snapshot_supersedes_fk') then
    alter table hr.calculation_snapshot add constraint calculation_snapshot_supersedes_fk
      foreign key (supersedes_id) references hr.calculation_snapshot(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'calculation_snapshot_superseded_by_fk') then
    alter table hr.calculation_snapshot add constraint calculation_snapshot_superseded_by_fk
      foreign key (superseded_by_id) references hr.calculation_snapshot(id);
  end if;
end $$;

create index if not exists calculation_snapshot_subject_idx
  on hr.calculation_snapshot (subject_type, subject_id, computed_at desc);
create index if not exists calculation_snapshot_org_asof_idx
  on hr.calculation_snapshot (organization_id, as_of_date);
create index if not exists calculation_snapshot_employment_idx
  on hr.calculation_snapshot (employment_id, as_of_date) where employment_id is not null;
create index if not exists calculation_snapshot_resolution_gin
  on hr.calculation_snapshot using gin (resolution jsonb_path_ops);

-- Section 4.1: a ledger grants org-wide read and these payloads carry hours and pay, so every
-- payload column is excluded from the generated client. Payloads are read only through
-- hr.rpc_calculation_snapshot_get, which re-checks reach and writes an access-audit row.
update platform.entity_types set
  taxonomy_node_id = '394893a0-be07-4b4a-9b50-3a0cd984bc80',
  client_excluded_columns = ARRAY['resolution','applicability_facts','inputs','outputs','clamps']
where token = 'hr_calculation_snapshot';

-- ============================================================ 7. the write guard, per table
do $$
declare t text;
begin
  foreach t in array ARRAY['jurisdiction','jurisdiction_rule_class','jurisdiction_rule',
                           'jurisdiction_rule_test','recalculation_batch','calculation_snapshot'] loop
    if not exists (select 1 from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
                     join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'hr' and c.relname = t and tg.tgname = '_zz_guard_hr_write') then
      execute format(
        'create trigger _zz_guard_hr_write before insert or update or delete on hr.%I for each row execute function hr._guard_hr_write()', t);
    end if;
  end loop;
end $$;

-- ============================================================ 8. US political geography seed
-- Federal + 50 states + DC (section 1.1). Platform rows are visibility='public' (section 1.0).
-- County and city rows exist only where a rule exists and land with C5.
select set_config('hr.privileged_write', 'on', false);

insert into hr.jurisdiction (organization_id, key, level, parent_key, name, iso_code, visibility)
select '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, v.key, v.level, v.parent_key, v.name, v.iso_code, 'public'::platform.visibility
from (values
  ('US','federal',null,'United States',null),
  ('US-AL','state','US','Alabama','US-AL'),   ('US-AK','state','US','Alaska','US-AK'),
  ('US-AZ','state','US','Arizona','US-AZ'),   ('US-AR','state','US','Arkansas','US-AR'),
  ('US-CA','state','US','California','US-CA'),('US-CO','state','US','Colorado','US-CO'),
  ('US-CT','state','US','Connecticut','US-CT'),('US-DE','state','US','Delaware','US-DE'),
  ('US-DC','state','US','District of Columbia','US-DC'),
  ('US-FL','state','US','Florida','US-FL'),   ('US-GA','state','US','Georgia','US-GA'),
  ('US-HI','state','US','Hawaii','US-HI'),    ('US-ID','state','US','Idaho','US-ID'),
  ('US-IL','state','US','Illinois','US-IL'),  ('US-IN','state','US','Indiana','US-IN'),
  ('US-IA','state','US','Iowa','US-IA'),      ('US-KS','state','US','Kansas','US-KS'),
  ('US-KY','state','US','Kentucky','US-KY'),  ('US-LA','state','US','Louisiana','US-LA'),
  ('US-ME','state','US','Maine','US-ME'),     ('US-MD','state','US','Maryland','US-MD'),
  ('US-MA','state','US','Massachusetts','US-MA'),('US-MI','state','US','Michigan','US-MI'),
  ('US-MN','state','US','Minnesota','US-MN'), ('US-MS','state','US','Mississippi','US-MS'),
  ('US-MO','state','US','Missouri','US-MO'),  ('US-MT','state','US','Montana','US-MT'),
  ('US-NE','state','US','Nebraska','US-NE'),  ('US-NV','state','US','Nevada','US-NV'),
  ('US-NH','state','US','New Hampshire','US-NH'),('US-NJ','state','US','New Jersey','US-NJ'),
  ('US-NM','state','US','New Mexico','US-NM'),('US-NY','state','US','New York','US-NY'),
  ('US-NC','state','US','North Carolina','US-NC'),('US-ND','state','US','North Dakota','US-ND'),
  ('US-OH','state','US','Ohio','US-OH'),      ('US-OK','state','US','Oklahoma','US-OK'),
  ('US-OR','state','US','Oregon','US-OR'),    ('US-PA','state','US','Pennsylvania','US-PA'),
  ('US-RI','state','US','Rhode Island','US-RI'),('US-SC','state','US','South Carolina','US-SC'),
  ('US-SD','state','US','South Dakota','US-SD'),('US-TN','state','US','Tennessee','US-TN'),
  ('US-TX','state','US','Texas','US-TX'),     ('US-UT','state','US','Utah','US-UT'),
  ('US-VT','state','US','Vermont','US-VT'),   ('US-VA','state','US','Virginia','US-VA'),
  ('US-WA','state','US','Washington','US-WA'),('US-WV','state','US','West Virginia','US-WV'),
  ('US-WI','state','US','Wisconsin','US-WI'), ('US-WY','state','US','Wyoming','US-WY')
) as v(key, level, parent_key, name, iso_code)
where not exists (select 1 from hr.jurisdiction j where j.key = v.key);

select set_config('hr.privileged_write', 'off', false);

-- ============================================================ 9. DDL guard acknowledgement
-- Section 1.3: HR is org-explicit by the 2026-08-21 NO-NULL-ORG ruling, so the advisory rule
-- `org_not_null_no_backstop` fires one WARN per table. Expected, not a defect.
do $$
declare t text;
begin
  foreach t in array ARRAY['jurisdiction','jurisdiction_rule_class','jurisdiction_rule',
                           'jurisdiction_rule_test','recalculation_batch','calculation_snapshot'] loop
    perform platform.ddl_guard_ack(
      p_reason => 'HR is org-explicit by the 2026-08-21 NO-NULL-ORG ruling; no assignment trigger by design (SPEC-DATA-MODEL 1.3)',
      p_by     => 'hr-domain-migration hr_01',
      p_rule   => 'org_not_null_no_backstop',
      p_object_ref => 'hr.' || t);
  end loop;
end $$;

-- ============================================================ 10. assertions
do $$
declare r record; v_bad integer; v_geo integer;
begin
  for r in select unnest(ARRAY['jurisdiction','jurisdiction_rule_class','jurisdiction_rule',
                               'jurisdiction_rule_test','recalculation_batch','calculation_snapshot']) as t loop
    select count(*) into v_bad from iam.verify_canonical('hr', r.t, 'hr_' || r.t) where status in ('FAIL','WARN');
    if v_bad > 0 then
      raise exception 'hr_01: hr.% has % FAIL/WARN conformance rows', r.t, v_bad;
    end if;
    if not exists (select 1 from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
                     join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'hr' and c.relname = r.t and tg.tgname = '_zz_guard_hr_write') then
      raise exception 'hr_01: hr.% is missing _zz_guard_hr_write', r.t;
    end if;
    if (select taxonomy_node_id from platform.entity_types where token = 'hr_' || r.t) is null then
      raise exception 'hr_01: hr_% has no taxonomy_node_id', r.t;
    end if;
  end loop;

  select count(*) into v_geo from hr.jurisdiction where level in ('federal','state');
  if v_geo < 52 then
    raise exception 'hr_01: expected >= 52 seeded jurisdictions (federal + 50 states + DC), found %', v_geo;
  end if;

  -- Section 18.3 query 4. `platform.ddl_guard_unacked` is a per-rule AGGREGATE view live, with no
  -- object_ref column, so the per-object form reads the log directly.
  select count(*) into v_bad from platform.ddl_guard_log
   where acknowledged_at is null and object_ref like 'hr.%';
  if v_bad > 0 then
    raise exception 'hr_01: % unacked DDL guard rows remain on hr.*', v_bad;
  end if;
end $$;
