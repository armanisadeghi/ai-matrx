-- chair-step: this creates W3-DOC's two tables by CALLING platform.provision(spec) twice — a spec-driven builder, the shape §6b.2's additive allow-list refuses by name because it cannot read what the statement will execute. That refusal is correct and is not routed around; the sanctioned route for it is an attended step, with the same bytes rehearsed on the branch first.
--
-- W3-DOC — THE RENDERED DOCUMENT AND THE SEAL. `custom.doc_render` · `custom.doc_signature`.
--
-- THE TWO TABLES THIS LANE'S EXIT NAMES, AND THEIR NAMES ARE THESE.
--   custom.doc_render     — one rendered document: which template, which record, which
--                           TEMPLATE VERSION, the merged text and its content hash.
--   custom.doc_signature  — the seal: signer, time, document hash, document version.
--
-- WHY THEY ARE TABLES AND THE TEMPLATE IS NOT (REC-68 vs VAL-10)
-- --------------------------------------------------------------
-- REC-68 says a document TEMPLATE is a Record, and it is — `data_class = 'doc_template'` in
-- `custom.record` (`w3_doc_the_template_is_a_record.sql`). What a template is NOT is what
-- comes out of it. A rendered document is an ARTEFACT with a hash, and a signature is an
-- AUDIT ROW that must be unique per document version and immutable once written. VAL-10
-- requires "immutable once signed" and "carries its signer, its time, its hash and the
-- document version it signed": a unique constraint and a refusing trigger on a real table
-- say that, and a jsonb document inside a shared store cannot.
--
-- 🚨 WHY THIS IS A CHAIR STEP AND HEADER-LESS, MEASURED RATHER THAN ASSUMED.
-- Every business-shaped table is created THROUGH `platform.provision(spec)` — production's
-- event trigger `provision_shape_guard` refuses anything else with SQLSTATE 23514, and the
-- branch now carries the same guard. `select platform.provision(...)` is a statement in no
-- enumerated additive shape, so `pnpm db:apply --judge-only` returns
-- `"verdict":"refuse","code":"not-additive"` at both targets, exactly as it did for
-- `w1_prov_custom_record_via_the_door.sql` and `w1_tier_external_tier.sql` before it. The
-- allow-list's whole job is to read what a file will execute and a spec-driven builder is
-- unreadable to it; admitting it would mean the production allow-list could no longer see
-- the DDL it admits. So this file follows the same door those two went through.
--
-- WHAT THE SPECS SAY, AND WHY EACH ANSWER
-- ---------------------------------------
--   origin "standard"      Doctrine §1.2: a table AI Matrx ships. The tenant's templates are
--                          ROWS in `custom.record`; these two are ours.
--   access organization    A rendered document and its seal are the organization's own
--                          business facts, visible inside it by its access grants.
--   write_door "single"    DOOR-N-1. `authenticated` holds no direct INSERT, UPDATE or
--                          DELETE; the write paths are `custom.doc_render_document` and
--                          `custom.doc_sign`, which land in the next file with their doors.
--   custom_fields false    Neither table is a place a tenant adds fields: a render is an
--                          artefact of a template, and a seal is an audit row. A tenant's
--                          own fields belong on the RECORD the document was rendered from.
--   sharing false          Neither is shared directly; both are reached through the record.
--   one function each      `write_door = single` is REFUSED with an empty `functions[]`
--                          (`write_door.no_door_declared`, measured 2026-09-18), and it is
--                          right to be: a single write door that names no door is a
--                          sentence, not a mechanism. So each spec declares the ONE write
--                          path into its own table. The document LOGIC — the merge, the
--                          hash, the seal and the Value it writes on the record — is not in
--                          here: it is `w3_doc_the_render_path_and_the_signature_value.sql`,
--                          an ordinary judged additive file, because plpgsql inside a JSON
--                          string is unreadable and a chair reads this file before it runs.
--
-- THE INVERSE: `migrations/inverse/w3_doc_the_render_and_the_seal_down.sql`.

