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
  if exists (select 1 from pg_trigger where tgname = 'zzz_pipelines_on_entry') then
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
begin
  perform set_config('app.actor_system','campaign-test/pipelines_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'ZZ PL Red '||substr(v_org::text,1,8), 'zz-plr-'||substr(v_org::text,1,8), 'ZPR', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org,'organization',v_org,c_admin,'owner','active');
  insert into platform.knob_override (feature,key,scope_kind,scope_id,organization_id,value,set_note)
  values ('custom','system_enabled','organization',v_org,v_org,'true'::jsonb,'pipelines_red');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name','Home')) returning id into v_home;

  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name','ZZ PL Red Deal','slug','zz_plr_deal_'||substr(v_org::text,1,8),'type','entity',
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
  v_deal := custom.record_write(v_org, v_tbl, jsonb_build_object('name','Acme','stage','Lead'));

  -- 2a — THE WRONG SENTENCE. A jump that was never allowed is blamed on an empty column.
  v_ref := custom.pipeline_transition_refusal(v_org, v_deal, 'Won');
  if v_ref ->> 'kind' <> 'requires' then
    raise exception 'RED 2a IS NOT RED — the old bodies refused the jump with the % rule', v_ref ->> 'kind';
  end if;
  raise notice 'RED 2a IS RED — a deal in Lead trying to reach Won is told "%", which is true and useless: that move was never allowed and filling the column in would not have helped.',
    v_ref ->> 'why';

  -- 2b — THE SAME COLUMN, TWICE.
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
begin
  perform set_config('app.actor_system','campaign-test/pipelines_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'ZZ PL Red2 '||substr(v_org::text,1,8), 'zz-plr2-'||substr(v_org::text,1,8), 'ZPQ', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org,'organization',v_org,c_admin,'owner','active');
  insert into platform.knob_override (feature,key,scope_kind,scope_id,organization_id,value,set_note)
  values ('custom','system_enabled','organization',v_org,v_org,'true'::jsonb,'pipelines_red');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name','Home')) returning id into v_home;

  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name','ZZ PL Red2 Deal','slug','zz_plr2_deal_'||substr(v_org::text,1,8),'type','entity',
    'label_singular','Deal','label_plural','Deals','title_field','name','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','name')),
    'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('key','name','label','Name','plain','text','sort',10));
  v_fid := custom.field_declare(v_org, v_tbl, jsonb_build_object(
    'key','stage','label','Stage','type','list',
    'options', jsonb_build_array('Lead','Qualified','Proposal','Won','Lost'),'sort',25));

  select (f.data -> 'config' ->> 'options_table_id')::uuid into v_opts
    from custom.record f where f.organization_id = v_org and f.id = v_fid;
  select count(*) into v_n from custom.record o
   where o.organization_id = v_org and o.table_id = v_opts
     and o.metadata ->> 'option_position' is not null;
  if v_n <> 0 then
    raise exception 'RED 3 IS NOT RED — % options were stamped with a position after the inverse ran', v_n;
  end if;
  if custom.choice_options(v_org, v_opts) -> 'lead' ? 'position' then
    raise exception 'RED 3 IS NOT RED — choice_options still carries a position';
  end if;
  -- And with nothing to order by, every option of the list shares one instant.
  select count(distinct o.created_at) into v_n from custom.record o
   where o.organization_id = v_org and o.table_id = v_opts;
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
