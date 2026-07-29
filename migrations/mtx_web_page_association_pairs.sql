-- Register the missing X -> web_page association pairs so the Page Workspace
-- association card grid can attach every curated content/utility entity.
-- Follows the pre-existing pattern on this container (note/file/conversation/
-- working_document -> web_page: container_side='target', conveys_max='viewer').
-- Container-role tokens (project, org, scope, repos, campaigns) and task are
-- deliberately NOT registered here - their direction vs a page is a product
-- decision (task is already registered the other way: web_page -> task).
--
-- Applied live via Supabase MCP apply_migration on 2026-07-29.
insert into platform.association_types (source_type, target_type, container_side, conveys_max, is_active, notes)
select et.token, 'web_page', 'target', 'viewer'::permission_level, true,
       'Page-workspace attachment (registered 2026-07-29, matches existing note/file/conversation->web_page pattern; conveyance=viewer like siblings)'
from platform.entity_types et
where et.content_role in ('source','destination','hybrid','utility')
  and et.title_column is not null and et.is_active
  and et.token <> 'web_page'
  and not exists (
    select 1 from platform.association_types at
    where (at.source_type = et.token and at.target_type = 'web_page')
       or (at.source_type = 'web_page' and at.target_type = et.token)
  );
