-- based-on: iam.provision_signup_organization(uuid) 613695739dfcc286d4af86ed0c3911ebf7a61696a575ee787e26e373f9ca51c7
-- w1_org_signup_stops_writing_a_default_organization.sql
--
-- F1 of the default-organization annihilation: SIGNUP STOPS SEEDING THE ROOT.
--
-- RULING (Arman, 2026-09-19). A "default organization" is at most a per-client
-- DISPLAY preference. Nothing but the org picker and pure UI display may read
-- it. No data read, write, API route, boot ladder, trigger or billing query may
-- pick or substitute one -- not a cookie, not a preference, not the personal
-- organization, not the system organization. A request that needs an
-- organization and has none is HELD: the person is shown their memberships,
-- SETS one, and the request proceeds.
--
--   "one missed org check that should have just failed turns into 50 in a
--    month and 5,000 in a year, and suddenly we don't have orgs any more, we
--    have a user and a default org, which means we just have user now."
--
-- WHAT THIS CHANGES, AND WHY IT IS NOT COSMETIC
-- ---------------------------------------------
-- `iam.provision_signup_organization(p_user_id)` ends by writing the new
-- organization into `users.user_preferences.default_organization_id`. Every
-- boot ladder that READ that column is already gone (2026-09-19,
-- `resolveActiveOrgContext` rung (a), `readDefaultOrgIdFromDb`, deleted), so
-- today the write feeds nothing.
--
-- That is exactly why it is dangerous, and why "harmless while unread" is the
-- wrong reading. A populated column with no reader is a loaded gun on the
-- table: the next ladder that wants an organization finds a column that always
-- has a plausible answer for every user on the platform, reads it because it is
-- there, and the whole class grows back in one line of someone else's
-- diff -- with no migration, no review, and nothing to notice. Annihilating the
-- READERS while leaving the SEEDER running is how this returns. So the seeder
-- stops.
--
-- The organization itself is unchanged: signup still creates exactly one
-- organization and still makes the person its owner (REC-42/43/45, Doctrine
-- R10/R11/R12). What goes away is the claim that it is their DEFAULT. With one
-- membership there is nothing to choose and sole-membership auto-select carries
-- them (the ruling allows it explicitly); the moment they have two, the person
-- chooses, which is the entire point.
--
-- THE PREFERENCES ROW STILL GETS CREATED. Only the column stops being written.
-- Dropping the insert outright would leave a new account with no
-- `users.user_preferences` row at all, which is a different, unrelated
-- regression -- so the row is still seeded, with `preferences` and nothing else.
-- `default_organization_id` keeps its column and its NULL default: the Doctrine
-- (R9-R12, DD-045) still means it to exist as the display preference a person
-- may STATE for themselves in Settings. Stating it is theirs; seeding it is
-- ours, and ours stops here.
--
-- `iam._default_organization_is_a_membership` (the trigger on
-- `users.user_preferences`) is untouched. It CONSTRAINS the column rather than
-- substituting for it -- it refuses a default that is not one of the person's
-- memberships -- which is the opposite of the class this campaign closes. It is
-- also inert today: it returns early unless `custom/signup_provisioning_guard`
-- resolves true, and that knob is false on this database (verified live
-- 2026-09-19).
--
-- FROZEN HISTORY. The body being replaced was applied by
-- `migrations/campaign/w1_org_one_organization_at_signup_and_never_the_last.sql:211-215`.
-- That file is applied history and is NOT edited: an edit to an applied file
-- changes nothing on the database and silently desynchronises its ledger
-- checksum. A new file is the only honest way to change a live function.
--
-- VERIFIED LIVE BEFORE WRITING (2026-09-19): the live body still carries the
-- `insert into users.user_preferences (... default_organization_id) values
-- (... v_org_id)` tail, and `iam.default_organization_id(uuid)` is read by
-- exactly four live objects -- `billing.resolve_tier`,
-- `billing.tier_no_downgrade`, `iam._default_organization_is_a_membership` and
-- this function. The two billing ones are F2
-- (`w1_org_billing_is_organization_keyed.sql`).
--
-- Law: docs/handoffs/default-org-annihilation.md.

-- Guard: this file was written against a body that still writes the column. If
-- some other lane already changed it, STOP rather than clobber their work.
do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'iam' and p.proname = 'provision_signup_organization'
  ) then
    raise exception 'F1: iam.provision_signup_organization(uuid) does not exist. This file was written against a live function; a missing one means the census is stale.';
  end if;
end $$;

create or replace function iam.provision_signup_organization(p_user_id uuid)
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
$fn$;

comment on function iam.provision_signup_organization(uuid) is
  'REC-42/43/45, Doctrine R10/R11/R12: the ONE organization every person gets at signup. Named by iam.auto_organization_name (R12''s fallback order, reused not re-implemented), owned by them. Idempotent: a second call returns the organization they already have. Reads iam.memberships, never iam.organizations.is_personal — organizations are all equal (REC-42). It does NOT write users.user_preferences.default_organization_id: the 2026-09-19 ruling (Arman) makes a default organization a DISPLAY preference the PERSON states, never a fact the platform seeds — seeding it is how a boot ladder grows the habit back. See migrations/w1_org_signup_stops_writing_a_default_organization.sql.';

-- PROOF, IN THE SAME TRANSACTION. A migration that cannot show its own effect
-- is a hope. Both halves are asserted: the substitution is gone AND the row is
-- still seeded.
do $$
declare v_def text;
begin
  -- Read the EXECUTABLE body only. `pg_get_functiondef` returns the comments
  -- too, and this file deliberately quotes the removed statement in a comment
  -- so the next reader can see what went and why -- which the first version of
  -- this assertion promptly flagged as the statement still being there. Strip
  -- `--` comment tails before asserting, or the proof reads the prose.
  v_def := (select string_agg(regexp_replace(line, '--.*$', ''), E'\n')
              from (
                select unnest(string_to_array(
                         (select pg_get_functiondef(p.oid) from pg_proc p
                            join pg_namespace n on n.oid = p.pronamespace
                           where n.nspname = 'iam'
                             and p.proname = 'provision_signup_organization'),
                         E'\n')) as line
              ) t);

  if v_def ~* 'insert\s+into\s+users\.user_preferences[^;]*default_organization_id' then
    raise exception 'F1 FAILED: iam.provision_signup_organization still writes users.user_preferences.default_organization_id.';
  end if;

  if v_def !~* 'insert\s+into\s+users\.user_preferences' then
    raise exception 'F1 FAILED: iam.provision_signup_organization no longer seeds a users.user_preferences row at all. The column write had to go; the ROW must stay.';
  end if;

  raise notice 'F1 OK: signup creates the organization, the membership and the preferences row, and names no default organization.';
end $$;
