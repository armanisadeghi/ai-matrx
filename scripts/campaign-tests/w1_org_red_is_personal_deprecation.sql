-- LANE W1-ORG — THE RED TWIN of `w1_org_c7_is_personal_deprecation.sql`.
--
-- WHY IT IS ITS OWN FILE (SUITES-TIDY, 2026-09-22). It was RED 3 of `w1_org_red.sql`: it
-- re-creates `iam.organizations_one_personal_per_creator` and shows that one statement puts
-- `is_personal` back in charge, undoing REC-61's deprecation. On the main database that index
-- HAS NEVER BEEN DROPPED — the W1-ORG migration that drops it is `-- target: branch` and was
-- held for an attended step — so "put it back" is a no-op there and the block proves nothing.
-- It therefore declares the deprecation to the preamble and SKIPS BY NAME where the wave has
-- not landed, exactly as its green twin does.
--
--   "$PSQL" "$DSN" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/w1_org_red_is_personal_deprecation.sql

\set ON_ERROR_STOP on
\timing off

\set suite 'w1_org_red_is_personal_deprecation.sql'
\set requires 'function:iam.is_personal_dependents|!relation:iam.organizations_one_personal_per_creator'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;

do $t$
declare
  v_n integer;
begin
  create unique index organizations_one_personal_per_creator
    on iam.organizations using btree (created_by)
    where ((is_personal is true) and (created_by is not null));
  select count(*) into v_n from pg_indexes
   where schemaname = 'iam' and indexname = 'organizations_one_personal_per_creator';
  if v_n <> 1 then
    raise exception 'RED 3 IS NOT RED: the enforcement index could not be put back';
  end if;
  raise notice 'RED 3 — the partial unique index is back, so is_personal ENFORCES again and REC-61''s deprecation is undone by one statement.';
end $t$;

rollback;
