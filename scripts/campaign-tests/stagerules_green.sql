-- LANE STAGE-RULES — THE GREEN SUITE. "Nothing moves to Approved over $5,000 without a
-- second quote from a different contractor." Proved end to end on the MAIN database, in one
-- transaction that ends in ROLLBACK.
--
-- THE REAL USE CASE THIS DATA COMES FROM (owner law 2026-09-21, no fake test data):
--   A homeowner is running a whole-house renovation on Birchwood Avenue, room by room. For
--   each room she collects contractor quotes, and a quote moves Requested -> Received ->
--   Approved -> Paid. Her own house rule, the one she told her partner and then could not
--   write down anywhere: nothing over $5,000 gets approved on a single bid. The rooms,
--   trades, companies, dollar amounts and dates below are the ones the shared use-case
--   template `scripts/campaign-tests/use-cases/home-renovation.json` carries, and the live
--   organization it built is `1a7fefc6-77e1-4c48-826f-003b1a2e17fd`. Nobody in it is real.
--
-- RUN IT:
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the main database DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/stagerules_green.sql
--
-- ITS RED TWIN is `scripts/campaign-tests/stagerules_red.sql`, which runs the REAL BYTES of
-- this lane's inverse and asserts each capability exactly as it stood before the fix.
--
-- THE SEAT. Every asserted clause runs as `authenticated` — the role PostgREST gives a
-- signed-in person — through doors that person reaches. The only steps that leave the seat
-- are the organization, the memberships, the knobs and the Home record, and they assert
-- nothing while they are out.
--
-- WHAT MAKES IT FAIL — the production change, named, one per part:
--   1  drop `on_fail` out of `custom._rule_shape_guard` -> a gate can claim a behaviour the
--      store cannot carry out, and nobody finds out until it stops somebody.
--   2  take `sibling_count` out of `custom.rule_eval` -> "a second quote from a DIFFERENT
--      contractor" cannot be asked at all, and the gate is unwritable.
--   3  count the record being written in `sibling_count` -> the first quote is its own
--      second opinion and the rule never stops anything.
--   4  let a sibling that answers NOTHING count as answering differently -> a blank second
--      quote satisfies a second-quote demand.
--   5  make `require_approval` refuse instead of filing -> the queue is decoration.
--   6  leave the record moved when an approval is filed -> the board lies about where the
--      card is while somebody is still deciding.
--   7  let the enforcement knob soften `require_approval` too -> "ask somebody" silently
--      becomes "carry on with a note".
--   8  drop the approved-change exemption -> a yes can never be applied, and every approved
--      move is refused by the gate that asked for the approval.
--
-- A SECOND INPUT WITH A DIFFERENT EXPECTED VALUE IN EVERY PART: the $7,200 re-quote is
-- paired with the $1,800 one beside it; the single bid is paired with the same room after a
-- competing bid arrives; the refusing organization is paired with the same organization
-- after it asks to be warned instead.

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'stagerules_green.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org     uuid := gen_random_uuid();
  v_boss    text := current_user;
  v_home    uuid;
  v_tbl     uuid;
  v_f_room  uuid;
  v_f_co    uuid;
  v_f_amt   uuid;
  v_f_inv   uuid;
  v_pipe    jsonb;
  v_ref     jsonb;
  v_move    jsonb;
  v_hearth  uuid;   -- Hearthstone Flooring's first Guest Bathroom bid, $1,800
  v_requote uuid;   -- Hearthstone Flooring's revised Guest Bathroom bid, $7,200
  v_ferro   uuid;   -- Ferro & Sons' competing Guest Bathroom bid, $6,850
  v_deck    uuid;   -- Millbrook Carpentry's Backyard Deck bid, $17,200
  v_caught  text;
  v_appr    uuid;
  v_pend    jsonb;
  v_doc     jsonb;
