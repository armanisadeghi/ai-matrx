-- DD-209 — the access-delta harness has a COLUMN axis.
--
-- THE HOLE (V-82 §9.2, proven live and rolled back on 2026-09-14). `iam.access_delta_
-- snapshot` records WHICH ROWS a principal can read and `iam.access_delta_compare`
-- answers SAME / WIDER / NARROWER on that row set. It has no column axis at all. So a
-- relation `anon` already reads by row, granted one more column:
--
--     set local role anon; select id, payload, secret from v82b.t;   -- TOP SECRET A/B
--     token       | count_before | count_after | verdict
--     v82b_colgap |            2 |           2 | SAME
--
-- A signed-out reader gained a secret and the widening gate said nothing changed. The
-- verdict was not wrong about rows; it was silent about the axis the widening happened
-- on, and silence reads as a pass.
--
-- V-82 noted the class is covered by the OTHER guard — `check:anon-column-surface` is a
-- column-axis gate, wired blocking by B-110. That is true and it stays true. It is also
-- not a reason to leave this harness able to print SAME over a real widening: a lane
-- that cites `access_delta_compare SAME` as evidence that nobody gained anything would
-- be reading a sentence this function cannot support. A harness says what it measured.
--
-- WHAT CHANGES. The snapshot already COMPUTES the readable column set — DD-217 built it
-- so a column-bounded relation could be read at all — and then threw it away. It is now
-- recorded, and the comparison reports it:
--
--   * `iam.access_delta_probe.readable_columns` — what that role held, at that instant.
--   * `iam.access_delta_compare` gains `columns_gained` / `columns_lost`, and a pair
--     that gains a column is WIDER even when every row id is identical.
--   * A pair whose column set could not be recorded on one side (a snapshot taken
--     before this migration) is UNMEASURED on the column axis and says so, rather than
--     comparing NULL against a list and calling it SAME — the same rule DD-217 put on
--     the row axis.
--   * `iam.access_delta_assert_no_widening` names the columns in its refusal, so the
--     person reading the error knows which axis moved.
--
-- Ordering note: a column gained is reported as WIDER ahead of a row NARROWER, because
-- "they can see fewer rows but a new column of each" is a widening somebody must look at.

alter table iam.access_delta_probe
  add column if not exists readable_columns text[];

comment on column iam.access_delta_probe.readable_columns is
  'DD-209. The columns this role actually held SELECT on for this relation at the snapshot instant, from has_column_privilege — the same list DD-217 already used to build the read. NULL means the snapshot predates the column axis, and iam.access_delta_compare reports that pair UNMEASURED on columns rather than SAME.';

