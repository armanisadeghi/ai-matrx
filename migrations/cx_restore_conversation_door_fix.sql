-- DD-179 follow-up: the §6d-4 door row for runtime.spine_restore_conversation_requests
-- rendered its identity_args as `timestamptz` while pg_get_function_identity_arguments()
-- renders `timestamp with time zone`. The guard matches on the RENDERED identity, so the
-- declaration did not match, the client EXECUTE grant was revoked inside my own GRANT
-- statement (exactly as db-rules §6d-4 says it would), and every authenticated restore
-- would have 403'd at the spine step. The guard worked; the declaration was wrong.
--
-- Verified before writing this file: proacl on the function held only postgres + service_role.

update platform.client_callable_door
   set identity_args = 'p_conversation_id uuid, p_stamp timestamp with time zone'
 where schema_name = 'runtime'
   and function_name = 'spine_restore_conversation_requests';

grant execute on function runtime.spine_restore_conversation_requests(uuid, timestamptz) to authenticated;
