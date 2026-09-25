-- chair-step: inverse of migrations/campaign/sourcekey_a_record_store_tables_changes_are_record_events.sql (lane SOURCE-KEY). Restores the five store bodies that wrote and read `custom_record:<table id>`, drops the two key triggers and the four helpers, and moves any stored `record:<table id>` schedule or webhook key back to `custom_record:<table id>` so the restored bodies still find them.
-- lane: SOURCE-KEY
-- window-class: function bodies + DROP TRIGGER on scheduler.sch_trigger and files.webhooks (SHARE ROW EXCLUSIVE for this transaction).

-- based-on: custom.record_change_actions(uuid, uuid) 8ab40e5378aba3e57583bd2ec99b2ea9bea225929a47f204852e397a0ab204f8
-- based-on: custom.table_webhook_declare(uuid, uuid, text, text[], text) ccfa8bee0b67bbb8cb44a95a84c6d8d0ed2b1931b5b508907609f7fe6d422ed1
-- based-on: custom.table_webhooks(uuid, uuid) 67ab1a10310e1a718b2bc9fef425843b759406569ac443cbad6dccab8a169ade
-- based-on: custom.table_webhook_archive(uuid, uuid) e63820ec1ccf18d27908b976f5a38ab750f78db9cf9f5f1d9cf190b8f4ceb4f3
-- based-on: custom._record_events_to_activity() b886ddbf95c2216deb3c88e61dcb85eddfd27fd7fc45749685beee9479a68eef

set local lock_timeout = '2s';
set local statement_timeout = '120s';

DROP TRIGGER IF EXISTS _aa_record_source_key_is_record ON scheduler.sch_trigger;
DROP TRIGGER IF EXISTS _aa_record_source_key_is_record ON files.webhooks;

CREATE OR REPLACE FUNCTION custom.record_change_actions(p_organization_id uuid, p_table_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  perform custom.assert_store_door(p_organization_id, 'custom.record_change_actions');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.record_change_actions');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.record_change_actions');
  return jsonb_build_object(
    'entity_type', 'custom_record:' || p_table_id::text,
    'table_id', p_table_id,
    'actions', jsonb_build_array(
      jsonb_build_object('value', 'record.created',  'label', 'A row is added'),
      jsonb_build_object('value', 'record.updated',  'label', 'A row is changed'),
      jsonb_build_object('value', 'record.archived', 'label', 'A row is archived'),
      jsonb_build_object('value', 'record.restored', 'label', 'A row is restored')));
end
$function$

;

CREATE OR REPLACE FUNCTION custom.table_webhook_declare(p_organization_id uuid, p_table_id uuid, p_target_url text, p_events text[] DEFAULT NULL::text[], p_description text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
$function$

;

CREATE OR REPLACE FUNCTION custom.table_webhooks(p_organization_id uuid, p_table_id uuid)
 RETURNS TABLE(webhook_id uuid, target_url text, description text, events text[], is_active boolean, last_attempt_at timestamp with time zone, last_success_at timestamp with time zone, consecutive_failures integer, owner_id uuid, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
$function$

;

CREATE OR REPLACE FUNCTION custom.table_webhook_archive(p_organization_id uuid, p_webhook_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
$function$

;

CREATE OR REPLACE FUNCTION custom._record_events_to_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
           -- G8: the changed columns by KEY, the older store's `changed_fields` word, so the
           -- scheduler's `changed_fields` filter (scheduler.sch_match_event) reads both stores
           -- one way.
           'changed_fields',    coalesce((select jsonb_agg(f.data ->> 'key' order by f.data ->> 'key')
                                            from custom.record f
                                           where f.organization_id = n.organization_id
                                             and f.table_id = custom.field_kernel_id()
                                             and f.id::text in (select jsonb_array_elements_text(
                                                   case when jsonb_typeof(n.changed_field_ids) = 'array'
                                                        then n.changed_field_ids else '[]'::jsonb end))),
                                         '[]'::jsonb),
           'actor_tier',        n.actor ->> 'tier',
           'source',            'custom.io_outbox')
    from new_rows n
    left join custom.record r on r.organization_id = n.organization_id and r.id = n.record_id
    left join custom.record t on t.organization_id = n.organization_id and t.id = n.table_id
   where n.event_key = 'records.changed'
     and n.table_id is not null
     and (exists (select 1 from files.webhooks w
                   where w.is_active
                     and w.organization_id = n.organization_id
                     and ('custom_record:' || n.table_id::text) = any (w.resource_types))
          -- G8: ONE PATH FOR BOTH STORES. A schedule that runs an agent when a row changes
          -- (scheduler.sch_trigger type `event`) listens to the same activity spine the older
          -- store's workbench.udt_row_activity writes, and scheduler.sch_match_event fires it
          -- from there. A record-store table's changes now land on that spine whenever a live
          -- schedule listens for them, exactly as they do for a webhook.
          or exists (select 1 from scheduler.sch_trigger t
                      where t.type = 'event' and t.enabled and t.deleted_at is null
                        and t.organization_id = n.organization_id
                        and t.config ->> 'entity_type' = 'custom_record:' || n.table_id::text))
     -- The organization's own store switch (the guard this file names): a store that is off
     -- announces nothing, to a webhook or to a schedule.
     and platform.knob_resolve('custom', 'system_enabled', n.organization_id) is distinct from 'false'::jsonb;
  return null;
end
$function$

;

update scheduler.sch_trigger
   set config = jsonb_set(config, '{entity_type}', to_jsonb('custom_record:' || substr(config ->> 'entity_type', length('record:') + 1)))
 where config ->> 'entity_type' ~ '^record:[0-9a-fA-F-]{36}$';
update files.webhooks
   set resource_types = array(select case when r ~ '^record:[0-9a-fA-F-]{36}$' then 'custom_record:' || substr(r, length('record:') + 1) else r end
                                from unnest(resource_types) with ordinality u(r, i) order by i)
 where array_to_string(resource_types, ',') ~ '(^|,)record:[0-9a-fA-F-]{36}';

DROP FUNCTION IF EXISTS custom._record_source_key_is_record();
DROP FUNCTION IF EXISTS custom.record_source_table(text);
DROP FUNCTION IF EXISTS custom.record_source_keys(uuid);
DROP FUNCTION IF EXISTS custom.record_source_key(uuid);