-- based-on: iam.access_delta_snapshot(text, uuid[], text[], integer, text, timestamp with time zone) 2be7b705cd6c01d91c34f4fe9d53b31f8a0a2374863240000a2e28628f80fa4c
CREATE OR REPLACE FUNCTION iam.access_delta_snapshot(p_label text, p_principals uuid[], p_tokens text[], p_id_cap integer DEFAULT 20000, p_note text DEFAULT NULL::text, p_as_of timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
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

      -- DD-209: the column axis. v_readable is what has_column_privilege said this
      -- role holds, decided as the OWNER before the role was assumed, so it is a
      -- fact about the GRANT and never about what the policies then allowed.
      insert into iam.access_delta_probe(
        run_id, principal_id, principal_label, token, schema_name, table_name,
        readable_count, id_hash, ids, sampled, error_text, readable_columns)
      values (v_run, v_principal, v_label, v_token, v_schema, v_table,
              v_count, v_hash, v_ids, v_sampled, v_err, v_readable);
    end loop;
  end loop;

  update iam.access_delta_run set finished_at = now() where id = v_run;
  return v_run;
end
$function$

;

-- The comparison gains its column axis. The return TYPE changes, so this is a DROP
-- and CREATE rather than a replace; the assertion that reads it is dropped first and
-- put back below, unchanged in job and wider in what it can say.
-- based-on: iam.access_delta_compare(uuid, uuid) 6de8f0b9518e3e0e3359b35f6c95145b5850552b62790aaaf26b019392ad615a
-- based-on: iam.access_delta_assert_no_widening(uuid, uuid) 7025b3284488dfb917547c580161e949ba8a5cb17c00c0152afcba86e7376159
drop function if exists iam.access_delta_assert_no_widening(uuid, uuid);
drop function if exists iam.access_delta_compare(uuid, uuid);

create function iam.access_delta_compare(p_before uuid, p_after uuid)
returns table(
  token text, principal_id uuid, principal_label text,
  count_before bigint, count_after bigint,
  rows_lost integer, rows_gained integer,
  gained_sample uuid[], lost_sample uuid[],
  columns_gained text[], columns_lost text[],
  verdict text)
language sql
stable
as $function$
  with before_run as (select * from iam.access_delta_probe where run_id = p_before),
       after_run  as (select * from iam.access_delta_probe where run_id = p_after),
       pair as (
         select
           coalesce(b.token, a.token) as token,
           coalesce(b.principal_id, a.principal_id) as principal_id,
           coalesce(b.principal_label, a.principal_label) as principal_label,
           b.run_id as b_run, a.run_id as a_run,
           b.readable_count as b_count, a.readable_count as a_count,
           b.error_text as b_err, a.error_text as a_err,
           b.ids as b_ids, a.ids as a_ids,
           b.id_hash as b_hash, a.id_hash as a_hash,
           b.readable_columns as b_cols, a.readable_columns as a_cols
         from before_run b
         full join after_run a on a.token = b.token and a.principal_id = b.principal_id
       ),
       axes as (
         select p.*,
           case when p.b_cols is not null and p.a_cols is not null
                then array(select unnest(p.a_cols) except select unnest(p.b_cols)) end as cols_gained,
           case when p.b_cols is not null and p.a_cols is not null
                then array(select unnest(p.b_cols) except select unnest(p.a_cols)) end as cols_lost
         from pair p
       )
  select
    token, principal_id, principal_label,
    b_count, a_count,
    case when b_ids is not null and a_ids is not null
         then cardinality(array(select unnest(b_ids) except select unnest(a_ids))) end,
    case when b_ids is not null and a_ids is not null
         then cardinality(array(select unnest(a_ids) except select unnest(b_ids))) end,
    case when b_ids is not null and a_ids is not null
         then (array(select unnest(a_ids) except select unnest(b_ids)))[1:20] end,
    case when b_ids is not null and a_ids is not null
         then (array(select unnest(b_ids) except select unnest(a_ids)))[1:20] end,
    cols_gained, cols_lost,
    case
      when b_run is null or a_run is null then 'UNMEASURED'
      when coalesce(b_err,'') not like 'note: %' and b_err is not null then 'UNMEASURED'
      when coalesce(a_err,'') not like 'note: %' and a_err is not null then 'UNMEASURED'
      when b_count is null or a_count is null then 'UNMEASURED'
      -- DD-209, THE COLUMN AXIS, JUDGED FIRST. A column gained is a widening even
      -- when every row id is identical (V-82 §9.2: anon kept 2 rows and gained the
      -- `secret` column, and this function printed SAME). And a pair whose column
      -- set was never recorded on one side is UNMEASURED on this axis — never SAME,
      -- which is the DD-217 rule applied to the second axis.
      when b_cols is null or a_cols is null then 'UNMEASURED'
      when cardinality(cols_gained) > 0 then 'WIDER'
      when b_ids is null or a_ids is null then
        case when a_count > b_count then 'WIDER'
             when a_count < b_count then 'NARROWER'
             when a_hash is distinct from b_hash then 'UNPROVEN'
             when cardinality(cols_lost) > 0 then 'NARROWER'
             else 'SAME' end
      when exists (select unnest(a_ids) except select unnest(b_ids)) then 'WIDER'
      when exists (select unnest(b_ids) except select unnest(a_ids)) then 'NARROWER'
      when cardinality(cols_lost) > 0 then 'NARROWER'
      else 'SAME'
    end
  from axes
  order by 1, 3;
$function$;

comment on function iam.access_delta_compare(uuid, uuid) is
  'DD-209. Compares two access_delta snapshots on BOTH axes: which rows a principal can read, and which COLUMNS of them. A column gained is WIDER even when the row set is identical (V-82 §9.2 measured the opposite behaviour: anon gained a `secret` column and this function printed SAME). A pair whose readable_columns was not recorded on one side is UNMEASURED on the column axis, never SAME.';

create function iam.access_delta_assert_no_widening(p_before uuid, p_after uuid)
returns text
language plpgsql
stable
as $function$
declare
  v_wider text; v_unmeasured text; v_n integer; v_pairs integer; v_narrower integer;
begin
  select count(*) into v_pairs from iam.access_delta_compare(p_before, p_after);
  if v_pairs = 0 then
    raise exception 'access_delta gate: the comparison is EMPTY. A gate over nothing is not a gate.';
  end if;

  select string_agg(format('  %s / %s: %s -> %s (+%s rows, e.g. %s)%s',
           token, principal_label, count_before, count_after, rows_gained, gained_sample,
           case when cardinality(coalesce(columns_gained, '{}')) > 0
                then format(' AND GAINED COLUMN(S): %s', array_to_string(columns_gained, ', '))
                else '' end), E'\n'),
         count(*)
    into v_wider, v_n
  from iam.access_delta_compare(p_before, p_after) where verdict = 'WIDER';
  if coalesce(v_n,0) > 0 then
    raise exception using
      errcode = '42501',
      message = format(E'access_delta gate REFUSES: %s (table, principal) pair(s) would WIDEN — '
                       'somebody can now read rows, or columns of rows, they could not read before:\n%s', v_n, v_wider),
      hint = 'A table whose readable set widens for ANY principal — on the ROW axis or the COLUMN '
             'axis (DD-209) — is excluded from the regeneration until its bespoke design is declared '
             'in the registry or deliberately retired in its own migration (§3.9 step 4, db-rules '
             '§6d-2: an exclusion is INTENT, and intent cannot be recovered from the artifact it '
             'produced).';
  end if;

  select string_agg(format('  %s / %s (%s)', token, principal_label, verdict), E'\n'), count(*)
    into v_unmeasured, v_n
  from iam.access_delta_compare(p_before, p_after) where verdict in ('UNMEASURED','UNPROVEN');
  if coalesce(v_n,0) > 0 then
    raise exception using
      errcode = '42501',
      message = format(E'access_delta gate REFUSES: %s pair(s) could not be MEASURED, so nothing '
                       'here proves they did not widen:\n%s', v_n, v_unmeasured),
      hint = '"I could not measure it" and "it did not widen" are the two sentences this harness '
             'exists to keep apart. Raise p_id_cap, fix the probe error, re-take a snapshot that '
             'predates the DD-209 column axis, or take the table out of the batch and say why.';
  end if;

  select count(*) into v_narrower from iam.access_delta_compare(p_before, p_after) where verdict='NARROWER';
  return format('access_delta gate GREEN: %s pairs, 0 wider (rows AND columns), %s narrower, %s unchanged.',
                v_pairs, v_narrower, v_pairs - v_narrower);
end
$function$;
