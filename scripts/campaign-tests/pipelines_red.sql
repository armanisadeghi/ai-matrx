-- LANE PIPELINES — THE RED TWIN of scripts/campaign-tests/pipelines_green.sql.
--
-- Each block RUNS THE REAL BYTES of one of this lane's inverse migrations and then asserts
-- the defect exactly as it stood before that file was applied. A red twin that asserted a
-- hand-written imitation of the old body would prove that the imitation was broken, which is
-- not the same thing as proving the fix was needed.
--
-- EVERY BLOCK ENDS IN ROLLBACK. Nothing here reaches the database past its own transaction,
-- and the last block re-reads the live catalogue to prove it.
--
-- RUN IT from the repository root (the \i paths are relative to it):
--   "$PSQL" "<the main database DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/pipelines_red.sql

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'pipelines_red.sql'
\set requires 'grant:authenticated:custom.table_declare'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

-- ═══════════════════════════════════════════════════════════════════════════════
-- RED 1 — BEFORE `pipelines_a_stage_is_a_field_and_its_moves_are_rules.sql`:
-- a Rule could not speak about where a card came FROM, and there was no board at all.
-- ═══════════════════════════════════════════════════════════════════════════════
begin;
\i migrations/inverse/pipelines_an_options_position_is_system_state_down.sql
\i migrations/inverse/pipelines_a_choice_list_keeps_the_order_it_was_written_in_down.sql
\i migrations/inverse/pipelines_the_board_speaks_in_order_and_in_the_right_words_down.sql
\i migrations/inverse/pipelines_a_stage_is_a_field_and_its_moves_are_rules_down.sql
do $t$
declare v_n integer;
begin
  select count(*) into v_n from custom.rule_node_kinds()
   where node in ('previous', 'actor_at_least', 'stage_count');
  if v_n <> 0 then
    raise exception 'RED 1 IS NOT RED — the three nodes are still in the language after the inverse ran';
  end if;
  if exists (select 1 from pg_proc where pronamespace = 'custom'::regnamespace
              and proname in ('pipeline_declare','pipeline_move','pipeline_board',
                              'pipeline_read','pipeline_transition_refusal','table_stage_field')) then
    raise exception 'RED 1 IS NOT RED — a pipeline door survived its own inverse';
  end if;
  if exists (select 1 from pg_trigger where tgname = 'zzz_pipelines_on_entry') then  -- matrx-real-data:allow zzz_pipelines_on_entry is the real live trigger name from migrations/campaign/pipelines_a_stage_is_a_field_and_its_moves_are_rules.sql, not fixture data
    raise exception 'RED 1 IS NOT RED — the entry trigger survived its own inverse';
  end if;
  raise notice 'RED 1 IS RED — with this lane undone there is no stage field, no board, no move door, and a Rule cannot ask what a record USED to say. "Give me a board of deals by stage" has nowhere to land.';
end
$t$;
rollback;

-- ═══════════════════════════════════════════════════════════════════════════════
-- RED 2 — BEFORE `pipelines_the_board_speaks_in_order_and_in_the_right_words.sql`:
-- an illegal jump was refused with a true sentence about the wrong thing, the missing
-- columns were listed twice, and every generated sentence talked about the stage COLUMN.
-- ═══════════════════════════════════════════════════════════════════════════════
begin;
\i migrations/inverse/pipelines_an_options_position_is_system_state_down.sql
\i migrations/inverse/pipelines_a_choice_list_keeps_the_order_it_was_written_in_down.sql
\i migrations/inverse/pipelines_the_board_speaks_in_order_and_in_the_right_words_down.sql
do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org  uuid := gen_random_uuid();
  v_home uuid; v_tbl uuid; v_deal uuid; v_ref jsonb; v_pipe jsonb;
  v_n    integer;
  v_boss constant text := current_user;
