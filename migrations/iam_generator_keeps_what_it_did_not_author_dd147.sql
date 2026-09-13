-- iam_generator_keeps_what_it_did_not_author_dd147 — THE GENERATOR DROPS ONLY WHAT IT AUTHORED
-- (DD-147; db-rules §6d. SECURITY.)
--
-- ═══ THE FACT THIS CLOSES ═════════════════════════════════════════════════════════════════════
-- `iam.apply_rls` opened with:
--
--     for pol in select polname from pg_policy where polrelid = v_tbl::regclass loop
--       execute format('drop policy %I on %s', pol.polname, v_tbl);
--     end loop;
--
-- EVERY policy on the table, with no record anywhere of which of them it had written. In the B-30
-- rehearsal that deleted the signed-out invitation-request lanes on `iam.invitations` and
-- `iam.access_requests`, and two migrations put them back by hand. Nothing warned; nothing could.
-- A generator that silently deletes work it did not do is a hazard wearing the word `apply`.
--
-- Measured on the live database 2026-09-12 before this file ran: **672 policies on 261 relations**
-- carry a name this generator never emits. Five of those relations are ALREADY generator-managed,
-- so five regenerations away from losing a live door with no notice:
--
--   history.row_versions              platform_admin_only
--   platform.activity_log             platform_admin_{insert,update,delete}_only
--   runtime.global_execution_control  platform_admin_only
--   scraper.scrape_parsed_page        owner_{insert,update,delete}
--   seo.location                      platform_admin_{insert,update,delete}_only
--
-- The other 256 relations are not generated today — and every one of them is a table some later
-- lane may register and regenerate. DD-159 is registering 121 of them right now. That is the class.
--
-- ═══ WHAT THIS FILE DOES ══════════════════════════════════════════════════════════════════════
-- 1. `iam.generated_policy_names()` — THE CATALOG. The seven names `iam._apply_rls_unchecked`
--    emits, in one place, so "did I author this?" is a question with an answer.
-- 2. `iam._apply_rls_unchecked` — the drop loop now drops ONLY catalog names. A bespoke policy is
--    KEPT and NAMED in a `raise notice` that tells you exactly how to remove it on purpose.
-- 3. `iam.apply_rls` — a DRIFT GUARD around the emit: it snapshots the policy names before, and
--    refuses (raises) if the generation created a policy whose name is not in the catalog. Without
--    it, adding an eighth emitted name without updating the catalog would make that policy look
--    bespoke forever and survive its own regeneration.
-- 4. `iam.supersede_bespoke_policies(schema, table, names, reason)` — the ONE deliberate way a
--    bespoke policy goes. It drops only the names you pass, refuses a catalog name, refuses a name
--    that is not there, refuses a reason under 60 characters, and writes what it did to
--    `iam.superseded_policy` so the record is not folklore.
-- 5. `iam.verify_canonical` — a new `bespoke_policy_present` check that LISTS them. WARN, not FAIL:
--    the vault's policies, the anon share-link resolver and the signed-out invitation lanes are all
--    bespoke ON PURPOSE. `policies_canonical` already FAILs a wrong policy SET. This one names.
-- 6. A FORCING TEST, RED then GREEN, against this live database in a scratch schema that is torn
--    down and the teardown verified. RED runs the PRE-DD-147 loop verbatim on a scratch table and
--    shows the bespoke policy gone; GREEN runs the real `iam.apply_rls` and shows it kept, named in
--    the notice, and reported by `verify_canonical`. Every arm raises rather than printing.
--
-- 🚨 THIS FILE CHANGES NO LIVE POLICY. It changes what the generator does the NEXT time it runs.

-- ═════════════════════════════════════════════════════════════════ 1. THE CATALOG OF AUTHORED NAMES
-- Every `create policy <name>` in iam._apply_rls_unchecked, and nothing else. Kept as a function
-- rather than a table because it is a property of the CODE below it, not a piece of state that can
-- drift out of date behind everyone's back — and iam.apply_rls asserts the code agrees with it on
-- every single run.
create or replace function iam.generated_policy_names()
returns text[]
language sql
immutable
set search_path to 'pg_catalog','public'
as $$
  select array[
    'svc_all',            -- every variant
    'std_select',         -- every variant except restricted-without-visibility
    'std_insert',         -- personal / component / entity family
    'std_update',         -- personal / component / entity family
    'std_delete',         -- personal / component / entity family
    'platform_admin_all', -- every variant except personal, unless the token suppresses the lane
    'pub_read'            -- anon lane: entity/system/restricted with visibility, flagged components
  ]::text[]
$$;

comment on function iam.generated_policy_names() is
  'DD-147: the names iam._apply_rls_unchecked authors. iam.apply_rls drops only these and KEEPS everything else; iam.apply_rls raises if a generation emits a name that is not in here.';

