-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- lane: LOCK-HYGIENE
--
-- ══════════════════════════════════════════════════════════════════════════════════════════
-- LOCK-HYGIENE — A BUILD LOCK IS A LEASE, NOT A ROW THAT LIVES FOREVER.
-- ══════════════════════════════════════════════════════════════════════════════════════════
--
-- THE DEFECT, THREE TIMES ON 2026-09-22. A lane finishes and its `campaign_watch.build_lock`
-- row stays: a background poller re-takes it after the release, a "taking back" step never
-- runs because the process died between the apply and the release, or the lane simply reported
-- DONE and walked away. The next lane's TAKE then returns zero rows against a holder that does
-- not exist, and §4.7 tells it to WAIT. Measured today: FIX-10A held `custom` for 20 minutes
-- after its DONE report; STORE-TXN-3 held `platform` after its final report; earlier the TAILS
-- lane held `custom` for 18 hours. Every one of those was an hour of somebody else's night.
--
-- WHY THE EXISTING FIXES DID NOT FIX IT. Each call site grew its own answer:
--   · `scripts/lib/borrow-live-switch.sh` deletes a row older than fifteen minutes before it
--     inserts — the right idea, in ONE script, for ONE lock-name shape (`store-switch:<org>`).
--   · `scripts/rehearse-migration.ts` releases in a trap and arms the trap before the first
--     insert — which saves a Ctrl-C and saves nothing at all from a SIGKILL or a dead laptop.
--   · `scripts/night/lib-night.sh` releases on the happy path and on its own trap.
--   · `scripts/apply-migration.ts` only READS the row, and reads it as "held" forever.
-- A lane that dies has no code running, so no amount of trap discipline in the holder can free
-- the row. The only thing that can is the ROW ITSELF carrying an expiry that passes without
-- anybody running anything. That is what this file adds, in the table, once, for every caller.
--
-- WHAT A LOCK ROW BECOMES
--   heartbeat_at — last sign of life from the holder. The runner refreshes it while an apply is
--                  in flight, so a long apply never loses the lock it is using.
--   expires_at   — the LEASE. `now() + 15 minutes` on take, pushed forward by every renew. A
--                  row whose `expires_at` has passed is EXPIRED: it is not held by anybody, and
--                  the next TAKE evicts it and says whose it was and how old it was.
-- A LIVE row still blocks, exactly as before — this weakens no refusal. It only stops a DEAD
-- row from blocking, which it never had the right to do.
--
-- FIFTEEN MINUTES is the campaign's own number: it is what `borrow-live-switch.sh` already
-- chose for the same problem, it is longer than every apply this campaign has measured (the
-- slowest, `alter column type` on a 16-partition parent, is under a second; the slowest whole
-- file is under a minute), and it is short enough that a lane that dies costs the next lane a
-- coffee rather than a night. It lives in ONE place — `campaign_watch.lock_lease()` — so it is
-- changed in one place and read by every caller.
--
-- WHY FOUR FUNCTIONS AND NOT FOUR COPIES OF THE SQL. The take/renew/release SQL is now written
-- once, in the database, and `pnpm db:apply`, `pnpm db:rehearse`, `scripts/night/lib-night.sh`
-- and `scripts/lib/borrow-live-switch.sh` all call it. The eviction sentence — who held it and
-- for how long — is built by the database, so all four print the same sentence and a fifth
-- caller cannot invent a fifth rule.
--
-- NEW OBJECTS ONLY. Two nullable-with-default columns, four brand-new functions and one new
-- view; no `CREATE OR REPLACE` of anything live, no grant, no policy, no trigger, no drop.
-- `campaign_watch.build_lock` is unpartitioned, so `add column` is ACCESS EXCLUSIVE on exactly
-- one relation and pulls in none of the `supautils` hook set — not window-class
-- (scripts/lib/ddl-lock-footprint.json, row `add column` / plain table).
--
-- The inverse is `migrations/inverse/lockhyg_a_lock_row_carries_a_lease_down.sql`, in this same
-- commit (§4.13). Rule 27 (up -> inverse -> up) was run on the dev clone with `pnpm db:rehearse`.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ── the two columns ───────────────────────────────────────────────────────────────────────
-- Both carry a default, so the ALTER neither fails on the rows already there nor leaves a NULL
-- that every caller would have to special-case. Rows present when this lands get a FRESH lease
-- rather than a back-dated one: a migration must not evict a lane that is mid-apply right now,
-- and a row that is genuinely dead expires fifteen minutes later without anybody doing anything
-- — which is the whole point.

alter table campaign_watch.build_lock
  add column if not exists heartbeat_at timestamptz not null default now();

