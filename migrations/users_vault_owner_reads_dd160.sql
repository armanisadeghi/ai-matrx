-- users_vault_owner_reads_dd160 — THE VAULT OWNER READS THEIR OWN SECRETS, AND THE STAFF WALL
-- BECOMES THE CLASS (DD-160).
--
-- THE DEFECT, measured live 2026-09-12 before this file (B-41b report §FR1.7):
--
--   identity                                users.user_secrets   users.credential_attachments
--   projectmanager@titaniumsuccess.com          0 of their 39          0 of 4
--   a platform admin                          307 of 307              4 of 4
--
-- `users.user_secrets`, `users.credential_attachments` and `rag.library_docs` each carry a
-- RESTRICTIVE `platform_admin_select_only` policy. A restrictive policy ANDs, so for every identity
-- that is not our own staff the whole SELECT resolves false no matter what the permissive owner,
-- grantee and organization policies say. Those permissive policies are dead text today, and the one
-- surviving client read path on a person's password vault is OURS. That is the exact inversion of
-- VISIBILITY-BY-CLASS §3.5 — *"`private` means: no standing read for anyone, our own staff
-- included"* — and it is also a plain product break: the Vault screen reads
-- `users.user_secrets` directly from the browser (`features/secrets/vault-service.ts:587`), gets an
-- empty set with `error === null`, and renders an item with no fields at all.
--
-- THE CHAIR RULING THIS EXECUTES (DD-160). The restrictive wall is replaced by the class: the three
-- SELECT walls are dropped, and on the two `private` vault tables the platform-admin READ lane is
-- closed in the same edit, so nothing is widened for our staff by restoring the owner. The owner
-- widening (0 -> their own rows) is a DELIBERATE widening, approved by name for these tables, and
-- it is measured and annotated against the access-delta gate below rather than bypassing it.
--
-- 🚨 REGISTERED AND REPAIRED, NOT REGENERATED — the same reason DD-137b11 gave, re-measured here.
-- `iam.apply_rls` DROPS every policy before it generates. The vault's sharing model is
-- `users.user_secret_grants` + `access_mode`, not `iam.permissions`; there are 0 rows in
-- `iam.permissions` for token `user_secret`, and `users.user_secrets` has no `visibility` column, so
-- the generated `entity` lane set emits neither the grantee lane nor the organization lane. Running
-- the generator here would hand the owner back their rows and take the organization's shared
-- credentials away from 101 rows' worth of members — over-tightening is as serious a defect as a
-- stranger let in (db-rules §6). What this file does instead is the SAME repair DD-137b11 already
-- shipped on `users.credential_items`, whose policies are the precedent copied below line for line:
-- the staff arm is removed from each permissive READ policy, the permissive blanket
-- `platform_admin_all` is replaced by three command-scoped WRITE policies (the RESTRICTIVE write
-- walls beside them require `is_platform_admin()` and would otherwise leave the table writable by
-- nobody), and the registry is made to SAY what the policies do.
--
-- `rag.library_docs` is the third wall and it is a different table. Its contract: an `organization`
-- -class document entity that already carries the full canonical generated policy set — owner
-- (`created_by`), `visibility = 'public'`, organization members at `visibility >= internal`,
-- organization admins, `global_readable` system orgs, and explicit shares through
-- `iam.has_access('library_doc', …)`; `anon` reads public rows through `pub_read`. All three of its
-- restrictive walls (select, insert, update) are strays from the staff-machinery pattern, and all
-- three are dead text over a generated contract, so all three go. Its class is `organization`, NOT
-- `private`, so derivation two does not apply and its platform-admin lane deliberately stays open —
-- reclassifying somebody else's ratified token is not this lane's to do.
--
-- 🚨 AND THE CIPHERTEXT NEVER MOVES. `value_encrypted` is withheld from `authenticated` at the
-- COLUMN on both vault tables (DD-142 / B-32). That design was UNDECLARED, which means
-- `iam.apply_table_grants` refuses the table outright rather than silently re-granting it — a
-- refusal is a landmine, not a guard, because the next regeneration simply fails. Both tables now
-- DECLARE it in `platform.entity_types.client_excluded_columns`, and this file proves the refusal
-- has become a declared no-op by running the applier and re-measuring every column ACL.

