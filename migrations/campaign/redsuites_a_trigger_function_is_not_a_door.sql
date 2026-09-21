-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- allows: revoke custom
--
-- RED-SUITES — A TRIGGER FUNCTION IS NOT A DOOR, AND TWENTY-THREE OF THEM SAID IT WAS.
--
-- VERIFIER-8 Part C, confirmed on the main database 2026-09-21:
--   DOOR-17 FAIL: these functions are EXECUTE-able by anon or PUBLIC:
--     io_record_changed_stmt_delete, io_record_changed_stmt_insert,
--     io_record_changed_stmt_update, io_outbox_broadcast_stmt
-- That is `w4_anon_green`'s PART 10, the clause that checks W4-ANON's own sentence — "this
-- lane granted `anon` nothing" — against the catalogue instead of asserting it. Parts 0 to 9
-- all pass; this is the posture clause and it was right.
--
-- IT IS NOT AN EXPLOIT, AND THE CENSUS SAYS WHY. All four RETURN `trigger`, so PostgREST will
-- not route them (the verifier proved it over HTTP: 404 PGRST202) and Postgres itself refuses
-- a direct call — "trigger functions can only be called as trigger triggers". What it IS is a
-- grant that says the opposite of the posture, on SECURITY DEFINER bodies that write
-- `custom.io_outbox` — one REVOKE away from being true, and the kind of sentence that is
-- believed later by somebody deciding whether a surface is safe.
--
-- SO THE CLASS, NOT THE FOUR NAMES. Measured the same day: schema `custom` holds 51
-- trigger-returning functions, 28 with an explicit ACL and 23 carrying Postgres's default
-- `EXECUTE TO PUBLIC`. The suite names four of the 23 only because its census is scoped to
-- `anon_*` and `io_*`. A trigger function is reached by the trigger's OID at fire time and by
-- nothing else, so EXECUTE on it grants a client exactly nothing it can use — which is the
-- whole argument for taking it away from all 23 rather than from the four the suite happens
-- to look at. Every one of them keeps firing exactly as it does now.
--
-- WHY THIS IS SAFE AGAINST THE OFF SWITCH: `-- allows: revoke custom` is the bounded route,
-- every statement stays inside schema `custom`, and §6.3's fact two — the REVOKEs that ARE
-- the store's security boundary — is only strengthened by it.
--
-- THE INVERSE, if it is ever wanted: `grant execute on function custom.<name>() to public;`
-- for each name below. Nothing needs it; the list is here so the change is reversible on
-- paper as well as in principle.

revoke execute on function custom._checklist_step_guard() from public;
revoke execute on function custom._checklist_watch() from public;
revoke execute on function custom._checklist_watch_stmt_insert() from public;
revoke execute on function custom._checklist_watch_stmt_update() from public;
revoke execute on function custom._containment_association_stmt_insert() from public;
revoke execute on function custom._containment_association_stmt_update() from public;
revoke execute on function custom._field_class_guard() from public;
revoke execute on function custom._pipeline_on_entry() from public;
revoke execute on function custom._relation_associations() from public;
revoke execute on function custom._relation_associations_stmt_insert() from public;
revoke execute on function custom._relation_associations_stmt_update() from public;
revoke execute on function custom._resolve_choice_words() from public;
revoke execute on function custom._store_on_for_a_new_organization() from public;
revoke execute on function custom._store_relation_edge_names_its_field() from public;
revoke execute on function custom._table_columns_word_guard() from public;
revoke execute on function custom._table_owner_stamp() from public;
revoke execute on function custom._undeclared_key_guard() from public;
revoke execute on function custom._unique_rule_holds() from public;
revoke execute on function custom._workdoors_approval_guard() from public;
revoke execute on function custom.io_outbox_broadcast_stmt() from public;
revoke execute on function custom.io_record_changed_stmt_delete() from public;
revoke execute on function custom.io_record_changed_stmt_insert() from public;
revoke execute on function custom.io_record_changed_stmt_update() from public;
