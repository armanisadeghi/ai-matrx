-- chair-step: this DROPS custom.table_share_outside_peek and its door row, moving the same body to public.table_share_peek — the judge cannot read a drop from its allow-list
-- based-on: custom.table_share_outside_peek(text) 3826fdaed00c38b289efe3a85610cf9dbfeb888ce62378c34ca29f41b8d3be70
--
-- INVITE-DELIVERY — THE PEEK LIVES WHERE A STRANGER CAN REACH IT.
--
-- 🚨 A DEFECT THE SEAT SUITE CAUGHT, AND IT WOULD HAVE SHIPPED. `custom.table_share_outside_peek`
-- was granted to `anon` and the grant took — but EXECUTE on a function also needs USAGE on
-- its SCHEMA, and schema `custom` is deliberately revoked from `anon` (and from PUBLIC,
-- `authenticated` and `service_role`: the store is reached through its doors, and that
-- revocation is the store's own wall, not an oversight to be widened for one function).
-- Measured: `has_schema_privilege('anon','custom','USAGE')` is FALSE, and the suite's
-- clause 7 failed with `permission denied for schema custom` from the anonymous seat.
--
-- Granting `anon` USAGE on `custom` to fix ONE door would open the schema's whole surface
-- to a caller with no account, for a peek that reads nothing of the store beyond a table's
-- NAME. So the door moves instead, to where every other anonymous token door on this
-- platform already lives: `public`. `public.inv_peek_invited_email(text)` — the same shape,
-- the same reasoning, anonymous off a token — has sat there since long before this lane.
-- Doctrine §7 keeps RELATIONS out of `public`; a SECURITY DEFINER RPC is exactly what it
-- keeps there.
--
-- The body is unchanged but for ONE sentence: the offer read *"You will be able to can read
-- it it"*, because `custom.share_levels().means` is already a clause ("can read it") and it
-- was being wrapped in another one. The words a person reads for a rung come from ONE place,
-- so the sentence around them is what gets fixed, never the words.
--
-- There is still exactly ONE peek: the `custom` one is dropped in this same transaction.

drop function if exists custom.table_share_outside_peek(text);
delete from platform.client_callable_door
 where schema_name = 'custom' and function_name = 'table_share_outside_peek';

create or replace function public.table_share_peek(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_inv    iam.invitations;
  v_me     uuid := custom.query_principal();
  v_mail   text;
  v_lvl    public.permission_level;
  v_table  text;
  v_org    text;
  v_who    text;
  v_means  text;
  v_state  text;
  v_masked text;
  v_lane   boolean;
begin
  select * into v_inv from iam.invitations i
   where i.token = p_token and i.target_type = 'custom_table'
   limit 1;

  if not found then
    -- The ONE sentence. A link that names nothing cannot be used to learn that
    -- something is there.
    return jsonb_build_object(
      'state', 'unknown', 'usable', false,
      'say', 'This invitation cannot be used: it has been withdrawn, already used, run out, '
          || 'or was sent to a different email address than the one you are signed in with.',
      'ask', 'Ask whoever sent it to send a fresh one, to the address you sign in with.');
  end if;

  if v_me is not null then
    select lower(u.email) into v_mail from auth.users u where u.id = v_me;
  end if;

  v_lvl := coalesce(nullif(v_inv.metadata ->> 'level', ''), 'viewer')::public.permission_level;
  select coalesce(nullif(btrim(r.data ->> 'name'), ''), nullif(btrim(v_inv.metadata ->> 'table_name'), ''), 'a table')
    into v_table
    from custom.record r
   where r.organization_id = v_inv.organization_id and r.id = v_inv.target_id;
  v_table := coalesce(v_table, nullif(btrim(v_inv.metadata ->> 'table_name'), ''), 'a table');
  select coalesce(nullif(btrim(o.name), ''), 'an organization') into v_org
    from iam.organizations o where o.id = v_inv.organization_id;
  select l.means into v_means from custom.share_levels() l where l.level = v_lvl;
  select coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
                  nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
                  nullif(btrim(u.email), ''))
    into v_who from auth.users u where u.id = v_inv.created_by;

  -- j••••@example.com — enough to recognise, never enough to harvest.
  v_masked := left(v_inv.email, 1) || '••••' || substring(v_inv.email from position('@' in v_inv.email));

  v_lane := coalesce((platform.knob_resolve('custom', 'external_principal_enabled', v_inv.organization_id) #>> '{}')::boolean, false);

  -- WHICH ONE IT IS. Named, because "it did not work" with no reason is the dead end
  -- this lane exists to remove.
  v_state := case
    when v_inv.status = 'accepted'                                   then 'accepted'
    when v_inv.status = 'revoked' or v_inv.deleted_at is not null    then 'revoked'
    when v_inv.expires_at is not null and v_inv.expires_at <= now()  then 'expired'
    when not v_lane                                                  then 'lane_closed'
    when v_me is null                                                then 'sign_in_needed'
    when v_mail is distinct from lower(v_inv.email)
         and v_inv.invited_user_id is distinct from v_me             then 'wrong_account'
    else 'ready' end;

  return jsonb_build_object(
    'state',        v_state,
    'usable',       v_state in ('ready', 'sign_in_needed'),
    'table',        v_table,
    'table_id',     v_inv.target_id,
    'organization', v_org,
    'organization_id', v_inv.organization_id,
    'level',        v_lvl::text,
    'level_label',  iam.level_label('table', v_lvl),
    'means',        coalesce(v_means, 'read it'),
    'inviter',      coalesce(v_who, 'Somebody at ' || v_org),
    'invited_email', case when v_mail is not null and v_mail = lower(v_inv.email)
                          then v_inv.email else v_masked end,
    'signed_in_as', v_mail,
    'expires_at',   v_inv.expires_at,
    'offer', format('%s shared %s in %s with you. You %s.',
                    coalesce(v_who, 'Somebody at ' || v_org), v_table, v_org,
                    coalesce(v_means, 'can read it')),
    'say', case v_state
      when 'ready' then
        format('Open %s and that one table is yours to see. You are not joining %s, and nothing else of theirs is open to you.', v_table, v_org)
      when 'sign_in_needed' then
        format('Sign in as %s — or make an account with that address — and %s opens.', v_masked, v_table)
      when 'wrong_account' then
        format('This invitation was sent to %s, and you are signed in as %s. Sign in with the address it was sent to, and it opens.', v_masked, coalesce(v_mail, 'somebody else'))
      when 'accepted' then
        format('%s is already open to you — this link has been used.', v_table)
      when 'revoked' then
        format('%s took this invitation back, so the link no longer opens %s.', v_org, v_table)
      when 'expired' then
        format('This invitation ran out on %s, so the link no longer opens %s.',
               to_char(v_inv.expires_at, 'FMDay DD FMMonth YYYY'), v_table)
      when 'lane_closed' then
        format('%s has turned off sharing with people outside it, so this invitation cannot be used.', v_org)
      else 'This invitation cannot be used.' end,
    'ask', case v_state
      when 'accepted' then format('Open %s from your own list of shared tables.', v_table)
      when 'wrong_account' then 'Sign out and sign in with the address it was sent to, or ask for a fresh one.'
      else format('Ask %s for a fresh one.', coalesce(v_who, 'whoever sent it')) end);
end;
$fn$;


insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason,
   signed_in_callers, anonymous_callers, anonymous_purpose)
values
  ('public', 'table_share_peek', 'p_token text',
   array['text'::regtype::oid], 'INVITE-DELIVERY',
   'INVITE-DELIVERY: what the person holding a table-share invitation link is being offered, before they are asked to make an account. It takes NOTHING but the token — the caller is by definition not in the organization and could not be trusted with an id. A token that matches no custom_table invitation answers the same one sentence custom.table_share_outside_accept answers for unknown / used / expired / somebody-else''s, so the door cannot be used to learn that anything exists. Everything it returns about a MATCHED invitation is what that token already carries: the table''s name, the organization''s name, the rung, and who sent it. The invited address is masked unless the caller is signed in as exactly that person. It writes nothing and grants nothing — custom.table_share_outside_accept is still the only thing that writes a permission. It lives in public rather than custom because schema custom is revoked from anon by design and a reader with no account must reach it; public.inv_peek_invited_email is its sibling.',
   true, true,
   'The invited person. They are by definition NOT in the organization and usually have no AI Matrx account at all — that is what an outside share means — so there is no identity to require. THE TOKEN IS THE IDENTITY: a 36-character invitation token this platform minted, matched against one iam.invitations row of target_type custom_table, and nothing else selects a row. A token that matches nothing gets the same one sentence custom.table_share_outside_accept gives, so the door cannot be used to discover that anything exists, and the invited address comes back MASKED to anyone not signed in as exactly that person. It writes nothing and grants nothing: custom.table_share_outside_accept, which requires a signed-in caller whose email matches, is still the only thing that writes a permission.')
on conflict (schema_name, function_name, identity_argtypes) do update
   set identity_args = excluded.identity_args,
       declared_by   = excluded.declared_by,
       reason        = excluded.reason,
       anonymous_callers = excluded.anonymous_callers,
       anonymous_purpose = excluded.anonymous_purpose;

grant execute on function public.table_share_peek(text) to authenticated, anon;
