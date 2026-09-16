-- target: branch
--
-- THE SEVENTH TABLE TYPE — `detail` — as a real migration, not an enum value.
--
-- WHAT THE BOOK GOT WRONG
-- -----------------------
-- The plan called this "the `detail` enum value" and put it in a lane whose
-- production half was to run under the campaign's additive rule. Both are wrong,
-- measured 2026-09-16:
--   · `platform.entity_types.rls_variant` is `text NOT NULL default 'entity'`.
--     There is no enum. It is constrained by TWO CHECK constraints, and both
--     enumerate the same six values:
--       entity_types_rls_variant_valid  CHECK (rls_variant = ANY (ARRAY[…six…]))
--       entity_types_rls_variant_check  CHECK (rls_variant IS NULL OR rls_variant = ANY (ARRAY[…six…]))
--     (the second allows NULL, which the column's NOT NULL already forbids — a
--     redundant pair, left exactly as found; this file widens both rather than
--     tidying one away, because removing a constraint is not this file's job.)
--   · Widening them needs `ALTER TABLE … DROP CONSTRAINT`, which the campaign's
--     own rule 4 ("no deletions, no drops") and the two-target header's additive
--     parser both forbid. So this file is `-- target: branch` ONLY. Its
--     production half is a chair step, run with the owner awake, naming both
--     constraints and their three dependents — never an unattended lane.
--
-- WHY THERE IS NO `-- based-on:` LINE
-- -----------------------------------
-- That header declares the FUNCTION BODY a `CREATE OR REPLACE FUNCTION` was
-- written against. This file replaces no function, so the rule does not reach it
-- — and leaving it at that would be exactly the hole the rule exists to close.
-- The same guarantee is made for constraints instead, below: the file ASSERTS
-- that each constraint's live definition is byte-for-byte the text it was written
-- against, and raises with both texts if it has moved. A concurrent widening by
-- another lane cannot be silently overwritten.
--
-- THE THREE DEPENDENTS ARE UNCHANGED, AND HERE IS WHY
-- ---------------------------------------------------
-- Three further constraints branch on `rls_variant` and none enumerates values,
-- so `detail` passes all three without edit — stated rather than assumed:
--   entity_types_component_flag_consistent  is_component = (rls_variant = 'component')
--       → a `detail` row must carry is_component = false.
--   entity_types_class_scope_ck             CASE 'component' … 'ledger' … ELSE true
--       → `detail` falls to ELSE true: it may carry data_class and default_list_scope.
--   entity_types_personal_is_private_ck     rls_variant <> 'personal' OR …
--       → true for `detail`.
--
-- REVERSIBLE. `custom_entity_types_detail_variant_down.sql`, in this commit,
-- restores both six-value definitions — and REFUSES while any row actually reads
-- `detail`, because narrowing a CHECK under live rows is how a table stops
-- accepting its own contents.
--
-- Live at the time of writing: 835 rows — component 323, entity 270, system 136,
-- restricted 44, ledger 38, personal 24, detail 0.

do $$
declare
  v_valid_now text;
  v_check_now text;
  v_valid_seen constant text :=
    'CHECK ((rls_variant = ANY (ARRAY[''entity''::text, ''component''::text, ''system''::text, ''restricted''::text, ''ledger''::text, ''personal''::text])))';
  v_check_seen constant text :=
    'CHECK (((rls_variant IS NULL) OR (rls_variant = ANY (ARRAY[''entity''::text, ''component''::text, ''ledger''::text, ''system''::text, ''restricted''::text, ''personal''::text]))))';
begin
  select pg_get_constraintdef(oid) into v_valid_now
    from pg_constraint
   where conrelid = 'platform.entity_types'::regclass and conname = 'entity_types_rls_variant_valid';
  select pg_get_constraintdef(oid) into v_check_now
    from pg_constraint
   where conrelid = 'platform.entity_types'::regclass and conname = 'entity_types_rls_variant_check';

  if v_valid_now is null or v_check_now is null then
    raise exception
      'entity_types rls_variant: expected both CHECK constraints to exist; valid=%, check=%',
      coalesce(v_valid_now, '(absent)'), coalesce(v_check_now, '(absent)')
      using hint = 'This file widens two named constraints. If they have been renamed or merged, '
                   'rewrite it against what is live rather than dropping something else.';
  end if;

  if v_valid_now is distinct from v_valid_seen then
    raise exception
      'entity_types_rls_variant_valid has moved since this file was written. written against: % | live now: %',
      v_valid_seen, v_valid_now
      using hint = 'Another lane widened or narrowed it. Re-derive this file against the live '
                   'definition; a DROP CONSTRAINT never asks what it is removing.';
  end if;

  if v_check_now is distinct from v_check_seen then
    raise exception
      'entity_types_rls_variant_check has moved since this file was written. written against: % | live now: %',
      v_check_seen, v_check_now
      using hint = 'Another lane widened or narrowed it. Re-derive this file against the live '
                   'definition; a DROP CONSTRAINT never asks what it is removing.';
  end if;
end $$;

-- Both constraints, dropped and re-created in ONE transaction — the runner owns
-- that transaction, so there is no window in which the column is unconstrained.
alter table platform.entity_types
  drop constraint entity_types_rls_variant_valid,
  drop constraint entity_types_rls_variant_check,
  add constraint entity_types_rls_variant_valid
    check (rls_variant = any (array['entity'::text, 'component'::text, 'system'::text,
                                    'restricted'::text, 'ledger'::text, 'personal'::text,
                                    'detail'::text])),
  add constraint entity_types_rls_variant_check
    check (rls_variant is null or rls_variant = any (array['entity'::text, 'component'::text,
                                                           'ledger'::text, 'system'::text,
                                                           'restricted'::text, 'personal'::text,
                                                           'detail'::text]));

do $$
declare
  n integer;
begin
  select count(*) into n
    from pg_constraint
   where conrelid = 'platform.entity_types'::regclass
     and conname in ('entity_types_rls_variant_valid', 'entity_types_rls_variant_check')
     and pg_get_constraintdef(oid) like '%detail%';
  if n <> 2 then
    raise exception 'entity_types rls_variant: % of 2 constraints accept ''detail'' after this file', n;
  end if;
  raise notice 'entity_types.rls_variant now accepts seven values; both CHECK constraints name detail.';
end $$;
