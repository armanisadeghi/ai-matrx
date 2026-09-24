-- chair-step: this undoes errorshonest_s8_a_credential_says_how_much_it_holds.sql — it closes the one platform.client_callable_door row that file declared (with its reason), revokes EXECUTE on users.credential_item_holdings(uuid[]) from authenticated, and drops the function. It holds no data. Undoing it returns the vault list to guessing: an empty credential is again reported as a read the database refused.
-- lane: ERRORS-HONEST

update platform.client_callable_door
   set signed_in_callers = false,
       non_client_lane = 'Closed by errorshonest_s8_a_credential_says_how_much_it_holds_down.sql: the vault list no longer asks how much a credential holds; re-apply errorshonest_s8_a_credential_says_how_much_it_holds.sql to reopen it.'
 where schema_name = 'users' and function_name = 'credential_item_holdings';

revoke execute on function users.credential_item_holdings(uuid[]) from authenticated;

drop function if exists users.credential_item_holdings(uuid[]);
