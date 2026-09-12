-- iam_access_delta_harness_dd137b2 — THE ACCESS-DELTA HARNESS AND THE WIDER-DIFF GATE (DD-137b, step 2).
--
-- Design: common-docs /projects/data-doctrine-adoption/discovery/VISIBILITY-BY-CLASS.md §3.9 step 4
-- ("the WIDER-diff gate, before a single regeneration") and step 5 ("a per-identity access delta
-- over REAL non-admin JWTs in rolled-back transactions — the shape the 2026-08-26 component sweep
-- used: 783 pairs / 145 tables / 306 identities, 0 lost, 0 gained").
--
-- 🚨 WHY THIS EXISTS AND WHY IT COMES BEFORE THE REGENERATION. DD-136 regenerated `platform.rulebook`
-- through this same generator on 2026-09-12 and every signed-in GET 500'd from 11:10:40Z: a policy
-- whose USING clause selected from its own relation (42P17). The generator has a guard for that one
-- now. It has no guard at all for the thing this file measures — that a regeneration handed somebody
-- rows they could not read before. A byte-level policy diff cannot answer that question, because
-- "wider text" and "wider READABLE SET" are different things and only one of them is the promise.
--
-- What is here:
--   1. `iam.access_delta_run` / `iam.access_delta_probe` — two plain tables (no entity shape, no
--      registry row: they hold measurements, not platform data, and no client role can reach them).
--   2. `iam.access_delta_snapshot(label, principals, tokens)` — records, for every (principal,
--      token) pair, the EXACT set of rows that principal can read right now, measured by
--      impersonating the real identity as the `authenticated` role so RLS actually bites.
--   3. `iam.access_delta_compare(before, after)` — per pair: rows LOST and rows GAINED.
--   4. `iam.access_delta_assert_no_widening(before, after)` — THE GATE. It raises, naming every
--      table and every principal that gained a row. A table whose readable set would WIDEN for any
--      principal is refused and named (the brief's words).
--
-- 🚨 NOTHING SILENT, AND IT IS THE WHOLE POINT HERE. A probe that could not be measured is not a
-- pass: `assert_no_widening` REFUSES a comparison in which either side carries an errored probe or
-- an unproven sampled pair, because "I could not measure it" and "it did not widen" are the two
-- sentences this harness exists to keep apart.
--
-- 🚨 NOT CLIENT-CALLABLE. Every function here is SECURITY INVOKER and granted to nobody: it
-- impersonates other people by design, so it must only ever run as the migration role. There is no
-- `platform.client_callable_door` row because there is no client door.

-- ═════════════════════════════════════════════════════════ 1. where a measurement lives
create table if not exists iam.access_delta_run (
  id           uuid primary key default gen_random_uuid(),
  label        text not null,
  note         text,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz
);
comment on table iam.access_delta_run is
  'DD-137b step 2. One row per access-delta snapshot. A measurement, not platform data: no entity '
  'shape, no registry token, no client grant.';

create table if not exists iam.access_delta_probe (
  run_id          uuid not null references iam.access_delta_run(id) on delete cascade,
  principal_id    uuid not null,
  principal_label text not null,
  token           text not null,
  schema_name     text not null,
  table_name      text not null,
  readable_count  bigint,
  id_hash         text,
  ids             uuid[],
  sampled         boolean not null default false,
  error_text      text,
  probed_at       timestamptz not null default now(),
  primary key (run_id, principal_id, token)
);
comment on column iam.access_delta_probe.ids is
  'The exact readable id set, up to the cap. Above the cap only the count and the hash are kept and '
  '`sampled` is true — and a sampled pair whose hash moved cannot be PROVEN not to have widened, so '
  'the gate refuses it by name rather than passing it.';
comment on column iam.access_delta_probe.error_text is
  'The verbatim Postgres error if this pair could not be measured. A probe that errored is never '
  'read as "no change" — the gate refuses a comparison that contains one.';

alter table iam.access_delta_run enable row level security;
alter table iam.access_delta_probe enable row level security;
do $$
begin
  -- No policy at all for anon/authenticated: the tables are unreachable from any client role. The
  -- service lane exists so the platform's own tooling can read a run.
  if not exists (select 1 from pg_policy where polrelid='iam.access_delta_run'::regclass and polname='svc_all') then
    create policy svc_all on iam.access_delta_run for all to service_role using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policy where polrelid='iam.access_delta_probe'::regclass and polname='svc_all') then
    create policy svc_all on iam.access_delta_probe for all to service_role using (true) with check (true);
  end if;
end $$;
revoke all on iam.access_delta_run from public, anon, authenticated;
revoke all on iam.access_delta_probe from public, anon, authenticated;

-- ═════════════════════════════════════════════════════════ 2. the snapshot
--
-- THE SENTINEL. `00000000-0000-0000-0000-000000000000` means ANONYMOUS — the probe runs as the
-- `anon` role with no JWT at all. A non-member is an ordinary uuid that belongs to no organization
-- the table's rows live in; the caller supplies one, because "who is a non-member" is a fact about
-- the data under test and not something this function may guess.
create or replace function iam.access_delta_snapshot(
  p_label text,
  p_principals uuid[],
  p_tokens text[],
  p_id_cap integer default 20000,
  p_note text default null
) returns uuid
language plpgsql
as $function$
declare
  v_run uuid;
  v_principal uuid;
  v_token text;
  v_schema text; v_table text;
  v_label text;
  v_count bigint; v_hash text; v_ids uuid[]; v_sampled boolean; v_err text;
  v_anon constant uuid := '00000000-0000-0000-0000-000000000000';
begin
  if p_principals is null or cardinality(p_principals) = 0 then
    raise exception 'access_delta_snapshot: no principals. A delta over nobody proves nothing.';
  end if;
  if p_tokens is null or cardinality(p_tokens) = 0 then
    raise exception 'access_delta_snapshot: no tokens. A delta over no tables proves nothing.';
  end if;

  insert into iam.access_delta_run(label, note) values (p_label, p_note) returning id into v_run;

  foreach v_token in array p_tokens loop
    select et.schema_name, et.table_name into v_schema, v_table
      from platform.entity_types et where et.token = v_token and et.is_active;
    if v_schema is null then
      raise exception 'access_delta_snapshot: token % is not an active registered entity', v_token;
    end if;
    if to_regclass(format('%I.%I', v_schema, v_table)) is null then
      raise exception 'access_delta_snapshot: %.% does not exist', v_schema, v_table;
    end if;

    foreach v_principal in array p_principals loop
      v_count := null; v_hash := null; v_ids := null; v_sampled := false; v_err := null;

      select coalesce(u.email, v_principal::text) into v_label from auth.users u where u.id = v_principal;
      if v_principal = v_anon then v_label := 'anonymous (no JWT)'; end if;
      v_label := coalesce(v_label, v_principal::text || ' (no auth.users row)');

      begin
        if v_principal = v_anon then
          perform set_config('request.jwt.claims', null, true);
          execute 'set local role anon';
        else
          perform set_config('request.jwt.claims',
            json_build_object('sub', v_principal::text, 'role', 'authenticated')::text, true);
          execute 'set local role authenticated';
        end if;

        execute format(
          'select count(*), md5(coalesce(string_agg(t.id::text, '','' order by t.id), '''')), '
          'case when count(*) <= %s then array_agg(t.id order by t.id) else null end '
          'from %I.%I t', p_id_cap, v_schema, v_table)
          into v_count, v_hash, v_ids;
        v_sampled := v_ids is null;

        execute 'reset role';
      exception when others then
        -- The role must come back even when the probe died, or every later probe in this run is
        -- measured as the wrong person. `reset role` inside the handler is not optional.
        begin execute 'reset role'; exception when others then null; end;
        v_err := format('%s: %s', sqlstate, sqlerrm);
      end;

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

comment on function iam.access_delta_snapshot(text, uuid[], text[], integer, text) is
  'DD-137b step 2 (§3.9 steps 4-5). Records the EXACT rows each principal can read on each token, '
  'by impersonating the real identity as the authenticated role so RLS bites — the shape the '
  '2026-08-26 component sweep used. The uuid 00000000-…-000000000000 means anonymous. '
  'SECURITY INVOKER and granted to nobody: it impersonates people by design.';

revoke all on function iam.access_delta_snapshot(text, uuid[], text[], integer, text) from public, anon, authenticated;

-- ═════════════════════════════════════════════════════════ 3. the comparison
create or replace function iam.access_delta_compare(p_before uuid, p_after uuid)
returns table(
  token text, principal_id uuid, principal_label text,
  count_before bigint, count_after bigint,
  rows_lost integer, rows_gained integer,
  gained_sample uuid[], lost_sample uuid[],
  verdict text)
language sql
stable
as $function$
  select
    coalesce(b.token, a.token),
    coalesce(b.principal_id, a.principal_id),
    coalesce(b.principal_label, a.principal_label),
    b.readable_count, a.readable_count,
    case when b.ids is not null and a.ids is not null
         then cardinality(array(select unnest(b.ids) except select unnest(a.ids))) end,
    case when b.ids is not null and a.ids is not null
         then cardinality(array(select unnest(a.ids) except select unnest(b.ids))) end,
    case when b.ids is not null and a.ids is not null
         then (array(select unnest(a.ids) except select unnest(b.ids)))[1:20] end,
    case when b.ids is not null and a.ids is not null
         then (array(select unnest(b.ids) except select unnest(a.ids)))[1:20] end,
    case
      when b.error_text is not null or a.error_text is not null then 'UNMEASURED'
      when b.readable_count is null or a.readable_count is null then 'UNMEASURED'
      when b.ids is null or a.ids is null then
        case when a.readable_count > b.readable_count then 'WIDER'
             when a.readable_count < b.readable_count then 'NARROWER'
             when a.id_hash is distinct from b.id_hash then 'UNPROVEN'
             else 'SAME' end
      when exists (select unnest(a.ids) except select unnest(b.ids)) then 'WIDER'
      when exists (select unnest(b.ids) except select unnest(a.ids)) then 'NARROWER'
      else 'SAME'
    end
  from iam.access_delta_probe b
  full join iam.access_delta_probe a
    on a.run_id = p_after and a.token = b.token and a.principal_id = b.principal_id
  where b.run_id = p_before or a.run_id = p_after
  order by 1, 3;
$function$;

comment on function iam.access_delta_compare(uuid, uuid) is
  'DD-137b step 2. Per (token, principal): what was lost and what was GAINED between two snapshots. '
  'A pair too large for the id cap answers UNPROVEN when its hash moved with an unchanged count — '
  'never SAME, because an unmeasured swap is not a proof of no widening.';

-- ═════════════════════════════════════════════════════════ 4. THE GATE
create or replace function iam.access_delta_assert_no_widening(p_before uuid, p_after uuid)
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

  select string_agg(format('  %s / %s: %s -> %s (+%s rows, e.g. %s)',
           token, principal_label, count_before, count_after, rows_gained, gained_sample), E'\n'),
         count(*)
    into v_wider, v_n
  from iam.access_delta_compare(p_before, p_after) where verdict = 'WIDER';
  if coalesce(v_n,0) > 0 then
    raise exception using
      errcode = '42501',
      message = format(E'access_delta gate REFUSES: %s (table, principal) pair(s) would WIDEN — '
                       'somebody can now read rows they could not read before:\n%s', v_n, v_wider),
      hint = 'A table whose readable set widens for ANY principal is excluded from the regeneration '
             'until its bespoke design is declared in the registry or deliberately retired in its '
             'own migration (§3.9 step 4, db-rules §6d-2: an exclusion is INTENT, and intent cannot '
             'be recovered from the artifact it produced).';
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
             'exists to keep apart. Raise p_id_cap, fix the probe error, or take the table out of '
             'the batch and say why.';
  end if;

  select count(*) into v_narrower from iam.access_delta_compare(p_before, p_after) where verdict='NARROWER';
  return format('access_delta gate GREEN: %s pairs, 0 wider, %s narrower, %s unchanged.',
                v_pairs, v_narrower, v_pairs - v_narrower);
end
$function$;

comment on function iam.access_delta_assert_no_widening(uuid, uuid) is
  'DD-137b step 2 — THE WIDER-DIFF GATE (§3.9 step 4). Raises, naming every table and every '
  'principal that gained a row, and raises just as loudly on a pair it could not measure. It '
  'returns a sentence rather than a boolean so a green run leaves a quotable number behind.';

revoke all on function iam.access_delta_compare(uuid, uuid) from public, anon, authenticated;
revoke all on function iam.access_delta_assert_no_widening(uuid, uuid) from public, anon, authenticated;

-- ═════════════════════════════════════════════════════════ 5. the harness proves ITSELF, RED then GREEN
--
-- law 3 (forcing-function tests): a gate nobody has seen FAIL is not a gate. These two blocks run
-- the real functions against the real database and are the only reason a later GREEN means anything.
do $$
declare
  v_a uuid; v_b uuid; v_msg text; v_caught boolean := false;
  -- A principal with no organization membership anywhere and a table that is not empty: whatever
  -- the counts are, the two snapshots are taken with nothing changed in between, so the gate MUST
  -- answer green. Then a hand-made "gained" row must make it refuse.
  v_p uuid;
begin
  select m.user_id into v_p from iam.organization_member m
   where not public.is_super_admin_for(m.user_id) limit 1;
  if v_p is null then raise exception 'dd137b2 self-test: no non-admin identity to probe with'; end if;

  -- GREEN: nothing changed between the two snapshots.
  v_a := iam.access_delta_snapshot('dd137b2 self-test A', array[v_p], array['conversation']);
  v_b := iam.access_delta_snapshot('dd137b2 self-test B', array[v_p], array['conversation']);
  v_msg := iam.access_delta_assert_no_widening(v_a, v_b);
  if v_msg not like '%GREEN%' then
    raise exception 'dd137b2 self-test: the gate did not go green on an unchanged pair: %', v_msg;
  end if;
  raise notice 'dd137b2 self-test GREEN half: %', v_msg;

  -- RED: forge one gained row into the AFTER snapshot and prove the gate refuses it.
  update iam.access_delta_probe
     set ids = coalesce(ids, '{}'::uuid[]) || '11111111-1111-1111-1111-111111111111'::uuid,
         readable_count = coalesce(readable_count,0) + 1
   where run_id = v_b;
  begin
    perform iam.access_delta_assert_no_widening(v_a, v_b);
  exception when insufficient_privilege then
    v_caught := true;
    raise notice 'dd137b2 self-test RED half: the gate refused as it must — %', sqlerrm;
  end;
  if not v_caught then
    raise exception 'dd137b2 self-test: THE GATE DID NOT REFUSE A WIDENED SET. It is not a gate.';
  end if;

  -- RED again: an UNMEASURED probe must refuse just as loudly as a widened one.
  v_caught := false;
  update iam.access_delta_probe set ids = null, readable_count = null,
         error_text = 'forged: this probe never ran' where run_id = v_b;
  begin
    perform iam.access_delta_assert_no_widening(v_a, v_b);
  exception when insufficient_privilege then
    v_caught := true;
    raise notice 'dd137b2 self-test RED half 2: the gate refused an unmeasured pair — %', sqlerrm;
  end;
  if not v_caught then
    raise exception 'dd137b2 self-test: the gate PASSED a pair it could not measure. "I could not '
      'measure it" is not "it did not widen".';
  end if;

  delete from iam.access_delta_run where id in (v_a, v_b);
  raise notice 'dd137b2: the harness proved itself RED then GREEN against the live database';
end $$;
