-- chair-step: the provision-shape guard's existing one-day debt prune is the word DELETE inside the function body being moved into its definer half. It does not delete product rows. The event-trigger functions themselves become invoker so they fire; the privileged work moves to _impl.
-- based-on: platform._door_follows_its_function() bec07dd93ca3048ad27f3ca918643d9042c9e439f84e91fbaddd73a00d227777
-- based-on: platform._reopen_declared_doors_after_revoke() a37bebf1f15c4a5f937c792ca328323e8e2456affeaae535eaeb422889de359f
-- based-on: platform._provision_shape_guard() 0f1823039b88a1d9cf37177c4c1ac18708e4f3ae6d789c3a2b1be62641a74f53

-- The applier opens the session at lock_timeout 2s. Regenerating component
-- policies takes an AccessExclusive lock, and 2s loses that race to any
-- ordinary request. Hold the wait long enough for one request to finish.
set local lock_timeout = '60s';

-- a restricted role stack (DD-151), so the trigger itself must stay invoker.
create or replace function platform._door_follows_its_function_impl(p_schemas text[])
 returns void
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
declare
  d record;
  s text;
begin
  foreach s in array coalesce(p_schemas, '{}'::text[])
  loop
    for d in select * from platform.client_callable_door c where c.schema_name = s
    loop
      insert into platform.provision_shape_debt (txid, kind, object_ref, detail)
      values (pg_current_xact_id(), 'door_orphaned',
              d.schema_name || '.' || d.function_name || '(' || d.identity_args || ')',
              jsonb_build_object('schema_name', d.schema_name,
                                 'function_name', d.function_name,
                                 'identity_args', d.identity_args))
      on conflict do nothing;
    end loop;
  end loop;
end
$function$;

create or replace function platform._door_follows_its_function()
 returns event_trigger
 language plpgsql
 security invoker
 set search_path to 'pg_catalog'
as $function$
declare
  v_schemas text[];
begin
  -- Schema is the key, not the dropped function's name: object_name is null
  -- for a drop, and every door in a schema that just lost a function answers
  -- for itself at commit. Same rule as the body this wrapper replaced.
  select coalesce(array_agg(distinct schema_name), '{}'::text[])
    into v_schemas
    from pg_event_trigger_dropped_objects()
   where object_type in ('function', 'procedure')
     and schema_name is not null;
  perform platform._door_follows_its_function_impl(v_schemas);
end
$function$;

CREATE OR REPLACE FUNCTION platform._reopen_declared_doors_after_revoke_impl()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_schema text;
begin
  if coalesce(current_setting('platform.closed_schema_sweep', true), '') = '1' then
    return;
  end if;
  perform set_config('platform.closed_schema_sweep', '1', true);

  -- EVERY schema declared closed — not only the ones that already have a door. The closing
  -- pass has business in a closed schema with no doors at all, which is the state `custom`
  -- is in before its first door lands and the state a new closed schema starts in.
  for v_schema in
    select e.schema_name
      from platform.schema_client_exposure e
     where not coalesce(e.client_exposed, false)
       and exists (select 1 from pg_namespace n where n.nspname = e.schema_name)
  loop
    perform platform.reopen_declared_doors(v_schema);
  end loop;
  perform set_config('platform.closed_schema_sweep', '0', true);
exception when others then
  -- A DDL statement must never fail because the sweep could not run — that would make the
  -- sweep itself unrunnable and every lane would work around it. It SCREAMS instead.
  perform set_config('platform.closed_schema_sweep', '0', true);
  raise warning 'platform._reopen_declared_doors_after_revoke: the closed-schema sweep did not run (%). A declared door may be shut to signed-in callers, or an UNDECLARED function may be open to them; run select * from platform.reopen_declared_doors(''<schema>'') and find out why this failed.', sqlerrm;
end;
$function$;

create or replace function platform._reopen_declared_doors_after_revoke()
 returns event_trigger
 language plpgsql
 security invoker
 set search_path to 'pg_catalog'
as $function$
begin
  perform platform._reopen_declared_doors_after_revoke_impl();
end
$function$;

CREATE OR REPLACE FUNCTION platform._provision_shape_guard_impl(p_cmds jsonb)
 RETURNS void
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

  for cmd in
    select x.objid::oid as objid, x.object_type, x.command_tag, x.in_extension
      from jsonb_to_recordset(p_cmds) as x(
        objid text,
        object_type text,
        command_tag text,
        in_extension boolean
      )
  loop
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

