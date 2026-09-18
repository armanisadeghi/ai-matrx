-- dd173_api_request_log_a_columns — DD-173, the first of the two hot tables, STEP A of four.
--
-- `ops.api_request_log` is the platform's own API request trail: 1.6 M rows, ~950 rows every ten
-- minutes, written continuously by the server's request-log sink
-- (`aidream/aidream/api/middleware/request_log.py` -> `db/managers/ops/api_request_log.py`).
-- DD-159 batch 1 registered it (`rls_variant = ledger`, `data_class = confidential`) and
-- `iam.apply_rls` has refused it ever since for a missing base contract: no `organization_id`,
-- no FK, no `metadata`.
--
-- 🚨 WHY THIS IS FOUR FILES AND NOT ONE `platform.retrofit_entity` CALL.
--    The canonical path does ADD COLUMN -> full-table backfill -> SET NOT NULL -> ADD FK in ONE
--    transaction. On 1.6 M rows and 1.4 GB that is minutes of one transaction, and the last two
--    statements each take ACCESS EXCLUSIVE while they SCAN THE WHOLE TABLE — the lock every
--    reader and the request sink itself would queue behind, far past the 2 s production bound
--    this runner sets and this file does not raise. Measured on a 200 k-row copy of this very
--    table in a rolled-back rehearsal (2026-09-14):
--        add organization_id (nullable) ............  4 ms
--        add metadata NOT NULL DEFAULT '{}' .......  4 ms   (PG11+ fast default: no rewrite)
--        backfill, per 50 k rows .................. 1.3-3.9 s   (ROW EXCLUSIVE only)
--        CHECK (organization_id IS NOT NULL) NOT VALID   4 ms
--        VALIDATE that CHECK ......................  54 ms  (SHARE UPDATE EXCLUSIVE, no scan lock)
--        SET NOT NULL with the CHECK already valid    2 ms  (PG12+ skips the scan entirely)
--        FK NOT VALID / VALIDATE .................. 14 ms / 80 ms
--    So the same end state is reached with no statement holding a strong lock for more than a few
--    milliseconds. This file is the fast half; the backfill is its own bounded batches (step B),
--    and the NOT NULL / FK validation is step C.
--
-- 🚨 WHY `organization_id` IS LEFT NULLABLE BY THIS FILE, ON PURPOSE.
--    NO NULL ORG (owner ruling 2026-08-21) says the initiating operation states the organization:
--    no default, no resolver, no trigger, no backstop — `platform._ddl_guard` hard-aborts all
--    three on this column by name. The live request-log writer names none, so the instant this
--    column is NOT NULL every request-log write fails. The writer must supply it FIRST
--    (aidream: `organization_id=MATRX_SYSTEM_ORGANIZATION_ID`, the same explicit constant
--    `pool_saturation_sink.py` already uses for an ops sink) and be deployed, and step C refuses
--    to seal until it can SEE that in the live rows. Between this file and step C the column is
--    nullable and the guard's `nullable_org` lane fires — acknowledged at the end of this file
--    with that reason, never silenced.
--
-- 🚨 WHY THE SYSTEM ORGANIZATION. A row here is a platform operations record about our own API
--    surface — no customer wrote it and no customer owns it — which is exactly the case db-rules
--    §2 assigns the system org. Measured in B-65's batch-3 rehearsal and again by step D's gate:
--    on a class-aware ledger lane a `confidential` class has no platform-admin arm and no
--    global-readable system-org arm, so a system-org row exposes nothing to anybody.
--
-- Steps: A this file (columns) · B bounded backfill batches · C seal (NOT NULL + FK validated)
--        · D supersede + generate under the access-delta gate + certify.

do $dd173arla$
declare
  v_as      timestamptz := now();
  v_rows    bigint;
  v_variant text; v_class text;
  v_acked   bigint;
