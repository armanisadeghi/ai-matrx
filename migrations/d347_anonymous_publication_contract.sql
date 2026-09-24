-- chair-step: D347 adds a declared anonymous publication gate to the existing policy generator and verifier; function bodies are checksum guarded and undeclared tables retain their exact lanes.
-- D347: anonymous publication status is declared, generated and certified.
-- NULL preserves every existing policy. A declaration only NARROWS anon SELECT;
-- it grants nothing and never changes authenticated CRUD or service_role.
-- The text status contract is deliberate: invalid table shapes fail before policy DDL.
-- Replacements are copied from the exact live bodies named below; unrelated code is unchanged.
-- These functions are not in iam.entity_read_kernel_fingerprint: do not re-record its oracle.
-- Apply this contract file before d347_pc_articles_published_anon.sql.
-- based-on: iam.generated_policy_names() 66b2dac19ad94effed4d04eb7eb0e06bc88ecc09ce1af0b8d89a76550165f5eb
-- based-on: iam._apply_rls_unchecked(text,text,text,text) 166db988b42faf44d506bce48326555fdca7026666ebdbc4c30b7058b73acedc
-- based-on: iam.verify_canonical(text,text,text,text) b799561fc65de7cd4a0fd88abb527ad48b9c7738f278cbe77c34c19fbb60b8f7

SET LOCAL lock_timeout = '2s';
DO $preflight$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policy WHERE polname='anon_status_gate') THEN
    RAISE EXCEPTION 'D347: anon_status_gate is already in use; inspect its ownership before reserving the generated name';
  END IF;
END
$preflight$;
ALTER TABLE platform.entity_types ADD COLUMN anonymous_read_status text
  CONSTRAINT entity_types_anonymous_read_status_nonempty CHECK (anonymous_read_status IS NULL OR length(btrim(anonymous_read_status)) > 0);
COMMENT ON COLUMN platform.entity_types.anonymous_read_status IS
  'Optional anonymous publication gate: for entity/system/restricted tables with a text status column, iam.apply_rls generates anon_status_gate AS RESTRICTIVE FOR SELECT TO anon USING status = this value. NULL adds no gate. Never grants access or changes authenticated lanes.';

CREATE OR REPLACE FUNCTION iam.generated_policy_names()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select array[
    'svc_all',            -- every variant
    'std_select',         -- every variant except restricted-without-visibility
    'std_insert',         -- personal / component / entity family
    'std_update',         -- personal / component / entity family
    'std_delete',         -- personal / component / entity family
    'platform_admin_all', -- every variant except personal, unless the token suppresses the lane
    'platform_admin_select', -- the FOR SELECT twin of platform_admin_all, in a doors-only schema:
                          -- platform staff keep the exact read they had and lose the write lane,
                          -- because in `platform`/`iam` a write is a door (DOORS-ONLY-4)
    'anon_status_gate',  -- declared anonymous_read_status: RESTRICTIVE, anon SELECT only
    'pub_read',           -- anon lane: entity/system/restricted with visibility, flagged components
    'ref_all_members_read' -- reference: the one read lane of a global catalogue, open to every member
  ]::text[]
