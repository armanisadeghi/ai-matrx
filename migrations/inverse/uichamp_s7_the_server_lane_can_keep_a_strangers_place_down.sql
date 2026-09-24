-- chair-step: this REVOKES the two EXECUTE grants lane S7-PRIME issued — `custom.form_draft_save(uuid, jsonb, text, text, text)` and `custom.form_draft_read(uuid, text)` from `service_role`. After it the public page's save route answers with the door's refusal and the page says, in words, that answers are not being kept (the state before this lane: nothing was kept). No function, table, row or other grant is touched, and `anon` was never named in either direction.
-- lane: S7-PRIME
-- lock: custom,platform

revoke execute on function custom.form_draft_save(uuid, jsonb, text, text, text) from service_role;
revoke execute on function custom.form_draft_read(uuid, text) from service_role;
