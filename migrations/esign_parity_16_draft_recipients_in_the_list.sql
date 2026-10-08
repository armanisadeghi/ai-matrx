-- e-sign parity server part 3: the envelope list shows a draft's recipients (signers, signer_names, signer_count
-- came out empty because a draft has no signer rows). Same keys and shapes; a draft's recipients read 'pending'.
-- based-on: public.esign_envelope_list(text, uuid, text, integer) 5ca71473715d42bd72960c8b844d0d39e3d6ae315374446b15f8905aac54949e
-- A draft's recipients as the saved composition holds them (the list door's view of a draft row).
CREATE OR REPLACE FUNCTION esign.envelope_draft_recipients(p_envelope_id uuid)
 RETURNS TABLE(full_name text, role text, ord int)
 LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path TO 'esign', 'public'
AS $function$
  select coalesce(nullif(btrim(r.value ->> 'full_name'), ''), nullif(btrim(r.value ->> 'email'), ''), 'Recipient'),
         coalesce(r.value ->> 'role', 'signer'),
         coalesce((r.value ->> 'order')::int, 1) * 1000 + (r.ordinality)::int
    from esign.envelope_draft d,
         jsonb_array_elements(coalesce(d.composition -> 'recipients', '[]'::jsonb)) with ordinality as r(value, ordinality)
   where d.envelope_id = p_envelope_id;
$function$;

insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), platform.door_argtypes(p.proargtypes),
       'Internal list step; the envelope id comes from a row the list door already authorised for the caller.', 'esign_parity_16_draft_recipients_in_the_list',
       'server_only: called only from inside public.esign_envelope_list for envelopes it already decided the caller may see; no client calls it directly', false, false
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where (n.nspname, p.proname) = ('esign', 'envelope_draft_recipients') and p.prosecdef
on conflict do nothing;

CREATE OR REPLACE FUNCTION public.esign_envelope_list(p_lane text DEFAULT 'all'::text, p_org_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 200)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'esign', 'public'
AS $function$
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
               case when e.status = 'draft'
                    then (select count(*) from esign.envelope_draft_recipients(e.id) r where r.role <> 'cc_recipient')
                    else (select count(*) from esign.envelope_signer s
                           where s.envelope_id = e.id and s.role <> 'cc_recipient') end as signer_count,
               (select count(*) from esign.envelope_signer s
                 where s.envelope_id = e.id and s.status = 'signed') as signed_count,
               case when e.status = 'draft'
                    then (select string_agg(r.full_name, ', ' order by r.ord) from esign.envelope_draft_recipients(e.id) r)
                    else (select string_agg(s.full_name, ', ' order by s.position) from esign.envelope_signer s
                           where s.envelope_id = e.id) end as signer_names,
               e.email_subject,
               -- A draft has no signer rows yet: its recipients come from the saved draft, all 'pending'.
               case when e.status = 'draft'
                    then coalesce((select jsonb_agg(jsonb_build_object('name', r.full_name, 'status', 'pending', 'role', r.role) order by r.ord)
                                     from esign.envelope_draft_recipients(e.id) r), '[]'::jsonb)
                    else coalesce((select jsonb_agg(jsonb_build_object('name', s.full_name, 'status', s.status, 'role', s.role) order by s.position)
                                     from esign.envelope_signer s where s.envelope_id = e.id), '[]'::jsonb) end as signers
          from esign.envelope e
          left join lateral (
            select s.id, s.status from esign.envelope_signer s
             where s.envelope_id = e.id and s.signer_user_id = v_uid
             order by s.position limit 1) mine on true
         where e.deleted_at is null
           -- e-sign parity §5.4: drafts are listed to whoever may manage them (never to a signer).
           and (e.status <> 'draft' or e.created_by = v_uid
                or iam.has_access('esign_envelope', e.id, 'viewer'::permission_level))
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
end $function$;
