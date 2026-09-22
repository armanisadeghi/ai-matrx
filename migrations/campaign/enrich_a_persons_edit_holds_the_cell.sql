-- target: branch,production
-- additive: yes
--   It ADDS two functions (`custom.pin_agent_cells`, `custom.carry_unchanged_value_stamps`)
--   and REPLACES two existing bodies in place, each under a `-- based-on:` hash measured
--   against the live catalogue: `custom.value_envelope_keys` gains one word in a list and
--   `custom.field_update` gains one arm. The third replacement this class fix needs — the
--   trigger `custom._value_envelope`, which is the choke point the pin is taken at — is in
--   `enrich_the_trigger_takes_the_pin.sql` and says in its own header why it is a file of
--   its own.
--   No table, column, trigger, policy, grant or row is touched. Nothing is dropped, revoked
--   or renamed, and no existing behaviour is removed: every refusal these bodies made
--   yesterday they still make. The inverse is
--   `migrations/inverse/enrich_a_persons_edit_holds_the_cell_down.sql`, which puts all three
--   bodies back byte for byte.
-- guard: custom/system_enabled
-- based-on: custom.value_envelope_keys() a44b4185503b5cabad23e16060fc1a0a8d5afb1c81a6528ef723a5d3c24b7d8e
-- based-on: custom.field_update(uuid, uuid, jsonb) f9f60c08e39701f99129bd643d9ae03721936c510e48d39cc04580a7d34c329b
--
-- LANE ENRICH — the class fix underneath PRODUCTS row 10.
-- Contract rows: AGT-6 (freshness), VAL-7 (every write stamps an actor), VAL-8 (the actor
-- vocabulary), VAL-5 (visibility is per Field and per Record, never per Value — which is
-- why `pinned` is a fact about a VALUE and is allowed, while `access` is not).
--
-- ════════════════════════════════════════════════════════════════════════════════
-- DEFECT 1 — EVERY VALUE IN A RECORD CLAIMED TO HAVE BEEN WRITTEN AT THE SAME MOMENT
-- ════════════════════════════════════════════════════════════════════════════════
--
-- `custom.stamp_value_envelopes` puts `at`, `actor` and `on_behalf_of` on EVERY envelope in
-- `_values` on EVERY write, whether or not that value moved. `custom.value_versions` gets
-- this right — it keeps a value's `ver` where nothing about it changed — but the three
-- stamps were overwritten underneath it. Measured on the main database, 2026-09-20:
--
--     0041f1dc… : key v2 @07:21:04 system , title v1 @07:21:04 system
--     0615df9a… : ssn v1 @00:35:07 user   , title v2 @00:35:07 user
--
-- Two values, two different versions, ONE moment — because writing the title restamped the
-- SSN. So the store recorded when the RECORD was last written and called it when the VALUE
-- was last written, and there was no way to ask the second question at all.
--
-- That is not a cosmetic defect. It is the foundation of three shipped things:
--   · AGT-6's whole law — "a Field with source = agent is filled on a schedule its
--     `review_interval_days` sets" — is `at` + an interval. With a shared `at`, touching any
--     column of a record made every agent-owned column of it look freshly written.
--   · `@ai-matrx/records-ui`'s own EnrichPanel already reads `_values.<key>.at` and says in
--     its header "a screen that timed this off `updated_at` on the row would call every
--     field stale because one of them changed". It was reading a row's moment believing it
--     was a value's.
--   · `custom.dashboard_stuck` reports, per row, that it used "the moment this field was
--     last written". It was reporting the moment the record was last written.
--
-- THE FIX IS ONE FUNCTION AND ONE LINE, and it is deliberately NOT a change to
-- `custom.stamp_value_envelopes`: that function is IMMUTABLE, knows nothing of the prior
-- document, and has other callers. `custom.carry_unchanged_value_stamps` runs immediately
-- after `custom.value_versions` and puts the old `at`, `actor` and `on_behalf_of` back on
-- every value whose `ver` did not move — using the store's OWN answer to "did this value
-- change", so the moment and the version can never disagree again.
--
-- ════════════════════════════════════════════════════════════════════════════════
-- DEFECT 2 — A PERSON COULD NOT HOLD A CELL AGAINST THE MODEL THAT FILLS ITS COLUMN
-- ════════════════════════════════════════════════════════════════════════════════
--
-- A column a model owns is still a column people type into. The moment somebody corrects
-- what the model wrote, the next run must not quietly put its own answer back — that is the
-- single behaviour that decides whether anyone ever trusts an agent-filled column.
--
-- `pinned` is therefore a key of the value envelope, beside `ver`, `src`, `actor` and
-- `absent`. It is emphatically NOT an access word: `custom.per_value_access_words()` refuses
-- visibility, access, share, acl, permission and secret on a value, because VAL-5 puts those
-- on the Field and the Record. Who may READ this cell is unchanged and untouched. `pinned`
-- says who WRITES it next, which is exactly the kind of fact a Value has always carried.
--
-- AND IT IS SET IN THE TRIGGER, NOT IN A DOOR. There are a dozen ways a person's edit
-- reaches a cell — the grid, the record form, `custom.record_update`, an import, a restore,
-- `custom.entity_value_write`. A pin implemented in one of them is a pin that one screen
-- honours. `custom._value_envelope` is the choke point every one of them passes through.
--
--   · a write whose author is a PERSON, on a key whose Field says `source = agent`, pins it
--   · a pin already on a value is CARRIED FORWARD, so a later write that does not mention
--     the pin cannot silently drop it
--   · a caller that names `pinned` explicitly is obeyed — `false` is how un-pinning works,
--     and `custom.enrich_pin` is the door that says it
--   · a `pinned` that is not a true/false is refused BY NAME rather than cast
--
-- ════════════════════════════════════════════════════════════════════════════════
-- DEFECT 3 — `custom.field_update` ACCEPTED `source` AND THREW IT AWAY
-- ════════════════════════════════════════════════════════════════════════════════
--
-- Its settings arm has an `if p_patch ? …` line for label, required, dated, sort,
-- sensitivity, context_policy, unit, promoted, unique, rules and depends_on — and none for
-- `source`, `source_config` or `review_interval_days`. So the door returned the field id,
-- reported success and changed nothing, and there was no way for a person or an agent to
-- declare an enrichment on an existing column through ANY door. Same class as `promoted`
-- and `unique`, which SEAT-SUITES found in this very function on 2026-09-19. The arm routes
-- `source = 'agent'` through `custom.enrich_normalize`, so there is no entrance to "a model
-- fills this in" that skips the judging.

