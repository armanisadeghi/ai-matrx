-- based-on: iam.provision_signup_organization(uuid) 0fe96eb187ae3ccf51bfe37b76f11bba43f50d6665f2a2bc517acbddcded7610
-- lane: access-ladder T-3
-- lock: iam
--
-- SIGNUP'S PREFERENCES ROW CARRIES ITS ORGANIZATION.
-- iam.provision_signup_organization inserted users.user_preferences without organization_id, which
-- is NOT NULL, so the moment signup routed through it (access_ladder_t3_signup_org_and_complimentary_pro.sql)
-- every non-anonymous signup failed 23502. The row now lives in the organization the same call created.

set local lock_timeout = '3s';

CREATE OR REPLACE FUNCTION iam.provision_signup_organization(p_user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_email     text;
  v_meta      jsonb;
  v_org_id    uuid;
  v_org_name  text;
  v_base_slug text;
  v_slug      text;
  v_attempt   int := 0;
  v_hex       text;
begin
  if p_user_id is null then
    raise exception 'provision_signup_organization: p_user_id cannot be NULL';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'provision_signup_organization: user % does not exist', p_user_id;
  end if;

  -- REC-43 "exactly one … no exceptions, no branches", which has to survive a retry: the
  -- person's membership IS the fact (REC-42 — no organization type decides anything here).
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

    loop
      v_attempt := v_attempt + 1;
      if    v_attempt = 1   then v_slug := v_base_slug;
      elsif v_attempt <= 10 then v_slug := v_base_slug || '-' || v_attempt::text;
      else                       v_slug := v_base_slug || '-' || replace(p_user_id::text, '-', '');
      end if;
      begin
        insert into iam.organizations (name, slug, created_by)
        values (v_org_name, v_slug, p_user_id)
        returning id into v_org_id;
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

  -- 🚨 THE DEFAULT-ORGANIZATION WRITE IS GONE (2026-09-19 ruling, F1).
  --
  -- This used to end:
  --
  --   insert into users.user_preferences (user_id, preferences, default_organization_id)
  --   values (p_user_id, '{}'::jsonb, v_org_id)
  --   on conflict (user_id) do update
  --     set default_organization_id = coalesce(users.user_preferences.default_organization_id,
  --                                            excluded.default_organization_id);
  --
  -- citing REC-44 / Doctrine 5.2 item 3, "set at signup to the auto-created
  -- organization". The 2026-09-19 ruling supersedes that: a default
  -- organization is a DISPLAY preference the person may state for themselves,
  -- and seeding it at signup makes it a fact about every account on the
  -- platform that some future ladder will read because it is always there.
  -- The membership above is the real fact, and sole-membership auto-select
  -- carries a brand-new account with nothing to choose.
  --
  -- The preferences ROW is still created, because a missing one is its own
  -- regression; only the organization column is left alone.
  -- The row lives in the organization this signup just created (its tenancy column is NOT
  -- NULL); that is where the record is stored, not a default any ladder reads.
  insert into users.user_preferences (user_id, preferences, organization_id)
  values (p_user_id, '{}'::jsonb, v_org_id)
  on conflict (user_id) do nothing;

  return v_org_id;
end;
$function$;
