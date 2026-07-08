-- ============================================================================
-- Automated media-durability healer dispatch (KNOWN_DEFECTS D1, second half).
--
-- The DB-edge guard (migrations/mtx_public_media_url_guard.sql) queues every
-- expiring signed URL that lands in a registered public column into
-- public.mtx_media_heal_queue. Until now the queue was drained manually
-- (owner-session FE heal / aidream scripts/flip_files_public.py).
--
-- This migration wires the AUTOMATED drain:
--   pg_cron job 'mtx-media-heal-drain' (every 10 min)
--     -> public.mtx_media_heal_dispatch()
--       -> (only when pending rows exist) pg_net POST to the aidream backend
--          https://server.app.matrxserver.com/media-heal/drain
--          authenticated by the X-Cloud-Files-Bypass header (the existing
--          internal service secret, stored in Supabase Vault as
--          CLOUD_FILES_BYPASS_SECRET — inserted OUT OF BAND, never in git).
--     The backend (aidream/services/media_durability.py::drain_heal_queue)
--     flips each leaked file public (S3 move + CDN URL) and rewrites the
--     registered column — work only the backend can do (S3 + URL minting).
--
-- LOUD RECOVERY: a run with pending rows but no vault secret raises a
-- WARNING (Postgres logs) and returns -1 — never a silent no-op.
-- Responses/failures of the HTTP call are auditable in net._http_response.
--
-- Idempotent: CREATE OR REPLACE + cron.schedule upserts by jobname.
-- ============================================================================

create or replace function public.mtx_media_heal_dispatch()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_pending int;
  v_secret text;
  v_req bigint;
begin
  select count(*) into v_pending
  from public.mtx_media_heal_queue
  where status = 'pending';

  if v_pending = 0 then
    return 0;  -- nothing to heal; no HTTP call.
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'CLOUD_FILES_BYPASS_SECRET'
  order by created_at desc
  limit 1;

  if v_secret is null or v_secret = '' then
    raise warning '[MEDIA-DURABILITY] mtx_media_heal_dispatch: % pending heal row(s) but vault secret CLOUD_FILES_BYPASS_SECRET is missing — automated healer cannot run',
      v_pending;
    return -1;
  end if;

  select net.http_post(
    url := 'https://server.app.matrxserver.com/media-heal/drain',
    body := jsonb_build_object('limit', 50),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cloud-Files-Bypass', v_secret
    ),
    timeout_milliseconds := 120000
  ) into v_req;

  return v_req;
end;
$$;

comment on function public.mtx_media_heal_dispatch() is
  'Automated media-durability healer dispatch. When mtx_media_heal_queue has pending rows, POSTs (via pg_net) to the aidream backend /media-heal/drain with the CLOUD_FILES_BYPASS_SECRET vault secret; the backend flips leaked files public and rewrites the registered column with the durable CDN URL. Returns 0 (queue empty), -1 (vault secret missing — WARNING raised), or the net request id. Scheduled by pg_cron job mtx-media-heal-drain.';

-- Internal-only: the dispatch reads a vault secret — never client-callable.
revoke all on function public.mtx_media_heal_dispatch() from public;
revoke all on function public.mtx_media_heal_dispatch() from anon;
revoke all on function public.mtx_media_heal_dispatch() from authenticated;

-- Every 10 minutes; cron.schedule(jobname, ...) upserts, so re-applying is safe.
select cron.schedule(
  'mtx-media-heal-drain',
  '*/10 * * * *',
  $$select public.mtx_media_heal_dispatch();$$
);