begin
  perform set_config('app.actor_system', 'campaign-test/stagerules_green', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Birchwood Avenue Renovation ' || substr(v_org::text, 1, 8),
          'birchwood-reno-' || substr(v_org::text, 1, 8), 'BAR', c_admin);  -- matrx-real-data:allow BAR is Birchwood Avenue Renovation's own initials, the abbreviation the organization really carries, not a metasyntactic variable
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_dana,  'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note) values
    ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'stagerules_green');

  -- The Home record is made by the onboarding path; no client door covers it.
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Birchwood Avenue')) returning id into v_home;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 0 — TAKE THE SEAT, AND PROVE IT.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;
  if pg_has_role(current_user,
                 (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass),
                 'member') then
    raise exception '0: this seat is a member of the role that owns custom.record, so every wall would open on its first line';
  end if;
  begin
    perform 1 from custom.record limit 1;
    raise exception '0: this seat can SELECT custom.record directly, so it is not a client seat';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PART 0 PASSED — the seat is `authenticated`, and custom.record is not readable from it.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 1 — THE HOUSE RULE, WRITTEN DOWN FOR THE FIRST TIME.
  -- ════════════════════════════════════════════════════════════════════════════
  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name','Quote','slug','quote_' || substr(v_org::text, 1, 8),'type','entity',
    'label_singular','Quote','label_plural','Quotes','title_field','room','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','room'),
                                jsonb_build_object('name','contractor'),
                                jsonb_build_object('name','quote_amount'),
                                jsonb_build_object('name','final_invoice')),
    'parent_id', v_home::text));
  v_f_room := custom.field_declare(v_org, v_tbl, jsonb_build_object('key','room','label','Room','plain','text','sort',10));
  v_f_co   := custom.field_declare(v_org, v_tbl, jsonb_build_object('key','contractor','label','Contractor','plain','text','sort',20));
  v_f_amt  := custom.field_declare(v_org, v_tbl, jsonb_build_object('key','quote_amount','label','Quote amount','plain','number','sort',30));
  v_f_inv  := custom.field_declare(v_org, v_tbl, jsonb_build_object('key','final_invoice','label','Final invoice','plain','text','sort',40));

  v_pipe := custom.pipeline_declare(v_org, v_tbl, jsonb_build_object(
    'stage_field', jsonb_build_object('key','quote_stage','label','Quote stage',
       'options', jsonb_build_array('Requested','Received','Approved','Paid')),
    'transitions', jsonb_build_array(
       jsonb_build_object('from','Requested','to','Received'),
       jsonb_build_object('from','Received','to','Approved'),
       jsonb_build_object('from','Approved','to','Paid')),
    'gates', jsonb_build_object(
      'Approved', jsonb_build_array(jsonb_build_object(
        'name',    'A second quote before a big one is approved',
        'message', 'Nothing over $5,000 moves to Approved without a second quote from a different contractor.',
        'when',    jsonb_build_object('op','gt','args', jsonb_build_array(
                     jsonb_build_object('field', v_f_amt), jsonb_build_object('const', 5000))),
        'demands', jsonb_build_object('op','gte','args', jsonb_build_array(
                     jsonb_build_object('op','sibling_count','same', jsonb_build_array(v_f_room),
                                        'differs', jsonb_build_array(v_f_co)),
                     jsonb_build_object('const', 1))),
        'on_fail', 'refuse')),
      'Paid', jsonb_build_array(jsonb_build_object(
        'name',    'A big invoice is signed off before it is paid',
        'message', 'A quote over $5,000 is marked Paid once the final invoice has been entered.',
        'when',    jsonb_build_object('op','gt','args', jsonb_build_array(
                     jsonb_build_object('field', v_f_amt), jsonb_build_object('const', 5000))),
        'demands', jsonb_build_object('op','present','args', jsonb_build_array(
                     jsonb_build_object('field', v_f_inv))),
        'on_fail', 'require_approval')))));

  if not (v_pipe -> 'rules' ? 'gate:approved:1') then
    raise exception '1a: the house rule was declared and no gate came back — %', v_pipe -> 'rules';
  end if;
  -- Read back through the door a person reaches, never off the table.
  v_doc := custom.read_record(v_org, (v_pipe #>> '{rules,gate:approved:1}')::uuid, true);
  if v_doc ->> 'on_fail' <> 'refuse' then
    raise exception '1a: the Approved gate says it will % when it stops somebody', v_doc ->> 'on_fail';
  end if;
  v_doc := custom.read_record(v_org, (v_pipe #>> '{rules,gate:paid:1}')::uuid, true);
  if v_doc ->> 'on_fail' <> 'require_approval' then
    raise exception '1a: the Paid gate says it will % when it stops somebody', v_doc ->> 'on_fail';
  end if;
  raise notice '1a PASSED — one declaration produced % rules, two of them gates that say what they do when they say no: %',
    (select count(*) from jsonb_object_keys(v_pipe -> 'rules')), v_pipe -> 'said';

  -- 1b — A GATE CANNOT CLAIM A BEHAVIOUR THE STORE CANNOT CARRY OUT.
  begin
    perform custom.rule_declare(v_org, jsonb_build_object(
      'name','Final invoice attached before the stage moves','message','no','kind','predicate',
      'uses', jsonb_build_array('validate'), 'scope_table_id', v_tbl,
      'applies_to_types','[]'::jsonb, 'on_fail','escalate_to_legal',
      'expr', jsonb_build_object('op','present','args', jsonb_build_array(
                jsonb_build_object('field', v_f_inv)))), null);
    raise exception '1b: a gate was saved claiming an on_fail behaviour the store has never heard of';
  exception when check_violation then
    v_caught := sqlerrm;
  end;
  if v_caught !~* 'there is no such answer' then
    raise exception '1b: the sentence a person writing that rule would read is %', v_caught;
  end if;
  raise notice '1b PASSED — an unknown on_fail is refused when the rule is SAVED: "%"', v_caught;

  -- 1c — REC-17 REACHES INSIDE THE NEW NODE. A count over a field of another table is
  -- refused at save time, not discovered on somebody's board.
  begin
    perform custom.rule_declare(v_org, jsonb_build_object(
      'name','At least one other task with the same contractor','message','no','kind','predicate',
      'uses', jsonb_build_array('validate'), 'scope_table_id', v_tbl,
      'applies_to_types','[]'::jsonb,
      'expr', jsonb_build_object('op','gte','args', jsonb_build_array(
                jsonb_build_object('op','sibling_count',
                                   'same', jsonb_build_array(gen_random_uuid()),
                                   'differs', jsonb_build_array(v_f_co)),
                jsonb_build_object('const', 1)))), null);
    raise exception '1c: a gate was saved counting siblings by a column that is not on its table';
  exception when check_violation then
    v_caught := sqlerrm;
  end;
  if v_caught !~* 'not one of that table' then
    raise exception '1c: the sentence a person writing that rule would read is %', v_caught;
  end if;
  raise notice '1c PASSED — sibling_count obeys REC-17 at save time: "%"', v_caught;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 2 — THE SINGLE BID, AND THE SAME ROOM AFTER A SECOND BID ARRIVES.
  -- ════════════════════════════════════════════════════════════════════════════
  -- The Guest Bathroom started as a cosmetic refresh, budget $6,500. Hearthstone Flooring
  -- bid $1,800 for it in July. Then the subfloor turned out to be soft, the scope grew to
  -- re-tiling the shower surround, and Hearthstone came back with $7,200 — still the only
  -- company that has looked at the room.
  v_hearth := custom.record_write(v_org, v_tbl, jsonb_build_object(
    'room','Guest Bathroom','contractor','Hearthstone Flooring','quote_amount',1800,'quote_stage','Received'));
  v_requote := custom.record_write(v_org, v_tbl, jsonb_build_object(
    'room','Guest Bathroom','contractor','Hearthstone Flooring','quote_amount',7200,'quote_stage','Received'));
  -- The Backyard Deck is a different room entirely, and it is here so the count cannot pass
  -- by counting every quote in the house.
  v_deck := custom.record_write(v_org, v_tbl, jsonb_build_object(
    'room','Backyard Deck','contractor','Millbrook Carpentry','quote_amount',17200,'quote_stage','Received'));

  -- 2a — ASKED BEFORE THE FINGER LETS GO.
  v_ref := custom.pipeline_transition_refusal(v_org, v_requote, 'Approved');
  if (v_ref ->> 'allowed')::boolean then
    raise exception '2a: a $7,200 bid with no competing quote was told it could go to Approved';
  end if;
  if v_ref ->> 'outcome' <> 'refused' then
    raise exception '2a: the board was told the outcome is %', v_ref ->> 'outcome';
  end if;
  if v_ref ->> 'why' !~* 'without a second quote from a different contractor' then
    raise exception '2a: the sentence a person would read is %', v_ref ->> 'why';
  end if;
  raise notice '2a PASSED — the drag is refused before anything moves: "%"', v_ref ->> 'why';

  -- 2b — AND THE STORE ITSELF REFUSES IT. The preview and the enforcement are the same
  -- Rules through the same evaluator, and this is where that is proved rather than asserted.
  begin
    perform custom.pipeline_move(v_org, v_requote, 'Approved');
    raise exception '2b: the store approved a $7,200 bid on a single quote';
  exception when check_violation then
    v_caught := sqlerrm;
  end;
  if v_caught !~* 'without a second quote from a different contractor' then
    raise exception '2b: the store refused it, saying %', v_caught;
  end if;
  if (custom.read_record(v_org, v_requote, true) #>> '{quote_stage}') not in ('received','Received') then
    raise exception '2b: nothing should have been written, and the quote is now in %',
      custom.read_record(v_org, v_requote, true) #>> '{quote_stage}';
  end if;
  raise notice '2b PASSED — the store refuses the same move in the same words, and wrote nothing.';

  -- 2c — THE PAIRED INPUT. The SAME gate, the SAME room, the SAME lack of a second quote —
  -- and $1,800 goes through, because the house rule is about big ones.
  v_move := custom.pipeline_move(v_org, v_hearth, 'Approved');
  if not (v_move ->> 'applied')::boolean then
    raise exception '2c: the $1,800 bid was stopped by a rule about quotes over $5,000: %', v_move ->> 'why';
  end if;
  raise notice '2c PASSED — under $5,000 the gate is not about this quote at all, and it moves.';

  -- 2d — THE SECOND OPINION ARRIVES, AND THE SAME MOVE IS NOW ALLOWED. Ferro & Sons walked
  -- the Guest Bathroom and came back at $6,850.
  v_ferro := custom.record_write(v_org, v_tbl, jsonb_build_object(
    'room','Guest Bathroom','contractor','Ferro & Sons Construction','quote_amount',6850,'quote_stage','Received'));
  v_ref := custom.pipeline_transition_refusal(v_org, v_requote, 'Approved');
  if not (v_ref ->> 'allowed')::boolean then
    raise exception '2d: a second quote from a different contractor exists and the move is still refused: %',
      v_ref ->> 'why';
  end if;
  v_move := custom.pipeline_move(v_org, v_requote, 'Approved');
  if not (v_move ->> 'applied')::boolean then
    raise exception '2d: the store still refused the move: %', v_move ->> 'why';
  end if;
  if lower(custom.read_record(v_org, v_requote, true) #>> '{quote_stage}') <> 'approved' then
    raise exception '2d: the quote should be in Approved and it is in %',
      custom.read_record(v_org, v_requote, true) #>> '{quote_stage}';
  end if;
  raise notice '2d PASSED — one competing bid from a different company, and the same move goes through.';

  -- 2e — A BLANK SECOND QUOTE IS NOT A SECOND OPINION. The Backyard Deck gets a second row
  -- with NO contractor on it, and $17,200 is still refused.
  perform custom.record_write(v_org, v_tbl, jsonb_build_object(
    'room','Backyard Deck','quote_amount',0,'quote_stage','Requested'));
  v_ref := custom.pipeline_transition_refusal(v_org, v_deck, 'Approved');
  if (v_ref ->> 'allowed')::boolean then
    raise exception '2e: a row with no contractor on it counted as a quote from a different contractor';
  end if;
  raise notice '2e PASSED — a sibling that answers nothing is not answering differently.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 3 — THE THIRD ANSWER: NOT NO, BUT NOT WITHOUT SOMEBODY SAYING YES.
  -- ════════════════════════════════════════════════════════════════════════════
  -- The $7,200 Guest Bathroom job is done and Hearthstone want paying. No final invoice has
  -- been entered. The gate on Paid does not refuse — it asks.
  v_ref := custom.pipeline_transition_refusal(v_org, v_requote, 'Paid');
  if v_ref ->> 'outcome' <> 'needs_approval' then
    raise exception '3a: the board was told the outcome of that drag is %, and it should be needs_approval',
      v_ref ->> 'outcome';
  end if;
  raise notice '3a PASSED — the board is told BEFORE the drag that this one goes for approval: "%"',
    v_ref ->> 'what_happens';

  v_move := custom.pipeline_move(v_org, v_requote, 'Paid');
  if (v_move ->> 'applied')::boolean then
    raise exception '3b: the move was applied, and it was supposed to be waiting for somebody';
  end if;
  if nullif(v_move ->> 'approval_id', '') is null then
    raise exception '3b: nothing was filed — %', v_move;
  end if;
  v_appr := (v_move ->> 'approval_id')::uuid;
  if lower(custom.read_record(v_org, v_requote, true) #>> '{quote_stage}') <> 'approved' then
    raise exception '3b: THE CARD MOVED WHILE SOMEBODY IS STILL DECIDING. It is in %',
      custom.read_record(v_org, v_requote, true) #>> '{quote_stage}';
  end if;
  v_pend := custom.record_stage_pending(v_org, v_requote);
  if jsonb_array_length(v_pend) <> 1 or lower(v_pend -> 0 ->> 'to') <> 'paid' then
    raise exception '3b: the card cannot say it is waiting — %', v_pend;
  end if;
  raise notice '3b PASSED — the wait is filed (%), the quote is still in Approved, and the card says it is waiting to go to %.',
    v_appr, v_pend -> 0 ->> 'to';

  -- 3c — SOMEBODY SAYS YES, AND THE SAME WRITE GOES THROUGH THE SAME DOORS.
  -- The homeowner's partner, Dana, is given admin on this quote and decides it. She is a
  -- second pair of eyes: the person who asked cannot be the person who answers.
  perform custom.share_grant(v_org, v_requote, 'person', c_dana, 'admin'::public.permission_level);
  perform set_config('request.jwt.claims', c_dana_j, true);
  v_doc := custom.work_approval_decide(v_org, v_appr, true, 'Final invoice is in the folder on the counter.');
  perform set_config('request.jwt.claims', c_admin_j, true);
  if lower(custom.read_record(v_org, v_requote, true) #>> '{quote_stage}') <> 'paid' then
    raise exception '3c: the approval was decided yes and the quote is in %',
      custom.read_record(v_org, v_requote, true) #>> '{quote_stage}';
  end if;
  if jsonb_array_length(custom.record_stage_pending(v_org, v_requote)) <> 0 then
    raise exception '3c: the card still says it is waiting after the answer came';
  end if;
  if not (v_doc ->> 'applied')::boolean then
    raise exception '3c: the decision came back saying it applied nothing — %', v_doc;
  end if;
  raise notice '3c PASSED — a second person said yes and the same write went through: "%"', v_doc ->> 'message';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 4 — THE ONE KNOB. The same organization, asked to be warned instead.
  -- ════════════════════════════════════════════════════════════════════════════
  if custom.stage_rule_enforcement(v_org) <> 'refuse' then
    raise exception '4a: an organization that has said nothing should refuse, and it %s',
      custom.stage_rule_enforcement(v_org);
  end if;

  perform set_config('role', v_boss, true);   -- no client door writes another rung's knob
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','stage_rule_enforcement','organization', v_org, v_org, '"warn"'::jsonb, 'stagerules_green');
  perform set_config('role', 'authenticated', true);

  if custom.stage_rule_enforcement(v_org) <> 'warn' then
    raise exception '4b: the organization asked to be warned and the store still says %',
      custom.stage_rule_enforcement(v_org);
  end if;

  -- The Backyard Deck's $17,200 bid still has no second opinion. Under `warn` it moves, and
  -- the sentence comes back WITH it rather than disappearing.
  v_move := custom.pipeline_move(v_org, v_deck, 'Approved');
  if not (v_move ->> 'applied')::boolean then
    raise exception '4b: the organization asked to be warned and the move was still refused: %', v_move ->> 'why';
  end if;
  if jsonb_array_length(coalesce(v_move -> 'warnings', '[]'::jsonb)) <> 1 then
    raise exception '4b: NOTHING FAILS SILENTLY — the move went through carrying no warning at all: %', v_move;
  end if;
  if v_move #>> '{warnings,0,why}' !~* 'without a second quote from a different contractor' then
    raise exception '4b: the warning says %', v_move #>> '{warnings,0,why}';
  end if;
  if v_move #>> '{warnings,0,what_to_do}' is null then
    raise exception '4b: the warning does not say what to do about it';
  end if;
  raise notice '4b PASSED — under `warn` the move goes through and hands back the same sentence: "%"',
    v_move #>> '{warnings,0,why}';

  -- 4c — AND IT NEVER SOFTENS AN APPROVAL. "Ask somebody" and "carry on with a note" are
  -- different answers. The Backyard Deck's $17,200 bid now tries to go to Paid with no
  -- final invoice, in the SAME organization that just asked to be warned.
  v_move := custom.pipeline_move(v_org, v_deck, 'Paid');
  if (v_move ->> 'applied')::boolean then
    raise exception '4c: THE KNOB SOFTENED AN APPROVAL. A $17,200 invoice was paid with a warning instead of a signature.';
  end if;
  if nullif(v_move ->> 'approval_id', '') is null then
    raise exception '4c: nothing was filed — %', v_move;
  end if;
  raise notice '4c PASSED — `warn` softens a refusal and never an approval: "%"', v_move ->> 'why';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 5 — THE SECOND SEAT. A member who was shared one quote at viewer.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', c_dana_j, true);
  -- The control she CAN do: she holds admin on the re-quote from part 3c, so she reads it.
  if custom.read_record(v_org, v_requote, true) is null then
    raise exception '5a: the record shared with her at admin does not read back, so this seat refuses everything';
  end if;
  -- And the thing she cannot: she was never given anything on the Backyard Deck bid.
  begin
    perform custom.pipeline_move(v_org, v_deck, 'Requested');
    raise exception '5b: a member who was shared nothing moved a card on somebody else''s board';
  exception when insufficient_privilege then
    v_caught := sqlerrm;
  end;
  raise notice '5b PASSED — the board is not a suggestion: "%"', v_caught;
  perform set_config('request.jwt.claims', c_admin_j, true);

  perform set_config('role', v_boss, true);
  raise notice 'ALL PARTS PASSED — the house rule a homeowner could not write down is now a gate the store enforces, in her own words.';
end;
$t$;

rollback;