begin
  perform set_config('app.actor_system','campaign-test/pipelines_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Meridian Software '||substr(v_org::text,1,8), 'meridian-software-'||substr(v_org::text,1,8), 'MSW', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org,'organization',v_org,c_admin,'owner','active');
  insert into platform.knob_override (feature,key,scope_kind,scope_id,organization_id,value,set_note)
  values ('custom','system_enabled','organization',v_org,v_org,'true'::jsonb,'pipelines_red');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name','Home')) returning id into v_home;

  -- THE SEAT. Everything asserted below runs as the role PostgREST gives a signed-in
  -- person, through doors that person reaches — a red twin that ran as the role owning
  -- custom.record would prove the defect for a caller nobody has.
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'this block did not take the seat — current_user is %', current_user;
  end if;
  begin
    perform 1 from custom.record limit 1;
    raise exception 'this seat can SELECT custom.record directly, so it is not a client seat';
  exception when insufficient_privilege then null;
  end;

  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name','Deals','slug','deals_'||substr(v_org::text,1,8),'type','entity',
    'label_singular','Deal','label_plural','Deals','title_field','name','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','name'), jsonb_build_object('name','signed_proposal')),
    'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('key','name','label','Name','plain','text','sort',10));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('key','signed_proposal','label','Signed proposal','plain','text','sort',20));

  v_pipe := custom.pipeline_declare(v_org, v_tbl, jsonb_build_object(
    'stage_field', jsonb_build_object('key','stage','label','Stage',
       'options', jsonb_build_array('Lead','Qualified','Proposal','Won')),
    'transitions', jsonb_build_array(
       jsonb_build_object('from','Lead','to','Qualified'),
       jsonb_build_object('from','Qualified','to','Proposal'),
       jsonb_build_object('from','Proposal','to','Won')),
    'requires', jsonb_build_object('Won', jsonb_build_array('signed_proposal'))));
  v_deal := custom.record_write(v_org, v_tbl, jsonb_build_object('name','Priya Anand','stage','Lead'));

  -- 2a — NOTHING DECIDED WHICH REFUSAL A PERSON READ. A deal in Lead trying to reach Won
  -- breaks TWO rules — it is not a move this deal can make, AND Won demands a column that
  -- is empty — and only one sentence can be shown. With the old bodies no Rule carried a
  -- `sort` at all, so `custom.table_rules` fell through to `created_at` (identical: one
  -- transaction) and then to a RANDOM uuid. Which is worse than always saying the wrong
  -- thing: the same jump could be blamed on an empty column one day and on the move the
  -- next. `custom.record` is the CATALOGUE of this clause and no client door covers a
  -- Rule's sort, so this one fact steps OUT of the seat and asserts nothing about the
  -- product while it is out.
  perform set_config('role', v_boss, true);
  select count(*) into v_n
    from custom.record r
   where r.organization_id = v_org
     and r.table_id = custom.rule_kernel_id()
     and r.deleted_at is null
     and (r.data #>> '{pipeline,stage_field_of}')::uuid = v_tbl
     and (r.data -> 'sort') is not null;
  perform set_config('role', 'authenticated', true);
  if v_n <> 0 then
    raise exception 'RED 2a IS NOT RED — % of the old bodies'' rules carry a sort, so the order was decided after all', v_n;
  end if;
  v_ref := custom.pipeline_transition_refusal(v_org, v_deal, 'Won');
  raise notice 'RED 2a IS RED — not one of this pipeline''s rules carries a sort, so which refusal a person reads is decided by a random uuid. This run said "%".',
    v_ref ->> 'why';

  -- 2b — THE SAME COLUMN, TWICE. Asked from Proposal, where the ONLY thing standing in
  -- the way is the empty column, so the clause is about the duplicate and nothing else.
  perform custom.pipeline_move(v_org, v_deal, 'Qualified');
  perform custom.pipeline_move(v_org, v_deal, 'Proposal');
  v_ref := custom.pipeline_transition_refusal(v_org, v_deal, 'Won');
  if v_ref ->> 'kind' <> 'requires' then
    raise exception 'RED 2b IS NOT RED — a deal in Proposal with nothing signed was refused by the % rule', v_ref ->> 'kind';
  end if;
  if jsonb_array_length(v_ref -> 'missing') < 2 then
    raise exception 'RED 2b IS NOT RED — the missing list holds % entries', jsonb_array_length(v_ref -> 'missing');
  end if;
  raise notice 'RED 2b IS RED — the screen is handed % entries for ONE empty column (%), so a person would be prompted for it twice.',
    jsonb_array_length(v_ref -> 'missing'), v_ref -> 'missing' -> 0 ->> 'label';

  -- 2c — TALKING ABOUT THE COLUMN INSTEAD OF THE DEAL.
  if (custom.pipeline_read(v_org, v_tbl) -> 'rules') ::text !~ 'What a stage needs' then
    raise exception 'RED 2c IS NOT RED — the old rule names do not talk about the stage column';
  end if;
  raise notice 'RED 2c IS RED — the Rule a person opens is called "What a stage needs before it reaches Won", which is about the column and not about the deal.';
end
$t$;
rollback;

-- ═══════════════════════════════════════════════════════════════════════════════
-- RED 3 — BEFORE `pipelines_a_choice_list_keeps_the_order_it_was_written_in.sql`:
-- a list of choices carried no position at all, so nothing could order it.
-- ═══════════════════════════════════════════════════════════════════════════════
begin;
\i migrations/inverse/pipelines_an_options_position_is_system_state_down.sql
\i migrations/inverse/pipelines_a_choice_list_keeps_the_order_it_was_written_in_down.sql
do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org  uuid := gen_random_uuid();
  v_home uuid; v_tbl uuid; v_fid uuid; v_opts uuid; v_n integer;
  v_boss constant text := current_user;
begin
  perform set_config('app.actor_system','campaign-test/pipelines_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Meridian Software — Denver Office '||substr(v_org::text,1,8), 'meridian-software-denver-'||substr(v_org::text,1,8), 'MSD', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org,'organization',v_org,c_admin,'owner','active');
  insert into platform.knob_override (feature,key,scope_kind,scope_id,organization_id,value,set_note)
  values ('custom','system_enabled','organization',v_org,v_org,'true'::jsonb,'pipelines_red');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name','Home')) returning id into v_home;

  -- THE SEAT. Everything asserted below runs as the role PostgREST gives a signed-in
  -- person, through doors that person reaches — a red twin that ran as the role owning
  -- custom.record would prove the defect for a caller nobody has.
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'this block did not take the seat — current_user is %', current_user;
  end if;
  begin
    perform 1 from custom.record limit 1;
    raise exception 'this seat can SELECT custom.record directly, so it is not a client seat';
  exception when insufficient_privilege then null;
  end;

  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name','Deals','slug','deals_'||substr(v_org::text,1,8),'type','entity',
    'label_singular','Deal','label_plural','Deals','title_field','name','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','name')),
    'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('key','name','label','Name','plain','text','sort',10));
  v_fid := custom.field_declare(v_org, v_tbl, jsonb_build_object(
    'key','stage','label','Stage','type','list',
    'options', jsonb_build_array('Lead','Qualified','Proposal','Won','Lost'),'sort',25));

  -- THE PRODUCT CLAUSE, FROM THE SEAT, through the door a screen actually asks:
  -- not one of this list's five choices carries the position it was written in.
  select count(*) into v_n from custom.field_options(v_org, v_fid) o
   where o.metadata ->> 'option_position' is not null;
  if v_n <> 0 then
    raise exception 'RED 3 IS NOT RED — % options were stamped with a position after the inverse ran', v_n;
  end if;
  select count(*) into v_n from custom.field_options(v_org, v_fid) o;
  if v_n <> 5 then
    raise exception 'RED 3 IS NOT RED — the list has % choices, not five', v_n;
  end if;
  -- And there is nothing else to order by. The catalogue is not covered by any client
  -- door, so this one fact STEPS OUT of the seat and asserts nothing about the product
  -- while it is out.
  perform set_config('role', v_boss, true);
  select (f.data -> 'config' ->> 'options_table_id')::uuid into v_opts
    from custom.record f where f.organization_id = v_org and f.id = v_fid;
  select count(distinct o.created_at) into v_n from custom.record o
   where o.organization_id = v_org and o.table_id = v_opts;
  perform set_config('role', 'authenticated', true);
  if v_n <> 1 then
    raise exception 'RED 3 IS NOT RED — the five options were written at % different instants, so created_at could have ordered them', v_n;
  end if;
  raise notice 'RED 3 IS RED — a five-stage list carries no position anywhere, and all five options share ONE created_at, so the only thing left to sort by is a random uuid. That is every dropdown in the platform, not only a board.';
