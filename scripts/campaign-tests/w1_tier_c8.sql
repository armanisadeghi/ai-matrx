-- W1-TIER — C-8, THE EXTERNAL TIER, against the REHEARSAL BRANCH.
--
-- RUN IT:
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
--   "$PSQL" "$SUPABASE_BRANCH_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/w1_tier_c8.sql
--
-- IT IS NOT A MIGRATION and never becomes one: it lives outside `migrations/`, is discovered
-- by no sweep, and its single transaction ends in ROLLBACK, so it leaves the branch exactly
-- as it found it. It is also the one place this lane's seven laws are EXECUTED rather than
-- asserted in prose: REC-N-8 · REC-N-9 · REC-N-10 · REC-N-11 · REL-N-1 · HIS-N-3 · DOOR-N-6.
--
-- WHAT MAKES IT FAIL. Every assertion below is a POSITIVE query with a stated expected value,
-- and every refusal assertion compares the SQLSTATE *and* the door's own words — never the
-- mere presence of an error, which a typo in the call would also produce. Each one names the
-- change that makes it fail. Its RED twin is `w1_tier_red.sql`, which removes each guard
-- inside a rolled-back transaction and proves the same writes then LAND.
--
-- THE FIXTURE. One organization (`Matrx System`), one registered source, one stub, one NATIVE
-- record beside it as the control, and two identities: A, the creator, and B, a signed-in user
-- who is neither the creator, nor a member of the organization, nor a platform admin — chosen
-- by query rather than named, so the test does not depend on one row staying that way.

\set ON_ERROR_STOP on
\timing off

begin;
set local lock_timeout = '5s';

do $t$
declare
  v_org     uuid;   -- chosen by query below: a NORMAL organization, never a system org
  v_a       constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';  -- test@test.com
  v_kernel  constant uuid := '11111111-0000-4000-8000-000000000001';  -- the Table kernel record
  v_org_kernel constant uuid := '11111111-0000-4000-8000-000000000004';  -- the Organization kernel record
  v_table   uuid;
  v_home    uuid;
  v_b       uuid;
  v_src     uuid;
  v_src2    uuid;
  v_stub    uuid;
  v_native  uuid;
  v_link    uuid;
  v_event   bigint;
  v_txt     text;
  v_txt2    text;
  v_n       integer;
  v_bool    boolean;
  v_ts      timestamptz;
  v_ts2     timestamptz;
  v_state   text;
  v_msg     text;
  v_hint    text;
  v_interval interval;
  v_json    jsonb;
  v_keys    text[];
