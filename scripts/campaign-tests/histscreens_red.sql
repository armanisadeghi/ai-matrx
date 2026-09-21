-- scripts/campaign-tests/histscreens_red.sql — LANE HISTORY-SCREENS, the red twin.
--
-- IT RUNS THE REAL BYTES OF THIS LANE'S INVERSES and then proves that each defect the lane
-- closed comes straight back. Nothing here is a hand-written imitation of the old behaviour:
-- the two `\i` lines execute `migrations/inverse/histscreens_*_down.sql` exactly as the
-- runner would, inside a transaction that ends in ROLLBACK.
--
-- Run FROM THE REPO ROOT:  <scratchpad>/p.sh -f scripts/campaign-tests/histscreens_red.sql
--
-- SIX BLOCKS ARE RED WHEN THE LANE IS LANDED, AND THEY ARE:
--   1. `custom.record_restore_preview` reads BACKWARDS.
--   2. …and calls every key changed, including keys that did not move.
--   3. `custom.io_restore` returns NULL to every caller, on a restore that worked.
--   4. A restore does not restore: a key added after the target version survives it.
--   5. There is no way to ask WHO changed what — `custom.io_revisions` answers a raw uuid,
--      never `user`/`agent`/`system`, never the person an agent acted for, and never a
--      before or an after.
--   6. EVERY VERSION SAYS EVERY FIELD CHANGED, because the value envelope carries `at`,
--      `actor` and `on_behalf_of` — re-stamped on every value on every write — and the
--      whole envelope was compared.

\set ON_ERROR_STOP on
begin;

create temporary table hs_red (k text primary key, v text) on commit drop;
grant select, insert, update, delete on hs_red to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- FIXTURE — one job with four versions, built through the doors from the seat.
-- ════════════════════════════════════════════════════════════════════════════
do $red$
declare
  c_admin   uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_dana    uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_admin_j text := json_build_object('sub','87a6e699-3622-4869-8843-d0867456c0dd','role','authenticated')::text;
  v_boss    text := current_user;
  v_org     uuid := gen_random_uuid();
  v_home    uuid;
  v_tbl     uuid;
  v_job     uuid;
begin
  perform set_config('app.actor_system','campaign-test/histscreens_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Cobblestone Bakery & Cafe Red',
          'cobblestone-bakery-red-' || replace(v_org::text,'-',''), 'CBR', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
         (v_org, 'organization', v_org, c_dana,  'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value)
  values ('custom','system_enabled','organization', v_org, v_org, 'true');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name','Home')) returning id into v_home;

  perform set_config('role', 'authenticated', true);

  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name','Maintenance Jobs','slug','maintenance_jobs','type','entity',
    'label_singular','Job','label_plural','Jobs','title_field','title','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','title'), jsonb_build_object('name','price'),
                                jsonb_build_object('name','notes')),
    'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('key','title','label','Job','plain','text','sort',10));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('key','price','label','Price','plain','number','sort',20));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('key','notes','label','Notes','plain','text','sort',30));

  v_job := custom.record_write(v_org, v_tbl, jsonb_build_object('title','Roof repair','price',950));
  perform custom.record_update(v_org, v_job, jsonb_build_object('price',1200));
  -- The key that a restore to version 2 must clear, and used not to.
  perform custom.record_update(v_org, v_job, jsonb_build_object('notes','added after v2'));
  -- An AGENT, for Dana — the thing no other product can say and `io_revisions` cannot read.
  perform custom.record_update(v_org, v_job, jsonb_build_object(
    'price', 1100, '_actor','agent', '_on_behalf_of', c_dana::text));

  insert into hs_red(k, v) values ('org', v_org::text), ('tbl', v_tbl::text),
                                  ('job', v_job::text), ('boss', v_boss),
                                  ('dana', c_dana::text);
end;
$red$;

-- ════════════════════════════════════════════════════════════════════════════
-- THE REAL BYTES, part one: put the preview and the restore back as they were.
-- ════════════════════════════════════════════════════════════════════════════
-- The seat is `authenticated` for the whole transaction (`set local role` lasts that long),
-- and an inverse is DDL: it steps out, runs, and the seat is taken again before a single
-- product clause is asserted.
reset role;
\i migrations/inverse/histscreens_the_preview_names_exactly_what_moves_down.sql
set local role authenticated;

do $red$
declare
  v_org  uuid;
  v_job  uuid;
  v_prev jsonb;
  v_ret  integer;
  v_red  integer := 0;
