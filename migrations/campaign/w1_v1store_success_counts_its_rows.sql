-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.promote_table(uuid,uuid) 21dd09398fa0155d08eda2ef0ea052cdb5c4b4db88bbc75cda2b9d8a9f07d8e0
-- based-on: custom._field_definition_write() 0fabd5eb36a16f2e8d21ce83648b70a0a93911a64ca673c64a0f8c6804df0c49
-- based-on: custom._rule_definition_write() 88015aca80ffd9ecab4446084849b681c71ce12ed4c402c0300f0710fa644dc7
--
-- V1-STORE-FIXES, FINDING 3 — A SUCCESS SENTENCE COUNTS ITS ROWS.
--
-- WHAT `V1-STORE` MEASURED (00:20 UTC, 2026-09-18)
-- -----------------------------------------------
-- "`custom.promote_table` reports success for a caller who changed nothing - its
-- `UPDATE ... set storage='heavy'` hits 0 rows under RLS and it still returns
-- `{"was":...,"now":"heavy"}`; a silent no-op wearing a success sentence."
--
-- Reproduced in `scripts/campaign-tests/v1store_fixes_red.sql` block 3 without needing an RLS
-- identity, by reaching the SAME zero-row UPDATE down a route that does not need one: the
-- function answered `{"now": null, "was": null, "rows_moved": 0, "indexes": []}` - an object
-- shaped exactly like a success - for a Table of another organization.
--
-- THE CENSUS, RUN RATHER THAN GUESSED (branch, 2026-09-18)
-- --------------------------------------------------------
-- Every function in schema `custom` whose source contains an `INSERT INTO custom.`,
-- `UPDATE custom.` or `DELETE FROM custom.` was listed from `pg_proc` and split by whether it
-- reads a row count (`GET DIAGNOSTICS` / `NOT FOUND`). Twelve write. Nine were already honest
-- or cannot be dishonest:
--   · `record_update`, `record_reparent`, `relation_own`, `external_stub_upsert`,
--     `external_writes_set` already read `found` / `row_count` and refuse by name;
--   · `record_write`, `table_declare`, `home_add`, `external_source_declare` only INSERT, and
--     an INSERT that RLS refuses RAISES (42501) rather than matching nothing.
-- THREE were not, and all three are fixed here:
--   · `custom.promote_table`            — the instance V1-STORE found;
--   · `custom._field_definition_write`  — the INSTEAD OF writer behind the `custom.field` view;
--   · `custom._rule_definition_write`   — the INSTEAD OF writer behind the `custom.rule` view.
-- The two INSTEAD OF writers are the same defect wearing a worse face: an INSTEAD OF trigger
-- reports `UPDATE 1` / `DELETE 1` to the client whatever its body did, so a write the store
-- refused reads to the caller as a write that happened. The view showed the row, so reaching
-- no stored row is row-level security refusing the CHANGE - not the row being absent - and
-- that is what the refusals say.
--
-- WHAT A HONEST ANSWER IS HERE, AND WHY IT IS A REFUSAL RATHER THAN A FLAG
-- ------------------------------------------------------------------------
-- Nothing fails silently: a stand-in announces itself with a remedy. A promotion that moved
-- nothing has no partial state worth returning - and raising is what unwinds the indexes
-- `promote_table` built before the UPDATE, so a half-promoted Table is not a state this
-- function can leave behind. `promote_table` also now ASKS BEFORE IT BUILDS: a Table id this
-- organization does not have is refused before a single index is created, which is both
-- cheaper and a better sentence. The answer it returns on success gains
-- `table_rows_changed`, so the count is in the answer as well as in the guard.
--
-- IDEMPOTENCE (rule 27): every statement is `CREATE OR REPLACE FUNCTION` or `COMMENT ON`, so
-- the file applies twice with the same result. THE INVERSE:
-- `migrations/inverse/w1_v1store_success_counts_its_rows_down.sql`, which restores the three
-- bodies this file's `-- based-on:` lines declare.

