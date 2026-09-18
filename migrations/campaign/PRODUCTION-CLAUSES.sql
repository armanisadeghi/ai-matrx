-- ============================================================================
-- RULE 14'S PRODUCER — every DDL lane's production clause, as SQL, run at
-- DISPATCH, against production, SELECT-ONLY.
--
-- WHY THIS FILE EXISTS (ATTACK-8 finding 8.7).
-- Rule 14 says: "The chair runs each DDL lane's production clause as SQL at
-- dispatch and replaces any that returns true with one naming an object, a hash
-- or a row COUNT the lane itself creates." There was no list, no script and no
-- artefact — which is precisely how two clauses became already-true without
-- anyone noticing. `W2-TRUST`'s ("both objects exist behind their guards":
-- `iam.emergency_door_request` has been live with eight readers for months) and
-- `W3-HIST`'s ("the append-only History store exists": `history.row_versions`
-- holds 1.3 M rows across 20 partitions) were gates that could not fail, and
-- ATTACK-7 found them by hand, one at a time.
--
-- HOW IT IS USED.
--   1. At dispatch, before the first lane of a wave opens, the chair runs this
--      whole file against PRODUCTION inside `begin transaction read only`.
--   2. The result is pasted into `v5/BUILD-LOG.md`, verbatim.
--   3. Every row whose `already_true` is TRUE is a clause the lane cannot fail.
--      It is REWRITTEN before that lane is dispatched — to an object name, a
--      `pg_get_functiondef` hash or a row count the lane itself creates — and
--      the rewrite goes into `BUILD-BOOK.md` §1 in the same commit.
--   4. A DDL lane with no row in this file is a lane nobody checked. Adding the
--      lane means adding its row here first.
--
-- IT IS NOT A MIGRATION. It lives in `migrations/campaign/`, which no release
-- path, sweep, CI job or scheduled job scans, and it contains no DDL and no
-- write of any kind. `pnpm db:apply` is never pointed at it.
--
-- FIRST RUN, 2026-09-16, against production SELECT-only: 18 lanes, and **FOUR**
-- clauses came back already true, not the two ATTACK-7 found by hand —
--   W2-TRUST   iam.emergency_door_request exists          (known)
--   W3-HIST    history.row_versions exists                (known)
--   W1-INDEX   platform.custom_field_index_expr exists    (NEW)
--   W1-REL     platform.associations.payload/payload_kind (NEW)
-- The last two are new findings of this file's first run, and they are exactly
-- what rule 14 exists to catch. Whether each is the LANE's clause or only this
-- file's first transcription of it is settled at dispatch, with that lane's plan
-- in hand: a row here is a question put to the chair, never a verdict on the lane.
-- The ten campaign guards all resolve `false`; the four `custom/sandbox_*` rows
-- are the live component sandbox and are labelled as such rather than filtered.
--
--   psql "$PRODUCTION_DSN" -f migrations/campaign/PRODUCTION-CLAUSES.sql
--
-- or through any read-only client. Every branch of every query below is a
-- SELECT over a catalog.
-- ============================================================================

begin transaction read only;

select
  lane,
  clause,
  already_true,
  case
    when already_true
      then 'REWRITE BEFORE DISPATCH — this clause is satisfied by production as it stands, so the lane cannot fail it'
    else 'ok — the clause is false today, so the lane has to make it true'
  end as verdict
