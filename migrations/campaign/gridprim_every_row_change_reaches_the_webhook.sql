-- target: branch,production
-- additive: yes
--   It ADDS one trigger function and one statement trigger on `custom.io_outbox` (an
--   unpartitioned table; `create trigger` takes SHARE ROW EXCLUSIVE on it alone and nothing from
--   the supautils set — not window-class, scripts/lib/ddl-lock-footprint.json), three doors
--   (`custom.table_webhook_declare`, `custom.table_webhooks`, `custom.table_webhook_archive`)
--   with their `platform.client_callable_door` rows, and one knob row
--   (`custom/table_webhooks_max`). Nothing existing is replaced, dropped or revoked; the
--   delivery itself is the platform's own `files.webhook_dispatch`, untouched. The inverse
--   (window-class: it drops the trigger) is
--   `migrations/inverse/gridprim_every_row_change_reaches_the_webhook_down.sql`.
-- guard: custom/system_enabled
-- lock: custom,platform
--
-- LANE GRID-PRIMITIVES, gap G4 — every row change is an event, out to a webhook (GRID-REBUILD.md).
--
-- ════════════════════════════════════════════════════════════════════════════════════════
-- MEASURED FIRST: A RECORD CHANGE REACHED NO WEBHOOK AT ALL
-- ════════════════════════════════════════════════════════════════════════════════════════
--
-- The platform's outbound webhooks (files.webhooks, files.webhook_dispatch every 30 seconds,
-- signed with X-Matrx-Signature, reconciled against pg_net's responses, retried, switched off
-- after repeated failures) deliver what `platform.activity_log` records: a webhook of an
-- organization (v2) receives every event of that organization whose entity_type is one of its
-- `resource_types`. The older grid's rows write that log (`workbench.udt_row_activity`,
-- migrations/udt_row_change_events.sql: row.created / updated / archived / restored).
-- The record store writes `custom.io_outbox` — the realtime port — and NOT the activity log,
-- so an add, a change, an archive or a restore on a custom record reached no webhook: zero
-- activity rows, zero deliveries (the RED half of scripts/campaign-tests/gridprim_g4_green.sql).
--
-- THE DOOR ADDED, reusing every part of the existing pattern:
--   · `custom._record_events_to_activity()` — AFTER INSERT on custom.io_outbox, per statement:
--     each records.changed line of a Table that has a live webhook becomes ONE activity row,
--     entity_type `custom_record:<table id>` (so a webhook subscribes to ONE table by naming it
--     in resource_types, with no change to the dispatcher), action record.created /
--     record.updated / record.archived / record.restored / record.purged, entity_id the record,
--     metadata the table, the version, the changed Field ids and the actor tier — never a
--     value: the receiver reads the record through the store with its own credentials.
--     Tables with no webhook write nothing: the log does not grow for tables nobody listens to.
--   · `custom.table_webhook_declare(org, table, url, events, description)` — admin on the Table;
--     an https URL files.is_safe_webhook_url accepts; returns the signing secret ONCE.
--   · `custom.table_webhooks(org, table)` — the list, never the secret.
--   · `custom.table_webhook_archive(org, webhook)` — switched off, never deleted (the deliveries
--     keep their history).

set local lock_timeout = '5s';
set local statement_timeout = '60s';

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, label, description,
   set_by, basis, review_due, overridable_by, override_direction, propagation, public_read, ui)
values
  ('custom', 'table_webhooks_max', '10'::jsonb, '10'::jsonb, 'integer',
   'Most webhooks one table may send to',
   'The ceiling on live webhooks subscribed to one Table''s record changes. Each change is delivered to every one of them, so the ceiling bounds the fan-out of a single edit.',
   'agent', 'Lane GRID-PRIMITIVES 2026-09-22: a practice or shop keeps one or two (a reminder service, an accounting sync); ten leaves room.',
   date '2026-12-22', '{organization}'::text[], 'any', 'next_load', false, '{}'::jsonb)
on conflict (feature, key) do nothing;