create or replace function platform._provision_shape_guard()
 returns event_trigger
 language plpgsql
 security invoker
 set search_path to 'pg_catalog'
as $function$
declare
  v_cmds jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
           'objid', c.objid::text,
           'object_type', c.object_type,
           'command_tag', c.command_tag,
           'in_extension', c.in_extension
         )), '[]'::jsonb)
    into v_cmds
    from pg_event_trigger_ddl_commands() c;
  perform platform._provision_shape_guard_impl(v_cmds);
end
$function$;

-- These three functions run as the owner and decide nothing a client may ask.
-- The commit trigger refuses a SECURITY DEFINER function that reaches COMMIT
-- with no access decision in platform.client_callable_door. They are not
-- client doors: the event-trigger wrappers are the only callers.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('platform', '_door_follows_its_function_impl', 'p_schemas text[]',
   'Checked against nothing a caller supplies. p_schemas is the list of schemas the event-trigger wrapper collected from pg_event_trigger_dropped_objects(); it may be empty, and an empty list records no debt. The function writes provision_shape_debt for doors in those schemas. No client calls it.',
   'boot_lane_component_rls_and_event_trigger_execution.sql',
   'server_only: the only caller is the event trigger door_follows_its_function, which invokes platform._door_follows_its_function() and that wrapper calls this impl. No client ever calls it; a client that could would write debt rows for every door in a schema.',
   false, false),
  ('platform', '_reopen_declared_doors_after_revoke_impl', '',
   'Checked against nothing a caller supplies: it takes no arguments. It reopens declared doors in every schema platform.schema_client_exposure marks closed. No client calls it.',
   'boot_lane_component_rls_and_event_trigger_execution.sql',
   'server_only: the only caller is the event trigger platform_reopen_declared_doors, which invokes platform._reopen_declared_doors_after_revoke() and that wrapper calls this impl. No client ever calls it; a client that could would reopen every closed schema.',
   false, false),
  ('platform', '_provision_shape_guard_impl', 'p_cmds jsonb',
   'Checked against nothing a caller supplies. p_cmds is the jsonb the event-trigger wrapper built from pg_event_trigger_ddl_commands(); it may be an empty array, and an empty array records no debt and raises nothing. The function raises when a DDL command breaks a provision rule. No client calls it.',
   'boot_lane_component_rls_and_event_trigger_execution.sql',
   'server_only: the only caller is the event trigger provision_shape_guard, which invokes platform._provision_shape_guard() and that wrapper calls this impl. No client ever calls it; a client that could would raise or write debt for DDL it did not run.',
   false, false)
on conflict do nothing;

do $proof$
declare
  v_bad text;
begin
  select string_agg(p.oid::regprocedure::text, ', ')
    into v_bad
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_event_trigger e on e.evtfoid = p.oid
   where n.nspname = 'platform'
     and p.proname in (
       '_door_follows_its_function',
       '_reopen_declared_doors_after_revoke',
       '_provision_shape_guard'
     )
     and p.prosecdef;
  if v_bad is not null then
    raise exception 'event-trigger functions remain SECURITY DEFINER: %', v_bad;
  end if;

  select string_agg(p.proname, ', ')
    into v_bad
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'platform'
     and p.proname in (
       '_door_follows_its_function_impl',
       '_reopen_declared_doors_after_revoke_impl',
       '_provision_shape_guard_impl'
     )
     and not p.prosecdef;
  if v_bad is not null then
    raise exception 'impl functions are not SECURITY DEFINER: %', v_bad;
  end if;

  if has_function_privilege('anon', 'platform._provision_shape_guard_impl(jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'platform._provision_shape_guard_impl(jsonb)', 'EXECUTE')
     or has_function_privilege('anon', 'platform._door_follows_its_function_impl(text[])', 'EXECUTE')
     or has_function_privilege('authenticated', 'platform._door_follows_its_function_impl(text[])', 'EXECUTE')
     or has_function_privilege('anon', 'platform._reopen_declared_doors_after_revoke_impl()', 'EXECUTE')
     or has_function_privilege('authenticated', 'platform._reopen_declared_doors_after_revoke_impl()', 'EXECUTE')
  then
    raise exception 'a guard impl is still executable by anon or authenticated';
  end if;
end
$proof$;