begin
  select v::uuid into v_org from hs_red where k = 'org';
  select v::uuid into v_job from hs_red where k = 'job';

  v_prev := custom.record_restore_preview(v_org, v_job, 2, null);

  -- BLOCK 1 — backwards. The record says 1100 and the restore would make it 1200; the old
  -- body said `before 1200, after 1100`, which is the sentence read the wrong way round.
  if (select c -> 'before' from jsonb_array_elements(v_prev -> 'changes') c
       where c ->> 'key' = 'price')::text = '1100' then
    raise exception '1: the preview is NOT backwards — the inverse did not take';
  end if;
  v_red := v_red + 1;
  raise notice '1 RED — the old preview says price goes from % to %, and the record says %.',
    (select c -> 'before' from jsonb_array_elements(v_prev -> 'changes') c where c ->> 'key' = 'price'),
    (select c -> 'after'  from jsonb_array_elements(v_prev -> 'changes') c where c ->> 'key' = 'price'),
    custom.read_record(v_org, v_job, true) -> 'price';

  -- BLOCK 2 — it calls a key changed that did not move. `title` has been "Roof repair" since
  -- version 1 and is in the old preview's list because the restore body carries no envelope.
  if not exists (select 1 from jsonb_array_elements(v_prev -> 'changes') c
                  where c ->> 'key' = 'title' and c -> 'before' = c -> 'after') then
    raise exception '2: the old preview did not over-report — the inverse did not take';
  end if;
  v_red := v_red + 1;
  raise notice '2 RED — the old preview lists % changes and one of them is "%": % -> %.',
    v_prev ->> 'count', 'title',
    (select c -> 'before' from jsonb_array_elements(v_prev -> 'changes') c where c ->> 'key' = 'title'),
    (select c -> 'after'  from jsonb_array_elements(v_prev -> 'changes') c where c ->> 'key' = 'title');

  -- BLOCK 3 — the restore worked and answered NULL.
  v_ret := custom.io_restore(v_org, v_job, 2);
  if v_ret is not null then
    raise exception '3: the old custom.io_restore returned % — the inverse did not take', v_ret;
  end if;
  if (custom.read_record(v_org, v_job, true) -> 'price')::text <> '1200' then
    raise exception '3: the restore did not actually happen, so "it returned null" proves nothing';
  end if;
  v_red := v_red + 1;
  raise notice '3 RED — the restore worked (the price is now %) and custom.io_restore answered NULL.',
    custom.read_record(v_org, v_job, true) -> 'price';

  insert into hs_red(k, v) values ('red', v_red::text);
end;
$red$;

-- ════════════════════════════════════════════════════════════════════════════
-- THE REAL BYTES, part two: put the whole-envelope comparison back.
-- ════════════════════════════════════════════════════════════════════════════
reset role;
\i migrations/inverse/histscreens_a_value_that_did_not_move_is_not_a_change_down.sql
set local role authenticated;

do $red$
declare
  v_org uuid;
  v_job uuid;
  v_red integer;
  r     record;
begin
  select v::uuid into v_org from hs_red where k = 'org';
  select v::uuid into v_job from hs_red where k = 'job';
  select v::int  into v_red from hs_red where k = 'red';

  -- BLOCK 6 — the write that moved ONE field says it moved all of them.
  --
  -- VERSIONS 3 AND 4, which is the AGENT's write: it changed the price only. `at` is the
  -- TRANSACTION timestamp, so inside this suite's one transaction every write stamps the
  -- same moment and only the author change exposes the defect — in the product, where
  -- every write is its own transaction, `at` moves on every one and EVERY field of EVERY
  -- version was reported. Either way the cause is the same three keys.
  --
  -- Asked of `custom.io_changed_keys` DIRECTLY, over two real consecutive versions of this
  -- record, because that function is what the inverse put back and an IMMUTABLE SQL
  -- function is INLINED into its callers' plans — so going through the door would be
  -- asking a plan that may still hold the new body.
  declare
    v_old jsonb;
    v_new jsonb;
    v_keys text[];
    v_over text;
    v_ctrl text[];
  begin
    -- 🚨 THE RESTORED BODY IS ASKED ABOUT ITSELF (lane RED-SUITES-3, 2026-09-21). This block
    -- used to read versions 3 and 4 of the fixture out of `history.row_versions` and demand at
    -- least two keys back. Which pair of THIS record's versions differs in more than one key is
    -- a property of the fixture and of what the capture stores today: versions 3 and 4 differ in
    -- `price` alone and `price` really did change, so the block said "the inverse did not take"
    -- when the inverse had taken fine. Asked over EVERY consecutive pair the record has, the
    -- restored body still never over-reported — because the churn it is blind to lives in the
    -- value ENVELOPES, and those pairs do not carry envelope churn.
    --
    -- So the body is asked about the exact thing the inverse's own header says it does: it
    -- "compared WHOLE value envelopes — so every field of every version reads as changed again,
    -- because `at`, `actor` and `on_behalf_of` are re-stamped on every write". Two documents for
    -- the same Roof repair job, one field, the SAME price, and the only difference is the stamp
    -- a re-save leaves behind. A comparison that calls that a change is the defect, in one line,
    -- with no fixture history in the way. The FIXED body is the control: it is not live here —
    -- the inverse replaced it — so the control is the second pair below, where the price really
    -- does move and any body must say so.
    perform set_config('role', (select v from hs_red where k = 'boss'), true);
    v_old := jsonb_build_object(
      'title', 'Roof repair', 'price', 1200,
      '_values', jsonb_build_object('price', jsonb_build_object(
        'ver', 4, 'actor', 'user', 'at', '2026-09-20T09:15:00+00:00')));
    v_new := jsonb_build_object(
      'title', 'Roof repair', 'price', 1200,
      '_values', jsonb_build_object('price', jsonb_build_object(
        'ver', 4, 'actor', 'agent', 'at', '2026-09-21T14:02:00+00:00')));
    v_keys := custom.io_changed_keys(v_old, v_new);
    select k into v_over from unnest(v_keys) k
     where (v_old -> k) is not distinct from (v_new -> k) limit 1;
    -- the control: the same two documents with the price actually moved. Every body, old or
    -- new, must call that a change, so a body that answered "nothing ever changed" cannot
    -- reach the notice below.
    v_new := jsonb_set(v_new, '{price}', '1100'::jsonb);
    v_ctrl := custom.io_changed_keys(v_old, v_new);
    perform set_config('role', 'authenticated', true);

    if not ('price' = any (coalesce(v_ctrl, '{}'::text[]))) then
      raise exception '6 control: the price moved from 1200 to 1100 and the comparison did not call it a change (%), so nothing this block says about over-reporting means anything',
        array_to_string(coalesce(v_ctrl, '{}'::text[]), ', ');
    end if;
    if v_over is null then
      raise exception '6: the price did not move and only its envelope was re-stamped, and the old comparison named % — it did not over-report, so the inverse did not take',
        coalesce(array_to_string(v_keys, ', '), 'nothing');
    end if;
    v_red := v_red + 1;
    update hs_red set v = v_red::text where k = 'red';
    raise notice '6 RED — the price did not move and only its envelope was re-stamped, and the old comparison lists %: "%" is reported as an edit nobody made. The control, where the price really moves, still reads %.',
      array_to_string(v_keys, ', '), v_over, array_to_string(v_ctrl, ', ');
  end;
