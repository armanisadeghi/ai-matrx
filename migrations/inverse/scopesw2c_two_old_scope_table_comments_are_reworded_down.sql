-- Inverse of migrations/campaign/scopesw2c_two_old_scope_table_comments_are_reworded.sql: the two bodies exactly as production held them on 2026-10-05.

CREATE OR REPLACE FUNCTION iam.apply_table_grants(p_schema text, p_table text, p_variant text DEFAULT 'entity'::text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  v_tbl text := format('%I.%I', p_schema, p_table);
  v_rel regclass := v_tbl::regclass;
  -- READ-LANE V2 (P6): did a signed-in client read this table's id when we started?
  v_v2_had_read boolean := iam.read_lane_v2_auth_reads_id(v_tbl::regclass);
  -- CLIENT READ-ONLY COLUMNS (chair 2026-09-26): declared in platform.entity_types.client_read_only_columns —
  -- a signed-in client may READ them, never insert or update them (server-derived facts such as
  -- users.integration_connections.credential_present). CLIENT DELETES REFUSED: no DELETE grant at all.
  v_ro text[];
  v_del_refused boolean := false;
  v_writable text;
  v_rls_on boolean;
  v_n_pol integer;
  v_live_cols integer;
  v_granted_cols integer;
  v_declared text[];
  v_missing text;
  v_excluded_now text;
  v_kept text;
  v_override text;
  v_column text;
  v_stamped boolean;
  v_exposed boolean;
  v_closed_reason text;
  v_client_read_only boolean := false;
  -- DOORS-ONLY-4 -- THE GRANT HALF OF THE SAME RULING. Without this the policy change is
  -- worthless: iam.apply_rls calls this function at the end of every generation, and the
  -- default arm below issues the entity variant's write grants -- so regenerating a
  -- platform/iam table to stop emitting its write POLICIES would hand its write GRANTS
  -- straight back and reopen all eighty-seven tables the last three lanes closed.
  -- A schema declared doors-only takes the read-only client grant, as a marked relation does.
  v_doors_only boolean := false;
  v_no_client_writes boolean := false;
  v_registry_rows integer;
  v_registry_variant text;
  v_role text;
  v_privilege text;
  -- POLICY-LOCK (2026-09-22): the two rails below ask "what does this table look like NOW".
  -- `iam._apply_rls_unchecked` now calls this function BEFORE it issues any policy DDL — because
  -- every CREATE/ALTER/DROP POLICY freezes sign-in for the rest of the transaction (supautils'
  -- `policy_grants` hook) and this function is 4.2 of `apply_rls`'s 4.5 seconds. So the generator
  -- DECLARES the policy set it is about to write, in a transaction-local setting keyed on this
  -- exact table, and the rails read the declared state instead of the stale catalogue. No signature
  -- changed (a defaulted extra argument would have made every 3-argument call ambiguous, 42725);
  -- any other caller passes nothing and the rails behave exactly as they did.
  v_plan text;
  v_plan_n integer;
  v_plan_anon boolean;
begin
  v_plan := coalesce(nullif(current_setting('iam.rls_plan', true), ''), '');
  if v_plan <> '' and split_part(v_plan, '|', 1) = v_tbl then
    v_plan_n := nullif(split_part(v_plan, '|', 2), '')::integer;
    v_plan_anon := nullif(split_part(v_plan, '|', 3), '')::boolean;
  end if;
  select c.relrowsecurity,
         (select count(*) from pg_policy p where p.polrelid = c.oid)
    into v_rls_on, v_n_pol
  from pg_class c where c.oid = v_rel;

  -- THE SAFETY RAIL. Never widen a table whose only protection is the absence
  -- of a grant.
  if not v_rls_on then
    raise exception
      'apply_table_grants: %.% has RLS DISABLED — refusing to grant. Enable RLS and apply policies first (this table is a hole, not a closed door).',
      p_schema, p_table;
  end if;
  if coalesce(v_plan_n, v_n_pol) = 0 then
    raise exception
      'apply_table_grants: %.% has RLS enabled but ZERO policies — refusing to grant. Apply canonical policies first.%',
      p_schema, p_table,
      case when v_plan_n is not null
        then ' (the caller declared a policy plan for this table in this transaction and it is empty, so nothing would protect the rows this grant opens)'
        else '' end;
  end if;
  -- 🚨 THE SCHEMA'S DECLARED EXPOSURE OUTRANKS EVERYTHING BELOW, INCLUDING THE VARIANT.
  -- A schema declared CLOSED in `platform.schema_client_exposure` receives NO grant to any
  -- client role from any provisioning path — not SELECT, not the variant's write grants, not
  -- `service_role`'s bypass. This is a PLATFORM primitive and not one schema's special case:
  -- the registry is the declaration, this function is the one place every provisioning path
  -- funnels its table grants through, and `platform.provision` re-reads the catalogue at the
  -- end of its transaction to prove the schema is still closed.
  -- Without it, a REVOKE issued after a provision lasts exactly until the next provision into
  -- the same schema — measured on the rehearsal branch 2026-09-17: schema `custom` closed by
  -- four REVOKEs, one `platform.provision(spec)` later the new table read
  -- `authenticated=arwd/postgres, service_role=arwdDxtm/postgres`.
  select e.client_exposed, e.reason into v_exposed, v_closed_reason
    from platform.schema_client_exposure e
   where e.schema_name = p_schema;

  if v_exposed is not null and not v_exposed then
    execute format('revoke all on %s from public', v_tbl);
    execute format('revoke all on %s from anon', v_tbl);
    execute format('revoke all on %s from authenticated', v_tbl);
    execute format('revoke all on %s from service_role', v_tbl);
    -- A table-level REVOKE does not remove a column-level grant, and a column grant is
    -- exactly the shape this function issues elsewhere, so it is removed by name.
    for v_column in select attname from pg_attribute
                     where attrelid = v_rel and attnum > 0 and not attisdropped loop
      execute format('revoke all (%I) on %s from public', v_column, v_tbl);
      execute format('revoke all (%I) on %s from anon', v_column, v_tbl);
      execute format('revoke all (%I) on %s from authenticated', v_column, v_tbl);
      execute format('revoke all (%I) on %s from service_role', v_column, v_tbl);
    end loop;
    -- CLOSED MEANS CLOSED TO CLIENT ROLES (chair ruling 2026-09-25, common-docs/policies/
    -- our-own-admin-database-access.md): the admin system's server door reads as service_role,
    -- so service_role keeps SELECT — read only, nothing else — on every relation, closed or not.
    execute format('grant select on %s to service_role', v_tbl);
    raise notice
      'apply_table_grants: %.% — schema % is declared CLOSED to client roles in platform.schema_client_exposure (%). NO grant was issued to PUBLIC, anon or authenticated and every standing one was revoked; service_role holds SELECT only (the admin door''s read); the % variant''s grants were NOT applied. To open the schema: %',
      p_schema, p_table, p_schema, v_closed_reason, p_variant,
      -- RAISE understands `%` and nothing else — a `%L` here prints the argument with a
      -- literal L stuck to it and hands the reader a statement that does not parse. The
      -- quoting is format()'s job, one level in.
      format('update platform.schema_client_exposure set client_exposed = true, reason = %L, declared_by = %L where schema_name = %L; -- then re-run the provisioner',
             '<why this schema may be reached by client roles>', '<who decided>', p_schema);
    perform iam.read_lane_v2_refuse_withdraw(v_rel, v_v2_had_read);
    return;
  end if;

  select count(*), coalesce(bool_or(et.client_read_only), false), max(et.rls_variant)
    into v_registry_rows, v_client_read_only, v_registry_variant
  from platform.entity_types et where et.schema_name=p_schema and et.table_name=p_table;
  if v_client_read_only and v_registry_rows > 1 then raise exception 'apply_table_grants: duplicate registry rows for marked %.%', p_schema,p_table using errcode='42501'; end if;
  if v_client_read_only then
    -- 1294: a Detail is a registry variant like the rest (iam._apply_rls_unchecked's list already names it).
    if v_registry_variant is null or v_registry_variant not in ('entity','system','restricted','personal','component','ledger','reference','detail') then
      raise exception 'apply_table_grants: readonly registry variant is missing or unknown for %.%', p_schema,p_table using errcode='42501';
    end if;
    if p_variant is distinct from v_registry_variant then
      raise exception 'apply_table_grants: readonly registry variant mismatch for %.% (supplied %, registered %)', p_schema,p_table,p_variant,v_registry_variant using errcode='42501';
    end if;
  end if;

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
      'apply_table_grants: %.% is in a DOORS-ONLY schema but its doors are NOT BUILT YET, so its client write lanes were generated as before. Reason on file: %. Owner: %. The remedy is to build the door and move every caller in the same commit, then delete the platform.doors_only_pending_cutover row -- re-granting by hand would last until the next regeneration.',
      p_schema, p_table,
      (select d.reason from platform.doors_only_pending_cutover d where d.schema_name = p_schema and d.table_name = p_table),
      (select d.owner_lane from platform.doors_only_pending_cutover d where d.schema_name = p_schema and d.table_name = p_table);
  end if;
  v_no_client_writes := v_client_read_only or v_doors_only;

  -- 🚨 DD-248 — THE STAMPED-WRITE REGISTER OUTRANKS THE VARIANT.
  -- A table in `platform.stamped_write_table` carries a column that says who produced
  -- the row (`context.context_item_values.authored_by`). That is worth nothing unless
  -- exactly ONE code path can set it, and a client DML grant is a second path with no
  -- code in it at all. Such a table gets the read-only client grant whatever variant it
  -- is called with, so this generator can never be the thing that re-opens it: B-139
  -- found the cell table declared `component`, which grants insert/update/delete, and
  -- correcting that by hand would have lasted exactly until the next regeneration.
  -- The variant still decides everything else about the table (its access-lane shape as
  -- a component, its policies) — only the write privilege is withheld here.
  select exists (
    select 1 from platform.stamped_write_table s
     where s.schema_name = p_schema and s.table_name = p_table
  ) into v_stamped;

  if p_variant = 'restricted' and not exists (
    select 1 from information_schema.columns where table_schema=p_schema and table_name=p_table and column_name='visibility'
  ) then
    execute format('revoke all on %s from public', v_tbl);
    execute format('revoke all on %s from anon', v_tbl);
    execute format('revoke all on %s from authenticated', v_tbl);
    for v_column in select attname from pg_attribute where attrelid=v_rel and attnum>0 and not attisdropped loop
      execute format('revoke all (%I) on %s from public', v_column, v_tbl);
      execute format('revoke all (%I) on %s from anon', v_column, v_tbl);
      execute format('revoke all (%I) on %s from authenticated', v_column, v_tbl);
    end loop;
    if v_client_read_only then
      foreach v_role in array array['public','anon','authenticated'] loop
        foreach v_privilege in array array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
          if has_table_privilege(v_role,v_rel,v_privilege) then raise exception 'apply_table_grants: readonly effective table mutation remains for % %',v_role,v_privilege using errcode='42501'; end if;
        end loop;
        if has_any_column_privilege(v_role,v_rel,'INSERT,UPDATE,REFERENCES') then raise exception 'apply_table_grants: readonly effective column mutation remains for %',v_role using errcode='42501'; end if;
        if has_table_privilege(v_role,v_rel,'SELECT') or has_any_column_privilege(v_role,v_rel,'SELECT') then raise exception 'apply_table_grants: readonly restricted effective client read remains for %',v_role using errcode='42501'; end if;
      end loop;
    end if;
    execute format('grant all on %s to service_role', v_tbl);
    perform iam.read_lane_v2_refuse_withdraw(v_rel, v_v2_had_read);
    return;
  end if;

  -- ── THE COLUMN-EXCLUSION DESIGN (db-rules §6d-2) ─────────────────────────
  -- Declared in the registry, never inferred from the catalog. `ADD COLUMN`
  -- leaves attacl NULL, so a new column and a deliberately-excluded one are
  -- indistinguishable in the ACLs; inferring the set would silently hide every
  -- future column from clients (proven live, 2026-08-21). The declaration is
  -- the intent; the ACLs are only its artifact.
  select et.client_excluded_columns into v_declared
  from platform.entity_types et
  where et.schema_name = p_schema and et.table_name = p_table
  limit 1;

  if v_declared is not null and cardinality(v_declared) = 0 then
    v_declared := null;
  end if;

  select et.client_read_only_columns, coalesce(et.client_deletes_refused, false)
    into v_ro, v_del_refused
  from platform.entity_types et
  where et.schema_name = p_schema and et.table_name = p_table
  limit 1;
  if v_ro is not null and cardinality(v_ro) = 0 then v_ro := null; end if;
  v_del_refused := coalesce(v_del_refused, false);
  if v_ro is not null then
    select string_agg(x, ', ') into v_missing
    from unnest(v_ro) x
    where not exists (select 1 from pg_attribute a
                       where a.attrelid = v_rel and a.attname = x and a.attnum > 0 and not a.attisdropped);
    if v_missing is not null then
      raise exception
        'apply_table_grants: %.% declares client_read_only_columns that do not exist: % — fix or clear the declaration.',
        p_schema, p_table, v_missing;
    end if;
  end if;

  -- A declared name that is not a live column is a stale declaration, and a
  -- stale declaration is how an exclusion quietly stops excluding anything.
  if v_declared is not null then
    select string_agg(x, ', ') into v_missing
    from unnest(v_declared) x
    where not exists (select 1 from pg_attribute a
                       where a.attrelid = v_rel and a.attname = x
                         and a.attnum > 0 and not a.attisdropped);
    if v_missing is not null then
      raise exception
        'apply_table_grants: %.% declares client_excluded_columns that do not exist: % — fix or clear the declaration (db-rules §6d-2).',
        p_schema, p_table, v_missing;
    end if;
  end if;

  -- The override means, and has always meant, DELIBERATELY RETIRE this design.
  begin
    v_override := current_setting('iam.allow_column_grant_override', true);
  exception when others then
    v_override := null;
  end;

  if v_declared is not null and not v_client_read_only
     and coalesce(v_override, '') in ('on', 'true', '1', 'yes') then
    raise notice
      'apply_table_grants: OVERRIDE ACCEPTED — %.% column-grant design (excluded: %) is being RETIRED for this call; table-level grants replace it. Clear entity_types.client_excluded_columns to make that permanent.',
      p_schema, p_table, array_to_string(v_declared, ', ');
    v_declared := null;
  end if;

  -- An UNDECLARED design still refuses, exactly as the rail did before — that
  -- is the lane protecting every table not yet migrated to a declaration. A table that declares
  -- read-only columns HAS declared its column design.
  if v_declared is null and v_ro is null then
    select count(*),
           count(*) filter (where a.attacl::text like '%authenticated=%')
      into v_live_cols, v_granted_cols
    from pg_attribute a
    where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped;

    if v_granted_cols > 0 and v_granted_cols < v_live_cols
       and coalesce(v_override, '') not in ('on', 'true', '1', 'yes') then
      select string_agg(a.attname, ', ' order by a.attnum) into v_excluded_now
      from pg_attribute a
      where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped
        and (a.attacl is null or a.attacl::text not like '%authenticated=%');
      raise exception
        'apply_table_grants: %.% runs an UNDECLARED column-level grant design for `authenticated` (% of % columns granted; EXCLUDED: %) — refusing to issue table-level grants, which would silently REOPEN those columns. Declare it: UPDATE platform.entity_types SET client_excluded_columns = ARRAY[...] WHERE schema_name=%L AND table_name=%L; then re-run. To retire the design instead: set local iam.allow_column_grant_override = ''on''; (db-rules §6d-2)',
        p_schema, p_table, v_granted_cols, v_live_cols, v_excluded_now, p_schema, p_table;
    end if;
  end if;

  execute format('revoke all on %s from authenticated', v_tbl);

  -- DOORS-ONLY-4: a table-level withdrawal does not remove a COLUMN grant, and a column
  -- grant is exactly the shape this function issues when client_excluded_columns is
  -- declared -- so on some of these tables `authenticated` holds no table privilege and a
  -- fistful of column ones, which has_any_column_privilege (what the doors-only guard asks)
  -- still sees.
  if v_no_client_writes then
    foreach v_role in array array['public','anon','authenticated'] loop
      execute format('revoke insert, update, delete, truncate, references, trigger on %s from %I', v_tbl, v_role);
      for v_column in select attname from pg_attribute where attrelid=v_rel and attnum>0 and not attisdropped loop
        execute format('revoke insert (%I), update (%I), references (%I) on %s from %I',v_column,v_column,v_column,v_tbl,v_role);
      end loop;
    end loop;
  end if;

  -- `reference` joins the read-only client lane for the same reason the ledger is on it: the
  -- rows are written by a door, never by a client. A catalogue whose client grant carried
  -- INSERT/UPDATE/DELETE would make every generated write policy optional -- the privilege would
  -- be there whatever the policy said, and correcting it by hand would last exactly until the next
  -- regeneration (DD-248's lesson).
  if p_variant in ('ledger','reference') or v_stamped or v_no_client_writes then
    -- Append-only org log: reads only; writes belong to a SECURITY DEFINER writer.
    if v_stamped and p_variant <> 'ledger' then
      raise notice
        'apply_table_grants: %.% is a STAMPED-WRITE table (platform.stamped_write_table) — issuing the READ-ONLY client grant instead of the % variant''s write grants. Its writes belong to its declared SECURITY DEFINER doors, which stamp the author from the caller (DD-248).',
        p_schema, p_table, p_variant;
    end if;
    if v_declared is null then
      execute format('grant select on %s to authenticated', v_tbl);
    elsif iam._client_grant_column_list(v_rel, v_declared) is not null then
      execute format('grant select (%s) on %s to authenticated',
                     iam._client_grant_column_list(v_rel, v_declared), v_tbl);
    end if;
    -- (1350g) Every column declared excluded = NO client read at all; format() of a null
    -- column list would otherwise emit  and abort the generation.
  else
    if v_declared is null and v_ro is null then
      execute format('grant select, insert, update%s on %s to authenticated',
                     case when v_del_refused then '' else ', delete' end, v_tbl);
    else
      v_kept := iam._client_grant_column_list(v_rel, coalesce(v_declared, '{}'::text[]));
      v_writable := iam._client_grant_column_list(v_rel, coalesce(v_declared, '{}'::text[]) || coalesce(v_ro, '{}'::text[]));
      -- (1350g) A table whose every column is declared client-excluded is CLOSED to signed-in
      -- clients: no read, no write, no delete. Its reads go through declared doors.
      if v_kept is not null then
        execute format('grant select (%s) on %s to authenticated', v_kept, v_tbl);
      end if;
      if v_writable is not null then
        execute format('grant insert (%1$s), update (%1$s) on %2$s to authenticated', v_writable, v_tbl);
      end if;
      -- DELETE has no column form and needs none: removing a row you are
      -- already permitted to remove reveals nothing about an excluded column.
      if not v_del_refused and v_kept is not null then
        execute format('grant delete on %s to authenticated', v_tbl);
      end if;
    end if;
  end if;

  -- THE ASSERTION IS THE FORCING FUNCTION. This is the one place every provisioning path
  -- funnels its table grants through, so it is the one place that can PROVE the client write
  -- privilege is gone rather than assume the withdrawal above did its job (DOORS-ONLY-4
  -- extends it from the marked-relation flag to the doors-only schema declaration).
  if v_no_client_writes then
    foreach v_role in array array['public','anon','authenticated'] loop
      foreach v_privilege in array array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
        if has_table_privilege(v_role,v_rel,v_privilege) then raise exception 'apply_table_grants: readonly effective table mutation remains for % %',v_role,v_privilege using errcode='42501'; end if;
      end loop;
      if has_any_column_privilege(v_role,v_rel,'INSERT,UPDATE,REFERENCES') then raise exception 'apply_table_grants: readonly effective column mutation remains for %',v_role using errcode='42501'; end if;
    end loop;
  end if;

  if v_declared is not null then
    raise notice
      'apply_table_grants: %.% column-exclusion design PRESERVED (withheld from authenticated: %).',
      p_schema, p_table, array_to_string(v_declared, ', ');
  end if;
  if v_ro is not null then
    raise notice 'apply_table_grants: %.% client read-only columns (select only for authenticated): %.',
      p_schema, p_table, array_to_string(v_ro, ', ');
  end if;
  -- The declarations are forcing functions, not wishes: prove them on the privileges just issued.
  if v_del_refused and has_table_privilege('authenticated', v_rel, 'DELETE') then
    raise exception 'apply_table_grants: %.% declares client_deletes_refused but authenticated still holds DELETE', p_schema, p_table using errcode = '42501';
  end if;
  if v_ro is not null and exists (select 1 from unnest(v_ro) x
                                    where has_column_privilege('authenticated', v_rel, x, 'INSERT')
                                       or has_column_privilege('authenticated', v_rel, x, 'UPDATE')) then
    raise exception 'apply_table_grants: %.% declares client_read_only_columns but authenticated can still write one of them', p_schema, p_table using errcode = '42501';
  end if;

  -- 🚨 THE OPT-IN ANONYMOUS READ LANE'S KEY (chair ruling 2026-09-22, DD-249 / R12).
  -- A policy is the access RULE; the grant is the ACCESS. platform.categories' anonymous
  -- lane has been live on THIRTEEN hand-written column ACLs that nobody declared and nothing
  -- regenerates -- the same shape as the iam.api_keys column-exclusion design DOORS-ONLY-4
  -- had to declare before that table could regenerate. It is the generator's output now.
  --
  -- The excluded set is DECLARED, never inferred, for db-rules 6d-2's reason: ADD COLUMN
  -- leaves attacl NULL, so inferring it would hand every future column to anonymous readers
  -- the day somebody adds one.
  --
  -- 🚨 IT GRANTS AND NEVER REVOKES, deliberately. The symmetric half -- withdrawing anon's
  -- SELECT where the flag is absent -- would take away four OTHER live anonymous lanes that
  -- DD-249 measured and this lane has not censused (app.definition 81 public rows,
  -- education.learn_doc 11, agent.message_template 8, workbench.notes 2). That withdrawal
  -- belongs with that census, not with this flag.
  declare
    v_anon_optin boolean;
    v_anon_excluded text[];
  begin
    select coalesce(et.client_anonymous_public_read, false), et.client_anonymous_excluded_columns
      into v_anon_optin, v_anon_excluded
      from platform.entity_types et
     where et.schema_name = p_schema and et.table_name = p_table and et.is_active
     limit 1;
    if coalesce(v_anon_optin, false) then
      if not platform.schema_is_client_exposed(p_schema) then
        raise notice
          'apply_table_grants: %.% declares client_anonymous_public_read but schema % is CLOSED to client roles in platform.schema_client_exposure -- the pub_read rule exists and NO anon grant was issued, so the anonymous lane is inert until the schema is opened.',
          p_schema, p_table, p_schema;
      elsif v_anon_excluded is null then
        execute format('grant select on %s to anon', v_tbl);
      else
        execute format('grant select (%s) on %s to anon',
                       iam._client_grant_column_list(v_rel, v_anon_excluded), v_tbl);
        raise notice
          'apply_table_grants: %.% anonymous read lane issued, withholding from anon: %.',
          p_schema, p_table, array_to_string(v_anon_excluded, ', ');
      end if;
    end if;
  end;
  -- 🚨 THE SYMMETRIC HALF OF THE OPT-IN (lane ANON-LANES, DD-249 / R12). The block above
  -- GRANTS the anonymous read lane to a table that declared it. This one is what makes that
  -- flag a CONTRACT rather than an additive convenience: on a REGISTERED table whose class
  -- resolves no anonymous lane and which declared none, an `anon` SELECT grant is access
  -- nobody decided, and it does not survive a generation.
  --
  -- A KEY WITH NO DOOR is revoked on sight: no permissive SELECT-capable policy reaches
  -- `anon`, so the grant cannot return one row, and leaving it is how the catalogue starts
  -- lying about who can read what.
  --
  -- A LIVE LANE IS NEVER SILENTLY DELETED. If a policy DOES reach `anon`, a signed-out page
  -- is probably reading this table right now, so the generator REFUSES and names both ways
  -- out -- the same shape as the UNDECLARED column-grant refusal above (db-rules 6d-2).
  -- `anon_lane_pending_withdrawal_reason` downgrades that refusal to a notice and can only
  -- KEEP what the table already has.
  declare
    v_w_token text;
    v_w_optin boolean;
    v_w_pending text;
    v_w_live_policy boolean;
    v_w_col text;
  begin
    select et.token, coalesce(et.client_anonymous_public_read, false),
           et.anon_lane_pending_withdrawal_reason
      into v_w_token, v_w_optin, v_w_pending
      from platform.entity_types et
     where et.schema_name = p_schema and et.table_name = p_table and et.is_active
     limit 1;
    -- An UNREGISTERED table has no declaration to make and no class to resolve, so this arm
    -- says nothing about it. Revoking there would be this function guessing.
    if v_w_token is not null
       and not coalesce(v_w_optin, false)
       and not (iam.class_lanes(v_w_token)).anon_lane
       and (has_table_privilege('anon', v_rel, 'SELECT')
            or has_any_column_privilege('anon', v_rel, 'SELECT')) then
      -- POLICY-LOCK: when the generator has declared its plan, the question "will a permissive
      -- anon SELECT policy reach this table" is answered by the plan, not by the catalogue — the
      -- catalogue still holds the policies the generator is about to drop, and reading it here
      -- would refuse a regeneration for a lane that is being removed in this very transaction.
      if v_plan_anon is not null then
        v_w_live_policy := v_plan_anon;
      else
        select exists (
          select 1 from pg_policy p
           where p.polrelid = v_rel and p.polpermissive and p.polcmd in ('r','*')
             and (p.polroles = '{0}'::oid[]
                  or 'anon' = any(select pg_get_userbyid(x) from unnest(p.polroles) x)))
          into v_w_live_policy;
      end if;
      if v_w_pending is not null then
        raise notice
          'apply_table_grants: %.% carries an anonymous read grant it never declared, and a PENDING WITHDRAWAL row is keeping it: %. It was NOT revoked and NOT widened. The remedy is one of the two below, then clear entity_types.anon_lane_pending_withdrawal_reason.',
          p_schema, p_table, v_w_pending;
      elsif v_w_live_policy then
        raise exception
          'apply_table_grants: %.% has a LIVE anonymous read lane it never declared -- `anon` holds SELECT and a permissive SELECT policy reaches it, so a signed-out page may be reading this table right now. Refusing to regenerate rather than silently deleting a public page. TWO legal fixes. (1) THE ROWS ARE MEANT FOR ANONYMOUS READERS: UPDATE platform.entity_types SET client_anonymous_public_read = true, client_anonymous_public_read_reason = %L, client_anonymous_excluded_columns = ARRAY[...] WHERE schema_name = %L AND table_name = %L; -- the array is the columns `anon` must NOT hold, declared not inferred (db-rules 6d-2). (2) NOBODY READS IT ANONYMOUSLY: drop the policy that reaches `anon` and revoke its grant in a migration with an inverse. If neither can be decided today, record WHY in entity_types.anon_lane_pending_withdrawal_reason and this refusal becomes a notice.',
          p_schema, p_table, '<which signed-out surface serves these rows>', p_schema, p_table
          using errcode = '42501';
      else
        execute format('revoke select on %s from anon', v_tbl);
        for v_w_col in select attname from pg_attribute
                        where attrelid = v_rel and attnum > 0 and not attisdropped loop
          execute format('revoke select (%I) on %s from anon', v_w_col, v_tbl);
        end loop;
        raise notice
          'apply_table_grants: %.% held an `anon` SELECT grant that NO SELECT-capable policy reaches -- a key with no door, which could never return a row -- and it declared no anonymous lane. WITHDRAWN (table-level and every column). If a signed-out reader was meant to exist here, it was already reading nothing: declare the lane AND give the table a policy that reaches `anon`.',
          p_schema, p_table;
      end if;
    end if;
  end;
  -- service_role is the server's bypass lane and always needs full reach.
  execute format('grant all on %s to service_role', v_tbl);
  perform iam.read_lane_v2_refuse_withdraw(v_rel, v_v2_had_read);
end;
$function$;

CREATE OR REPLACE FUNCTION public._dict_context_owner_org(p_level text, p_owner_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_org uuid;
begin
  if p_level = 'scope_type' then
    select k.organization_id into v_org
      from custom.record k
     where k.id = p_owner_id and k.data_class = 'table' and k.data ->> 'kept_for' = 'context'
     limit 1;
  elsif p_level = 'scope' then
    select r.organization_id into v_org
      from custom.record r
      join custom.record k
        on k.organization_id = r.organization_id and k.id = r.table_id
       and k.data_class = 'table' and k.data ->> 'kept_for' = 'context'
     where r.id = p_owner_id and r.data_class = 'record'
     limit 1;
  else
    return null;
  end if;
  if v_org is null or v_uid is null or coalesce(public.is_platform_admin(), false) then
    return v_org;
  end if;
  if v_org in (select iam.archived_org_ids()) then
    return null;
  end if;
  if v_org in (select iam.my_orgs()) then
    return v_org;
  end if;
  -- a scope also reaches its creator, a globally readable system organization, or a grant (the older
  -- context.scopes row security); a scope type only its organization's members
  if p_level = 'scope'
     and (exists (select 1 from custom.record r where r.id = p_owner_id and r.created_by = v_uid)
          or v_org in (select so.organization_id from iam.system_orgs so where so.global_readable)
          or coalesce(iam.has_access('scope', p_owner_id, 'viewer'::public.permission_level), false)) then
    return v_org;
  end if;
  return null;
end;
$function$;
