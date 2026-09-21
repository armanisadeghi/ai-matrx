-- chair-step: it REPLACES the live bodies of four client doors — custom.portal_invite,
--   custom.portal_revoke, public.inv_for_me and public.inv_accept — so the judge cannot read
--   from an allow-list what those statements will do. Everything else in this file is
--   additive: four new functions, one notification event row, one route-manifest row, four
--   door-registry rows and four grants. Nothing is dropped and nothing is revoked. The inverse
--   is migrations/inverse/portalbind_a_portal_invitation_is_an_invitation_down.sql.
--
-- PORTAL-BIND — A PORTAL INVITATION IS AN INVITATION, ON THE ONE INVITATION PRIMITIVE.
--
-- THE PROMISE. A plumbing customer invited to Rincon Plumbing's portal follows the link,
-- signs in or makes an account with that address, and sees her own jobs and her own invoices
-- — nothing else of the business.
--
-- Before this file the portal had ONE way in and it was a second flow: the office typed an
-- address, the server minted a Supabase magic link, and `custom.portal_principal_bind` was
-- called by the SERVER, out of band, before the email went. So:
--   * there was no link anybody could copy and text to a customer, which is how this actually
--     happens — lane INVITE-DELIVERY proved that for the table share and it is no less true
--     here;
--   * the arriving person was never shown WHAT was on offer before being asked to sign in;
--   * nothing showed the office a pending invitation it could re-send or withdraw as a unit;
--   * and the honest browser-side self-bind — the arm lane GUARD-STAMPS fixed so that it
--     proves the arriving person by the address the platform's own auth holds — could not
--     complete, because the grant it called judged the CALLER at `admin`.
--
-- The last one is fixed in `portalbind_one_writer_for_the_grant.sql`. This file gives the
-- portal the other half: the SAME acceptance primitive lanes SHARE-OUT and INVITE-DELIVERY
-- built for a table share — an `iam.invitations` row with a `target_type`, a minted token, an
-- anonymous peek and an accept door — with the portal as a SECOND TARGET TYPE on it rather
-- than a second flow. `target_type = 'portal_principal'`, `target_id` = the principal row.
--
-- 🚨 AND IT IS A CLASS NOW, NOT TWO INSTANCES. `public.inv_for_me` and `public.inv_accept`
-- each carried a hand-written `target_type <> 'custom_table'` arm, because accepting a table
-- share there would have inserted an `iam.memberships` row whose container is a Table. A
-- portal invitation has exactly the same hazard and would have needed the same two edits in
-- the same two places, remembered by whoever added the third target type. They now both ask
-- `iam.invitation_has_its_own_door(target_type)`, which is the ONE list, and the refusal names
-- the door that does take it.
--
-- WHAT THE ARRIVING PERSON ENDS AS — unchanged from what PORTAL designed, and that is the
-- point: an external principal scoped to ONE client record. They hold a grant on their own
-- row of the client Table; `custom.carrying_edges_in`'s portal arm carries that to every Job
-- and every Invoice that names them; every other Table, every organization list and every
-- product refuses by name; and `custom.portal_revoke` ends all of it in one statement — which
-- now also withdraws the invitation, so the link dies with the access rather than outliving it.

-- based-on: custom.portal_invite(uuid, uuid, uuid, text, uuid) e89fde6dfa1eece76fe9fad9ec801d458d04df7494017a369cf1dc2f7c5267dd
-- based-on: custom.portal_revoke(uuid, uuid, uuid) dd554acea432cbb581e571d47fe8cc5f0adc9ed39d854a4f8d13505f88844d0d
-- based-on: public.inv_for_me() e84dd009336eafef8986d0e60df3f8fb4cd89e5db72818084d2aba3e6aba4b35
-- based-on: public.inv_accept(text, boolean) 5569f3992fac47f73655e767256af6c35ded4e52df32929fb65c7d326081cff1

set lock_timeout = '4s';

-- ══════════════════════════════════════ 1. THE ONE LIST OF "NOT A MEMBERSHIP"

