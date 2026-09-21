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

-- 🚨 TWO OF THE THREE COLUMNS STAY STANDING, AND ARE EMPTIED INSTEAD (lane INVERSE-GUARD,
-- 2026-09-21). W1-REG added all three, and two of them have since been adopted by bodies
-- outside this lane on the live path: `platform.custom_fields_retrofit`
-- (`entitytail_the_retrofit_reaches_the_last_table.sql`) reads
-- `platform.entity_types.custom_fields_enabled` to decide which standard Entity gets REC-40's
-- canonical column, and `hr.wf_request`
-- (`hr_l1_82_a_person_with_no_spell_is_named_not_substituted.sql`) names
-- `platform.entity_types.type`. Dropping either took those bodies' ground away, which is not
-- the classification rollback this file describes.
--
-- SO THE CLASSIFICATION IS REMOVED RATHER THAN THE COLUMNS. `type` is already NULL on every
-- row — the refusal above guarantees it, by name and by count — and `custom_fields_enabled`
-- goes back to the `false` the up-file defaulted it to, so the retrofit enables nothing and no
-- row carries a type. `type_reason` is nobody else's and goes. Its three constraints went with
-- the ALTER above, so nothing holds the emptied columns to a shape either. This is the same
-- remedy `mergehist_a_compound_operation_signs_its_revision_down.sql` carries for
-- `history.row_versions.migration_id`: the column stays, the fact it recorded does not.
update platform.entity_types
   set custom_fields_enabled = false
 where custom_fields_enabled;

alter table platform.entity_types
  drop column if exists type_reason;

do $$
declare
  n integer;
begin
  select count(*) into n
    from information_schema.columns
   where table_schema = 'platform' and table_name = 'entity_types'
     and column_name = 'type_reason';
  if n <> 0 then
    raise exception 'platform.entity_types: type_reason survived the inverse';
  end if;
  select count(*) into n from platform.entity_types
   where type is not null or custom_fields_enabled;
  if n <> 0 then
    raise exception
      'platform.entity_types: % row(s) still carry a classification after the inverse', n;
  end if;
  raise notice 'platform.entity_types: type_reason and the three constraints are gone, and no row carries a type or an enabled custom-fields switch. The two columns two later lanes read stay standing and empty.';
end $$;