-- ══════════════════════════════════════════════════ 2. THE RECORD OF WHAT WAS DELIBERATELY REMOVED
create table if not exists iam.superseded_policy (
  id             uuid primary key default gen_random_uuid(),
  schema_name    text not null,
  table_name     text not null,
  policy_name    text not null,
  reason         text not null,
  superseded_at  timestamptz not null default now(),
  superseded_by  text not null default current_user,
  constraint superseded_policy_reason_is_a_sentence check (length(btrim(reason)) >= 60)
);

comment on table iam.superseded_policy is
  'DD-147: every bespoke RLS policy a human deliberately removed through iam.supersede_bespoke_policies, with the reason. The generator never drops a bespoke policy; this table is the only way one goes, and it is why the removal is not folklore.';

-- ═══════════════════════════════════════════ 3. THE ONE DELIBERATE WAY A BESPOKE POLICY EVER GOES
create or replace function iam.supersede_bespoke_policies(
  p_schema       text,
  p_table        text,
  p_policy_names text[],
  p_reason       text
) returns void
language plpgsql
as $fn$
declare
  v_tbl text := format('%I.%I', p_schema, p_table);
  v_len integer := coalesce(length(btrim(p_reason)), 0);
  nm text;
begin
  if to_regclass(v_tbl) is null then
    raise exception 'supersede_bespoke_policies: %.% does not exist. Nothing was dropped.', p_schema, p_table;
  end if;
  if p_policy_names is null or cardinality(p_policy_names) = 0 then
    raise exception
      'supersede_bespoke_policies: name the policies you mean to drop. There is no "all" here on purpose — dropping a set nobody enumerated is exactly the defect DD-147 closes.';
  end if;
  if v_len < 60 then
    raise exception
      'supersede_bespoke_policies: a reason of at least 60 characters is required and % character(s) were given. Say what the policy did and what now does that job instead; "ok" is how an allowlist becomes a place to hide.', v_len;
  end if;

  foreach nm in array p_policy_names loop
    if nm = any (iam.generated_policy_names()) then
      raise exception
        'supersede_bespoke_policies: % is a name iam.apply_rls AUTHORS (%). Regeneration already replaces it; superseding it would only leave the table without a lane until the next run. Nothing was dropped.',
        nm, array_to_string(iam.generated_policy_names(), ', ');
    end if;
    if not exists (
      select 1 from pg_policy p
       where p.polrelid = v_tbl::regclass and p.polname = nm
    ) then
      raise exception
        'supersede_bespoke_policies: %.% has no policy named %. Nothing was dropped — a name that is already gone means the caller is working from a stale reading of the table.',
        p_schema, p_table, nm;
    end if;

    execute format('drop policy %I on %s', nm, v_tbl);
    insert into iam.superseded_policy (schema_name, table_name, policy_name, reason)
    values (p_schema, p_table, nm, p_reason);
    raise notice 'supersede_bespoke_policies: DROPPED % on %.% — %', nm, p_schema, p_table, p_reason;
  end loop;
end
$fn$;

comment on function iam.supersede_bespoke_policies(text,text,text[],text) is
  'DD-147: drop bespoke RLS policies BY NAME, on purpose, with a reason over 60 characters, recorded in iam.superseded_policy. The generator itself never drops one.';