set lock_timeout = '2s';
set statement_timeout = '600s';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 0. CLOSE THE SCHEMA FIRST — a defect this lane FOUND and is required to close.
--
--    `platform.provision` refuses to write anything into a schema that
--    `platform.schema_client_exposure` declares CLOSED and that is not actually closed at
--    the end of the transaction, and schema `custom` is declared closed (`client_exposed =
--    false`, declared by `scripts/gate-corpus/branch-api.ts --unexpose`, 2026-09-17
--    18:17:46Z). MEASURED on the rehearsal branch 2026-09-18, before this file ran: **53 of
--    the 129 functions in schema `custom` still held client EXECUTE** — `anon`,
--    `authenticated` or `service_role` — `custom.assert_store_door` and `custom._store_door`
--    among them. Zero tables leaked, and `platform.client_callable_door` declares **no**
--    client-callable function in this schema at all (every `custom` row is
--    `signed_in_callers = false, anonymous_callers = false`), so all 53 are residue rather
--    than anybody's decision: PostgreSQL grants `EXECUTE` to `PUBLIC` by default on every new
--    function, and `alter default privileges … revoke all on functions` only binds objects
--    created afterwards by the role that set it.
--
--    That is §6.3 fact two — "REVOKE ALL … ON ALL FUNCTIONS IN SCHEMA custom" — silently
--    untrue on the rehearsal branch, which is the surface `V8-PROD` fact ⑤ will later be
--    proven against. It is a SECURITY REPAIR (rule 4's first exception) and the remedy below
--    is the one `platform.provision` itself prints in its own HINT. It is idempotent, it
--    takes nothing away from anybody who was meant to have it, and it runs BEFORE the two
--    provisions because the closed-schema assertion is evaluated at the end of each
--    `platform.provision` call.
-- ═══════════════════════════════════════════════════════════════════════════════

revoke all on schema custom from public, anon, authenticated, service_role;
revoke all on all tables in schema custom from public, anon, authenticated, service_role;
revoke all on all functions in schema custom from public, anon, authenticated, service_role;
revoke all on all sequences in schema custom from public, anon, authenticated, service_role;

alter default privileges in schema custom revoke all on tables from public, anon, authenticated, service_role;
alter default privileges in schema custom revoke all on functions from public, anon, authenticated, service_role;
alter default privileges in schema custom revoke all on sequences from public, anon, authenticated, service_role;

-- ── THE RENDERED DOCUMENT ──────────────────────────────────────────────────────
select platform.provision($provision_render$
{
  "schema": "custom",
  "table": "doc_render",
  "token": "doc_render",
  "label": "Rendered Document",
  "description": "REC-68: one document rendered from one document-template Record over one record, with the units and formats each Field carries. It stores the merged text and its SHA-256, because VAL-10's seal is over a document VERSION and a version nobody can recompute is not a version. W3-DOC.",
  "type": "entity",
  "origin": "standard",
  "access": {
    "data_class": "organization",
    "data_class_reason": "A proposal, contract or letter rendered from an organization's own records is that organization's own business document: visible inside the organization by its access grants, never to the world by default.",
    "default_list_scope": "organization",
    "visibility": "internal",
    "key_column": "created_by"
  },
  "fields": [
    {
      "name": "template_id",
      "type": "uuid",
      "not_null": true,
      "description": "The document-template Record this was rendered from. It is a custom.record id and deliberately NOT a foreign key: custom.record is hash partitioned on organization_id and its primary key is (organization_id, id), so a single-column FK cannot express it (REC-N-6)."
    },
    {
      "name": "record_id",
      "type": "uuid",
      "not_null": true,
      "description": "The record whose values were merged in. Same reason for no FK as template_id."
    },
    {
      "name": "table_id",
      "type": "uuid",
      "not_null": true,
      "description": "The Table the record belongs to, which is the Table whose Fields the template's tokens name. Stored rather than re-derived so a re-render reads the same field set the first render did."
    },
    {
      "name": "template_version",
      "type": "integer",
      "not_null": true,
      "description": "REC-68 / VAL-10: which version of the template produced this document. custom.doc_template_save raises it on every save, so a template whose body moved cannot silently re-point a sealed document at itself."
    },
    {
      "name": "body",
      "type": "text",
      "not_null": true,
      "description": "The merged document. Every token replaced by the record's own stored Value, formatted with the unit and format its Field carries; a token whose Value is absent renders empty rather than as itself, because a document that prints {{field:...}} to a client is the merge lying about what the record holds."
    },
    {
      "name": "content_hash",
      "type": "text",
      "not_null": true,
      "description": "SHA-256 of body, in hex. This is what a signature seals (VAL-10) and what custom.doc_signature_intact re-computes to tell a reader whether the record still says what the signed document says."
    },
    {
      "name": "rendered_at",
      "type": "timestamptz",
      "not_null": true,
      "default": "now()",
      "description": "When the merge ran. Distinct from created_at only in principle; kept because a document's own date is a fact a document may print."
    }
  ],
  "indexes": [
    { "columns": ["organization_id", "record_id"] },
    { "columns": ["organization_id", "template_id"] },
    { "columns": ["organization_id", "content_hash"] }
  ],
  "write_door": "single",
  "custom_fields": false,
  "sharing": false,
  "functions": [
    {
      "name": "doc_render_write",
      "args": "p_organization_id uuid, p_template_id uuid, p_record_id uuid, p_table_id uuid, p_template_version integer, p_body text, p_content_hash text",
      "returns": "uuid",
      "language": "plpgsql",
      "security": "definer",
      "search_path": "pg_catalog",
      "client_access": "server_only",
      "reason": "REC-68. The ONE write path into custom.doc_render. p_organization_id is the tenant and is the leading column of the row written and of every index on this table, so a caller cannot write one organization's document under another's key; null is refused with 22004. p_template_id, p_record_id and p_table_id are custom.record ids of that same organization - the merge that produced p_body already resolved all three through the store's own doors, which is where they are checked against the tenant; null on any is refused with 22004. p_template_version is the template's own version at the moment of the merge and must be 1 or more, refused with 22023 - a seal is over a document VERSION. p_body may be empty, which is a template with no tokens over a record with no values. p_content_hash must be 64 hex characters, refused with 22023, because VAL-10's seal is over a hash a reader can recompute.",
      "non_client_lane": "server_only: nothing client-side calls this. Schema custom is revoked from PUBLIC, anon, authenticated and service_role, is absent from pgrst.db_schemas, and the product switch custom/system_enabled resolves false. The document surface is W6-DOCS's and calls custom.doc_render_document server-side, which calls this; the client grant is switch-checklist work, never a lane's.",
      "arg_checks": {
        "p_organization_id": {
          "check": "the tenant the document belongs to; it is the leading column of the row and of every index on custom.doc_render.",
          "null_rule": "refused with SQLSTATE 22004"
        },
        "p_template_id": {
          "check": "a doc_template Record of that organization, already resolved by custom.doc_render_document through the store's own read.",
          "null_rule": "refused with SQLSTATE 22004"
        },
        "p_record_id": {
          "check": "a Record of that organization, already resolved by the merge.",
          "null_rule": "refused with SQLSTATE 22004"
        },
        "p_table_id": {
          "check": "the Table that record belongs to, which is the Table whose Fields the template's tokens name.",
          "null_rule": "refused with SQLSTATE 22004"
        },
        "p_template_version": {
          "check": "1 or more; it is the template's own version at the moment of the merge.",
          "null_rule": "refused with SQLSTATE 22023"
        },
        "p_body": {
          "check": "the merged text; no identity in it.",
          "null_rule": "null is coalesced to the empty string"
        },
        "p_content_hash": {
          "check": "64 lower-case hex characters - the SHA-256 of p_body.",
          "null_rule": "refused with SQLSTATE 22023"
        }
      },
      "body": "\ndeclare\n  v_id uuid;\nbegin\n  -- THE DOOR. One call to the ONE predicate (custom.assert_store_door), which judges\n  -- custom.caller_role() - the identity the caller actually held - and not current_user,\n  -- which a SECURITY DEFINER door has already rewritten to itself. It resolves the product\n  -- switch custom/system_enabled through platform.knob_resolve and refuses 42501 while it\n  -- is false for anyone but the role that owns custom.record.\n  perform custom.assert_store_door(p_organization_id, 'custom.doc_render_write');\n\n  if p_organization_id is null or p_template_id is null or p_record_id is null\n     or p_table_id is null then\n    raise exception 'custom.doc_render_write: organization_id, template, record and table are all required'\n      using errcode = '22004';\n  end if;\n  if p_template_version is null or p_template_version < 1 then\n    raise exception 'custom.doc_render_write: a rendered document names the template version it came from, and it is 1 or more'\n      using errcode = '22023',\n            hint = 'REC-68 / VAL-10: a seal is over a document VERSION.';\n  end if;\n  if coalesce(p_content_hash, '') !~ '^[0-9a-f]{64}$' then\n    raise exception 'custom.doc_render_write: a rendered document carries the SHA-256 of its own text, in hex'\n      using errcode = '22023',\n            hint = 'VAL-10: a version nobody can recompute is not a version. custom.doc_render_document computes it.';\n  end if;\n\n  insert into custom.doc_render\n    (organization_id, template_id, record_id, table_id, template_version, body, content_hash)\n  values\n    (p_organization_id, p_template_id, p_record_id, p_table_id, p_template_version,\n     coalesce(p_body, ''), p_content_hash)\n  returning id into v_id;\n  return v_id;\nend;\n"
    }
  ],
  "taxonomy_node_id": "c5d29fbf-fd62-40dd-afd0-9cd96d4cca93",
  "category_label": "Custom Data",
  "is_listed": false
}
$provision_render$);

-- ── THE SEAL ───────────────────────────────────────────────────────────────────
select platform.provision($provision_signature$
{
  "schema": "custom",
  "table": "doc_signature",
  "token": "doc_signature",
  "label": "Document Signature",
  "description": "VAL-10: a signature is a Value that is immutable once signed and carries its signer, its time, its hash and the document version it signed. The VALUE lives on the record, in the store's own value envelope, through the closed behaviour set (a text Field whose format is signature). THIS table is the audit trail that envelope cannot hold, because the envelope's key set is closed and this lane does not widen it: one row per sealed document version, unique on (organization_id, render_id), refusing every UPDATE and DELETE. W3-DOC.",
  "type": "entity",
  "origin": "standard",
  "access": {
    "data_class": "organization",
    "data_class_reason": "Who signed which document, when, and over what hash is the organization's own record of its own agreement: visible inside the organization by its access grants, never to the world.",
    "default_list_scope": "organization",
    "visibility": "internal",
    "key_column": "created_by"
  },
  "fields": [
    {
      "name": "render_id",
      "type": "uuid",
      "not_null": true,
      "description": "THE DOCUMENT VERSION that was signed - one row of custom.doc_render. The unique index on (organization_id, render_id) is what makes a second signature against the same document version impossible rather than merely discouraged (VAL-10). No FK, for REC-N-6's reason: custom.doc_render is provisioned with the same two-column identity the store uses."
    },
    {
      "name": "record_id",
      "type": "uuid",
      "not_null": true,
      "description": "The record the document was rendered from, so the seal can be found from the record without reading every render."
    },
    {
      "name": "field_key",
      "type": "text",
      "not_null": true,
      "description": "The key of the Field on that record whose Value IS this signature. VAL-10 says a signature is a Value; this names which one, so the audit row and the Value can never be two unrelated facts."
    },
    {
      "name": "signer_name",
      "type": "text",
      "not_null": true,
      "description": "Who signed, as they signed it - the typed name, which is the Value's own text. Never blank."
    },
    {
      "name": "signer_user_id",
      "type": "uuid",
      "description": "The account that signed, when there was one. Null is legal and means an outside signer with no account of ours (P1's external principal is W2-EXT's, not this lane's); signer_name is required in both cases, so a seal always names somebody."
    },
    {
      "name": "signed_at",
      "type": "timestamptz",
      "not_null": true,
      "default": "now()",
      "description": "VAL-10: its time. Written by the door from the database clock, never from a caller."
    },
    {
      "name": "document_hash",
      "type": "text",
      "not_null": true,
      "description": "VAL-10: its hash. Copied from the render at signing and never recomputed, so a later edit to the record changes what a fresh render hashes to and leaves this alone - which is exactly how the seal is broken visibly rather than silently."
    },
    {
      "name": "document_version",
      "type": "integer",
      "not_null": true,
      "description": "VAL-10: the document version it signed - the render's template_version."
    }
  ],
  "indexes": [
    { "columns": ["organization_id", "render_id"], "unique": true },
    { "columns": ["organization_id", "record_id"] }
  ],
  "write_door": "single",
  "custom_fields": false,
  "sharing": false,
  "functions": [
    {
      "name": "doc_signature_write",
      "args": "p_organization_id uuid, p_render_id uuid, p_record_id uuid, p_field_key text, p_signer_name text, p_signer_user_id uuid, p_document_hash text, p_document_version integer",
      "returns": "uuid",
      "language": "plpgsql",
      "security": "definer",
      "search_path": "pg_catalog",
      "client_access": "server_only",
      "reason": "VAL-10. The ONE write path into custom.doc_signature. p_organization_id is the tenant and is the leading column of the row, of the unique index that makes a second seal impossible, and of the lookup that refuses one by name; null is refused with 22004. p_render_id is the document version being sealed and is unique per organization in this table - a second write against the same one is refused with 23505 naming who already signed and when; null is refused with 22004. p_record_id is the record the document was rendered from; null is refused with 22004. p_field_key names the Field on that record whose Value this signature is - blank is refused with 23514, because VAL-10 says a signature IS a Value and a seal that names no Value is an orphan. p_signer_name is required and blank is refused with 23514, so a seal always names somebody. p_signer_user_id is null for an outside signer with no account of ours, which is legal. p_document_hash must be 64 hex characters, refused with 22023. p_document_version is the render's template_version.",
      "non_client_lane": "server_only: nothing client-side calls this. Schema custom is revoked from PUBLIC, anon, authenticated and service_role, is absent from pgrst.db_schemas, and the product switch custom/system_enabled resolves false. The signing surface is W6-DOCS's and calls custom.doc_sign server-side, which calls this; the client grant is switch-checklist work, never a lane's.",
      "arg_checks": {
        "p_organization_id": {
          "check": "the tenant; leading column of the row, of the unique index and of the prior-signature lookup.",
          "null_rule": "refused with SQLSTATE 22004"
        },
        "p_render_id": {
          "check": "one row of custom.doc_render in that organization; unique here, so a document version is sealed once.",
          "null_rule": "refused with SQLSTATE 22004"
        },
        "p_record_id": {
          "check": "the record the document was rendered from.",
          "null_rule": "refused with SQLSTATE 22004"
        },
        "p_field_key": {
          "check": "the key of the Field on that record whose Value is this signature.",
          "null_rule": "blank or null refused with SQLSTATE 23514"
        },
        "p_signer_name": {
          "check": "who signed, as they signed it.",
          "null_rule": "blank or null refused with SQLSTATE 23514"
        },
        "p_signer_user_id": {
          "check": "the account that signed, when there was one.",
          "null_rule": "null is legal and means an outside signer with no account of ours"
        },
        "p_document_hash": {
          "check": "64 lower-case hex characters - the render's own content_hash.",
          "null_rule": "refused with SQLSTATE 22023"
        },
        "p_document_version": {
          "check": "the render's template_version.",
          "null_rule": "the column is NOT NULL and refuses it"
        }
      },
      "body": "\ndeclare\n  v_id     uuid;\n  v_prior  record;\nbegin\n  -- THE DOOR. The same one call to the same one predicate, for the same reason.\n  perform custom.assert_store_door(p_organization_id, 'custom.doc_signature_write');\n\n  if p_organization_id is null or p_render_id is null or p_record_id is null then\n    raise exception 'custom.doc_signature_write: organization_id, the document version and the record are all required'\n      using errcode = '22004';\n  end if;\n  if coalesce(btrim(p_signer_name), '') = '' then\n    raise exception 'a signature has to name who signed'\n      using errcode = '23514', hint = 'VAL-10: its signer.';\n  end if;\n  if coalesce(btrim(p_field_key), '') = '' then\n    raise exception 'a signature has to say which value on the record it is'\n      using errcode = '23514',\n            hint = 'VAL-10: a signature IS a Value. field_key names the Field whose Value this seal belongs to.';\n  end if;\n  if coalesce(p_document_hash, '') !~ '^[0-9a-f]{64}$' then\n    raise exception 'a signature seals the document''s SHA-256, and this is not one'\n      using errcode = '22023', hint = 'VAL-10: its hash.';\n  end if;\n\n  -- VAL-10, WRITTEN ONCE. A second write against the SAME DOCUMENT VERSION is refused BY\n  -- NAME, and it says who already signed it and when rather than quoting a constraint. The\n  -- unique index on (organization_id, render_id) is what makes it impossible rather than\n  -- merely checked; this refusal is what makes it legible.\n  select s.signer_name, s.signed_at into v_prior\n    from custom.doc_signature s\n   where s.organization_id = p_organization_id and s.render_id = p_render_id\n     and s.deleted_at is null;\n  if v_prior.signer_name is not null then\n    raise exception 'this document version was already signed by % on %, so it cannot be signed again',\n                    v_prior.signer_name, to_char(v_prior.signed_at, 'FMDD Month YYYY \"at\" HH24:MI')\n      using errcode = '23505',\n            hint = 'VAL-10: a signature is written once and is immutable once signed. To have somebody sign again, render the document again - custom.doc_render_document gives a new document version, and a signature on THAT version is a new seal rather than a rewriting of this one.';\n  end if;\n\n  insert into custom.doc_signature\n    (organization_id, render_id, record_id, field_key, signer_name, signer_user_id,\n     signed_at, document_hash, document_version)\n  values\n    (p_organization_id, p_render_id, p_record_id, btrim(p_field_key), btrim(p_signer_name),\n     p_signer_user_id, now(), p_document_hash, p_document_version)\n  returning id into v_id;\n  return v_id;\nend;\n"
    }
  ],
  "taxonomy_node_id": "c5d29fbf-fd62-40dd-afd0-9cd96d4cca93",
  "category_label": "Custom Data",
  "is_listed": false
}
$provision_signature$);
