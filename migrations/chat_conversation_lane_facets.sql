-- get_cx_conversation_lane_facets — the conversation sidebar's ONE facet read,
-- now lane-aware.
--
-- The lane toggles (Chat | Matrx | Auto | Plugins | Subagents) gate the list
-- ABOVE the source tree (chat_conversation_lane_classifier.sql). For the tree
-- to stay honest it must list only the sources that live in the enabled lanes
-- — otherwise "Code Plugin" sits in the tree with a count while the Plugins
-- lane is off, and ticking it lists nothing. A (source_app, source_feature)
-- pair can span lanes (its origin_class / conversation_type decide), so the
-- facet row carries its lane. The toggle badges are the per-lane sums of the
-- same rows, so one round-trip feeds both.
--
-- Supersedes, for the one client that read them:
--   public.get_cx_conversation_source_facets()  (no lane column)
--   public.get_cx_conversation_lane_counts()    (lane totals only; created
--                                                earlier today, never shipped)
-- Dropping those two is a DROP, i.e. a chair step at a terminal
-- (migrations/JUDGMENT.md §4b/§5) — tracked in the conversation-history
-- FEATURE.md, not done here.

create or replace function public.get_cx_conversation_lane_facets()
returns table(lane text, source_app text, source_feature text, n bigint)
language sql
stable
set search_path = ''
as $$
  select
    chat.conversation_lane(c.source_app, c.source_feature, c.origin_class, c.conversation_type) as lane,
    c.source_app,
    c.source_feature,
    count(*)::bigint as n
  from chat.conversation c
  where c.created_by = (select auth.uid())
    and c.deleted_at is null
    and c.is_ephemeral = false
  group by 1, 2, 3
  order by count(*) desc;
$$;

comment on function public.get_cx_conversation_lane_facets() is
  'The caller''s conversation facets: (lane, source_app, source_feature, n). Powers the conversation sidebar lane toggles (per-lane sums) and the source filter tree (facets in enabled lanes).';

grant execute on function public.get_cx_conversation_lane_facets() to authenticated, service_role;
