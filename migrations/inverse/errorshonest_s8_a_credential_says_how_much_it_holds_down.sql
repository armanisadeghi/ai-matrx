-- chair-step: this undoes errorshonest_s8_a_credential_says_how_much_it_holds.sql — it removes the one platform.client_callable_door row that file declared and drops users.credential_item_holdings(uuid[]) (its EXECUTE grant goes with it). A door row follows its function (provision_shape_guard refuses a row naming a function that no longer exists), so the row is removed, not closed. Neither holds data. Undoing it returns the vault list to guessing: an empty credential is again reported as a read the database refused (the client announces the stand-in).
-- lane: ERRORS-HONEST

delete from platform.client_callable_door
 where schema_name = 'users' and function_name = 'credential_item_holdings';

drop function if exists users.credential_item_holdings(uuid[]);
