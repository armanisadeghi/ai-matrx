-- based-on: context.enforce_context_item_reference_source() 42a61d589f43a2d8d61714156b67ebfb633cb02d6711302649726454ed02e85d
--
-- THE LAST HALF OF THE NOUN FIX. `provision_scope_dataset` now mints
-- `directive_v1_reference_table` (the noun that expands to the table's ROWS;
-- `dataset` is a record pointer and rendered the dataset's description), but
-- the write of that value then failed with
--
--   reference type table is not allowed on item % (allowed: {dataset})
--
-- because `context.validate_reference_value` checks the fence's noun against
-- the item's `allowed_reference_types`, and this trigger REQUIRES a
-- dataset-template item to declare exactly `{dataset}`. The two halves of the
-- same contract disagreed the moment the mint was corrected, so this is the
-- other half: a dataset-template item declares `{table}`.
--
-- Safe to change outright rather than to accept both: `reference_source ->>
-- 'container_type' = 'dataset_template'` matches ZERO live context items — the
-- per-scope table path has never been used — so there is no row to migrate and
-- no caller to keep compatible. Accepting both nouns would instead leave the
-- item able to declare a type its own provisioner never mints.
--
-- The frontend forms that write this value (ContextItemAddForm,
-- ContextItemSettingsForm) are changed to `["table"]` in the same commit.

create or replace function context.enforce_context_item_reference_source()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_org_id uuid;
begin
  -- IS DISTINCT FROM treats NULL correctly (NULL is not dataset_template).
  if new.reference_source->>'container_type' is distinct from 'dataset_template' then
    return new;
  end if;

  select organization_id into v_org_id
  from context.scope_types
  where id = new.scope_type_id and deleted_at is null;
  if v_org_id is null then
    raise exception 'active scope type % not found', new.scope_type_id using errcode='22023';
  end if;
  perform context.validate_dataset_template_source(new.reference_source, v_org_id);

  -- `table` is the reference noun whose resolver expands to the table's rows,
  -- and it is the noun `provision_scope_dataset` mints into this item's value.
  if new.value_type <> 'reference'
     or new.allowed_reference_types is null
     or cardinality(new.allowed_reference_types) <> 1
     or new.allowed_reference_types[1] <> 'table'
     or new.max_items <> 1 then
    raise exception 'dataset-template context items require value_type=reference, allowed_reference_types=[table], and max_items=1'
      using errcode='23514';
  end if;
  return new;
end;
$function$;
