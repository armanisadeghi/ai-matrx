-- target: branch,production
-- additive: yes
--   It ADDS five feature-knob rows under `custom/enrichment_*` and eleven new functions
--   under this lane's reserved prefix `custom.enrich_*`, with their
--   `platform.client_callable_door` rows. No table, column, trigger, policy or grant is
--   touched here; no existing function is replaced; no row is rewritten. An Enrichment is
--   stored ON THE FIELD (`source`, `source_config`, `review_interval_days` — all three are
--   keys the Field document already carries), and a RUN is a `custom.record`, so no
--   business-shaped table is created and the provisioner is not involved.
--   The inverse is `migrations/inverse/enrich_a_field_a_model_owns_down.sql`.
-- guard: custom/system_enabled
--
-- LANE ENRICH — PRODUCTS row 10, *"Fill in each company's industry and headcount, and keep
-- it fresh."*  Contract rows: AGT-6 (a Field with `source = agent` is filled on a schedule
-- its `review_interval_days` sets), AGT-7 (`sensitivity` is a ceiling on what enters an
-- agent's context), AGT-4 (`custom/agent_schema_changes`), VAL-1 (the interned provenance
-- pointer), VAL-2 (the absence vocabulary), VAL-3/VAL-4 (ranked alternates inside the one
-- document), VAL-7/VAL-8 (the actor and who it acted for).
-- Champions: Clay (an enrichment is a column a provider owns, with a per-row cost and a
-- visible waterfall of what was tried) and Airtable AI (a field a model fills, previewed on
-- a handful of rows before anybody turns it on).
--
-- ════════════════════════════════════════════════════════════════════════════════
-- AN ENRICHMENT IS NOT A NEW OBJECT. IT IS A FIELD, SAYING WHO FILLS IT.
-- ════════════════════════════════════════════════════════════════════════════════
--
-- The Field document has carried `source` (default `manual`), `source_config` and
-- `review_interval_days` since W1-FIELD. AGT-6 is written against exactly those three, and
-- the campaign's own measurement of it says they have "zero readers and zero writers".
-- So this lane does not mint an Enrichment object beside the Field; it gives those three
-- keys their reader and their writer:
--
--     source                = 'agent'
--     review_interval_days  = 30                     ← freshness, AGT-6
--     source_config         = { instruction, inputs, web_search, connected_source,
--                               model, confidence_floor, write_policy, cost_cap_cents,
--                               enabled, enabled_by, enabled_at, declared_by, declared_at }
--
-- Everything the store does to a Field it now does to an Enrichment for free: History with
-- an author on every version, Visibility, the change feed, export, the field menu, the
-- migration log. A second object would have had to earn all of that again.
--
-- ════════════════════════════════════════════════════════════════════════════════
-- A RUN IS A RECORD, AND THAT IS WHERE THE COST LIVES
-- ════════════════════════════════════════════════════════════════════════════════
--
-- One batch (or one per-row "enrich now") writes ONE `custom.record` of
-- `data_class = 'enrichment_run'` under the ORGANIZATION kernel — the kernel whose records
-- are facts about the organization rather than about any business Table, which is exactly
-- what a run is. It carries the model and its version, what was attempted, what landed,
-- what was skipped and why, and the money: `cost_cents` for the run and `cost_per_row_cents`
-- for the row. "Cost accounting per organization" is then a sum over that organization's own
-- records, under its own Visibility, with no second ledger to keep level.
--
-- ════════════════════════════════════════════════════════════════════════════════
-- THE FOUR REFUSALS, IN PLAIN WORDS, AND WHERE EACH ONE IS ASKED
-- ════════════════════════════════════════════════════════════════════════════════
--
--   · RATE       `custom/enrichment_batch_ceiling` caps one run's rows. `custom.enrich_due`
--                never hands back more than that, and says so when it trims.
--   · COST       `custom/enrichment_cost_cap_cents` is the organization's budget for the
--                calendar month, summed off its own run records. `custom.enrich_due` refuses
--                to hand out work once it is spent, and `custom.enrich_land` refuses to
--                record a run that would spend past it — so the cap is asked before the
--                money and again after it.
--   · SENSITIVITY `custom/enrichment_sensitivity_ceiling` (AGT-7). A Field more sensitive
--                than the ceiling may be neither an input to an enrichment nor the Field an
--                enrichment fills, and `custom.enrich_declare` refuses it BY NAME at
--                declaration — not at run time, where nobody is standing.
--   · POLICY     `custom/agent_schema_changes` (AGT-4). `ask` means an agent's proposal is
--                a wait somebody answers; `auto` means it is defined straight away. Either
--                way NOTHING lands in a cell until an admin has ENABLED the enrichment, and
--                the enable is the standing approval for every value it writes afterwards.
--                The badge says `agent` regardless — approval changes who decided, never
--                who wrote.
--
-- ════════════════════════════════════════════════════════════════════════════════
-- THE CONFIDENCE FLOOR: AN UNSURE ANSWER IS AN ALTERNATE, NEVER A VALUE
-- ════════════════════════════════════════════════════════════════════════════════
--
-- A model that is not sure must not put its guess where a person reads a fact. Below the
-- floor the candidate goes into `alternates` at rank 1 with its own source, and the cell
-- carries the absence reason `conflicting` — VAL-2's own word for "we have candidates and
-- no answer". Above the floor it is the value, and the candidates it beat ride along as
-- alternates. Nothing is thrown away either way, and a person reading the cell can always
-- see what the model thought and why it did not commit.

set lock_timeout = '5s';
set statement_timeout = '600s';

-- ═════════════════════════════════════════════════════════════════════ 1. THE KNOBS
-- Five settings, every one an organization's to change (the doctrine's "opinions become
-- knobs"), each with a shipped default that is a working answer rather than a placeholder.

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, label, description,
   set_by, basis, overridable_by, override_direction, propagation, public_read, ui)
values
  ('custom', 'enrichment_model', '"claude-fable-5-latest"'::jsonb, '"claude-fable-5-latest"'::jsonb, 'string',
   'Enrichment: the model that fills agent-owned fields',
   'AGT-6. The model an Enrichment runs on when it names none of its own. It is a capable '
   'model on purpose: an enrichment reads a record, decides what a company does and commits '
   'a fact a person will act on, which is agentic work and never small-model work. An '
   'organization may name another alias from the AI catalogue, and a single Enrichment may '
   'override it again in its own source_config.',
   'agent', 'Unified data campaign ENRICH, 2026-09-20: PRODUCTS row 10.',
   '{organization}'::text[], 'any', 'next_load', false, '{}'::jsonb),

  ('custom', 'enrichment_confidence_floor', '0.6'::jsonb, '0.6'::jsonb, 'number',
   'Enrichment: how sure the model has to be to write the value',
   'Below this the model''s candidate lands as a ranked ALTERNATE with the absence reason '
   '"conflicting" instead of as the value, so an unsure answer never sits in a cell looking '
   'like a fact. An Enrichment may set its own floor; this is the default it inherits.',
   'agent', 'Unified data campaign ENRICH, 2026-09-20: PRODUCTS row 10.',
   '{organization}'::text[], 'any', 'next_load', false, '{}'::jsonb),

  ('custom', 'enrichment_batch_ceiling', '200'::jsonb, '200'::jsonb, 'integer',
   'Enrichment: the most rows one run may take',
   'The rate refusal. custom.enrich_due never hands back more rows than this in one call, '
   'and says in words when it trimmed the ask, so a scheduled run over a large Table walks '
   'it in bounded batches instead of one unbounded pass.',
   'agent', 'Unified data campaign ENRICH, 2026-09-20: PRODUCTS row 10.',
   '{organization}'::text[], 'any', 'next_load', false, '{}'::jsonb),

  ('custom', 'enrichment_cost_cap_cents', '2000'::jsonb, '2000'::jsonb, 'integer',
   'Enrichment: what an organization may spend on enrichment in a calendar month',
   'Summed off this organization''s own enrichment_run records for the current calendar '
   'month. Once it is spent custom.enrich_due hands out no more work and custom.enrich_land '
   'refuses to record a run past it — both saying the figure and the cap in words, never a '
   'silent stop that reads as "there was nothing to do".',
   'agent', 'Unified data campaign ENRICH, 2026-09-20: PRODUCTS row 10.',
   '{organization}'::text[], 'any', 'next_load', false, '{}'::jsonb),

  ('custom', 'enrichment_sensitivity_ceiling', '"internal"'::jsonb, '"internal"'::jsonb, 'string',
   'Enrichment: the most sensitive field an enrichment may read or fill',
   'AGT-7. A Field whose sensitivity is above this ceiling may be neither an input to an '
   'Enrichment nor the Field one fills. The refusal is taken at DECLARATION, where a person '
   'is standing and can be told which field and which ceiling — not at run time. The four '
   'levels, least to most, are public, internal, restricted, confidential.',
   'agent', 'Unified data campaign ENRICH, 2026-09-20: PRODUCTS row 10.',
   '{organization}'::text[], 'any', 'next_load', false, '{}'::jsonb)
