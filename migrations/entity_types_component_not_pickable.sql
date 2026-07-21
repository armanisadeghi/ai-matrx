-- entity_types_component_not_pickable.sql
--
-- The auto-open sweep (entity_types_open_reference_and_schemas.sql) marked
-- every type with a detectable title column reference_pickable — including 25
-- is_component rows (child/detail records like files.entities "File Entity"
-- or files.page_annotations), which are parts of another entity, not
-- standalone things a user should reference. Respect the registry's own flag:
-- components are not pickable by default. title_column is kept, so an admin
-- can deliberately re-enable a specific component with one toggle at
-- /administration/relationships/entity-types.

update platform.entity_types
set reference_pickable = false
where is_component and reference_pickable;