alter table campaign_watch.build_lock
  add column if not exists expires_at timestamptz not null default (now() + interval '15 minutes');

comment on column campaign_watch.build_lock.heartbeat_at is
  'Last sign of life from the holder. `pnpm db:apply` refreshes it on a timer while an apply is '
  'in flight and `pnpm db:rehearse` refreshes it between legs, so a long piece of work never '
  'loses the lock it is using. Informational: the thing that decides is expires_at.';

comment on column campaign_watch.build_lock.expires_at is
  'THE LEASE. now() + campaign_watch.lock_lease() on take, pushed forward by every renew. A row '
  'whose expires_at has passed is EXPIRED, not held: campaign_watch.lock_take() evicts it and '
  'names the former holder and its age. A LIVE row still blocks every other lane, unchanged.';

-- ── the lease, in one place ───────────────────────────────────────────────────────────────

create function campaign_watch.lock_lease() returns interval
language sql immutable parallel safe
as $$ select interval '15 minutes' $$;

comment on function campaign_watch.lock_lease() is
  'How long a build_lock row is held without a sign of life. Fifteen minutes: longer than every '
  'apply this campaign has measured, short enough that a lane that dies costs the next lane a '
  'coffee and not a night. Change it HERE and every caller changes with it.';

-- ── TAKE ──────────────────────────────────────────────────────────────────────────────────
-- One statement's worth of behaviour, in one place:
--   1. delete the row for this lock name IF its lease has lapsed, remembering whose it was;
--   2. insert ours, `on conflict do nothing` — exactly as §4.7 requires, never a wait;
--   3. if somebody LIVE holds it, say who, since when, and how long is left on their lease;
--   4. if WE already hold it, renew and say so — a lane must never be blocked by itself.
-- `outcome` is one of: taken | evicted | renewed | held.

create function campaign_watch.lock_take(
  p_lock_name text,
  p_held_by   text,
  p_note      text default null
) returns table (
  outcome        text,
  lock_name      text,
  held_by        text,
  taken_at       timestamptz,
  expires_at     timestamptz,
  evicted_holder text,
  evicted_age    interval,
  message        text
)
language plpgsql
as $$
-- The OUT parameters of RETURNS TABLE share their names with the table's own columns
-- (`lock_name`, `held_by`, `taken_at`, `expires_at`), and `on conflict (lock_name)` is a column
-- reference plpgsql would otherwise call ambiguous at run time. Nothing here assigns an OUT
-- parameter by name — every result is built by `return query` — so resolving a bare name to the
-- COLUMN is both correct and the only reading that can be meant.
#variable_conflict use_column
declare
  v_evicted_holder text;
  v_evicted_age    interval;
  v_row            campaign_watch.build_lock%rowtype;
  v_lease          interval := campaign_watch.lock_lease();
begin
  if p_lock_name is null or btrim(p_lock_name) = '' or p_held_by is null or btrim(p_held_by) = '' then
    raise exception 'campaign_watch.lock_take needs a lock name and a holder; got (%, %)',
      coalesce(p_lock_name, '<null>'), coalesce(p_held_by, '<null>')
      using errcode = 'P0001';
  end if;

  delete from campaign_watch.build_lock b
   where b.lock_name = p_lock_name
     and b.expires_at <= now()
  returning b.held_by, now() - b.taken_at into v_evicted_holder, v_evicted_age;

  insert into campaign_watch.build_lock (lock_name, held_by, note, taken_at, heartbeat_at, expires_at)
  values (p_lock_name, p_held_by, p_note, now(), now(), now() + v_lease)
  on conflict (lock_name) do nothing
  returning * into v_row;

  if v_row.lock_name is not null then
    return query select
      case when v_evicted_holder is null then 'taken' else 'evicted' end,
      v_row.lock_name, v_row.held_by, v_row.taken_at, v_row.expires_at,
      v_evicted_holder, v_evicted_age,
      case when v_evicted_holder is null
        then format('LOCK:%s taken by %s; the lease runs out at %s unless it is renewed.',
                    p_lock_name, p_held_by, v_row.expires_at)
        else format('LOCK:%s was EXPIRED — %s had held it for %s with no sign of life for longer '
                    || 'than the %s lease, so the row was evicted and %s now holds it until %s.',
                    p_lock_name, v_evicted_holder, v_evicted_age, v_lease, p_held_by, v_row.expires_at)
      end;
    return;
  end if;

  select * into v_row from campaign_watch.build_lock b where b.lock_name = p_lock_name;
  if v_row.lock_name is null then
    -- Released between the delete and the insert. The caller retries; it is never told it holds
    -- something it does not.
    return query select 'held'::text, p_lock_name, null::text, null::timestamptz, null::timestamptz,
      v_evicted_holder, v_evicted_age,
      format('LOCK:%s changed hands while this take ran — nothing was taken. Try again.', p_lock_name);
    return;
  end if;

  if v_row.held_by = p_held_by then
    update campaign_watch.build_lock b
       set heartbeat_at = now(), expires_at = now() + v_lease
     where b.lock_name = p_lock_name and b.held_by = p_held_by
    returning * into v_row;
    return query select 'renewed'::text, v_row.lock_name, v_row.held_by, v_row.taken_at, v_row.expires_at,
      v_evicted_holder, v_evicted_age,
      format('LOCK:%s is ALREADY held by %s (since %s) — the lease was renewed to %s, not re-taken.',
             p_lock_name, p_held_by, v_row.taken_at, v_row.expires_at);
    return;
  end if;

  return query select 'held'::text, v_row.lock_name, v_row.held_by, v_row.taken_at, v_row.expires_at,
    v_evicted_holder, v_evicted_age,
    format('LOCK:%s is held by %s since %s (%s ago)%s, and its lease is LIVE for another %s. '
           || 'Nothing was taken.',
           p_lock_name, v_row.held_by, v_row.taken_at, now() - v_row.taken_at,
           case when v_row.note is null then '' else format(' — "%s"', v_row.note) end,
           v_row.expires_at - now());
