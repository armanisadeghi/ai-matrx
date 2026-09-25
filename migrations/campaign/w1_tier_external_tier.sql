-- chair-step: this builds the external tier by CALLING platform.provision(spec) twice — a spec-driven builder, the shape §6b.2's additive allow-list refuses by name because it cannot read what the statement will execute — and it revokes the new private schema custom_external from every client role; both are correct refusals and the sanctioned route for both is an attended step
--
-- W1-TIER — THE EXTERNAL TIER: stub Records, the private FDW schema, the read-only opt-in.
--
-- CONTRACT ROWS: REC-N-8 · REC-N-9 · REC-N-10 · REC-N-11 · REL-N-1 · HIS-N-3 · DOOR-N-6.
-- NAMED CHECK: C-8. RULING (rules 23 and 28): BUILD-LOG.md, 2026-09-17 16:12 UTC, six parts,
-- recorded before this lane's first migration statement.
--
-- WHAT THIS FILE IS, IN ONE PARAGRAPH
-- -----------------------------------
-- An externally linked row is an ORDINARY Record of ours (REC-N-10), written through the
-- native door `custom.record_write` — no new data class, no second write path into
-- `custom.record` — with `custom.external_link` carrying the link, the cached title and the
-- `fetched_at` freshness stamp beside it, and `custom.external_record` resolving the two
-- together as one `security_invoker = true` view. Being an ordinary Record is precisely what
-- makes the stub inherit Visibility, History, relations, kinds and agent tools: it inherits
-- them because it IS one, not because anything here re-implements them.
--
-- WHY THERE IS NO `CREATE EXTENSION postgres_fdw` AND NO FOREIGN SERVER HERE
-- -------------------------------------------------------------------------
-- A wrapper needs a live remote and a credential, and REC-N-9's provisioning, credential
-- custody and billing are DEFERRED (D-14) because §2 forbids a lane spending anything. So
-- what this file lands is the PLACEMENT and the EXPOSURE, which are what DOOR-N-6 is about:
-- the private schema `custom_external`, revoked from PUBLIC, anon, authenticated and
-- service_role with ALTER DEFAULT PRIVILEGES behind it so a foreign table created there
-- tomorrow inherits the closure; `custom.external_rows(...)`, which refuses to resolve any
-- relation outside that schema and filters every row through `iam.has_access('record', …,
-- 'viewer')`; and `custom.external_foreign_table_findings()`, which goes red on any foreign
-- table of this tier placed elsewhere or granted to a client role. A real foreign table is
-- created ON THE REHEARSAL BRANCH ONLY, inside the rolled-back proof
-- `scripts/campaign-tests/w1_tier_c8.sql` and its RED twin, which is where the guard is shown
-- failing and then passing.
--
-- WHY IT IS HEADER-LESS AND A CHAIR STEP, MEASURED RATHER THAN ASSUMED
-- -------------------------------------------------------------------
-- The same finding `W1-PROV` recorded: `select platform.provision(...)` is "a statement in no
-- enumerated additive shape", so a `-- target: branch,production` + `-- additive: yes` +
-- `-- guard:` header is REFUSED at both targets with `not-additive`. That refusal is right and
-- is not routed around — the allow-list's whole job is to read what a file will execute. The
-- store went through the same door (`w1_prov_custom_record_via_the_door.sql`) and so does
-- this. The `-- judge-only` verdict at `--target production` is in this lane's report.
--
-- THE INVERSE: `migrations/inverse/w1_tier_external_tier_down.sql`.

set lock_timeout = '2s';
set statement_timeout = '600s';

-- ── DOOR-N-6: the private schema, closed before anything can be put in it ──────
create schema if not exists custom_external;

revoke all on schema custom_external from public;
revoke all on schema custom_external from anon;
revoke all on schema custom_external from authenticated;
revoke all on schema custom_external from service_role;

alter default privileges in schema custom_external revoke all on tables from public, anon, authenticated, service_role;
alter default privileges in schema custom_external revoke all on functions from public, anon, authenticated, service_role;
alter default privileges in schema custom_external revoke all on sequences from public, anon, authenticated, service_role;

comment on schema custom_external is
  'DOOR-N-6: the private home of every foreign-data-wrapper table. Revoked from PUBLIC, anon, authenticated and service_role, with ALTER DEFAULT PRIVILEGES behind it so a foreign table created here inherits the closure; it is never added to pgrst.db_schemas. The only read is custom.external_rows(organization_id, source_id), which applies our Visibility through iam.has_access. A wrapper carries no row-level security of its own, which is why it may never be exposed directly.';

