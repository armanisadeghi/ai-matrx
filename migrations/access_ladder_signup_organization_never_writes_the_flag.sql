-- based-on: iam.provision_signup_organization(uuid) d06c7e83ca63820e7fae65398390b2837e12b0dc4b0f18d51d7c53afa280431f
-- lane: access-ladder T-1
-- lock: iam
--
-- SIGNUP STOPS WRITING THE DEPRECATED ORGANIZATION FLAG.
-- (The access ladder, common-docs/policies/access-ladder.md: organizations are unlimited and
-- equal; there is no personal/business type and no flag that marks one — Arman, 2026-09-26.)
--
-- iam.provision_signup_organization used to probe pg_attribute for the deprecated column
-- (w1_org_is_personal_is_deprecated_on_main.sql) and, while it existed, insert the
-- signup organization through a dynamic statement that set it to true. This body never reads
-- or writes it: the organization row is inserted with name, slug and created_by only, and the
-- column's own default (false) supplies the value until the column is dropped. Everything else
-- — the membership-first retry, naming, slug derivation, owner membership, preferences row —
-- is byte-for-byte the previous body.

create or replace function iam.provision_signup_organization(p_user_id uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
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
  insert into users.user_preferences (user_id, preferences)
  values (p_user_id, '{}'::jsonb)
  on conflict (user_id) do nothing;

  return v_org_id;
end;
$function$;

do $$
begin
  if (select p.prosrc from pg_proc p
       where p.oid = 'iam.provision_signup_organization(uuid)'::regprocedure) ~ ('\mis' || '_personal\M') then
    raise exception 'access-ladder T-1: provision_signup_organization still names the deprecated flag';
  end if;
end $$;