-- ═════════════════════════════════════════ 0. the before picture, on the record, and the gate baseline
do $$
declare
  v_owner  constant uuid := '392afd39-d59c-4418-866b-451e9d93fead';  -- projectmanager@titaniumsuccess.com
  v_padmin constant uuid := '6555aa73-c647-4ecf-8a96-b60e315b6b18';  -- info@aimatrx.com, platform admin
  v_n bigint; v_own bigint; v_before uuid;
  v_principals uuid[] := array[
    '6555aa73-c647-4ecf-8a96-b60e315b6b18',  -- platform admin
    '34ed4fc3-c527-4819-99bf-15c26603b261',  -- organization admin, not a platform admin
    '392afd39-d59c-4418-866b-451e9d93fead',  -- the owner of 39 secret field rows
    'f0146c96-e02e-420b-a99f-92774da0566c',  -- plain member
    '4060701e-706a-4c76-b3ca-0bbc69fa5a14',  -- test@test.com, the non-admin browser identity
    '00000000-0000-0000-0000-000000000000'   -- anonymous, no JWT
  ]::uuid[];
begin
  if not exists (select 1 from pg_policy where polrelid = 'users.user_secrets'::regclass
                   and polname = 'platform_admin_select_only') then
    raise notice 'dd160: already applied — the restrictive SELECT wall is gone from users.user_secrets';
    return;
  end if;

  v_before := iam.access_delta_snapshot('DD-160 BEFORE', v_principals,
    array['user_secret','credential_item','library_doc']::text[], 200000,
    'B-46 / DD-160: the three restrictive SELECT walls', now());
  raise notice 'dd160: before snapshot %', v_before;

  select count(*) into v_own from users.user_secrets where user_id = v_owner;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner::text, 'role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from users.user_secrets;
  execute 'reset role';
  raise notice 'dd160: BEFORE — the owner reads % of their own % secret field rows', v_n, v_own;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_padmin::text, 'role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from users.user_secrets;
  execute 'reset role';
  raise notice 'dd160: BEFORE — a platform admin reads % of 307 secret field rows', v_n;
end $$;

-- ═════════════════════════════════════════ 1. the registry says what the policies do
do $$
declare v_bespoke_note constant text :=
  '🚨 DO NOT RUN iam.apply_rls ON THIS TABLE. Its RLS is BESPOKE BY DESIGN (VISIBILITY-BY-CLASS '
  '§3.7): access_mode is CHECK (access_mode in (''all_members'',''restricted'')) and the sharing '
  'model is users.user_secret_grants, not iam.permissions. apply_rls drops every policy before it '
  'generates, so generating here deletes the organization lane and the grantee lane and replaces '
  'them with a lane set that has neither (DD-160 re-measured this: 0 iam.permissions rows for '
  'token user_secret, and no visibility column, so the generated entity org arms are not emitted).';
begin
  -- user_secret: the staff READ lane is closed by this file, so the registry may finally say so,
  -- and the ciphertext column becomes a DECLARED exclusion instead of an inferred landmine.
  update platform.entity_types
     set suppress_platform_admin_lane = true,
         client_excluded_columns = array['value_encrypted'],
         data_class_reason =
           'VISIBILITY-BY-CLASS §3.1: a person''s stored secrets. No standing read for anyone, our '
           'own staff included — the RESTRICTIVE platform_admin_select_only wall that made the staff '
           'lane the ONLY client read path was dropped in DD-160 and the owner/grantee/organization '
           'lanes it was ANDing to false now stand on their own. ' || v_bespoke_note,
         notes = v_bespoke_note
   where token = 'user_secret';

  -- credential_item: DD-137b11 closed its staff read lane in the policies and left the registry
  -- flag false, so check:staff-door has reported it open ever since. The policies are the truth.
  update platform.entity_types
     set suppress_platform_admin_lane = true
   where token = 'credential_item';

  -- credential_attachment was never registered at all, which is why nothing in the class regime
  -- could see it and why its ciphertext column had nowhere to be declared. It is a COMPONENT of
  -- credential_item: it has no owner column and no visibility of its own, and its live policy
  -- already resolves access by asking the parent (THE COMPONENT OWNERSHIP LAW, db-rules §6d-1).
  -- data_class stays NULL on a component on purpose — iam.class_lanes walks to the parent, which
  -- is `private`.
  if not exists (select 1 from platform.entity_types where token = 'credential_attachment') then
    insert into platform.entity_types (
      token, schema_name, table_name, label, rls_variant, is_active, is_listed, is_component,
      base_tier, is_versioned, has_soft_delete, data_class, default_list_scope,
      client_excluded_columns, suppress_platform_admin_lane, data_class_reason, notes)
    values ('credential_attachment','users','credential_attachments','Credential attachment',
            'component', true, false, true, 1, false, true, null, null,
            array['value_encrypted'], true,
            'A component has no class of its own: its access IS its parent credential_item''s, '
            'which is private (db-rules §6d-1).', v_bespoke_note);
  else
    update platform.entity_types
       set client_excluded_columns = array['value_encrypted'],
           suppress_platform_admin_lane = true
     where token = 'credential_attachment';
  end if;

  if not exists (select 1 from platform.entity_relationships
                  where child_type = 'credential_attachment' and kind = 'composition') then
    insert into platform.entity_relationships (child_type, parent_type, fk_column, kind, note)
    values ('credential_attachment','credential_item','credential_item_id','composition',
            'DD-160: the attachment''s access is the credential item''s. Declared so iam.class_lanes '
            'can resolve the component to its parent''s private class instead of guessing.');
  end if;
