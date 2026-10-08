-- chair-step: lane DRILL-TOOLFACTS, file 1 of 3 — adds two partial btree indexes on chat.tool_call covering only the ~37k calls the re-fetch report counts (tool type local, agent or external), built CONCURRENTLY so no write on the table waits for them. Its only DROPs are 'drop index concurrently if exists' of these same two names, so a rerun rebuilds an INVALID leftover of a cancelled build instead of skipping it. No row is touched.
-- lane: DRILL-TOOLFACTS
-- lock: platform
-- AUTOCOMMIT FILE: CREATE INDEX CONCURRENTLY cannot run inside a transaction; apply statement by statement:
--   uv run python db/apply_migrations.py --source campaign --only drilltoolfacts_a_the_counted_tool_calls_are_indexed.sql --target <clone|production> --lane DRILL-TOOLFACTS --no-generate   (from aidream, --source matrx-frontend tree)
--
-- WHY. chat.tool_call holds ~720k rows, but ~95% are coding_agent calls the re-fetch report never
-- counts. Every report read and every repeat-facts settle filtered those out on the heap:
--   idx_tool_call_counted_created — (created_at) over the counted, live calls: the window scan behind
--     chat._tool_call_facts (the tool_refetch drill) and chat.vw_tool_refetch (the per-tool table).
--   idx_tool_call_counted_conv    — (conversation_id, created_at, id) over the counted calls, archived
--     ones included: one conversation's counted calls in order, which is what
--     chat._tool_call_refetch_settle (file 2) reads on every counted insert. A conversation can carry
--     45k coding_agent calls and fewer than 700 counted ones.
-- The predicate is written exactly as the views write it (tool_type = any (array[...])) so the
-- planner proves the implication.
--
-- ORDER: this file, then drilltoolfacts_b_a_tool_call_carries_its_repeat_facts.sql, then the backfill
-- batches (select * from chat.tool_call_refetch_backfill(500) until remaining = 0), then
-- drilltoolfacts_c_the_refetch_views_read_the_stored_facts.sql.
-- INVERSE: migrations/inverse/drilltoolfacts_a_the_counted_tool_calls_are_indexed_down.sql

drop index concurrently if exists chat.idx_tool_call_counted_created;
create index concurrently idx_tool_call_counted_created
  on chat.tool_call (created_at)
  where deleted_at is null and tool_type = any (array['local'::text, 'agent'::text, 'external'::text]);

drop index concurrently if exists chat.idx_tool_call_counted_conv;
create index concurrently idx_tool_call_counted_conv
  on chat.tool_call (conversation_id, created_at, id)
  where tool_type = any (array['local'::text, 'agent'::text, 'external'::text]);

-- rehearse-measure: skip-if-previous-nontransactional
do $check$
declare v_bad text;
begin
  select string_agg(w.n, ', ') into v_bad
    from (values ('idx_tool_call_counted_created'), ('idx_tool_call_counted_conv')) w(n)
    left join pg_catalog.pg_class c
      on c.relname = w.n and c.relkind = 'i'
     and c.relnamespace = 'chat'::regnamespace
    left join pg_catalog.pg_index i on i.indexrelid = c.oid
   where i.indisvalid is not true or i.indisready is not true;
  if v_bad is not null then
    raise exception 'drilltoolfacts indexes not valid: % — re-run the file', v_bad;
  end if;
end
$check$;