set lock_timeout = '5s';
set statement_timeout = '600s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. `pinned` joins the closed key set of a value envelope.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function custom.value_envelope_keys()
returns text[]
language sql
immutable
set search_path to 'pg_catalog'
as $fn$
  -- `dated` (HIS-5) is the world clock: the periods this value was true for, on a Field that
  -- declared the `dated` modifier. `pinned` (ENRICH, AGT-6) is a person holding THIS cell
  -- against the model that fills its column — a fact about who writes the value next, never
  -- about who may read it, which is why it is a value's and the access words are not
  -- (VAL-5, custom.per_value_access_words). Everything else is unchanged from W1-VAL.
  select array['ver', 'src', 'actor', 'on_behalf_of', 'at', 'absent', 'alternates', 'dated',
               'pinned']::text[];
$fn$;

comment on function custom.value_envelope_keys() is
  'VAL-1..VAL-8 and AGT-6: the closed set of keys one value envelope may carry. A key that '
  'is not in this list is refused by custom.value_envelope_refusal BY NAME.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. custom.pin_agent_cells — the pin rule, in one testable place.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function custom.pin_agent_cells(
  p_new jsonb, p_old jsonb, p_agent_keys text[])
returns jsonb
language plpgsql
immutable
set search_path to 'pg_catalog'
as $fn$
declare
  v_out   jsonb := '{}'::jsonb;
  v_key   text;
  v_env   jsonb;
  v_prior jsonb;
