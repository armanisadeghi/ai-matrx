-- LANE STAGE-RULES-2 — THE GREEN SUITE, from the seat `authenticated`, on the Birchwood
-- Avenue renovation (org 1a7fefc6-77e1-4c48-826f-003b1a2e17fd), ending in ROLLBACK.
--
-- THE USE CASE, unchanged from STAGE-RULES so the two suites talk about the same house:
-- a homeowner renovating room by room, whose rule is "nothing over $5,000 gets approved on
-- a single bid". What this lane added is the SETTINGS SCREEN's half of that rule — reading
-- a gate back so it can be edited, and telling her what it would do before she saves it.
--
-- RUN IT:  ./binlocal/p.sh -f scripts/campaign-tests/stagerules2_green.sql
--
-- IT ROLLS BACK. The gate it declares is the one already on that board, re-stated, so the
-- board is unchanged either way; rolling back is what keeps a suite a suite.

\set ON_ERROR_STOP on
\timing off

begin;

do $t$
declare
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  -- test@test.com: a member of this organization who was shared nothing on this board.
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org     constant uuid := '1a7fefc6-77e1-4c48-826f-003b1a2e17fd';
  v_quotes  constant uuid := '0e108f31-5078-48ec-9a15-b492baa414ba';
  v_f_room  constant uuid := '7c973e94-e0d2-4dc7-b2d9-dda9a4c0aa7d';
  v_f_co    constant uuid := '91bce902-bfa9-45d4-9ec0-c615dfa98e60';
  v_f_amt   constant uuid := 'dba92ed7-a224-4897-899a-bd9274ae66fa';
  v_f_stage constant uuid := '9e955cc1-58fb-41c2-835c-0d43a00bc139';
  v_gate    jsonb;
  v_read    jsonb;
  v_rule    jsonb;
  v_prev    jsonb;
  v_strict  jsonb;
  v_card    uuid;
  v_ref     jsonb;
  v_msg     text;
