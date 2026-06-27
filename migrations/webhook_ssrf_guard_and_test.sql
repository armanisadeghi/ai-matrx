-- webhook_ssrf_guard_and_test.sql
--
-- (1) SSRF hardening: webhooks deliver via pg_net from the DB's network
--     position, so a user-supplied target_url pointing at localhost / RFC1918 /
--     link-local / cloud-metadata is a server-side request forgery vector.
--     Block unsafe URLs at create/update time AND skip them in the dispatcher.
--     (Residual: DNS-rebinding of a public name to a private IP can't be caught
--     in SQL — documented in features/files/webhooks/FEATURE.md.)
-- (2) `files.webhook_send_test(webhook_id)`: deliver a signed test ping to the
--     caller's own webhook on demand, so the UI has a one-click "is my endpoint
--     working?" button independent of any real event.
--
-- Idempotent.

-- 1. URL safety check.
create or replace function files.is_safe_webhook_url(p_url text)
returns boolean language plpgsql immutable as $fn$
declare h text;
begin
  if p_url is null or p_url !~* '^https://' then return false; end if;
  h := lower(substring(p_url from '^https://([^/:?#]+)'));
  if h is null or h = '' then return false; end if;
  if h in ('localhost','0.0.0.0','::1','[::1]','metadata.google.internal') then return false; end if;
  if h like '%.local' or h like '%.internal' or h like '%.localhost' then return false; end if;
  if h ~ '^127\.' or h ~ '^10\.' or h ~ '^192\.168\.' or h ~ '^169\.254\.'
     or h ~ '^172\.(1[6-9]|2[0-9]|3[01])\.' or h ~ '^0\.' then return false; end if;
  if h ~ '^\[' then return false; end if;  -- bare IPv6 literal — block conservatively
  return true;
end;
$fn$;

-- 2. Reject unsafe URLs at write time (loud).
create or replace function files.webhook_url_guard()
returns trigger language plpgsql as $fn$
begin
  if not files.is_safe_webhook_url(NEW.target_url) then
    raise exception 'Webhook target_url must be https and must not point at a private/internal/localhost address: %', NEW.target_url
      using errcode = 'check_violation';
  end if;
  return NEW;
end;
$fn$;

drop trigger if exists webhook_url_guard on files.webhooks;
create trigger webhook_url_guard before insert or update of target_url on files.webhooks
  for each row execute function files.webhook_url_guard();

-- 3. Dispatcher defense-in-depth: never POST to an unsafe URL even if a row
--    predates the guard.
create or replace function files.webhook_dispatch(p_limit int default 500)
returns int language plpgsql security definer set search_path = files, platform, extensions, public as $fn$
declare
  v_from bigint; v_to bigint; v_count int := 0;
  ev record; wh record; v_payload text; v_sig text; v_req bigint;
begin
  select last_activity_log_id into v_from from files.webhook_dispatch_state where id;
  select coalesce(max(id), v_from) into v_to from platform.activity_log;
  if v_to <= v_from then return 0; end if;

  for ev in
    select id, organization_id, entity_type, entity_id, action, actor_id, occurred_at, metadata
    from platform.activity_log
    where id > v_from and id <= v_to and actor_id is not null
    order by id limit p_limit
  loop
    for wh in
      select id, owner_id, target_url, secret from files.webhooks
      where is_active and owner_id = ev.actor_id
        and files.is_safe_webhook_url(target_url)
        and (event_types is null or ev.action = any(event_types))
        and (resource_types is null or ev.entity_type = any(resource_types))
    loop
      v_payload := jsonb_build_object(
        'event_id', ev.id, 'action', ev.action, 'entity_type', ev.entity_type,
        'entity_id', ev.entity_id, 'organization_id', ev.organization_id,
        'actor_id', ev.actor_id, 'occurred_at', ev.occurred_at,
        'metadata', ev.metadata, 'webhook_id', wh.id)::text;
      v_sig := files.webhook_sign(wh.secret, v_payload);
      insert into files.webhook_deliveries (webhook_id, activity_log_id, status, attempt, signature)
        values (wh.id, ev.id, 'pending', 1, v_sig)
        on conflict (webhook_id, activity_log_id) do nothing;
      if found then
        select net.http_post(
          url := wh.target_url, body := v_payload::jsonb,
          headers := jsonb_build_object(
            'Content-Type','application/json', 'X-Matrx-Event', ev.action,
            'X-Matrx-Signature','sha256=' || v_sig, 'X-Matrx-Webhook-Id', wh.id::text,
            'X-Matrx-Delivery-Event', ev.id::text)
        ) into v_req;
        update files.webhook_deliveries set net_request_id = v_req
          where webhook_id = wh.id and activity_log_id = ev.id;
        update files.webhooks set last_attempt_at = now() where id = wh.id;
        v_count := v_count + 1;
      end if;
    end loop;
  end loop;

  update files.webhook_dispatch_state set last_activity_log_id = v_to, updated_at = now() where id;
  return v_count;
end;
$fn$;

-- 4. One-click test delivery to the caller's OWN webhook (bypasses event
--    matching so it always hits the exact endpoint being tested).
create or replace function files.webhook_send_test(p_webhook_id uuid)
returns uuid language plpgsql security definer set search_path = files, extensions, public as $fn$
declare w record; v_payload text; v_sig text; v_req bigint; v_delivery uuid; v_uid uuid;
begin
  v_uid := (select auth.uid());
  select id, owner_id, target_url, secret into w from files.webhooks where id = p_webhook_id;
  if w.id is null then raise exception 'Webhook not found'; end if;
  if w.owner_id is distinct from v_uid then raise exception 'Not authorized for this webhook'; end if;
  if not files.is_safe_webhook_url(w.target_url) then
    raise exception 'Webhook target_url is not a safe https endpoint';
  end if;

  v_payload := jsonb_build_object(
    'action','webhook.test', 'webhook_id', w.id,
    'message','Test event from AI Matrx', 'occurred_at', now())::text;
  v_sig := files.webhook_sign(w.secret, v_payload);
  insert into files.webhook_deliveries (webhook_id, activity_log_id, status, attempt, signature)
    values (w.id, null, 'pending', 1, v_sig) returning id into v_delivery;
  select net.http_post(
    url := w.target_url, body := v_payload::jsonb,
    headers := jsonb_build_object(
      'Content-Type','application/json', 'X-Matrx-Event','webhook.test',
      'X-Matrx-Signature','sha256=' || v_sig, 'X-Matrx-Webhook-Id', w.id::text)
  ) into v_req;
  update files.webhook_deliveries set net_request_id = v_req where id = v_delivery;
  update files.webhooks set last_attempt_at = now() where id = w.id;
  return v_delivery;
end;
$fn$;

grant execute on function files.webhook_send_test(uuid) to authenticated;
