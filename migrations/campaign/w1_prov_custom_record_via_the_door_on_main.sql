-- chair-step: this creates the campaign's record store by CALLING platform.provision(spec) — a spec-driven builder, which is precisely the shape §6b.2's allow-list refuses because it cannot read what the statement will execute — and it revokes schema custom from every client role; both are correct refusals and the sanctioned route for both is an attended step
--
-- LAND — `custom.record`, ON THE MAIN DATABASE.
--
-- This is `w1_prov_custom_record_via_the_door.sql`, rehearsed on the copy, with TWO changes
-- and no others. Everything below the header — the spec's schema, table, fields, partition,
-- indexes, write door, body, taxonomy and the four revokes and the `crm.party` retrofit that
-- follow it — is the rehearsed file's.
--
-- 1. 🚨 `arg_checks` IS WRITTEN AS DATA, BECAUSE THE MAIN DATABASE ENFORCES 0796 AND THE COPY
--    DID NOT. The rehearsed spec wrote each `null_rule` as an English sentence and named no
--    `entity` for its two uuid arguments. The main database's `platform.provision_validate`
--    carries migration 0796's per-argument rules, so it refused the spec with five findings —
--    `functions.arg_checks.null_rule_shape` x3 and `functions.arg_checks.entity_missing` x2
--    (measured 2026-09-18, SQLSTATE 23514, nothing written). That refusal is correct: a door
--    rule written as prose is validated and thrown away, and nothing ever executes it
--    (lessons ledger 28). So each rule is now an object the generated contract test can run:
--    `{"sqlstate":"22004"}`, `{"means":"..."}`, `{"default":"{}"}`, and each uuid argument
--    declares `"entity": null` with an `entity_reason` saying what the id is instead — which
--    is the true answer here, because this door is `server_only` and makes no access decision
--    with either id. The English sentences are kept, unchanged, in each `check`.
--
-- 2. THE PROVISION CALL IS GUARDED BY `to_regclass`, so the file is idempotent and can
--    rehearse on the copy, where the store already stands under the older declaration.
--
-- The corrected spec was run through `platform.provision_validate(<spec>)` on the main
-- database, read-only and rolled back, before this file was applied: zero findings.
--
-- W1-PROV — `custom.record`, CREATED THROUGH `platform.provision(spec)`, with
--           `provision_shape_guard` ENABLED the whole time.
--
-- WHAT THIS SUPERSEDES
-- --------------------
-- `migrations/campaign/w1_store_custom_record_store.sql` built this table by hand under a
-- chair ruling recorded at 09:55 UTC on 2026-09-17: *"`custom.record` IS CREATED BY DIRECT
-- DDL, NOT BY `platform.create_entity_table`"*, because the live provisioner emitted
-- `id uuid PRIMARY KEY`, zero `PARTITION` and zero `custom_fields` and could not express
-- REC-N-6, REC-41 or REC-60. Production's event trigger then refused that table by name —
-- SQLSTATE 23514, `provision_shape_guard`. The ruling is superseded rather than argued
-- with: the store goes through the door, and the door was widened to fit it
-- (`w1_prov_provisioner_speaks_partitions.sql`). Cost of the earlier ruling: one refused
-- production apply and zero production change.
--
-- WHAT THE SPEC SAYS, AND WHY EACH ANSWER
-- ---------------------------------------
--   partition {hash, [organization_id], 16}  REC-41, measured on the branch 2026-09-17 over
--                                            2,000,000 rows and 500 organizations: the point
--                                            read is indistinguishable at 1 / 16 / 64, the
--                                            list read is ~2.5x faster at the median
--                                            partitioned, and the unpartitioned worst case
--                                            on a cross-organization maintenance read is 13x
--                                            the partitioned one. Sixteen beats sixty-four
--                                            on both user-facing reads for a quarter of the
--                                            children. The primary key is `(organization_id,
--                                            id)` — REC-N-6 — because PostgreSQL requires the
--                                            partition key inside every unique constraint.
--   write_door "single"                      DOOR-N-1. `platform.stamped_write_table` is
--                                            written before `iam.apply_rls`, so
--                                            `iam.apply_table_grants` issues the read-only
--                                            client grant itself; `custom.record_write` is
--                                            the one write path and its
--                                            `platform.client_callable_door` row is written
--                                            in the same transaction, `server_only`.
--   custom_fields true                       REC-40 / REC-60: the one field-value column,
--                                            emitted by the builder immediately after
--                                            `metadata`.
--   data jsonb                               REC-36: one jsonb document per record, never one
--                                            row per value.
--   origin "standard"                        Doctrine §1.2, verbatim: *"Standard — a table
--                                            shipped by AI Matrx as a real Postgres table"*;
--                                            *"Custom — a table defined by an organization,
--                                            stored virtually in the custom record store."*
--                                            `custom.record` IS the custom record store: a
--                                            table we ship. The tenant-declared Tables are
--                                            ROWS inside it, and they are what `custom` names.
--                                            `w1_store_branch_registration.sql`'s branch
--                                            fixture said `custom`, which is also why the
--                                            validator refused it (`origin.custom_unbuilt`);
--                                            that refusal is correct and stays.
--
-- WHY THE REVOKES ARE STILL HERE
-- ------------------------------
-- §6.3's fact two. The schema-level revoke and `ALTER DEFAULT PRIVILEGES` must be in place
-- BEFORE the table is created, because twenty schemas carry default-privilege rows that
-- grant every new relation automatically. The bounded route is `-- allows: revoke custom`,
-- which both runners refuse without, refuse when any REVOKE names another schema, and PRINT
-- when used.
--
-- 🚨 WHY IT IS HEADER-LESS AND A CHAIR STEP, MEASURED RATHER THAN ASSUMED.
-- Written first as `-- target: branch,production` + `-- additive: yes` +
-- `-- guard: custom/system_enabled` + `-- allows: revoke custom`, exactly as a campaign DDL
-- file is meant to be, `pnpm db:apply --judge-only` returned
-- `"verdict":"refuse","code":"not-additive"` at BOTH targets: `select platform.provision(...)`
-- is "a statement in no enumerated additive shape". That refusal is RIGHT and is not routed
-- around. The allow-list's whole job is to read what a file will execute, and a spec-driven
-- builder is the same class as the DO block it already refuses for the same stated reason —
-- admitting it would mean the production allow-list could no longer see the DDL it admits.
-- So the store follows the door it now goes through: an attended step, with the reason and
-- the whole body printed, the filename typed back, and the SAME BYTES rehearsed on the
-- branch first (§4.9, §6b.1).
--
-- THE INVERSE: `migrations/inverse/w1_prov_custom_record_via_the_door_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '600s';

-- ── the schema, and the posture that makes it unreachable ──────────────────────
create schema if not exists custom;

revoke all on schema custom from public;
revoke all on schema custom from anon;
revoke all on schema custom from authenticated;
revoke all on schema custom from service_role;

alter default privileges in schema custom revoke all on tables from public, anon, authenticated, service_role;
alter default privileges in schema custom revoke all on functions from public, anon, authenticated, service_role;
alter default privileges in schema custom revoke all on sequences from public, anon, authenticated, service_role;

comment on schema custom is
  'The unified custom-data store. Revoked from PUBLIC, anon, authenticated and service_role and absent from pgrst.db_schemas; the product switch is platform.knob_resolve(''custom'',''system_enabled'', null).';

-- ── the store, THROUGH THE DOOR ────────────────────────────────────────────────
do $land_store$
begin
  -- IDEMPOTENT BY `to_regclass`, and it is not a convenience. The rehearsal copy already
  -- carries this store, provisioned there under the older validator; `platform.provision`
  -- refuses a token whose relation still stands with a different declaration, so the copy
  -- would refuse this file and the main database would never see it. Where the relation is
  -- absent — which is the main database — this provisions exactly as the rehearsed file did.
  if to_regclass('custom.record') is null then
    perform platform.provision($provision_spec$
{
  "schema": "custom",
  "table": "record",
  "token": "record",
  "label": "Record",
  "description": "The unified custom-data record store. REC-36: one jsonb document per record, never one row per value. REC-N-6: the primary key is (organization_id, id), never id alone. REC-41: HASH PARTITIONED BY organization_id into sixteen partitions, measured on this contract's own predicates. DOOR-N-1: authenticated holds no direct INSERT, UPDATE or DELETE — custom.record_write is the one write door.",
  "type": "entity",
  "origin": "standard",
  "access": {
    "data_class": "organization",
    "data_class_reason": "A custom record is its organization's own business data: visible inside the organization by its access grants, never to the world by default.",
    "default_list_scope": "organization",
    "visibility": "internal",
    "key_column": "created_by"
  },
  "fields": [
    {
      "name": "table_id",
      "type": "uuid",
      "description": "The custom Table this record belongs to. A record of the kernel itself carries null."
    },
    {
      "name": "data_class",
      "type": "text",
      "not_null": true,
      "default": "'record'::text",
      "description": "kernel for the Tables the platform ships, record for an organization's own rows."
    },
    {
      "name": "data",
      "type": "jsonb",
      "not_null": true,
      "default": "'{}'::jsonb",
      "description": "REC-36: the whole record, as one jsonb document."
    }
  ],
  "partition": {
    "strategy": "hash",
    "key": [
      "organization_id"
    ],
    "count": 16
  },
  "write_door": "single",
  "custom_fields": true,
  "indexes": [
    {
      "columns": [
        "organization_id",
        "table_id",
        "created_at"
      ],
      "method": "btree"
    }
  ],
  "sharing": false,
  "functions": [
    {
      "name": "record_write",
      "args": "p_organization_id uuid, p_table_id uuid, p_data jsonb",
      "returns": "uuid",
      "language": "plpgsql",
      "security": "definer",
      "search_path": "pg_catalog",
      "client_access": "server_only",
      "reason": "DOOR-N-1: the one write door into custom.record. It refuses a null organization_id (the store is keyed (organization_id, id)) and inserts exactly one row, letting platform._stamp_actor set created_by and platform._touch_row set the timestamps, so no caller can choose an author.",
      "non_client_lane": "server_only: nothing client-side calls this. Schema custom is revoked from PUBLIC, anon, authenticated and service_role, is absent from pgrst.db_schemas, and the product switch custom/system_enabled resolves false; the campaign's own server lanes reach it as postgres. The client grant is switch-checklist work with its own step, never a lane's.",
      "arg_checks": {
        "p_organization_id": {
          "check": "the caller's own organization, asserted by the caller before it reaches this door: the row is written with exactly this organization_id, which is the partition key and the leading column of every RLS policy on custom.record, so a wrong value writes into a tenant the writer cannot then read. Not null — the function raises 22004.",
          "null_rule": {
            "sqlstate": "22004"
          },
          "entity": null,
          "entity_reason": "It is an organization id, and this door makes NO access decision with it: the value is written verbatim as the partition key and the leading column of every RLS policy on custom.record. client_access is server_only — schema custom is revoked from PUBLIC, anon, authenticated and service_role, absent from pgrst.db_schemas, and custom/system_enabled resolves false — so the only caller is a server lane that has already asserted the organization. Declaring an entity token here would declare an access check the body does not perform, which is the false declaration lessons ledger 28 exists to stop."
        },
        "p_table_id": {
          "check": "the custom Table this record belongs to; it is stored, never used to decide access. Access to the row is decided by organization_id and the canonical entity policies on custom.record, never by the Table.",
          "null_rule": {
            "means": "a kernel record that belongs to no custom Table"
          },
          "entity": null,
          "entity_reason": "The custom Table this record belongs to. It is STORED and never read to decide access: access to the row is decided by organization_id and the canonical entity policies on custom.record. The kernel Table entity does not exist yet at this point in the build either — w1_store_kernel_tables.sql creates it in the next file."
        },
        "p_data": {
          "check": "the record document itself; it carries no identifier this door reads and no identifier this door checks. It is stored verbatim as one jsonb object (REC-36) and nothing in it reaches an access decision.",
          "null_rule": {
            "default": "{}"
          }
        }
      },
      "body": "\ndeclare\n  v_id uuid;\nbegin\n  if p_organization_id is null then\n    raise exception 'custom.record_write: organization_id is required - the store is keyed (organization_id, id)'\n      using errcode = '22004';\n  end if;\n  insert into custom.record (organization_id, table_id, data)\n  values (p_organization_id, p_table_id, coalesce(p_data, '{}'::jsonb))\n  returning id into v_id;\n  return v_id;\nend;\n"
    }
  ],
  "taxonomy_node_id": "c5d29fbf-fd62-40dd-afd0-9cd96d4cca93",
  "category_label": "Custom Data",
  "is_listed": false
}
$provision_spec$::jsonb, 'runner');
  else
    raise notice 'custom.record already exists here; platform.provision(spec) was not called. This is the rehearsal copy''s path.';
  end if;
end
$land_store$;


-- ── the revoke the door's law depends on ───────────────────────────────────────
-- `write_door: single` already made `iam.apply_table_grants` issue the read-only client
-- grant instead of `select, insert, update, delete`, and the provisioner PROVED that from
-- the catalogue before it returned. These four close the rest: in schema `custom` no client
-- role holds anything at all, so unreachability does not rest on one table's grant.
revoke all on all tables in schema custom from public, anon, service_role;
revoke insert, update, delete on all tables in schema custom from authenticated;
revoke all on all tables in schema custom from authenticated;
revoke all on all functions in schema custom from public, anon, authenticated, service_role;

-- ── REC-40's first retrofit, on the table the chair named ──────────────────────
-- Restored here because running `w1_store_custom_record_store.sql`'s stored inverse to drop
-- the hand-made table dropped this column with it. Same statement, same column, same
-- reasoning: `crm.party` is a standard Entity with real rows, not in `supabase_realtime`,
-- named by the chair. A column cannot be hidden by a knob — PostgREST `select('*')` returns
-- it the instant it lands — so `custom/entity_custom_fields_guard` holds its MEANING off and
-- the OFF proof is ANSWER IDENTITY: every existing read returns the same values with one
-- extra key whose value is null for every live row. Nullable with no default on purpose.
alter table crm.party add column if not exists custom_fields jsonb;

comment on column crm.party.custom_fields is
  'REC-40, the campaign''s first retrofit. Its MEANING is held off by custom/entity_custom_fields_guard; nothing reads it while that knob resolves false. Nullable with no default on purpose: the OFF proof is that every existing read returns the same values with one extra key whose value is null.';
