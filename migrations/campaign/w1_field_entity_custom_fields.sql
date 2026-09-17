-- target: branch,production
-- additive: yes
-- guard: custom/entity_custom_fields_guard
--
-- W1-FIELD — REC-51's SECOND HALF: the field definitions enforced on the `custom_fields`
-- column of a standard table.
--
-- WHY THIS IS ITS OWN FILE, and the runner is right to insist. REC-51's law has two halves
-- and they are held OFF by two DIFFERENT knobs: the store half by `custom/system_enabled`
-- (nothing outside this campaign can reach schema `custom` at all), and this half by
-- `custom/entity_custom_fields_guard`, the knob `W1-STORE` created for exactly this column
-- when it landed `crm.party.custom_fields`. A file may declare ONE `-- guard:`, and the
-- runner refuses a new trigger on a live table unless the file names the knob that holds it
-- off (`trigger-guard-unnamed`) — met here by naming its own, real guard, never by widening
-- the other file's header to a knob its trigger does not read. Measured: the single-file
-- version was refused by `pnpm db:apply --judge-only` at BOTH targets, which is what split it.
--
-- RULE 4's FOURTH EXCEPTION AND NOTHING ELSE. `crm.party` is a live table with 1,859 rows.
-- The trigger below reads `platform.knob_resolve('custom', 'entity_custom_fields_guard', …)`
-- FIRST and returns NEW untouched when it is false, which it is on both databases, so every
-- existing write of that table answers exactly as it did against the go-signal capture.
-- There is no DDL on `crm.party` here: no column, no constraint, no policy, no index.
--
-- THE REGISTRY SEAM, NAMED RATHER THAN SMUGGLED. The law says "every table whose registry
-- row reads `custom_fields_enabled`". `platform.entity_types` carries NO such column today
-- — measured on the branch before this file was written, zero columns matching `%custom%`;
-- it is `W1-REG`'s registry surgery (REC-57). So the enabled set is answered through ONE
-- body, `custom.custom_fields_tables()`, which today reads the registry row AND the physical
-- presence of a `custom_fields` column. That stand-in is conservative in the safe direction
-- and announces itself in its own comment with `W1-REG` as the remedy.
--
-- THE INVERSE: `migrations/inverse/w1_field_entity_custom_fields_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '300s';


create function custom.custom_fields_tables()
  returns table (token text, schema_name text, table_name text)
  language sql stable
  set search_path to 'pg_catalog'
as $fn_cft$
  select e.token, e.schema_name, e.table_name
    from platform.entity_types e
    join information_schema.columns c
      on c.table_schema = e.schema_name
     and c.table_name  = e.table_name
     and c.column_name = 'custom_fields'
   where e.is_active;
$fn_cft$;

comment on function custom.custom_fields_tables() is
  'REC-51: the ONE body that answers "which tables carry custom fields". The law says "every table whose registry row reads custom_fields_enabled"; platform.entity_types carries NO such column today - that flag is W1-REG''s registry surgery (REC-57). So the stand-in is the registry row AND the physical presence of the column, which is conservative in the safe direction (a table with no column cannot be validated at all), announced here rather than discovered, with W1-REG as the remedy. When the flag lands, this body reads it and no consumer moves.';

create function custom.validate_custom_fields(p_token text, p_organization_id uuid, p_values jsonb)
  returns void
  language plpgsql stable
  set search_path to 'pg_catalog'
as $fn_vcf$
declare
  v_fields custom.record[];
begin
  select array_agg(f) into v_fields
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and f.data ->> 'table_token' = p_token;
  if v_fields is null then
    return;
  end if;
  perform custom.validate_values(p_organization_id, v_fields, coalesce(p_values, '{}'::jsonb));
end;
$fn_vcf$;

comment on function custom.validate_custom_fields(text, uuid, jsonb) is
  'REC-51 / FLD-8: the same validator, over the custom_fields document of a STANDARD table. One definitions surface means the definitions read here are the very rows custom.field serves - there is no second definition store for standard tables.';

create function custom._entity_custom_fields_guard() returns trigger
  language plpgsql
  set search_path to 'pg_catalog'
as $fn_ecfg$
declare
  v_org uuid;
begin
  -- RULE 4''s FOURTH EXCEPTION AND NOTHING ELSE: while custom/entity_custom_fields_guard is
  -- OFF this body returns NEW untouched, so every existing write of this table answers
  -- exactly as it did against the go-signal capture. The knob resolves false on both
  -- databases and is turned on by the switch checklist, never by a lane.
  begin
    v_org := to_jsonb(new) ->> 'organization_id';
  exception when others then
    v_org := null;
  end;
  if not coalesce((platform.knob_resolve('custom', 'entity_custom_fields_guard', v_org) #>> '{}')::boolean, false) then
    return new;
  end if;
  if v_org is null then
    return new;
  end if;
  perform custom.validate_custom_fields(tg_argv[0], v_org, to_jsonb(new) -> 'custom_fields');
  return new;
end;
$fn_ecfg$;

comment on function custom._entity_custom_fields_guard() is
  'REC-51 on a standard table''s custom_fields column. OFF is byte-for-byte the old behaviour: the knob is read first and NEW is returned untouched. The table token arrives as a trigger argument, so the one body serves every table custom.custom_fields_tables() lists.';

create trigger custom_fields_validation
  before insert or update of custom_fields on crm.party
  for each row execute function custom._entity_custom_fields_guard('party');

