-- LANE STAGE-RULES — THE RED TWIN of scripts/campaign-tests/stagerules_green.sql.
--
-- IT RUNS THE REAL BYTES of this lane's inverse —
-- `migrations/inverse/stagerules_a_gate_says_what_it_does_when_it_says_no_down.sql` — and
-- then asks the store, from the same seat, for each thing the lane built. Every block must
-- come back RED. A block that comes back green means the forward file did not add what it
-- says it added, or the inverse does not actually take it away.
--
-- SAME USE CASE, SAME DATA as the green suite: the Birchwood Avenue renovation, its Guest
-- Bathroom, Hearthstone Flooring's $1,800 bid and their $7,200 re-quote after the subfloor
-- turned out to be soft. Nobody in it is real.
--
-- RUN IT:
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the main database DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/stagerules_red.sql
--
-- IT ENDS IN ROLLBACK and leaves the main database exactly as it found it. The last line of
-- output proves that: it re-asks the store for the same things OUTSIDE the transaction.

\set ON_ERROR_STOP on
\timing off

begin;

-- ── THE INVERSE, AS IT ACTUALLY IS. Not a description of it, not a re-derivation: the file.
\i migrations/inverse/stagerules_a_gate_says_what_it_does_when_it_says_no_down.sql

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org     uuid := gen_random_uuid();
  v_boss    text := current_user;
  v_home    uuid;
  v_tbl     uuid;
  v_f_room  uuid;
  v_f_co    uuid;
  v_f_amt   uuid;
  v_pipe    jsonb;
  v_requote uuid;
  v_hearth  uuid;
  v_red     integer := 0;
  v_caught  text;
  v_move    jsonb;
