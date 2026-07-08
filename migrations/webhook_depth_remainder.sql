-- webhook_depth_remainder.sql
--
-- Closes KNOWN_DEFECTS D19 (event-spine webhook depth remainder):
--   #1 org-wide fan-out  — files.webhooks.organization_id: an org-scoped
--                          webhook fires for events whose organization_id
--                          matches OR whose actor is any member of that org.
--                          Membership primitive: iam.is_org_member(user, org)
--                          (arbitrary-pair variant of iam.has_org_access).
--                          Write-time guard: the owner must be a member of the
--                          org they scope to; delivery-time recheck: the owner
--                          must STILL be a member (leaving the org silences it).
--   #2 manual redeliver  — files.webhook_redeliver(delivery_id): SECURITY
--                          DEFINER, owner-checked via auth.uid(); re-signs the
--                          canonical payload and re-posts, resetting the row
--                          to pending. Test pings (activity_log_id null) are
--                          not redeliverable — use webhook_send_test.
--   #3 latency_ms        — webhook_deliveries.dispatched_at is stamped at every
--                          pg_net post (dispatch / retry / test / redeliver);
--                          reconcile settles latency_ms = response.created -
--                          dispatched_at.
--   #4 python actor path — grant EXECUTE on the 6-arg platform.log_activity
--                          (explicit actor) to service_role so the aidream
--                          audit bridge can record file events WITH an actor.
--                          (authenticated/anon stay revoked — actor forgery
--                          guard from webhook_hardening.sql is intact.)
--
-- Idempotent: safe to re-apply.

