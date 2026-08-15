-- sharing_registry_context_item_focus_param.sql
--
-- Closes the NO DEAD ENDS gap spun off from D193: a context item had no
-- single-id door.
--
-- `sharing_registry_route_truth_d138.sql` set this template to '' and that was
-- correct at the time — the only id-addressable route needs THREE ids
-- (/organizations/[orgId]/scopes/[typeId]/context-items/[itemId]), a {id}-only
-- template cannot build it, and an empty template is the registry honestly
-- rendering no link instead of a 404.
--
-- What changed is the destination, not the rule. `/context-items` (the all-orgs
-- hub, features/scope-system/components/ContextItemsHub.tsx → AllContextItemsHub)
-- now reads `?item={id}`: it waits for every org's scope types and every type's
-- items to land, then scrolls to and highlights that row — or renders the
-- platform access gate when the id is not reachable from any of the caller's
-- orgs, rather than a list that looks like the link worked. Same shape as the
-- `code_file` `?open=` and `code_folder` `?folder=` doors.
--
-- No route was invented. A context item is a COMPONENT of its scope type
-- (D193); giving it its own `/context-items/{id}` route would be giving it a
-- second identity, exactly what that ruling forbids. It still has no
-- `visibility` / `organization_id` column and access still conveys from the
-- parent — this migration touches the DESTINATION only, nothing about access.
--
-- Moves in the same commit as the other three route authorities:
-- features/scopes/registry/entityRegistry.ts (hrefFor — the half
-- `getResourceSharePath` actually reads for this token), utils/permissions/registry.ts
-- (the TS mirror), and utils/permissions/__tests__/registry.db-snapshot.json.
--
-- Idempotent: a value-set UPDATE keyed on resource_type.

begin;

update platform.shareable_resource_registry
set url_path_template = '/context-items?item={id}'
where resource_type = 'context_item'
  and url_path_template is distinct from '/context-items?item={id}';

commit;
