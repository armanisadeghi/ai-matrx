-- users_vault_registered_dd137b11 — THE TWO VAULT TABLES ENTER THE CLASS REGIME (DD-137b, fix round 1).
--
-- V-40: `users.credential_items` (123 of 123) and `users.user_secrets` (307 of 307) are readable by a
-- platform admin and are **not registered entities at all** — no row in `platform.entity_types`, so
-- the class regime never saw them, they have no `data_class`, and `iam.verify_canonical` cannot fail
-- them. §3.7 already named these two as the canonical per-row-narrowing case (`access_mode`) and
-- said plainly: "neither vault table is in platform.entity_types… the recommendation is to register
-- them." This registers them.
--
-- 🚨 REGISTERED, NOT REGENERATED, AND THE REASON IS MEASURED. `iam.apply_rls` DROPS every policy on a
-- table before it generates. These two carry seven bespoke policies each, and those policies are the
-- design: the `access_mode = 'all_members'` per-row door, the `users.user_secret_grants` delegation
-- lane, and three RESTRICTIVE write policies that are a WALL rather than a lane. Generating over them
-- would delete every one of those and hand the tables the generic `private` lane set — which on
-- `credential_items` would cut the org-shared-credential lane 23 and 28 rows wide for two real
-- members, and on `user_secrets` would WIDEN reads that are restrictive-walled today. That is the
-- trapdoor V-33 named and it is not walked through here.
--
-- WHAT THE MEASUREMENT SAID (live, impersonated, rolled back, before anything changed):
--
--   identity                              credential_items   user_secrets   (own secrets)
--   info@aimatrx.com     platform admin        123 / 123        307 / 307        0
--   projectmanager@…     owner of 11 / 39       14               0              39
--   arman@titanium…      org admin              28               0               0
--   kelvin@…             plain member           23               0               0
--
-- Two different tables, and they need two different answers:
--
--   * `users.credential_items` — a real permissive read surface with real non-staff readers. The
--     platform-admin arm there IS a standing browse of other people's credentials, and closing it
--     costs nobody their own data. CLOSED HERE.
--   * `users.user_secrets` — SELECT is walled by a RESTRICTIVE `platform_admin_select_only`, so the
--     platform admin is not one reader among several: it is the ONLY client read path, and the
--     secrets' own owner reads 0 of their 39. Stripping the staff lane would make the table readable
--     by nobody at all, which is not privacy, it is a broken vault. NOT CLOSED HERE, recorded as a
--     FAIL on `data_class_derivations` so it cannot be forgotten, and named in the report as the one
--     place §3.5's promise is still not kept. It needs the vault's own door work, not a blind strip.
--
-- 🚨 AND A REGISTERED TOKEN IS NOW A TRAPDOOR. Registering these makes a future `iam.apply_rls` on
-- them possible, which would destroy the design above. `notes` and `data_class_reason` both say so
-- in the row itself, where the next agent will actually read them.

-- ═════════════════════════════════════════════ 1. register both, private, bespoke by design
do $$
declare v_bespoke_note constant text :=
  '🚨 DO NOT RUN iam.apply_rls ON THIS TABLE. Its RLS is BESPOKE BY DESIGN and is the canonical '
  'per-row narrowing case of VISIBILITY-BY-CLASS §3.7: users.credential_items.access_mode / '
  'users.user_secrets.access_mode are CHECK (access_mode in (''all_members'',''restricted'')) and two '
  'live policies key on them, plus a users.user_secret_grants delegation lane and three RESTRICTIVE '
  'write policies. apply_rls drops every policy before it generates, so generating here deletes the '
  'design and replaces it with the generic lane set. Registered (DD-137b11) so the class regime and '
  'iam.verify_canonical can SEE the table — not so the generator can rewrite it.';
begin
  if not exists (select 1 from platform.entity_types where token = 'credential_item') then
    insert into platform.entity_types (
      token, schema_name, table_name, label, rls_variant, is_active, is_listed, is_component,
      base_tier, is_versioned, has_soft_delete, data_class, default_list_scope, data_class_reason, notes)
    values ('credential_item','users','credential_items','Credential item','entity', true, false, false,
            1, false, false, 'private', 'mine',
            'VISIBILITY-BY-CLASS §3.1: a person''s stored credentials. No standing read for anyone, '
            'our own staff included. ' || v_bespoke_note, v_bespoke_note);
  else
    update platform.entity_types set data_class='private', default_list_scope='mine',
      data_class_reason = 'VISIBILITY-BY-CLASS §3.1: a person''s stored credentials. No standing '
        'read for anyone, our own staff included. ' || v_bespoke_note,
      notes = coalesce(notes,'') || ' ' || v_bespoke_note
     where token = 'credential_item';
  end if;

  if not exists (select 1 from platform.entity_types where token = 'user_secret') then
    insert into platform.entity_types (
      token, schema_name, table_name, label, rls_variant, is_active, is_listed, is_component,
      base_tier, is_versioned, has_soft_delete, data_class, default_list_scope, data_class_reason, notes)
    values ('user_secret','users','user_secrets','User secret','entity', true, false, false,
            1, false, false, 'private', 'mine',
            'VISIBILITY-BY-CLASS §3.1: a person''s stored secrets. ⚠️ The platform-staff read is NOT '
            'closed yet and iam.verify_canonical FAILs this row until it is: SELECT here is walled by '
            'a RESTRICTIVE platform_admin_select_only, so the staff lane is the ONLY client read path '
            '— the secretsّ own owner reads 0 of their 39 — and stripping it would make the table '
            'readable by nobody. It needs the vault''s own door, not a blind strip (DD-137b11). '
            || v_bespoke_note, v_bespoke_note);
  else
    update platform.entity_types set data_class='private', default_list_scope='mine'
     where token = 'user_secret';
  end if;
