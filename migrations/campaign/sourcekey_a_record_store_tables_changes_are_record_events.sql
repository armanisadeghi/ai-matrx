-- chair-step: lane SOURCE-KEY, the coordinator's ruling of 2026-09-25 ("the store's token is `record`; `custom_record` is the dead tier-2 table and nothing new names it"). A record-store table's event-source key — what a webhook subscribes to (files.webhooks.resource_types) and a schedule listens for (scheduler.sch_trigger.config.entity_type), and what the row-change producer writes to platform.activity_log.entity_type — becomes `record:<table id>`, as ONE change. Step 1 of 2: the store WRITES only the new key, READS both, and turns an old client's `custom_record:<table id>` into the new key on the way in (announced by a NOTICE), so a schedule or webhook saved from an older screen still fires; any stored row is repaired and counted. Step 2 (sourcekey_the_old_key_is_refused.sql) refuses the old key once @ai-matrx/records with the new key is installed and live. Inverse: migrations/inverse/sourcekey_a_record_store_tables_changes_are_record_events_down.sql.
-- lane: SOURCE-KEY
-- window-class: function bodies + two BEFORE triggers (CREATE TRIGGER takes SHARE ROW EXCLUSIVE on scheduler.sch_trigger and files.webhooks for this transaction; both tables are small and written rarely). Applied directly per the owner's ruling of 2026-09-24 ~17:30 PT, under lock_timeout.
-- based-on: custom.record_change_actions(uuid, uuid) 331c7528b44c807cd95df3dcab3ca1a9c9d724c171c14d7c6c36b5e6bdf7d84d
-- based-on: custom.table_webhook_declare(uuid, uuid, text, text[], text) ee288f9e39110128695f51ddb1c649732060ad7a6d1e6b9ce5c2bc40ec035797
-- based-on: custom.table_webhooks(uuid, uuid) 420e55b45fa09813801bf40cd2453d227f94e7e5158f368ebdd5ea7c2066c620
-- based-on: custom.table_webhook_archive(uuid, uuid) 70dcae1a39af75aac0be33f522383cc4dfc351c09494288cc0ef710b4ac31b47
-- based-on: custom._record_events_to_activity() 9b41aaf060999459f4c3ab6aaddbf29339a451297598e12c11741764f813c7f3
--
-- WHY. The store's relations, cascades and context tag copies say `record`; the source key was the
-- one place the retired tier-2 word lived on in a live contract (PROGRESS-SC-4 census row 17).
-- Measured before this file on production: 0 schedules, 0 webhooks, 0 activity lines use it.
-- Suite: scripts/campaign-tests/sourcekey_a_row_change_is_a_record_event_red_green.sql.

set local lock_timeout = '30s';
set local statement_timeout = '120s';

-- ── the one key, and the one reader ──────────────────────────────────────────────────────────
-- The key a record-store table's changes carry. Every writer in the database goes through this.
CREATE OR REPLACE FUNCTION custom.record_source_key(p_table_id uuid)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog'
AS $function$ select 'record:' || p_table_id::text $function$;

-- Every key a stored row may still carry for this table during the one-release transition
-- (the new key first). Step 2 leaves this reading both; it is the WRITE that stops accepting.
CREATE OR REPLACE FUNCTION custom.record_source_keys(p_table_id uuid)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog'
AS $function$ select array['record:' || p_table_id::text, 'custom_record:' || p_table_id::text] $function$;

-- The table a source key names, whichever of the two prefixes it carries; NULL for any other key.
CREATE OR REPLACE FUNCTION custom.record_source_table(p_key text)
 RETURNS uuid
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog'
AS $function$
  select case
    when p_key ~ '^(record|custom_record):[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      then substr(p_key, strpos(p_key, ':') + 1)::uuid
  end
$function$;

