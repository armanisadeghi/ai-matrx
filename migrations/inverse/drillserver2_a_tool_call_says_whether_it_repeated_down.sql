-- chair-step: the inverse of migrations/campaign/drillserver2_a_tool_call_says_whether_it_repeated.sql (lane DRILL-SERVER-2) — removes the registry row tool_call_facts and the view chat._tool_call_facts. Apply AFTER the inverse of the tool_refetch definition (which reads the view). No row of anybody's data is touched.
-- lane: DRILL-SERVER-2
-- lock: platform

delete from platform.entity_types where token = 'tool_call_facts';
drop view if exists chat._tool_call_facts;
