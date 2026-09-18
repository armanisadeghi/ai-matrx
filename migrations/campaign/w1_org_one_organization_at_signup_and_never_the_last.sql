-- target: branch,production
-- additive: yes
-- guard: custom/signup_provisioning_guard
-- based-on: public._provision_new_user_personal_org() 3fd1d1367902fcf692aa55ad95b487069acf417fee266e1d86f78f471dbdf37f
--
-- W1-ORG — REC-42 · REC-43 · REC-45 · REC-46 (its RED half) · REC-44's signup write.
--
-- THE LAWS, AND THE ONE THAT IS ALREADY BUILT
-- --------------------------------------------
-- REC-42 "Organizations are all equal; the personal organization concept is eliminated."
-- REC-43 "Every Person gets exactly one auto-created organization at signup, no exceptions,
--         no branches."                                            (Doctrine R10, §5.2 item 1)
-- REC-45 "The auto-created organization is named `{First name}'s Org`, with the ruled
--         fallback order."                                                    (Doctrine R12)
-- REC-46 "A user cannot be removed from, leave, or delete their last remaining organization."
--                                                                        (Doctrine §5.2 item 2)
-- REC-44's signup half: "`default_organization_id`: SET AT SIGNUP to the auto-created
--         organization."                                                (Doctrine §5.2 item 3)
--
-- 🚨 REC-45 IS ALREADY LIVE AND IS NOT REBUILT HERE (rule 19: check the defect is still red).
-- `iam.auto_organization_name(p_meta jsonb, p_email text)` exists on BOTH databases with the
-- identical body (md5 `de205c696694bd929876b7f6226fda2d`, measured 2026-09-18) and
-- `public._d31_impl_ensure_personal_organization` already calls it under the comment
-- "Data Doctrine R12". A fresh signup executed END TO END against the rehearsal branch's own
-- `/auth/v1/admin/users` at 01:38 UTC with metadata `{"first_name":"Ada","last_name":"Lovelace"}`
-- produced an organization READ BACK OUT of `iam.organizations` as **`Ada's Org`**. So this
-- lane REUSES that function rather than writing a second naming rule — a second one is the
-- defect, not the deliverable.
--
-- 🚨 HALF OF REC-46 IS ALSO ALREADY LIVE. `iam._guard_organization_delete()` runs BEFORE
-- DELETE on `iam.organizations` and already refuses both "your only organization" and "N
-- members would be left with none" (DD-044). WHAT IS STILL RED, reproduced on the branch at
-- 01:53 UTC, is the MEMBERSHIP half — "cannot be removed from" and "cannot leave":
--     select count(*) from iam.memberships where user_id = <fresh signup> …  -> 1
--     delete from iam.memberships where user_id = <fresh signup> …           -> DELETE 1
--     select count(*) …                                                     -> 0
-- The person now belongs to NO organization and nothing said a word. That is what the second
-- half of this file closes, and it closes it by REUSING `iam.is_last_organization(uuid, uuid)`,
-- which the organization-delete guard already reads — one rule, two doors.
--
-- 1. THE SIGNUP BODY
-- ------------------
-- `public._provision_new_user_personal_org()` is the AFTER INSERT trigger on `auth.users`
-- that every signup executes. Its new body branches on the guard and NOTHING else:
--
--   · `custom/signup_provisioning_guard` OFF (its live value on BOTH databases today, read
--     from `platform.feature_knob`): the body calls `public.ensure_personal_organization(new.id)`
--     exactly as it does now, inside the same actor-tier `set_config` frame, with the same
--     `is_anonymous` test and the same `EXIT provisioning_body` label. The OFF path is
--     today's path.
--   · ON: it calls `iam.provision_signup_organization(new.id)` — one organization, always,
--     named by `iam.auto_organization_name`, with the person's `default_organization_id`
--     preference written to it.
--
-- WHY THE ON PATH IS A SEPARATE FUNCTION rather than more branches inside the trigger: REC-43
-- says "no exceptions, no branches", and a signup rule that lives inside a trigger body can
-- only be reached by inserting a user. `iam.provision_signup_organization(uuid)` is callable,
-- testable and readable on its own, and it is idempotent — a second call for the same person
-- returns the organization they already have rather than making a second one, which is what
-- "exactly one" has to mean when a retry exists.
--
-- REC-42 IN THE BODY, NOT IN THE COMMENTS: the new implementation never READS `is_personal`
-- to decide anything. It finds the person's existing organization through
-- `iam.memberships`, which is what membership actually is. It still WRITES the column when it
-- is present, because `iam.organizations.is_personal` is live on production today with a NOT
-- NULL default and the partial unique index `organizations_one_personal_per_creator`, and a
-- signup that left it false would collide with nothing and mean nothing while the old path
-- still reads it. The write is done through `to_regclass`-style column detection so the SAME
-- BYTES work after REC-61 drops the column — dropping it is an attended step and is not in
-- this file. The stand-in announces itself: the body raises a NOTICE naming REC-61 whenever it
-- writes the column.
--
-- 2. THE LAST ORGANIZATION
-- ------------------------
-- `iam._guard_last_organization_membership()` on `iam.memberships`, BEFORE DELETE and BEFORE
-- UPDATE, behind the same guard. It refuses when the row leaving would be the person's LAST
-- active organization membership, in the person's own words ("You can't leave your only
-- organization. Create or join another one first."), and it carries the SAME two exemptions
-- the live organization-delete guard already carries — the service role and a platform admin
-- are doing repair, not leaving — so the two doors answer the same way about the same fact.
--
-- 3. WHAT IS HELD, SAID OUT LOUD
-- ------------------------------
-- Nothing here drops `is_personal`, changes `resolve_tier`, or moves a billing column. REC-61's
-- drop and REC-62's billing move are live-column changes on production and are listed in this
-- lane's report under "awaiting the attended step".
--
-- IDEMPOTENCE (rule 27): the replaced trigger body is a `CREATE OR REPLACE FUNCTION` carrying
-- its `-- based-on:` line; the two new functions are plain `CREATE FUNCTION` (the allow-list
-- refuses a `CREATE OR REPLACE` that declares no `-- based-on:`, which a new function cannot
-- have), so a second consecutive apply is refused by the DATABASE (42723) having changed
-- nothing, as are the two new triggers (42710).
-- THE INVERSE: `migrations/inverse/w1_org_one_organization_at_signup_and_never_the_last_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '120s';

-- 1 ------------------------------------------------ the doctrine's signup implementation
create function iam.provision_signup_organization(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  v_email     text;
  v_meta      jsonb;
  v_org_id    uuid;
  v_org_name  text;
  v_base_slug text;
  v_slug      text;
  v_attempt   int := 0;
  v_hex       text;
  v_has_personal boolean;
begin
  if p_user_id is null then
    raise exception 'provision_signup_organization: p_user_id cannot be NULL';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'provision_signup_organization: user % does not exist', p_user_id;
  end if;

  -- REC-43 "exactly one … no exceptions, no branches", which has to survive a retry: the
  -- person's membership IS the fact, and it is read instead of iam.organizations.is_personal
  -- (REC-42 — the personal-organization concept decides nothing here).
  select m.organization_id into v_org_id
    from iam.memberships m
   where m.user_id = p_user_id
     and m.container_type = 'organization'
     and m.status = 'active'
     and m.deleted_at is null
   order by m.created_at, m.organization_id
   limit 1;

  if v_org_id is null then
    select u.email, u.raw_user_meta_data into v_email, v_meta
      from auth.users u where u.id = p_user_id;
    v_hex := substring(replace(p_user_id::text, '-', ''), 1, 8);

    -- REC-45 / Doctrine R12, REUSED and not re-implemented: first name -> last name ->
    -- cleaned email local part, title-cased, never "personal", never "workspace".
    v_org_name := iam.auto_organization_name(v_meta, v_email);
    if v_org_name is null then
      v_org_name := 'Organization ' || v_hex;
      raise warning 'organization naming: user % has no name metadata and no email; named %. Ask the person to rename it in Settings > Organizations.',
        p_user_id, v_org_name;
    end if;

    -- The SLUG keeps its live derivation (email local part): live URLs resolve through it
    -- (access_gate_resolve_slug), and R12 changes the NAME, never the address.
    v_base_slug := nullif(split_part(coalesce(v_email, ''), '@', 1), '');
    if v_base_slug is null or length(v_base_slug) < 3 then
      v_base_slug := 'user-' || v_hex;
    end if;
    v_base_slug := trim(both '-' from
                     regexp_replace(
                       regexp_replace(lower(v_base_slug), '[^a-z0-9]', '-', 'g'),
                       '-+', '-', 'g'));
    if v_base_slug is null or v_base_slug = '' then
      v_base_slug := 'user-' || v_hex;
    end if;

    select exists (select 1 from pg_attribute a
                    where a.attrelid = 'iam.organizations'::regclass
                      and a.attname = 'is_personal' and not a.attisdropped)
      into v_has_personal;

    loop
      v_attempt := v_attempt + 1;
      if    v_attempt = 1   then v_slug := v_base_slug;
      elsif v_attempt <= 10 then v_slug := v_base_slug || '-' || v_attempt::text;
      else                       v_slug := v_base_slug || '-' || replace(p_user_id::text, '-', '');
      end if;
      begin
        if v_has_personal then
          -- THE STAND-IN ANNOUNCES ITSELF (nothing fails silently): the column is still live
          -- on production with a NOT NULL default and the partial unique index
          -- organizations_one_personal_per_creator, and the OLD path still reads it, so a row
          -- written without it would be invisible to every caller that has not moved yet.
          raise notice 'organization provisioning: writing the retired iam.organizations.is_personal flag for user % because the column is still present. Remedy: REC-61 drops it (an attended step); these same bytes stop writing it the moment it is gone.',
            p_user_id;
          execute 'insert into iam.organizations (name, slug, created_by, is_personal) values ($1,$2,$3,true) returning id'
            into v_org_id using v_org_name, v_slug, p_user_id;
        else
          insert into iam.organizations (name, slug, created_by)
          values (v_org_name, v_slug, p_user_id)
          returning id into v_org_id;
        end if;
        exit;
      exception when unique_violation then
        -- A concurrent signup for the same person can win either the slug or the creator
        -- invariant. Re-read the membership before treating this as a slug collision.
        select m.organization_id into v_org_id
          from iam.memberships m
         where m.user_id = p_user_id and m.container_type = 'organization'
           and m.status = 'active' and m.deleted_at is null
         order by m.created_at, m.organization_id limit 1;
        if v_org_id is not null then exit; end if;
        if v_attempt > 11 then raise; end if;
      end;
    end loop;
  end if;

  insert into iam.memberships
    (organization_id, container_type, container_id, user_id, role, status)
  values
    (v_org_id, 'organization', v_org_id, p_user_id, 'owner', 'active')
  on conflict (container_type, container_id, user_id) do nothing;

  -- REC-44 / Doctrine §5.2 item 3: "set at signup to the auto-created organization".
  insert into users.user_preferences (user_id, preferences, default_organization_id)
  values (p_user_id, '{}'::jsonb, v_org_id)
  on conflict (user_id) do update
    set default_organization_id = coalesce(users.user_preferences.default_organization_id,
                                           excluded.default_organization_id);

  return v_org_id;
end;
$fn$;

comment on function iam.provision_signup_organization(uuid) is
  'REC-42/43/44/45, Doctrine R10/R11/R12: the ONE organization every person gets at signup. Named by iam.auto_organization_name (R12''s fallback order, reused not re-implemented), owned by them, and written into their users.user_preferences.default_organization_id. Idempotent: a second call returns the organization they already have. Reads iam.memberships, never iam.organizations.is_personal — organizations are all equal (REC-42).';

-- THE DOOR, IN DATA, because a SECURITY DEFINER function runs as `postgres` and somebody has
-- to say who may call it — prose in a comment is not a declaration, and production's
-- `provision_shape_guard` rolled this whole file back by name until this row was here
-- (SQLSTATE 23514, `reached COMMIT with no access decision declared`, measured on the branch
-- 2026-09-18). NO CLIENT EVER CALLS IT: its only caller is the `on_auth_user_created` trigger
-- on `auth.users`, which runs inside the auth server's own insert, so both caller flags are
-- false and the lane is declared as a sentence.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('iam', 'provision_signup_organization', 'p_user_id uuid',
   array['uuid'::regtype]::oid[],
   'p_user_id is the auth.users id being provisioned. It is NOT checked against the caller, because there is no caller: the function runs inside the AFTER INSERT trigger on auth.users, for the row being inserted. NULL is refused outright, and an id with no auth.users row is refused outright. It grants nothing to the person beyond one organization they own and their own default-organization preference.',
   'migrations/campaign/w1_org_one_organization_at_signup_and_never_the_last.sql',
   'server_only: the ONLY caller is the on_auth_user_created trigger on auth.users, executed by the Supabase auth server inside its own INSERT. No client route, RPC, PostgREST path or application code calls it, and it is not granted to anon or authenticated; a client that wants an organization uses the ordinary organization-create surface.',
   false, false)
on conflict do nothing;

-- 2 ------------------------------------------- the trigger every signup already executes
create or replace function public._provision_new_user_personal_org()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
DECLARE
  _auth_prev_tier text := current_setting('app.actor_tier', true);
  _auth_prev_system text := current_setting('app.actor_system', true);
  _auth_prev_agent text := current_setting('app.actor_agent', true);
  _campaign_on boolean;
BEGIN
  PERFORM set_config('app.actor_tier', 'code', true);
  PERFORM set_config('app.actor_system', 'auth.user_provisioning', true);
  PERFORM set_config('app.actor_agent', '', true);
  <<provisioning_body>>

begin
  if coalesce(new.is_anonymous, false) is false then
    -- THE GUARD. `custom/signup_provisioning_guard` resolves false on both databases today,
    -- so every signup takes the SAME line it takes now.
    _campaign_on := coalesce(
      (platform.knob_resolve('custom', 'signup_provisioning_guard', null) #>> '{}')::boolean,
      false);
    if _campaign_on then
      perform iam.provision_signup_organization(new.id);
    else
      perform public.ensure_personal_organization(new.id);
    end if;
  end if;
  EXIT provisioning_body;
end;

  PERFORM set_config('app.actor_tier', coalesce(_auth_prev_tier, ''), true);
  PERFORM set_config('app.actor_system', coalesce(_auth_prev_system, ''), true);
  PERFORM set_config('app.actor_agent', coalesce(_auth_prev_agent, ''), true);
  RETURN NEW;
END;
$function$;

-- 3 --------------------------------------------------- never the last organization
create function iam._guard_last_organization_membership()
returns trigger
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  v_row     record;
  v_uid     uuid := (select auth.uid());
  v_leaving boolean;
  v_on      boolean;
begin
  v_row := case when TG_OP = 'DELETE' then old else new end;

  if v_row.container_type is distinct from 'organization' then
    return v_row;
  end if;

  -- THE GUARD, read before anything is refused.
  v_on := coalesce(
    (platform.knob_resolve('custom', 'signup_provisioning_guard', v_row.organization_id) #>> '{}')::boolean,
    false);
  if not v_on then
    return v_row;
  end if;

  -- Is this row actually the person LEAVING? A delete is; an update is only when the row
  -- stops being an active, undeleted membership.
  if TG_OP = 'DELETE' then
    v_leaving := (old.status = 'active' and old.deleted_at is null);
  else
    v_leaving := (old.status = 'active' and old.deleted_at is null)
             and (new.status is distinct from 'active' or new.deleted_at is not null
                  or new.user_id is distinct from old.user_id
                  or new.container_id is distinct from old.container_id);
  end if;
  if not v_leaving then
    return v_row;
  end if;

  -- The SAME two exemptions the live iam._guard_organization_delete() carries: the service
  -- role and a platform admin are doing repair or cleanup, not leaving. Two doors, one rule.
  if v_uid is null
     or coalesce((select auth.role()) = 'service_role', false)
     or (select public.is_platform_admin()) then
    return v_row;
  end if;

  if iam.is_last_organization(v_row.user_id, v_row.container_id) then
    if v_row.user_id = v_uid then
      raise exception 'You can''t leave your only organization. Create or join another one first.'
        using errcode = '23514',
              hint = 'Doctrine 5.2 item 2 (REC-46): a person cannot be removed from, leave, or delete their last remaining organization.';
    else
      raise exception 'This is that person''s only organization, so removing them would leave them belonging to none. Ask them to join or create another organization first.'
        using errcode = '23514',
              hint = 'Doctrine 5.2 item 2 (REC-46): a person cannot be removed from, leave, or delete their last remaining organization.';
    end if;
  end if;

  return v_row;
end;
$fn$;

comment on function iam._guard_last_organization_membership() is
  'REC-46 / Doctrine 5.2 item 2, the membership half. Behind custom/signup_provisioning_guard. Refuses a delete or a deactivation that would leave a person belonging to NO organization, whether they are leaving or being removed. Reads iam.is_last_organization(uuid,uuid), the same function the live organization-delete guard reads, and carries the same service-role and platform-admin exemptions.';

create trigger guard_last_organization_membership_delete
  before delete on iam.memberships
  for each row execute function iam._guard_last_organization_membership();

create trigger guard_last_organization_membership_update
  before update on iam.memberships
  for each row execute function iam._guard_last_organization_membership();