-- ── REC-N-8 / REC-N-9 / REC-N-11: the source registry, THROUGH THE DOOR ───────
select platform.provision($provision_source$
{
  "schema": "custom",
  "table": "external_source",
  "token": "external_source",
  "label": "External Source",
  "description": "REC-N-8 / REC-N-9 / REC-N-11: one row per (organization, connection, external table) \u2014 the registration of an external tier. `tier` stores all three placements; only `foreign_table` can be declared, the other two refuse by naming DEFERRED D-14 and its trigger. `writes_enabled` is REC-N-11's per-table, per-organization write opt-in and it defaults FALSE.",
  "type": "entity",
  "origin": "standard",
  "access": {
    "data_class": "organization",
    "data_class_reason": "Which outside system an organization has linked, and under which tier, is that organization's own business fact: visible inside the organization by its access grants, never to the world.",
    "default_list_scope": "organization",
    "visibility": "internal",
    "key_column": "created_by"
  },
  "fields": [
    {
      "name": "tier",
      "type": "text",
      "not_null": true,
      "check": "tier in ('foreign_table', 'customer_schema', 'managed_postgres')",
      "description": "REC-N-8 / REC-N-9: the placement. foreign_table is the only tier this campaign can declare; customer_schema (a customer's own schema in our database, sold by contract) and managed_postgres (an instance we provision, hold credentials for and bill) are DEFERRED D-14 and refuse at the door."
    },
    {
      "name": "connection_token",
      "type": "text",
      "not_null": true,
      "description": "REL-N-1: the name of the connection the external key is opaque WITHIN. Two outside systems may both call a row '42'; the connection is what makes the pair a key."
    },
    {
      "name": "external_schema",
      "type": "text",
      "not_null": true,
      "default": "''::text",
      "description": "The schema the external table lives in as the outside system names it. NOT NULL with an empty default so the uniqueness of (organization, connection, schema, table) is a plain unique index rather than an expression nobody can see."
    },
    {
      "name": "external_table",
      "type": "text",
      "not_null": true,
      "description": "The external table as the outside system names it. For tier foreign_table this is ALSO the relation name inside the private schema custom_external \u2014 DOOR-N-6."
    },
    {
      "name": "writes_enabled",
      "type": "boolean",
      "not_null": true,
      "default": "false",
      "description": "REC-N-11: the write opt-in, per table and per organization, DEFAULT FALSE. While it is false custom.external_write_through raises 42501 insufficient_privilege \u2014 a privilege error, not a branch in the caller."
    },
    {
      "name": "link_template",
      "type": "text",
      "description": "REC-N-10: how a stub's link is built from its external key, e.g. https://example.test/rows/{key}. Null means the caller supplies the whole link."
    }
  ],
  "indexes": [
    {
      "columns": [
        "organization_id",
        "connection_token",
        "external_schema",
        "external_table"
      ],
      "unique": true
    },
    {
      "columns": [
        "organization_id",
        "tier"
      ]
    }
  ],
  "write_door": "single",
  "custom_fields": false,
  "sharing": false,
  "functions": [
    {
      "name": "external_source_declare",
      "args": "p_organization_id uuid, p_tier text, p_connection_token text, p_external_schema text, p_external_table text, p_link_template text",
      "returns": "uuid",
      "language": "plpgsql",
      "security": "definer",
      "search_path": "pg_catalog",
      "client_access": "server_only",
      "reason": "REC-N-8 / REC-N-9's refusal path and REC-N-11's default. The one way an external source is registered: it declares tier foreign_table, and REFUSES customer_schema and managed_postgres by name with SQLSTATE 0A000, naming DEFERRED D-14 and its trigger. Whatever it writes, it writes with writes_enabled FALSE.",
      "non_client_lane": "server_only: nothing client-side calls this. Schema custom is revoked from PUBLIC, anon, authenticated and service_role, is absent from pgrst.db_schemas, and the product switch custom/system_enabled resolves false. The client grant is switch-checklist work with its own step, never a lane's.",
      "arg_checks": {
        "p_organization_id": {
          "check": "the caller's own organization, asserted by the caller before it reaches this door: the row is written with exactly this organization_id, which is the leading column of every RLS policy on custom.external_source and of the unique index that makes a source unique per tenant.",
          "null_rule": "refused with SQLSTATE 22004; a source belongs to exactly one organization"
        },
        "p_tier": {
          "check": "one of the three tiers. foreign_table is written; customer_schema and managed_postgres are REFUSED with 0A000 and D-14's trigger; anything else is refused with 22023. The column's own CHECK is the second line of defence, never the first.",
          "null_rule": "refused with SQLSTATE 22004; there is no default tier"
        },
        "p_connection_token": {
          "check": "the connection name. Stored, never used to decide access; it is half of what makes an external key a key. Trimmed and refused empty.",
          "null_rule": "refused with SQLSTATE 22004"
        },
        "p_external_schema": {
          "check": "the outside system's schema name, stored verbatim. Nothing is executed with it here; custom.external_rows is the only function that ever resolves a relation name, and it refuses any schema but custom_external.",
          "null_rule": "null is coalesced to the empty string, which is what the column stores when the outside system has no schema"
        },
        "p_external_table": {
          "check": "the outside system's table name, stored verbatim and refused empty. Nothing is executed with it here.",
          "null_rule": "refused with SQLSTATE 22004"
        },
        "p_link_template": {
          "check": "the link template for stubs of this source; stored verbatim, never parsed here, and it reaches no access decision.",
          "null_rule": "null is legal and means the caller supplies each stub's whole link"
        }
      },
      "body": "\ndeclare\n  v_id uuid;\nbegin\n  if p_organization_id is null then\n    raise exception 'custom.external_source_declare: organization_id is required'\n      using errcode = '22004';\n  end if;\n  if p_tier is null or p_connection_token is null or p_external_table is null then\n    raise exception 'custom.external_source_declare: tier, connection_token and external_table are all required'\n      using errcode = '22004';\n  end if;\n  if p_tier in ('customer_schema', 'managed_postgres') then\n    raise exception 'custom.external_source_declare: tier % is not available. This campaign builds its row shape, its contract surface and this refusal only; provisioning, credential custody and billing are DEFERRED (D-14) because no lane may spend money.', p_tier\n      using errcode = '0A000',\n            hint = 'The trigger is written down: the first customer who asks for a customer schema or a managed Postgres instance, with the spend approved by Arman. Until then: select custom.external_tier_contract() says what each tier is and what it needs, and tier foreign_table is available today.';\n  end if;\n  if p_tier <> 'foreign_table' then\n    raise exception 'custom.external_source_declare: % is not a tier. The three are foreign_table, customer_schema and managed_postgres.', p_tier\n      using errcode = '22023';\n  end if;\n  if btrim(p_connection_token) = '' or btrim(p_external_table) = '' then\n    raise exception 'custom.external_source_declare: connection_token and external_table may not be blank'\n      using errcode = '22023';\n  end if;\n  insert into custom.external_source\n    (organization_id, tier, connection_token, external_schema, external_table, link_template)\n  values\n    (p_organization_id, p_tier, btrim(p_connection_token), coalesce(p_external_schema, ''),\n     btrim(p_external_table), p_link_template)\n  on conflict (organization_id, connection_token, external_schema, external_table)\n    where deleted_at is null\n    do update set link_template = excluded.link_template\n  returning id into v_id;\n  return v_id;\nend;\n"
    },
    {
      "name": "external_writes_set",
      "args": "p_organization_id uuid, p_source_id uuid, p_enabled boolean",
      "returns": "boolean",
      "language": "plpgsql",
      "security": "definer",
      "search_path": "pg_catalog",
      "client_access": "server_only",
      "reason": "REC-N-11: the per-table, per-organization write opt-in, and the only way it moves. It returns the value it left behind, so a caller that flipped nothing can tell.",
      "non_client_lane": "server_only: nothing client-side calls this. Schema custom is revoked from every client role and absent from pgrst.db_schemas; an organization turns this on through the settings surface a later wave builds, which calls this door server-side.",
      "arg_checks": {
        "p_organization_id": {
          "check": "the caller's own organization: the UPDATE is keyed (organization_id, id), so a source belonging to another tenant is not found and the call raises 0 rows rather than flipping somebody else's opt-in.",
          "null_rule": "refused with SQLSTATE 22004"
        },
        "p_source_id": {
          "check": "the external source whose opt-in is moving; it must exist within p_organization_id or the call is refused with 02000 (no_data) naming both ids.",
          "null_rule": "refused with SQLSTATE 22004"
        },
        "p_enabled": {
          "check": "the new value of writes_enabled. True opens the write path for THIS table and THIS organization only; nothing about it is global and nothing about it is remembered anywhere else.",
          "null_rule": "refused with SQLSTATE 22004; there is no third state"
        }
      },
      "body": "\ndeclare\n  v_now boolean;\nbegin\n  if p_organization_id is null or p_source_id is null or p_enabled is null then\n    raise exception 'custom.external_writes_set: organization_id, source_id and enabled are all required'\n      using errcode = '22004';\n  end if;\n  update custom.external_source\n     set writes_enabled = p_enabled\n   where organization_id = p_organization_id\n     and id = p_source_id\n     and deleted_at is null\n  returning writes_enabled into v_now;\n  if not found then\n    raise exception 'custom.external_writes_set: no external source % in organization %', p_source_id, p_organization_id\n      using errcode = '02000';\n  end if;\n  return v_now;\nend;\n"
    },
    {
      "name": "external_tier_contract",
      "args": "",
      "returns": "jsonb",
      "language": "sql",
      "security": "definer",
      "search_path": "pg_catalog",
      "client_access": "server_only",
      "reason": "REC-N-8 / REC-N-9: the contract surface. It states, per tier, what the tier is, what it needs from us, whether it is available today and \u2014 when it is not \u2014 which deferral holds it and what brings it back. A surface that says 'not available' and stops is the silent failure this row exists to prevent.",
      "non_client_lane": "server_only: it names no rows and reads nothing, but it lives in schema custom, which no client role may reach until the switch checklist opens it.",
      "arg_checks": {},
      "body": "\nselect jsonb_build_object(\n  'tiers', jsonb_build_array(\n    jsonb_build_object(\n      'tier', 'foreign_table',\n      'what', 'A table in an outside database reached through a foreign-data wrapper, read through custom.external_rows and never exposed to a client.',\n      'placement', 'A foreign table in the private schema custom_external, behind a function that applies our Visibility (DOOR-N-6).',\n      'available', true,\n      'costs_money', false,\n      'needs', 'A wrapper extension, a foreign server and a credential for the remote, none of which this campaign buys; the schema, the guard and the read door exist today.'),\n    jsonb_build_object(\n      'tier', 'customer_schema',\n      'what', 'A customer''s own schema in OUR database. Placement only: every table is still in the one registry and answers to the one access kernel.',\n      'placement', 'A schema of theirs beside ours, sold by contract and capped at tens of customers \u2014 schema-per-tenant degrades well before ten thousand schemas.',\n      'available', false,\n      'costs_money', true,\n      'deferred', 'D-14',\n      'trigger', 'The first customer who asks for it, with the spend approved by Arman.',\n      'needs', 'The contract, the price and the cap; the row shape and this refusal are what the campaign built.'),\n    jsonb_build_object(\n      'tier', 'managed_postgres',\n      'what', 'A Postgres instance the platform provisions, holds the credentials for, connects to and bills for, operated by a specialist database company.',\n      'placement', 'Outside our database entirely; every row of it that a person can see is a stub Record of ours.',\n      'available', false,\n      'costs_money', true,\n      'deferred', 'D-14',\n      'trigger', 'The first customer who asks for it, with the spend approved by Arman.',\n      'needs', 'Provisioning, credential custody and billing \u2014 all three spend money, and no lane in this campaign may spend anything.')),\n  'write_posture', jsonb_build_object(\n    'default', 'read_only',\n    'opt_in', 'custom.external_source.writes_enabled, per table and per organization, default false (REC-N-11)',\n    'refusal', 'custom.external_write_through raises 42501 insufficient_privilege while the opt-in is off'),\n  'stub', 'Every externally linked row is an ordinary Record of ours (REC-N-10) carrying link, cached title and a freshness stamp, so it inherits Visibility, History, relations, kinds and agent tools.');\n"
    }
  ],
  "taxonomy_node_id": "c5d29fbf-fd62-40dd-afd0-9cd96d4cca93",
  "category_label": "Custom Data",
  "is_listed": false
}
$provision_source$::jsonb, 'runner');

