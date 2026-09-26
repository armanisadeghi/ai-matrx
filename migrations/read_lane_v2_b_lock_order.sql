-- draft: deep-lane read-lane-v2 lock order — chair runs it at the start of the 2026-09-27 window, before the first table
-- chair-step: replaces iam._apply_rls_unchecked so an enrolled (read-lane v2) regeneration locks every relation its policies read BEFORE the first policy statement; adds iam.read_lane_v2_lock_policy_reads. No policy statement, no freeze. Self-test: aidream scripts/read_lane_v2/lock_order_selftest.py (clone, RED on the old body, GREEN on this one).
-- based-on: iam._apply_rls_unchecked(text, text, text, text) a6bc3fd5b22b57b12d24290100c1d4de78dac61e5b4c4a20f26f05d00c3df5c7
-- read_lane_v2_b_lock_order — design: common-docs/projects/rich-content-unification/evidence/generator-perf-design.md; queue: read-lane-v2-queue.md
-- READ-LANE V2 LOCK ORDER (chair-approved 2026-09-26). On 2026-09-26 02:56 PT two regenerations of
-- agent.message_template_detail each held the auth/storage/realtime freeze ~1.9 s while a CREATE POLICY
-- waited for a lock on a relation its expression reads, then rolled back. Every relation the regenerated
-- policies can read is locked ACCESS SHARE (the mode CREATE POLICY itself takes on them) under the
-- caller's lock_timeout BEFORE the governance-guard trigger DDL (which is what first takes the auth/storage/
-- realtime lock — measured on the clone) and the policy statements, so any wait happens outside the freeze.
-- The set: the relations the table's CURRENT policies depend on (pg_depend), the P1 parents, and the
-- fixed relations the generated arms read. LOCK on a view recurses to its base tables.
create or replace function iam.read_lane_v2_lock_policy_reads(p_schema text, p_table text, p_token text)
returns void language plpgsql set search_path to 'pg_catalog' as $$
declare
  v_rel regclass := to_regclass(format('%I.%I', p_schema, p_table));
  r record;
begin
  perform iam.read_lane_v2_lock_parents(p_token);
  for r in
    select distinct d.refobjid::regclass as rel
      from pg_depend d join pg_policy po on po.oid = d.objid
     where d.classid = 'pg_policy'::regclass and d.refclassid = 'pg_class'::regclass
       and po.polrelid = v_rel and d.refobjid <> v_rel
    union
    select x::regclass from unnest(array['iam.memberships','iam.permissions','iam.system_orgs',
             'iam.organization_member','platform.reachability','platform.associations',
             'platform.associations_live','platform.entity_grants']) x
     where to_regclass(x) is not null
    order by 1
  loop
    execute format('lock table %s in access share mode', r.rel);
  end loop;
