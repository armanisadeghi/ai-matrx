-- chair-step: dropping the three registry attribute columns is a DROP COLUMN by construction, which no additive judgement admits; it runs at a terminal, and only as the abort checklist's step
--
-- THE INVERSE of `migrations/campaign/w1_reg_registry_attributes.sql`.
--
-- Header-less on purpose (§4.9): a file naming production in a `-- target:`
-- header is judged by the allow-list and `-- chair-step:` waives nothing there —
-- carrying both is `refuse:chair-step-names-production` in BOTH runners. The same
-- bytes rehearse on the branch with `--target branch` and reach production only
-- at a terminal.
--
--     pnpm db:apply migrations/inverse/w1_reg_registry_attributes_down.sql --target branch
--
-- IT REFUSES WHILE ANY ROW ACTUALLY CARRIES A TYPE. Dropping the column would
-- take the classification with it silently; the count is taken FIRST and the
-- refusal says what to do about it. The branch's classification file
-- (`w1_reg_the_classification_lands.sql`) has its own inverse, which is what
-- clears the rows this one refuses over.

do $$
declare
  n integer;
begin
  select count(*) into n from platform.entity_types where type is not null;
  if n > 0 then
    raise exception
      'platform.entity_types: % row(s) carry a type — dropping the column would discard the '
      'classification without a word.', n
      using hint = 'Run migrations/inverse/w1_reg_the_classification_lands_down.sql first, then re-run this inverse.';
  end if;
end $$;

alter table platform.entity_types
  drop constraint if exists entity_types_type_is_derived_or_explained,
  drop constraint if exists entity_types_custom_fields_follow_type,
  drop constraint if exists entity_types_type_is_one_of_seven;

alter table platform.entity_types
  drop column if exists custom_fields_enabled,
  drop column if exists type_reason,
  drop column if exists type;

do $$
declare
  n integer;
begin
  select count(*) into n
    from information_schema.columns
   where table_schema = 'platform' and table_name = 'entity_types'
     and column_name in ('type', 'type_reason', 'custom_fields_enabled');
  if n <> 0 then
    raise exception 'platform.entity_types: % attribute column(s) survived the inverse', n;
  end if;
  raise notice 'platform.entity_types: the three registry attribute columns and their three constraints are gone.';
end $$;
