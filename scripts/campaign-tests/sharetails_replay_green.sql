-- LANE SHARE-TAILS — THE REPLAY SUITE. "Who could see this on that day" stays honest about the
-- "mine" repair.
--
-- THE REAL USE CASE: test@test.com's "Spring planting orders" table in Oak & River
-- (ccb74808-e9f4-4dd0-a572-d1e1bc4228e3) was set to "Only people I share it with" at 13:38Z on
-- 2026-09-25, but the store left it `internal` — every member could read it — until the repair
-- moved it to `personal` at 15:04:50Z. An owner of Oak & River asking custom.visibility_as_of about
-- 14:00Z must be told the truth of 14:00 (members could read it, and why), and about 15:10Z the
-- truth of 15:10 (they could not). The same must hold when history does not reach back and the
-- replay stands on today's row.
--
-- RUN IT (the MAIN database — the repaired records exist only there; one rolled-back transaction):
--   cd matrx-frontend && psql "<main DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/sharetails_replay_green.sql
-- It SKIPS by name anywhere the repair table holds no row for the orders table.
-- ITS RED: before sharetails_history_replay_knows_the_repair.sql it fails at R1 (no repair note).

\set ON_ERROR_STOP on
\timing off

\set suite 'sharetails_replay_green.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local statement_timeout = '120s';

do $t$
declare
  c_org   constant uuid := '4c425bfe-9a08-402f-9496-488580623f42';  -- Oak & River
  c_tbl   constant uuid := 'ccb74808-e9f4-4dd0-a572-d1e1bc4228e3';  -- Spring planting orders
  c_test  constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';  -- test@test.com, a member
  c_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';  -- admin@admin.com, the owner
  v_n int; v_l text;
begin
  if to_regclass('custom._share_tails_mine_repair') is null
     or not exists (select 1 from custom._share_tails_mine_repair where record_id = c_tbl) then
    raise notice 'SKIPPED: sharetails_replay_green.sql — this database holds no repair row for the orders table. This is NOT a pass.';
    return;
  end if;

  -- R1: at 14:00Z (after the owner chose mine, before the repair) the replay says so, and the
  -- organization's people are listed as reaching it, because they did.
  select count(*) into v_n from custom.visibility_as_of(c_org, c_tbl, '2026-09-25 14:00Z')
   where principal_kind = 'note' and through_kind = 'repair';
  if v_n <> 1 then raise exception 'R1 FAILED — the 14:00 replay does not name the repair (% note rows).', v_n; end if;
  select count(*) into v_n from custom.visibility_as_of(c_org, c_tbl, '2026-09-25 14:00Z')
   where principal_kind = 'user' and through_kind = 'organization' and principal_id in (c_test, c_admin);
  if v_n <> 2 then raise exception 'R1 FAILED — at 14:00 the organization''s two people reached it, the replay lists %.', v_n; end if;

  -- R2: at 15:10Z (after the repair) membership reaches nothing and no repair note is said.
  select count(*) into v_n from custom.visibility_as_of(c_org, c_tbl, '2026-09-25 15:10Z')
   where through_kind in ('organization', 'repair');
  if v_n <> 0 then raise exception 'R2 FAILED — at 15:10 the replay still lists % membership/repair row(s).', v_n; end if;

  -- R3: the member default replayed for the Table's rows: viewer at 14:00, nothing at 15:10.
  select d.level::text into v_l from iam.member_default_level_as_of(c_org, c_tbl, '2026-09-25 14:00Z') d;
  if v_l is distinct from 'viewer' then raise exception 'R3 FAILED — at 14:00 the member default for its rows replays as %.', v_l; end if;
  select d.level::text into v_l from iam.member_default_level_as_of(c_org, c_tbl, '2026-09-25 15:10Z') d;
  if v_l is not null then raise exception 'R3 FAILED — at 15:10 membership still confers % on the rows of a personal Table.', v_l; end if;

  -- R4: THE FALLBACK. Take the Table's own history away (rolled back) so the replay stands on
  -- today's `personal` row: the repair table must still say what 14:00 really was.
  delete from history.row_versions where entity_type = 'custom.record' and row_id = c_tbl;
  select count(*) into v_n from custom.visibility_as_of(c_org, c_tbl, '2026-09-25 14:00Z')
   where principal_kind = 'user' and through_kind = 'organization' and principal_id in (c_test, c_admin);
  if v_n <> 2 then raise exception 'R4 FAILED — standing on today''s row, the 14:00 replay lists % of the 2 people who reached it.', v_n; end if;
  select d.level::text into v_l from iam.member_default_level_as_of(c_org, c_tbl, '2026-09-25 15:10Z') d;
  if v_l is not null then raise exception 'R4 FAILED — standing on today''s row, 15:10 confers % on the rows.', v_l; end if;

  raise notice 'sharetails_replay_green: GREEN — the replay names the repair, lists who really reached it at 14:00, nobody by membership at 15:10, and holds when history stops short.';
end $t$;

rollback;
