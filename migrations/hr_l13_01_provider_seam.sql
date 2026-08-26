-- HR L13 — migration 1 of 3 (register item HRB-025, lane lane-l13-export).
--
-- THE PROVIDER SEAM SUBSTRATE. SPEC-CONTRACTS §3.6 writes the shape of every provider integration
-- once — "so the next seam is a registration, not a design" — and D22 makes that layer the
-- deliverable of this phase rather than any single provider. This file creates the two tables the
-- seam needs and nothing else: the binding (how to reach a black box) and the event ledger (what
-- crossed the edge, in either direction, exactly once).
--
-- Authority: SPEC-CONTRACTS §3.6 + §1.3 (424/503) + §8 (the seam knobs, already seeded);
-- R-L12-L13-L14-READINESS §2.2; D12 (the reusable seam), D22 (the layer, not the provider).
-- Applied live as `hr_l13_01_provider_seam`. Idempotent.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS (EXECUTION §8)
--
-- 1. 🚨 THE `hr` SCHEMA HAD NO PROVIDER TABLES AT ALL. §3.6 describes `hr.provider_binding` as
--    "the row GET /hr/providers/{seam}/bindings projects", and the core lanes created 128 hr
--    tables without it — verified live: zero tables in `hr` matching `provider%`, `seam%`,
--    `webhook%`, `connector%` or `integration%`. The seam was a spec with no substrate. Provider
--    concepts existed only as loose text columns on consumers (`hr.background_check.path`,
--    `.provider_key`). This file is the substrate; nothing here re-specifies §3.6.
--
-- 2. TWO TABLES, NOT FOUR. A dispatch and a webhook are the same fact seen from two sides, so
--    `hr.provider_event` carries `direction` rather than splitting into an outbound table and an
--    inbound one. The subject row already owns its own outbound/inbound stamps
--    (`hr.background_check.outbound_sent_at` / `.inbound_result_ref` and their siblings), so this
--    ledger exists for exactly two jobs: webhook idempotency and the audit trail. A third table
--    would be a second place to look for one answer.
--
-- 3. THE IDEMPOTENCY KEY IS `(organization_id, provider_key, provider_event_id)` AND IT IS A
--    PARTIAL UNIQUE INDEX. §3.6: "a provider that retries five times produces one state change."
--    Outbound rows carry no `provider_event_id`, so the index is `WHERE provider_event_id IS NOT
--    NULL` — a plain unique constraint would collapse every outbound row in an org into one.
--    The organization is IN the key because the seam resolves an org from the binding the HMAC
--    signature identifies (U-12); two tenants using the same provider have their own event streams
--    and must never be able to overwrite each other's.
--
-- 4. `payload_summary` IS A SUMMARY AND THE COLUMN IS NAMED SO NOBODY "FIXES" IT. §3.6 states it
--    twice, and it is the one field an implementer is most likely to widen: the outbound payload
--    carries PII (an SSN on a background-check dispatch) that our own tables must not duplicate.
--    The CHECK below refuses a summary over 4 KB, which is not a security boundary but is a loud
--    tripwire the moment somebody starts storing the real thing.
--
-- 5. THE BINDING IS `entity` / `internal`, NOT `restricted`, AND ITS SECRETS ARE REFERENCES.
--    `esign.provider` is restricted because it holds `credentials jsonb` — actual material.
--    `hr.provider_binding` holds only `credential_ref` and `webhook_secret_ref`: vault POINTERS.
--    A restricted binding would be unreadable by the payroll administrator whose screen must list
--    it, so the row is internal and the two ref columns plus `connector` are registered as
--    client-excluded (migration 03) so they never reach a generated client type. The real boundary
--    is that `hr` is not exposed to PostgREST at all and E-27 projects a fixed column list.
--
-- 6. THE FIVE SEAMS ARE A CHECK, NOT A REGISTRY TABLE. §3.6 declares the set closed —
--    background_check · esign · payroll · benefits · everify — and adding a sixth is an amendment
--    (§7), not a config edit. A CHECK constraint says exactly that; a lookup table would say the
--    opposite. `connector_kind` is closed the same way.
--
-- 7. `provider_key = 'quickbooks_online'` ON `seam = 'payroll'` IS RESERVED IN CODE, NOT SEEDED
--    HERE. Readiness §2.3 step 1 asks for the reservation; a DB row for a provider with no adapter
--    would make `GET /hr/providers/payroll/bindings` return a binding that cannot dispatch, which
--    is precisely the fake-green state the four invariants exist to prevent. The reservation lives
--    in the adapter registry (`aidream/services/hr/providers/registry.py`), where an unbound but
--    reserved key is a named 424 rather than a row.
-- ===================================================================================