$function$
;
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
begin
  select coalesce(is_component, false), coalesce(suppress_platform_admin_lane, false),
         coalesce(component_anon_read_via_public_parent, false), client_excluded_columns
    into v_is_component, v_suppress_admin, v_anon_component, v_excluded
  from platform.entity_types where token = p_token;

  -- D347: publication is an additional anonymous-only restriction, never an access grant.
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

  select count(*), coalesce(bool_or(client_read_only), false), max(token), max(rls_variant)
    into v_registry_rows, v_client_read_only, v_registry_token, v_registry_variant
  from platform.entity_types where schema_name=p_schema and table_name=p_table;
  if v_client_read_only and v_registry_rows > 1 then raise exception 'apply_rls: duplicate registry rows for marked %.%',p_schema,p_table using errcode='42501'; end if;
  if v_client_read_only then
    if v_registry_token is distinct from p_token then
      raise exception 'apply_rls: readonly registry token mismatch for %.% token %',p_schema,p_table,p_token using errcode='42501';
    end if;
    if v_registry_variant is null or v_registry_variant not in ('entity','system','restricted','personal','component','ledger','reference') then
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
  -- A personal row's user_id is the complete access boundary. Referenced
  -- organizations and platform-admin status do not widen it.
  if p_variant = 'personal' then
    if not v_has_user then
      raise exception
        'apply_rls: personal variant on %.% requires user_id',
        p_schema, p_table;
    end if;
    v_pol := v_pol || format(
      'create policy std_select on %s for select to authenticated using (%suser_id = (select auth.uid()))',
      v_tbl, v_delpfx);
    if not v_no_client_writes then
    v_pol := v_pol || format(
      'create policy std_insert on %s for insert to authenticated with check (user_id = (select auth.uid()))',
      v_tbl);
    end if;
    if not v_no_client_writes then
    v_pol := v_pol || format(
      'create policy std_update on %s for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      v_tbl);
    end if;
    if not v_no_client_writes then
    v_pol := v_pol || format(
      'create policy std_delete on %s for delete to authenticated using (user_id = (select auth.uid()))',
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
    v_pol := v_pol || format(
      'create policy std_select on %s for select to authenticated using (%s(%s))',
      v_tbl, v_admin_read, iam.entity_read_expr(p_schema, p_table, p_token, 'component'));

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
  v_pol := v_pol || format(
    'create policy std_select on %s for select to authenticated using (%s(%s))',
    v_tbl, v_admin_read, iam.entity_read_expr(p_schema, p_table, p_token));

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
  perform iam.apply_governance_guard(p_schema, p_table, p_token);

  perform iam._rls_emit_policies(v_drop, v_pol);  -- POLICY-LOCK: the freeze starts here and ends at COMMIT
end;

$function$
;
CREATE OR REPLACE FUNCTION iam.verify_canonical(p_schema text, p_table text, p_token text, p_variant text DEFAULT NULL::text)
 RETURNS TABLE(check_name text, status text, detail text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$

DECLARE
  v_tbl regclass;
  v_relkind "char";
  v_is_component boolean; v_variant text; v_reg_variant text;
  v_soft_delete boolean; v_is_versioned boolean; v_is_listed boolean; v_shareable boolean;
  v_vstore text; v_vstore_ref regclass;
  v_store_token text; v_store_fk text; v_store_trig boolean; v_store_uq boolean; v_store_kind "char";
  f_id_uuid boolean; f_id boolean; f_id_int boolean; f_org boolean; f_org_nn boolean;
  f_cb boolean; f_ub boolean; f_ca_nn boolean; f_occ_nn boolean; f_ua_nn boolean; f_del boolean;
  f_ver boolean; f_meta boolean;
  f_vis boolean; f_vis_enum boolean; f_vis_nn boolean;
  l_owner boolean; l_orgid boolean; l_isdel boolean; l_ispub boolean;
  fk_org boolean; fk_cb boolean; fk_ub boolean;
  t_stamp boolean; t_touch boolean; t_hist boolean;
  v_rls boolean; v_polnames text[]; v_sel text;
  v_required_anon_status text;
  v_reg_rt text; v_expected text[]; v_unexpected text[]; v_missing text[];
  v_bespoke text[];  -- DD-147: policies on this table iam.apply_rls did not author
  v_parent_type text; v_parent_col text;
  v_owner_pat text := '%created_by = ( SELECT auth.uid()%';
  -- THE PRIVACY WALL (SPEC-ACCESS §3.5). A token declaring
  -- suppress_platform_admin_lane is generated WITHOUT platform_admin_all, so the
  -- expected-policy set must omit it or every flipped table fails certification.
  v_suppress_admin boolean := false;
  -- THE PUBLIC-PARENT ANON LANE (0580). A component token declaring
  -- component_anon_read_via_public_parent is generated WITH a pub_read anon
  -- policy keyed on the parent's visibility, so the expected-policy set must
  -- include it — and a dedicated check keeps the lane from being silently
  -- dropped by a regeneration, exactly like the privacy wall in the other
  -- direction.
  v_anon_component boolean := false;
  v_pub text;
  v_client_read_only boolean := false; v_registry_rows integer := 0;
  -- DOORS-ONLY-4 -- THE VERIFIER LEARNS THE NEW SET IN THE SAME CHANGE THAT EMITS IT.
  -- iam.generated_policy_names() now carries platform_admin_select, and DD-147's drift
  -- guard inside iam.apply_rls raises on any emitted name outside that catalog. If this
  -- function did not also learn it, policies_canonical would report the twin as
  -- legacy/unexpected on every doors-only table -- a generator arguing with its own
  -- verifier, which is the exact defect DD-249 was.
  v_doors_only boolean := false;
  v_registry_token text; v_registry_variant text;
  v_registry_guard_oid oid; v_registry_guard_source text;
  v_registry_guard_enabled "char"; v_registry_guard_type smallint;
  v_registry_guard_when pg_node_tree; v_registry_guard_nargs smallint; v_registry_guard_constraint oid;
  v_registry_guard_security_definer boolean; v_registry_guard_return_type oid;
  v_registry_guard_language text; v_registry_guard_config text[];
  v_registry_guard_expected_sha256 constant text := '659860c01c779564e4a94ec86d44a0be68f1857a71326e5f3b790bf0d39dbab0';
  -- THE PER-VARIANT BASE CONTRACT (derived above)
  -- DD-200 (2026-09-13) THE MACHINERY ROUTE. `audit_class` — not `rls_variant` — is the column
  -- that DECLARES a token machinery (`rls_variant` has no such value; its CHECK admits only
  -- entity/component/system/restricted/ledger/personal). It is read here so the machinery
  -- contract below can replace the base contract rather than sit beside it.
  v_audit_class text; v_audit_reason text;
  v_actor_req boolean;      -- must the actor pair EXIST?
  v_mutation_req boolean;   -- must the mutation trio EXIST?
BEGIN
  v_tbl := to_regclass(format('%I.%I',p_schema,p_table));
  IF v_tbl IS NULL THEN
    check_name:='table_exists'; status:='FAIL'; detail:='table not found'; RETURN NEXT; RETURN;
  END IF;

  SELECT relkind INTO v_relkind FROM pg_class WHERE oid=v_tbl;
  IF v_relkind NOT IN ('r','p') THEN
    check_name:='relation_kind'; status:='SKIP';
    detail:=format('%s — base contract not applicable; access follows the underlying query',
                   CASE v_relkind WHEN 'v' THEN 'view' WHEN 'm' THEN 'materialized view' ELSE 'relkind '||v_relkind::text END);
    RETURN NEXT; RETURN;
  END IF;

  SELECT COALESCE(is_component,false),COALESCE(has_soft_delete,false),COALESCE(is_versioned,false),COALESCE(is_listed,false),rls_variant,
         COALESCE(version_store,'history'),version_store_ref,COALESCE(suppress_platform_admin_lane,false),
         COALESCE(component_anon_read_via_public_parent,false)
    INTO v_is_component,v_soft_delete,v_is_versioned,v_is_listed,v_reg_variant,v_vstore,v_vstore_ref,v_suppress_admin,
         v_anon_component
    FROM platform.entity_types WHERE token=p_token;
  v_variant := COALESCE(p_variant, v_reg_variant, CASE WHEN v_is_component THEN 'component' ELSE 'entity' END);
  v_doors_only := platform.schema_is_doors_only(p_schema);
  SELECT count(*), coalesce(bool_or(client_read_only), false), max(token), max(rls_variant)
    INTO v_registry_rows, v_client_read_only, v_registry_token, v_registry_variant
    FROM platform.entity_types
   WHERE schema_name=p_schema AND table_name=p_table;
  IF v_client_read_only AND v_registry_rows > 1 THEN
    check_name:='client_read_only_registry'; status:='FAIL'; detail:='duplicate entity_types rows for relation'; RETURN NEXT; RETURN;
  END IF;
  IF v_client_read_only THEN
    IF v_registry_token IS DISTINCT FROM p_token THEN
      check_name:='client_read_only_registry'; status:='FAIL'; detail:='readonly registry token mismatch'; RETURN NEXT; RETURN;
    ELSIF v_registry_variant IS NULL OR v_registry_variant NOT IN ('entity','system','restricted','personal','component','ledger') THEN
      check_name:='client_read_only_registry'; status:='FAIL'; detail:='readonly registry variant is missing or unknown'; RETURN NEXT; RETURN;
    ELSIF p_variant IS NOT NULL AND p_variant IS DISTINCT FROM v_registry_variant THEN
      check_name:='client_read_only_registry'; status:='FAIL'; detail:='readonly registry variant mismatch'; RETURN NEXT; RETURN;
    END IF;
    -- The physical marked relation decides its shape. NULL means derive; a supplied
    -- default/entity must agree, so callers cannot bypass restricted/no-visibility.
    v_variant := v_registry_variant;
  END IF;
  v_shareable := EXISTS(SELECT 1 FROM platform.shareable_resource_registry WHERE resource_type=p_token AND is_active);

  v_actor_req    := v_variant IN ('entity','system','restricted');
  -- The mutation trio is required where the row is USER-REVISED (the entity family) or where
  -- the registry DECLARES it versioned (any variant — a versioned row must bump `version`,
  -- §7's prerequisite pairing). `ledger` means "no user writes", not "the server never
  -- updates it": a server-written durable work queue is a legitimate ledger and may be
  -- versioned. Nothing in the machinery forbids it, so the gate must not either.
  v_mutation_req := v_variant IN ('entity','system','restricted','personal') OR v_is_versioned;

  SELECT
    bool_or(column_name='id' AND data_type='uuid'), bool_or(column_name='id'),
    bool_or(column_name='id' AND data_type IN ('bigint','integer','smallint')),
    bool_or(column_name='organization_id'), bool_or(column_name='organization_id' AND is_nullable='NO'),
    bool_or(column_name='created_by'), bool_or(column_name='updated_by'),
    bool_or(column_name='created_at' AND is_nullable='NO'),
    bool_or(column_name='occurred_at' AND is_nullable='NO'),
    bool_or(column_name='updated_at' AND is_nullable='NO'),
    bool_or(column_name='deleted_at'),
    bool_or(column_name='version' AND data_type='integer' AND is_nullable='NO'),
    bool_or(column_name='metadata' AND data_type='jsonb' AND is_nullable='NO'),
    bool_or(column_name='visibility'),
    bool_or(column_name='visibility' AND udt_schema='platform' AND udt_name='visibility'),
    bool_or(column_name='visibility' AND udt_schema='platform' AND udt_name='visibility' AND is_nullable='NO'),
    bool_or(column_name IN ('user_id','owner_id','author_id','creator_id')),
    bool_or(column_name='org_id'), bool_or(column_name='is_deleted'), bool_or(column_name='is_public')
  INTO f_id_uuid,f_id,f_id_int,f_org,f_org_nn,f_cb,f_ub,f_ca_nn,f_occ_nn,f_ua_nn,f_del,f_ver,f_meta,
       f_vis,f_vis_enum,f_vis_nn,l_owner,l_orgid,l_isdel,l_ispub
  FROM information_schema.columns WHERE table_schema=p_schema AND table_name=p_table;

  SELECT
    EXISTS(SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
            WHERE c.conrelid=v_tbl AND c.contype='f' AND a.attname='organization_id' AND c.confrelid='iam.organizations'::regclass),
    EXISTS(SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
            WHERE c.conrelid=v_tbl AND c.contype='f' AND a.attname='created_by' AND c.confrelid='auth.users'::regclass),
    EXISTS(SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
            WHERE c.conrelid=v_tbl AND c.contype='f' AND a.attname='updated_by' AND c.confrelid='auth.users'::regclass)
  INTO fk_org,fk_cb,fk_ub;

  SELECT COALESCE(bool_or(pr.proname='_stamp_actor'),false),COALESCE(bool_or(pr.proname='_touch_row'),false),
         COALESCE(bool_or(pr.proname='_version_capture'),false)
    INTO t_stamp,t_touch,t_hist
  FROM pg_trigger tg JOIN pg_proc pr ON pr.oid=tg.tgfoid WHERE tg.tgrelid=v_tbl AND NOT tg.tgisinternal;

  SELECT relrowsecurity INTO v_rls FROM pg_class WHERE oid=v_tbl;
  SELECT array_agg(polname) INTO v_polnames FROM pg_policy WHERE polrelid=v_tbl;
  SELECT pg_get_expr(polqual,polrelid) INTO v_sel FROM pg_policy WHERE polrelid=v_tbl AND polname='std_select';
  -- THE REFERENCE VARIANT NAMES ITS READ LANE FOR WHAT IT IS, AND THE CLASS-AWARE CHECKS BELOW
  -- MUST STILL SEE IT. `ref_all_members_read` is the one SELECT policy iam._apply_rls_unchecked
  -- emits for rls_variant='reference'; reading it into the SAME variable means
  -- class_lanes_match_policy, system_org_arm_respects_class and the pub_read arbitration JUDGE a
  -- reference table instead of silently SKIPping it on a NULL std_select -- a half-taught verifier
  -- across a 700-table registry being exactly the defect class this variant was built inside.
  -- No other variant emits this name, so this lookup is a no-op everywhere else.
  IF v_sel IS NULL THEN
    SELECT pg_get_expr(polqual,polrelid) INTO v_sel FROM pg_policy
     WHERE polrelid=v_tbl AND polname='ref_all_members_read';
  END IF;
  SELECT pg_get_expr(polqual,polrelid) INTO v_pub FROM pg_policy WHERE polrelid=v_tbl AND polname='pub_read';

  check_name:='entity_registered';
  IF EXISTS(SELECT 1 FROM platform.entity_types WHERE token=p_token AND schema_name=p_schema AND table_name=p_table)
    THEN status:='PASS'; detail:=v_variant; ELSE status:='FAIL'; detail:=format('no entity_types row for token=%s at %s.%s',p_token,p_schema,p_table); END IF; RETURN NEXT;

  -- ═══ DD-200 (2026-09-13) — A MACHINERY TOKEN IS MEASURED AGAINST THE MACHINERY CONTRACT ══════
  -- `iam.apply_rls` REFUSES a machinery token by construction ("generic RLS is forbidden because
  -- machinery owns inputs consumed by the access resolver", the 2026-08-24 42P17 recursion
  -- incident). So on a machinery table the per-variant base contract (§6d-3) and the generated
  -- policy family it certifies DESCRIBE A REGIME THAT NEVER RUNS — every FAIL they produced was
  -- a distance from a contract that by ruling does not apply, and that noise is exactly what
  -- hides a real FAIL from the lane reading the output (B-83 §8: a correctly re-registered
  -- `user_secret_grant` reported eleven of them).
  --
  -- What replaces them is the contract a machinery token DOES owe, derived from the rulings that
  -- created the class rather than from the generator:
  --   machinery_has_reason        — the written reason on the row (db-rules, the certification
  --                                 universe: "marking a table machinery is an owner decision with
  --                                 a written reason on the row — an agent may not self-declare
  --                                 one to clear red").
  --   machinery_no_generated_policy — the generator never ran here.
  --   machinery_no_client_grant   — no signed-out reach, and no UNDECLARED ungated client door
  --                                 (DD-204: a data_class='public' registry row with a written
  --                                 reason declares a published catalogue and is accepted, named).
  --   machinery_rls_on            — the bespoke policies are reachable at all.
  -- The base contract is then skipped with a NAMED row, never silently.
  SELECT COALESCE(et.audit_class,'entity'), et.audit_class_reason
    INTO v_audit_class, v_audit_reason
    FROM platform.entity_types et WHERE et.token = p_token;

  IF v_audit_class = 'machinery' THEN

    -- ── 1. THE WRITTEN REASON ──────────────────────────────────────────────────────────────────
    -- `entity_types_machinery_reason` is a NOT-NULL CHECK and nothing more, so a whitespace
    -- string satisfies it and arrives here as a machinery declaration with nothing written on it.
    check_name := 'machinery_has_reason';
    IF COALESCE(btrim(v_audit_reason),'') <> '' THEN
      status := 'PASS'; detail := left(btrim(v_audit_reason), 160);
    ELSE
      status := 'FAIL';
      detail := 'audit_class=machinery with a BLANK audit_class_reason. Marking a table machinery '
             || 'is an owner decision WITH A WRITTEN REASON ON THE ROW — an agent may not '
             || 'self-declare one to clear red, and a genuine entity that is merely non-canonical '
             || 'stays audit_class=entity and keeps its honest FAILs. The '
             || 'entity_types_machinery_reason CHECK only forbids NULL, so a whitespace string '
             || 'reaches this row. Write the reason into platform.entity_types.audit_class_reason.';
    END IF; RETURN NEXT;

    -- ── 2. THE GENERATOR NEVER RAN HERE ────────────────────────────────────────────────────────
    -- The CLASS-REGIME lanes (std_* / pub_read) are what `iam._apply_rls_unchecked` emits FOR A
    -- TABLE, and they cannot legitimately exist on a token the generator refuses. `svc_all` and
    -- `platform_admin_all` are NOT evidence of a generator run: both are platform-wide lanes put
    -- on hundreds of tables, machinery included, by their own migrations
    -- (access_gate_platform_admin_truth: "a platform_admin_all policy … on 888 tables"). They are
    -- NAMED in the detail even when this check passes, so nothing about the live door set is
    -- hidden behind a PASS.
    check_name := 'machinery_no_generated_policy';
    DECLARE
      v_class_lanes text[]; v_platform_lanes text[];
    BEGIN
      v_class_lanes := ARRAY(SELECT unnest(COALESCE(v_polnames,'{}'))
                             INTERSECT
                             SELECT unnest(ARRAY['std_select','std_insert','std_update','std_delete','pub_read']));
      v_platform_lanes := ARRAY(SELECT unnest(COALESCE(v_polnames,'{}'))
                                INTERSECT
                                SELECT unnest(ARRAY['svc_all','platform_admin_all']));
      IF v_class_lanes = '{}' THEN
        status := 'PASS';
        detail := CASE WHEN v_platform_lanes = '{}' THEN 'no generated policy'
                       ELSE format('no class lane. The platform-wide lane(s) %s are present and are '
                                || 'not evidence of generation — their own migrations put them on '
                                || 'machinery too.', array_to_string(v_platform_lanes,', ')) END;
      ELSE
        status := 'FAIL';
        detail := format('the generic class regime is LIVE on access machinery: %s. iam.apply_rls '
               || 'refuses a machinery token by construction, so a std_*/pub_read policy here was '
               || 'written by a generation that should never have happened (the 2026-08-24 42P17 '
               || 'class). Fold it into this table''s bespoke, documented contract or drop it.',
                         array_to_string(v_class_lanes,', '));
      END IF;
    END; RETURN NEXT;

    -- ── 3. NO SIGNED-OUT REACH, AND NO UNGATED CLIENT DOOR ─────────────────────────────────────
    -- Deliberately NOT "authenticated holds no privilege": the ratified machinery contract is that
    -- these tables keep their BESPOKE policies, and several of them must be client-readable
    -- through one (`iam.memberships` is read by the member it names). A table grant decides
    -- nothing on its own — RLS does. What is never right on access machinery is a signed-out
    -- reader, or a permissive client policy whose predicate is unconditional, which is a door RLS
    -- cannot gate. The authenticated privileges are named in the detail either way.
    check_name := 'machinery_no_client_grant';
    DECLARE
      v_anon_privs text; v_auth_privs text; v_open text; v_bad text := NULL;
      v_data_class text; v_data_reason text; v_declared text := NULL;
    BEGIN
      SELECT string_agg(DISTINCT g.privilege_type, ', ') INTO v_anon_privs
        FROM information_schema.role_table_grants g
       WHERE g.table_schema = p_schema AND g.table_name = p_table AND g.grantee = 'anon';
      SELECT string_agg(DISTINCT g.privilege_type, ', ') INTO v_auth_privs
        FROM information_schema.role_table_grants g
       WHERE g.table_schema = p_schema AND g.table_name = p_table AND g.grantee = 'authenticated';
      SELECT string_agg(pol.polname, ', ' ORDER BY pol.polname) INTO v_open
        FROM pg_policy pol
       WHERE pol.polrelid = v_tbl AND pol.polpermissive AND pol.polcmd IN ('r','*')
         AND (pol.polroles = '{0}'::oid[]
              OR EXISTS (SELECT 1 FROM pg_roles r
                          WHERE r.oid = ANY(pol.polroles) AND r.rolname IN ('anon','authenticated')))
         AND COALESCE(btrim(pg_get_expr(pol.polqual, pol.polrelid)), 'true') IN ('true','');
      IF v_anon_privs IS NOT NULL THEN
        v_bad := format('anon holds %s on this table — a signed-out client never reaches the '
              || 'inputs the access resolver reads', v_anon_privs);
      END IF;
      -- 🚨 DD-204 (2026-09-14) — A DECLARED PUBLIC CATALOGUE IS NOT AN UNGATED DOOR.
      -- Some access machinery IS published reference data: platform.edge_payload_kind is the
      -- registry of edge payload kinds and the JSON Schema each payload must satisfy, with no
      -- person, organization or customer content in it, and an unconditional signed-in read of it
      -- is the intended shape rather than a hole. What separates a catalogue from a hole is not
      -- the predicate — it is whether anybody DECLARED it. The doctrine already has the column:
      -- platform.entity_types.data_class. So an unconditional client READ policy is accepted here
      -- only when the registry row says data_class = 'public' AND carries a WRITTEN
      -- data_class_reason, and the PASS detail names the policy and quotes the declaration, so the
      -- live door is never hidden behind a bare green. A whitespace reason is not a declaration —
      -- the same gap machinery_has_reason exists for.
      SELECT et.data_class, et.data_class_reason INTO v_data_class, v_data_reason
        FROM platform.entity_types et WHERE et.token = p_token;
      IF v_open IS NOT NULL THEN
        IF v_data_class = 'public' AND COALESCE(btrim(v_data_reason),'') <> '' THEN
          v_declared := format('%s read unconditionally by a client role, and that is DECLARED: '
                    || 'the registry row says data_class=public because — %s',
                            v_open, left(btrim(v_data_reason), 200));
        ELSE
          v_bad := COALESCE(v_bad || '; ', '')
                || format('%s admit a client role with an UNCONDITIONAL predicate — a door RLS '
                       || 'cannot gate. If this table is published reference data, DECLARE it: '
                       || 'set data_class=''public'' with a written data_class_reason on the '
                       || 'platform.entity_types row and record the policy in a migration. An '
                       || 'undeclared unconditional read stays a defect (it reads today as '
                       || 'data_class=%s)', v_open, COALESCE(v_data_class,'<unset>'));
        END IF;
      END IF;
      -- The anon limb above is NEVER waived by a public declaration. Machinery is an input the
      -- access resolver reads; a signed-out reader of it is wrong whatever the contents are.
      IF v_bad IS NULL THEN
        status := 'PASS';
        detail := COALESCE(v_declared || '. ', '')
               || CASE WHEN v_auth_privs IS NULL THEN 'no client grant at all'
                       ELSE format('authenticated holds %s; every client lane is gated by a '
                                || 'bespoke policy or a written public declaration, which is the '
                                || 'ratified machinery contract', v_auth_privs) END;
      ELSE
        status := 'FAIL'; detail := v_bad || ' (DD-200, DD-204).';
      END IF;
    END; RETURN NEXT;

    -- ── 4. THE BESPOKE POLICIES ARE REACHABLE AT ALL ───────────────────────────────────────────
    check_name := 'machinery_rls_on';
    IF COALESCE(v_rls,false) THEN status := 'PASS'; detail := NULL;
    ELSE
      status := 'FAIL';
      detail := 'row security is DISABLED on a table the access resolver reads, so every bespoke '
             || 'policy on it is inert and any role holding a table grant reads every row. '
             || 'ALTER TABLE ... ENABLE ROW LEVEL SECURITY.';
    END IF; RETURN NEXT;

    -- ── 5. THE BASE CONTRACT IS SKIPPED BY NAME, NEVER SILENTLY ────────────────────────────────
    check_name := 'base_contract_not_applicable';
    status := 'SKIP';
    detail := format('audit_class=machinery: iam.apply_rls refuses this token, so the per-variant '
           || 'base contract (§6d-3) and the generated-policy family never run here and are not '
           || 'measured. Registered rls_variant is %s and is what the table would be generated as '
           || 'if it ever stopped being machinery. The four machinery_* checks above are this '
           || 'token''s contract. Reason on the row: %s',
                     COALESCE(v_reg_variant,'<unset>'),
                     COALESCE(NULLIF(btrim(COALESCE(v_audit_reason,'')),''),'<blank>'));
    RETURN NEXT;

    RETURN;
  END IF;

  -- ---- id -------------------------------------------------------------------------------
  -- A ledger row has a POSITION, not an identity: its std_select reads only organization_id
  -- and iam.has_access is never called on it, so a monotonic bigint (the shape
  -- history.row_versions itself uses) is canonical there.
  check_name:='base_id_uuid';
  IF f_id_uuid THEN status:='PASS'; detail:=NULL;
  ELSIF v_variant='ledger' AND f_id_int THEN
    status:='PASS'; detail:='ledger sequence id (integer) — a ledger row has a position, not a shareable identity';
  ELSIF f_id THEN status:='FAIL'; detail:='id not uuid';
  ELSE status:='FAIL'; detail:='missing id'; END IF; RETURN NEXT;

  -- ---- org: UNIVERSAL. The NO-NULL-ORG ruling is platform-wide, every variant. -----------
  -- 🚨 WITH ONE NAMED EXCEPTION, AND IT IS A CLASS DEFINITION, NOT A WAIVER. `reference` is a
  -- global CATALOGUE: rows that belong to no organization and no person. The NO-NULL-ORG ruling is
  -- about a row that belongs to SOMEBODY; a reference row belongs to nobody, which is why
  -- iam.apply_rls REFUSES this variant outright (22023) when organization_id exists. The skip is
  -- therefore backed by a generator refusal AND by the positive assertion
  -- `reference_has_no_scope_columns` below -- never by this gate looking away.
  IF v_variant='reference' THEN
    check_name:='base_organization_id'; status:='SKIP'; detail:='a reference catalogue belongs to no organization; iam.apply_rls refuses the variant if organization_id exists, and reference_has_no_scope_columns asserts it'; RETURN NEXT;
    check_name:='base_org_not_null'; status:='SKIP'; detail:='no organization_id on a reference catalogue, so nothing to require NOT NULL'; RETURN NEXT;
    check_name:='base_org_fk'; status:='SKIP'; detail:='no organization_id on a reference catalogue, so nothing to key to iam.organizations'; RETURN NEXT;
  ELSE
  check_name:='base_organization_id'; status:=CASE WHEN f_org THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN f_org THEN NULL ELSE 'missing organization_id' END; RETURN NEXT;
  check_name:='base_org_not_null'; status:=CASE WHEN NOT f_org THEN 'SKIP' WHEN f_org_nn THEN 'PASS' ELSE 'FAIL' END;
    detail:=CASE WHEN f_org AND NOT f_org_nn THEN 'organization_id must be NOT NULL' END; RETURN NEXT;
  check_name:='base_org_fk'; status:=CASE WHEN fk_org THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN fk_org THEN NULL ELSE 'organization_id missing FK -> iam.organizations' END; RETURN NEXT;
  END IF;

  -- ---- actor pair: entity family only (§6d-1) --------------------------------------------
  check_name:='base_created_by';
  IF f_cb THEN status:='PASS'; detail:=CASE WHEN v_variant='component' THEN 'present but NOT an access key (§6d-1): neutralize from the parent, rename to a domain author column, or drop' END;
  ELSIF v_actor_req THEN status:='FAIL'; detail:='missing created_by';
  ELSIF v_variant='component' THEN status:='SKIP'; detail:='component has no owner column (§6d-1) — access is the parent''s; the actor is in history.row_versions';
  ELSIF v_variant='reference' THEN status:='SKIP'; detail:='a reference row has no creator to name -- the catalogue belongs to the platform, its writes are a door''s, and iam.apply_rls refuses the variant if created_by exists';
  ELSE status:='SKIP'; detail:='ledger actor is a named domain column (e.g. actor_id), never an access key'; END IF; RETURN NEXT;

  check_name:='base_created_by_fk'; status:=CASE WHEN NOT f_cb THEN 'SKIP' WHEN fk_cb THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN f_cb AND NOT fk_cb THEN 'created_by missing FK -> auth.users' END; RETURN NEXT;

  check_name:='base_updated_by';
  IF f_ub THEN status:='PASS'; detail:=NULL;
  ELSIF v_actor_req THEN status:='FAIL'; detail:='missing updated_by';
  ELSIF v_variant='component' THEN status:='SKIP'; detail:='component has no actor columns (§6d-1) — every write is stamped into history.row_versions';
  ELSIF v_variant='reference' THEN status:='SKIP'; detail:='a reference catalogue has no actor columns -- every write goes through a door and the actor is stamped into history.row_versions';
  ELSE status:='SKIP'; detail:='append-only ledger row is never updated'; END IF; RETURN NEXT;

  check_name:='base_updated_by_fk'; status:=CASE WHEN NOT f_ub THEN 'SKIP' WHEN fk_ub THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN f_ub AND NOT fk_ub THEN 'updated_by missing FK -> auth.users' END; RETURN NEXT;

  -- ---- append timestamp: UNIVERSAL. A ledger names it occurred_at (history.row_versions). -
  check_name:='base_created_at';
  IF f_ca_nn THEN status:='PASS'; detail:=NULL;
  ELSIF v_variant='ledger' AND f_occ_nn THEN status:='PASS'; detail:='ledger append timestamp is occurred_at (the history.row_versions shape)';
  ELSE status:='FAIL'; detail:=CASE WHEN v_variant='ledger' THEN 'missing/nullable created_at (or occurred_at)' ELSE 'missing/nullable created_at' END; END IF; RETURN NEXT;

  -- ---- mutation trio: only where the row is user-revised ----------------------------------
  check_name:='base_updated_at';
  IF f_ua_nn THEN status:='PASS'; detail:=NULL;
  ELSIF v_mutation_req THEN status:='FAIL'; detail:='missing/nullable updated_at';
  ELSIF v_variant='component' THEN status:='SKIP'; detail:='non-versioned component — its revision history is its parent''s; adding a stamp nothing maintains is the dead-column anti-pattern (§8)';
  ELSIF v_variant='reference' THEN status:='SKIP'; detail:='a reference catalogue has no client write lane at all (read-only client grant) -- nothing a client does maintains the stamp';
  ELSE status:='SKIP'; detail:='non-versioned ledger — no user-write lane (SELECT-only grants, §6d-2) and nothing maintains the stamp'; END IF; RETURN NEXT;

  check_name:='base_version';
  IF f_ver THEN status:='PASS'; detail:=NULL;
  ELSIF v_mutation_req THEN status:='FAIL'; detail:='missing version int NOT NULL';
  ELSIF v_variant='component' THEN status:='SKIP'; detail:='non-versioned component — nothing reads version (§7: version matters iff is_versioned)';
  ELSIF v_variant='reference' THEN status:='SKIP'; detail:='non-versioned reference catalogue — nothing reads version (§7: version matters iff is_versioned)';
  ELSE status:='SKIP'; detail:='non-versioned ledger — nothing reads version (§7: version matters iff is_versioned)'; END IF; RETURN NEXT;

  check_name:='base_metadata'; status:=CASE WHEN f_meta THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN f_meta THEN NULL ELSE 'missing metadata jsonb NOT NULL' END; RETURN NEXT;

  check_name:='soft_delete';
  IF v_soft_delete THEN status:=CASE WHEN f_del THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN f_del THEN NULL ELSE 'has_soft_delete=true but no deleted_at' END;
  ELSIF f_del THEN status:='PASS'; detail:=NULL;
  ELSIF v_variant='ledger' THEN status:='SKIP'; detail:='a ledger row is never soft-deleted; the ledger RLS lane has no deleted_at prefix (§8 corollary 2)';
  ELSIF v_variant='component' THEN status:='SKIP'; detail:='a component''s lifecycle is its parent''s — the parent''s deleted_at governs the tree, and the component RLS lane emits no deleted_at prefix; soft-deleting a child independently is the "own identity" a component does not have';
  ELSIF v_variant='reference' THEN status:='WARN'; detail:='no deleted_at — a retired catalogue row should be archived, not deleted; the reference read lane emits no deleted_at prefix, so the door and the reader must filter';
  ELSE status:='WARN'; detail:='no deleted_at (has_soft_delete=false)'; END IF; RETURN NEXT;

  -- ---- canonical triggers: required where they have something to do ----------------------
  -- platform._stamp_actor() assigns NEW.created_by UNGUARDED — attaching it to a table with
  -- no actor columns raises 42703 on every write. It can only be required where they exist.
  -- And it stamps auth.uid(), which §6d-1 calls the ENTITY fix: on a component a lingering
  -- created_by must be DERIVED FROM THE PARENT or dropped, never forced to the acting user.
  check_name:='trg_stamp_actor';
  IF v_actor_req THEN status:=CASE WHEN t_stamp THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN t_stamp THEN NULL ELSE 'missing _stamp_actor trigger' END;
  ELSIF f_cb OR f_ub THEN status:='SKIP'; detail:=format('lingering actor column on a %s — §6d-1: derive it from the parent or drop it; attaching _stamp_actor (it stamps auth.uid()) is the entity fix and is wrong here',v_variant);
  ELSE status:='SKIP'; detail:='no actor columns to stamp — platform._stamp_actor raises 42703 on a table without created_by'; END IF; RETURN NEXT;

  -- platform._touch_row() is jsonb-guarded and is a genuine no-op with neither column.
  check_name:='trg_touch_row';
  IF f_ua_nn OR f_ver THEN status:=CASE WHEN t_touch THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN t_touch THEN NULL ELSE 'missing _touch_row trigger' END;
  ELSE status:='SKIP'; detail:='no updated_at/version to maintain — platform._touch_row would be a no-op'; END IF; RETURN NEXT;

  check_name:='trg_version_capture';
  IF v_is_versioned AND v_vstore='custom' THEN
    -- CERTIFIED CUSTOM VERSION STORE (Arman-ratified 2026-08-12): the entity's versioning IS
    -- its declared store (e.g. a publication table product rows FK-pin). Requirements:
    IF t_hist THEN
      status:='FAIL'; detail:='DUPLICATE VERSIONING: version_store=custom but _version_capture also attached — an entity has exactly one versioning system';
    ELSIF v_vstore_ref IS NULL THEN
      status:='FAIL'; detail:='version_store=custom but version_store_ref is NULL';
    ELSE
      SELECT c.relkind INTO v_store_kind FROM pg_class c WHERE c.oid=v_vstore_ref;
      SELECT et.token INTO v_store_token FROM platform.entity_types et WHERE et.table_ref=v_vstore_ref AND et.is_active LIMIT 1;
      SELECT er.fk_column INTO v_store_fk FROM platform.entity_relationships er
        WHERE er.child_type=v_store_token AND er.parent_type=p_token AND er.kind='composition' LIMIT 1;
      SELECT EXISTS (
        SELECT 1 FROM pg_trigger tg JOIN pg_proc pr ON pr.oid=tg.tgfoid
        WHERE tg.tgrelid=v_tbl AND NOT tg.tgisinternal
          AND pr.prosrc ILIKE '%'||v_vstore_ref::text||'%'
      ) INTO v_store_trig;
      SELECT EXISTS (
        SELECT 1 FROM pg_index i
        WHERE i.indrelid=v_vstore_ref AND i.indisunique
          AND v_store_fk = ANY (SELECT a.attname::text FROM pg_attribute a WHERE a.attrelid=v_vstore_ref AND a.attnum = ANY(i.indkey))
          AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=v_vstore_ref AND a.attnum = ANY(i.indkey) AND a.attname ILIKE '%version%')
      ) INTO v_store_uq;
      IF v_store_kind IS DISTINCT FROM 'r' THEN status:='FAIL'; detail:=format('custom store %s is not a plain table',v_vstore_ref::text);
      ELSIF v_store_token IS NULL THEN status:='FAIL'; detail:=format('custom store %s is not an active registered entity',v_vstore_ref::text);
      ELSIF v_store_fk IS NULL THEN status:='FAIL'; detail:=format('custom store token %s has no composition edge to %s',v_store_token,p_token);
      ELSIF NOT v_store_trig THEN status:='FAIL'; detail:=format('no automatic capture trigger on %s.%s writing %s',p_schema,p_table,v_vstore_ref::text);
      ELSIF NOT v_store_uq THEN status:='FAIL'; detail:=format('custom store %s lacks UNIQUE(%s, <version column>)',v_vstore_ref::text,v_store_fk);
      ELSE status:='PASS'; detail:=format('certified custom version store: %s',v_vstore_ref::text);
      END IF;
    END IF;
  ELSIF v_is_versioned THEN
    status:=CASE WHEN t_hist THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN t_hist THEN NULL ELSE 'is_versioned=true but no _version_capture trigger' END;
  ELSE
    status:=CASE WHEN t_hist THEN 'WARN' ELSE 'SKIP' END; detail:=CASE WHEN t_hist THEN '_version_capture present but is_versioned=false' ELSE 'not versioned' END;
  END IF; RETURN NEXT;

  -- ---- visibility -------------------------------------------------------------------------
  -- A component's and a ledger's RLS lane NEVER reads visibility. A column there is a second,
  -- competing access authority (§6d-1) — flag it for removal rather than blessing it.
  check_name:='visibility';
  IF f_vis AND v_variant IN ('component','ledger','reference') THEN
    status:='WARN'; detail:=format('%s carries a stray visibility column — its RLS lane never reads it (§6d-1/§6d-2); a second competing access authority, file the removal',v_variant);
  ELSIF f_vis AND NOT f_vis_enum THEN status:='FAIL'; detail:='visibility not platform.visibility enum (free-text kill)';
  ELSIF f_vis_enum THEN status:=CASE WHEN f_vis_nn THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN f_vis_nn THEN NULL ELSE 'visibility must be NOT NULL' END;
  ELSIF v_variant='component' THEN status:='SKIP'; detail:='component inherits parent access';
  ELSIF v_variant='restricted' THEN status:='PASS'; detail:='restricted server-only table has no visibility column';
  ELSIF v_variant='ledger' THEN status:='SKIP'; detail:='ledger access is org-scoped; the ledger RLS lane never reads visibility';
  ELSIF v_variant='reference' THEN status:='PASS'; detail:='a reference catalogue has no per-row visibility — every signed-in member reads every row, and whether a SIGNED-OUT reader may is the CLASS''s call (data_class=public), never a column''s';
  ELSIF v_is_listed OR v_shareable THEN status:='FAIL'; detail:='listed/shareable entity requires visibility enum';
  ELSE status:='WARN'; detail:='no visibility enum (add + migrate is_public)'; END IF; RETURN NEXT;

  check_name:='legacy_org_id'; status:=CASE WHEN l_orgid THEN 'FAIL' ELSE 'PASS' END; detail:=CASE WHEN l_orgid THEN 'legacy org_id present; drop it' END; RETURN NEXT;
  check_name:='legacy_owner_col';
  IF v_variant='personal' THEN
    status:=CASE WHEN l_owner THEN 'PASS' ELSE 'FAIL' END;
    detail:=CASE WHEN l_owner THEN 'user_id is the personal access owner' ELSE 'personal variant requires user_id' END;
  ELSE
    status:=CASE WHEN l_owner THEN 'WARN' ELSE 'PASS' END;
    detail:=CASE WHEN l_owner THEN 'user_id/owner_id/author_id/creator_id present; created_by is canonical owner' END;
  END IF;
  RETURN NEXT;
  check_name:='legacy_is_public'; status:=CASE WHEN l_ispub THEN 'WARN' ELSE 'PASS' END; detail:=CASE WHEN l_ispub THEN 'is_public present; visibility is the access driver' END; RETURN NEXT;
  check_name:='legacy_is_deleted'; status:=CASE WHEN l_isdel THEN 'WARN' ELSE 'PASS' END; detail:=CASE WHEN l_isdel THEN 'is_deleted present; deleted_at is canonical' END; RETURN NEXT;

  check_name:='rls_enabled'; status:=CASE WHEN v_rls THEN 'PASS' ELSE 'FAIL' END; detail:=NULL; RETURN NEXT;

  -- `platform_admin_all` is emitted by iam.apply_rls for every variant
  -- (2026-08-22, the admin lane). It is canonical, not drift.
  -- EXCEPT where the token declares suppress_platform_admin_lane (SPEC-ACCESS
  -- §3.5, the D19 privacy wall): the generator does not emit it, so expecting it
  -- would FAIL every flipped table. `personal` never had it in the first place.
  IF v_variant='reference' THEN
       -- THE WHOLE POLICY SET OF A CATALOGUE: the service lane, and one read lane whose name says
       -- it belongs to every signed-in member. NO platform_admin_all (a staff READ lane adds
       -- nothing where every member already reads every row, and a staff WRITE lane is exactly the
       -- door this variant exists to force) and NO std_insert/std_update/std_delete at all.
       v_expected:=ARRAY['svc_all','ref_all_members_read'];
       -- The anon lane is the CLASS's, not the variant's (DD-249).
       IF (iam.class_lanes(p_token)).anon_lane THEN v_expected:=array_append(v_expected,'pub_read'); END IF;
  ELSIF v_variant='restricted' AND NOT f_vis THEN v_expected:=ARRAY['svc_all'];
  ELSIF v_variant='ledger' THEN v_expected:=ARRAY['svc_all','platform_admin_all','std_select'];
  ELSIF v_variant='personal' THEN v_expected:=ARRAY['svc_all','std_select','std_insert','std_update','std_delete'];
  ELSE v_expected:=ARRAY['svc_all','platform_admin_all','std_select','std_insert','std_update','std_delete'];
       -- 🚨 DD-249 (2026-09-15) — THE VERIFIER WAS ARGUING WITH ITSELF, AND THAT IS THE
       -- WHOLE DEFECT. `class_lanes_match_policy` below WARNs when a pub_read policy exists on
       -- a class with no anonymous lane; this line, and `pub_read_anon`, FAILed when it was
       -- ABSENT on any table with a visibility column. Both could not be satisfied at once, so
       -- the builder obeyed the louder one (a FAIL beats a WARN) and emitted the lane for
       -- everyone. Certification cannot be the tie-breaker between two of its own checks: the
       -- expectation now asks `iam.class_lanes`, the same authority the WARN asks.
       IF v_variant IN ('entity','system','restricted') AND f_vis_enum
          AND (v_variant = 'system' OR (iam.class_lanes(p_token)).anon_lane)
       THEN v_expected:=array_append(v_expected,'pub_read'); END IF;
       -- THE PUBLIC-PARENT ANON LANE (0580): a flagged component table is
       -- generated WITH pub_read, so the expectation must include it.
       IF v_variant='component' AND v_anon_component THEN v_expected:=array_append(v_expected,'pub_read'); END IF; END IF;
  IF v_suppress_admin AND v_variant NOT IN ('personal','reference') THEN
    v_expected:=ARRAY(SELECT unnest(v_expected) EXCEPT SELECT 'platform_admin_all');
  END IF;
  IF v_client_read_only THEN
    v_expected:=ARRAY(SELECT unnest(v_expected)
      EXCEPT SELECT unnest(ARRAY['platform_admin_all','std_insert','std_update','std_delete']));
  ELSIF v_doors_only THEN
    -- A doors-only schema emits no client write lane at all, and the platform-staff FOR ALL
    -- policy is replaced by its FOR SELECT twin: identical read, no write half.
    v_expected:=ARRAY(SELECT unnest(v_expected)
      EXCEPT SELECT unnest(ARRAY['std_insert','std_update','std_delete']));
    IF 'platform_admin_all' = ANY(v_expected) THEN
      v_expected:=ARRAY(SELECT unnest(v_expected) EXCEPT SELECT 'platform_admin_all');
      v_expected:=array_append(v_expected,'platform_admin_select');
    END IF;
  END IF;
  -- D347: certify the declared restriction, including role and permissiveness.
  SELECT anonymous_read_status INTO v_required_anon_status
    FROM platform.entity_types WHERE token=p_token;
  IF v_required_anon_status IS NOT NULL THEN
    v_expected:=array_append(v_expected,'anon_status_gate');
    check_name:='anonymous_read_status';
    IF v_variant NOT IN ('entity','system','restricted') OR NOT EXISTS (
      SELECT 1 FROM pg_attribute WHERE attrelid=v_tbl AND attname='status'
        AND atttypid='text'::regtype AND NOT attisdropped
    ) THEN
      status:='FAIL'; detail:='anonymous_read_status requires an entity/system/restricted table with a text status column';
    ELSIF EXISTS (
      SELECT 1 FROM pg_policy WHERE polrelid=v_tbl AND polname='anon_status_gate'
        AND NOT polpermissive AND polcmd='r' AND polroles=ARRAY['anon'::regrole::oid]
        AND polwithcheck IS NULL
        AND pg_get_expr(polqual,polrelid)=format('(status = %L::text)',v_required_anon_status)
    ) THEN
      status:='PASS'; detail:='anonymous SELECT is restricted to the declared status; authenticated lanes are unchanged';
    ELSE
      status:='FAIL'; detail:='anon_status_gate is missing or differs from the declared restrictive anon SELECT status predicate; regenerate with iam.apply_rls';
    END IF;
    RETURN NEXT;
  END IF;
  v_unexpected:=ARRAY(SELECT unnest(COALESCE(v_polnames,'{}')) EXCEPT SELECT unnest(v_expected));
  -- 🚨 DD-249 — ONE DEFECT, ONE VOICE. A `pub_read` left on a class with no anonymous lane is
  -- already reported, by name and with the class in the message, by `class_lanes_match_policy`
  -- below. Letting `policies_canonical` ALSO call it "legacy/unexpected" would turn that one
  -- WARN into a second, louder FAIL on all 233 live tokens that carry the lane today — and
  -- those tokens cannot currently be regenerated to clear it, because
  -- `iam.entity_read_kernel_fingerprint()` is stale (measured 2026-09-15: live
  -- c18523c3… vs expected 231f3814…), so every `iam.apply_rls` re-run drops the D249 bound
  -- and rewrites std_select into the unbounded-has_access form. A FAIL nobody can clear is
  -- not a finding, it is noise that buries the 400-odd real ones. So this check stays silent
  -- on exactly the case the WARN owns — and on nothing else: `personal`, `ledger` and the
  -- machinery lanes keep failing on a stray pub_read, because no WARN speaks for them.
  IF 'pub_read' = ANY(v_unexpected)
     AND v_sel IS NOT NULL
     AND v_variant NOT IN ('system','personal','reference')
     AND NOT v_anon_component
     AND NOT (iam.class_lanes(p_token)).anon_lane THEN
    v_unexpected:=ARRAY(SELECT unnest(v_unexpected) EXCEPT SELECT 'pub_read');
  END IF;
  v_missing:=ARRAY(SELECT unnest(v_expected) EXCEPT SELECT unnest(COALESCE(v_polnames,'{}')));
  check_name:='policies_canonical';
  IF v_missing='{}' AND v_unexpected='{}' THEN status:='PASS'; detail:=NULL; ELSE status:='FAIL'; detail:=format('missing=%s legacy/unexpected=%s',v_missing,v_unexpected); END IF; RETURN NEXT;

  -- 🚨 DD-147 (2026-09-12) — THE GENERATOR KEEPS WHAT IT DID NOT AUTHOR, SO SOMETHING HAS TO SAY
  -- WHAT IT KEPT. Until today `iam.apply_rls` dropped EVERY policy on a table before regenerating,
  -- bespoke ones included: in the B-30 rehearsal it removed the signed-out invitation-request lanes
  -- and two migrations put them back by hand. The generator now drops only the names it authors
  -- (`iam.generated_policy_names()`), which means a hand-written policy SURVIVES a regeneration —
  -- and a surviving door that nothing generated and nothing certifies must never be silent.
  -- WARN, not FAIL: a bespoke policy is not by itself a defect (the vault, the anon share-link
  -- resolver and the signed-out invitation lanes are all deliberate). `policies_canonical` above
  -- already FAILs a table whose policy SET is wrong. This check exists to NAME them.
  check_name:='bespoke_policy_present';
  v_bespoke:=ARRAY(SELECT unnest(COALESCE(v_polnames,'{}')) EXCEPT SELECT unnest(iam.generated_policy_names()));
  IF v_bespoke='{}' THEN status:='PASS'; detail:=NULL;
  ELSE status:='WARN';
    detail:=format('%s policy/policies here were NOT authored by iam.apply_rls and are PRESERVED across regeneration: %s. Each is a live door the class regime never emitted and iam.verify_canonical cannot certify. Fold it into the class and name it in iam.supersede_bespoke_policies(...) with a reason, or state why it must stay.',
                   cardinality(v_bespoke), array_to_string(v_bespoke,', '));
  END IF; RETURN NEXT;

  -- THE PRIVACY WALL GATE (SPEC-ACCESS §3.5). Emitted ONLY for a token that
  -- declares the flag, so an unflagged table's finding set is byte-for-byte what
  -- it was. A wall that is only written down is a wall that a regeneration
  -- quietly removes; this is the check that makes it stay up.
  IF v_suppress_admin THEN
    check_name:='privacy_wall';
    IF v_variant IN ('personal','reference') THEN status:='PASS'; detail:=format('the %s variant never had a platform-admin lane',v_variant);
    ELSIF 'platform_admin_all'=ANY(COALESCE(v_polnames,'{}'))
       OR 'platform_admin_select'=ANY(COALESCE(v_polnames,'{}')) THEN status:='FAIL';
      detail:='suppress_platform_admin_lane=true but a platform-staff policy exists — re-run iam.apply_rls';
    ELSIF COALESCE(v_sel,'') LIKE '%is_platform_admin%' OR COALESCE(v_sel,'') LIKE '%is_super_admin%' THEN status:='FAIL';
      detail:='suppress_platform_admin_lane=true but std_select still carries a platform-staff arm — re-run iam.apply_rls';
    ELSE status:='PASS'; detail:=NULL; END IF; RETURN NEXT;
  END IF;

  -- 🚨 THE PERSONAL-ROW WALL (DD-165, 2026-09-12). The CLASS decides which lanes a table emits;
  -- a ROW's `visibility` only narrows them. Before this check, `note` (workbench.notes) was classed
  -- `organization`, kept `platform_admin_all`, and 137 of 4,166 rows marked `personal` by the person
  -- who wrote them were readable by any platform admin — measured, V-43 §A. The class regime had no
  -- opinion about it and nothing FAILed. Arman, 2026-09-12: an admin cannot read a person's private
  -- data. So on every classed table that carries a real `platform.visibility` column and still has a
  -- staff lane, each staff arm must be emitted in its WALLED form — `visibility >= 'internal'` AND
  -- the staff predicate — and this check FAILs when one is not.
  --
  -- What it deliberately does NOT assert: the system-org arm
  -- `(organization_id in (select organization_id from iam.system_orgs where global_readable) and
  --  is_super_admin())`, which `iam.entity_read_expr` mirrors from `iam.has_access_for_base`. That
  -- arm can only ever match a row owned by a global_readable SYSTEM organization — platform content,
  -- never a customer's person — and walling the mirror alone would change no access at all while the
  -- kernel's own copy stayed open, i.e. a wall that only LOOKS like one. 8 rows live behind it today
  -- and they are named in the DD-165 report rather than hidden here. It is recognised by the
  -- `system_orgs` reference in the same expression.
  IF f_vis_enum AND NOT v_suppress_admin AND v_variant <> 'personal' THEN
    check_name:='personal_row_wall';
    DECLARE
      w_admin constant text := '(visibility >= ''internal''::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)';
      w_super constant text := '(visibility >= ''internal''::platform.visibility) AND is_super_admin()';
      r_pol record; v_rest text; v_bad text := NULL; v_admin_ok boolean := NULL;
    BEGIN
      FOR r_pol IN
        SELECT p.polname,
               regexp_replace(coalesce(pg_get_expr(p.polqual, p.polrelid), ''), '\s+', ' ', 'g') AS q
          FROM pg_policy p
         WHERE p.polrelid = v_tbl AND p.polpermissive
         ORDER BY p.polname
      LOOP
        IF r_pol.polname IN ('platform_admin_all','platform_admin_select') THEN
          v_admin_ok := position(w_admin in r_pol.q) > 0;
        END IF;
        v_rest := replace(replace(r_pol.q, w_admin, ''), w_super, '');
        IF v_rest LIKE '%is_platform_admin%' THEN
          v_bad := coalesce(v_bad || '; ', '') || r_pol.polname || ' carries an UNWALLED platform-admin arm';
        ELSIF v_rest LIKE '%is_super_admin%' AND r_pol.q NOT LIKE '%system_orgs%' THEN
          v_bad := coalesce(v_bad || '; ', '') || r_pol.polname || ' carries an UNWALLED super-admin arm';
        END IF;
      END LOOP;
      IF v_admin_ok IS FALSE THEN
        v_bad := coalesce(v_bad || '; ', '') || 'the platform-staff policy USING does not exclude visibility=''personal''';
      END IF;
      IF v_bad IS NULL THEN status:='PASS'; detail:=NULL;
      ELSE status:='FAIL';
        detail:= v_bad || ' — a personal row stays personal inside an organization-class table (DD-165); re-run iam.apply_rls';
      END IF;
    END;
    RETURN NEXT;
  END IF;

  -- 🚨 A COMPONENT LANE IS NEVER WIDER THAN ITS PARENT'S READ (DD-175, 2026-09-12).
  -- A component has no class and no owner column of its own: its access IS its parent's
  -- (db-rules §6d-1). So every door a signed-in client can use on a component table must go
  -- through the parent. Measured live before this check existed: arman@titaniumsuccess.com read
  -- 2,313 docproc.processed_document_pages whose processed_document its own policy refuses, and
  -- admin@admin.com read 106 udt_document_snapshots through a `platform_admin_all` policy sitting
  -- beside a lane that had nothing to do with the parent.
  IF v_variant = 'component' THEN
    DECLARE
      r_pol record; v_bad text := NULL; v_any_parent boolean := false; v_rls boolean;
    BEGIN
      SELECT EXISTS (SELECT 1 FROM platform.entity_relationships er
                      JOIN platform.entity_types pt ON pt.token = er.parent_type AND pt.is_active
                     WHERE er.child_type = p_token AND er.kind IN ('composition','containment')
                       AND EXISTS (SELECT 1 FROM information_schema.columns c
                                    WHERE c.table_schema = p_schema AND c.table_name = p_table
                                      AND c.column_name = er.fk_column))
        INTO v_any_parent;
      IF v_any_parent THEN
        SELECT cl.relrowsecurity INTO v_rls
          FROM pg_class cl JOIN pg_namespace ns ON ns.oid = cl.relnamespace
         WHERE ns.nspname = p_schema AND cl.relname = p_table;
        IF NOT COALESCE(v_rls, false) THEN
          v_bad := 'row security is DISABLED on the table — every signed-in client reads every row, '
                || 'which is the widest lane a component can have';
        ELSE
          FOR r_pol IN
            SELECT pol.polname,
                   regexp_replace(COALESCE(pg_get_expr(pol.polqual, pol.polrelid),'true'),'\s+',' ','g') AS q
              FROM pg_policy pol
              JOIN pg_class cl ON cl.oid = pol.polrelid
              JOIN pg_namespace ns ON ns.oid = cl.relnamespace
             WHERE ns.nspname = p_schema AND cl.relname = p_table
               AND pol.polpermissive AND pol.polcmd IN ('r','*')
               AND NOT EXISTS (SELECT 1 FROM unnest(pol.polroles) rr JOIN pg_roles ro ON ro.oid = rr
                                WHERE ro.rolname = 'service_role')
             ORDER BY pol.polname
          LOOP
            IF EXISTS (
              SELECT 1 FROM platform.entity_relationships er
                JOIN platform.entity_types pt ON pt.token = er.parent_type AND pt.is_active
               WHERE er.child_type = p_token AND er.kind IN ('composition','containment')
                 AND EXISTS (SELECT 1 FROM information_schema.columns c
                              WHERE c.table_schema = p_schema AND c.table_name = p_table
                                AND c.column_name = er.fk_column)
                 AND (r_pol.q LIKE '%accessible_entity_ids(''' || er.parent_type || '''%'
                   OR r_pol.q LIKE '%has_access(''' || er.parent_type || '''%'
                   OR r_pol.q LIKE '%' || pt.schema_name || '.' || pt.table_name || '%')
            ) THEN
              CONTINUE;
            END IF;
            IF (iam.class_lanes(p_token)).platform_admin_lane
               AND (r_pol.q LIKE '%is_platform_admin%' OR r_pol.q LIKE '%is_super_admin%') THEN
              CONTINUE;  -- the staff lane this token's class still keeps
            END IF;
            v_bad := COALESCE(v_bad || '; ', '') || r_pol.polname
                  || ' is a readable door that never asks the parent';
          END LOOP;
          IF NOT EXISTS (SELECT 1 FROM pg_policy pol
                           JOIN pg_class cl ON cl.oid = pol.polrelid
                           JOIN pg_namespace ns ON ns.oid = cl.relnamespace
                          WHERE ns.nspname = p_schema AND cl.relname = p_table
                            AND pol.polpermissive AND pol.polcmd IN ('r','*')
                            AND NOT EXISTS (SELECT 1 FROM unnest(pol.polroles) rr JOIN pg_roles ro ON ro.oid = rr
                                             WHERE ro.rolname = 'service_role')) THEN
            v_bad := COALESCE(v_bad || '; ', '')
                  || 'no permissive read policy for a signed-in client exists at all';
          END IF;
        END IF;
        check_name := 'component_not_wider_than_parent';
        IF v_bad IS NULL THEN status := 'PASS'; detail := NULL;
        ELSE status := 'FAIL';
          detail := v_bad || ' — a component''s access IS its parent''s (db-rules §6d-1, DD-175); '
                 || 'every readable door must resolve the parent. Re-run iam.apply_rls.';
        END IF;
        RETURN NEXT;
      END IF;
    END;
  END IF;

  -- 🚨 CONTAINMENT NEVER CARRIES A PERSONAL ROW (DD-171, 2026-09-12). DD-165 walled every STAFF
  -- arm; it never touched containment, so a child row still inherited its container's reach with no
  -- look at its own visibility. Measured live before this round: a PLAIN MEMBER — no admin.admins
  -- row, no org-admin role — read 8,815 other people's `personal` files, because files.files'
  -- parent-folder arm admitted any non-public file once the folder was viewer-accessible.
  -- Chair, 2026-09-12: a personal row is reachable only by its owner and by explicit direct grants
  -- ON THAT ROW; containment carries the container's reach to `internal` and above, never to
  -- `personal`. So on a table that carries a typed visibility column AND a composition/containment
  -- parent, the emitted parent-FK arm must read `visibility >= 'internal'`, and this check FAILs
  -- when it reads the old `visibility IS NOT NULL` instead (every enum value except public —
  -- `personal` included) or when the walled arm is missing altogether.
  IF f_vis_enum AND v_variant <> 'component' AND v_variant <> 'personal' THEN
    DECLARE
      r_rel record; v_q text; v_bad text := NULL; v_seen boolean := false;
    BEGIN
      v_q := regexp_replace(COALESCE(v_sel,''), '\s+', ' ', 'g');
      FOR r_rel IN
        SELECT er.parent_type, er.fk_column
          FROM platform.entity_relationships er
         WHERE er.child_type = p_token AND er.kind IN ('composition','containment')
           AND EXISTS (SELECT 1 FROM information_schema.columns c
                        WHERE c.table_schema = p_schema AND c.table_name = p_table
                          AND c.column_name = er.fk_column)
         ORDER BY er.parent_type, er.fk_column
      LOOP
        v_seen := true;
        IF v_q LIKE '%(' || r_rel.fk_column || ' IS NOT NULL) AND (visibility IS NOT NULL) AND (visibility <> ''public''%' THEN
          v_bad := COALESCE(v_bad || '; ', '') || r_rel.fk_column
                || ' carries the UNWALLED containment arm (admits visibility=''personal'')';
        ELSIF v_q NOT LIKE '%(' || r_rel.fk_column || ' IS NOT NULL) AND (visibility >= ''internal''::platform.visibility) AND (visibility <> ''public''%' THEN
          v_bad := COALESCE(v_bad || '; ', '') || r_rel.fk_column
                || ' has no walled containment arm at all';
        END IF;
      END LOOP;
      IF v_seen THEN
        check_name := 'containment_respects_personal';
        IF v_bad IS NULL THEN status := 'PASS'; detail := NULL;
        ELSE status := 'FAIL';
          detail := v_bad || ' — containment never carries a personal row (DD-171); re-run iam.apply_rls';
        END IF;
        RETURN NEXT;
      END IF;
    END;
  END IF;

  -- THE PUBLIC-PARENT ANON LANE GATE (0580). Same shape as the privacy wall,
  -- opposite direction: emitted ONLY for a flagged component token, so every
  -- unflagged table's finding set is byte-for-byte what it was. The lane that
  -- is only written down is a lane the next regeneration quietly drops; this
  -- check makes it stay up, and makes it stay CORRECT (keyed on the parent's
  -- public visibility, never a blanket read).
  -- Only marked relations add checks; preserve the unmarked result set.
  IF v_client_read_only THEN
  check_name:='client_read_only_grants';
  IF EXISTS (
    SELECT 1 FROM unnest(ARRAY['public','anon','authenticated']) AS r(role_name)
    WHERE has_table_privilege(r.role_name, v_tbl, 'INSERT')
       OR has_table_privilege(r.role_name, v_tbl, 'UPDATE')
       OR has_table_privilege(r.role_name, v_tbl, 'DELETE')
       OR has_table_privilege(r.role_name, v_tbl, 'TRUNCATE')
       OR has_table_privilege(r.role_name, v_tbl, 'REFERENCES')
       OR has_table_privilege(r.role_name, v_tbl, 'TRIGGER')
       OR has_any_column_privilege(r.role_name, v_tbl, 'INSERT,UPDATE,REFERENCES')
       OR ((v_variant='restricted' AND NOT f_vis)
           AND (has_table_privilege(r.role_name, v_tbl, 'SELECT')
                OR has_any_column_privilege(r.role_name, v_tbl, 'SELECT')))
  ) THEN status:='FAIL'; detail:='effective client table/column mutation or restricted read privilege remains';
  ELSE status:='PASS'; detail:=NULL; END IF; RETURN NEXT;

  check_name:='client_read_only_policies';
  IF EXISTS (
    SELECT 1 FROM pg_policy p CROSS JOIN LATERAL unnest(p.polroles) AS pr(role_oid)
     WHERE p.polrelid=v_tbl AND p.polcmd IN ('*','a','w','d')
       AND (pr.role_oid=0 OR pg_has_role('anon', pr.role_oid, 'USAGE')
            OR pg_has_role('authenticated', pr.role_oid, 'USAGE'))
  ) THEN status:='FAIL'; detail:='applicable client mutation policy remains';
  ELSE status:='PASS'; detail:=NULL; END IF; RETURN NEXT;

  check_name:='client_read_only_registry_guard';
    SELECT p.oid, p.prosrc, p.prosecdef, p.prorettype, l.lanname, p.proconfig
      INTO v_registry_guard_oid, v_registry_guard_source, v_registry_guard_security_definer,
           v_registry_guard_return_type, v_registry_guard_language, v_registry_guard_config
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid=p.pronamespace
      JOIN pg_language l ON l.oid=p.prolang
     WHERE n.nspname='platform' AND p.proname='entity_types_client_read_only_guard'
       AND p.pronargs=0;
    SELECT tg.tgenabled, tg.tgtype, tg.tgqual, tg.tgnargs, tg.tgconstraint
      INTO v_registry_guard_enabled, v_registry_guard_type, v_registry_guard_when,
           v_registry_guard_nargs, v_registry_guard_constraint
      FROM pg_trigger tg
     WHERE tg.tgrelid='platform.entity_types'::regclass
       AND NOT tg.tgisinternal
       AND tg.tgname='entity_types_client_read_only_guard'
       AND tg.tgfoid=v_registry_guard_oid;
    IF v_registry_guard_oid IS NULL THEN status:='FAIL'; detail:='guard function missing';
    ELSIF v_registry_guard_security_definer OR v_registry_guard_return_type IS DISTINCT FROM 'trigger'::regtype
       OR v_registry_guard_language IS DISTINCT FROM 'plpgsql'
       OR v_registry_guard_config IS DISTINCT FROM ARRAY['search_path=pg_catalog, auth, platform'] THEN
      status:='FAIL'; detail:='guard function security, return type, language, or fixed search_path differs';
    ELSIF encode(extensions.digest(v_registry_guard_source, 'sha256'), 'hex') <> v_registry_guard_expected_sha256 THEN
      status:='FAIL'; detail:='guard prosrc digest differs from reviewed literal';
    ELSIF v_registry_guard_enabled IS DISTINCT FROM 'O' OR v_registry_guard_type IS DISTINCT FROM 31
       OR v_registry_guard_when IS NOT NULL OR v_registry_guard_nargs IS DISTINCT FROM 0
       OR v_registry_guard_constraint IS DISTINCT FROM 0 THEN
      status:='FAIL'; detail:='guard trigger must be enabled unconstrained BEFORE ROW INSERT/UPDATE/DELETE without WHEN arguments';
    ELSIF EXISTS (
      SELECT 1 FROM unnest(ARRAY['public','anon','authenticated']) AS r(role_name)
       WHERE has_table_privilege(r.role_name, 'platform.entity_types'::regclass, 'TRUNCATE')
          OR has_table_privilege(r.role_name, 'platform.entity_types'::regclass, 'REFERENCES')
          OR has_table_privilege(r.role_name, 'platform.entity_types'::regclass, 'TRIGGER')
          OR has_function_privilege(r.role_name, v_registry_guard_oid, 'EXECUTE')
    ) THEN status:='FAIL'; detail:='effective client registry TRUNCATE/REFERENCES/TRIGGER or guard EXECUTE privilege remains';
    ELSE status:='PASS'; detail:=NULL; END IF;
  RETURN NEXT;
  END IF;

  IF v_anon_component AND v_variant='component' THEN
    check_name:='component_public_read';
    IF NOT ('pub_read'=ANY(COALESCE(v_polnames,'{}'))) THEN status:='FAIL';
      detail:='component_anon_read_via_public_parent=true but pub_read is missing — re-run iam.apply_rls';
    ELSIF COALESCE(v_pub,'') NOT LIKE '%visibility = ''public''%' THEN status:='FAIL';
      detail:='pub_read exists but is not keyed on the parent''s visibility=public — re-run iam.apply_rls';
    ELSIF NOT has_table_privilege('anon', v_tbl, 'SELECT') THEN status:='FAIL';
      detail:='pub_read exists but anon has no SELECT grant — the policy is unreachable; re-run iam.apply_rls';
    ELSE status:='PASS'; detail:=NULL; END IF; RETURN NEXT;
  END IF;

  IF v_variant IN ('entity','system') THEN
    check_name:='policy_owner_shortcircuit'; status:=CASE WHEN v_sel LIKE v_owner_pat THEN 'PASS' ELSE 'FAIL' END;
      detail:=CASE WHEN v_sel LIKE v_owner_pat THEN NULL ELSE 'std_select missing created_by short-circuit (42501 risk)' END; RETURN NEXT;
    check_name:='policy_uses_has_access'; status:=CASE WHEN v_sel LIKE '%has_access('''||p_token||'''%' THEN 'PASS' ELSE 'FAIL' END;
      detail:=CASE WHEN v_sel LIKE '%has_access('''||p_token||'''%' THEN NULL ELSE format('std_select does not call has_access(%L)',p_token) END; RETURN NEXT;
    check_name:='pub_read_anon';
      -- DD-249: a visibility COLUMN is not a mandate for an anonymous lane. `system` keeps its
      -- unconditional one (the platform's own published catalogue); every other variant is asked
      -- of its class, so that an `organization` table missing pub_read reads as CORRECT here
      -- rather than as the defect it was reported to be until 2026-09-15.
      IF NOT f_vis_enum THEN status:='SKIP'; detail:='no visibility column';
      ELSIF v_variant <> 'system' AND NOT (iam.class_lanes(p_token)).anon_lane THEN
        status:='SKIP';
        detail:=format('class %s emits no anonymous lane, so no pub_read is expected (DD-249)',
                       (iam.class_lanes(p_token)).resolved_class);
      ELSE status:=CASE WHEN 'pub_read'=ANY(v_polnames) THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN 'pub_read'=ANY(v_polnames) THEN NULL ELSE 'missing anon visibility=public policy' END;
      END IF; RETURN NEXT;
    IF v_variant='system' THEN
      check_name:='policy_system_public_read'; status:=CASE WHEN v_sel LIKE '%visibility = ''public''%' THEN 'PASS' ELSE 'FAIL' END;
        detail:=CASE WHEN v_sel LIKE '%visibility = ''public''%' THEN NULL ELSE 'system variant std_select must pass visibility=public (authenticated catalog reads)' END; RETURN NEXT;
    END IF;
  ELSIF v_variant='personal' THEN
    check_name:='policy_personal_owner_only';
    status:=CASE
      WHEN v_sel LIKE '%user_id%'
       AND v_sel LIKE '%auth.uid%'
       AND NOT ('platform_admin_all'=ANY(COALESCE(v_polnames,'{}')))
      THEN 'PASS' ELSE 'FAIL' END;
    detail:=CASE
      WHEN v_sel LIKE '%user_id%'
       AND v_sel LIKE '%auth.uid%'
       AND NOT ('platform_admin_all'=ANY(COALESCE(v_polnames,'{}')))
      THEN NULL ELSE 'personal std_select must require user_id=auth.uid and omit platform_admin_all' END;
    RETURN NEXT;
  ELSIF v_variant='reference' THEN
    -- ── 1. THE ONE READ LANE, AND IT IS OPEN TO EVERY MEMBER ON PURPOSE ──────────────────────
    check_name:='reference_open_read';
    DECLARE r_open record;
    BEGIN
      SELECT p.polname,
             COALESCE(btrim(regexp_replace(COALESCE(pg_get_expr(p.polqual,p.polrelid),'true'),'\s+',' ','g')),'') AS q,
             (SELECT bool_and(ro.rolname='authenticated')
                FROM unnest(p.polroles) rr JOIN pg_roles ro ON ro.oid=rr) AS only_auth
        INTO r_open
        FROM pg_policy p WHERE p.polrelid=v_tbl AND p.polname='ref_all_members_read';
      IF r_open.polname IS NULL THEN
        status:='FAIL'; detail:='the reference read lane ref_all_members_read is missing — a catalogue with no read policy shows nothing and explains nothing. Re-run iam.apply_rls(...,''reference'').';
      ELSIF r_open.q NOT IN ('true','') THEN
        status:='FAIL'; detail:=format('ref_all_members_read carries a predicate (%s). A reference catalogue has nothing to filter a read on — if these rows need filtering they are not reference data and the table is registered as the wrong variant. Re-run iam.apply_rls.', left(r_open.q,120));
      ELSIF NOT COALESCE(r_open.only_auth,false) THEN
        status:='FAIL'; detail:='ref_all_members_read is not TO authenticated alone — whether a SIGNED-OUT reader is welcome is the class''s call (data_class=public emits pub_read), never this lane''s. Re-run iam.apply_rls.';
      ELSE status:='PASS'; detail:='every signed-in member reads the whole catalogue';
      END IF;
    END; RETURN NEXT;

    -- ── 2. WRITES ARE A DOOR'S, AND NO PRIVILEGE SITS BEHIND ONE ─────────────────────────────
    check_name:='reference_no_client_write';
    DECLARE v_w text := NULL; v_polw text := NULL; v_colw text := NULL;
    BEGIN
      SELECT string_agg(DISTINCT r.role_name||':'||pv.priv, ', ') INTO v_w
        FROM unnest(ARRAY['public','anon','authenticated']) AS r(role_name)
        CROSS JOIN unnest(ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) AS pv(priv)
       WHERE has_table_privilege(r.role_name, v_tbl, pv.priv);
      SELECT string_agg(DISTINCT r.role_name, ', ') INTO v_colw
        FROM unnest(ARRAY['public','anon','authenticated']) AS r(role_name)
       WHERE has_any_column_privilege(r.role_name, v_tbl, 'INSERT,UPDATE,REFERENCES');
      SELECT string_agg(DISTINCT p.polname, ', ') INTO v_polw
        FROM pg_policy p CROSS JOIN LATERAL unnest(p.polroles) AS pr(role_oid)
       WHERE p.polrelid=v_tbl AND p.polcmd IN ('*','a','w','d')
         AND (pr.role_oid=0 OR pg_has_role('anon',pr.role_oid,'USAGE') OR pg_has_role('authenticated',pr.role_oid,'USAGE'));
      IF v_w IS NULL AND v_colw IS NULL AND v_polw IS NULL THEN
        status:='PASS'; detail:='no client write privilege and no client write policy — the catalogue''s writes are a door''s';
      ELSE status:='FAIL';
        detail:=format('a reference catalogue is written by a DOOR, never by a client:%s%s%s. iam.apply_table_grants issues the read-only client grant for this variant, so re-running iam.apply_rls(...,''reference'') withdraws it; a hand-fixed grant lasts exactly until the next regeneration (DD-248).',
                       COALESCE(' table privileges '||v_w,''), COALESCE(' column privileges for '||v_colw,''), COALESCE(' write policies '||v_polw,''));
      END IF;
    END; RETURN NEXT;

    -- ── 3. NOTHING TO SCOPE A READ ON, ASSERTED RATHER THAN ASSUMED ──────────────────────────
    check_name:='reference_has_no_scope_columns';
    IF f_org OR l_owner OR f_cb OR f_ub THEN
      status:='FAIL';
      detail:=format('a reference catalogue belongs to no organization and no person, but this table carries %s. Two authorities then disagree about who may read a row: the column says one thing and ref_all_members_read says everyone (§6d-1''s lesson, one variant over). Drop the column, rename it to real domain authorship, or register the table as entity/system/personal.',
        btrim(CASE WHEN f_org THEN 'organization_id ' ELSE '' END
           || CASE WHEN l_owner THEN 'user_id/owner_id/author_id/creator_id ' ELSE '' END
           || CASE WHEN f_cb THEN 'created_by ' ELSE '' END
           || CASE WHEN f_ub THEN 'updated_by' ELSE '' END));
    ELSE status:='PASS'; detail:=NULL; END IF; RETURN NEXT;

    -- ── 4. THE ANON LANE IS THE CLASS'S (DD-249) ─────────────────────────────────────────────
    check_name:='pub_read_anon';
    IF (iam.class_lanes(p_token)).anon_lane THEN
      IF NOT ('pub_read'=ANY(COALESCE(v_polnames,'{}'))) THEN
        status:='FAIL'; detail:='data_class=public but pub_read is missing — re-run iam.apply_rls';
      ELSIF NOT has_any_column_privilege('anon', v_tbl, 'SELECT') THEN
        status:='FAIL'; detail:='pub_read exists but anon holds no SELECT key — a door with no key, which reads as an anonymous lane to everyone auditing the table. Re-run iam.apply_rls.';
      ELSE status:='PASS'; detail:='data_class=public: the catalogue is served to signed-out readers'; END IF;
    ELSIF has_any_column_privilege('anon', v_tbl, 'SELECT') THEN
      status:='FAIL'; detail:=format('class %s emits NO anonymous lane, but anon holds a SELECT key to this catalogue. Either declare it (data_class=public with a written reason) or re-run iam.apply_rls, which withdraws the key.', (iam.class_lanes(p_token)).resolved_class);
    ELSE status:='SKIP'; detail:=format('class %s emits no anonymous lane, so no pub_read is expected (DD-249)', (iam.class_lanes(p_token)).resolved_class);
    END IF; RETURN NEXT;
  ELSIF v_variant='component' THEN
    SELECT parent_type,fk_column INTO v_parent_type,v_parent_col FROM platform.entity_relationships WHERE child_type=p_token AND kind='composition' LIMIT 1;
    check_name:='composition_parent'; status:=CASE WHEN v_parent_type IS NOT NULL THEN 'PASS' ELSE 'FAIL' END; detail:=COALESCE(v_parent_type,'no composition edge'); RETURN NEXT;
    check_name:='policy_defers_parent'; status:=CASE WHEN v_parent_type IS NOT NULL AND (v_sel LIKE '%has_access('''||v_parent_type||'''%' OR v_sel LIKE '%accessible_entity_ids('''||v_parent_type||'''%' OR v_sel LIKE '%accessible_entity_ids('''||p_token||'''%') THEN 'PASS' ELSE 'FAIL' END;
      detail:=CASE WHEN v_parent_type IS NOT NULL AND (v_sel LIKE '%has_access('''||v_parent_type||'''%' OR v_sel LIKE '%accessible_entity_ids('''||v_parent_type||'''%' OR v_sel LIKE '%accessible_entity_ids('''||p_token||'''%') THEN NULL ELSE 'std_select must defer to composition parent' END; RETURN NEXT;
  END IF;

  SELECT resource_type INTO v_reg_rt FROM platform.shareable_resource_registry WHERE table_name=p_table AND schema_name=p_schema AND is_active LIMIT 1;
-- ═══ DD-137b (VISIBILITY-BY-CLASS §3.2 interlock two) — THE CLASS IS RE-DERIVED HERE.
  -- A declaration nothing checks is §1.3's measured price: the registry said one thing and
  -- the policies said another for as long as anyone cared to look.
  DECLARE v_dc platform.data_class; v_ls platform.list_scope; v_lanes platform.lane_set;
  BEGIN
  SELECT et.data_class, et.default_list_scope INTO v_dc, v_ls
    FROM platform.entity_types et WHERE et.token = p_token;
  check_name:='data_class_set';
  -- DD-137b14: a COMPONENT holds NULL and resolves through its parent; a LEDGER holds a class,
  -- because it has no composition parent to resolve through (chair ruling 2026-09-12).
  IF v_variant = 'component' THEN
    status:=CASE WHEN v_dc IS NULL THEN 'PASS' ELSE 'FAIL' END;
    detail:=CASE WHEN v_dc IS NULL
                 THEN format('resolves to %s through its composition parent (§3.1, DD-137b10)',
                             (iam.class_lanes(p_token)).resolved_class)
                 ELSE 'a component may not hold a data_class of its own — its access IS its parent''s (db-rules §6d-1); iam.class_lanes resolves it upward' END;
  ELSIF v_variant = 'reference' THEN
    status:=CASE WHEN v_dc IS NOT NULL THEN 'PASS' ELSE 'FAIL' END;
    detail:=CASE WHEN v_dc IS NOT NULL THEN v_dc::text
                 ELSE 'a reference catalogue has no composition parent, so it must STATE its class — and the only question its class answers is whether a SIGNED-OUT reader is welcome (public) or only signed-in members (organization)' END;
  ELSIF v_variant = 'ledger' THEN
    status:=CASE WHEN v_dc IS NOT NULL THEN 'PASS' ELSE 'FAIL' END;
    detail:=CASE WHEN v_dc IS NOT NULL THEN v_dc::text
                 ELSE 'a ledger has no composition parent, so it must STATE its class — an unset one would have to be guessed, and guessing is how 299 of 311 components kept a platform-staff lane under a private parent (DD-137b10)' END;
  ELSIF v_dc IS NULL THEN status:='FAIL';
    detail:='data_class is unset. Unset is a REFUSAL, not a value (chair R3): iam.apply_rls will not generate for this token and iam.class_lanes resolves it to private.';
  ELSE status:='PASS'; detail:=v_dc::text; END IF; RETURN NEXT;

  check_name:='data_class_derivations';
  IF v_variant = 'personal' AND v_dc IS DISTINCT FROM 'private'::platform.data_class THEN
    status:='FAIL'; detail:=format('§3.1 derivation one: rls_variant=personal emits no org, staff or sharing lane, so the class is private — the registry says %s', v_dc);
  ELSIF v_variant IN ('component','ledger')
        AND (iam.class_lanes(p_token)).resolved_class IN ('private','confidential')
        AND NOT v_suppress_admin THEN
    status:='FAIL'; detail:=format('DD-137b10: this %s resolves to class %s through its ' ||
      'parent, so the platform-staff lane is closed on it too — our own staff go through the ' ||
      'door like anyone. suppress_platform_admin_lane is false.', v_variant,
      (iam.class_lanes(p_token)).resolved_class);
  ELSIF v_variant = 'reference' AND v_dc IN ('private','confidential') THEN
    status:='FAIL'; detail:=format('a reference catalogue is read by EVERY signed-in member by construction — ref_all_members_read is `true` — so class %s is a declaration the live policy contradicts on its face. Its class is `organization` (members only) or `public` (signed-out readers too).', v_dc);
  ELSIF v_dc IN ('private','confidential') AND NOT v_suppress_admin THEN
    status:='FAIL'; detail:=format('§3.1 derivation two: a %s token suppresses the platform-admin lane — our own staff go through the door too. suppress_platform_admin_lane is false.', v_dc);
  ELSE status:='PASS'; detail:=NULL; END IF; RETURN NEXT;

  check_name:='default_list_scope_set';
  IF v_variant IN ('component','ledger','reference') THEN
    status:=CASE WHEN v_ls IS NULL THEN 'PASS' ELSE 'FAIL' END;
    detail:=CASE WHEN v_ls IS NOT NULL THEN format('%s may not hold a default_list_scope',v_variant)
                 WHEN v_variant='reference' THEN 'a reference catalogue has no owner and no organization: "mine" is not expressible and "organization" would be a lie — the whole catalogue IS the list (§3.3)'
                 ELSE 'a component has no owner column, so "mine" is not expressible (§3.3)' END;
  ELSIF v_ls IS NULL THEN status:='FAIL'; detail:='default_list_scope is unset — the screen has no declared landing place (§3.3)';
  ELSE status:='PASS'; detail:=v_ls::text; END IF; RETURN NEXT;

  check_name:='class_lanes_match_policy';
  -- DD-137b10: a component IS asked, through its resolved parent class. Skipping it here is
  -- what let 299 of 311 components keep a platform-staff lane under a private parent.
  IF v_variant = 'personal' OR v_sel IS NULL THEN
    status:='SKIP'; detail:='std_select is not built by the class-aware mirror on this variant';
  ELSE
    v_lanes := iam.class_lanes(p_token);
    IF NOT v_lanes.org_role_lane AND (v_sel LIKE '%role = ANY (ARRAY[''owner''%' OR v_sel LIKE '%is_org_admin%') THEN
      status:='FAIL'; detail:=format('class %s emits NO organization-role read lane, but std_select carries one — re-run iam.apply_rls', v_lanes.resolved_class);
    ELSIF NOT v_lanes.platform_admin_lane AND (v_sel LIKE '%is_platform_admin%' OR v_sel LIKE '%is_super_admin%') THEN
      status:='FAIL'; detail:=format('class %s closes the platform-admin lane, but std_select still carries a platform-staff arm — re-run iam.apply_rls', v_lanes.resolved_class);
    ELSIF NOT v_lanes.platform_admin_lane
      AND ('platform_admin_all'=ANY(COALESCE(v_polnames,'{}'))
        OR 'platform_admin_select'=ANY(COALESCE(v_polnames,'{}'))) THEN
      status:='FAIL'; detail:=format('class %s closes the platform-admin lane, but a ' ||
        'platform_admin_all/platform_admin_select policy still sits beside std_select — that ' ||
        'policy is permissive and grants its command on its own. Re-run iam.apply_rls.', v_lanes.resolved_class);
    ELSIF NOT v_lanes.anon_lane AND 'pub_read'=ANY(COALESCE(v_polnames,'{}')) AND v_variant<>'system' AND NOT v_anon_component THEN
      status:='WARN'; detail:=format('class %s emits no anonymous lane, but a pub_read policy exists', v_lanes.resolved_class);
    ELSE status:='PASS'; detail:=v_lanes.resolved_class::text; END IF;
  END IF; RETURN NEXT;

  -- 🚨 DD-185 (2026-09-13) — THE §6e SYSTEM-ORGANIZATION ARM IS AN EVERY-SIGNED-IN-USER ARM.
  -- `class_lanes_match_policy` above could not see this one: it keys the organization arms on
  -- `org_role_lane` and `platform_admin_lane`, and the global-readable arm is neither — it is
  -- gated on nothing but the row's organization being a global-readable system org. On a
  -- `confidential` token `org_member_lane` is TRUE, so the mirror's own filter kept the arm and
  -- every check in this function said PASS while a non-member read the rows (measured 0 -> 8 on
  -- `audit_exemption`, B-65; live on hr.earning_code, 24 rows). A lane with no check is a lane
  -- that comes back the next time somebody edits the generator.
  check_name:='system_org_arm_respects_class';
  IF v_variant = 'personal' OR v_sel IS NULL THEN
    status:='SKIP'; detail:='no class-built std_select on this variant';
  ELSIF (iam.class_lanes(p_token)).resolved_class IN ('organization','public') THEN
    status:='PASS';
    detail:=format('class %s: the global-readable system-organization arm is this class''s to carry',
                   (iam.class_lanes(p_token)).resolved_class);
  ELSIF v_sel LIKE '%global_readable%' THEN
    status:='FAIL';
    detail:=format('class %s carries NO global-readable system-organization read arm — that arm '
      || 'admits every signed-in account with no membership, role or grant — but std_select still '
      || 'has one. Re-run iam.apply_rls (DD-185).', (iam.class_lanes(p_token)).resolved_class);
  ELSE status:='PASS'; detail:=format('class %s: arm absent', (iam.class_lanes(p_token)).resolved_class);
  END IF; RETURN NEXT;
  END;

  -- 🚨 DD-180 (2026-09-13) — THE SUPER-ADMIN SYSTEM-ORGANIZATION ARM HONOURS A PERSONAL ROW.
  -- DD-165 walled every platform-staff READ arm behind `visibility >= 'internal'` except ONE, and
  -- named it rather than hiding it: the db-rules §6e global-readable system-organization arm gated
  -- on `public.is_super_admin()`. DD-170 walled that arm in the two places that DECIDE the read —
  -- the kernel `iam.has_access_for_base` and the mirror `iam.entity_read_expr` — and regenerated the
  -- four tables that actually held a `personal` row under a system org. But a live policy is TEXT,
  -- written at generation time: 333 `std_select` policies went on carrying the UNWALLED arm, 171 of
  -- them on a table that carries a real `platform.visibility` column and could therefore hold a
  -- `personal` row tomorrow. Measured 2026-09-13: ZERO personal rows sit under a global-readable
  -- system organization today, which is the only reason those 171 exposed nothing — and a mechanism
  -- that is safe only because of what the data happens to be right now is not safe.
  --
  -- `personal_row_wall` cannot see this arm: it exempts, by name, every policy whose expression
  -- mentions `system_orgs` (its own comment says so, and said why — walling the mirror while the
  -- kernel stayed open would have been a wall that only looked like one). DD-170 closed the kernel,
  -- so the exemption has no reason left to exist. THIS CHECK IS THAT EXEMPTION REMOVED: on every
  -- table with a typed `platform.visibility` column it takes each permissive read policy, subtracts
  -- the two WALLED super-admin forms the generator emits, and FAILs on any `is_super_admin` left
  -- over — whichever arm it belongs to and however it is spelled.
  IF f_vis_enum AND v_variant <> 'personal' THEN
    check_name:='super_admin_system_org_arm_walled';
    DECLARE
      -- the walled §6e arm as `iam.entity_read_expr` emits it (entity / system / component)
      w_sysorg constant text := '(organization_id IS NOT NULL) AND (visibility >= ''internal''::platform.visibility) AND ( SELECT is_super_admin() AS is_super_admin) AND (organization_id IN ( SELECT so.organization_id FROM iam.system_orgs so WHERE so.global_readable))';
      -- the walled plain super-admin arm `iam._apply_rls_unchecked` emits (restricted / ledger), DD-165
      w_plain constant text := '(visibility >= ''internal''::platform.visibility) AND is_super_admin()';
      r_pol record; v_rest text; v_bad text := NULL;
    BEGIN
      FOR r_pol IN
        SELECT p.polname,
               regexp_replace(coalesce(pg_get_expr(p.polqual, p.polrelid), ''), '\s+', ' ', 'g') AS q
          FROM pg_policy p
         WHERE p.polrelid = v_tbl AND p.polpermissive AND p.polcmd IN ('r','*')
         ORDER BY p.polname
      LOOP
        v_rest := replace(replace(r_pol.q, w_sysorg, ''), w_plain, '');
        IF v_rest LIKE '%is_super_admin%' THEN
          v_bad := coalesce(v_bad || '; ', '') || r_pol.polname;
        END IF;
      END LOOP;
      IF v_bad IS NULL THEN status:='PASS'; detail:=NULL;
      ELSE status:='FAIL';
        detail:=format('%s carries a super-admin read arm with no `visibility >= ''internal''` wall. '
          || 'A super admin reads a person''s `personal` row the moment one lands under a '
          || 'global-readable system organization (DD-180). Re-run iam.apply_rls.', v_bad);
      END IF;
    END;
    RETURN NEXT;
  END IF;

  check_name:='sharing_token';
  IF v_reg_rt IS NULL THEN status:='SKIP'; detail:='not in shareable_resource_registry';
  ELSIF v_reg_rt=p_token THEN status:='PASS'; detail:=NULL;
  ELSE status:='FAIL'; detail:=format('registry resource_type=%s != token=%s',v_reg_rt,p_token); END IF; RETURN NEXT;
END;

$function$
;
