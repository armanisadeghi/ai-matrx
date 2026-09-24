-- chair-step: this REVOKES the one EXECUTE grant lane FORMS-FIX-1 issued — `custom.form_public_asks(uuid, jsonb, text, text)` from `service_role`. After it, the public form's branching route answers with the door's refusal and the page shows every conditional question with its sentence, which is the state before this lane. No function, table, row or other grant is touched, and `anon` was never named in either direction.
-- lane: FORMS-FIX-1

revoke execute on function custom.form_public_asks(uuid, jsonb, text, text) from service_role;
