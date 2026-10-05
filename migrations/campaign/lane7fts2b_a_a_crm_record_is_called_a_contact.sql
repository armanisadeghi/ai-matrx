-- chair-step: one registry row. platform.entity_types.label for token 'party': 'Entity' -> 'Contact'.
-- No DDL, no grant, no policy, no new lock beyond one row.
-- lock: platform
--
-- LANE FINISH-THE-SWITCH · FTS-2b item 2 — THE NOUN A PERSON READS FOR A CRM RECORD.
-- Every sentence the store builds about a standard row (approval cards, refusals: "There is no % you can open
-- with that id", "Saves the new values on this %") takes its noun from custom.entity_table(token).label, which
-- reads platform.entity_types.label. Party's row said "Entity" (the type word), so entity_table printed its table
-- name, "Party" — a machine word on the approval card. The CRM's own word for the record type is "Contact"
-- (features/item-presentation/registry.tsx `party.label`, the CRM FEATURE.md F-47/F-50 type-level generic; a row's
-- own kind reads Person / Company). The registry row now holds that word, so every reader of the label — SQL
-- sentences and the @ai-matrx/associations vocabulary generated from this table — says it.
-- Party was the only registry row whose label was its type word (checked 2026-10-05).
set local lock_timeout = '3s';
update platform.entity_types set label = 'Contact' where token = 'party' and label = 'Entity';
do $do$
begin
  if (select label from platform.entity_types where token = 'party') is distinct from 'Contact' then
    raise exception 'party''s registry label is not Contact after this file';
  end if;
end $do$;
