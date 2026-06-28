-- expose_podcast_schema_postgrest
-- 2026-06-28 — Add `podcast` to PostgREST's exposed schema list so the FE can
-- read podcast.pc_* directly via supabase-js (.schema('podcast')). The list is
-- set on the authenticator role's pgrst.db_schemas GUC (in-database config); the
-- value below is the FULL existing exposed set + podcast (verified live from the
-- PGRST106 error hint) so nothing is un-exposed. NOTIFY reloads PostgREST.
-- If the Supabase dashboard "Exposed schemas" is ever edited, keep `podcast`.
alter role authenticator set pgrst.db_schemas =
 'public, graphql_public, admin, agent, ai, app, canvas, chat, code, communication, context, docproc, education, extend, files, graveyard, iam, legal, platform, rag, research, scheduler, skill, tool, transcripts, ui, users, workbench, workspace, podcast';
notify pgrst, 'reload config';
notify pgrst, 'reload schema';
