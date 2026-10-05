-- lane: AGENTS-ON-DATA
-- additive: yes
--
-- AGENTS-ON-DATA item 3 — a chat opened on a table page can work that table. The table page and its
-- record page send surface `matrx-user/data-tables` (with table_id in scope), but no surface default
-- existed, so a chat there had `records` only if its agent happened to carry it. TOOL-SOURCES T1:
-- a surface's direct tools ride while automatic tools are on.

set local statement_timeout = '30s';

insert into tool.surface_defaults (surface_name, always_include_tools, always_include_bundles,
                                   never_include_tools, never_include_bundles, arg_defaults, arg_injection,
                                   notes, is_active, metadata, organization_id, visibility, published_to_web)
select 'matrx-user/data-tables', array['records'], array[]::text[], array[]::text[], array[]::text[],
       '{}'::jsonb, '{}'::jsonb,
       'Table page + record page: a chat here can read and change the person''s tables (AGENTS-ON-DATA item 3, 2026-10-04).',
       true, '{}'::jsonb, c.organization_id, c.visibility, c.published_to_web
  from tool.surface_defaults c
 where c.surface_name = 'matrx-user/chat'
   and not exists (select 1 from tool.surface_defaults d where d.surface_name = 'matrx-user/data-tables');
