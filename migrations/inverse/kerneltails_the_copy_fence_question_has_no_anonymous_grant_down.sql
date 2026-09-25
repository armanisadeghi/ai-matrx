-- INVERSE of migrations/campaign/kerneltails_the_copy_fence_question_has_no_anonymous_grant.sql (lane KERNEL-TAILS).
-- Re-declares the anonymous caller (the row's words before this lane) and re-grants anon.
set local lock_timeout = '30s';

update platform.client_callable_door
   set anonymous_callers = true,
       anonymous_purpose = 'The copy fence runs as whichever role writes custom.record, including a public form submitted by a visitor who is not signed in; the fence must still refuse that write with a sentence. The may-open ladder never admits a signed-out caller, so a visitor learns only that an id is a copy, never its name.'
 where schema_name = 'custom' and function_name = '_older_table_copy_refusal'
   and identity_argtypes = array['uuid'::regtype]::oid[];

grant execute on function custom._older_table_copy_refusal(uuid) to anon;
