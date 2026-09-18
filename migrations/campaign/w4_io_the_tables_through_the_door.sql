-- chair-step: creates W4-IO's three tables by CALLING platform.provision(spec) — a spec-driven builder, which §6b.2's allow-list refuses because it cannot read what the statement will execute; the sanctioned route for that shape is an attended step, and the standing ruling of 2026-09-18 is that every business-shaped table goes through the provisioner door
--
-- W4-IO — THE THREE TABLES, CREATED THROUGH `platform.provision(spec)`.
--
-- DOOR-13 · DOOR-15 · DOOR-11 · DOOR-14 · CUT-N-2.
--
-- WHAT LANDS, AND WHY EACH ONE IS A TABLE RATHER THAN A COLUMN
-- ------------------------------------------------------------
--   `custom.io_outbox`   CUT-N-2 and DOOR-13. THE TRANSACTIONAL OUTBOX: one row per record
--                        change, written in the SAME TRANSACTION as the record by a trigger,
--                        drained by an idempotent consumer. It is a table and not a queue
--                        server precisely because that is the pattern's whole point — if the
--                        event lived anywhere but this database, the record could commit and
--                        the event could not, or the reverse, and a switch window would lose
--                        writes. `dedupe_key` is UNIQUE per organization: a replayed change
--                        writes nothing new, which is what "idempotent consumer" means when
--                        stated as a constraint rather than as an intention.
--   `custom.io_import`   DOOR-11 and DOOR-14. One row per import run, holding the file's own
--                        column list, the mapping onto Fields, the rows written, and — the
--                        part DOOR-14 is actually about — the UNMAPPED columns as PROPOSALS a
--                        table admin approves. A proposal is a row and not a log line because
--                        somebody has to be able to come back tomorrow and accept it.
--   `custom.io_comment`  DOOR-15. Record comments. A comment is not a Value: it is not typed
--                        by a Field, it does not take part in validation, it does not roll up,
--                        and it is written by anyone holding `commenter` — a level below the
--                        one that may change the record. Putting it in the document would make
--                        every one of those four sentences false.
--
-- WHY NO `write_door: single` ON THESE THREE. `write_door: single` exists to take the client's
-- direct INSERT/UPDATE/DELETE away and route it through one function. Schema `custom` already
-- holds no grant of any kind for `public`, `anon`, `authenticated` or `service_role`
-- (`w1_prov_custom_record_via_the_door.sql`'s four REVOKEs), and is absent from
-- `pgrst.db_schemas`, so there is no client privilege here for a door to remove. Declaring it
-- anyway would oblige each table to ship a door function whose only caller is this lane's own
-- server-side code — a door in a wall with no opening on the other side. The doors that DO
-- exist (`custom.io_outbox_drain`, `custom.io_import_open`, `custom.io_comment_write`) are in
-- the next file, where their bodies can be read next to the triggers they answer.
--
-- THE INVERSE: `migrations/inverse/w4_io_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '600s';

-- ── DOOR-13 / CUT-N-2: the transactional outbox ───────────────────────────────
select platform.provision($spec$
{
  "schema": "custom",
  "table": "io_outbox",
  "token": "io_outbox",
  "label": "Record change outbox",
  "description": "CUT-N-2 / DOOR-13: the transactional outbox of the record store. A trigger on custom.record writes one row here in the SAME TRANSACTION as the record, so the change and its event commit together or not at all; custom.io_outbox_drain is the idempotent consumer. dedupe_key is unique per organization, so a replay writes nothing new. Nothing publishes from custom.record itself — the pg_notify is raised from THIS table.",
  "type": "entity",
  "origin": "standard",
  "access": {
    "data_class": "organization",
    "data_class_reason": "An outbox row describes one organization's own record change and names its actor; it is that organization's operational data and never the world's.",
    "default_list_scope": "organization",
    "visibility": "internal",
    "key_column": "created_by"
  },
  "fields": [
    { "name": "event_key", "type": "text", "not_null": true, "default": "'records.changed'::text",
      "description": "The event this row carries. records.changed today; the column exists so a second event never needs a second table." },
    { "name": "record_id", "type": "uuid", "not_null": true,
      "description": "The record that changed. Not a foreign key: custom.record is hash-partitioned on (organization_id, id) and a delete must still leave its own event behind." },
    { "name": "table_id", "type": "uuid",
      "description": "The custom Table the record belongs to, copied at write time so a consumer can route without reading the record back." },
    { "name": "operation", "type": "text", "not_null": true,
      "description": "insert, update or delete — what happened to the record." },
    { "name": "changed_field_ids", "type": "jsonb", "not_null": true, "default": "'[]'::jsonb",
      "description": "The Field ids whose values differ between OLD and NEW, resolved at write time. The consumer is told WHAT changed, not merely that something did." },
    { "name": "actor", "type": "jsonb", "not_null": true, "default": "'{}'::jsonb",
      "description": "Who made the change: user id, role, and the actor tier the platform already stamps." },
    { "name": "dedupe_key", "type": "text", "not_null": true,
      "description": "organization:record:version. UNIQUE per organization, which is what makes the consumer idempotent as a CONSTRAINT rather than as a promise." },
    { "name": "consumed_at", "type": "timestamptz",
      "description": "When the consumer took it. Null means outstanding; the drain claims by setting it." },
    { "name": "consumer", "type": "text",
      "description": "Which consumer took it, so two consumers draining the same organization can be told apart." }
  ],
  "indexes": [
    { "columns": ["organization_id", "dedupe_key"], "method": "btree", "unique": true },
    { "columns": ["organization_id", "consumed_at", "created_at"], "method": "btree" },
    { "columns": ["organization_id", "record_id"], "method": "btree" }
  ],
  "sharing": false,
  "is_listed": false,
  "taxonomy_node_id": "c5d29fbf-fd62-40dd-afd0-9cd96d4cca93",
  "category_label": "Custom Data"
}
$spec$::jsonb, 'runner');

-- ── DOOR-11 / DOOR-14: the import run and its field proposals ─────────────────
select platform.provision($spec$
{
  "schema": "custom",
  "table": "io_import",
  "token": "io_import",
  "label": "Import run",
  "description": "DOOR-11 / DOOR-14: one import run through the write door. Holds the source columns, the mapping onto Fields, the count written, and the UNMAPPED columns as proposals a table admin accepts or rejects — a proposal is a row so somebody can come back to it tomorrow.",
  "type": "entity",
  "origin": "standard",
  "access": {
    "data_class": "organization",
    "data_class_reason": "An import run is one organization's own operation over its own Table, and its column names are that organization's business vocabulary.",
    "default_list_scope": "organization",
    "visibility": "internal",
    "key_column": "created_by"
  },
  "fields": [
    { "name": "table_id", "type": "uuid", "not_null": true,
      "description": "The custom Table the rows were written into." },
    { "name": "format", "type": "text", "not_null": true, "default": "'csv'::text",
      "description": "csv or xlsx. The parse differs; everything after it does not." },
    { "name": "source_name", "type": "text",
      "description": "The file's own name, kept so a person recognises the run they are looking at." },
    { "name": "source_columns", "type": "jsonb", "not_null": true, "default": "'[]'::jsonb",
      "description": "The column headers exactly as the file spelled them, in order." },
    { "name": "mapping", "type": "jsonb", "not_null": true, "default": "'{}'::jsonb",
      "description": "source column -> Field key, as resolved. A column the importer mapped by hand and a column matched by name are the same row here." },
    { "name": "proposals", "type": "jsonb", "not_null": true, "default": "'[]'::jsonb",
      "description": "DOOR-14: one entry per column matching no Field — its name, a sample of its values, the type inferred from them, and its state (proposed, accepted, rejected). This is what the UI offers as \"add this as a field\"." },
    { "name": "rows_seen", "type": "integer", "not_null": true, "default": "0",
      "description": "Rows the file held." },
    { "name": "rows_written", "type": "integer", "not_null": true, "default": "0",
      "description": "Rows that reached the store. The difference from rows_seen is the refusals, and it is never silently zero." },
    { "name": "refusals", "type": "jsonb", "not_null": true, "default": "'[]'::jsonb",
      "description": "Row number and reason for every row the store refused, so an import that half-worked says which half." },
    { "name": "state", "type": "text", "not_null": true, "default": "'open'::text",
      "description": "open, written or closed." }
  ],
  "indexes": [
    { "columns": ["organization_id", "table_id", "created_at"], "method": "btree" }
  ],
  "sharing": false,
  "is_listed": false,
  "taxonomy_node_id": "c5d29fbf-fd62-40dd-afd0-9cd96d4cca93",
  "category_label": "Custom Data"
}
$spec$::jsonb, 'runner');

-- ── DOOR-15: record comments, at the commenter level ──────────────────────────
select platform.provision($spec$
{
  "schema": "custom",
  "table": "io_comment",
  "token": "io_comment",
  "label": "Record comment",
  "description": "DOOR-15: comments on a record, written by anyone holding `commenter` — a level BELOW the one that may change the record. A comment is not a Value: it is not typed by a Field, takes no part in validation, and never rolls up. Threading is a parent_comment_id, and resolution is a column, because a resolved comment is still a comment.",
  "type": "entity",
  "origin": "standard",
  "access": {
    "data_class": "organization",
    "data_class_reason": "A comment is written inside one organization about one of its records and is visible to whoever may see that record.",
    "default_list_scope": "organization",
    "visibility": "internal",
    "key_column": "created_by"
  },
  "fields": [
    { "name": "record_id", "type": "uuid", "not_null": true,
      "description": "The record commented on. Not a foreign key for the same reason the outbox has none: custom.record is hash-partitioned and a comment must survive its record's soft delete." },
    { "name": "table_id", "type": "uuid",
      "description": "The Table the record belongs to, copied so a Table-wide comment list needs no join back through the store." },
    { "name": "body", "type": "text", "not_null": true,
      "description": "What was said." },
    { "name": "parent_comment_id", "type": "uuid",
      "description": "The comment this one replies to. Null is a top-level comment." },
    { "name": "anchor", "type": "jsonb", "not_null": true, "default": "'{}'::jsonb",
      "description": "Where on the record it was said: {} for the record, {\"field_key\": \"...\"} for one value. Notion's page-, block- and text-level comments are the same mechanism at three anchors, so this is a column and not three tables." },
    { "name": "resolved_at", "type": "timestamptz",
      "description": "When it was resolved. A resolved comment is still a comment and is still readable." },
    { "name": "resolved_by", "type": "uuid",
      "description": "Who resolved it." }
  ],
  "indexes": [
    { "columns": ["organization_id", "record_id", "created_at"], "method": "btree" },
    { "columns": ["organization_id", "table_id", "resolved_at"], "method": "btree" }
  ],
  "sharing": false,
  "is_listed": false,
  "taxonomy_node_id": "c5d29fbf-fd62-40dd-afd0-9cd96d4cca93",
  "category_label": "Custom Data"
}
$spec$::jsonb, 'runner');

-- ── the posture, restated for the three new relations ─────────────────────────
-- Twenty schemas carry ALTER DEFAULT PRIVILEGES rows that grant every NEW relation
-- automatically, so a new table in `custom` is granted by the default ACL unless this runs.
-- The provisioner already revokes immediately after CREATE TABLE; these are the belt to that
-- brace, and they name only schema `custom`.
revoke all on all tables in schema custom from public, anon, authenticated, service_role;
revoke all on all functions in schema custom from public, anon, authenticated, service_role;
