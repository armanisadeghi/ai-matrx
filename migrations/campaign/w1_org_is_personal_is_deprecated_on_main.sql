-- chair-step: this DROPS a live unique index, iam.organizations_one_personal_per_creator, which
--   today enforces "one personal organization per creator" on a table with 629 rows, 468 of them
--   flagged is_personal. Nothing else here is destructive: the column itself STAYS (it is
--   deprecated, not dropped), and the rest is a comment, a register row and one new read-only
--   function. The drop is the whole point — REC-61 / Doctrine R11 say the default organization is
--   a PERSON's preference (users.user_preferences.default_organization_id, read through
--   iam.default_organization_id) and not a flag on the organization, so the flag must stop RULING
--   before its 40 readers can be moved off it one at a time. A person reads the whole body.
--
-- w1_org_is_personal_is_deprecated_on_main.sql
--
-- W1-ORG — REC-61's second half, THE PRODUCTION HALF, for the MAIN database.
--
-- WHY THIS FILE EXISTS AS A NEW FILE (W1-ORG-PREP, 2026-09-22)
-- ------------------------------------------------------------
-- The rehearsed bytes are `migrations/campaign/w1_org_is_personal_is_deprecated_and_audience_is_a_word.sql`,
-- headed `-- target: branch` because the night it was written was branch-only. That header is now
-- a REFUSAL at production (`pnpm db:apply --judge-only` verdict `header-flag-disagree`,
-- 2026-09-22), and that file is ledgered on the rehearsal branch, so its bytes are not editable.
-- The lane's own precedent for this exact situation is
-- `w1_org_a_door_is_compared_by_argument_type_on_main.sql`: a NEW file, the same statements, a
-- `-- chair-step:` header that says why a person reads it.
--
-- AND WHY IT IS SPLIT IN TWO. The rehearsed file carried REC-61 (this) and REC-64 (the audience
-- word on `context.templates`) together. They share nothing: different schemas, different tables,
-- different readers, different revert. Kept together, either one's problem holds the other back,
-- and the transaction is longer than it needs to be while it holds a lock on `iam.organizations`.
-- REC-64 is now `w1_org_audience_is_a_word_on_main.sql` and the two apply in either order.
--
-- MEASURED ON PRODUCTION, 2026-09-22 (SELECT-only), every assumption this file makes:
--   * the index exists, exactly as the rehearsal found it:
--       CREATE UNIQUE INDEX organizations_one_personal_per_creator ON iam.organizations
--         USING btree (created_by) WHERE ((is_personal IS TRUE) AND (created_by IS NOT NULL))
--   * `iam.organizations` holds 629 rows, 468 with is_personal = true
--   * `platform.deprecated_relations` exists and carries (old_ref, new_ref, archived_as, reason,
--     deprecated_at); no row for `iam.organizations.is_personal` yet
--   * `iam.is_personal_dependents()` does NOT exist on production (it is created here)
--   * there is NO check constraint on is_personal on either database — the partial unique index is
--     the only enforcement object, which is the correction this lane measured on 2026-09-18 and
--     which REC-61's evidence cell still gets wrong
--
-- THE LOCK, SAID PLAINLY. `drop index` takes ACCESS EXCLUSIVE on `iam.organizations` — a hot
-- table: every signup inserts into it. The drop is a catalog change, not a rewrite, so it is
-- measured in milliseconds once it has the lock; `lock_timeout = '5s'` means it gives up rather
-- than queues behind a long reader, and this file is short so the lock is released almost at once.
-- Nothing else in this file touches `iam.organizations` at all.
--
-- WHAT MAKES IT FAIL (the guards that own this class):
--   scripts/campaign-tests/w1_org_c7_is_personal_deprecation.sql  (green)
--   scripts/campaign-tests/w1_org_red_is_personal_deprecation.sql (red twin)
-- Both declare `function:iam.is_personal_dependents` and `!relation:iam.organizations_one_personal_per_creator`
-- to the shared preamble and SKIP BY NAME until this file lands. They light up on their own the
-- day it does.
--
-- REVERT: migrations/inverse/w1_org_is_personal_is_deprecated_on_main_down.sql

set lock_timeout = '5s';

-- 1. THE FLAG STOPS RULING. ------------------------------------------------------------------
drop index iam.organizations_one_personal_per_creator;

comment on column iam.organizations.is_personal is
  'DEPRECATED (REC-61 / Doctrine R11: "Default organization is a user preference, never an organization flag"). It no longer rules anything — its partial unique index organizations_one_personal_per_creator was removed by the unified-data campaign, so it records and does not enforce. The replacement is users.user_preferences.default_organization_id, read through iam.default_organization_id(person). Remedy for a body that still reads this column: ask iam.default_organization_id(person) = organizations.id instead, and remove the read. The remaining readers are the live list from iam.is_personal_dependents(); the column is dropped when that list is empty.';

-- 2. THE DEPRECATION IS REGISTERED, NOT REMEMBERED. -------------------------------------------
insert into platform.deprecated_relations (old_ref, new_ref, reason)
values ('iam.organizations.is_personal',
        'users.user_preferences.default_organization_id',
        'REC-61 / Doctrine R11. The default organization is a PERSON''s preference, not a property of the organization, so the flag cannot answer the question it was being asked. Enforcement (the partial unique index organizations_one_personal_per_creator) was removed by the campaign; the column stays until iam.is_personal_dependents() returns zero rows.')
on conflict (old_ref) do nothing;

-- 3. THE REWRITE LIST IS A QUERY, NOT A DOCUMENT. ---------------------------------------------
create or replace function iam.is_personal_dependents()
returns table(kind text, identity text, detail text)
language sql
stable
set search_path to 'pg_catalog'
as $function$
  select 'function',
         n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         'body reads is_personal'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.prosrc ~ '\mis_personal\M'
  union all
  select 'policy', pol.schemaname || '.' || pol.tablename || ' / ' || pol.policyname,
         'policy expression reads is_personal'
    from pg_policies pol
   where coalesce(pol.qual, '') ~ '\mis_personal\M'
      or coalesce(pol.with_check, '') ~ '\mis_personal\M'
  union all
  select 'view', v.schemaname || '.' || v.viewname, 'view definition reads is_personal'
    from pg_views v
   where v.definition ~ '\mis_personal\M'
  union all
  select 'index', i.schemaname || '.' || i.indexname, i.indexdef
    from pg_indexes i
   where i.indexdef ~ '\mis_personal\M'
  union all
  select 'constraint', c.conrelid::regclass::text || ' / ' || c.conname, pg_get_constraintdef(c.oid)
    from pg_constraint c
   where pg_get_constraintdef(c.oid) ~ '\mis_personal\M'
   order by 1, 2;
$function$;

comment on function iam.is_personal_dependents() is
  'REC-61''s classification, as a live query rather than a remembered count: every function body, policy expression, view definition, index and constraint that still reads is_personal. The column is dropped when this returns zero rows. Includes context.templates.is_personal readers too, which is the point — one question, one answer, both tables.';