CREATE OR REPLACE FUNCTION custom.promote_table(p_organization_id uuid, p_table_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_moved  bigint;
  v_before bigint;
  v_after  bigint;
  v_was    text;
  f        record;
  v_built  jsonb := '[]'::jsonb;
begin
  v_was := custom.table_storage(p_organization_id, p_table_id);
  -- V1-STORE-FIXES finding 3, the FIRST half: ASK BEFORE BUILDING. `custom.table_storage`
  -- answers NULL when this organization has no live Table of that id at all, which is the
  -- cheap, honest refusal - and it comes before a single index is built, so a caller who
  -- named the wrong Table is told instead of paying for work that is then thrown away.
  if v_was is null then
    raise exception 'That is not a table of this organization, so there was nothing to move.'
      using errcode = '23503',
            hint = 'REC-4: promoting a Table is per Table and per organization. The store is keyed (organization_id, id), so a Table of another organization is not found by this one - and a Table that was deleted is not found either.';
  end if;
  select count(*) into v_before from custom.record r
   where r.organization_id = p_organization_id and r.table_id = p_table_id;

  for f in select * from custom.promoted_fields(p_organization_id, p_table_id) where indexable loop
    v_built := v_built || jsonb_build_array(custom.promote_field(p_organization_id, p_table_id, f.field_id));
  end loop;

  update custom.record
     set data = data || jsonb_build_object('storage', 'heavy')
   where organization_id = p_organization_id and id = p_table_id
     and table_id = custom.table_kernel_id();
  -- V1-STORE-FIXES finding 3, the SECOND half: A SUCCESS SENTENCE COUNTS ITS ROWS.
  -- `V1-STORE` measured this UPDATE matching ZERO rows under RLS while the function still
  -- answered {"now":"heavy"} - a no-op wearing a success. The row count is the only thing
  -- that knows, so it is read, and a promotion that moved nothing RAISES rather than
  -- reports. Raising also unwinds the indexes built above, so a half-promoted Table is not
  -- a state this function can leave behind.
  get diagnostics v_moved = row_count;
  if v_moved = 0 then
    raise exception 'Nothing was changed, so this table was not moved to fast storage.'
      using errcode = '42501',
            hint = 'REC-4: the table is there and readable, but this caller''s write did not reach it - that is row-level security refusing the change rather than the store losing it. Nothing was built and nothing was left half-done. Ask somebody who can edit that table to move it.';
  end if;

  select count(*) into v_after from custom.record r
   where r.organization_id = p_organization_id and r.table_id = p_table_id;

  return jsonb_build_object('was', v_was, 'now', custom.table_storage(p_organization_id, p_table_id),
                            'records_before', v_before, 'records_after', v_after,
                            'rows_moved', v_after - v_before, 'indexes', v_built,
                            'table_rows_changed', v_moved);
end $function$;

CREATE OR REPLACE FUNCTION custom._field_definition_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_data jsonb;
  v_id   uuid;
  v_rows bigint;
begin
  -- THE DOOR. This trigger is INSTEAD OF INSERT OR UPDATE OR DELETE, so the row it
  -- judges is `old` on a delete and `new` otherwise; `new` is unassigned on DELETE
  -- and reading it would raise instead of refusing.
  if tg_op = 'DELETE' then
    perform custom.assert_store_door(old.organization_id, 'custom.field');
  else
    perform custom.assert_store_door(new.organization_id, 'custom.field');
  end if;

  if tg_op = 'DELETE' then
    update custom.record
       set deleted_at = now()
     where organization_id = old.organization_id and id = old.id
       and table_id = custom.field_kernel_id();
    -- V1-STORE-FIXES finding 3: AN INSTEAD OF TRIGGER REPORTS ONE ROW WHATEVER IT DID.
    -- The view showed this row, so a delete through it that reaches no stored row is the
    -- store refusing the write (row-level security), not the row being absent - and
    -- returning `old` would tell the caller their delete happened.
    get diagnostics v_rows = row_count;
    if v_rows = 0 then
      raise exception 'Nothing was changed, so that field was not deleted.'
        using errcode = '42501',
              hint = 'The field is there and readable, but this caller''s write did not reach it - that is row-level security refusing the change rather than the store losing it. Nothing was deleted. Ask somebody who can edit that table.';
    end if;
    return old;
  end if;

  -- The view''s columns are assembled back into the ONE stored document, so a write through
  -- the projection and a write into the store produce the same row and the SAME guard fires.
  v_data := coalesce(new.data, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
    'entity_definition_id', new.entity_definition_id,
    'table_token',          new.table_token,
    'key',                  new.key,
    'label',                new.label,
    'type',                 new.type,
    'relation_target',      new.relation_target,
    'relation_max',         new.relation_max,
    'on_target_delete',     new.on_target_delete,
    'inverse_key',          new.inverse_key,
    'source',               new.source,
    'compute_on',           new.compute_on,
    'unit',                 new.unit,
    'format',               new.format,
    'sensitivity',          new.sensitivity,
    'context_policy',       new.context_policy,
    'review_interval_days', new.review_interval_days))
    || jsonb_build_object(
    'config',           coalesce(new.config, '{}'::jsonb),
    'source_config',    coalesce(new.source_config, '{}'::jsonb),
    'rules',            coalesce(new.rules, '[]'::jsonb),
    'depends_on',       coalesce(new.depends_on, '[]'::jsonb),
    'applies_to_types', coalesce(new.applies_to_types, '[]'::jsonb),
    'required',         coalesce(new.required, false),
    'multi',            coalesce(new.multi, false),
    'dated',            coalesce(new.dated, false),
    'sort',             coalesce(new.sort, 0));
  if new."default" is not null then
    v_data := jsonb_set(v_data, '{default}', new."default");
  end if;

  if tg_op = 'INSERT' then
    insert into custom.record (id, organization_id, table_id, data_class, data)
    values (coalesce(new.id, gen_random_uuid()), new.organization_id,
            custom.field_kernel_id(), 'field', v_data)
    returning id into v_id;
    new.id := v_id;
    return new;
  end if;

  update custom.record
     set data = v_data, updated_at = now(), version = version + 1
   where organization_id = new.organization_id and id = new.id
     and table_id = custom.field_kernel_id();
  -- V1-STORE-FIXES finding 3, same law on the UPDATE arm.
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'Nothing was changed, so that field was not saved.'
      using errcode = '42501',
            hint = 'The field is there and readable, but this caller''s write did not reach it - that is row-level security refusing the change rather than the store losing it. Your edit is still in your hands; nothing was overwritten. Ask somebody who can edit that table.';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION custom._rule_definition_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_data jsonb;
  v_id   uuid;
  v_rows bigint;
