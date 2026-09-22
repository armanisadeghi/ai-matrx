-- LANE STAGE-RULES — THE LIVE PROOF, on the Birchwood Avenue renovation organization
-- 1a7fefc6-77e1-4c48-826f-003b1a2e17fd, as admin@admin.com, through the doors a signed-in
-- person reaches. THIS FILE COMMITS: it is the homeowner's own board, left in place for her
-- to look at, not a test that tidies up after itself.
--
-- THE USE CASE. She is renovating room by room. Her Guest Bathroom started as a cosmetic
-- refresh — new vanity, paint, light fixtures, budget $6,500 — and Hearthstone Flooring bid
-- $1,800 for it on 2026-07-28. Then the subfloor turned out to be soft, the scope grew to
-- re-tiling the shower surround, and Hearthstone came back at $7,200. Her house rule, the
-- one she told her partner and could not write down anywhere until today: nothing over
-- $5,000 gets approved on a single bid.
--
-- RUN IT ONCE:  ./binlocal/p.sh -f scripts/campaign-tests/stagerules_birchwood.sql
-- It is idempotent: the Field, the pipeline and the gate all settle rather than duplicate,
-- and the two quotes are written only if they are not already there.

-- 🚨 p_by_id = FALSE (lane RED-SUITES-2, 2026-09-21). `custom.read_records`' THIRD argument is
-- `p_by_id`, and with it TRUE the document comes back keyed by FIELD ID, so `document ->> '<a
-- field key>'` is always NULL. Measured on the main database against the Birchwood companies
-- table: by_id=true -> `{"_choices": {"1ce7851e-…": …}}` and 0 rows match
-- `document ->> 'company_name' = 'Hearthstone Flooring'`; by_id=false -> 1 row matches.
-- RED-SUITES fixed this exact shape once already, in `guardswitch_green` 3e: "the clause passed
-- `true` and then looked the row up by `document ->> 'title'`. The door was right; the clause was
-- asking for the wrong document." These are its siblings.
\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'stagerules_birchwood.sql'
\set requires 'function:custom.field_declare'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org     constant uuid := '1a7fefc6-77e1-4c48-826f-003b1a2e17fd';
  v_quotes  constant uuid := '0e108f31-5078-48ec-9a15-b492baa414ba';
  v_rooms   constant uuid := 'caf6cf44-c379-47b4-ac2b-47412a7bda67';
  v_f_co    constant uuid := '91bce902-bfa9-45d4-9ec0-c615dfa98e60';
  v_f_amt   constant uuid := 'dba92ed7-a224-4897-899a-bd9274ae66fa';
  v_boss    text := current_user;
  v_f_room  uuid;
  v_guest   uuid;
  v_hearth  uuid;
  v_ferro   uuid;
  v_requote uuid;
  v_second  uuid;
  v_pipe    jsonb;
  v_ref     jsonb;
  v_move    jsonb;
  v_row     jsonb;
