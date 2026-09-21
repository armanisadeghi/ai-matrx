-- chair-step: it REPLACES the live bodies of three client doors — custom.share_grant,
--   custom.table_share_outside_accept and custom.portal_principal_bind — so the judge cannot
--   read from an allow-list what the statements will do. Nothing is dropped, nothing is
--   revoked, and no row of anybody's data is touched: one new internal function is created and
--   three existing bodies are re-pointed at it. The inverse is
--   migrations/inverse/portalbind_one_writer_for_the_grant_down.sql and it restores all three
--   bodies character for character and drops the new function.
--
-- PORTAL-BIND — THE GRANT HAD THREE WRITERS AND ONE OF THEM COULD NEVER RUN.
--
-- THE DEFECT, IN ONE SENTENCE. A plumbing customer invited to Rincon Plumbing's portal
-- follows her link, signs in, and the door that binds her to her own client record dies one
-- call later, because that door writes her grant through `custom.share_grant`, and
-- `share_grant` judges the CALLER at `admin` on the record being shared — a level an arriving
-- outsider has never held and never will. Named by lane GUARD-STAMPS as the product
-- limitation its own fix uncovered: "the honest arm is reachable and correct, and then dies
-- one call later".
--
-- IT IS NOT A PORTAL BUG. It is the same question asked three times and answered three ways:
--
--   * `custom.share_grant`                — asserts the caller at admin, then writes the row.
--   * `custom.table_share_outside_accept` — could not use share_grant for exactly this reason,
--     so it HAND-WROTE the same insert/update, with its own comment explaining why.
--   * `custom.portal_principal_bind`      — called share_grant, and therefore could not finish.
--
-- Two implementations of one write and one caller that cannot reach either. The instance fix
-- would be a fourth copy inside the portal door. The class fix is that THERE IS ONE WRITER.
--
-- WHAT THIS FILE DOES.
--   `custom._share_write_person(org, subject, user, level, by)` is the one place an
--   `iam.permissions` row for a PERSON on a record is written. It validates the SUBJECT (it
--   exists in this organization; it is not that person's own record, which is the rung above
--   every level) and the LEVEL, and it deliberately decides NOTHING about the caller — it is
--   an internal lane, holds no grant to `authenticated`, and its registry row says in full
--   that every caller must have decided authority before it is reached. A function that
--   decided authority AND wrote would be back to one shape for three different authorities.
--
--   The three callers each keep their own authority decision, which is the part that differs:
--     share_grant                — the caller holds admin on the subject (unchanged).
--     table_share_outside_accept — the token proves an admin made the invitation (unchanged,
--                                  and its hand-written copy of the write is gone).
--     portal_principal_bind      — the ladder above it in the same body already settled that
--                                  the caller is the invited person at their own address, the
--                                  store owner, or an admin of the client Table. It performs
--                                  the grant AS THAT AUTHORITY, in the same transaction as the
--                                  bind, and never asks the arriving person to hold a level
--                                  they cannot hold.
--
-- WHAT DOES NOT CHANGE, and it is the whole of the safety here: every identity check on every
-- one of the three doors is exactly the bytes it had before this file. The organization arm
-- of `share_grant` (VIS-23/VIS-34 cross-organization sharing) is untouched and still writes
-- its own row — it grants to an ORGANIZATION, not a person, and folding two shapes into one
-- writer to save six lines is how a `granted_to_user_id` ends up holding an organization id.
--
-- based-on: custom.share_grant(uuid, uuid, text, uuid, permission_level) ab3625de767e144b8685d93c316392387b2a20f1705a8a24a5f8415d95f06c29
-- based-on: custom.table_share_outside_accept(text) 78b4282c63c6519b221ad5a2cf2fb9cb40aeb45476df6ab448932ab16ee2abc9
-- based-on: custom.portal_principal_bind(uuid, uuid, uuid) 056157493d89f200ad7663a165589bf56b057e11b7a2ff8417e61167e8ef5281

set lock_timeout = '4s';

-- ─────────────────────────────────────────────── 1. THE ONE WRITER

create or replace function custom._share_write_person(
  p_organization_id uuid,
  p_subject_id      uuid,
  p_user_id         uuid,
  p_level           public.permission_level,
  p_by              uuid default null)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_row  custom.record;
  v_word text;
  v_perm uuid;
