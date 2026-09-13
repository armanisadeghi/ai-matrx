-- iam_ledger_lane_follows_the_class_dd174a — A LEDGER'S ORGANIZATION LANE IS ITS CLASS'S LANE
-- (DD-174, lane B-57. SECURITY.)
--
-- B-54 generated 19 of B-48's 121 registered tokens and held 8 back BY NAME. Five of those eight
-- are one finding wearing five hats, and it is this one: `iam.class_lanes` decides WHO may read a
-- token, `iam.rls_variant` decides WHAT lanes are emitted, and on a ledger the two disagreed. The
-- variant won, in silence, because nothing compared them.
--
-- THE DISAGREEMENT, MEASURED ON THIS DATABASE (rolled-back rehearsals, 2026-09-12, real identities):
--   billing.usage_ledger          class `private`      — `private` has NO organization lane at all,
--                                 yet the ledger variant emits one unconditionally. An organization
--                                 admin would have read 1,520 rows of OTHER people's spend.
--   rag.retrieval_audit           class `private`      — same shape. What a person searched for is
--                                 personal; the variant published it to their organization.
--   platform.knob_override_audit  class `confidential` — `confidential` grants an organization-member
--                                 lane, but the ledger variant ALSO carries the db-rules §6e
--                                 global-readable system-org arm, which nothing in the class regime
--                                 sanctions. 27 of its 88 rows belong to such an organization, so a
--                                 CONFIDENTIAL audit became readable by every signed-in account:
--                                 three principals went 0 -> 27 and a non-member 17 -> 44.
--
-- THIS FILE FIXES THE CLASS, NOT THE THREE INSTANCES. `iam._apply_rls_unchecked` now reads
-- `iam.class_lanes(p_token)` in its ledger branch:
--   * no organization-member lane (i.e. class `private`)  -> it REFUSES, by name, and says what to
--     do instead (the `personal` variant when the table carries `user_id`, or a corrected class).
--     A generator that cannot express a class must stop, never guess wider.
--   * the global-readable system-org arm is emitted ONLY for `organization` and `public` — the two
--     classes whose lane set is already wider than a single organization.
-- For all 12 `organization`-class ledgers the emitted bytes are unchanged, and the forcing test
-- below asserts that character for character rather than trusting the reading.
--
-- THE SIBLINGS, MEASURED AND NAMED RATHER THAN SWEPT (law 3). Eleven `confidential` ledgers are
-- already generated and carry the system-org arm live today: esign_envelope_event,
-- hr_approval_authority, hr_approval_delegation, hr_calculation_snapshot, hr_derived_grant,
-- hr_disposition_event, hr_role_assignment, hr_workflow_decision, hr_workflow_event,
-- org_admin_audit, platform_continued_access. Every one of them holds ZERO rows in a
-- global_readable system organization (counted 2026-09-12), so the live exposure is exactly zero
-- rows and each one narrows to the new shape the next time it is regenerated. They are not
-- regenerated here: eleven HR and audit tables are eleven access deltas with eleven casts, and
-- this lane's brief is DD-163 and DD-174. Reported, with the count, in the B-57 report.
--
-- Nothing here changes a schema, a grant or a live policy. It changes what the generator EMITS.
set local lock_timeout = '4s';

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
  -- DD-174: the ledger variant's lanes are read off the CLASS, not hardcoded.
  v_ledger_lanes platform.lane_set;
  v_sysorg_read text;
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
    execute format(
      'create policy std_select on %s for select to authenticated using (%s('
      || 'organization_id is not null and ('
      || 'organization_id in (select iam.my_orgs())%s)))',
      v_tbl, v_admin_read, v_sysorg_read);
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