end $$;

-- ═════════════════════════════════════════════ 2. credential_items: the staff browse is closed
--
-- Three permissive SELECT policies each lead with `(select is_platform_admin()) or …`. Those arms are
-- removed, and `platform_admin_all` — the permissive blanket — is replaced by three WRITE-ONLY
-- permissive policies, because the three RESTRICTIVE write policies beside it require
-- `is_platform_admin()` and would otherwise leave the table writable by NOBODY. Every predicate
-- below is the live policy's own text with the staff arm taken out; nothing else moves.
do $$
begin
  set local lock_timeout = '20s';

  alter policy credential_items_owner_read on users.credential_items
    using (user_id = (select auth.uid()));

  alter policy credential_items_org_member_read on users.credential_items
    using (
      organization_id is not null
      and organization_id in (select iam.my_orgs())
      and (
        access_mode = 'all_members'
        or public.is_org_admin_for((select auth.uid()), organization_id)
        or exists (select 1 from users.user_secret_grants g
                    where g.credential_item_id = credential_items.id
                      and g.user_id = (select auth.uid()) and g.can_use)
      ));

  alter policy credential_items_personal_grantee_read on users.credential_items
    using (
      user_id is not null
      and exists (select 1 from users.user_secret_grants g
                   where g.credential_item_id = credential_items.id
                     and g.user_id = (select auth.uid()) and g.can_use));

  -- The blanket permissive staff policy goes; the write half it was carrying is re-issued as three
  -- command-scoped policies so the RESTRICTIVE walls beside them still have something to AND with.
  drop policy if exists platform_admin_all on users.credential_items;
  drop policy if exists platform_admin_write_insert on users.credential_items;
  drop policy if exists platform_admin_write_update on users.credential_items;
  drop policy if exists platform_admin_write_delete on users.credential_items;
  create policy platform_admin_write_insert on users.credential_items
    for insert to authenticated with check ((select public.is_platform_admin()));
  create policy platform_admin_write_update on users.credential_items
    for update to authenticated using ((select public.is_platform_admin()))
    with check ((select public.is_platform_admin()));
  create policy platform_admin_write_delete on users.credential_items
    for delete to authenticated using ((select public.is_platform_admin()));
end $$;

-- ═════════════════════════════════════════════ 3. proven live, with V-40's own identities
do $$
declare
  v_padmin  constant uuid := '6555aa73-c647-4ecf-8a96-b60e315b6b18';  -- info@aimatrx.com
  v_owner   constant uuid := '392afd39-d59c-4418-866b-451e9d93fead';  -- owns 11 credential items
  v_orgadm  constant uuid := '34ed4fc3-c527-4819-99bf-15c26603b261';
  v_member  constant uuid := 'f0146c96-e02e-420b-a99f-92774da0566c';
  v_n bigint;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_padmin::text,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from users.credential_items;
  execute 'reset role';
  if v_n <> 0 then
    raise exception 'dd137b11: a platform admin still reads % credential items with no door', v_n;
  end if;

  -- and NOBODY who had their own, or a share, lost it. Over-tightening is as serious a bug as a
  -- stranger let in (db-rules §6), and this is the half a "0 rows for the admin" number hides.
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner::text,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from users.credential_items;
  execute 'reset role';
  if v_n <> 14 then
    raise exception 'dd137b11: the owner reads % credential items, not the 14 they read before', v_n;
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_orgadm::text,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from users.credential_items;
  execute 'reset role';
  if v_n <> 28 then
    raise exception 'dd137b11: the org admin reads % credential items, not the 28 they read before', v_n;
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_member::text,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from users.credential_items;
  execute 'reset role';
  if v_n <> 23 then
    raise exception 'dd137b11: the plain member reads % credential items, not the 23 they read before', v_n;
  end if;

  -- no staff arm survives anywhere on the table
  if exists (select 1 from pg_policy p where p.polrelid='users.credential_items'::regclass
               and p.polcmd in ('r','*') and p.polpermissive
               and coalesce(pg_get_expr(p.polqual,p.polrelid),'') like '%is_platform_admin%') then
    raise exception 'dd137b11: a permissive READ policy on credential_items still carries a staff arm';
  end if;
  if exists (select 1 from pg_policy p where p.polrelid='users.credential_items'::regclass
               and coalesce(pg_get_expr(p.polqual,p.polrelid),'') like '%is_super_admin%') then
    raise exception 'dd137b11: a super-admin arm survives on credential_items';
  end if;

  -- both tables are in the regime now
  if (select count(*) from platform.entity_types
       where token in ('credential_item','user_secret') and data_class='private' and is_active) <> 2 then
    raise exception 'dd137b11: the two vault tables are not registered private';
  end if;

  raise notice 'dd137b11: credential_items — platform admin 123 -> 0, owner 14, org admin 28, member 23 (all unchanged)';
  raise notice 'dd137b11: user_secrets is registered private and its staff read is DELIBERATELY still '
    'open — it is the only client read path (the owner reads 0 of their own 39) and '
    'verify_canonical FAILs it until the vault gets its own door';
end $$;