end $$;

-- ═════════════════════════════════════════ 2. users.user_secrets — the wall goes, the staff read goes
do $$
begin
  set local lock_timeout = '20s';

  -- 🚨 THE WALL. This one policy is why the owner of a secret reads none of it.
  drop policy if exists platform_admin_select_only on users.user_secrets;

  -- The three permissive lanes, each with its staff arm removed. Every predicate below is the live
  -- policy's own text minus `(select is_platform_admin()) or`; nothing else moves.
  alter policy "Users manage own secrets" on users.user_secrets
    using ((select auth.uid()) = user_id);

  alter policy user_secrets_org_member_read on users.user_secrets
    using (
      organization_id is not null
      and organization_id in (select iam.my_orgs())
      and (
        access_mode = 'all_members'
        or public.is_org_admin_for((select auth.uid()), organization_id)
        or exists (select 1 from users.user_secret_grants g
                    where (g.user_secret_id = user_secrets.id
                           or (g.credential_item_id is not null
                               and g.credential_item_id = user_secrets.credential_item_id))
                      and g.user_id = (select auth.uid()) and g.can_use)
      ));

  alter policy user_secrets_personal_grantee_read on users.user_secrets
    using (
      user_id is not null
      and organization_id is null
      and credential_item_id is not null
      and exists (select 1 from users.user_secret_grants g
                   where g.credential_item_id = user_secrets.credential_item_id
                     and g.user_id = (select auth.uid()) and g.can_use));

  -- The permissive blanket goes; its WRITE half is re-issued command-scoped so the RESTRICTIVE
  -- write walls still have something to AND with. The vault's write path is the server
  -- (service_role bypasses RLS) — that is the existing design and DD-160 does not touch it.
  drop policy if exists platform_admin_all on users.user_secrets;
  drop policy if exists platform_admin_write_insert on users.user_secrets;
  drop policy if exists platform_admin_write_update on users.user_secrets;
  drop policy if exists platform_admin_write_delete on users.user_secrets;
  create policy platform_admin_write_insert on users.user_secrets
    for insert to authenticated with check ((select public.is_platform_admin()));
  create policy platform_admin_write_update on users.user_secrets
    for update to authenticated using ((select public.is_platform_admin()))
    with check ((select public.is_platform_admin()));
  create policy platform_admin_write_delete on users.user_secrets
    for delete to authenticated using ((select public.is_platform_admin()));
end $$;

-- ═════════════════════════════════════════ 3. users.credential_attachments — same repair
do $$
begin
  set local lock_timeout = '20s';

  drop policy if exists platform_admin_select_only on users.credential_attachments;

  -- The parent lane, staff arm removed. The parent subquery runs with the QUERYING role's
  -- privileges, so `users.credential_items`'s own RLS is what decides — which is exactly what a
  -- component's access is supposed to be.
  alter policy credential_attachments_parent_read on users.credential_attachments
    using (
      deleted_at is null
      and coalesce((select (auth.jwt() ->> 'is_anonymous')), 'false') <> 'true'
      and exists (select 1 from users.credential_items item
                   where item.id = credential_attachments.credential_item_id
                     and item.deleted_at is null));

  drop policy if exists platform_admin_all on users.credential_attachments;
  drop policy if exists platform_admin_write_insert on users.credential_attachments;
  drop policy if exists platform_admin_write_update on users.credential_attachments;
  drop policy if exists platform_admin_write_delete on users.credential_attachments;
  create policy platform_admin_write_insert on users.credential_attachments
    for insert to authenticated with check ((select public.is_platform_admin()));
  create policy platform_admin_write_update on users.credential_attachments
    for update to authenticated using ((select public.is_platform_admin()))
    with check ((select public.is_platform_admin()));
  create policy platform_admin_write_delete on users.credential_attachments
    for delete to authenticated using ((select public.is_platform_admin()));
