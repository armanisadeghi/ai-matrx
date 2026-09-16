-- target: branch,production
-- chair-step: narrowing platform.entity_types.rls_variant back to six values is not additive by construction; it is the abort checklist's step and runs with the chair awake
--
-- THE INVERSE: `platform.entity_types.rls_variant` back to its six values.
--
-- 🚨 RE-HEADED 2026-09-16, AND IT NOW NAMES PRODUCTION, BECAUSE PRODUCTION HAS THE
-- WIDENING. `custom_entity_types_detail_variant.sql` was applied to production at
-- 2026-09-16 03:52:12Z by the scheduled fleet release `release-all: v0.4.1940`
-- (ledger row: source=matrx-frontend, duration_ms=554, checksum identical to the
-- branch's). Both CHECK constraints on production name `detail` today; verified by
-- SELECT on pg_constraint. An inverse headed `-- target: branch` could not undo the
-- half that actually exists, which is precisely §8.9's "the abort checklist cannot
-- undo it".
--
-- It also no longer carries `-- migrate: skip:`. That marker made it unrunnable by
-- ANY path — `pnpm db:apply` refuses a skip-marked file outright and the Supabase MCP
-- path is forbidden in this repo — so the checklist depended on a file nothing could
-- execute. It lives in `migrations/inverse/` instead: no release sweeps that
-- directory (every migration glob in both repos is non-recursive), so the marker's
-- job is done structurally, and `-- chair-step:` makes the runner print this reason
-- and the file's ENTIRE body before a byte of it executes.
--
--     pnpm db:apply migrations/inverse/custom_entity_types_detail_variant_down.sql --target production
--
-- It REFUSES while any row actually reads `detail`. Narrowing a CHECK under live
-- rows is how a table stops accepting its own contents: Postgres would reject the
-- ADD CONSTRAINT outright, but by then the widened pair is already dropped inside
-- this transaction, so the failure would be reported as a constraint-violation
-- rather than as what it is. The count is taken FIRST and the refusal says what to
-- do about it.

do $$
declare
  n integer;
begin
  select count(*) into n from platform.entity_types where rls_variant = 'detail';
  if n > 0 then
    raise exception
      'entity_types.rls_variant: % row(s) are ''detail'' — narrowing the constraint back to six '
      'values would make the table refuse its own rows.', n
      using hint = 'Re-classify those rows first (they were classified by the lane that introduced '
                   'detail), then re-run this inverse.';
  end if;
end $$;

alter table platform.entity_types
  drop constraint entity_types_rls_variant_valid,
  drop constraint entity_types_rls_variant_check,
  add constraint entity_types_rls_variant_valid
    check (rls_variant = any (array['entity'::text, 'component'::text, 'system'::text,
                                    'restricted'::text, 'ledger'::text, 'personal'::text])),
  add constraint entity_types_rls_variant_check
    check (rls_variant is null or rls_variant = any (array['entity'::text, 'component'::text,
                                                           'ledger'::text, 'system'::text,
                                                           'restricted'::text, 'personal'::text]));

do $$
declare
  n integer;
begin
  select count(*) into n
    from pg_constraint
   where conrelid = 'platform.entity_types'::regclass
     and conname in ('entity_types_rls_variant_valid', 'entity_types_rls_variant_check')
     and pg_get_constraintdef(oid) like '%detail%';
  if n <> 0 then
    raise exception 'entity_types rls_variant: % constraint(s) still name ''detail'' after the inverse', n;
  end if;
  raise notice 'entity_types.rls_variant is back to six values; neither CHECK constraint names detail.';
end $$;
