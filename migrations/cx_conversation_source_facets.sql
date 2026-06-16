-- get_cx_conversation_source_facets — distinct (source_app, source_feature)
-- pairings + per-pairing conversation counts for the calling user.
--
-- Powers the conversation "source filter" tree (app -> feature) in the chat
-- and history sidebars: the UI shows real values + counts and auto-discovers
-- new source_app / source_feature strings without a code change.
--
-- SECURITY INVOKER: cx_conversation RLS already scopes reads to the owner; we
-- also filter user_id = auth.uid() explicitly (defense-in-depth + lets the
-- planner use the user_id index). Excludes ephemeral + soft-deleted rows to
-- match what the sidebar fetch shows.
--
-- Idempotent: CREATE OR REPLACE + grant are safe to re-run.

create or replace function public.get_cx_conversation_source_facets()
returns table (
  source_app text,
  source_feature text,
  n bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    c.source_app,
    c.source_feature,
    count(*)::bigint as n
  from public.cx_conversation c
  where c.user_id = auth.uid()
    and c.deleted_at is null
    and c.is_ephemeral = false
  group by c.source_app, c.source_feature
  order by count(*) desc;
$$;

grant execute on function public.get_cx_conversation_source_facets() to authenticated;

comment on function public.get_cx_conversation_source_facets() is
  'Distinct (source_app, source_feature) pairings + counts for the calling user. Powers the conversation source-filter tree. SECURITY INVOKER; excludes ephemeral + soft-deleted rows.';