-- ── REC-N-10 / REL-N-1 / HIS-N-3 / DOOR-N-6: the stubs, THROUGH THE DOOR ──────
select platform.provision($provision_link$
{
  "schema": "custom",
  "table": "external_link",
  "token": "external_link",
  "label": "External Link",
  "description": "REC-N-10: the external half of a stub Record \u2014 the link, the cached title and the freshness stamp \u2014 hanging off an ordinary row of custom.record, which is what makes the stub inherit Visibility, History, relations, kinds and agent tools. REL-N-1: `target_ref` is the reference that may name a row outside our database, and its two arms are a CHECK on the column rather than a convention.",
  "type": "entity",
  "origin": "standard",
  "access": {
    "data_class": "organization",
    "data_class_reason": "A link from an organization's own Record to a row in an outside system is that organization's business data; it is never public and it is never shared across tenants.",
    "default_list_scope": "organization",
    "visibility": "internal",
    "key_column": "created_by"
  },
  "fields": [
    {
      "name": "record_id",
      "type": "uuid",
      "not_null": true,
      "description": "REC-N-10: the stub Record in custom.record. There is no foreign key because custom.record's primary key is (organization_id, id) and the builder writes single-column references; custom.external_stub_upsert is the only writer and it creates the Record through the native door custom.record_write before it writes this row."
    },
    {
      "name": "source_id",
      "type": "uuid",
      "not_null": true,
      "references": {
        "target": "external_source",
        "on_delete": "restrict"
      },
      "relationship_kind": "reference",
      "relationship_note": "A link POINTS AT its registered source and does not belong to it: restrict, because deleting a source while stubs still hang off it would leave every one of them naming a connection nobody can resolve.",
      "description": "The registered external source. It carries the tier and REC-N-11's write opt-in, so the refusal and the connection are read from one place."
    },
    {
      "name": "external_key",
      "type": "text",
      "not_null": true,
      "description": "REL-N-1: the outside system's own key, TEXT and opaque \u2014 a uuid, an integer, a Salesforce id or a URL fragment. This is the room platform.associations.target_id does not have: it is uuid NOT NULL with no foreign key at all (measured 2026-09-15 and again 2026-09-17)."
    },
    {
      "name": "target_ref",
      "type": "jsonb",
      "not_null": true,
      "check": "(target_ref ->> 'kind') in ('ours', 'external') and ((target_ref ->> 'kind' = 'ours' and target_ref ? 'entity' and target_ref ? 'row_id') or (target_ref ->> 'kind' = 'external' and target_ref ? 'connection' and target_ref ? 'external_table' and target_ref ? 'key'))",
      "description": "REL-N-1, written at CREATE TABLE time: a Relation's target is a reference with exactly two arms \u2014 {kind: ours, entity, row_id} or {kind: external, connection, external_table, key}. The CHECK is the law; custom.relation_target_ours and custom.relation_target_external are the only two constructors."
    },
    {
      "name": "link_url",
      "type": "text",
      "description": "REC-N-10: the link a person follows to the row in the outside system. Null when the source declares no link_template and the caller supplied none."
    },
    {
      "name": "cached_title",
      "type": "text",
      "description": "REC-N-10: the title as the outside system last reported it. It is a CACHE, which is why fetched_at sits beside it: a stub that renders is never proof the remote is reachable."
    },
    {
      "name": "fetched_at",
      "type": "timestamptz",
      "not_null": true,
      "default": "now()",
      "description": "REC-N-10: the freshness stamp. It moves only when the cached title is actually refreshed, never when the row is touched for another reason, so staleness is measurable rather than implied."
    }
  ],
  "indexes": [
    {
      "columns": [
        "organization_id",
        "source_id",
        "external_key"
      ],
      "unique": true
    },
    {
      "columns": [
        "organization_id",
        "record_id"
      ],
      "unique": true
    }
  ],
  "write_door": "single",
  "custom_fields": false,
  "sharing": false,
  "views": [
    {
      "name": "external_record",
      "security_invoker": true,
      "definition": "select r.organization_id, r.id as record_id, r.table_id, r.visibility, r.created_by, r.created_at, r.updated_at, l.id as link_id, l.source_id, s.tier, s.connection_token, s.external_schema, s.external_table, l.external_key, l.target_ref, l.link_url, l.cached_title, l.fetched_at, now() - l.fetched_at as staleness, s.writes_enabled from custom.record r join custom.external_link l on l.organization_id = r.organization_id and l.record_id = r.id join custom.external_source s on s.organization_id = l.organization_id and s.id = l.source_id"
    }
  ],
  "functions": [
    {
      "name": "relation_target_ours",
      "args": "p_entity_token text, p_row_id uuid",
      "returns": "jsonb",
      "language": "sql",
      "security": "definer",
      "search_path": "pg_catalog",
      "client_access": "server_only",
      "reason": "REL-N-1's first arm: a target inside our database, written as a reference rather than as a bare uuid, so the two arms are the same shape from the first line of code.",
      "non_client_lane": "server_only: a pure constructor in schema custom, which no client role may reach until the switch checklist opens it.",
      "arg_checks": {
        "p_entity_token": {
          "check": "the entity type the target row belongs to, as platform.entity_types names it. It is stored in the reference, never resolved to a relation here, and it reaches no access decision.",
          "null_rule": "the constructor still builds the reference; the CHECK on custom.external_link.target_ref refuses a reference whose entity key is missing, and a json null is a present key"
        },
        "p_row_id": {
          "check": "the target row's uuid in our own database. It is the only arm where a uuid is the key at all.",
          "null_rule": "the constructor still builds the reference; the column CHECK is what refuses a malformed one at write time"
        }
      },
      "body": "select jsonb_build_object('kind', 'ours', 'entity', p_entity_token, 'row_id', p_row_id);"
    },
    {
      "name": "relation_target_external",
      "args": "p_connection_token text, p_external_table text, p_external_key text",
      "returns": "jsonb",
      "language": "sql",
      "security": "definer",
      "search_path": "pg_catalog",
      "client_access": "server_only",
      "reason": "REL-N-1's second arm: (connection, external table, opaque key). The key is TEXT because an outside system's key is not ours to shape \u2014 this is the arm platform.associations.target_id cannot hold.",
      "non_client_lane": "server_only: a pure constructor in schema custom, which no client role may reach until the switch checklist opens it.",
      "arg_checks": {
        "p_connection_token": {
          "check": "the connection the key is opaque within; stored in the reference, resolved nowhere here.",
          "null_rule": "the constructor still builds the reference; the column CHECK refuses a reference missing this key at write time"
        },
        "p_external_table": {
          "check": "the outside system's table as it names it; stored in the reference and never executed. custom.external_rows is the only place a relation name is ever resolved, and it refuses any schema but custom_external.",
          "null_rule": "the constructor still builds the reference; the column CHECK refuses it at write time"
        },
        "p_external_key": {
          "check": "the outside system's own key, verbatim and opaque. Nothing parses it, nothing casts it, and nothing here decides access with it.",
          "null_rule": "the constructor still builds the reference; the column CHECK refuses it at write time"
        }
      },
      "body": "select jsonb_build_object('kind', 'external', 'connection', p_connection_token, 'external_table', p_external_table, 'key', p_external_key);"
    },
    {
      "name": "external_stub_upsert",
      "args": "p_organization_id uuid, p_source_id uuid, p_table_id uuid, p_external_key text, p_link_url text, p_cached_title text",
      "returns": "uuid",
      "language": "plpgsql",
      "security": "definer",
      "search_path": "pg_catalog",
      "client_access": "server_only",
      "reason": "REC-N-10: the one way a stub exists. It creates the stub through the NATIVE door custom.record_write \u2014 no second data class, no second write path into custom.record \u2014 and then writes the link, the cached title and the freshness stamp beside it. On a second call for the same (source, external key) it refreshes the cache and moves fetched_at, and creates no second Record.",
      "non_client_lane": "server_only: nothing client-side calls this. Schema custom is revoked from PUBLIC, anon, authenticated and service_role and is absent from pgrst.db_schemas; the campaign's own server lanes reach it as postgres.",
      "arg_checks": {
        "p_organization_id": {
          "check": "the caller's own organization, asserted by the caller before it reaches this door: the stub Record and the link row are both written with exactly this organization_id, which is custom.record's partition key and the leading column of every policy on both tables.",
          "null_rule": "refused with SQLSTATE 22004"
        },
        "p_source_id": {
          "check": "the registered external source, which must exist inside p_organization_id; it is read for the tier, the connection token and the link template, and a source from another tenant is simply not found (02000).",
          "null_rule": "refused with SQLSTATE 22004"
        },
        "p_table_id": {
          "check": "the custom Table this stub belongs to; it is passed straight through to custom.record_write, stored, and never used to decide access.",
          "null_rule": "null is legal and means a stub that belongs to no custom Table"
        },
        "p_external_key": {
          "check": "the outside system's own key, opaque and refused blank. It is stored verbatim and interpolated into the source's link_template only as a value, never as SQL.",
          "null_rule": "refused with SQLSTATE 22004; a stub with no external key links to nothing"
        },
        "p_link_url": {
          "check": "the link to the row in the outside system. When null the source's link_template is used with {key} replaced by the external key; when the source declares no template the stub simply carries no link, which is a stated state rather than a failure.",
          "null_rule": "null falls back to the source's link_template, and then to null"
        },
        "p_cached_title": {
          "check": "the title the outside system last reported. It is a cache: writing it is what moves fetched_at, so a refreshed title and a fresh stamp cannot disagree.",
          "null_rule": "null is legal and means the remote reported no title; fetched_at still moves, because the fetch happened"
        }
      },
      "body": "\ndeclare\n  v_src    custom.external_source%rowtype;\n  v_rec_id uuid;\n  v_link   uuid;\nbegin\n  if p_organization_id is null or p_source_id is null or p_external_key is null then\n    raise exception 'custom.external_stub_upsert: organization_id, source_id and external_key are all required'\n      using errcode = '22004';\n  end if;\n  if btrim(p_external_key) = '' then\n    raise exception 'custom.external_stub_upsert: external_key may not be blank'\n      using errcode = '22023';\n  end if;\n  select * into v_src from custom.external_source\n   where id = p_source_id and organization_id = p_organization_id and deleted_at is null;\n  if not found then\n    raise exception 'custom.external_stub_upsert: no external source % in organization %', p_source_id, p_organization_id\n      using errcode = '02000';\n  end if;\n\n  select l.record_id into v_rec_id from custom.external_link l\n   where l.organization_id = p_organization_id\n     and l.source_id = p_source_id\n     and l.external_key = p_external_key\n     and l.deleted_at is null;\n\n  if v_rec_id is null then\n    -- THE NATIVE DOOR. The stub is an ordinary Record: no new data_class, no second path.\n    v_rec_id := custom.record_write(p_organization_id, p_table_id, '{}'::jsonb);\n    insert into custom.external_link\n      (organization_id, record_id, source_id, external_key, target_ref, link_url, cached_title, fetched_at)\n    values\n      (p_organization_id, v_rec_id, p_source_id, p_external_key,\n       custom.relation_target_external(v_src.connection_token, v_src.external_table, p_external_key),\n       coalesce(p_link_url, replace(v_src.link_template, '{key}', p_external_key)),\n       p_cached_title, now())\n    returning id into v_link;\n  else\n    update custom.external_link l\n       set link_url     = coalesce(p_link_url, replace(v_src.link_template, '{key}', p_external_key), l.link_url),\n           cached_title = p_cached_title,\n           fetched_at   = now()\n     where l.organization_id = p_organization_id\n       and l.source_id = p_source_id\n       and l.external_key = p_external_key\n    returning l.id into v_link;\n  end if;\n  return v_rec_id;\nend;\n"
    },
    {
      "name": "external_write_through",
      "args": "p_organization_id uuid, p_record_id uuid, p_patch jsonb",
      "returns": "void",
      "language": "plpgsql",
      "security": "definer",
      "search_path": "pg_catalog",
      "client_access": "server_only",
      "reason": "REC-N-11: the write path to the outside row, and the refusal that is the whole of its first version. While the source's writes_enabled is false it raises 42501 insufficient_privilege \u2014 the refusal the caller already handles, rather than a branch the caller has to know about. With the opt-in ON it refuses differently and says so: no write connection is provisioned, D-14.",
      "non_client_lane": "server_only: nothing client-side calls this. Schema custom is revoked from every client role and absent from pgrst.db_schemas.",
      "arg_checks": {
        "p_organization_id": {
          "check": "the caller's own organization: the stub and its source are both looked up keyed by it, so a record in another tenant is not found (02000) rather than written through.",
          "null_rule": "refused with SQLSTATE 22004"
        },
        "p_record_id": {
          "check": "the stub Record whose outside row is being written. It must carry a link row in this organization; a native Record with no link is refused with 22023, because writing through a row that is not a stub means the caller has the wrong id.",
          "null_rule": "refused with SQLSTATE 22004"
        },
        "p_patch": {
          "check": "what the caller would write to the outside row. In this version nothing reads it: the door refuses before it is looked at, by privilege while the opt-in is off and by 0A000 after. It is in the signature so the opt-in's positive control is the SAME call rather than a different one.",
          "null_rule": "null is legal and is refused exactly as a non-null patch is; the refusal does not depend on the payload"
        }
      },
      "body": "\ndeclare\n  v_src custom.external_source%rowtype;\nbegin\n  if p_organization_id is null or p_record_id is null then\n    raise exception 'custom.external_write_through: organization_id and record_id are required'\n      using errcode = '22004';\n  end if;\n  select s.* into v_src\n    from custom.external_link l\n    join custom.external_source s\n      on s.organization_id = l.organization_id and s.id = l.source_id\n   where l.organization_id = p_organization_id and l.record_id = p_record_id\n     and l.deleted_at is null and s.deleted_at is null;\n  if not found then\n    raise exception 'custom.external_write_through: record % in organization % is not an external stub', p_record_id, p_organization_id\n      using errcode = '22023',\n            hint = 'A stub Record has a row in custom.external_link. A native record is written through its own door.';\n  end if;\n  if not v_src.writes_enabled then\n    raise exception 'custom.external_write_through: writing to % is not permitted for this organization', v_src.external_table\n      using errcode = '42501',\n            hint = format('The external tier is READ-ONLY until an organization opts in, per table: select custom.external_writes_set(%L, %L, true). It defaults to off (REC-N-11) and is turned on only after the read path is proven for that table.',\n                          p_organization_id, v_src.id);\n  end if;\n  raise exception 'custom.external_write_through: the opt-in for % is ON and there is still no write connection to write through', v_src.external_table\n    using errcode = '0A000',\n          hint = 'Provisioning, credential custody and billing for an external connection are DEFERRED (D-14); the trigger is the first customer who asks, with the spend approved by Arman. The opt-in is honoured: this is no longer a privilege refusal.';\nend;\n"
    },
    {
      "name": "external_history_event",
      "args": "p_organization_id uuid, p_link_id uuid, p_operation text",
      "returns": "bigint",
      "language": "plpgsql",
      "security": "definer",
      "search_path": "pg_catalog",
      "client_access": "server_only",
      "reason": "HIS-N-3: History records an event ABOUT an external link and never a copy of a foreign row. The door takes no payload of any kind \u2014 no jsonb, no record, no text blob \u2014 so a foreign row cannot be handed to it; it composes row_data out of OUR OWN link row and writes history.row_versions with row_id NULL, because the thing the event is about has no row id of ours.",
      "non_client_lane": "server_only: nothing client-side calls this. Schema custom is revoked from every client role and absent from pgrst.db_schemas.",
      "arg_checks": {
        "p_organization_id": {
          "check": "the caller's own organization; the link row is looked up keyed by it and the event is stamped with it, so an event can never be written against another tenant's link.",
          "null_rule": "refused with SQLSTATE 22004"
        },
        "p_link_id": {
          "check": "the link the event is about. It must exist inside p_organization_id (02000 otherwise); everything written into row_data is read from THIS row, which is ours.",
          "null_rule": "refused with SQLSTATE 22004"
        },
        "p_operation": {
          "check": "the event word, one of linked, refreshed or unlinked, refused otherwise with 22023. It is a fixed vocabulary rather than free text because an operation column that accepts anything is where a payload eventually hides.",
          "null_rule": "refused with SQLSTATE 22004"
        }
      },
      "body": "\ndeclare\n  v_link custom.external_link%rowtype;\n  v_src  custom.external_source%rowtype;\n  v_id   bigint;\nbegin\n  if p_organization_id is null or p_link_id is null or p_operation is null then\n    raise exception 'custom.external_history_event: organization_id, link_id and operation are all required'\n      using errcode = '22004';\n  end if;\n  if p_operation not in ('linked', 'refreshed', 'unlinked') then\n    raise exception 'custom.external_history_event: operation % is not one of linked, refreshed, unlinked', p_operation\n      using errcode = '22023';\n  end if;\n  select * into v_link from custom.external_link\n   where organization_id = p_organization_id and id = p_link_id and deleted_at is null;\n  if not found then\n    raise exception 'custom.external_history_event: no external link % in organization %', p_link_id, p_organization_id\n      using errcode = '02000';\n  end if;\n  select * into v_src from custom.external_source\n   where organization_id = p_organization_id and id = v_link.source_id;\n\n  insert into history.row_versions\n    (entity_type, row_id, organization_id, version, operation, row_data, actor_id, occurred_at)\n  values\n    ('external_link', null, p_organization_id, 1, p_operation,\n     jsonb_build_object(\n       'about', 'external_link',\n       'link_id', v_link.id,\n       'stub_record_id', v_link.record_id,\n       'target_ref', v_link.target_ref,\n       'tier', v_src.tier,\n       'connection_token', v_src.connection_token,\n       'external_table', v_src.external_table,\n       'external_key', v_link.external_key,\n       'fetched_at', v_link.fetched_at,\n       'foreign_row_copied', false),\n     auth.uid(), now())\n  returning id into v_id;\n  return v_id;\nend;\n"
    },
    {
      "name": "external_rows",
      "args": "p_organization_id uuid, p_source_id uuid",
      "returns": "setof jsonb",
      "language": "plpgsql",
      "security": "definer",
      "search_path": "pg_catalog",
      "client_access": "server_only",
      "reason": "DOOR-N-6: the ONLY read of an external relation, and it applies our Visibility. It refuses any relation outside the private schema custom_external by name, and it returns a row only when the caller can see that row's stub Record \u2014 iam.has_access('record', stub, 'viewer'), the platform's own kernel, because a SECURITY DEFINER function bypasses RLS and an invoker function cannot read a schema no client role holds.",
      "non_client_lane": "server_only: nothing client-side calls this, and custom_external is revoked from PUBLIC, anon, authenticated and service_role with ALTER DEFAULT PRIVILEGES behind it, so a foreign table created there tomorrow inherits the same closure. Supabase's own guidance is that wrappers carry no row-level security and must never be exposed via the API.",
      "arg_checks": {
        "p_organization_id": {
          "check": "the caller's own organization; every stub consulted is read keyed by it, so no row of another tenant's link table can be joined into the answer.",
          "null_rule": "refused with SQLSTATE 22004"
        },
        "p_source_id": {
          "check": "the registered source whose relation is being read. Its external_table is resolved ONLY inside custom_external, with format(%I) quoting, and a source whose relation is absent there is refused with 0A000 naming DOOR-N-6 rather than reading anything else.",
          "null_rule": "refused with SQLSTATE 22004"
        }
      },
      "body": "\ndeclare\n  v_src custom.external_source%rowtype;\n  v_rel regclass;\n  v_row jsonb;\nbegin\n  if p_organization_id is null or p_source_id is null then\n    raise exception 'custom.external_rows: organization_id and source_id are required'\n      using errcode = '22004';\n  end if;\n  select * into v_src from custom.external_source\n   where organization_id = p_organization_id and id = p_source_id and deleted_at is null;\n  if not found then\n    raise exception 'custom.external_rows: no external source % in organization %', p_source_id, p_organization_id\n      using errcode = '02000';\n  end if;\n  v_rel := to_regclass(format('custom_external.%I', v_src.external_table));\n  if v_rel is null then\n    raise exception 'custom.external_rows: custom_external.% does not exist', v_src.external_table\n      using errcode = '0A000',\n            hint = 'DOOR-N-6: an external relation lives in the private schema custom_external and nowhere else. No foreign server is provisioned by this campaign (D-14), so this is the expected state until a connection is bought.';\n  end if;\n  for v_row in execute format(\n      'select to_jsonb(t) from custom_external.%I t join custom.external_link l on l.external_key = t.external_key and l.organization_id = $1 and l.source_id = $2 and l.deleted_at is null where iam.has_access(''record'', l.record_id, ''viewer''::permission_level)',\n      v_src.external_table)\n    using p_organization_id, p_source_id\n  loop\n    return next v_row;\n  end loop;\n  return;\nend;\n"
    },
    {
      "name": "external_foreign_table_findings",
      "args": "",
      "returns": "setof text",
      "language": "sql",
      "security": "definer",
      "search_path": "pg_catalog",
      "client_access": "server_only",
      "reason": "DOOR-N-6's guard, and it binds the class rather than one table: any foreign table of this tier that sits outside custom_external, and any relation inside custom_external that holds a privilege for PUBLIC, anon, authenticated or service_role, is returned as a finding. It is empty today because the file creates no foreign table; it goes red the moment one is created in the wrong place or granted to a client role.",
      "non_client_lane": "server_only: a catalogue read in schema custom, which no client role may reach until the switch checklist opens it.",
      "arg_checks": {},
      "body": "\nselect format('foreign table %s.%s is outside the private schema custom_external (DOOR-N-6)', ns.nspname, c.relname)\n  from pg_class c\n  join pg_namespace ns on ns.oid = c.relnamespace\n  join pg_foreign_table ft on ft.ftrelid = c.oid\n  join pg_foreign_server fs on fs.oid = ft.ftserver\n where fs.srvname like 'custom\\_external%' and ns.nspname <> 'custom_external'\nunion all\nselect format('%s.%s in the private schema custom_external grants %s to %s (DOOR-N-6)',\n              ns.nspname, c.relname, a.privilege_type, a.grantee::regrole::text)\n  from pg_class c\n  join pg_namespace ns on ns.oid = c.relnamespace\n  cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a\n where ns.nspname = 'custom_external'\n   and c.relkind in ('r', 'f', 'v', 'm', 'p')\n   and a.grantee::regrole::text in ('public', 'anon', 'authenticated', 'service_role');\n"
    }
  ],
  "taxonomy_node_id": "c5d29fbf-fd62-40dd-afd0-9cd96d4cca93",
  "category_label": "Custom Data",
  "is_listed": false
}
$provision_link$::jsonb, 'runner');