end $$;
revoke all on function iam.read_lane_v2_lock_policy_reads(text,text,text) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION iam._apply_rls_unchecked(p_schema text, p_table text, p_token text, p_variant text DEFAULT 'entity'::text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$

declare
  -- ── POLICY-LOCK (2026-09-22) — THE FREEZE IS AS LONG AS THE TRANSACTION ──────────────
  -- Supabase's own `supautils` extension carries a `policy_grants` hook keyed on the ROLE and
  -- the COMMAND: every CREATE/ALTER/DROP POLICY run as `postgres` takes ACCESS EXCLUSIVE on the
  -- 23 `auth.*` / `storage.*` / `realtime.*` relations named in `supautils.policy_grants`, and
  -- PostgreSQL holds them until COMMIT. While they are held NOBODY can sign in, refresh a token,
  -- read a file or receive a realtime message. The setting is `sighup`, read from Supabase's
  -- configuration file, and cannot be changed by us (lane POLICY-LOCK bisected it on the dev
  -- clone; `SET`, `SET LOCAL` and `ALTER ROLE … SET` are all refused).
  --
  -- So the ONE lever we own is DURATION, and it was being thrown away: this function issued its
  -- first `drop policy` early and then did everything else — the policy creates, the 24 KB
  -- `iam.apply_table_grants`, the governance guard — inside the freeze it had opened. Measured on
  -- the clone 2026-09-22: `iam.apply_rls('iam','api_keys','iam_api_key')` = 4 481 ms total, of
  -- which `iam.apply_table_grants` alone is 4 222 ms. 970 tables on this database carry generated
  -- policies.
  --
  -- THE SHAPE, and it is a rule, not a tidy-up: compute everything first in plain reads, do every
  -- non-policy side effect (RLS on, anon grant/revoke, table grants, governance guard), and issue
  -- the drop/create POLICY statements LAST, back to back, with nothing between them. Nothing may
  -- be inserted between `iam._rls_emit_policies` and COMMIT.
  v_pol text[] := '{}'::text[];   -- the create-policy statements, built but NOT executed
  v_drop text[] := '{}'::text[];  -- the drop-policy statements, built but NOT executed
  v_tbl text := format('%I.%I', p_schema, p_table);
  v_is_component boolean;
  v_has_user boolean;
  v_has_created boolean;
  v_owner_disagree bigint;  -- PERSONAL-OWNER (2026-09-25): rows where a lingering user_id names another owner
  v_has_org boolean;
  v_has_del boolean;
  v_has_vis boolean;
  v_delpfx text := '';
  v_parent_expr_edit text := '';
  v_parent_expr_view text := '';
  v_parent_count integer := 0;
  -- THE ADMIN LANE. Leading arm of every generated policy; see the migration
  -- header for the 22s -> 40ms measurement that dictates the position.
  v_admin text := '(select public.is_platform_admin()) or ';
  -- THE PRIVACY WALL (HR D14.1 / D19, SPEC-ACCESS §3.5). When a token declares
  -- suppress_platform_admin_lane, AI Matrx staff get NO read arm on it: the
  -- v_admin prefix is emptied, the platform_admin_all policy is not created,
  -- and the is_super_admin() arms are removed from the restricted lane and from
  -- the entity system-org INSERT lane. Every other token is untouched — the
  -- column defaults false and these three strings keep their exact current text,
  -- so the emitted policy bytes for an unflagged token do not move.
  v_suppress_admin boolean := false;
  -- THE PUBLIC-PARENT ANON LANE (0580). Opt-in per token via
  -- platform.entity_types.component_anon_read_via_public_parent: a component
  -- has no visibility of its own — its access IS the parent's, INCLUDING the
  -- parent's public-ness. The authenticated composition arm already walks
  -- accessible_entity_ids(..., include_public => true), so without this lane
  -- the anon role saw strictly less than any signed-up stranger.
  v_required_anon_status text;
  v_anon_component boolean := false;
  v_anon_expr text := '';
  v_pdel boolean;
  v_excluded text[];
  v_su_sel text := ' or public.is_super_admin()';
  v_su_ins text := 'public.is_super_admin() or ';
  v_sysorg_ins text := ' or (organization_id in (select organization_id from iam.system_orgs where global_readable) and public.is_super_admin())';
  -- 🚨 DD-165 (2026-09-12) — A PERSONAL ROW STAYS PERSONAL INSIDE AN ORGANIZATION TABLE.
  -- The CLASS sets the DEFAULT lane set; a row's `visibility` only ever NARROWS it. So on a
  -- classed table that carries a real `platform.visibility` column, the platform-staff arms are
  -- emitted in their WALLED form: they admit a row only when `visibility >= 'internal'`, i.e.
  -- never a row the person marked `personal`. The owner arm, the sharing/grant lanes and
  -- `iam.has_access` are untouched, so the owner and everyone they shared with keep reading.
  -- These two strings are the READ (USING) forms; `v_admin`/`v_su_sel` keep their exact previous
  -- text and are still used in every WITH CHECK, because DD-165 is a rule about who may READ a
  -- person's private row, not about what an admin may write.
  v_vis_enum boolean := false;
  v_admin_read text;
  v_su_sel_read text;
  rec record;
  pol record;
  -- DD-147: the catalog of names THIS function authors, and the bespoke names it kept.
  v_authored text[];
  v_kept text[];
  v_client_read_only boolean := false;
  v_registry_rows integer;
  v_registry_token text;
  v_registry_variant text;
  -- DD-174: the ledger variant's lanes are read off the CLASS, not hardcoded.
  v_ledger_lanes platform.lane_set;
  v_sysorg_read text;
  -- DD-249: the anon lane is the CLASS's to grant, and this is where it is asked.
  v_pub_lanes platform.lane_set;
  -- DOORS-ONLY-4 (2026-09-21) -- A DOORS-ONLY SCHEMA'S WRITE LANES ARE THE GENERATOR'S,
  -- NOT SEVENTY-FIVE HAND-WRITTEN DROP-POLICY FILES.
  -- `platform` and `iam` are not client-writable schemas (chair ruling; VERIFIER-8 HIGH-3):
  -- every write goes through a named SECURITY DEFINER door, reads stay exactly as they are.
  -- The 255 residual triples DOORS-ONLY-3 left are all PERMISSIVE WRITE POLICIES with no
  -- grant behind them any more -- std_insert/std_update/std_delete and platform_admin_all --
  -- and every one of those names is emitted BELOW. Removing them by hand lasts until the
  -- next iam.apply_rls, which platform.provision calls, so one new table spec would put
  -- them all back on tables the guard had already recorded clean.
  -- Fix the class: the generator stops emitting them for a schema DECLARED doors-only in
  -- platform.schema_client_exposure.client_writes_doors_only, and emits the FOR SELECT twin
  -- platform_admin_select wherever it would have emitted platform_admin_all, so platform
  -- staff keep the identical read and lose only the write half of that FOR ALL policy.
  v_doors_only boolean := false;
  -- The registry flag and the schema declaration answer the same question -- may a CLIENT
  -- write this base table -- so the emit sites ask this one. The registry flag keeps its own
  -- strict refusals (duplicate rows, variant mismatch) below: those are about a MARKED
  -- relation's declaration being coherent, and a schema-wide rule must not start raising on
  -- a hundred tables that never declared anything.
  v_no_client_writes boolean := false;
  -- RC-A2c: the reference gate this token declares (platform.reference_gate), if any.
  v_ref_type_col text; v_ref_id_col text;
  -- READ-LANE V2 (P7): the token is enrolled in iam.read_lane_v2_rollout.
  v_v2 boolean := false;
begin
  select coalesce(is_component, false), coalesce(suppress_platform_admin_lane, false),
         coalesce(component_anon_read_via_public_parent, false), client_excluded_columns
    into v_is_component, v_suppress_admin, v_anon_component, v_excluded
  from platform.entity_types where token = p_token;

  -- D347: publication is an additional anonymous-only restriction, never an access grant.
  v_v2 := iam.read_lane_v2_enrolled(p_token);

  select anonymous_read_status into v_required_anon_status
    from platform.entity_types where token = p_token;
  if v_required_anon_status is not null then
    if p_variant not in ('entity','system','restricted') or not exists (
      select 1 from pg_attribute where attrelid=to_regclass(v_tbl)
        and attname='status' and atttypid='text'::regtype and not attisdropped
    ) then
      raise exception 'apply_rls: anonymous_read_status requires an entity/system/restricted table with a text status column: %', v_tbl;
    end if;
    v_pol := array_append(v_pol, format(
      'create policy anon_status_gate on %s as restrictive for select to anon using (status = %L::text)',
      v_tbl, v_required_anon_status));
  end if;

  -- 🚨 RC-A2c (2026-09-25): a token that names the record it points at (platform.reference_gate)
  -- gets ONE restrictive policy for every command: a row whose target is set is visible to, and
  -- writable by, only someone who can view the target. Platform admins are exempt inside it, so
  -- platform_admin_read keeps reading every row (common-docs/policies/our-own-admin-database-access.md).
  select g.type_column, g.id_column into v_ref_type_col, v_ref_id_col
    from platform.reference_gate(p_token) g limit 1;
  if v_ref_id_col is not null then
    v_pol := array_append(v_pol, format(
      'create policy ref_target_gate on %1$s as restrictive for all to authenticated '
      'using ((select public.is_platform_admin()) or %2$I is null or %3$I is null '
      'or iam.has_access(%2$I, %3$I, ''viewer''::public.permission_level)) '
      'with check ((select public.is_platform_admin()) or %2$I is null or %3$I is null '
      'or iam.has_access(%2$I, %3$I, ''viewer''::public.permission_level))',
      v_tbl, v_ref_type_col, v_ref_id_col));
  end if;

  select count(*), coalesce(bool_or(client_read_only), false), max(token), max(rls_variant)
    into v_registry_rows, v_client_read_only, v_registry_token, v_registry_variant
  from platform.entity_types where schema_name=p_schema and table_name=p_table;
  if v_client_read_only and v_registry_rows > 1 then raise exception 'apply_rls: duplicate registry rows for marked %.%',p_schema,p_table using errcode='42501'; end if;
  if v_client_read_only then
    if v_registry_token is distinct from p_token then
      raise exception 'apply_rls: readonly registry token mismatch for %.% token %',p_schema,p_table,p_token using errcode='42501';
    end if;
    if v_registry_variant is null or v_registry_variant not in ('entity','system','restricted','personal','component','ledger','reference','detail') then
      raise exception 'apply_rls: readonly registry variant is missing or unknown for %.%',p_schema,p_table using errcode='42501';
    end if;
    if p_variant is distinct from v_registry_variant then
      raise exception 'apply_rls: readonly registry variant mismatch for %.% (supplied %, registered %)',p_schema,p_table,p_variant,v_registry_variant using errcode='42501';
    end if;
  end if;

  -- DOORS-ONLY-4. Read once, used at every emit site below.
  v_doors_only := platform.schema_is_doors_only(p_schema);
  -- 🚨 A TABLE WHOSE DOORS ARE NOT BUILT YET KEEPS ITS CLIENT WRITE LANES, AND SAYS SO.
  -- Declaring a schema doors-only closes every table in it at once, which on 2026-09-21
  -- closed platform.saved_view and platform.rulebook -- twenty-one write call sites across
  -- two repos, none of them moved to a door -- and saving a view answered 42501 for eleven
  -- minutes. A row in platform.doors_only_pending_cutover carries the reason and the owning
  -- lane; it can only KEEP what this table already generated, never open a closed one.
  if v_doors_only and platform.doors_only_cutover_pending(p_schema, p_table) then
    v_doors_only := false;
    raise notice
      'apply_rls: %.% is in a DOORS-ONLY schema but its doors are NOT BUILT YET, so its client write lanes were generated as before. Reason on file: %. Owner: %. The remedy is to build the door and move every caller in the same commit, then delete the platform.doors_only_pending_cutover row -- re-granting by hand would last until the next regeneration.',
      p_schema, p_table,
      (select d.reason from platform.doors_only_pending_cutover d where d.schema_name = p_schema and d.table_name = p_table),
      (select d.owner_lane from platform.doors_only_pending_cutover d where d.schema_name = p_schema and d.table_name = p_table);
  end if;
  v_no_client_writes := v_client_read_only or v_doors_only;

  if v_suppress_admin then
    v_admin := '';
    v_su_sel := '';
    v_su_ins := '';
    v_sysorg_ins := '';
  end if;

  select exists (select 1 from information_schema.columns
    where table_schema=p_schema and table_name=p_table and column_name='user_id') into v_has_user;
  select exists (select 1 from information_schema.columns
    where table_schema=p_schema and table_name=p_table and column_name='created_by') into v_has_created;
  select exists (select 1 from information_schema.columns
    where table_schema=p_schema and table_name=p_table and column_name='organization_id') into v_has_org;
  select exists (select 1 from information_schema.columns
    where table_schema=p_schema and table_name=p_table and column_name='deleted_at') into v_has_del;
  select exists (select 1 from information_schema.columns
    where table_schema=p_schema and table_name=p_table and column_name='visibility') into v_has_vis;
  v_delpfx := case when v_has_del then 'deleted_at is null and ' else '' end;

  -- DD-165. The wall is keyed on the TYPED column only. A free-text `visibility` would make
  -- `visibility >= 'internal'` a TEXT comparison, and 'personal' > 'internal' alphabetically —
  -- the wall would silently admit exactly the rows it exists to exclude. iam.verify_canonical
  -- already FAILs a free-text visibility ('free-text kill'); this refuses to build a wall on one.
  -- `visibility` is NOT NULL on every table in the live cast but the predicate is written so an
  -- unset value denies rather than admits: `NULL >= 'internal'` is NULL, and a USING clause
  -- treats NULL as deny. Undeclared is the private end, the same direction chair R3 takes.
  select exists (select 1 from information_schema.columns
    where table_schema=p_schema and table_name=p_table and column_name='visibility'
      and udt_schema='platform' and udt_name='visibility') into v_vis_enum;
  v_admin_read := v_admin;
  v_su_sel_read := v_su_sel;
  if v_vis_enum then
    if v_admin <> '' then
      v_admin_read := '((visibility >= ''internal''::platform.visibility) and (select public.is_platform_admin())) or ';
    end if;
    if v_su_sel <> '' then
      v_su_sel_read := ' or (visibility >= ''internal''::platform.visibility and public.is_super_admin())';
    end if;
  end if;

  execute format('alter table %s enable row level security', v_tbl);
  -- 🚨 DD-147 (2026-09-12) — THIS GENERATOR DROPS ONLY WHAT IT AUTHORED.
  -- The loop that used to live here read `for pol in select polname from pg_policy where polrelid
  -- = v_tbl::regclass loop drop policy ...` — EVERY policy, with no idea which of them it had
  -- written. In the B-30 rehearsal that removed the signed-out invitation-request lanes on
  -- `iam.invitations` / `iam.access_requests`, and two migrations restored them by hand. A
  -- generator that deletes work it did not do is not a generator, it is a hazard sitting behind
  -- an `apply` verb.
  -- `iam.generated_policy_names()` is the catalog of the names emitted below, and nothing else is
  -- touched. A bespoke policy is KEPT and NAMED out loud — never dropped, never silent. To remove
  -- one, say so on purpose: `iam.supersede_bespoke_policies(schema, table, names, reason)`.
  v_authored := iam.generated_policy_names();
  v_kept := '{}'::text[];
  for pol in select polname from pg_policy where polrelid = v_tbl::regclass order by polname loop
    if pol.polname = any (v_authored) then
      v_drop := v_drop || format('drop policy %I on %s', pol.polname, v_tbl);
    else
      v_kept := array_append(v_kept, pol.polname);
    end if;
  end loop;
  -- ADMIN-ACCESS (Arman 2026-09-24; access-belongs-to-the-person.md §7 item 3): the platform-admin
  -- READ lane is part of what this generator produces for EVERY table, every variant, and it
  -- ignores suppress_platform_admin_lane on purpose — that flag keeps governing the staff WRITE
  -- lanes, the std_* staff arm and the super-admin arms, never this read. It is in
  -- iam.generated_policy_names(), so the loop above dropped any previous copy.
  v_pol := v_pol || format(
    'create policy platform_admin_read on %s for select to authenticated using ((select public.is_platform_admin()))',
    v_tbl);
  -- The do-not-remove comment travels with the policy (common-docs/policies/our-own-admin-database-access.md).
  v_pol := v_pol || format('comment on policy platform_admin_read on %s is %L', v_tbl,
    'OUR OWN ADMIN DATABASE ACCESS - NEVER REMOVE, NARROW OR SUPERSEDE. This is how Arman and platform admins read every row through the admin system (aidream dashboard, admin.app.matrxserver.com, the Supabase-style table browser). Law: common-docs/policies/our-own-admin-database-access.md (Arman, 2026-09-24).');
  if cardinality(v_kept) > 0 then
    raise notice
      'apply_rls: %.% (token %) — % BESPOKE POLICY/POLICIES KEPT because this generator did not author them: %. They are live doors beside the generated set, and iam.verify_canonical reports them as bespoke_policy_present on every run. To remove one, name it: iam.supersede_bespoke_policies(''%'', ''%'', ARRAY[...], <reason>).',
      p_schema, p_table, p_token, cardinality(v_kept), array_to_string(v_kept, ', '), p_schema, p_table;
  end if;
  -- Marked relations preserve bespoke reads, but no bespoke write policy may apply to a client role.
  if v_client_read_only and exists (
    select 1
    from pg_policy p cross join lateral unnest(p.polroles) as role_oid
    where p.polrelid=v_tbl::regclass
      and p.polname = any(v_kept)
      and p.polcmd in ('*','a','w','d')
      and (role_oid=0 or pg_has_role('anon', role_oid, 'USAGE') or pg_has_role('authenticated', role_oid, 'USAGE'))
  ) then
    raise exception 'apply_rls: readonly %.% has an applicable bespoke mutation policy',p_schema,p_table using errcode='42501';
  end if;
  v_pol := v_pol || format(
    'create policy svc_all on %s for all to service_role using (true) with check (true)', v_tbl);
  -- Server-only restricted records stop before every client/staff policy.
  if p_variant = 'restricted' and not v_has_vis then
    perform iam._rls_plan_is(v_tbl, v_pol, v_kept);  -- POLICY-LOCK: the grants rail asks the caller what the policy set is ABOUT to be
    perform iam.apply_table_grants(p_schema, p_table, p_variant);
    perform iam.drop_governance_guard(p_schema, p_table);
    perform iam._rls_emit_policies(v_drop, v_pol);  -- POLICY-LOCK: the freeze starts here and ends at COMMIT
    return;
  end if;

  -- ======================= PERSONAL =======================
  -- A personal row's OWNER is the complete access boundary, and the owner column is created_by.
  -- 🚨 PERSONAL-OWNER (2026-09-25, Arman 2026-09-23: "user_id was retired in favour of
  -- created_by"). This branch used to key every policy on user_id and refuse a table without one,
  -- while the kernel (platform.entity_row_access_attrs) and the set lane (iam.accessible_entity_ids)
  -- read the owner from created_by — so on every personal table the RLS lane said yes and
  -- iam.has_access said no (admin@admin.com on its own 19 tool.mcp_user_conn rows), and the one
  -- sanctioned builder, platform.create_entity_table(p_variant => 'personal'), which only emits
  -- created_by, could not build a personal table at all. The TABLE is brought to the canonical
  -- shape (created_by) through the Entities system; the machinery is never adapted to a table.
  -- Referenced organizations and platform-admin status do not widen it.
  -- Guard: aidream tests/test_personal_variant_owner_is_created_by.py.
  if p_variant = 'personal' then
    if not v_has_created then
      raise exception using errcode = '42703',
        message = format('apply_rls: personal variant on %s.%s requires created_by, the owner column. user_id was retired in favour of created_by (2026-09-23): bring the table to the canonical shape through the Entities system (add created_by, backfill it from the owner, repoint every reader and writer), never by keying the generator on a legacy column.', p_schema, p_table);
    end if;
    if v_has_user then
      -- A table part-way through that move still carries user_id. Generating on created_by is only
      -- behaviour-preserving when the two name the SAME owner on every row; if they disagree
      -- anywhere, regenerating would silently move those rows' access boundary.
      execute format('select count(*) from %I.%I where created_by is distinct from user_id', p_schema, p_table)
        into v_owner_disagree;
      if v_owner_disagree > 0 then
        raise exception using errcode = '22023',
          message = format('apply_rls: %s.%s carries both user_id and created_by, and they disagree on %s row(s). Generating the personal policies on created_by would silently move the access boundary of those rows. Decide which column names the owner (for some tables user_id is the grantee, the billed person or the audited subject, not the creator), reconcile the rows, drop user_id, then re-run. Nothing was generated.', p_schema, p_table, v_owner_disagree);
      end if;
      raise notice 'apply_rls: %.% still carries the retired owner column user_id (it agrees with created_by on every row); the policies key on created_by — drop user_id once its readers are repointed.', p_schema, p_table;
    end if;
    v_pol := v_pol || format(
      'create policy std_select on %s for select to authenticated using (%screated_by = (select auth.uid()))',
      v_tbl, v_delpfx);
    if not v_no_client_writes then
    v_pol := v_pol || format(
      'create policy std_insert on %s for insert to authenticated with check (created_by = (select auth.uid()))',
      v_tbl);
    end if;
    if not v_no_client_writes then
    v_pol := v_pol || format(
      'create policy std_update on %s for update to authenticated using (created_by = (select auth.uid())) with check (created_by = (select auth.uid()))',
      v_tbl);
    end if;
    if not v_no_client_writes then
    v_pol := v_pol || format(
      'create policy std_delete on %s for delete to authenticated using (created_by = (select auth.uid()))',
      v_tbl);
    end if;
    perform iam._rls_plan_is(v_tbl, v_pol, v_kept);  -- POLICY-LOCK: the grants rail asks the caller what the policy set is ABOUT to be
    perform iam.apply_table_grants(p_schema, p_table, p_variant);
    perform iam.drop_governance_guard(p_schema, p_table);
    perform iam._rls_emit_policies(v_drop, v_pol);  -- POLICY-LOCK: the freeze starts here and ends at COMMIT
    return;
  end if;

  -- ======================= REFERENCE =======================
  -- A global CATALOGUE. Rows that belong to no organization and no person, that every signed-in
  -- member reads and that only a DOOR writes. There is nothing to filter a read on -- that is the
  -- definition of the class, not a shortcut -- so this lane is the one place in the platform where
  -- `using (true)` is the CORRECT generated predicate, and it is generated rather than hand-written
  -- precisely so iam.verify_canonical can certify it (db-rules §6d: never hand-write policies).
  if p_variant = 'reference' then
    -- THE THREE REFUSALS. A column the reference read lane never reads is a SECOND, COMPETING
    -- ACCESS AUTHORITY -- the exact shape THE COMPONENT OWNERSHIP LAW (§6d-1) was written about,
    -- one variant over. The generator refuses rather than ignoring them, because ignoring is how a
    -- table ends up with a tenancy column that nothing enforces.
    if v_has_org then
      raise exception
        'apply_rls: reference variant on %.% carries organization_id -- a reference catalogue belongs to NO organization, and its read lane never looks at the column, so the column and the policy would disagree about who may read a row. If these rows really belong to an organization this is not reference data: register it as entity (or system, with a visibility column).',
        p_schema, p_table using errcode = '22023';
    end if;
    if v_has_user then
      raise exception
        'apply_rls: reference variant on %.% carries user_id -- a reference catalogue belongs to NO person. A table whose rows have an owner is `personal` (the owner is the whole boundary) or `entity`, never `reference`.',
        p_schema, p_table using errcode = '22023';
    end if;
    if v_has_created then
      raise exception
        'apply_rls: reference variant on %.% carries created_by -- on the entity family that column IS the access key (§6d-1), and this lane never reads it. Leaving it here means two authorities disagree about who may read a row. Drop the column, rename it to a real domain-authorship column, or register the table as `entity`.',
        p_schema, p_table using errcode = '22023';
    end if;
    -- THE ONE READ LANE, AND ITS NAME SAYS WHAT IT IS.
    v_pol := v_pol || format(
      'create policy ref_all_members_read on %s for select to authenticated using (true)', v_tbl);
    -- THE ANON LANE IS THE CLASS'S, NOT THE VARIANT'S (DD-249). `public` is the one class whose
    -- lane set includes anon. On any other class the key is WITHDRAWN here, so clearing the class
    -- and re-running removes the lane completely -- the symmetry the component anon lane has.
    v_pub_lanes := iam.class_lanes(p_token);
    if v_pub_lanes.anon_lane then
      -- The policy is the access RULE; the grant is the access. A schema declared CLOSED in
      -- `platform.schema_client_exposure` gets the rule and never the key.
      if platform.schema_is_client_exposed(p_schema) then
        v_pol := v_pol || format('create policy pub_read on %s for select to anon using (true)', v_tbl);
        execute format('grant select on %s to anon', v_tbl);
      else
        execute format('revoke all on %s from anon', v_tbl);
        raise notice
          'apply_rls: %.% is data_class=public but schema % is declared CLOSED to client roles in platform.schema_client_exposure -- no pub_read policy and no anon grant were issued, so the anonymous lane is inert until the schema is opened.',
          p_schema, p_table, p_schema;
      end if;
    else
      execute format('revoke select on %s from anon', v_tbl);
    end if;
    -- READ-ONLY CLIENT GRANT: iam.apply_table_grants gives this variant the `v_client_read_only`
    -- path, so there is no INSERT/UPDATE/DELETE privilege behind any policy anybody could write.
    perform iam._rls_plan_is(v_tbl, v_pol, v_kept);  -- POLICY-LOCK: the grants rail asks the caller what the policy set is ABOUT to be
    perform iam.apply_table_grants(p_schema, p_table, p_variant);
    -- Nothing to govern: no owner, no organization, no visibility, and no client write lane at all.
    perform iam.drop_governance_guard(p_schema, p_table);
    perform iam._rls_emit_policies(v_drop, v_pol);  -- POLICY-LOCK: the freeze starts here and ends at COMMIT
    return;
  end if;

  -- ======================= DETAIL (polymorphic parent) =======================
  -- 🚨 RC-A2 (2026-09-23, rich-content STORE-DESIGN §3.8 / P2) — A DETAIL'S ACCESS IS ITS
  -- PARENT'S, AND ITS PARENT IS NAMED BY THE ROW ITSELF: `(entity_type, entity_id)`.
  -- `platform.comments` was generated as an `entity`, so a comment was read by its OWN
  -- `visibility` plus organization membership, never by access to the record it sits on.
  -- Measured live 2026-09-23 (scripts/campaign-tests/rca2_comments_follow_the_parent.sql): a
  -- plain member of an organization read, added to and soft-deleted the comments on another
  -- member's PERSONAL note, task and CRM party. A comment quotes what it is about, so a private
  -- record leaked through its comments. Arman's rule: access follows the thing.
  --
  -- This is the `component` law with a polymorphic parent: a component names its parent with a
  -- typed foreign key registered in platform.entity_relationships, a detail names it with a
  -- (token, id) pair, so the lane asks the kernel about that pair directly.
  --   read   — viewer on the parent.
  --   insert — the author is the caller AND commenter on the parent (the rung that exists for
  --            adding to a thing without editing it).
  --   update — the author, still holding commenter on the parent.
  --   delete — the author, or admin on the parent.
  -- NO platform-staff lane and NO organization lane: this branch returns before either is
  -- emitted. Staff and org admins reach a detail exactly as far as iam.has_access lets them
  -- reach its parent — which is DD-136/DD-165's wall, inherited instead of re-implemented.
  -- A `visibility` column on a detail is never read here (a Detail carries no visibility,
  -- Doctrine §1.1); iam.verify_canonical WARNs it as a stray second authority to remove.
  --
  -- COST (D146). The read is one iam.has_access per candidate row. Every client read of a
  -- detail today goes through a door that has already filtered to ONE parent (public.cmt_list
  -- asks once per call), so a direct table read pays it only across the rows it asked for. A
  -- set-wise form needs a per-token id set, which a polymorphic parent cannot name in advance.
  if p_variant = 'detail' then
    if not exists (select 1 from information_schema.columns
                    where table_schema=p_schema and table_name=p_table
                      and column_name='entity_type' and data_type='text')
       or not exists (select 1 from information_schema.columns
                    where table_schema=p_schema and table_name=p_table
                      and column_name='entity_id' and data_type='uuid') then
      raise exception
        'apply_rls: detail variant on %.% requires entity_type text and entity_id uuid — the (token, id) of the record each row belongs to. A row that cannot name its parent cannot inherit its parent''s access.',
        p_schema, p_table using errcode = '22023';
    end if;
    if not v_has_created then
      raise exception
        'apply_rls: detail variant on %.% requires created_by — the author, who alone may edit a row',
        p_schema, p_table using errcode = '22023';
    end if;
    v_pol := v_pol || format(
      case when exists (select 1 from information_schema.columns
                    where table_schema=p_schema and table_name=p_table and column_name='deleted_at')
      -- 🚨 RC-A2b (2026-09-25): a soft-deleted detail is read by its author only. The realtime
      -- feed is authorized by this same policy, so it stops carrying deleted text too
      -- (verify-RC-A2 F4). platform_admin_read, emitted above for every table, still reads it.
      then 'create policy std_select on %s for select to authenticated using (platform.detail_parent_access(entity_type, entity_id, ''viewer''::public.permission_level) and not (deleted_at is not null and created_by is distinct from (select auth.uid())))'
      else 'create policy std_select on %s for select to authenticated using (platform.detail_parent_access(entity_type, entity_id, ''viewer''::public.permission_level))' end,
      v_tbl);
    if not v_no_client_writes then
    v_pol := v_pol || format(
      'create policy std_insert on %s for insert to authenticated with check (created_by = (select auth.uid()) and platform.detail_parent_access(entity_type, entity_id, ''commenter''::public.permission_level))',
      v_tbl);
    end if;
    if not v_no_client_writes then
    v_pol := v_pol || format(
      'create policy std_update on %s for update to authenticated using (created_by = (select auth.uid()) and platform.detail_parent_access(entity_type, entity_id, ''commenter''::public.permission_level)) with check (created_by = (select auth.uid()) and platform.detail_parent_access(entity_type, entity_id, ''commenter''::public.permission_level))',
      v_tbl);
    end if;
    if not v_no_client_writes then
    v_pol := v_pol || format(
      'create policy std_delete on %s for delete to authenticated using (created_by = (select auth.uid()) or platform.detail_parent_access(entity_type, entity_id, ''admin''::public.permission_level))',
      v_tbl);
    end if;
    perform iam._rls_plan_is(v_tbl, v_pol, v_kept);  -- POLICY-LOCK: the grants rail asks the caller what the policy set is ABOUT to be
    perform iam.apply_table_grants(p_schema, p_table, p_variant);
    -- created_by is the author and the edit key, so the governance tier stays: an UPDATE may not
    -- transfer authorship or re-home a row.
    perform iam.apply_governance_guard(p_schema, p_table, p_token);
    perform iam._rls_emit_policies(v_drop, v_pol);  -- POLICY-LOCK: the freeze starts here and ends at COMMIT
    return;
  end if;

  -- Covers the commands a variant emits no policy for at all. Permissive, so it
  -- can only ever ADD rows, and only for the accounts is_platform_admin() knows.
  -- THE PRIVACY WALL: a token that declares suppress_platform_admin_lane does
  -- not get this policy at all. Dropping it AFTER apply_rls was the rejected
  -- alternative (SPEC-ACCESS §3.5) — it breaks iam.verify_canonical and the next
  -- regeneration silently puts it back.
  if not v_suppress_admin then
    -- DD-165: the USING half is the READ/act boundary (SELECT, and the old row of UPDATE and
    -- DELETE), so it carries the wall. The WITH CHECK half is unchanged: this is not a rule about
    -- what an admin may write. `svc_all` is a separate policy, so every server-side job that runs
    -- as `service_role` is untouched by this.
    -- DOORS-ONLY-4 -- THE FOR SELECT TWIN, AND WHY IT IS A BRANCH AND NOT A REMOVAL.
    -- platform_admin_all is FOR ALL, which means it is the platform-staff READ policy as
    -- well as the write one. Removing it to clear the residual write surface would take
    -- staff reads away on seventy-five tables (the warning DOORS-ONLY-2 left in capitals).
    -- So in a doors-only schema the SAME predicate is emitted FOR SELECT under a name that
    -- says so, and the write half simply never exists: staff write through the same doors
    -- everybody else does.
    -- The outer gate stays v_client_read_only, NOT v_no_client_writes: a MARKED relation
    -- gets no platform-staff policy at all today, and handing it one here would widen reads
    -- on a table nobody asked this lane about.
    if not v_client_read_only then
      if not v_doors_only then
        v_pol := v_pol || format(
          'create policy platform_admin_all on %s for all to authenticated '
          || 'using (%s) with check ((select public.is_platform_admin()))',
          v_tbl,
          case when v_vis_enum
               then '(visibility >= ''internal''::platform.visibility) and (select public.is_platform_admin())'
               else '(select public.is_platform_admin())' end);
      else
        v_pol := v_pol || format(
          'create policy platform_admin_select on %s for select to authenticated using (%s)',
          v_tbl,
          case when v_vis_enum
               then '(visibility >= ''internal''::platform.visibility) and (select public.is_platform_admin())'
               else '(select public.is_platform_admin())' end);
      end if;
    end if;
  end if;

  if p_variant = 'ledger' then
    -- SET-WISE ORG LANE (D146). `organization_id in (select iam.my_orgs())` is
    -- the identical predicate to `iam.has_org_access(organization_id)` (both
    -- read iam.organization_member for auth.uid()), but it is uncorrelated, so
    -- it is evaluated ONCE per query instead of once per candidate row. A
    -- ledger is by definition the biggest table in its feature — this is the
    -- variant where the per-row definer call is guaranteed to bite.
    -- THE GLOBAL-READABLE SYSTEM-ORG LANE (db-rules §6e, added 2026-08-21).
    -- Global content is owned by a `global_readable` system org and is readable
    -- by every authenticated user. The `entity` family implements that through
    -- iam.has_access; the ledger lane did not, so the SAME row was readable on
    -- an entity table and invisible on a ledger table. `iam.organizations`
    -- 39c38960-… (Matrx System) has ZERO members, so before this every
    -- system-org ledger row was unreadable by literally everyone —
    -- including the user who created it. Found on batch.work_item: 18 of 20
    -- rows, 16 of them created by the user who could not see them.
    -- Set-wise on purpose: both arms are uncorrelated subqueries, so each is
    -- one hashed SubPlan per query, never a per-row call (D146).
    -- 🚨 DD-174 (2026-09-12) — THE LEDGER'S LANES ARE ITS CLASS'S LANES.
    -- Until this edit the two paragraphs above were unconditional: EVERY ledger got an
    -- organization-member lane and the global-readable system-org lane, whatever its class said.
    -- `iam.class_lanes` and this variant therefore disagreed on 27 live tokens, and the variant won
    -- in silence. Measured on this database, 2026-09-12, in rolled-back rehearsals:
    --   billing.usage_ledger   class `private`  — an org admin would have read 1,520 rows of OTHER
    --                          people's spend, a non-member 313. `private` has no org lane at all.
    --   platform.knob_override_audit  class `confidential` — 27 of its 88 rows belong to a
    --                          global_readable system org, so the system-org arm handed a
    --                          CONFIDENTIAL audit to every signed-in account, non-members included
    --                          (measured: three principals 0 -> 27, a non-member 17 -> 44).
    -- So: the organization lane is emitted only when the class grants one, and the system-org arm
    -- only for the two classes whose lane set is wider than one organization (`organization` and
    -- `public`). For every `organization`-class ledger — all 12 of them — the emitted bytes are
    -- IDENTICAL to what this function emitted before, which the forcing test asserts character for
    -- character rather than trusting the reading.
    v_ledger_lanes := iam.class_lanes(p_token);
    if not v_ledger_lanes.org_member_lane then
      raise exception
        'apply_rls: %.% (token %) resolves to class %, whose lane set has NO organization-member lane — and the ledger variant emits an organization read lane and nothing else. Generating it here would hand every member of a row''s organization a table whose class says only its owner may read it (measured on billing.usage_ledger: an organization admin 0 -> 1,520 rows of other people''s spend). Nothing was generated. If the table carries user_id, its variant is `personal` — a personal row''s user_id is the complete access boundary; otherwise correct data_class on platform.entity_types with a stored reason.',
        p_schema, p_table, p_token, v_ledger_lanes.resolved_class;
    end if;
    v_sysorg_read := case
      when v_ledger_lanes.resolved_class in ('organization','public')
        then ' or organization_id in (select organization_id from iam.system_orgs where global_readable)'
      else '' end;
    v_pol := v_pol || format(
      'create policy std_select on %s for select to authenticated using (%s('
      || 'organization_id is not null and ('
      || 'organization_id in (select iam.my_orgs())%s)))',
      v_tbl, v_admin_read, v_sysorg_read);
    perform iam._rls_plan_is(v_tbl, v_pol, v_kept);  -- POLICY-LOCK: the grants rail asks the caller what the policy set is ABOUT to be
    perform iam.apply_table_grants(p_schema, p_table, p_variant);
    perform iam.drop_governance_guard(p_schema, p_table);
    perform iam._rls_emit_policies(v_drop, v_pol);  -- POLICY-LOCK: the freeze starts here and ends at COMMIT
    return;
  end if;

  -- ======================= COMPONENT =======================
  -- Access IS the parent's. No created_by clause is emitted here, ever.
  if v_is_component or p_variant = 'component' then
    for rec in
      select er.parent_type, er.fk_column
      from platform.entity_relationships er
      where er.child_type = p_token and er.kind = 'composition'
      order by er.parent_type, er.fk_column
    loop
      v_parent_count := v_parent_count + 1;
      v_parent_expr_edit := v_parent_expr_edit
        || case when v_parent_expr_edit = '' then '' else ' or ' end
        || format('%I in (select iam.unnest_uuids(iam.accessible_entity_ids(%L, ''editor''::public.permission_level)))',
                  rec.fk_column, rec.parent_type);
      v_parent_expr_view := v_parent_expr_view
        || case when v_parent_expr_view = '' then '' else ' or ' end
        || format('%I in (select iam.unnest_uuids(iam.accessible_entity_ids(%L, ''viewer''::public.permission_level)))',
                  rec.fk_column, rec.parent_type);
    end loop;

    if v_parent_count = 0 then
      raise exception
        'apply_rls: component % has no composition parent in platform.entity_relationships', p_token;
    end if;

    -- Reads resolve the SMALL parent id sets, then the caller's row predicate
    -- uses the child's indexed foreign keys. Never resolve the CHILD token as a
    -- set — that materializes every accessible child id (D183).
    -- D254: the trailing arm was an UNBOUNDED per-row iam.has_access — the same
    -- D146 shape D249 removed from `entity`, and the reason a user could not read
    -- the version history of their own files (files.file_versions, 50,423 rows,
    -- ~7ms/row = ~350s). It now comes from the SAME builder the entity lane uses:
    -- iam.entity_read_expr already reads this token's parents out of
    -- entity_relationships, gates its org/visibility arms on those columns
    -- existing, and bounds the definer call by the id-producing lanes. A second
    -- component-shaped copy of that logic is how the two would drift.
    if v_v2 then
      -- READ-LANE V2 (P2): a lane admin skips std_select; platform_admin_read admits every row.
      v_pol := v_pol || format(
        'create policy std_select on %s for select to authenticated using (%s(%s(%s)))',
        v_tbl, iam.read_lane_v2_guard(), v_admin_read, iam.entity_read_expr(p_schema, p_table, p_token, 'component'));
    else
      v_pol := v_pol || format(
        'create policy std_select on %s for select to authenticated using (%s(%s))',
        v_tbl, v_admin_read, iam.entity_read_expr(p_schema, p_table, p_token, 'component'));
    end if;

    -- THE PUBLIC-PARENT ANON LANE (0580). Emitted only for a flagged token.
    -- The policy admits a row when a composition parent is public and live;
    -- the arm's parent subquery ALSO passes through the parent's own RLS for
    -- the anon role (pub_read: public + not deleted), so the two agree by
    -- construction. Per the soft-delete doctrine, the anon lane — and only the
    -- anon lane — filters the child's own deleted_at (v_delpfx).
    if v_anon_component then
      if v_excluded is not null and cardinality(v_excluded) > 0 then
        raise exception
          'apply_rls: % declares component_anon_read_via_public_parent AND client_excluded_columns — a table-level anon grant would expose to anon what is withheld from authenticated. Resolve the contradiction first.',
          p_token;
      end if;
      v_anon_expr := '';
      for rec in
        select er.fk_column, et.schema_name as pschema, et.table_name as ptable
        from platform.entity_relationships er
        join platform.entity_types et on et.token = er.parent_type
        where er.child_type = p_token and er.kind = 'composition'
        order by er.parent_type, er.fk_column
      loop
        if exists (select 1 from information_schema.columns
                    where table_schema = rec.pschema and table_name = rec.ptable
                      and column_name = 'visibility') then
          -- A policy subquery runs with the QUERYING role's privileges: if anon
          -- cannot SELECT the parent, every anon query on the child errors with
          -- 42501 instead of filtering. Refuse the misconfiguration loudly.
          if not has_table_privilege('anon', format('%I.%I', rec.pschema, rec.ptable)::regclass, 'SELECT') then
            raise exception
              'apply_rls: % declares component_anon_read_via_public_parent but parent %.% has no anon SELECT grant — the policy subquery would 42501 for every anon query. Apply the parent''s canonical RLS (its pub_read lane grants anon) first.',
              p_token, rec.pschema, rec.ptable;
          end if;
          select exists (select 1 from information_schema.columns
                          where table_schema = rec.pschema and table_name = rec.ptable
                            and column_name = 'deleted_at') into v_pdel;
          v_anon_expr := v_anon_expr
            || case when v_anon_expr = '' then '' else ' or ' end
            || format('(%1$I is not null and %1$I in (select p.id from %2$I.%3$I p where %4$sp.visibility = ''public''))',
                      rec.fk_column, rec.pschema, rec.ptable,
                      case when v_pdel then 'p.deleted_at is null and ' else '' end);
        end if;
      end loop;
      if v_anon_expr = '' then
        raise exception
          'apply_rls: % declares component_anon_read_via_public_parent but no composition parent carries a visibility column — nothing can be public here; clear the flag',
          p_token;
      end if;
      v_pol := v_pol || format('create policy pub_read on %s for select to anon using (%s(%s))',
        v_tbl, v_delpfx, v_anon_expr);
      -- The policy is the access RULE; the grant is the access. A schema declared CLOSED in
      -- `platform.schema_client_exposure` gets the rule and never the grant — this is the one
      -- client-role grant in the RLS generator that does not go through
      -- `iam.apply_table_grants`, so it carries the same check rather than inheriting one.
      if platform.schema_is_client_exposed(p_schema) then
        execute format('grant select on %s to anon', v_tbl);
      else
        execute format('revoke all on %s from anon', v_tbl);
        raise notice
          'apply_rls: %.% declares component_anon_read_via_public_parent and its pub_read policy was created, but schema % is declared CLOSED in platform.schema_client_exposure — the anon SELECT grant was NOT issued, so the lane is inert until the schema is opened.',
          p_schema, p_table, p_schema;
      end if;
    else
      -- Symmetry: clearing the flag and re-running apply_rls removes the lane
      -- completely (the policy died in the drop loop above; the grant dies here).
      execute format('revoke select on %s from anon', v_tbl);
    end if;

    -- A new row cannot have a direct grant yet, so INSERT must be authorized
    -- through a structural parent. No orphan/created_by lane: a component with
    -- no parent is not a component.
    if not v_no_client_writes then
    v_pol := v_pol || format(
      'create policy std_insert on %s for insert to authenticated with check (%s(%s))',
      v_tbl, v_admin, v_parent_expr_edit);
    end if;

    if not v_no_client_writes then
    v_pol := v_pol || format(
      'create policy std_update on %s for update to authenticated using (%s(%s) or iam.has_access(%L, id, ''editor'')) '
      || 'with check (%s(%s) or iam.has_access(%L, id, ''editor''))',
      v_tbl, v_admin_read, v_parent_expr_edit, p_token, v_admin, v_parent_expr_edit, p_token);
    end if;

    if not v_no_client_writes then
    v_pol := v_pol || format(
      'create policy std_delete on %s for delete to authenticated using (%s(%s) or iam.has_access(%L, id, ''editor''))',
      v_tbl, v_admin_read, v_parent_expr_edit, p_token);
    end if;

    perform iam._rls_plan_is(v_tbl, v_pol, v_kept);  -- POLICY-LOCK: the grants rail asks the caller what the policy set is ABOUT to be
    perform iam.apply_table_grants(p_schema, p_table, 'component');
    -- A component has no owner column and no visibility of its own: its access
    -- IS its parent's (THE COMPONENT OWNERSHIP LAW). There is nothing to govern
    -- here, so the governance-column tier deliberately does not apply.
    -- READ-LANE V2 LOCK ORDER: every relation the regenerated policies read is locked (ACCESS SHARE)
    -- HERE — before drop_governance_guard, whose trigger DDL is what first takes the 23-relation
    -- auth/storage/realtime lock (measured on the clone 2026-09-26), and before the policy statements —
    -- so a wait on a busy relation never happens inside the sign-in freeze.
    if v_v2 then perform iam.read_lane_v2_lock_policy_reads(p_schema, p_table, p_token); end if;
    perform iam.drop_governance_guard(p_schema, p_table);
    perform iam._rls_emit_policies(v_drop, v_pol);  -- POLICY-LOCK: the freeze starts here and ends at COMMIT
    return;
  end if;

  -- ======================= ENTITY FAMILY =======================
  -- Here `created_by` IS the owner, and that is exactly why it is an access key.
  if not v_has_created then
    raise exception
      'apply_rls: standard entity %.% lacks created_by — base-retrofit it before applying canonical RLS',
      p_schema, p_table;
  end if;
  if not v_has_org then
    raise exception
      'apply_rls: standard entity %.% lacks organization_id — base-retrofit it before applying canonical RLS',
      p_schema, p_table;
  end if;

  if p_variant = 'restricted' then
    v_pol := v_pol || format(
      'create policy std_select on %s for select to authenticated using (%s%s(created_by = (select auth.uid())%s))',
      v_tbl, v_admin_read, v_delpfx, v_su_sel_read);
      -- 🚨 DD-249 (2026-09-15) — THE ANON LANE IS THE CLASS'S, NOT THE VARIANT'S.
      -- Until this edit `pub_read` was emitted on the presence of a `visibility` COLUMN and
      -- nothing else, so the variant granted an anonymous read lane that `iam.class_lanes`
      -- never issued. Exactly the DD-174 shape, one variant over: the generator out-voted the
      -- class in silence, and `iam.verify_canonical` has been WARNing `class_lanes_match_policy`
      -- on 233 live tokens ever since. Measured on this database, 2026-09-15: of those 233,
      -- 223 had NO anon privilege of any kind (`iam.apply_table_grants` never grants anon on
      -- the entity/restricted path) — a door with no key, which is worse than no door because
      -- it reads as an anonymous lane to everyone auditing the table. The other 10 carried
      -- hand-written anon column grants and the lane was LIVE: 5 of them held public rows
      -- (app.definition 81, platform.categories 355, education.learn_doc 11,
      -- agent.message_template 8, workbench.notes 2) on a class that says no stranger may read.
      -- So the lane is now asked of the class, once, in the one place that decides it.
    if v_has_vis then
      v_pub_lanes := iam.class_lanes(p_token);
      if v_pub_lanes.anon_lane then
        v_pol := v_pol || format('create policy pub_read on %s for select to anon using (%s visibility = ''public'')',
          v_tbl, v_delpfx);
      end if;
    end if;
    if not v_no_client_writes then
    v_pol := v_pol || format(
      'create policy std_insert on %s for insert to authenticated with check (%s(created_by = (select auth.uid()) and (%sorganization_id is null or iam.has_org_access(organization_id))))',
      v_tbl, v_admin, v_su_ins);
    end if;
    if not v_no_client_writes then
    v_pol := v_pol || format(
      'create policy std_update on %s for update to authenticated using (%s created_by = (select auth.uid())%s) with check (%s created_by = (select auth.uid())%s)',
      v_tbl, v_admin_read, v_su_sel_read, v_admin, v_su_sel);
    end if;
    if not v_no_client_writes then
    v_pol := v_pol || format(
      'create policy std_delete on %s for delete to authenticated using (%s created_by = (select auth.uid())%s)',
      v_tbl, v_admin_read, v_su_sel_read);
    end if;
    perform iam._rls_plan_is(v_tbl, v_pol, v_kept);  -- POLICY-LOCK: the grants rail asks the caller what the policy set is ABOUT to be
    perform iam.apply_table_grants(p_schema, p_table, p_variant);
    -- `restricted` is already owner-or-super-admin on UPDATE — the whole row is
    -- governed, so a per-column tier would be redundant.
    perform iam.drop_governance_guard(p_schema, p_table);
    perform iam._rls_emit_policies(v_drop, v_pol);  -- POLICY-LOCK: the freeze starts here and ends at COMMIT
    return;
  end if;

  if p_variant = 'system' and not v_has_vis then
    raise exception 'apply_rls: system variant on %.% requires a visibility column', p_schema, p_table;
  end if;
  -- D249: the read lane is a disjunction of INDEXABLE predicates, not a per-row
  -- SECURITY DEFINER call. `iam.entity_read_expr` inlines the SUFFICIENT
  -- attribute lanes of has_access_for_base (owner / public / org / system-org /
  -- org-admin / parent-fk) and keeps `iam.has_access` for everything else,
  -- reached only for ids the remaining id-producing lanes could admit. Same
  -- move the `ledger` (0439) and `component` lanes already made; `entity` was
  -- the last variant still asking the question one row at a time.
  if v_v2 then
    -- READ-LANE V2 (P2): a lane admin skips std_select; platform_admin_read admits every row.
    v_pol := v_pol || format(
      'create policy std_select on %s for select to authenticated using (%s(%s(%s)))',
      v_tbl, iam.read_lane_v2_guard(), v_admin_read, iam.entity_read_expr(p_schema, p_table, p_token));
  else
    v_pol := v_pol || format(
      'create policy std_select on %s for select to authenticated using (%s(%s))',
      v_tbl, v_admin_read, iam.entity_read_expr(p_schema, p_table, p_token));
  end if;

  -- DD-249, the entity/system tail. `system` keeps its unconditional anon lane: a system
  -- table IS the platform's own published catalogue (63 of its 134 tokens already resolve
  -- `public`), and `iam.verify_canonical.class_lanes_match_policy` exempts that variant by
  -- name. Every other token here asks its class.
  if v_has_vis then
    v_pub_lanes := iam.class_lanes(p_token);
    if p_variant = 'system' or v_pub_lanes.anon_lane then
      v_pol := v_pol || format('create policy pub_read on %s for select to anon using (%s visibility = ''public'')',
        v_tbl, v_delpfx);
    end if;
  end if;
  -- NOTE (D146): the INSERT lanes below keep `iam.has_org_access(...)`. A WITH
  -- CHECK is evaluated once per INSERTED row, never across a scan, so the
  -- per-row-definer timeout class does not reach them.
  if not v_no_client_writes then
  v_pol := v_pol || format(
    'create policy std_insert on %s for insert to authenticated with check (%s(created_by = (select auth.uid()) and (organization_id is null or iam.has_org_access(organization_id)%s)))',
    v_tbl, v_admin, v_sysorg_ins);
  end if;
  if not v_no_client_writes then
  v_pol := v_pol || format(
    'create policy std_update on %s for update to authenticated using (%s(created_by = (select auth.uid()) or iam.has_access(%L, id, ''editor''))) with check (%s(created_by = (select auth.uid()) or iam.has_access(%L, id, ''editor'')))',
    v_tbl, v_admin_read, p_token, v_admin, p_token);
  end if;
  if not v_no_client_writes then
  v_pol := v_pol || format(
    'create policy std_delete on %s for delete to authenticated using (%s(created_by = (select auth.uid()) or iam.has_access(%L, id, ''admin'')))',
    v_tbl, v_admin_read, p_token);
  end if;

  perform iam._rls_plan_is(v_tbl, v_pol, v_kept);  -- POLICY-LOCK: the grants rail asks the caller what the policy set is ABOUT to be
  perform iam.apply_table_grants(p_schema, p_table, p_variant);

  -- THE GOVERNANCE-COLUMN TIER. RLS is row-level and cannot say "this column
  -- needs a higher level", so the column axis of the tiered model is a
  -- generated BEFORE UPDATE trigger, emitted here beside the policies.
  -- READ-LANE V2 LOCK ORDER: locked before apply_governance_guard, whose trigger DDL is what first takes
  -- the auth/storage/realtime lock, and before the policy statements (see the component branch).
  if v_v2 then perform iam.read_lane_v2_lock_policy_reads(p_schema, p_table, p_token); end if;
  perform iam.apply_governance_guard(p_schema, p_table, p_token);

  perform iam._rls_emit_policies(v_drop, v_pol);  -- POLICY-LOCK: the freeze starts here and ends at COMMIT
end;

$function$;
