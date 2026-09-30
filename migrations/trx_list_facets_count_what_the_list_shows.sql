-- draft: knowledge-transcripts lane — held for the security owner: flips two SECURITY DEFINER functions to INVOKER (a privilege change; builders do not apply security changes, Arman 2026-09-28/29)
--
-- WHY. The Transcripts list (public.trx_list_scoped, SECURITY INVOKER) and its
-- counts (public.trx_list_facets, public.trx_list_scope_counts, both SECURITY
-- DEFINER) disagree for recording sessions. trx_list_facets calls
-- trx_list_scoped from inside a DEFINER body, so the list runs as the function
-- owner and studio_sessions' row-level security does not apply: it counts
-- sessions the person's own list never returns.
--
-- MEASURED 2026-09-29 through PostgREST as admin@admin.com (scope "orgs"):
--   kind=session   facet 211  vs  list total 53
--   kind=cleanup   facet  27  vs  list total 22
--   status=idle    facet 227  vs  list total 70
--   status=stopped facet  11  vs  list total  5
--   kind=transcript, status=draft/final: equal (transcripts' RLS agrees with the function's scope)
--
-- The hub no longer shows those numbers (it counts the session-bearing facets
-- through trx_list_scoped itself), so nothing waits on this file. Applying it
-- makes every caller of these two functions — the retired list at
-- /compare/old/transcripts included — count exactly what the person can see,
-- and stops the counts disclosing rows RLS withholds.
--
-- Whether studio_sessions' RLS or the function's own scope filter is the right
-- reach is the security owner's call; this file only makes the counts agree with
-- the list the same person gets.

alter function public.trx_list_facets(text, uuid, text, boolean) security invoker;
alter function public.trx_list_scope_counts(text, boolean, jsonb) security invoker;