begin
  if p_new is null or coalesce(jsonb_typeof(p_new -> '_values'), '') <> 'object' then
    return p_new;
  end if;
  for v_key, v_env in select * from jsonb_each(p_new -> '_values') loop
    if jsonb_typeof(v_env) <> 'object' then
      v_out := v_out || jsonb_build_object(v_key, v_env);
      continue;
    end if;
    v_prior := coalesce(p_old, '{}'::jsonb) -> '_values' -> v_key;

    if v_env ? 'pinned' then
      -- THE CALLER SAID SO. `false` is a deliberate un-pin (custom.enrich_pin writes it),
      -- and it is stored as an absence rather than as the word "false", so the envelope
      -- stays the shape every other reader already knows.
      if jsonb_typeof(v_env -> 'pinned') <> 'boolean' then
        raise exception 'Whether "%" is held against the model is yes or no, and this says %.',
                        v_key, jsonb_typeof(v_env -> 'pinned')
          using errcode = '22023',
                hint = 'AGT-6: pinned is true or false. custom.enrich_pin is the door that sets it.';
      end if;
      if not (v_env ->> 'pinned')::boolean then
        v_env := v_env - 'pinned';
      end if;
    elsif coalesce((v_prior ->> 'pinned')::boolean, false) then
      -- CARRIED FORWARD. A write that says nothing about the pin cannot drop it, so a pin
      -- survives every later edit of the record until somebody un-pins it on purpose.
      v_env := v_env || jsonb_build_object('pinned', true);
    elsif coalesce(v_env ->> 'actor', '') = 'user' and v_key = any (coalesce(p_agent_keys, '{}'::text[])) then
      -- A PERSON TYPED OVER A COLUMN A MODEL OWNS. That is the pin, and it is taken here so
      -- that every door — the grid, the record form, an import, a restore — takes it.
      v_env := v_env || jsonb_build_object('pinned', true);
    end if;

    v_out := v_out || jsonb_build_object(v_key, v_env);
  end loop;
  return jsonb_set(p_new, '{_values}', v_out);
end;
$fn$;

comment on function custom.pin_agent_cells(jsonb, jsonb, text[]) is
  'AGT-6: a person''s edit of a cell whose Field says source = agent holds that cell against '
  'the enrichment until somebody un-pins it. Taken in custom._value_envelope so every write '
  'door takes it, carried forward so no later write can drop it silently, and overridable '
  'only by a caller that names `pinned` explicitly.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. custom.carry_unchanged_value_stamps — a value keeps its own moment.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function custom.carry_unchanged_value_stamps(p_old jsonb, p_new jsonb)
returns jsonb
language plpgsql
immutable
set search_path to 'pg_catalog'
as $fn$
declare
  v_out   jsonb := '{}'::jsonb;
  v_key   text;
  v_env   jsonb;
  v_prior jsonb;
begin
  if p_new is null or coalesce(jsonb_typeof(p_new -> '_values'), '') <> 'object' then
    return p_new;
  end if;
  if p_old is null or coalesce(jsonb_typeof(p_old -> '_values'), '') <> 'object' then
    return p_new;
  end if;
  for v_key, v_env in select * from jsonb_each(p_new -> '_values') loop
    v_prior := p_old -> '_values' -> v_key;
    -- THE STORE'S OWN ANSWER TO "DID THIS VALUE CHANGE" is its version, which
    -- custom.value_versions has just decided over the value, its source, its reason for
    -- absence and its alternates. Asking the same question a second way here is how the
    -- moment and the version would drift apart again.
    if jsonb_typeof(v_env) = 'object' and jsonb_typeof(v_prior) = 'object'
       and (v_env -> 'ver') is not distinct from (v_prior -> 'ver')
       and (v_prior ? 'at') then
      v_env := v_env
               || jsonb_build_object('at', v_prior -> 'at')
               || jsonb_build_object('actor', coalesce(v_prior -> 'actor', v_env -> 'actor'));
      if v_prior ? 'on_behalf_of' then
        v_env := v_env || jsonb_build_object('on_behalf_of', v_prior -> 'on_behalf_of');
      else
        v_env := v_env - 'on_behalf_of';
      end if;
    end if;
    v_out := v_out || jsonb_build_object(v_key, v_env);
  end loop;
  return jsonb_set(p_new, '{_values}', v_out);
