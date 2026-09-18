-- target: branch
-- based-on: platform._provision_shape_guard() bf0dd46a25c935637c671bcd23c41271f264583ed5ad18b42e672e6e24a7850e
-- based-on: platform._provision_shape_settled() d913b3e02e3cb24c6ea58db3e6f2034e5107b8a979a631ce8fc5f647ece292ba
-- based-on: platform.provision_arg_check_findings(text, text, jsonb) ad7cc79c5e68fa217a5f1e7f381495fa415335cebac75e719796c8b2e6f3acdd
-- based-on: platform.provision_generate_target_publish(jsonb, text) 9918df8b3facab7f5ef565720ad650fda22d177d50786663449995fe99c2ea36
-- based-on: platform.provision_preflight() 07f6f335f3c3ec2f748461d4769fb94012c40641877825a4d4d3a74008bb2f6f
-- based-on: platform.provision_validate(jsonb, text, uuid) 8047a94e066f6ffb8b5c4de671894020fe3e5feb4a5cc69ba61f305ae37c69fd
-- based-on: platform.provision(jsonb, text, uuid, text) eb8f1bdb48fba3bd700f4f5c80937e83f34587c593d537ff0f6f502335bb2678
--
-- w0_sync_provisioner_bodies_byte_exact — THE BLANK LINES MATTER.
--
-- `w0_sync_provisioner_and_shape_guard.sql` carried production's sixteen provisioner
-- bodies onto this branch, but the extraction that built it dropped EMPTY LINES inside
-- the bodies. Seven functions therefore landed semantically identical and textually
-- different, and `pg_get_functiondef` — which is what `pnpm check:branch-schema-drift`
-- hashes, and what `-- based-on:` hashes — would have reported those seven as permanent
-- drift for the rest of the campaign. A drift check that is expected to be red is not a
-- check, so the bodies are corrected rather than the checker taught to forgive them.
--
-- Each body below is production's `pg_get_functiondef` output byte for byte, blank lines
-- included. The `-- based-on:` shas are this branch's current bodies — the ones this file
-- replaces.
--
--   uv run python db/apply_migrations.py --source campaign \
--     --only w0_sync_provisioner_bodies_byte_exact.sql --target branch --lane W0-SYNC --no-generate

CREATE OR REPLACE FUNCTION platform._provision_shape_guard()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  cmd        record;
  fk         record;
  v_schema   text;
  v_rel      text;
  v_kind     "char";
  v_ispart   boolean;
  v_ref      text;
  v_shape    integer;
  v_opts     text;
  v_secdef   boolean;
  v_rettype  oid;
  v_idargs   text;
  v_prov     boolean;
  v_txmin    bigint;
  c_exempt_schemas constant text[] := array[
    'graveyard','auth','storage','realtime','vault','extensions','supabase_functions',
    'supabase_migrations','cron','net','pgsodium','pgsodium_masks','_analytics','_realtime',
    'information_schema','pgbouncer','pgmq','partman','graphql','graphql_public'];
  -- Said in every HINT below, verbatim, because a guard that implies a guarantee the
  -- database cannot make is worse than no guard: PLAN.md §2.
  c_boundary constant text :=
    ' BOUNDARY: this lane BINDS lane B (the NOLOGIN matrx_provisioner role, which owns nothing and can disable nothing) absolutely. For lane A — `postgres`, which OWNS this event trigger and every function in it — it is a MISTAKE GUARD, not an adversary guard: one ALTER EVENT TRIGGER provision_shape_guard DISABLE turns it off. Deliberate lane-A work that must bypass it disables and re-enables it inside ONE transaction, which the census then sees.';
begin
  v_prov := platform.is_provisioning();
  -- "Created by THIS transaction" for the foreign-key lanes. NOT age(xmin) = 0: age() is
  -- measured against the NEXT transaction id, so it stops being 0 the moment any other
  -- transaction id is assigned (a savepoint, an exception block, a concurrent session) and
  -- the lane would then silently see nothing. Every id this transaction and its
  -- subtransactions own is >= its own top-level id, and no other session can add a
  -- constraint to a relation we hold AccessExclusive on, so this comparison is exact.
  -- No id assigned at all means no DDL, so nothing can be new: match nothing.
  v_txmin := coalesce(pg_current_xact_id_if_assigned()::text::bigint % 4294967296,
                      9223372036854775807);

  for cmd in select * from pg_event_trigger_ddl_commands() loop
    if cmd.in_extension then continue; end if;

    -- ============================================================ relations, BY EFFECT
    -- object_type, not command_tag: CREATE TABLE AS, SELECT INTO, PARTITION OF, LIKE,
    -- CREATE MATERIALIZED VIEW and CREATE FOREIGN TABLE all arrive here as 'table',
    -- 'materialized view' or 'foreign table'. Creation tags only — ALTER TABLE is NOT
    -- a lane-(d) event until `evolve` ships (PLAN.md §5 wave 3 gate).
    if cmd.object_type in ('table','materialized view','foreign table')
       and cmd.command_tag in ('CREATE TABLE','CREATE TABLE AS','SELECT INTO',
                               'CREATE MATERIALIZED VIEW','CREATE FOREIGN TABLE') then

      select n.nspname, c.relname, c.relkind, c.relispartition
        into v_schema, v_rel, v_kind, v_ispart
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where c.oid = cmd.objid;

      if v_rel is not null
         and v_schema not like 'pg\_%'
         and v_schema <> all (c_exempt_schemas) then

        v_ref := v_schema || '.' || v_rel;

        select count(*) into v_shape
          from pg_attribute a
         where a.attrelid = cmd.objid and not a.attisdropped
           and a.attname in ('created_by','created_at','updated_at','deleted_at',
                             'metadata','version','visibility');

        -- ERROR lane (g2): public keeps functions and RPCs, never relations. _ddl_guard
        -- lane (g) already refuses the CREATE TABLE tag; this closes the four tags that
        -- reach the same effect by another name.
        if v_schema = 'public' and cmd.command_tag <> 'CREATE TABLE' then
          raise exception 'provision_shape_guard: %.% is a NEW relation in schema public (%)', v_schema, v_rel, cmd.command_tag
            using hint = 'Doctrine §7: public keeps functions and RPCs, never relations. A different command tag is not a different effect — CREATE TABLE AS, SELECT INTO, a materialized view and a foreign table all land a relation in public. Name the FEATURE schema instead, through platform.provision. A scratch relation belongs in a TEMP table, which this lane never sees.' || c_boundary,
                  errcode = 'check_violation';
        end if;

        -- ERROR lane (d): an entity-shaped relation made outside the provisioner.
        -- A partition child of a REGISTERED parent is exempt: the parent carries the
        -- registry row, the RLS and the tenancy, and the child inherits all three.
        if v_shape >= 3
           and not v_prov
           and not (v_ispart and exists (
                 select 1 from pg_inherits i
                   join pg_class pc on pc.oid = i.inhparent
                   join pg_namespace pn on pn.oid = pc.relnamespace
                   join platform.entity_types e
                     on e.schema_name = pn.nspname and e.table_name = pc.relname
                  where i.inhrelid = cmd.objid))
           and not exists (select 1 from platform.entity_types e
                            where e.schema_name = v_schema and e.table_name = v_rel)
           and not exists (select 1 from platform.provision_spec_grandfather g
                            where g.lane = 'unprovisioned_relation' and g.object_ref = v_ref)
        then
          raise exception 'provision_shape_guard: %.% is an entity-shaped % created outside the provisioner (%)',
                          v_schema, v_rel,
                          case v_kind when 'r' then 'table' when 'p' then 'partitioned table'
                                      when 'm' then 'materialized view' when 'f' then 'foreign table'
                                      else 'relation' end,
                          cmd.command_tag
            using hint = 'THE SANCTIONED PATH is platform.provision(spec) — it builds columns + registry + triggers + RLS in one transaction and rolls back on any gate FAIL. This lane judges by EFFECT, not by command tag: CREATE TABLE AS, SELECT INTO, PARTITION OF, LIKE, a materialized view and a foreign table all make the relation, and a MATERIALIZED VIEW or FOREIGN TABLE over entity columns is worse than a hand-rolled table — neither honours row-level security at all, so it is an RLS-free copy of tenant data. Unregistered means iam.has_access returns false for it and it has no RLS. The marker this lane reads is NOT the old `matrx.provisioner` GUC (any caller of any role could set that): it is a row keyed by this transaction id that only platform.provision / platform.create_entity_table can write.' || c_boundary,
                  errcode = 'check_violation';
        end if;
      end if;
    end if;

    -- ============================== foreign keys, on creation AND on ALTER TABLE ADD
    -- Both lanes are DEBTS settled at COMMIT (see platform.provision_shape_debt): the
    -- index and the tenancy trigger cannot exist before the column does, so every builder
    -- in the platform emits them in the statements that follow.
    if cmd.object_type = 'table'
       and cmd.command_tag in ('CREATE TABLE','CREATE TABLE AS','SELECT INTO','ALTER TABLE') then
      select n.nspname, c.relname into v_schema, v_rel
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where c.oid = cmd.objid;
      if v_rel is not null
         and v_schema not like 'pg\_%'
         and v_schema <> all (c_exempt_schemas) then
        v_ref := v_schema || '.' || v_rel;
        for fk in
          select k.conname, k.conrelid, k.confrelid, k.conkey,
                 (select string_agg(quote_ident(a.attname), ', ' order by u.ord)
                    from unnest(k.conkey) with ordinality u(attnum, ord)
                    join pg_attribute a on a.attrelid = k.conrelid and a.attnum = u.attnum) as cols,
                 (select a.attname
                    from unnest(k.conkey) with ordinality u(attnum, ord)
                    join pg_attribute a on a.attrelid = k.conrelid and a.attnum = u.attnum
                   order by u.ord limit 1) as first_col,
                 (select bool_or(not a.attnotnull)
                    from unnest(k.conkey) u(attnum)
                    join pg_attribute a on a.attrelid = k.conrelid and a.attnum = u.attnum) as any_nullable
            from pg_constraint k
           where k.conrelid = cmd.objid and k.contype = 'f'
             and k.xmin::text::bigint >= v_txmin
        loop
          if not exists (
               select 1 from pg_index i
                where i.indrelid = fk.conrelid and i.indislive
                  and (i.indkey::int2[])[0:cardinality(fk.conkey) - 1] = fk.conkey)
          then
            insert into platform.provision_shape_debt (txid, kind, object_ref, detail)
            values (pg_current_xact_id(), 'fk_without_index', v_ref || '.' || fk.conname,
                    jsonb_build_object('relation', v_ref, 'conname', fk.conname, 'cols', fk.cols))
            on conflict do nothing;
          end if;

          if fk.any_nullable
             and exists (select 1 from pg_attribute a
                          where a.attrelid = fk.confrelid and a.attname = 'organization_id' and not a.attisdropped)
             and exists (select 1 from pg_attribute a
                          where a.attrelid = fk.conrelid and a.attname = 'organization_id' and not a.attisdropped)
             and not exists (
                   select 1 from pg_trigger t
                    where t.tgrelid = fk.conrelid and not t.tgisinternal
                      and t.tgfoid = 'platform.assert_same_org'::regproc
                      and (string_to_array(encode(t.tgargs, 'escape'), '\000'))[1]
                          = any (select a.attname from unnest(fk.conkey) u(attnum)
                                   join pg_attribute a on a.attrelid = fk.conrelid and a.attnum = u.attnum))
          then
            insert into platform.provision_shape_debt (txid, kind, object_ref, detail)
            values (pg_current_xact_id(), 'nullable_tenant_fk', v_ref || '.' || fk.conname,
                    jsonb_build_object('relation', v_ref, 'conname', fk.conname,
                                       'first_col', fk.first_col,
                                       'target', fk.confrelid::regclass::text))
            on conflict do nothing;
          end if;
        end loop;
      end if;
    end if;

    -- ===================================================== views run as their CALLER
    if cmd.object_type = 'view' and cmd.command_tag = 'CREATE VIEW' then
      select n.nspname, c.relname, array_to_string(c.reloptions, ',')
        into v_schema, v_rel, v_opts
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where c.oid = cmd.objid;
      if v_rel is not null
         and v_schema not like 'pg\_%'
         and v_schema <> all (c_exempt_schemas) then
        v_ref := v_schema || '.' || v_rel;
        if coalesce(v_opts, '') !~* '(^|,)\s*security_invoker\s*=\s*(true|on|1|yes)\s*(,|$)'
           and not exists (select 1 from platform.provision_spec_grandfather g
                            where g.lane = 'view_not_invoker' and g.object_ref = v_ref)
        then
          raise exception 'provision_shape_guard: view %.% is not security_invoker=true', v_schema, v_rel
            using hint = format('A view without security_invoker=true runs as its OWNER (`postgres`, which has BYPASSRLS) — so every caller reads every tenant''s rows through it, whatever the base table''s row-level security says. Declare it: CREATE OR REPLACE VIEW %s WITH (security_invoker = true) AS ...; (lessons ledger 3; db-rules §6d.) A MATERIALIZED view cannot take this option at all — that is why an entity-shaped one is refused outright by the relation lane above.', v_ref) || c_boundary,
                  errcode = 'check_violation';
        end if;
      end if;
    end if;

    -- ====================================== a DEFINER function makes an access DECISION
    if cmd.object_type in ('function','procedure')
       and cmd.command_tag in ('CREATE FUNCTION','CREATE PROCEDURE') then
      select p.prosecdef, p.prorettype, n.nspname, p.proname,
             pg_get_function_identity_arguments(p.oid)
        into v_secdef, v_rettype, v_schema, v_rel, v_idargs
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where p.oid = cmd.objid;

      if v_secdef
         and v_rettype not in ('trigger'::regtype, 'event_trigger'::regtype)
         and v_schema not like 'pg\_%'
         and v_schema <> all (c_exempt_schemas)
         and not exists (select 1 from platform.client_callable_door d
                          where d.schema_name = v_schema
                            and d.function_name = v_rel
                            and d.identity_args = v_idargs)
      then
        -- A DEBT, not a refusal here: DD-223 forbids a door row that names a function
        -- which does not exist yet, so the door CANNOT precede the CREATE FUNCTION.
        insert into platform.provision_shape_debt (txid, kind, object_ref, detail)
        values (pg_current_xact_id(), 'definer_no_door',
                v_schema || '.' || v_rel || '(' || v_idargs || ')',
                jsonb_build_object('schema_name', v_schema, 'function_name', v_rel,
                                   'identity_args', v_idargs))
        on conflict do nothing;
      end if;
    end if;
  end loop;

  delete from platform.provision_shape_debt where noted_at < now() - interval '1 day';
