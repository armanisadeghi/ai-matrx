-- dd173_api_request_log_b_backfill_04 — DD-173 `ops.api_request_log`, STEP B batch 04 of the
-- bounded backfill. Step A (dd173_api_request_log_a_columns.sql) added the columns; this file
-- moves a BOUNDED amount of the backlog and stops. Re-runnable as the next numbered file until
-- step C's predicate is satisfied — the work it has left to do is stated by the data, never by a
-- number this file carries.
--
-- 🚨 WHAT MAKES THIS SAFE TO RUN AGAINST A TABLE UNDER LIVE WRITES:
--   * It takes NO table-level lock stronger than ROW EXCLUSIVE. An UPDATE conflicts with nothing
--     the request sink does (INSERT), nothing a reader does, and nothing the change feed does.
--     The 2 s production lock bound this runner sets is never approached, and never raised.
--   * Each UPDATE is bounded by a TIME WINDOW walked from the oldest un-backfilled row forward,
--     so it rides `idx_api_request_log_created_at` instead of re-scanning the heap from block 0
--     for every batch (which is what a `... where organization_id is null limit N` subquery
--     degrades into once the front of the table is done).
--   * The whole file stops at a wall-clock budget, so ONE transaction is seconds, not minutes —
--     no long-lived xmin horizon holding vacuum off a table that turns over every 30 days.
--   * It is RESUMABLE and ORDER-INDEPENDENT: the predicate is `organization_id is null`, so a
--     batch that never ran, ran twice, or died half way costs nothing but another batch.
--   * The completion predicate is ROW-COUNT INDEPENDENT: `min(created_at) where organization_id
--     is null` returns NULL when, and only when, no row anywhere lacks an organization. No
--     count(*), no expected total, nothing that a row arriving mid-run could invalidate.
--
-- The organization is the Matrx system organization, and the reason is in step A's header.

do $dd173arlb$
declare
  v_sysorg   constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';  -- matrx-system (db-rules §2)
  v_budget   constant interval := interval '20 seconds';
  v_window   constant interval := interval '12 hours';
  v_t0       timestamptz := clock_timestamp();
  v_lo       timestamptz;
  v_moved    bigint := 0;
  v_batch    bigint;
  v_batches  int := 0;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema='ops' and table_name='api_request_log' and column_name='organization_id') then
    raise exception 'dd173-arl-b: ops.api_request_log has no organization_id column. Run dd173_api_request_log_a_columns.sql first; this file backfills, it does not create.';
  end if;

  loop
    -- The oldest row still without an organization — the cursor, read from the data every time.
    select min(t.created_at) into v_lo from ops.api_request_log t where t.organization_id is null;
    exit when v_lo is null;                       -- the completion predicate, not a count
    exit when clock_timestamp() - v_t0 > v_budget; -- this transaction's bound

    update ops.api_request_log t
       set organization_id = v_sysorg
     where t.created_at >= v_lo and t.created_at < v_lo + v_window
       and t.organization_id is null;
    get diagnostics v_batch = row_count;
    v_batches := v_batches + 1;
    v_moved := v_moved + v_batch;
    raise notice 'dd173-arl-b: batch % — % row(s) in [%, %)', v_batches, v_batch, v_lo, v_lo + v_window;
    if v_batch = 0 then
      raise exception 'dd173-arl-b: the window starting at % moved 0 rows while a row with no organization exists at exactly that instant. The cursor cannot advance, so this file would spin; nothing further was done and the transaction is rolled back.', v_lo;
    end if;
  end loop;

  select min(t.created_at) into v_lo from ops.api_request_log t where t.organization_id is null;
  if v_lo is null then
    raise notice 'dd173-arl-b: % row(s) in % batch(es); NOTHING is left without an organization — step C can seal.', v_moved, v_batches;
  else
    raise notice 'dd173-arl-b: % row(s) in % batch(es); the backlog now starts at % — run the next numbered batch file.', v_moved, v_batches, v_lo;
  end if;
end $dd173arlb$;
