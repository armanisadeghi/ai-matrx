-- target: branch
--
-- THE INVERSE of `migrations/campaign/w3_doc_the_template_is_a_record_v2.sql` (W3-DOC, REC-68).
--
-- It restores the prior state exactly: every object this lane created under its own reserved
-- prefix `doc_` inside schema `custom` is dropped, and NOTHING ELSE IS TOUCHED. This lane
-- holds no lock and altered no other lane's object, so there is no body to put back and no
-- `-- based-on:` hash to restore — which is itself the check that the up-migration stayed
-- inside §4.7's exemption.
--
-- It REFUSES rather than silently half-reversing when a later object still depends on one of
-- these (the render path, the signature door), because a template function dropped out from
-- under a signed document is the one failure this whole lane exists to prevent.

set lock_timeout = '5s';
set statement_timeout = '600s';

do $inv$
declare
  v_dependants text;
begin
  select string_agg(format('%s.%s', n.nspname, p.proname), ', ' order by p.proname)
    into v_dependants
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'custom'
     and p.proname in ('doc_render_document', 'doc_sign', 'doc_signature_intact',
                       'doc_render_body', 'doc_content_hash');
  if v_dependants is not null then
    raise exception 'the render path and the signature door are still here (%), and they read these functions', v_dependants
      using errcode = '2BP01',
            hint = 'Run migrations/inverse/w3_doc_the_render_path_and_the_signature_value_down.sql first, then this one. Reversing in the other order would leave a signed document whose template machinery is gone.';
  end if;
end;
$inv$;

drop view if exists custom.doc_template;

-- A DOOR FOLLOWS ITS FUNCTION (platform._provision_shape_settled()'s own words): dropping
-- `custom.doc_template_save` without first removing its `platform.client_callable_door` row
-- leaves a promise nobody can verify, and the guard refuses the transaction at COMMIT rather
-- than let it stand. FOUND when this inverse was first run (rule 20, fix on sight): the row
-- was never deleted here.
delete from platform.client_callable_door
 where schema_name = 'custom' and function_name = 'doc_template_save';

drop function if exists custom.doc_template_save(uuid, uuid, text, text, uuid);
drop function if exists custom.doc_unresolved_tokens(uuid, uuid, text);
drop function if exists custom.doc_format_value(jsonb, jsonb);
drop function if exists custom.doc_tokens(text);
drop function if exists custom.doc_token_pattern();