end $$;

-- ═════════════════════════════════════════ 4. rag.library_docs — three dead walls over a live contract
do $$
begin
  set local lock_timeout = '20s';
  drop policy if exists platform_admin_select_only on rag.library_docs;
  drop policy if exists platform_admin_insert_only on rag.library_docs;
  drop policy if exists platform_admin_update_only on rag.library_docs;
end $$;

-- ═════════════════════════════════════════ 5. the ciphertext exclusion is now DECLARED, and the
-- applier's refusal is a declared no-op. Running the applier is the proof: before DD-160 this call
-- RAISED (`runs an UNDECLARED column-level grant design … refusing`), and the column ACLs it
-- produces now are asserted identical to the ones that were there before it ran.
do $$
declare
  v_before jsonb; v_after jsonb;
begin
  select jsonb_object_agg(t || '.' || a,
           has_column_privilege('authenticated', t::regclass, a, 'SELECT'))
    into v_before
  from (select c.relnamespace::regnamespace::text || '.' || c.relname as t, att.attname as a
          from pg_class c join pg_attribute att on att.attrelid = c.oid
         where c.oid in ('users.user_secrets'::regclass, 'users.credential_attachments'::regclass)
           and att.attnum > 0 and not att.attisdropped) s;

  perform iam.apply_table_grants('users','user_secrets','entity');
  perform iam.apply_table_grants('users','credential_attachments','component');

  select jsonb_object_agg(t || '.' || a,
           has_column_privilege('authenticated', t::regclass, a, 'SELECT'))
    into v_after
  from (select c.relnamespace::regnamespace::text || '.' || c.relname as t, att.attname as a
          from pg_class c join pg_attribute att on att.attrelid = c.oid
         where c.oid in ('users.user_secrets'::regclass, 'users.credential_attachments'::regclass)
           and att.attnum > 0 and not att.attisdropped) s;

  if v_before is distinct from v_after then
    raise exception 'dd160: re-running the grant applier CHANGED a column privilege. before=% after=%',
      v_before, v_after;
  end if;
  raise notice 'dd160: the grant applier ran clean over both vault tables and every column ACL is byte-identical';
end $$;

-- ═════════════════════════════════════════ 6. what must be true the moment this commits
do $$
declare
  v_owner   constant uuid := '392afd39-d59c-4418-866b-451e9d93fead';  -- owns 39 secret field rows
  v_padmin  constant uuid := '6555aa73-c647-4ecf-8a96-b60e315b6b18';  -- info@aimatrx.com
  v_orgadm  constant uuid := '34ed4fc3-c527-4819-99bf-15c26603b261';
  v_member  constant uuid := 'f0146c96-e02e-420b-a99f-92774da0566c';
  v_n bigint; v_own bigint; v_lib bigint;
