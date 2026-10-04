-- THE SENDER SEES THEIR ENVELOPES (SPEC-ESIGN §6.0 point 1 — the `/esign` product section).
--
-- The `esign` schema is not exposed to the browser's data API, and its two read doors
-- (`esign_envelope_state`, `esign_verify_envelope`) were declared server-only. Both decide access
-- themselves (`esign._may_manage(envelope, 'viewer')`: the sender, anyone granted access, a
-- platform admin), so they are opened to signed-in callers here. One new read lists envelopes:
--   lane 'sent'    — envelopes the caller sent or was granted access to;
--   lane 'to_sign' — envelopes where the caller is a signer (their own signer row);
--   lane 'all'     — both. The organization filter is a page control (`p_org_id`), never the
--   active organization.
-- Writes (create, send, remind, resend, void) stay server-only: aidream's `/esign/envelopes`
-- checks the caller's right first, then calls them carrying the caller's identity.

create or replace function public.esign_envelope_list(
  p_lane text default 'all',
  p_org_id uuid default null,
  p_search text default null,
  p_limit integer default 200
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'esign', 'public'
as $fn$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('granted', false, 'reason', 'not_authenticated');
  end if;
  return jsonb_build_object('granted', true, 'envelopes', coalesce((
    select jsonb_agg(row_to_json(x) order by x.updated_at desc)
      from (
        select e.id, e.title, e.status, e.organization_id,
               (select o.name from iam.organizations o where o.id = e.organization_id) as organization_name,
               e.created_at, e.sent_at, e.completed_at, e.expires_at, e.voided_at, e.declined_at,
               greatest(e.updated_at, e.created_at) as updated_at,
               (e.created_by = v_uid or iam.has_access('esign_envelope', e.id, 'viewer'::permission_level)) as i_manage,
               mine.id as my_signer_id,
               mine.status as my_signer_status,
               coalesce((esign._can_act(mine.id) ->> 'can_act')::boolean, false) as my_turn,
               (select count(*) from esign.envelope_signer s
                 where s.envelope_id = e.id and s.role <> 'cc_recipient') as signer_count,
               (select count(*) from esign.envelope_signer s
                 where s.envelope_id = e.id and s.status = 'signed') as signed_count,
               (select string_agg(s.full_name, ', ' order by s.position) from esign.envelope_signer s
                 where s.envelope_id = e.id) as signer_names
          from esign.envelope e
          left join lateral (
            select s.id, s.status from esign.envelope_signer s
             where s.envelope_id = e.id and s.signer_user_id = v_uid
             order by s.position limit 1) mine on true
         where e.deleted_at is null
           and e.status <> 'draft'
           and (p_org_id is null or e.organization_id = p_org_id)
           and (p_search is null or e.title ilike '%' || p_search || '%')
           and case coalesce(p_lane, 'all')
                 when 'sent' then e.created_by = v_uid
                                  or iam.has_access('esign_envelope', e.id, 'viewer'::permission_level)
                 when 'to_sign' then mine.id is not null
                 else e.created_by = v_uid or mine.id is not null
                      or iam.has_access('esign_envelope', e.id, 'viewer'::permission_level)
               end
         order by greatest(e.updated_at, e.created_at) desc
         limit least(greatest(coalesce(p_limit, 200), 1), 500)
      ) x), '[]'::jsonb));
end $fn$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   gate_predicate, signed_in_callers, anonymous_callers, argument_rules)
select 'public', 'esign_envelope_list', pg_get_function_identity_arguments(p.oid),
       (select coalesce(array_agg(t order by o), '{}'::oid[]) from unnest(p.proargtypes) with ordinality u(t, o)),
       'Signed-in e-sign envelope list (/esign): only envelopes the caller sent, was granted, or must sign. Every row is decided by auth.uid().',
       'matrx-frontend/migrations/esign_the_sender_sees_their_envelopes.sql',
       'auth.uid()', true, false,
       jsonb_build_object('version', 1, 'arguments', jsonb_build_object(
         'p_lane',   jsonb_build_object('type', 'text', 'position', 1, 'optional', true, 'foreign', jsonb_build_object('not_an_id', true)),
         'p_org_id', jsonb_build_object('type', 'uuid', 'position', 2, 'optional', true, 'foreign', jsonb_build_object('bounded', true,
                       'note', 'Only narrows rows already limited to the caller''s own envelopes; a foreign organization yields nothing.')),
         'p_search', jsonb_build_object('type', 'text', 'position', 3, 'optional', true, 'foreign', jsonb_build_object('not_an_id', true)),
         'p_limit',  jsonb_build_object('type', 'integer', 'position', 4, 'optional', true, 'foreign', jsonb_build_object('not_an_id', true))))
  from pg_proc p
 where p.oid = 'public.esign_envelope_list(text, uuid, text, integer)'::regprocedure
   and not exists (select 1 from platform.client_callable_door c
                    where c.schema_name = 'public' and c.function_name = 'esign_envelope_list');
grant execute on function public.esign_envelope_list(text, uuid, text, integer) to authenticated;

-- The two read doors decide access themselves; open them to signed-in callers.
update platform.client_callable_door c
   set signed_in_callers = true,
       non_client_lane = null,
       gate_predicate = 'esign._may_manage',
       reason = 'Signed-in e-sign read (/esign/[envelopeId]): esign._may_manage(envelope, ''viewer'') decides — the sender, anyone granted access, or a platform admin.',
       argument_rules = case c.function_name
         when 'esign_envelope_state' then jsonb_build_object('version', 1, 'arguments', jsonb_build_object(
           'p_envelope_id', jsonb_build_object('type', 'uuid', 'position', 1, 'optional', false,
             'foreign', jsonb_build_object('bounded', true, 'note', 'esign._may_manage refuses an envelope the caller may not view before any row is returned.'))))
         else jsonb_build_object('version', 1, 'arguments', jsonb_build_object(
           'p_envelope_id', jsonb_build_object('type', 'uuid', 'position', 1, 'optional', false,
             'foreign', jsonb_build_object('bounded', true, 'note', 'esign._may_manage refuses an envelope the caller may not view before any row is read.')),
           'p_observed', jsonb_build_object('type', 'jsonb', 'position', 2, 'optional', false,
             'foreign', jsonb_build_object('not_an_id', true))))
       end
 where c.schema_name = 'public' and c.function_name in ('esign_envelope_state', 'esign_verify_envelope');
grant execute on function public.esign_envelope_state(uuid) to authenticated;
grant execute on function public.esign_verify_envelope(uuid, jsonb) to authenticated;