end
$function$;

CREATE OR REPLACE FUNCTION platform._provision_shape_settled()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_conrelid oid;
  v_conkey   int2[];
  v_cols     text;
  c_boundary constant text :=
    ' BOUNDARY: this binds lane B (the NOLOGIN matrx_provisioner role, which owns nothing and can disable nothing) absolutely. For lane A — `postgres`, which OWNS this trigger and every function in it — it is a MISTAKE GUARD, not an adversary guard: one ALTER TABLE platform.provision_shape_debt DISABLE TRIGGER provision_shape_settled turns it off. PLAN.md §2.';
begin
  if new.kind = 'definer_no_door' then
    -- The function may have been dropped again inside this transaction; then there is
    -- nothing left to declare.
    if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = new.detail ->> 'schema_name'
                      and p.proname = new.detail ->> 'function_name'
                      and pg_get_function_identity_arguments(p.oid) = new.detail ->> 'identity_args'
                      and p.prosecdef)
    then return null; end if;

    if exists (select 1 from platform.client_callable_door d
                where d.schema_name   = new.detail ->> 'schema_name'
                  and d.function_name = new.detail ->> 'function_name'
                  and d.identity_args = new.detail ->> 'identity_args')
       or exists (select 1 from platform.provision_spec_grandfather g
                   where g.lane = 'definer_no_door' and g.object_ref = new.object_ref)
    then return null; end if;

    raise exception 'provision_shape_guard: SECURITY DEFINER function % reached COMMIT with no access decision declared', new.object_ref
      using hint = 'A SECURITY DEFINER function runs as `postgres` (BYPASSRLS). Somebody has to say, IN DATA, who may call it and what each entity-id argument is checked against — prose in a comment is not a declaration and no test executes it (lessons ledger 23, 27, 28). Declare it anywhere in THIS SAME transaction (DD-223 requires the function to exist first, so straight after the CREATE FUNCTION is the normal place): INSERT INTO platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers) VALUES (''<schema>'', ''<fn>'', ''<exactly pg_get_function_identity_arguments>'', ARRAY[''uuid''::regtype]::oid[], ''<what each entity-id argument is checked against, and the NULL rule for each>'', ''<migration>'', ''server_only: <which server lane calls it, and why no client ever does>'', false, false); — non_client_lane is a SENTENCE of at least 40 characters (with signed_in_callers=false and anonymous_callers=false) when no client may ever call it; leave it NULL and set signed_in_callers=true for a client door. A RETURNS trigger / event_trigger function never incurs this debt: it has no direct call surface.' || c_boundary,
            errcode = 'check_violation';

  elsif new.kind = 'fk_without_index' then
    select k.conrelid, k.conkey into v_conrelid, v_conkey
      from pg_constraint k
     where k.conrelid = (new.detail ->> 'relation')::regclass
       and k.conname  = new.detail ->> 'conname'
       and k.contype  = 'f';
    if v_conrelid is null then return null; end if;   -- dropped again in this transaction

    if exists (select 1 from pg_index i
                where i.indrelid = v_conrelid and i.indislive
                  and (i.indkey::int2[])[0:cardinality(v_conkey) - 1] = v_conkey)
       or exists (select 1 from platform.provision_spec_grandfather g
                   where g.lane = 'fk_without_index' and g.object_ref = new.object_ref)
    then return null; end if;

    v_cols := new.detail ->> 'cols';
    raise exception 'provision_shape_guard: foreign key % (%) reached COMMIT with no covering index', new.object_ref, v_cols
      using hint = format('Every foreign key needs an index whose LEADING columns are the constraint columns, in order — without one, every delete or update of the parent row sequentially scans this table. Add it anywhere in THIS SAME transaction: CREATE INDEX ON %s (%s); This lane fires on NEW constraints only; the foreign keys already live need CREATE INDEX CONCURRENTLY, which cannot run inside a transaction and is therefore a separate batch job, never part of provision().',
                          new.detail ->> 'relation', v_cols) || c_boundary,
              errcode = 'check_violation';

  elsif new.kind = 'nullable_tenant_fk' then
    select k.conrelid, k.conkey into v_conrelid, v_conkey
      from pg_constraint k
     where k.conrelid = (new.detail ->> 'relation')::regclass
       and k.conname  = new.detail ->> 'conname'
       and k.contype  = 'f';
    if v_conrelid is null then return null; end if;

    if exists (select 1 from pg_trigger t
                where t.tgrelid = v_conrelid and not t.tgisinternal
                  and t.tgfoid = 'platform.assert_same_org'::regproc
                  and (string_to_array(encode(t.tgargs, 'escape'), '\000'))[1]
                      = any (select a.attname from unnest(v_conkey) u(attnum)
                               join pg_attribute a on a.attrelid = v_conrelid and a.attnum = u.attnum))
       or exists (select 1 from platform.provision_spec_grandfather g
                   where g.lane = 'nullable_tenant_fk' and g.object_ref = new.object_ref)
    then return null; end if;

    raise exception 'provision_shape_guard: % is a NULLABLE foreign key into tenant-scoped % and reached COMMIT with no platform.assert_same_org trigger',
                    new.object_ref, new.detail ->> 'target'
      using hint = format('A nullable foreign key into a tenant-scoped table can point at ANOTHER organization''s row and nothing stops it — row-level security on the child checks the CHILD''s organization_id, never the parent''s. The canonical fix is a VALIDATION-ONLY trigger: it refuses, it never assigns (NO-BACKSTOP, db-rules §2/§6e). Add it anywhere in THIS SAME transaction: CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF %I ON %s FOR EACH ROW EXECUTE FUNCTION platform.assert_same_org(%L, %L);',
                          left('trg_same_org_' || replace(new.detail ->> 'relation', '.', '_') || '_' || (new.detail ->> 'first_col'), 63),
                          new.detail ->> 'first_col', new.detail ->> 'relation',
                          new.detail ->> 'first_col', new.detail ->> 'target') || c_boundary,
              errcode = 'check_violation';
  end if;
  return null;
end
$function$;

CREATE OR REPLACE FUNCTION platform.provision_arg_check_findings(p_function text, p_args text, p_arg_checks jsonb)
 RETURNS jsonb[]
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  f          jsonb[] := '{}'::jsonb[];
  v_arg      text;
  v_head     text;
  v_name     text;
  v_type     text;
  v_entry    jsonb;
  v_optional boolean;