begin
  if (select system_identifier from pg_control_system()) <> 7642734024280108049 then
    raise exception 'stagerules_red.sql runs on the MAIN database only, and this is %',
      (select system_identifier from pg_control_system());
  end if;

  perform set_config('app.actor_system', 'campaign-test/stagerules_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Birchwood Ave Renovation ' || substr(v_org::text, 1, 8),
          'birchwood-red-' || substr(v_org::text, 1, 8), 'BAR', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'stagerules_red');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Birchwood Avenue')) returning id into v_home;

  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'this twin did not take the seat — current_user is %', current_user;
  end if;

  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name','Quote','slug','quote_red_' || substr(v_org::text, 1, 8),'type','entity',
    'label_singular','Quote','label_plural','Quotes','title_field','room','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','room'),
                                jsonb_build_object('name','contractor'),
                                jsonb_build_object('name','quote_amount')),
    'parent_id', v_home::text));
  v_f_room := custom.field_declare(v_org, v_tbl, jsonb_build_object('key','room','label','Room','plain','text','sort',10));
  v_f_co   := custom.field_declare(v_org, v_tbl, jsonb_build_object('key','contractor','label','Contractor','plain','text','sort',20));
  v_f_amt  := custom.field_declare(v_org, v_tbl, jsonb_build_object('key','quote_amount','label','Quote amount','plain','number','sort',30));

  -- ── RED 1 — "A SECOND QUOTE FROM A DIFFERENT CONTRACTOR" CANNOT BE ASKED AT ALL. ──
  begin
    perform custom.rule_declare(v_org, jsonb_build_object(
      'name','A second quote before a big one is approved',
      'message','Nothing over $5,000 moves to Approved without a second quote from a different contractor.',
      'kind','predicate','uses', jsonb_build_array('validate'),
      'scope_table_id', v_tbl, 'applies_to_types','[]'::jsonb,
      'expr', jsonb_build_object('op','gte','args', jsonb_build_array(
                jsonb_build_object('op','sibling_count','same', jsonb_build_array(v_f_room),
                                   'differs', jsonb_build_array(v_f_co)),
                jsonb_build_object('const', 1)))), null);
    raise exception 'RED 1 CAME BACK GREEN — the store knows sibling_count, so the inverse did not take it away';
  exception when check_violation then
    v_caught := sqlerrm; v_red := v_red + 1;
    raise notice 'RED 1 — the house rule is unwritable: "%"', v_caught;
  end;

  -- ── RED 2 — A GATE CAN CLAIM ANY BEHAVIOUR AT ALL, AND NOBODY CHECKS. ─────────────
  perform custom.rule_declare(v_org, jsonb_build_object(
    'name','ZZ a gate with an answer nobody has','message','no','kind','predicate',
    'uses', jsonb_build_array('validate'), 'scope_table_id', v_tbl,
    'applies_to_types','[]'::jsonb, 'on_fail','escalate_to_legal',
    'expr', jsonb_build_object('op','present','args', jsonb_build_array(
              jsonb_build_object('field', v_f_co)))), null);
  v_red := v_red + 1;
  raise notice 'RED 2 — a rule was saved promising to "escalate_to_legal" when it stops somebody, and nothing in the store can do that.';

  -- ── RED 3 — THERE IS NO THIRD ANSWER. A gate refuses or it does nothing. ─────────
  begin
    perform custom.stage_rule_on_fail_kinds();
    raise exception 'RED 3 CAME BACK GREEN — the closed list of behaviours still exists';
  exception when undefined_function then
    v_red := v_red + 1;
    raise notice 'RED 3 — there is no list of what a gate does when it says no, so "hand it to somebody who can approve it" is not an answer the store has.';
  end;

  -- ── RED 4 — AN ORGANIZATION HAS NO SAY. ──────────────────────────────────────────
  begin
    perform custom.stage_rule_enforcement(v_org);
    raise exception 'RED 4 CAME BACK GREEN — the enforcement knob still has a reader';
  exception when undefined_function then
    v_red := v_red + 1;
    raise notice 'RED 4 — enforcement is hard-coded: an organization cannot ask to be warned instead of stopped.';
  end;

  -- ── RED 5 — A CARD CANNOT SAY IT IS WAITING. ─────────────────────────────────────
  begin
    perform custom.record_stage_pending(v_org, v_home);
    raise exception 'RED 5 CAME BACK GREEN — the board can still ask what is waiting on a card';
  exception when undefined_function then
    v_red := v_red + 1;
    raise notice 'RED 5 — nothing can ask what approval is waiting on a card, so a card that did not move looks like a card nobody dragged.';
  end;

  -- ── RED 6 — THE MOVE ANSWERS A BARE NUMBER, so a caller cannot tell "moved" from ──
  -- "waiting for somebody" at all.
  v_pipe := custom.pipeline_declare(v_org, v_tbl, jsonb_build_object(
    'stage_field', jsonb_build_object('key','quote_stage','label','Quote stage',
       'options', jsonb_build_array('Requested','Received','Approved','Paid')),
    'transitions', jsonb_build_array(
       jsonb_build_object('from','Requested','to','Received'),
       jsonb_build_object('from','Received','to','Approved'))));
  v_requote := custom.record_write(v_org, v_tbl, jsonb_build_object(
    'room','Guest Bathroom','contractor','Hearthstone Flooring','quote_amount',7200,'quote_stage','Received'));
  v_move := custom.pipeline_move(v_org, v_requote, 'Approved');
  if jsonb_typeof(v_move) = 'object' then
    raise exception 'RED 6 CAME BACK GREEN — custom.pipeline_move already answers an object: %', v_move;
  end if;
  v_red := v_red + 1;
  raise notice 'RED 6 — the move answers %, a bare version number, so nothing can tell a move that happened from one that is waiting.',
    v_move;

  -- ── RED 7 — AND THE $7,200 SINGLE BID IS APPROVED, WHICH IS THE WHOLE POINT. ──────
  if lower(custom.read_record(v_org, v_requote, true) #>> '{quote_stage}') <> 'approved' then
    raise exception 'RED 7 CAME BACK GREEN — something stopped the single bid, and nothing here can';
  end if;
  v_red := v_red + 1;
  raise notice 'RED 7 — a $7,200 job was approved on one quote from one company, and the store had no way to object.';

  perform set_config('role', v_boss, true);
  if v_red <> 7 then
    raise exception 'this twin was supposed to be red in 7 blocks and was red in %', v_red;
  end if;
  raise notice '% BLOCKS RED — every one of them is what the Birchwood homeowner lived with before this lane.', v_red;
end;
$t$;

rollback;

-- ── ROLLBACK VERIFIED. Outside the transaction, the store is itself again.
do $v$
begin
  if (select count(*) from custom.rule_node_kinds() n where n.node = 'sibling_count') <> 1 then
    raise exception 'ROLLBACK DID NOT VERIFY — sibling_count is missing from the live vocabulary';
  end if;
  if (select count(*) from custom.stage_rule_on_fail_kinds()) <> 2 then
    raise exception 'ROLLBACK DID NOT VERIFY — the on_fail list is not back';
  end if;
  if custom.stage_rule_enforcement(null) <> 'refuse' then
    raise exception 'ROLLBACK DID NOT VERIFY — the enforcement knob has no reader';
  end if;
  if not exists (select 1 from platform.feature_knob
                  where feature = 'custom' and key = 'stage_rule_enforcement') then
    raise exception 'ROLLBACK DID NOT VERIFY — the knob row is gone';
  end if;
  raise notice 'ROLLBACK VERIFIED — the main database is exactly as this file found it.';
end;
$v$;
