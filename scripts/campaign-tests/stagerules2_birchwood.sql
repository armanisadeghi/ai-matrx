-- LANE STAGE-RULES-2 — THE BOARD THE SCREENSHOTS ARE OF, on the Birchwood Avenue
-- renovation (org 1a7fefc6-77e1-4c48-826f-003b1a2e17fd), as admin@admin.com from the seat
-- `authenticated`. THIS FILE COMMITS: it is her board, and the pictures are of it.
--
-- WHY IT EXISTS. STAGE-RULES' own walk ended with the house rule SATISFIED — Hearthstone's
-- $7,200 Guest Bathroom re-quote was refused, then Ferro & Sons bid $6,850 on the same room
-- and the move went through. So today nothing on that board is refused, and a screenshot of
-- "the refusal" would have to be staged. This carries her story one room forward instead:
--
--   The kitchen came in on budget, so in late September she opened up the PRIMARY BEDROOM —
--   removing the wall to the old sleeping porch, new windows, insulation and drywall. Ferro
--   & Sons walked it on 2026-09-18 and bid $11,400. It is the only bid on that room. That is
--   exactly the situation her house rule is about, and it is the card the board turns away.
--
-- AND HER SECOND RULE, which she has also said out loud and had nowhere to write: she does
-- not mind approving work, but she will not have anything over $10,000 marked PAID without
-- her contractor-of-record signing off first. That is not a refusal — it is "ask somebody" —
-- and it is the card that sits still saying it is waiting.
--
-- RUN IT ONCE:  ./binlocal/p.sh -f scripts/campaign-tests/stagerules2_birchwood.sql
-- Idempotent: the room, the quote and both gates settle rather than duplicate.

\set ON_ERROR_STOP on
\timing off

begin;

do $t$
declare
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org     constant uuid := '1a7fefc6-77e1-4c48-826f-003b1a2e17fd';
  v_quotes  constant uuid := '0e108f31-5078-48ec-9a15-b492baa414ba';
  v_rooms   constant uuid := 'caf6cf44-c379-47b4-ac2b-47412a7bda67';
  v_ferro   constant uuid := '7ddbc033-c9ef-4b2a-8b23-5ae40bfd87fb';   -- Ferro & Sons Construction
  v_f_room  constant uuid := '7c973e94-e0d2-4dc7-b2d9-dda9a4c0aa7d';
  v_f_co    constant uuid := '91bce902-bfa9-45d4-9ec0-c615dfa98e60';
  v_f_amt   constant uuid := 'dba92ed7-a224-4897-899a-bd9274ae66fa';
  v_bedroom uuid;
  v_bid     uuid;
  v_ref     jsonb;
  v_prev    jsonb;
