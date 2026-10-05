-- A SIGNER CAN START AN ACCOUNT WITH THEIR ADDRESS ALREADY FILLED IN (2026-10-05, owner's ask).
-- An outsider who just signed is invited to create a free account. Their address must never ride
-- in the link (a query string is stable PII in history and edge logs), so this follows the
-- invitation pattern exactly (DD-091, public.inv_peek_invited_email): the link carries an opaque
-- one-time HINT, and sign-up resolves it to the address through one narrow anonymous-safe door.
--
-- The hint is random, stored only as its SHA-256 on the signer row's metadata (never a frozen or
-- evidence column), lives 7 days, and resolves only for an outside signer who has signed. It opens
-- nothing but the prefill: the field stays editable, and the email is still verified at sign-up.

-- Server-only: aidream mints it for the signer the outsider session just proved it holds.
create or replace function esign.mint_signup_hint(p_signer_id uuid)
 returns text
 language plpgsql
 set search_path to ''
as $function$
declare v_hint text;
begin
  if not exists (select 1 from esign.envelope_signer s
                  where s.id = p_signer_id and s.actor_type = 'external' and s.status = 'signed') then
    return null;
  end if;
  v_hint := translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_');
  update esign.envelope_signer
     set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('signup_hint', jsonb_build_object(
           'sha256', encode(extensions.digest(v_hint, 'sha256'), 'hex'),
           'expires_at', now() + interval '7 days'))
   where id = p_signer_id;
  return v_hint;
end $function$;

-- The one anonymous door: a hint in, the signer's address out — or null, indistinguishable from a
-- hint that never existed.
create or replace function public.esign_peek_signer_email(p_hint text)
 returns text
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select s.email
    from esign.envelope_signer s
   where s.actor_type = 'external'
     and s.status = 'signed'
     and s.metadata -> 'signup_hint' ->> 'sha256'
         = encode(extensions.digest(coalesce(p_hint, ''), 'sha256'), 'hex')
     and (s.metadata -> 'signup_hint' ->> 'expires_at')::timestamptz > now()
   limit 1
$function$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   signed_in_callers, anonymous_callers, anonymous_purpose)
values ('public', 'esign_peek_signer_email', 'p_hint text', array['text'::regtype]::oid[],
        'p_hint is matched by its SHA-256 against a hint minted for one signed outside signer; it returns only that signer''s address, only for 7 days, else null.',
        'esign_a_signer_can_start_an_account_with_their_address.sql',
        true, true,
        'A person who just signed from an emailed link has no account yet; the sign-up page resolves the one-time hint in their link to prefill their address. The hint stands in for an identity and opens nothing else.')
on conflict do nothing;

grant execute on function public.esign_peek_signer_email(text) to anon, authenticated;
