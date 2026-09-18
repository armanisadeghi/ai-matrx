-- DD-223b — THE LAST TWO TEXT KEYS ON THE DOOR REGISTERS.
-- (B-118, Data Doctrine adoption program, 2026-09-14. V-96 residue.)
--
-- DD-223 made `platform.client_callable_door.identity_argtypes` the identity of a
-- door and demoted `identity_args` to a display column. Two structures survived
-- that still treat rendered text as an identity, and V-96 named both:
--
--   1. `client_callable_door_schema_name_function_name_identity_arg_key` — the OLD
--      UNIQUE on (schema_name, function_name, identity_args). `identity_args` is a
--      display column now: nothing validates it, nothing matches on it, and two
--      DIFFERENT overloads of one function may legitimately be described by the
--      same human-readable string. This index refuses the second of them. It is
--      the last thing in the register that could make a correct row fail.
--
--   2. `platform.definer_client_grant_grandfather`'s PRIMARY KEY, on
--      (schema_name, function_name, identity_args) — while every match the §6d-4
--      guard makes against that table has used `argtypes` since hr_l3_109. So the
--      table's KEY and the table's USE disagreed: two rows spelling one function
--      two ways were both accepted (that is literally what
--      `definer_guard_search_path_grandfather_fix_2026_08_28.sql` produced in the
--      door register), and `argtypes` — the column the guard actually reads — was
--      NULLABLE, so a row with a NULL there stood for nothing at all while still
--      occupying the register. Measured before this file: 25 rows, 0 NULL
--      argtypes, 0 duplicates by (schema, name, argtypes), and all 25 resolve to
--      exactly one live function by argtypes — so the key can move today.
--
-- CORRECTION TO B-118 §8.2, which V-96 caught: `platform.anon_function_birth_grandfather`
-- was NEVER in this position. Its columns are (schema_name, function_name,
-- argtypes, reason, recorded_at) and its primary key is already
-- (schema_name, function_name, argtypes). There is ONE grandfather table to fix,
-- not two, and this file fixes it.
--
-- No function body is replaced by this file, so it carries no `-- based-on:` line.

set local search_path = platform, public, pg_catalog;
set local lock_timeout = '30s';

-- ─── 1. RED, in this file, BEFORE the drop ─────────────────────────────────
-- Two different overloads of one function, described by the same display string.
-- The old text UNIQUE refuses the second — a correct row, refused by a key that
-- stopped meaning anything the day identity_args became a display column.
do $$
declare
  v_refused boolean := false;
  v_msg text;
begin
  execute 'create schema dd223b_proof';
  execute 'create function dd223b_proof.probe(p_x uuid) returns text language sql as $p$ select ''x''::text $p$';
  execute 'create function dd223b_proof.probe(p_x text) returns text language sql as $p$ select ''x''::text $p$';

  insert into platform.client_callable_door
    (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by)
  values ('dd223b_proof','probe','probe(one argument)', array['uuid'::regtype::oid],
          'DD-223b proof: the first of two overloads, described by a human-readable display string.',
          'DD-223b proof');
  begin
    insert into platform.client_callable_door
      (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by)
    values ('dd223b_proof','probe','probe(one argument)', array['text'::regtype::oid],
            'DD-223b proof: the SECOND overload — a different function, the same display string.',
            'DD-223b proof');
  exception when others then
    v_refused := true; v_msg := sqlerrm;
  end;
  if not v_refused then
    raise exception 'DD-223b proof (a) FAILED: the old text UNIQUE did not refuse the second overload, so this file has nothing to prove and the premise is wrong.';
  end if;
  raise notice 'DD-223b proof (a) RED (the state before this file): %', left(v_msg, 160);
end $$;

-- ─── 2. The drop ────────────────────────────────────────────────────────────
alter table platform.client_callable_door
  drop constraint if exists client_callable_door_schema_name_function_name_identity_arg_key;

-- ─── 3. GREEN, same plant, and the catalog key still refuses a real duplicate ──
do $$
declare
  v_refused boolean := false;
  v_msg text;
begin
  insert into platform.client_callable_door
    (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by)
  values ('dd223b_proof','probe','probe(one argument)', array['text'::regtype::oid],
          'DD-223b proof: the SECOND overload — a different function, the same display string.',
          'DD-223b proof');
  raise notice 'DD-223b proof (a) GREEN: two overloads sharing one display string are both registered.';

  begin
    insert into platform.client_callable_door
      (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by)
    values ('dd223b_proof','probe','a completely different display string', array['uuid'::regtype::oid],
            'DD-223b proof: the same door a second time, under a different display string.',
            'DD-223b proof');
  exception when others then
    v_refused := true; v_msg := sqlerrm;
  end;
  if not v_refused then
    raise exception 'DD-223b proof (b) FAILED: the catalog key let the same door be registered twice.';
  end if;
  raise notice 'DD-223b proof (b) GREEN: %', left(v_msg, 160);

  delete from platform.client_callable_door where schema_name = 'dd223b_proof';
  execute 'drop schema dd223b_proof cascade';
  if exists (select 1 from pg_namespace where nspname = 'dd223b_proof')
     or exists (select 1 from platform.client_callable_door where schema_name = 'dd223b_proof') then
    raise exception 'DD-223b proof FAILED: the probe survived its own teardown.';
  end if;
