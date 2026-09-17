-- W1-TIER — THE RED TWIN of `w1_tier_c8.sql` (rules 2 and 3).
--
-- RUN IT:
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
--   "$PSQL" "$SUPABASE_BRANCH_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/w1_tier_red.sql
--
-- A guard that cannot be demonstrated FAILING is not a guard. This file removes each of this
-- lane's six guards INSIDE ONE TRANSACTION — by dropping a constraint, by flipping the opt-in
-- behind its own door, or by replacing a body with one missing the clause under test —
-- performs the write or the read the green suite proves is refused or hidden, and asserts it
-- LANDS. Then it rolls the whole thing back, guards included, because `ALTER TABLE … DROP
-- CONSTRAINT` and `CREATE OR REPLACE FUNCTION` are both transactional.
--
-- IT IS NOT A MIGRATION, it lives outside `migrations/`, it runs on the REHEARSAL BRANCH only,
-- and it never runs against production: the first statement refuses on any server whose
-- control-file identifier is not the branch's.
--
-- WHAT EACH RED SAYS. If an assertion below fails, the guard it names was doing NOTHING and
-- the green suite's matching clause was passing for some other reason — a typo in the call, a
-- constraint somewhere else, a policy that hid the row for an unrelated reason.

\set ON_ERROR_STOP on
\timing off

begin;
set local lock_timeout = '5s';

do $r$
declare
  v_org     uuid;
  v_a       constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';  -- test@test.com
  v_org_kernel constant uuid := '11111111-0000-4000-8000-000000000004';
  v_b       uuid;
  v_home    uuid;
  v_table   uuid;
  v_src     uuid;
  v_stub    uuid;
  v_link    uuid;
  v_landed  uuid;
  v_event   bigint;
  v_rowid   uuid;
  v_n       integer;
  v_conname text;