end;
$fn$;

comment on function custom.carry_unchanged_value_stamps(jsonb, jsonb) is
  'VAL-7 and AGT-6: a value nobody re-asserted keeps the moment it was written and the '
  'author who wrote it. custom.stamp_value_envelopes stamps every envelope on every write; '
  'this puts the old stamps back wherever custom.value_versions decided the value did not '
  'move, so "when was THIS value written" is answerable at all.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. custom.field_update — the arm for the three settings it threw away.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION custom.field_update(p_organization_id uuid, p_field_id uuid, p_patch jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_old       jsonb;
  v_table     uuid;
  v_next      jsonb;
  v_opts      uuid;
  v_word      text;
  v_spec      jsonb;
  v_was       text;
  v_now       text;
  v_behaviour boolean;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.field_update');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.field_update');

  select r.data, (r.data ->> 'entity_definition_id')::uuid into v_old, v_table
    from custom.record r
   where r.organization_id = p_organization_id
     and r.id = p_field_id
     and r.table_id = custom.field_kernel_id()
     and r.deleted_at is null;
  if v_old is null then
    raise exception 'There is no such field in this organization, so nothing was changed.'
      using errcode = '23514', hint = 'REC-29: organizations are hard walls.';
  end if;
  if v_table is not null then
    perform custom.assert_client_may_change(p_organization_id, v_table, 'custom.field_update',
                                            'admin'::public.permission_level, 'table');
  end if;

  if nullif(p_patch ->> 'key', '') is not null and (p_patch ->> 'key') is distinct from (v_old ->> 'key') then
    raise exception 'A field''s key is how every saved value finds it, so it cannot be renamed.'
      using errcode = '23514', hint = 'The name a person reads is the label, and that can be changed freely.';
  end if;

  -- ── IS THIS A CHANGE OF BEHAVIOUR? T12. ───────────────────────────────────────────────
  -- Any of the three words a caller uses for it. The door used to refuse one of them and
  -- ignore the other two; it now carries all three out through the same function that shapes
  -- a field when it is created, so a column changed and a column created are the same shape.
  v_behaviour := coalesce(nullif(p_patch ->> 'parity_type', ''),
                          nullif(p_patch ->> 'plain', ''),
                          nullif(p_patch ->> 'type', '')) is not null;

  if v_behaviour then
    -- The spec is everything this field already is, with the patch written over it. The key
    -- and the table never move; `custom._field_document_for` decides the rest.
    v_spec := jsonb_strip_nulls(jsonb_build_object(
      'key',            v_old ->> 'key',
      'label',          coalesce(p_patch ->> 'label', v_old ->> 'label'),
      'multi',          coalesce(p_patch -> 'multi', v_old -> 'multi'),
      'dated',          coalesce(p_patch -> 'dated', v_old -> 'dated'),
      'required',       coalesce(p_patch -> 'required', v_old -> 'required'),
      'sort',           coalesce(p_patch -> 'sort', v_old -> 'sort'),
      'source',         coalesce(p_patch ->> 'source', v_old ->> 'source'),
      'source_config',  coalesce(p_patch -> 'source_config', v_old -> 'source_config'),
      'sensitivity',    coalesce(p_patch ->> 'sensitivity', v_old ->> 'sensitivity'),
      'context_policy', coalesce(p_patch ->> 'context_policy', v_old ->> 'context_policy'),
      'applies_to_types', coalesce(p_patch -> 'applies_to_types', v_old -> 'applies_to_types'),
      'depends_on',     coalesce(p_patch -> 'depends_on', v_old -> 'depends_on'),
      'unit',           coalesce(p_patch ->> 'unit', v_old ->> 'unit'),
      'expr',           coalesce(p_patch -> 'expr', v_old -> 'config' -> 'expr'),
      'on_target_delete', coalesce(p_patch ->> 'on_target_delete', v_old ->> 'on_target_delete'),
      'options_table_id', coalesce(p_patch ->> 'options_table_id', v_old -> 'config' ->> 'options_table_id'),
      'options',        p_patch -> 'options',
      'rules',          coalesce(p_patch -> 'rules', v_old -> 'rules')));
    -- The patch's own word for the behaviour, whichever of the three it used.
    if nullif(p_patch ->> 'parity_type', '') is not null then
      v_spec := v_spec || jsonb_build_object('parity_type', p_patch ->> 'parity_type');
    elsif nullif(p_patch ->> 'plain', '') is not null then
      v_spec := v_spec || jsonb_build_object('plain', p_patch ->> 'plain');
    else
      v_spec := v_spec || jsonb_build_object('type', p_patch ->> 'type');
    end if;

    v_next := custom._field_document_for(p_organization_id, v_table, v_spec);
    -- The key and the table are this field's identity and _field_document_for takes them from
    -- the spec; written again here so a spec that lost one cannot silently move a field.
    v_next := v_next || jsonb_build_object('key', v_old ->> 'key');
    -- SEAT-SUITES: a column that was indexed stays indexed when it changes what it holds,
    -- unless the patch says otherwise. `custom._field_document_for` builds a fresh document
    -- and knows nothing about either setting, so without this a retype silently un-promoted
    -- the column and the index went on standing for a shape that no longer exists.
    if coalesce(p_patch -> 'promoted', v_old -> 'promoted') is not null then
      v_next := v_next || jsonb_build_object('promoted', coalesce(p_patch -> 'promoted', v_old -> 'promoted'));
    end if;
    if coalesce(p_patch -> 'unique', v_old -> 'unique') is not null then
      v_next := v_next || jsonb_build_object('unique', coalesce(p_patch -> 'unique', v_old -> 'unique'));
    end if;
    if v_table is not null then
      v_next := v_next || jsonb_build_object('entity_definition_id', v_table::text);
    end if;

    v_was := custom.field_behaviour(v_old);
    v_now := custom.field_behaviour(v_next);

    -- THE CHOICES, if the new behaviour is a list and the caller typed some.
    if (v_next ->> 'type') = 'list'
       and nullif(v_next -> 'config' ->> 'options_table_id', '') is null
       and jsonb_typeof(p_patch -> 'options') = 'array'
       and jsonb_array_length(p_patch -> 'options') > 0 then
      v_opts := custom._options_table_for(p_organization_id, v_next ->> 'label', p_patch -> 'options');
      v_next := jsonb_set(v_next, '{config,options_table_id}', to_jsonb(v_opts::text));
    end if;

    -- ── RELATION-DECLARE, 2026-09-20: THE LINKS GO FIRST, THEN THE COLUMN CHANGES. ────
    -- Retyping a relation column to text left its edges LIVE in platform.associations, still
    -- naming a field that no longer behaves as a relation - and platform.relations_to then
    -- raised 23514 for EVERY record of the table it used to point at. One column took down
    -- the whole reverse side of another table. The links go in the same operation as the
    -- change that made them meaningless, softly, so REL-13's history keeps its record of them.
    if (v_old ->> 'type') = 'relation'
       and ((v_next ->> 'type') is distinct from 'relation'
            or (v_next ->> 'relation_target') is distinct from (v_old ->> 'relation_target')) then
      perform custom.relation_edges_withdraw(p_organization_id, array[p_field_id],
        case when (v_next ->> 'type') is distinct from 'relation'
             then format('"%s" no longer points at other records',
                         coalesce(v_next ->> 'label', v_next ->> 'key'))
             else format('"%s" now points at a different table',
                         coalesce(v_next ->> 'label', v_next ->> 'key')) end);
    end if;

    -- AND THE WRITE, which is what fires custom._field_type_converts_values: every value of
    -- this column is converted where it converts and kept in `_retired` with its reason where
    -- it does not, and the history.migration_log row is written by that same trigger. Nothing
    -- here duplicates any of it — this door's whole job was to let it happen.
    update custom.record
       set data = v_next, updated_at = now(), version = version + 1
     where organization_id = p_organization_id
       and id = p_field_id
       and table_id = custom.field_kernel_id();

    if v_was is not distinct from v_now then
      raise notice 'custom: "%" still behaves as %; its other settings were saved.',
        coalesce(v_next ->> 'label', v_next ->> 'key'), coalesce(v_now, 'before');
    end if;
    return p_field_id;
  end if;

  -- ── OTHERWISE: THE SETTINGS, exactly as before. ───────────────────────────────────────
  v_next := v_old;
  if p_patch ? 'label'          then v_next := jsonb_set(v_next, '{label}', to_jsonb(p_patch ->> 'label')); end if;
  if p_patch ? 'required'       then v_next := jsonb_set(v_next, '{required}', to_jsonb(coalesce((p_patch ->> 'required')::boolean, false))); end if;
  if p_patch ? 'dated'          then v_next := jsonb_set(v_next, '{dated}', to_jsonb(coalesce((p_patch ->> 'dated')::boolean, false))); end if;
  if p_patch ? 'sort'           then v_next := jsonb_set(v_next, '{sort}', to_jsonb(coalesce((p_patch ->> 'sort')::numeric, 100))); end if;
  if p_patch ? 'sensitivity'    then v_next := jsonb_set(v_next, '{sensitivity}', to_jsonb(p_patch ->> 'sensitivity')); end if;
  if p_patch ? 'context_policy' then v_next := jsonb_set(v_next, '{context_policy}', to_jsonb(p_patch ->> 'context_policy')); end if;
  if p_patch ? 'unit'           then v_next := jsonb_set(v_next, '{unit}', to_jsonb(p_patch ->> 'unit')); end if;
  -- ── ENRICH, 2026-09-20: THE THREE SETTINGS THAT MADE AGT-6 UNREACHABLE. ───────────────
  -- `source`, `source_config` and `review_interval_days` are keys the Field document has
  -- always carried and this door has never had an arm for. So `custom.field_update(field,
  -- {"source":"agent","review_interval_days":30})` returned the field id, reported success
  -- and changed NOTHING - and no person and no agent could declare an enrichment on an
  -- existing column through any door at all. That is the measured state behind AGT-6's own
  -- "zero readers and zero writers", and it is the same class as `promoted` / `unique`,
  -- which SEAT-SUITES closed on 2026-09-19.
  --
  -- A column a MODEL owns is not an ordinary setting, so the arm does not simply write the
  -- word: `source = 'agent'` is handed to custom.enrich_normalize, the ONE judge of an
  -- enrichment, exactly as custom.enrich_declare does. There is therefore no way into
  -- "a model fills this in" that skips the judging - not a door, not a script, not a lane.
  if p_patch ? 'review_interval_days' then
    if jsonb_typeof(p_patch -> 'review_interval_days') = 'null' then
      v_next := v_next - 'review_interval_days';
    else
      v_next := jsonb_set(v_next, '{review_interval_days}',
                          to_jsonb((p_patch ->> 'review_interval_days')::integer));
    end if;
  end if;
  if p_patch ? 'source' or p_patch ? 'source_config' then
    v_next := jsonb_set(v_next, '{source}',
                        to_jsonb(coalesce(nullif(p_patch ->> 'source', ''), v_next ->> 'source', 'manual')));
    v_next := jsonb_set(v_next, '{source_config}',
                        coalesce(p_patch -> 'source_config', v_next -> 'source_config', '{}'::jsonb));
    if (v_next ->> 'source') = 'agent' then
      v_next := jsonb_set(v_next, '{source_config}',
                  custom.enrich_normalize(p_organization_id, v_table, v_next ->> 'key',
                    coalesce(v_next -> 'source_config', '{}'::jsonb)
                    || jsonb_strip_nulls(jsonb_build_object('review_interval_days',
                         v_next -> 'review_interval_days'))));
      -- The two copies of freshness cannot disagree: the Field's own key is the one AGT-6
      -- names, and the judged config is what the runner reads, so the judge decides both.
      if (v_next -> 'source_config' -> 'review_interval_days') is not null then
        v_next := jsonb_set(v_next, '{review_interval_days}',
                            v_next -> 'source_config' -> 'review_interval_days');
      else
        v_next := v_next - 'review_interval_days';
      end if;
    end if;
  end if;
  -- SEAT-SUITES: THE TWO SETTINGS THIS DOOR ACCEPTED AND THREW AWAY. `custom.promote_field`
  -- reads `promoted` and `unique` off the Field document to decide whether to build an index
  -- and whether it is a unique one. Neither had an arm here, so `custom.field_update(field,
  -- {"promoted":true,"unique":true})` returned the field id, reported success and changed
  -- nothing — and no person could ever ask for an indexed or a unique column through any
  -- door. Measured from the seat `authenticated` on the main database, 2026-09-19:
  -- promote_field answered `"unique": false` after the door said yes. Same class as T12,
  -- which STORE-T closed for `plain` and `type`; these are the last two.
  if p_patch ? 'promoted'       then v_next := jsonb_set(v_next, '{promoted}', to_jsonb(coalesce((p_patch ->> 'promoted')::boolean, false))); end if;
  if p_patch ? 'unique'         then v_next := jsonb_set(v_next, '{unique}', to_jsonb(coalesce((p_patch ->> 'unique')::boolean, false))); end if;
  if p_patch ? 'rules'          then v_next := jsonb_set(v_next, '{rules}', coalesce(p_patch -> 'rules', '[]'::jsonb)); end if;
  -- STORE-T / T7: the dependency list is a SETTING of a worked-out column, and a door that
  -- could not change it could not fix a formula that reads the wrong column either.
  if p_patch ? 'depends_on'     then v_next := jsonb_set(v_next, '{depends_on}',
                                       case when jsonb_typeof(p_patch -> 'depends_on') = 'array'
                                            then p_patch -> 'depends_on' else '[]'::jsonb end); end if;

  -- THE CHOICES, EDITED WHERE THEY WERE TYPED (unchanged).
  if jsonb_typeof(p_patch -> 'options') = 'array' and (v_old ->> 'type') = 'list' then
    v_opts := nullif(v_old -> 'config' ->> 'options_table_id', '')::uuid;
    if v_opts is null then
      v_opts := custom._options_table_for(p_organization_id, v_next ->> 'label', p_patch -> 'options');
      v_next := jsonb_set(v_next, '{config,options_table_id}', to_jsonb(v_opts::text));
    else
      update custom.record o
         set deleted_at = now()
       where o.organization_id = p_organization_id
         and o.table_id = v_opts
         and o.deleted_at is null
         and not exists (select 1 from jsonb_array_elements_text(p_patch -> 'options') w
                          where btrim(w.value) = (o.data ->> 'title'));
      for v_word in select btrim(value) from jsonb_array_elements_text(p_patch -> 'options') loop
        if v_word <> '' and not exists (
             select 1 from custom.record o
              where o.organization_id = p_organization_id and o.table_id = v_opts
                and o.deleted_at is null and o.data ->> 'title' = v_word) then
          insert into custom.record (organization_id, table_id, data)
          values (p_organization_id, v_opts, jsonb_build_object('title', v_word));
        end if;
      end loop;
    end if;
  end if;

  update custom.record
     set data = v_next, updated_at = now(), version = version + 1
   where organization_id = p_organization_id
     and id = p_field_id
     and table_id = custom.field_kernel_id();

  return p_field_id;
end;
$function$;
