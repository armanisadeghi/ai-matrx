-- lane: TYPEFORM-2
-- lock: custom,platform
--
-- LANE TYPEFORM-2, part d. The builder's preview drew the owner's header ON whatever the
-- organization's knob said. custom.form_knobs(org) answers the organization's own values of
-- forms/show_owner_header and forms/choice_auto_advance, behind the organization wall; the builder
-- lays the form's override on top. Additive. Inverse: migrations/inverse/typeform2_d_the_builder_reads_the_forms_knobs_down.sql

set local lock_timeout = '2s';
set local statement_timeout = '60s';

create function custom.form_knobs(p_organization_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog'
as $fn$
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.form_knobs');
  perform custom.assert_store_door(p_organization_id, 'custom.form_knobs');
  return jsonb_build_object(
    'show_owner_header', coalesce((platform.knob_resolve('forms', 'show_owner_header', p_organization_id) #>> '{}')::boolean, true),
    'choice_auto_advance', coalesce((platform.knob_resolve('forms', 'choice_auto_advance', p_organization_id) #>> '{}')::boolean, true));
end;
$fn$;
grant execute on function custom.form_knobs(uuid) to authenticated, service_role;
comment on function custom.form_knobs(uuid) is
  'TYPEFORM-2: the organization''s forms/show_owner_header and forms/choice_auto_advance, for the form builder''s preview.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
values ('custom', 'form_knobs', 'p_organization_id uuid', array['uuid'::regtype]::oid[],
        'Takes an organization only. Refuses unless custom.assert_client_may_reach and custom.assert_store_door admit the caller to it; answers two booleans from the knob register.',
        'typeform2_d_the_builder_reads_the_forms_knobs.sql', null, true, false,
        jsonb_build_object('version', 1, 'declared_at', '2026-10-07 lane TYPEFORM-2',
          'declared_by', 'typeform2_d_the_builder_reads_the_forms_knobs.sql',
          'arguments', jsonb_build_object('p_organization_id', jsonb_build_object(
            'type', 'uuid', 'entity', 'organization', 'position', 1, 'optional', false,
            'check', 'this body decides it with custom.assert_client_may_reach(arg1), custom.assert_store_door(arg1) — the organization wall — a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.',
            'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
            'verified', '2026-10-07 lane TYPEFORM-2 — written with this body'))))
on conflict do nothing;