begin
  -- ── 0. THIS FILE RUNS ON THE REHEARSAL BRANCH AND NOWHERE ELSE ───────────────
  if (pg_control_system()).system_identifier <> 7678069749886157684 then
    raise exception 'w1_tier_c8.sql refuses to run here: system_identifier is %, and this file may only run on the rehearsal branch (7678069749886157684)',
                    (pg_control_system()).system_identifier;
  end if;

  -- THE ORGANIZATION IS CHOSEN BY QUERY, and it is deliberately NOT a system org: every
  -- `iam.system_orgs` row with `global_readable` is visible to EVERY signed-in user by one arm
  -- of custom.record's std_select policy, so a stranger test run inside `Matrx System` passes
  -- while proving nothing. Measured while writing this file: the stranger saw the stub there.
  select o.id into v_org
    from iam.organizations o
   where not exists (select 1 from iam.system_orgs s where s.organization_id = o.id)
   order by o.id
   limit 1;
  if v_org is null then
    raise exception 'FIXTURE: no non-system organization exists on this branch';
  end if;

  -- B: signed in, not the creator, not a member of this organization, not a platform admin.
  select u.id into v_b
    from auth.users u
   where u.id <> v_a
     and not exists (select 1 from iam.organization_member m
                      where m.organization_id = v_org and m.user_id = u.id)
     and not exists (select 1 from admin.admins a where a.user_id = u.id)
   order by u.id
   limit 1;
  if v_b is null then
    raise exception 'FIXTURE: no signed-in identity exists that is neither the creator, a member of % nor a platform admin', v_org;
  end if;

  -- EVERY FIXTURE ROW BELOW IS AUTHORED BY A. `platform._stamp_actor` takes `created_by`
  -- from `auth.uid()`, so the claim has to be in place BEFORE the writes, not only before the
  -- reads — with no claim the stamp is NULL and the creator arm of the policy matches nobody
  -- (measured while writing this file: the creator saw 0 of their own rows).
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);

  -- ══ 1. REC-N-8 / REC-N-9 — THE TIER IS A STORED VALUE PLUS A REFUSAL ════════
  -- FAILS IF: custom.external_source_declare stops refusing a tier D-14 defers, or starts
  -- refusing the one tier that is available. The positive control is the FIRST assertion:
  -- a refusal-only test passes when the door refuses everything.
  v_src := custom.external_source_declare(
             v_org, 'foreign_table', 'rehearsal_pg', 'public', 'w1_tier_widgets',
             'https://example.invalid/rows/{key}');
  if v_src is null then
    raise exception 'REC-N-8.1 FAIL: declaring tier foreign_table returned null';
  end if;
  select tier, writes_enabled into v_txt, v_bool
    from custom.external_source where id = v_src;
  if v_txt <> 'foreign_table' then
    raise exception 'REC-N-8.1 FAIL: stored tier is %, expected foreign_table', v_txt;
  end if;
  -- REC-N-11's DEFAULT, read off the row the door just wrote — never off the column default.
  if v_bool is not false then
    raise exception 'REC-N-11.1 FAIL: a freshly declared source has writes_enabled = %, expected false', v_bool;
  end if;
  raise notice 'REC-N-8.1 PASS  tier foreign_table declared (%), writes_enabled = false', v_src;

  begin
    perform custom.external_source_declare(v_org, 'customer_schema', 'their_own_schema', '', 'invoice', null);
    raise exception 'REC-N-8.2 FAIL: declaring tier customer_schema was ACCEPTED';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint;
    if v_state <> '0A000' then raise; end if;
    if v_msg not like '%DEFERRED (D-14)%' or v_msg not like '%no lane may spend money%' then
      raise exception 'REC-N-8.2 FAIL: refused with 0A000 but the message does not name the deferral: %', v_msg;
    end if;
    if coalesce(v_hint,'') not like '%approved by Arman%' or coalesce(v_hint,'') not like '%external_tier_contract%' then
      raise exception 'REC-N-8.2 FAIL: the refusal names no trigger and no remedy. hint: %', coalesce(v_hint,'(none)');
    end if;
    raise notice 'REC-N-8.2 PASS  customer_schema refused 0A000, naming D-14, its trigger and the remedy';
  end;

  begin
    perform custom.external_source_declare(v_org, 'managed_postgres', 'their_instance', '', 'invoice', null);
    raise exception 'REC-N-9.1 FAIL: declaring tier managed_postgres was ACCEPTED';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
    if v_state <> '0A000' then raise; end if;
    if v_msg not like '%DEFERRED (D-14)%' then
      raise exception 'REC-N-9.1 FAIL: refused with 0A000 but the message does not name the deferral: %', v_msg;
    end if;
    raise notice 'REC-N-9.1 PASS  managed_postgres refused 0A000, naming D-14';
  end;

  begin
    perform custom.external_source_declare(v_org, 'warehouse', 'x', '', 'y', null);
    raise exception 'REC-N-8.3 FAIL: tier "warehouse" was ACCEPTED';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    if v_state <> '22023' then raise; end if;
    raise notice 'REC-N-8.3 PASS  a tier that is not one of the three refused 22023';
  end;

  -- THE ROW SHAPE holds all three tiers even though only one can be declared: REC-N-8's
  -- "the row shape, the contract surface and the refusal path".
  -- FAILS IF: the column CHECK is narrowed to the one available tier, which would make the
  -- deferral unrepresentable and the refusal a lie about the shape.
  insert into custom.external_source (organization_id, tier, connection_token, external_schema, external_table)
  values (v_org, 'managed_postgres', 'shape_only', '', 'shape_only')
  returning id into v_src2;
  if v_src2 is null then
    raise exception 'REC-N-8.4 FAIL: the row shape cannot hold tier managed_postgres';
  end if;
  delete from custom.external_source where id = v_src2;
  raise notice 'REC-N-8.4 PASS  the row shape holds all three tiers; only the door refuses two';

  -- ══ 1b. THE CONTRACT SURFACE ════════════════════════════════════════════════
  -- FAILS IF: a tier disappears from the surface, or an unavailable tier stops naming its
  -- deferral and its trigger — the "not available and stops" this row exists to prevent.
  v_json := custom.external_tier_contract();
  if jsonb_array_length(v_json->'tiers') <> 3 then
    raise exception 'REC-N-8.5 FAIL: the contract surface names % tier(s), expected 3', jsonb_array_length(v_json->'tiers');
  end if;
  select count(*) into v_n from jsonb_array_elements(v_json->'tiers') x
   where (x->>'tier') = 'foreign_table' and (x->>'available')::boolean;
  if v_n <> 1 then
    raise exception 'REC-N-8.5 FAIL: foreign_table is not stated as available';
  end if;
  select count(*) into v_n from jsonb_array_elements(v_json->'tiers') x
   where (x->>'tier') in ('customer_schema','managed_postgres')
     and (x->>'available')::boolean is false
     and x->>'deferred' = 'D-14'
     and btrim(coalesce(x->>'trigger','')) <> ''
     and (x->>'costs_money')::boolean;
  if v_n <> 2 then
    raise exception 'REC-N-8.5 FAIL: % of the two deferred tiers state deferral, trigger and cost, expected 2', v_n;
  end if;
  if v_json->'write_posture'->>'default' <> 'read_only' then
    raise exception 'REC-N-11.2 FAIL: the contract surface states default write posture %, expected read_only', v_json->'write_posture'->>'default';
  end if;
  raise notice 'REC-N-8.5 / REC-N-11.2 PASS  three tiers, two deferred with D-14 and a trigger, posture read_only';

  -- ══ 2. REC-N-10 — THE STUB IS AN ORDINARY RECORD ════════════════════════════
  -- A real declared Table, so the stub belongs to one exactly as a native row does.
  -- `custom._table_shape_guard` (W1-TABLE's) is why this is a declared Table and not a
  -- hand-written record pointed at the kernel.
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, v_org_kernel, 'record', jsonb_build_object('name','W1-TIER Home'))
  returning id into v_home;
  v_table := custom.table_declare(v_org, jsonb_build_object(
    'name', 'External Widget', 'slug', 'external_widget',
    'label_singular', 'External Widget', 'label_plural', 'External Widgets',
    'type', 'entity', 'display', 'page', 'ordered', false,
    'weight', 'light', 'retention_days', 30,
    'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true,
    'fields', jsonb_build_array(jsonb_build_object('name', 'title', 'kind', 'text')),
    'title_field', 'title', 'parent_id', v_home::text));
  v_native := custom.record_write(v_org, v_table, jsonb_build_object('title','W1-TIER native control'));
  v_stub   := custom.external_stub_upsert(v_org, v_src, v_table, 'EXT-1', null, 'Widget A');
  if v_stub is null then
    raise exception 'REC-N-10.1 FAIL: external_stub_upsert returned null';
  end if;

  -- It is a row of custom.record, with NO new data class and NO second write path.
  -- FAILS IF: the stub is given its own data_class or its own table — then this select
  -- returns 0 and every Visibility, History and relation property has to be re-implemented.
  select data_class, data::text into v_txt, v_txt2 from custom.record
   where organization_id = v_org and id = v_stub;
  if v_txt is distinct from 'record' then
    raise exception 'REC-N-10.1 FAIL: the stub Record carries data_class %, expected record (an ORDINARY record)', coalesce(v_txt,'(no row)');
  end if;
  if v_txt2 <> '{}' then
    raise exception 'REC-N-10.1 FAIL: the stub Record carries data %, expected {} — the link is the link row, not a second copy in the document', v_txt2;
  end if;
  raise notice 'REC-N-10.1 PASS  the stub is a row of custom.record, data_class record, data {}';

  -- The link, the cached title and the freshness stamp, resolved through the view.
  select link_url, cached_title, fetched_at, target_ref, link_id
    into v_txt, v_txt2, v_ts, v_json, v_link
    from custom.external_record where organization_id = v_org and record_id = v_stub;
  if v_link is null then
    raise exception 'REC-N-10.2 FAIL: custom.external_record resolves no row for the stub';
  end if;
  if v_txt <> 'https://example.invalid/rows/EXT-1' then
    raise exception 'REC-N-10.2 FAIL: link is %, expected the source template with the key substituted', coalesce(v_txt,'(null)');
  end if;
  if v_txt2 <> 'Widget A' then
    raise exception 'REC-N-10.2 FAIL: cached title is %, expected Widget A', coalesce(v_txt2,'(null)');
  end if;
  if v_ts is null then
    raise exception 'REC-N-10.2 FAIL: the freshness stamp is null';
  end if;
  raise notice 'REC-N-10.2 PASS  link %, cached title %, freshness %', v_txt, v_txt2, v_ts;

  -- REL-N-1: the reference, with its two arms.
  -- FAILS IF: the external arm is written as a uuid, or the CHECK stops enforcing the shape.
  if v_json->>'kind' <> 'external' or v_json->>'key' <> 'EXT-1'
     or v_json->>'connection' <> 'rehearsal_pg' or v_json->>'external_table' <> 'w1_tier_widgets' then
    raise exception 'REL-N-1.1 FAIL: target_ref is %, expected {kind: external, connection, external_table, key}', v_json::text;
  end if;
  if custom.relation_target_ours('record', v_native)->>'kind' <> 'ours'
     or (custom.relation_target_ours('record', v_native)->>'row_id')::uuid <> v_native then
    raise exception 'REL-N-1.1 FAIL: the OURS arm does not round-trip';
  end if;
  raise notice 'REL-N-1.1 PASS  both arms: {ours, entity, row_id} and {external, connection, external_table, key}';

  -- An opaque key that is NOT a uuid — the thing platform.associations.target_id has no room
  -- for. FAILS IF: external_key is ever narrowed to uuid.
  perform custom.external_stub_upsert(v_org, v_src, v_table, 'SFDC-0015g00000XyZaB!frag', null, 'Not a uuid');
  select count(*) into v_n from custom.external_link
   where organization_id = v_org and external_key = 'SFDC-0015g00000XyZaB!frag';
  if v_n <> 1 then
    raise exception 'REL-N-1.2 FAIL: a non-uuid external key did not store (% rows)', v_n;
  end if;
  raise notice 'REL-N-1.2 PASS  a non-uuid opaque key stores verbatim';

  -- The CHECK is the law, not a convention.
  -- FAILS IF: the constraint is dropped — which is exactly what the RED twin does.
  begin
    insert into custom.external_link
      (organization_id, record_id, source_id, external_key, target_ref)
    values (v_org, v_native, v_src, 'MALFORMED', jsonb_build_object('kind','external','key','k'));
    raise exception 'REL-N-1.3 FAIL: a target_ref missing connection and external_table was ACCEPTED';
  exception when check_violation then
    raise notice 'REL-N-1.3 PASS  a malformed target_ref refused 23514 by the column CHECK';
  end;

  -- The refresh: same Record, new title, the stamp brought forward, no second row.
  -- `fetched_at` is written with `now()`, which is TRANSACTION time — two upserts inside one
  -- transaction share an instant, and that is correct ("when this transaction fetched"). So
  -- the stamp is aged by two hours first and the refresh is required to bring it back: that
  -- is a falsifiable test of the WRITE rather than of the clock.
  update custom.external_link set fetched_at = now() - interval '2 hours'
   where organization_id = v_org and record_id = v_stub
  returning fetched_at into v_ts2;
  if custom.external_stub_upsert(v_org, v_src, v_table, 'EXT-1', null, 'Widget A (renamed)') <> v_stub then
    raise exception 'REC-N-10.3 FAIL: a second upsert for the same key created a second Record';
  end if;
  select cached_title, fetched_at, staleness into v_txt2, v_ts, v_interval
    from custom.external_record where organization_id = v_org and record_id = v_stub;
  if v_txt2 <> 'Widget A (renamed)' or v_ts <= v_ts2 then
    raise exception 'REC-N-10.3 FAIL: title % / stamp % did not both move (was %)', v_txt2, v_ts, v_ts2;
  end if;
  if v_interval > interval '1 minute' then
    raise exception 'REC-N-10.3 FAIL: the view reports staleness % after a refresh', v_interval;
  end if;
  raise notice 'REC-N-10.3 PASS  the refresh moved the cached title and the freshness stamp, and created no second Record';

  -- THE SAME DOOR. FAILS IF: the stub is moved out of custom.record — then this count is 1.
  select count(*) into v_n from custom.record where id = any (array[v_stub, v_native]);
  if v_n <> 2 then
    raise exception 'REC-N-10.4 FAIL: the stub and the native record do not both come back from custom.record (% of 2)', v_n;
  end if;
  raise notice 'REC-N-10.4 PASS  the stub and a native record are read through the SAME door (2 of 2)';

  -- ══ 3. VISIBILITY, INHERITED — AND THE NATIVE CONTROL BESIDE IT ═════════════
  -- The grants below are what the switch checklist will issue; here they are transactional
  -- and roll back with everything else. Without them `authenticated` gets 42501 from the
  -- schema and RLS is never reached, which would prove nothing about Visibility.
  grant usage on schema custom to authenticated;
  grant select on custom.record, custom.external_link, custom.external_source, custom.external_record to authenticated;

  execute 'set local role authenticated';
  select count(*) into v_n from custom.external_record where record_id = v_stub;
  if v_n <> 1 then
    raise exception 'REC-N-10.5 FAIL: the creator cannot see their own stub through custom.external_record (% rows)', v_n;
  end if;
  select count(*) into v_n from custom.record where id = any (array[v_stub, v_native]);
  if v_n <> 2 then
    raise exception 'REC-N-10.5 FAIL: as the creator, custom.record returns % of 2 rows', v_n;
  end if;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from custom.external_record where record_id = v_stub;
  if v_n <> 0 then
    raise exception 'REC-N-10.6 FAIL: a signed-in stranger sees the stub (% rows) — Visibility is not being applied', v_n;
  end if;
  select count(*) into v_n from custom.record where id = any (array[v_stub, v_native]);
  if v_n <> 0 then
    raise exception 'REC-N-10.6 FAIL: the stranger sees % of the 2 rows; the stub and the native record must answer the same way', v_n;
  end if;
  execute 'reset role';
  perform set_config('request.jwt.claims', null, true);
  raise notice 'REC-N-10.5 / 10.6 PASS  creator sees stub and native (2 of 2); a stranger sees neither (0 of 2) — one Visibility, inherited';

  -- ══ 4. REC-N-11 — THE WRITE IS REFUSED BY PRIVILEGE WHILE THE OPT-IN IS OFF ══
  begin
    perform custom.external_write_through(v_org, v_stub, jsonb_build_object('title','written from our side'));
    raise exception 'REC-N-11.3 FAIL: the write was ACCEPTED while the opt-in was off';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint;
    if v_state <> '42501' then
      raise exception 'REC-N-11.3 FAIL: refused with % , expected 42501 insufficient_privilege. %', v_state, v_msg;
    end if;
    if v_msg not like '%w1_tier_widgets%' then
      raise exception 'REC-N-11.3 FAIL: the refusal does not name the table: %', v_msg;
    end if;
    if coalesce(v_hint,'') not like '%external_writes_set%' then
      raise exception 'REC-N-11.3 FAIL: the refusal names no remedy. hint: %', coalesce(v_hint,'(none)');
    end if;
    raise notice 'REC-N-11.3 PASS  the write refused 42501 insufficient_privilege, naming the table and the opt-in';
  end;

  begin
    perform custom.external_write_through(v_org, v_native, '{}'::jsonb);
    raise exception 'REC-N-11.4 FAIL: writing through a NATIVE record was accepted';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    if v_state <> '22023' then raise; end if;
    raise notice 'REC-N-11.4 PASS  a native record is not an external stub (22023)';
  end;

  -- THE POSITIVE CONTROL: the SAME call, with the opt-in on, is no longer a privilege refusal.
  -- FAILS IF: the 42501 comes from anything other than writes_enabled.
  if custom.external_writes_set(v_org, v_src, true) is not true then
    raise exception 'REC-N-11.5 FAIL: external_writes_set(true) did not return true';
  end if;
  begin
    perform custom.external_write_through(v_org, v_stub, jsonb_build_object('title','written from our side'));
    raise exception 'REC-N-11.5 FAIL: with the opt-in ON the write claimed to succeed, and no connection exists';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
    if v_state = '42501' then
      raise exception 'REC-N-11.5 FAIL: still a privilege refusal with the opt-in ON — the opt-in is not what refuses';
    end if;
    if v_state <> '0A000' or v_msg not like '%no write connection%' then
      raise exception 'REC-N-11.5 FAIL: expected 0A000 naming the missing connection, got % / %', v_state, v_msg;
    end if;
    raise notice 'REC-N-11.5 PASS  opt-in ON: the privilege refusal is GONE and the honest 0A000 takes its place';
  end;
  if custom.external_writes_set(v_org, v_src, false) is not false then
    raise exception 'REC-N-11.6 FAIL: external_writes_set(false) did not return false';
  end if;
  begin
    perform custom.external_write_through(v_org, v_stub, '{}'::jsonb);
    raise exception 'REC-N-11.6 FAIL: the write was accepted after the opt-in was turned back off';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    if v_state <> '42501' then raise; end if;
    raise notice 'REC-N-11.6 PASS  opt-in off again: 42501 is back — the column is the switch';
  end;

  -- ══ 5. HIS-N-3 — HISTORY RECORDS THE EVENT, NEVER THE FOREIGN ROW ═══════════
  -- The door CANNOT be handed a payload: assert that from the catalogue, not from the body.
  -- FAILS IF: anybody adds a jsonb, record, hstore or text-blob parameter to it.
  -- Asserted from `proargtypes`, by TYPE and not by spelling: the test is that no argument of
  -- the door can carry a document at all, so adding `p_payload jsonb` fails here whatever it
  -- is called.
  select array_agg(t::regtype::text order by ord)
    into v_keys
    from pg_proc p, unnest(p.proargtypes) with ordinality as a(t, ord)
   where p.pronamespace = 'custom'::regnamespace and p.proname = 'external_history_event';
  if v_keys <> array['uuid','uuid','text']::text[] then
    raise exception 'HIS-N-3.1 FAIL: the history door takes (%), and a payload argument is how a foreign row gets in', v_keys::text;
  end if;
  select count(*) into v_n
    from pg_proc p, unnest(p.proargtypes) a(t)
   where p.pronamespace = 'custom'::regnamespace and p.proname = 'external_history_event'
     and (a.t::regtype::text in ('jsonb','json','xml','bytea','hstore','record','text[]','jsonb[]')
          or a.t::regtype::text like '%[]');
  if v_n <> 0 then
    raise exception 'HIS-N-3.1 FAIL: % argument(s) of the history door can carry a document', v_n;
  end if;
  raise notice 'HIS-N-3.1 PASS  the history door takes exactly (uuid, uuid, text) — no argument of it can carry a document';

  v_event := custom.external_history_event(v_org, v_link, 'linked');
  select row_id, entity_type, organization_id, row_data
    into v_txt, v_txt2, v_src2, v_json
    from history.row_versions where id = v_event;
  if v_txt is not null then
    raise exception 'HIS-N-3.2 FAIL: the event carries row_id % — an external link has no row id of ours', v_txt;
  end if;
  if v_txt2 <> 'external_link' or v_src2 <> v_org then
    raise exception 'HIS-N-3.2 FAIL: entity_type % / organization %, expected external_link / %', v_txt2, v_src2, v_org;
  end if;
  select array_agg(k order by k) into v_keys from jsonb_object_keys(v_json) k;
  if v_keys <> array['about','connection_token','external_key','external_table','fetched_at','foreign_row_copied','link_id','stub_record_id','target_ref','tier']::text[] then
    raise exception 'HIS-N-3.2 FAIL: row_data carries %, which is not exactly the ten keys the door composes out of OUR link row', v_keys::text;
  end if;
  if (v_json->>'foreign_row_copied')::boolean is not false or v_json->>'external_key' <> 'EXT-1' then
    raise exception 'HIS-N-3.2 FAIL: row_data is %', v_json::text;
  end if;
  raise notice 'HIS-N-3.2 PASS  event % — row_id NULL, entity_type external_link, ten keys, all of them ours', v_event;

  begin
    perform custom.external_history_event(v_org, v_link, 'stole_a_copy_of_the_remote_row');
    raise exception 'HIS-N-3.3 FAIL: an operation outside the vocabulary was accepted';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    if v_state <> '22023' then raise; end if;
    raise notice 'HIS-N-3.3 PASS  an operation outside {linked, refreshed, unlinked} refused 22023';
  end;

  -- ══ 6. DOOR-N-6 — THE PRIVATE SCHEMA, AND THE ONLY READ OF IT ═══════════════
  if has_schema_privilege('anon','custom_external','USAGE')
     or has_schema_privilege('authenticated','custom_external','USAGE')
     or has_schema_privilege('service_role','custom_external','USAGE')
     or has_schema_privilege('public','custom_external','USAGE') then
    raise exception 'DOOR-N-6.1 FAIL: custom_external is reachable — anon %, authenticated %, service_role %, public %',
      has_schema_privilege('anon','custom_external','USAGE'),
      has_schema_privilege('authenticated','custom_external','USAGE'),
      has_schema_privilege('service_role','custom_external','USAGE'),
      has_schema_privilege('public','custom_external','USAGE');
  end if;
  raise notice 'DOOR-N-6.1 PASS  custom_external: USAGE false for anon, authenticated, service_role and PUBLIC';

  -- Nothing there yet, and the door SAYS so rather than returning an empty set.
  begin
    perform custom.external_rows(v_org, v_src);
    raise exception 'DOOR-N-6.2 FAIL: reading a source with no relation in custom_external returned quietly';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_hint = pg_exception_hint;
    if v_state <> '0A000' then raise; end if;
    if coalesce(v_hint,'') not like '%DOOR-N-6%' then
      raise exception 'DOOR-N-6.2 FAIL: the refusal does not name the law. hint: %', coalesce(v_hint,'(none)');
    end if;
    raise notice 'DOOR-N-6.2 PASS  an absent external relation refuses 0A000 and names DOOR-N-6 and D-14';
  end;

  -- The stand-in for the bought connection: a relation in the private schema carrying two
  -- rows, one of which has a stub and one of which does not. The read door cannot tell a
  -- foreign table from a local one, which is the point — what it enforces is PLACEMENT.
  create table custom_external.w1_tier_widgets (external_key text primary key, title text);
  revoke all on table custom_external.w1_tier_widgets from public, anon, authenticated, service_role;
  insert into custom_external.w1_tier_widgets values ('EXT-1','Widget A remote'), ('EXT-9','Never linked');

  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  select count(*), min(x->>'external_key') into v_n, v_txt
    from custom.external_rows(v_org, v_src) x;
  if v_n <> 1 or v_txt <> 'EXT-1' then
    raise exception 'DOOR-N-6.3 FAIL: the creator reads % row(s) (first key %), expected exactly EXT-1 — EXT-9 has no stub and must not leak', v_n, coalesce(v_txt,'(none)');
  end if;
  raise notice 'DOOR-N-6.3 PASS  the creator reads exactly the one external row whose stub they can see';

  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  select count(*) into v_n from custom.external_rows(v_org, v_src) x;
  if v_n <> 0 then
    raise exception 'DOOR-N-6.4 FAIL: a signed-in stranger reads % external row(s) through a SECURITY DEFINER door', v_n;
  end if;
  perform set_config('request.jwt.claims', null, true);
  raise notice 'DOOR-N-6.4 PASS  a stranger reads 0 — our Visibility is applied inside the definer door';

  -- The exposure guard, on the relation that now exists.
  select count(*) into v_n from custom.external_foreign_table_findings();
  if v_n <> 0 then
    raise exception 'DOOR-N-6.5 FAIL: the guard reports % finding(s) on a correctly placed, ungranted relation', v_n;
  end if;
  grant select on table custom_external.w1_tier_widgets to authenticated;
  select count(*), min(f) into v_n, v_txt from custom.external_foreign_table_findings() f;
  if v_n <> 1 or v_txt not like '%grants SELECT to authenticated%' then
    raise exception 'DOOR-N-6.5 FAIL: granting a private relation to authenticated produced % finding(s): %', v_n, coalesce(v_txt,'(none)');
  end if;
  revoke select on table custom_external.w1_tier_widgets from authenticated;
  select count(*) into v_n from custom.external_foreign_table_findings();
  if v_n <> 0 then
    raise exception 'DOOR-N-6.5 FAIL: the finding survived the revoke (% left)', v_n;
  end if;
  raise notice 'DOOR-N-6.5 PASS  the guard: 0 findings, RED on a client grant naming it, 0 again after the revoke';

  -- The relation's own contract, named rather than leaked as a 42703 from inside a dynamic
  -- string. FAILS IF: the column check is removed — then this raises 42703 and not 0A000.
  v_src2 := custom.external_source_declare(v_org, 'foreign_table', 'rehearsal_pg', 'public', 'w1_tier_no_key', null);
  create table custom_external.w1_tier_no_key (id bigint, title text);
  revoke all on table custom_external.w1_tier_no_key from public, anon, authenticated, service_role;
  begin
    perform custom.external_rows(v_org, v_src2);
    raise exception 'DOOR-N-6.7 FAIL: a private relation with no external_key column was read anyway';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint;
    if v_state <> '0A000' or v_msg not like '%no external_key column%' then
      raise exception 'DOOR-N-6.7 FAIL: expected 0A000 naming the column, got % / %', v_state, v_msg;
    end if;
    if coalesce(v_hint,'') not like '%external_key%' then
      raise exception 'DOOR-N-6.7 FAIL: the refusal names no remedy. hint: %', coalesce(v_hint,'(none)');
    end if;
    raise notice 'DOOR-N-6.7 PASS  a relation that does not meet the join contract refuses 0A000 and names the column';
  end;

  -- And it can see a real FOREIGN table, in the wrong place. No credential and no reachable
  -- remote is needed to prove placement: the server is a name, the mapping is never created,
  -- and nothing is ever selected from it.
  create extension if not exists postgres_fdw;
  create server custom_external_rehearsal foreign data wrapper postgres_fdw options (host 'localhost', dbname 'postgres');
  create schema ironline_fitness_reports;
  create foreign table ironline_fitness_reports.w1_tier_widgets (external_key text)
    server custom_external_rehearsal options (schema_name 'public', table_name 'w1_tier_widgets');
  select count(*), min(f) into v_n, v_txt from custom.external_foreign_table_findings() f;
  if v_n <> 1 or v_txt not like '%outside the private schema custom_external%' then
    raise exception 'DOOR-N-6.6 FAIL: a foreign table outside custom_external produced % finding(s): %', v_n, coalesce(v_txt,'(none)');
  end if;
  raise notice 'DOOR-N-6.6 PASS  a real foreign table outside the private schema is named by the guard';

  raise notice '════ C-8: every clause PASSED. Rolling back. ════';
end
$t$;

rollback;