begin
  -- 🚨 THIS FUNCTION DECIDES NOTHING ABOUT THE CALLER, ON PURPOSE, AND HOLDS NO GRANT TO
  -- `authenticated`. Its three callers each hold a DIFFERENT authority — a caller at admin on
  -- the record, an invitation token an admin minted, and a portal bind ladder — and the one
  -- thing they share is the row they end up writing. Folding the authority in here would mean
  -- one shape for three authorities, which is how the portal door came to demand a level the
  -- arriving person could never hold. Its registry row in `platform.client_callable_door`
  -- carries this same sentence as a `non_client_lane`.
  if p_user_id is null then
    raise exception 'A share has to say WHO it is shared with.' using errcode = '22004';
  end if;
  if p_level is null then
    raise exception 'A share has to say what the other person may do with it.'
      using errcode = '22004',
            hint = 'Pass one of viewer, commenter, editor, admin — call custom.share_levels() for what each one means.';
  end if;

  select r.* into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_subject_id;
  if not found then
    raise exception 'There is no such record in this organization, so it cannot be shared.'
      using errcode = '02000';
  end if;
  v_word := case when v_row.table_id = custom.table_kernel_id() then 'table' else 'record' end;

  if p_user_id = v_row.created_by then
    raise exception 'That person already owns this %, which is the rung above every level you could grant.', v_word
      using errcode = '23505', hint = 'VIS-25: Owner is the top rung and is held on the record itself.';
  end if;

  select p.id into v_perm from iam.permissions p
   where p.resource_type = 'record' and p.resource_id = p_subject_id
     and p.granted_to_user_id = p_user_id;

  if v_perm is null then
    insert into iam.permissions (resource_type, resource_id, granted_to_user_id,
                                 permission_level, created_by, status)
    values ('record', p_subject_id, p_user_id, p_level,
            coalesce(p_by, custom.query_principal()), 'active')
    returning id into v_perm;
  else
    update iam.permissions
       set permission_level = p_level, status = 'active', expires_at = null
     where id = v_perm;
  end if;

  -- The history row is already written: `zzz_history_grant_capture` fired inside the same
  -- statement. Nothing here files a second one.
  return v_perm;
end $function$;

comment on function custom._share_write_person(uuid, uuid, uuid, public.permission_level, uuid) is
  'PORTAL-BIND: the ONE place an iam.permissions row for a person on a record is written. Internal lane - it judges the SUBJECT and the LEVEL and never the caller, because its three callers hold three different authorities (admin on the record, an invitation token, a portal bind ladder).';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, declared_by, reason,
   signed_in_callers, anonymous_callers, non_client_lane, identity_argtypes)
values
  ('custom', '_share_write_person',
   'p_organization_id uuid, p_subject_id uuid, p_user_id uuid, p_level permission_level, p_by uuid',
   'PORTAL-BIND',
   'PORTAL-BIND: the one writer of an iam.permissions row for a person on a record. p_organization_id and p_subject_id are checked together against custom.record - a subject that is not in that organization raises 02000 rather than being written - and p_user_id is refused when it is the subject''s own created_by, which is the rung above every grantable level. p_level must be one of the four enum rungs. It judges the CALLER not at all, by design.',
   false, false,
   'server_only: called only by custom.share_grant (which has already run assert_client_may_change at ADMIN on the subject), custom.table_share_outside_accept (whose token proves an admin minted the invitation) and custom.portal_principal_bind (whose ladder has already settled that the caller is the invited person at their own address, the store owner, or an admin of the portal''s client Table). A client grant would be a fourth way to write a permission row with no authority decision in front of it.',
   array['2950','2950','2950','1699632','2950']::oid[])
on conflict (schema_name, function_name, identity_argtypes) do update
  set reason = excluded.reason, non_client_lane = excluded.non_client_lane,
      identity_args = excluded.identity_args, declared_by = excluded.declared_by;

-- ─────────────────────────────── 2. THE THREE CALLERS, each keeping its own authority

CREATE OR REPLACE FUNCTION custom.share_grant(p_organization_id uuid, p_subject_id uuid, p_principal_kind text, p_principal_id uuid, p_level permission_level DEFAULT 'viewer'::permission_level)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_kind   text := lower(btrim(coalesce(p_principal_kind, '')));
  v_row    custom.record;
  v_word   text;
  v_perm   uuid;
  v_before public.permission_level;