begin
  -- 6a. THE HEADLINE. The owner reads their own secret field rows, all of them.
  select count(*) into v_own from users.user_secrets where user_id = v_owner;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner::text, 'role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from users.user_secrets;
  execute 'reset role';
  if v_n < v_own then
    raise exception 'dd160: the owner reads % of their own % secret field rows — the wall is still up', v_n, v_own;
  end if;
  raise notice 'dd160: the owner reads % secret field rows (they own %)', v_n, v_own;

  -- 6b. and our own staff have no standing read of anybody's vault.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_padmin::text, 'role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from users.user_secrets;
  execute 'reset role';
  if v_n <> 0 then
    raise exception 'dd160: a platform admin still reads % secret field rows with no door', v_n;
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_padmin::text, 'role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from users.credential_attachments;
  execute 'reset role';
  if v_n <> 0 then
    raise exception 'dd160: a platform admin still reads % credential attachments with no door', v_n;
  end if;

  -- 6c. no staff arm survives anywhere on either vault table
  if exists (select 1 from pg_policy p
              where p.polrelid in ('users.user_secrets'::regclass,
                                   'users.credential_attachments'::regclass)
                and p.polcmd in ('r','*') and p.polpermissive
                and coalesce(pg_get_expr(p.polqual, p.polrelid),'') ~ 'is_platform_admin|is_super_admin') then
    raise exception 'dd160: a permissive READ policy on a vault table still carries a staff arm';
  end if;

  -- 6d. and no RESTRICTIVE SELECT wall survives on any of the three
  if exists (select 1 from pg_policy p
              where p.polrelid in ('users.user_secrets'::regclass,
                                   'users.credential_attachments'::regclass,
                                   'rag.library_docs'::regclass)
                and not p.polpermissive and p.polcmd in ('r','*')) then
    raise exception 'dd160: a restrictive SELECT wall survives on one of the three tables';
  end if;

  -- 6e. THE CIPHERTEXT IS STILL NOT SERVED. This is the assertion that makes the widening safe.
  if has_column_privilege('authenticated','users.user_secrets','value_encrypted','SELECT')
     or has_column_privilege('authenticated','users.credential_attachments','value_encrypted','SELECT') then
    raise exception 'dd160: value_encrypted became readable by authenticated — the widening reopened the ciphertext';
  end if;
  if not has_column_privilege('authenticated','users.user_secrets','value_hint','SELECT') then
    raise exception 'dd160: a NEIGHBOUR column stopped being readable — the exclusion over-reached';
  end if;

  -- 6f. rag.library_docs: the owner of a document reads it again.
  select count(*) into v_lib from rag.library_docs where created_by = v_orgadm;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_orgadm::text, 'role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from rag.library_docs;
  execute 'reset role';
  if v_lib > 0 and v_n < v_lib then
    raise exception 'dd160: a library_docs owner reads % of their own % — the wall is still up', v_n, v_lib;
  end if;
  raise notice 'dd160: library_docs — an organization admin reads % rows (owns %)', v_n, v_lib;

  -- 6g. and a plain member did not gain a standing read of the vault
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_member::text, 'role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from users.user_secrets;
  execute 'reset role';
  raise notice 'dd160: a plain member reads % secret field rows (organization-shared credentials only)', v_n;

  -- 6h. the registry and the policies say the same thing
  if (select count(*) from platform.entity_types
       where token in ('user_secret','credential_item','credential_attachment')
         and suppress_platform_admin_lane and is_active) <> 3 then
    raise exception 'dd160: the three vault tokens do not all declare the staff lane closed';
  end if;
  if (select client_excluded_columns from platform.entity_types where token='user_secret')
       is distinct from array['value_encrypted']
     or (select client_excluded_columns from platform.entity_types where token='credential_attachment')
       is distinct from array['value_encrypted'] then
    raise exception 'dd160: the ciphertext exclusion is not declared on both vault tables';
  end if;

  raise notice 'dd160: all assertions passed';
end $$;