create function custom._record_events_to_activity()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
begin
  insert into platform.activity_log (organization_id, entity_type, entity_id, action, actor_id, metadata)
  select n.organization_id,
         'custom_record:' || n.table_id::text,
         n.record_id,
         'record.' || case
           when n.operation = 'updated' then 'updated'
           when n.operation = 'created' and coalesce(r.version, 1) > 1 then 'restored'
           when n.operation = 'created' then 'created'
           when n.operation = 'deleted' and r.id is null then 'purged'
           when n.operation = 'deleted' then 'archived'
           else n.operation end,
         nullif(n.actor ->> 'user_id', '')::uuid,
         jsonb_build_object(
           'table_id',          n.table_id,
           'table_name',        t.data ->> 'name',
           'record_id',         n.record_id,
           'version',           r.version,
           'changed_field_ids', n.changed_field_ids,
           'actor_tier',        n.actor ->> 'tier',
           'source',            'custom.io_outbox')
    from new_rows n
    left join custom.record r on r.organization_id = n.organization_id and r.id = n.record_id
    left join custom.record t on t.organization_id = n.organization_id and t.id = n.table_id
   where n.event_key = 'records.changed'
     and n.table_id is not null
     and exists (select 1 from files.webhooks w
                  where w.is_active
                    and w.organization_id = n.organization_id
                    and ('custom_record:' || n.table_id::text) = any (w.resource_types));
  return null;
end
$fn$;

comment on function custom._record_events_to_activity() is
  'GRID-PRIMITIVES G4: every records.changed line of a Table that has a live webhook becomes one platform.activity_log event (entity_type custom_record:<table id>, action record.created|updated|archived|restored|purged), which files.webhook_dispatch delivers. No values leave: table, record, version, changed Field ids, actor tier.';

create trigger zz_gridprim_record_events_s_i
  after insert on custom.io_outbox
  referencing new table as new_rows
  for each statement execute function custom._record_events_to_activity();

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- The doors.
-- ─────────────────────────────────────────────────────────────────────────────────────────