create or replace function iam.invitation_has_its_own_door(p_target_type text)
returns text
language sql
immutable
set search_path to ''
as $function$
  -- An invitation whose target is NOT a container of people. `public.inv_accept` turns an
  -- invitation into an `iam.memberships` row whose `container_type` is the target type, so
  -- every one of these would put somebody in a "container" that is a Table or a portal
  -- principal. Each has its own door, and this is the ONE place the list lives: before
  -- 2026-09-21 it was two hand-written `<> 'custom_table'` arms in two functions, which is a
  -- list that the third entry gets left out of.
  select case p_target_type
           when 'custom_table'     then 'custom.table_share_outside_accept'
           when 'portal_principal' then 'custom.portal_invite_accept'
           else null
         end;
$function$;

comment on function iam.invitation_has_its_own_door(text) is
  'PORTAL-BIND: the one list of invitation target types that are NOT memberships, each with the door that does accept it. public.inv_for_me hides them and public.inv_accept refuses them by name.';

-- ══════════════════════════════════════ 2. WHAT THE NOTICE SAYS

insert into communication.notification_event_type
  (event_key, label, description, default_channels, config, enabled, organization_id, visibility)
values
  ('share.portal_invited',
   'You were invited to a client portal',
   'A business invited one of its clients to the portal where that client sees their own records. This is the message that carries the link they open it with.',
   jsonb_build_object('in_app', true, 'email', true),
   jsonb_build_object(
     'mandatory', false,
     'templates', jsonb_build_object(
       'in_app', jsonb_build_object(
         'body', '{{invite.inviter}} invited you to {{invite.portal}} at {{invite.organization}}. You will see {{invite.sees}}.'),
       'email', jsonb_build_object(
         'subject', '{{invite.organization}} invited you to {{invite.portal}}',
         'body', '{{invite.inviter}} invited you to {{invite.portal}} at {{invite.organization}}.' || chr(10) || chr(10) ||
                 'You will see {{invite.sees}} — the records that are yours, and nothing else of theirs.' || chr(10) || chr(10) ||
                 'Open it here:' || chr(10) || '{{link.deep}}' || chr(10) || chr(10) ||
                 'This link was sent to {{invite.email}} and only works when you are signed in with that address. You do not need an account yet — the link will offer to make you one.' || chr(10) ||
                 'It stops working on {{invite.expires}}, and {{invite.organization}} can take it back at any time.' || chr(10) || chr(10) ||
                 'Opening it does not put you in {{invite.organization}}. You are their customer, not one of their people.' || chr(10) || chr(10) ||
                 '--' || chr(10) ||
                 'AI Matrx sent this because somebody at {{invite.organization}} invited you to their client portal. Manage notifications: {{link.preferences}}')),
     'alert_tier', 'informational',
     'digestible', false,
     'sms_locked', true,
     'target_kind', 'portal_invitation',
     'max_attempts', 5,
     'routing_mode', 'declared_audience',
     'push_declared', false,
     'non_user_capable', false,
     'deep_link_template', '/invitations/portal/accept/{{invite.token}}',
     'quiet_hours_exempt', false,
     'retry_base_seconds', 60,
     'sensitivity_ceiling', 'internal'),
   true,
   (select organization_id from communication.notification_event_type
     where event_key = 'share.table_invited' and deleted_at is null limit 1),
   'internal'::platform.visibility)
on conflict do nothing;

-- ══════════════════════════════════════ 3. THE WORDS, AND THE ONE SEND PATH

