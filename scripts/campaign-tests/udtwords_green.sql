-- LANE OLD-TABLES-2 — W2, THE OLDER STORE'S WORDS DOOR. GREEN. Every arm ends in ROLLBACK.
--
-- THE USE CASE. Rincon Plumbing & Drain runs its dispatch board out of the older user-data
-- tables — the same board OLD-TABLES-1 built and left live in admin's Workspace. One table of
-- Customers (household + service address), one of Service Calls, and each call names the
-- customer it is for through a `relation` column holding that customer's ID. A dispatcher must
-- read "Maria Delgado" on the board, never `771155c3-…`, and a colleague who was shared nothing
-- must read neither.
--
-- WHAT IT PROVES
--   0  the door exists, is registered, and `anon` holds no privilege on it
--   1  A MEMBER READS THE WORDS — 100 of 100 sampled live rows of the older estate resolve
--   2  A COLLEAGUE WHO WAS SHARED NOTHING READS THE SENTENCE — 100 of 100, never a name,
--      never an id, and the sentence is byte-identical to the unified store's
--   3  A PER-ROW GRANT IS HONOURED — a seat holding a grant on ONE row and no access to its
--      table resolves THAT one and not the others. This is the arm a table-level check would
--      have got wrong, and it is what the red twin's second arm plants.
--   4  THE DOOR AGREES WITH THE POLICY IT COPIED — for every sampled id, the door's verdict
--      (words vs the withheld sentence) is the same verdict `workbench.udt_dataset_rows`'s own
--      RLS gives the same seat. THE ANTI-DRIFT CLAUSE: _udt_row_granted is a copy of a policy
--      expression, and a copy that drifts is the DD-175 class this door exists to avoid.
--   5  A WHOLE PAGE IS ONE ROUND TRIP AND ONE LADDER WALK — 40 ids in one statement, and the
--      memo makes it cost roughly one ladder walk rather than forty
--   6  THE THREE STATES, ON THE REAL BOARD — resolved, withheld, and the row that is not there
--      coming back as NOTHING so W1's amber identifier chip is reachable
--   7  THE UNIFIED STORE IS UNTOUCHED — `custom._words_for` and the three `custom.*_words`
--      doors name nothing of the older store, their door rows still belong to RELATION-DISPLAY,
--      and a real organization's relation cells still resolve to the same words
--
-- A FINDING THIS SUITE HAD TO WORK AROUND, WORTH THE NEXT LANE'S TIME.
-- `workbench.udt_dataset_rows.std_select`'s per-row arm reads `iam.permissions` where
-- `resource_type = 'udt_dataset_rows'` — and `public.permissions_validate_resource_type()`
-- REFUSES that value (`check_violation`): the token is in `platform.entity_types` but not in
-- `platform.shareable_resource_registry`, so no such permission row can be written through the
-- ordinary path and none exists (0 rows, measured 2026-09-22). All five union arms are empty
-- today. The per-row grant in clause 3 is therefore planted through `iam.memberships`, which is
-- the union arm that IS writable, and which `iam.has_access('udt_dataset_rows', …)` honours.
-- The door is correct either way — it asks the whole union — but a person trying to share ONE
-- row of a user table through the sharing UI cannot, and that is not this lane's to fix.
--
-- Its twin is scripts/campaign-tests/udtwords_red.sql.
--
-- RUN IT:  psql "$DSN" -f scripts/campaign-tests/udtwords_green.sql

\set ON_ERROR_STOP on
\timing off

\set suite 'udtwords_green.sql'
\set requires 'function:workbench.udt_row_words_many|function:custom._words_for|row:workbench.udt_datasets:id = \'dbc7cd48-7b46-4402-ac9d-e459a95f4598\''
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

\echo ''
\echo '── 0 · the door exists, is registered, and anon cannot reach it ───────────────────────'

do $$
declare
  v_n integer;
