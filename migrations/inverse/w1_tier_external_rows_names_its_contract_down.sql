-- chair-step: it restores two live function bodies in schema custom from the definitions their `-- based-on:` hashes name; a body replacement is not an additive shape and the sanctioned route is an attended step with the whole file printed
--
-- THE INVERSE of `migrations/campaign/w1_tier_external_rows_names_its_contract.sql`
-- (§4.13, rule 27).
--
-- The two bodies below are `pg_get_functiondef` VERBATIM, captured on the rehearsal branch at
-- 2026-09-17 16:26 UTC, immediately before the up-migration replaced them — the exact
-- definitions whose sha256 the up-migration's `-- based-on:` lines carry
-- (`custom.external_rows(uuid,uuid)` 89c17c72…, `custom.external_foreign_table_findings()`
-- 3301b8e2…). Applying this file makes those two hashes correct again, which is what "the
-- inverse restores the prior state" has to mean for a function.
--
-- 🚨 It restores the DEFECT it undoes: the restored `custom.external_rows` casts to an
-- unqualified `permission_level` under `search_path = pg_catalog` and therefore raises
-- `type "permission_level" does not exist` on every call. That is correct for an inverse and
-- is why this file is never a repair: rolling this lane back means rolling back to the state
-- the campaign actually landed, defect included, and re-applying the up is how it is fixed.

-- based-on: custom.external_rows(uuid,uuid) 8546b7c0600ee7e252f06b79b495b7a8655051523cc54d9dabb3efde79af2469
-- based-on: custom.external_foreign_table_findings() 8b39e6c60d790d07c7cb21ede195ff124bbe9035dc2d233164541335b42ae98c
--
-- These two hashes are the bodies the UP-migration leaves live (rule 6): an inverse replaces a
-- body too, so it declares what it expects to find, and it refuses if the up has since moved.

set lock_timeout = '2s';
set statement_timeout = '600s';

create or replace function custom.external_rows(p_organization_id uuid, p_source_id uuid)
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_src custom.external_source%rowtype;
  v_rel regclass;
  v_row jsonb;
begin
  if p_organization_id is null or p_source_id is null then
    raise exception 'custom.external_rows: organization_id and source_id are required'
      using errcode = '22004';
  end if;
  select * into v_src from custom.external_source
   where organization_id = p_organization_id and id = p_source_id and deleted_at is null;
  if not found then
    raise exception 'custom.external_rows: no external source % in organization %', p_source_id, p_organization_id
      using errcode = '02000';
  end if;
  v_rel := to_regclass(format('custom_external.%I', v_src.external_table));
  if v_rel is null then
    raise exception 'custom.external_rows: custom_external.% does not exist', v_src.external_table
      using errcode = '0A000',
            hint = 'DOOR-N-6: an external relation lives in the private schema custom_external and nowhere else. No foreign server is provisioned by this campaign (D-14), so this is the expected state until a connection is bought.';
  end if;
  for v_row in execute format(
      'select to_jsonb(t) from custom_external.%I t join custom.external_link l on l.external_key = t.external_key and l.organization_id = $1 and l.source_id = $2 and l.deleted_at is null where iam.has_access(''record'', l.record_id, ''viewer''::permission_level)',
      v_src.external_table)
    using p_organization_id, p_source_id
  loop
    return next v_row;
  end loop;
  return;
end;
$function$;



create or replace function custom.external_foreign_table_findings()
 RETURNS SETOF text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
select format('foreign table %s.%s is outside the private schema custom_external (DOOR-N-6)', ns.nspname, c.relname)
  from pg_class c
  join pg_namespace ns on ns.oid = c.relnamespace
  join pg_foreign_table ft on ft.ftrelid = c.oid
  join pg_foreign_server fs on fs.oid = ft.ftserver
 where fs.srvname like 'custom\_external%' and ns.nspname <> 'custom_external'
union all
select format('%s.%s in the private schema custom_external grants %s to %s (DOOR-N-6)',
              ns.nspname, c.relname, a.privilege_type, a.grantee::regrole::text)
  from pg_class c
  join pg_namespace ns on ns.oid = c.relnamespace
  cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
 where ns.nspname = 'custom_external'
   and c.relkind in ('r', 'f', 'v', 'm', 'p')
   and a.grantee::regrole::text in ('public', 'anon', 'authenticated', 'service_role');
$function$;

