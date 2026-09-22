-- STORE-TXN-4b's inverse. The refusal_only word goes away and the live guard goes back to the
-- body pinned by the campaign file's `-- based-on:` line.
--
-- 🚨 ORDER MATTERS AND IT IS THE ORDER §6d-4 ENFORCES ON THE WAY IN, MIRRORED. STORE-TXN-3
-- learned this the hard way: revoking BEFORE the register row is closed lets
-- `platform.reopen_declared_doors` put the grant straight back, because the row still says the
-- door is open. So the door ROW goes first, then the grant, then the function.
--
-- ground-standing-ok: c — `custom.migrate_purge_hard_request` and
--   `platform.door_body_is_refusal_only` are this lane's own names and nothing else calls
--   either once `platform.door_body_must_decide` is back to its pinned body.

delete from platform.client_callable_door
 where schema_name = 'custom' and function_name = 'migrate_purge_hard_request';

revoke execute on function custom.migrate_purge_hard_request(uuid, uuid, text) from authenticated;

-- The guard first: while `refusal_only` still exists, a body that reads it is harmless, but the
-- column cannot be dropped underneath a function that names it.
create or replace function platform.door_body_must_decide()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $fn$
declare
  fn record;
  v_ref text;
  v_ids text[];
begin
  if not (new.signed_in_callers or new.anonymous_callers) then
    return new;
  end if;

  select p.oid, p.prosecdef, p.prorettype,
         pg_get_function_identity_arguments(p.oid) as ia
    into fn
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = new.schema_name
     and p.proname = new.function_name
     and platform.door_argtypes(p.proargtypes) = new.identity_argtypes
   limit 1;
  if not found or not fn.prosecdef then
    return new;
  end if;
  if fn.prorettype in ('pg_catalog.trigger'::regtype, 'pg_catalog.event_trigger'::regtype) then
    return new;
  end if;

  select coalesce(array_agg(coalesce(pr.proargnames[t.ord], 'arg' || t.ord)), array[]::text[])
    into v_ids
    from pg_proc pr, unnest(pr.proargtypes) with ordinality as t(typ, ord)
   where pr.oid = fn.oid
     and t.typ in ('pg_catalog.uuid'::regtype, 'pg_catalog.uuid[]'::regtype);
  if coalesce(array_length(v_ids, 1), 0) = 0 then
    return new;
  end if;

  if platform.definer_body_decides_access(fn.oid) then
    return new;
  end if;

  v_ref := format('%s.%s(%s)', new.schema_name, new.function_name, fn.ia);
  if exists (select 1 from platform.provision_spec_grandfather g
              where g.lane = 'definer_no_access_decision' and g.object_ref = v_ref) then
    return new;
  end if;

  raise exception
    'ddl_guard[definer_no_access_decision]: % is SECURITY DEFINER, this row opens it to a '
    'client, and it takes the id(s) % — but neither its body nor anything it calls reaches an '
    'access decision. A door row is not a door check: seo.keyword_value_map had a truthful door '
    'row and returned 114,686 rows of another tenant''s data to a non-member (2026-09-17). '
    'Decide access in the body BEFORE the first read — iam.has_access(token, id, level), the '
    'shared assert helper for that entity, or an auth.uid() ownership test that is lawful for '
    'this row — and decide it before existence, so a foreign id and an invented one answer '
    'identically.',
    v_ref, array_to_string(v_ids, ', ')
    using errcode = '42501',
          hint = 'platform.definer_body_lint_findings() lists every function in this state; '
                 'platform.definer_access_decision_regex() is what "an access decision" means here. '
                 'If this really is the rare body whose decision none of those shapes can express, '
                 'the shrink-only list platform.provision_spec_grandfather (lane '
                 'definer_no_access_decision) is seeded from introspection, never by hand.';
end;
$fn$;

drop function if exists custom.migrate_purge_hard_request(uuid, uuid, text);
drop function if exists platform.door_body_is_refusal_only(oid);
alter table platform.client_callable_door drop column if exists refusal_only;
