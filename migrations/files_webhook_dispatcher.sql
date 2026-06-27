-- files_webhook_dispatcher.sql
--
-- Outbound webhook delivery, DB-native (no app-server / no Python deploy).
-- Source of truth is platform.activity_log (the canonical event ledger that
-- replaced the graveyarded cld_events outbox). A pg_cron tick scans new
-- activity_log rows, matches them against files.webhooks subscriptions, and
-- delivers each via pg_net with an HMAC-SHA256 signature, recording every
-- attempt in files.webhook_deliveries.
--
-- Matching (v1): a webhook receives an event when the event's actor_id equals
-- the webhook owner — i.e. "notify my endpoint about my own events and my
-- finished jobs". This needs no org/iam membership resolution and is
-- unambiguously authorized. Org-wide fan-out is a deliberate Phase-2 follow-up.
--
-- Idempotent: safe to re-apply.

-- 1. Repoint deliveries off the graveyarded cld_events outbox onto activity_log.
alter table files.webhook_deliveries
  drop constraint if exists cld_webhook_deliveries_event_id_fkey;
alter table files.webhook_deliveries
  drop column if exists event_id;
alter table files.webhook_deliveries
  add column if not exists activity_log_id bigint
    references platform.activity_log(id) on delete cascade;
alter table files.webhook_deliveries
  add column if not exists net_request_id bigint;     -- pg_net request id, for reconcile
alter table files.webhook_deliveries
  add column if not exists signature text;             -- the X-Matrx-Signature we sent

-- One delivery per (webhook, activity_log event) — makes dispatch idempotent.
create unique index if not exists webhook_deliveries_unique_event
  on files.webhook_deliveries (webhook_id, activity_log_id);

create index if not exists webhook_deliveries_pending_idx
  on files.webhook_deliveries (status, next_attempt_at);

-- 2. Dispatcher watermark — the last activity_log id we have considered.
create table if not exists files.webhook_dispatch_state (
  id boolean primary key default true check (id),       -- single-row table
  last_activity_log_id bigint not null default 0,
  updated_at timestamptz not null default now()
);
insert into files.webhook_dispatch_state (id, last_activity_log_id)
  values (true, coalesce((select max(id) from platform.activity_log), 0))
  on conflict (id) do nothing;

-- 3. HMAC-SHA256 hex signature of the payload using the webhook secret.
create or replace function files.webhook_sign(p_secret text, p_payload text)
returns text language sql immutable as $$
  select encode(extensions.hmac(p_payload, p_secret, 'sha256'), 'hex');
$$;

-- 4. Dispatch: post new matching events. SECURITY DEFINER — bypasses RLS so the
--    cron job (service) can read activity_log + webhooks across owners.
create or replace function files.webhook_dispatch(p_limit int default 500)
returns int language plpgsql security definer set search_path = files, platform, extensions, public as $$
declare
  v_from   bigint;
  v_to     bigint;
  v_count  int := 0;
  ev       record;
  wh       record;
  v_payload text;
  v_sig     text;
  v_req     bigint;
begin
  select last_activity_log_id into v_from from files.webhook_dispatch_state where id;
  select coalesce(max(id), v_from) into v_to from platform.activity_log;
  if v_to <= v_from then
    return 0;
  end if;

  for ev in
    select id, organization_id, entity_type, entity_id, action, actor_id, occurred_at, metadata
    from platform.activity_log
    where id > v_from and id <= v_to and actor_id is not null
    order by id
    limit p_limit
  loop
    for wh in
      select id, owner_id, target_url, secret
      from files.webhooks
      where is_active
        and owner_id = ev.actor_id
        and (event_types is null or ev.action = any(event_types))
        and (resource_types is null or ev.entity_type = any(resource_types))
    loop
      v_payload := jsonb_build_object(
        'event_id', ev.id,
        'action', ev.action,
        'entity_type', ev.entity_type,
        'entity_id', ev.entity_id,
        'organization_id', ev.organization_id,
        'actor_id', ev.actor_id,
        'occurred_at', ev.occurred_at,
        'metadata', ev.metadata,
        'webhook_id', wh.id
      )::text;
      v_sig := files.webhook_sign(wh.secret, v_payload);

      -- Idempotent on (webhook, event): if we already have a delivery row, skip.
      insert into files.webhook_deliveries (webhook_id, activity_log_id, status, attempt, signature)
        values (wh.id, ev.id, 'pending', 1, v_sig)
        on conflict (webhook_id, activity_log_id) do nothing;

      if found then
        select net.http_post(
          url := wh.target_url,
          body := v_payload::jsonb,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'X-Matrx-Event', ev.action,
            'X-Matrx-Signature', 'sha256=' || v_sig,
            'X-Matrx-Webhook-Id', wh.id::text,
            'X-Matrx-Delivery-Event', ev.id::text
          )
        ) into v_req;

        update files.webhook_deliveries
          set net_request_id = v_req
          where webhook_id = wh.id and activity_log_id = ev.id;

        update files.webhooks set last_attempt_at = now() where id = wh.id;
        v_count := v_count + 1;
      end if;
    end loop;
  end loop;

  update files.webhook_dispatch_state set last_activity_log_id = v_to, updated_at = now() where id;
  return v_count;
end;
$$;

-- 5. Reconcile: match pg_net responses back onto pending deliveries; settle
--    delivered/failed, backoff, auto-disable.
create or replace function files.webhook_reconcile()
returns int language plpgsql security definer set search_path = files, net, public as $$
declare
  d        record;
  v_count  int := 0;
  v_status int;
begin
  for d in
    select wd.id, wd.webhook_id, wd.net_request_id, wd.attempt
    from files.webhook_deliveries wd
    where wd.status = 'pending' and wd.net_request_id is not null
  loop
    -- Success responses
    select status_code into v_status from net._http_response where id = d.net_request_id;
    if v_status is null then
      -- still in flight (or response GC'd); leave pending for next tick
      continue;
    end if;

    if v_status between 200 and 299 then
      update files.webhook_deliveries
        set status = 'delivered', http_status = v_status, completed_at = now()
        where id = d.id;
      update files.webhooks
        set consecutive_failures = 0, last_success_at = now()
        where id = d.webhook_id;
    else
      update files.webhook_deliveries
        set status = 'failed', http_status = v_status, completed_at = now(),
            next_attempt_at = now() + (interval '1 minute' * power(2, least(d.attempt, 6))),
            error_message = 'HTTP ' || v_status
        where id = d.id;
      update files.webhooks
        set consecutive_failures = consecutive_failures + 1
        where id = d.webhook_id;
    end if;
    v_count := v_count + 1;
  end loop;

  -- Auto-disable webhooks that crossed their failure ceiling (loud: visible in row).
  update files.webhooks
    set is_active = false
    where is_active and consecutive_failures >= max_consecutive_failures;

  return v_count;
end;
$$;

-- 6. One tick = dispatch new events then reconcile prior posts.
create or replace function files.webhook_tick()
returns void language plpgsql security definer set search_path = files, public as $$
begin
  perform files.webhook_dispatch();
  perform files.webhook_reconcile();
end;
$$;

-- 7. Schedule the tick every 30 seconds (pg_cron 1.5+ supports interval syntax).
select cron.unschedule('files_webhook_tick')
  where exists (select 1 from cron.job where jobname = 'files_webhook_tick');
select cron.schedule('files_webhook_tick', '30 seconds', $$select files.webhook_tick();$$);