create or replace function custom._portal_invite_payload(p_invitation_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_inv    iam.invitations;
  v_org    text;
  v_portal text;
  v_sees   text;
  v_who    text;
begin
  select * into v_inv from iam.invitations where id = p_invitation_id;
  if not found then
    raise exception 'There is no such invitation.' using errcode = '02000';
  end if;

  select coalesce(nullif(btrim(o.name), ''), 'their organization') into v_org
    from iam.organizations o where o.id = v_inv.organization_id;

  v_portal := coalesce(nullif(btrim(v_inv.metadata ->> 'portal'), ''), 'their client portal');
  -- WHAT SHE WILL ACTUALLY SEE, in the Tables' own names — "your jobs and your invoices",
  -- never "your records". The portal declared them; nothing here guesses.
  v_sees   := coalesce(nullif(btrim(v_inv.metadata ->> 'sees'), ''), 'the records that are yours');

  select coalesce(
           nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
           nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
           nullif(btrim(u.email), ''),
           'Somebody at ' || v_org)
    into v_who
    from auth.users u where u.id = v_inv.created_by;

  return jsonb_build_object('invite', jsonb_build_object(
    'invitation_id', v_inv.id,
    'token',        v_inv.token,
    'email',        v_inv.email,
    'portal',       v_portal,
    'client',       coalesce(nullif(btrim(v_inv.metadata ->> 'client'), ''), 'your records'),
    'sees',         v_sees,
    'organization', coalesce(v_org, 'their organization'),
    'inviter',      coalesce(v_who, 'Somebody at ' || coalesce(v_org, 'an organization')),
    'expires',      to_char(coalesce(v_inv.expires_at, now() + interval '14 days'),
                            'FMDay DD FMMonth YYYY')));
end $function$;

create or replace function custom._portal_invite_deliver(p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_inv     iam.invitations;
  v_answer  jsonb;
  v_email   jsonb;
  v_path    text;
begin
  select * into v_inv from iam.invitations where id = p_invitation_id;
  v_path := '/invitations/portal/accept/' || v_inv.token;

  -- THE ONE SPINE. `communication.notify_from_sql` is the SQL producer lane INVITE-DELIVERY
  -- generalised out of `hr._wf_notify`: this transaction writes the FACTS at
  -- `render_pending`, the ONE render pass writes the WORDS. There is no second mailer here
  -- and there must never be one — the frontend's `lib/email/client.ts` is the thing the
  -- notification program exists to retire, not a second thing to call.
  v_answer := communication.notify_from_sql(
    v_inv.organization_id,
    'share.portal_invited',
    v_inv.invited_user_id,   -- null when they have no account yet, which is the usual case
    v_inv.email,
    v_inv.email,
    custom._portal_invite_payload(p_invitation_id),
    v_path,
    'portal_invitation',
    v_inv.id,
    'portalinvite:' || v_inv.token);

  v_email := communication.channel_readiness_say('email');

  -- 🚨 THE SENTENCE THE OFFICE READS. Three states, and the link is offered in ALL THREE — a
  -- plumber texting a customer a link is the ordinary case, not the fallback.
  return jsonb_build_object(
    'accept_path',  v_path,
    'queued',       v_answer -> 'queued',
    'skipped',      v_answer -> 'skipped',
    'email_answer', v_email ->> 'answer',
    'say', case
      when (v_email ->> 'answer') = 'no' then
        'Email is not set up on this server, so nothing was sent — copy the link and send it to them yourself.'
      when (v_email ->> 'answer') = 'unknown' then
        'We cannot tell whether email works on this server, so do not count on it arriving — copy the link and send it to them yourself.'
      when v_answer -> 'queued' ? 'email' then
        'An email with the link is on its way to them. You can also copy the link and send it yourself.'
      else
        'No email went out. Copy the link and send it to them yourself.'
    end);
end $function$;

-- ══════════════════════════════════════ 4. THE FOUR REPLACED BODIES

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

CREATE OR REPLACE FUNCTION custom.portal_revoke(p_organization_id uuid, p_portal_id uuid, p_principal_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_pp custom.portal_principal;
  v_p  custom.portal;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.portal_revoke');
  perform custom.assert_store_door(p_organization_id, 'custom.portal_revoke');

  select * into v_pp from custom.portal_principal
   where id = p_principal_id and portal_id = p_portal_id and organization_id = p_organization_id;
  if not found then
    raise exception 'There is no such person in this portal.' using errcode = '02000';
  end if;
  select * into v_p from custom.portal where id = p_portal_id;
  perform custom.assert_client_may_change(p_organization_id, v_p.client_table_id,
            'custom.portal_revoke', 'admin'::public.permission_level, 'table');

  update custom.portal_principal
     set is_active = false, revoked_at = now()
   where id = v_pp.id;

  -- REVOKING TAKES THE GRANT AWAY, not just the row. A row that said "revoked" beside a
  -- grant that still read is the exact shape W2-TRUST's clause 8 was written about: a
  -- screen showing access as gone while the read path still answers.
  if v_pp.user_id is not null then
    perform custom.share_revoke(p_organization_id, v_pp.client_record_id, 'person', v_pp.user_id);
  end if;

  -- AND THE LINK DIES WITH THE ACCESS (PORTAL-BIND, 2026-09-21). The invitation is a bearer
  -- credential: a withdrawn principal beside a pending invitation row would mean the next
  -- person holding that link binds themselves straight back in. `custom.portal_invite_accept`
  -- reads only `status = 'pending'` with `deleted_at is null`, so this ONE statement is what
  -- makes the revoke total — and `public.portal_share_peek` then says WHICH way it is dead
  -- and who to ask, instead of a dead end.
  update iam.invitations
     set status = 'revoked', deleted_at = now(), updated_by = custom.query_principal(),
         updated_at = now()
   where target_type = 'portal_principal'
     and target_id = v_pp.id
     and status <> 'accepted'
     and deleted_at is null;

  return jsonb_build_object(
    'revoked', true,
    'principal_id', v_pp.id,
    'email', v_pp.email,
    'say', format('%s can no longer sign in to "%s", and the records that named their client no longer reach them.',
                  v_pp.email, v_p.title));
end $function$

;

CREATE OR REPLACE FUNCTION public.inv_for_me()
 RETURNS TABLE(id uuid, organization_id uuid, target_type text, target_id uuid, email text, role text, status text, token text, expires_at timestamp with time zone, created_at timestamp with time zone, created_by uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select i.id, i.organization_id, i.target_type, i.target_id, i.email, i.role, i.status,
         i.token, i.expires_at, i.created_at, i.created_by
    from iam.invitations i
   where i.deleted_at is null and i.status = 'pending'
     and (i.expires_at is null or i.expires_at > now())
     -- 🚨 AN INVITATION TO SOMETHING THAT IS NOT A CONTAINER OF PEOPLE IS NOT A MEMBERSHIP.
     -- `inv_accept` turns whatever this returns into an `iam.memberships` row whose
     -- `container_type` is the invitation's `target_type`, so a table share offered here
     -- would have turned "see this one table" into a membership of a container that is not
     -- one - and a portal invitation would have done the same with a client portal.
     -- PORTAL-BIND, 2026-09-21: this was a hand-written `<> 'custom_table'` here and another
     -- in `inv_accept`, which is a list the third entry gets left out of. Both now ask the
     -- ONE list, which also names the door that does take each kind.
     and iam.invitation_has_its_own_door(i.target_type) is null
     and (i.invited_user_id = (select auth.uid())
          or lower(i.email) = lower((select u.email from auth.users u where u.id = (select auth.uid()))))
   order by i.created_at desc;
$function$

;

CREATE OR REPLACE FUNCTION public.inv_accept(p_token text, p_hr_half_handled boolean DEFAULT false)
 RETURNS TABLE(target_type text, target_id uuid, organization_id uuid, role text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'iam', 'auth'
AS $function$
declare v_inv iam.invitations; v_uid uuid := (select auth.uid()); v_email text; v_door text;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select u.email into v_email from auth.users u where u.id = v_uid;
  select * into v_inv from iam.invitations i
   where i.token = p_token and i.deleted_at is null and i.status = 'pending'
     and (i.expires_at is null or i.expires_at > now())
     and (i.invited_user_id = v_uid or lower(i.email) = lower(v_email));
  if v_inv.id is null then raise exception 'invalid or expired invitation'; end if;

  -- 🚨 SOME INVITATIONS ARE NOT A PLACE IN THE ORGANIZATION, AND THEY HAVE THEIR OWN DOORS.
  -- Accepting one here would insert a membership whose container is a Table or a portal
  -- principal, neither of which is a container of people — turning "see this one table" or
  -- "see your own jobs" into a row in the organization's own membership table. PORTAL-BIND,
  -- 2026-09-21: the list of them lives in ONE place now, and the refusal names the door.
  v_door := iam.invitation_has_its_own_door(v_inv.target_type);
  if v_door is not null then
    raise exception 'this invitation is not a place in the organization; accept it through %, which writes exactly what it offers and nothing else', v_door
      using errcode = '22023';
  end if;

  -- 🚨 SEE THE HEADER. An HR-tied invitation accepted here would strand the person.
  if (v_inv.metadata ? 'hr_employee_id') and not coalesce(p_hr_half_handled, false) then
    raise exception 'this invitation links an employee record; accept it through hr_invite_accept, which also binds the login'
      using errcode = '22023';
  end if;

  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status, created_by, updated_by)
  values (v_inv.organization_id, v_inv.target_type, v_inv.target_id, v_uid, coalesce(v_inv.role, 'member'), 'active', v_uid, v_uid)
  on conflict (container_type, container_id, user_id)
  do update set status = 'active', deleted_at = null, updated_by = v_uid;

  update iam.invitations
     set status = 'accepted', accepted_at = now(), invited_user_id = v_uid, updated_by = v_uid
   where id = v_inv.id;

  return query select v_inv.target_type, v_inv.target_id, v_inv.organization_id, v_inv.role;
end $function$

;

-- ══════════════════════════════════════ 5. WHAT THE LINK OFFERS, TO SOMEBODY WITH NO ACCOUNT

-- 🚨 IT LIVES IN `public`, AND THAT IS NOT A STYLE CHOICE. Lane INVITE-DELIVERY's seat suite
-- caught the same thing on the table share's peek: an `anon` grant on a function in schema
-- `custom` takes, but EXECUTE also needs USAGE on the SCHEMA, and `custom` is revoked from
-- `anon` by design. Opening the whole record store's schema to a caller with no account to
-- fix one door is the wrong trade. This sits beside `public.table_share_peek` and
-- `public.inv_peek_invited_email`, which have answered anonymously off a token far longer.
create or replace function public.portal_share_peek(p_token text)
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog'
as $function$
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
    when v_inv.status = 'accepted'                                  then 'accepted'
    when v_inv.status = 'revoked' or v_inv.deleted_at is not null
         or not coalesce(v_pp.is_active, false)                     then 'revoked'
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
end $function$;

-- ══════════════════════════════════════ 6. THE ONE DOOR THAT DECIDES ONCE

create or replace function custom.portal_invite_accept(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_inv  iam.invitations;
  v_pp   custom.portal_principal;
  v_p    custom.portal;
  v_me   uuid := custom.query_principal();
  v_mail text;
  v_org  text;
  v_bind jsonb;
  v_sees text;
begin
  -- 🚨 THIS IS THE WHOLE POINT OF THE LANE: ONE DOOR, ONE DECISION, ONE TRANSACTION.
  -- The invitation token proves the AUTHORITY — an admin of this portal's organization made
  -- it, through `custom.portal_invite`, which asserted `admin` on the client Table before it
  -- minted anything. From there the bind and the grant are performed AS THAT AUTHORITY. The
  -- arriving person is never asked to hold a level they cannot hold, which is exactly what
  -- made this flow impossible to finish before 2026-09-21.
  if v_me is null then
    raise exception 'Sign in first, and then this invitation opens the portal it was sent for.'
      using errcode = '42501';
  end if;
  select lower(u.email) into v_mail from auth.users u where u.id = v_me;

  select * into v_inv from iam.invitations i
   where i.token = p_token
     and i.target_type = 'portal_principal'
     and i.deleted_at is null
     and i.status = 'pending'
     and (i.expires_at is null or i.expires_at > now())
     and (i.invited_user_id = v_me or lower(i.email) = v_mail);
  if not found then
    -- ONE SENTENCE for a token that never existed, one that has been used, one that has run
    -- out, one that was withdrawn and one addressed to somebody else. A link must not be
    -- usable to learn that something is there.
    raise exception 'This invitation cannot be used: it has been withdrawn, already used, run out, or was sent to a different email address than the one you are signed in with.'
      using errcode = '02000',
            hint = 'Ask whoever sent it to send a fresh one, to the address you sign in with.';
  end if;

  select * into v_pp from custom.portal_principal where id = v_inv.target_id;
  if not found or not v_pp.is_active then
    raise exception 'This invitation cannot be used: it has been withdrawn, already used, run out, or was sent to a different email address than the one you are signed in with.'
      using errcode = '02000',
            hint = 'Ask whoever sent it to send a fresh one, to the address you sign in with.';
  end if;
  select * into v_p from custom.portal where id = v_pp.portal_id;
  select coalesce(nullif(btrim(o.name), ''), 'that organization') into v_org
    from iam.organizations o where o.id = v_inv.organization_id;
  v_sees := coalesce(nullif(btrim(v_inv.metadata ->> 'sees'), ''), 'the records that are yours');

  if not coalesce(v_p.is_active, false) then
    raise exception '% has closed this portal, so this invitation cannot be used.', v_org
      using errcode = '42501',
            hint = 'Ask whoever invited you — an owner or an administrator of that organization can re-open it.';
  end if;

  -- THE LANE STILL HAS TO BE OPEN AT THIS MOMENT. An organization that closed its outside
  -- door after sending an invitation has closed it, and the link says so instead of quietly
  -- writing a grant that admits nobody. (`custom.portal_admits` reads the same knob, so a
  -- grant written here while it is off would carry the person exactly nowhere.)
  if not coalesce((platform.knob_resolve('custom', 'external_principal_enabled', v_inv.organization_id) #>> '{}')::boolean, false) then
    raise exception '% has turned off sharing with people outside it, so this invitation cannot be used.', v_org
      using errcode = '42501',
            hint = 'Ask whoever invited you — an owner or an administrator of that organization can turn it back on.';
  end if;

  -- THE BIND AND THE GRANT, through the ONE bind door, in this transaction. Its self-bind arm
  -- settles "themself" by the address the platform's own auth holds for the caller — never by
  -- an argument (lane GUARD-STAMPS) — and this caller satisfies it by construction, because
  -- the token was matched against that same address two statements ago. It then writes the
  -- single grant on the client's own record through `custom._share_write_person`, which is
  -- where the three authorities on this platform meet one writer.
  v_bind := custom.portal_principal_bind(v_inv.organization_id, v_pp.id, v_me);

  update iam.invitations
     set status = 'accepted', accepted_at = now(), invited_user_id = v_me,
         updated_by = v_me, updated_at = now()
   where id = v_inv.id;

  return jsonb_build_object(
    'accepted', true,
    'organization_id', v_inv.organization_id,
    'organization', v_org,
    'portal_id', v_p.id,
    'portal', v_p.title,
    'slug', v_p.slug,
    'principal_id', v_pp.id,
    'client_record_id', v_pp.client_record_id,
    'client', coalesce(nullif(btrim(v_inv.metadata ->> 'client'), ''), 'your records'),
    'sees', v_sees,
    'level', v_bind ->> 'level',
    'say', format('%s is open to you. You will see %s — the records that are yours, and nothing else of %s.',
                  coalesce(v_p.title, 'Your portal'), v_sees, v_org));
end $function$;

-- ══════════════════════════════════════ 7. WHO MAY CALL WHAT

grant execute on function public.portal_share_peek(text) to anon, authenticated;
grant execute on function custom.portal_invite_accept(text) to authenticated;
grant execute on function iam.invitation_has_its_own_door(text) to authenticated;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, declared_by, reason,
   signed_in_callers, anonymous_callers, anonymous_purpose, non_client_lane, identity_argtypes)
values
  ('public', 'portal_share_peek', 'p_token text', 'PORTAL-BIND',
   'PORTAL-BIND: what a portal invitation link offers, answered off the TOKEN alone. p_token is matched against iam.invitations of target_type portal_principal; an unknown token returns ONE sentence naming no portal, no organization and no inviter, so a link cannot be used to discover that anything exists. For a real token it returns the portal title, the organization, what the person will see and who invited them - the secret is the token, which the reader already holds - and the invited address is masked unless the caller is signed in as that person. It writes nothing and grants nothing.',
   true, true,
   'The person on the other end of a portal invitation usually has NO ACCOUNT - that is what an outside invitation is for. Before this door the page redirected a stranger to sign-up before telling them what for, by somebody it had not named. It reads only the invitation the token names.',
   null, array['25']::oid[]),
  ('custom', 'portal_invite_accept', 'p_token text', 'PORTAL-BIND',
   'PORTAL-BIND: the invited client''s own door, and the ONE place a portal invitation is turned into access. It takes no organization and no id - the caller could not be trusted with either, because they are not in the organization and never will be. p_token is matched against a pending, unexpired, not-withdrawn iam.invitations row of target_type portal_principal addressed to THIS signed-in person by user id or by the email they signed in with; every other case answers ONE sentence. It then calls custom.portal_principal_bind, whose own ladder re-proves the caller against the address the platform''s auth holds, and writes exactly one grant - on the client record the invitation named, at the level the portal declared, never a level the caller supplied.',
   true, false, null, null, array['25']::oid[]),
  ('custom', '_portal_invite_payload', 'p_invitation_id uuid', 'PORTAL-BIND',
   'PORTAL-BIND: the fields the ONE renderer needs for a share.portal_invited notice, read from the invitation itself. p_invitation_id is used unchecked to read that invitation and the organization and portal it names; it judges nobody and writes nothing.',
   false, false, null,
   'server_only: called only by custom._portal_invite_deliver, in the same transaction, after custom.portal_invite has already run assert_client_may_change at ADMIN on the portal''s client Table. A client grant would let any signed-in person read the token of any invitation whose id they could guess.',
   array['2950']::oid[]),
  ('custom', '_portal_invite_deliver', 'p_invitation_id uuid', 'PORTAL-BIND',
   'PORTAL-BIND: the ONE send path for a portal invitation, so the invite and a later re-invite can never disagree about what goes out. p_invitation_id is used unchecked to build and enqueue a notice addressed to that invitation''s own email - it judges nobody.',
   false, false, null,
   'server_only: called only by custom.portal_invite, in the same transaction, after it has run assert_client_may_reach, assert_store_door and assert_client_may_change at ADMIN on the portal''s client Table. A client grant would let any signed-in person make this platform email any address any invitation names, as often as they liked.',
   array['2950']::oid[])
on conflict (schema_name, function_name, identity_argtypes) do update
  set reason = excluded.reason, identity_args = excluded.identity_args,
      declared_by = excluded.declared_by, signed_in_callers = excluded.signed_in_callers,
      anonymous_callers = excluded.anonymous_callers,
      anonymous_purpose = excluded.anonymous_purpose,
      non_client_lane = excluded.non_client_lane;

-- ══════════════════════════════════════ 8. THE ROUTE THE LINK POINTS AT
--
-- 🚨 WITHOUT THIS ROW EVERY INVITATION EMAIL WOULD CARRY A LINK TO SOMEWHERE ELSE. The render
-- pass asks `services/routes/liveness.py` what a reader following a link will actually get and
-- REWRITES a link whose route it cannot find to the nearest live ancestor — silently, with a
-- warning in a log nobody reads. Lane INVITE-DELIVERY found that the hard way. The next
-- deploy's `route-manifest:sync` writes the same value.
insert into platform.route_manifest (app, pattern, status, source, source_sha, organization_id)
select 'matrx-frontend', '/invitations/portal/accept/[token]', 'live',
       'app/(core)/invitations/portal/accept/[token]/page.tsx',
       coalesce((select r.source_sha from platform.route_manifest r
                  where r.app = 'matrx-frontend' and r.pattern = '/invitations/table/accept/[token]'),
                'portalbind'),
       (select r.organization_id from platform.route_manifest r
         where r.app = 'matrx-frontend' and r.pattern = '/invitations/table/accept/[token]')
on conflict (app, pattern) do update set status = 'live', source = excluded.source;
