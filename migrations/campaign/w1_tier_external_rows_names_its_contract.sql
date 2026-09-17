-- chair-step: it replaces two live function bodies in schema custom, which the additive allow-list refuses by name, and one of them is the read door DOOR-N-6 rests on; the sanctioned route for a body replacement of this lane's own doors is an attended step with the whole file printed
--
-- W1-TIER — THE READ DOOR NAMES ITS OWN CONTRACT, AND THE EXPOSURE GUARD BINDS EVERY
--           FOREIGN TABLE.
--
-- Three changes, all inside this lane's own two functions, all found by RUNNING them
-- (`scripts/campaign-tests/w1_tier_c8.sql`) rather than by reading them.
--
-- 1. 🚨 **A DEFECT, MEASURED.** `custom.external_rows` is created with
--    `SET search_path TO 'pg_catalog'` and its dynamic SQL cast to `'viewer'::permission_level`
--    — an UNQUALIFIED type in the `public` schema. Live on the branch:
--    `ERROR: type "permission_level" does not exist`. So DOOR-N-6's read door did not read at
--    all, and nothing but executing it would have said so. It is now
--    `public.permission_level`. The class: every identifier inside a `search_path`-pinned
--    definer body is schema-qualified, and the only proof is a call.
--
-- 2. **NOTHING FAILS SILENTLY.** The door joins the private relation on `external_key`, which
--    is a CONTRACT that relation has to meet and that nothing stated. A relation without that
--    column produced a bare `42703 column t.external_key does not exist` from inside a dynamic
--    string. It now refuses with `0A000`, naming the column, the relation and what to do.
--
-- 3. **FIX THE CLASS, NOT THE INSTANCE.** `custom.external_foreign_table_findings` only looked
--    at foreign tables whose SERVER name began `custom_external`, so a foreign table on any
--    other server — the ordinary case — was invisible to DOOR-N-6's guard. It now binds EVERY
--    foreign table in the database: any one outside `custom_external` is a finding. Measured
--    on the branch and on production, 2026-09-17, before widening it: `select count(*) from
--    pg_class where relkind = 'f'` is 0 and `select count(*) from pg_foreign_server` is 0 on
--    both, so the wider rule flags nothing that exists and pre-empts the first one that does.
--
-- THE INVERSE: `migrations/inverse/w1_tier_external_rows_names_its_contract_down.sql`, which
-- restores the two bodies the `-- based-on:` lines below name.
--
-- 🚨 THE `-- based-on:` HASHES ARE THE BRANCH'S, and they have to be: both functions were
-- created by `w1_tier_external_tier.sql` an hour ago and DO NOT EXIST on production yet, so
-- `pnpm db:based-on` (which reads production) reports "replaces no function that already
-- exists live". The runner recomputes the hash against the CONNECTED database, which at
-- `--target branch` is the branch; when the chair applies this lane's pair to production, the
-- first file creates these bodies and the hashes below are what the second file then finds.
--
-- based-on: custom.external_rows(uuid,uuid) 89c17c723b0bef32d4efd361a239d9cb00e3217e5534fe8bbe6f041d14284122
-- based-on: custom.external_foreign_table_findings() 3301b8e24f39e2b8e6f9ce0da5992a6b4ca672eb6a028d211bd0b51741f1cc74

set lock_timeout = '5s';
set statement_timeout = '600s';

create or replace function custom.external_rows(p_organization_id uuid, p_source_id uuid)
  returns setof jsonb
  language plpgsql
  security definer
  set search_path to 'pg_catalog'
as $fn$
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
  -- THE CONTRACT, STATED BEFORE IT IS RELIED ON. The door joins the private relation to our
  -- stubs on `external_key`; a relation without that column used to produce a bare 42703 from
  -- inside a dynamic string, which names the symptom and not the requirement.
  if not exists (
    select 1 from pg_attribute a
     where a.attrelid = v_rel and a.attname = 'external_key' and a.attnum > 0 and not a.attisdropped
  ) then
    raise exception 'custom.external_rows: custom_external.% has no external_key column', v_src.external_table
      using errcode = '0A000',
            hint = 'DOOR-N-6: a relation in custom_external is joined to our stub Records on external_key, so it must expose that column (text) carrying the outside system''s own key. Add it to the foreign-table definition, or register the source against the relation that does.';
  end if;
  for v_row in execute format(
      'select to_jsonb(t) from custom_external.%I t join custom.external_link l on l.external_key = t.external_key and l.organization_id = $1 and l.source_id = $2 and l.deleted_at is null where iam.has_access(''record'', l.record_id, ''viewer''::public.permission_level)',
      v_src.external_table)
    using p_organization_id, p_source_id
  loop
    return next v_row;
  end loop;
  return;
end;
$fn$;

create or replace function custom.external_foreign_table_findings()
  returns setof text
  language sql
  security definer
  set search_path to 'pg_catalog'
as $fn$
  -- EVERY foreign table in the database, not only those on a server somebody remembered to
  -- name `custom_external*`. DOOR-N-6 is a rule about where a wrapper table may live.
  select format('foreign table %s.%s is outside the private schema custom_external (DOOR-N-6)', ns.nspname, c.relname)
    from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
    join pg_foreign_table ft on ft.ftrelid = c.oid
   where ns.nspname <> 'custom_external'
  union all
  select format('%s.%s in the private schema custom_external grants %s to %s (DOOR-N-6)',
                ns.nspname, c.relname, a.privilege_type, a.grantee::regrole::text)
    from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
    cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
   where ns.nspname = 'custom_external'
     and c.relkind in ('r', 'f', 'v', 'm', 'p')
     and a.grantee::regrole::text in ('public', 'anon', 'authenticated', 'service_role');
$fn$;

comment on function custom.external_rows(uuid, uuid) is
  'DOOR-N-6: the only read of an external relation. It refuses any relation outside the private schema custom_external, refuses a relation that does not expose external_key, and returns a row only when the caller can see that row''s stub Record (iam.has_access on the record, because a SECURITY DEFINER body bypasses RLS).';
comment on function custom.external_foreign_table_findings() is
  'DOOR-N-6''s guard: every foreign table in the database that is outside custom_external, and every relation inside custom_external that holds a privilege for PUBLIC, anon, authenticated or service_role.';