from (
  -- W1-TABLE — the two store tables and the containment trigger
  select 'W1-TABLE' as lane,
         'custom.table and custom.home exist, with the containment trigger' as clause,
         (to_regclass('custom.table') is not null
          and to_regclass('custom.home') is not null) as already_true
  union all
  -- W1-FIELD — the fields THIS lane creates, by name, never a count
  select 'W1-FIELD',
         'custom.field exists (the lane''s own field names are checked at its exit, not here)',
         to_regclass('custom.field') is not null
  union all
  -- W1-RULE
  select 'W1-RULE',
         'custom.rule exists with a version column',
         (to_regclass('custom.rule') is not null
          and exists (select 1 from pg_attribute
                       where attrelid = to_regclass('custom.rule') and attname = 'version'
                         and attnum > 0 and not attisdropped))
  union all
  -- W1-VAL — the value-envelope check constraint
  select 'W1-VAL',
         'the value-envelope check constraint is present in pg_constraint',
         exists (select 1 from pg_constraint c
                  join pg_namespace n on n.oid = c.connamespace
                 where n.nspname = 'custom' and c.contype = 'c'
                   and c.conname like '%value%envelope%')
  union all
  -- W1-INDEX — the generator function and its guard
  select 'W1-INDEX',
         'platform.custom_field_index_expr exists and custom/field_index_guard resolves OFF',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'platform' and p.proname = 'custom_field_index_expr')
  union all
  -- W1-ORG — the signup-provisioning body this lane replaces
  select 'W1-ORG',
         'public._provision_new_user_personal_org() already carries this lane''s new body',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = '_provision_new_user_personal_org'
                    and pg_get_functiondef(p.oid) like '%custom%')
  union all
  -- W1-REL — the new association columns
  select 'W1-REL',
         'the new platform.associations columns exist',
         (select count(*) from pg_attribute
           where attrelid = 'platform.associations'::regclass and attnum > 0 and not attisdropped
             and attname in ('payload_kind', 'payload')) = 2
  union all
  -- W1-TIER — REWRITTEN 2026-09-17 BY THE LANE, to the names its plan actually gives
  -- these objects (rule 14: "a clause that names an object CLASS rather than a NAME is
  -- rewritten at dispatch to the names the lane's plan gives them"). It used to name
  -- `custom.tier_stub`, which no file in this campaign ever creates, so it could never
  -- have been true and could never have been informative either. Every predicate below is
  -- a CATALOGUE read — nothing references `custom.external_source` statically, because a
  -- clause that fails to PARSE on a production where schema `custom` does not yet exist
  -- reports nothing at all. Measured on production 2026-09-17 16:28 UTC, SELECT-only:
  -- schema `custom` itself does not exist there (W1-STORE / W1-PROV are attended steps),
  -- so this clause is FALSE today and turns true only when this lane's own files land.
  select 'W1-TIER',
         'the stub table custom.external_link, the source registry custom.external_source with its writes_enabled opt-in defaulting FALSE, and the private schema custom_external all exist',
         to_regclass('custom.external_link') is not null
           and to_regclass('custom.external_source') is not null
           and to_regnamespace('custom_external') is not null
           and (select count(*) from pg_attribute a
                  join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
                 where a.attrelid = to_regclass('custom.external_source')
                   and a.attname = 'writes_enabled' and a.attnotnull
                   and pg_get_expr(d.adbin, d.adrelid) = 'false') = 1
  union all
  -- W2-VIS — the derivation function
  select 'W2-VIS',
         'the visibility derivation function exists',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'platform' and p.proname like '%derive%visibility%')
  union all
  -- W2-EPOCH — the epoch columns and the pair cache
  select 'W2-EPOCH',
         'the epoch columns exist on the epoch-bearing table',
         exists (select 1 from pg_attribute
                  where attrelid = 'platform.reachability'::regclass and attnum > 0
                    and not attisdropped and attname = 'epoch')
  union all
  -- W2-ACCESS
  select 'W2-ACCESS',
         'iam.member_default_level exists (§16 finding 31 says it does not — this lane NAMES it)',
         to_regclass('iam.member_default_level') is not null
  union all
  -- W2-TRUST — ATTACK-7 finding 5's first instance. KEPT HERE ON PURPOSE.
  select 'W2-TRUST',
         'iam.emergency_door_request exists (the OLD clause — kept so this file demonstrates its own point)',
         to_regclass('iam.emergency_door_request') is not null
  union all
  -- W3-HIST — ATTACK-7 finding 5's second instance. KEPT HERE ON PURPOSE.
  select 'W3-HIST',
         'history.row_versions exists (the OLD clause — kept so this file demonstrates its own point)',
         to_regclass('history.row_versions') is not null
  union all
  -- W3-MIG — the ten verb functions
  select 'W3-MIG',
         'all ten custom.* migration verb functions exist',
         (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'custom' and p.proname like 'migrate_%') >= 10
  union all
  -- W4-QUERY
  select 'W4-QUERY',
         'the custom.* query functions exist',
         (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'custom' and p.proname like 'query_%') > 0
  union all
  -- W4-IO
  select 'W4-IO',
         'the import and automation tables exist',
         (to_regclass('custom.import_run') is not null
          and to_regclass('custom.automation') is not null)
  union all
  -- W4-DOOR
  select 'W4-DOOR',
         'the read-door object and the masking function exist',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'custom' and p.proname like '%mask%')
  union all
  -- W5-AGENT
  select 'W5-AGENT',
         'the seven agent verb functions and the tool cache exist',
         (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'custom' and p.proname like 'agent_%') >= 7
) t
order by already_true desc, lane;

-- The guards every DDL lane's clause also reads: a guarded object may only land
-- on production while its knob resolves OFF (§6b). A row missing here is a lane
-- that cannot apply at all.
--
-- The four `sandbox_*` keys are NOT this campaign's guards — they are the live
-- component-sandbox settings §8.9 step 2 warns about, and they carry real values
-- (a pixel height, a byte ceiling, a boolean that is on). They are listed and
-- labelled rather than filtered out, because a filtered row is a row nobody sees.
select
  f.feature, f.key,
  platform.knob_resolve(f.feature, f.key, null)::text as resolves,
  case
    when f.key like 'sandbox\_%' then 'not a campaign guard — the live component sandbox (§8.9 step 2)'
    when platform.knob_resolve(f.feature, f.key, null)::text = 'false' then 'ok'
    else 'NOT OFF — no guarded file may land while this is not false'
  end as verdict
from platform.feature_knob f
where f.feature = 'custom'
order by (f.key like 'sandbox\_%'), f.key;

rollback;