begin
  perform custom.assert_store_door(p_organization_id, 'share_grant');
  -- THE ONE LADDER at the rung whose whole definition is "can change it and decide who else
  -- may". Not `created_by`: VIS-17 has one ladder and `admin` is on it.
  perform custom.assert_client_may_change(p_organization_id, p_subject_id, 'share_grant',
                                          'admin'::public.permission_level, 'record');

  select r.* into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_subject_id;
  if not found then
    raise exception 'There is no such record in this organization, so it cannot be shared.'
      using errcode = '02000';
  end if;
  v_word := case when v_row.table_id = custom.table_kernel_id() then 'table' else 'record' end;

  if p_level is null then
    raise exception 'A share has to say what the other person may do with it.'
      using errcode = '22004',
            hint = 'Pass one of viewer, commenter, editor, admin — call custom.share_levels() for what each one means.';
  end if;
  if v_kind not in ('person', 'user', 'organization') then
    raise exception 'A share names a person or an organization, and "%" is neither.', coalesce(p_principal_kind, '<nothing>')
      using errcode = '22023',
            hint = 'VIS-23: cross-organization sharing is a grant whose principal is the other organization — the same one grant table, never a separate system. Use kind `person` or `organization`.';
  end if;
  if p_principal_id is null then
    raise exception 'A share has to say WHO it is shared with.' using errcode = '22004';
  end if;

  if v_kind in ('person', 'user') then
    -- VIS-31: a person outside the organization is an EXTERNAL principal, and that lane is off
    -- UNLESS this organization has opened it by declaring a portal and naming this person in
    -- it (PORTAL, 2026-09-20). A portal principal is the one non-member this door will write a
    -- grant for, and it writes exactly the grant the portal's own binding asks for — on the
    -- client's own record, which is the thing every Job and Invoice of theirs hangs off.
    -- Everybody else still gets the refusal below, by name, rather than a grant that confers
    -- nothing.
    if not exists (select 1 from iam.organization_member m
                    where m.organization_id = p_organization_id and m.user_id = p_principal_id)
       and not (coalesce((platform.knob_resolve('custom', 'external_principal_enabled', p_organization_id) #>> '{}')::boolean, false)
                and custom.portal_admits(p_organization_id, p_principal_id)) then
      raise exception 'That person is not in this organization, so they cannot be given access to this % yet.', v_word
        using errcode = '42501',
              hint = 'VIS-31 / custom/external_principal_enabled resolves false for this organization: sharing with somebody who has no membership here is the external-principal lane, and it is not open. Invite them to the organization, share with their organization instead (VIS-23), or - if they are a client rather than a colleague - put them in a portal, which is the act that opens this lane for one organization and names who may come through it.';
    end if;

    -- WHAT WAS HELD BEFORE, read before the write, because the sentence at the bottom says
    -- "Changed from X to Y" and the write is about to make that unreadable.
    select p.permission_level into v_before
      from iam.permissions p
     where p.resource_type = 'record' and p.resource_id = p_subject_id
       and p.granted_to_user_id = p_principal_id;

    -- PORTAL-BIND: THE ONE WRITER. The authority for this call was decided four lines into
    -- this body (`assert_client_may_change` at admin on the subject) and the ownership rung
    -- and the level shape are judged inside the writer, where the other two callers get the
    -- same answers. This door hand-wrote the row until 2026-09-21 and so did
    -- `custom.table_share_outside_accept`, which is two implementations of one write.
    v_perm := custom._share_write_person(p_organization_id, p_subject_id, p_principal_id,
                                         p_level, custom.query_principal());
  else
    if p_principal_id <> p_organization_id
       and not custom.cross_organization_links_open(p_organization_id, p_principal_id) then
      raise exception 'That organization has not agreed to links with this one, so this % cannot be shared with it.', v_word
        using errcode = '42501',
              hint = 'VIS-34: reaching across the organization wall takes BOTH organizations — each one turns on "Links to other organizations" in its own settings (custom/cross_organization_links). One organization''s flag is not consent from the other.';
    end if;

    select p.id, p.permission_level into v_perm, v_before
      from iam.permissions p
     where p.resource_type = 'record' and p.resource_id = p_subject_id
       and p.granted_to_organization_id = p_principal_id;

    if v_perm is null then
      insert into iam.permissions (resource_type, resource_id, granted_to_organization_id,
                                   permission_level, created_by, status)
      values ('record', p_subject_id, p_principal_id, p_level, custom.query_principal(), 'active')
      returning id into v_perm;
    else
      update iam.permissions
         set permission_level = p_level, status = 'active', expires_at = null
       where id = v_perm;
    end if;
  end if;

  -- The history row is already written: `zzz_history_grant_capture` fired inside this same
  -- statement. Nothing here files a second one.
  return jsonb_build_object(
    'shared', true,
    'subject', v_word,
    'permission_id', v_perm,
    'principal_kind', case when v_kind = 'user' then 'person' else v_kind end,
    'principal_id', p_principal_id,
    'level', p_level::text,
    'level_label', iam.level_label(v_word, p_level),
    'was', v_before::text,
    'message', case when v_before is null
                    then format('Shared at %s.', lower(iam.level_label(v_word, p_level)))
                    else format('Changed from %s to %s.', lower(iam.level_label(v_word, v_before)),
                                lower(iam.level_label(v_word, p_level))) end);
end;
$function$

;

CREATE OR REPLACE FUNCTION custom.table_share_outside_accept(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_inv   iam.invitations;
  v_me    uuid := custom.query_principal();
  v_mail  text;
  v_level public.permission_level;
  v_perm  uuid;
  v_name  text;
  v_org   text;
begin
  if v_me is null then
    raise exception 'Sign in first, and then this invitation opens the table it was sent for.'
      using errcode = '42501';
  end if;
  select lower(u.email) into v_mail from auth.users u where u.id = v_me;

  select * into v_inv from iam.invitations i
   where i.token = p_token
     and i.target_type = 'custom_table'
     and i.deleted_at is null
     and i.status = 'pending'
     and (i.expires_at is null or i.expires_at > now())
     and (i.invited_user_id = v_me or lower(i.email) = v_mail);
  if not found then
    -- ONE SENTENCE for a token that never existed, one that has been used, one that has
    -- run out and one addressed to somebody else. A link must not be usable to learn
    -- that something is there.
    raise exception 'This invitation cannot be used: it has been withdrawn, already used, run out, or was sent to a different email address than the one you are signed in with.'
      using errcode = '02000',
            hint = 'Ask whoever sent it to send a fresh one, to the address you sign in with.';
  end if;

  v_level := coalesce(nullif(v_inv.metadata ->> 'level', ''), 'viewer')::public.permission_level;
  select coalesce(nullif(r.data ->> 'name', ''), 'that table') into v_name
    from custom.record r where r.organization_id = v_inv.organization_id and r.id = v_inv.target_id;
  select o.name into v_org from iam.organizations o where o.id = v_inv.organization_id;

  -- THE LANE STILL HAS TO BE OPEN AT THIS MOMENT. An organization that closed its
  -- outside door after sending an invitation has closed it, and the link says so
  -- instead of quietly writing a grant that admits nobody.
  if not coalesce((platform.knob_resolve('custom', 'external_principal_enabled', v_inv.organization_id) #>> '{}')::boolean, false) then
    raise exception '% has turned off sharing with people outside it, so this invitation cannot be used.',
      coalesce(v_org, 'That organization')
      using errcode = '42501',
            hint = 'Ask whoever invited you — an owner or an administrator of that organization can turn it back on.';
  end if;

  -- THE GRANT. The same row, in the same table, at the same rung, that
  -- `custom.share_grant` writes for a colleague — because there is ONE ladder and this
  -- is not a second one. It is not written THROUGH `share_grant` for one reason:
  -- `share_grant` judges the CALLER at Admin on the subject, and the caller here is the
  -- person being let in. The act was already judged when the invitation was made.
  --
  -- PORTAL-BIND, 2026-09-21: it used to hand-write the insert/update here, which made it a
  -- SECOND implementation of the row `share_grant` writes — and the portal's own bind door,
  -- which has the same problem, had neither and so could not complete at all. All three now
  -- go through `custom._share_write_person`: one writer, three authorities, each decided by
  -- the door that holds it. `v_inv.created_by` is carried as the author of the grant because
  -- the person who made the invitation is who gave this access, not the person accepting it.
  v_perm := custom._share_write_person(v_inv.organization_id, v_inv.target_id, v_me,
                                       v_level, v_inv.created_by);

  update iam.invitations
     set status = 'accepted', accepted_at = now(), invited_user_id = v_me,
         updated_by = v_me, updated_at = now()
   where id = v_inv.id;

  return jsonb_build_object(
    'accepted', true,
    'organization_id', v_inv.organization_id,
    'organization', v_org,
    'table_id', v_inv.target_id,
    'table', v_name,
    'level', v_level::text,
    'level_label', iam.level_label('table', v_level),
    'permission_id', v_perm,
    'say', format('%s shared %s with you as a %s. That table is all you can see here — nothing else of %s is open to you.',
                  coalesce(v_org, 'An organization'), v_name, v_level::text,
                  coalesce(v_org, 'theirs')));
end;
$function$

;

CREATE OR REPLACE FUNCTION custom.portal_principal_bind(p_organization_id uuid, p_principal_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_pp    custom.portal_principal;
  v_p     custom.portal;
  v_lv    public.permission_level;
  v_email text;
  v_who   uuid := custom.query_principal();
begin
  perform custom.assert_store_door(p_organization_id, 'custom.portal_principal_bind');
  if p_user_id is null then
    raise exception 'Binding a portal principal needs the identity the platform''s auth gave them.'
      using errcode = '22004';
  end if;

  select * into v_pp from custom.portal_principal
   where id = p_principal_id and organization_id = p_organization_id;
  if not found then
    raise exception 'There is no such portal principal in this organization.' using errcode = '02000';
  end if;
  select * into v_p from custom.portal where id = v_pp.portal_id;

  -- AN INVITATION THAT IS ALREADY SOMEBODY'S STAYS THEIRS. Re-pointing a live portal login
  -- at a different person is a takeover, not a bind, and it belongs to no arm below.
  if v_pp.user_id is not null and v_pp.user_id <> p_user_id then
    raise exception 'That invitation already belongs to somebody else, so it cannot be bound again.'
      using errcode = '42501',
            hint = 'Withdraw it and invite the new person, so the customer who holds it now keeps their own record.';
  end if;

  -- WHO MAY BIND. The organization admin who invited them, the server lane that owns the
  -- store, or the invited person THEMSELF — and "themself" is settled by the address the
  -- invitation was sent to, read from the platform's own auth, never from an argument.
  if not custom.query_is_store_owner() then
    select u.email into v_email from auth.users u where u.id = p_user_id;
    if v_who is not null
       and v_who = p_user_id
       and v_email is not null
       and lower(btrim(v_email)) = lower(btrim(coalesce(v_pp.email, '')))
    then
      null;  -- the outsider arriving on their own link, at their own address
    else
      perform custom.assert_client_may_change(p_organization_id, v_p.client_table_id,
                'custom.portal_principal_bind', 'admin'::public.permission_level, 'table');
    end if;
  end if;

  if not v_pp.is_active or not v_p.is_active then
    raise exception 'That invitation has been withdrawn, so it cannot be used to sign in.'
      using errcode = '42501';
  end if;

  update custom.portal_principal
     set user_id = p_user_id, bound_at = coalesce(bound_at, now())
   where id = v_pp.id;

  -- WHO DID IT. `iam._org_audit` stamps `actor_user_id` from `auth.uid()` inside itself, so
  -- the row names the seat that actually called this door.
  perform iam._org_audit(p_organization_id, p_user_id, 'portal_principal_bind',
            jsonb_build_object('principal_id', v_pp.id, 'portal_id', v_p.id, 'email', v_pp.email));

  -- THE ONE GRANT, WRITTEN AS THE AUTHORITY THIS DOOR ALREADY ESTABLISHED. This is the only
  -- access a portal ever writes: the outsider holds their own client record, and the
  -- association the portal declared carries every record that names it. Nothing here touches
  -- a Job or an Invoice, and nothing has to be re-run when one is written.
  --
  -- 🚨 PORTAL-BIND, 2026-09-21 — WHY THIS IS NO LONGER `custom.share_grant`. It was, and that
  -- is why the legitimate outsider could never finish: `share_grant` judges the CALLER at
  -- `admin` on the record being shared, and the customer arriving on her own link holds
  -- nothing on her client record — that is the whole point of her arriving. So the honest
  -- self-bind arm above was reachable, correct, and then died one call later, every time.
  -- (Lane GUARD-STAMPS measured it and named it as a product limitation for whoever owns this
  -- flow.) The authority for this grant was settled THIRTY LINES ABOVE, in this same
  -- transaction: the caller is the store owner, or an admin of the portal's client Table, or
  -- the invited person proved by the address the platform's own auth holds for them. Asking
  -- the arriving person for a level they can never hold was never a check — it was a bug that
  -- happened to look like one.
  --
  -- `invited_by` is carried as the author of the grant: the organization admin who invited
  -- this customer is who gave her this access, not the customer who followed the link.
  select max(pt.conveys_max) into v_lv from custom.portal_table pt where pt.portal_id = v_p.id;
  perform custom._share_write_person(p_organization_id, v_pp.client_record_id, p_user_id,
                                     coalesce(v_lv, 'viewer'::public.permission_level),
                                     coalesce(v_pp.invited_by, v_p.created_by));

  return jsonb_build_object(
    'bound', true,
    'principal_id', v_pp.id,
    'user_id', p_user_id,
    'client_record_id', v_pp.client_record_id,
    'level', coalesce(v_lv, 'viewer'::public.permission_level)::text,
    'say', format('%s now holds their own client record at %s, and every record that names it reaches them through it.',
                  v_pp.email, coalesce(v_lv, 'viewer'::public.permission_level)::text));
end $function$

;
