-- LANE PIPELINES — THE GREEN SUITE. "Give me a board of deals by stage" (PRODUCTS.md row 7),
-- proved end to end on the MAIN database, in one transaction that ends in ROLLBACK.
--
-- RUN IT:
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the main database DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/pipelines_green.sql
--
-- ITS RED TWIN is `scripts/campaign-tests/pipelines_red.sql`, which runs the REAL BYTES of
-- this lane's inverses and asserts each defect exactly as it stood before the fix.
--
-- THE SEAT. Every asserted clause runs as `authenticated` — the role PostgREST gives a
-- signed-in person — through doors that person reaches. The only steps that leave the seat
-- are the organization, the memberships, the knobs and the Home record, and they assert
-- nothing while they are out.
--
-- WHAT MAKES IT FAIL — the production change, named, one per part:
--   1  drop `stage_field` off the Table, or the `previous` node out of `custom.rule_eval` →
--      a transition Rule can no longer speak about where the card came FROM, so every move
--      is judged as if the card had always been where it is going.
--   2  order the stages by anything but their declared position → the board draws Won first.
--   3  let the `requires` Rule answer before the `moves` Rule → an illegal jump is refused
--      with a true sentence about the wrong thing.
--   4  take `actor_at_least` out, or compare the level as a WORD → an owner is refused a move
--      an admin may make, because `owner` is not the string `admin`.
--   5  count the moving record in `stage_count` → a limit of two refuses the second card.
--   6  make `custom.pipeline_move` write the stage any way other than through
--      `custom.record_update` → the move stops appearing in the record's history.
--   7  let a viewer's drag through → the board becomes a suggestion.
--
-- A SECOND INPUT WITH A DIFFERENT EXPECTED VALUE IN EVERY PART: the refused move is paired
-- with the allowed one beside it; the member at viewer is paired with the same member after
-- she is made an editor; the over-limit card is paired with the one that fits.

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'pipelines_green.sql'
\set requires 'row:platform.feature_knob:feature = 'custom' and key = 'member_default_visibility''
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
  v_pipe    jsonb;
  v_read    jsonb;
  v_acme    uuid;
  v_globex  uuid;
  v_initech uuid;
  v_umbrella uuid;
  v_ref     jsonb;
  v_row     record;
  v_stages  text[];
  v_caught  text;
  v_n       integer;
  v_hist    integer;
