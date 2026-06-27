-- webhook_hardening.sql
--
-- Adversarial-review fixes for the webhook + event spine (all verified live):
--   #2 dead retry        — failed deliveries were never re-sent. Now reconcile
--                          re-posts eligible failures (backoff, max 6 attempts).
--   #3 watermark race    — a long txn committing after MAX(id) advanced was
--                          skipped. Now dispatch lags 5s on occurred_at so rows
--                          are committed before the watermark passes them.
--   #4 pg_net GC strand  — a pending delivery whose response was GC'd stuck
--                          forever. Now timed out → failed → retried.
--   #5 webhook_sign      — pinned search_path; STABLE not IMMUTABLE.
--   #6 sign==send bytes  — sign the exact jsonb that pg_net serializes (one
--                          jsonb var; no text/jsonb round-trip ambiguity).
--   #7 actor forgery     — revoke EXECUTE on platform.log_activity from
--                          authenticated/anon (only SECURITY DEFINER triggers
--                          need it); a direct call could forge actor_id/org.
--   #9 system-org SPOF   — stamp_run_org raises clearly if no system org.
--
-- Idempotent.

-- #7 — only triggers (run as definer) may write the activity ledger.
revoke execute on function platform.log_activity(uuid, text, text, uuid, jsonb) from authenticated, anon, public;
revoke execute on function platform.log_activity(uuid, text, text, uuid, jsonb, uuid) from authenticated, anon, public;

-- #5 — sign helper.
create or replace function files.webhook_sign(p_secret text, p_payload text)
returns text language sql stable set search_path = extensions, public as $fn$
  select encode(hmac(p_payload, p_secret, 'sha256'), 'hex');
$fn$;

-- Canonical payload for an event+webhook — shared by dispatch and retry so the
-- signed/sent body is identical on first send and every retry.
create or replace function files.webhook_event_payload(p_event_id bigint, p_webhook_id uuid)
returns jsonb language sql stable security definer set search_path = files, platform, public as $fn$
  select jsonb_build_object(
    'event_id', al.id, 'action', al.action, 'entity_type', al.entity_type,
    'entity_id', al.entity_id, 'organization_id', al.organization_id,
    'actor_id', al.actor_id, 'occurred_at', al.occurred_at,
    'metadata', al.metadata, 'webhook_id', p_webhook_id)
  from platform.activity_log al where al.id = p_event_id;
$fn$;

-- #3 + #6 — dispatch with a commit-lag and sign==send bytes.
create or replace function files.webhook_dispatch(p_limit int default 500)
returns int language plpgsql security definer set search_path = files, platform, extensions, public as $fn$
declare
  v_from bigint; v_to bigint; v_count int := 0;
  ev record; wh record; v_body jsonb; v_sig text; v_req bigint;
