-- lock: custom,platform
-- lane: S2-PRIME
-- chair-step: the inverse of filtergroups_a_signed_in_person_may_read_a_rules_members.sql. It
-- REVOKES EXECUTE on custom.rule_members_visible(uuid, uuid, integer, integer) and
-- custom.pipeline_board(uuid, uuid, text, jsonb) from authenticated. What it undoes: a signed-in
-- person's saved-view membership and filtered board are refused again ("permission denied"). The
-- door rows stay (they belong to the lane file) but their signed-in lane is CLOSED first, with its
-- reason — otherwise the declared-doors sweep puts the grant straight back in the same statement.

set local lock_timeout = '2s';
set local statement_timeout = '60s';

update platform.client_callable_door
   set signed_in_callers = false,
       non_client_lane = 'closed by filtergroups_a_signed_in_person_may_read_a_rules_members_down.sql: the signed-in grant was taken back'
 where schema_name = 'custom'
   and ((function_name = 'rule_members_visible'
         and identity_argtypes = array['uuid'::regtype, 'uuid'::regtype, 'integer'::regtype, 'integer'::regtype]::oid[])
     or (function_name = 'pipeline_board'
         and identity_argtypes = array['uuid'::regtype, 'uuid'::regtype, 'text'::regtype, 'jsonb'::regtype]::oid[]))
   and declared_by = 'filtergroups_a_views_nested_question_is_one_where_clause.sql';

revoke execute on function custom.rule_members_visible(uuid, uuid, integer, integer) from authenticated;
revoke execute on function custom.pipeline_board(uuid, uuid, text, jsonb) from authenticated;