begin
  if (select system_identifier from pg_control_system()) <> 7642734024280108049 then
    raise exception 'this file runs on the MAIN database only';
  end if;
  perform set_config('app.actor_system', 'campaign-test/stagerules2_green', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  -- ══ PART 0 — TAKE THE SEAT AND PROVE IT ══════════════════════════════════════════════
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
  raise notice '0 — the seat is authenticated and custom.record is closed to it. PASS';

  -- The homeowner's rule, in the shape the condition builder writes.
  v_gate := jsonb_build_object(
    'name',    'A second quote before a big one is approved',
    'message', 'Nothing over $5,000 moves to Approved without a second quote from a different contractor.',
    'when',    jsonb_build_object('op','gt','args', jsonb_build_array(
                 jsonb_build_object('field', v_f_amt), jsonb_build_object('const', 5000))),
    'demands', jsonb_build_object('op','gte','args', jsonb_build_array(
                 jsonb_build_object('op','sibling_count',
                   'same',    jsonb_build_array(v_f_room),
                   'differs', jsonb_build_array(v_f_co)),
                 jsonb_build_object('const', 1))),
    'on_fail', 'refuse');

  -- ══ 1 — A GATE READS BACK AS IT WAS WRITTEN ══════════════════════════════════════════
  -- Before this lane the only copy of a gate was the compiled `or` of four arms, and an
  -- editor opening this rule would have shown a blank condition and overwritten it on the
  -- first Save. This is that defect, asserted.
  perform custom.pipeline_declare(v_org, v_quotes, jsonb_build_object(
    'stage_field', jsonb_build_object('key','quote_stage'),
    'gates', jsonb_build_object('Approved', jsonb_build_array(v_gate))));
  v_read := custom.pipeline_read(v_org, v_quotes);
  select r into v_rule from jsonb_array_elements(v_read -> 'rules') r
   where r ->> 'kind' like 'gate:%' and r ->> 'stage' = 'approved' limit 1;
  if v_rule is null then
    raise exception '1: the board came back with no gate on Approved at all';
  end if;
  if v_rule -> 'when' is distinct from v_gate -> 'when' then
    raise exception '1: the gate''s WHEN did not survive the round trip — asked % and read back %',
                    v_gate -> 'when', v_rule -> 'when';
  end if;
  if v_rule -> 'demands' is distinct from v_gate -> 'demands' then
    raise exception '1: the gate''s DEMANDS did not survive the round trip — asked % and read back %',
                    v_gate -> 'demands', v_rule -> 'demands';
  end if;
  if v_rule ->> 'on_fail' <> 'refuse' then
    raise exception '1: the gate read back as on_fail=%', v_rule ->> 'on_fail';
  end if;
  if v_rule ->> 'message' is distinct from v_gate ->> 'message' then
    raise exception '1: the gate read back with a different sentence';
  end if;
  raise notice '1 — a gate reads back with its own WHEN, DEMANDS, on_fail and sentence. PASS';

  -- ══ 2 — "ASK SOMEBODY" NEVER READS BACK AS "REFUSE" ══════════════════════════════════
  -- The half a missing `on_fail` would have broken silently: a screen that could not read
  -- it would show every gate as a refusal and turn this one into one on the next Save.
  perform custom.pipeline_declare(v_org, v_quotes, jsonb_build_object(
    'stage_field', jsonb_build_object('key','quote_stage'),
    'gates', jsonb_build_object('Approved', jsonb_build_array(v_gate || '{"on_fail":"require_approval"}'::jsonb))));
  v_read := custom.pipeline_read(v_org, v_quotes);
  select r into v_rule from jsonb_array_elements(v_read -> 'rules') r
   where r ->> 'kind' like 'gate:%' and r ->> 'stage' = 'approved' limit 1;
  if v_rule ->> 'on_fail' <> 'require_approval' then
    raise exception '2: an approval gate read back as %', v_rule ->> 'on_fail';
  end if;
  raise notice '2 — an approval gate reads back as an approval gate. PASS';
  -- ...and back to the house rule as it really is.
  perform custom.pipeline_declare(v_org, v_quotes, jsonb_build_object(
    'stage_field', jsonb_build_object('key','quote_stage'),
    'gates', jsonb_build_object('Approved', jsonb_build_array(v_gate))));

  -- ══ 4 — WHAT IT WOULD DO TO THIS BOARD TODAY, WITH THE CARDS BY NAME ════════════════
  v_prev := custom.pipeline_gate_preview(v_org, v_quotes, 'Approved', v_gate);
  if not coalesce((v_prev ->> 'is_pipeline')::boolean, false) then
    raise exception '4: the preview does not think this is a board';
  end if;
  if (v_prev ->> 'considered')::int <= 0 then
    raise exception '4: the preview considered no cards at all, on a board that has them';
  end if;
  -- A STRICTER RULE STOPS MORE CARDS, and this is what makes the number worth showing:
  -- the same board, a demand of TWO other quotes over $1,000, and the count moves.
  v_read := custom.pipeline_gate_preview(v_org, v_quotes, 'Approved', jsonb_build_object(
    'message', 'Two other quotes before anything over $1,000 is approved.',
    'when',    jsonb_build_object('op','gt','args', jsonb_build_array(
                 jsonb_build_object('field', v_f_amt), jsonb_build_object('const', 1000))),
    'demands', jsonb_build_object('op','gte','args', jsonb_build_array(
                 jsonb_build_object('op','sibling_count',
                   'same', jsonb_build_array(v_f_room), 'differs', jsonb_build_array(v_f_co)),
                 jsonb_build_object('const', 2)))));
  if (v_read ->> 'refused')::int <= (v_prev ->> 'refused')::int then
    raise exception '4: a stricter gate refused % cards and the looser one refused % — the preview is not judging the condition',
                    v_read ->> 'refused', v_prev ->> 'refused';
  end if;
  if jsonb_array_length(v_read -> 'examples') = 0 then
    raise exception '4: the preview refused % cards and named none of them', v_read ->> 'refused';
  end if;
  -- AND THE NAMES ARE NAMES. This board's quotes are titled by the room they are for,
  -- which is a RELATION — so the honest answer needs the other record's words, not its id.
  -- A uuid printed where a name belongs is the whole point of the preview defeated.
  if exists (select 1 from jsonb_array_elements(v_read -> 'examples') e
              where e ->> 'title' ~ '^[0-9a-fA-F]{8}-') then
    raise exception '4: the preview named a card with a uuid: %', v_read -> 'examples';
  end if;
  raise notice '4 — % of % cards would be refused today, named: %',
               v_read ->> 'refused', v_read ->> 'considered',
               (select string_agg(e ->> 'title', ', ') from jsonb_array_elements(v_read -> 'examples') e);

  -- ══ 4b — THE PREVIEW AND THE DOOR ARE THE SAME RULE ════════════════════════════════
  -- The point of the whole file. The preview compiles the gate a person is still typing;
  -- if it compiled it its own way the number on the screen would be about a different rule
  -- than the one the store enforces, and it would differ exactly at the edge of the
  -- condition, which is the only place anybody looks. So: SAVE the stricter gate, then ask
  -- the refusal door about a card the preview named — through the doors, from this seat,
  -- no internal function anywhere in the clause.
  v_strict := jsonb_build_object(
    'name',    'Two other quotes before a big one is approved',
    'message', 'Nothing over $1,000 moves to Approved without two other quotes for the same room from other contractors.',
    'when',    jsonb_build_object('op','gt','args', jsonb_build_array(
                 jsonb_build_object('field', v_f_amt), jsonb_build_object('const', 1000))),
    'demands', jsonb_build_object('op','gte','args', jsonb_build_array(
                 jsonb_build_object('op','sibling_count',
                   'same', jsonb_build_array(v_f_room), 'differs', jsonb_build_array(v_f_co)),
                 jsonb_build_object('const', 2))),
    'on_fail', 'refuse');
  v_card := ((v_read -> 'examples' -> 0) ->> 'record_id')::uuid;
  perform custom.pipeline_declare(v_org, v_quotes, jsonb_build_object(
    'stage_field', jsonb_build_object('key','quote_stage'),
    'gates', jsonb_build_object('Approved', jsonb_build_array(v_strict))));
  v_ref := custom.pipeline_transition_refusal(v_org, v_card, 'Approved');
  if coalesce((v_ref ->> 'allowed')::boolean, true) then
    raise exception '4b: the preview said this card would be refused and the door let it through: %', v_ref;
  end if;
  if v_ref ->> 'why' is distinct from (v_strict ->> 'message') then
    raise exception '4b: the door refused it in different words than the gate carries: %', v_ref ->> 'why';
  end if;
  raise notice '4b — a card the preview named is refused by the store, in the gate''s own sentence. PASS';
  -- ...and the house rule goes back the way it was.
  perform custom.pipeline_declare(v_org, v_quotes, jsonb_build_object(
    'stage_field', jsonb_build_object('key','quote_stage'),
    'gates', jsonb_build_object('Approved', jsonb_build_array(v_gate))));

  -- ══ 5 — AN UNFINISHED RULE IS REFUSED, NEVER ANSWERED ZERO ══════════════════════════
  -- "No cards would be stopped" beside a half-written condition is the silent-failure
  -- class: it reads as "this gate stops nobody" and somebody saves it.
  begin
    perform custom.pipeline_gate_preview(v_org, v_quotes, 'Approved',
              '{"message":"half written"}'::jsonb);
    raise exception '5: the preview answered a gate with no demand instead of refusing it';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg like '%5: the preview answered%' then raise; end if;
    if v_msg not like '%does not say what it demands%' then
      raise exception '5: refused, but not in words a person can act on: %', v_msg;
    end if;
  end;
  raise notice '5 — an unfinished rule is refused in words, not answered zero. PASS';

  -- ══ 5b — AND IT NEVER REACHES THE BOARD EITHER ══════════════════════════════════════
  -- The severe half of the same NULL trap, found by clause 5 and then reproduced on the
  -- live board: `custom.pipeline_declare` waved a gate with no `demands` KEY through,
  -- answered success, and replaced the homeowner's working $5,000 rule with one whose
  -- whole expression was `{"op":"or","args":null}` — a rule that refuses nobody, on a
  -- board that looked exactly the same.
  begin
    perform custom.pipeline_declare(v_org, v_quotes, jsonb_build_object(
      'stage_field', jsonb_build_object('key','quote_stage'),
      'gates', jsonb_build_object('Approved', jsonb_build_array('{"message":"half written"}'::jsonb))));
    raise exception '5b: a gate with no demand was accepted onto the board';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg like '%5b: a gate with no demand%' then raise; end if;
    if v_msg not like '%has to say what it demands%' then
      raise exception '5b: refused, but not for the right reason: %', v_msg;
    end if;
  end;
  -- ...and the rule it would have replaced is still the one it was.
  v_read := custom.pipeline_read(v_org, v_quotes);
  select r into v_rule from jsonb_array_elements(v_read -> 'rules') r
   where r ->> 'kind' like 'gate:%' and r ->> 'stage' = 'approved' limit 1;
  if v_rule ->> 'message' is distinct from (v_gate ->> 'message') then
    raise exception '5b: the refused call still changed the live rule — it now says %', v_rule ->> 'message';
  end if;
  raise notice '5b — a gate with no demand cannot reach the board, and the working rule beside it is untouched. PASS';

  -- ══ 5c — AND ONE LAYER DOWN, IN THE NODE THE GATES ARE BUILT ON ════════════════════
  -- The census of `jsonb_typeof(x) <> 'y'` across schema `custom` found exactly one other
  -- site where a MISSING key walked past a check that raises: `previous`, the node lane
  -- STAGE-RULES added. A `previous` with a BAD field was refused; a `previous` with NO
  -- field was not — it evaluated to NULL, and `custom.rule_truth(NULL)` is NULL rather
  -- than false, so a gate whose demand read a field it never named PASSED EVERY CARD and
  -- said nothing. The refusal's own words — "points at it with nothing" — are the proof
  -- that the absent case was meant to reach it.
  --
  -- ASKED THROUGH THE PREVIEW DOOR, because that is where a person meets it:
  -- `custom.rule_eval` is internal and holds no client grant, and a clause that stepped
  -- out of the seat to call it would be proving something about the superuser.
  begin
    perform custom.pipeline_gate_preview(v_org, v_quotes, 'Approved', jsonb_build_object(
      'message', 'x',
      'demands', jsonb_build_object('op','eq','args', jsonb_build_array(
        jsonb_build_object('op','previous'), jsonb_build_object('const','received')))));
    raise exception '5c: a gate reading a field it never named was judged instead of refused';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg like '%5c: a gate reading%' then raise; end if;
    if v_msg not like '%points at it with nothing%' then
      raise exception '5c: refused, but not in the words that name what is missing: %', v_msg;
    end if;
  end;
  -- ...and a gate whose `previous` DOES name its field is still judged, which is the half
  -- a careless coalesce would have broken.
  v_read := custom.pipeline_gate_preview(v_org, v_quotes, 'Approved', jsonb_build_object(
    'message', 'x',
    'demands', jsonb_build_object('op','eq','args', jsonb_build_array(
      jsonb_build_object('op','previous','field', v_f_stage), jsonb_build_object('const','received')))));
  if (v_read ->> 'considered')::int <= 0 then
    raise exception '5c: the fix broke the node it was fixing — a gate with a good previous judges nothing';
  end if;
  raise notice '5c — a gate reading a field it never named is refused in words, and a good one still judges. PASS';

  -- ══ 6 — AND A MEMBER WHO WAS SHARED NOTHING CANNOT LOOK ═════════════════════════════
  perform set_config('request.jwt.claims', c_dana_j, true);
  begin
    perform custom.pipeline_gate_preview(v_org, v_quotes, 'Approved', v_gate);
    raise exception '6: a member shared nothing on this board previewed a rule against its cards';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg like '%6: a member shared%' then raise; end if;
  end;
  -- ...and the control, so the clause is not satisfied by a door that refuses her
  -- everything: she can still read the store's own vocabulary, which is nobody's data.
  if (select count(*) from custom.stage_rule_on_fail_kinds()) < 2 then
    raise exception '6: the control failed — this seat cannot reach a door that is open to everyone';
  end if;
  raise notice '6 — a member shared nothing is refused the preview, and still reaches what is hers. PASS';

  raise notice 'ALL PARTS PASSED';
end;
$t$;

rollback;
