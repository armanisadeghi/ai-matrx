-- LANE W1-ORG — `C-7` BLOCK 2, SPLIT OUT: REC-62's COLUMN HALF, ON WHATEVER DATABASE HAS IT.
--
-- WHY IT IS ITS OWN FILE (SUITES-TIDY, 2026-09-22). It used to be block 2 of
-- `w1_org_c7.sql`. The rename it asserts lives in
-- `migrations/campaign/w1_org_billing_owner_columns_move_to_the_organization.sql`, which is
-- `-- target: branch`: it renames live columns, drops one, re-points live foreign keys and
-- replaces five RLS policies, so it was held for an attended step and has never been applied
-- to the main database. Measured on the dev clone (production's own data) 2026-09-22: zero of
-- the three `organization_id` columns exist; the tables still carry `user_id` / `org_id`.
--
-- Keeping it inside C-7 meant one unshipped law took five shipped ones down with it. Here it
-- DECLARES the three columns to the shared preamble, so on a database that has the move it
-- asserts, and on one that does not it SKIPS BY NAME — which the preamble prints as
-- "this is NOT a pass" — and lights up on its own the day the move lands.
--
-- WHAT MAKES IT FAIL: put `user_id` back on any of the three tables, or point
-- `billing.customer.organization_id`'s foreign key at a person again.
--
--   "$PSQL" "$DSN" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/w1_org_c7_billing_columns.sql

\set ON_ERROR_STOP on
\timing off

\set suite 'w1_org_c7_billing_columns.sql'
\set requires 'column:billing.customer.organization_id|column:billing.subscription.organization_id|column:billing.connect_account.organization_id'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;

do $t$
declare
  v_n integer;
begin
  select count(*) into v_n
    from information_schema.columns
   where (table_schema, table_name, column_name) in
         (('billing','customer','organization_id'),
          ('billing','connect_account','organization_id'),
          ('billing','subscription','organization_id'));
  if v_n <> 3 then
    raise exception 'C-7 2a: only % of the 3 billing tables carry organization_id', v_n;
  end if;
  select count(*) into v_n
    from information_schema.columns
   where table_schema = 'billing' and column_name in ('user_id','org_id')
     and table_name in ('customer','connect_account','subscription');
  if v_n <> 0 then
    raise exception 'C-7 2b: % legacy owner column(s) survive on the billing tables', v_n;
  end if;
  -- and the foreign key points at an ORGANIZATION, not at a person
  select count(*) into v_n
    from pg_constraint c
   where c.conrelid = 'billing.customer'::regclass and c.contype = 'f'
     and c.confrelid = 'iam.organizations'::regclass;
  if v_n <> 1 then
    raise exception 'C-7 2c: billing.customer.organization_id does not reference iam.organizations';
  end if;
  raise notice 'GREEN 2 — REC-62: all three billing tables key on organization_id, no user_id or org_id survives, and the FK points at iam.organizations';

end $t$;

rollback;