-- ═════════════════════════════════════════ 6i. CONTAINMENT, measured per identity.
-- Every secret field row an identity can read belongs to a credential item that same identity can
-- read. This is what makes "a member reads 94 rows" a lane rather than a leak: they already read
-- those 23 credential items (DD-137b11 measured it), and these are those items' own fields.
do $$
declare r record; v_orphan bigint; v_seen bigint;
begin
  for r in select * from (values
      ('projectmanager@titaniumsuccess.com','392afd39-d59c-4418-866b-451e9d93fead'::uuid),
      ('arman@titaniumsuccess.com (org admin)','34ed4fc3-c527-4819-99bf-15c26603b261'::uuid),
      ('kelvin (plain member)','f0146c96-e02e-420b-a99f-92774da0566c'::uuid),
      ('test@test.com','4060701e-706a-4c76-b3ca-0bbc69fa5a14'::uuid)) t(label, uid)
  loop
    perform set_config('request.jwt.claims',
      json_build_object('sub', r.uid::text, 'role','authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into v_seen from users.user_secrets;
    select count(*) into v_orphan from users.user_secrets s
     where s.credential_item_id is not null
       and not exists (select 1 from users.credential_items ci where ci.id = s.credential_item_id);
    execute 'reset role';
    if v_orphan > 0 then
      raise exception 'dd160: % reads % secret field rows whose credential item they CANNOT read — '
        'the fields escaped their item', r.label, v_orphan;
    end if;
    raise notice 'dd160: % reads % secret field rows, every one of them a field of an item they can read',
      r.label, v_seen;
  end loop;
end $$;

-- ═════════════════════════════════════════ 7. THE ACCESS-DELTA GATE, ANNOTATED — NOT BYPASSED
--
-- This change WIDENS on purpose, so `iam.access_delta_assert_no_widening` refuses it, correctly.
-- The refusal is not waived: the widening is measured pair by pair and asserted to be EXACTLY the
-- two tokens the chair approved by name (DD-160). A widening on any THIRD token — or a narrowing
-- for anybody who is not our own staff — still fails this file.
do $$
declare
  v_before uuid; v_as timestamptz; v_after uuid; r record;
  v_wider int := 0; v_unapproved int := 0; v_bad_narrow int := 0;
  v_principals uuid[] := array[
    '6555aa73-c647-4ecf-8a96-b60e315b6b18','34ed4fc3-c527-4819-99bf-15c26603b261',
    '392afd39-d59c-4418-866b-451e9d93fead','f0146c96-e02e-420b-a99f-92774da0566c',
    '4060701e-706a-4c76-b3ca-0bbc69fa5a14','00000000-0000-0000-0000-000000000000']::uuid[];
  -- Approved by name, with the reason each one exists:
  --   user_secret — the owner of a secret reads their own secret again, and the organization and
  --                 grantee lanes the RESTRICTIVE wall had been ANDing to false stand up again.
  --                 They are not new lanes: they are the vault's own design, dead since the wall.
  --   library_doc — six published reference documents (ACOEM / NIST / CISA), all
  --                 visibility='public' in the global_readable "Matrx System" organization, which
  --                 no signed-in person could read at all while the wall stood.
  v_approved text[] := array['user_secret','library_doc'];
begin
  select id, started_at into v_before, v_as from iam.access_delta_run
   where label = 'DD-160 BEFORE' order by started_at desc limit 1;
  if v_before is null then
    raise notice 'dd160: no DD-160 BEFORE snapshot (file already applied) — gate section skipped';
    return;
  end if;

  v_after := iam.access_delta_snapshot('DD-160 AFTER', v_principals,
    array['user_secret','credential_item','library_doc']::text[], 200000,
    'B-46 / DD-160 confirmation, pinned to the BEFORE instant', v_as);

  for r in select token, principal_label, count_before, count_after, verdict
             from iam.access_delta_compare(v_before, v_after)
            where verdict <> 'SAME' order by 1,2
  loop
    if r.verdict = 'WIDER' then
      v_wider := v_wider + 1;
      if not (r.token = any(v_approved)) then
        v_unapproved := v_unapproved + 1;
        raise warning 'dd160: UNAPPROVED WIDENING % for % : % -> %',
          r.token, r.principal_label, r.count_before, r.count_after;
      else
        raise notice 'dd160: APPROVED WIDENING % for % : % -> %',
          r.token, r.principal_label, r.count_before, r.count_after;
      end if;
    elsif r.verdict = 'NARROWER' then
      -- The only narrowing this file may cause is our own staff losing a standing read.
      if r.principal_label <> 'info@aimatrx.com' then
        v_bad_narrow := v_bad_narrow + 1;
        raise warning 'dd160: OVER-TIGHTENING % for % : % -> %',
          r.token, r.principal_label, r.count_before, r.count_after;
      else
        raise notice 'dd160: the staff lane closed — % for % : % -> %',
          r.token, r.principal_label, r.count_before, r.count_after;
      end if;
    end if;
  end loop;

  if v_unapproved > 0 then
    raise exception 'dd160: % widening(s) on tokens nobody approved — the gate stands', v_unapproved;
  end if;
  if v_bad_narrow > 0 then
    raise exception 'dd160: % identity/token pair(s) LOST access — over-tightening is as serious a '
      'defect as a stranger let in (db-rules §6)', v_bad_narrow;
  end if;
  raise notice 'dd160: access-delta gate ANNOTATED GREEN — % approved widenings on % token(s), '
    '0 unapproved, 0 over-tightening', v_wider, cardinality(v_approved);
end $$;
