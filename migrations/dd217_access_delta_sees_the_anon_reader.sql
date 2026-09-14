-- dd217_access_delta_sees_the_anon_reader — THE ACCESS-DELTA GATE LEARNS TO READ AS anon
-- (DD-217. SECURITY. Feedback e76a9af9-81b1-4d42-82f5-25759495a993, filed by B-103.)
--
-- ═══ THE DEFECT, MEASURED BEFORE THIS FILE ═════════════════════════════════════════════════════
-- `iam.access_delta_snapshot` is the harness every access lane leans on: it reads a table AS a
-- principal before and after a change, and `iam.access_delta_compare` refuses a widening by name.
-- For the ANONYMOUS principal on any DD-186 column-bounded relation it measured NOTHING, and said
-- SAME.  Proven on this database, in one transaction, rolled back, 2026-09-14:
--
--   a scratch relation with a `for select to anon using (true)` policy and `grant select
--   (key, payload, created_at)` — column-bounded exactly like the 194 relations DD-186 produced.
--
--     a signed-out read, directly:   2 rows   ->   (four rows inserted)   ->   4 rows
--     access_delta_compare:          0        ->                              0     verdict SAME
--
--   …and the probe row carried the note "no SELECT grant for this role — zero rows by grant, not
--   by policy", which is FALSE: anon held three of the four columns and read every row.
--
-- Both of the function's two read paths need privileges a column-bounded relation by definition
-- does not give:
--
--   1. the uuid path reads `t.id`. DD-186 grants by an exact closed list, and a column that is not
--      on the list — `id` included, on four registered tokens today — is revoked. The read raises
--      `insufficient_privilege`, and the handler recorded ZERO ROWS.
--   2. the fallback hashes `t::text`, which needs SELECT on EVERY column of the row. A
--      column-bounded relation never grants every column. Same raise, same zero.
--
-- A 0 -> 0 pair compares as SAME, so the anonymous axis was silently unmeasured on the whole
-- DD-186 set — and a 0 in the BEFORE half against a real count in the AFTER half reported a
-- WIDER that never happened (B-103 saw that too, on `billing.plan`: a false 0 -> 9 on a guest
-- price list that had not moved).
--
-- ═══ WHAT THIS FILE CHANGES ════════════════════════════════════════════════════════════════════
-- The snapshot now reads THROUGH THE COLUMNS THE ROLE ACTUALLY HOLDS, decided from the catalog
-- (`has_column_privilege`) BEFORE it assumes the role, so the read is built never to raise:
--
--   * zero readable columns  -> 0 rows, and the note is true: the role holds nothing.
--   * `id` readable (uuid)   -> unchanged: count, md5 of the ids, and the ids themselves. The
--                               strongest evidence, and the common case.
--   * `id` present but NOT readable, or absent -> count(*) (which needs no column privilege beyond
--                               one), plus md5 over ONLY the granted columns. No ids, `sampled`
--                               true, and a `note:` saying which columns the hash is made of, so a
--                               reader never mistakes a bounded hash for a whole-row one.
--   * the pin column (`created_at`/`occurred_at`) is used only when the role can read it; when it
--     cannot, the pair says so instead of failing the read.
--
-- And the safety net changes meaning. `insufficient_privilege` no longer records 0 rows: it records
-- readable_count NULL with an error that is NOT a `note:`, which `iam.access_delta_compare` already
-- reads as UNMEASURED. A gate that cannot see is never again a gate that says SAME.
--
-- ═══ THE PROOF IS IN THIS FILE ═════════════════════════════════════════════════════════════════
-- The block at the bottom plants four scratch relations covering all four shapes, widens each by
-- two rows a signed-out visitor can read, and ABORTS this migration unless the harness returns
-- WIDER on every one of them. It also asserts a no-grant relation still reports SAME at 0, so the
-- fix does not turn "anon holds nothing" into a false alarm. Everything it makes, it drops.

create or replace function iam.access_delta_snapshot(
  p_label text,
  p_principals uuid[],
  p_tokens text[],
  p_id_cap integer default 20000,
  p_note text default null,
  p_as_of timestamptz default null)
returns uuid
language plpgsql
as $function$
declare
  v_run uuid;
  v_principal uuid;
  v_token text;
  v_schema text; v_table text;
  v_label text; v_has_id boolean; v_pin_col text; v_pin text;
  v_count bigint; v_hash text; v_ids uuid[]; v_sampled boolean; v_err text;
  v_as_of timestamptz := coalesce(p_as_of, now());
  v_anon constant uuid := '00000000-0000-0000-0000-000000000000';
  v_role text;
  v_rel regclass;
  v_readable text[];
  v_id_readable boolean;
  v_pin_readable boolean;
  v_bounded boolean;
  v_expr text;
