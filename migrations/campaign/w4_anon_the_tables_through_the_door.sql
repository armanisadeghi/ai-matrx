-- chair-step: creates W4-ANON's six tables by CALLING platform.provision(spec) — a spec-driven builder, which the allow-list refuses because it cannot read what the statement will execute; the standing ruling of 2026-09-18 is that every business-shaped table goes through the provisioner door, and the sanctioned route for that shape is a terminal-confirmed step
--
-- W4-ANON — THE SIX TABLES OF THE CAMPAIGN'S ONLY UNAUTHENTICATED SURFACE.
--
-- DOOR-17 (anonymous write door) · DOOR-19 (inbound address) · DOOR-20 (embed token) ·
-- DOOR-21 (offline capture queue).
--
-- READ THIS PARAGRAPH BEFORE THE SPECS. Everything else in this campaign is reached by a
-- signed-in principal whose identity the platform minted. This lane is the one place where the
-- writer has no account, so every default here is the CLOSED one and every opening is an
-- explicit act somebody performed. Nothing in this file grants `anon` anything: schema `custom`
-- is declared closed, holds no client grant, and is absent from `pgrst.db_schemas`. The
-- anonymous door is reached by the SERVER, which is the thing holding the token — that is what
-- "token-scoped" means, and it is why widening `anon`'s reach is not part of this lane at all.
--
-- WHY SIX TABLES AND NOT ONE WITH A `kind` COLUMN
-- ------------------------------------------------
--   `custom.anon_form`       DOOR-17. The published surface: which Table it writes into, and
--                            WHICH FIELD KEYS it exposes. `published_at` is null until an
--                            explicit publish act sets it, so a form that exists is not a form
--                            that accepts writes. Typeform's model exactly: the form exists in
--                            the workspace long before anyone can answer it.
--   `custom.anon_token`      DOOR-20. One token, one form, one mode (`read` or `write`) and one
--                            origin list. The SECRET IS NEVER STORED — `secret_hash` holds a
--                            digest, so a database read cannot mint a working token. Revoking
--                            is a timestamp, not a delete, because "when was this revoked and
--                            by whom" is the first question after an incident.
--   `custom.anon_submission` DOOR-17. The QUARANTINE. An anonymous write lands HERE, not in
--                            `custom.record`, and stays invisible to every read until a Rule
--                            clears it. `record_id` is null until that happens, and it is the
--                            only evidence that a submission became a record.
--   `custom.anon_hit`        DOOR-17. The rate limit, as ROWS. A counter in memory is per
--                            process and this server runs many; a counter in a column is a
--                            write-write conflict per request. One row per (token, window) with
--                            a unique index is neither, and it is auditable afterwards.
--   `custom.anon_inbound`    DOOR-19. One inbound address per Table: email, webhook or scrape.
--                            The ORIGINATING PAYLOAD is kept on the submission, because
--                            HubSpot's forwarding address is only useful because the message
--                            is still there when somebody asks why the record says what it says.
--   `custom.anon_replay`     DOOR-21. The idempotency ledger for offline capture: one row per
--                            client-minted id, with a unique index. A client that replays the
--                            same three writes thirty times produces three rows, and the
--                            CONSTRAINT is why — not the client's good behaviour.
--
-- THE INVERSE: `migrations/inverse/w4_anon_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '600s';

-- Close schema `custom` before provisioning: the provisioner refuses to build into a schema
-- that holds client grants, and twenty schemas' ALTER DEFAULT PRIVILEGES rows re-open it every
-- time a sibling lane lands a function. Restores the declared posture; names nothing else.
revoke all on schema custom from public, anon, authenticated, service_role;
revoke all on all tables in schema custom from public, anon, authenticated, service_role;
revoke all on all functions in schema custom from public, anon, authenticated, service_role;
revoke all on all sequences in schema custom from public, anon, authenticated, service_role;

select platform.provision($spec$
{
  "schema": "custom", "table": "anon_form", "token": "anon_form",
  "label": "Public form", "type": "entity", "origin": "standard",
  "description": "DOOR-17: a Table's public face. Names the Table it writes into and the EXACT field keys it exposes; published_at is null until an explicit publish act, so a form that exists is not a form that accepts writes.",
  "access": { "data_class": "organization",
              "data_class_reason": "A form belongs to the organization whose Table it writes into, and its exposed field list is that organization's own vocabulary.",
              "default_list_scope": "organization", "visibility": "internal", "key_column": "created_by" },
  "fields": [
    { "name": "table_id", "type": "uuid", "not_null": true, "description": "The Table a submission becomes a record in." },
    { "name": "slug", "type": "text", "not_null": true, "description": "The form's public name in a URL. Unique per organization." },
    { "name": "title", "type": "text", "description": "What the form calls itself on screen." },
    { "name": "exposed_field_keys", "type": "jsonb", "not_null": true, "default": "'[]'::jsonb",
      "description": "DOOR-17: the ONLY field keys an anonymous write may set. A key outside this list is refused by name — the token is scoped to the form and the form is scoped to these keys, so a submission can never reach a field the form does not show." },
    { "name": "required_field_keys", "type": "jsonb", "not_null": true, "default": "'[]'::jsonb",
      "description": "Keys a submission must carry. Refused on the screen with its own name, never as a generic validation error." },
    { "name": "published_at", "type": "timestamptz",
      "description": "DOOR-17: CLOSED BY DEFAULT. Null means this form takes no writes at all. Only custom.anon_publish sets it, and it records who." },
    { "name": "published_by", "type": "uuid", "description": "Who performed the publish act." },
    { "name": "closed_at", "type": "timestamptz", "description": "When it was closed again. A closed form keeps its submissions." },
    { "name": "rate_limit_per_window", "type": "integer", "not_null": true, "default": "20",
      "description": "Writes one token may make per window. A knob with a starting value, never a constant in code." },
    { "name": "rate_limit_window", "type": "interval", "not_null": true, "default": "'1 hour'::interval",
      "description": "The window the limit counts over." },
    { "name": "quarantine_rule_id", "type": "uuid",
      "description": "The Rule that clears a submission into a record. Null means every submission waits for a person." }
  ],
  "indexes": [ { "columns": ["organization_id", "slug"], "method": "btree", "unique": true },
               { "columns": ["organization_id", "table_id"], "method": "btree" } ],
  "sharing": false, "is_listed": false,
  "taxonomy_node_id": "c5d29fbf-fd62-40dd-afd0-9cd96d4cca93", "category_label": "Custom Data"
}
$spec$::jsonb, 'runner');

select platform.provision($spec$
{
  "schema": "custom", "table": "anon_token", "token": "anon_token",
  "label": "Embed token", "type": "entity", "origin": "standard",
  "description": "DOOR-20: an origin-restricted token carrying READ or WRITE and nothing else. The secret itself is never stored — secret_hash holds a digest — so reading this table cannot mint a working token. Revocation is a timestamp, because 'when, and by whom' is the first question after an incident.",
  "access": { "data_class": "organization",
              "data_class_reason": "A token is issued by one organization against one of its own forms or views and is that organization's credential.",
              "default_list_scope": "organization", "visibility": "internal", "key_column": "created_by" },
  "fields": [
    { "name": "form_id", "type": "uuid", "description": "The form this token may write to. Null for a read token bound to a view." },
    { "name": "saved_view_id", "type": "uuid", "description": "The view this token may read. Null for a write token." },
    { "name": "record_id", "type": "uuid", "description": "A single record this token may read, when the embed is one record rather than a view." },
    { "name": "mode", "type": "text", "not_null": true, "default": "'read'::text",
      "description": "read or write. NOT both: an embed that could do either would be one credential carrying two decisions, and the second one is always the one nobody meant to grant." },
    { "name": "secret_hash", "type": "text", "not_null": true,
      "description": "sha256 of the token secret. The secret is returned ONCE, at issue, and never again." },
    { "name": "allowed_origins", "type": "jsonb", "not_null": true, "default": "'[]'::jsonb",
      "description": "DOOR-20: the exact origins this token works from, scheme and host and port. Empty means NO origin — a token that works everywhere is a token that works from an attacker's page." },
    { "name": "expires_at", "type": "timestamptz", "description": "When it stops working on its own." },
    { "name": "revoked_at", "type": "timestamptz", "description": "When it was revoked. Kept, never deleted." },
    { "name": "revoked_by", "type": "uuid", "description": "Who revoked it." },
    { "name": "last_used_at", "type": "timestamptz", "description": "So a token nobody uses can be found and retired." }
  ],
  "indexes": [ { "columns": ["organization_id", "secret_hash"], "method": "btree", "unique": true },
               { "columns": ["organization_id", "form_id"], "method": "btree" } ],
  "sharing": false, "is_listed": false,
  "taxonomy_node_id": "c5d29fbf-fd62-40dd-afd0-9cd96d4cca93", "category_label": "Custom Data"
}
$spec$::jsonb, 'runner');

select platform.provision($spec$
{
  "schema": "custom", "table": "anon_submission", "token": "anon_submission",
  "label": "Quarantined submission", "type": "entity", "origin": "standard",
  "description": "DOOR-17 / DOOR-19: where an anonymous write actually lands. It is NOT a record and no read door can see it as one; record_id is null until a Rule clears it, and that column is the only evidence a submission ever became a record. The originating payload is kept, because the first question about a record made from an email is what the email said.",
  "access": { "data_class": "organization",
              "data_class_reason": "A submission is addressed to one organization's form or inbound address and is that organization's to triage; nobody outside it may read it, cleared or not.",
              "default_list_scope": "organization", "visibility": "internal", "key_column": "created_by" },
  "fields": [
    { "name": "form_id", "type": "uuid", "description": "The form it arrived through, when it arrived through one." },
    { "name": "inbound_id", "type": "uuid", "description": "The inbound address it arrived through, when it arrived that way." },
    { "name": "table_id", "type": "uuid", "not_null": true, "description": "The Table it would become a record in." },
    { "name": "source", "type": "text", "not_null": true, "default": "'anonymous'::text",
      "description": "DOOR-17 / DOOR-19: STAMPED, never inferred. anonymous, email, webhook, scrape, offline. A record made from this carries it, so 'where did this come from' is answerable forever." },
    { "name": "payload", "type": "jsonb", "not_null": true, "default": "'{}'::jsonb",
      "description": "The field values as submitted, already narrowed to the form's exposed keys by the door." },
    { "name": "raw_payload", "type": "jsonb", "not_null": true, "default": "'{}'::jsonb",
      "description": "DOOR-19: the originating message, header and body, exactly as it arrived. Kept so the record can always be traced back to what was actually said." },
    { "name": "client_key", "type": "text",
      "description": "DOOR-21: the client-minted idempotency key, when the submission came from an offline client." },
    { "name": "state", "type": "text", "not_null": true, "default": "'quarantined'::text",
      "description": "quarantined, cleared or rejected. Quarantined is the default and the only state a submission can be born in." },
    { "name": "record_id", "type": "uuid", "description": "The record it became. Null while quarantined — this column IS the quarantine." },
    { "name": "cleared_at", "type": "timestamptz", "description": "When a Rule or a person cleared it." },
    { "name": "cleared_by_rule_id", "type": "uuid", "description": "Which Rule cleared it. Null means a person did." },
    { "name": "rejection_reason", "type": "text", "description": "Why it was rejected, in words, so the sender can be told something true." },
    { "name": "remote_origin", "type": "text", "description": "The origin the write came from, kept for the rate limit's audit and for the origin refusal." }
  ],
  "indexes": [ { "columns": ["organization_id", "state", "created_at"], "method": "btree" },
               { "columns": ["organization_id", "form_id", "client_key"], "method": "btree", "unique": true },
               { "columns": ["organization_id", "table_id"], "method": "btree" } ],
  "sharing": false, "is_listed": false,
  "taxonomy_node_id": "c5d29fbf-fd62-40dd-afd0-9cd96d4cca93", "category_label": "Custom Data"
}
$spec$::jsonb, 'runner');

select platform.provision($spec$
{
  "schema": "custom", "table": "anon_hit", "token": "anon_hit",
  "label": "Anonymous rate window", "type": "entity", "origin": "standard",
  "description": "DOOR-17: the rate limit, as rows. One row per (token, window start) with a unique index, so the count is atomic under concurrency and auditable afterwards. A counter in process memory is per process and this server runs many; a counter in a column is a write-write conflict per request.",
  "access": { "data_class": "organization",
              "data_class_reason": "A rate window belongs to the organization whose form is being written to and is its operational data.",
              "default_list_scope": "organization", "visibility": "internal", "key_column": "created_by" },
  "fields": [
    { "name": "token_id", "type": "uuid", "description": "The token being counted. Null when the bucket is the form itself." },
    { "name": "form_id", "type": "uuid", "not_null": true, "description": "The form the window belongs to." },
    { "name": "bucket", "type": "text", "not_null": true, "description": "What is being counted: the token id, or a coarse client identifier when there is no token." },
    { "name": "window_start", "type": "timestamptz", "not_null": true, "description": "Start of the window this row counts." },
    { "name": "hits", "type": "integer", "not_null": true, "default": "0", "description": "Writes accepted in this window." }
  ],
  "indexes": [ { "columns": ["organization_id", "form_id", "bucket", "window_start"], "method": "btree", "unique": true } ],
  "sharing": false, "is_listed": false,
  "taxonomy_node_id": "c5d29fbf-fd62-40dd-afd0-9cd96d4cca93", "category_label": "Custom Data"
}
$spec$::jsonb, 'runner');

select platform.provision($spec$
{
  "schema": "custom", "table": "anon_inbound", "token": "anon_inbound",
  "label": "Inbound address", "type": "entity", "origin": "standard",
  "description": "DOOR-19: one inbound address per Table — email, webhook or scrape — that lands a record with its source stamped. The address is a secret token in a hostname or a path, so knowing it is what authorises the write; that is why it is hashed here and why rotating it is a column rather than a new row.",
  "access": { "data_class": "organization",
              "data_class_reason": "An inbound address is issued to one organization for one of its Tables and is that organization's credential.",
              "default_list_scope": "organization", "visibility": "internal", "key_column": "created_by" },
  "fields": [
    { "name": "table_id", "type": "uuid", "not_null": true, "description": "The Table an arriving message becomes a record in." },
    { "name": "form_id", "type": "uuid", "description": "The form whose exposed-key list narrows what an arriving message may set. Null means the Table's own Fields." },
    { "name": "channel", "type": "text", "not_null": true, "default": "'webhook'::text",
      "description": "email, webhook or scrape. The transport differs; everything after the parse does not." },
    { "name": "address", "type": "text", "not_null": true,
      "description": "The public part: the local-part of the mailbox, or the path segment of the webhook URL." },
    { "name": "secret_hash", "type": "text",
      "description": "sha256 of the shared secret a webhook must present. Null for an email address, where the address IS the secret." },
    { "name": "source", "type": "text", "not_null": true, "default": "'webhook'::text",
      "description": "What gets stamped on every submission arriving here." },
    { "name": "disabled_at", "type": "timestamptz", "description": "When it stopped accepting. Kept so the history of what arrived stays readable." },
    { "name": "last_received_at", "type": "timestamptz", "description": "So an address that has gone quiet is findable." }
  ],
  "indexes": [ { "columns": ["organization_id", "address"], "method": "btree", "unique": true },
               { "columns": ["organization_id", "table_id"], "method": "btree" } ],
  "sharing": false, "is_listed": false,
  "taxonomy_node_id": "c5d29fbf-fd62-40dd-afd0-9cd96d4cca93", "category_label": "Custom Data"
}
$spec$::jsonb, 'runner');

select platform.provision($spec$
{
  "schema": "custom", "table": "anon_replay", "token": "anon_replay",
  "label": "Offline capture ledger", "type": "entity", "origin": "standard",
  "description": "DOOR-21: one row per client-minted id, with a UNIQUE index. A client that captures offline mints its own ids and replays its writes on reconnect; the unique index is what makes three replays of two writes produce two records — the constraint, not the client's good behaviour.",
  "access": { "data_class": "organization",
              "data_class_reason": "A capture ledger entry records one organization's own deferred write and names the device that made it.",
              "default_list_scope": "organization", "visibility": "internal", "key_column": "created_by" },
  "fields": [
    { "name": "client_key", "type": "text", "not_null": true,
      "description": "The id the CLIENT minted, offline, before the server ever saw the write. This is the whole mechanism: the server does not assign it, so a reconnect cannot produce a second one." },
    { "name": "table_id", "type": "uuid", "not_null": true, "description": "The Table the deferred write is for." },
    { "name": "record_id", "type": "uuid", "description": "The record the first replay produced. Every later replay reads this and writes nothing." },
    { "name": "submission_id", "type": "uuid", "description": "The quarantined submission, when the capture came through the anonymous door." },
    { "name": "device", "type": "text", "description": "Which client minted it, so two devices capturing the same thing stay two captures." },
    { "name": "captured_at", "type": "timestamptz", "description": "When the CLIENT captured it, which is not when the server heard about it." },
    { "name": "replays", "type": "integer", "not_null": true, "default": "0",
      "description": "How many times this key was offered after the first. Counted rather than ignored, so a client stuck in a replay loop is visible instead of merely harmless." }
  ],
  "indexes": [ { "columns": ["organization_id", "client_key"], "method": "btree", "unique": true },
               { "columns": ["organization_id", "table_id", "captured_at"], "method": "btree" } ],
  "sharing": false, "is_listed": false,
  "taxonomy_node_id": "c5d29fbf-fd62-40dd-afd0-9cd96d4cca93", "category_label": "Custom Data"
}
$spec$::jsonb, 'runner');

-- The posture again, because the provisioner created six relations since the block at the top.
revoke all on all tables in schema custom from public, anon, authenticated, service_role;
revoke all on all functions in schema custom from public, anon, authenticated, service_role;
revoke all on all sequences in schema custom from public, anon, authenticated, service_role;