-- Internal helpers: the definer doors and triggers call them; no client does.
REVOKE ALL ON FUNCTION custom.record_source_key(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION custom.record_source_keys(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION custom.record_source_table(text) FROM PUBLIC, anon, authenticated;

-- ── the door in: an old client's key becomes the new one, said out loud ──────────────────────
CREATE OR REPLACE FUNCTION custom._record_source_key_is_record()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_old text;
begin
  if tg_table_schema = 'scheduler' and tg_table_name = 'sch_trigger' then
    v_old := new.config ->> 'entity_type';
    if v_old like 'custom\_record:%' then
      new.config := jsonb_set(new.config, '{entity_type}', to_jsonb('record:' || substr(v_old, length('custom_record:') + 1)));
      raise notice 'This schedule named a record-store table''s changes by the retired key %; it is saved as % (lane SOURCE-KEY).',
        v_old, new.config ->> 'entity_type'
        using hint = 'Update @ai-matrx/records: its recordChangeTrigger writes record:<table id>. The old key will soon be refused.';
    end if;
  elsif tg_table_schema = 'files' and tg_table_name = 'webhooks' then
    if array_to_string(new.resource_types, ',') like '%custom\_record:%' then
      v_old := array_to_string(new.resource_types, ',');
      new.resource_types := array(
        select case when r like 'custom\_record:%' then 'record:' || substr(r, length('custom_record:') + 1) else r end
          from unnest(new.resource_types) with ordinality u(r, i) order by i);
      raise notice 'This webhook named a record-store table''s changes by the retired key (%); it is saved as % (lane SOURCE-KEY).',
        v_old, array_to_string(new.resource_types, ',')
        using hint = 'Use custom.table_webhook_declare, which writes record:<table id>. The old key will soon be refused.';
    end if;
  end if;
  return new;
end
$function$;
REVOKE ALL ON FUNCTION custom._record_source_key_is_record() FROM PUBLIC, anon, authenticated;

-- `_aa_` so it runs before every other BEFORE trigger on both tables (they fire by name).
CREATE TRIGGER _aa_record_source_key_is_record
  BEFORE INSERT OR UPDATE OF config ON scheduler.sch_trigger
  FOR EACH ROW WHEN ((new.config ->> 'entity_type') LIKE 'custom\_record:%')
  EXECUTE FUNCTION custom._record_source_key_is_record();
CREATE TRIGGER _aa_record_source_key_is_record
  BEFORE INSERT OR UPDATE OF resource_types ON files.webhooks
  FOR EACH ROW WHEN (array_to_string(new.resource_types, ',') LIKE '%custom\_record:%')
  EXECUTE FUNCTION custom._record_source_key_is_record();

-- ── the five store bodies: write the new key, read both ──────────────────────────────────────
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
    'entity_type', custom.record_source_key(p_table_id),
    'table_id', p_table_id,
    'actions', jsonb_build_array(
      jsonb_build_object('value', 'record.created',  'label', 'A row is added'),
      jsonb_build_object('value', 'record.updated',  'label', 'A row is changed'),
      jsonb_build_object('value', 'record.archived', 'label', 'A row is archived'),
      jsonb_build_object('value', 'record.restored', 'label', 'A row is restored')));
end
$function$;

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
     and w.resource_types && custom.record_source_keys(p_table_id);
  if v_live >= v_max then
    raise exception 'This table already sends to % webhooks, the most it may.', v_live
      using errcode = '54000', hint = 'Switch one off with custom.table_webhook_archive. The ceiling is the organization knob custom/table_webhooks_max. Nothing was created.';
  end if;

  insert into files.webhooks (owner_id, organization_id, target_url, secret, description, event_types, resource_types)
  values (v_me, p_organization_id, p_target_url, v_secret, nullif(btrim(p_description), ''),
          case when coalesce(cardinality(p_events), 0) = 0 then null else p_events end,
          array[custom.record_source_key(p_table_id)])
  returning id into v_id;

  return jsonb_build_object('webhook_id', v_id, 'table_id', p_table_id, 'target_url', p_target_url,
    'events', to_jsonb(coalesce(nullif(p_events, '{}'::text[]), c_events)),
    'secret', v_secret,
    'says', 'Every change to a record of this table is POSTed here within about a minute, signed: X-Matrx-Signature is sha256=HMAC-SHA256(secret, body). The secret is shown this once.');
end
$function$;

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
       and w.resource_types && custom.record_source_keys(p_table_id)
     order by w.is_active desc, w.created_at desc;
end
$function$;

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
  select custom.record_source_table(r) into v_table
    from files.webhooks w, unnest(w.resource_types) r
   where w.id = p_webhook_id and w.organization_id = p_organization_id
     and custom.record_source_table(r) is not null
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
$function$;

CREATE OR REPLACE FUNCTION custom._record_events_to_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  insert into platform.activity_log (organization_id, entity_type, entity_id, action, actor_id, metadata)
  select n.organization_id,
         custom.record_source_key(n.table_id),
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
                     and w.resource_types && custom.record_source_keys(n.table_id))
          -- G8: ONE PATH FOR BOTH STORES. A schedule that runs an agent when a row changes
          -- (scheduler.sch_trigger type `event`) listens to the same activity spine the older
          -- store's workbench.udt_row_activity writes, and scheduler.sch_match_event fires it
          -- from there. A record-store table's changes now land on that spine whenever a live
          -- schedule listens for them, exactly as they do for a webhook.
          or exists (select 1 from scheduler.sch_trigger t
                      where t.type = 'event' and t.enabled and t.deleted_at is null
                        and t.organization_id = n.organization_id
                        and t.config ->> 'entity_type' = any (custom.record_source_keys(n.table_id))))
     -- The organization's own store switch (the guard this file names): a store that is off
     -- announces nothing, to a webhook or to a schedule.
     and platform.knob_resolve('custom', 'system_enabled', n.organization_id) is distinct from 'false'::jsonb;
  return null;
end
$function$;

-- ── the audited repair: every stored old key moves to the new one, counted ───────────────────
do $repair$
declare
  v_triggers integer; v_webhooks integer; v_activity integer;
begin
  -- The BEFORE triggers above do the rewrite (and say so per row); touching the column is enough.
  update scheduler.sch_trigger set config = config where config ->> 'entity_type' like 'custom\_record:%';
  get diagnostics v_triggers = row_count;
  update files.webhooks set resource_types = resource_types where array_to_string(resource_types, ',') like '%custom\_record:%';
  get diagnostics v_webhooks = row_count;
  -- Activity lines are history and are never rewritten; the count says whether any exist.
  select count(*) into v_activity from platform.activity_log where entity_type like 'custom\_record:%';
  raise notice 'SOURCE-KEY repair: % schedule trigger(s) and % webhook(s) moved from custom_record:<table> to record:<table>; % historical activity line(s) carry the old key and are left as written.',
    v_triggers, v_webhooks, v_activity;
  if exists (select 1 from scheduler.sch_trigger where config ->> 'entity_type' like 'custom\_record:%')
     or exists (select 1 from files.webhooks where array_to_string(resource_types, ',') like '%custom\_record:%') then
    raise exception 'SOURCE-KEY repair left a custom_record: source key behind; nothing was applied.';
  end if;
end
$repair$;
