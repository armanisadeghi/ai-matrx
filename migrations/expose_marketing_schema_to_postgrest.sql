-- Applied live via Supabase MCP 2026-08-15 (project txzxabzwovsujtloxrus).
--
-- Exposes the `marketing` schema to PostgREST. Verified afterwards with a real
-- authenticated session: GET /rest/v1/initiative (Accept-Profile: marketing)
-- returns 200, and anon is correctly refused (no anon grant on this schema).
--
-- APPEND ONLY. The full list is restated verbatim because ALTER ROLE ... SET
-- replaces the whole value; a dropped name here is an instant platform-wide
-- PGRST002/503 outage, not a degraded feature. Read the current live value
-- first (pg_db_role_setting for role `authenticator`) and append to THAT —
-- never to this file's copy, which ages the moment another schema lands.
alter role authenticator set pgrst.db_schemas =
  'public, graphql_public, admin, agent, ai, app, billing, canvas, chat, code, communication, content_ir, context, docproc, education, extend, files, graveyard, iam, legal, pdf, platform, podcast, rag, research, scheduler, scraper, skill, tool, transcripts, ui, users, web, workbench, workflow, workspace, seo, plan, crm, growth, marketing';

notify pgrst, 'reload schema';
notify pgrst, 'reload config';
