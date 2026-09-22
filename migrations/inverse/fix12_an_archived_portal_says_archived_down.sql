-- additive: no
-- THE INVERSE of migrations/campaign/fix12_an_archived_portal_says_archived.sql. It puts back
-- the body of public.portal_share_peek that file replaced, byte for byte, as read from the
-- main database on 2026-09-22 (md5 of prosrc 8344e950d90ca32cc2b9da387edb2abf). After it, an
-- archived portal reads as "closed" to the client again.

set lock_timeout = '4s';

CREATE OR REPLACE FUNCTION public.portal_share_peek(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_inv    iam.invitations;
  v_pp     custom.portal_principal;
  v_p      custom.portal;
  v_me     uuid := custom.query_principal();
  v_mail   text;
  v_org    text;
  v_who    text;
  v_state  text;
  v_masked text;
  v_lane   boolean;
  v_sees   text;
begin
  select * into v_inv from iam.invitations i
   where i.token = p_token and i.target_type = 'portal_principal'
   limit 1;

  if not found then
    -- The ONE sentence. A link that names nothing cannot be used to learn that something is
    -- there — the same words `custom.portal_invite_accept` gives, so the two cannot disagree.
    return jsonb_build_object(
      'state', 'unknown', 'usable', false,
      'say', 'This invitation cannot be used: it has been withdrawn, already used, run out, '
          || 'or was sent to a different email address than the one you are signed in with.',
      'ask', 'Ask whoever sent it to send a fresh one, to the address you sign in with.');
  end if;

  if v_me is not null then
    select lower(u.email) into v_mail from auth.users u where u.id = v_me;
  end if;

  select * into v_pp from custom.portal_principal where id = v_inv.target_id;
  select * into v_p  from custom.portal where id = v_pp.portal_id;
  select coalesce(nullif(btrim(o.name), ''), 'an organization') into v_org
    from iam.organizations o where o.id = v_inv.organization_id;
  select coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
                  nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
                  nullif(btrim(u.email), ''))
    into v_who from auth.users u where u.id = v_inv.created_by;

  v_sees := coalesce(nullif(btrim(v_inv.metadata ->> 'sees'), ''), 'the records that are yours');
  v_masked := left(v_inv.email, 1) || '••••' || substring(v_inv.email from position('@' in v_inv.email));
  v_lane := coalesce((platform.knob_resolve('custom', 'external_principal_enabled', v_inv.organization_id) #>> '{}')::boolean, false);

  -- WHICH ONE IT IS. Named, because "it did not work" with no reason is a dead end. The
  -- portal being CLOSED is its own state: an organization that shut its portal has shut it,
  -- and the link says so rather than quietly writing a grant that admits nobody.
  v_state := case
    -- 🚨 THE PRINCIPAL IS ASKED BEFORE THE INVITATION ROW, and the order is the whole point.
    -- An invitation that was ACCEPTED and then REVOKED leaves `status = 'accepted'` standing
    -- as the history of what happened - so asking the invitation first told a customer whose
    -- access had just been taken away "this link has been used, your portal is already open
    -- to you", which is a screen lying about the state of the world. Caught by clause 8 of
    -- scripts/campaign-tests/portalbind_green.sql before it shipped. Whether she can get in
    -- is a question about the PRINCIPAL; the invitation only says how she was asked.
    when v_inv.status = 'revoked' or v_inv.deleted_at is not null
         or not coalesce(v_pp.is_active, false)                     then 'revoked'
    when v_inv.status = 'accepted'                                  then 'accepted'
    when v_inv.expires_at is not null and v_inv.expires_at <= now() then 'expired'
    when not coalesce(v_p.is_active, false)                         then 'portal_closed'
    when not v_lane                                                 then 'lane_closed'
    when v_me is null                                               then 'sign_in_needed'
    when v_mail is distinct from lower(v_inv.email)
         and v_inv.invited_user_id is distinct from v_me            then 'wrong_account'
    else 'ready' end;

  return jsonb_build_object(
    'state',           v_state,
    'usable',          v_state in ('ready', 'sign_in_needed'),
    'portal',          coalesce(v_p.title, nullif(btrim(v_inv.metadata ->> 'portal'), ''), 'a client portal'),
    'slug',            v_p.slug,
    'organization',    v_org,
    'organization_id', v_inv.organization_id,
    'client',          coalesce(nullif(btrim(v_inv.metadata ->> 'client'), ''), 'your records'),
    'sees',            v_sees,
    'inviter',         coalesce(v_who, 'Somebody at ' || v_org),
    'invited_email',   case when v_mail is not null and v_mail = lower(v_inv.email)
                            then v_inv.email else v_masked end,
    'signed_in_as',    v_mail,
    'expires_at',      v_inv.expires_at,
    'offer', format('%s invited you to %s at %s. You will see %s.',
                    coalesce(v_who, 'Somebody at ' || v_org),
                    coalesce(v_p.title, 'their client portal'), v_org, v_sees),
    'say', case v_state
      when 'ready' then
        format('Open it and you will see %s — the records that are yours, and nothing else of %s. You are not joining %s.', v_sees, v_org, v_org)
      when 'sign_in_needed' then
        format('Sign in as %s — or make an account with that address — and %s opens.', v_masked, v_sees)
      when 'wrong_account' then
        format('This invitation was sent to %s, and you are signed in as %s. Sign in with the address it was sent to, and it opens.', v_masked, coalesce(v_mail, 'somebody else'))
      when 'accepted' then
        'This link has been used — your portal is already open to you.'
      when 'revoked' then
        format('%s took this invitation back, so the link no longer opens anything.', v_org)
      when 'expired' then
        format('This invitation ran out on %s, so the link no longer opens anything.',
               to_char(v_inv.expires_at, 'FMDay DD FMMonth YYYY'))
      when 'portal_closed' then
        format('%s has closed this portal, so the link no longer opens anything.', v_org)
      when 'lane_closed' then
        format('%s has turned off sharing with people outside it, so this invitation cannot be used.', v_org)
      else 'This invitation cannot be used.' end,
    'ask', case v_state
      when 'accepted' then 'Open your portal from the link you were given, or ask for a fresh one.'
      when 'wrong_account' then 'Sign out and sign in with the address it was sent to, or ask for a fresh one.'
      else format('Ask %s for a fresh one.', coalesce(v_who, 'whoever sent it')) end);
end $function$
;
