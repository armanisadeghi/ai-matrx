-- LANE STORE-VERSION-NOOP — THE CENSUS THAT KEEPS IT ZERO. GREEN when no live record and no
-- saved view has a version ahead of the last version its history recorded.
--
-- Why a census and not only the seat suite: the trigger stops NEW drift; this sees OLD drift and
-- any new way in (a closed history capture, a trigger someone disabled, a door that writes with
-- `session_replication_role = replica`). Ratchet ZERO: no baseline, no allow-list. RED on the main
-- database until `storeversionnoop_the_versions_ahead_of_their_history_come_back.sql` is applied
-- there. Read-only; ends in ROLLBACK.
--
--   1  custom.record rows ahead of their history: 0 (prints the split by data_class when not)
--   2  platform.saved_view rows ahead of their history: 0
--   3  the trigger is bound, enabled and LAST among before-row UPDATE triggers on both tables

\set ON_ERROR_STOP on
\set suite 'storeversionnoop_census_green.sql'
\set requires 'function:platform.no_change_keeps_its_version'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin transaction read only;
set local statement_timeout = '120s';

do $census$
declare
  v_n int; v_split text; v_last text; t regclass;
begin
  with h as (select row_id, organization_id, max(version) mv from history.row_versions
              where entity_type = 'custom.record' group by 1, 2)
  select count(*), string_agg(distinct r.data_class, ', ') into v_n, v_split
    from custom.record r join h on h.row_id = r.id and h.organization_id = r.organization_id
   where r.deleted_at is null and r.version > h.mv;
  if v_n <> 0 then
    raise exception '1: % custom.record row(s) are ahead of their history (%): a screen that reads the version from the history is behind on each and is told "someone else wrote first"', v_n, v_split;
  end if;
  raise notice '1 PASSED — no custom.record row is ahead of its history';

  with h as (select row_id, max(version) mv from history.row_versions
              where entity_type = 'platform_saved_view' group by 1)
  select count(*) into v_n from platform.saved_view v join h on h.row_id = v.id
   where v.deleted_at is null and v.version > h.mv;
  if v_n <> 0 then
    raise exception '2: % platform.saved_view row(s) are ahead of their history', v_n;
  end if;
  raise notice '2 PASSED — no saved view is ahead of its history';

  foreach t in array array['custom.record'::regclass, 'platform.saved_view'::regclass] loop
    select tg.tgname into v_last from pg_trigger tg
     where tg.tgrelid = t and not tg.tgisinternal and tg.tgenabled <> 'D'
       and (tg.tgtype & 2) = 2 and (tg.tgtype & 16) = 16      -- BEFORE, UPDATE
       and (tg.tgtype & 1) = 1                                -- ROW
     order by tg.tgname collate "C" desc limit 1;
    if v_last is distinct from 'zzzzz_no_change_keeps_its_version' then
      raise exception '3: the last enabled before-row UPDATE trigger on % is %, not zzzzz_no_change_keeps_its_version — a no-op write will move the version again', t, v_last;
    end if;
  end loop;
  raise notice '3 PASSED — the trigger is bound, enabled and last on custom.record and platform.saved_view';
  raise notice 'storeversionnoop_census_green: ALL 3 CLAUSES PASSED';
end $census$;

rollback;
