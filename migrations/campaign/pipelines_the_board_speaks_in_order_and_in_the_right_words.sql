-- chair-step: it REPLACES four bodies this lane created and ledgered forty minutes earlier
--   (`custom._pipeline_rule`, `custom.pipeline_declare`, `custom.pipeline_read`,
--   `custom.pipeline_transition_refusal`), whose prior bytes are pinned by the `-- based-on:`
--   lines below. It grants nothing new, creates no trigger, drops nothing and touches no row
--   of any organization. `custom._pipeline_rule` gains a defaulted argument, so the old
--   nine-argument signature keeps existing and nothing that called it breaks. The inverse is
--   `migrations/inverse/pipelines_the_board_speaks_in_order_and_in_the_right_words_down.sql`.
-- guard: custom/system_enabled
-- based-on: custom.pipeline_read(uuid, uuid) 594f3e76a229cc320fd6cd8e13562c76e6efca7a079832168f123ac841f89880
-- based-on: custom.pipeline_declare(uuid, uuid, jsonb) 119fe68e4e1fe90763b2936233b8cd029a7e9818f6d8cb0f017d6e7685cef223
-- based-on: custom.pipeline_transition_refusal(uuid, uuid, text) 2310c556a676eb9650f5fb20ee73cb3d11df7cb540892f859126abf044b83d2e
-- based-on: custom._pipeline_rule(uuid, uuid, text, text, text, text, jsonb, jsonb, jsonb) 2953d47dde3b24f6814f19e790e5eb88ba3afca0e4b0955fcc5732462474d73b
--
-- PIPELINES — FOUR DEFECTS THE FIRST REAL BOARD FOUND, measured on the main database at
-- 19:47Z on 2026-09-20 by declaring an actual five-stage deal pipeline and moving a deal
-- through it. None of them was visible from reading the code.
--
-- 1. THE BOARD DREW ITS COLUMNS IN NO ORDER AT ALL. `custom.choice_options` answers a jsonb
--    OBJECT, and a jsonb object has no order — Postgres stores its keys sorted by length and
--    then by bytes. A person who declared Lead · Qualified · Proposal · Won · Lost got a board
--    reading Won · Lead · Lost · Proposal · Qualified. `custom.pipeline_read` now reads the
--    option RECORDS, oldest first, which is the order they were declared in.
--
-- 2. "NOTHING MOVES TO WON UNTIL SIGNED PROPOSAL IS FILLED IN" was the sentence a deal got
--    when it tried to jump from Qualified straight to Won — a true sentence about the wrong
--    thing, because that move was never allowed in the first place and filling the column in
--    would not have helped. Refusals now speak in order: where a card can go (10), who may
--    move it (20), how many fit (30), what the stage needs (40).
--
-- 3. THE MISSING COLUMNS WERE LISTED TWICE. `jsonb_path_query` with `$.**` matches the same
--    leaf at more than one depth. A person shown "Signed proposal, Signed proposal" would
--    reasonably conclude there were two of them.
--
-- 4. THE RULES TALKED ABOUT THE COLUMN INSTEAD OF THE THING. Every generated name and message
--    said "this stage" ("What a stage needs before it reaches Won") because it was built from
--    the stage COLUMN's label. It is built from the Table's own `label_singular` now, so it
--    says "What a deal needs before it reaches Won".

create or replace function custom._pipeline_rule(p_organization_id uuid, p_table_id uuid,
                                                 p_kind text, p_stage text, p_name text,
                                                 p_message text, p_uses jsonb, p_expr jsonb,
                                                 p_on_entry jsonb, p_sort integer default 0)
  returns uuid language plpgsql set search_path = pg_catalog as $fn$
declare
  v_spec jsonb;
  v_id   uuid;
