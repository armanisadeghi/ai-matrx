-- INVERSE of migrations/campaign/stagerules2_a_half_written_rule_is_refused.sql
-- Puts back the two bodies that let a gate with no demands through.

CREATE OR REPLACE FUNCTION custom.pipeline_declare(p_organization_id uuid, p_table_id uuid, p_spec jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
  v_gates      jsonb;
  v_gate_n     integer;
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

    -- ── STAGE-RULES: THE GATES ON THIS STAGE, WRITTEN AS CONDITIONS. ────────────────
    -- `requires`, `who` and `limits` above are the three policies common enough to deserve
    -- sugar. A GATE is the general form underneath them, and it is what the condition
    -- builder on the stage settings screen writes: a sentence a person reads, a condition
    -- that says WHEN the gate is about this record at all, a condition that says what it
    -- DEMANDS, and what happens when the demand is not met.
    --
    --   {"name": "A second quote before a big one is approved",
    --    "message": "Nothing over $5,000 moves to Approved without a second quote from a different contractor.",
    --    "when":    <a condition, or nothing at all for "always">,
    --    "demands": <a condition that has to hold>,
    --    "on_fail": "refuse" | "require_approval"}
    --
    -- The Rule it becomes says: it is not arriving here, OR it is not moving at all, OR the
    -- gate is not about this record, OR the gate's demand holds. That shape is why editing
    -- the price of a deal already sitting in Approved is not a move and is never judged.
    v_gates := coalesce(p_spec -> 'gates' -> v_stage, p_spec -> 'gates' -> v_skey);
    if jsonb_typeof(v_gates) = 'array' and jsonb_array_length(v_gates) > 0 then
      v_gate_n := 0;
      for v_one in select t from jsonb_array_elements(v_gates) t loop
        v_gate_n := v_gate_n + 1;
        if jsonb_typeof(v_one -> 'demands') <> 'object' then
          raise exception 'a gate on % has to say what it demands before a % may get there',
                          v_stage, v_noun
            using errcode = '22004',
                  hint = 'gates: {"<stage>": [{"name":…,"message":…,"when":<condition or nothing>,"demands":<condition>,"on_fail":"refuse"|"require_approval"}]}.';
        end if;
        if nullif(v_one ->> 'message', '') is null then
          raise exception 'a gate on % has to carry the sentence a person reads when it stops them', v_stage
            using errcode = '22004',
                  hint = 'A refusal with no words is a dead end. Write the sentence the way you would say it out loud.';
        end if;
        -- STAGE-RULES-2: THE COMPILER IS A FUNCTION NOW, AND THERE IS ONLY ONE OF IT.
        -- The arms used to be built inline here. The editor's live preview has to judge a
        -- gate that has not been saved yet — "3 cards would be refused today" — and a
        -- preview that compiled the gate its own way would be answering about a different
        -- rule than the one the store would enforce. `custom._pipeline_gate_expr` is the
        -- single compiler both call, so the preview and the refusal cannot disagree.
        v_rule_ids := v_rule_ids || jsonb_build_object(
          'gate:' || v_skey || ':' || v_gate_n,
          custom._pipeline_gate(p_organization_id, p_table_id, 'gate:' || v_gate_n, v_skey,
            coalesce(nullif(v_one ->> 'name', ''),
                     format('What a %s needs before it reaches %s', v_noun, v_stage)),
            v_one ->> 'message',
            custom._pipeline_gate_expr(v_field_id, v_skey, v_one),
            45 + v_gate_n,
            coalesce(nullif(lower(v_one ->> 'on_fail'), ''), 'refuse'),
            -- ...AND THE GATE IS KEPT AS IT WAS ASKED. Without this the only copy of the
            -- gate is the compiled `or` of four arms, and nothing can take a person back
            -- to "when the amount is over $5,000, demand a second quote" — the editor
            -- would open every existing rule blank and overwrite it on the first save.
            v_one));
        v_made := v_made || to_jsonb(format('%s: %s', v_stage, v_one ->> 'message'));
      end loop;
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
$function$

;

CREATE OR REPLACE FUNCTION custom.pipeline_gate_preview(p_organization_id uuid, p_table_id uuid, p_stage text, p_gate jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_key       text;
  v_fid       uuid;
  v_skey      text;
  v_expr      jsonb;
  v_title     text;
  v_noun      text;
  r           custom.record;
  v_doc       jsonb;
  v_ctx       jsonb;
  v_me        uuid;
  v_level     public.permission_level;
  v_considered integer := 0;
  v_refused   integer := 0;
  v_examples  jsonb := '[]'::jsonb;
  v_looked    integer := 0;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.pipeline_gate_preview');
  -- Reading it is a viewer's act — it says nothing the board does not already show — but
  -- a Table she may not know exists is not described to her (VIS-5).
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.pipeline_gate_preview');

  if jsonb_typeof(p_gate -> 'demands') <> 'object' then
    raise exception 'this rule does not say what it demands yet, so there is nothing to try it against'
      using errcode = '22004',
            hint = 'Finish the condition — "the amount is more than 5000" — and the preview will count the cards it would stop.';
  end if;

  v_key := custom._stage_field_key(p_organization_id, p_table_id);
  if v_key is null then
    return jsonb_build_object('is_pipeline', false, 'considered', 0, 'refused', 0,
             'examples', '[]'::jsonb,
             'why', 'This table has no stage column yet, so there is no board to try this against.');
  end if;
  select f.id into v_fid from custom.record f
   where f.organization_id = p_organization_id and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null and (f.data ->> 'entity_definition_id')::uuid = p_table_id
     and f.data ->> 'key' = v_key;
  v_skey := custom._pipeline_stage_key(p_organization_id, v_fid, p_stage);
  v_expr := custom._pipeline_gate_expr(v_fid, v_skey, p_gate);

  select coalesce(nullif(t.data ->> 'title_field', ''), 'title'),
         lower(coalesce(nullif(t.data ->> 'label_singular', ''), nullif(t.data ->> 'name', ''), 'record'))
    into v_title, v_noun
    from custom.record t
   where t.organization_id = p_organization_id and t.id = p_table_id;

  v_me := custom.query_principal();

  for r in
    select * from custom.record c
     where c.organization_id = p_organization_id
       and c.table_id = p_table_id
       and c.deleted_at is null
       and c.data_class = 'record'
       and coalesce(c.data ->> v_key, '') is distinct from v_skey
       and c.id in (select custom.query_visible_ids(p_organization_id, p_table_id, 'viewer'))
     order by c.created_at
     -- A CEILING, AND IT SAYS WHEN IT HIT ONE. A board with forty thousand cards would
     -- otherwise turn a keystroke in a text box into a full table scan.
     limit 501
  loop
    v_looked := v_looked + 1;
    exit when v_looked > 500;
    v_considered := v_considered + 1;
    -- The card AS IT WOULD BE after the move, judged against where it is now — the same
    -- pair `custom.pipeline_transition_refusal` builds, so the preview and the refusal are
    -- asking the same question of the same values.
    v_doc := jsonb_set(r.data, array[v_key], to_jsonb(v_skey));
    if v_me is not null then
      v_level := custom.effective_level(v_me, p_organization_id, r.id, 'record');
    end if;
    v_ctx := jsonb_build_object('previous_values', r.data,
                                'record_id', to_jsonb(r.id),
                                'table_id',  to_jsonb(p_table_id),
                                'actor_level', to_jsonb(v_level));
    if custom.rule_truth(custom.rule_eval(p_organization_id, v_expr, v_doc, v_ctx)) is false then
      v_refused := v_refused + 1;
      if jsonb_array_length(v_examples) < 3 then
        v_examples := v_examples || jsonb_build_object(
          'record_id', r.id,
          'title', custom._card_words(p_organization_id, r.data ->> v_title, v_noun));
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'is_pipeline',  true,
    'stage',        v_skey,
    'considered',   v_considered,
    'refused',      v_refused,
    'examples',     v_examples,
    'truncated',    v_looked > 500,
    'on_fail',      coalesce(nullif(lower(p_gate ->> 'on_fail'), ''), 'refuse'),
    'noun',         v_noun);
end;
$function$

;