on conflict (feature, key) do nothing;

-- ═══════════════════════════════════════════════════ 2. THE CLOSED VOCABULARIES
-- One copy each (rule 15 — no literal in a gate).

create function custom.enrich_run_class()
returns text
language sql
immutable
set search_path to 'pg_catalog'
as $fn$ select 'enrichment_run'::text $fn$;

comment on function custom.enrich_run_class() is
  'ENRICH: the data_class an enrichment run record carries. One copy, so the door that '
  'writes a run and every door that sums the money cannot drift apart.';

create function custom.enrich_sensitivity_rank(p_word text)
returns integer
language sql
immutable
set search_path to 'pg_catalog'
as $fn$
  select case lower(btrim(coalesce(p_word, 'internal')))
           when 'public'       then 1
           when 'internal'     then 2
           when 'restricted'   then 3
           when 'confidential' then 4
           else null
         end;
$fn$;

comment on function custom.enrich_sensitivity_rank(text) is
  'AGT-7: the four sensitivity words in order, least to most. NULL for a word that is not '
  'one of them, so a typo in a ceiling is refused rather than silently read as "public".';

create function custom.enrich_triggers()
returns text[]
language sql
immutable
set search_path to 'pg_catalog'
as $fn$ select array['batch', 'now', 'schedule', 'preview']::text[] $fn$;

comment on function custom.enrich_triggers() is
  'ENRICH: why a run happened — a batch somebody started, one row somebody asked for now, '
  'the clock, or a preview that wrote nothing. A run always says which.';

-- ═══════════════════════════════════════════════════════ 3. THE JUDGE (server_only)
-- custom.enrich_normalize — one Enrichment, judged and given its defaults.
--
-- Every door that can put `source = agent` on a Field comes through here, so an Enrichment
-- cannot be half-declared by going in a side entrance. It refuses, BY NAME and with the
-- real list every time:
--   · an instruction that is not plain words                                   22004
--   · an input that is not a Field of this Table                               22023
--   · an input, or the Field itself, above the organization's sensitivity ceiling  42501
--   · a freshness interval that is not a whole number of days of 1 or more     22023
--   · a confidence floor outside 0..1                                          22023
--   · a write policy that is not auto or ask                                   22023
--   · an enrichment whose only input is the field it fills                     22023