-- ══════════════════════════════════════════════════════════ THE FORCING TEST, RED THEN GREEN
-- Against THIS live database with REAL identities, in a scratch schema created and dropped inside
-- this migration's own transaction. RED emits the pre-DD-174 ledger policy text VERBATIM on the
-- probe and shows a real non-member reading a system-org row of a CONFIDENTIAL ledger; GREEN runs
-- the real `iam.apply_rls`. The real function in the shared working tree is never weakened to
-- produce the RED (_COMMON_BUILD §3). Every arm raises — a forcing test that prints is a wish.
do $ft$
declare
  v_schema text := 'zz_dd174_forcing_' || to_hex((extract(epoch from clock_timestamp())*1000)::bigint);
  v_token  text;
  v_probe  regclass;
  v_sysorg  constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';  -- Matrx System, global_readable
  v_realorg constant uuid := 'f9cb3e35-2a65-4f2a-8525-088d6551071c';  -- arman@titaniumsuccess.com is a member; test@test.com is not
  v_member  constant uuid := '34ed4fc3-c527-4819-99bf-15c26603b261';  -- arman@titaniumsuccess.com
  v_stranger constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14'; -- test@test.com, in neither organization
  n_red_stranger bigint; n_green_stranger bigint; n_green_member bigint;
  v_org_expr text; v_old_expr text; v_caught text;
