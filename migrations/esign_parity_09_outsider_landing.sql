-- e-sign parity v2, CONTRACT.md §6.4 (ours #19, S2.4): what the outside signer's link page shows
-- before any session — sender, organization, document names, the request message and their own
-- note. Only for a LIVE token (loosening L1); a dead link keeps the uniform sentence. Service role
-- only: aidream's POST /esign/signing/outsider/open adds it as `landing`.
create or replace function esign.outsider_landing(p_secret text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare t platform.actor_token%rowtype; s esign.envelope_signer%rowtype; e esign.envelope%rowtype;
        o record; v_sender jsonb;
begin
  select * into t from platform.actor_token
   where token_hash = encode(extensions.digest(coalesce(p_secret, ''), 'sha256'), 'hex');
  if not found or not t.is_active or t.revoked_at is not null or t.expires_at <= now()
     or (t.max_uses is not null and t.use_count >= t.max_uses) or t.consumer_key <> 'esign.signer' then
    return null;
  end if;
  select * into s from esign.envelope_signer where id = t.subject_id;
  select * into e from esign.envelope where id = s.envelope_id;
  if not found then return null; end if;
  select name, logo_url into o from iam.organizations where id = e.organization_id;
  v_sender := esign.envelope_sender(e.id);
  return jsonb_build_object(
    'sender', jsonb_build_object('name', coalesce(v_sender ->> 'name', o.name)),
    'organization', jsonb_build_object('name', o.name, 'logo_url', o.logo_url),
    'envelope', jsonb_build_object('title', e.title, 'message', e.message, 'expires_at', e.expires_at,
                                   'status', e.status),
    'documents', coalesce((select jsonb_agg(jsonb_build_object('name', d.name, 'page_count', d.page_count)
                                            order by d.position)
                             from esign.envelope_document d where d.envelope_id = e.id), '[]'::jsonb),
    'recipient', jsonb_build_object('first_name', split_part(btrim(s.full_name), ' ', 1)),
    'private_message', s.private_message,
    'verification_factor', t.verification_factor);
end $$;

insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), platform.door_argtypes(p.proargtypes),
       'Takes only the link secret; answers nothing for a dead or foreign token.', 'esign_parity_09_outsider_landing',
       'server_only: aidream outsider/open adds the landing for the link page; the secret never reaches a client RPC.', false, false
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'esign' and p.proname = 'outsider_landing'
on conflict do nothing;
