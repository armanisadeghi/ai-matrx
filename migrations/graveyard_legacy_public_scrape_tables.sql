-- Retire the LEGACY public.scrape_* scraper system (25 tables) — superseded by
-- the scraper.* crawl system in the matrx-scraper package.
--
-- Why: while these tables sat in public, matrx-orm codegen kept regenerating
-- db/managers/scrape_*.py in aidream, and the app could read/write the dead
-- system (split-brain). Reference cleanup was blocked on the tables being gone.
--
-- Safety: SET SCHEMA graveyard physically preserves every row (verified: 7237
-- rows across 25 tables, identical pre/post) and is reversible. The old data is
-- NOT present in the new scraper.* schema (different system, not a 1:1 rename),
-- so graveyard — NOT a hard DROP — is mandatory until a port decision is made.
-- A later, PITR-gated DROP can remove them from graveyard once confirmed dead.
--
-- Self-contained set: no inbound FKs from non-scrape tables, no external views.
-- Idempotent: only moves tables that still live in public.

do $$
declare r record; moved int := 0;
begin
  for r in
    select tablename from pg_tables
    where schemaname='public' and tablename like 'scrape\_%' escape '\'
    order by tablename
  loop
    execute format('alter table public.%I set schema graveyard', r.tablename);
    moved := moved + 1;
  end loop;
  raise notice 'graveyarded % legacy scrape_ tables', moved;
end $$;