begin
  perform set_config('app.actor_system', 'campaign/stagerules_birchwood', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'this file did not take the seat — current_user is %', current_user;
  end if;

  -- ── THE ROOM COLUMN. Every quote already carries which room it is for, and nothing ever
  -- declared it as a column — so no rule, no filter and no board could speak about it. A
  -- gate that counts "other quotes for the SAME room" needs it by id.
  v_f_room := custom.field_declare(v_org, v_quotes, jsonb_build_object(
    'key','room','label','Room','type','relation','relation_target', v_rooms::text,
    'relation_max', 1, 'multi', false, 'sort', 5));
  raise notice 'the Room column on Quotes is %', v_f_room;

  -- ── THE BOARD AND THE HOUSE RULE. One declaration.
  v_pipe := custom.pipeline_declare(v_org, v_quotes, jsonb_build_object(
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
        'on_fail', 'refuse')))));
  raise notice 'the board: %', v_pipe -> 'said';

  -- ── THE ROOM AND THE TWO COMPANIES, found by the names the homeowner uses.
  select q.id into v_guest from custom.read_records(v_org, v_rooms, false, 200, 0) q
   where q.document ->> 'room_name' = 'Guest Bathroom' or q.document ->> 'name' = 'Guest Bathroom'
      or q.document ->> 'title' = 'Guest Bathroom';
  select q.id into v_hearth
    from custom.read_records(v_org, 'fa55b71b-e14a-48ac-9ded-f38a6e7af192'::uuid, false, 200, 0) q
   where q.document ->> 'company_name' = 'Hearthstone Flooring' or q.document ->> 'name' = 'Hearthstone Flooring'
      or q.document ->> 'title' = 'Hearthstone Flooring';
  select q.id into v_ferro
    from custom.read_records(v_org, 'fa55b71b-e14a-48ac-9ded-f38a6e7af192'::uuid, false, 200, 0) q
   where q.document ->> 'company_name' = 'Ferro & Sons Construction' or q.document ->> 'name' = 'Ferro & Sons Construction'
      or q.document ->> 'title' = 'Ferro & Sons Construction';
  if v_guest is null or v_hearth is null or v_ferro is null then
    raise exception 'the Guest Bathroom (%), Hearthstone Flooring (%) or Ferro & Sons (%) is not in this organization',
      v_guest, v_hearth, v_ferro;
  end if;

  -- ── HEARTHSTONE'S REVISED BID, $7,200, after the subfloor turned out to be soft.
  select q.id into v_requote from custom.read_records(v_org, v_quotes, false, 200, 0) q
   where (q.document ->> 'room')::uuid = v_guest and (q.document ->> 'contractor')::uuid = v_hearth
     and (q.document ->> 'quote_amount')::numeric = 7200;
  if v_requote is null then
    v_requote := custom.record_write(v_org, v_quotes, jsonb_build_object(
      'room', v_guest::text, 'contractor', v_hearth::text,
      'quote_amount', 7200, 'quote_date', '2026-09-12', 'valid_until', '2026-10-12',
      'status', 'Pending', 'quote_stage', 'Received'));
  elsif lower(coalesce(custom.read_record(v_org, v_requote, true) ->> 'quote_stage','')) = 'approved' then
    -- 🚨 THE WALK HAS ALREADY BEEN MADE, AND IT CANNOT BE REPLAYED (lane RED-SUITES-2,
    -- 2026-09-21). This file COMMITS to the homeowner's real board. It ran, the house rule
    -- did its job, Ferro & Sons' competing bid arrived and the $7,200 re-quote reached
    -- Approved. Replaying it needs the card dragged BACKWARDS to Received first, and the
    -- board refuses that by its own rule — "That is not a move this quote can make from where
    -- it is. REC-15: the rule "Where a quote can go next" (version 2) is not satisfied by this
    -- record." The board being further along is the first run having WORKED.
    --
    -- Its successor says the same thing in its own header: "STAGE-RULES' own walk ended with
    -- the house rule SATISFIED … So today nothing on that board is refused, and a screenshot
    -- of 'the refusal' would have to be staged." `scripts/campaign-tests/stagerules2_birchwood.sql`
    -- carries her story one room forward — the Primary Bedroom, one bid, $11,400 — and IS the
    -- live refusal proof now. It is green.
    --
    -- So this file reports that it is spent rather than staging a refusal the board no longer
    -- produces or moving a real card backwards past the rule it exists to enforce. It touches
    -- nothing and ends clean.
    raise notice 'SPENT — this one-shot live walk already ran: the $7,200 Hearthstone re-quote is Approved on the Birchwood board, which is the house rule having worked. It cannot be replayed (the board refuses a backwards move, by design). The live refusal proof is now stagerules2_birchwood.sql, on the Primary Bedroom.';
    perform set_config('role', v_boss, true);
    return;
  end if;

  -- ── THE MOMENT THE HOUSE RULE EARNS ITS KEEP. One bid, $7,200, and she drags it across.
  v_ref := custom.pipeline_transition_refusal(v_org, v_requote, 'Approved');
  if (v_ref ->> 'allowed')::boolean then
    raise exception 'LIVE PROOF FAILED — the $7,200 single bid was allowed to Approved';
  end if;
  raise notice 'REFUSED, as she asked: "%"', v_ref ->> 'why';
  begin
    perform custom.pipeline_move(v_org, v_requote, 'Approved');
    raise exception 'LIVE PROOF FAILED — the store approved the $7,200 single bid';
  exception when check_violation then
    raise notice 'AND THE STORE SAYS THE SAME THING: "%"', sqlerrm;
  end;
  v_row := custom.read_record(v_org, v_requote, true);
  if lower(coalesce(v_row ->> 'quote_stage','')) <> 'received' then
    raise exception 'LIVE PROOF FAILED — nothing should have been written and the quote is in %',
      v_row ->> 'quote_stage';
  end if;

  -- ── SHE RINGS FERRO & SONS. They walk the room and come back at $6,850.
  select q.id into v_second from custom.read_records(v_org, v_quotes, false, 200, 0) q
   where (q.document ->> 'room')::uuid = v_guest and (q.document ->> 'contractor')::uuid = v_ferro;
  if v_second is null then
    v_second := custom.record_write(v_org, v_quotes, jsonb_build_object(
      'room', v_guest::text, 'contractor', v_ferro::text,
      'quote_amount', 6850, 'quote_date', '2026-09-18', 'valid_until', '2026-10-18',
      'status', 'Pending', 'quote_stage', 'Received'));
  end if;

  -- ── AND THE SAME DRAG GOES THROUGH.
  --
  -- 🚨 IDEMPOTENT FOR THE MOVE TOO (lane RED-SUITES-2, 2026-09-21). This file's own header says
  -- it is idempotent, and every WRITE above settles rather than duplicates — but the MOVE did
  -- not: on a second run the re-quote is already Approved, and Approved -> Approved is not a
  -- transition this board offers, so the walk died on "That is not a move this quote can make
  -- from where it is." The board being further along is the FIRST RUN having worked, not a
  -- defect. So: if the move has already been made, the end state is asserted instead of the
  -- transition being re-performed on the homeowner's live board. The clause is unchanged —
  -- with a competing bid from a different contractor, the $7,200 re-quote reaches Approved.
  if lower(coalesce(custom.read_record(v_org, v_requote, true) ->> 'quote_stage','')) = 'approved' then
    raise notice 'ALREADY MADE — the re-quote is Approved from an earlier run of this walk; asserting the end state rather than dragging the card again.';
  else
    v_ref := custom.pipeline_transition_refusal(v_org, v_requote, 'Approved');
    if not (v_ref ->> 'allowed')::boolean then
      raise exception 'LIVE PROOF FAILED — a competing bid exists and the move is still refused: %',
        v_ref ->> 'why';
    end if;
    v_move := custom.pipeline_move(v_org, v_requote, 'Approved');
    if not (v_move ->> 'applied')::boolean then
      raise exception 'LIVE PROOF FAILED — the store still refused: %', v_move ->> 'why';
    end if;
  end if;
  v_row := custom.read_record(v_org, v_requote, true);
  if lower(coalesce(v_row ->> 'quote_stage','')) <> 'approved' then
    raise exception 'LIVE PROOF FAILED — the quote is in %', v_row ->> 'quote_stage';
  end if;
  raise notice 'ALLOWED — one competing bid from a different company, and the $7,200 re-quote is Approved.';

  perform set_config('role', v_boss, true);
  raise notice 'LIVE PROOF PASSED on the Birchwood Avenue renovation. Quotes board: % / Hearthstone re-quote: %',
    v_quotes, v_requote;
end;
$t$;

commit;