begin
  v_token := v_schema || '_token';
  execute format('create schema %I', v_schema);
  -- the probe is READ by real identities below, so the scratch schema needs the same USAGE any
  -- real schema has; without it every impersonated count dies 42501 instead of measuring a lane.
  execute format('grant usage on schema %I to authenticated', v_schema);
  -- The canonical builder, not hand-rolled DDL: `ddl_guard` refuses an entity-shaped table created
  -- any other way, and it is right to. It is built `organization` first because
  -- `create_entity_table` certifies the table it builds and a `confidential` ledger cannot certify
  -- until `suppress_platform_admin_lane` is declared — which is DD-137b working exactly as intended.
  perform platform.create_entity_table(
    v_schema, 'probe', v_token, 'DD-174 forcing probe',
    array['note text'], 'ledger', false, false, 'internal', false, false, false, false,
    null::text[], 'organization'::platform.data_class, 'organization'::platform.list_scope);
  update platform.entity_types
     set data_class_reason = 'DD-174 forcing test; this row and its schema are dropped before this migration commits'
   where token = v_token;
  v_probe := format('%I.probe', v_schema)::regclass;
  execute format('insert into %I.probe (organization_id, created_by, visibility, note) values (%L, %L, ''internal'', ''system-org row'')', v_schema, v_sysorg, v_member);
  execute format('insert into %I.probe (organization_id, created_by, visibility, note) values (%L, %L, ''internal'', ''real-org row'')',   v_schema, v_realorg, v_member);

  -- ─────────────── BYTE-IDENTITY for `organization`: the 12 live tokens this file must not move
  select pg_get_expr(polqual, polrelid) into v_org_expr from pg_policy where polrelid = v_probe and polname = 'std_select';
  execute format(
    -- the DD-165 walled admin prefix, because the probe carries a typed visibility column — that
    -- half of the expression is not what this file changes, and pinning it is what makes the
    -- comparison about the ORGANIZATION arms and nothing else.
    'create policy zz_pre_dd174_shape on %I.probe for select to authenticated using (((visibility >= ''internal''::platform.visibility) and (select public.is_platform_admin())) or ('
    || 'organization_id is not null and ('
    || 'organization_id in (select iam.my_orgs())'
    || ' or organization_id in (select organization_id from iam.system_orgs where global_readable))))', v_schema);
  select pg_get_expr(polqual, polrelid) into v_old_expr from pg_policy where polrelid = v_probe and polname = 'zz_pre_dd174_shape';
  if v_org_expr is distinct from v_old_expr then
    raise exception 'DD-174 forcing test: an `organization`-class ledger did NOT come out byte-identical to the pre-DD-174 emit. 12 live tokens would move and nobody approved that. NEW: % OLD: %', v_org_expr, v_old_expr;
  end if;
  execute format('drop policy zz_pre_dd174_shape on %I.probe', v_schema);
  raise notice 'DD-174 GREEN — an `organization`-class ledger emits the pre-DD-174 expression character for character; the 12 live organization ledgers do not move.';

  -- ───────────────────────────────────────────────────────────────────────────────────── RED
  -- The table becomes what platform.knob_override_audit is: a CONFIDENTIAL ledger holding a row
  -- owned by a global_readable system organization. `std_select` is replaced by the pre-DD-174
  -- emit, VERBATIM, in its suppressed-staff-lane form.
  update platform.entity_types set data_class = 'confidential', suppress_platform_admin_lane = true where token = v_token;
  execute format('drop policy std_select on %I.probe', v_schema);
  execute format('drop policy if exists platform_admin_all on %I.probe', v_schema);
  execute format(
    'create policy std_select on %I.probe for select to authenticated using (('
    || 'organization_id is not null and ('
    || 'organization_id in (select iam.my_orgs())'
    || ' or organization_id in (select organization_id from iam.system_orgs where global_readable))))', v_schema);

  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  execute format('select count(*) from %I.probe', v_schema) into n_red_stranger;
  execute 'reset role';
  perform set_config('request.jwt.claims', null, true);
  if n_red_stranger <> 1 then
    raise exception 'DD-174 forcing test: RED did not reproduce — test@test.com, a member of NEITHER organization, read % row(s) of the CONFIDENTIAL probe under the pre-DD-174 ledger lane, expected exactly the 1 system-org row. The test is not testing anything.', n_red_stranger;
  end if;
  raise notice 'DD-174 RED   — under the pre-DD-174 ledger lane test@test.com, a member of neither organization, read the CONFIDENTIAL probe''s system-org row (% row). That is the platform.knob_override_audit defect, reproduced on this database.', n_red_stranger;

  -- ─────────────────────────────────────────────────────────────────────────────────── GREEN
  perform iam.apply_rls(v_schema, 'probe', v_token, 'ledger');
  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  execute format('select count(*) from %I.probe', v_schema) into n_green_stranger;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', v_member, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  execute format('select count(*) from %I.probe', v_schema) into n_green_member;
  execute 'reset role';
  perform set_config('request.jwt.claims', null, true);
  if n_green_stranger <> 0 then
    raise exception 'DD-174 forcing test: GREEN FAILED — after the fix test@test.com still reads % row(s) of a confidential ledger they belong to no organization of.', n_green_stranger;
  end if;
  -- Over-tightening is the same class of defect as a stranger let in (db-rules §6): the member must
  -- keep the row their own organization owns.
  if n_green_member <> 1 then
    raise exception 'DD-174 forcing test: GREEN FAILED THE OTHER WAY — arman@titaniumsuccess.com, a member of the row''s organization, reads % row(s) instead of 1. The fix over-tightened.', n_green_member;
  end if;
  raise notice 'DD-174 GREEN — the confidential ledger: a non-member reads 0 (was 1, the system-org row) and the row''s own organization member still reads 1.';

  -- ─────────────────────────── the refusal a `private` ledger must now get, by name
  update platform.entity_types set data_class = 'private' where token = v_token;
  begin
    perform iam.apply_rls(v_schema, 'probe', v_token, 'ledger');
    raise exception 'DD-174 forcing test: apply_rls GENERATED a `private` ledger — the class has no organization lane and the variant emits nothing else, so this is the billing.usage_ledger defect and it was accepted.';
  exception when others then
    v_caught := sqlerrm;
    if v_caught like 'DD-174 forcing test:%' then raise; end if;
    if v_caught not like '%NO organization-member lane%' then
      raise exception 'DD-174 forcing test: a private ledger was refused with the WRONG error, so the refusal is not the one this file added: %', v_caught;
    end if;
  end;
  raise notice 'DD-174 GREEN — a `private` ledger is refused by name, with the remedy in the message.';

  -- ──────────────────────────────────────────────────────────────────── teardown, verified
  delete from iam.superseded_policy where schema_name = v_schema;
  delete from platform.entity_types where token = v_token;
  execute format('drop schema %I cascade', v_schema);
  if to_regclass(format('%I.probe', v_schema)) is not null
     or exists (select 1 from platform.entity_types where token = v_token) then
    raise exception 'DD-174 forcing test: the teardown left something behind (schema %, token %).', v_schema, v_token;
  end if;
  raise notice 'DD-174 — forcing test torn down: schema % and token % are gone.', v_schema, v_token;
end
$ft$;