begin
  -- THE DOOR. This trigger is INSTEAD OF INSERT OR UPDATE OR DELETE, so the row it
  -- judges is `old` on a delete and `new` otherwise; `new` is unassigned on DELETE
  -- and reading it would raise instead of refusing.
  if tg_op = 'DELETE' then
    perform custom.assert_store_door(old.organization_id, 'custom.rule');
  else
    perform custom.assert_store_door(new.organization_id, 'custom.rule');
  end if;

  if tg_op = 'DELETE' then
    update custom.record
       set deleted_at = now()
     where organization_id = old.organization_id and id = old.id
       and table_id = custom.rule_kernel_id();
    -- V1-STORE-FIXES finding 3: AN INSTEAD OF TRIGGER REPORTS ONE ROW WHATEVER IT DID.
    get diagnostics v_rows = row_count;
    if v_rows = 0 then
      raise exception 'Nothing was changed, so that rule was not deleted.'
        using errcode = '42501',
              hint = 'The rule is there and readable, but this caller''s write did not reach it - that is row-level security refusing the change rather than the store losing it. Nothing was deleted. Ask somebody who can edit that table.';
    end if;
    return old;
  end if;

  -- The view's columns are assembled back into the ONE stored document, so a write through
  -- the projection and a write into the store produce the same row and the SAME guard fires.
  v_data := coalesce(new.data, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
    'name',            new.name,
    'kind',            new.kind,
    'scope_table_id',  new.scope_table_id,
    'target_field_id', new.target_field_id,
    'message',         new.message))
    || jsonb_build_object(
    'uses',             coalesce(new.uses, '[]'::jsonb),
    'applies_to_types', coalesce(new.applies_to_types, '[]'::jsonb),
    'use_types',        coalesce(new.use_types, '{}'::jsonb),
    'sort',             coalesce(new.sort, 0));
  if new.expr is not null then
    v_data := jsonb_set(v_data, '{expr}', new.expr);
  end if;

  if tg_op = 'INSERT' then
    insert into custom.record (id, organization_id, table_id, data_class, data)
    values (coalesce(new.id, gen_random_uuid()), new.organization_id,
            custom.rule_kernel_id(), 'rule', v_data)
    returning id into v_id;
    new.id := v_id;
    return new;
  end if;

  -- REC-19: the version is NOT touched here. platform._touch_row - the platform's own
  -- standard trigger, already on custom.record - increments it on every UPDATE, whichever
  -- way the write arrives. A second `version = version + 1` in this body would make a write
  -- through the projection count as two changes, which is exactly how a version number stops
  -- meaning anything.
  update custom.record
     set data = v_data
   where organization_id = new.organization_id and id = new.id
     and table_id = custom.rule_kernel_id();
  -- V1-STORE-FIXES finding 3, same law on the UPDATE arm.
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'Nothing was changed, so that rule was not saved.'
      using errcode = '42501',
            hint = 'The rule is there and readable, but this caller''s write did not reach it - that is row-level security refusing the change rather than the store losing it. Your edit is still in your hands; nothing was overwritten. Ask somebody who can edit that table.';
  end if;
  return new;
end;
$function$;

comment on function custom.promote_table(uuid, uuid) is
  'REC-4: moves a Table to heavy (indexed) storage and builds its promoted fields'' indexes. It refuses a Table this organization does not have before it builds anything, and it refuses a write that reached no row rather than reporting success (V1-STORE-FIXES finding 3). While custom/system_enabled resolves false the whole store, this included, takes writes only from the role that owns custom.record - custom.assert_store_door is the one predicate that decides it.';

comment on function custom._field_definition_write() is
  'FLD-8: the INSTEAD OF writer behind the custom.field view. Its UPDATE and DELETE arms read their row count and refuse rather than let an INSTEAD OF trigger report a change that did not happen (V1-STORE-FIXES finding 3). The switch custom/system_enabled is read where it always was, through custom.assert_store_door at the top of this body.';

comment on function custom._rule_definition_write() is
  'REC-15: the INSTEAD OF writer behind the custom.rule view. Its UPDATE and DELETE arms read their row count and refuse rather than let an INSTEAD OF trigger report a change that did not happen (V1-STORE-FIXES finding 3). The switch custom/system_enabled is read where it always was, through custom.assert_store_door at the top of this body.';
