-- users_vault_declares_closed_dd137b15 — THE REGISTRY MUST SAY WHAT THE POLICIES DO.
--
-- `pnpm check:staff-door` found it: `credential_item` was listed as still letting our own staff read,
-- for the one reason "does not declare it closed". DD-137b11 removed its `platform_admin_all` policy
-- and stripped the staff arms from its three permissive read policies — proven there with
-- measurements (platform admin 123 → 0, owner 14, org admin 28, member 23) — and never set
-- `suppress_platform_admin_lane`. So the POLICIES said closed and the REGISTRY said open.
--
-- That gap is not cosmetic. `iam._apply_rls_unchecked` reads the COLUMN, so the next person who runs
-- `iam.apply_rls` on this table — which its own row screams not to — would have found a registry
-- that told the generator to put the staff lane back. The declaration and the act have to agree, and
-- the guard is what made the disagreement visible within minutes of it existing.
--
-- 🚨 SETTING THIS FLAG DOES NOT REGENERATE ANYTHING. `platform._entity_types_class_regenerates`
-- fires on `data_class`, not on this column, so the bespoke policies DD-137b11 preserved are
-- untouched — which is exactly what is wanted here and is asserted below.
do $$
declare v_pols_before text; v_pols_after text;
begin
  select string_agg(polname, ',' order by polname) into v_pols_before
    from pg_policy where polrelid = 'users.credential_items'::regclass;

  update platform.entity_types
     set suppress_platform_admin_lane = true
   where token = 'credential_item' and not suppress_platform_admin_lane;

  select string_agg(polname, ',' order by polname) into v_pols_after
    from pg_policy where polrelid = 'users.credential_items'::regclass;

  if v_pols_after is distinct from v_pols_before then
    raise exception 'dd137b15: the policy set on users.credential_items CHANGED (% -> %). Setting '
      'the declaration flag must never regenerate a bespoke table.', v_pols_before, v_pols_after;
  end if;
end $$;

do $$
declare v_n integer;
begin
  if not (select suppress_platform_admin_lane from platform.entity_types where token='credential_item') then
    raise exception 'dd137b15: credential_item still declares the staff lane open';
  end if;
  -- the policies are still the bespoke set, and still carry no staff read
  select count(*) into v_n from pg_policy
   where polrelid='users.credential_items'::regclass and polname='platform_admin_all';
  if v_n > 0 then raise exception 'dd137b15: platform_admin_all came back on credential_items'; end if;
  select count(*) into v_n from pg_policy p
   where p.polrelid='users.credential_items'::regclass and p.polpermissive and p.polcmd in ('r','*')
     and coalesce(pg_get_expr(p.polqual,p.polrelid),'') ~ 'is_platform_admin|is_super_admin';
  if v_n > 0 then raise exception 'dd137b15: a permissive staff READ arm came back on credential_items'; end if;
  -- 🚨 ASSERT THE SHAPE, NOT A COUNT. My first version of this file asserted "6 policies" and was
  -- wrong: DD-137b11 dropped ONE policy (`platform_admin_all`) and added three command-scoped write
  -- ones, so 7 - 1 + 3 = 9. A bare count is brittle in both directions — it fails on a correct
  -- table and passes on a table whose policies were swapped for different ones of the same number.
  -- These are the lanes that must BE there, by name.
  select count(*) into v_n from pg_policy p
   where p.polrelid = 'users.credential_items'::regclass
     and p.polname in ('credential_items_owner_read','credential_items_org_member_read',
                       'credential_items_personal_grantee_read');
  if v_n <> 3 then
    raise exception 'dd137b15: credential_items has % of its 3 bespoke READ lanes — §3.7''s per-row '
      'access_mode door and the user_secret_grants delegation lane are the design, not decoration', v_n;
  end if;
  select count(*) into v_n from pg_policy p
   where p.polrelid = 'users.credential_items'::regclass and not p.polpermissive;
  if v_n <> 3 then
    raise exception 'dd137b15: credential_items has % of its 3 RESTRICTIVE write walls — those are a '
      'wall, not a lane, and removing one WIDENS writes', v_n;
  end if;
  raise notice 'dd137b15: the registry and the policies agree, and the bespoke set is intact';
end $$;