end $$;

-- ─── 4. The grandfather table is keyed on what the guard actually reads ─────
do $$
declare v_null int; v_dupe int; v_unresolved int;
begin
  select count(*) filter (where argtypes is null) into v_null
    from platform.definer_client_grant_grandfather;
  select count(*) into v_dupe from (
    select 1 from platform.definer_client_grant_grandfather
     group by schema_name, function_name, argtypes having count(*) > 1) d;
  select count(*) into v_unresolved
    from platform.definer_client_grant_grandfather g
   where (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = g.schema_name and p.proname = g.function_name
             and p.proargtypes::text = g.argtypes) <> 1;
  if v_null <> 0 or v_dupe <> 0 then
    raise exception 'DD-223b: cannot move the grandfather key — % row(s) carry a NULL argtypes and % duplicate by (schema, name, argtypes). Resolve them first; a stand-down whose key the guard cannot read is a stand-down for nothing.',
      v_null, v_dupe;
  end if;
  if v_unresolved <> 0 then
    raise warning 'DD-223b: % grandfather row(s) do not resolve to exactly one live function by argtypes. The key still moves (argtypes is what the guard reads either way), but those rows stand for nothing and should be retired.', v_unresolved;
  end if;
  raise notice 'DD-223b: % grandfather row(s), 0 NULL argtypes, 0 duplicates by the catalog key, % unresolved.',
    (select count(*) from platform.definer_client_grant_grandfather), v_unresolved;
end $$;

alter table platform.definer_client_grant_grandfather
  alter column argtypes set not null;

alter table platform.definer_client_grant_grandfather
  drop constraint definer_client_grant_grandfather_pkey;

alter table platform.definer_client_grant_grandfather
  add constraint definer_client_grant_grandfather_pkey
  primary key (schema_name, function_name, argtypes);

comment on column platform.definer_client_grant_grandfather.argtypes is
  'THE IDENTITY of the grandfathered function: pg_proc.proargtypes as text. This is what platform.enforce_definer_client_grants_impl has matched on since hr_l3_109 and, since DD-223b, what the primary key is. NOT NULL: a stand-down whose key the guard cannot read is a stand-down for nothing.';
comment on column platform.definer_client_grant_grandfather.identity_args is
  'DISPLAY ONLY: how the signature reads to a human. NOT an identity — pg_get_function_identity_arguments renders an argument type bare or schema-qualified depending on the reader search_path, so the same function reads two ways from two connections. Match on argtypes. DD-223b (B-118).';

-- ─── 5. RED → GREEN on the new grandfather key, planted and rolled back ─────
do $$
declare
  v_refused boolean := false;
  v_msg text;
  v_row record;
begin
  select * into v_row from platform.definer_client_grant_grandfather limit 1;
  if v_row is null then
    raise notice 'DD-223b proof (c) SKIPPED: the grandfather table is empty, which is the state it is meant to reach.';
    return;
  end if;
  begin
    insert into platform.definer_client_grant_grandfather
      (schema_name, function_name, identity_args, argtypes)
    values (v_row.schema_name, v_row.function_name,
            v_row.identity_args || ' -- DD-223b proof: the same function, spelled differently',
            v_row.argtypes);
  exception when others then
    v_refused := true; v_msg := sqlerrm;
  end;
  if not v_refused then
    delete from platform.definer_client_grant_grandfather
     where schema_name = v_row.schema_name and function_name = v_row.function_name
       and identity_args like '%DD-223b proof%';
    raise exception 'DD-223b proof (c) FAILED: one function was grandfathered twice under two spellings.';
  end if;
  raise notice 'DD-223b proof (c) GREEN: %', left(v_msg, 160);
end $$;

-- ─── 6. End state ───────────────────────────────────────────────────────────
do $$
declare v_old int; v_gf_key text; v_doors int;
begin
  select count(*) into v_old from pg_constraint
   where conrelid = 'platform.client_callable_door'::regclass
     and conname = 'client_callable_door_schema_name_function_name_identity_arg_key';
  select pg_get_constraintdef(oid) into v_gf_key from pg_constraint
   where conrelid = 'platform.definer_client_grant_grandfather'::regclass
     and contype = 'p';
  select count(*) into v_doors from platform.client_callable_door;
  if v_old <> 0 then
    raise exception 'DD-223b end state FAILED: the old text UNIQUE is still on platform.client_callable_door.';
  end if;
  if v_gf_key not like '%argtypes%' or v_gf_key like '%identity_args%' then
    raise exception 'DD-223b end state FAILED: the grandfather primary key is still %.', v_gf_key;
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'platform'
                  and indexname = 'client_callable_door_catalog_identity_key') then
    raise exception 'DD-223b end state FAILED: the catalog-key UNIQUE on the door register is gone.';
  end if;
  raise notice 'DD-223b: % door rows keyed only on the catalog; grandfather primary key is now %.',
    v_doors, v_gf_key;
end $$;
