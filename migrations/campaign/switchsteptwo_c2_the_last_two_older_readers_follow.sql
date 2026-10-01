-- chair-step: lane SWITCH-STEP-TWO (2026-10-01), step two, part c2 — the last two bodies the after-move census found.
-- plpgsql_check after files b and c with the six tables in the graveyard still named two live paths:
--   1. workbench.guard_used_template_fields() — the trigger on workbench.udt_dataset_template_fields (the templates STAY
--      in workbench today) refuses to change a template's fields once it is instantiated, and asked the older datasets.
--      It now asks the one live record of instantiation, context.scope_dataset_instances.template_id.
--   2. workbench.udt_row_words_many(uuid, jsonb, uuid[]) — the reference-words door for older rows (code still names
--      it: features/data-tables/service.ts, relation-words-client.tsx, referenceResolvers.ts; 0 calls on production since
--      2026-09-29). It answers the moved-table sentence, like file c's doors.
-- PRECONDITION: the undo is retired. Locks: pg_proc row locks only.
-- based-on: workbench.guard_used_template_fields() c2238047126aa8734c4287d981c3ae7be15c3420bb45d672efd2942fd946bdfe
-- based-on: workbench.udt_row_words_many(uuid, jsonb, uuid[]) bec8ac587a2a8a1ccb1c3d075b3670237d7dcd3d3a9045f970b15ab9b4255754
-- lane: SWITCH-STEP-TWO
-- INVERSE: migrations/inverse/switchsteptwo_c2_the_last_two_older_readers_follow_down.sql

do $pre$
begin
  if (platform._final_switch_undo_retired()).id is null then
    raise exception 'refused: the final switch''s undo is not retired.';
  end if;
end
$pre$;

CREATE OR REPLACE FUNCTION workbench.guard_used_template_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  -- SWITCH-STEP-TWO: a template is instantiated when a scope holds a table made from it.
  if exists (select 1 from context.scope_dataset_instances i where i.template_id = coalesce(new.template_id, old.template_id)) then
    raise exception 'template % is already instantiated; create a new template version instead of changing its fields',
      coalesce(new.template_id, old.template_id) using errcode = '55000';
  end if;
  return coalesce(new, old);
end; $function$;

CREATE OR REPLACE FUNCTION workbench.udt_row_words_many(p_organization_id uuid, p_display jsonb, p_row_ids uuid[])
 RETURNS TABLE(row_id uuid, words text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the graveyard; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'udt_row_words_many was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$;
