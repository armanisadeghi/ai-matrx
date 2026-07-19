-- Expose the canonical web schema through PostgREST.
--
-- The dashboard setting was saved first, but the production PostgREST role
-- configuration remained unchanged and returned PGRST106 for Accept-Profile:
-- web. Keep the existing authoritative schema list byte-for-byte and append
-- web so direct browser Supabase reads work on the custom API domain.

ALTER ROLE authenticator SET pgrst.db_schemas TO
  'public, graphql_public, admin, agent, ai, app, billing, canvas, chat, code, communication, content_ir, context, docproc, education, extend, files, graveyard, iam, legal, pdf, platform, podcast, rag, research, scheduler, scraper, skill, tool, transcripts, ui, users, web, workbench, workflow, workspace';

NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