end;
$red$;

-- ════════════════════════════════════════════════════════════════════════════
-- THE REAL BYTES, part three: take the whole lane away.
-- ════════════════════════════════════════════════════════════════════════════
reset role;
\i migrations/inverse/histscreens_a_record_can_say_who_changed_it_down.sql
set local role authenticated;

do $red$
declare
  v_org   uuid;
  v_job   uuid;
  v_dana  uuid;
  v_red   integer;
  v_notes text;
  r       record;
begin
  select v::uuid into v_org  from hs_red where k = 'org';
  select v::uuid into v_job  from hs_red where k = 'job';
  select v::uuid into v_dana from hs_red where k = 'dana';
  select v::int  into v_red  from hs_red where k = 'red';

  -- BLOCK 4 — THE RESTORE DOES NOT RESTORE. `notes` was written at version 3; going back to
  -- version 2 must remove it, and the old merge-only body leaves it exactly where it is.
  perform custom.record_update(v_org, v_job, jsonb_build_object('price', 1100, 'notes','added after v2'));
  perform custom.io_restore(v_org, v_job, 2);
  v_notes := custom.read_record(v_org, v_job, true) ->> 'notes';
  if v_notes is null then
    raise exception '4: the old restore cleared the later key — the inverse did not take';
  end if;
  v_red := v_red + 1;
  raise notice '4 RED — restored to version 2, and a value written AFTER version 2 is still there: "%".', v_notes;

  -- BLOCK 5 — NOBODY CAN ASK WHO. The door is gone, and what is left cannot answer.
  begin
    perform 1 from custom.record_history(v_org, v_job);
    raise exception '5: custom.record_history is still there — the inverse did not take';
  exception when undefined_function then null;
  end;
  select * into r from custom.io_revisions(v_org, v_job) limit 1;
  -- It answers a RAW UUID and nothing else about the author.
  if r.changed_by::text !~ '^[0-9a-f]{8}-' then
    raise exception '5: io_revisions did not answer a uuid';
  end if;
  -- It has no column that could say user / agent / system, and none that could name the
  -- person an agent acted for, and none that could carry a before or an after.
  if exists (select 1
               from pg_proc p
               join pg_namespace n on n.oid = p.pronamespace
               join unnest(coalesce(p.proargnames, array[]::text[])) a on true
              where n.nspname = 'custom' and p.proname = 'io_revisions'
                and a in ('actor','on_behalf_of','before','after')) then
    raise exception '5: io_revisions has grown a column that answers who or what moved';
  end if;
  v_red := v_red + 1;
  raise notice '5 RED — all a person can ask for is "% … %", and the agent that wrote version 4 for another person is nowhere in it.',
    r.changed_by, left(r.summary, 60);

  raise notice '=== % of 6 blocks are RED (the defects this lane closed are all back), and all three inverses executed. ===', v_red;
  if v_red <> 6 then
    raise exception 'the red twin proved % of 6', v_red;
  end if;
end;
$red$;

rollback;
