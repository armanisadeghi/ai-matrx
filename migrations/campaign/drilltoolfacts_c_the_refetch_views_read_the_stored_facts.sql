-- chair-step: lane DRILL-TOOLFACTS, file 3 of 3 — chat.vw_tool_refetch and chat._tool_call_facts are re-pointed at the re-fetch facts chat.tool_call now stores (file 2) instead of recomputing them from the whole history on every read. Same columns, same names, same types, same answers (parity proven on the clone, every row of both views); security_invoker and grants unchanged. Apply ONLY after the backfill reports remaining_conversations = 0.
-- lane: DRILL-TOOLFACTS
-- lock: platform
--
-- WHAT IS READ LIVE vs STORED. Stored (chat._tool_call_refetch_settle): which earlier call a call
-- repeats (refetch_first_id), how many identical calls came before (refetch_prior), its place among the
-- conversation's base calls (refetch_seq), the trim verdict (refetch_trimmed) and the output hash
-- (refetch_out_hash). Live, off the call and its first call joined by primary key: same_data (the two
-- output hashes, null when either output was never stored), first_output_chars, the error_type filter,
-- gap_calls (seq difference), gap_secs, gap_iterations.
-- The per-tool table's window read (repeat_at >= since) and the drill's (created_at >= since) both walk
-- chat.idx_tool_call_counted_created (file 1).
--
-- INVERSE: migrations/inverse/drilltoolfacts_c_the_refetch_views_read_the_stored_facts_down.sql (the
-- previous bodies, verbatim from production).

set lock_timeout = '3s';

create or replace view chat.vw_tool_refetch with (security_invoker = true) as
select r.conversation_id,
       r.tool_name,
       r.arguments,
       r.id                                                  as repeat_tool_call_id,
       r.call_id                                             as repeat_call_id,
       r.created_at                                          as repeat_at,
       r.iteration                                           as repeat_iteration,
       r.output_chars                                        as repeat_output_chars,
       f.id                                                  as first_tool_call_id,
       f.call_id                                             as first_call_id,
       f.created_at                                          as first_at,
       f.iteration                                           as first_iteration,
       f.output_chars                                        as first_output_chars,
       r.refetch_prior                                       as prior_identical_calls,
       case
         when r.refetch_out_hash is not null and f.refetch_out_hash is not null
           then r.refetch_out_hash = f.refetch_out_hash
         else null::boolean
       end                                                   as same_data,
       r.refetch_seq - f.refetch_seq - 1                     as gap_calls,
       extract(epoch from r.created_at - f.created_at)::numeric(14,3) as gap_secs,
       r.iteration - f.iteration                             as gap_iterations,
       r.refetch_trimmed                                     as first_result_trimmed_before_repeat
  from chat.tool_call r
  join chat.tool_call f on f.id = r.refetch_first_id
 where r.deleted_at is null
   and r.tool_type = any (array['local'::text, 'agent'::text, 'external'::text])
   and r.refetch_prior > 0
   and coalesce(r.error_type, ''::text) <> all (array['duplicate'::text, 'loop_detected'::text])
   and coalesce(f.output_chars, 0) > 0;

comment on view chat.vw_tool_refetch is
  'One row per repeat: a tool call whose tool + arguments match an earlier call in the same conversation (the re-fetch base: local / agent / external, not archived, no side-effecting tool or write action), excluding duplicate / loop_detected errors and first calls with no output. DRILL-TOOLFACTS: reads the facts chat.tool_call stores (refetch_* columns, kept by chat._tool_call_refetch_settle); same_data, gaps and first-call fields are read live off the two rows.';

create or replace view chat._tool_call_facts with (security_invoker = true) as
select tc.id                                                   as tool_call_id,
       tc.conversation_id,
       tc.tool_name,
       tc.created_at,
       c.initial_agent_id                                      as agent_id,
       c.created_by                                            as person_id,
       coalesce(tc.output_chars, 0)                            as output_chars,
       (r.repeat_tool_call_id is not null)::int                as is_repeat,
       coalesce(r.same_data, false)::int                       as same_data,
       (r.repeat_tool_call_id is not null and r.same_data = false)::int as new_data,
       (r.repeat_tool_call_id is not null and r.same_data is null)::int as unknown_data,
       coalesce(r.first_result_trimmed_before_repeat, false)::int as after_trim,
       case when r.same_data then coalesce(r.first_output_chars, 0) else 0 end as chars_refetched_same_data,
       r.gap_calls,
       r.gap_secs
  from chat.tool_call tc
  left join lateral (
    select tc.id                                              as repeat_tool_call_id,
           case
             when tc.refetch_out_hash is not null and f.refetch_out_hash is not null
               then tc.refetch_out_hash = f.refetch_out_hash
             else null::boolean
           end                                                as same_data,
           tc.refetch_trimmed                                 as first_result_trimmed_before_repeat,
           f.output_chars                                     as first_output_chars,
           tc.refetch_seq - f.refetch_seq - 1                 as gap_calls,
           extract(epoch from tc.created_at - f.created_at)::numeric(14,3) as gap_secs
      from chat.tool_call f
     where f.id = tc.refetch_first_id
       and tc.refetch_prior > 0
       and coalesce(tc.error_type, ''::text) <> all (array['duplicate'::text, 'loop_detected'::text])
       and coalesce(f.output_chars, 0) > 0
  ) r on true
  left join chat.conversation c on c.id = tc.conversation_id
 where tc.deleted_at is null
   and tc.tool_type = any (array['local'::text, 'agent'::text, 'external'::text]);

comment on view chat._tool_call_facts is
  'DRILL-SERVER-2: one row per tool call the re-fetch report counts, with whether it repeated an earlier identical call (chat.vw_tool_refetch''s rules) — what the drill definition tool_refetch counts. DRILL-TOOLFACTS: reads the stored refetch_* facts on chat.tool_call instead of chat.vw_tool_refetch. Server-only (System machinery, token tool_call_facts); read only by the drill door''s definer step with its lane rule compiled in.';