create function custom.enrich_normalize(
  p_organization_id uuid,
  p_table_id uuid,
  p_field_key text,
  p_spec jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_spec    jsonb := coalesce(p_spec, '{}'::jsonb);
  v_instr   text;
  v_inputs  jsonb := '[]'::jsonb;
  v_keys    text[];
  v_key     text;
  v_ceiling text;
  v_rank    integer;
  v_floor   numeric;
  v_every   integer;
  v_policy  text;
  v_model   text;
  v_cap     integer;
  v_sens    text;
begin
  if jsonb_typeof(v_spec) is distinct from 'object' then
    raise exception 'An enrichment has to be written down before it can be saved.'
      using errcode = '22004',
            hint = 'AGT-6: an enrichment is {"instruction": "…", "inputs": ["company_name"], "review_interval_days": 30}.';
  end if;

  -- ── THE INSTRUCTION, IN PLAIN WORDS. It is the whole product: a person says what they
  -- want filled in and the platform carries it. A blank one is refused here rather than
  -- discovered by a model that then invents a job for itself.
  v_instr := nullif(btrim(coalesce(v_spec ->> 'instruction', '')), '');
  if v_instr is null then
    raise exception 'An enrichment has to say, in plain words, what to fill in.'
      using errcode = '22004',
            hint = 'For example: "the industry this company is in, in two or three words". That sentence is what the model is asked, so write it the way you would say it to a person.';
  end if;
  if length(v_instr) < 8 then
    raise exception 'The instruction "%" is too short to be an instruction.', v_instr
      using errcode = '22004',
            hint = 'Say what you want filled in and how you want it written — a few words is enough, but "yes" or "do it" is not something a model can act on.';
  end if;

  -- ── THE SENSITIVITY CEILING (AGT-7), asked ONCE for the whole declaration.
  v_ceiling := coalesce(nullif(btrim(platform.knob_resolve('custom', 'enrichment_sensitivity_ceiling',
                                                           p_organization_id) #>> '{}'), ''), 'internal');
  if custom.enrich_sensitivity_rank(v_ceiling) is null then
    raise exception 'This organization''s enrichment sensitivity ceiling is set to "%", which is not one of the four levels.', v_ceiling
      using errcode = '22023',
            hint = 'The levels, least to most, are public, internal, restricted, confidential. Fix custom/enrichment_sensitivity_ceiling for this organization.';
  end if;

  select f.data ->> 'sensitivity' into v_sens
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = p_table_id
     and f.data ->> 'key' = p_field_key;
  if custom.enrich_sensitivity_rank(coalesce(v_sens, 'internal')) > custom.enrich_sensitivity_rank(v_ceiling) then
    raise exception 'A model may not fill in "%" — that field is marked % and this organization lets an enrichment go no higher than %.',
                    p_field_key, coalesce(v_sens, 'internal'), v_ceiling
      using errcode = '42501',
            hint = 'AGT-7: either lower the field''s sensitivity, or raise custom/enrichment_sensitivity_ceiling for this organization. Nothing was saved.';
  end if;

  -- ── THE INPUTS: other Fields of the same record. Anything that is not one is refused by
  -- name with the real keys, because a typo here means an enrichment that reads nothing and
  -- answers anyway.
  select coalesce(array_agg(f.data ->> 'key' order by f.data ->> 'key'), '{}'::text[])
    into v_keys
    from custom.applicable_fields(p_organization_id, p_table_id, null) f
   where nullif(f.data ->> 'key', '') is not null;

  if jsonb_typeof(v_spec -> 'inputs') = 'array' then
    for v_key in select value from jsonb_array_elements_text(v_spec -> 'inputs') loop
      v_key := btrim(v_key);
      if v_key = p_field_key then
        raise exception 'An enrichment cannot read the very field it fills in.'
          using errcode = '22023',
                hint = format('"%s" is the field this enrichment writes. Give it the OTHER columns the answer can be worked out from.', p_field_key);
      end if;
      if not (v_key = any (v_keys)) then
        raise exception 'This table has no field called "%", so an enrichment cannot read it.', v_key
          using errcode = '22023',
                hint = format('The columns are %s.', array_to_string(v_keys, ', '));
      end if;
      select f.data ->> 'sensitivity' into v_sens
        from custom.record f
       where f.organization_id = p_organization_id
         and f.table_id = custom.field_kernel_id()
         and f.deleted_at is null
         and (f.data ->> 'entity_definition_id')::uuid = p_table_id
         and f.data ->> 'key' = v_key;
      if custom.enrich_sensitivity_rank(coalesce(v_sens, 'internal')) > custom.enrich_sensitivity_rank(v_ceiling) then
        raise exception 'An enrichment may not read "%" — that field is marked % and this organization lets an enrichment go no higher than %.',
                        v_key, coalesce(v_sens, 'internal'), v_ceiling
          using errcode = '42501',
                hint = 'AGT-7: a sensitive value is not fed to a model just because it is next door. Drop it from the inputs, lower its sensitivity, or raise custom/enrichment_sensitivity_ceiling. Nothing was saved.';
      end if;
      v_inputs := v_inputs || to_jsonb(v_key);
    end loop;
  end if;

  -- ── FRESHNESS (AGT-6). Absent means "fill it once and leave it alone", which is a real
  -- answer and not an omission, so it is kept as null rather than given a number nobody chose.
  if v_spec ? 'review_interval_days' and jsonb_typeof(v_spec -> 'review_interval_days') <> 'null' then
    if jsonb_typeof(v_spec -> 'review_interval_days') <> 'number'
       or (v_spec ->> 'review_interval_days')::numeric < 1
       or (v_spec ->> 'review_interval_days')::numeric <> floor((v_spec ->> 'review_interval_days')::numeric) then
      raise exception 'How often to check a value again is a whole number of days, 1 or more, and this says "%".',
                      v_spec ->> 'review_interval_days'
        using errcode = '22023',
              hint = 'AGT-6: 30 means "look at it again a month after it was written". Leave it out entirely to fill the column once and never re-check it.';
    end if;
    v_every := (v_spec ->> 'review_interval_days')::integer;
  end if;

  -- ── THE CONFIDENCE FLOOR.
  v_floor := coalesce(
    case when v_spec ? 'confidence_floor' and jsonb_typeof(v_spec -> 'confidence_floor') = 'number'
         then (v_spec ->> 'confidence_floor')::numeric end,
    (platform.knob_resolve('custom', 'enrichment_confidence_floor', p_organization_id) #>> '{}')::numeric,
    0.6);
  if v_floor < 0 or v_floor > 1 then
    raise exception 'How sure the model has to be is a number between 0 and 1, and this says "%".', v_floor
      using errcode = '22023',
            hint = '0.6 means "write it when the model is at least sixty percent sure, otherwise keep it as a candidate". 0 writes whatever it says; 1 writes almost nothing.';
  end if;

  -- ── THE WRITE POLICY (AGT-4). It inherits the organization's own agent-change setting,
  -- because "may an agent change my data without asking" is one question and not two.
  v_policy := lower(btrim(coalesce(
    nullif(v_spec ->> 'write_policy', ''),
    platform.knob_resolve('custom', 'agent_schema_changes', p_organization_id) #>> '{}',
    'ask')));
  if v_policy not in ('auto', 'ask') then
    raise exception '"%" is not a way of deciding whether an agent may write this column.', v_policy
      using errcode = '22023',
            hint = 'AGT-4: it is auto (the enrichment writes as soon as an admin enables it) or ask (somebody answers a request first). It defaults to this organization''s custom/agent_schema_changes.';
  end if;

  v_model := coalesce(nullif(btrim(coalesce(v_spec ->> 'model', '')), ''),
                      nullif(platform.knob_resolve('custom', 'enrichment_model', p_organization_id) #>> '{}', ''),
                      'claude-fable-5-latest');

  v_cap := coalesce(
    case when v_spec ? 'cost_cap_cents' and jsonb_typeof(v_spec -> 'cost_cap_cents') = 'number'
         then (v_spec ->> 'cost_cap_cents')::integer end,
    (platform.knob_resolve('custom', 'enrichment_cost_cap_cents', p_organization_id) #>> '{}')::integer,
    2000);

  return jsonb_strip_nulls(jsonb_build_object(
    'instruction',      v_instr,
    'inputs',           v_inputs,
    'web_search',       coalesce((v_spec ->> 'web_search')::boolean, false),
    'connected_source', nullif(btrim(coalesce(v_spec ->> 'connected_source', '')), ''),
    'model',            v_model,
    'confidence_floor', v_floor,
    'write_policy',     v_policy,
    'cost_cap_cents',   v_cap,
    'review_interval_days', v_every,
    'enabled',          coalesce((v_spec ->> 'enabled')::boolean, false),
    'enabled_by',       nullif(v_spec ->> 'enabled_by', ''),
    'enabled_at',       nullif(v_spec ->> 'enabled_at', ''),
    'declared_by',      nullif(v_spec ->> 'declared_by', ''),
    'declared_at',      nullif(v_spec ->> 'declared_at', '')));
end;
$fn$;

comment on function custom.enrich_normalize(uuid, uuid, text, jsonb) is
  'AGT-6/AGT-7: the ONE judge of an Enrichment. Every door that can put source = agent on a '
  'Field calls it, so an enrichment cannot be half-declared through a side entrance. It '
  'writes nothing and reads no record of the Table — only its Field documents and this '
  'organization''s knobs.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'enrich_normalize',
        'p_organization_id uuid, p_table_id uuid, p_field_key text, p_spec jsonb',
        array['uuid'::regtype, 'uuid'::regtype, 'text'::regtype, 'jsonb'::regtype]::oid[],
        'p_organization_id and p_table_id are never checked here because this function is never reached with a caller''s arguments: its callers are custom.enrich_declare and custom.field_update, each of which has already run custom.assert_client_may_change at the ADMIN rung against the very same organization and Table before calling it. It writes nothing and reads no record of the Table — only that Table''s Field documents (label, key, sensitivity) and this organization''s own knobs.',
        'enrich_a_field_a_model_owns.sql',
        'server_only: it is the judging half of custom.enrich_declare and of custom.field_update''s source arm, both of which have already taken the admin decision; a client reaches every one of its refusals, by name, through custom.enrich_declare, which is where a person is standing when an enrichment is wrong.',
        false, false)
on conflict do nothing;

-- ═══════════════════════════════════════════════ 4. custom.enrich_declare
-- The ONE door an Enrichment comes through, and the one that ENABLES it.
--
-- ADMIN on the Table, the rung custom.dashboard_declare, custom.form_declare and
-- custom.rule_declare already ask, and for the same reason: this publishes something about
-- a Table that everybody in the organization then reads off their own screens — and in this
-- case something that will go on writing into their cells after the person who set it up has
-- walked away. `enabled` is part of the same act, so turning one on is one call and leaves
-- one History version saying who did it.

create function custom.enrich_declare(
  p_organization_id uuid,
  p_field_id uuid,
  p_spec jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_me      uuid := auth.uid();
  v_field   jsonb;
  v_table   uuid;
  v_key     text;
  v_cfg     jsonb;
  v_prior   jsonb;
  v_enabled boolean;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.enrich_declare');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.enrich_declare');

  select f.data, (f.data ->> 'entity_definition_id')::uuid, f.data ->> 'key'
    into v_field, v_table, v_key
    from custom.record f
   where f.organization_id = p_organization_id
     and f.id = p_field_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null;
  if v_field is null then
    raise exception 'There is no such field in this organization, so nothing was changed.'
      using errcode = '23503', hint = 'REC-29: organizations are hard walls. A field id from another organization reads as absent.';
  end if;
  if v_table is null then
    raise exception 'That field does not belong to a table, so nothing can fill it in.'
      using errcode = '23503', hint = 'An enrichment fills a column of a Table; this Field record names none.';
  end if;

  perform custom.assert_client_may_change(p_organization_id, v_table, 'custom.enrich_declare',
                                          'admin'::public.permission_level, 'table');

  -- A WORKED-OUT COLUMN ALREADY HAS AN ANSWER. A formula, a rollup and a lookup are computed
  -- by the store from other values; asking a model to also fill them would put two writers on
  -- one cell and neither would be wrong on its own.
  if coalesce(v_field ->> 'parity_type', '') in ('formula', 'rollup', 'lookup') then
    raise exception '"%" is worked out from other columns already, so a model has nothing to fill in there.',
                    coalesce(v_field ->> 'label', v_key)
      using errcode = '22023',
            hint = 'REC-18: a formula, a rollup and a lookup are computed by the store. Put the enrichment on a column that holds a value of its own.';
  end if;

  v_prior := coalesce(v_field -> 'source_config', '{}'::jsonb);

  -- The declaration inherits what is already there, so turning one ON is
  -- `{"enabled": true}` and nothing else, and does not quietly reset the instruction.
  v_cfg := custom.enrich_normalize(
    p_organization_id, v_table, v_key,
    (case when (v_field ->> 'source') = 'agent' then v_prior else '{}'::jsonb end)
    || jsonb_strip_nulls(jsonb_build_object('review_interval_days',
         coalesce(p_spec -> 'review_interval_days', v_field -> 'review_interval_days')))
    || coalesce(p_spec, '{}'::jsonb));

  v_enabled := coalesce((v_cfg ->> 'enabled')::boolean, false);

  -- WHO IS ANSWERABLE FOR WHAT IT WRITES. Every value this enrichment lands afterwards says
  -- it was written by an agent ON BEHALF OF this person (VAL-8), so the enable has to name
  -- one and it is the person standing here, never an argument a caller supplies.
  if v_enabled and v_me is null then
    raise exception 'Nobody is signed in, so there is nobody for the agent to act on behalf of.'
      using errcode = '42501',
            hint = 'AGT-N-4: an agent carries the authority of the person who turned it on, and every value it writes names that person.';
  end if;
  if v_enabled then
    v_cfg := v_cfg || jsonb_build_object(
      'enabled_by', coalesce(v_cfg ->> 'enabled_by', v_me::text),
      'enabled_at', coalesce(v_cfg ->> 'enabled_at', now()::text));
  else
    v_cfg := v_cfg - 'enabled_by' - 'enabled_at';
  end if;
  v_cfg := v_cfg || jsonb_build_object(
    'declared_by', coalesce(v_cfg ->> 'declared_by', v_me::text),
    'declared_at', coalesce(v_cfg ->> 'declared_at', now()::text));

  -- THROUGH THE FIELD'S OWN DOOR, so History, the change feed and every guard on a Field
  -- change run exactly as they do for a label or a sensitivity. custom.field_update carries
  -- `source`, `source_config` and `review_interval_days` as of this lane's class fix.
  perform custom.field_update(p_organization_id, p_field_id, jsonb_strip_nulls(jsonb_build_object(
    'source',               'agent',
    'source_config',        v_cfg,
    'review_interval_days', v_cfg -> 'review_interval_days')));

  return jsonb_build_object(
    'field_id',   p_field_id,
    'table_id',   v_table,
    'field_key',  v_key,
    'label',      coalesce(v_field ->> 'label', v_key),
    'enrichment', v_cfg,
    'says', case when v_enabled
                 then format('"%s" is filled in by a model now. %s',
                             coalesce(v_field ->> 'label', v_key),
                             case when (v_cfg ->> 'review_interval_days') is null
                                  then 'It is filled once and then left alone until somebody asks again.'
                                  else format('Each value is looked at again %s days after it was written.',
                                              v_cfg ->> 'review_interval_days') end)
                 else format('"%s" is set up to be filled in by a model, and is switched off until somebody turns it on. Nothing will be written until then.',
                             coalesce(v_field ->> 'label', v_key)) end);
end;
$fn$;

comment on function custom.enrich_declare(uuid, uuid, jsonb) is
  'AGT-6: the ONE door an Enrichment comes through. It puts source = agent, the judged '
  'source_config and review_interval_days on the FIELD through custom.field_update, so an '
  'enrichment is a property of the column and inherits History, Visibility and the change '
  'feed with no second mechanism. Admin on the Table, like a dashboard, a form and a Rule.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'enrich_declare',
        'p_organization_id uuid, p_field_id uuid, p_spec jsonb',
        array['uuid'::regtype, 'uuid'::regtype, 'jsonb'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_store_door and then custom.assert_client_may_reach on entry; NULL is refused there. p_field_id is matched together with the organization and the Field kernel, so a field id from another tenant reads as absent; the Table it names is then checked by custom.assert_client_may_change at the ADMIN rung. Every word of p_spec is judged by custom.enrich_normalize, which refuses an input that is not a Field of that Table and any field above the organization sensitivity ceiling BY NAME. Nothing in p_spec is executed: the instruction is stored as data and handed to a model by the server, never to this database. enabled_by is taken from auth.uid() and never from the caller''s arguments.',
        'enrich_a_field_a_model_owns.sql',
        null, true, false)
on conflict do nothing;

-- ═══════════════════════════════════════════════ 5. custom.enrichments
-- The list: every agent-owned column of a Table, with its freshness census and its money.

create function custom.enrichments(p_organization_id uuid, p_table_id uuid default null)
returns table(field_id uuid, table_id uuid, field_key text, label text,
              enrichment jsonb, enabled boolean, review_interval_days integer,
              rows_total integer, rows_filled integer, rows_stale integer,
              rows_pinned integer, rows_absent integer,
              runs integer, cost_cents numeric, cost_per_row_cents numeric,
              last_run_at timestamptz, last_run jsonb)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.enrichments');

  return query
  with fields as (
    select f.id as fid,
           (f.data ->> 'entity_definition_id')::uuid as tid,
           f.data ->> 'key'   as fkey,
           coalesce(f.data ->> 'label', f.data ->> 'key') as flabel,
           coalesce(f.data -> 'source_config', '{}'::jsonb) as cfg,
           nullif(f.data ->> 'review_interval_days', '')::integer as every
      from custom.record f
     where f.organization_id = p_organization_id
       and f.table_id = custom.field_kernel_id()
       and f.deleted_at is null
       and f.data ->> 'source' = 'agent'
       and (p_table_id is null or (f.data ->> 'entity_definition_id')::uuid = p_table_id)
       -- ONLY OVER TABLES THIS CALLER CAN ALREADY OPEN (VIS-5), so the list of what a model
       -- fills in is never a second way to learn that a Table exists.
       and (f.data ->> 'entity_definition_id')::uuid
             in (select v from custom.query_visible_ids(p_organization_id, custom.table_kernel_id()) v)
  ),
  cells as (
    select fl.fid,
           count(*)::integer as n_total,
           count(*) filter (where r.data ? fl.fkey
                              and jsonb_typeof(r.data -> fl.fkey) <> 'null')::integer as n_filled,
           count(*) filter (where coalesce((r.data -> '_values' -> fl.fkey ->> 'pinned')::boolean, false))::integer as n_pinned,
           count(*) filter (where nullif(r.data -> '_values' -> fl.fkey ->> 'absent', '') is not null)::integer as n_absent,
           count(*) filter (where fl.every is not null
                              and (r.data -> '_values' -> fl.fkey ->> 'at') is not null
                              and (r.data -> '_values' -> fl.fkey ->> 'at')::timestamptz
                                    + make_interval(days => fl.every) < now())::integer as n_stale
      from fields fl
      join custom.record r
        on r.organization_id = p_organization_id
       and r.table_id = fl.tid
       and r.deleted_at is null
       and r.data_class = 'record'
       and r.id in (select v from custom.query_visible_ids(p_organization_id, fl.tid) v)
     group by fl.fid
  ),
  runs as (
    select (x.data ->> 'field_id')::uuid as fid,
           count(*)::integer             as n_runs,
           sum(coalesce((x.data ->> 'cost_cents')::numeric, 0))   as spend,
           sum(coalesce((x.data ->> 'rows_written')::numeric, 0)) as written,
           max(x.created_at)             as last_at
      from custom.record x
     where x.organization_id = p_organization_id
       and x.table_id = custom.organization_kernel_id()
       and x.data_class = custom.enrich_run_class()
       and x.deleted_at is null
     group by 1
  ),
  last_one as (
    select distinct on ((x.data ->> 'field_id')::uuid)
           (x.data ->> 'field_id')::uuid as fid, x.data as doc
      from custom.record x
     where x.organization_id = p_organization_id
       and x.table_id = custom.organization_kernel_id()
       and x.data_class = custom.enrich_run_class()
       and x.deleted_at is null
     order by (x.data ->> 'field_id')::uuid, x.created_at desc
  )
  select fl.fid, fl.tid, fl.fkey, fl.flabel, fl.cfg,
         coalesce((fl.cfg ->> 'enabled')::boolean, false),
         fl.every,
         coalesce(c.n_total, 0), coalesce(c.n_filled, 0), coalesce(c.n_stale, 0),
         coalesce(c.n_pinned, 0), coalesce(c.n_absent, 0),
         coalesce(rn.n_runs, 0), coalesce(rn.spend, 0),
         case when coalesce(rn.written, 0) > 0
              then round(coalesce(rn.spend, 0) / rn.written, 4) end,
         rn.last_at, lo.doc
    from fields fl
    left join cells c   on c.fid  = fl.fid
    left join runs rn   on rn.fid = fl.fid
    left join last_one lo on lo.fid = fl.fid
   order by fl.flabel;
end;
$fn$;

comment on function custom.enrichments(uuid, uuid) is
  'AGT-6: every column of this organization a model owns, with how many cells are filled, '
  'stale, pinned or absent, what it has cost so far and what that is per row. Narrowed to '
  'the Tables this caller can open and counted only over the records this caller can see, '
  'so two people reading the same screen get two honest answers.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'enrichments',
        'p_organization_id uuid, p_table_id uuid',
        array['uuid'::regtype, 'uuid'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_client_may_reach on entry; NULL is refused there. The rows are narrowed to Fields whose Table is in custom.query_visible_ids for THIS caller, and every census number is counted only over records in custom.query_visible_ids for this caller, so neither a Table nor a record can be learned about through this door and a p_table_id from another tenant returns zero rows. It returns no value of any record — only counts, the enrichment''s own settings and this organization''s own run records.',
        'enrich_a_field_a_model_owns.sql',
        null, true, false)
on conflict do nothing;

-- ═══════════════════════════════════════════════ 6. custom.enrich_due
-- THE BATCH, IN ONE CALL. The rows that need this column filled in, each with the values
-- the instruction is allowed to read, so a run is one round trip and then one model call
-- per row — never a round trip per row to find out what the row says.
--
-- WHAT "DUE" MEANS, and it is said back in words on every row:
--   · never filled in            — no value was ever written into that cell
--   · past its freshness date    — `at` + review_interval_days is behind us (AGT-6)
-- A cell a person PINNED is never due, and never appears here at all.

create function custom.enrich_due(
  p_organization_id uuid,
  p_field_id uuid,
  p_limit integer default 50,
  p_include_fresh boolean default false)
returns table(record_id uuid, title text, inputs jsonb, current_value jsonb,
              written_at timestamptz, reason text, trimmed_to integer)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_me     uuid := auth.uid();
  v_table  uuid;
  v_key    text;
  v_every  integer;
  v_cfg    jsonb;
  v_inputs text[];
  v_seen   text[];
  v_k      text;
  v_ceil   integer;
  v_take   integer;
  v_cap    numeric;
  v_spent  numeric;
  v_level  public.permission_level;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.enrich_due');

  select (f.data ->> 'entity_definition_id')::uuid, f.data ->> 'key',
         nullif(f.data ->> 'review_interval_days', '')::integer,
         coalesce(f.data -> 'source_config', '{}'::jsonb)
    into v_table, v_key, v_every, v_cfg
    from custom.record f
   where f.organization_id = p_organization_id
     and f.id = p_field_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and f.data ->> 'source' = 'agent';
  if v_table is null then
    raise exception 'There is no column here that a model fills in.'
      using errcode = '23503',
            hint = 'Either that field id belongs to another organization, or nobody has set an enrichment up on it yet — custom.enrich_declare does that.';
  end if;

  perform custom.assert_may_know_table(p_organization_id, v_table, 'custom.enrich_due');

  -- ── THE COST REFUSAL, asked BEFORE any work is handed out rather than after the money
  -- is spent. The figure and the cap are both said, because "there was nothing to do" and
  -- "you have spent your budget" look identical from a screen otherwise.
  v_cap := coalesce((platform.knob_resolve('custom', 'enrichment_cost_cap_cents', p_organization_id) #>> '{}')::numeric, 2000);
  select coalesce(sum(coalesce((x.data ->> 'cost_cents')::numeric, 0)), 0) into v_spent
    from custom.record x
   where x.organization_id = p_organization_id
     and x.table_id = custom.organization_kernel_id()
     and x.data_class = custom.enrich_run_class()
     and x.deleted_at is null
     and x.created_at >= date_trunc('month', now());
  if v_spent >= v_cap then
    raise exception 'This organization has spent % cents on filling columns in this month, and its budget is % cents, so nothing more was started.',
                    round(v_spent, 2), v_cap
      using errcode = '53400',
            hint = 'The budget is custom/enrichment_cost_cap_cents and an organization may change it. It resets on the first of the month. Nothing was written and nothing was charged.';
  end if;

  -- ── THE RATE REFUSAL. One run takes at most the organization's ceiling, and when the ask
  -- was larger every row says what it was trimmed to, so a scheduled pass over a big Table
  -- walks it in bounded batches instead of one unbounded sweep.
  v_ceil := coalesce((platform.knob_resolve('custom', 'enrichment_batch_ceiling', p_organization_id) #>> '{}')::integer, 200);
  v_take := least(greatest(coalesce(p_limit, 50), 1), v_ceil);

  -- ── FIELD-LEVEL SECURITY IS NOT SUSPENDED FOR AN AGENT (DOOR-5 / AGT-N-4). The run reads
  -- exactly what the operating person may read. An input this caller cannot see is refused
  -- BY NAME rather than quietly dropped, because an instruction that silently loses one of
  -- its inputs answers confidently out of half a record.
  select coalesce(array_agg(value), '{}'::text[]) into v_inputs
    from jsonb_array_elements_text(coalesce(v_cfg -> 'inputs', '[]'::jsonb));
  v_level := custom.my_level(p_organization_id, v_table, 'table');
  select coalesce(array_agg(f.field_key), '{}'::text[]) into v_seen
    from iam.visible_field_ids(v_me, p_organization_id, v_table, coalesce(v_level, 'viewer'::public.permission_level), 'read') f;
  foreach v_k in array (v_inputs || v_key) loop
    if not (v_k = any (v_seen)) then
      raise exception 'You cannot see the column "%", so this enrichment cannot be run by you.', v_k
        using errcode = '42501',
              hint = 'AGT-N-4: an agent reads exactly what the person operating it may read, never more. Ask somebody who holds that column to run it, or have it shared with you.';
    end if;
  end loop;

  return query
  select r.id,
         coalesce(nullif(r.data ->> 'title', ''), r.id::text),
         coalesce((select jsonb_object_agg(k, r.data -> k)
                     from unnest(v_inputs) k), '{}'::jsonb),
         r.data -> v_key,
         nullif(r.data -> '_values' -> v_key ->> 'at', '')::timestamptz,
         case when (r.data -> '_values' -> v_key ->> 'at') is null then 'never filled in'
              else format('past its freshness date — written %s days ago and looked at again every %s',
                          round(extract(epoch from (now() - (r.data -> '_values' -> v_key ->> 'at')::timestamptz)) / 86400.0),
                          coalesce(v_every::text || ' days', 'never')) end,
         case when p_limit is not null and p_limit > v_ceil then v_ceil end
    from custom.record r
   where r.organization_id = p_organization_id
     and r.table_id = v_table
     and r.deleted_at is null
     and r.data_class = 'record'
     and r.id in (select v from custom.query_visible_ids(p_organization_id, v_table) v)
     -- A CELL A PERSON PINNED IS NOT WORK. It is somebody's decision, and the run never
     -- sees it at all — not as a row it then skips, which is one bug away from overwriting.
     and not coalesce((r.data -> '_values' -> v_key ->> 'pinned')::boolean, false)
     and (p_include_fresh
          or (r.data -> '_values' -> v_key ->> 'at') is null
          or (v_every is not null
              and (r.data -> '_values' -> v_key ->> 'at')::timestamptz + make_interval(days => v_every) < now()))
   order by (r.data -> '_values' -> v_key ->> 'at') nulls first, r.created_at
   limit v_take;
end;
$fn$;

comment on function custom.enrich_due(uuid, uuid, integer, boolean) is
  'AGT-6: the rows of one Table whose agent-owned column is empty or past its freshness '
  'date, each with the input values the instruction may read — the WHOLE batch in one call. '
  'A pinned cell is never returned. The rate and cost ceilings are asked here, before any '
  'work is handed out, and both refusals say the figure and the cap in words.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'enrich_due',
        'p_organization_id uuid, p_field_id uuid, p_limit integer, p_include_fresh boolean',
        array['uuid'::regtype, 'uuid'::regtype, 'int4'::regtype, 'bool'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_client_may_reach on entry; NULL is refused there. p_field_id is matched together with the organization and the Field kernel, so a field id from another tenant reads as absent, and the Table it names is then checked by custom.assert_may_know_table. Rows are narrowed to custom.query_visible_ids for THIS caller, and the only values returned are the enrichment''s declared input columns and the target column, every one of which must be in iam.visible_field_ids for this caller or the whole call is refused BY NAME — so this door can never return a value the caller could not already read. p_limit is clamped to the organization''s own batch ceiling and cannot be used to sweep a Table.',
        'enrich_a_field_a_model_owns.sql',
        null, true, false)
on conflict do nothing;

-- ═══════════════════════════════════════════════ 7. custom.enrich_cells
-- THE BADGE DATA FOR A WHOLE PAGE, IN ONE CALL.
--
-- `custom.read_record` answers a masked document and its alternates; it does not answer WHO
-- wrote each value, WHEN, out of WHAT, or whether the cell is pinned or past its freshness
-- date. A grid that asked custom.value_read per cell would make fifty round trips to draw
-- fifty badges. So the page asks once, for the ids it is drawing.

create function custom.enrich_cells(
  p_organization_id uuid,
  p_table_id uuid,
  p_field_keys text[] default null,
  p_record_ids uuid[] default null)
returns table(record_id uuid, field_key text, agent_owned boolean, value jsonb,
              value_version integer, actor text, on_behalf_of text,
              written_at timestamptz, source jsonb, absent_reason text,
              alternates jsonb, pinned boolean, stale boolean, due_at timestamptz)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_me    uuid := auth.uid();
  v_seen  text[];
  v_level public.permission_level;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.enrich_cells');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.enrich_cells');

  v_level := custom.my_level(p_organization_id, p_table_id, 'table');
  select coalesce(array_agg(f.field_key), '{}'::text[]) into v_seen
    from iam.visible_field_ids(v_me, p_organization_id, p_table_id,
                               coalesce(v_level, 'viewer'::public.permission_level), 'read') f;

  return query
  with fields as (
    select f.data ->> 'key' as fkey,
           f.data ->> 'source' = 'agent' as owned,
           nullif(f.data ->> 'review_interval_days', '')::integer as every
      from custom.record f
     where f.organization_id = p_organization_id
       and f.table_id = custom.field_kernel_id()
       and f.deleted_at is null
       and (f.data ->> 'entity_definition_id')::uuid = p_table_id
       and nullif(f.data ->> 'key', '') is not null
       -- MASKED IS MASKED. A field this caller may not read carries no badge either: the
       -- badge names the source, and naming the source of a value is telling them it exists.
       and f.data ->> 'key' = any (v_seen)
       and (p_field_keys is null or f.data ->> 'key' = any (p_field_keys))
  )
  select r.id, fl.fkey, fl.owned,
         r.data -> fl.fkey,
         nullif(r.data -> '_values' -> fl.fkey ->> 'ver', '')::integer,
         r.data -> '_values' -> fl.fkey ->> 'actor',
         r.data -> '_values' -> fl.fkey ->> 'on_behalf_of',
         nullif(r.data -> '_values' -> fl.fkey ->> 'at', '')::timestamptz,
         r.data -> '_sources' -> (r.data -> '_values' -> fl.fkey ->> 'src'),
         nullif(r.data -> '_values' -> fl.fkey ->> 'absent', ''),
         -- Every alternate with its source resolved, the way custom.read_record resolves
         -- the ones it carries — a pointer is this store's bookkeeping, never an answer.
         (select jsonb_agg(jsonb_build_object('value', a -> 'value', 'rank', a -> 'rank',
                                              'source', r.data -> '_sources' -> (a ->> 'src'))
                           order by (a ->> 'rank')::int)
            from jsonb_array_elements(coalesce(r.data -> '_values' -> fl.fkey -> 'alternates', '[]'::jsonb)) a),
         coalesce((r.data -> '_values' -> fl.fkey ->> 'pinned')::boolean, false),
         (fl.every is not null
          and (r.data -> '_values' -> fl.fkey ->> 'at') is not null
          and (r.data -> '_values' -> fl.fkey ->> 'at')::timestamptz + make_interval(days => fl.every) < now()),
         case when fl.every is not null and (r.data -> '_values' -> fl.fkey ->> 'at') is not null
              then (r.data -> '_values' -> fl.fkey ->> 'at')::timestamptz + make_interval(days => fl.every) end
    from custom.record r
    cross join fields fl
   where r.organization_id = p_organization_id
     and r.table_id = p_table_id
     and r.deleted_at is null
     and r.data_class = 'record'
     and (p_record_ids is null or r.id = any (p_record_ids))
     and r.id in (select v from custom.query_visible_ids(p_organization_id, p_table_id) v)
     and (r.data ? fl.fkey or r.data -> '_values' ? fl.fkey)
   order by r.created_at, fl.fkey;
end;
$fn$;

comment on function custom.enrich_cells(uuid, uuid, text[], uuid[]) is
  'VAL-1/VAL-2/VAL-3 and AGT-6, for a page of a grid in ONE call: per cell, who wrote it, '
  'when, out of what source, why it is missing when it is, its ranked alternates, whether a '
  'person pinned it and whether it is past its freshness date. Narrowed to the records this '
  'caller can see and the Fields this caller may read — a masked field carries no badge.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'enrich_cells',
        'p_organization_id uuid, p_table_id uuid, p_field_keys text[], p_record_ids uuid[]',
        array['uuid'::regtype, 'uuid'::regtype, 'text[]'::regtype, 'uuid[]'::regtype]::oid[],
        'p_organization_id and p_table_id are checked by custom.assert_client_may_reach and custom.assert_may_know_table on entry, so a Table from another tenant reads as absent. Rows are narrowed to custom.query_visible_ids for THIS caller and columns to iam.visible_field_ids for this caller, so a record this caller cannot open and a field this caller may not read both produce no row at all — a badge names a value''s source, and naming a source is telling somebody the value exists. p_record_ids and p_field_keys only narrow further; neither can widen the two walls above.',
        'enrich_a_field_a_model_owns.sql',
        null, true, false)
on conflict do nothing;

-- ═══════════════════════════════════════════════ 8. custom.enrich_land
-- WHERE THE MODEL'S ANSWERS BECOME VALUES — the whole batch, and the run, in ONE call and
-- ONE transaction, so a run can never be half-recorded and its cost half-known.
--
-- ONE RESULT LOOKS LIKE:
--   {"record_id": "…",
--    "value": "Commercial recycling",        ← absent/null means the model found nothing
--    "confidence": 0.82,                     ← below the floor and the value becomes a candidate
--    "evidence": {"read": [{"url": "…", "title": "…", "at": "…"}], "note": "…"},
--    "alternates": [{"value": "Waste management", "rank": 2, "evidence": {…}}],
--    "absent": "none" | "refused" | "conflicting"}
--
-- AND THE RUN:
--   {"trigger": "batch", "model": "…", "model_version": "…", "cost_cents": 3.4,
--    "tokens_in": 1200, "tokens_out": 90, "started_at": "…"}
--
-- THE FOUR THINGS IT WILL NOT DO:
--   · write into a cell a person PINNED — it says `pinned` for that row and moves on
--   · write a value the model was not sure enough about — that becomes a ranked alternate
--     and the cell says `conflicting`, which is VAL-2's own word for it
--   · write while the enrichment is switched off — the enable IS the standing approval and
--     without it there is nothing to stand on
--   · record a run that would take this organization past its monthly budget

create function custom.enrich_land(
  p_organization_id uuid,
  p_field_id uuid,
  p_results jsonb,
  p_run jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_table   uuid;
  v_key     text;
  v_cfg     jsonb;
  v_floor   numeric;
  v_obo     text;
  v_model   text;
  v_trig    text;
  v_cost    numeric;
  v_cap     numeric;
  v_spent   numeric;
  v_run_id  uuid;
  r         jsonb;
  v_rid     uuid;
  v_doc     jsonb;
  v_env     jsonb;
  v_alts    jsonb;
  a         jsonb;
  v_conf    numeric;
  v_src     jsonb;
  v_absent  text;
  v_level   public.permission_level;
  n_written integer := 0;
  n_absent  integer := 0;
  n_floor   integer := 0;
  n_pinned  integer := 0;
  n_refused integer := 0;
  v_out     jsonb := '[]'::jsonb;
  v_why     text;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.enrich_land');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.enrich_land');

  select (f.data ->> 'entity_definition_id')::uuid, f.data ->> 'key',
         coalesce(f.data -> 'source_config', '{}'::jsonb)
    into v_table, v_key, v_cfg
    from custom.record f
   where f.organization_id = p_organization_id
     and f.id = p_field_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and f.data ->> 'source' = 'agent';
  if v_table is null then
    raise exception 'There is no column here that a model fills in, so there is nothing to write into.'
      using errcode = '23503',
            hint = 'Set the enrichment up first with custom.enrich_declare. A field id from another organization reads as absent.';
  end if;

  -- THE ENABLE IS THE STANDING APPROVAL (AGT-4). An admin turning the enrichment on is the
  -- act that authorises every value it writes afterwards; without it there is no approval to
  -- stand on and nothing lands, however the run got here.
  if not coalesce((v_cfg ->> 'enabled')::boolean, false) then
    raise exception 'That column is set up to be filled in by a model, and it is switched off, so nothing was written.'
      using errcode = '42501',
            hint = 'An admin on the table turns it on with custom.enrich_declare({"enabled": true}). Turning it on is what authorises the agent to write, and every value it writes says so on the cell.';
  end if;

  v_obo := nullif(v_cfg ->> 'enabled_by', '');
  if v_obo is null then
    raise exception 'That enrichment does not say whose authority it runs on, so nothing was written.'
      using errcode = '22004',
            hint = 'VAL-8/AGT-N-4: every value an agent writes names the person it acted for. Turn the enrichment off and on again so it records who enabled it.';
  end if;

  v_floor := coalesce((v_cfg ->> 'confidence_floor')::numeric, 0.6);
  v_model := coalesce(nullif(p_run ->> 'model', ''), nullif(v_cfg ->> 'model', ''), 'unstated');
  v_trig  := lower(btrim(coalesce(nullif(p_run ->> 'trigger', ''), 'batch')));
  if not (v_trig = any (custom.enrich_triggers())) then
    raise exception '"%" is not a reason a run happens.', v_trig
      using errcode = '22023',
            hint = format('The reasons are %s.', array_to_string(custom.enrich_triggers(), ', '));
  end if;
  v_cost := greatest(coalesce((p_run ->> 'cost_cents')::numeric, 0), 0);

  -- THE COST CAP, ASKED AGAIN ON THE WAY OUT. custom.enrich_due asked it before the money
  -- was spent; this asks it before the money is recorded, so a run that overshoots is
  -- refused loudly here rather than discovered in a total next month.
  v_cap := coalesce((platform.knob_resolve('custom', 'enrichment_cost_cap_cents', p_organization_id) #>> '{}')::numeric, 2000);
  select coalesce(sum(coalesce((x.data ->> 'cost_cents')::numeric, 0)), 0) into v_spent
    from custom.record x
   where x.organization_id = p_organization_id
     and x.table_id = custom.organization_kernel_id()
     and x.data_class = custom.enrich_run_class()
     and x.deleted_at is null
     and x.created_at >= date_trunc('month', now());
  if v_spent + v_cost > v_cap then
    raise exception 'This run costs % cents, this organization has already spent % of its % cent budget this month, so nothing was written.',
                    round(v_cost, 2), round(v_spent, 2), v_cap
      using errcode = '53400',
            hint = 'The budget is custom/enrichment_cost_cap_cents and an organization may change it. Nothing landed and no run was recorded — raise the budget and run it again.';
  end if;

  if jsonb_typeof(coalesce(p_results, '[]'::jsonb)) is distinct from 'array' then
    raise exception 'The model''s answers are a list, one per record.'
      using errcode = '22004',
            hint = 'Send [] for a run that produced nothing; the run is still recorded with what it cost.';
  end if;

  for r in select e from jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) e loop
    v_rid := nullif(r ->> 'record_id', '')::uuid;
    if v_rid is null then
      raise exception 'One of the model''s answers does not say which record it is about.'
        using errcode = '22004', hint = 'Every result carries record_id — the id custom.enrich_due handed out.';
    end if;

    select rec.data into v_doc
      from custom.record rec
     where rec.organization_id = p_organization_id
       and rec.id = v_rid
       and rec.table_id = v_table
       and rec.deleted_at is null;
    if v_doc is null then
      n_refused := n_refused + 1;
      v_out := v_out || jsonb_build_array(jsonb_build_object('record_id', v_rid, 'outcome', 'gone',
        'says', 'That record was deleted while the run was working, so nothing was written into it.'));
      continue;
    end if;

    -- THE PERSON'S OWN AUTHORITY, ROW BY ROW (AGT-N-4). An agent may write exactly where the
    -- person it acts for may write; a row they only hold at viewer is refused BY NAME instead
    -- of being written under the definer's privileges.
    v_level := custom.my_level(p_organization_id, v_rid, 'record');
    if v_level is null or v_level < 'editor'::public.permission_level then
      n_refused := n_refused + 1;
      v_out := v_out || jsonb_build_array(jsonb_build_object('record_id', v_rid, 'outcome', 'refused',
        'says', 'You cannot change that record, so the agent acting for you cannot either.'));
      continue;
    end if;

    -- A PINNED CELL IS A PERSON'S DECISION AND IT WINS. It is not overwritten, it is not
    -- versioned, and the run says so instead of reporting a success it did not have.
    if coalesce((v_doc -> '_values' -> v_key ->> 'pinned')::boolean, false) then
      n_pinned := n_pinned + 1;
      v_out := v_out || jsonb_build_array(jsonb_build_object('record_id', v_rid, 'outcome', 'pinned',
        'says', 'Somebody typed this one in themselves, so the model left it alone.'));
      continue;
    end if;

    v_conf := case when jsonb_typeof(r -> 'confidence') = 'number' then (r ->> 'confidence')::numeric end;
    v_src := jsonb_strip_nulls(jsonb_build_object(
      'kind',          'enrichment',
      'field_id',      p_field_id,
      'model',         v_model,
      'model_version', nullif(p_run ->> 'model_version', ''),
      'instruction',   nullif(v_cfg ->> 'instruction', ''),
      'read',          case when jsonb_typeof(r -> 'evidence' -> 'read') = 'array' then r -> 'evidence' -> 'read' end,
      'note',          nullif(r -> 'evidence' ->> 'note', ''),
      'confidence',    to_jsonb(v_conf),
      'at',            to_jsonb(now())));

    -- The candidates the model also considered, kept whatever happens (VAL-3/VAL-4): they
    -- live inside this record's one document, never as a row of their own.
    v_alts := '[]'::jsonb;
    if jsonb_typeof(r -> 'alternates') = 'array' then
      for a in select e from jsonb_array_elements(r -> 'alternates') e loop
        v_alts := v_alts || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
          'value', a -> 'value',
          'rank',  coalesce(a -> 'rank', to_jsonb(jsonb_array_length(v_alts) + 2)),
          'src',   coalesce(a -> 'evidence', v_src))));
      end loop;
    end if;

    v_absent := nullif(btrim(coalesce(r ->> 'absent', '')), '');

    if v_absent is null and (not (r ? 'value') or jsonb_typeof(r -> 'value') = 'null') then
      -- The model looked and there was nothing to find. VAL-2's word for that is `none`, and
      -- saying it is the whole point: a blank cell and a cell nobody asked about are
      -- different facts, and a person deciding what to do next needs to know which this is.
      v_absent := 'none';
    elsif v_absent is null and v_conf is not null and v_conf < v_floor then
      -- BELOW THE FLOOR. The model's best answer becomes the top-ranked CANDIDATE and the
      -- cell says `conflicting` — a guess never sits where a person reads a fact.
      n_floor := n_floor + 1;
      v_alts := jsonb_build_array(jsonb_build_object('value', r -> 'value', 'rank', 1, 'src', v_src))
                || (select coalesce(jsonb_agg(jsonb_set(e, '{rank}', to_jsonb(((e ->> 'rank')::int) + 1))), '[]'::jsonb)
                      from jsonb_array_elements(v_alts) e);
      v_absent := 'conflicting';
    end if;

    if v_absent is not null then
      if not (v_absent = any (custom.absence_reasons())) then
        raise exception '"%" is not a reason a value can be missing.', v_absent
          using errcode = '22023',
                hint = format('The reasons are %s.', array_to_string(custom.absence_reasons(), ', '));
      end if;
      v_env := jsonb_strip_nulls(jsonb_build_object(
        'absent', v_absent, 'src', v_src,
        'alternates', case when jsonb_array_length(v_alts) > 0 then v_alts end));
      v_doc := (v_doc - v_key)
               || jsonb_build_object('_values',
                    coalesce(v_doc -> '_values', '{}'::jsonb) || jsonb_build_object(v_key, v_env));
      if v_absent <> 'conflicting' then n_absent := n_absent + 1; end if;
      v_why := case v_absent
                 when 'none'        then 'The model looked and there was nothing to find.'
                 when 'refused'     then 'The model would not answer this one.'
                 when 'conflicting' then 'The model was not sure enough to write it, so its answer is kept as a candidate on the cell.'
                 else 'Nobody has asked about this one yet.' end;
    else
      v_env := jsonb_strip_nulls(jsonb_build_object(
        'src', v_src,
        'alternates', case when jsonb_array_length(v_alts) > 0 then v_alts end));
      v_doc := (v_doc - '_values' || jsonb_build_object(v_key, r -> 'value'))
               || jsonb_build_object('_values',
                    (coalesce(v_doc -> '_values', '{}'::jsonb) - v_key) || jsonb_build_object(v_key, v_env));
      n_written := n_written + 1;
      v_why := 'Filled in by the model.';
    end if;

    -- THE WRITE. `_actor` and `_on_behalf_of` are the store's reserved declaration: this is
    -- an AGENT write, acting for the person who enabled the enrichment, and custom._value_envelope
    -- refuses it if either half is missing. The badge on the cell is that fact, not a style.
    update custom.record
       set data = v_doc || jsonb_build_object('_actor', 'agent', '_on_behalf_of', v_obo),
           updated_at = now(),
           version = version + 1
     where organization_id = p_organization_id and id = v_rid and deleted_at is null;

    v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'record_id', v_rid,
      'outcome', case when v_absent is null then 'written'
                      when v_absent = 'conflicting' then 'below the floor'
                      else 'absent' end,
      'absent', v_absent, 'confidence', to_jsonb(v_conf), 'says', v_why)));
  end loop;

  -- THE RUN, AND THE MONEY. One record, under the Organization kernel, in this same
  -- transaction — so "what has this column cost" is a sum over the organization's own
  -- records with no second ledger to keep level.
  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, custom.organization_kernel_id(), custom.enrich_run_class(),
          jsonb_strip_nulls(jsonb_build_object(
            'field_id',      p_field_id,
            'table_id',      v_table,
            'field_key',     v_key,
            'model',         v_model,
            'model_version', nullif(p_run ->> 'model_version', ''),
            'trigger',       v_trig,
            'started_at',    nullif(p_run ->> 'started_at', ''),
            'finished_at',   now()::text,
            'rows_seen',     jsonb_array_length(coalesce(p_results, '[]'::jsonb)),
            'rows_written',  n_written,
            'rows_absent',   n_absent,
            'rows_below_floor', n_floor,
            'rows_pinned',   n_pinned,
            'rows_refused',  n_refused,
            'cost_cents',    v_cost,
            'cost_per_row_cents', case when n_written + n_absent + n_floor > 0
                                       then round(v_cost / (n_written + n_absent + n_floor), 4) end,
            'tokens_in',     nullif(p_run ->> 'tokens_in', ''),
            'tokens_out',    nullif(p_run ->> 'tokens_out', ''),
            'on_behalf_of',  v_obo)))
  returning id into v_run_id;

  return jsonb_build_object(
    'run_id', v_run_id, 'field_id', p_field_id, 'field_key', v_key, 'table_id', v_table,
    'rows_seen', jsonb_array_length(coalesce(p_results, '[]'::jsonb)),
    'rows_written', n_written, 'rows_absent', n_absent, 'rows_below_floor', n_floor,
    'rows_pinned', n_pinned, 'rows_refused', n_refused,
    'cost_cents', v_cost,
    'cost_per_row_cents', case when n_written + n_absent + n_floor > 0
                               then round(v_cost / (n_written + n_absent + n_floor), 4) end,
    'budget_left_cents', round(v_cap - (v_spent + v_cost), 2),
    'results', v_out,
    'says', format('%s of %s filled in, %s left alone because somebody typed them in themselves, %s kept as candidates, %s with nothing to find. It cost %s cents.',
                   n_written, jsonb_array_length(coalesce(p_results, '[]'::jsonb)),
                   n_pinned, n_floor, n_absent, round(v_cost, 2)));
end;
$fn$;

comment on function custom.enrich_land(uuid, uuid, jsonb, jsonb) is
  'AGT-6/VAL-1..VAL-8: the whole batch and its run in ONE call and ONE transaction. Each '
  'value lands with actor agent, on behalf of the person who enabled the enrichment, the '
  'interned evidence pointer, the model and its version, and the ranked candidates it beat. '
  'A pinned cell is left alone; an answer below the floor becomes a candidate and the cell '
  'says conflicting; the monthly budget is asked before the run is recorded.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'enrich_land',
        'p_organization_id uuid, p_field_id uuid, p_results jsonb, p_run jsonb',
        array['uuid'::regtype, 'uuid'::regtype, 'jsonb'::regtype, 'jsonb'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_store_door and then custom.assert_client_may_reach on entry; NULL is refused there. p_field_id is matched together with the organization, the Field kernel and source = agent, so a field id from another tenant reads as absent, and the enrichment must be ENABLED or nothing is written at all. Every record_id in p_results is matched together with the organization AND that Field''s own Table, so a record of another Table or another tenant is answered "gone" and never written; each one is then decided by custom.my_level at the EDITOR rung under the caller''s own principal, so this door can never write where the caller could not. Nothing in p_results is executed: the value, the evidence and the candidates are stored as data and every one of them goes through custom._value_envelope''s own law. The monthly cost cap is asked before the run row is written.',
        'enrich_a_field_a_model_owns.sql',
        null, true, false)
on conflict do nothing;

-- ═══════════════════════════════════════════════ 9. custom.enrich_pin
-- A PERSON'S DECISION, MADE EXPLICIT AND REVERSIBLE.
--
-- Pinning happens on its own: the moment a person types over an agent-owned cell, the store
-- pins it (that is this lane's class fix in custom._value_envelope). This door exists for
-- the other two halves — pinning a cell WITHOUT changing it, and un-pinning one so the
-- enrichment may have it back.

create function custom.enrich_pin(
  p_organization_id uuid,
  p_record_id uuid,
  p_field_key text,
  p_pinned boolean default true)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_doc   jsonb;
  v_table uuid;
  v_src   text;
  v_env   jsonb;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.enrich_pin');
  perform custom.assert_client_may_change(p_organization_id, p_record_id, 'custom.enrich_pin');

  select rec.data, rec.table_id into v_doc, v_table
    from custom.record rec
   where rec.organization_id = p_organization_id and rec.id = p_record_id and rec.deleted_at is null;
  if v_doc is null then
    raise exception 'There is no record % in this organization any more.', p_record_id
      using errcode = '02000', hint = 'It was deleted, or it never existed here.';
  end if;

  select f.data ->> 'source' into v_src
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = v_table
     and f.data ->> 'key' = p_field_key;
  if v_src is null then
    raise exception 'This table has no column called "%".', p_field_key
      using errcode = '22023', hint = 'Pinning holds a particular cell against the model that fills the column; the column has to exist.';
  end if;
  if v_src is distinct from 'agent' then
    raise exception 'Nothing fills "%" in automatically, so there is nothing to hold it against.', p_field_key
      using errcode = '22023',
            hint = 'AGT-6: pinning is what stops an ENRICHMENT from writing over a cell. A column people type into themselves is never written over in the first place.';
  end if;

  v_env := coalesce(v_doc -> '_values' -> p_field_key, '{}'::jsonb);
  if jsonb_typeof(v_env) <> 'object' then v_env := '{}'::jsonb; end if;
  -- `false` is written out EXPLICITLY, which is what tells custom.pin_agent_cells this is a
  -- deliberate un-pin rather than a write that merely forgot to mention the pin.
  v_env := v_env || jsonb_build_object('pinned', coalesce(p_pinned, true));

  update custom.record
     set data = (v_doc || jsonb_build_object('_values',
                   coalesce(v_doc -> '_values', '{}'::jsonb) || jsonb_build_object(p_field_key, v_env))),
         updated_at = now(),
         version = version + 1
   where organization_id = p_organization_id and id = p_record_id and deleted_at is null;

  return jsonb_build_object(
    'record_id', p_record_id, 'field_key', p_field_key,
    'pinned', coalesce(p_pinned, true),
    'says', case when coalesce(p_pinned, true)
                 then 'This one is yours now — the model will leave it alone until you say otherwise.'
                 else 'The model may fill this one in again the next time it runs.' end);
end;
$fn$;

comment on function custom.enrich_pin(uuid, uuid, text, boolean) is
  'AGT-6: hold one cell against the enrichment that fills its column, or hand it back. A '
  'person typing over an agent-owned cell pins it without asking (custom.pin_agent_cells); '
  'this door is for pinning a cell nobody changed, and for un-pinning.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'enrich_pin',
        'p_organization_id uuid, p_record_id uuid, p_field_key text, p_pinned boolean',
        array['uuid'::regtype, 'uuid'::regtype, 'text'::regtype, 'bool'::regtype]::oid[],
        'p_organization_id and p_record_id are checked by custom.assert_store_door and custom.assert_client_may_change at the EDITOR rung on entry, so a record from another tenant reads as absent and a record this caller may only view is refused. p_field_key must name a declared Field OF THAT RECORD''S OWN TABLE whose source is agent, and anything else is refused BY NAME; it writes exactly one boolean into that one value''s envelope and touches no other key of the document and no other record.',
        'enrich_a_field_a_model_owns.sql',
        null, true, false)
on conflict do nothing;

-- ═══════════════════════════════════════════════ 10. custom.enrich_runs
-- What this column has cost, run by run. A number with no history behind it is a number
-- nobody can argue with.

create function custom.enrich_runs(
  p_organization_id uuid,
  p_field_id uuid default null,
  p_limit integer default 50)
returns table(run_id uuid, field_id uuid, field_key text, model text, trigger_word text,
              rows_seen integer, rows_written integer, rows_absent integer,
              rows_below_floor integer, rows_pinned integer, rows_refused integer,
              cost_cents numeric, cost_per_row_cents numeric, ran_at timestamptz)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.enrich_runs');
  return query
    select x.id,
           nullif(x.data ->> 'field_id', '')::uuid,
           x.data ->> 'field_key',
           x.data ->> 'model',
           x.data ->> 'trigger',
           coalesce((x.data ->> 'rows_seen')::integer, 0),
           coalesce((x.data ->> 'rows_written')::integer, 0),
           coalesce((x.data ->> 'rows_absent')::integer, 0),
           coalesce((x.data ->> 'rows_below_floor')::integer, 0),
           coalesce((x.data ->> 'rows_pinned')::integer, 0),
           coalesce((x.data ->> 'rows_refused')::integer, 0),
           coalesce((x.data ->> 'cost_cents')::numeric, 0),
           nullif(x.data ->> 'cost_per_row_cents', '')::numeric,
           x.created_at
      from custom.record x
     where x.organization_id = p_organization_id
       and x.table_id = custom.organization_kernel_id()
       and x.data_class = custom.enrich_run_class()
       and x.deleted_at is null
       and (p_field_id is null or nullif(x.data ->> 'field_id', '')::uuid = p_field_id)
       -- ONLY OVER TABLES THIS CALLER CAN OPEN (VIS-5). A run names a Table and a column, so
       -- a list of runs is a list of Tables to anybody who can read it.
       and nullif(x.data ->> 'table_id', '')::uuid
             in (select v from custom.query_visible_ids(p_organization_id, custom.table_kernel_id()) v)
     order by x.created_at desc
     limit least(greatest(coalesce(p_limit, 50), 1), 500);
end;
$fn$;

comment on function custom.enrich_runs(uuid, uuid, integer) is
  'ENRICH: this organization''s enrichment runs, newest first — what was filled in, what was '
  'left alone, what it cost and what that was per row. Narrowed to the Tables this caller '
  'can open, so a run list is never a second way to learn that a Table exists.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'enrich_runs',
        'p_organization_id uuid, p_field_id uuid, p_limit integer',
        array['uuid'::regtype, 'uuid'::regtype, 'int4'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_client_may_reach on entry; NULL is refused there. Rows are narrowed to runs whose subject Table is in custom.query_visible_ids for THIS caller, so a run over a Table this caller cannot open is absent and a p_field_id from another tenant returns zero rows. It returns no value of any record — only counts, a model name and money. p_limit is clamped to 500.',
        'enrich_a_field_a_model_owns.sql',
        null, true, false)
on conflict do nothing;
