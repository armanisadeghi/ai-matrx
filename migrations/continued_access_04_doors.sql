-- continued_access_04 — THE FIVE DOORS.
--
-- RECORD of a live change applied via the Supabase MCP on 2026-08-29.
--
-- Two internal helpers (not client-callable) and three client doors. Every one is
-- `CREATE OR REPLACE`, so this whole file is idempotent by construction.
--
-- 🚨 THE HELPERS ARE SECURITY DEFINER FOR A REASON. A departed person has no org lane at all --
-- they cannot read their own departure row, and they cannot read their former employer's knob
-- overrides -- so a SECURITY INVOKER resolver would answer "portal off" for everybody and the
-- feature would silently never work.

create or replace function platform.continued_access_state(p_org uuid, p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, platform, iam, pg_temp
as $fn$
-- THE ONE ANSWER to "where does this person stand with this organization?".
-- Returns a state, never a boolean, because the ways continued access can be absent are
-- different sentences a product has to say out loud:
--   active_member      -- still here. Continued access does not apply; use the normal surfaces.
--   departed           -- gone, and the portal is answering for them.
--   portal_off         -- gone, and this org does not offer a portal at all (the org's choice).
--   access_expired     -- gone, and the window the org set has closed.
--   access_revoked     -- gone, and the org cut them off deliberately.
--   none               -- no relationship with this organization, past or present.
declare
  v_row platform.continued_access%rowtype;
  v_active boolean;
  v_portal boolean;
  v_days int;
  v_cutoff timestamptz;
begin
  if p_org is null or p_user is null then
    return jsonb_build_object('state','none');
  end if;

  select exists (select 1 from iam.organization_member m
                  where m.organization_id = p_org and m.user_id = p_user)
    into v_active;
  if v_active then
    return jsonb_build_object('state','active_member');
  end if;

  select * into v_row from platform.continued_access c
   where c.organization_id = p_org and c.subject_user_id = p_user and c.deleted_at is null;
  if not found then
    return jsonb_build_object('state','none');
  end if;

  -- The org's opt-in gates EVERYTHING. A departure row with the portal off is a record, not a door.
  v_portal := coalesce((platform.knob_resolve('continued_access','portal_enabled', p_org, null, null) #>> '{}')::boolean, false);

  -- Per-person cutoff wins over the org default; 0 days means indefinite.
  v_days := coalesce((platform.knob_resolve('continued_access','access_cutoff_days', p_org, null, null) #>> '{}')::int, 0);
  v_cutoff := coalesce(v_row.access_cutoff_at,
                       case when v_days > 0 then v_row.departed_at + make_interval(days => v_days) else null end);

  return jsonb_build_object(
    'state', case
               when v_row.revoked_at is not null then 'access_revoked'
               when v_cutoff is not null and v_cutoff <= now() then 'access_expired'
               when not v_portal then 'portal_off'
               else 'departed' end,
    'departed_at', v_row.departed_at,
    'access_cutoff_at', v_cutoff,
    'revoked_at', v_row.revoked_at,
    'portal_enabled', v_portal,
    'organization_id', p_org);
end
$fn$;

comment on function platform.continued_access_state(uuid, uuid) is
  'The one answer to where a person stands with an organization: active_member | departed | portal_off | access_expired | access_revoked | none. SECURITY DEFINER because a departed person has no org lane and could not read either the departure row or the org''s knob overrides for themselves.';

create or replace function platform.continued_access_allows(p_org uuid, p_user uuid, p_feature_key text)
returns boolean
language plpgsql
security definer
set search_path = public, platform, pg_temp
as $fn$
-- THE PREDICATE EVERY PORTAL FEATURE ASKS. Two gates, both the organization's:
--   1. is the portal on at all, and is this person still inside their access window?
--   2. has the org opted IN to this particular aspect of it?
-- A feature that forgets to ask this is a feature the org never agreed to offer.
declare v_state text;
begin
  v_state := platform.continued_access_state(p_org, p_user) ->> 'state';
  if v_state is distinct from 'departed' then
    return false;
  end if;
  return coalesce(
    (platform.knob_resolve('continued_access', p_feature_key, p_org, null, null) #>> '{}')::boolean,
    false);
end
$fn$;

comment on function platform.continued_access_allows(uuid, uuid, text) is
  'May this departed person use this named aspect of this organization''s portal? False unless the person is in state `departed` AND the org has switched this feature on. The one gate every continued-access consumer calls; a missing knob raises rather than defaulting open.';

create or replace function public.continued_access_depart(
  p_organization_id uuid,
  p_subject_user_id uuid,
  p_access_cutoff_at timestamptz default null,
  p_origin text default null,
  p_origin_id uuid default null,
  p_contact_email text default null,
  p_contact_phone text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, platform, iam, pg_temp
as $fn$
-- END a membership and BEGIN the departed state, atomically.
--
-- 🚨 THE GRANT REMOVAL IS THE STATUS FLIP. `iam.organization_member` -- the view behind
-- has_org_access_for / is_org_admin_for / my_orgs -- filters status='active'. Setting 'departed'
-- removes every org-lane grant in ONE statement, with no per-feature revocation list to keep in
-- sync. Nothing in the departure row conveys access; the portal grants reach explicitly, by knob.
--
-- 🚨 AND THE SUB-CONTAINERS GO WITH IT. Leaving the org while keeping a PROJECT membership inside
-- that org is the hole that makes the whole model a lie: `get_user_hierarchy` and
-- `agx_get_user_shortcuts` read project memberships by `deleted_at is null` alone, so a departed
-- person would keep every project they were on. They are SOFT-DELETED here rather than
-- status-flipped, because every existing reader already filters deleted_at and none of them
-- would have to learn a new word.
declare v_uid uuid := auth.uid(); v_mid uuid; v_id uuid; v_subs int;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'no_authenticated_caller');
  end if;
  if not (public.is_org_admin_for(v_uid, p_organization_id) or public.is_admin()) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden',
      'detail', 'Only an owner or admin of this organization can end a membership.');
  end if;
  if p_subject_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'p_subject_user_id');
  end if;

  select m.id into v_mid from iam.memberships m
   where m.container_type = 'organization' and m.container_id = p_organization_id
     and m.user_id = p_subject_user_id and m.deleted_at is null;

  update iam.memberships
     set status = 'departed', updated_at = now(), updated_by = v_uid
   where id = v_mid and status = 'active';

  with closed as (
    update iam.memberships m
       set deleted_at = now(), updated_at = now(), updated_by = v_uid
     where m.organization_id = p_organization_id
       and m.user_id = p_subject_user_id
       and m.container_type <> 'organization'
       and m.deleted_at is null
    returning 1)
  select count(*) into v_subs from closed;

  insert into platform.continued_access
    (organization_id, subject_user_id, membership_id, departed_at, access_cutoff_at,
     origin, origin_id, contact_email, contact_phone, created_by, updated_by)
  values
    (p_organization_id, p_subject_user_id, v_mid, now(), p_access_cutoff_at,
     p_origin, p_origin_id, p_contact_email, p_contact_phone, v_uid, v_uid)
  on conflict (organization_id, subject_user_id) where deleted_at is null
  do update set access_cutoff_at = excluded.access_cutoff_at,
                origin = coalesce(excluded.origin, platform.continued_access.origin),
                origin_id = coalesce(excluded.origin_id, platform.continued_access.origin_id),
                contact_email = coalesce(excluded.contact_email, platform.continued_access.contact_email),
                contact_phone = coalesce(excluded.contact_phone, platform.continued_access.contact_phone),
                revoked_at = null, revoked_by = null, revoke_reason = null,
                updated_at = now(), updated_by = v_uid
  returning id into v_id;

  return jsonb_build_object('ok', true, 'continued_access_id', v_id, 'membership_id', v_mid,
    'sub_container_memberships_closed', v_subs,
    'state', platform.continued_access_state(p_organization_id, p_subject_user_id));
end
$fn$;

comment on function public.continued_access_depart(uuid,uuid,timestamptz,text,uuid,text,text) is
  'The organization ends a membership and opens the departed state in one call. Sets iam.memberships.status=''departed'' (which removes every org grant by construction), soft-deletes sub-container memberships, and records the departure with its contact-on-file and access window. Org owner/admin only.';

create or replace function public.continued_access_set_window(
  p_organization_id uuid,
  p_subject_user_id uuid,
  p_access_cutoff_at timestamptz default null,
  p_revoke boolean default false,
  p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, platform, pg_temp
as $fn$
-- Arman: "they also get control of when to cut off the person's access entirely or if they want
-- to keep it on indefinitely." This is that control, both halves:
--   p_access_cutoff_at = NULL + p_revoke = false  -> keep it on indefinitely
--   p_access_cutoff_at = <ts>                     -> it ends then
--   p_revoke = true                               -> it ends NOW
-- Un-revoking is deliberately possible (p_revoke => false): an org that cut someone off in anger
-- on Friday must be able to put it back on Monday without re-terminating them.
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'no_authenticated_caller');
  end if;
  if not (public.is_org_admin_for(v_uid, p_organization_id) or public.is_admin()) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden',
      'detail', 'Only an owner or admin of this organization can change continued access.');
  end if;

  update platform.continued_access
     set access_cutoff_at = p_access_cutoff_at,
         revoked_at = case when p_revoke then now() else null end,
         revoked_by = case when p_revoke then v_uid else null end,
         revoke_reason = case when p_revoke then p_reason else null end,
         updated_at = now(), updated_by = v_uid
   where organization_id = p_organization_id
     and subject_user_id = p_subject_user_id
     and deleted_at is null;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable',
      'detail', 'This person has no departed record in this organization.');
  end if;

  return jsonb_build_object('ok', true,
    'state', platform.continued_access_state(p_organization_id, p_subject_user_id));
end
$fn$;

comment on function public.continued_access_set_window(uuid,uuid,timestamptz,boolean,text) is
  'The organization''s control over when a departed person''s access ends: a date, immediately (revoke), or never (both null). Reversible on purpose. Org owner/admin only.';

create or replace function public.continued_access_portal(p_organization_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, platform, iam, pg_temp
as $fn$
-- THE PORTAL'S ONE READ. Called by /portal and /portal/[orgId] for the SIGNED-IN caller only --
-- it never takes a user id, so it cannot be pointed at anyone else.
--
-- 🚨 IT RETURNS THE ENABLED FEATURES, NOT A BOOLEAN. Arman: "these portals could feature many
-- different things". The portal renders exactly the list this door hands back, so adding an
-- aspect later (a reference request, a records-return request) is one knob and one card -- the
-- surface needs no new shape.
--
-- 🚨 A REFUSAL IS A SENTENCE, NOT AN EMPTY PAGE. `state` distinguishes "this org does not offer
-- a portal", "your access has ended", and "we cut it off" so the person is never left guessing.
declare
  v_uid uuid := auth.uid();
  v_rows jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'no_authenticated_caller');
  end if;

  select coalesce(jsonb_agg(x order by x ->> 'departed_at' desc), '[]'::jsonb) into v_rows
  from (
    select jsonb_build_object(
      'organization_id', c.organization_id,
      'organization_name', o.name,
      'departed_at', c.departed_at,
      'state', platform.continued_access_state(c.organization_id, v_uid) ->> 'state',
      'access_cutoff_at', platform.continued_access_state(c.organization_id, v_uid) ->> 'access_cutoff_at',
      'features', (
        select coalesce(jsonb_agg(f.key order by f.key), '[]'::jsonb)
          from (values ('verification_consent')) as f(key)
         where platform.continued_access_allows(c.organization_id, v_uid, f.key || '_enabled')
      )
    ) as x
    from platform.continued_access c
    join iam.organizations o on o.id = c.organization_id
   where c.subject_user_id = v_uid
     and c.deleted_at is null
     and (p_organization_id is null or c.organization_id = p_organization_id)
  ) s;

  return jsonb_build_object('ok', true, 'granted', true, 'organizations', v_rows);
end
$fn$;

comment on function public.continued_access_portal(uuid) is
  'What the signed-in caller may see in the departed-member portal: one entry per organization they have departed from, each carrying its state and the list of aspects that organization has switched ON. Takes no user id -- it answers only for auth.uid().';

-- 🚨 Every new client-callable definer door needs a platform.client_callable_door row or its
-- grants are stripped by the standing sweep.
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason)
select v.schema_name, v.function_name, v.identity_args, v.declared_by, v.reason
from (values
 ('public','continued_access_portal','p_organization_id uuid','continued-access',
  'The departed-member portal''s only read. Answers for auth.uid() alone; every feature it lists is knob-gated by the employer org.'),
 ('public','continued_access_depart','p_organization_id uuid, p_subject_user_id uuid, p_access_cutoff_at timestamp with time zone, p_origin text, p_origin_id uuid, p_contact_email text, p_contact_phone text','continued-access',
  'The organization ends a membership and opens the departed state. Org owner/admin gated inside the door.'),
 ('public','continued_access_set_window','p_organization_id uuid, p_subject_user_id uuid, p_access_cutoff_at timestamp with time zone, p_revoke boolean, p_reason text','continued-access',
  'The organization''s cutoff control over a departed person''s access. Org owner/admin gated inside the door.')
) as v(schema_name, function_name, identity_args, declared_by, reason)
where not exists (
  select 1 from platform.client_callable_door d
   where d.schema_name = v.schema_name and d.function_name = v.function_name);

grant execute on function public.continued_access_portal(uuid) to authenticated;
grant execute on function public.continued_access_depart(uuid,uuid,timestamptz,text,uuid,text,text) to authenticated;
grant execute on function public.continued_access_set_window(uuid,uuid,timestamptz,boolean,text) to authenticated;

-- The two resolvers are internal. A client that could call them directly would have a
-- cross-tenant oracle for "is this person departed from that org".
revoke execute on function platform.continued_access_state(uuid,uuid) from public;
revoke execute on function platform.continued_access_allows(uuid,uuid,text) from public;
