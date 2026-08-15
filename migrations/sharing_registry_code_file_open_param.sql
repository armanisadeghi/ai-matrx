-- sharing_registry_code_file_open_param.sql
--
-- Follow-up to `sharing_registry_route_truth_d138.sql`. That migration audited
-- every `url_path_template` against the App Router tree and repointed
-- `code_file` at `/code?tab=code-file:{id}` because that is what the entity
-- registry claimed. Both were wrong in the same way: `/code` is a real route,
-- so the path-level scan passed — but the code workspace never read `?tab=`.
-- The Open door therefore landed the user on the bare workspace with the
-- requested file NOT open. A NO DEAD ENDS violation the route scan cannot see,
-- because it validates the PATH and this defect lives in the QUERY.
--
-- The workspace has honored a deep-link param since it was built; it is
-- `?open=<code_file_id>` (features/code/hooks/useOpenCodeFileFromUrl.ts →
-- useOpenLibraryFile → opens the `code.code_files` row as a Monaco tab and
-- flips the side panel to Library). Point both registries at the shape that
-- actually works rather than inventing a second one.
--
-- `code_folder` / `code_repository` keep their empty templates: the workspace
-- has no per-folder or per-repository deep link, and an empty template is the
-- registry honestly rendering no link instead of a 404.
--
-- Idempotent: a value-set UPDATE keyed on resource_type.

begin;

update platform.shareable_resource_registry
set url_path_template = '/code?open={id}'
where resource_type = 'code_file'
  and url_path_template is distinct from '/code?open={id}';

commit;
