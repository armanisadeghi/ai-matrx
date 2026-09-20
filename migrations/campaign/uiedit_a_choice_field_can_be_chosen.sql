-- UI-EDIT — A CHOICE FIELD CAN BE CHOSEN.
--
-- WHAT A PERSON HIT. On /data-v2, the "Stage" question of the new-record form
-- drew no control at all, only the red words `permission denied for function
-- field_options` (independent verdict, 19 September, "The screens, walked as a
-- person"). So a select field — one of the thirteen parity types the store
-- publishes — could not be filled in from any screen in the product.
--
-- WHY. `custom.field_options(uuid, uuid)` is the one door that resolves a list
-- Field's options Table from the Field's own config and returns its records
-- (FLD-5 / FLD-6: every pick-list is already a Table, and a list value stores
-- the ID OF AN OPTION RECORD). It existed, it was correct, and it was
-- `LANGUAGE sql` with no EXECUTE grant and NO ROW in
-- `platform.client_callable_door` — measured on this database before writing
-- this file. The frontend talks to this database directly and never through the
-- Python server, so "not a declared door" meant "no screen can ever fill a
-- choice field".
--
-- WHAT THIS FILE DOES, and it is exactly what `custom.applicable_fields` — the
-- sibling door that reads the same field kernel for the same forms — already
-- does:
--
--   1. SECURITY DEFINER, because `authenticated` holds SELECT on ZERO tables in
--      schema `custom` and that stays true. A SECURITY INVOKER function granted
--      to a client would raise "permission denied for table record" and be a
--      door in name only.
--   2. THE DECISION FIRST, IN THE BODY, BEFORE THE FIRST READ:
--      `custom.assert_store_door` (the organization's own off switch) then
--      `custom.assert_client_may_reach` (the organization wall). A foreign
--      organization's Field id and an invented one therefore answer
--      identically — neither is told whether the Field exists. This is the same
--      pair `custom.applicable_fields` opens with, and it is what
--      `platform.door_body_must_decide` requires of a definer door row.
--   3. The declaration row, with its reason, and the grant that FOLLOWS from
--      the declaration (`custom.reopen_declared_doors()`) rather than a grant
--      issued by hand beside it.
--
-- The query itself is the byte it was: same joins, same `deleted_at is null`,
-- same field-kernel check. It is now wrapped in `return query` because a
-- decision has to run BEFORE the read and a SQL function has no "before".
--
-- ADDITIVE: it replaces one function, inserts one registry row and issues the
-- one EXECUTE grant that row implies. It drops nothing and revokes nothing.
--
-- THE INVERSE: migrations/inverse/uiedit_a_choice_field_can_be_chosen_down.sql.

-- based-on: custom.field_options(uuid, uuid) d42adb7dfc906fbcc25d87af6e7373932acb7704c1f27ddee79920a2f70191c4

set lock_timeout = '5s';
set statement_timeout = '600s';

CREATE OR REPLACE FUNCTION custom.field_options(p_organization_id uuid, p_field_id uuid)
 RETURNS SETOF custom.record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  -- The decision comes BEFORE the read, so a foreign organization id and an
  -- invented one answer identically: both are refused, neither is told whether
  -- the Field exists.
  perform custom.assert_store_door(p_organization_id, 'custom.field_options');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.field_options');

  return query
  select o.*
    from custom.record f
    join custom.record o
      on o.organization_id = f.organization_id
     and o.table_id = (f.data -> 'config' ->> 'options_table_id')::uuid
     and o.deleted_at is null
   where f.organization_id = p_organization_id
     and f.id = p_field_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null;
end
$function$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes,
   signed_in_callers, anonymous_callers, declared_by, reason)
values (
  'custom', 'field_options', 'p_organization_id uuid, p_field_id uuid',
  array['uuid'::regtype::oid, 'uuid'::regtype::oid],
  true, false,
  'migrations/campaign/uiedit_a_choice_field_can_be_chosen.sql (lane UI-EDIT)',
  'The choices of one list Field, which is what every select and multi-select control in the product is drawn from. FLD-5 / FLD-6: a pick-list is already a Table and a list value stores the id of an option record, so a screen cannot offer the choices without asking the store which Table holds them - and it must not have to know which Table that is. It reads the Field record in the field kernel and the option records of the Table that Field names, and nothing else; the organization''s off switch and the organization wall are both decided before the first read, so a Field belonging to another organization answers exactly as an invented id does. Declared by lane UI-EDIT after the new-record form drew "permission denied for function field_options" instead of a control.')
on conflict (schema_name, function_name, identity_argtypes) do nothing;

-- The grant follows from the declaration, and only from the declaration.
select custom.reopen_declared_doors();