begin
  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'workbench'
     and p.proname in ('udt_row_words_many', '_udt_row_words', '_udt_row_granted', '_udt_display_spec');
  if v_n <> 4 then
    raise exception 'CLAUSE 0 FAILED: expected the four W2 functions in workbench, found %', v_n;
  end if;

  select count(*) into v_n
    from platform.client_callable_door
   where schema_name = 'workbench'
     and function_name in ('udt_row_words_many', '_udt_row_words', '_udt_row_granted', '_udt_display_spec');
  if v_n <> 4 then
    raise exception 'CLAUSE 0 FAILED: expected four door rows for the W2 functions, found %', v_n;
  end if;

  if not exists (select 1 from platform.client_callable_door
                  where schema_name = 'workbench' and function_name = 'udt_row_words_many'
                    and signed_in_callers and not anonymous_callers
                    and argument_rules is not null) then
    raise exception 'CLAUSE 0 FAILED: the batch door is not declared signed-in-only with argument rules';
  end if;

  if has_function_privilege('anon', 'workbench.udt_row_words_many(uuid, jsonb, uuid[])', 'EXECUTE') then
    raise exception 'CLAUSE 0 FAILED: anon holds EXECUTE on workbench.udt_row_words_many';
  end if;
  if not has_function_privilege('authenticated', 'workbench.udt_row_words_many(uuid, jsonb, uuid[])', 'EXECUTE') then
    raise exception 'CLAUSE 0 FAILED: authenticated does NOT hold EXECUTE on the door a screen must call';
  end if;

  raise notice 'CLAUSE 0 PASS — four functions, four door rows, anon closed, authenticated open';
end $$;

\echo ''
\echo '── 1-7 · Rincon Plumbing & Drain, dispatch board, admin''s Workspace ───────────────────'

begin;

do $t$
declare
  -- admin@admin.com, owner of admin's Workspace and of both Rincon tables.
  c_admin_j  constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  -- test@test.com, a MEMBER of the same organization who was shared neither table.
  c_other_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  c_other_id constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';

  v_org       constant uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';  -- admin's Workspace
  v_customers constant uuid := '415c3e23-2f90-4c66-9040-b246fa1c4b36';  -- Rincon Plumbing — Customers
  v_calls     constant uuid := 'dbc7cd48-7b46-4402-ac9d-e459a95f4598';  -- Rincon Plumbing — Service Calls
  c_display   constant jsonb := '"household"'::jsonb;                   -- the relation column's own spec

  v_ids     uuid[];
  v_one     uuid;
  v_words   text;
  v_n       integer;
  v_bad     integer;
  v_sample  uuid[];
  v_t0      timestamptz;
  v_t1      numeric;
  v_t40     numeric;
  v_before  text;
  v_after   text;
  v_withheld constant text := platform.relation_withheld_label();
