-- chair-step: replaces the body of this lane's own rebuild function, created hours ago and called by nothing. It cannot carry `-- guard: custom/code_paths_enabled` and read it: the rebuild is the step that runs AFTER the switch, and a body that refuses while the campaign is off could never be rehearsed before it.
-- based-on: campaign_watch.reachability_rebuild(integer, integer, boolean) 33d21915c4f91a5476dc2f886ca3e6986a6bbd847cc0ef6389541e2fda9a8e61
--
-- W7-OFF — THE DRY RUN IS NOT THE OUTAGE IT MEASURES.
--
-- THE DEFECT, caught before it was run against the main database. The dry run
-- took ACCESS EXCLUSIVE on platform.reachability and THEN derived the whole
-- containment closure while holding it — the same 90-odd seconds the real
-- rebuild costs, with every reader blocked, to produce a report saying how long
-- the real rebuild would block every reader. A dry run that reproduces the
-- outage is not a dry run, and this one would have been run casually, by
-- whoever wanted the number.
--
-- THE ORDER IS NOW: derive first, WITHOUT any lock, because deriving reads and
-- reading needs no lock at all; then take ACCESS EXCLUSIVE under the explicit
-- lock_timeout, measure how long that took, and return. The lock is held for
-- the milliseconds left in the transaction instead of for the whole derive, so
-- the measurement costs the platform a blink.
--
-- THE REAL RUN keeps the only order that is correct for it — lock, then derive,
-- then swap — because a closure derived before the lock is a closure that can
-- be stale by the time the lock lands, and writing a stale closure into the
-- table iam.has_access reads is worse than any delay.
--
-- EVERYTHING ELSE STANDS (CUT-N-6): the explicit lock_timeout with no silent
-- default, the retry on 55P03 BY NAME with bounded backoff, the refusal of a
-- non-positive timeout with the reason the migration role's own session carries
-- lock_timeout = 0, and the measured cost in the note.

set lock_timeout = '3s';
set statement_timeout = '10min';

create or replace function campaign_watch.reachability_rebuild(
  p_lock_timeout_ms integer default 3000,
  p_max_attempts    integer default 5,
  p_dry_run         boolean default true
)
returns table (
  attempts       integer,
  acquired       boolean,
  dry_run        boolean,
  rows_before    bigint,
  rows_derived   bigint,
  rows_after     bigint,
  lock_wait_ms   integer,
  derive_ms      integer,
  total_ms       integer,
  role_measured  text,
  note           text
)
language plpgsql
volatile
security definer
set search_path to ''
as $fn$
declare
  v_attempt   integer := 0;
  v_t0        timestamptz := clock_timestamp();
  v_tlock     timestamptz;
  v_tderive   timestamptz;
  v_acquired  boolean := false;
