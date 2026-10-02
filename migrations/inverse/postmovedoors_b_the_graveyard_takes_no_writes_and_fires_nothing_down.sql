-- INVERSE of migrations/campaign/postmovedoors_b_the_graveyard_takes_no_writes_and_fires_nothing.sql (lane POST-MOVE-DOORS):
-- the graveyard's triggers and client grants exactly as they were on production 2026-10-01 before the file (every user
-- trigger on the nine tables was enabled; `authenticated` held INSERT/SELECT/UPDATE/DELETE on the three test tables;
-- udt_dataset_row_versions_id_seq granted SELECT to anon and SELECT/UPDATE/USAGE to authenticated).
-- ground-standing-ok: c — the loop above the drop detaches every _0_graveyard_takes_no_writes trigger (dynamic DROP TRIGGER per
-- graveyard table) before the function they run is dropped; nothing runs it after the inverse.
-- lane: POST-MOVE-DOORS

set local lock_timeout = '3s';

do $graveyard$
declare
  r record;
begin
  for r in
    select c.oid::regclass as t
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'graveyard' and c.relkind in ('r', 'p')
     order by c.relname
  loop
    execute format('drop trigger if exists _0_graveyard_takes_no_writes on %s', r.t);
    execute format('alter table %s enable trigger user', r.t);
  end loop;
end
$graveyard$;

drop function if exists platform._graveyard_takes_no_writes();

do $grants$
begin
  if to_regclass('graveyard.pb_claim_appeals_fd31de') is not null then
    grant select, insert, update, delete on table graveyard.pb_claim_appeals_fd31de to authenticated;
  end if;
  if to_regclass('graveyard.pb_insurance_claims_fd31de') is not null then
    grant select, insert, update, delete on table graveyard.pb_insurance_claims_fd31de to authenticated;
  end if;
  if to_regclass('graveyard.provlock_recall_visits_all8u5') is not null then
    grant select, insert, update, delete on table graveyard.provlock_recall_visits_all8u5 to authenticated;
  end if;
  if to_regclass('graveyard.udt_dataset_row_versions_id_seq') is not null then
    grant select on sequence graveyard.udt_dataset_row_versions_id_seq to anon;
    grant select, update, usage on sequence graveyard.udt_dataset_row_versions_id_seq to authenticated;
  end if;
end
$grants$;