begin
  v_spec := jsonb_build_object(
    'name', p_name, 'message', p_message, 'kind', 'predicate',
    'uses', p_uses, 'scope_table_id', p_table_id, 'applies_to_types', '[]'::jsonb,
    'expr', p_expr, 'sort', p_sort,
    'pipeline', jsonb_build_object('kind', p_kind, 'stage', p_stage, 'stage_field_of', p_table_id));
  if p_on_entry is not null then
    v_spec := jsonb_set(v_spec, '{on_entry}', p_on_entry);
  end if;
  select r.id into v_id
    from custom.record r
   where r.organization_id = p_organization_id
     and r.table_id = custom.rule_kernel_id()
     and r.deleted_at is null
     and (r.data #>> '{pipeline,stage_field_of}')::uuid = p_table_id
     and r.data #>> '{pipeline,kind}' = p_kind
     and coalesce(r.data #>> '{pipeline,stage}', '') is not distinct from coalesce(p_stage, '');
  return custom.rule_declare(p_organization_id, v_spec, v_id);
end;
$fn$;
create or replace function custom.pipeline_declare(p_organization_id uuid, p_table_id uuid, p_spec jsonb)
  returns jsonb language plpgsql security definer set search_path = pg_catalog as $fn$
declare
  v_field_spec jsonb := coalesce(p_spec -> 'stage_field', '{}'::jsonb);
  v_key        text  := nullif(v_field_spec ->> 'key', '');
  v_label      text  := coalesce(nullif(v_field_spec ->> 'label', ''), 'Stage');
  v_options    jsonb := coalesce(v_field_spec -> 'options', '[]'::jsonb);
  v_field_id   uuid;
  v_stage      text;
  v_skey       text;
  v_rule_ids   jsonb := '{}'::jsonb;
  v_made       jsonb := '[]'::jsonb;
  v_expr       jsonb;
  v_arms       jsonb;
  v_one        jsonb;
  v_req        jsonb;
  v_reqid      uuid;
  v_who        text;
  v_limit      integer;
  v_stages     text[];
  v_noun       text;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.pipeline_declare');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.pipeline_declare');
  -- A pipeline decides what a Table will accept, so declaring one is an admin act on that
  -- Table — the same rung custom.field_declare and custom.rule_declare ask for.
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.pipeline_declare',
                                          'admin'::public.permission_level, 'table');

  -- THE WORD A PERSON USES FOR ONE OF THESE. The Table already carries it
  -- (`label_singular`), and a refusal that said "this stage" instead of "this deal"
  -- would be talking about the column rather than about the thing on the card.
  select lower(coalesce(nullif(t.data ->> 'label_singular', ''), nullif(t.data ->> 'name', ''), 'record'))
    into v_noun
    from custom.record t
   where t.organization_id = p_organization_id and t.id = p_table_id
     and t.table_id = custom.table_kernel_id() and t.deleted_at is null;

  if v_key is null then
    raise exception 'a pipeline has to say which column holds the stage'
      using errcode = '22004',
            hint = 'stage_field: {"key":"stage","label":"Stage","options":["Lead","Qualified","Won"]}. The options become the board''s columns, in the order they are written.';
  end if;

  select f.id into v_field_id
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = p_table_id
     and f.data ->> 'key' = v_key;

  if v_field_id is null then
    if jsonb_typeof(v_options) <> 'array' or jsonb_array_length(v_options) < 2 then
      raise exception 'a pipeline needs at least two stages — one column is not a board'
        using errcode = '22004',
              hint = 'stage_field.options lists the stages in the order they should appear on the board.';
    end if;
    v_field_id := custom.field_declare(p_organization_id, p_table_id, jsonb_build_object(
      'key', v_key, 'label', v_label, 'type', 'list', 'options', v_options,
      'sort', coalesce((v_field_spec ->> 'sort')::integer, 25)));
    v_made := v_made || to_jsonb(format('a %s column with %s stages', v_noun,
                                        jsonb_array_length(v_options)));
  end if;

  -- The stages, in the order the board draws them, as the WORDS a person wrote.
  select array_agg(o #>> '{}' order by ord) into v_stages
    from jsonb_array_elements(v_options) with ordinality as t(o, ord);
  if v_stages is null then
    select array_agg(v_opt.label order by v_opt.ord) into v_stages
      from (select v ->> 'label' as label, ord
              from jsonb_each(custom.choice_options(p_organization_id,
                     (select (f.data -> 'config' ->> 'options_table_id')::uuid from custom.record f
                       where f.organization_id = p_organization_id and f.id = v_field_id)))
                   with ordinality as t(k, v, ord)) v_opt;
  end if;

  -- THE TABLE NAMES IT. Written the same way `type_field` is written.
  update custom.record
     set data = jsonb_set(data, '{stage_field}', to_jsonb(v_key)), updated_at = now(), version = version + 1
   where organization_id = p_organization_id
     and id = p_table_id
     and table_id = custom.table_kernel_id()
     and deleted_at is null
     and coalesce(data ->> 'stage_field', '') is distinct from v_key;

  -- ── THE MOVES RULE. ────────────────────────────────────────────────────────────────
  -- "Staying where you are" is always allowed, because most writes to a deal are not moves
  -- at all and a rule that refused them would refuse editing the price.
  if jsonb_typeof(p_spec -> 'transitions') = 'array' and jsonb_array_length(p_spec -> 'transitions') > 0 then
    v_arms := jsonb_build_array(
      jsonb_build_object('op', 'eq', 'args', jsonb_build_array(
        jsonb_build_object('field', v_field_id),
        jsonb_build_object('op', 'previous', 'field', v_field_id))),
      -- A record that held no stage at all is arriving, not moving.
      jsonb_build_object('op', 'not', 'args', jsonb_build_array(
        jsonb_build_object('op', 'present', 'args', jsonb_build_array(
          jsonb_build_object('op', 'previous', 'field', v_field_id))))));
    for v_one in select t from jsonb_array_elements(p_spec -> 'transitions') t loop
      v_arms := v_arms || jsonb_build_object('op', 'and', 'args', jsonb_build_array(
        jsonb_build_object('op', 'eq', 'args', jsonb_build_array(
          jsonb_build_object('op', 'previous', 'field', v_field_id),
          jsonb_build_object('const', to_jsonb(custom._pipeline_stage_key(
            p_organization_id, v_field_id, v_one ->> 'from'))))),
        jsonb_build_object('op', 'eq', 'args', jsonb_build_array(
          jsonb_build_object('field', v_field_id),
          jsonb_build_object('const', to_jsonb(custom._pipeline_stage_key(
            p_organization_id, v_field_id, v_one ->> 'to')))))));
    end loop;
    v_rule_ids := v_rule_ids || jsonb_build_object('moves',
      custom._pipeline_rule(p_organization_id, p_table_id, 'moves', null,
        format('Where a %s can go next', v_noun),
        coalesce(nullif(p_spec ->> 'moves_message', ''),
                 format('That is not a move this %s can make from where it is.', v_noun)),
        jsonb_build_array('validate'),
        jsonb_build_object('op', 'or', 'args', v_arms), null, 10));
    v_made := v_made || to_jsonb(format('%s allowed moves', jsonb_array_length(p_spec -> 'transitions')));
  end if;

  -- ── ONE RULE PER STAGE THAT DEMANDS SOMETHING, so the refusal is that stage's own ──
  -- sentence rather than a catalogue of every stage's demands.
  foreach v_stage in array v_stages loop
    v_skey := custom._pipeline_stage_key(p_organization_id, v_field_id, v_stage);

    v_req := coalesce(p_spec -> 'requires' -> v_stage, p_spec -> 'requires' -> v_skey);
    if jsonb_typeof(v_req) = 'array' and jsonb_array_length(v_req) > 0 then
      v_arms := jsonb_build_array();
      for v_one in select t from jsonb_array_elements(v_req) t loop
        select f.id into v_reqid
          from custom.record f
         where f.organization_id = p_organization_id
           and f.table_id = custom.field_kernel_id()
           and f.deleted_at is null
           and (f.data ->> 'entity_definition_id')::uuid = p_table_id
           and f.data ->> 'key' = (v_one #>> '{}');
        if v_reqid is null then
          raise exception 'this pipeline says a % needs % filled in, and there is no such column on this table',
                          v_noun, v_one #>> '{}'
            using errcode = '23503',
                  hint = 'requires names columns by their key. Add the column first, or correct the key.';
        end if;
        v_arms := v_arms || jsonb_build_object('op', 'present', 'args',
                              jsonb_build_array(jsonb_build_object('field', v_reqid)));
      end loop;
      -- "If it is arriving in this stage, then everything this stage needs is there."
      v_expr := jsonb_build_object('op', 'or', 'args', jsonb_build_array(
        jsonb_build_object('op', 'ne', 'args', jsonb_build_array(
          jsonb_build_object('field', v_field_id), jsonb_build_object('const', to_jsonb(v_skey)))),
        jsonb_build_object('op', 'and', 'args', v_arms)));
      v_rule_ids := v_rule_ids || jsonb_build_object('requires:' || v_skey,
        custom._pipeline_rule(p_organization_id, p_table_id, 'requires', v_skey,
          format('What a %s needs before it reaches %s', v_noun, v_stage),
          coalesce(nullif(p_spec #>> array['requires_messages', v_stage], ''),
                   format('Nothing moves to %s until %s is filled in.', v_stage,
                          (select string_agg(coalesce(custom.rule_field_label(p_organization_id,
                                    (select f.id from custom.record f
                                      where f.organization_id = p_organization_id
                                        and f.table_id = custom.field_kernel_id()
                                        and f.deleted_at is null
                                        and (f.data ->> 'entity_definition_id')::uuid = p_table_id
                                        and f.data ->> 'key' = x #>> '{}')), x #>> '{}'), ' and ')
                             from jsonb_array_elements(v_req) x))),
          jsonb_build_array('validate'), v_expr, null, 40));
      v_made := v_made || to_jsonb(format('%s needs %s', v_stage,
                            (select string_agg(x #>> '{}', ' and ') from jsonb_array_elements(v_req) x)));
    end if;

    -- ── WHO MAY MOVE IT THERE. A rung, asked as a rung. ──────────────────────────────
    v_who := coalesce(nullif(p_spec #>> array['who', v_stage], ''), nullif(p_spec #>> array['who', v_skey], ''));
    if v_who is not null then
      v_expr := jsonb_build_object('op', 'or', 'args', jsonb_build_array(
        jsonb_build_object('op', 'eq', 'args', jsonb_build_array(
          jsonb_build_object('field', v_field_id),
          jsonb_build_object('op', 'previous', 'field', v_field_id))),
        jsonb_build_object('op', 'ne', 'args', jsonb_build_array(
          jsonb_build_object('field', v_field_id), jsonb_build_object('const', to_jsonb(v_skey)))),
        jsonb_build_object('op', 'actor_at_least', 'args', jsonb_build_array(
          jsonb_build_object('const', to_jsonb(v_who))))));
      v_rule_ids := v_rule_ids || jsonb_build_object('who:' || v_skey,
        custom._pipeline_rule(p_organization_id, p_table_id, 'who', v_skey,
          format('Who moves a %s to %s', v_noun, v_stage),
          format('Only somebody with %s rights on this %s can move it to %s.',
                 v_who, v_noun, v_stage),
          jsonb_build_array('validate'), v_expr, null, 20));
      v_made := v_made || to_jsonb(format('only %s moves to %s', v_who, v_stage));
    end if;

    -- ── HOW MANY MAY SIT THERE AT ONCE (a work-in-progress limit). ───────────────────
    v_limit := nullif(coalesce(p_spec #>> array['limits', v_stage], p_spec #>> array['limits', v_skey]), '')::integer;
    if v_limit is not null then
      v_expr := jsonb_build_object('op', 'or', 'args', jsonb_build_array(
        jsonb_build_object('op', 'eq', 'args', jsonb_build_array(
          jsonb_build_object('field', v_field_id),
          jsonb_build_object('op', 'previous', 'field', v_field_id))),
        jsonb_build_object('op', 'ne', 'args', jsonb_build_array(
          jsonb_build_object('field', v_field_id), jsonb_build_object('const', to_jsonb(v_skey)))),
        jsonb_build_object('op', 'lt', 'args', jsonb_build_array(
          jsonb_build_object('op', 'stage_count', 'args', jsonb_build_array(
            jsonb_build_object('const', to_jsonb(v_skey)))),
          jsonb_build_object('const', to_jsonb(v_limit))))));
      v_rule_ids := v_rule_ids || jsonb_build_object('limit:' || v_skey,
        custom._pipeline_rule(p_organization_id, p_table_id, 'limit', v_skey,
          format('How many at once in %s', v_stage),
          format('%s already holds %s, which is as many as it takes at once. Finish one before starting another.',
                 v_stage, v_limit),
          jsonb_build_array('validate'), v_expr, null, 30));
      v_made := v_made || to_jsonb(format('%s holds at most %s', v_stage, v_limit));
    end if;

    -- ── WHAT HAPPENS WHEN A CARD ARRIVES. THE APPLICABILITY USE. ────────────────────
    if jsonb_typeof(coalesce(p_spec -> 'on_entry' -> v_stage, p_spec -> 'on_entry' -> v_skey)) = 'object' then
      v_expr := jsonb_build_object('op', 'and', 'args', jsonb_build_array(
        jsonb_build_object('op', 'eq', 'args', jsonb_build_array(
          jsonb_build_object('field', v_field_id), jsonb_build_object('const', to_jsonb(v_skey)))),
        jsonb_build_object('op', 'ne', 'args', jsonb_build_array(
          jsonb_build_object('field', v_field_id),
          jsonb_build_object('op', 'previous', 'field', v_field_id)))));
      v_rule_ids := v_rule_ids || jsonb_build_object('entry:' || v_skey,
        custom._pipeline_rule(p_organization_id, p_table_id, 'entry', v_skey,
          format('When a %s reaches %s', v_noun, v_stage),
          format('This is what happens when a %s reaches %s.', v_noun, v_stage),
          jsonb_build_array('applicability'), v_expr,
          coalesce(p_spec -> 'on_entry' -> v_stage, p_spec -> 'on_entry' -> v_skey), 50));
      v_made := v_made || to_jsonb(format('arriving in %s starts something', v_stage));
    end if;
  end loop;

  return jsonb_build_object(
    'table_id',    p_table_id,
    'stage_field', v_key,
    'field_id',    v_field_id,
    'stages',      to_jsonb(v_stages),
    'rules',       v_rule_ids,
    'said',        v_made);
end;
$fn$;
create or replace function custom.pipeline_read(p_organization_id uuid, p_table_id uuid)
  returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $fn$
declare
  v_key   text;
  v_fid   uuid;
  v_flab  text;
  v_opts  uuid;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.pipeline_read');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.pipeline_read');
  v_key := custom._stage_field_key(p_organization_id, p_table_id);
  if v_key is null then
    -- Absent, not empty, and it says what would make it exist.
    return jsonb_build_object('is_pipeline', false,
             'why', 'This table has no stage column yet, so there is no board to draw.');
  end if;
  select f.id, coalesce(nullif(f.data ->> 'label', ''), 'Stage'),
         (f.data -> 'config' ->> 'options_table_id')::uuid
    into v_fid, v_flab, v_opts
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = p_table_id
     and f.data ->> 'key' = v_key;
  if v_fid is null then
    raise exception 'this table says its stage is kept in %, and that column is gone', v_key
      using errcode = '23503',
            hint = 'Declare the pipeline again with custom.pipeline_declare, or point stage_field at a column that is there.';
  end if;

  return jsonb_build_object(
    'is_pipeline', true,
    'table_id',    p_table_id,
    'stage_field', v_key,
    'field_id',    v_fid,
    'stage_label', v_flab,
    -- key AND label, both, every time. A board that carried only labels could not write a
    -- move; one that carried only keys could not draw a heading.
    -- THE ORDER A PERSON DECLARED, which is the order the board draws. The options are
    -- read as RECORDS, oldest first, because `custom.choice_options` answers a jsonb
    -- OBJECT and a jsonb object has no order at all — a board built on it drew Won
    -- first and Lead second, measured 2026-09-20.
    'stages',      coalesce((select jsonb_agg(jsonb_build_object(
                               'key', coalesce(nullif(o.metadata ->> 'option_key', ''),
                                               custom.choice_slug(o.data ->> 'title')),
                               'label', coalesce(nullif(o.data ->> 'title', ''), '(unnamed choice)'),
                               'retired', o.deleted_at is not null)
                               order by (o.deleted_at is not null), o.created_at, o.id)
                              from custom.record o
                             where o.organization_id = p_organization_id
                               and o.table_id = v_opts), '[]'::jsonb),
    'rules',       coalesce((select jsonb_agg(jsonb_build_object(
                               'id', r.id, 'name', r.data ->> 'name',
                               'message', r.data ->> 'message',
                               'kind', r.data #>> '{pipeline,kind}',
                               'stage', r.data #>> '{pipeline,stage}',
                               'uses', r.data -> 'uses',
                               'on_entry', r.data -> 'on_entry',
                               'version', r.version)
                               order by r.data #>> '{pipeline,kind}', r.data #>> '{pipeline,stage}')
                              from custom.record r
                             where r.organization_id = p_organization_id
                               and r.table_id = custom.rule_kernel_id()
                               and r.deleted_at is null
                               and (r.data #>> '{pipeline,stage_field_of}')::uuid = p_table_id),
                            '[]'::jsonb));
end;
$fn$;
create or replace function custom.pipeline_transition_refusal(p_organization_id uuid,
                                                              p_record_id uuid, p_to text)
  returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $fn$
declare
  v_row    custom.record;
  v_key    text;
  v_fid    uuid;
  v_skey   text;
  v_doc    jsonb;
  v_ctx    jsonb;
  v_me     uuid;
  v_level  public.permission_level;
  v_type   text;
  v_rtype  text;
  r        custom.record;
  v_run    jsonb;
  v_missing jsonb := '[]'::jsonb;
  v_one    jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.pipeline_transition_refusal');
  perform custom.assert_client_may_open(p_organization_id, p_record_id,
                                        'custom.pipeline_transition_refusal',
                                        'viewer'::public.permission_level, 'record');
  select * into v_row from custom.record
   where organization_id = p_organization_id and id = p_record_id and deleted_at is null;
  if v_row.id is null then
    raise exception 'there is no such record here' using errcode = '23503';
  end if;
  v_key := custom._stage_field_key(p_organization_id, v_row.table_id);
  if v_key is null then
    return jsonb_build_object('allowed', false, 'is_pipeline', false,
             'why', 'This table has no stage column, so there is nowhere for this to move to.');
  end if;
  select f.id into v_fid from custom.record f
   where f.organization_id = p_organization_id and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null and (f.data ->> 'entity_definition_id')::uuid = v_row.table_id
     and f.data ->> 'key' = v_key;
  v_skey := custom._pipeline_stage_key(p_organization_id, v_fid, p_to);

  v_doc := jsonb_set(v_row.data, array[v_key], to_jsonb(v_skey));
  v_me  := custom.query_principal();
  if v_me is not null then
    v_level := custom.effective_level(v_me, p_organization_id, p_record_id, 'record');
  end if;
  v_ctx := jsonb_build_object('previous_values', v_row.data,
                              'record_id', to_jsonb(p_record_id),
                              'table_id',  to_jsonb(v_row.table_id),
                              'actor_level', to_jsonb(v_level));
  v_type := custom.table_type_field(p_organization_id, v_row.table_id);
  if v_type is not null then v_rtype := v_doc ->> v_type; end if;

  for r in select * from custom.table_rules(p_organization_id, v_row.table_id, 'validate', v_rtype) loop
    v_run := custom.rule_run(p_organization_id, r.id, v_doc, v_ctx);
    if custom.rule_truth(v_run -> 'answer') is false then
      -- WHICH COLUMNS ARE EMPTY, said as columns and not as a regular expression. A screen
      -- that can name them can OFFER them, which is what "a stage's required fields prompt
      -- on entry" means.
      if r.data #>> '{pipeline,kind}' = 'requires' then
        -- DISTINCT: `$.**` matches the same leaf at several depths, and a person shown
        -- "Signed proposal, Signed proposal" would reasonably think there were two.
        for v_one in select distinct q from jsonb_path_query(r.data -> 'expr',
                              '$.**{0 to 8} ? (@.op == "present").args[0].field') q loop
          if v_doc -> custom.rule_field_key(p_organization_id, (v_one #>> '{}')::uuid) is null
             or jsonb_typeof(v_doc -> custom.rule_field_key(p_organization_id, (v_one #>> '{}')::uuid)) = 'null' then
            v_missing := v_missing || jsonb_build_object(
              'field_id', v_one #>> '{}',
              'key',   custom.rule_field_key(p_organization_id, (v_one #>> '{}')::uuid),
              'label', custom.rule_field_label(p_organization_id, (v_one #>> '{}')::uuid));
          end if;
        end loop;
      end if;
      return jsonb_build_object(
        'allowed',      false,
        'is_pipeline',  true,
        'to',           v_skey,
        'why',          coalesce(nullif(r.data ->> 'message', ''), r.data ->> 'name'),
        'rule',         r.data ->> 'name',
        'rule_id',      r.id,
        'rule_version', r.version,
        'kind',         r.data #>> '{pipeline,kind}',
        'missing',      v_missing);
    end if;
  end loop;
  return jsonb_build_object('allowed', true, 'is_pipeline', true, 'to', v_skey,
                            'why', 'Nothing stands in the way of this move.');
end;
$fn$;
