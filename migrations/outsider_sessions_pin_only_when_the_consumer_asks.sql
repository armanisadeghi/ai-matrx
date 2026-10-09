-- based-on: platform.assert_outsider_scope(text, text, uuid, text, inet) 447a5d66cc05820ce68f65c6673953989dc78b34467676332cd9c3d49e3cfba2
--
-- An outside session is pinned to one network address only when its consumer says so
-- (platform.outsider_consumer.ip_pinned). See the comment in the body.

CREATE OR REPLACE FUNCTION platform.assert_outsider_scope(p_session text, p_resource text, p_id uuid, p_action text, p_ip inet DEFAULT NULL::inet)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'platform', 'public'
AS $function$
declare
  s platform.actor_session%rowtype;
  t platform.actor_token%rowtype;
  g jsonb; ok boolean := false; v_reason text; v_saw_parent boolean := false; v_pinned boolean;
  c_uniform constant text := 'This link is no longer valid — ask the sender for a new one.';
begin
  select * into s from platform.actor_session
   where session_hash = encode(extensions.digest(coalesce(p_session,''),'sha256'),'hex');

  if not found then
    return jsonb_build_object('granted', false, 'reason', 'link_no_longer_valid',
                              'message', c_uniform);
  end if;

  select * into t from platform.actor_token where id = s.actor_token_id;
  -- 🚨 THE ADDRESS PIN IS THE CONSUMER'S CHOICE (2026-10-07). This check used to pin EVERY session
  -- to the first address it saw and refuse any other, whatever `outsider_consumer.ip_pinned` said —
  -- so a dual-stack phone or laptop hopping between its IPv4 and IPv6 address was told its link was
  -- dead mid-signing (7 refusals in 30 days, the owner's own signature among them). A consumer that
  -- does not pin never compares and never writes the address; the address is still recorded on
  -- every event as evidence.
  select coalesce(bool_or(c.ip_pinned), false) into v_pinned
    from platform.outsider_consumer c
   where c.consumer_key = t.consumer_key and c.is_active and c.deleted_at is null;

  v_reason := case
    when s.revoked_at is not null                        then 'session_revoked'
    when s.expires_at <= now()                           then 'session_expired'
    when t.verification_factor <> 'none'
         and s.verified_at is null                       then 'session_not_verified'
    when v_pinned and s.ip is not null and p_ip is null              then 'session_ip_unprovable'
    when v_pinned and s.ip is not null and p_ip is distinct from s.ip then 'session_ip_moved'
    when t.id is null                                    then 'token_missing'
    when not t.is_active or t.revoked_at is not null     then 'token_revoked'
    when t.expires_at <= now()                           then 'token_expired'
    else null
  end;

  if v_reason is null then
    for g in select * from jsonb_array_elements(t.scope -> 'grants') loop
      if (g ->> 'resource') = p_resource
         and p_action in (select jsonb_array_elements_text(coalesce(g -> 'actions','[]'::jsonb)))
      then
        if (g ->> 'id') is not null then
          -- an ID-scoped grant names exactly one row
          if (g ->> 'id')::uuid = p_id then ok := true; exit; end if;

        elsif (g ->> 'parent_id') is not null then
          v_saw_parent := true;
          -- 🚨 §5.3 law 1: parent scope is a CONTAINER, never a wildcard over ids.
          -- RECORDED DECISION 3: `create` (and a null child id) has nothing to bind yet — the
          -- parent IS the container. Every other action binds the child to that parent.
          if p_action = 'create' or p_id is null then
            ok := true; exit;
          elsif platform._outsider_parent_matches(p_resource, p_id, (g ->> 'parent_id')::uuid) then
            ok := true; exit;
          end if;
        end if;
      end if;
    end loop;

    if not ok then
      v_reason := case when v_saw_parent then 'parent_scope_mismatch' else 'scope_not_covered' end;
    end if;
  end if;

  if v_reason is not null then
    insert into platform.actor_token_event
      (organization_id, actor_token_id, session_id, event_type, ip, detail)
    values (t.organization_id, t.id, s.id,
            case when v_reason in ('scope_not_covered','parent_scope_mismatch')
                 then 'scope_rejected' else 'replay_rejected' end,
            p_ip,
            jsonb_build_object('true_reason', v_reason, 'resource', p_resource,
                               'action', p_action, 'target_id', p_id));
    -- THE REFUSAL-ENVELOPE LAW: returned, never raised, or the ledger row above is rolled back
    -- with the exception and §5.7's rate limiting loses its own evidence.
    return jsonb_build_object('granted', false, 'reason', 'link_no_longer_valid',
                              'message', c_uniform);
  end if;

  if v_pinned then
    update platform.actor_session set ip = coalesce(s.ip, p_ip) where id = s.id and s.ip is null;
  end if;

  return jsonb_build_object('granted', true, 'actor_token_id', t.id, 'session_id', s.id,
                            'organization_id', t.organization_id, 'consumer_key', t.consumer_key,
                            'subject_type', t.subject_type, 'subject_id', t.subject_id,
                            'verification_factor', t.verification_factor,
                            'verified_at', s.verified_at, 'ip_pinned', v_pinned and s.ip is not null);
end
$function$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('platform', 'assert_outsider_scope', 'p_session text, p_resource text, p_id uuid, p_action text, p_ip inet',
        array['text'::regtype, 'text'::regtype, 'uuid'::regtype, 'text'::regtype, 'inet'::regtype]::oid[],
        'p_session is resolved by its SHA-256 to one actor session; p_id is checked against that session token''s scope grants (id or parent container); NULL p_id only for create on a parent grant.',
        'outsider_sessions_pin_only_when_the_consumer_asks.sql',
        'internal: called only from the outsider door functions (esign, hr, meet, secure delivery) and the service role; no client role holds EXECUTE.',
        false, false)
on conflict do nothing;

-- Sessions already pinned under the old rule for consumers that do not pin: release them.
update platform.actor_session a set ip = null
  from platform.actor_token t
 where t.id = a.actor_token_id and a.ip is not null and a.expires_at > now()
   and not exists (select 1 from platform.outsider_consumer c
                    where c.consumer_key = t.consumer_key and c.ip_pinned and c.is_active and c.deleted_at is null);
