-- target: branch
--
-- THE REFRESH'S RECEIPT — `campaign_watch.refresh_run`.
--
-- WHAT IT IS FOR
-- --------------
-- BUILD-BOOK §13 makes THE REFRESH a MERGE rather than a replace, and then makes
-- `W7-GATE`'s entry the RECEIPT that merge writes: the gate reads the latest row here
-- and FAILS when it is absent, when it pre-dates the last lane's DONE, when
-- `campaign_rows_before` and `campaign_rows_after` disagree for either marker table, or
-- when `rehearsed_in_wave_2` is false. A verdict that could be satisfied by a note in a
-- log is not a verdict, so the receipt is a ROW, written by the run itself
-- (`scripts/gate-corpus/restore-graph.ts --merge`) and by nothing else.
--
-- WHY IT IS BRANCH-ONLY
-- ---------------------
-- THE REFRESH exists because the rehearsal branch's copy of production ages past §13's
-- twelve-hour ceiling while the campaign runs. Production has no copy to refresh and no
-- gate to satisfy, so this table has no reason to exist there — hence
-- `migrations/rehearsal/`, the directory no release path can sweep, and
-- `-- target: branch`, which both runners refuse to carry to production.
--
-- WHY THE COUNTS ARE `jsonb` AND NOT COLUMNS
-- ------------------------------------------
-- §13 names two marker tables (`platform.associations`, `platform.reachability`) because
-- those are the two the campaign writes into today. The copy set has twenty-five entries
-- and grows; a column pair per table would need a migration every time a lane starts
-- writing somewhere new, on a branch where a migration costs a lock. The keys are the
-- fully-qualified table names, so the gate's own query names the table it means:
--
--   select (campaign_rows_before->>'platform.associations')::bigint
--        = (campaign_rows_after ->>'platform.associations')::bigint
--      and (campaign_rows_before->>'platform.reachability')::bigint
--        = (campaign_rows_after ->>'platform.reachability')::bigint
--        and rehearsed_in_wave_2
--     from campaign_watch.refresh_run order by id desc limit 1;
--
-- `per_table` carries one object per copied table:
--   { "inserted": n, "updated": n, "skipped_campaign_owned": n, "deleted": n }
-- `skipped_campaign_owned` is the number §13 point 2 is about — rows the merge left
-- exactly as it found them because the campaign, not production, wrote them.
--
-- `marker` records HOW campaign ownership was decided on that run, because the answer
-- changes what the counts mean and a receipt that hides it is a receipt that lies:
--   'origin-column'                   — `origin = 'campaign'`, §13's own marker, which
--                                       exists once `W1-REL` has landed the column.
--   'absent-from-production-snapshot' — the fallback used until then: a branch row whose
--                                       primary key production's snapshot does not hold
--                                       is treated as campaign-owned. Strictly
--                                       conservative (it can only over-protect), and the
--                                       run says so out loud.
--
-- IDEMPOTENT BY CONSTRUCTION — `if not exists` throughout.

create schema if not exists campaign_watch;

create table if not exists campaign_watch.refresh_run (
    id bigserial primary key,
    ran_at timestamptz not null default now(),
    -- The lane or seat that ran the refresh, so a receipt is attributable.
    lane text,
    -- THE PRODUCTION SNAPSHOT ID — `pg_current_snapshot()::text`, taken inside the one
    -- `repeatable read read only` transaction every count and every row came from.
    prod_snapshot text not null,
    -- The boundary: production's own `now()` inside that snapshot. `W7-GATE` measures
    -- the copy's age as `now() - prod_taken_at`, so it is a point in time, never text.
    prod_taken_at timestamptz not null,
    marker text not null,
    per_table jsonb not null,
    campaign_rows_before jsonb not null,
    campaign_rows_after jsonb not null,
    -- Set true by `--merge --rehearsal`, which is `W2-EPOCH`'s wave-2 rehearsal (§13.5).
    rehearsed_in_wave_2 boolean not null default false
);

comment on table campaign_watch.refresh_run is
    'BUILD-BOOK §13. One row per restore-graph.ts --merge run on the rehearsal branch. W7-GATE reads the latest row and FAILS without it.';
comment on column campaign_watch.refresh_run.marker is
    'How campaign ownership was decided: origin-column (§13''s origin = ''campaign'') or absent-from-production-snapshot (the conservative fallback used before W1-REL lands the column).';
comment on column campaign_watch.refresh_run.per_table is
    'table -> {inserted, updated, skipped_campaign_owned, deleted} for that run.';
comment on column campaign_watch.refresh_run.campaign_rows_before is
    'table -> count of campaign-owned rows immediately BEFORE the merge. §13.6 requires it to equal campaign_rows_after.';
comment on column campaign_watch.refresh_run.campaign_rows_after is
    'table -> count of campaign-owned rows immediately AFTER the merge.';