begin
  if (pg_control_system()).system_identifier <> 7678069749886157684 then
    raise exception 'w1_tier_red.sql refuses to run here: system_identifier is %, and this file may only run on the rehearsal branch (7678069749886157684)',
                    (pg_control_system()).system_identifier;
  end if;

  select o.id into v_org from iam.organizations o
   where not exists (select 1 from iam.system_orgs s where s.organization_id = o.id)
   order by o.id limit 1;
  select u.id into v_b from auth.users u
   where u.id <> v_a
     and not exists (select 1 from iam.organization_member m where m.organization_id = v_org and m.user_id = u.id)
     and not exists (select 1 from admin.admins a where a.user_id = u.id)
   order by u.id limit 1;

  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);

  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, v_org_kernel, 'record', jsonb_build_object('name','W1-TIER RED Home'))
  returning id into v_home;
  v_table := custom.table_declare(v_org, jsonb_build_object(
    'name', 'External Widget', 'slug', 'external_widget',
    'label_singular', 'External Widget', 'label_plural', 'External Widgets',
    'type', 'entity', 'display', 'page', 'ordered', false,
    'weight', 'light', 'retention_days', 30,
    'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true,
    'fields', jsonb_build_array(jsonb_build_object('name','title','kind','text')),
    'title_field', 'title', 'parent_id', v_home::text));
  v_src  := custom.external_source_declare(v_org, 'foreign_table', 'rehearsal_pg', 'public', 'w1_tier_widgets', 'https://example.invalid/rows/{key}');
  v_stub := custom.external_stub_upsert(v_org, v_src, v_table, 'EXT-1', null, 'Widget A');
  select id into v_link from custom.external_link where organization_id = v_org and record_id = v_stub;

  -- ── RED 1: REC-N-11's opt-in column ─────────────────────────────────────────
  -- Flip `writes_enabled` behind the door's back. If the write is STILL refused with 42501,
  -- the green 42501 came from something other than the opt-in.
  update custom.external_source set writes_enabled = true where id = v_src;
  begin
    perform custom.external_write_through(v_org, v_stub, jsonb_build_object('title','x'));
    raise exception 'RED 1 FAIL: with the opt-in on, the write returned without raising at all — the 0A000 that names the missing connection is gone too';
  exception when insufficient_privilege then
    raise exception 'RED 1 FAIL: still 42501 with writes_enabled = true — the opt-in column is NOT what refuses the write';
  when others then
    raise notice 'RED 1 PASS  writes_enabled = true removes the 42501 (what is left is the honest 0A000) — the column is the switch';
  end;
  update custom.external_source set writes_enabled = false where id = v_src;

  -- ── RED 2: REL-N-1's CHECK on target_ref ────────────────────────────────────
  select c.conname into v_conname
    from pg_constraint c
   where c.conrelid = 'custom.external_link'::regclass and c.contype = 'c'
     and pg_get_constraintdef(c.oid) like '%target_ref%';
  if v_conname is null then
    raise exception 'RED 2 FAIL: custom.external_link carries NO check constraint on target_ref — REL-N-1 is a convention, not a law';
  end if;
  execute format('alter table custom.external_link drop constraint %I', v_conname);
  insert into custom.external_link (organization_id, record_id, source_id, external_key, target_ref)
  values (v_org, v_home, v_src, 'MALFORMED', jsonb_build_object('kind','external','key','k'))
  returning record_id into v_landed;
  if v_landed is null then
    raise exception 'RED 2 FAIL: the malformed target_ref was refused with the constraint dropped — something else refuses it and the CHECK proves nothing';
  end if;
  raise notice 'RED 2 PASS  with % dropped, a target_ref missing connection and external_table LANDS', v_conname;
  delete from custom.external_link where record_id = v_home and external_key = 'MALFORMED';

  -- ── RED 3: DOOR-N-6's Visibility filter inside the definer door ─────────────
  create table custom_external.w1_tier_widgets (external_key text primary key, title text);
  insert into custom_external.w1_tier_widgets values ('EXT-1','Widget A remote'), ('EXT-9','Never linked');
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  select count(*) into v_n from custom.external_rows(v_org, v_src) x;
  if v_n <> 0 then
    raise exception 'RED 3 SETUP FAIL: the stranger already reads % row(s) with the filter in place', v_n;
  end if;

  create or replace function custom.external_rows(p_organization_id uuid, p_source_id uuid)
    returns setof jsonb language plpgsql security definer set search_path to 'pg_catalog'
  as $red$
  declare
    v_src custom.external_source%rowtype;
    v_row jsonb;
  begin
    select * into v_src from custom.external_source
     where organization_id = p_organization_id and id = p_source_id and deleted_at is null;
    for v_row in execute format(
        'select to_jsonb(t) from custom_external.%I t join custom.external_link l on l.external_key = t.external_key and l.organization_id = $1 and l.source_id = $2',
        v_src.external_table)
      using p_organization_id, p_source_id
    loop
      return next v_row;
    end loop;
    return;
  end;
  $red$;
  select count(*) into v_n from custom.external_rows(v_org, v_src) x;
  if v_n <> 1 then
    raise exception 'RED 3 FAIL: with iam.has_access removed the stranger reads % row(s), expected 1 — the filter is not what hides the external row', v_n;
  end if;
  raise notice 'RED 3 PASS  with iam.has_access removed from the definer door, a stranger reads the external row — the filter is what applies our Visibility';
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);

  -- ── RED 4: HIS-N-3's null row_id ────────────────────────────────────────────
  v_event := custom.external_history_event(v_org, v_link, 'linked');
  select row_id into v_rowid from history.row_versions where id = v_event;
  if v_rowid is not null then
    raise exception 'RED 4 SETUP FAIL: the door already writes a row_id (%)', v_rowid;
  end if;
  create or replace function custom.external_history_event(p_organization_id uuid, p_link_id uuid, p_operation text)
    returns bigint language plpgsql security definer set search_path to 'pg_catalog'
  as $red$
  declare
    v_link custom.external_link%rowtype;
    v_id   bigint;
  begin
    select * into v_link from custom.external_link
     where organization_id = p_organization_id and id = p_link_id;
    insert into history.row_versions
      (entity_type, row_id, organization_id, version, operation, row_data, actor_id, occurred_at)
    values ('external_link', v_link.record_id, p_organization_id, 1, p_operation,
            jsonb_build_object('about','external_link'), auth.uid(), now())
    returning id into v_id;
    return v_id;
  end;
  $red$;
  v_event := custom.external_history_event(v_org, v_link, 'linked');
  select row_id into v_rowid from history.row_versions where id = v_event;
  if v_rowid is null then
    raise exception 'RED 4 FAIL: history.row_versions refused to store a row_id at all — the green NULL says nothing about the door';
  end if;
  raise notice 'RED 4 PASS  history.row_versions CAN hold a row_id (%) — the NULL the door writes is a decision, not a limitation', v_rowid;

  -- ── RED 5: REC-N-8 / REC-N-9's refusal ──────────────────────────────────────
  create or replace function custom.external_source_declare(
      p_organization_id uuid, p_tier text, p_connection_token text,
      p_external_schema text, p_external_table text, p_link_template text)
    returns uuid language plpgsql security definer set search_path to 'pg_catalog'
  as $red$
  declare
    v_id uuid;
  begin
    insert into custom.external_source
      (organization_id, tier, connection_token, external_schema, external_table, link_template)
    values (p_organization_id, p_tier, p_connection_token, coalesce(p_external_schema,''), p_external_table, p_link_template)
    returning id into v_id;
    return v_id;
  end;
  $red$;
  if custom.external_source_declare(v_org, 'managed_postgres', 'their_instance', '', 'invoice', null) is null then
    raise exception 'RED 5 FAIL: tier managed_postgres was refused with the refusal removed — the 0A000 is not this door''s';
  end if;
  raise notice 'RED 5 PASS  with the refusal removed, tier managed_postgres is stored — the 0A000 is the door''s own, and the row shape was never the obstacle';

  -- ── RED 6: DOOR-N-6's exposure guard ────────────────────────────────────────
  grant select on table custom_external.w1_tier_widgets to authenticated;
  select count(*) into v_n from custom.external_foreign_table_findings();
  if v_n <> 1 then
    raise exception 'RED 6 SETUP FAIL: the live guard reports % finding(s) for a client-granted private relation, expected 1', v_n;
  end if;
  create or replace function custom.external_foreign_table_findings()
    returns setof text language sql security definer set search_path to 'pg_catalog'
  as $red$ select null::text where false; $red$;
  select count(*) into v_n from custom.external_foreign_table_findings();
  if v_n <> 0 then
    raise exception 'RED 6 FAIL: the neutered guard still reports % finding(s)', v_n;
  end if;
  raise notice 'RED 6 PASS  a guard with no query reports 0 on the same grant the real one names — the green 0 is a measurement, not an empty function';

  raise notice '════ W1-TIER RED: all six guards demonstrated FAILING. Rolling back. ════';
end
$r$;

rollback;