begin
  if p_principals is null or cardinality(p_principals) = 0 then
    raise exception 'access_delta_snapshot: no principals. A delta over nobody proves nothing.';
  end if;
  if p_tokens is null or cardinality(p_tokens) = 0 then
    raise exception 'access_delta_snapshot: no tokens. A delta over no tables proves nothing.';
  end if;

  insert into iam.access_delta_run(label, note, started_at)
  values (p_label, coalesce(p_note,'') || format(' [as_of %s]', v_as_of), v_as_of)
  returning id into v_run;

  foreach v_token in array p_tokens loop
    select et.schema_name, et.table_name into v_schema, v_table
      from platform.entity_types et where et.token = v_token and et.is_active;
    if v_schema is null then
      raise exception 'access_delta_snapshot: token % is not an active registered entity', v_token;
    end if;
    v_rel := to_regclass(format('%I.%I', v_schema, v_table));
    if v_rel is null then
      raise exception 'access_delta_snapshot: %.% does not exist', v_schema, v_table;
    end if;

    select exists (select 1 from information_schema.columns
                    where table_schema = v_schema and table_name = v_table
                      and column_name = 'id' and udt_name = 'uuid') into v_has_id;

    -- THE PIN COLUMN. `created_at` on an entity; `occurred_at` on a ledger, which is the same fact
    -- under the name db-rules gives it for an append-only row (iam.verify_canonical: "ledger append
    -- timestamp is occurred_at"). Neither ⇒ no pin, and the probe says so in its own row.
    select column_name into v_pin_col
      from information_schema.columns
     where table_schema = v_schema and table_name = v_table
       and column_name in ('created_at','occurred_at')
     order by case column_name when 'created_at' then 0 else 1 end
     limit 1;

    foreach v_principal in array p_principals loop
      v_count := null; v_hash := null; v_ids := null; v_sampled := false; v_err := null;

      select coalesce(u.email, v_principal::text) into v_label from auth.users u where u.id = v_principal;
      if v_principal = v_anon then v_label := 'anonymous (no JWT)'; end if;
      v_label := coalesce(v_label, v_principal::text || ' (no auth.users row)');

      -- ── DD-217. WHAT CAN THIS ROLE ACTUALLY READ? ────────────────────────────────────────────
      -- Decided from the catalog, as the OWNER, BEFORE assuming the role — so the statement below
      -- is built never to raise on a column DD-186 revoked. A table-level grant answers `true` for
      -- every column here, so the two grant shapes go down one path.
      v_role := case when v_principal = v_anon then 'anon' else 'authenticated' end;

      select coalesce(array_agg(a.attname order by a.attnum), '{}')
        into v_readable
        from pg_attribute a
       where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped
         and has_column_privilege(v_role, a.attrelid, a.attnum, 'SELECT');

      v_id_readable := v_has_id and ('id' = any(v_readable));
      v_pin_readable := v_pin_col is not null and (v_pin_col = any(v_readable));
      v_bounded := cardinality(v_readable) <
                   (select count(*) from pg_attribute a
                     where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped);

      v_pin := case when v_pin_readable
                    then format(' where t.%I <= %L::timestamptz', v_pin_col, v_as_of) else '' end;

      begin
        if v_principal = v_anon then
          perform set_config('request.jwt.claims', null, true);
          execute 'set local role anon';
        else
          perform set_config('request.jwt.claims',
            json_build_object('sub', v_principal::text, 'role', 'authenticated')::text, true);
          execute 'set local role authenticated';
        end if;

        if cardinality(v_readable) = 0 then
          -- Honest zero: this role holds no column on this relation, so it reads nothing whatever
          -- the policies say. No statement is issued at all.
          v_count := 0;
          v_ids := case when v_has_id then '{}'::uuid[] end;
          v_hash := md5('');
          v_sampled := not v_has_id;
          v_err := 'note: this role holds SELECT on no column of this relation — zero rows by grant, '
                || 'not by policy.';
        elsif v_id_readable then
          execute format(
            'select count(*), md5(coalesce(string_agg(t.id::text, '','' order by t.id), '''')), '
            'case when count(*) <= %s then array_agg(t.id order by t.id) else null end '
            'from %I.%I t%s', p_id_cap, v_schema, v_table, v_pin)
            into v_count, v_hash, v_ids;
          v_sampled := v_ids is null;
        else
          -- No readable uuid identity. count(*) needs no column privilege beyond the one this role
          -- already has, and the row hash is built from the granted columns ONLY — never `t::text`,
          -- which needs every column and is exactly what used to raise here.
          select string_agg(format('coalesce(t.%I::text, chr(1))', col), ' || chr(31) || '
                            order by ord)
            into v_expr
            from unnest(v_readable) with ordinality as u(col, ord);
          execute format(
            'select count(*), md5(coalesce(string_agg(%s, '','' order by %s), '''')) '
            'from %I.%I t%s', v_expr, v_expr, v_schema, v_table, v_pin)
            into v_count, v_hash;
          v_ids := null;
          v_sampled := true;
          v_err := format('note: %s holds %s of %s column(s) here, and none of them is a readable '
                       || 'uuid id — the count is exact, the hash covers only (%s), and no row '
                       || 'identities could be recorded.',
                       v_role, cardinality(v_readable),
                       (select count(*) from pg_attribute a
                         where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped),
                       array_to_string(v_readable, ', '));
        end if;

        execute 'reset role';
      exception
        when insufficient_privilege then
          -- DD-217: this is no longer recorded as ZERO ROWS. A count the harness could not take is
          -- UNMEASURED (readable_count null, and an error_text that is NOT a `note:`), which
          -- iam.access_delta_compare already refuses to call SAME.
          begin execute 'reset role'; exception when others then null; end;
          v_count := null; v_ids := null; v_hash := null; v_sampled := true;
          v_err := format('UNMEASURED: the read raised insufficient_privilege for %s even though the '
                       || 'catalog said %s column(s) were readable. This pair proves nothing — fix '
                       || 'the harness before trusting any verdict on it. (%s)',
                       v_role, cardinality(v_readable), sqlerrm);
        when others then
          begin execute 'reset role'; exception when others then null; end;
          v_err := format('%s: %s', sqlstate, sqlerrm);
      end;

      if v_pin_col is null and v_err is null then
        v_err := 'note: no created_at or occurred_at column — this pair could not be pinned to the '
              || 'run instant, so a row inserted between the two snapshots will read as a widening '
              || 'and refuse. Prove the token by its class and its emitted policy instead, or give '
              || 'the table a timestamp.';
      elsif v_pin_col is not null and not v_pin_readable and v_err is not null
            and v_err like 'note: %' then
        v_err := v_err || format(' note: %s cannot read the pin column %I, so this pair is NOT '
                              || 'pinned to the run instant.', v_role, v_pin_col);
      elsif v_pin_col is not null and not v_pin_readable and v_err is null then
        v_err := format('note: %s cannot read the pin column %I, so this pair is NOT pinned to the '
                     || 'run instant and a row inserted between the two snapshots reads as a '
                     || 'widening.', v_role, v_pin_col);
      end if;

      insert into iam.access_delta_probe(
        run_id, principal_id, principal_label, token, schema_name, table_name,
        readable_count, id_hash, ids, sampled, error_text)
      values (v_run, v_principal, v_label, v_token, v_schema, v_table,
              v_count, v_hash, v_ids, v_sampled, v_err);
    end loop;
  end loop;

  update iam.access_delta_run set finished_at = now() where id = v_run;
  return v_run;
end
$function$;

comment on function iam.access_delta_snapshot(text, uuid[], text[], integer, text, timestamptz) is
  'Reads a registered entity AS a principal and records what it can see. DD-217 (2026-09-14): the '
  'read is built from the columns has_column_privilege says the role actually holds, so a DD-186 '
  'column-bounded relation is measured instead of raising insufficient_privilege and being recorded '
  'as zero rows. A read that still cannot be taken records readable_count NULL (UNMEASURED), never '
  'a zero that compares as SAME.';


-- ═══ RED → GREEN, IN THIS TRANSACTION, AGAINST THE REAL DATABASE ═══════════════════════════════
do $proof$
declare
  v_before uuid; v_after uuid;
  v_verdict text; v_b bigint; v_a bigint;
  v_fail text := '';
  r record;
begin
  set local lock_timeout = '20s';

  create schema dd217_proof;
  grant usage on schema dd217_proof to anon;

  -- SHAPE A — no uuid id, column-bounded. The `t::text` face of the defect.
  create table dd217_proof.no_id (
    key text primary key, payload text, secret text,
    created_at timestamptz not null default now());
  alter table dd217_proof.no_id enable row level security;
  create policy anon_read on dd217_proof.no_id for select to anon using (true);
  grant select (key, payload, created_at) on dd217_proof.no_id to anon;

  -- SHAPE B — uuid id the role may NOT read. The `t.id` face of the defect.
  create table dd217_proof.hidden_id (
    id uuid primary key default gen_random_uuid(), payload text, secret text,
    created_at timestamptz not null default now());
  alter table dd217_proof.hidden_id enable row level security;
  create policy anon_read on dd217_proof.hidden_id for select to anon using (true);
  grant select (payload, created_at) on dd217_proof.hidden_id to anon;

  -- SHAPE C — a plain table-level grant. The path that already worked, kept honest.
  create table dd217_proof.whole_table (
    id uuid primary key default gen_random_uuid(), payload text,
    created_at timestamptz not null default now());
  alter table dd217_proof.whole_table enable row level security;
  create policy anon_read on dd217_proof.whole_table for select to anon using (true);
  grant select on dd217_proof.whole_table to anon;

  -- SHAPE D — anon holds nothing. Must stay a quiet, honest zero.
  create table dd217_proof.closed (
    id uuid primary key default gen_random_uuid(), payload text,
    created_at timestamptz not null default now());
  alter table dd217_proof.closed enable row level security;

  insert into dd217_proof.no_id(key,payload,secret) values ('a','1','s'),('b','2','s');
  insert into dd217_proof.hidden_id(payload,secret) values ('1','s'),('2','s');
  insert into dd217_proof.whole_table(payload) values ('1'),('2');
  insert into dd217_proof.closed(payload) values ('1'),('2');

  insert into platform.entity_types(token, schema_name, table_name, label, is_active) values
    ('dd217_proof_no_id','dd217_proof','no_id','DD-217 proof: no uuid id', true),
    ('dd217_proof_hidden_id','dd217_proof','hidden_id','DD-217 proof: unreadable id', true),
    ('dd217_proof_whole_table','dd217_proof','whole_table','DD-217 proof: table grant', true),
    ('dd217_proof_closed','dd217_proof','closed','DD-217 proof: no grant', true);

  v_before := iam.access_delta_snapshot(
    'DD-217 in-migration proof (before)',
    array['00000000-0000-0000-0000-000000000000']::uuid[],
    array['dd217_proof_no_id','dd217_proof_hidden_id','dd217_proof_whole_table','dd217_proof_closed'],
    20000, 'rolled into the dd217 migration');

  -- THE WIDENING a signed-out visitor really gets.
  insert into dd217_proof.no_id(key,payload,secret) values ('c','3','s'),('d','4','s');
  insert into dd217_proof.hidden_id(payload,secret) values ('3','s'),('4','s');
  insert into dd217_proof.whole_table(payload) values ('3'),('4');
  insert into dd217_proof.closed(payload) values ('3'),('4');

  v_after := iam.access_delta_snapshot(
    'DD-217 in-migration proof (after)',
    array['00000000-0000-0000-0000-000000000000']::uuid[],
    array['dd217_proof_no_id','dd217_proof_hidden_id','dd217_proof_whole_table','dd217_proof_closed'],
    20000, 'rolled into the dd217 migration');

  for r in select token, count_before, count_after, verdict
             from iam.access_delta_compare(v_before, v_after) loop
    if r.token = 'dd217_proof_closed' then
      if r.verdict <> 'SAME' or coalesce(r.count_before,-1) <> 0 or coalesce(r.count_after,-1) <> 0 then
        v_fail := v_fail || format(E'\n  %s: expected SAME 0 -> 0 (anon holds no column here), got %s %s -> %s',
                                   r.token, r.verdict, r.count_before, r.count_after);
      end if;
    else
      if r.verdict <> 'WIDER' or coalesce(r.count_before,-1) <> 2 or coalesce(r.count_after,-1) <> 4 then
        v_fail := v_fail || format(E'\n  %s: expected WIDER 2 -> 4 (a signed-out visitor really went '
                                    'from two rows to four), got %s %s -> %s',
                                   r.token, r.verdict, r.count_before, r.count_after);
      end if;
    end if;
  end loop;

  delete from iam.access_delta_probe where run_id in (v_before, v_after);
  delete from iam.access_delta_run where id in (v_before, v_after);
  delete from platform.entity_types where token like 'dd217_proof_%';
  drop schema dd217_proof cascade;

  if v_fail <> '' then
    raise exception 'DD-217 PROOF FAILED — the access-delta harness still cannot see a signed-out '
                    'reader, so this migration must not land:%s', v_fail;
  end if;
  raise notice 'DD-217 proof GREEN: WIDER 2 -> 4 on the no-id, unreadable-id and table-grant shapes; '
               'SAME 0 -> 0 where anon holds nothing.';
end
$proof$;
