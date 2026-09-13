-- iam_verify_canonical_dd137b14_ledger_class_check — THE GATE MUST AGREE WITH THE RULING IT ENFORCES.
--
-- DD-137b10 relaxed `entity_types_class_scope_ck` so a LEDGER may hold a `data_class` (chair ruling
-- 2026-09-12: a ledger has no composition parent, so there is nothing to inherit and an unset class
-- would have to be GUESSED — which is the defect V-40 found, restated). All 22 active ledgers were
-- then classified from reality with stored reasons.
--
-- 🚨 AND `iam.verify_canonical`'s `data_class_set` CHECK STILL SAID "a component or ledger may not
-- hold a data_class", so it now FAILs all 22 ledgers for holding exactly the class the ruling
-- requires. Measured: `data_class_set` went from 0 FAILs to 22, every one of them a ledger.
--
-- A gate that contradicts the rule it exists to enforce is worse than no gate: it trains everyone
-- reading it to ignore a whole check. The rule is split here the same way the constraint was —
-- **a COMPONENT must hold NULL** (its lanes are its parent's, resolved by `iam.class_lanes`, and a
-- class stored on the child would be a second answer to a question its parent already answers);
-- **a LEDGER must hold one**; and `default_list_scope` stays NULL on both, because a ledger row has
-- a position, not a "mine".
do $$
declare v_src text; v_new text;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'iam' and p.proname = 'verify_canonical';
  if position('DD-137b14' in v_src) > 0 then
    raise notice 'dd137b14: verify_canonical already splits component from ledger';
    return;
  end if;

  v_new := replace(v_src,
    '  check_name:=''data_class_set'';' || E'\n' ||
    '  IF v_variant IN (''component'',''ledger'') THEN' || E'\n' ||
    '    status:=CASE WHEN v_dc IS NULL THEN ''PASS'' ELSE ''FAIL'' END;' || E'\n' ||
    '    detail:=CASE WHEN v_dc IS NULL THEN ''inherits its parent''''s class (§3.3, F-20)''' || E'\n' ||
    '                 ELSE ''a component/ledger may not hold a data_class — its access IS its parent''''s (db-rules §6d-1)'' END;',

    '  check_name:=''data_class_set'';' || E'\n' ||
    '  -- DD-137b14: a COMPONENT holds NULL and resolves through its parent; a LEDGER holds a class,' || E'\n' ||
    '  -- because it has no composition parent to resolve through (chair ruling 2026-09-12).' || E'\n' ||
    '  IF v_variant = ''component'' THEN' || E'\n' ||
    '    status:=CASE WHEN v_dc IS NULL THEN ''PASS'' ELSE ''FAIL'' END;' || E'\n' ||
    '    detail:=CASE WHEN v_dc IS NULL' || E'\n' ||
    '                 THEN format(''resolves to %s through its composition parent (§3.1, DD-137b10)'',' || E'\n' ||
    '                             (iam.class_lanes(p_token)).resolved_class)' || E'\n' ||
    '                 ELSE ''a component may not hold a data_class of its own — its access IS its parent''''s (db-rules §6d-1); iam.class_lanes resolves it upward'' END;' || E'\n' ||
    '  ELSIF v_variant = ''ledger'' THEN' || E'\n' ||
    '    status:=CASE WHEN v_dc IS NOT NULL THEN ''PASS'' ELSE ''FAIL'' END;' || E'\n' ||
    '    detail:=CASE WHEN v_dc IS NOT NULL THEN v_dc::text' || E'\n' ||
    '                 ELSE ''a ledger has no composition parent, so it must STATE its class — an unset one would have to be guessed, and guessing is how 299 of 311 components kept a platform-staff lane under a private parent (DD-137b10)'' END;');

  if v_new = v_src then
    raise exception 'dd137b14: could not find the data_class_set branch in iam.verify_canonical';
  end if;

  execute format(
    'create or replace function iam.verify_canonical(p_schema text, p_table text, p_token text, '
    'p_variant text default null) returns table(check_name text, status text, detail text) '
    'language plpgsql stable set search_path to ''pg_catalog'',''public'' as %L', v_new);
end $$;

do $$
declare v_fail integer; v_pass integer;
begin
  select count(*) filter (where (v).status='FAIL'), count(*) filter (where (v).status='PASS')
    into v_fail, v_pass
  from platform.entity_types et
  cross join lateral iam.verify_canonical(et.schema_name, et.table_name, et.token, et.rls_variant) v
  where et.is_active and to_regclass(format('%I.%I', et.schema_name, et.table_name)) is not null
    and (v).check_name = 'data_class_set';
  if v_fail > 0 then
    raise exception 'dd137b14: data_class_set still FAILs % tokens', v_fail;
  end if;
  raise notice 'dd137b14: data_class_set — % PASS, 0 FAIL', v_pass;

  -- and the check still has teeth in BOTH directions: a component holding a class must fail.
  if (select count(*) from platform.entity_types where is_active and rls_variant='component'
        and data_class is not null) > 0 then
    raise exception 'dd137b14: a component holds a data_class of its own';
  end if;
  if (select count(*) from platform.entity_types where is_active and rls_variant='ledger'
        and data_class is null) > 0 then
    raise exception 'dd137b14: a ledger holds no class';
  end if;
end $$;