set local statement_timeout = '600s';
set local lock_timeout = '30s';

-- ---------------------------------------------------------------------------------
-- 1. hr.provider_binding — how to reach the black box (§3.6 connector kinds).
-- ---------------------------------------------------------------------------------
do $$ begin
  if to_regclass('hr.provider_binding') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'provider_binding', p_token => 'hr_provider_binding',
      p_label => 'Provider binding',
      p_fields => ARRAY[
        'seam text NOT NULL',
        'provider_key text NOT NULL',
        'display_name text NOT NULL',
        $f$connector_kind text NOT NULL DEFAULT 'manual'$f$,
        'is_active boolean NOT NULL DEFAULT true',
        $f$capabilities text[] NOT NULL DEFAULT '{}'::text[]$f$,
        'credential_ref text',
        'webhook_secret_ref text',
        'server_version_pin text',
        $f$connector jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'bound_at timestamptz NOT NULL DEFAULT now()',
        'last_sync_at timestamptz',
        'bound_reason text'
      ],
      p_variant => 'entity', p_versioned => false, p_soft_delete => true, p_visibility => 'internal',
      p_category => false, p_listed => true, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

-- ---------------------------------------------------------------------------------
-- 2. hr.provider_event — the edge ledger, both directions (§3.6 E-28/E-29/E-31).
-- ---------------------------------------------------------------------------------
do $$ begin
  if to_regclass('hr.provider_event') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'provider_event', p_token => 'hr_provider_event',
      p_label => 'Provider seam event',
      p_fields => ARRAY[
        'binding_id uuid REFERENCES hr.provider_binding(id)',
        'seam text NOT NULL',
        'provider_key text NOT NULL',
        'direction text NOT NULL',
        $f$path text NOT NULL DEFAULT 'manual'$f$,
        'subject_token text NOT NULL',
        'subject_id uuid NOT NULL',
        'provider_event_id text',
        'external_ref text',
        'external_status text',
        'mapped_state text',
        'result_summary text',
        $f$payload_summary jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'artifact_file_id uuid REFERENCES files.files(id)',
        'signature_verified boolean',
        'occurred_at timestamptz NOT NULL DEFAULT now()',
        'received_at timestamptz NOT NULL DEFAULT now()',
        'processed_at timestamptz',
        'failure_reason text'
      ],
      p_variant => 'component', p_versioned => false, p_soft_delete => false, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => ARRAY['hr_provider_binding:binding_id']);
  end if;
end $$;

