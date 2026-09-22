-- additive: no
-- chair-step: it REPLACES the live body of custom.portal_invite in place, with its exact
--   signature. Nothing is created, dropped, granted or revoked, and no row of anybody's data
--   is touched. The inverse is
--   migrations/inverse/fix12_inviting_into_an_archived_portal_says_archived_down.sql.
--
-- FIX-12 — THE SIBLING OF THE SAME WORD, FOUND BY CENSUS.
--
-- `public.portal_share_peek` called an archived portal "closed" to the client
-- (migrations/campaign/fix12_an_archived_portal_says_archived.sql). The census that fix asked
-- for — every function whose body says "closed this portal" or "portal is closed" — found this
-- one, on the office side: inviting somebody into an archived portal answered
--
--     That portal is closed, so nobody new can be invited into it.
--     hint: Re-open it with custom.portal_declare before inviting anyone.
--
-- Both sentences are wrong about the same thing, and the hint sends the office manager to a
-- door that will not undo what she did: an archived portal comes back with
-- `custom.portal_restore`, which keeps every table it shows and everyone invited to it.
-- `custom.portal_invite_accept` has always got this right; these were the two that had not.
--
-- based-on: custom.portal_invite(uuid, uuid, uuid, text, uuid) b5897bbd5283d9699e0af44155339a979c8ff2c4a6edfca9706aa2cc8e24902e

set lock_timeout = '4s';

