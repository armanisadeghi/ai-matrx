-- chair-step: lane POST-MOVE-DOORS (2026-10-01), after step two — the graveyard is read-only data: nothing in it is
-- written, and nothing fires. Found after the move (v6 CENSUS-CLEANUP gap 3): the six moved udt_* tables kept their
-- live triggers (search-index sync, version capture, association GC, org inheritance — 78 user triggers); their write
-- refusal, workbench._moved_older_table_takes_no_writes, itself reads workbench.udt_* and so answers any write with a
-- raw 42P01; and the three test tables already in the graveyard (pb_*_fd31de, provlock_recall_visits_all8u5) had no
-- refusal at all, kept INSERT/UPDATE/DELETE for `authenticated`, and fire their search-index and association triggers
-- on any write. For EVERY table in schema graveyard (today's nine, and the same holds for whatever moves later):
--   · every client grant (anon, authenticated) on the table and on the graveyard's sequences is revoked
--     (permission change; written for Arman in operations/for-arman/2026-10-01/decisions-made-without-you.md item 6);
--   · every user trigger is disabled (the rows stay exactly as they are; FK triggers are internal and untouched);
--   · one statement trigger refuses every INSERT / UPDATE / DELETE / TRUNCATE with a people sentence.
-- The rows are not touched. No role but the owner has USAGE on graveyard (unchanged).
-- Locks: SHARE ROW EXCLUSIVE on each graveyard table (trigger DDL), on graveyard tables only.
-- lane: POST-MOVE-DOORS
-- INVERSE: migrations/inverse/postmovedoors_b_the_graveyard_takes_no_writes_and_fires_nothing_down.sql

set local lock_timeout = '3s';

create or replace function platform._graveyard_takes_no_writes()
 returns trigger
 language plpgsql
 set search_path to 'pg_catalog'
as $function$
begin
  -- POST-MOVE-DOORS: a table in the graveyard is kept as it was when it moved; it takes no changes.
  raise exception 'This table is in the archive and takes no changes. Tables and lists live in the new system now: open them from /data.'
    using errcode = '42501',
          hint = tg_table_schema || '.' || tg_table_name || ' is in the graveyard (read-only); nothing was changed.';
end;
$function$;
revoke all on function platform._graveyard_takes_no_writes() from public, anon, authenticated;

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
    execute format('revoke all on table %s from anon, authenticated', r.t);
    execute format('alter table %s disable trigger user', r.t);
    execute format('create trigger _0_graveyard_takes_no_writes before insert or update or delete or truncate on %s '
                   'for each statement execute function platform._graveyard_takes_no_writes()', r.t);
  end loop;
end
$graveyard$;

revoke all on all sequences in schema graveyard from anon, authenticated;
