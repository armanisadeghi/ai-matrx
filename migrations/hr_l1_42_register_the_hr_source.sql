-- hr_l1_42_register_the_hr_source.sql
--
-- `public.hr_employee_create`'s link-user path called
-- `crm.ensure_user_party(user, 'hr.employee_create')`, and that function's vocabulary was
-- ('signup','promotion','backfill','reconcile') — so the path raised
-- `ensure_user_party: unsupported source` 100% of the time, in front of an HR admin, as
-- a raw Postgres sentence.
--
-- 🚨 REGISTERED, NOT DISGUISED. The tempting fix is to pass 'backfill'. But `p_source` is
-- stored as `crm.party.source_detail`, as `metadata.provisioning_source`, and in the
-- `platform.log_activity` entry — it is PROVENANCE. Mislabelling an HR hire as a backfill
-- would write a lie into the record permanently to make one call succeed today. Adding
-- the value is additive, changes no existing behaviour, and keeps the provenance true.
--
-- Cross-schema: crm owns the function's shape, HR owns this one value. There was no
-- contract row on `crm.ensure_user_party` at all, so this migration adds the first one,
-- pinning all five values — the four that were there and the one HR depends on.
--
-- Applied live 2026-08-28 and ledgered. Proven through the door: hr_employee_create with
-- link_user_id now returns ok:true with a party_id where it previously raised.

do $mig$
declare v_def text; v_new text;
begin
  v_def := pg_get_functiondef('crm.ensure_user_party(uuid,text)'::regprocedure);
  if position('hr.employee_create' in v_def) > 0 then
    raise notice 'hr_l1_42: already applied'; return;
  end if;
  v_new := replace(v_def,
    $a1$  if p_source not in ('signup', 'promotion', 'backfill', 'reconcile') then$a1$,
    $r1$  if p_source not in ('signup', 'promotion', 'backfill', 'reconcile', 'hr.employee_create') then$r1$);
  if v_new = v_def then raise exception 'hr_l1_42: source vocabulary anchor not found'; end if;
  execute v_new;
end $mig$;

do $verify$
declare v_src text;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'crm' and p.proname = 'ensure_user_party';
  if v_src !~ 'hr\.employee_create' then raise exception 'hr_l1_42: HR source not registered'; end if;
  -- Additive, not a rewrite of somebody else's vocabulary.
  if v_src !~ '''signup''' or v_src !~ '''promotion'''
     or v_src !~ '''backfill''' or v_src !~ '''reconcile''' then
    raise exception 'hr_l1_42: an existing source value was dropped';
  end if;
end $verify$;

insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason)
values ('crm', 'ensure_user_party', 'hr_l1_42_register_the_hr_source.sql',
        array['''signup''', '''promotion''', '''backfill''', '''reconcile''', '''hr.employee_create'''],
        array[]::text[],
        'p_source is PROVENANCE. public.hr_employee_create passes ''hr.employee_create''; '
        || 'removing it returns that path to raising 100% of the time, and passing ''backfill'' '
        || 'instead would write a false provenance to make the call succeed.')
on conflict do nothing;

insert into public._schema_migrations (source, filename, checksum, applied_at, duration_ms)
values ('matrx-frontend', 'hr_l1_42_register_the_hr_source.sql',
        md5('hr_l1_42_register_the_hr_source'), now(), 0)
on conflict do nothing;
