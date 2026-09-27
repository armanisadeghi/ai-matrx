-- lane: access-ladder T-12 (the indexed switch), part a: the per-item column.
-- Law: common-docs/policies/access-ladder.md ("Public items: indexed or not");
-- words: common-docs/projects/access-ladder/terminology.md — stored name
-- `search_engine_indexed`, label "Indexed by search engines", NULL = follow the type knob
-- `access.indexed_by_default/<token>` (part b). Only meaningful while the record is
-- published to the web (today: visibility = 'public'); the resolver in part b answers
-- "not indexed" for anything unpublished, so a stale TRUE can never reach a crawler.
--
-- One table per transaction, lock_timeout 2s (a nullable column with no default is a
-- catalog-only change; the lock is held for milliseconds). Applied table by table through
-- the Supabase MCP on 2026-09-27; each block below is one apply.
set lock_timeout = '2s';

alter table podcast.pc_episodes         add column if not exists search_engine_indexed boolean;
alter table podcast.pc_shows            add column if not exists search_engine_indexed boolean;
alter table podcast.pc_articles         add column if not exists search_engine_indexed boolean;
alter table agent.definition            add column if not exists search_engine_indexed boolean;
alter table app.definition              add column if not exists search_engine_indexed boolean;
alter table canvas.shared_canvas_items  add column if not exists search_engine_indexed boolean;
alter table education.fc_set            add column if not exists search_engine_indexed boolean;
alter table education.learn_doc         add column if not exists search_engine_indexed boolean;
alter table workbench.notes             add column if not exists search_engine_indexed boolean;
alter table agent.message_template      add column if not exists search_engine_indexed boolean;

do $$
declare t text;
begin
  foreach t in array array['podcast.pc_episodes','podcast.pc_shows','podcast.pc_articles',
    'agent.definition','app.definition','canvas.shared_canvas_items','education.fc_set',
    'education.learn_doc','workbench.notes','agent.message_template'] loop
    execute format($c$comment on column %s.search_engine_indexed is %L$c$, t,
      'Indexed by search engines (access ladder T-12). NULL = follow the type knob '
      || 'access.indexed_by_default/<token> (system -> organization); true/false = the creator''s '
      || 'choice for this record. Meaningful only while the record is published to the web; '
      || 'read it only through platform.search_engine_indexed(), never directly.');
  end loop;
end $$;
