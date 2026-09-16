-- migrate: skip: the inverse of custom_entity_types_detail_variant.sql — run by hand, never auto-applied
-- target: branch
--
-- THE INVERSE: `platform.entity_types.rls_variant` back to its six values.
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