begin
  for v_arg in
    select btrim(a) from unnest(string_to_array(coalesce(p_args, ''), ',')) a where btrim(a) <> ''
  loop
    -- An OUT argument is a result column, not something a caller passes.
    if lower(v_arg) ~ '^out\s' then continue; end if;
    v_arg      := regexp_replace(v_arg, '^(in|inout|variadic)\s+', '', 'i');
    v_optional := lower(v_arg) ~ '\sdefault\s' or v_arg ~ '\s=\s';
    v_head     := btrim(regexp_replace(v_arg, '\s+(default|=)\s+.*$', '', 'i'));
    v_name     := split_part(v_head, ' ', 1);
    v_type     := lower(btrim(substr(v_head, length(v_name) + 1)));
    if v_type = '' then v_type := lower(v_name); end if;   -- an unnamed argument

    if v_type ~ '\muuid\M' then
      v_entry := case when jsonb_typeof(p_arg_checks) = 'object' then p_arg_checks->v_name end;
      if v_entry is null
         or jsonb_typeof(v_entry) not in ('string', 'object')
         or (jsonb_typeof(v_entry) = 'string' and btrim(v_entry #>> '{}') = '')
         or (jsonb_typeof(v_entry) = 'object' and btrim(coalesce(v_entry->>'check', '')) = '') then
        f := f || platform.provision_finding('functions.arg_checks.missing',
               format('functions[%s].arg_checks.%s', p_function, v_name), null,
               format('argument %L has no declared access check', v_arg));
      elsif v_optional
            and (jsonb_typeof(v_entry) <> 'object' or btrim(coalesce(v_entry->>'null_rule', '')) = '') then
        f := f || platform.provision_finding('functions.arg_checks.null_rule_missing',
               format('functions[%s].arg_checks.%s.null_rule', p_function, v_name), null,
               format('argument %L is optional, and what the function does when it is NULL is not declared', v_arg));
      end if;
    elsif v_type ~ '\mjsonb?\M' then
      if jsonb_typeof(p_arg_checks) is distinct from 'object'
         or not exists (select 1 from jsonb_object_keys(p_arg_checks) k
                         where k = v_name or k like v_name || '.%') then
        f := f || platform.provision_finding('functions.arg_checks.missing',
               format('functions[%s].arg_checks.%s', p_function, v_name), null,
               format('argument %L has no declared access check for any id inside it', v_arg));
      end if;
    end if;
  end loop;
  return f;
end;
$function$;

CREATE OR REPLACE FUNCTION platform.provision_generate_target_publish(p_targets jsonb, p_published_by text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_before jsonb;
  v_rows   int;
begin
  if jsonb_typeof(p_targets) <> 'array' then
    raise exception 'provision_generate_target_publish: p_targets must be a jsonb ARRAY of {schema_name, orm_target, types_target} objects (got %)',
      coalesce(jsonb_typeof(p_targets), 'null')
      using errcode = 'check_violation',
            hint = 'This is the repo''s whole generate list, published in one call. A partial list would silently make schemas unprovisionable.';
  end if;
  if jsonb_array_length(p_targets) = 0 then
    -- An empty list would empty platform.provision_legal_schemas and make the ENTIRE
    -- platform unprovisionable with no error anywhere. That is never an intended publish.
    raise exception 'provision_generate_target_publish: refusing to publish an EMPTY generate list — that would make every schema unprovisionable'
      using errcode = 'check_violation',
            hint = 'The caller read no schemas out of db/matrx_orm.yaml and matrx-frontend package.json. Fix the reader, not the database.';
  end if;
  if length(btrim(coalesce(p_published_by, ''))) < 3 then
    raise exception 'provision_generate_target_publish: p_published_by must name who published (got %L)', p_published_by
      using errcode = 'check_violation';
  end if;

  v_before := platform.provision_generate_target_list();

  delete from platform.provision_generate_target t
   where not exists (select 1 from jsonb_array_elements(p_targets) x
                      where x->>'schema_name' = t.schema_name);

  insert into platform.provision_generate_target
    (schema_name, orm_target, types_target, published_by)
  select x->>'schema_name', (x->>'orm_target')::boolean, (x->>'types_target')::boolean,
         p_published_by
    from jsonb_array_elements(p_targets) x
  on conflict (schema_name) do update
    set orm_target   = excluded.orm_target,
        types_target = excluded.types_target,
        published_by = excluded.published_by,
        published_at = now();
  get diagnostics v_rows = row_count;

  return jsonb_build_object(
    'published', v_rows,
    'provisionable', (select count(*) from platform.provision_generate_target
                       where orm_target and types_target),
    'changed', v_before is distinct from platform.provision_generate_target_list(),
    'digest', platform.provision_generate_target_digest());
end;
$function$;

CREATE OR REPLACE FUNCTION platform.provision_preflight()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_expected constant text[] := array['ddl_guard','ddl_lock_timeout_guard','graveyard_outbound_fk_guard',
                                      'entity_types_ddl_sync','entity_types_drop_flag',
                                      'close_new_functions_to_anon','enforce_definer_client_grants'];
  f jsonb[] := '{}'::jsonb[];
  v text;
begin
  -- 1. All 7 platform event triggers bound, enabled, and not SECURITY DEFINER.
  --    A database restore provably drops them, and the remedy may not be a CI gate
  --    (ATTACK #7) — so it is checked here, free, at the only moment it matters.
  foreach v in array v_expected loop
    if not exists (
      select 1 from pg_event_trigger e
       join pg_proc p on p.oid = e.evtfoid
       where e.evtname = v and e.evtenabled = 'O' and not p.prosecdef
    ) then
      f := f || platform.provision_finding('preflight.event_trigger', format('event trigger %s', v), null,
             coalesce((select format('bound, evtenabled=%s', e.evtenabled) from pg_event_trigger e where e.evtname = v),
                      'not bound at all'));
    end if;
  end loop;

  -- 2. replica mode disables every ordinary trigger (ATTACK #5).
  if current_setting('session_replication_role') <> 'origin' then
    f := f || platform.provision_finding('preflight.session_replication_role', 'session_replication_role',
           'origin', current_setting('session_replication_role'));
  end if;

  -- 3. lock_timeout bounded.
  if current_setting('lock_timeout') in ('0', '0ms', '0s') then
    f := f || platform.provision_finding('preflight.lock_timeout', 'lock_timeout', null, 'unbounded (0)');
  end if;

  -- 4. The entity read kernel has not drifted from what iam.apply_rls expects (W0-7).
  if iam.entity_read_kernel_fingerprint() is distinct from iam.entity_read_kernel_expected() then
    f := f || platform.provision_finding('preflight.read_kernel', 'iam.entity_read_kernel_fingerprint()',
           null, format('live %s, expected %s',
                        iam.entity_read_kernel_fingerprint(), iam.entity_read_kernel_expected()));
  end if;

  -- 5. Not already inside a provisioning run.
  if platform.is_provisioning() then
    f := f || platform.provision_finding('preflight.marker', 'platform.provision_marker', null, 'already set on entry');
  end if;

  return jsonb_build_object('ok', cardinality(f) = 0, 'findings', coalesce(to_jsonb(f), '[]'::jsonb));
end;
$function$;

CREATE OR REPLACE FUNCTION platform.provision_validate(p_spec jsonb, p_lane text DEFAULT 'full'::text, p_org_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  f            jsonb[] := '{}'::jsonb[];
  n            jsonb;
  answered     text[]  := '{}'::text[];
  plan         jsonb[] := '{}'::jsonb[];
  v_lane       text    := lower(coalesce(p_lane, 'full'));
  v_restricted boolean;
  v_schema     text;
  v_table      text;
  v_token      text;
  v_type       text;
  v_variant    text;
  v_origin     text;
  v_access     jsonb;
  v_class      text;
  v_scope      text;
  v_vis        text;
  v_key        text;
  v_soft       boolean;
  v_err        text;
  v_item       jsonb;
  v_sub        jsonb;
  v_name       text;
  v_txt        text;
  v_names      text[] := '{}'::text[];
  v_fk_cols    text[] := '{}'::text[];
  v_all_cols   text[];
  v_i          int;
  v_uuid       uuid;
  v_defaults   jsonb;
begin
  v_restricted := (v_lane = 'restricted');
  if v_lane not in ('full','restricted') then
    raise exception 'platform.provision_validate: p_lane must be ''full'' or ''restricted'' (got %)', p_lane;
  end if;

  if p_spec is null or jsonb_typeof(p_spec) <> 'object' then
    return jsonb_build_object(
      'ok', false, 'lane', v_lane,
      'findings', jsonb_build_array(platform.provision_finding(
        'shape.invalid', '(the whole spec)', null,
        format('the spec is %s, not a JSON object', coalesce(jsonb_typeof(p_spec), 'null')))),
      'normalized_spec', null, 'spec_hash', null, 'plan', '[]'::jsonb);
  end if;

  n := p_spec;

  -- W0-7 / PLAN §3.1: the preflight's refusals are findings here too, so the dry run
  -- says what provision() would refuse before anybody takes a lock.
  f := f || array(select x from jsonb_array_elements((platform.provision_preflight())->'findings') x);

  -- === shape ==============================================================
  for v_err in
    select e from unnest(extensions.jsonschema_validation_errors(
      (select s.schema from platform.provision_schema s where s.name = 'full')::json,
      p_spec::json)) e
  loop
    f := f || platform.provision_finding('shape.invalid', '(see below)', null, v_err);
  end loop;

  -- === lane B: the closed subset (PLAN §4.0) ==============================
  -- The GRANT on platform.provision_restricted is the boundary; these checks are
  -- what that entry point refuses with, so the refusal names the field.
  if v_restricted then
    if p_org_id is null then
      f := f || platform.provision_finding('lane.org_missing', 'p_org_id', null,
                  'no organization was passed with this call');
    end if;
    if p_spec ? 'checks' and jsonb_array_length(coalesce(p_spec->'checks','[]'::jsonb)) > 0 then
      f := f || platform.provision_finding('lane.expression_refused', 'checks[]', null,
                  'table-level CHECK expressions are raw SQL');
    end if;
    if p_spec ? 'types' and jsonb_array_length(coalesce(p_spec->'types','[]'::jsonb)) > 0 then
      f := f || platform.provision_finding('lane.expression_refused', 'types[]', null,
                  'creating a type is lane A only — pick from the existing types listed by provision_options(''vocabularies'')');
    end if;
    if coalesce(p_spec->>'audit_class','entity') = 'machinery' then
      f := f || platform.provision_finding('lane.expression_refused', 'audit_class', null,
                  'audit_class = machinery');
    end if;
    for v_item in select value from jsonb_array_elements(coalesce(p_spec->'fields','[]'::jsonb)) loop
      if v_item ? 'check' then
        f := f || platform.provision_finding('lane.expression_refused',
               format('fields[%s].check', coalesce(v_item->>'name','?')), null, v_item->>'check');
      end if;
      if v_item ? 'generated' then
        f := f || platform.provision_finding('lane.expression_refused',
               format('fields[%s].generated', coalesce(v_item->>'name','?')), null,
               'a generated column is a stored SQL expression');
      end if;
      if v_item ? 'default'
         and not platform.provision_default_menu_ok(v_item->'default', v_item->>'type') then
        f := f || platform.provision_finding('lane.default_menu',
               format('fields[%s].default', coalesce(v_item->>'name','?')), null,
               v_item->>'default');
      end if;
    end loop;
    for v_item in select value from jsonb_array_elements(coalesce(p_spec->'indexes','[]'::jsonb)) loop
      if v_item ? 'where' then
        f := f || platform.provision_finding('lane.expression_refused', 'indexes[].where', null,
                    v_item->>'where');
      end if;
    end loop;
    for v_item in select value from jsonb_array_elements(coalesce(p_spec->'functions','[]'::jsonb)) loop
      if v_item ? 'body' then
        f := f || platform.provision_finding('lane.expression_refused',
               format('functions[%s].body', coalesce(v_item->>'name','?')), null,
               'a function body is SQL executed by a SECURITY DEFINER owned by postgres');
      end if;
      if lower(coalesce(v_item->>'security','invoker')) = 'definer' then
        f := f || platform.provision_finding('lane.expression_refused',
               format('functions[%s].security', coalesce(v_item->>'name','?')), null, 'definer');
      end if;
    end loop;
    if jsonb_array_length(coalesce(p_spec->'views','[]'::jsonb)) > 0 then
      for v_item in select value from jsonb_array_elements(p_spec->'views') loop
        if v_item ? 'definition' then
          f := f || platform.provision_finding('lane.expression_refused',
                 format('views[%s].definition', coalesce(v_item->>'name','?')), null,
                 'a view definition is raw SQL read by a postgres-owned relation');
        end if;
        if coalesce((v_item->>'security_invoker')::boolean, true) is false then
          f := f || platform.provision_finding('lane.expression_refused',
                 format('views[%s].security_invoker', coalesce(v_item->>'name','?')), null, 'false');
        end if;
      end loop;
    end if;
  end if;

  -- === identity ===========================================================
  v_schema := p_spec->>'schema';
  v_table  := p_spec->>'table';
  v_token  := p_spec->>'token';

  if v_schema is null then
    f := f || platform.provision_finding('identity.schema.missing');
  elsif v_schema in ('public','graveyard','information_schema')
        or v_schema like 'pg\_%'
        or v_schema in ('auth','storage','realtime','vault','extensions','supabase_functions',
                        'supabase_migrations','cron','net','pgsodium','pgsodium_masks',
                        'graphql','graphql_public','_analytics','_realtime') then
    f := f || platform.provision_finding('identity.schema.forbidden', 'schema', null, v_schema);
  elsif not exists (select 1 from pg_namespace where nspname = v_schema) then
    f := f || platform.provision_finding('identity.schema.unknown', 'schema', null, v_schema);
  elsif not exists (select 1 from platform.provision_generate_target t
                     where t.schema_name = v_schema
                       and t.orm_target and t.types_target) then
    -- THE PARITY RULE: provisionable only if the repository can generate for it.
    -- Checked on BOTH lanes and before the grant check, because a schema the repo
    -- cannot represent is illegal for everyone, not merely ungranted to someone.
    f := f || platform.provision_finding('identity.schema.not_generable', 'schema',
           coalesce((select string_agg(t.schema_name, ' | ' order by t.schema_name)
                       from platform.provision_generate_target t
                      where t.orm_target and t.types_target),
                    '(the repo has published no generate targets at all — run scripts/check_provision_generate_targets.py --fix)'),
           format('%s (ORM model target: %s; frontend type target: %s)', v_schema,
                  coalesce((select t.orm_target::text from platform.provision_generate_target t
                             where t.schema_name = v_schema), 'no row — the repo does not list it at all'),
                  coalesce((select t.types_target::text from platform.provision_generate_target t
                             where t.schema_name = v_schema), 'no row — the repo does not list it at all')));
  elsif v_restricted and p_org_id is not null
        and not exists (select 1 from platform.provision_grant g
                         where g.organization_id = p_org_id and g.schema_name = v_schema) then
    f := f || platform.provision_finding('lane.schema_not_granted', 'schema',
           coalesce((select string_agg(g.schema_name, ' | ' order by g.schema_name)
                       from platform.provision_grant g where g.organization_id = p_org_id),
                    '(this organization holds no schema yet)'),
           v_schema);
  end if;

  if v_table is null then
    f := f || platform.provision_finding('identity.table.missing');
  elsif not platform.provision_identifier_ok(v_table) then
    f := f || platform.provision_finding('identity.table.name', 'table', null, v_table);
  else
    if v_schema is not null and to_regclass(format('%I.%I', v_schema, v_table)) is not null then
      f := f || platform.provision_finding('identity.token.taken', 'table', null,
             format('%s.%s already exists', v_schema, v_table));
    end if;
    -- §1a: a repeated table name must mean the same ROLE.
    if exists (select 1 from platform.entity_types e
                where e.table_name = v_table and e.schema_name is distinct from v_schema) then
      if p_spec->'same_role_as'->>'token' is null
         or btrim(coalesce(p_spec->'same_role_as'->>'reason','')) = '' then
        f := f || platform.provision_finding('identity.table.collision', 'table',
               null,
               format('%s already names %s', v_table,
                 (select string_agg(e.schema_name||'.'||e.table_name||' ('||e.token||')', ', ' order by e.token)
                    from platform.entity_types e where e.table_name = v_table)));
      elsif not exists (select 1 from platform.entity_types e
                         where e.token = p_spec->'same_role_as'->>'token') then
        f := f || platform.provision_finding('identity.same_role_as.unknown', 'same_role_as.token',
               null, p_spec->'same_role_as'->>'token');
      end if;
    end if;
  end if;

  if v_token is null then
    f := f || platform.provision_finding('identity.token.missing');
  elsif not platform.provision_identifier_ok(v_token) then
    f := f || platform.provision_finding('identity.table.name', 'token', null, v_token);
  elsif exists (select 1 from platform.entity_types e where e.token = v_token) then
    f := f || platform.provision_finding('identity.token.taken', 'token', null, v_token);
  end if;

  if btrim(coalesce(p_spec->>'label','')) = '' then
    f := f || platform.provision_finding('identity.label.missing');
  end if;
  if btrim(coalesce(p_spec->>'description','')) = '' then
    f := f || platform.provision_finding('identity.description.missing');
  end if;

  -- === type and origin ====================================================
  v_type := p_spec->>'type';
  if v_type is null then
    f := f || platform.provision_finding('type.missing', 'type',
           'entity | detail | reference | ledger | restricted | system | deprecated');
  elsif v_type not in ('entity','detail','reference','ledger','restricted','system','deprecated') then
    f := f || platform.provision_finding('type.unknown', 'type',
           'entity | detail | reference | ledger | restricted | system | deprecated', v_type);
  elsif v_type = 'deprecated' then
    f := f || platform.provision_finding('type.not_provisionable', 'type', null, v_type);
  elsif v_type = 'system' then
    f := f || platform.provision_finding('type.self_declared_machinery', 'type',
           'entity | detail | reference | ledger | restricted', v_type);
  end if;

  v_variant := case v_type
                 when 'entity'     then 'entity'
                 when 'detail'     then 'component'
                 when 'reference'  then 'system'
                 when 'ledger'     then 'ledger'
                 when 'restricted' then 'restricted'
                 else null end;

  v_origin := p_spec->>'origin';
  if v_origin is null then
    f := f || platform.provision_finding('origin.missing', 'origin', 'standard | custom');
  elsif v_origin = 'custom' then
    f := f || platform.provision_finding('origin.custom_unbuilt', 'origin', 'standard', 'custom');
  elsif v_origin <> 'standard' then
    f := f || platform.provision_finding('origin.missing', 'origin', 'standard | custom', v_origin);
  end if;

  -- === the access block — no silent defaults ==============================
  v_access := p_spec->'access';
  if v_access is null or jsonb_typeof(v_access) <> 'object' then
    f := f || platform.provision_finding('access.missing');
    v_access := '{}'::jsonb;
  end if;
  v_class := v_access->>'data_class';
  v_scope := v_access->>'default_list_scope';
  v_vis   := v_access->>'visibility';
  v_key   := v_access->>'key_column';

  if v_class is not null
     and v_class not in ('private','confidential','organization','public') then
    f := f || platform.provision_finding('access.data_class.missing', 'access.data_class',
           'private | confidential | organization | public', v_class);
    v_class := null;
  end if;

  if v_type = 'detail' then
    if v_class is not null then
      f := f || platform.provision_finding('access.data_class.forbidden_for_detail',
             'access.data_class', null, v_class);
    end if;
    if v_scope is not null then
      f := f || platform.provision_finding('access.default_list_scope.forbidden',
             'access.default_list_scope', null, v_scope);
    end if;
    if v_vis is not null then
      f := f || platform.provision_finding('access.visibility.forbidden', 'access.visibility', null, v_vis);
    end if;
    if p_spec->'component_anon_read_via_public_parent' is null then
      f := f || platform.provision_finding('registration.component_anon_read.missing');
    end if;
  elsif v_type in ('entity','reference','ledger','restricted') then
    if v_class is null then
      if v_type = 'ledger' then
        f := f || platform.provision_finding('access.data_class.ledger_private', 'access.data_class',
               'confidential | organization | public', '(not set), and type = ''ledger''');
      elsif v_key = 'user_id' then
        -- The personal shape: the live CHECK admits NULL or private, so NULL is a
        -- legal answer here and there is nothing to refuse.
        null;
      else
        f := f || platform.provision_finding('access.data_class.missing');
      end if;
    else
      if v_type = 'ledger' and v_class = 'private' then
        f := f || platform.provision_finding('access.data_class.ledger_private', 'access.data_class',
               'confidential | organization | public', 'private');
      end if;
      if v_key = 'user_id' and v_class <> 'private' then
        f := f || platform.provision_finding('access.data_class.personal_not_private',
               'access.data_class', 'private (or omit it)', v_class);
      end if;
      if btrim(coalesce(v_access->>'data_class_reason','')) = '' then
        f := f || platform.provision_finding('access.data_class_reason.missing');
      end if;
    end if;

    if v_type = 'ledger' then
      if v_scope is not null then
        f := f || platform.provision_finding('access.default_list_scope.forbidden',
               'access.default_list_scope', null, v_scope);
      end if;
    elsif v_scope is null then
      f := f || platform.provision_finding('access.default_list_scope.missing');
    elsif v_scope not in ('mine','organization') then
      f := f || platform.provision_finding('access.default_list_scope.missing',
             'access.default_list_scope', 'mine | organization', v_scope);
    end if;

    if v_type = 'restricted' and v_vis is not null then
      f := f || platform.provision_finding('access.visibility.forbidden', 'access.visibility', null, v_vis);
    elsif v_type = 'reference' and v_vis is null then
      f := f || platform.provision_finding('access.visibility.required');
    elsif v_vis is not null and v_vis not in ('personal','internal','link','public') then
      f := f || platform.provision_finding('access.visibility.required', 'access.visibility',
             'personal | internal | link | public', v_vis);
    elsif v_vis = 'personal' and btrim(coalesce(v_access->>'visibility_reason','')) = '' then
      f := f || platform.provision_finding('access.visibility.reason_missing');
    end if;

    if v_type = 'entity' then
      if v_key is null then
        f := f || platform.provision_finding('access.key_column.missing');
      elsif v_key not in ('created_by','user_id') then
        f := f || platform.provision_finding('access.key_column.missing', 'access.key_column',
               'created_by | user_id', v_key);
      end if;
      if v_key = 'user_id' then v_variant := 'personal'; end if;
    end if;
  end if;

  -- === parents ============================================================
  if v_type = 'detail' then
    if jsonb_array_length(coalesce(p_spec->'parents','[]'::jsonb)) = 0 then
      f := f || platform.provision_finding('parents.missing');
    end if;
  elsif jsonb_array_length(coalesce(p_spec->'parents','[]'::jsonb)) > 0 then
    f := f || platform.provision_finding('parents.forbidden', 'parents', null, v_type);
  end if;

  -- === fields =============================================================
  v_i := 0;
  for v_item in select value from jsonb_array_elements(coalesce(p_spec->'fields','[]'::jsonb)) loop
    v_i := v_i + 1;
    v_name := v_item->>'name';
    if not platform.provision_identifier_ok(v_name) then
      f := f || platform.provision_finding('fields.name.invalid', format('fields[%s].name', v_i), null, v_name);
      continue;
    end if;
    if v_name = any (platform.provision_base_columns()) then
      f := f || platform.provision_finding('fields.name.base_collision',
             format('fields[%s].name', v_i), null, v_name);
    end if;
    if v_name = any (v_names) then
      f := f || platform.provision_finding('fields.name.duplicate',
             format('fields[%s].name', v_i), null, v_name);
    end if;
    v_names := v_names || v_name;

    if btrim(coalesce(v_item->>'type','')) = '' then
      f := f || platform.provision_finding('fields.type.missing', format('fields[%s].type', v_i));
    elsif to_regtype(v_item->>'type') is null then
      f := f || platform.provision_finding('fields.type.missing', format('fields[%s].type', v_i),
             null, format('%L is not a type this database has', v_item->>'type'));
    end if;

    if v_item ? 'references' then
      v_fk_cols := v_fk_cols || v_name;
      v_txt := v_item->'references'->>'on_delete';
      if v_txt is null then
        f := f || platform.provision_finding('fields.references.on_delete.missing',
               format('fields[%s].references.on_delete', v_i));
      elsif lower(v_txt) not in ('cascade','restrict','set_null','no_action') then
        f := f || platform.provision_finding('fields.references.on_delete.missing',
               format('fields[%s].references.on_delete', v_i),
               'cascade | restrict | set_null | no_action', v_txt);
      end if;
      v_txt := v_item->'references'->>'target';
      if v_txt is null then
        f := f || platform.provision_finding('fields.references.target.unknown',
               format('fields[%s].references.target', v_i), null, '(not set)');
      elsif not exists (select 1 from platform.entity_types e where e.token = v_txt)
            and (position('.' in v_txt) = 0 or to_regclass(v_txt) is null) then
        f := f || platform.provision_finding('fields.references.target.unknown',
               format('fields[%s].references.target', v_i), null, v_txt);
      elsif v_restricted and p_org_id is not null
            and exists (select 1 from platform.entity_types e
                         where e.token = v_txt and e.rls_variant <> 'system'
                           and not exists (select 1 from platform.provision_grant g
                                            where g.organization_id = p_org_id and g.schema_name = e.schema_name)) then
        f := f || platform.provision_finding('parents.cross_tenant',
               format('fields[%s].references.target', v_i), null, v_txt);
      end if;

      v_txt := v_item->>'relationship_kind';
      if v_txt is null then
        f := f || platform.provision_finding('fields.relationship_kind.missing',
               format('fields[%s].relationship_kind', v_i));
      elsif v_txt not in ('composition','reference','lookup') then
        f := f || platform.provision_finding('fields.relationship_kind.missing',
               format('fields[%s].relationship_kind', v_i), 'composition | reference | lookup', v_txt);
      elsif btrim(coalesce(v_item->>'relationship_note','')) = '' then
        f := f || platform.provision_finding('fields.relationship_kind.missing',
               format('fields[%s].relationship_note', v_i), null,
               'the kind is declared but the one-line note is empty');
      end if;
    end if;

    if v_item ? 'generated'
       and coalesce((v_item->'generated'->>'stored')::boolean, false) is not true then
      f := f || platform.provision_finding('fields.generated.stored',
             format('fields[%s].generated.stored', v_i), 'true', v_item->'generated'->>'stored');
    end if;
  end loop;

  v_all_cols := v_names || platform.provision_base_columns();

  -- The personal shape keys every row on user_id; iam.verify_canonical FAILs
  -- `legacy_owner_col` ("personal variant requires user_id") without the column.
  if v_type = 'entity' and v_key = 'user_id' and not ('user_id' = any (v_names)) then
    f := f || platform.provision_finding('access.key_column.user_id_missing', 'fields', null,
           'access.key_column = ''user_id'' but no field is named user_id');
  end if;

  -- parent FK columns must be columns this spec declares
  v_i := 0;
  for v_txt in select value #>> '{}' from jsonb_array_elements(coalesce(p_spec->'parents','[]'::jsonb)) loop
    v_i := v_i + 1;
    if position(':' in v_txt) = 0
       or btrim(split_part(v_txt, ':', 1)) = '' or btrim(split_part(v_txt, ':', 2)) = '' then
      f := f || platform.provision_finding('parents.shape', format('parents[%s]', v_i), null, v_txt);
      continue;
    end if;
    v_name := btrim(split_part(v_txt, ':', 1));
    if not exists (select 1 from platform.entity_types e where e.token = v_name) then
      f := f || platform.provision_finding('parents.unknown_token', format('parents[%s]', v_i), null, v_name);
    elsif v_restricted and p_org_id is not null
          and exists (select 1 from platform.entity_types e
                       where e.token = v_name and e.rls_variant <> 'system'
                         and not exists (select 1 from platform.provision_grant g
                                          where g.organization_id = p_org_id and g.schema_name = e.schema_name)) then
      f := f || platform.provision_finding('parents.cross_tenant', format('parents[%s]', v_i), null, v_name);
    end if;
    if btrim(split_part(v_txt, ':', 2)) <> all (v_names) then
      f := f || platform.provision_finding('parents.unknown_column', format('parents[%s]', v_i), null,
             btrim(split_part(v_txt, ':', 2)));
    end if;
  end loop;

  -- === registration =======================================================
  v_txt := p_spec->>'taxonomy_node_id';
  if v_txt is null then
    f := f || platform.provision_finding('registration.taxonomy_node_id.missing');
  else
    begin
      v_uuid := v_txt::uuid;
      if not exists (select 1 from platform.taxonomy_node t where t.id = v_uuid) then
        f := f || platform.provision_finding('registration.taxonomy_node_id.unknown', 'taxonomy_node_id', null, v_txt);
      end if;
    exception when others then
      f := f || platform.provision_finding('registration.taxonomy_node_id.unknown', 'taxonomy_node_id', null, v_txt);
    end;
  end if;

  if btrim(coalesce(p_spec->>'category_label','')) = '' then
    f := f || platform.provision_finding('registration.category_label.missing');
  end if;

  if coalesce((p_spec->>'is_listed')::boolean, false) then
    v_txt := p_spec->>'title_column';
    if v_txt is null then
      f := f || platform.provision_finding('registration.title_column.missing');
    elsif v_txt <> all (v_all_cols) then
      f := f || platform.provision_finding('registration.title_column.unknown', 'title_column',
             array_to_string(v_all_cols, ' | '), v_txt);
    end if;
  end if;

  if p_spec ? 'content_role'
     and p_spec->>'content_role' <> all (platform.provision_live_vocabulary('content_role')) then
    f := f || platform.provision_finding('registration.content_role.unknown', 'content_role',
           array_to_string(platform.provision_live_vocabulary('content_role'), ' | '), p_spec->>'content_role');
  end if;

  if coalesce(p_spec->>'relation_kind','table') = 'projection'
     and (p_spec->>'projects_token' is null or coalesce(p_spec->>'audit_class','entity') <> 'machinery') then
    f := f || platform.provision_finding('registration.relation_kind.projection');
  end if;

  if coalesce(p_spec->>'audit_class','entity') = 'machinery'
     and btrim(coalesce(p_spec->>'audit_class_reason','')) = '' then
    f := f || platform.provision_finding('registration.audit_class.reason_missing');
  end if;

  -- === sharing ============================================================
  if not (p_spec ? 'sharing') then
    f := f || platform.provision_finding('sharing.missing');
  elsif jsonb_typeof(p_spec->'sharing') = 'object' then
    if btrim(coalesce(p_spec->'sharing'->>'display_label','')) = '' then
      f := f || platform.provision_finding('sharing.missing', 'sharing.display_label', null,
             'the sharing object carries no display_label');
    end if;
    if btrim(coalesce(p_spec->'sharing'->>'url_path_template','')) = '' then
      f := f || platform.provision_finding('sharing.missing', 'sharing.url_path_template', null,
             'the sharing object carries no url_path_template');
    end if;
    -- ATTACK #20: strip-client-excluded-columns.ts removes an excluded column from
    -- database.types.ts, so the share renderer would reference a field the types
    -- say does not exist.
    for v_txt in
      select x from unnest(coalesce(
        array(select jsonb_array_elements_text(p_spec->'sharing'->'public_columns')), '{}'::text[])) x
      where x = any (coalesce(array(select jsonb_array_elements_text(p_spec->'client_excluded_columns')), '{}'::text[]))
    loop
      f := f || platform.provision_finding('sharing.excluded_and_public', 'sharing.public_columns', null, v_txt);
    end loop;
  end if;

  -- === indexes ============================================================
  v_soft := coalesce((p_spec->>'soft_delete')::boolean, v_type is distinct from 'ledger');
  v_i := 0;
  for v_item in select value from jsonb_array_elements(coalesce(p_spec->'indexes','[]'::jsonb)) loop
    v_i := v_i + 1;
    if v_item ? 'method'
       and lower(v_item->>'method') <> all (platform.provision_live_vocabulary('index_method')) then
      f := f || platform.provision_finding('indexes.method.unknown', format('indexes[%s].method', v_i),
             array_to_string(platform.provision_live_vocabulary('index_method'), ' | '), v_item->>'method');
    end if;
    for v_txt in select jsonb_array_elements_text(coalesce(v_item->'columns','[]'::jsonb)) loop
      if v_txt <> all (v_all_cols) then
        f := f || platform.provision_finding('registration.title_column.unknown',
               format('indexes[%s].columns', v_i), array_to_string(v_all_cols, ' | '), v_txt);
      end if;
    end loop;
  end loop;

  -- === association types ==================================================
  v_i := 0;
  for v_item in select value from jsonb_array_elements(coalesce(p_spec->'association_types','[]'::jsonb)) loop
    v_i := v_i + 1;
    foreach v_txt in array array['source_type','target_type'] loop
      v_name := v_item->>v_txt;
      if v_name is not null and v_name <> coalesce(v_token,'')
         and not exists (select 1 from platform.entity_types e where e.token = v_name) then
        f := f || platform.provision_finding('association_types.unknown_token',
               format('association_types[%s].%s', v_i, v_txt), null, v_name);
      end if;
    end loop;
    if (v_item->'label') is null or jsonb_typeof(v_item->'label') = 'null' then
      if btrim(coalesce(v_item->>'notes','')) = '' then
        f := f || platform.provision_finding('association_types.wildcard_reason',
               format('association_types[%s].label', v_i), null, 'null (a wildcard for the whole pair)');
      end if;
    end if;
  end loop;

  -- === functions ==========================================================
  v_i := 0;
  for v_item in select value from jsonb_array_elements(coalesce(p_spec->'functions','[]'::jsonb)) loop
    v_i := v_i + 1;
    v_name := coalesce(v_item->>'name', format('#%s', v_i));
    if not v_restricted and btrim(coalesce(v_item->>'body','')) = '' then
      f := f || platform.provision_finding('functions.body.missing', format('functions[%s].body', v_name));
    end if;
    v_txt := v_item->>'client_access';
    if v_txt is null then
      f := f || platform.provision_finding('functions.client_access.missing',
             format('functions[%s].client_access', v_name));
    elsif v_txt not in ('anonymous','signed_in','server_only') then
      f := f || platform.provision_finding('functions.client_access.missing',
             format('functions[%s].client_access', v_name),
             'anonymous | signed_in | server_only', v_txt);
    elsif v_txt = 'server_only' then
      if length(btrim(coalesce(v_item->>'non_client_lane',''))) < 40 then
        f := f || platform.provision_finding('functions.non_client_lane.missing',
               format('functions[%s].non_client_lane', v_name),
               'at least 40 characters (the live CHECK door_non_client_lane_is_declared)',
               coalesce(v_item->>'non_client_lane','(not set)'));
      end if;
    elsif v_txt = 'anonymous' and length(btrim(coalesce(v_item->>'anonymous_purpose',''))) < 40 then
      f := f || platform.provision_finding('functions.client_access.missing',
             format('functions[%s].anonymous_purpose', v_name),
             'at least 40 characters (the live CHECK door_anonymous_purpose_is_declared)',
             coalesce(v_item->>'anonymous_purpose','(not set)'));
    end if;
    if btrim(coalesce(v_item->>'reason','')) = '' then
      f := f || platform.provision_finding('functions.reason.missing', format('functions[%s].reason', v_name));
    end if;
    -- lessons ledger 23 + 27: a door is declared per ARGUMENT, and NULL is an argument.
    -- An entry with no body declares a door for a function that ALREADY exists (the
    -- only kind lane B may declare), so its arguments are read from the catalogue,
    -- never from text the caller wrote.
    v_txt := v_item->>'args';
    if not (v_item ? 'body') then
      select pg_get_function_arguments(p.oid) into v_txt
        from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
       where ns.nspname = v_schema and p.proname = v_item->>'name'
       order by p.oid desc limit 1;
      if not found then
        if v_restricted then
          f := f || platform.provision_finding('functions.not_found',
                 format('functions[%s].name', coalesce(v_item->>'name','?')), null,
                 format('%s.%s does not exist', coalesce(v_schema,'?'), coalesce(v_item->>'name','?')));
        end if;
        v_txt := v_item->>'args';
      end if;
    end if;
    f := f || platform.provision_arg_check_findings(coalesce(v_item->>'name','?'), v_txt, v_item->'arg_checks');
  end loop;

  -- === views ==============================================================
  for v_item in select value from jsonb_array_elements(coalesce(p_spec->'views','[]'::jsonb)) loop
    v_name := coalesce(v_item->>'name','?');
    if not v_restricted and btrim(coalesce(v_item->>'definition','')) = '' then
      f := f || platform.provision_finding('views.definition.missing', format('views[%s].definition', v_name));
    end if;
    if coalesce((v_item->>'security_invoker')::boolean, true) is false
       and btrim(coalesce(v_item->>'security_invoker_reason','')) = '' then
      f := f || platform.provision_finding('views.security_invoker.exemption',
             format('views[%s].security_invoker', v_name), 'true', 'false');
    end if;
    if coalesce((v_item->>'registered_as_projection')::boolean, false)
       and jsonb_array_length(coalesce(v_item->'primary_key','[]'::jsonb)) = 0 then
      f := f || platform.provision_finding('views.projection.primary_key', format('views[%s].primary_key', v_name));
    end if;
  end loop;

  -- === knobs ==============================================================
  for v_item in select value from jsonb_array_elements(coalesce(p_spec->'knobs','[]'::jsonb)) loop
    v_name := format('%s/%s', coalesce(v_item->>'feature','?'), coalesce(v_item->>'key','?'));
    v_txt := v_item->>'value_type';
    if v_txt is null or v_txt <> all (platform.provision_live_vocabulary('knob_value_type')) then
      f := f || platform.provision_finding('knobs.value_type.unknown', format('knobs[%s].value_type', v_name),
             array_to_string(platform.provision_live_vocabulary('knob_value_type'), ' | '),
             coalesce(v_txt,'(not set)'));
    elsif v_txt = 'secret' and (jsonb_typeof(coalesce(v_item->'value','null'::jsonb)) <> 'object'
                                or not (v_item->'value' ? 'vault_key')) then
      f := f || platform.provision_finding('knobs.secret_shape', format('knobs[%s].value', v_name));
    elsif v_txt = 'json' and (v_item ? 'min_value' or v_item ? 'max_value' or v_item ? 'allowed_values') then
      f := f || platform.provision_finding('knobs.json_range', format('knobs[%s].min_value', v_name));
    end if;
    for v_txt in select jsonb_array_elements_text(coalesce(v_item->'overridable_by','[]'::jsonb)) loop
      if v_txt <> all (platform.provision_live_vocabulary('knob_scope_kind')) then
        f := f || platform.provision_finding('knobs.overridable_by.unknown',
               format('knobs[%s].overridable_by', v_name),
               array_to_string(platform.provision_live_vocabulary('knob_scope_kind'), ' | '), v_txt);
      end if;
    end loop;
    foreach v_txt in array array['override_direction','propagation','set_by'] loop
      if v_item ? v_txt
         and v_item->>v_txt <> all (platform.provision_live_vocabulary('knob_'||v_txt)) then
        f := f || platform.provision_finding('knobs.value_type.unknown', format('knobs[%s].%s', v_name, v_txt),
               array_to_string(platform.provision_live_vocabulary('knob_'||v_txt), ' | '), v_item->>v_txt);
      end if;
    end loop;
  end loop;

  -- === the platform's answers, STATED BACK (§4, the 15 silent columns) =====
  v_defaults := jsonb_build_object(
    'versioned', false,
    'soft_delete', (v_type is distinct from 'ledger'),
    'category', false,
    'gin_jsonb', exists (select 1 from jsonb_array_elements(coalesce(p_spec->'fields','[]'::jsonb)) x
                          where lower(coalesce(x.value->>'type','')) = 'jsonb'),
    'realtime', false,
    'content_kinds', '[]'::jsonb,
    'custom_fields', false,
    'is_listed', false,
    'relation_kind', 'table',
    'audit_class', 'entity',
    'version_store', 'history',
    'client_read_only', false,
    'reference_pickable', false,
    'agent_writable', false,
    'confirmation_enabled', false,
    'indexes', '[]'::jsonb,
    'fields', '[]'::jsonb,
    'checks', '[]'::jsonb,
    'types', '[]'::jsonb,
    'functions', '[]'::jsonb,
    'views', '[]'::jsonb,
    'knobs', '[]'::jsonb,
    'association_types', '[]'::jsonb,
    'parents', '[]'::jsonb,
    'client_excluded_columns', '[]'::jsonb)
  -- lesson 19: the 15 columns nobody was told about. Each value below IS the live
  -- column default, so nothing changes behaviourally -- only the silence ends.
  || jsonb_build_object(
    'base_tier', 1,
    'is_module', false,
    'default_members_can_add', true,
    'default_needs_approval', false,
    'default_scopeable', true,
    'default_auto_ingest', false,
    'allow_preview', true,
    'reference_candidate_predicates', '{}'::jsonb,
    'governed_columns', null,
    'retention_owner_column', null,
    'user_artifact_kind', null,
    'reference_category', null,
    'agent_write_notes', null,
    'lifecycle', '{"enlisted": false, "hot_days": null}'::jsonb);

  for v_name, v_sub in select key, value from jsonb_each(v_defaults) loop
    if not (n ? v_name) then
      n := n || jsonb_build_object(v_name, v_sub);
      answered := answered || v_name;
    end if;
  end loop;

  -- A unique index on a soft-deletable table is made PARTIAL on deleted_at IS NULL
  -- (DD-121). Stated back rather than assumed; omit it only with a written reason.
  if v_soft then
    n := jsonb_set(n, '{indexes}', coalesce((
      select jsonb_agg(
        case when coalesce((ix.value->>'unique')::boolean, false)
                  and not (ix.value ? 'where')
                  and not (ix.value ? 'where_omitted_reason')
             then ix.value || jsonb_build_object('where', 'deleted_at IS NULL')
             else ix.value end)
        from jsonb_array_elements(n->'indexes') ix), '[]'::jsonb));
  end if;

  -- The personal shape with no class: the live CHECK admits NULL, but iam.apply_rls
  -- refuses an unset class (DD-137b) and iam.verify_canonical FAILs a personal token
  -- that is not `private` (§3.1 derivation one). There is exactly one legal value, so
  -- it is the platform's answer, stated back — never a 23502 from inside apply_rls.
  if v_type = 'entity' and v_key = 'user_id' and v_class is null then
    n := jsonb_set(n, '{access}', coalesce(n->'access', '{}'::jsonb) || jsonb_build_object(
           'data_class', 'private',
           'data_class_reason', coalesce(nullif(btrim(v_access->>'data_class_reason'), ''),
             'personal shape: every row belongs to the one person in user_id, and rls_variant personal admits only the private class')));
    answered := answered || 'access.data_class'::text;
  end if;

  n := n || jsonb_build_object(
    'rls_variant', v_variant,
    'platform_answers', to_jsonb(answered));

  -- === the plan ===========================================================
  plan := array[
    jsonb_build_object('step','preflight','detail','7 event triggers bound+enabled, session_replication_role=origin, lock_timeout bounded, entity read kernel fingerprint matches, no provisioning already in flight'),
    jsonb_build_object('step','revalidate','detail','platform.provision_validate is re-run inside provision()''s own transaction — that is where a race with concurrent DDL resolves (no plan fingerprint, PLAN §3.2)')];
  if jsonb_array_length(n->'types') > 0 then
    plan := plan || jsonb_build_object('step','create types','detail', format('%s enum type(s) in %s', jsonb_array_length(n->'types'), coalesce(quote_ident(v_schema), '(schema not set)')));
  end if;
  plan := plan || jsonb_build_object('step','create table',
            -- quote_ident(NULL) is NULL, where %I on NULL RAISES: an empty spec must come
            -- back as findings, never as "null values cannot be formatted as an SQL identifier".
            'detail', format('%s.%s with %s declared column(s) plus the base contract',
                             coalesce(quote_ident(v_schema), '(schema not set)'),
                             coalesce(quote_ident(v_table), '(table not set)'),
                             jsonb_array_length(coalesce(n->'fields', '[]'::jsonb))));
  plan := plan || jsonb_build_object('step','revoke default ACL',
            'detail','REVOKE ALL FROM PUBLIC, anon, authenticated, service_role immediately after CREATE TABLE — 20 schemas carry ALTER DEFAULT PRIVILEGES rows that grant every NEW relation automatically, so today the default ACL, not the spec, is the source of a new table''s grants');
  plan := plan || jsonb_build_object('step','indexes',
            'detail','every FK gets a covering index, BASE COLUMNS INCLUDED (organization_id, created_by, updated_by) — that trio is 1,174 of the 2,029 live unindexed FKs');
  plan := plan || jsonb_build_object('step','triggers','detail','_stamp_actor, _stamp_actor_tier, _touch_row, _metadata_guard, and platform.assert_same_org for every declared tenancy check (the ONE shared validation-only function, never a per-table clone)');
  plan := plan || jsonb_build_object('step','iam.apply_rls','detail', format('variant %s', coalesce(v_variant,'?')));
  plan := plan || jsonb_build_object('step','register','detail','platform.entity_types, including every one of the 15 columns that used to be left to the column default with nobody told');
  if jsonb_array_length(n->'association_types') > 0 then
    plan := plan || jsonb_build_object('step','association types','detail', format('%s edge type(s)', jsonb_array_length(n->'association_types')));
  end if;
  if jsonb_array_length(n->'knobs') > 0 then
    plan := plan || jsonb_build_object('step','knobs','detail','seeded in the SAME transaction — platform.knob_resolve raises on a missing knob rather than falling back (lessons ledger 11)');
  end if;
  if jsonb_array_length(n->'views') > 0 then
    plan := plan || jsonb_build_object('step','views','detail','security_invoker = true unless an exemption reason is given');
  end if;
  if jsonb_array_length(n->'functions') > 0 then
    plan := plan || jsonb_build_object('step','functions','detail', format('%s function(s)', jsonb_array_length(n->'functions')));
  end if;
  plan := plan || jsonb_build_object('step','doors','detail','every client_callable_door row written BEFORE any grant (lessons ledger 1 and 24: a guard-log revoke row means the grant preceded the door, 51 times out of 86)');
  plan := plan || jsonb_build_object('step','grants','detail','every GRANT last, as ONE block — each GRANT fires a DB-wide re-sweep of ~2,000 DEFINER functions');
  plan := plan || jsonb_build_object('step','certify','detail','iam.canonical_certify; provision() refuses on any FAIL and on the WARNs that describe the table it just built');
  plan := plan || jsonb_build_object('step','capture','detail','the platform.provision_spec row, inside this same transaction, so capture cannot be skipped');

  return jsonb_build_object(
    'ok', cardinality(f) = 0,
    'lane', v_lane,
    'findings', coalesce(to_jsonb(f), '[]'::jsonb),
    'normalized_spec', n,
    'spec_hash', md5(n::text),
    'plan', coalesce(to_jsonb(plan), '[]'::jsonb),
    'locks', 'ACCESS SHARE on what it reads, and never ACCESS EXCLUSIVE, because it emits no DDL. This is not "no locks".');
end;
$function$;

CREATE OR REPLACE FUNCTION platform.provision(p_spec jsonb, p_applied_via text DEFAULT 'supabase_mcp'::text, p_org_id uuid DEFAULT NULL::uuid, p_lane text DEFAULT 'full'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_pre      jsonb;
  v_res      jsonb;
  n          jsonb;
  v_cur      record;
  v_hash     text;
  v_schema   text;
  v_table    text;
  v_token    text;
  v_variant  text;
  v_rel      text;
  v_cols     text;
  v_item     jsonb;
  v_txt      text;
  v_target   text;
  v_frag     text;
  v_soft     boolean;
  v_vis      text;
  v_cat      boolean;
  v_class    text;
  v_created  jsonb[] := '{}'::jsonb[];
  v_certify  jsonb[] := '{}'::jsonb[];
  v_refuse   text[]  := '{}'::text[];
  v_grants   text[]  := '{}'::text[];
  v_argf     jsonb[] := '{}'::jsonb[];
  v_refs     text[]  := '{}'::text[];
  v_idx      jsonb   := '[]'::jsonb;
  v_actor    uuid;
  v_role     text;
  r          record;
begin
  -- ---- preflight -------------------------------------------------------
  v_pre := platform.provision_preflight();
  if not (v_pre->>'ok')::boolean then
    raise exception 'provision: PREFLIGHT REFUSED (% problem(s)). Nothing was written.%',
      jsonb_array_length(v_pre->'findings'),
      (select string_agg(E'\n\n' || (x->>'message'), '') from jsonb_array_elements(v_pre->'findings') x)
      using errcode = 'check_violation',
            hint = 'The enforcement chain this path rests on is not intact. Fix the named condition and call platform.provision again; nothing was written, so there is nothing to undo.';
  end if;

  -- ---- validate, inside THIS transaction (PLAN §3.2 — no plan fingerprint) ----
  v_res   := platform.provision_validate(p_spec, p_lane, p_org_id);
  n       := v_res->'normalized_spec';
  v_hash  := v_res->>'spec_hash';
  v_token := p_spec->>'token';

  -- ---- unchanged / changed --------------------------------------------
  if v_token is not null then
    select * into v_cur from platform.v_provision_spec_current c where c.token = v_token;
    if found then
      -- Lane B may only see its OWN declarations. Another organization's token answers
      -- exactly like any taken token, so neither existence nor the hash leaks.
      if p_lane = 'restricted' and v_cur.owner_org_id is distinct from p_org_id then
        raise exception '%', (platform.provision_finding('identity.token.taken', 'token', null, v_token))->>'message'
          using errcode = 'check_violation';
      end if;
      if v_cur.spec_hash = v_hash then
        return jsonb_build_object('ok', true, 'unchanged', true, 'token', v_token,
                 'spec_hash', v_hash, 'plan', '[]'::jsonb, 'created', '[]'::jsonb,
                 'certify', '[]'::jsonb,
                 'detail', format('%s already carries this exact declaration (applied %s). Nothing was written.',
                                  v_token, v_cur.applied_at));
      end if;
      raise exception 'provision: % already carries a DIFFERENT declaration. provision() creates, it never alters. Changed: %',
        v_token,
        coalesce((select string_agg(k, ', ' order by k)
                    from (select key k from jsonb_each(n)
                          union select key from jsonb_each(v_cur.spec)) x
                   where (n->x.k) is distinct from (v_cur.spec->x.k)), '(no key-level difference — only the hash)')
        using errcode = 'check_violation',
              hint = (select otherwise from platform.provision_rule_message where rule_id = 'evolve.changed_spec');
    end if;
  end if;

  -- ---- findings: ONE error, and nothing written ------------------------
  if not (v_res->>'ok')::boolean then
    raise exception 'provision: % finding(s); call platform.provision_validate(<spec>) for the list. Nothing was written.',
      jsonb_array_length(v_res->'findings')
      using errcode = 'check_violation',
            hint = format('The rules that refused: %s',
                     (select string_agg(x->>'rule_id', ', ') from jsonb_array_elements(v_res->'findings') x));
  end if;

  v_schema  := n->>'schema';
  v_table   := n->>'table';
  v_variant := n->>'rls_variant';
  v_rel     := format('%I.%I', v_schema, v_table);
  v_soft    := (n->>'soft_delete')::boolean;
  v_vis     := n->'access'->>'visibility';
  v_cat     := (n->>'category')::boolean;
  v_class   := n->'access'->>'data_class';

  perform set_config('matrx.provisioner', '1', true);
  perform platform.provision_marker_set(true);   -- wave 3: the proof the guards actually read

  -- ---- types[] ---------------------------------------------------------
  for v_item in select value from jsonb_array_elements(n->'types') loop
    execute format('create type %I.%I as enum (%s)', v_schema, v_item->>'name',
             (select string_agg(quote_literal(l), ', ')
                from jsonb_array_elements_text(v_item->'labels') l));
    v_created := v_created || jsonb_build_object('type', format('%s.%s', v_schema, v_item->>'name'));
  end loop;

  -- ---- the table -------------------------------------------------------
  v_cols := 'id uuid primary key default gen_random_uuid()';
  for v_item in select value from jsonb_array_elements(n->'fields') loop
    v_frag := format('%I %s', v_item->>'name', to_regtype(v_item->>'type')::text);
    if v_item ? 'generated' then
      v_frag := v_frag || format(' generated always as (%s) stored', v_item->'generated'->>'expression');
    else
      if coalesce((v_item->>'not_null')::boolean, false) then v_frag := v_frag || ' not null'; end if;
      if v_item ? 'default' and jsonb_typeof(v_item->'default') <> 'null' then
        v_frag := v_frag || format(' default %s', v_item->'default' #>> '{}');
      end if;
    end if;
    if v_item ? 'references' then
      v_target := v_item->'references'->>'target';
      v_target := coalesce(
        (select format('%I.%I', e.schema_name, e.table_name) from platform.entity_types e where e.token = v_target),
        to_regclass(v_target)::text);
      v_frag := v_frag || format(' references %s(id) on delete %s', v_target,
        case lower(v_item->'references'->>'on_delete')
          when 'cascade' then 'cascade' when 'restrict' then 'restrict'
          when 'set_null' then 'set null' else 'no action' end);
    end if;
    if v_item ? 'check' then
      v_frag := v_frag || format(' check (%s)', v_item->>'check');
    end if;
    v_cols := v_cols || ', ' || v_frag;
  end loop;

  v_cols := v_cols || ', organization_id uuid not null references iam.organizations(id)';
  v_cols := v_cols || ', created_by uuid references auth.users(id)';
  v_cols := v_cols || ', updated_by uuid references auth.users(id)';
  v_cols := v_cols || ', created_at timestamptz not null default now()';
  v_cols := v_cols || ', updated_at timestamptz not null default now()';
  if v_soft then v_cols := v_cols || ', deleted_at timestamptz'; end if;
  v_cols := v_cols || ', version integer not null default 1';
  v_cols := v_cols || ', metadata jsonb not null default ''{}''::jsonb';
  if v_vis is not null then
    v_cols := v_cols || format(', visibility platform.visibility not null default %L::platform.visibility', v_vis);
  end if;
  if v_cat then v_cols := v_cols || ', category_id uuid references platform.categories(id)'; end if;
  for v_item in select value from jsonb_array_elements(n->'checks') loop
    v_cols := v_cols || format(', constraint %I check (%s)', v_item->>'name', v_item->>'expression');
  end loop;

  execute format('create table %s (%s)', v_rel, v_cols);
  v_created := v_created || jsonb_build_object('table', format('%s.%s', v_schema, v_table));

  -- 🚨 THE REVOKE IS NOT BELT-AND-BRACES. 20 schemas carry ALTER DEFAULT PRIVILEGES
  -- rows that grant every NEW relation automatically — crm gives authenticated=arwd
  -- and service_role=arwd AT `CREATE TABLE`. iam.apply_table_grants (inside apply_rls)
  -- then grants what the variant actually earns.
  execute format('revoke all on table %s from public, anon, authenticated, service_role', v_rel);

  -- ---- comments (the cheapest machine-readable intent we have) ----------
  execute format('comment on table %s is %L', v_rel, n->>'description');
  for v_item in select value from jsonb_array_elements(n->'fields') loop
    if v_item ? 'description' then
      execute format('comment on column %s.%I is %L', v_rel, v_item->>'name', v_item->>'description');
    end if;
  end loop;

  -- ---- indexes ---------------------------------------------------------
  -- EVERY FK gets a covering index, BASE COLUMNS INCLUDED: updated_by, organization_id
  -- and created_by are 1,174 of the 2,029 live unindexed FKs, and they are columns the
  -- BUILDER emits, so the rule lives here and not in the declaration.
  foreach v_txt in array array['organization_id','created_by','updated_by'] loop
    execute format('create index on %s (%I)', v_rel, v_txt);
  end loop;
  if v_cat then execute format('create index on %s (category_id)', v_rel); end if;
  for v_item in select value from jsonb_array_elements(n->'fields') loop
    if v_item ? 'references' and coalesce((v_item->>'index')::boolean, true) then
      execute format('create index on %s (%I)', v_rel, v_item->>'name');
    end if;
    if coalesce((v_item->>'unique')::boolean, false) then
      v_idx := v_idx || jsonb_build_array(jsonb_build_object(
        'columns', jsonb_build_array(v_item->>'name'), 'unique', true,
        'where', case when v_soft then 'deleted_at IS NULL' else null end));
    end if;
    if (n->>'gin_jsonb')::boolean and lower(coalesce(v_item->>'type','')) = 'jsonb' then
      execute format('create index on %s using gin (%I)', v_rel, v_item->>'name');
    end if;
  end loop;
  for v_item in select value from jsonb_array_elements(n->'indexes' || v_idx) loop
    execute format('create %s index on %s using %s (%s)%s',
      case when coalesce((v_item->>'unique')::boolean, false) then 'unique' else '' end,
      v_rel, coalesce(v_item->>'method','btree'),
      (select string_agg(format('%I', c), ', ') from jsonb_array_elements_text(v_item->'columns') c),
      case when v_item->>'where' is not null then format(' where %s', v_item->>'where') else '' end);
  end loop;

  -- ---- REGISTER (before the triggers: the admission trigger on this INSERT
  --      attaches _stamp_actor_tier itself — B-77) ------------------------
  insert into platform.entity_types(
    token, schema_name, table_name, label, origin, is_versioned, has_soft_delete,
    is_component, is_listed, default_visibility, rls_variant, table_ref, is_active,
    data_class, default_list_scope, suppress_platform_admin_lane, category,
    title_column, content_role, relation_kind, projects_token, audit_class, audit_class_reason,
    client_read_only, reference_pickable, agent_writable, agent_write_notes, confirmation_enabled,
    client_excluded_columns, component_anon_read_via_public_parent, taxonomy_node_id,
    base_tier, is_module, default_members_can_add, default_needs_approval, default_scopeable,
    default_auto_ingest, allow_preview, reference_candidate_predicates, governed_columns,
    retention_owner_column, user_artifact_kind, reference_category,
    lifecycle_enlisted, lifecycle_hot_days, version_store, data_class_reason)
  values (
    v_token, v_schema, v_table, n->>'label', n->>'origin',
    (n->>'versioned')::boolean, v_soft,
    (v_variant = 'component'), (n->>'is_listed')::boolean,
    nullif(v_vis,'')::platform.visibility, v_variant, v_rel::regclass, true,
    v_class::platform.data_class,
    (n->'access'->>'default_list_scope')::platform.list_scope,
    -- §3.1 derivation two: a private or confidential token closes the platform-admin
    -- lane. A detail's class is its parent's and is resolved below, once parents exist.
    coalesce(v_variant = 'restricted' or v_class in ('private', 'confidential'), false),
    n->>'category_label',
    n->>'title_column', n->>'content_role', n->>'relation_kind', n->>'projects_token',
    n->>'audit_class', n->>'audit_class_reason',
    (n->>'client_read_only')::boolean, (n->>'reference_pickable')::boolean,
    (n->>'agent_writable')::boolean, n->>'agent_write_notes', (n->>'confirmation_enabled')::boolean,
    nullif(array(select jsonb_array_elements_text(n->'client_excluded_columns')), '{}'),
    coalesce((n->>'component_anon_read_via_public_parent')::boolean, false),
    (n->>'taxonomy_node_id')::uuid,
    (n->>'base_tier')::smallint, (n->>'is_module')::boolean,
    (n->>'default_members_can_add')::boolean, (n->>'default_needs_approval')::boolean,
    (n->>'default_scopeable')::boolean, (n->>'default_auto_ingest')::boolean,
    (n->>'allow_preview')::boolean, n->'reference_candidate_predicates',
    case when jsonb_typeof(n->'governed_columns') = 'array'
         then array(select jsonb_array_elements_text(n->'governed_columns')) end,
    n->>'retention_owner_column', n->>'user_artifact_kind', n->>'reference_category',
    coalesce((n->'lifecycle'->>'enlisted')::boolean, false),
    (n->'lifecycle'->>'hot_days')::integer,
    n->>'version_store', n->'access'->>'data_class_reason');
  v_created := v_created || jsonb_build_object('entity_type', v_token);

  -- ---- parents ---------------------------------------------------------
  for v_txt in select value #>> '{}' from jsonb_array_elements(n->'parents') loop
    insert into platform.entity_relationships(child_type, parent_type, fk_column, kind)
    values (v_token, btrim(split_part(v_txt, ':', 1)), btrim(split_part(v_txt, ':', 2)), 'composition');
  end loop;

  -- A detail (and a ledger) is judged on its RESOLVED class (DD-137b10): under a
  -- private or confidential parent the platform-staff lane is closed on it too.
  if v_variant in ('component', 'ledger')
     and (iam.class_lanes(v_token)).resolved_class::text in ('private', 'confidential') then
    update platform.entity_types set suppress_platform_admin_lane = true where token = v_token;
  end if;

  -- ---- triggers --------------------------------------------------------
  execute format('create trigger _stamp_actor before insert or update on %s for each row execute function platform._stamp_actor()', v_rel);
  -- B-77: the entity_types admission trigger may already have attached this one.
  -- The test is BY FUNCTION, never by name (DD-173).
  if not exists (select 1 from pg_trigger t
                  where t.tgrelid = v_rel::regclass and not t.tgisinternal
                    and t.tgfoid = 'platform._stamp_actor_tier()'::regprocedure) then
    execute format('create trigger _stamp_actor_tier before insert or update on %s for each row execute function platform._stamp_actor_tier()', v_rel);
  end if;
  execute format('create trigger _touch_row before insert or update on %s for each row execute function platform._touch_row()', v_rel);
  execute format('create trigger _metadata_guard before insert or update of metadata on %s for each row execute function platform._metadata_guard(%L)', v_rel, v_token);
  if (n->>'versioned')::boolean then
    execute format('create trigger _version_capture after insert or delete or update on %s for each row execute function platform._version_capture(%L)', v_rel, v_token);
  end if;

  -- The ONE shared tenancy trigger, per declared nullable FK into a tenant table.
  for v_item in select value from jsonb_array_elements(n->'fields') loop
    if coalesce((v_item->>'tenancy_check')::boolean, false) then
      v_target := v_item->'references'->>'target';
      v_target := coalesce(
        (select format('%I.%I', e.schema_name, e.table_name) from platform.entity_types e where e.token = v_target),
        to_regclass(v_target)::text);
      execute format(
        'create trigger %I before insert or update of %I on %s for each row execute function platform.assert_same_org(%L, %L)',
        left(format('_same_org_%s', v_item->>'name'), 63), v_item->>'name', v_rel,
        v_item->>'name', v_target);
    end if;
  end loop;

  perform platform.sync_association_gc_triggers(v_token);

  -- ---- RLS -------------------------------------------------------------
  perform iam.apply_rls(v_schema, v_table, v_token, v_variant);

  -- ---- association types -----------------------------------------------
  for v_item in select value from jsonb_array_elements(n->'association_types') loop
    insert into platform.association_types(source_type, target_type, label, container_side, conveys_max, notes)
    values (v_item->>'source_type', v_item->>'target_type', v_item->>'label',
            coalesce(v_item->>'container_side','none'),
            coalesce(v_item->>'conveys_max','editor')::permission_level, v_item->>'notes')
    on conflict (source_type, target_type) do nothing;
  end loop;

  -- ---- knobs (SAME transaction: knob_resolve raises on a missing knob) ---
  for v_item in select value from jsonb_array_elements(n->'knobs') loop
    insert into platform.feature_knob(feature, key, value, default_value, value_type, unit,
      min_value, max_value, allowed_values, label, description, set_by, overridable_by,
      override_direction, propagation, taxonomy_node_id)
    values (v_item->>'feature', v_item->>'key', v_item->'value',
            coalesce(v_item->'default_value', v_item->'value'), v_item->>'value_type',
            v_item->>'unit', (v_item->>'min_value')::numeric, (v_item->>'max_value')::numeric,
            v_item->'allowed_values', v_item->>'label', v_item->>'description',
            coalesce(v_item->>'set_by','agent'),
            coalesce(array(select jsonb_array_elements_text(v_item->'overridable_by')), '{}'::text[]),
            coalesce(v_item->>'override_direction','any'), coalesce(v_item->>'propagation','next_load'),
            (v_item->>'taxonomy_node_id')::uuid)
    on conflict (feature, key) do nothing;
    v_created := v_created || jsonb_build_object('knob', format('%s/%s', v_item->>'feature', v_item->>'key'));
  end loop;

  -- ---- views -----------------------------------------------------------
  for v_item in select value from jsonb_array_elements(n->'views') loop
    execute format('create view %I.%I with (security_invoker = %s) as %s',
      v_schema, v_item->>'name',
      case when coalesce((v_item->>'security_invoker')::boolean, true) then 'true' else 'false' end,
      v_item->>'definition');
    v_created := v_created || jsonb_build_object('view', format('%s.%s', v_schema, v_item->>'name'));
  end loop;

  -- ---- functions -------------------------------------------------------
  -- An entry WITH a body is created (lane A only — the validator refuses a body on
  -- lane B). An entry WITHOUT one declares a door for a function that already exists.
  for v_item in select value from jsonb_array_elements(n->'functions') loop
    if v_item ? 'body' then
      execute format('create function %I.%I(%s) returns %s language %s %s set search_path to %L as $provision_body$%s$provision_body$',
        v_schema, v_item->>'name', coalesce(v_item->>'args',''), v_item->>'returns',
        coalesce(v_item->>'language','plpgsql'),
        case when lower(coalesce(v_item->>'security','invoker')) = 'definer' then 'security definer' else 'security invoker' end,
        coalesce(v_item->>'search_path','pg_catalog'), v_item->>'body');
      v_created := v_created || jsonb_build_object('function', format('%s.%s', v_schema, v_item->>'name'));
    end if;
  end loop;

  -- ---- per-argument check, against the CATALOGUE (lessons ledger 23 + 27) ----
  -- The validator checked the text the spec wrote; this checks what exists, so a
  -- spec whose `args` text disagrees with its body, or a lane-B door on an existing
  -- function, cannot slip past.
  for v_item in select value from jsonb_array_elements(n->'functions') loop
    select p.oid, pg_get_function_arguments(p.oid) as args into r
      from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = v_schema and p.proname = v_item->>'name'
     order by p.oid desc limit 1;
    if not found then
      v_argf := v_argf || platform.provision_finding('functions.not_found',
                 format('functions[%s].name', v_item->>'name'), null,
                 format('%s.%s does not exist', v_schema, v_item->>'name'));
    else
      v_argf := v_argf || platform.provision_arg_check_findings(v_item->>'name', r.args, v_item->'arg_checks');
    end if;
  end loop;
  if cardinality(v_argf) > 0 then
    raise exception 'provision: % function argument finding(s). Nothing was written.%',
      cardinality(v_argf),
      (select string_agg(E'\n\n' || (x->>'message'), '') from unnest(v_argf) x)
      using errcode = 'check_violation',
            hint = (select otherwise from platform.provision_rule_message where rule_id = 'functions.arg_checks.missing');
  end if;

  -- ---- sharing ---------------------------------------------------------
  if jsonb_typeof(n->'sharing') = 'object' then
    insert into platform.shareable_resource_registry(
      resource_type, schema_name, table_name, id_column, owner_column, display_label,
      url_path_template, is_link_shareable, is_scopeable, public_columns, content_role,
      organization_id, visibility)
    values (v_token, v_schema, v_table, 'id',
            coalesce(n->'sharing'->>'owner_column','created_by'),
            n->'sharing'->>'display_label', n->'sharing'->>'url_path_template',
            coalesce((n->'sharing'->>'is_link_shareable')::boolean, false),
            coalesce((n->'sharing'->>'is_scopeable')::boolean, false),
            nullif(array(select jsonb_array_elements_text(n->'sharing'->'public_columns')), '{}'),
            n->>'content_role',
            coalesce(p_org_id, public.system_org_id('system')),
            coalesce(nullif(v_vis,'')::platform.visibility, 'internal'::platform.visibility));
    v_created := v_created || jsonb_build_object('shareable_resource', v_token);
  end if;

  -- ---- DOORS, then GRANTS. In that order, always. -----------------------
  -- Lessons ledger 1 and 24: an undeclared grant is silently stripped, and a
  -- guard-log revoke row means the grant preceded the door — 51 times out of 86.
  for v_item in select value from jsonb_array_elements(n->'functions') loop
    select p.oid, pg_get_function_identity_arguments(p.oid) ia, platform.door_argtypes(p.proargtypes) at
      into r
      from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = v_schema and p.proname = v_item->>'name'
     order by p.oid desc limit 1;

    if exists (select 1 from platform.client_callable_door c
                where c.schema_name = v_schema and c.function_name = v_item->>'name'
                  and c.identity_argtypes = r.at) then
      raise exception '%', (platform.provision_finding('functions.door_exists',
               format('functions[%s].name', v_item->>'name'), null,
               format('%s.%s(%s)', v_schema, v_item->>'name', r.ia)))->>'message'
        using errcode = 'check_violation';
    end if;

    insert into platform.client_callable_door(
      schema_name, function_name, identity_args, identity_argtypes, reason,
      anonymous_callers, anonymous_purpose, signed_in_callers, non_client_lane, declared_by)
    values (v_schema, v_item->>'name', r.ia, r.at, v_item->>'reason',
            (v_item->>'client_access') = 'anonymous',
            case when (v_item->>'client_access') = 'anonymous' then v_item->>'anonymous_purpose' end,
            (v_item->>'client_access') in ('anonymous','signed_in'),
            case when (v_item->>'client_access') = 'server_only' then v_item->>'non_client_lane' end,
            format('platform.provision(%s)', v_token));
    v_created := v_created || jsonb_build_object('door', format('%s.%s(%s)', v_schema, v_item->>'name', r.ia));
    v_refs := v_refs || format('%s.%s(%s)', v_schema, v_item->>'name', r.ia);

    -- Collected, not issued: every GRANT goes last, as ONE block. Each GRANT fires a
    -- DB-wide re-sweep of ~2,000 DEFINER functions (ATTACK #8).
    if (v_item->>'client_access') = 'signed_in' then
      v_grants := v_grants || format('grant execute on function %I.%I(%s) to authenticated',
                                     v_schema, v_item->>'name', r.ia);
    elsif (v_item->>'client_access') = 'anonymous' then
      v_grants := v_grants || format('grant execute on function %I.%I(%s) to anon, authenticated',
                                     v_schema, v_item->>'name', r.ia);
    end if;
  end loop;

  foreach v_txt in array v_grants loop
    execute v_txt;
  end loop;

  -- ---- the door proof (PLAN §4.5): what exists matches what was declared ----
  for v_item in select value from jsonb_array_elements(n->'functions') loop
    select p.oid into r
      from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = v_schema and p.proname = v_item->>'name'
     order by p.oid desc limit 1;
    if (has_function_privilege('authenticated', r.oid, 'EXECUTE')
          is distinct from ((v_item->>'client_access') in ('signed_in','anonymous')))
       or (has_function_privilege('anon', r.oid, 'EXECUTE')
          is distinct from ((v_item->>'client_access') = 'anonymous')) then
      raise exception '%', (platform.provision_finding('doors.proof_failed',
               format('functions[%s].client_access', v_item->>'name'), null,
               format('declared %s; observed authenticated EXECUTE = %s, anon EXECUTE = %s',
                      v_item->>'client_access',
                      has_function_privilege('authenticated', r.oid, 'EXECUTE'),
                      has_function_privilege('anon', r.oid, 'EXECUTE'))))->>'message'
        using errcode = 'check_violation';
    end if;
  end loop;

  -- The guard revoked PUBLIC's default EXECUTE on every DEFINER function created above
  -- and logged it, BEFORE its door could exist (a door row cannot precede the function
  -- it names, and a both-flags-false door that precedes it makes the guard refuse the
  -- CREATE). The door now declares the decision, so the row is acknowledged with that
  -- reason — only rows this transaction produced, only for the functions just doored.
  update platform.ddl_guard_log l
     set acknowledged_at = now(),
         acknowledged_by = format('platform.provision(%s)', v_token),
         ack_reason = format('The birth revoke of PUBLIC''s default EXECUTE was correct; platform.provision(%s) declared this function''s door in the same transaction (lessons ledger 24).', v_token)
   where l.acknowledged_at is null
     and l.rule = 'definer_client_grant_revoked'
     and l.occurred_at >= now()
     and l.object_ref = any (v_refs);

  -- ---- certification ---------------------------------------------------
  -- canonical_certify reports every WARN and FAIL under category `conformance`; the
  -- CHECK NAME is the prefix of `detail`. Refuse on every FAIL and every WARN except
  -- the three legacy-column WARNs (§3.1); INFO (the snapshot row) is ignored.
  for r in select * from iam.canonical_certify(v_schema, v_table, v_token) loop
    v_certify := v_certify || jsonb_build_object('category', r.category, 'status', r.status, 'detail', r.detail);
    if r.status = 'FAIL'
       or (r.status = 'WARN'
           and split_part(coalesce(r.detail, ''), ':', 1) not in ('legacy_owner_col','legacy_is_public','legacy_is_deleted')) then
      v_refuse := v_refuse || format('%s [%s]: %s', r.category, r.status, coalesce(r.detail,''));
    end if;
  end loop;
  if cardinality(v_refuse) > 0 then
    raise exception 'provision: % refused certification. Nothing was written.%',
      format('%s.%s', v_schema, v_table),
      E'\n  - ' || array_to_string(v_refuse, E'\n  - ')
      using errcode = 'check_violation',
            hint = (select otherwise from platform.provision_rule_message where rule_id = 'certify.refused');
  end if;

  -- ---- capture, inside THIS transaction (PLAN §3.3) ---------------------
  -- WHO ACTUALLY ASKED. Lane B arrives as `SET LOCAL ROLE matrx_provisioner` and
  -- then this SECURITY DEFINER, so current_user and session_user BOTH say `postgres`
  -- and neither can tell the lanes apart. The GUC `role` and the verified JWT survive
  -- the DEFINER switch; p_lane is the lane the caller entered through.
  v_actor := auth.uid();
  v_role  := nullif(current_setting('role', true), 'none');

  insert into platform.provision_spec(
    token, spec, spec_hash, type, origin, owner_org_id, verb, result,
    applied_by, applied_via, artifacts_status,
    applied_lane, applied_actor, applied_role)
  values (v_token, n, v_hash, n->>'type', n->>'origin', p_org_id,
          case when p_lane = 'restricted' then 'provision_restricted' else 'provision' end,
          jsonb_build_object('created', coalesce(to_jsonb(v_created), '[]'::jsonb),
                             'certify', coalesce(to_jsonb(v_certify), '[]'::jsonb)),
          coalesce(v_actor::text, v_role, session_user), p_applied_via, 'pending',
          case when p_lane = 'restricted' then 'restricted' else 'full' end,
          v_actor, coalesce(v_role, session_user));

  perform set_config('matrx.provisioner', '0', true);
  perform platform.provision_marker_set(false);

  return jsonb_build_object(
    'ok', true, 'unchanged', false, 'token', v_token, 'spec_hash', v_hash,
    'plan', v_res->'plan',
    'created', coalesce(to_jsonb(v_created), '[]'::jsonb),
    'certify', coalesce(to_jsonb(v_certify), '[]'::jsonb),
    'canonical_certify_ok', iam.canonical_certify_ok(v_schema, v_table, v_token),
    'artifacts_status', 'pending',
    'note', 'The repo projection, ORM models and frontend types are produced by db/provision_pull.py in the deploy train (PLAN §3.3), within one cycle. `pending` is by design for that window.');
end;
$function$;