-- ---------------------------------------------------------------------------
-- #4 — Python file-audit events: service_role may write the ledger with an
-- explicit actor. Before this, ONLY postgres had EXECUTE, so every RPC call
-- from the aidream audit bridge failed permission-denied (and was swallowed).
grant execute on function platform.log_activity(uuid, text, text, uuid, jsonb, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- #1a — membership primitive for arbitrary (user, org) pairs. Mirrors
-- iam.has_org_access (which is fixed to auth.uid()).
create or replace function iam.is_org_member(p_user uuid, p_org uuid)
returns boolean language sql stable security definer set search_path = iam, public as $fn$
  select exists (
    select 1 from iam.organization_member m
    where m.organization_id = p_org and m.user_id = p_user);
$fn$;

-- ---------------------------------------------------------------------------
-- #1b — org scoping on the subscription.
alter table files.webhooks
  add column if not exists organization_id uuid references iam.organizations(id) on delete set null;
create index if not exists webhooks_org_idx
  on files.webhooks (organization_id) where organization_id is not null;

-- Write-time guard: you can only scope a webhook to an org you belong to.
create or replace function files.webhook_org_guard()
returns trigger language plpgsql security definer set search_path = files, iam, public as $fn$
begin
  if NEW.organization_id is not null
     and not iam.is_org_member(NEW.owner_id, NEW.organization_id) then
    raise exception 'Webhook owner is not a member of organization %', NEW.organization_id;
  end if;
  return NEW;
end;
$fn$;
drop trigger if exists webhook_org_guard on files.webhooks;
create trigger webhook_org_guard
  before insert or update of organization_id, owner_id on files.webhooks
  for each row execute function files.webhook_org_guard();

-- ---------------------------------------------------------------------------
-- #3a — request-start timestamp for latency capture.
alter table files.webhook_deliveries
  add column if not exists dispatched_at timestamptz;

-- ---------------------------------------------------------------------------
-- #1c + #3b — dispatch: org-aware matching + stamp dispatched_at.
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
    select id, entity_type, action, actor_id, organization_id
    from platform.activity_log
    where id > v_from and id <= v_to
      and occurred_at < now() - interval '5 seconds'
    order by id limit p_limit
  loop
    for wh in
      select w.id, w.owner_id, w.target_url, w.secret from files.webhooks w
      where w.is_active
        and files.is_safe_webhook_url(w.target_url)
        and (w.event_types is null or ev.action = any(w.event_types))
        and (w.resource_types is null or ev.entity_type = any(w.resource_types))
        and (
          -- v1: my own events / my finished jobs
          (ev.actor_id is not null and w.owner_id = ev.actor_id)
          -- v2: org-wide fan-out — event belongs to my org, or its actor is
          -- an org member. Owner must STILL be a member at delivery time.
          or (w.organization_id is not null
              and iam.is_org_member(w.owner_id, w.organization_id)
              and (ev.organization_id = w.organization_id
                   or (ev.actor_id is not null
                       and iam.is_org_member(ev.actor_id, w.organization_id))))
        )
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
        update files.webhook_deliveries set net_request_id = v_req, dispatched_at = now()
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

-- ---------------------------------------------------------------------------
-- #3c — reconcile: settle latency_ms from the pg_net response arrival time;
-- retries re-stamp dispatched_at.
create or replace function files.webhook_reconcile()
returns int language plpgsql security definer set search_path = files, platform, extensions, net, public as $fn$
declare
  d record; v_count int := 0; v_status int; v_resp_at timestamptz;
  v_body jsonb; v_sig text; v_req bigint;
begin
  -- (a) settle pendings that have a response
  for d in
    select wd.id, wd.webhook_id, wd.net_request_id, wd.attempt, wd.dispatched_at
    from files.webhook_deliveries wd
    where wd.status = 'pending' and wd.net_request_id is not null
  loop
    select status_code, created into v_status, v_resp_at
      from net._http_response where id = d.net_request_id;
    if v_status is null then continue; end if;
    if v_status between 200 and 299 then
      update files.webhook_deliveries
        set status='delivered', http_status=v_status, completed_at=now(),
            latency_ms = case when d.dispatched_at is not null
              then greatest(0, floor(extract(epoch from (v_resp_at - d.dispatched_at)) * 1000))::int
              else null end
        where id=d.id;
      update files.webhooks set consecutive_failures=0, last_success_at=now() where id=d.webhook_id;
    else
      update files.webhook_deliveries
        set status='failed', http_status=v_status, completed_at=now(),
            latency_ms = case when d.dispatched_at is not null
              then greatest(0, floor(extract(epoch from (v_resp_at - d.dispatched_at)) * 1000))::int
              else null end,
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
          dispatched_at=now(), next_attempt_at=null, error_message=null,
          completed_at=null, http_status=null, latency_ms=null
      where id=d.id;
  end loop;

  -- (d) auto-disable webhooks past the failure ceiling
  update files.webhooks set is_active=false
    where is_active and consecutive_failures >= max_consecutive_failures;

  return v_count;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- #3d — test ping stamps dispatched_at too.
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
  insert into files.webhook_deliveries (webhook_id, activity_log_id, status, attempt, signature, dispatched_at)
    values (w.id, null, 'pending', 1, v_sig, now()) returning id into v_delivery;
  select net.http_post(
    url := w.target_url, body := v_body,
    headers := jsonb_build_object('Content-Type','application/json','X-Matrx-Event','webhook.test',
      'X-Matrx-Signature','sha256=' || v_sig, 'X-Matrx-Webhook-Id', w.id::text)
  ) into v_req;
  update files.webhook_deliveries set net_request_id = v_req, dispatched_at = now() where id = v_delivery;
  update files.webhooks set last_attempt_at = now() where id = w.id;
  return v_delivery;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- #2 — manual redeliver. Owner-checked via auth.uid() against the webhook row;
-- re-signs the canonical event payload and re-posts immediately, resetting the
-- delivery to pending (reconcile settles it on the next tick). Works on
-- delivered AND failed rows, regardless of the retry cap (it's a human).
create or replace function files.webhook_redeliver(p_delivery_id uuid)
returns uuid language plpgsql security definer set search_path = files, platform, extensions, public as $fn$
declare
  d record; v_uid uuid; v_body jsonb; v_sig text; v_req bigint;
begin
  v_uid := (select auth.uid());
  if v_uid is null then raise exception 'Not authenticated'; end if;

  select wd.id, wd.webhook_id, wd.activity_log_id, wd.status,
         w.owner_id, w.target_url, w.secret
    into d
    from files.webhook_deliveries wd
    join files.webhooks w on w.id = wd.webhook_id
    where wd.id = p_delivery_id;
  if d.id is null then raise exception 'Delivery not found'; end if;
  if d.owner_id is distinct from v_uid then raise exception 'Not authorized for this delivery'; end if;
  if d.activity_log_id is null then
    raise exception 'Test pings cannot be redelivered — use Send test instead';
  end if;
  if d.status = 'pending' then
    raise exception 'Delivery is still in flight — wait for it to settle first';
  end if;
  if not files.is_safe_webhook_url(d.target_url) then
    raise exception 'Webhook target_url is not a safe https endpoint';
  end if;

  v_body := files.webhook_event_payload(d.activity_log_id, d.webhook_id);
  if v_body is null then raise exception 'Original event no longer exists'; end if;
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
        dispatched_at=now(), next_attempt_at=null, error_message=null,
        completed_at=null, http_status=null, latency_ms=null
    where id = d.id;
  update files.webhooks set last_attempt_at = now() where id = d.webhook_id;
  return d.id;
end;
$fn$;
revoke execute on function files.webhook_redeliver(uuid) from anon, public;
grant execute on function files.webhook_redeliver(uuid) to authenticated;
