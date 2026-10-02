-- INVERSE of migrations/campaign/kindsglue_c_the_registry_refuses_a_kind_that_does_not_say_what_it_is.sql (lane
-- KINDS-GLUE): the refusal made inert — the trigger function returns NEW at once. The trigger itself stays: DROP TRIGGER
-- takes ACCESS EXCLUSIVE on content_ir.kind_definition, which every catalog read waits behind (kindsglue_a measured a
-- lock timeout on the clone). Re-applying the up file restores the refusal (create or replace of the same function).
-- based-on: content_ir._kind_says_what_its_output_is() 5a384a4349f101fa1cfa1fac80723142d9fd00a76c4991201e141a26ba8d6d61
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
