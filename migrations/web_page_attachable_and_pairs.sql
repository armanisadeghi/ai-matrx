-- Make canonical pages attachable (title_column gates pickers/cards) and
-- register the page-workspace association pairs. is_component stays TRUE —
-- web.page's RLS derives from web_site (composition), and the attachability
-- gate is title_column, not is_component.
update platform.entity_types
  set title_column = 'url', content_role = 'source'
  where token = 'web_page' and (title_column is distinct from 'url' or content_role is distinct from 'source');

-- Content → page (container_side='target': the page is the container; viewer
-- conveyance matches the existing seo_keyword→web_page rule. Conveyance is
-- adjustable by Arman at /administration/relationships.)
insert into platform.association_types (source_type, target_type, container_side, conveys_max, is_active, notes) values
  ('note',             'web_page', 'target', 'viewer', true, 'Page workspace attachments — notes about a canonical page. 2026-07-27'),
  ('task',             'web_page', 'target', 'viewer', true, 'Page workspace attachments — tasks for a canonical page. 2026-07-27'),
  ('file',             'web_page', 'target', 'viewer', true, 'Page workspace attachments — files for a canonical page. 2026-07-27'),
  ('conversation',     'web_page', 'target', 'viewer', true, 'Page workspace attachments — conversations about a canonical page. 2026-07-27'),
  ('working_document', 'web_page', 'target', 'viewer', true, 'Page workspace attachments — working documents for a canonical page. 2026-07-27'),
  ('note',             'web_screenshot', 'target', 'viewer', true, 'Per-capture attachments on the page workspace. 2026-07-27'),
  ('task',             'web_screenshot', 'target', 'viewer', true, 'Per-capture attachments on the page workspace. 2026-07-27'),
  ('file',             'web_screenshot', 'target', 'viewer', true, 'Per-capture attachments on the page workspace. 2026-07-27')
on conflict do nothing;