begin
  select last_activity_log_id into v_from from files.webhook_dispatch_state where id;
  -- Only consider events older than the lag window, so a slow-committing txn
  -- doesn't get skipped by the watermark.
  select coalesce(max(id), v_from) into v_to from platform.activity_log
    where occurred_at < now() - interval '5 seconds';
  if v_to <= v_from then return 0; end if;

  for ev in
    select id, entity_type, action, actor_id
    from platform.activity_log
    where id > v_from and id <= v_to and actor_id is not null
      and occurred_at < now() - interval '5 seconds'
    order by id limit p_limit
  loop
    for wh in
      select id, owner_id, target_url, secret from files.webhooks
      where is_active and owner_id = ev.actor_id
        and files.is_safe_webhook_url(target_url)
        and (event_types is null or ev.action = any(event_types))
        and (resource_types is null or ev.entity_type = any(resource_types))
    loop
      v_body := files.webhook_event_payload(ev.id, wh.id);
      v_sig := files.webhook_sign(wh.secret, v_body::text);
      insert into files.webhook_deliveries (webhook_id, activity_log_id, status, attempt, signature)
        values (wh.id, ev.id, 'pending', 1, v_sig)
        on conflict (webhook_id, activity_log_id) do nothing;
      if found then
        select net.http_post(
          url := wh.target_url, body := v_body,
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

-- #2 + #4 — reconcile: settle responses, time out stranded pendings, RE-SEND
-- eligible failures (backoff, max 6 attempts), auto-disable.
create or replace function files.webhook_reconcile()
returns int language plpgsql security definer set search_path = files, platform, extensions, net, public as $fn$
declare d record; v_count int := 0; v_status int; v_body jsonb; v_sig text; v_req bigint;
begin
  -- (a) settle pendings that have a response
  for d in
    select wd.id, wd.webhook_id, wd.net_request_id, wd.attempt
    from files.webhook_deliveries wd
    where wd.status = 'pending' and wd.net_request_id is not null
  loop
    select status_code into v_status from net._http_response where id = d.net_request_id;
    if v_status is null then continue; end if;
    if v_status between 200 and 299 then
      update files.webhook_deliveries set status='delivered', http_status=v_status, completed_at=now() where id=d.id;
      update files.webhooks set consecutive_failures=0, last_success_at=now() where id=d.webhook_id;
    else
      update files.webhook_deliveries
        set status='failed', http_status=v_status, completed_at=now(),
            next_attempt_at = now() + (interval '1 minute' * power(2, least(d.attempt,6))),
            error_message='HTTP ' || v_status
        where id=d.id;
      update files.webhooks set consecutive_failures=consecutive_failures+1 where id=d.webhook_id;
    end if;
    v_count := v_count + 1;
  end loop;

  -- (b) time out pendings whose response never arrived / was GC'd
  update files.webhook_deliveries wd
    set status='failed', completed_at=now(), error_message='no response (timeout/GC)',
        next_attempt_at = now() + (interval '1 minute' * power(2, least(wd.attempt,6)))
    where wd.status='pending' and wd.net_request_id is not null
      and wd.created_at < now() - interval '5 minutes';

  -- (c) re-send eligible failures (real events only — test pings aren't retried)
  for d in
    select wd.id, wd.webhook_id, wd.activity_log_id, wd.attempt, w.target_url, w.secret
    from files.webhook_deliveries wd join files.webhooks w on w.id = wd.webhook_id
    where wd.status='failed' and wd.next_attempt_at is not null and wd.next_attempt_at <= now()
      and wd.attempt < 6 and wd.activity_log_id is not null
      and w.is_active and files.is_safe_webhook_url(w.target_url)
  loop
    v_body := files.webhook_event_payload(d.activity_log_id, d.webhook_id);
    if v_body is null then continue; end if;
    v_sig := files.webhook_sign(d.secret, v_body::text);
    select net.http_post(
      url := d.target_url, body := v_body,
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'X-Matrx-Event', v_body->>'action',
        'X-Matrx-Signature','sha256=' || v_sig,
        'X-Matrx-Webhook-Id', d.webhook_id::text,
        'X-Matrx-Delivery-Event', d.activity_log_id::text)
    ) into v_req;
    update files.webhook_deliveries
      set status='pending', attempt=attempt+1, net_request_id=v_req, signature=v_sig,
          next_attempt_at=null, error_message=null, completed_at=null
      where id=d.id;
  end loop;

  -- (d) auto-disable webhooks past the failure ceiling
  update files.webhooks set is_active=false
    where is_active and consecutive_failures >= max_consecutive_failures;

  return v_count;
end;
$fn$;

-- #6 — test ping signs the exact bytes sent.
create or replace function files.webhook_send_test(p_webhook_id uuid)
returns uuid language plpgsql security definer set search_path = files, extensions, public as $fn$
declare w record; v_body jsonb; v_sig text; v_req bigint; v_delivery uuid; v_uid uuid;
begin
  v_uid := (select auth.uid());
  select id, owner_id, target_url, secret into w from files.webhooks where id = p_webhook_id;
  if w.id is null then raise exception 'Webhook not found'; end if;
  if w.owner_id is distinct from v_uid then raise exception 'Not authorized for this webhook'; end if;
  if not files.is_safe_webhook_url(w.target_url) then raise exception 'Webhook target_url is not a safe https endpoint'; end if;

  v_body := jsonb_build_object('action','webhook.test','webhook_id',w.id,
              'message','Test event from AI Matrx','occurred_at', now());
  v_sig := files.webhook_sign(w.secret, v_body::text);
  insert into files.webhook_deliveries (webhook_id, activity_log_id, status, attempt, signature)
    values (w.id, null, 'pending', 1, v_sig) returning id into v_delivery;
  select net.http_post(
    url := w.target_url, body := v_body,
    headers := jsonb_build_object('Content-Type','application/json','X-Matrx-Event','webhook.test',
      'X-Matrx-Signature','sha256=' || v_sig, 'X-Matrx-Webhook-Id', w.id::text)
  ) into v_req;
  update files.webhook_deliveries set net_request_id = v_req where id = v_delivery;
  update files.webhooks set last_attempt_at = now() where id = w.id;
  return v_delivery;
end;
$fn$;

-- #9 — stamp_run_org: fail loudly if the system org is missing rather than
-- leaving organization_id NULL (which would break the NOT NULL insert).
create or replace function platform.stamp_run_org()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare v_owner uuid; v_system uuid;
begin
  if NEW.organization_id is not null then return NEW; end if;
  v_owner := coalesce(
    nullif(to_jsonb(NEW)->>'user_id','')::uuid,
    nullif(to_jsonb(NEW)->>'triggered_by','')::uuid);
  if v_owner is not null then
    NEW.organization_id := coalesce(
      (select id from public.organizations where created_by = v_owner and is_personal order by created_at limit 1),
      public.ensure_personal_organization(v_owner));
  else
    select id into v_system from public.organizations where is_system order by created_at limit 1;
    if v_system is null then
      raise exception 'stamp_run_org: no system organization configured (organizations.is_system)';
    end if;
    NEW.organization_id := v_system;
  end if;
  return NEW;
end;
$fn$;