end
$$;

comment on function campaign_watch.lock_take(text, text, text) is
  'THE one TAKE. Evicts a row whose lease has lapsed (naming the former holder and its age in '
  'the message), inserts with `on conflict do nothing` so exactly one caller wins and nobody '
  'waits on the database, renews instead of blocking when the caller already holds it, and '
  'refuses — outcome `held` — while a LIVE holder has it. Callers: pnpm db:apply, pnpm '
  'db:rehearse, scripts/night/lib-night.sh, scripts/lib/borrow-live-switch.sh.';

-- ── RENEW ─────────────────────────────────────────────────────────────────────────────────
-- Holder-scoped by construction: a caller can only push forward a lease it actually holds, and
-- a renew that matches nothing returns false rather than pretending.

create function campaign_watch.lock_renew(p_lock_name text, p_held_by text)
returns boolean
language sql
as $$
  update campaign_watch.build_lock b
     set heartbeat_at = now(), expires_at = now() + campaign_watch.lock_lease()
   where b.lock_name = p_lock_name and b.held_by = p_held_by
  returning true;
$$;

comment on function campaign_watch.lock_renew(text, text) is
  'Push this holder''s lease forward by one full lease. Returns nothing (false to a coalescing '
  'caller) when the caller is not the holder — a process whose renew stops answering has lost '
  'the lock and must be told, not reassured.';

-- ── RELEASE ───────────────────────────────────────────────────────────────────────────────

create function campaign_watch.lock_release(p_lock_name text, p_held_by text)
returns boolean
language sql
as $$
  delete from campaign_watch.build_lock b
   where b.lock_name = p_lock_name and b.held_by = p_held_by
  returning true;
$$;

comment on function campaign_watch.lock_release(text, text) is
  'Holder-scoped release, unchanged in meaning from the hand-written DELETE every caller used '
  'to carry. Returns nothing when the caller was not the holder, which callers announce loudly '
  'rather than swallow.';

-- ── THE SWEEP''S VIEW ─────────────────────────────────────────────────────────────────────
-- §4.7 made the chair sweep for abandoned rows by hand. With a lease nothing NEEDS sweeping —
-- an expired row blocks nobody — but the chair still wants to SEE the estate, so the listing
-- stays as one view and `pnpm locks:sweep` prints it.

-- `security_invoker = true` because `provision_shape_guard` requires it of every view on this
-- database, and rightly: a view that runs as its owner is a door around whatever the caller may
-- not read. Nothing in this one needs the owner's reach — the table has no RLS and only the
-- privileged runner connects.
create view campaign_watch.build_lock_status with (security_invoker = true) as
select
  b.lock_name,
  b.held_by,
  b.taken_at,
  b.heartbeat_at,
  b.expires_at,
  b.note,
  case when b.expires_at <= now() then 'expired' else 'live' end as state,
  now() - b.taken_at                                             as held_for,
  now() - b.heartbeat_at                                         as since_heartbeat,
  b.expires_at - now()                                           as lease_left
from campaign_watch.build_lock b;

comment on view campaign_watch.build_lock_status is
  'Every build_lock row with its state: `live` (it blocks) or `expired` (it blocks nobody and '
  'the next take evicts it). Printed by `pnpm locks:sweep`.';
