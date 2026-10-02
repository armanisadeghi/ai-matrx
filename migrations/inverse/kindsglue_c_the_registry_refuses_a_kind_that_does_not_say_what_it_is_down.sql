-- INVERSE of migrations/campaign/kindsglue_c_the_registry_refuses_a_kind_that_does_not_say_what_it_is.sql (lane
-- KINDS-GLUE): the refusal made inert — the trigger function returns NEW at once. The trigger itself stays: DROP TRIGGER
-- takes ACCESS EXCLUSIVE on content_ir.kind_definition, which every catalog read waits behind (kindsglue_a measured a
-- lock timeout on the clone). Re-applying the up file restores the refusal (create or replace of the same function).
-- based-on: content_ir._kind_says_what_its_output_is() b368eaa70a0cce2fa5e133cd2b736aab99740e6e8a8546a65f2977d87b2dbcd2
-- lane: KINDS-GLUE

create or replace function content_ir._kind_says_what_its_output_is()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  return new;
end
$function$;

comment on function content_ir._kind_says_what_its_output_is() is
  'KINDS-GLUE: INERT (kindsglue_c inverse applied) — re-apply kindsglue_c to refuse undeclared live kinds again.';
