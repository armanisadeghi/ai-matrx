-- chair-step: lane DRILL-SERVER-2 — A TOOL CALL SAYS WHETHER IT REPEATED. It CREATES one server-only view chat._tool_call_facts (one row per tool call the re-fetch report counts — not archived, tool type local, agent or external — with its conversation, the conversation's agent and person, and whether it repeated an earlier identical call: same data, new data, data not stored, after the first result was trimmed, the gap) and registers it as System machinery (token tool_call_facts, a projection of tool_call) so the declared drill definition tool_refetch can count it definer with its platform-admin lane rule compiled in. No client grant; no table, policy or row of anybody's data is touched.
-- lane: DRILL-SERVER-2
-- lock: platform
--
-- WHY ONE ROW PER CALL, NOT PER REPEAT. The report's rates are repeats over ALL of a tool's calls
-- (chat.vw_tool_refetch_summary: repeat_rate = repeats / total_calls). chat.vw_tool_refetch holds only
-- the repeats, so a drill over it could not say a rate. Here every call is a row and a repeat carries
-- its flags (1/0, so they sum), and the rates are the drill's ratio measures.
-- THE RULES are chat.vw_tool_refetch's and chat.vw_tool_refetch_summary's, read from them (never
-- restated): a call is a repeat when vw_tool_refetch names it (repeat_tool_call_id); same_data,
-- new_data and unknown_data are its same_data true / false / null; after_trim is
-- first_result_trimmed_before_repeat; chars_refetched_same_data is first_output_chars on a same-data
-- repeat (the summary's column); gap_calls and gap_secs are the repeat's (null on a call that is not one,
-- so a median over them is the summary's median).
-- INVERSE: migrations/inverse/drillserver2_a_tool_call_says_whether_it_repeated_down.sql

create view chat._tool_call_facts with (security_invoker = true) as
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
  left join chat.vw_tool_refetch r on r.repeat_tool_call_id = tc.id
  left join chat.conversation c on c.id = tc.conversation_id
 where tc.deleted_at is null
   and tc.tool_type = any (array['local', 'agent', 'external']);

revoke all on chat._tool_call_facts from public, anon, authenticated;
comment on view chat._tool_call_facts is
  'DRILL-SERVER-2: one row per tool call the re-fetch report counts, with whether it repeated an earlier identical call (chat.vw_tool_refetch) — what the drill definition tool_refetch counts. Server-only (System machinery, token tool_call_facts); read only by the drill door''s definer step with its lane rule compiled in.';
comment on column chat._tool_call_facts.is_repeat is '1 when chat.vw_tool_refetch names this call as a repeat of an earlier identical call in its conversation, else 0.';
comment on column chat._tool_call_facts.chars_refetched_same_data is 'On a same-data repeat, the first call''s output characters (chat.vw_tool_refetch_summary.chars_refetched_same_data); else 0.';

insert into platform.entity_types (
  token, schema_name, table_name, label, base_tier, is_versioned, has_soft_delete, is_active,
  notes, is_listed, is_component, is_module, rls_variant, reference_pickable, audit_class,
  audit_class_reason, relation_kind, projects_token, data_class, data_class_reason, default_list_scope,
  origin, type, type_reason, agent_writable, allow_preview, table_ref
)
values (
  'tool_call_facts', 'chat', '_tool_call_facts', 'Tool call facts', 1, false, false, true,
  'One row per tool call the re-fetch report counts, with whether it repeated an earlier identical call — what the tool_refetch drill definition counts.',
  false, false, false, 'system', false, 'machinery',
  'Projection: a server-only view over chat.tool_call, chat.vw_tool_refetch and chat.conversation. It owns no rows.',
  'projection', 'tool_call', 'organization',
  'System machinery with no client lane; read only by the drill door''s definer step (platform admins).',
  'organization', 'standard', 'system',
  'Lane DRILL-SERVER-2: the tool_refetch drill definition''s fact.',
  false, false, 'chat._tool_call_facts'::regclass
)
on conflict (token) do nothing;