begin
  perform set_config('app.actor_system', 'campaign-test/pipelines_green', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Meridian Software ' || substr(v_org::text, 1, 8),
          'meridian-software-' || substr(v_org::text, 1, 8), 'MSW', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_dana,  'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note) values
    ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'pipelines_green'),
    -- SHARED-ONLY ON PURPOSE. Under the shipped default a member already reaches every record
    -- in the organization at editor, so "the member at viewer cannot drag" would be testing
    -- nothing. On shared_only she reaches exactly what she is given, which is what makes the
    -- level she is given the thing under test.
    ('custom','member_default_visibility','organization', v_org, v_org, '"shared_only"'::jsonb, 'pipelines_green');

  -- The Home record is made by the onboarding path; no client door covers it.
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Home')) returning id into v_home;

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
  -- PART 1 — WHAT A PERSON SAYS, AND WHAT THEY GET.
  -- One table, one sentence's worth of pipeline, and a board exists.
  -- ════════════════════════════════════════════════════════════════════════════
  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name','Deals','slug','deals_' || substr(v_org::text, 1, 8),'type','entity',
    'label_singular','Deal','label_plural','Deals','title_field','name','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','name'),
                                jsonb_build_object('name','amount'),
                                jsonb_build_object('name','signed_proposal')),
    'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('key','name','label','Name','plain','text','sort',10));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('key','amount','label','Amount','plain','number','sort',20));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('key','signed_proposal','label','Signed proposal','plain','text','sort',30));

  v_pipe := custom.pipeline_declare(v_org, v_tbl, jsonb_build_object(
    'stage_field', jsonb_build_object('key','stage','label','Stage',
       'options', jsonb_build_array('Lead','Qualified','Proposal','Won','Lost')),
    'transitions', jsonb_build_array(
       jsonb_build_object('from','Lead','to','Qualified'),
       jsonb_build_object('from','Qualified','to','Proposal'),
       jsonb_build_object('from','Proposal','to','Won'),
       jsonb_build_object('from','Proposal','to','Lost')),
    'requires', jsonb_build_object('Won', jsonb_build_array('signed_proposal')),
    'who',      jsonb_build_object('Won', 'admin'),
    'limits',   jsonb_build_object('Proposal', 2)));

  if custom.table_stage_field(v_org, v_tbl) is distinct from 'stage' then
    raise exception '1a: the table does not know which column holds its stage — %',
      custom.table_stage_field(v_org, v_tbl);
  end if;
  if (select count(*) from jsonb_object_keys(v_pipe -> 'rules')) <> 4 then
    raise exception '1a: one sentence should have produced four Rules (moves, requires Won, who Won, limit Proposal) and produced %: %',
      (select count(*) from jsonb_object_keys(v_pipe -> 'rules')), v_pipe -> 'rules';
  end if;
  raise notice '1a PASSED — a stage column and % transition Rules exist from one declaration: %',
    (select count(*) from jsonb_object_keys(v_pipe -> 'rules')), v_pipe -> 'said';

  -- 1b — THE STAGES COME BACK IN THE ORDER THE PERSON WROTE THEM.
  v_read := custom.pipeline_read(v_org, v_tbl);
  select array_agg(s ->> 'label' order by ord) into v_stages
    from jsonb_array_elements(v_read -> 'stages') with ordinality as t(s, ord);
  if v_stages is distinct from array['Lead','Qualified','Proposal','Won','Lost'] then
    raise exception '1b: the board would draw its columns as %, and the person wrote Lead, Qualified, Proposal, Won, Lost',
      v_stages;
  end if;
  raise notice '1b PASSED — the board draws %, which is the order it was written in.', array_to_string(v_stages, ' - ');

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 2 — THE REFUSED MOVE AND THE ALLOWED MOVE, side by side.
  -- ════════════════════════════════════════════════════════════════════════════
  v_acme := custom.record_write(v_org, v_tbl, jsonb_build_object('name','Priya Anand','amount',5000,'stage','Lead'));

  -- 2a — ASKED BEFORE THE FINGER LETS GO. A board greys a column from this answer.
  v_ref := custom.pipeline_transition_refusal(v_org, v_acme, 'Won');
  if (v_ref ->> 'allowed')::boolean then
    raise exception '2a: a deal in Lead was told it could go straight to Won';
  end if;
  if v_ref ->> 'kind' <> 'moves' then
    raise exception '2a: THE DEFECT THIS LANE FIXED — the card was refused by the % rule. A jump that was never allowed must be refused for BEING a jump, not for a column that would not have helped. Said: %',
      v_ref ->> 'kind', v_ref ->> 'why';
  end if;
  if v_ref ->> 'why' !~* 'not a move this deal can make' then
    raise exception '2a: the sentence a person would read is %', v_ref ->> 'why';
  end if;
  v_ref := custom.pipeline_transition_refusal(v_org, v_acme, 'Qualified');
  if not (v_ref ->> 'allowed')::boolean then
    raise exception '2a: the move the pipeline DOES allow was refused: %', v_ref ->> 'why';
  end if;
  raise notice '2a PASSED — Lead to Won is refused ("%"), Lead to Qualified is allowed, both answered before anything moved.',
    (custom.pipeline_transition_refusal(v_org, v_acme, 'Won') ->> 'why');

  -- 2b — AND THE STORE ITSELF REFUSES IT, not only the preview. The preview and the
  -- enforcement are the same Rules through the same evaluator, and this is where that is
  -- proved rather than asserted.
  begin
    perform custom.pipeline_move(v_org, v_acme, 'Won');
    raise exception '2b: the store let a deal jump from Lead to Won';
  exception when check_violation then
    v_caught := sqlerrm;
  end;
  if v_caught !~* 'not a move this deal can make' then
    raise exception '2b: the store refused, and said something other than what the preview said: %', v_caught;
  end if;
  perform custom.pipeline_move(v_org, v_acme, 'Qualified');
  perform custom.pipeline_move(v_org, v_acme, 'Proposal');
  raise notice '2b PASSED — the store refuses the same move, in the same words, and the two legal moves landed.';

  -- 2c — WHAT THE STAGE NEEDS, and the columns named so a screen can ASK for them.
  v_ref := custom.pipeline_transition_refusal(v_org, v_acme, 'Won');
  if (v_ref ->> 'allowed')::boolean or v_ref ->> 'kind' <> 'requires' then
    raise exception '2c: a deal in Proposal with no signed proposal was not stopped by the requires rule: %', v_ref;
  end if;
  if jsonb_array_length(v_ref -> 'missing') <> 1
     or (v_ref -> 'missing' -> 0 ->> 'label') <> 'Signed proposal' then
    raise exception '2c: the screen cannot prompt for what is missing — it was told %', v_ref -> 'missing';
  end if;
  begin
    perform custom.pipeline_move(v_org, v_acme, 'Won');
    raise exception '2c: Won landed with no signed proposal';
  exception when check_violation then
    v_caught := sqlerrm;
  end;
  if v_caught !~* 'Nothing moves to Won until Signed proposal is filled in' then
    raise exception '2c: the refusal did not say, in plain words, what is missing: %', v_caught;
  end if;
  raise notice '2c PASSED — "%" and the screen is told exactly which column to ask for (%).',
    v_caught, v_ref -> 'missing' -> 0 ->> 'label';

  -- 2d — SIGN IT, AND THE SAME MOVE LANDS. One record, one difference, two answers.
  perform custom.pipeline_move(v_org, v_acme, 'Won',
                               jsonb_build_object('signed_proposal','signed 2026-09-20'));
  if (custom.read_record(v_org, v_acme, true) -> 'document' ->> 'stage') <> 'Won' then
    raise exception '2d: the signed deal did not land in Won — it reads %',
      custom.read_record(v_org, v_acme, true) -> 'document' ->> 'stage';
  end if;
  -- 2e — AND THE MOVE IS IN THE RECORD'S HISTORY, because a move IS a write.
  select count(*) into v_hist from custom.record_history(v_org, v_acme, 50, 0);
  if v_hist < 4 then
    raise exception '2e: a deal moved three times and signed once, and its history holds % rows', v_hist;
  end if;
  raise notice '2d/2e PASSED — the signed deal is in Won, and its % history rows carry every move.', v_hist;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 3 — HOW MANY FIT IN A COLUMN AT ONCE.
  -- ════════════════════════════════════════════════════════════════════════════
  v_globex  := custom.record_write(v_org, v_tbl, jsonb_build_object('name','Globex','amount',2000,'stage','Lead'));
  v_initech := custom.record_write(v_org, v_tbl, jsonb_build_object('name','Initech','amount',750,'stage','Lead'));
  perform custom.pipeline_move(v_org, v_globex, 'Qualified');
  perform custom.pipeline_move(v_org, v_globex, 'Proposal');    -- Proposal now holds ONE
  perform custom.pipeline_move(v_org, v_initech, 'Qualified');
  perform custom.pipeline_move(v_org, v_initech, 'Proposal');   -- Proposal now holds TWO — its limit
  raise notice '3a PASSED — two deals fit in Proposal, which is exactly the limit (the mover is not counted against it).';

  -- 3b — AND THE THIRD IS STOPPED, in the column's own words.
  v_umbrella := custom.record_write(v_org, v_tbl, jsonb_build_object('name','Umbrella','amount',400,'stage','Lead'));
  perform custom.pipeline_move(v_org, v_umbrella, 'Qualified');
  v_ref := custom.pipeline_transition_refusal(v_org, v_umbrella, 'Proposal');
  if (v_ref ->> 'allowed')::boolean or v_ref ->> 'kind' <> 'limit' then
    raise exception '3b: a third deal was told it could join a column that takes two: %', v_ref;
  end if;
  begin
    perform custom.pipeline_move(v_org, v_umbrella, 'Proposal');
    raise exception '3b: a third deal landed in a column that takes two';
  exception when check_violation then
    v_caught := sqlerrm;
  end;
  if v_caught !~* 'as many as it takes at once' then
    raise exception '3b: the column stopped it and said %', v_caught;
  end if;
  raise notice '3b PASSED — the third deal is stopped: "%"', v_caught;

  perform custom.record_update(v_org, v_globex, jsonb_build_object('amount', 2500));
  raise notice '3c PASSED — editing a deal that is already in a full column is not a move, and is not refused.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 4 — THE BOARD'S OWN NUMBERS.
  -- ════════════════════════════════════════════════════════════════════════════
  select count(*) into v_n from custom.pipeline_board(v_org, v_tbl, 'amount');
  if v_n <> 5 then
    raise exception '4a: the board has % columns and the pipeline has five stages', v_n;
  end if;
  select * into v_row from custom.pipeline_board(v_org, v_tbl, 'amount') where stage_key = 'proposal';
  if v_row.cards <> 2 or v_row.total <> 3250 or v_row.wip_limit <> 2 then
    raise exception '4a: Proposal reads % cards totalling % with a limit of %, and holds Globex (2500) and Initech (750) against a limit of 2',
      v_row.cards, v_row.total, v_row.wip_limit;
  end if;
  select * into v_row from custom.pipeline_board(v_org, v_tbl, 'amount') where stage_key = 'won';
  if v_row.cards <> 1 or v_row.total <> 5000 then
    raise exception '4a: Won reads % cards totalling %', v_row.cards, v_row.total;
  end if;
  raise notice '4a PASSED — the column headings carry their count AND the total of the measure: Proposal 2 / 3250 against a limit of 2, Won 1 / 5000.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 5 — THE SECOND SEAT. The same board, the same store, a different person.
  -- ════════════════════════════════════════════════════════════════════════════
  -- She is given the Proposal deal to LOOK AT and nothing more. Still seated; only the
  -- claims move, which is exactly what changes when a different person signs in.
  perform custom.share_grant(v_org, v_globex, 'person', c_dana, 'viewer'::public.permission_level);
  perform set_config('request.jwt.claims', c_dana_j, true);

  -- 5a — SHE SEES THE BOARD. A viewer who could not see it would have nothing to be
  -- refused about, so this is the control that makes 5b mean something.
  if (custom.read_record(v_org, v_globex, true) -> 'document' ->> 'name') <> 'Globex' then
    raise exception '5a: the member cannot see the deal she was shown';
  end if;
  v_ref := custom.pipeline_transition_refusal(v_org, v_globex, 'Won');
  if (v_ref ->> 'allowed')::boolean then
    raise exception '5a: the board told a viewer she could drag this card to Won';
  end if;
  raise notice '5a PASSED — the member sees the board, and it tells her the card cannot go there: "%"', v_ref ->> 'why';

  -- 5b — AND THE STORE REFUSES HER DRAG. A greyed column that the store would have
  -- accepted anyway is a screen telling a comfortable lie.
  begin
    perform custom.pipeline_move(v_org, v_globex, 'Won',
                                 jsonb_build_object('signed_proposal','she signed it herself'));
    raise exception '5b: a viewer moved a deal to Won';
  exception when others then
    v_caught := sqlerrm;
  end;
  raise notice '5b PASSED — the member at viewer is refused the move, and told why: "%"', v_caught;

  -- 5c — MAKE HER AN EDITOR AND THE SAME DRAG STILL STOPS AT WON, because Won asks for
  -- admin BY NAME. Two different refusals, one for not being allowed to touch the record at
  -- all and one for not being senior enough to close a deal, and they say different things.
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform custom.share_grant(v_org, v_globex, 'person', c_dana, 'editor'::public.permission_level);
  perform set_config('request.jwt.claims', c_dana_j, true);

  perform custom.record_update(v_org, v_globex, jsonb_build_object('amount', 2600));
  begin
    perform custom.pipeline_move(v_org, v_globex, 'Won',
                                 jsonb_build_object('signed_proposal','signed 2026-09-20'));
    raise exception '5c: an editor closed a deal that only an admin may close';
  exception when check_violation then
    v_caught := sqlerrm;
  end;
  if v_caught !~* 'admin rights on this deal' then
    raise exception '5c: she was stopped, and told something other than the reason: %', v_caught;
  end if;
  raise notice '5c PASSED — as an editor she can change the deal but not close it: "%"', v_caught;

  -- 5d — THE ADMIN MAKES THE SAME MOVE AND IT LANDS. Same record, same patch, different person.
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform custom.pipeline_move(v_org, v_globex, 'Won',
                               jsonb_build_object('signed_proposal','signed 2026-09-20'));
  if (custom.read_record(v_org, v_globex, true) -> 'document' ->> 'stage') <> 'Won' then
    raise exception '5d: the admin could not make the move either';
  end if;
  raise notice '5d PASSED — the same move, by an admin, lands. The rule is about the rung, not about the words.';

  raise notice 'ALL PARTS PASSED — a board of deals by stage: declared in one sentence, drawn in the declared order, judged on every move, counted and totalled per column, and answering two different people differently.';
end
$t$;

rollback;