end
$t$;
rollback;

-- ═══════════════════════════════════════════════════════════════════════════════
-- THE ROLLBACKS HELD.
-- ═══════════════════════════════════════════════════════════════════════════════
do $t$
declare v_n integer;
begin
  select count(*) into v_n from custom.rule_node_kinds()
   where node in ('previous', 'actor_at_least', 'stage_count');
  if v_n <> 3 then
    raise exception 'ROLLBACK DID NOT HOLD — the language is missing % of the three nodes', 3 - v_n;
  end if;
  select count(*) into v_n from pg_proc where pronamespace = 'custom'::regnamespace
     and proname in ('pipeline_declare','pipeline_move','pipeline_board','pipeline_read',
                     'pipeline_transition_refusal','table_stage_field');
  if v_n <> 6 then
    raise exception 'ROLLBACK DID NOT HOLD — % of the six doors are live', v_n;
  end if;
  if not exists (select 1 from platform.metadata_reserved_keys
                  where table_token = 'record' and key = 'option_position') then
    raise exception 'ROLLBACK DID NOT HOLD — option_position is no longer a declared metadata key';
  end if;
  raise notice 'ROLLBACK VERIFIED — the three nodes, the six doors, the entry trigger and the metadata declaration are all live on this database, exactly as they were before this file ran.';
end
$t$;
