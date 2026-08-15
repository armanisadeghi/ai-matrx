-- batch_work_item_lifecycle_guard.sql
--
-- Adds the missing TRANSITION guard to batch.work_item — the LLM batch-API
-- work queue. The table already constrains status VALUES
-- (work_item_status_valid CHECK: pending|claimed|submitted|completed|failed|
-- dead_letter|abandoned) but nothing enforced which MOVES between them are
-- legal, so `completed -> pending` or `pending -> completed` (skipping the
-- claim/submit protocol entirely) were accepted silently. This adds a BEFORE
-- UPDATE trigger enforcing the real protocol, plus immutability of the input
-- identity columns.
--
-- Follow-up to migrations/retire_web_batch_item_lifecycle_guard.sql, which
-- retired the equivalent guard for the retired web.batch_item table and filed
-- this gap rather than smuggling in a guessed map.
--
-- ── THE MAP IS DERIVED FROM THE WORKERS, NOT FROM web.batch_item ───────────
-- The web.batch_item map (queued->submitted->processing->complete|failed|
-- cancelled) is DELIBERATELY NOT COPIED — disjoint vocabulary, different
-- lease/retry semantics. Every edge below is read off the live claim/lease
-- protocol in aidream/packages/matrx-batch:
--
--   queue.py  WorkItemStore.enqueue()                 INSERT status='pending'
--   queue.py  claim_for_flush()      (claim_batch, FOR UPDATE SKIP LOCKED)
--                                                     pending  -> claimed
--   queue.py  release_claims()       (flush failed pre-acceptance, attempt_count+1)
--                                                     claimed  -> pending
--   queue.py  release_expired_leases()  (reaper sweep, attempt_count+1)
--                                                     claimed  -> pending
--   queue.py  mark_submitted()       (provider accepted the batch)
--                                                     claimed  -> submitted
--   queue.py  write_result()         (CAS on status='submitted')
--                                                     submitted-> completed | failed
--   poller.py _fail_submitted_items() (batch expired / no batch_id)
--                                                     submitted-> failed
--
-- ⚠️ The two edges the naive map would have banned — and which would have
-- broken production on the first reaper tick — are:
--   * claimed -> pending  (an EXPIRED LEASE legitimately returns a claimed row
--     to the frontier; this is the whole crash-safety story of the queue), and
--   * the retry re-entry it produces: a single item legitimately cycles
--     pending->claimed->pending many times as attempt_count climbs.
-- Both are verified live below, not assumed.
--
-- ── VERIFIED AGAINST REAL DATA (2026-08-14) ────────────────────────────────
-- history.row_versions, entity_type='batch_work_item', 184 recorded versions
-- across 15 rows. Every distinct observed transition:
--     INSERT          -> pending          (15/15 rows, no other insert status)
--     pending         -> claimed
--     claimed         -> claimed          (same-status UPDATE: lease/other cols only)
--     claimed         -> pending          (lease expiry / release — up to 7 cycles
--                                          on row 81076faf…, attempt_count 0->7)
--     claimed         -> submitted
--     submitted       -> completed
--     completed       -> completed        (same-status UPDATE: handler_status)
-- No row has ever held 'failed', 'dead_letter' or 'abandoned', and no
-- historical transition contradicts the map below.
--
-- ── EDGES ALLOWED THAT NO CODE WRITES YET (deliberate, not oversight) ──────
-- 'dead_letter' and 'abandoned' are in the CHECK vocabulary and in the queue's
-- documented state machine (queue.py module docstring: "failed / dead_letter /
-- abandoned (operator)") but NO code writes them today. Per the
-- unfinished-work-alarm policy that is unfinished intent, not dead vocabulary,
-- so the map ADMITS them on the edges the docstring describes rather than
-- banning the states this guard's own table permits:
--     failed          -> dead_letter      (retry budget exhausted)
--     failed          -> pending          (operator/driver re-drive of a
--                                          retryable failure — poller.py marks
--                                          batch-expiry failures {"retryable": true},
--                                          which is meaningless if re-entry is banned)
--     <any non-terminal> -> abandoned     (operator kill switch)
-- Terminal, with no outbound edge: completed, dead_letter, abandoned. A
-- completed unit of work is re-run as a NEW ROW with a fresh custom_id — the
-- queue docstring says so explicitly — never by rewinding this one.
--
-- ── WHAT THIS GUARD DOES NOT TOUCH: handler_status ─────────────────────────
-- Stated rather than silently omitted. handler_status (NULL|dispatched|
-- succeeded|failed|dead) is a SEPARATE, deliberately RE-DRIVABLE machine:
-- claim_handler_due() re-claims on NULL, 'failed', and lease-expired
-- 'dispatched', and an idempotent handler is designed to be re-run. Its CHECK
-- constrains the vocabulary; pinning its transitions here would freeze an
-- operator repair path the system is built to allow. Left alone on purpose.
--
-- ── IMMUTABILITY ───────────────────────────────────────────────────────────
-- The input identity of a unit of work is frozen at insert: custom_id (the
-- unique idempotency key), purpose, provider, model, prefix_group_key (the
-- flush-group key — changing it after claim would move the item between
-- provider batches), payload (the request body actually sent), user_id,
-- organization_id, created_at. If any of these could drift, the row would lie
-- about what produced its result. Verified safe: flusher.py never writes
-- payload back — stamp_anthropic_cache_control() operates on dict(i["payload"]),
-- a copy. result_handler / handler_args / dedupe_key / link_* stay MUTABLE:
-- repointing a renamed handler is a legitimate operator repair and is not part
-- of the AI call's identity.
--
-- Idempotent. Safe to re-run.

create or replace function batch.enforce_work_item_lifecycle()
returns trigger
language plpgsql
as $fn$
declare
  v_legal text[];
begin
  -- Identity is frozen at insert. Checked before the transition so a write
  -- that does both reports the more fundamental violation.
  if new.custom_id        is distinct from old.custom_id        then
    raise exception 'batch.work_item %: custom_id is immutable (% -> %)', old.id, old.custom_id, new.custom_id
      using errcode = '23514';
  end if;
  if new.purpose          is distinct from old.purpose          then
    raise exception 'batch.work_item %: purpose is immutable (% -> %)', old.id, old.purpose, new.purpose
      using errcode = '23514';
  end if;
  if new.provider         is distinct from old.provider         then
    raise exception 'batch.work_item %: provider is immutable (% -> %)', old.id, old.provider, new.provider
      using errcode = '23514';
  end if;
  if new.model            is distinct from old.model            then
    raise exception 'batch.work_item %: model is immutable (% -> %)', old.id, old.model, new.model
      using errcode = '23514';
  end if;
  if new.prefix_group_key is distinct from old.prefix_group_key then
    raise exception 'batch.work_item %: prefix_group_key is immutable — it is the flush-group key', old.id
      using errcode = '23514';
  end if;
  if new.payload          is distinct from old.payload          then
    raise exception 'batch.work_item %: payload is immutable — the row must not lie about what was sent', old.id
      using errcode = '23514';
  end if;
  if new.user_id          is distinct from old.user_id          then
    raise exception 'batch.work_item %: user_id is immutable', old.id
      using errcode = '23514';
  end if;
  if new.organization_id  is distinct from old.organization_id  then
    raise exception 'batch.work_item %: organization_id is immutable', old.id
      using errcode = '23514';
  end if;
  if new.created_at       is distinct from old.created_at       then
    raise exception 'batch.work_item %: created_at is immutable', old.id
      using errcode = '23514';
  end if;

  -- A same-status UPDATE is always fine: most writes here move lease_expires_at,
  -- attempt_count, handler_status, result, deleted_at — not status.
  if new.status is not distinct from old.status then
    return new;
  end if;

  v_legal := case old.status
    when 'pending'     then array['claimed', 'failed', 'abandoned']
    when 'claimed'     then array['pending', 'submitted', 'failed', 'abandoned']
    when 'submitted'   then array['completed', 'failed', 'abandoned']
    when 'failed'      then array['pending', 'dead_letter', 'abandoned']
    when 'completed'   then array[]::text[]   -- terminal: re-run is a NEW row
    when 'dead_letter' then array[]::text[]   -- terminal
    when 'abandoned'   then array[]::text[]   -- terminal
    else null
  end;

  if v_legal is null then
    raise exception 'batch.work_item %: unknown current status % — the transition map is out of date with work_item_status_valid', old.id, old.status
      using errcode = '23514';
  end if;

  if not (new.status = any (v_legal)) then
    raise exception 'batch.work_item %: illegal status transition % -> % (legal from %: %)',
        old.id, old.status, new.status, old.status,
        case when cardinality(v_legal) = 0 then 'nothing — terminal state' else array_to_string(v_legal, ', ') end
      using errcode = '23514';
  end if;

  return new;
end;
$fn$;

comment on function batch.enforce_work_item_lifecycle() is
  'BEFORE UPDATE guard on batch.work_item: enforces the claim/lease transition map derived from matrx-batch (queue.py/flusher.py/poller.py) and freezes the input identity columns. Deliberately does NOT constrain handler_status, which is a re-drivable machine by design.';

drop trigger if exists trg_work_item_lifecycle on batch.work_item;
create trigger trg_work_item_lifecycle
  before update on batch.work_item
  for each row execute function batch.enforce_work_item_lifecycle();

-- ── Post-conditions: structural ────────────────────────────────────────────
do $assert$
declare v int;
begin
  select count(*) into v
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'batch' and p.proname = 'enforce_work_item_lifecycle';
  if v <> 1 then
    raise exception 'batch.enforce_work_item_lifecycle() not created (found %).', v;
  end if;

  select count(*) into v
  from pg_trigger t
  where t.tgrelid = 'batch.work_item'::regclass
    and t.tgname = 'trg_work_item_lifecycle'
    and not t.tgisinternal
    and (t.tgtype & 2) <> 0    -- BEFORE
    and (t.tgtype & 1) <> 0    -- FOR EACH ROW
    and (t.tgtype & 16) <> 0;  -- UPDATE
  if v <> 1 then
    raise exception 'trg_work_item_lifecycle is not a live BEFORE UPDATE FOR EACH ROW trigger on batch.work_item (found %).', v;
  end if;

  -- The CHECK this map is keyed to must still exist and still hold the same
  -- vocabulary; if someone widens it, the map must be widened in lockstep.
  select count(*) into v
  from pg_constraint
  where conrelid = 'batch.work_item'::regclass
    and conname = 'work_item_status_valid'
    and pg_get_constraintdef(oid) like '%pending%claimed%submitted%completed%failed%dead\_letter%abandoned%';
  if v <> 1 then
    raise exception 'work_item_status_valid is missing or its vocabulary changed — re-derive the transition map before trusting this guard.';
  end if;

  -- No live row may sit outside the vocabulary the map covers.
  select count(*) into v from batch.work_item
  where status not in ('pending','claimed','submitted','completed','failed','dead_letter','abandoned');
  if v <> 0 then
    raise exception '% batch.work_item row(s) hold a status the transition map does not cover.', v;
  end if;
end $assert$;

-- ── Post-conditions: BEHAVIOURAL ───────────────────────────────────────────
-- Drives a synthetic row through the real protocol and asserts the guard both
-- ALLOWS every edge the workers actually take and REFUSES the ones this
-- migration exists to stop. Everything happens inside a subtransaction that is
-- unwound by a sentinel raise, so no row and no history.row_versions entry
-- survives.
do $prove$
declare
  v_user uuid;
  v_org  uuid;
  v_id   uuid;
  v_probe text := '__lifecycle_guard_probe_' || gen_random_uuid()::text;
begin
  select user_id, organization_id into v_user, v_org
  from batch.work_item where deleted_at is null limit 1;
  if v_user is null then
    select user_id, organization_id into v_user, v_org from batch.work_item limit 1;
  end if;
  if v_user is null then
    raise exception 'No batch.work_item row to borrow a valid (user_id, organization_id) from — cannot prove the guard behaviourally. Do not ship this unproven.';
  end if;

  begin
    insert into batch.work_item
      (custom_id, purpose, provider, model, prefix_group_key, payload,
       result_handler, user_id, organization_id, status)
    values
      (v_probe, 'lifecycle_guard_probe', 'anthropic', 'probe-model', 'probe',
       '{"probe": true}'::jsonb, 'noop', v_user, v_org, 'pending')
    returning id into v_id;

    -- LEGAL: the full happy path, including two lease-expiry rewinds.
    update batch.work_item set status = 'claimed'   where id = v_id;
    update batch.work_item set lease_expires_at = now() - interval '1 second' where id = v_id;  -- same-status
    update batch.work_item set status = 'pending', attempt_count = attempt_count + 1 where id = v_id;
    update batch.work_item set status = 'claimed'   where id = v_id;
    update batch.work_item set status = 'pending', attempt_count = attempt_count + 1 where id = v_id;
    update batch.work_item set status = 'claimed'   where id = v_id;
    update batch.work_item set status = 'submitted' where id = v_id;
    update batch.work_item set status = 'failed'    where id = v_id;   -- poller expiry path
    update batch.work_item set status = 'pending'   where id = v_id;   -- retryable re-drive
    update batch.work_item set status = 'claimed'   where id = v_id;
    update batch.work_item set status = 'submitted' where id = v_id;
    update batch.work_item set status = 'completed' where id = v_id;
    update batch.work_item set handler_status = 'dispatched' where id = v_id;  -- same-status
    update batch.work_item set handler_status = 'succeeded'  where id = v_id;  -- same-status

    -- ILLEGAL #1: the reported defect — a completed row rewound to the frontier.
    begin
      update batch.work_item set status = 'pending' where id = v_id;
      raise exception 'GUARD_HOLE: completed -> pending was accepted';
    exception when check_violation then null;
    end;

    -- ILLEGAL #2: identity mutation after the fact.
    begin
      update batch.work_item set payload = '{"probe": "tampered"}'::jsonb where id = v_id;
      raise exception 'GUARD_HOLE: payload mutation was accepted';
    exception when check_violation then null;
    end;
    begin
      update batch.work_item set custom_id = v_probe || '-x' where id = v_id;
      raise exception 'GUARD_HOLE: custom_id mutation was accepted';
    exception when check_violation then null;
    end;

    -- ILLEGAL #3: completed is terminal in EVERY direction, not just backwards.
    begin
      update batch.work_item set status = 'abandoned' where id = v_id;
      raise exception 'GUARD_HOLE: completed -> abandoned was accepted (completed must be terminal)';
    exception when check_violation then null;
    end;

    -- ILLEGAL #4: skipping the claim/submit protocol, on a fresh pending row.
    insert into batch.work_item
      (custom_id, purpose, provider, model, prefix_group_key, payload,
       result_handler, user_id, organization_id, status)
    values
      (v_probe || '-2', 'lifecycle_guard_probe', 'anthropic', 'probe-model', 'probe',
       '{"probe": true}'::jsonb, 'noop', v_user, v_org, 'pending')
    returning id into v_id;
    begin
      update batch.work_item set status = 'completed' where id = v_id;
      raise exception 'GUARD_HOLE: pending -> completed (skipping claim/submit) was accepted';
    exception when check_violation then null;
    end;

    -- Unwind everything the probe touched.
    raise exception 'LIFECYCLE_GUARD_PROBE_ROLLBACK';

  exception
    when others then
      if sqlerrm <> 'LIFECYCLE_GUARD_PROBE_ROLLBACK' then
        raise;
      end if;
      raise notice 'batch.work_item lifecycle guard: behavioural proof PASSED (legal path accepted; illegal transitions and identity mutations refused).';
  end;

  -- Nothing may survive the probe.
  if exists (select 1 from batch.work_item where purpose = 'lifecycle_guard_probe') then
    raise exception 'Behavioural probe leaked a row into batch.work_item — clean it up before shipping.';
  end if;
  if exists (
    select 1 from history.row_versions
    where entity_type = 'batch_work_item'
      and row_data->>'purpose' = 'lifecycle_guard_probe'
  ) then
    raise exception 'Behavioural probe leaked history.row_versions entries — the subtransaction did not unwind.';
  end if;
end $prove$;
