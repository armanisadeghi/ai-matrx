-- chair-step: a DROP of two functions nothing reads. `get_cx_conversation_source_facets`
-- was superseded by `get_cx_conversation_lane_facets` (same rows plus each source's lane),
-- and `get_cx_conversation_lane_counts` was a stepping stone that never got a consumer —
-- the lane toggles read their counts from the facets function. Censused first: no caller in
-- matrx-frontend, aidream, matrx-local or matrx-extend, and no other database object depends
-- on either. Both definitions stay in migration history, so nothing is lost.
--
-- Leaving them live is the real risk: a superseded facet function beside the live one is the
-- next agent's wrong answer about lanes.
drop function if exists public.get_cx_conversation_source_facets();
drop function if exists public.get_cx_conversation_lane_counts();

do $$
declare
  survivors bigint;
begin
  select count(*) into survivors
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('get_cx_conversation_source_facets', 'get_cx_conversation_lane_counts');
  if survivors > 0 then
    raise exception 'drop_superseded_conversation_facet_functions: % still present', survivors;
  end if;

  perform 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'get_cx_conversation_lane_facets';
  if not found then
    raise exception 'the live lane facets function is missing — refusing to leave no facet source';
  end if;
end $$;