begin
  if p_lock_timeout_ms is null or p_lock_timeout_ms <= 0 then
    raise exception 'campaign_watch.reachability_rebuild: lock_timeout must be a positive number of milliseconds, not %', p_lock_timeout_ms
      using errcode = 'P0001',
            hint = 'CUT-N-6: the rebuild is the one step that can take the platform down. The migration role''s own session carries lock_timeout = 0, which means WAIT FOR EVER, and the live ddl_lock_timeout_guard event trigger''s 2s floor covers DDL only — this is a LOCK TABLE, not DDL. An unset bound is not a bound.';
  end if;

  rows_before := (select count(*) from platform.reachability);
  role_measured := current_user;
  dry_run := p_dry_run;

  if p_dry_run then
    -- DERIVE FIRST, UNLOCKED. Reading needs no lock, and this is the expensive half.
    v_tderive := clock_timestamp();
    create temporary table _rebuild_derived on commit drop as
      select c.container_type, c.container_id, d.item_type, d.item_id, d.depth, d.max_level
        from (select distinct ce.container_type, ce.container_id from platform.containment_edges ce) c
        cross join lateral platform.derive_reachability(c.container_type, c.container_id) d;
    derive_ms := (extract(epoch from (clock_timestamp() - v_tderive)) * 1000)::int;
    rows_derived := (select count(*) from _rebuild_derived);
  end if;

  -- THE LOCK. ACCESS EXCLUSIVE, because the rebuild empties and refills a table
  -- iam.has_access reads from inside RLS: a reader that saw the table half
  -- refilled would be told it cannot see its own records.
  v_tlock := clock_timestamp();
  loop
    v_attempt := v_attempt + 1;
    begin
      execute format('set local lock_timeout = %L', p_lock_timeout_ms || 'ms');
      lock table platform.reachability in access exclusive mode;
      v_acquired := true;
      exit;
    exception when lock_not_available then       -- SQLSTATE 55P03, by name
      if v_attempt >= p_max_attempts then
        exit;
      end if;
      perform pg_sleep(least(0.25 * v_attempt, 2.0));   -- backoff, bounded
    end;
  end loop;
  lock_wait_ms := (extract(epoch from (clock_timestamp() - v_tlock)) * 1000)::int;
  attempts := v_attempt;
  acquired := v_acquired;

  if not v_acquired then
    rows_after := rows_before;
    total_ms := (extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int;
    note := 'NOT ACQUIRED. ' || v_attempt || ' attempt(s) at a ' || p_lock_timeout_ms
            || ' ms lock_timeout all returned 55P03; nothing was rebuilt and nothing was '
            || 'harmed. REMEDY: run it in a quieter window, or raise p_lock_timeout_ms '
            || 'deliberately and say so in the log.';
    return next;
    return;
  end if;

  if p_dry_run then
    rows_after := rows_before;
    total_ms := (extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int;
    note := 'DRY RUN — nothing was written, and the lock was taken only AFTER the derive, so '
            || 'the platform was blocked for milliseconds rather than for the whole measurement. '
            || 'THE REAL STEP''S COST: ' || lock_wait_ms || ' ms to take ACCESS EXCLUSIVE on '
            || 'platform.reachability after ' || v_attempt || ' attempt(s) at a '
            || p_lock_timeout_ms || ' ms lock_timeout as role "' || role_measured || '", plus '
            || derive_ms || ' ms to derive ' || rows_derived || ' row(s) against ' || rows_before
            || ' stored. The real run holds the lock across BOTH — a closure derived before the '
            || 'lock can be stale by the time the lock lands — so roughly '
            || (coalesce(lock_wait_ms,0) + coalesce(derive_ms,0))
            || ' ms is the outage, and every read of platform.reachability waits it out.';
    return next;
    return;
  end if;

  -- THE REAL RUN: lock, then derive, then swap, all under the one lock.
  v_tderive := clock_timestamp();
  create temporary table _rebuild_derived on commit drop as
    select c.container_type, c.container_id, d.item_type, d.item_id, d.depth, d.max_level
      from (select distinct ce.container_type, ce.container_id from platform.containment_edges ce) c
      cross join lateral platform.derive_reachability(c.container_type, c.container_id) d;
  derive_ms := (extract(epoch from (clock_timestamp() - v_tderive)) * 1000)::int;
  rows_derived := (select count(*) from _rebuild_derived);

  delete from platform.reachability;
  insert into platform.reachability (container_type, container_id, item_type, item_id, depth, max_level)
    select container_type, container_id, item_type, item_id, depth, max_level from _rebuild_derived;
  rows_after := (select count(*) from platform.reachability);
  total_ms := (extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int;
  note := 'REBUILT. ' || rows_before || ' row(s) deleted and ' || rows_after
          || ' rebuilt from the associations in ' || total_ms || ' ms (lock ' || lock_wait_ms
          || ' ms over ' || v_attempt || ' attempt(s), derive ' || derive_ms || ' ms) as role "'
          || role_measured || '". CUT-6: the stored form is a cache and has now survived being '
          || 'deleted entirely and rebuilt.';
  return next;
end;
$fn$;
