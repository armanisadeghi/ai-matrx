-- chair-step: lane TRASH-COVERAGE-2. A tagged item restored from Trash brings back the context tags its archive tombstoned: the copy fence (platform._context_tag_copy_fence) now lets through the item's own restore cascade (platform._gc_entity_associations reversing its own tombstones), the mirror of the tombstone it already lets through. Before this, restoring any file, conversation, note, project, task, thread or war room that carried a copied context tag failed with 42501 "nobody may revive it here".
--
-- FOUND BY lane TRASH-COVERAGE-2's production suite (scripts/campaign-tests/trashcoverage2_green.sql,
-- 2026-09-26 08:45Z): restoring admin@admin.com's archived war room raised the fence. Census on
-- production: 200 live copied context tags (role context_tag, target_type record) sit on files (86),
-- conversations (55), notes (21), projects (16), tasks (15), threads (5), flashcard sets and war rooms
-- — every one of those items, once archived, could never come back from Trash.
--
-- THE CHANGE (one branch, in the fence's own words): an UPDATE that clears deleted_at AND the
-- deleted_via_id platform._gc_entity_associations stamped, arriving from inside a trigger
-- (pg_trigger_depth() > 1 — the item's own restore), is the old side's own cascade reversed and is let
-- through, exactly as its tombstone was. A direct revive of a copied tag (depth 1) is still refused.
-- The follow re-arms on the edge and puts the current screens' word back at the next drain.
--
-- INVERSE: migrations/inverse/trashcoverage2_a_restored_item_brings_back_its_copied_context_tags_down.sql
-- lane: TRASH-COVERAGE-2
-- based-on: platform._context_tag_copy_fence() 5c0ad8ff2cb923478ddae57ad6c0ac4e1e4069d71da6480b7b80a60ef087f70f

create or replace function platform._context_tag_copy_fence()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_org  uuid;
  v_on   boolean;
  v_what text;
begin
  -- THE ONE WRITER: the store owner's own connection (the scopes mover and the follow), read
  -- from the catalogue exactly as custom._context_copy_fence does. (SECURITY DEFINER so the
  -- scope's organization and its knob are read whoever writes; custom.caller_role() reads the
  -- role GUC and session_user, which the definer boundary does not move.) A hard delete is
  -- never fenced: the old side's delete of an entity sweeps its edges, copies included.
  if pg_has_role(custom.caller_role(), (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass), 'member') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.role is distinct from 'context_tag' or new.target_type <> 'record' then
      return new;
    end if;
    v_what := 'make';
  else
    if coalesce(old.role, '') <> 'context_tag' and coalesce(new.role, '') <> 'context_tag' then
      return new;
    end if;
    if old.role is distinct from new.role then
      v_what := 'change the role of';
    elsif old.deleted_at is not null and new.deleted_at is null
          and old.deleted_via_id is not null and new.deleted_via_id is null
          and pg_trigger_depth() > 1 then
      -- lane TRASH-COVERAGE-2: the tagged item's own restore (platform._gc_entity_associations,
      -- running as a trigger on the item's table) bringing back exactly the edges its archive
      -- tombstoned — the mirror of the tombstone let through below. Without it no tagged file,
      -- conversation, note, project, task or war room could come back from Trash (42501 on
      -- every restore). A direct revive (trigger depth 1) is still refused.
      return new;
    elsif old.deleted_at is not null and new.deleted_at is null then
      v_what := 'revive';
    elsif new.target_type is distinct from old.target_type or new.target_id is distinct from old.target_id then
      v_what := 're-point';
    elsif new.deleted_at is null and (new.metadata is distinct from old.metadata
                                      or new.position is distinct from old.position
                                      or new.label is distinct from old.label) then
      v_what := 'edit';
    else
      -- A tombstone, or a source moved by a merge: the old side's own cascades, carried; the
      -- follow re-arms on it and puts the old side's word back at the next drain.
      return new;
    end if;
  end if;

  select s.organization_id into v_org from context.scopes s where s.id = new.target_id;
  if v_org is null then
    return new;
  end if;
  v_on := coalesce((platform.knob_resolve('custom', 'context_copy_following', v_org) #>> '{}')::boolean, true);
  if not v_on then
    return new;
  end if;

  raise exception 'This is the new system''s copy of a context tag; it follows the current tags until the switch, so nobody may % it here. Tag or untag the item in its Context section.', v_what
    using errcode = '42501',
          hint = 'SC-4 P4: while custom/context_copy_following is on for the scope''s organization, only the follow of the current screens writes the record store''s copied tags (role context_tag). Nothing was written.';
end;
$function$;
