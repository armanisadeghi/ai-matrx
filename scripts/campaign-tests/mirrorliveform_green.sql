-- MIRROR-LIVE-FORM — THE GREEN SUITE (lane MIRROR-LIVE-FORM, 2026-09-27), on the pattern of the
-- STORE-READ-PERF-2 / CARRYING-EDGES-PERF parity harness: the body before this lane (the inverse,
-- \i'd first) and the campaign file's body, in ONE transaction over the same rows, rolled back.
--
-- What it proves, in the order it proves it:
--   1  THE GENERATOR WRITES THE LIVE FORM. Before the file, iam.entity_read_expr('custom','record',
--      'record') carries the whole-database candidate `accessible_entity_ids('record', …)` and no
--      `iam.record_visible_in_org` arm (RED, expected); after it, the reverse (GREEN).
--   2  NOTHING ELSE MOVES. The generator's text for EVERY registered entity/system/component table,
--      before and after: byte-identical except custom.record.
--   3  IDENTICAL ANSWERS. For every seat (admin@admin.com, test@test.com, a person with no
--      membership, every member of a shared_only organization, every person named by a record
--      grant, and a deterministic sample of members of organizations holding records), the set of
--      custom.record rows — live AND soft-deleted, every organization — the old text admits and the
--      set the new text admits: byte-identical (md5 of the sorted id list, per seat).
--   Census 12 itself (old text vs this file's text, same rows) was compared on production as a
--   pg_temp copy of custom.shared_only_disagreements in one rolled-back transaction: see
--   PROGRESS-STORE-READ-PERF-2.md (MIRROR-LIVE-FORM).
--
-- TWO TRANSACTIONS, ON PURPOSE. Replacing a function fires the DDL event triggers, which take row
-- locks (platform.provision_shape_debt) that every other DDL on the database then waits for until
-- this transaction ends. So phase A (the inverse, the file, both texts, clause 1 and 2) is short and
-- rolled back, and hands the two texts to phase B in psql variables; phase B asks the seats with no
-- DDL at all. Phase B reads, per seat, every record of every organization the seat belongs to, every
-- record a grant / membership / closure row names, and a deterministic sample (-v rows=, default
-- 3000) of the whole table, live and soft-deleted: a whole-table scan per seat costs ~15 min on the
-- clone through the per-organization arm.
--
-- PLANTS (the guard must be seen failing): `-v plant=no_deleted_guard` drops `deleted_at is null`
-- from the new arm (a soft-deleted record of a visible Table would be admitted) and
-- `-v plant=drop_arm` removes the arm without putting C1 back (the organization's own records stop
-- being admitted through it). Either turns clause 3 RED. With no plant every clause is green.
--
-- THE USE CASE (owner law, 2026-09-21: no fake test data): the live record store itself — every
-- job book, board and list real organizations keep in custom.record — read by the real seats.
--
-- Run (from matrx-frontend; SESSION pooler port 5432):
--   psql -f scripts/campaign-tests/mirrorliveform_green.sql                 (clone or production)
--   psql -v plant=drop_arm -f scripts/campaign-tests/mirrorliveform_green.sql
\set ON_ERROR_STOP on
\set suite 'mirrorliveform_green.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
\if :{?plant}
\else
\set plant none
\endif
\if :{?sample}
\else
\set sample 12
\endif
\if :{?rows}
\else
\set rows 3000
\endif
\timing on

-- ══ PHASE A — the two bodies, one short rolled-back transaction ═══════════════════════════════
begin;
set local lock_timeout = '2s';
create temp table mlf_text (side text, schema_name text, table_name text, token text, variant text, txt text,
                            primary key (side, schema_name, table_name, token)) on commit drop;
create function pg_temp.mlf_texts(p_side text) returns void language plpgsql as $f$
declare r record; v text;
begin
  for r in
    select et.schema_name, et.table_name, et.token,
           case when coalesce(et.is_component, false) or et.rls_variant = 'component' then 'component' else 'entity' end as variant
      from platform.entity_types et
     where et.is_active
       and (et.rls_variant in ('entity', 'system', 'component') or coalesce(et.is_component, false))
       and to_regclass(format('%I.%I', et.schema_name, et.table_name)) is not null
  loop
    begin
      v := iam.entity_read_expr(r.schema_name, r.table_name, r.token, r.variant);
    exception when others then
      v := 'ERROR ' || sqlstate || ': ' || sqlerrm;
    end;
    insert into mlf_text values (p_side, r.schema_name, r.table_name, r.token, r.variant, v)
    on conflict do nothing;
  end loop;
end $f$;

\i migrations/inverse/mirrorliveform_the_generator_writes_the_record_policy_that_is_live_down.sql
select iam.entity_read_expr('custom', 'record', 'record') as old_text,
       (iam.entity_read_expr('custom', 'record', 'record') like '%iam.record_visible_in_org(%'
        and iam.entity_read_expr('custom', 'record', 'record') not like '%accessible_entity_ids(''record''%') as c1_before
\gset
set client_min_messages = error;
select pg_temp.mlf_texts('old');
reset client_min_messages;

\i migrations/campaign/mirrorliveform_the_generator_writes_the_record_policy_that_is_live.sql
select iam.entity_read_expr('custom', 'record', 'record') as new_text,
       (iam.entity_read_expr('custom', 'record', 'record') like '%iam.record_visible_in_org(%'
        and iam.entity_read_expr('custom', 'record', 'record') not like '%accessible_entity_ids(''record''%') as c1_after
\gset
set client_min_messages = error;
select pg_temp.mlf_texts('new');
reset client_min_messages;

select count(*) filter (where o.txt is distinct from n.txt and not (o.schema_name = 'custom' and o.table_name = 'record')) = 0 as c2_ok,
       format('%s tables compared, %s differ (custom.record: %s), %s answered an error on both sides',
              count(*), count(*) filter (where o.txt is distinct from n.txt),
              bool_or(o.txt is distinct from n.txt) filter (where o.schema_name = 'custom' and o.table_name = 'record'),
              count(*) filter (where o.txt like 'ERROR %')) as c2_detail
  from mlf_text o join mlf_text n
    on n.side = 'new' and o.side = 'old' and (n.schema_name, n.table_name, n.token) = (o.schema_name, o.table_name, o.token)
\gset
rollback;

-- ══ PHASE B — the seats, no DDL ══════════════════════════════════════════════════════════════
-- Its temp tables and helper are made in their OWN short transaction first: creating them is DDL
-- too, and would otherwise hold the event triggers' row locks for the whole of phase B. They live
-- for this session only (a session pooler or the direct host).
begin;
create temp table mlf_seat (user_id uuid primary key, why text);
create temp table mlf_ans (side text, user_id uuid, n int, rows_asked int, digest text, ms numeric, primary key (side, user_id));
create temp table mlf_verdict (clause text, ok boolean, detail text);
create function pg_temp.mlf_answers(p_side text, p_text text) returns void language plpgsql as $f$
declare s record; v uuid[]; v_asked int; t0 timestamptz; v_saved text := coalesce(current_setting('request.jwt.claims', true), '');
begin
  for s in select user_id from mlf_seat order by user_id loop
    perform set_config('request.jwt.claims',
                       json_build_object('sub', s.user_id::text, 'role', 'authenticated')::text, true);
    t0 := clock_timestamp();
    execute format($q$
      with candidate as materialized (
        select r.* from custom.record r
         where r.organization_id in (select m.organization_id from iam.memberships m
                                      where m.user_id = %1$L and m.container_type = 'organization')
            or r.id in (select p.resource_id from iam.permissions p where p.resource_type = 'record'
                         and (p.granted_to_user_id = %1$L or p.granted_to_organization_id in
                              (select m.organization_id from iam.memberships m where m.user_id = %1$L)))
            or r.id in (select m.container_id from iam.memberships m where m.container_type = 'record' and m.user_id = %1$L)
            or r.id in (select x.item_id from platform.reachability x where x.item_type = 'record')
            or r.id in (select q.id from custom.record q order by md5(q.id::text) limit %2$s))
      select count(*)::int, coalesce(array_agg(id order by id) filter (where (%3$s)), '{}'::uuid[]) from candidate
    $q$, s.user_id, current_setting('mlf.rows')::int, p_text) into v_asked, v;
    insert into mlf_ans values (p_side, s.user_id, cardinality(v), v_asked, md5(array_to_string(v, ',')),
                                round(extract(epoch from clock_timestamp() - t0) * 1000));
  end loop;
  perform set_config('request.jwt.claims', v_saved, true);
end $f$;
commit;

set transaction_timeout = 0;
begin;
set local statement_timeout = 0;
do $tt$ begin if current_setting('transaction_timeout') <> '0' then raise exception 'transaction_timeout is % - this suite needs it lifted (a session pooler, or the direct host)', current_setting('transaction_timeout'); end if; end $tt$;
select set_config('mlf.plant', :'plant', true), set_config('mlf.rows', :'rows', true);

insert into mlf_verdict values
  ('1-before (expected RED): the generator writes the per-organization arm for custom.record', :'c1_before', ''),
  ('1-after: the generator writes the per-organization arm for custom.record', :'c1_after', ''),
  ('2: the generator text of every other table is byte-identical', :'c2_ok', :'c2_detail');

insert into mlf_seat values
  ('87a6e699-3622-4869-8843-d0867456c0dd', 'admin@admin.com'),
  ('4060701e-706a-4c76-b3ca-0bbc69fa5a14', 'test@test.com'),
  ('00000000-0000-4000-8000-00000000d0e5', 'a person with no membership anywhere')
on conflict do nothing;
insert into mlf_seat
select distinct m.user_id, 'member of a shared_only organization'
  from iam.memberships m
 where m.container_type = 'organization' and m.status = 'active'
   and custom.store_is_open(m.organization_id) and not iam.member_lane_open(m.organization_id)
on conflict do nothing;
insert into mlf_seat
select distinct p.granted_to_user_id, 'named by a record grant'
  from iam.permissions p
 where p.resource_type = 'record' and p.granted_to_user_id is not null
on conflict do nothing;
insert into mlf_seat
select s.user_id, 'sampled member of an organization holding records'
  from (select distinct m.user_id
          from iam.memberships m
         where m.container_type = 'organization' and m.status = 'active'
           and exists (select 1 from custom.record r where r.organization_id = m.organization_id)) s
 order by md5(s.user_id::text)
 limit :sample
on conflict do nothing;
select count(*) as seats, string_agg(distinct why, ' | ') as kinds from mlf_seat;


select set_config('mlf.old', :'old_text', true), set_config('mlf.new', :'new_text', true);
select pg_temp.mlf_answers('old', current_setting('mlf.old'));
do $a$
declare v text := current_setting('mlf.new');
begin
  if current_setting('mlf.plant') = 'no_deleted_guard' then
    v := replace(v, '(deleted_at is null and iam.record_visible_in_org(', '(iam.record_visible_in_org(');
  elsif current_setting('mlf.plant') = 'drop_arm' then
    v := replace(v, ' or (deleted_at is null and iam.record_visible_in_org(organization_id, table_id, id, visibility, created_by, ''viewer''::public.permission_level) and iam.has_access(''record'', id, ''viewer''::public.permission_level))', '');
  elsif current_setting('mlf.plant') <> 'none' then
    raise exception 'plant is none, no_deleted_guard or drop_arm, not %', current_setting('mlf.plant');
  end if;
  if current_setting('mlf.plant') <> 'none' and v = current_setting('mlf.new') then
    raise exception 'plant % did not change the text', current_setting('mlf.plant');
  end if;
  perform pg_temp.mlf_answers('new', v);
end $a$;

insert into mlf_verdict
select '3: every seat reads the same custom.record rows through the old and the new text',
       count(*) filter (where o.digest is distinct from n.digest) = 0 and count(*) = (select count(*) from mlf_seat),
       format('%s seats, %s differ; %s rows asked, %s admitted (old), %s (new); %s seats admit >0 rows; old %s ms, new %s ms in all',
              count(*), count(*) filter (where o.digest is distinct from n.digest), sum(o.rows_asked), sum(o.n), sum(n.n),
              count(*) filter (where o.n > 0), sum(o.ms), sum(n.ms))
  from mlf_ans o join mlf_ans n on n.side = 'new' and o.side = 'old' and n.user_id = o.user_id;

select o.user_id, s.why, o.rows_asked, o.n as old_n, n.n as new_n, o.ms as old_ms, n.ms as new_ms,
       case when o.digest = n.digest then 'same' else 'DIFFERS' end as verdict
  from mlf_ans o join mlf_ans n on n.side = 'new' and o.side = 'old' and n.user_id = o.user_id
  join mlf_seat s on s.user_id = o.user_id
 order by (o.digest = n.digest), o.n desc;

select case when ok then 'PASS' else 'FAIL' end as verdict, clause, detail from mlf_verdict order by clause;

do $v$
declare v_fail int;
begin
  select count(*) into v_fail from mlf_verdict where not ok and clause not like '1-before%';
  if current_setting('mlf.plant') <> 'none' then
    if v_fail = 0 then
      raise exception 'PLANT % WAS NOT CAUGHT — the suite is green on a wrong text', current_setting('mlf.plant');
    end if;
    raise notice 'RED as planted (%): % clause(s) failed', current_setting('mlf.plant'), v_fail;
  elsif v_fail > 0 then
    raise exception 'mirrorliveform_green: % clause(s) FAILED', v_fail;
  else
    raise notice 'mirrorliveform_green: ALL CLAUSES PASSED';
  end if;
end $v$;
rollback;