create function custom.table_webhook_declare(p_organization_id uuid, p_table_id uuid, p_target_url text,
                                             p_events text[] default null, p_description text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  c_events constant text[] := array['record.created', 'record.updated', 'record.archived', 'record.restored', 'record.purged'];
  v_me     uuid := custom.query_principal();
  v_bad    text[];
  v_max    integer;
  v_live   integer;
  v_secret text := encode(extensions.gen_random_bytes(32), 'hex');
  v_id     uuid;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.table_webhook_declare');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_webhook_declare');
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.table_webhook_declare',
                                          'admin'::public.permission_level, 'table');
  if v_me is null then
    raise exception 'A webhook belongs to the person who set it up, and nobody is signed in.'
      using errcode = '42501', hint = 'Sign in as an admin of this table. Nothing was created.';
  end if;
  if not exists (select 1 from custom.record t where t.organization_id = p_organization_id and t.id = p_table_id
                    and t.table_id = custom.table_kernel_id() and t.deleted_at is null) then
    raise exception 'That table is not in this organization.' using errcode = '23503';
  end if;
  if not coalesce(files.is_safe_webhook_url(p_target_url), false) then
    raise exception 'A webhook sends to a public https address, and "%" is not one.', coalesce(p_target_url, 'nothing')
      using errcode = '22023',
            hint = 'https only; never localhost, a private network or a cloud metadata address. Nothing was created.';
  end if;
  select array_agg(e) into v_bad from unnest(coalesce(p_events, '{}'::text[])) e where not (e = any (c_events));
  if v_bad is not null then
    raise exception 'A table''s webhook hears %, and % is not one of them.',
      array_to_string(c_events, ', '), array_to_string(v_bad, ', ')
      using errcode = '22023', hint = 'Leave events out to hear every change. Nothing was created.';
  end if;
  v_max := coalesce((platform.knob_resolve('custom', 'table_webhooks_max', p_organization_id) #>> '{}')::integer, 10);
  select count(*) into v_live from files.webhooks w
   where w.is_active and w.organization_id = p_organization_id
     and ('custom_record:' || p_table_id::text) = any (w.resource_types);
  if v_live >= v_max then
    raise exception 'This table already sends to % webhooks, the most it may.', v_live
      using errcode = '54000', hint = 'Switch one off with custom.table_webhook_archive. The ceiling is the organization knob custom/table_webhooks_max. Nothing was created.';
  end if;

  insert into files.webhooks (owner_id, organization_id, target_url, secret, description, event_types, resource_types)
  values (v_me, p_organization_id, p_target_url, v_secret, nullif(btrim(p_description), ''),
          case when coalesce(cardinality(p_events), 0) = 0 then null else p_events end,
          array['custom_record:' || p_table_id::text])
  returning id into v_id;

  return jsonb_build_object('webhook_id', v_id, 'table_id', p_table_id, 'target_url', p_target_url,
    'events', to_jsonb(coalesce(nullif(p_events, '{}'::text[]), c_events)),
    'secret', v_secret,
    'says', 'Every change to a record of this table is POSTed here within about a minute, signed: X-Matrx-Signature is sha256=HMAC-SHA256(secret, body). The secret is shown this once.');
end
$fn$;

comment on function custom.table_webhook_declare(uuid, uuid, text, text[], text) is
  'GRID-PRIMITIVES G4: send every change to this Table''s records (created, updated, archived, restored, purged) to an https webhook, delivered and signed by files.webhook_dispatch. Admin on the Table. Returns the signing secret once.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
values ('custom', 'table_webhook_declare',
        'p_organization_id uuid, p_table_id uuid, p_target_url text, p_events text[], p_description text',
        array['uuid'::regtype, 'uuid'::regtype, 'text'::regtype, 'text[]'::regtype, 'text'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_store_door and custom.assert_client_may_reach, p_table_id by custom.assert_client_may_change at admin on the Table, before anything is read or written. The webhook it writes is owned by the signed-in caller, scoped to this organization and this one Table, and sends only to an address files.is_safe_webhook_url accepts; what it later sends names records and Fields by id and carries no value.',
        'gridprim_every_row_change_reaches_the_webhook.sql', null, true, false,
        jsonb_build_object('version', 1,
          'declared_by', 'gridprim_every_row_change_reaches_the_webhook.sql',
          'declared_at', '2026-09-22 lane GRID-PRIMITIVES',
          'arguments', jsonb_build_object(
            'p_organization_id', jsonb_build_object('type', 'uuid', 'position', 1, 'entity', 'organization',
              'check', 'this body decides it with custom.assert_store_door(arg1), custom.assert_client_may_reach(arg1), custom.assert_client_may_change(arg1) — the organization wall — a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.',
              'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
              'verified', '2026-09-22 lane GRID-PRIMITIVES — written with this body'),
            'p_table_id', jsonb_build_object('type', 'uuid', 'position', 2, 'entity', 'custom_record',
              'check', 'this body decides it with custom.assert_client_may_change(arg2) at admin on the Table — the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.',
              'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
              'verified', '2026-09-22 lane GRID-PRIMITIVES — written with this body'))))
on conflict do nothing;

create function custom.table_webhooks(p_organization_id uuid, p_table_id uuid)
returns table(webhook_id uuid, target_url text, description text, events text[], is_active boolean,
              last_attempt_at timestamptz, last_success_at timestamptz, consecutive_failures integer,
              owner_id uuid, created_at timestamptz)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_webhooks');
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.table_webhooks',
                                          'admin'::public.permission_level, 'table');
  return query
    select w.id, w.target_url, w.description, w.event_types, w.is_active, w.last_attempt_at,
           w.last_success_at, w.consecutive_failures, w.owner_id, w.created_at
      from files.webhooks w
     where w.organization_id = p_organization_id
       and ('custom_record:' || p_table_id::text) = any (w.resource_types)
     order by w.is_active desc, w.created_at desc;
end
$fn$;

comment on function custom.table_webhooks(uuid, uuid) is
  'GRID-PRIMITIVES G4: the webhooks a Table sends its record changes to, live first, with their delivery health — never the secret. Admin on the Table.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
values ('custom', 'table_webhooks',
        'p_organization_id uuid, p_table_id uuid',
        array['uuid'::regtype, 'uuid'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_client_may_reach and p_table_id by custom.assert_client_may_change at admin on the Table before any webhook is read. Only this organization''s webhooks scoped to this Table are returned, and never their secret.',
        'gridprim_every_row_change_reaches_the_webhook.sql', null, true, false,
        jsonb_build_object('version', 1,
          'declared_by', 'gridprim_every_row_change_reaches_the_webhook.sql',
          'declared_at', '2026-09-22 lane GRID-PRIMITIVES',
          'arguments', jsonb_build_object(
            'p_organization_id', jsonb_build_object('type', 'uuid', 'position', 1, 'entity', 'organization',
              'check', 'this body decides it with custom.assert_client_may_reach(arg1), custom.assert_client_may_change(arg1) — the organization wall — a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.',
              'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
              'verified', '2026-09-22 lane GRID-PRIMITIVES — written with this body'),
            'p_table_id', jsonb_build_object('type', 'uuid', 'position', 2, 'entity', 'custom_record',
              'check', 'this body decides it with custom.assert_client_may_change(arg2) at admin on the Table — the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.',
              'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
              'verified', '2026-09-22 lane GRID-PRIMITIVES — written with this body'))))
on conflict do nothing;

create function custom.table_webhook_archive(p_organization_id uuid, p_webhook_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_table uuid;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.table_webhook_archive');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_webhook_archive');
  select nullif(substr(r, length('custom_record:') + 1), '')::uuid into v_table
    from files.webhooks w, unnest(w.resource_types) r
   where w.id = p_webhook_id and w.organization_id = p_organization_id and r like 'custom_record:%'
   limit 1;
  if v_table is null then
    raise exception 'There is no table webhook % here.', p_webhook_id
      using errcode = '23503', hint = 'It may belong to another organization. Nothing was changed.';
  end if;
  perform custom.assert_client_may_change(p_organization_id, v_table, 'custom.table_webhook_archive',
                                          'admin'::public.permission_level, 'table');
  update files.webhooks set is_active = false, updated_at = now()
   where id = p_webhook_id and organization_id = p_organization_id;
  return true;
end
$fn$;

comment on function custom.table_webhook_archive(uuid, uuid) is
  'GRID-PRIMITIVES G4: switch a Table''s webhook off. It is never deleted: its deliveries keep their history. Admin on the Table.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
values ('custom', 'table_webhook_archive',
        'p_organization_id uuid, p_webhook_id uuid',
        array['uuid'::regtype, 'uuid'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_store_door and custom.assert_client_may_reach first; p_webhook_id is read only inside this organization, and the Table it is scoped to is then asked custom.assert_client_may_change at admin before it is switched off. Another organization''s webhook answers exactly as an invented one. It deletes nothing.',
        'gridprim_every_row_change_reaches_the_webhook.sql', null, true, false,
        jsonb_build_object('version', 1,
          'declared_by', 'gridprim_every_row_change_reaches_the_webhook.sql',
          'declared_at', '2026-09-22 lane GRID-PRIMITIVES',
          'arguments', jsonb_build_object(
            'p_organization_id', jsonb_build_object('type', 'uuid', 'position', 1, 'entity', 'organization',
              'check', 'this body decides it with custom.assert_store_door(arg1), custom.assert_client_may_reach(arg1) — the organization wall — a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.',
              'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
              'verified', '2026-09-22 lane GRID-PRIMITIVES — written with this body'),
            'p_webhook_id', jsonb_build_object('type', 'uuid', 'position', 2, 'entity', 'webhook',
              'check', 'read only where organization_id = arg1, then its Table is asked custom.assert_client_may_change at admin; outside that it raises the same 23503 an invented id does.',
              'foreign', jsonb_build_object('sqlstate', '23503', 'same_as_invented', true),
              'verified', '2026-09-22 lane GRID-PRIMITIVES — written with this body'))))
on conflict do nothing;