-- ---------------------------------------------------------------------------------
-- 3. The closed vocabularies (RECORDED DECISION 6) and the invariants.
-- ---------------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'provider_binding_seam_check') then
    alter table hr.provider_binding add constraint provider_binding_seam_check
      check (seam in ('background_check','esign','payroll','benefits','everify'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'provider_binding_connector_kind_check') then
    alter table hr.provider_binding add constraint provider_binding_connector_kind_check
      check (connector_kind in ('rest','mcp','file','manual'));
  end if;
  -- §3.6 MCP rule 1: an MCP binding without a pinned server version is a best-effort call against
  -- a tool whose arguments can move under us. The pin is required at the database, not in a docstring.
  if not exists (select 1 from pg_constraint where conname = 'provider_binding_mcp_pin_check') then
    alter table hr.provider_binding add constraint provider_binding_mcp_pin_check
      check (connector_kind <> 'mcp' or (server_version_pin is not null and btrim(server_version_pin) <> ''));
  end if;
  -- §3.6 MCP rule 3: "No webhook lane. E-31 does not accept MCP traffic."
  if not exists (select 1 from pg_constraint where conname = 'provider_binding_mcp_no_webhook_check') then
    alter table hr.provider_binding add constraint provider_binding_mcp_no_webhook_check
      check (connector_kind <> 'mcp' or not ('webhook' = any (capabilities)));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'provider_event_seam_check') then
    alter table hr.provider_event add constraint provider_event_seam_check
      check (seam in ('background_check','esign','payroll','benefits','everify'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'provider_event_direction_check') then
    alter table hr.provider_event add constraint provider_event_direction_check
      check (direction in ('outbound','inbound'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'provider_event_path_check') then
    alter table hr.provider_event add constraint provider_event_path_check
      check (path in ('provider','manual'));
  end if;
  -- RECORDED DECISION 4 — the tripwire on the summary.
  if not exists (select 1 from pg_constraint where conname = 'provider_event_summary_is_a_summary_check') then
    alter table hr.provider_event add constraint provider_event_summary_is_a_summary_check
      check (pg_column_size(payload_summary) <= 4096);
  end if;
  -- An inbound event that claims a provider path must say whether its signature verified.
  if not exists (select 1 from pg_constraint where conname = 'provider_event_signature_declared_check') then
    alter table hr.provider_event add constraint provider_event_signature_declared_check
      check (direction <> 'inbound' or path <> 'provider' or signature_verified is not null);
  end if;
end $$;

-- RECORDED DECISION 3 — five retries, one state change.
create unique index if not exists provider_event_once_per_provider_event
  on hr.provider_event (organization_id, provider_key, provider_event_id)
  where provider_event_id is not null;

create unique index if not exists provider_binding_active_per_seam
  on hr.provider_binding (organization_id, seam, provider_key)
  where deleted_at is null;

create index if not exists provider_binding_seam_idx
  on hr.provider_binding (organization_id, seam, is_active) where deleted_at is null;
create index if not exists provider_event_subject_idx
  on hr.provider_event (organization_id, subject_token, subject_id, occurred_at desc);
create index if not exists provider_event_unprocessed_idx
  on hr.provider_event (organization_id, seam, received_at)
  where processed_at is null;

comment on table hr.provider_binding is
  'SPEC-CONTRACTS §3.6 — how an org reaches one provider on one seam. REST, MCP, file and manual are peers: the adapter interface is one method set regardless of connector_kind. credential_ref / webhook_secret_ref / connector are vault pointers and configuration, NEVER projected to a client (E-27 returns a fixed non-secret column list).';
comment on table hr.provider_event is
  'SPEC-CONTRACTS §3.6 — every crossing of the provider edge, outbound and inbound, in one ledger. Idempotent on (organization_id, provider_key, provider_event_id): five provider retries produce one state change. payload_summary is a SUMMARY, never the payload — the payload carries PII our tables must not duplicate.';
comment on column hr.provider_event.payload_summary is
  'A SUMMARY. Never the outbound or inbound payload. §3.6 states this twice because it is the field an implementer widens first.';

-- ---------------------------------------------------------------------------------
-- 4. The hr write guard, per table — `platform.create_entity_table` does NOT attach it.
--    Discovered by this file's own assertion, which refused the first apply at 0/2. A new hr
--    table without `_zz_guard_hr_write` is writable by any path that reaches the table, which is
--    the exact hole SPEC-ACCESS law 2 closes; the guard is not optional decoration.
-- ---------------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array ARRAY['provider_binding','provider_event'] loop
    if not exists (select 1 from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
                     join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'hr' and c.relname = t and tg.tgname = '_zz_guard_hr_write') then
      execute format(
        'create trigger _zz_guard_hr_write before insert or update or delete on hr.%I for each row execute function hr._guard_hr_write()', t);
    end if;
  end loop;
end $$;

-- The registry node. The seam is not one HR feature's: it serves five (background_check, esign,
-- payroll, benefits, everify), so it hangs off the canonical `integrations` domain rather than
-- being filed under whichever consumer happened to land first. Recorded for the coordinator: the
-- §8 knobs for this behaviour are already seeded under `hr.contracts`, which has no live node —
-- that mismatch is the knob register's to reconcile, not this table's.
update platform.entity_types
   set taxonomy_node_id = 'cfa22177-27c9-4332-907b-11d5f9b3d317'
 where token in ('hr_provider_binding','hr_provider_event')
   and taxonomy_node_id is distinct from 'cfa22177-27c9-4332-907b-11d5f9b3d317';

-- ---------------------------------------------------------------------------------
-- 5. DDL-guard acknowledgements — log-driven, never a hard-coded list.
-- ---------------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select distinct object_ref, rule from platform.ddl_guard_log
            where acknowledged_at is null
              and object_ref in ('hr.provider_binding','hr.provider_event') loop
    perform platform.ddl_guard_ack(
      p_reason => 'Created by platform.create_entity_table under HRB-025 (SPEC-CONTRACTS §3.6, D12/D22); the shape is the provisioner''s, not hand-rolled, and it certifies. The hr schema is org-explicit: no _stamp_org_default backstop is attached, because a provider event that does not name its tenant cannot be scoped, retained, or attributed to a binding.',
      p_by     => 'hr-migration hr_l13_01_provider_seam',
      p_rule   => r.rule,
      p_object_ref => r.object_ref);
  end loop;
end $$;

-- ---------------------------------------------------------------------------------
-- 5. ASSERTIONS — this file does not commit a lie.
-- ---------------------------------------------------------------------------------
do $$
declare v_tok text; v_bad int;
begin
  foreach v_tok in array ARRAY['hr_provider_binding','hr_provider_event'] loop
    if not exists (select 1 from platform.entity_types where token = v_tok and is_active) then
      raise exception 'hr_l13_01: token % is not registered', v_tok;
    end if;
    if not iam.canonical_certify_ok('hr',
         (select table_name from platform.entity_types where token = v_tok), v_tok) then
      raise exception 'hr_l13_01: % does not certify — see iam.verify_canonical', v_tok;
    end if;
  end loop;

  -- NO NULL ORG: not one org-assignment trigger on either new table.
  select count(*) into v_bad from pg_trigger t
    join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'hr' and c.relname in ('provider_binding','provider_event')
     and not t.tgisinternal and t.tgname = '_stamp_org_default';
  if v_bad > 0 then raise exception 'hr_l13_01: % org-assignment triggers — the NO-BACKSTOP law', v_bad; end if;

  -- the hr write guard reaches both new tables, or a client could write the seam directly
  select count(*) into v_bad from pg_trigger t
    join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'hr' and c.relname in ('provider_binding','provider_event')
     and not t.tgisinternal and t.tgname = '_zz_guard_hr_write';
  if v_bad <> 2 then raise exception 'hr_l13_01: the hr write guard covers %/2 new tables', v_bad; end if;

  -- anon holds zero grants on the seam
  select count(*) into v_bad from information_schema.role_table_grants
   where table_schema = 'hr' and table_name in ('provider_binding','provider_event') and grantee = 'anon';
  if v_bad > 0 then raise exception 'hr_l13_01: anon holds % grants on the provider seam', v_bad; end if;

  select count(*) into v_bad from platform.ddl_guard_log
   where acknowledged_at is null and object_ref in ('hr.provider_binding','hr.provider_event');
  if v_bad > 0 then raise exception 'hr_l13_01: % unacked guard rows remain', v_bad; end if;
end $$;