CREATE OR REPLACE FUNCTION custom.portal_invite(p_organization_id uuid, p_portal_id uuid, p_client_record_id uuid, p_email text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_p    custom.portal;
  v_pp   custom.portal_principal;
  v_id   uuid;
  v_mail text := lower(btrim(coalesce(p_email, '')));
  v_inv  uuid;
  v_sent jsonb;
  v_sees text;
  v_tok  text;
  v_exp  timestamptz;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.portal_invite');
  perform custom.assert_store_door(p_organization_id, 'custom.portal_invite');

  select * into v_p from custom.portal where id = p_portal_id and organization_id = p_organization_id;
  if not found then
    raise exception 'There is no such portal in this organization.' using errcode = '02000';
  end if;
  -- FIX-12: ARCHIVED IS ASKED BEFORE CLOSED, and it is asked here for the same reason it is
  -- asked in `public.portal_share_peek`: `custom.portal_archive` sets `is_active = false` as
  -- well as `archived_at`, so a door that only knows `is_active` calls every archive a closure
  -- and sends the person to the wrong remedy. An archived portal comes back with
  -- `custom.portal_restore`; re-declaring it is not what anybody wants to hear.
  if v_p.archived_at is not null then
    raise exception 'That portal is archived, so nobody new can be invited into it.'
      using errcode = '42501', hint = 'Bring it back with custom.portal_restore, then invite them.';
  end if;
  if not v_p.is_active then
    raise exception 'That portal is closed, so nobody new can be invited into it.'
      using errcode = '42501', hint = 'Re-open it with custom.portal_declare before inviting anyone.';
  end if;
  if position('@' in v_mail) < 2 then
    raise exception 'An invitation needs an email address to send the sign-in link to.'
      using errcode = '22004';
  end if;

  -- The same rung the portal was declared at. Letting one more outsider in is the same
  -- kind of act as letting the first one in.
  perform custom.assert_client_may_change(p_organization_id, v_p.client_table_id,
            'custom.portal_invite', 'admin'::public.permission_level, 'table');

  -- THE CLIENT RECORD IS THE WHOLE OF "ONLY THEIRS", so it has to be one, and it has to
  -- be in the portal's own client Table. A principal pointed at the wrong Table would
  -- carry whatever THAT record carries, which is the leak this check exists to stop.
  if not exists (select 1 from custom.record r
                  where r.organization_id = p_organization_id
                    and r.id = p_client_record_id
                    and r.table_id = v_p.client_table_id
                    and r.deleted_at is null) then
    raise exception 'That record is not one of this portal''s clients, so nobody can be invited as it.'
      using errcode = '02000',
            hint = 'A portal principal IS a record of the portal''s client Table. Pick the client''s own row.';
  end if;

  select * into v_pp from custom.portal_principal
   where portal_id = v_p.id and lower(email) = v_mail and is_active;
  if found then
    v_id := v_pp.id;
    update custom.portal_principal
       set client_record_id = p_client_record_id,
           user_id = coalesce(p_user_id, user_id)
     where id = v_id;
  else
    insert into custom.portal_principal (portal_id, organization_id, client_record_id, email,
                                         user_id, invited_by)
    values (v_p.id, p_organization_id, p_client_record_id, v_mail, p_user_id, custom.query_principal())
    returning id into v_id;
  end if;

  if p_user_id is not null then
    perform custom.portal_principal_bind(p_organization_id, v_id, p_user_id);
  end if;

  -- ── PORTAL-BIND, 2026-09-21 — THE INVITATION IS AN INVITATION. ──────────────────────
  -- Until today this door wrote a `custom.portal_principal` row and stopped, and the only
  -- way in was a magic link the SERVER minted out of band. So the office had no link it
  -- could copy and text to a customer, nothing to re-send or withdraw as a unit, and the
  -- customer was asked to sign in before being told what for.
  --
  -- This is the SAME primitive lanes SHARE-OUT and INVITE-DELIVERY built for a table share
  -- — `iam.invitations` + a minted token + an accept door — with the portal as a second
  -- TARGET TYPE on it, not a second flow. Minted in the SAME transaction as the principal
  -- row: a rolled-back invite can never have told anybody about access they were not given.
  --
  -- WHAT SHE WILL SEE, in the Tables' own names, worked out once here rather than by the
  -- template: "your jobs and your invoices" is what the portal actually exposes.
  select string_agg(lower(coalesce(nullif(btrim(t.data ->> 'name'), ''), 'records')), ' and '
                    order by pt.ord)
    into v_sees
    from custom.portal_table pt
    left join custom.record t on t.organization_id = pt.organization_id and t.id = pt.table_id
   where pt.portal_id = v_p.id;
  v_sees := coalesce('your ' || v_sees, 'the records that are yours');

  update iam.invitations
     set role        = 'viewer',
         metadata    = coalesce(metadata, '{}'::jsonb)
                       || jsonb_build_object('subject', 'portal_principal',
                                             'portal_id', v_p.id,
                                             'portal', v_p.title,
                                             'slug', v_p.slug,
                                             'client_record_id', p_client_record_id,
                                             'client', coalesce(custom.portal_record_title(p_organization_id, p_client_record_id), 'your records'),
                                             'sees', v_sees),
         expires_at  = now() + interval '14 days',
         token       = gen_random_uuid()::text,
         status      = 'pending',
         accepted_at = null,
         deleted_at  = null,
         updated_by  = custom.query_principal(),
         updated_at  = now()
   where target_type = 'portal_principal'
     and target_id = v_id
     and organization_id = p_organization_id
     and status <> 'accepted'
  returning id, token, expires_at into v_inv, v_tok, v_exp;

  if v_inv is null then
    insert into iam.invitations
      (organization_id, target_type, target_id, email, invited_user_id, role, status,
       expires_at, metadata, created_by, updated_by)
    values
      (p_organization_id, 'portal_principal', v_id, v_mail, p_user_id, 'viewer', 'pending',
       now() + interval '14 days',
       jsonb_build_object('subject', 'portal_principal',
                          'portal_id', v_p.id,
                          'portal', v_p.title,
                          'slug', v_p.slug,
                          'client_record_id', p_client_record_id,
                          'client', coalesce(custom.portal_record_title(p_organization_id, p_client_record_id), 'your records'),
                          'sees', v_sees),
       custom.query_principal(), custom.query_principal())
    returning id, token, expires_at into v_inv, v_tok, v_exp;
  end if;

  v_sent := custom._portal_invite_deliver(v_inv);

  select * into v_pp from custom.portal_principal where id = v_id;
  return jsonb_build_object(
    'invited', true,
    'principal_id', v_id,
    'portal_id', v_p.id,
    'slug', v_p.slug,
    'email', v_mail,
    'client_record_id', p_client_record_id,
    'client', coalesce(custom.portal_record_title(p_organization_id, p_client_record_id), p_client_record_id::text),
    'bound', v_pp.user_id is not null,
    'invitation_id', v_inv,
    'token', v_tok,
    'accept_path', v_sent ->> 'accept_path',
    'expires_at', v_exp,
    'delivery', v_sent,
    'delivery_say', v_sent ->> 'say',
    'sees', v_sees,
    'say', case when v_pp.user_id is not null
                then format('%s can sign in to "%s" and will see their own records and nothing else.', v_mail, v_p.title)
                else format('%s is invited to "%s". They get access the moment they follow their link and the platform gives them an identity - until then this row holds nothing.', v_mail, v_p.title) end);
end $function$
;