begin
  if (select system_identifier from pg_control_system()) <> 7642734024280108049 then
    raise exception 'this file runs on the MAIN database only';
  end if;
  perform set_config('app.actor_system', 'campaign/stagerules2_birchwood', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'this file did not take the seat — current_user is %', current_user;
  end if;

  -- ── THE ROOM SHE OPENED UP IN LATE SEPTEMBER ────────────────────────────────────────
  select r.id into v_bedroom
    from custom.read_records(v_org, v_rooms, true, 200, 0) r
   where r.document ->> 'room_name' = 'Primary Bedroom' limit 1;
  if v_bedroom is null then
    v_bedroom := custom.record_write(v_org, v_rooms, jsonb_build_object(
      'room_name', 'Primary Bedroom',
      'project_scope', 'Remove the wall to the old sleeping porch, new windows, insulation and drywall.',
      'budget', 12000,
      'status', 'planning',
      'target_start', '2026-10-05',
      'target_end', '2026-11-20'));
    raise notice 'the Primary Bedroom is %', v_bedroom;
  end if;

  -- ── THE ONE BID ON IT ───────────────────────────────────────────────────────────────
  select r.id into v_bid
    from custom.read_records(v_org, v_quotes, true, 500, 0) r
   where (r.document ->> 'room') = v_bedroom::text
     and (r.document ->> 'contractor') = v_ferro::text limit 1;
  if v_bid is null then
    v_bid := custom.record_write(v_org, v_quotes, jsonb_build_object(
      'room', v_bedroom::text,
      'contractor', v_ferro::text,
      'quote_amount', 11400,
      'quote_date', '2026-09-18',
      'valid_until', '2026-10-18',
      'quote_stage', 'Received'));
    raise notice 'Ferro & Sons bid $11,400 on the Primary Bedroom: %', v_bid;
  end if;

  -- ── HER TWO RULES, BOTH SAID THE WAY SHE SAYS THEM ─────────────────────────────────
  perform custom.pipeline_declare(v_org, v_quotes, jsonb_build_object(
    'stage_field', jsonb_build_object('key','quote_stage'),
    'gates', jsonb_build_object(
      'Approved', jsonb_build_array(jsonb_build_object(
        'name',    'A second quote before a big one is approved',
        'message', 'Nothing over $5,000 moves to Approved without a second quote from a different contractor.',
        'when',    jsonb_build_object('op','gt','args', jsonb_build_array(
                     jsonb_build_object('field', v_f_amt), jsonb_build_object('const', 5000))),
        'demands', jsonb_build_object('op','gte','args', jsonb_build_array(
                     jsonb_build_object('op','sibling_count',
                       'same', jsonb_build_array(v_f_room), 'differs', jsonb_build_array(v_f_co)),
                     jsonb_build_object('const', 1))),
        'on_fail', 'refuse')),
      'Paid', jsonb_build_array(jsonb_build_object(
        'name',    'Sign-off before anything big is marked paid',
        'message', 'Anything over $10,000 needs sign-off before it is marked Paid.',
        'when',    jsonb_build_object('op','gt','args', jsonb_build_array(
                     jsonb_build_object('field', v_f_amt), jsonb_build_object('const', 10000))),
        -- "it has a second quote" is the thing she wants somebody to have checked, and it is
        -- the same question the Approved gate asks — she is not adding a new fact, she is
        -- adding a second pair of eyes at the money step.
        'demands', jsonb_build_object('op','gte','args', jsonb_build_array(
                     jsonb_build_object('op','sibling_count',
                       'same', jsonb_build_array(v_f_room), 'differs', jsonb_build_array(v_f_co)),
                     jsonb_build_object('const', 1))),
        'on_fail', 'require_approval')))));

  -- ── AND THE BOARD SAYS SO, THROUGH THE DOORS ────────────────────────────────────────
  v_ref := custom.pipeline_transition_refusal(v_org, v_bid, 'Approved');
  raise notice 'dragging the $11,400 Primary Bedroom bid to Approved -> outcome=% why=%',
               v_ref ->> 'outcome', v_ref ->> 'why';
  if coalesce((v_ref ->> 'allowed')::boolean, true) then
    raise exception 'the board let the single big bid through — the pictures would be of nothing';
  end if;

  v_prev := custom.pipeline_gate_preview(v_org, v_quotes, 'Approved', jsonb_build_object(
    'message', 'Nothing over $5,000 moves to Approved without a second quote from a different contractor.',
    'when',    jsonb_build_object('op','gt','args', jsonb_build_array(
                 jsonb_build_object('field', v_f_amt), jsonb_build_object('const', 5000))),
    'demands', jsonb_build_object('op','gte','args', jsonb_build_array(
                 jsonb_build_object('op','sibling_count',
                   'same', jsonb_build_array(v_f_room), 'differs', jsonb_build_array(v_f_co)),
                 jsonb_build_object('const', 1)))));
  raise notice 'the settings screen will say: % of % quotes would be refused today (%)',
               v_prev ->> 'refused', v_prev ->> 'considered',
               (select string_agg(e ->> 'title', ', ') from jsonb_array_elements(v_prev -> 'examples') e);
end;
$t$;

commit;
