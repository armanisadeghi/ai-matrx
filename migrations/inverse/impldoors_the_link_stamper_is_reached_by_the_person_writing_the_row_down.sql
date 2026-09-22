-- chair-step: restores the two link-stamper door rows to the "server_only" non_client_lane
-- sentence they carried before impldoors_the_link_stamper_is_reached_by_the_person_writing_the_row.sql.
-- It writes DATA only -- no DDL, no DROP, no grant. Running it returns
-- check:impl-doors:strict to RED on D16a for both rows, which is the defect put back.
--
-- ground-standing-ok: a b c d
--   (a) drops no function.  (b) calls nothing a sibling inverse takes away.
--   (c) restores no body.   (d) removes no object a later migration adopted.

update platform.client_callable_door
   set signed_in_callers = false,
       non_client_lane = 'server_only: it is called by the communication.notification BEFORE trigger '
         || 'and by the notification spine. A browser has no use for it and holds no grant on it.',
       reason = 'THE ONE rule that puts the employer on a link. Server-side only.'
 where schema_name = 'platform'
   and function_name in ('link_carries_its_organization', 'action_link_carries_its_organization');
