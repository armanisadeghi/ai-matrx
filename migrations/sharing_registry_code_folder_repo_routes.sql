-- Give `code_folder` and `code_repository` real signed-in destinations.
--
-- Both were emptied by `sharing_registry_route_truth_d138.sql` because their
-- invented paths (`/code/folders/{id}`, `/code/repos/{id}`) resolved to no
-- route — honest, but still a NO DEAD ENDS gap: the UI names a
-- code.code_file_folders / code.code_repositories record and the user cannot
-- reach it.
--
-- The destinations now exist, and neither is a new route:
--   code_folder     -> /code?folder={id}
--       The workspace has no sub-routes. `?folder=` expands the folder's
--       ancestor chain in the Library tree, highlights the row, and scrolls
--       it into view (features/code/hooks/useFocusCodeFolderFromUrl.ts),
--       mirroring how `?open=` works for a code file.
--   code_repository -> /rag/repositories?repo={id}
--       /rag/repositories is the ONLY surface over code.code_repositories
--       (/code's Source Control view is git-on-the-sandbox, a different
--       thing). `?repo=` highlights and scrolls to that repository's row.
--
-- Reminder from D138: this column is a FALLBACK. The entity registry's
-- `hrefFor` is the route authority and is updated in the same commit, along
-- with utils/permissions/registry.ts and the committed snapshot.
--
-- Idempotent: the `is distinct from` guard makes re-application a no-op.

begin;

update platform.shareable_resource_registry
set url_path_template = v.template
from (
  values
    ('code_folder', '/code?folder={id}'),
    ('code_repository', '/rag/repositories?repo={id}')
) as v(resource_type, template)
where platform.shareable_resource_registry.resource_type = v.resource_type
  and platform.shareable_resource_registry.url_path_template is distinct from v.template;

commit;