-- ═══════════════════════════════════════ 4. THE GENERATOR: DROP ONLY WHAT YOU AUTHORED
CREATE OR REPLACE FUNCTION iam._apply_rls_unchecked(p_schema text, p_table text, p_token text, p_variant text DEFAULT 'entity'::text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$

declare
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
begin
  select coalesce(is_component, false), coalesce(suppress_platform_admin_lane, false),
         coalesce(component_anon_read_via_public_parent, false), client_excluded_columns
    into v_is_component, v_suppress_admin, v_anon_component, v_excluded
  from platform.entity_types where token = p_token;

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
      execute format('drop policy %I on %s', pol.polname, v_tbl);
    else
      v_kept := array_append(v_kept, pol.polname);
    end if;
  end loop;
  if cardinality(v_kept) > 0 then
    raise notice
      'apply_rls: %.% (token %) — % BESPOKE POLICY/POLICIES KEPT because this generator did not author them: %. They are live doors beside the generated set, and iam.verify_canonical reports them as bespoke_policy_present on every run. To remove one, name it: iam.supersede_bespoke_policies(''%'', ''%'', ARRAY[...], <reason>).',
      p_schema, p_table, p_token, cardinality(v_kept), array_to_string(v_kept, ', '), p_schema, p_table;
  end if;
  execute format(
    'create policy svc_all on %s for all to service_role using (true) with check (true)', v_tbl);
  -- Server-only restricted records stop before every client/staff policy.
  if p_variant = 'restricted' and not v_has_vis then
    perform iam.apply_table_grants(p_schema, p_table, p_variant);
    perform iam.drop_governance_guard(p_schema, p_table);
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
    execute format(
      'create policy std_select on %s for select to authenticated using (%suser_id = (select auth.uid()))',
      v_tbl, v_delpfx);
    execute format(
      'create policy std_insert on %s for insert to authenticated with check (user_id = (select auth.uid()))',
      v_tbl);
    execute format(
      'create policy std_update on %s for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      v_tbl);
    execute format(
      'create policy std_delete on %s for delete to authenticated using (user_id = (select auth.uid()))',
      v_tbl);
    perform iam.apply_table_grants(p_schema, p_table, p_variant);
    perform iam.drop_governance_guard(p_schema, p_table);
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
    execute format(
      'create policy platform_admin_all on %s for all to authenticated '
      || 'using (%s) with check ((select public.is_platform_admin()))',
      v_tbl,
      case when v_vis_enum
           then '(visibility >= ''internal''::platform.visibility) and (select public.is_platform_admin())'
           else '(select public.is_platform_admin())' end);
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
    execute format(
      'create policy std_select on %s for select to authenticated using (%s('
      || 'organization_id is not null and ('
      || 'organization_id in (select iam.my_orgs())'
      || ' or organization_id in (select organization_id from iam.system_orgs where global_readable))))',
      v_tbl, v_admin_read);
    perform iam.apply_table_grants(p_schema, p_table, p_variant);
    perform iam.drop_governance_guard(p_schema, p_table);
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
    execute format(
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
      execute format('create policy pub_read on %s for select to anon using (%s(%s))',
        v_tbl, v_delpfx, v_anon_expr);
      execute format('grant select on %s to anon', v_tbl);
    else
      -- Symmetry: clearing the flag and re-running apply_rls removes the lane
      -- completely (the policy died in the drop loop above; the grant dies here).
      execute format('revoke select on %s from anon', v_tbl);
    end if;

    -- A new row cannot have a direct grant yet, so INSERT must be authorized
    -- through a structural parent. No orphan/created_by lane: a component with
    -- no parent is not a component.
    execute format(
      'create policy std_insert on %s for insert to authenticated with check (%s(%s))',
      v_tbl, v_admin, v_parent_expr_edit);

    execute format(
      'create policy std_update on %s for update to authenticated using (%s(%s) or iam.has_access(%L, id, ''editor'')) '
      || 'with check (%s(%s) or iam.has_access(%L, id, ''editor''))',
      v_tbl, v_admin_read, v_parent_expr_edit, p_token, v_admin, v_parent_expr_edit, p_token);

    execute format(
      'create policy std_delete on %s for delete to authenticated using (%s(%s) or iam.has_access(%L, id, ''editor''))',
      v_tbl, v_admin_read, v_parent_expr_edit, p_token);

    perform iam.apply_table_grants(p_schema, p_table, 'component');
    -- A component has no owner column and no visibility of its own: its access
    -- IS its parent's (THE COMPONENT OWNERSHIP LAW). There is nothing to govern
    -- here, so the governance-column tier deliberately does not apply.
    perform iam.drop_governance_guard(p_schema, p_table);
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
    execute format(
      'create policy std_select on %s for select to authenticated using (%s%s(created_by = (select auth.uid())%s))',
      v_tbl, v_admin_read, v_delpfx, v_su_sel_read);
    if v_has_vis then
      execute format('create policy pub_read on %s for select to anon using (%s visibility = ''public'')',
        v_tbl, v_delpfx);
    end if;
    execute format(
      'create policy std_insert on %s for insert to authenticated with check (%s(created_by = (select auth.uid()) and (%sorganization_id is null or iam.has_org_access(organization_id))))',
      v_tbl, v_admin, v_su_ins);
    execute format(
      'create policy std_update on %s for update to authenticated using (%s created_by = (select auth.uid())%s) with check (%s created_by = (select auth.uid())%s)',
      v_tbl, v_admin_read, v_su_sel_read, v_admin, v_su_sel);
    execute format(
      'create policy std_delete on %s for delete to authenticated using (%s created_by = (select auth.uid())%s)',
      v_tbl, v_admin_read, v_su_sel_read);
    perform iam.apply_table_grants(p_schema, p_table, p_variant);
    -- `restricted` is already owner-or-super-admin on UPDATE — the whole row is
    -- governed, so a per-column tier would be redundant.
    perform iam.drop_governance_guard(p_schema, p_table);
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
  execute format(
    'create policy std_select on %s for select to authenticated using (%s(%s))',
    v_tbl, v_admin_read, iam.entity_read_expr(p_schema, p_table, p_token));

  if v_has_vis then
    execute format('create policy pub_read on %s for select to anon using (%s visibility = ''public'')',
      v_tbl, v_delpfx);
  end if;
  -- NOTE (D146): the INSERT lanes below keep `iam.has_org_access(...)`. A WITH
  -- CHECK is evaluated once per INSERTED row, never across a scan, so the
  -- per-row-definer timeout class does not reach them.
  execute format(
    'create policy std_insert on %s for insert to authenticated with check (%s(created_by = (select auth.uid()) and (organization_id is null or iam.has_org_access(organization_id)%s)))',
    v_tbl, v_admin, v_sysorg_ins);
  execute format(
    'create policy std_update on %s for update to authenticated using (%s(created_by = (select auth.uid()) or iam.has_access(%L, id, ''editor''))) with check (%s(created_by = (select auth.uid()) or iam.has_access(%L, id, ''editor'')))',
    v_tbl, v_admin_read, p_token, v_admin, p_token);
  execute format(
    'create policy std_delete on %s for delete to authenticated using (%s(created_by = (select auth.uid()) or iam.has_access(%L, id, ''admin'')))',
    v_tbl, v_admin_read, p_token);

  perform iam.apply_table_grants(p_schema, p_table, p_variant);

  -- THE GOVERNANCE-COLUMN TIER. RLS is row-level and cannot say "this column
  -- needs a higher level", so the column axis of the tiered model is a
  -- generated BEFORE UPDATE trigger, emitted here beside the policies.
  perform iam.apply_governance_guard(p_schema, p_table, p_token);
end;

$function$

;

-- ═══════════════════════════════════════════ 5a. THE CHECKED WRAPPER + THE CATALOG DRIFT GUARD
CREATE OR REPLACE FUNCTION iam.apply_rls(p_schema text, p_table text, p_token text, p_variant text DEFAULT 'entity'::text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_registered_schema text;
  v_registered_table text;
  v_audit_class text;
  -- DD-147 drift guard: what the table carried before the emit, and what appeared that this
  -- generator does not claim to author.
  v_tbl regclass;
  v_before text[];
  v_stray text[];
BEGIN
  SELECT et.schema_name, et.table_name, coalesce(et.audit_class, 'entity')
    INTO v_registered_schema, v_registered_table, v_audit_class
  FROM platform.entity_types AS et
  WHERE et.token = p_token
    AND et.is_active;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'apply_rls: token % is not an active registered entity', p_token;
  END IF;

  IF v_registered_schema IS DISTINCT FROM p_schema
     OR v_registered_table IS DISTINCT FROM p_table THEN
    RAISE EXCEPTION
      'apply_rls: token % maps to %.%, not %.%',
      p_token, v_registered_schema, v_registered_table, p_schema, p_table;
  END IF;

  IF v_audit_class = 'machinery' THEN
    RAISE EXCEPTION
      'apply_rls: token % (%.%) is access machinery; generic RLS is forbidden because machinery owns inputs consumed by the access resolver',
      p_token, p_schema, p_table;
  END IF;

  -- 🚨 DD-137b (VISIBILITY-BY-CLASS §3.1, chair R3). AN UNSET CLASS IS NOT A VALUE, IT IS A
  -- REFUSAL. Generation is the one place in this system that CAN refuse safely: nobody is
  -- denied their own data by a generation that does not run. The runtime half — the kernel —
  -- resolves unset to `private` instead, because refusing there WOULD deny somebody.
  IF p_variant NOT IN ('component','ledger') AND NOT EXISTS (
       SELECT 1 FROM platform.entity_types et
        WHERE et.token = p_token AND et.data_class IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE = '23502',
      MESSAGE = format('apply_rls: token %s (%s.%s) has no data_class. Which access lanes this table emits is decided by its class, and nobody has decided it.', p_token, p_schema, p_table),
      HINT = 'Set platform.entity_types.data_class (private | confidential | organization | public) with a data_class_reason, then re-run. An unset class is not defaulted to anything: a default here would silently widen a live table.';
  END IF;

  -- 🚨 DD-147 (2026-09-12) — THE DRIFT GUARD OVER THE CATALOG.
  -- `iam._apply_rls_unchecked` now drops only the names in `iam.generated_policy_names()` and KEEPS
  -- everything else. That makes the catalog load-bearing: an eighth emitted name that nobody added
  -- to it would look bespoke, survive its own regeneration, and be preserved forever by the very
  -- function that wrote it. So the catalog is not trusted, it is CHECKED — on every single run,
  -- against what the emit actually produced. A policy that is new AND outside the catalog is a
  -- generator whose catalog is a lie, and this refuses to leave one behind quietly.
  v_tbl := to_regclass(format('%I.%I', p_schema, p_table));
  IF v_tbl IS NULL THEN
    RAISE EXCEPTION 'apply_rls: %.% does not exist', p_schema, p_table;
  END IF;
  SELECT coalesce(array_agg(polname ORDER BY polname), '{}') INTO v_before
    FROM pg_policy WHERE polrelid = v_tbl;

  PERFORM iam._apply_rls_unchecked(p_schema, p_table, p_token, p_variant);

  SELECT coalesce(array_agg(polname ORDER BY polname), '{}') INTO v_stray
    FROM pg_policy
   WHERE polrelid = v_tbl
     AND NOT (polname = ANY (iam.generated_policy_names()))
     AND NOT (polname = ANY (v_before));
  IF cardinality(v_stray) > 0 THEN
    RAISE EXCEPTION
      'apply_rls: the generation of %.% (token %) created policy/policies % that are NOT in iam.generated_policy_names(). The catalog is what tells regeneration which policies are ours to drop, so a name outside it would be treated as bespoke and preserved for ever by the function that wrote it. Add the name to iam.generated_policy_names() in the same change that emits it.',
      p_schema, p_table, p_token, array_to_string(v_stray, ', ');
  END IF;
END
$function$
;

-- ═══════════════════════════════════════════════ 5b. CERTIFICATION NAMES WHAT THE GENERATOR KEPT
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
  -- THE PER-VARIANT BASE CONTRACT (derived above)
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
  SELECT pg_get_expr(polqual,polrelid) INTO v_pub FROM pg_policy WHERE polrelid=v_tbl AND polname='pub_read';

  check_name:='entity_registered';
  IF EXISTS(SELECT 1 FROM platform.entity_types WHERE token=p_token AND schema_name=p_schema AND table_name=p_table)
    THEN status:='PASS'; detail:=v_variant; ELSE status:='FAIL'; detail:=format('no entity_types row for token=%s at %s.%s',p_token,p_schema,p_table); END IF; RETURN NEXT;

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
  check_name:='base_organization_id'; status:=CASE WHEN f_org THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN f_org THEN NULL ELSE 'missing organization_id' END; RETURN NEXT;
  check_name:='base_org_not_null'; status:=CASE WHEN NOT f_org THEN 'SKIP' WHEN f_org_nn THEN 'PASS' ELSE 'FAIL' END;
    detail:=CASE WHEN f_org AND NOT f_org_nn THEN 'organization_id must be NOT NULL' END; RETURN NEXT;
  check_name:='base_org_fk'; status:=CASE WHEN fk_org THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN fk_org THEN NULL ELSE 'organization_id missing FK -> iam.organizations' END; RETURN NEXT;

  -- ---- actor pair: entity family only (§6d-1) --------------------------------------------
  check_name:='base_created_by';
  IF f_cb THEN status:='PASS'; detail:=CASE WHEN v_variant='component' THEN 'present but NOT an access key (§6d-1): neutralize from the parent, rename to a domain author column, or drop' END;
  ELSIF v_actor_req THEN status:='FAIL'; detail:='missing created_by';
  ELSIF v_variant='component' THEN status:='SKIP'; detail:='component has no owner column (§6d-1) — access is the parent''s; the actor is in history.row_versions';
  ELSE status:='SKIP'; detail:='ledger actor is a named domain column (e.g. actor_id), never an access key'; END IF; RETURN NEXT;

  check_name:='base_created_by_fk'; status:=CASE WHEN NOT f_cb THEN 'SKIP' WHEN fk_cb THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN f_cb AND NOT fk_cb THEN 'created_by missing FK -> auth.users' END; RETURN NEXT;

  check_name:='base_updated_by';
  IF f_ub THEN status:='PASS'; detail:=NULL;
  ELSIF v_actor_req THEN status:='FAIL'; detail:='missing updated_by';
  ELSIF v_variant='component' THEN status:='SKIP'; detail:='component has no actor columns (§6d-1) — every write is stamped into history.row_versions';
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
  ELSE status:='SKIP'; detail:='non-versioned ledger — no user-write lane (SELECT-only grants, §6d-2) and nothing maintains the stamp'; END IF; RETURN NEXT;

  check_name:='base_version';
  IF f_ver THEN status:='PASS'; detail:=NULL;
  ELSIF v_mutation_req THEN status:='FAIL'; detail:='missing version int NOT NULL';
  ELSIF v_variant='component' THEN status:='SKIP'; detail:='non-versioned component — nothing reads version (§7: version matters iff is_versioned)';
  ELSE status:='SKIP'; detail:='non-versioned ledger — nothing reads version (§7: version matters iff is_versioned)'; END IF; RETURN NEXT;

  check_name:='base_metadata'; status:=CASE WHEN f_meta THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN f_meta THEN NULL ELSE 'missing metadata jsonb NOT NULL' END; RETURN NEXT;

  check_name:='soft_delete';
  IF v_soft_delete THEN status:=CASE WHEN f_del THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN f_del THEN NULL ELSE 'has_soft_delete=true but no deleted_at' END;
  ELSIF f_del THEN status:='PASS'; detail:=NULL;
  ELSIF v_variant='ledger' THEN status:='SKIP'; detail:='a ledger row is never soft-deleted; the ledger RLS lane has no deleted_at prefix (§8 corollary 2)';
  ELSIF v_variant='component' THEN status:='SKIP'; detail:='a component''s lifecycle is its parent''s — the parent''s deleted_at governs the tree, and the component RLS lane emits no deleted_at prefix; soft-deleting a child independently is the "own identity" a component does not have';
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
  IF f_vis AND v_variant IN ('component','ledger') THEN
    status:='WARN'; detail:=format('%s carries a stray visibility column — its RLS lane never reads it (§6d-1/§6d-2); a second competing access authority, file the removal',v_variant);
  ELSIF f_vis AND NOT f_vis_enum THEN status:='FAIL'; detail:='visibility not platform.visibility enum (free-text kill)';
  ELSIF f_vis_enum THEN status:=CASE WHEN f_vis_nn THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN f_vis_nn THEN NULL ELSE 'visibility must be NOT NULL' END;
  ELSIF v_variant='component' THEN status:='SKIP'; detail:='component inherits parent access';
  ELSIF v_variant='restricted' THEN status:='PASS'; detail:='restricted server-only table has no visibility column';
  ELSIF v_variant='ledger' THEN status:='SKIP'; detail:='ledger access is org-scoped; the ledger RLS lane never reads visibility';
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
  IF v_variant='restricted' AND NOT f_vis THEN v_expected:=ARRAY['svc_all'];
  ELSIF v_variant='ledger' THEN v_expected:=ARRAY['svc_all','platform_admin_all','std_select'];
  ELSIF v_variant='personal' THEN v_expected:=ARRAY['svc_all','std_select','std_insert','std_update','std_delete'];
  ELSE v_expected:=ARRAY['svc_all','platform_admin_all','std_select','std_insert','std_update','std_delete'];
       IF v_variant IN ('entity','system','restricted') AND f_vis_enum THEN v_expected:=array_append(v_expected,'pub_read'); END IF;
       -- THE PUBLIC-PARENT ANON LANE (0580): a flagged component table is
       -- generated WITH pub_read, so the expectation must include it.
       IF v_variant='component' AND v_anon_component THEN v_expected:=array_append(v_expected,'pub_read'); END IF; END IF;
  IF v_suppress_admin AND v_variant<>'personal' THEN
    v_expected:=ARRAY(SELECT unnest(v_expected) EXCEPT SELECT 'platform_admin_all');
  END IF;
  v_unexpected:=ARRAY(SELECT unnest(COALESCE(v_polnames,'{}')) EXCEPT SELECT unnest(v_expected));
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
    IF v_variant='personal' THEN status:='PASS'; detail:='personal variant never had a platform-admin lane';
    ELSIF 'platform_admin_all'=ANY(COALESCE(v_polnames,'{}')) THEN status:='FAIL';
      detail:='suppress_platform_admin_lane=true but platform_admin_all exists — re-run iam.apply_rls';
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
        IF r_pol.polname = 'platform_admin_all' THEN
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
        v_bad := coalesce(v_bad || '; ', '') || 'platform_admin_all USING does not exclude visibility=''personal''';
      END IF;
      IF v_bad IS NULL THEN status:='PASS'; detail:=NULL;
      ELSE status:='FAIL';
        detail:= v_bad || ' — a personal row stays personal inside an organization-class table (DD-165); re-run iam.apply_rls';
      END IF;
    END;
    RETURN NEXT;
  END IF;

  -- THE PUBLIC-PARENT ANON LANE GATE (0580). Same shape as the privacy wall,
  -- opposite direction: emitted ONLY for a flagged component token, so every
  -- unflagged table's finding set is byte-for-byte what it was. The lane that
  -- is only written down is a lane the next regeneration quietly drops; this
  -- check makes it stay up, and makes it stay CORRECT (keyed on the parent's
  -- public visibility, never a blanket read).
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
      IF f_vis_enum THEN status:=CASE WHEN 'pub_read'=ANY(v_polnames) THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN 'pub_read'=ANY(v_polnames) THEN NULL ELSE 'missing anon visibility=public policy' END;
      ELSE status:='SKIP'; detail:='no visibility column'; END IF; RETURN NEXT;
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
  ELSIF v_dc IN ('private','confidential') AND NOT v_suppress_admin THEN
    status:='FAIL'; detail:=format('§3.1 derivation two: a %s token suppresses the platform-admin lane — our own staff go through the door too. suppress_platform_admin_lane is false.', v_dc);
  ELSE status:='PASS'; detail:=NULL; END IF; RETURN NEXT;

  check_name:='default_list_scope_set';
  IF v_variant IN ('component','ledger') THEN
    status:=CASE WHEN v_ls IS NULL THEN 'PASS' ELSE 'FAIL' END;
    detail:=CASE WHEN v_ls IS NULL THEN 'a component has no owner column, so "mine" is not expressible (§3.3)' ELSE 'component/ledger may not hold a default_list_scope' END;
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
    ELSIF NOT v_lanes.platform_admin_lane AND 'platform_admin_all'=ANY(COALESCE(v_polnames,'{}')) THEN
      status:='FAIL'; detail:=format('class %s closes the platform-admin lane, but a ' ||
        'platform_admin_all policy still sits beside std_select — that policy is permissive ' ||
        'and grants everything on its own. Re-run iam.apply_rls.', v_lanes.resolved_class);
    ELSIF NOT v_lanes.anon_lane AND 'pub_read'=ANY(COALESCE(v_polnames,'{}')) AND v_variant<>'system' AND NOT v_anon_component THEN
      status:='WARN'; detail:=format('class %s emits no anonymous lane, but a pub_read policy exists', v_lanes.resolved_class);
    ELSE status:='PASS'; detail:=v_lanes.resolved_class::text; END IF;
  END IF; RETURN NEXT;
  END;

  check_name:='sharing_token';
  IF v_reg_rt IS NULL THEN status:='SKIP'; detail:='not in shareable_resource_registry';
  ELSIF v_reg_rt=p_token THEN status:='PASS'; detail:=NULL;
  ELSE status:='FAIL'; detail:=format('registry resource_type=%s != token=%s',v_reg_rt,p_token); END IF; RETURN NEXT;
END;

$function$

;

-- ══════════════════════════════════════════════════════════ 6. THE FORCING TEST, RED THEN GREEN
-- Against THIS live database, in a scratch schema created and dropped inside this migration's own
-- transaction. RED reproduces the B-30 defect with the pre-DD-147 loop VERBATIM on the same table;
-- GREEN runs the real `iam.apply_rls`. Every arm raises — a forcing test that prints is a wish.
do $ft$
declare
  v_schema text := 'zz_dd147_forcing_' || to_hex((extract(epoch from clock_timestamp())*1000)::bigint);
  v_token  text;
  v_probe  regclass;
  pol      record;
  v_present boolean;
  v_status text;
  v_detail text;
  v_caught text;
begin
  v_token := v_schema || '_token';
  execute format('create schema %I', v_schema);
  -- The canonical builder, not hand-rolled DDL: `ddl_guard` refuses an entity-shaped table created
  -- any other way, and it is right to. This gives the probe the base contract, its registry row and
  -- a real generated policy set in one call.
  perform platform.create_entity_table(
    v_schema, 'probe', v_token, 'DD-147 forcing probe',
    array['note text'], 'entity', false, false, 'internal', false, false, false, false,
    null::text[], 'organization'::platform.data_class, 'organization'::platform.list_scope);
  update platform.entity_types
     set data_class_reason = 'DD-147 forcing test; this row and its schema are dropped before this migration commits'
   where token = v_token;
  v_probe := format('%I.probe', v_schema)::regclass;

  execute format('alter table %I.probe enable row level security', v_schema);
  execute format(
    'create policy zz_bespoke_anon_door on %I.probe for select to anon using (visibility = ''public'')',
    v_schema);

  -- ───────────────────────────────────────────────────────────────────────────────────── RED
  -- The loop exactly as it stood in iam._apply_rls_unchecked until this file replaced it.
  for pol in select polname from pg_policy where polrelid = v_probe loop
    execute format('drop policy %I on %I.probe', pol.polname, v_schema);
  end loop;
  select exists (select 1 from pg_policy where polrelid = v_probe and polname = 'zz_bespoke_anon_door')
    into v_present;
  if v_present then
    raise exception 'DD-147 forcing test: RED did not reproduce — the pre-DD-147 drop loop left zz_bespoke_anon_door in place. The test is not testing anything.';
  end if;
  raise notice 'DD-147 RED   — the pre-DD-147 drop loop DELETED the bespoke policy zz_bespoke_anon_door on %.probe. That is the B-30 defect, reproduced on this database.', v_schema;

  -- ─────────────────────────────────────────────────────────────────────────────────── GREEN
  execute format(
    'create policy zz_bespoke_anon_door on %I.probe for select to anon using (visibility = ''public'')',
    v_schema);
  perform iam.apply_rls(v_schema, 'probe', v_token, 'entity');

  select exists (select 1 from pg_policy where polrelid = v_probe and polname = 'zz_bespoke_anon_door')
    into v_present;
  if not v_present then
    raise exception 'DD-147 forcing test: GREEN FAILED — iam.apply_rls still dropped the bespoke policy zz_bespoke_anon_door. The whole point of this migration did not take.';
  end if;
  if not exists (select 1 from pg_policy where polrelid = v_probe and polname = 'std_select') then
    raise exception 'DD-147 forcing test: GREEN FAILED — iam.apply_rls kept the bespoke policy but did not generate std_select. Preserving everything by generating nothing is not the fix.';
  end if;
  raise notice 'DD-147 GREEN — iam.apply_rls regenerated %.probe (std_select present) and KEPT zz_bespoke_anon_door.', v_schema;

  -- the report half: never silent
  select status, detail into v_status, v_detail
    from iam.verify_canonical(v_schema, 'probe', v_token)
   where check_name = 'bespoke_policy_present';
  if v_status is distinct from 'WARN' or coalesce(v_detail,'') not like '%zz_bespoke_anon_door%' then
    raise exception 'DD-147 forcing test: GREEN FAILED — verify_canonical did not report the kept policy by name (status=%, detail=%).', v_status, v_detail;
  end if;
  raise notice 'DD-147 GREEN — verify_canonical bespoke_policy_present = WARN: %', v_detail;

  -- ─────────────────────────────────────── the deliberate removal, and its three refusals
  begin
    perform iam.supersede_bespoke_policies(v_schema, 'probe', array['std_select'],
      'A reason that is comfortably longer than the sixty characters this function demands of a caller.');
    raise exception 'DD-147 forcing test: supersede_bespoke_policies ACCEPTED a name the generator authors.';
  exception when others then
    v_caught := sqlerrm;
    if v_caught like 'DD-147 forcing test:%' then raise; end if;
    if v_caught not like '%AUTHORS%' then
      raise exception 'DD-147 forcing test: supersede refused a generated name with the wrong error: %', v_caught;
    end if;
  end;
  begin
    perform iam.supersede_bespoke_policies(v_schema, 'probe', array['zz_no_such_policy'],
      'A reason that is comfortably longer than the sixty characters this function demands of a caller.');
    raise exception 'DD-147 forcing test: supersede_bespoke_policies ACCEPTED a policy name that is not on the table.';
  exception when others then
    v_caught := sqlerrm;
    if v_caught like 'DD-147 forcing test:%' then raise; end if;
    if v_caught not like '%has no policy named%' then
      raise exception 'DD-147 forcing test: supersede refused an absent name with the wrong error: %', v_caught;
    end if;
  end;
  begin
    perform iam.supersede_bespoke_policies(v_schema, 'probe', array['zz_bespoke_anon_door'], 'ok');
    raise exception 'DD-147 forcing test: supersede_bespoke_policies ACCEPTED a two-character reason.';
  exception when others then
    v_caught := sqlerrm;
    if v_caught like 'DD-147 forcing test:%' then raise; end if;
    if v_caught not like '%at least 60 characters%' then
      raise exception 'DD-147 forcing test: supersede refused a stub reason with the wrong error: %', v_caught;
    end if;
  end;
  raise notice 'DD-147 GREEN — supersede_bespoke_policies refused a generated name, an absent name and a stub reason.';

  perform iam.supersede_bespoke_policies(v_schema, 'probe', array['zz_bespoke_anon_door'],
    'The DD-147 forcing test supersedes its own probe policy to prove the one deliberate removal path works end to end.');
  if exists (select 1 from pg_policy where polrelid = v_probe and polname = 'zz_bespoke_anon_door') then
    raise exception 'DD-147 forcing test: supersede_bespoke_policies did not drop the policy it named.';
  end if;
  if not exists (select 1 from iam.superseded_policy
                  where schema_name = v_schema and policy_name = 'zz_bespoke_anon_door') then
    raise exception 'DD-147 forcing test: supersede_bespoke_policies dropped the policy without recording it.';
  end if;
  select status into v_status from iam.verify_canonical(v_schema, 'probe', v_token)
   where check_name = 'bespoke_policy_present';
  if v_status is distinct from 'PASS' then
    raise exception 'DD-147 forcing test: bespoke_policy_present did not return to PASS after the supersede (status=%).', v_status;
  end if;
  raise notice 'DD-147 GREEN — the named supersede dropped it, recorded it in iam.superseded_policy, and bespoke_policy_present went back to PASS.';

  -- ──────────────────────────────────────────────────────────────────── teardown, verified
  delete from iam.superseded_policy where schema_name = v_schema;
  delete from platform.entity_types where token = v_token;
  execute format('drop schema %I cascade', v_schema);
  if to_regclass(format('%I.probe', v_schema)) is not null
     or exists (select 1 from platform.entity_types where token = v_token)
     or exists (select 1 from iam.superseded_policy where schema_name = v_schema) then
    raise exception 'DD-147 forcing test: the teardown left something behind (schema %, token %).', v_schema, v_token;
  end if;
  raise notice 'DD-147 — forcing test torn down: schema %, token % and its superseded_policy rows are gone.', v_schema, v_token;
end
$ft$;

-- ════════════════════════════════════════════════════ 7. THE CENSUS, PRINTED AT APPLY TIME
-- The generator-managed relations that carry a bespoke policy TODAY — the ones that were five
-- regenerations away from losing a live door in silence. Printed, not fixed: each is a door whose
-- fate is a reading, and this file's job was to stop the generator deciding it by accident.
do $census$
declare r record; n integer := 0;
begin
  for r in
    select q.sch, q.tbl, array_to_string(q.bespoke, ', ') as bespoke
      from (
        select n.nspname as sch, c.relname as tbl,
               array_agg(p.polname order by p.polname)
                 filter (where not (p.polname = any (iam.generated_policy_names()))) as bespoke,
               bool_or(p.polname = 'std_select') as generated
          from pg_policy p
          join pg_class c on c.oid = p.polrelid
          join pg_namespace n on n.oid = c.relnamespace
         group by 1,2
      ) q
     where q.generated and q.bespoke is not null
     order by 1,2
  loop
    n := n + 1;
    raise notice 'DD-147 census: %.% is generator-managed AND carries bespoke policies: %', r.sch, r.tbl, r.bespoke;
  end loop;
  raise notice 'DD-147 census: % generator-managed relation(s) carry a bespoke policy. From now on a regeneration keeps every one of them and says so.', n;
end
$census$;
