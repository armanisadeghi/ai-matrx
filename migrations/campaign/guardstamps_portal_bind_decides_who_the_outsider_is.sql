-- chair-step: it REPLACES the live body of custom.portal_principal_bind, the door that writes
--   custom.portal_principal.user_id — the column that decides WHICH HUMAN a portal invitation
--   belongs to. Nothing is created, dropped, granted or revoked; no row of anybody's data is
--   touched; and no knob can hold it off, because this body IS the live path, so a `-- guard:`
--   line would be a comment pretending to be a switch. The inverse is
--   migrations/inverse/guardstamps_portal_bind_decides_who_the_outsider_is_down.sql and it
--   restores the previous body character for character.
-- based-on: custom.portal_principal_bind(uuid, uuid, uuid) a02c2130543a7a81e29d0fd9958ce938fd0a99379fc5cb102de71f2aeecd0ddb
--
-- GUARD-STAMPS — THE OUTSIDER ARM COMPARED AN ARGUMENT TO AN ARGUMENT.
--
-- `check:definer-class` names this door as the one client-callable SECURITY DEFINER function
-- that rewrites an identity column and answers to nobody. Reading it, it does ask things — but
-- the arm that matters asked the wrong question:
--
--     if custom.query_principal() = p_user_id then
--       null;  -- the outsider arriving on their own link
--
-- `p_user_id` is supplied by the caller. So the test reduces to "the caller says they are
-- themselves", which is true for every signed-in person on earth, and `p_principal_id` — the
-- invitation being claimed — was never checked against them at all. A signed-in stranger could
-- name somebody else's unopened portal invitation, pass their own id as `p_user_id`, and the
-- door would rewrite that invitation to point at them and then hand them the customer's own
-- client record through `custom.share_grant`.
--
-- Measured from `test@test.com`'s real `authenticated` JWT against the live database
-- (rolled back), the attack got all the way to `share_grant`, which refused it only because
-- that particular seat happened to hold `viewer` rather than `admin` on that particular
-- record. That is the campaign's "stopped by an accident of the data" shape exactly: the
-- identity rewrite itself was decided, and the day the accident changes, it lands.
--
-- WHAT CHANGES. The self-bind arm now proves the outsider is the person the invitation was
-- SENT TO, by the address the platform's own auth holds for them — never by an argument:
--
--   * `p_user_id` must be the caller (`custom.query_principal()`), and the caller must exist;
--   * the invitation's `email` must equal that user's `auth.users.email`;
--   * an invitation already bound to a DIFFERENT person cannot be re-pointed by this arm at
--     all — previously `bound_at` was merely coalesced and `user_id` overwritten, so a live
--     portal login could be taken over by the next caller through the same arm.
--
-- Everything else is unchanged: the store door still comes first, the store owner still
-- passes, and anyone who is neither the invited person nor the owner still goes through
-- `custom.assert_client_may_change(..., 'admin')`, which is the portal's owning-organization
-- admin. Three ways in, each a real question about the caller.
--
-- AND IT STAMPS. `custom.portal_principal` carries no author column, so the actor is recorded
-- where this platform already records who did something to whom in an organization:
-- `iam._org_audit`, which writes `actor_user_id = auth.uid()` itself — the caller cannot name
-- somebody else as the binder any more than they can name themselves as the invitee.

create or replace function custom.portal_principal_bind(
  p_organization_id uuid, p_principal_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
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

  -- THE ONE GRANT, THROUGH THE ONE SHARE DOOR. This is the only access a portal ever
  -- writes: the outsider holds their own client record, and the association the portal
  -- declared carries every record that names it. Nothing here touches a Job or an
  -- Invoice, and nothing has to be re-run when one is written.
  select max(pt.conveys_max) into v_lv from custom.portal_table pt where pt.portal_id = v_p.id;
  perform custom.share_grant(p_organization_id, v_pp.client_record_id, 'person', p_user_id,
                             coalesce(v_lv, 'viewer'::public.permission_level));

  return jsonb_build_object(
    'bound', true,
    'principal_id', v_pp.id,
    'user_id', p_user_id,
    'client_record_id', v_pp.client_record_id,
    'level', coalesce(v_lv, 'viewer'::public.permission_level)::text,
    'say', format('%s now holds their own client record at %s, and every record that names it reaches them through it.',
                  v_pp.email, coalesce(v_lv, 'viewer'::public.permission_level)::text));
end $function$;