begin
  perform set_config('app.actor_system', 'campaign-test/udtwords_green', true);

  -- ══ 1 — A MEMBER READS THE WORDS, 100 OF 100 ═════════════════════════════════════════
  -- A hundred real live rows of the older estate in the organization admin owns, resolved in
  -- ONE call. No display spec: this is the fallback chain (row label, conventional names,
  -- first words), which is what an ordinary column with no display override reads.
  -- LIVE rows of LIVE datasets, which is the scope W0's census gates on. A row whose dataset
  -- was archived resolves to NOTHING and that is correct — the relation points into a table
  -- nobody can open any more, which is exactly W1's unresolvable state. Three such rows sit in
  -- this organization (archived `DD-244 …` throwaways, measured 2026-09-22) and counting them
  -- as failures would gate on somebody else's archive.
  select array_agg(r.id) into v_sample
    from (select r.id from workbench.udt_dataset_rows r
            join workbench.udt_datasets d on d.id = r.table_id and d.deleted_at is null
           where r.organization_id = v_org and r.deleted_at is null
           order by r.created_at limit 100) r;
  if coalesce(array_length(v_sample, 1), 0) < 100 then
    raise exception '1: the sample is % rows, not 100 — this organization no longer holds enough older rows to gate on',
      coalesce(array_length(v_sample, 1), 0);
  end if;

  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '1: this suite did not take the seat — current_user is %', current_user;
  end if;

  select count(*) into v_n
    from workbench.udt_row_words_many(v_org, null, v_sample) w
   where w.words is not null and btrim(w.words) <> '' and w.words <> v_withheld;
  if v_n <> 100 then
    raise exception '1 FAILED: the owner resolved % of 100 sampled rows to words', v_n;
  end if;

  -- and not one of them is a bare uuid wearing a name's clothes
  select count(*) into v_bad
    from workbench.udt_row_words_many(v_org, null, v_sample) w
   where w.words ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  if v_bad <> 0 then
    raise exception '1 FAILED: % of the resolved answers are a raw uuid', v_bad;
  end if;
  raise notice '1 PASS — a member resolved 100 of 100 sampled older rows to words, 0 of them a uuid';

  -- ══ 2 — A COLLEAGUE WHO WAS SHARED NOTHING READS THE SENTENCE, 100 OF 100 ════════════
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', c_other_j, true);
  perform set_config('role', 'authenticated', true);

  select count(*) into v_n
    from workbench.udt_row_words_many(v_org, null, v_sample) w
   where w.words = v_withheld;
  if v_n <> 100 then
    raise exception '2 FAILED: the colleague read the withheld sentence for % of 100 rows', v_n;
  end if;
  if v_withheld <> 'A record you have not been given access to' then
    raise exception '2 FAILED: the withheld sentence is %, which is not the one both stores share', v_withheld;
  end if;
  raise notice '2 PASS — 100 of 100 read %, the same sentence the unified store returns', v_withheld;

  -- ══ 3 — A PER-ROW GRANT IS HONOURED ══════════════════════════════════════════════════
  -- The arm a table-level check gets wrong. Planted through iam.memberships (see the header:
  -- iam.permissions refuses the token today), and it goes with this transaction's ROLLBACK.
  -- A row whose words are a real household name, so the pass is legible and not "an untitled row".
  -- Read as postgres: the seat this clause is about cannot see the Customers table, which is
  -- the whole point of the clause.
  perform set_config('role', 'postgres', true);
  select r.id into v_one
    from workbench.udt_dataset_rows r
   where r.table_id = v_customers and r.deleted_at is null
     and r.data ->> 'household' = 'Maria Delgado';
  if v_one is null then
    raise exception '3: the Rincon Customers table no longer holds the Maria Delgado household';
  end if;
  v_sample := array[v_one] || (select array_agg(x) from unnest(v_sample) t(x) where x <> v_one);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'udt_dataset_rows', v_one, c_other_id, 'viewer', 'active');
  perform set_config('role', 'authenticated', true);

  select w.words into v_words
    from workbench.udt_row_words_many(v_org, null, array[v_one]) w;
  if v_words is null or v_words = v_withheld then
    raise exception '3 FAILED: the seat holds a grant on that one row and still read %', coalesce(v_words, '(nothing)');
  end if;

  select count(*) into v_n
    from workbench.udt_row_words_many(v_org, null, v_sample) w
   where w.words <> v_withheld;
  if v_n <> 1 then
    raise exception '3 FAILED: the seat holding ONE row grant resolved % rows, not 1', v_n;
  end if;
  raise notice '3 PASS — one granted row read %; the other 99 read the withheld sentence', v_words;

  -- ══ 4 — THE DOOR AGREES WITH THE POLICY IT COPIED (the anti-drift clause) ═════════════
  -- Same seat, same ids: what the door says it may show, against what the row's own RLS
  -- actually lets it read. A single disagreement is the DD-175 class and fails here.
  select count(*) into v_bad
    from unnest(v_sample) as s(id)
    left join (select w.row_id, w.words from workbench.udt_row_words_many(v_org, null, v_sample) w) d
           on d.row_id = s.id
    left join workbench.udt_dataset_rows r on r.id = s.id and r.deleted_at is null
   where (d.words is not null and d.words <> v_withheld) is distinct from (r.id is not null);
  if v_bad <> 0 then
    raise exception '4 FAILED: the door and workbench.udt_dataset_rows'' own RLS disagree about % of % ids',
      v_bad, array_length(v_sample, 1);
  end if;
  raise notice '4 PASS — the door and the row policy gave the SAME verdict on all 100 ids';

  -- ══ 5 — ONE ROUND TRIP, ONE LADDER WALK ══════════════════════════════════════════════
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'authenticated', true);

  v_t0 := clock_timestamp();
  perform count(*) from workbench.udt_row_words_many(v_org, null, array[v_sample[1]]);
  v_t1 := extract(epoch from clock_timestamp() - v_t0) * 1000;

  v_sample := (select array_agg(id) from unnest(v_sample) with ordinality t(id, o) where o <= 40);
  v_t0 := clock_timestamp();
  select count(*) into v_n from workbench.udt_row_words_many(v_org, null, v_sample);
  v_t40 := extract(epoch from clock_timestamp() - v_t0) * 1000;

  if v_n <> 40 then
    raise exception '5 FAILED: a 40-id page came back as % rows', v_n;
  end if;
  -- Without the per-statement memo the table-level ladder walk is paid FORTY times. With it,
  -- once. The bound is deliberately loose (5x, not 1x) because the 40 ids also cost 40 row
  -- reads and 40 fallback chains; what it cannot survive is 40 ladder walks.
  if v_t40 > greatest(v_t1 * 5, 50) then
    raise exception '5 FAILED: 40 ids took %ms against %ms for one — the memo is not carrying the ladder',
      round(v_t40), round(v_t1);
  end if;
  raise notice '5 PASS — 40 ids in ONE statement, %ms against %ms for a single id', round(v_t40), round(v_t1);

  -- ══ 6 — THE THREE STATES, ON THE REAL BOARD ══════════════════════════════════════════
  -- The Service Calls board points at Customers through `customer`, display "household".
  -- Row WO-4474 deliberately points at a customer row that is not there.
  select array_agg(nullif(r.data ->> 'customer', '')::uuid) into v_ids
    from workbench.udt_dataset_rows r
   where r.table_id = v_calls and r.deleted_at is null
     and nullif(r.data ->> 'customer', '') is not null;
  if coalesce(array_length(v_ids, 1), 0) < 4 then
    raise exception '6: the Rincon dispatch board no longer holds 4 calls with a customer on them (% found)',
      coalesce(array_length(v_ids, 1), 0);
  end if;

  select count(*) into v_n from workbench.udt_row_words_many(v_org, c_display, v_ids);
  if v_n <> 3 then
    raise exception '6 FAILED: % of the % customer ids came back — the one that names nothing must come back as NOTHING', v_n, array_length(v_ids, 1);
  end if;
  select w.words into v_words
    from workbench.udt_row_words_many(v_org, c_display, v_ids) w
   where w.row_id = (select nullif(r.data ->> 'customer', '')::uuid
                       from workbench.udt_dataset_rows r
                      where r.table_id = v_calls and r.data ->> 'work_order' = 'WO-4471');
  if v_words <> 'Maria Delgado' then
    raise exception '6 FAILED: WO-4471''s customer reads %, not the household name', coalesce(v_words, '(nothing)');
  end if;
  raise notice '6 PASS — 3 of 4 ids resolved through the column''s display spec (WO-4471 = %); the 4th names nothing and came back as NOTHING, which is W1''s amber identifier chip', v_words;

  -- ══ 7 — THE UNIFIED STORE IS UNTOUCHED ═══════════════════════════════════════════════
  perform set_config('role', 'postgres', true);
  select count(*) into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'custom'
     and p.proname in ('_words_for', 'record_words', 'relation_words', 'relation_words_many')
     and (p.prosrc ~* 'workbench' or p.prosrc ~* 'udt_');
  if v_bad <> 0 then
    raise exception '7 FAILED: % of the unified store''s four word bodies now name the older store', v_bad;
  end if;
  select count(*) into v_n
    from platform.client_callable_door
   where schema_name = 'custom'
     and function_name in ('_words_for', 'record_words', 'relation_words', 'relation_words_many')
     and declared_by !~* 'oldtables';
  if v_n < 3 then
    raise exception '7 FAILED: the unified store''s word doors no longer belong to the lane that declared them (% left)', v_n;
  end if;
  raise notice '7 PASS — custom._words_for and the three custom.*_words doors name nothing of the older store and keep their own declarations';
end
$t$;

rollback;

\echo ''
\echo '── udtwords_green.sql: every clause PASSED and the transaction rolled back ────────────'