begin
  -- ═══════ 1. THE TABLE, THE TOKEN AND THE REGISTRY MUST AGREE BEFORE A COLUMN MOVES ══════════
  select et.rls_variant, et.data_class::text into v_variant, v_class
    from platform.entity_types et
   where et.token = 'api_request_log' and et.is_active
     and et.schema_name = 'ops' and et.table_name = 'api_request_log';
  if v_variant is null then
    raise exception 'dd173-arl-a: api_request_log is not an active registered entity at ops.api_request_log. Nothing was changed.';
  end if;
  if v_variant <> 'ledger' or v_class <> 'confidential' then
    raise exception 'dd173-arl-a: api_request_log is registered % / %, not ledger / confidential. This file was written for the ledger contract; re-read the registry before running it.', v_variant, v_class;
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema='ops' and table_name='api_request_log'
                    and column_name='id' and data_type='uuid') then
    raise exception 'dd173-arl-a: ops.api_request_log has no uuid id. The identity is not this file''s to change.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema='ops' and table_name='api_request_log'
                    and column_name='created_at' and is_nullable='NO') then
    raise exception 'dd173-arl-a: ops.api_request_log has no NOT NULL created_at — the ledger append timestamp is missing and this file does not add one blind.';
  end if;

  -- ═══════ 2. THE TWO COLUMNS THE LEDGER CONTRACT IS MISSING ══════════════════════════════════
  -- A ledger gets LESS, not more (§6d-3): no actor pair, no mutation trio, no visibility column.
  -- What it gets is what its generated lane actually reads.
  if not exists (select 1 from pg_attribute a
                  where a.attrelid='ops.api_request_log'::regclass and a.attname='organization_id' and not a.attisdropped) then
    alter table ops.api_request_log add column organization_id uuid;
    raise notice 'dd173-arl-a: added organization_id (nullable until step C — see the header)';
  else
    raise notice 'dd173-arl-a: organization_id already present';
  end if;

  if not exists (select 1 from information_schema.columns
                  where table_schema='ops' and table_name='api_request_log'
                    and column_name='metadata' and data_type='jsonb' and is_nullable='NO') then
    alter table ops.api_request_log add column metadata jsonb not null default '{}'::jsonb;
    raise notice 'dd173-arl-a: added metadata jsonb NOT NULL DEFAULT ''{}'' (fast default, no table rewrite)';
  else
    raise notice 'dd173-arl-a: metadata already present';
  end if;

  -- The FK is added UNVALIDATED: it is enforced on every new row from this moment, and the
  -- existing 1.6 M are proven by step C's VALIDATE, which takes SHARE UPDATE EXCLUSIVE and blocks
  -- nothing. Adding it validated here would scan the whole table under ACCESS EXCLUSIVE.
  if not exists (select 1 from pg_constraint c
                  join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
                 where c.conrelid='ops.api_request_log'::regclass and c.contype='f'
                   and a.attname='organization_id' and c.confrelid='iam.organizations'::regclass) then
    alter table ops.api_request_log
      add constraint ops_api_request_log_organization_id_fkey
      foreign key (organization_id) references iam.organizations(id) not valid;
    raise notice 'dd173-arl-a: added the organization FK NOT VALID (enforced on every new row from now; the backlog is validated in step C)';
  else
    raise notice 'dd173-arl-a: the organization FK is already present';
  end if;

  -- ═══════ 3. WHAT STEP B HAS TO DO, STATED OUT LOUD ══════════════════════════════════════════
  -- 🚨 THE PLANNER'S ESTIMATE, NOT count(*), AND THE REASON IS THE LOCK. From the first ALTER
  --    above this transaction holds ACCESS EXCLUSIVE on ops.api_request_log until it commits, so
  --    every statement after it is time the request sink and every reader spend queueing. A
  --    count(*) here is a full scan of 923 MB — seconds of holding the strongest lock there is,
  --    to print a number step B recomputes anyway. Nothing in this file depends on its value.
  select c.reltuples::bigint into v_rows from pg_class c where c.oid = 'ops.api_request_log'::regclass;
  raise notice 'dd173-arl-a: on the order of % row(s) (planner estimate) carry no organization and are step B''s work. Step C refuses to seal while any remain.', v_rows;

  -- ═══════ 4. THIS FILE'S OWN GUARD FIRING, ACKNOWLEDGED WITH ITS REASON ══════════════════════
  select count(*) into v_acked from platform.ddl_guard_log
   where rule = 'nullable_org' and acknowledged_at is null and occurred_at >= v_as
     and object_ref = 'ops.api_request_log';
  if v_acked > 0 then
    perform platform.ddl_guard_ack(
      p_reason => 'DD-173 ops.api_request_log step A of four: the column is added nullable ON PURPOSE and for a bounded window. NO NULL ORG forbids a default, a resolver and a trigger on this column (this same guard hard-aborts all three), so the organization can only come from the writer — and the live request-log sink does not name one yet. Sealing the column NOT NULL before the writer ships would fail every request-log write on the running server. The writer is changed to name the system organization explicitly, and step C (dd173_api_request_log_c_seal.sql) refuses to set NOT NULL until it can see, in the live rows, that new writes arrive with an organization.',
      p_by     => 'DD-173 ops.api_request_log step A migration',
      p_rule   => 'nullable_org',
      p_before => null,
      p_ids    => (select array_agg(id) from platform.ddl_guard_log
                    where rule = 'nullable_org' and acknowledged_at is null and occurred_at >= v_as
                      and object_ref = 'ops.api_request_log'));
    raise notice 'dd173-arl-a: acknowledged % nullable_org guard firing(s) raised by this file', v_acked;
  end if;
end $dd173arla$;
