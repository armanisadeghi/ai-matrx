-- target: branch
-- based-on: platform._provision_shape_settled() 2fdc704bc624aa7c1e07f9969b269f4e6afd15f6d6b2a17ff94c0ed640b67d63
--
-- W1-ORG — FOUND OUTSIDE BRIEF AND FIXED BECAUSE IT BLOCKS EVERY LANE'S INVERSE
-- (rule 20: different class, blocks my exit -> fix it and name it prominently;
--  rule 4 exception 2: a GUARD REPAIR is one of the four things that may change a live path).
--
-- WHAT IS BROKEN, MEASURED 2026-09-18 ON BOTH DATABASES
-- -----------------------------------------------------
-- `platform._provision_shape_settled()`'s `door_orphaned` arm decides, at COMMIT, whether a
-- `platform.client_callable_door` row still names a function that exists. It answered by
-- comparing two RENDERED strings:
--
--     pg_get_function_identity_arguments(p.oid) = new.detail ->> 'identity_args'
--
-- The function runs `SET search_path TO 'pg_catalog'` (it is `SECURITY DEFINER`), so its own
-- rendering schema-qualifies every type outside `pg_catalog`. Every door ROW, by contrast,
-- was written by an ordinary session that could see `public`. So for `iam.accessible_entity_ids`
-- the catalogue renders `p_required public.permission_level` and the door row holds
-- `p_required permission_level`, the strings never match, and the arm concludes that a LIVE
-- function was dropped:
--
--     SQLSTATE 23514 provision_shape_guard: the door for
--       iam.accessible_entity_ids(p_type text, p_required permission_level, p_depth integer)
--       reached COMMIT naming a function that no longer exists — the catalog holds:
--       accessible_entity_ids(p_type text, p_required public.permission_level, p_depth integer), …
--
-- The refusal's own message prints the function it says is gone. `_door_follows_its_function()`
-- puts EVERY door row in a schema in question whenever ANY function in that schema is dropped
-- (deliberately, and correctly — a dropped function's `object_name` is null), so this killed
-- every transaction that dropped any function in schema `iam`. `W1-ORG` met it running rule
-- 27's inverse, which drops two new `iam` functions and nothing else.
--
-- THE CLASS, NOT THE INSTANCE. Two door rows in `iam` carry `permission_level`; they are not
-- special. Any door row whose signature names a type outside `pg_catalog` — an enum, a domain,
-- a composite, anything in `public` or a feature schema — has the same latent refusal waiting.
-- Deleting or rewriting those two rows would be fixing the instance and leaving the door open.
--
-- THE FIX IS THE COMPARISON. `platform.client_callable_door` already carries the
-- search-path-free form of the same fact: `identity_argtypes oid[]`, written by
-- `platform.door_argtypes(proargtypes)` (measured: `{25,17760,23}` for the row above). Argument
-- type OIDs cannot be moved by a session setting. The arm now matches on THAT, and keeps the
-- rendered-string comparison as a fallback for any door row whose `identity_argtypes` is null,
-- so no door that passed before can start failing.
--
-- BRANCH TONIGHT; THE PRODUCTION HALF IS HELD AND SAID SO OUT LOUD. The body is byte-identical
-- on both databases (sha256 `2fdc70…7d63` on each (`pnpm db:based-on`, which is what the runner compares), measured 2026-09-18), so these exact bytes
-- are the production repair too. Tonight is branch-only (the run's standing ruling), and a
-- replacement of a LIVE production body is an attended step whatever rule 4 permits. This file
-- is therefore `-- target: branch`; the production half is the same body applied with the
-- `-- based-on:` line re-generated on the day, listed in this lane's report under
-- "awaiting the attended step".
--
-- NO INVERSE FILE, and the reason is the same one `w1_v1_fixes_branch_levels_door_orphaned.sql`
-- gives: the inverse of a guard repair is the re-introduction of the false refusal, and rule 27
-- is met instead by the `-- based-on:` line — the runner recomputes the live hash immediately
-- before executing and refuses the whole file if the body has moved, and the prior body is
-- recovered byte-for-byte from that hash. Re-applying these bytes is idempotent by
-- construction: it is one `CREATE OR REPLACE FUNCTION`.

set lock_timeout = '5s';
set statement_timeout = '120s';

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
  v_render   text;
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

  elsif new.kind = 'door_orphaned' then
    -- THE MIRROR OF definer_no_door, and the reason this lane exists: a door row is a
    -- promise about a function. Dropping the function without moving the row leaves the
    -- promise standing over nothing, and every reader — the generated contract, the door
    -- census, a person auditing who may call what — is told an access rule no body can
    -- make. Asked at COMMIT and not at the DROP, because the legal order for a signature
    -- change is DROP -> CREATE -> move the door (DD-223 forbids the door leading), so
    -- every correct migration passes through the orphaned moment.
    if not exists (select 1 from platform.client_callable_door d
                    where d.schema_name   = new.detail ->> 'schema_name'
                      and d.function_name = new.detail ->> 'function_name'
                      and d.identity_args = new.detail ->> 'identity_args')
    then return null; end if;   -- the row moved or went with the function: nothing owed

    -- W1-ORG 2026-09-18: the comparison is by ARGUMENT TYPE OID, never by the RENDERED
    -- identity string. This function runs `SET search_path TO 'pg_catalog'`, so
    -- `pg_get_function_identity_arguments()` here renders every type outside `pg_catalog`
    -- SCHEMA-QUALIFIED — `p_required public.permission_level` — while every
    -- `platform.client_callable_door.identity_args` row was written by a session whose
    -- search_path could see `public` and therefore reads `p_required permission_level`.
    -- The two strings NEVER match for a door whose signature names a non-`pg_catalog`
    -- type, so this arm declared a LIVE function dropped and killed the transaction. It
    -- fired on BOTH databases (the body hashed identically) for every door row in schema
    -- `iam`, which is to say for any transaction that drops ANY function in `iam`:
    --   provision_shape_guard: the door for
    --     iam.accessible_entity_ids(p_type text, p_required permission_level, p_depth integer)
    --     reached COMMIT naming a function that no longer exists — the catalog holds:
    --     accessible_entity_ids(p_type text, p_required public.permission_level, …)
    -- — a refusal whose own message printed the function it claimed was gone. The door
    -- table already carries the search-path-free form, `identity_argtypes oid[]`, written
    -- by `platform.door_argtypes(proargtypes)`; comparing THAT is exact, cannot be moved by
    -- a session setting, and keeps the rendered string only as a fallback for any door row
    -- whose `identity_argtypes` is null.
    if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = new.detail ->> 'schema_name'
                  and p.proname = new.detail ->> 'function_name'
                  and (
                        exists (select 1 from platform.client_callable_door d
                                 where d.schema_name   = new.detail ->> 'schema_name'
                                   and d.function_name = new.detail ->> 'function_name'
                                   and d.identity_args = new.detail ->> 'identity_args'
                                   and d.identity_argtypes is not null
                                   and d.identity_argtypes = platform.door_argtypes(p.proargtypes))
                     or pg_get_function_identity_arguments(p.oid) = new.detail ->> 'identity_args'
                      ))
       or exists (select 1 from platform.provision_spec_grandfather g
                   where g.lane = 'door_orphaned' and g.object_ref = new.object_ref)
    then return null; end if;   -- re-created at the same signature: nothing owed

    select coalesce(string_agg(format('%s(%s)', p.proname, pg_get_function_identity_arguments(p.oid)), ', '),
                    '(no function of that name)')
      into v_render
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = new.detail ->> 'schema_name' and p.proname = new.detail ->> 'function_name';

    raise exception 'provision_shape_guard: the door for % reached COMMIT naming a function that no longer exists — the catalog holds: %', new.object_ref, v_render
      using hint = 'A DOOR FOLLOWS ITS FUNCTION. This transaction dropped a doored function (usually to re-create it at a new signature, which is the only way one can gain or lose an argument) and left its row in platform.client_callable_door behind. Move it in THIS SAME transaction, after the new CREATE FUNCTION: UPDATE platform.client_callable_door SET identity_args = ''<exactly pg_get_function_identity_arguments of the new signature>'', identity_argtypes = platform.door_argtypes(proargtypes of the new function), reason = ''<the prose, with the new argument''''s NULL and FOREIGN rule>'', argument_rules = ''<the structured rules, one entry per argument INCLUDING the new one>'', contract_probe = ''<how to call it>'', declared_by = ''<this migration>'' WHERE schema_name = ... AND function_name = ... AND identity_args = ''<the old one>''; — or DELETE the row if the function is gone for good. Then regenerate the contract: uv run python db/generate_door_contract_test.py --schema <schema> --like ''<pattern>'' --out <file> --world <world>. A door row that outlives its function is a promise nobody can verify.' || c_boundary,
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
$function$

;
