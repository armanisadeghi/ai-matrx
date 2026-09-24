-- lock: custom,platform
-- lane: S6
-- chair-step: the inverse of uichamp_s6_a_signed_in_person_may_open_a_portals_look_and_forms.sql.
-- It REVOKES EXECUTE on custom.portal_form(uuid, uuid, uuid) and
-- custom.portal_form_submit(uuid, uuid, uuid, jsonb, text) from authenticated. What it undoes: a
-- portal client can no longer open or send a portal form ("permission denied"). The door rows stay
-- (they belong to S6's own file) but their signed-in lane is CLOSED first, with its reason —
-- otherwise the declared-doors sweep puts the grant straight back in the same statement.
-- `custom.portal_declare`'s grant is NOT taken back: it is the builder's one door and was granted
-- before S6; the up file's own inverse re-creates the seven-argument door, and the sweep grants it.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

update platform.client_callable_door
   set signed_in_callers = false,
       non_client_lane = 'closed by uichamp_s6_a_signed_in_person_may_open_a_portals_look_and_forms_down.sql: the signed-in grant was taken back'
 where schema_name = 'custom' and function_name in ('portal_form', 'portal_form_submit')
   and declared_by = 'uichamp_s6_a_portal_carries_its_look_and_its_forms.sql';

revoke execute on function custom.portal_form(uuid, uuid, uuid) from authenticated;
revoke execute on function custom.portal_form_submit(uuid, uuid, uuid, jsonb, text) from authenticated;
