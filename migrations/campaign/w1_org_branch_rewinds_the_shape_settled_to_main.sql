-- target: branch
-- based-on: platform._provision_shape_settled() e48f0a947d97fc49b2bd60a6ae891b1bce20dfea0459ccf7499cd5f680e5c413
--
-- LAND — THE COPY REWINDS platform._provision_shape_settled() TO THE MAIN DATABASE'S BODY.
--
--  is the repair this campaign already wrote
-- for it, and it is applied HERE but not on the main database, where the door_orphaned arm
-- still compares two RENDERED signature strings and therefore reports a live function as gone
-- (measured 2026-09-18: g0a_commenter_is_accepted_by_the_ten.sql passed here and was refused
-- there, by that arm, for public.has_permission_for). The repair's own bytes declare the MAIN
-- database's hash, so the copy has to stand on that body for those bytes to rehearse. This
-- file puts it there;  rolls both
-- databases forward to the repaired body in the same working session.

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
      using hint = 'A SECURITY DEFINER function runs as `postgres` (BYPASSRLS). Somebody has to say, IN DATA, who may call it and what each entity-id argument is checked against — prose in a comment is not a declaration and no test executes it (lessons ledger 23, 27, 28). Declare it anywhere in THIS SAME transaction (DD-223 requires the function to exist first, so straight after the create or replace function is the normal place): INSERT INTO platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers) VALUES (''<schema>'', ''<fn>'', ''<exactly pg_get_function_identity_arguments>'', ARRAY[''uuid''::regtype]::oid[], ''<what each entity-id argument is checked against, and the NULL rule for each>'', ''<migration>'', ''server_only: <which server lane calls it, and why no client ever does>'', false, false); — non_client_lane is a SENTENCE of at least 40 characters (with signed_in_callers=false and anonymous_callers=false) when no client may ever call it; leave it NULL and set signed_in_callers=true for a client door. A RETURNS trigger / event_trigger function never incurs this debt: it has no direct call surface.' || c_boundary,
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

    if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = new.detail ->> 'schema_name'
                  and p.proname = new.detail ->> 'function_name'
                  and pg_get_function_identity_arguments(p.oid) = new.detail ->> 'identity_args')
       or exists (select 1 from platform.provision_spec_grandfather g
                   where g.lane = 'door_orphaned' and g.object_ref = new.object_ref)
    then return null; end if;   -- re-created at the same signature: nothing owed

    select coalesce(string_agg(format('%s(%s)', p.proname, pg_get_function_identity_arguments(p.oid)), ', '),
                    '(no function of that name)')
      into v_render
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = new.detail ->> 'schema_name' and p.proname = new.detail ->> 'function_name';

    raise exception 'provision_shape_guard: the door for % reached COMMIT naming a function that no longer exists — the catalog holds: %', new.object_ref, v_render
      using hint = 'A DOOR FOLLOWS ITS FUNCTION. This transaction dropped a doored function (usually to re-create it at a new signature, which is the only way one can gain or lose an argument) and left its row in platform.client_callable_door behind. Move it in THIS SAME transaction, after the new create or replace function: UPDATE platform.client_callable_door SET identity_args = ''<exactly pg_get_function_identity_arguments of the new signature>'', identity_argtypes = platform.door_argtypes(proargtypes of the new function), reason = ''<the prose, with the new argument''''s NULL and FOREIGN rule>'', argument_rules = ''<the structured rules, one entry per argument INCLUDING the new one>'', contract_probe = ''<how to call it>'', declared_by = ''<this migration>'' WHERE schema_name = ... AND function_name = ... AND identity_args = ''<the old one>''; — or DELETE the row if the function is gone for good. Then regenerate the contract: uv run python db/generate_door_contract_test.py --schema <schema> --like ''<pattern>'' --out <file> --world <world>. A door row that outlives its function is a promise nobody can verify.' || c_boundary,
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
