-- chair-step: INVERSE of migrations/campaign/choicecolumnedit_a_choice_is_reworded_added_removed_and_reordered_where_it_lives.sql (lane CHOICE-COLUMN-EDIT, 2026-09-27).
-- based-on: custom.field_update(uuid, uuid, jsonb) c63b1f0205317c8548ae4d7d5400786f8a0539a46d4f17001aa1ad1dd8ec9374
-- based-on: custom._resolve_choice_words() 9706fa864453adeb2afa22729f676a9393a610fabe093461ace7871882fc3d45
-- based-on: platform._cutover_seam_readiness(text, uuid) bdb96b9be2bbd55ab8047959000c18b541585b0b369a8e0ada5fddb0d1630f15
-- based-on: platform.cutover_older_removal_rows(uuid, uuid[]) 56fcbb53330e677005b8cfeccb9ec9afbdd420931df2a193c417a656ddcb56ad
-- based-on: platform._cutover_carry_back(uuid, platform.cutover_seam_press, boolean, uuid, uuid, boolean) 94ea0610d99a8d83349ec2bf3b9991fa0f787c2d18ccf45d4a1b71285813625b
-- based-on: platform._carried_back_value(uuid, text, uuid, text, jsonb) c81751458965431ab7171e1acb3d0ee12832c02c9a83c903fbf3101356688dea
-- based-on: workbench.udt_structured_list_archive(uuid, uuid, text) 521a14bd7888967864675113551214c4dd938c6ab39077f02f2f4e0d34819752
-- lane: CHOICE-COLUMN-EDIT
-- Puts back, byte for byte, the six bodies the up replaced (as production held them before it), removes the two
-- client doors and their registry rows, the knob row and the two internal helpers. Choices already saved through
-- the up stay exactly as they were saved (they are ordinary option records).

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
  v_compute_was text;
  v_compute_now text;
  v_parity    text;
  v_restamped integer := 0;
  -- IMPORT-2: THE CLOSED LIST OF WHAT THIS DOOR STORES. A key that is not here is refused by
  -- name; a key that is added to an arm below is added here in the same edit, which is the
  -- whole point — the list and the body cannot drift apart without the door going silent.
  c_settings constant text[] := array[
    'key', 'label', 'required', 'dated', 'sort', 'sensitivity', 'context_policy', 'unit',
    'rules', 'options', 'options_table_id', 'display', 'multi', 'promoted', 'unique',
    'depends_on', 'applies_to_types', 'expr', 'compute_on', 'relation_target', 'relation_max',
    'on_target_delete', 'source', 'source_config', 'review_interval_days',
    'parity_type', 'plain', 'type',
    -- GRID-PRIMITIVES G3 / G5: the formula a person types, and how the grid draws the column.
    'formula_text', 'display_format',
    -- STORE-RULE-GAPS (2): a choice list's "other values allowed" setting.
    'allow_other'];
  v_unknown  text[];
  v_parsed   jsonb;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.field_update');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.field_update');

  -- ── IMPORT-2: STORED OR REFUSED BY NAME, NEVER IGNORED. ─────────────────────────────────
  -- `custom.field_update(field, {"expr": …})` answered with the field id and changed nothing,
  -- because `expr` is read only inside the behaviour arm below. A door that accepts a word and
  -- drops it is the silent failure this store does not allow, and the remedy is a list rather
  -- than one more arm: whatever this body does not store, it says so about, by name.
  select array_agg(k order by k) into v_unknown
    from jsonb_object_keys(coalesce(p_patch, '{}'::jsonb)) k
   where k <> all (c_settings);
  if v_unknown is not null then
    raise exception 'A column has no setting called %.',
        (select string_agg(format('"%s"', u), ', ') from unnest(v_unknown) u)
      using errcode = '23514',
            hint = format('FLD-12: the settings this door changes are %s. Nothing was changed.',
                          (select string_agg(format('%s', s), ', ' order by s) from unnest(c_settings) s));
  end if;

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

  -- ── GRID-PRIMITIVES G3, 2026-09-22: A TYPED FORMULA BECOMES THE EXPRESSION HERE. ─────────
  -- The person edits text; the store parses it against this Table's columns and the rest of
  -- this door stores the expression exactly as if it had been sent, so every refusal below
  -- ("not worked out by the store", FIX-10B-F5's column check) still applies to it.
  if p_patch ? 'formula_text' then
    if v_table is null then
      raise exception 'A typed formula reads the columns of a table, and this field belongs to none.'
        using errcode = '23514';
    end if;
    v_parsed := custom.formula_parse(p_organization_id, v_table, p_patch ->> 'formula_text');
    if not coalesce((v_parsed ->> 'ok')::boolean, false) then
      raise exception 'The formula for "%" cannot be worked out: % (at character %).',
                      coalesce(nullif(v_old ->> 'label', ''), v_old ->> 'key'),
                      v_parsed ->> 'error', coalesce((v_parsed ->> 'position')::integer, 0) + 1
        using errcode = '23514',
              hint = 'GRID-PRIMITIVES G3: a formula names columns in braces, like {Visit fee} - {Deposit taken}; select signature, says from custom.formula_node_kinds() lists every function. Nothing was changed.';
    end if;
    p_patch := p_patch || jsonb_build_object('expr', v_parsed -> 'expr');
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
      -- TAILS-2, 2026-09-21: WHEN a worked-out column works itself out is part of what the
      -- column IS, and this builder's fixed key list did not carry it — so a caller who
      -- retyped a formula and said `compute_on` got `custom._field_document_for`'s default
      -- ('read') and no word about it. It is carried now; a rollup still gets 'read', and
      -- that is said out loud rather than swallowed (see the settings arm below).
      'compute_on',     coalesce(nullif(p_patch ->> 'compute_on', ''), v_old ->> 'compute_on'),
      'on_target_delete', coalesce(p_patch ->> 'on_target_delete', v_old ->> 'on_target_delete'),
      'options_table_id', coalesce(p_patch ->> 'options_table_id', v_old -> 'config' ->> 'options_table_id'),
      'options',        p_patch -> 'options',
      'rules',          coalesce(p_patch -> 'rules', v_old -> 'rules'),
      -- GRID-PRIMITIVES G3 / G5: carried like every other setting, so a retyped column keeps them.
      'formula_text',   case when p_patch ? 'formula_text' then p_patch -> 'formula_text'
                             when p_patch ? 'expr' then null
                             else v_old -> 'config' -> 'formula_text' end,
      'display_format', coalesce(p_patch -> 'display_format', v_old -> 'display_format')));
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

    -- STORE-RULE-GAPS (2): "other values allowed" is the list's own setting, so a retype that
    -- stays a list (one choice ↔ several) keeps it, and a patch that names it sets it. The
    -- shape guard refuses it on anything that is not a list, by name.
    if (v_next ->> 'type') = 'list' and p_patch ? 'allow_other' then
      v_next := jsonb_set(v_next, '{config}', coalesce(v_next -> 'config', '{}'::jsonb)
                          || jsonb_build_object('allow_other', p_patch -> 'allow_other'));
    elsif (v_next ->> 'type') = 'list' and (v_old -> 'config') ? 'allow_other' then
      v_next := jsonb_set(v_next, '{config}', coalesce(v_next -> 'config', '{}'::jsonb)
                          || jsonb_build_object('allow_other', v_old -> 'config' -> 'allow_other'));
    elsif p_patch ? 'allow_other' then
      raise exception 'Only a choice column can take values that are not one of its choices, and "%" will not be one.',
          coalesce(nullif(v_next ->> 'label', ''), v_next ->> 'key')
        using errcode = '23514', hint = 'FLD-5: allow_other belongs to a list field. Nothing was changed.';
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
  if p_patch ? 'applies_to_types' then
    v_next := jsonb_set(v_next, '{applies_to_types}',
                        case when jsonb_typeof(p_patch -> 'applies_to_types') = 'array'
                             then p_patch -> 'applies_to_types' else '[]'::jsonb end);
  end if;
  if p_patch ? 'options_table_id' then
    v_next := jsonb_set(v_next, '{config,options_table_id}', to_jsonb(p_patch ->> 'options_table_id'));
  end if;

  -- ── IMPORT-2: THE FORMULA ITSELF, CHANGEABLE WITHOUT RETYPING THE COLUMN. ────────────────
  -- This was the found instance: `expr` appeared exactly once in this body, inside the
  -- behaviour arm, so changing a formula without ALSO sending a type word reported success and
  -- left yesterday's expression in place. A person who edits the formula of a column that is
  -- already a formula is not retyping anything. The two cases that cannot be applied are
  -- refused by name, the way `compute_on` refuses them, rather than forced quietly; and a
  -- formula naming a column that does not exist is still refused as the document lands, by
  -- FIX-10B-F5's guard on `config.expr`.
  if p_patch ? 'expr' then
    if coalesce(v_old ->> 'type', '') <> 'formula' and coalesce(v_old ->> 'source', '') <> 'formula' then
      raise exception '"%" is not worked out by the store, so it has no formula to change.',
        coalesce(nullif(v_old ->> 'label', ''), v_old ->> 'key')
        using errcode = '23514',
              hint = 'FLD-11: make it a worked-out column first - send type "formula" with the expr to this same door - and then the formula can be edited on its own. Nothing was changed.';
    end if;
    if jsonb_typeof(p_patch -> 'expr') is distinct from 'object' then
      raise exception 'A formula is an expression, and this one is a %.',
        coalesce(jsonb_typeof(p_patch -> 'expr'), 'nothing')
        using errcode = '23514',
              hint = 'FLD-11 / REC-15: expr is a Rule expression - the same shape and the same evaluator a Rule uses, e.g. {"op":"concat","args":[{"field":"<field id>"}]}. Nothing was changed.';
    end if;
    v_next := jsonb_set(v_next, '{config,expr}', p_patch -> 'expr');
  end if;

  -- ── FIX-7B-FIELD, 2026-09-20: THE SHAPE OF THE VALUE, WHICH IS A SETTING LIKE ANY OTHER. ──
  -- MEASURED on this database from the seat `authenticated`, before this migration: declare a
  -- relation column with `multi` false, call `custom.field_update(org, field, {"multi": true})`,
  -- read it back with `custom.read_record` — `multi=false, relation_max=1`. The door returned
  -- the field id, reported success and changed NOTHING. `multi` appeared exactly once in this
  -- body, inside the BEHAVIOUR arm above, which only runs when the patch also carries
  -- `parity_type`, `plain` or `type`. So the ONE control the roll-up panel's own refusal sends
  -- a person to — "Tick 'Can hold more than one' on Photos, or use Borrowed value to read its
  -- one value" — could not be reached by any door, from any client, at all. Same class as
  -- `promoted` / `unique` (SEAT-SUITES, 2026-09-19) and `source` / `review_interval_days`
  -- (ENRICH, 2026-09-20): a door that says yes and does nothing.
  --
  -- A LIST IS REFUSED BY NAME, NOT SILENTLY WRITTEN. For `select` and `multi_select`, "one
  -- answer or several" IS the behaviour — `custom._field_document_for` derives `multi` from the
  -- parity type and never from the caller — so writing `multi` on a list column here would put
  -- the document permanently at odds with its own `parity_type`, which is the silent failure
  -- again wearing the fix's clothes. The behaviour arm above already does this properly, and
  -- the refusal names the word to send it.
  if p_patch ? 'multi' then
    if (v_old ->> 'type') = 'list' then
      raise exception 'Whether "%" takes one answer or several IS what it holds, so it is changed by saying which kind it is.',
        coalesce(v_old ->> 'label', v_old ->> 'key')
        using errcode = '23514',
              hint = 'FLD-2: send parity_type "select" for one answer or "multi_select" for several; multi alone is not a setting on a list.';
    end if;
    v_next := jsonb_set(v_next, '{multi}', to_jsonb(coalesce((p_patch ->> 'multi')::boolean, false)));
  end if;
  -- REC-51: A RELATION'S CARDINALITY LIVES IN TWO KEYS AND BOTH MUST MOVE. `custom.validate_values`
  -- counts the links against `relation_max` and `custom.relation_declaration` calls the column
  -- "one" while that number is 1 — so `multi` true beside `relation_max` 1 is a column that ticks
  -- the box on screen and still refuses the second record. `custom._field_document_for` derives
  -- the same pair the same way when a column is created (1, or 25 when it holds several); a cap a
  -- caller had already widened past 25 is kept rather than narrowed, and an explicit
  -- `relation_max` in the patch always wins.
  if (v_next ->> 'type') = 'relation' and (p_patch ? 'multi' or p_patch ? 'relation_max') then
    v_next := jsonb_set(v_next, '{relation_max}', to_jsonb(greatest(1, coalesce(
      nullif(p_patch ->> 'relation_max', '')::integer,
      case when coalesce((v_next ->> 'multi')::boolean, false)
           then greatest(coalesce((v_old ->> 'relation_max')::integer, 1), 25)
           else 1 end))));
  end if;
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
  -- STORE-RULE-GAPS (2): whether this choice list takes values that are not one of its
  -- choices. Stored on the list's own config; the shape guard judges the word and the type.
  if p_patch ? 'allow_other' then
    if (v_next ->> 'type') is distinct from 'list' then
      raise exception 'Only a choice column can take values that are not one of its choices, and "%" is not one.',
          coalesce(nullif(v_next ->> 'label', ''), v_next ->> 'key')
        using errcode = '23514', hint = 'FLD-5: allow_other belongs to a list field. Nothing was changed.';
    end if;
    v_next := jsonb_set(v_next, '{config}', coalesce(v_next -> 'config', '{}'::jsonb)
                        || jsonb_build_object('allow_other', p_patch -> 'allow_other'));
  end if;
  -- ── lane RELATION-DISPLAY, 2026-09-21: WHICH OF THE OTHER RECORD''S COLUMNS THIS ONE
  --    SHOWS. The same judge the create door uses (custom._display_spec_for), so a spec
  --    cannot be looser here than it was there, and an explicit null REMOVES it - the
  --    column goes back to whatever the table it points at is titled by.
  if p_patch ? 'display' then
    if (v_next ->> 'type') is distinct from 'relation' then
      raise exception 'Only a column that points at other records can say which of their columns to show, and "%" does not point at any.',
          coalesce(nullif(v_next ->> 'label', ''), nullif(v_next ->> 'key', ''), 'this column')
        using errcode = '23514',
              hint = 'REL-DISP: retype it to a column that points at another table first, or leave display out. Nothing was changed.';
    end if;
    if jsonb_typeof(p_patch -> 'display') = 'null' then
      v_next := v_next - 'display';
    else
      v_next := jsonb_set(v_next, '{display}',
                  coalesce(custom._display_spec_for(p_organization_id,
                             nullif(v_next ->> 'relation_target', '')::uuid,
                             p_patch -> 'display'), 'null'::jsonb));
      if jsonb_typeof(v_next -> 'display') = 'null' then v_next := v_next - 'display'; end if;
    end if;
  end if;
  -- STORE-T / T7: the dependency list is a SETTING of a worked-out column, and a door that
  -- could not change it could not fix a formula that reads the wrong column either.
  if p_patch ? 'depends_on'     then v_next := jsonb_set(v_next, '{depends_on}',
                                       case when jsonb_typeof(p_patch -> 'depends_on') = 'array'
                                            then p_patch -> 'depends_on' else '[]'::jsonb end); end if;

  -- ── RED-SUITES-2, 2026-09-21: THE LAST TWO KEYS THIS DOOR WAS TOLD AND THREW AWAY. ──────
  -- MEASURED on the main database through `w1_rel_c12` REL-2 / T7, from the seat
  -- `authenticated`: `custom.field_update(org, field, {"on_target_delete":"restrict"})` returns
  -- the field id, reports success, and the column still says `set_null`. `on_target_delete` and
  -- `relation_target` are BOTH declared on the published contract — `FieldPatch` in
  -- `@ai-matrx/records` `src/field.ts`, where `relation_target` is documented as "re-point the
  -- column. The old edges are withdrawn by the door" — and BOTH are honoured only by the
  -- BEHAVIOUR arm above, which runs only when the same patch also carries `type` / `plain` /
  -- `parity_type`. A person changing only "what happens when the thing this points at is
  -- deleted" sends neither, so the settings arm ran and dropped the key.
  --
  -- This is the SAME CLASS this door has already been fixed for four times, each one written
  -- into the body above: `promoted` / `unique` (SEAT-SUITES), `multi` (FIX-7B-FIELD),
  -- `source` / `review_interval_days` (ENRICH), `compute_on` (TAILS-2). These are the last two
  -- keys of `FieldPatch` the settings arm did not carry. As in every one of those, THE ANSWER
  -- IS TO APPLY IT, and the cases that cannot be applied are refused BY NAME.
  if p_patch ? 'on_target_delete' then
    if (v_next ->> 'type') is distinct from 'relation' then
      raise exception '"%" does not point at other records, so there is nothing to decide when something it points at is deleted.',
        coalesce(v_next ->> 'label', v_next ->> 'key')
        using errcode = '22023',
              hint = 'on_target_delete belongs to a relation column. Change the column to point at a table first, or leave this out.';
    end if;
    if coalesce(p_patch ->> 'on_target_delete', '') not in ('restrict', 'set_null', 'cascade') then
      raise exception '"%" is not something that can happen when a linked record is deleted.',
        coalesce(p_patch ->> 'on_target_delete', '<nothing>')
        using errcode = '22023',
              hint = 'The three answers are: restrict (refuse the delete while this link exists), set_null (drop the link and keep this record), cascade (delete this record too).';
    end if;
    v_next := jsonb_set(v_next, '{on_target_delete}', to_jsonb(p_patch ->> 'on_target_delete'));
  end if;

  -- RE-POINTING THE COLUMN, with the edges withdrawn in the SAME operation — the rule the
  -- behaviour arm above states in full: "the links go in the same operation as the change that
  -- made them meaningless, softly, so REL-13's history keeps its record of them." Dropping this
  -- key silently was the worse half of that defect: it left the caller believing the column had
  -- been re-pointed while every edge still named the old table.
  if p_patch ? 'relation_target' then
    if (v_next ->> 'type') is distinct from 'relation' then
      raise exception '"%" does not point at other records, so it cannot be pointed at a different table.',
        coalesce(v_next ->> 'label', v_next ->> 'key')
        using errcode = '22023',
              hint = 'Change the column to a link first, and then choose the table it points at.';
    end if;
    if nullif(p_patch ->> 'relation_target', '') is null then
      raise exception '"%" has to point at some table — it cannot point at nothing.',
        coalesce(v_next ->> 'label', v_next ->> 'key')
        using errcode = '22023',
              hint = 'Name the table this column should point at, or change the column to a kind that holds its own value.';
    end if;
    -- "MAY I POINT AT IT" IS "MAY I SEE IT" — the same question custom.field_declare asks of a
    -- caller who names the target themselves (RELATION-DECLARE, 2026-09-20). Without it this
    -- arm would be a way to reach a table the caller may not see, by patching instead of
    -- declaring.
    perform custom.assert_may_know_table(p_organization_id,
              (p_patch ->> 'relation_target')::uuid, 'custom.field_update');
    if (p_patch ->> 'relation_target') is distinct from (v_next ->> 'relation_target') then
      perform custom.relation_edges_withdraw(p_organization_id, array[p_field_id],
        format('"%s" now points at a different table',
               coalesce(v_next ->> 'label', v_next ->> 'key')));
    end if;
    v_next := jsonb_set(v_next, '{relation_target}', to_jsonb(p_patch ->> 'relation_target'));
  end if;

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

  -- ── TAILS-2, 2026-09-21: WHEN IT WORKS ITSELF OUT, WHICH THIS DOOR WAS TOLD AND IGNORED. ──
  -- MEASURED (lane SHARE-OUT, 2026-09-20): the settings arm's key list has never carried
  -- `compute_on`, so `custom.field_update(org, field, {"compute_on":"write"})` returned the
  -- field id, reported success and left the column working itself out on every read forever.
  -- A door that is told something and answers yes without doing it is the silent failure this
  -- campaign exists to end — same class as `promoted`/`unique`, `multi`, `source`.
  --
  -- THE ANSWER IS TO APPLY IT, not to refuse it: `custom._derived_fields` already stamps a
  -- `write` formula into `_derived` on every save and `custom.derived_values_of` already works
  -- a `read` one out on every read. The only cases that CANNOT be applied are refused BY NAME,
  -- with the way to change them, because "it is not a formula" and "a rollup is always read"
  -- are answers a person can act on.
  if p_patch ? 'compute_on' then
    v_parity := custom.parity_type(v_old);
    v_compute_was := nullif(v_old ->> 'compute_on', '');
    v_compute_now := nullif(btrim(coalesce(p_patch ->> 'compute_on', '')), '');
    if v_compute_now is null or v_compute_now not in ('read', 'write') then
      raise exception 'A column either works its answer out when somebody reads it or when somebody saves it, and "%" is neither.',
        coalesce(p_patch ->> 'compute_on', 'nothing')
        using errcode = '23514', hint = 'FLD-9: send compute_on as "read" or as "write".';
    end if;
    if coalesce(v_old ->> 'type', '') <> 'formula' and coalesce(v_old ->> 'source', '') <> 'formula' then
      raise exception '"%" is not worked out by the store, so there is no moment for it to be worked out at.',
        coalesce(v_old ->> 'label', v_old ->> 'key')
        using errcode = '23514',
              hint = 'FLD-9: make it a worked-out column first — send type "formula" (with expr), "lookup" or "rollup" to this same door — and then say compute_on.';
    end if;
    if v_parity = 'rollup' and v_compute_now = 'write' then
      raise exception 'A roll-up adds up other records, so an answer stamped when "%" was last saved would be wrong the moment one of them changed. It is worked out when somebody reads it, always.',
        coalesce(v_old ->> 'label', v_old ->> 'key')
        using errcode = '23514',
              hint = 'FLD-11: to stamp a number at save time, make this column a formula over its own record''s columns (send type "formula" with an expr) — a roll-up cannot be one.';
    end if;
    v_next := jsonb_set(v_next, '{compute_on}', to_jsonb(v_compute_now));
  end if;

  -- ── GRID-PRIMITIVES G3 / G5, 2026-09-22. ────────────────────────────────────────────────
  -- The text beside the expression: kept when the person typed it, dropped when an expression
  -- was sent without it (the old text would no longer describe what is worked out). A system
  -- column's expression is its system node and is not replaced by a patch.
  if coalesce(v_next -> 'config' ->> 'system', '') <> '' and p_patch ? 'expr'
     and (p_patch -> 'expr' ->> 'op') is distinct from ('fx.' || (v_next -> 'config' ->> 'system')) then
    raise exception '"%" is filled in by the store (%), so it has no formula of its own to change.',
      coalesce(nullif(v_old ->> 'label', ''), v_old ->> 'key'), v_next -> 'config' ->> 'system'
      using errcode = '23514',
            hint = 'Make it a formula column first (send type "formula" with formula_text), then its formula can be edited. Nothing was changed.';
  end if;
  if p_patch ? 'formula_text' then
    v_next := jsonb_set(v_next, '{config,formula_text}', to_jsonb(p_patch ->> 'formula_text'));
  elsif p_patch ? 'expr' then
    v_next := jsonb_set(v_next, '{config}', coalesce(v_next -> 'config', '{}'::jsonb) - 'formula_text');
  end if;
  if p_patch ? 'display_format' then
    v_next := custom._with_display_format(v_next, p_patch);
  end if;

  update custom.record
     set data = v_next, updated_at = now(), version = version + 1
   where organization_id = p_organization_id
     and id = p_field_id
     and table_id = custom.field_kernel_id();

  -- ── AND THE ANSWERS THAT ARE ALREADY OUT THERE MOVE WITH IT. ────────────────────────────
  -- `_derived` is written by the save path and by nothing else, so a column switched to
  -- `write` would hold NO stamped answer on any record until each one happened to be saved
  -- again — a column that reads empty on every existing row and full on every new one, with
  -- nothing on the screen saying why. Switching the other way leaves a stale stamp behind
  -- that `custom.computed_provenance` would keep reporting as a fact about this column.
  -- Both are closed here, through the ordinary write path, so every guard and every history
  -- row sees the change exactly as it sees a save.
  if v_table is not null and v_compute_now is not null and v_compute_now is distinct from v_compute_was then
    if v_compute_now = 'write' then
      update custom.record r
         set updated_at = now()
       where r.organization_id = p_organization_id
         and r.table_id = v_table
         and r.deleted_at is null
         and r.data_class = 'record';
      get diagnostics v_restamped = row_count;
    else
      update custom.record r
         set data = jsonb_set(r.data, '{_derived}', (r.data -> '_derived') - (v_old ->> 'key')),
             updated_at = now()
       where r.organization_id = p_organization_id
         and r.table_id = v_table
         and r.deleted_at is null
         and r.data_class = 'record'
         and (r.data -> '_derived') ? (v_old ->> 'key');
      get diagnostics v_restamped = row_count;
    end if;
    raise notice 'custom: "%" is now worked out on %, and % record(s) were brought with it.',
      coalesce(v_next ->> 'label', v_next ->> 'key'), v_compute_now, v_restamped;
  end if;

  return p_field_id;
end;
$function$

;

CREATE OR REPLACE FUNCTION custom._resolve_choice_words()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_on      boolean;
  v_map     jsonb;
  v_field   jsonb;
  v_key     text;
  v_label   text;
  v_val     jsonb;
  v_items   jsonb;
  v_one     jsonb;
  v_word    text;
  v_hit     text;
  v_out     jsonb;
  v_new     jsonb;
  v_before  text[];
  v_title   text;
  e         record;
  v_allow   boolean;
begin
  -- THE SWITCH, BY NAME, BEFORE ANYTHING. While `custom/system_enabled` resolves false for this
  -- organization nothing of this store's product behaviour runs and the value is left exactly as
  -- the writer sent it. `custom._record_field_validation` already refuses a CLIENT write while
  -- the switch is off; this is the same rule for the owner-role writes it lets through — a
  -- backfill, a migration, a repair — so an organization whose store is off is byte-untouched by
  -- this lane. The read is the established one (`custom.store_is_open`,
  -- `custom._entity_custom_fields_guard` and `custom.containment_depth_ceiling` all make it):
  -- `platform.knob_resolve` answers jsonb and a switch this writer cannot read is CLOSED.
  begin
    v_on := custom.store_is_open(new.organization_id);
  exception when others then
    v_on := false;
  end;
  if not v_on then
    return new;
  end if;

  if new.data is null or jsonb_typeof(new.data) <> 'object' then
    return new;
  end if;

  -- ── AN OPTION RECORD IS BORN WITH ITS KEY ───────────────────────────────────────────
  -- The store's own bookkeeping, done where every write arrives — the panel, the import,
  -- the agent and the ordinary write door all pass through here. A RENAME NEVER TOUCHES IT:
  -- the key is set when it is missing and never recomputed, which is the whole point.
  -- IT LIVES IN `metadata`, WHICH IS WHAT THAT COLUMN IS FOR: system-owned, keyed system
  -- state, judged by `platform._metadata_guard` against a registry no client may add to. Two
  -- consequences, both deliberate. FLD-5 stays byte-true - a category is still a Record of a
  -- Table with ONE title field, and `w1_field_t4_t8.sql` asserts exactly that of the kernel's
  -- own choice tables. And a client CANNOT forge one: `_metadata_guard` sorts before
  -- `custom_record_choice_words`, so it judges what the CALLER sent (an unregistered key, which
  -- it refuses) and never what this trigger sets afterwards.
  -- ON UPDATE THE EXISTING KEY IS CARRIED, never recomputed: renaming an option must rewrite no
  -- row, and recomputing from the new title is exactly how that promise would be broken.
  if new.table_id is not null
     and coalesce(new.data_class, '') not in ('kernel', 'relation', 'field', 'table', 'rule')
     and custom.table_is_options_table(new.organization_id, new.table_id) then
    -- WHAT THE CALLER SENT IS NEVER TRUSTED. `option_key` is a registered metadata key, which
    -- means `platform._metadata_guard` lets it through - so a client could put a word of their
    -- own in it. On a NEW option the key is always derived here and whatever arrived is
    -- overwritten; on an UPDATE the key the option was born with is carried, whatever arrived.
    -- Either way the caller has no say, which is what makes it stable.
    if tg_op = 'UPDATE' and coalesce(old.metadata ->> 'option_key', '') <> '' then
      new.metadata := coalesce(new.metadata, '{}'::jsonb)
                        || jsonb_build_object('option_key', old.metadata ->> 'option_key');
    else
      v_title := coalesce(nullif(new.data ->> 'title', ''), nullif(new.data ->> 'name', ''));
      if v_title is not null then
        new.metadata := coalesce(new.metadata, '{}'::jsonb)
                          || jsonb_build_object('option_key',
                               custom.choice_key_for(new.organization_id, new.table_id, v_title, new.id));
      else
        new.metadata := coalesce(new.metadata, '{}'::jsonb) - 'option_key';
      end if;
    end if;
  end if;

  -- Only ordinary records of an ordinary Table have choices of their own to resolve.
  if new.table_id is null or new.data_class = 'kernel'
     or new.table_id in (custom.field_kernel_id(), custom.table_kernel_id(),
                         custom.rule_kernel_id(), custom.merge_field_kernel_id()) then
    return new;
  end if;

  v_map := custom.choice_field_map(new.organization_id, new.table_id);
  if v_map = '{}'::jsonb then
    return new;
  end if;

  for e in select key as k, value as v from jsonb_each(v_map) loop
    v_key   := e.k;
    v_field := e.v;
    v_label := coalesce(nullif(v_field ->> 'label', ''), v_key);
    v_val   := new.data -> v_key;
    if v_val is null or jsonb_typeof(v_val) = 'null' then
      continue;
    end if;

    -- The keys this cell already held, so that a record carrying a RETIRED choice can still
    -- be saved when somebody edits a different column. Only a NEW retired choice is refused.
    if tg_op = 'UPDATE' then
      select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_before
        from jsonb_array_elements(
               case when jsonb_typeof(old.data -> v_key) = 'array' then old.data -> v_key
                    when old.data -> v_key is null then '[]'::jsonb
                    else jsonb_build_array(old.data -> v_key) end) x
       where jsonb_typeof(x) = 'string';
    else
      v_before := '{}'::text[];
    end if;

    v_items := case when jsonb_typeof(v_val) = 'array' then v_val else jsonb_build_array(v_val) end;
    v_out   := '[]'::jsonb;

    for v_one in select x from jsonb_array_elements(v_items) x loop
      if jsonb_typeof(v_one) <> 'string' then
        v_out := v_out || jsonb_build_array(v_one);
        continue;
      end if;
      v_word := btrim(v_one #>> '{}');
      if v_word = '' then
        v_out := v_out || jsonb_build_array(v_one);
        continue;
      end if;

      v_hit := custom.choice_key_of(v_field, v_word);

      -- ── LIST-COPY-PERMISSIVE, 2026-09-26: A COLUMN THAT TAKES OTHER VALUES KEEPS THEM. ────
      -- The older grid's `allowOther` never touched the list: the typed word was stored in the
      -- cell exactly as typed and drawn as an "other" value, and adding it to the list was the
      -- person's own separate act (the grid's "Add as option" nudge). STORE-RULE-GAPS (2) made
      -- the store ADD such a word to the column's choices instead, which is how a copy grew
      -- choices its older list never had (Table 1 · 2nd's "Russia" became a 16th country). Now,
      -- when the column says so (`config.allow_other`, off unless declared), a word that is none
      -- of its choices is KEPT AS TYPED - an other value - and the list is not written. So is a
      -- word that names a RETIRED choice by its words: nothing retired is picked anew, the word
      -- is simply kept. The retired choice's own KEY, already held by this cell, stays the key
      -- (a record that holds a retired choice can still be saved when somebody edits a different
      -- column). Without the setting, both are refused below exactly as before.
      if v_hit is null
         or (coalesce((v_field -> 'options' -> v_hit ->> 'retired')::boolean, false)
             and not (v_word = v_hit and v_hit = any (v_before))) then
        select coalesce((f.data -> 'config' ->> 'allow_other')::boolean, false)
          into v_allow
          from custom.record f
         where f.organization_id = new.organization_id
           and f.id = (v_field ->> 'field_id')::uuid
           and f.table_id = custom.field_kernel_id()
           and f.deleted_at is null;
        if coalesce(v_allow, false) then
          v_out := v_out || jsonb_build_array(to_jsonb(v_word));
          continue;
        end if;
      end if;

      if v_hit is null then
        -- REFUSED WITH THE CHOICES THEMSELVES, in the words a person reads.
        raise exception '% does not have a choice called "%".', v_label, v_word
          using errcode = '23514',
                hint = format('The choices for %s are %s. Pick one of those, or add "%s" to the column''s list of choices first.',
                              v_label,
                              coalesce(custom.choice_words(v_field), 'not set up yet'),
                              v_word);
      end if;

      if coalesce((v_field -> 'options' -> v_hit ->> 'retired')::boolean, false)
         and not (v_hit = any (v_before)) then
        raise exception '% is no longer one of the choices for %.',
                        coalesce(v_field -> 'options' -> v_hit ->> 'label', v_hit), v_label
          using errcode = '23514',
                hint = format('It was retired, so it can no longer be picked. Records that already hold it keep it and still read as "%s". The choices now are %s.',
                              coalesce(v_field -> 'options' -> v_hit ->> 'label', v_hit),
                              coalesce(custom.choice_words(v_field), 'none — add one first'));
      end if;

      v_out := v_out || jsonb_build_array(to_jsonb(v_hit));
    end loop;

    v_new := case when jsonb_typeof(v_val) = 'array' then v_out else v_out -> 0 end;
    if v_new is distinct from v_val then
      new.data := new.data || jsonb_build_object(v_key, v_new);
    end if;
  end loop;

  return new;
end;
$function$

;

CREATE OR REPLACE FUNCTION platform._cutover_seam_readiness(p_seam text, p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  s platform.cutover_seam;
  v_checks jsonb := '[]'::jsonb;
  v_n bigint; v_c bigint; v_missing bigint; v_stale bigint; v_lag bigint;
  v_tn bigint; v_tc bigint; v_sn bigint; v_sc bigint; v_in bigint; v_ic bigint;
  v_names text;
  v_pre jsonb;
  v_count jsonb;
  v_any bigint; v_hooks bigint;
  v_ev jsonb;
  v_diff jsonb;
  v_part jsonb;
  v_rest text;
  v_ln bigint; v_lc bigint; v_lmiss bigint; v_lnames text;
  v_rm jsonb; v_rmn bigint;
begin
  select * into s from platform.cutover_seam where seam_key = p_seam and retired_at is null;
  if s.seam_key is null then
    return jsonb_build_object('ready', false, 'checked_at', now(), 'checks', jsonb_build_array(
      jsonb_build_object('key', 'known', 'says', 'This switch exists', 'met', false,
                         'detail', format('There is no switch called %s.', p_seam))));
  end if;

  if s.press_kind = 'platform_switch' then
    return jsonb_build_object('ready', false, 'checked_at', now(), 'checks', jsonb_build_array(
      jsonb_build_object('key', 'pressed_here', 'says', 'Switched for one organization', 'met', false,
                         'detail', 'This one switches for everyone at once, in its own rehearsed step, not from an organization''s settings.')));
  elsif s.press_kind = 'already_switched' then
    return jsonb_build_object('ready', false, 'checked_at', now(), 'checks', jsonb_build_array(
      jsonb_build_object('key', 'already', 'says', 'Already on the new system', 'met', true,
                         'detail', s.flip_does)));
  end if;

  if p_seam = 'older_tables' then
    -- ONE COUNT, shared with the mover's census (lane CUTOVER-CENSUS): the organization's live
    -- older tables against their live same-id copies; archived older tables and the option lists
    -- the app keeps are never counted on either side.
    v_count := platform.cutover_tables_copied(p_org);
    v_n := (v_count ->> 'older_live')::bigint;
    v_c := (v_count ->> 'copied')::bigint;
    v_missing := (v_count ->> 'rows_missing')::bigint;
    v_stale := (v_count ->> 'rows_stale')::bigint;
    select string_agg(x, ', ' order by x) into v_names
      from jsonb_array_elements_text(v_count -> 'not_yet') x;

    -- MOVER-CARRY-TAILS: every check of this switch says how many of its differences copying again
    -- clears (copy_again_clears) and how many it leaves (copy_again_leaves); the settings card offers
    -- "Copy again" only when one unmet check has something it clears, and each sentence says what to
    -- do about the rest instead.
    v_checks := v_checks || jsonb_build_object(
      'key', 'copied', 'says', 'Every table is copied into the new system', 'met', v_c = v_n,
      'copy_again_clears', greatest(v_n - v_c, 0), 'copy_again_leaves', 0,
      'detail', case when v_n = 0 then 'This organization has no older tables left.'
                     else format('%s of %s tables copied.', v_c, v_n)
                          || case when v_c < v_n then ' Not yet: ' || v_names || case when v_n - v_c > 5 then format(' and %s more', v_n - v_c - 5) else '' end || '.' else '' end end);

    -- LISTS-AFTER-SWITCH: the press archives the organization's live older pick lists too, and
    -- refuses (rolled back whole) when a list's Table-of-choices copy or any live choice is not in
    -- the store. Said here, before the press, with Copy again offered to bring them.
    select count(*), count(t.id),
           coalesce(sum(greatest(
             (select count(*) from workbench.udt_structured_list_items i where i.list_id = l.id and i.deleted_at is null)
             - coalesce((select count(*) from custom.record c
                          where c.organization_id = l.organization_id and c.table_id = l.id
                            and c.data_class = 'record' and c.deleted_at is null), 0), 0)), 0),
           string_agg(case when t.id is null then coalesce(nullif(btrim(l.list_name), ''), 'Untitled list') end, ', '
                      order by l.list_name)
      into v_ln, v_lc, v_lmiss, v_lnames
      from workbench.udt_structured_lists l
      left join custom.record t
        on t.organization_id = l.organization_id and t.id = l.id and t.data_class = 'table' and t.deleted_at is null
     where l.organization_id = p_org and l.deleted_at is null;

    v_checks := v_checks || jsonb_build_object(
      'key', 'lists_copied', 'says', 'Every pick list is copied into the new system',
      'met', v_lc = v_ln and v_lmiss = 0,
      'copy_again_clears', greatest(v_ln - v_lc, 0) + v_lmiss, 'copy_again_leaves', 0,
      'detail', case when v_ln = 0 then 'This organization has no older pick lists left.'
                     when v_lc = v_ln and v_lmiss = 0 then format('%s of %s pick lists copied, every choice in its copy.', v_lc, v_ln)
                     else format('%s of %s pick lists copied.', v_lc, v_ln)
                          || case when v_lnames is not null then ' Not yet: ' || v_lnames || '.' else '' end
                          || case when v_lmiss > 0 then format(' %s choices are not in their copies yet.', v_lmiss) else '' end
                          || ' Copying again brings them.' end);

    -- MOVER-DELETIONS: what the older side REMOVED since the copy — a row, a column, a list's choice,
    -- a whole table or list — that its copy still holds, and what the rerun archived whose older
    -- original is back. The rerun (platform.cutover_carry_removals) archives each on the copy, never a
    -- hard delete; until it runs, the switch would bring each one back to life.
    v_rm := platform.cutover_older_removals(p_org);
    v_rmn := coalesce((v_rm ->> 'count')::bigint, 0);
    v_checks := v_checks || jsonb_build_object(
      'key', 'removals_carried', 'says', 'Nothing removed from an older table or list is still on its copy',
      'met', v_rmn = 0, 'counts', v_rm -> 'by_kind',
      'copy_again_clears', v_rmn, 'copy_again_leaves', 0,
      'detail', case when v_rmn = 0
                     then 'Every row, column, choice, table and list removed on the older side is gone from its copy too, and no copy has a choice its older list never had.'
                     else format('%s %s the older side does not have %s still on the copies: %s. Copying again archives %s on the copies (restorable, never deleted).',
                                 v_rmn, case when v_rmn = 1 then 'thing' else 'things' end,
                                 case when v_rmn = 1 then 'is' else 'are' end,
                                 (select string_agg(x, '; ') from jsonb_array_elements_text(v_rm -> 'examples') x)
                                   || case when v_rmn > 5 then format(' and %s more', v_rmn - 5) else '' end,
                                 case when v_rmn = 1 then 'it' else 'them' end) end);

    v_checks := v_checks
      || jsonb_build_object('key', 'rows_present', 'says', 'No row is missing from a copy',
           'met', v_missing = 0, 'copy_again_clears', v_missing, 'copy_again_leaves', 0,
           'detail', case when v_missing = 0 then 'Every row of every copied table is in its copy.'
                          else format('%s rows are not in their copies yet. Copying the table again brings them.', v_missing) end)
      || jsonb_build_object('key', 'rows_current', 'says', 'No row was edited in an older table after it was copied',
           'met', v_stale = 0, 'copy_again_clears', v_stale, 'copy_again_leaves', 0,
           'detail', case when v_stale = 0 then 'Every copy is as current as its older table.'
                          else format('%s rows were edited in the older tables after they were copied. Copying again brings the edits.', v_stale) end);

    -- WHAT THE COPIES WOULD SHOW DIFFERENTLY (CUTOVER-READINESS). The rows checks above never looked
    -- at a table's colours, its columns' checks and formats, or who it is shared with, so the switch
    -- could show a copy that looks, refuses and opens differently from the older table while saying
    -- "ready". Each is compared here as the switch will leave the copy, and each difference is named.
    v_diff := platform.cutover_copy_differences(p_org);
    foreach v_rest in array array['colours', 'checks', 'formats', 'shares'] loop
      v_part := coalesce(v_diff -> v_rest, '{}'::jsonb);
      v_checks := v_checks || jsonb_build_object(
        'key', v_rest || '_match',
        'says', case v_rest when 'colours' then 'Every copy shows the colours its older table shows'
                            when 'checks' then 'No copy refuses a write its older table takes'
                            when 'formats' then 'Every column means on its copy what it means on its older table'
                            else 'Every copy is shared exactly as its older table' end,
        'met', coalesce((v_part ->> 'count')::int, 0) = 0,
        'counts', v_diff -> v_rest,
        'copy_again_clears', coalesce((v_part ->> 'clears')::int, 0),
        'copy_again_leaves', greatest(coalesce((v_part ->> 'count')::int, 0) - coalesce((v_part ->> 'clears')::int, 0), 0),
        'detail', platform.cutover_difference_sentence(v_rest, v_part));
    end loop;

    -- WHAT THE SWITCH REPLACES FIRST (COPY-WRITABLE). People may test the copies while the switch
    -- is off; the switch puts every row they changed back to the older table's version and
    -- archives the rows they added, and logs the counts. Always met: it is what the press does,
    -- said before it is pressed.
    v_ev := v_count -> 'evaluation';
    v_checks := v_checks
      || jsonb_build_object('key', 'test_edits_replaced', 'says', 'Test edits on the copies are replaced by the older tables first',
           'met', true,
           'counts', v_ev,
           'detail', case when coalesce((v_ev ->> 'rows')::bigint, 0) = 0
                          then 'Nobody has changed a copy while testing; nothing is replaced.'
                          else format('%s %s changed while testing, in %s %s: %s edited %s put back to the older table''s version, %s added %s archived (never deleted), %s table or column %s put back. Each table''s counts are kept in a log.',
                                      v_ev ->> 'rows', case when (v_ev ->> 'rows')::bigint = 1 then 'row was' else 'rows were' end,
                                      v_ev ->> 'tables', case when (v_ev ->> 'tables')::bigint = 1 then 'table' else 'tables' end,
                                      v_ev ->> 'edited', case when (v_ev ->> 'edited')::bigint = 1 then 'row is' else 'rows are' end,
                                      v_ev ->> 'added', case when (v_ev ->> 'added')::bigint = 1 then 'row is' else 'rows are' end,
                                      v_ev ->> 'settings', case when (v_ev ->> 'settings')::bigint = 1 then 'setting is' else 'settings are' end) end);

    -- What the switch cannot carry by itself (CUTOVER-PLAN D8, F19): an automation on "any older
    -- table" names no table to follow, and an outbound webhook subscribed to older row events has
    -- no copy to listen to. Either would go silent at the switch, so each holds it back, named.
    select count(*) into v_any from scheduler.sch_trigger t
     where t.organization_id = p_org and t.deleted_at is null and t.enabled and t.type = 'event'
       and t.config ->> 'entity_type' = 'user_table_row' and coalesce(t.config ->> 'table_id', '') = '';
    select count(*) into v_hooks from files.webhooks w
     where w.organization_id = p_org and w.is_active
       and w.event_types && array['row.created','row.updated','row.deleted','row.archived','row.restored']::text[];
    v_checks := v_checks
      || jsonb_build_object('key', 'automations_follow', 'says', 'Every "when a row changes" automation names its table',
           'met', v_any = 0, 'copy_again_clears', 0, 'copy_again_leaves', v_any,
           'detail', case when v_any = 0 then 'Each one moves to its table''s copy at the switch and back with Switch back.'
                          else format('%s automations run on a change to any older table. Pick the table each one watches first, so it can follow it.', v_any) end)
      || jsonb_build_object('key', 'webhooks_follow', 'says', 'No outbound webhook listens for older-table row changes',
           'met', v_hooks = 0, 'copy_again_clears', 0, 'copy_again_leaves', v_hooks,
           'detail', case when v_hooks = 0 then 'Nothing outside the platform is waiting on older-table changes.'
                          else format('%s outbound webhooks still listen for older-table row changes. Point each at its table''s changes in the new system first.', v_hooks) end);

  elsif p_seam = 'agent_context' then
    select count(*), count(*) filter (where r.id is not null and r.deleted_at is null)
      into v_tn, v_tc
      from context.scope_types t
      left join custom.record r on r.organization_id = p_org and r.id = t.id
     where t.organization_id = p_org and t.deleted_at is null;
    select count(*), count(*) filter (where r.id is not null and r.deleted_at is null)
      into v_sn, v_sc
      from context.scopes x
      join context.scope_types t on t.id = x.scope_type_id and t.deleted_at is null
      left join custom.record r on r.organization_id = p_org and r.id = x.id
     where x.organization_id = p_org and x.deleted_at is null;
    select count(*), count(*) filter (where r.id is not null and r.deleted_at is null)
      into v_in, v_ic
      from context.context_items i
      join context.scope_types t on t.id = i.scope_type_id and t.deleted_at is null
      left join custom.record r on r.organization_id = p_org and r.id = i.id
     where t.organization_id = p_org and i.deleted_at is null and i.is_active;

    v_checks := v_checks || jsonb_build_object(
      'key', 'copied', 'says', 'Every scope type, scope and context field is copied',
      'met', v_tc = v_tn and v_sc = v_sn and v_ic = v_in,
      'detail', case when v_tn = 0 then 'This organization has no scopes.'
                     else format('%s of %s scope types, %s of %s scopes, %s of %s context fields copied.',
                                 v_tc, v_tn, v_sc, v_sn, v_ic, v_in) end);

    select count(*) into v_lag
      from custom.io_outbox x
     where x.organization_id = p_org and x.event_key = 'context.follow'
       and x.consumed_at is null and x.deleted_at is null;

    v_checks := v_checks || jsonb_build_object(
      'key', 'follow_current', 'says', 'No edit is waiting to be copied', 'met', v_lag = 0,
      'detail', case when v_lag = 0 then 'The copy has every edit made in the current screens.'
                     else format('%s edits made in the current screens are waiting for the copy.', v_lag) end);
  end if;

  if p_seam = 'scopes_screens' then
    -- SCOPES-TAILS. (0) EVERY WORD A SCOPE TYPE OR A CONTEXT FIELD SAYS ABOUT ITSELF IS ON ITS COPY: a
    -- type's description and sort order, a field's category, tags and status note. Copying again
    -- brings each one; Switch back carries the copy's words back to the current screens.
    v_part := platform.cutover_scope_own_words(p_org);
    v_rmn := coalesce((v_part ->> 'count')::bigint, 0);
    v_checks := v_checks || jsonb_build_object(
      'key', 'own_words_copied', 'says', 'Every scope type''s and context field''s own words are on its copy',
      'met', v_rmn = 0, 'counts', v_part -> 'by_kind',
      'copy_again_clears', v_rmn, 'copy_again_leaves', 0,
      'detail', case when v_rmn = 0
                     then 'Every scope type''s description and order, and every context field''s category, tags and status note, is on its copy.'
                     else format('%s %s what the current screens show: %s. Copying again brings %s.',
                                 v_rmn, case when v_rmn = 1 then 'copy does not say' else 'copies do not say' end,
                                 (select string_agg(x, '; ') from jsonb_array_elements_text(v_part -> 'examples') x)
                                   || case when v_rmn > 5 then format(' and %s more', v_rmn - 5) else '' end,
                                 case when v_rmn = 1 then 'it' else 'them' end) end);
    -- SCOPES-WRITE-THROUGH. (1) THE COPY HAS EVERY EDIT: no follow row waiting for this organization.
    select count(*) into v_lag
      from custom.io_outbox x
     where x.organization_id = p_org and x.event_key = 'context.follow'
       and x.consumed_at is null and x.deleted_at is null;
    v_checks := v_checks || jsonb_build_object(
      'key', 'follow_current', 'says', 'No edit is waiting to be copied', 'met', v_lag = 0,
      'detail', case when v_lag = 0 then 'The copy has every edit made in the current screens.'
                     else format('%s edits made in the current screens are waiting for the copy.', v_lag) end);
    -- (2) PARITY: the newest context parity run for this organization found no defect, and nothing
    -- changed in its scopes after that run.
    declare
      m platform.cutover_seam_measure;
      v_changed timestamptz;
    begin
      -- NOTHING TO COMPARE IS MET (found by lane FINAL-SWITCH's rehearsal): an organization with no
      -- live scope type hands every agent nothing on both systems, so there is no parity to measure,
      -- and the switch must never hold it for want of a measurement.
      if not exists (select 1 from context.scope_types t where t.organization_id = p_org and t.deleted_at is null) then
        v_checks := v_checks || jsonb_build_object(
          'key', 'parity', 'says', 'Agents are handed the same context by both systems', 'met', true,
          'detail', 'This organization has no scopes: both systems hand an agent nothing, so there is nothing to compare.');
      else
      select * into m from platform.cutover_seam_measure x
       where x.seam_key = 'scopes_screens' and x.organization_id = p_org and x.key = 'parity'
       order by x.measured_at desc limit 1;
      select greatest(
               (select max(t.updated_at) from context.scope_types t where t.organization_id = p_org),
               (select max(sc.updated_at) from context.scopes sc where sc.organization_id = p_org),
               (select max(i.updated_at) from context.context_items i join context.scope_types t on t.id = i.scope_type_id where t.organization_id = p_org),
               (select max(v.created_at) from context.context_item_values v join context.scopes sc on sc.id = v.scope_id where sc.organization_id = p_org))
        into v_changed;
      v_checks := v_checks || jsonb_build_object(
        'key', 'parity', 'says', 'Agents are handed the same context by both systems',
        'met', m.id is not null and m.met and (v_changed is null or m.measured_at >= v_changed),
        'measured_at', m.measured_at,
        'detail', case when m.id is null
                         then 'Not measured yet for this organization: uv run python scripts/context_parity.py --organization ' || p_org::text || ' --record (aidream).'
                       when not m.met then m.says
                       when v_changed is not null and m.measured_at < v_changed
                         then format('Measured %s, but this organization''s scopes changed after that (%s); measure again.', m.measured_at, v_changed)
                       else m.says end);
      end if;
    end;
  end if;

  for v_pre in select * from jsonb_array_elements(s.prerequisites) loop
    v_checks := v_checks || jsonb_build_object(
      'key', v_pre ->> 'key', 'says', v_pre ->> 'says',
      'met', coalesce((v_pre ->> 'met')::boolean, false),
      'detail', v_pre ->> 'evidence',
      -- When a measured fact was last measured (the census writes it; every release re-runs it).
      'measured_at', v_pre ->> 'measured_at');
  end loop;

  return jsonb_build_object(
    'ready', not exists (select 1 from jsonb_array_elements(v_checks) c where not (c ->> 'met')::boolean),
    'checked_at', now(),
    'checks', v_checks);
end;
$function$;

CREATE OR REPLACE FUNCTION platform.cutover_older_removal_rows(p_org uuid, p_tables uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(kind text, record_id uuid, table_id uuid, table_name text, what text, principal_kind text, kept_image boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  with truth as (
    -- The older tables are the truth only until the organization presses its switch.
    select (platform._cutover_seam_last_done('older_tables', p_org)).direction is distinct from 'new' as older_is_truth
  ), ev as (
    select e.record_id, e.created, e.pre_image
      from platform.cutover_evaluation_write e
     where e.organization_id = p_org and e.replaced_at is null
  ), copied as (
    select d.id, coalesce(nullif(d.table_name, ''), 'Untitled table') as table_name
      from workbench.udt_datasets d
      join custom.record t on t.organization_id = p_org and t.id = d.id and t.data_class = 'table'
                          and t.deleted_at is null
                          and not coalesce((t.data ->> 'kept_by_the_app')::boolean, false)
     where d.organization_id = p_org and d.deleted_at is null
       and (p_tables is null or d.id = any (p_tables))
       and (select older_is_truth from truth)
  ), lists as (
    -- The live older lists whose copy is in the store: every one with a whole-organization run, and
    -- with a table run the lists its columns choose from.
    select l.id, coalesce(nullif(btrim(l.list_name), ''), 'Untitled list') as table_name
      from workbench.udt_structured_lists l
      join custom.record t on t.organization_id = p_org and t.id = l.id and t.data_class = 'table' and t.deleted_at is null
     where l.organization_id = p_org and l.deleted_at is null
       and (select older_is_truth from truth)
       and (p_tables is null
            or exists (select 1 from custom.record f
                        where f.organization_id = p_org and f.data_class = 'field' and f.deleted_at is null
                          and f.data ->> 'entity_definition_id' = any (p_tables::text[])
                          and f.data -> 'config' ->> 'options_table_id' = l.id::text))
  )
  -- rows
  select 'row', r.id, c.id, c.table_name, 'row ' || left(r.id::text, 8), null::text,
         (ev.record_id is not null)
    from copied c
    join custom.record r on r.organization_id = p_org and r.table_id = c.id and r.data_class = 'record'
    left join ev on ev.record_id = r.id
   where case when ev.record_id is not null then not ev.created and (ev.pre_image ->> 'deleted_at') is null
              else r.deleted_at is null end
     and not exists (select 1 from workbench.udt_dataset_rows w where w.id = r.id and w.deleted_at is null)
  union all
  -- columns
  select 'column', f.id, c.id, c.table_name, 'the column ' || coalesce(nullif(f.data ->> 'label', ''), f.data ->> 'key'), null, false
    from copied c
    join custom.record f on f.organization_id = p_org and f.data_class = 'field' and f.deleted_at is null
                        and f.data ->> 'entity_definition_id' = c.id::text
   where not exists (select 1 from ev where ev.record_id = f.id and ev.created)
     and not exists (select 1 from workbench.udt_dataset_fields o where o.id = f.id and o.deleted_at is null)
  union all
  -- choices
  select 'choice', r.id, l.id, l.table_name, 'the choice ' || coalesce(nullif(r.data ->> 'name', ''), left(r.id::text, 8)), null,
         (ev.record_id is not null)
    from lists l
    join custom.record r on r.organization_id = p_org and r.table_id = l.id and r.data_class = 'record'
    left join ev on ev.record_id = r.id
   where case when ev.record_id is not null then not ev.created and (ev.pre_image ->> 'deleted_at') is null
              else r.deleted_at is null end
     and coalesce(r.metadata #>> '{moved_from,table}', '') <> 'workbench.udt_dataset_rows'
     and not exists (select 1 from workbench.udt_structured_list_items i where i.id = r.id and i.deleted_at is null)
  union all
  -- LIST-COPY-PERMISSIVE: choices the MOVER invented. An earlier copy added a live row's off-list
  -- value to the column's choices (its `moved_from` names that row's cell, not an older choice).
  -- The older list never had it; the copy keeps the value as an other value instead, so the rerun
  -- takes the invented choice off the copy - unless an older choice with the same words now backs it.
  select 'invented_choice', r.id, r.table_id,
         coalesce(nullif(t.data ->> 'name', ''), 'Untitled list'),
         'the choice ' || coalesce(nullif(r.data ->> 'name', ''), nullif(r.data ->> 'title', ''), left(r.id::text, 8)),
         null, false
    from custom.record r
    join custom.record t on t.organization_id = p_org and t.id = r.table_id and t.data_class = 'table' and t.deleted_at is null
   where (select older_is_truth from truth)
     and r.organization_id = p_org and r.data_class = 'record' and r.deleted_at is null
     and r.metadata #>> '{moved_from,table}' = 'workbench.udt_dataset_rows'
     -- ONLY A CHOICE: every moved ROW carries the same moved_from table, so the choice is known by
     -- the note the mover wrote on an invented one AND by living in an options table (file c).
     and r.metadata #>> '{moved_from,note}' like 'an off-list value%'
     and custom.table_is_options_table(p_org, r.table_id)
     and not exists (select 1 from ev where ev.record_id = r.id and ev.created)
     and (p_tables is null
          or exists (select 1 from custom.record f
                      where f.organization_id = p_org and f.data_class = 'field' and f.deleted_at is null
                        and f.data ->> 'entity_definition_id' = any (p_tables::text[])
                        and f.data -> 'config' ->> 'options_table_id' = r.table_id::text))
     and not exists (select 1 from workbench.udt_structured_list_items i
                      where i.list_id = r.table_id and i.deleted_at is null
                        and lower(btrim(i.label)) = lower(btrim(coalesce(r.data ->> 'name', r.data ->> 'title', ''))))
     and not exists (select 1 from custom.record f
                       join workbench.udt_dataset_fields o on o.id = f.id and o.deleted_at is null
                       cross join lateral jsonb_array_elements(
                         case when jsonb_typeof(o.metadata #> '{format,options,choices}') = 'array'
                              then o.metadata #> '{format,options,choices}' else '[]'::jsonb end) c
                      where f.organization_id = p_org and f.data_class = 'field'
                        and f.data -> 'config' ->> 'options_table_id' = r.table_id::text
                        and lower(btrim(coalesce(case when jsonb_typeof(c) = 'object' then coalesce(c ->> 'value', c ->> 'label') else c #>> '{}' end, '')))
                            = lower(btrim(coalesce(r.data ->> 'name', r.data ->> 'title', ''))))
  union all
  -- whole tables a person archived on the older side
  select 'table', t.id, t.id, coalesce(nullif(d.table_name, ''), 'Untitled table'), 'the whole table', null, false
    from workbench.udt_datasets d
    join custom.record t on t.organization_id = p_org and t.id = d.id and t.data_class = 'table' and t.deleted_at is null
                        and not coalesce((t.data ->> 'kept_by_the_app')::boolean, false)
   where p_tables is null and (select older_is_truth from truth)
     and d.organization_id = p_org and d.deleted_at is not null and not (coalesce(d.metadata, '{}'::jsonb) ? 'moved_to')
  union all
  -- whole lists a person archived or deleted on the older side
  select 'list', t.id, t.id, coalesce(nullif(t.data ->> 'name', ''), 'Untitled list'), 'the whole list', null, false
    from custom.record t
   where p_tables is null and (select older_is_truth from truth)
     and t.organization_id = p_org and t.data_class = 'table' and t.deleted_at is null
     and t.metadata #>> '{moved_from,table}' = 'workbench.udt_structured_lists'
     and not exists (select 1 from workbench.udt_structured_lists l
                      where l.id = t.id and (l.deleted_at is null or platform._older_list_moved_by_switch(l.id)))
  union all
  -- shares the mover carried whose older share is gone
  select 'share', p.id, c.id, c.table_name,
         coalesce((select u.email from auth.users u where u.id = p.granted_to_user_id),
                  (select g.name from iam.organizations g where g.id = p.granted_to_organization_id), 'someone')
           || '''s share', case when p.granted_to_user_id is not null then 'person' else 'organization' end, false
    from copied c
    join custom.record t on t.organization_id = p_org and t.id = c.id and t.data_class = 'table'
    join iam.permissions p on p.resource_type = 'record' and p.resource_id = c.id and p.status = 'active'
                          and not coalesce(p.is_public, false)
   where jsonb_typeof(t.metadata -> 'older_shares_seen') = 'array'
     and t.metadata -> 'older_shares_seen' ? coalesce(p.granted_to_user_id, p.granted_to_organization_id)::text
     and not exists (select 1 from iam.permissions q
                      where q.resource_type = 'dataset' and q.resource_id = c.id and q.status = 'active'
                        and coalesce(q.granted_to_user_id, q.granted_to_organization_id)
                            = coalesce(p.granted_to_user_id, p.granted_to_organization_id))
  union all
  -- THE OTHER DIRECTION: what the rerun archived because the older one was gone, now live again.
  select r.metadata #>> '{removed_on_older,kind}' || '_back', r.id,
         case when r.data_class in ('table') then r.id
              when r.data_class = 'field' then nullif(r.data ->> 'entity_definition_id', '')::uuid
              else r.table_id end,
         null, coalesce(nullif(r.data ->> 'name', ''), nullif(r.data ->> 'label', ''), left(r.id::text, 8)), null, false
    from custom.record r
   where (select older_is_truth from truth)
     and r.organization_id = p_org and r.deleted_at is not null
     and jsonb_typeof(r.metadata -> 'removed_on_older') = 'object'
     and (case r.metadata #>> '{removed_on_older,kind}'
            when 'row'    then exists (select 1 from workbench.udt_dataset_rows w where w.id = r.id and w.deleted_at is null)
                               and (p_tables is null or r.table_id = any (p_tables))
                               and exists (select 1 from workbench.udt_datasets d where d.id = r.table_id and d.deleted_at is null)
            when 'column' then exists (select 1 from workbench.udt_dataset_fields o where o.id = r.id and o.deleted_at is null)
                               and (p_tables is null or r.data ->> 'entity_definition_id' = any (p_tables::text[]))
                               and exists (select 1 from workbench.udt_datasets d where d.id::text = r.data ->> 'entity_definition_id' and d.deleted_at is null)
            when 'choice' then exists (select 1 from workbench.udt_structured_list_items i where i.id = r.id and i.deleted_at is null)
                               and exists (select 1 from workbench.udt_structured_lists l where l.id = r.table_id and l.deleted_at is null)
            when 'table'  then p_tables is null and exists (select 1 from workbench.udt_datasets d where d.id = r.id and d.deleted_at is null)
            when 'list'   then p_tables is null and exists (select 1 from workbench.udt_structured_lists l where l.id = r.id and l.deleted_at is null)
            else false end);
$function$

;

CREATE OR REPLACE FUNCTION platform._cutover_carry_back(p_org uuid, p_last platform.cutover_seam_press, p_apply boolean, p_press uuid DEFAULT NULL::uuid, p_actor uuid DEFAULT NULL::uuid, p_accepted boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_at        timestamptz := p_last.pressed_at;
  v_ids       uuid[];
  v_t         record;
  v_r         record;
  v_f         record;
  v_s         record;
  v_w_id      uuid;
  v_w_data    jsonb;
  v_w_del     timestamptz;
  v_q         iam.permissions;
  v_revoke    jsonb;
  v_tr        custom.record;
  v_cols      jsonb;
  v_then      jsonb;
  v_then_data jsonb;
  v_patch     jsonb;
  v_arch      boolean;
  v_rest      boolean;
  v_style     jsonb;
  v_meta      jsonb;
  v_label     text;
  v_fmt_now   text;
  v_fmt_then  text;
  v_req       boolean;
  v_changed   boolean;
  v_name      text;
  v_desc      text;
  v_n         bigint;
  n_upd int; n_new int; n_arch int; n_rest int; n_col int; n_share int;
  b_colour boolean; b_renamed boolean;
  v_rows      jsonb;
  v_fields    jsonb;
  v_perms     jsonb;
  v_table_before jsonb;
  v_parts     text[];
  v_tnot      text[];
  v_says      text[] := '{}';
  v_not       text[] := '{}';
  v_tables    jsonb := '[]'::jsonb;
  v_born      jsonb;
  v_sentence  text;
  v_keep      text;
begin
  if p_last.id is null or p_last.direction <> 'new' or p_last.seam_key <> 'older_tables' then
    return jsonb_build_object('tables', '[]'::jsonb, 'says', '[]'::jsonb, 'not_carried', '[]'::jsonb,
                              'born', '[]'::jsonb, 'needs_confirm', false);
  end if;
  select coalesce(array_agg(x::uuid), '{}') into v_ids
    from jsonb_array_elements_text(coalesce(p_last.did -> 'archived', '[]'::jsonb)) x;

  if p_apply then
    v_keep := current_setting('app.relabel_keeps_updated_at', true);
    perform set_config('app.relabel_keeps_updated_at', 'on', true);
  end if;

  for v_t in
    select d.id, d.table_name::text as table_name, d.description, d.metadata, d.user_id, d.created_by
      from workbench.udt_datasets d
     where d.id = any (v_ids) and d.organization_id = p_org
     order by d.table_name, d.id
  loop
    n_upd := 0; n_new := 0; n_arch := 0; n_rest := 0; n_col := 0; n_share := 0;
    b_colour := false; b_renamed := false;
    v_rows := '[]'::jsonb; v_fields := '[]'::jsonb; v_perms := '[]'::jsonb; v_table_before := null;
    v_parts := '{}'; v_tnot := '{}';
    v_name := v_t.table_name;

    -- The columns both sides hold (same id: the mover kept it), keyed as each side keys its cells.
    select coalesce(jsonb_agg(jsonb_build_object(
             'name', f.field_name, 'key', cf.data ->> 'key', 'st', cf.data ->> 'type',
             'opt', cf.data -> 'config' ->> 'options_table_id', 'ot', f.data_type::text)), '[]'::jsonb)
      into v_cols
      from workbench.udt_dataset_fields f
      join custom.record cf on cf.organization_id = p_org and cf.id = f.id and cf.data_class = 'field'
     where f.table_id = v_t.id and f.deleted_at is null and cf.data ->> 'key' is not null;

    -- A. ROWS — each record the new system touched since the switch, against itself AT the switch.
    for v_r in
      select r.id, r.data, r.created_at, r.updated_at, r.deleted_at, r.created_by
        from custom.record r
       where r.organization_id = p_org and r.table_id = v_t.id and r.data_class = 'record'
         and greatest(r.created_at, r.updated_at, coalesce(r.deleted_at, r.created_at)) > v_at
       order by r.created_at, r.id
    loop
      v_then := null;
      select s.state into v_then from custom.record_state_as_of(v_r.id, v_at) s;
      v_then_data := coalesce(v_then -> 'data', '{}'::jsonb);
      v_w_id := null; v_w_data := null; v_w_del := null;
      select w.id, w.data, w.deleted_at into v_w_id, v_w_data, v_w_del from workbench.udt_dataset_rows w where w.id = v_r.id;

      select coalesce(jsonb_object_agg(c ->> 'name',
               coalesce(platform._carried_back_value(p_org, c ->> 'st', nullif(c ->> 'opt', '')::uuid, c ->> 'ot',
                                                    v_r.data -> (c ->> 'key')), 'null'::jsonb)), '{}'::jsonb)
        into v_patch
        from jsonb_array_elements(v_cols) c
       where (v_then is null and v_r.data ? (c ->> 'key'))
          or (v_then is not null and (v_r.data -> (c ->> 'key')) is distinct from (v_then_data -> (c ->> 'key')));

      if v_w_id is null then
        -- Made in the new system. Made and archived there: nobody ever saw it here; nothing to bring.
        continue when v_r.deleted_at is not null;
        n_new := n_new + 1;
        if p_apply then
          insert into workbench.udt_dataset_rows
            (id, table_id, organization_id, data, user_id, created_by, created_at, updated_at)
          values
            (v_r.id, v_t.id, p_org, v_patch, coalesce(v_r.created_by, v_t.user_id),
             coalesce(v_r.created_by, v_t.created_by, v_t.user_id), v_r.created_at, v_r.updated_at);
          v_rows := v_rows || jsonb_build_object('id', v_r.id, 'existed', false);
        end if;
        continue;
      end if;

      -- Only what the older row does not already say (compared as words: 12 and "12" are the same).
      select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into v_patch
        from jsonb_each(v_patch) e
       where (v_w_data ->> e.key) is distinct from (e.value #>> '{}');
      v_arch := v_r.deleted_at is not null and v_r.deleted_at > v_at and v_w_del is null;
      v_rest := v_r.deleted_at is null and v_w_del is not null and (v_then ->> 'deleted_at') is not null;
      continue when v_patch = '{}'::jsonb and not v_arch and not v_rest;

      if v_patch <> '{}'::jsonb then n_upd := n_upd + 1; end if;
      if v_arch then n_arch := n_arch + 1; end if;
      if v_rest then n_rest := n_rest + 1; end if;
      if p_apply then
        v_rows := v_rows || jsonb_build_object('id', v_r.id, 'existed', true, 'data', v_w_data, 'deleted_at', v_w_del);
        update workbench.udt_dataset_rows
           set data = coalesce(data, '{}'::jsonb) || v_patch,
               deleted_at = case when v_arch then v_r.deleted_at when v_rest then null else deleted_at end,
               updated_at = v_r.updated_at,
               updated_by = coalesce(p_actor, updated_by)
         where id = v_r.id;
      end if;
    end loop;

    -- B. COLUMNS the new system changed since the switch: name, format and required carry; a
    -- column archived there is archived here; checks and kind are the older table's own and are named.
    for v_f in
      select f.id, f.field_name::text as field_name, coalesce(f.display_name, f.field_name)::text as label,
             f.metadata, f.is_required, f.deleted_at as fdel, cf.data as cdoc, cf.deleted_at as cdel
        from workbench.udt_dataset_fields f
        join custom.record cf on cf.organization_id = p_org and cf.id = f.id and cf.data_class = 'field'
       where f.table_id = v_t.id and f.deleted_at is null
         and greatest(cf.updated_at, coalesce(cf.deleted_at, cf.updated_at)) > v_at
       order by f.field_order, f.id
    loop
      v_then := null;
      select s.state into v_then from custom.record_state_as_of(v_f.id, v_at) s;
      continue when v_then is null;
      v_then_data := coalesce(v_then -> 'data', '{}'::jsonb);
      v_changed := false;
      v_label := v_f.label;
      v_meta := coalesce(v_f.metadata, '{}'::jsonb);
      v_req := v_f.is_required;

      if (v_f.cdoc ->> 'label') is distinct from (v_then_data ->> 'label')
         and nullif(btrim(v_f.cdoc ->> 'label'), '') is not null and (v_f.cdoc ->> 'label') <> v_f.label then
        v_label := v_f.cdoc ->> 'label'; v_changed := true;
      end if;
      v_fmt_now  := coalesce(v_f.cdoc ->> 'format', v_f.cdoc -> 'display_format' ->> 'id');
      v_fmt_then := coalesce(v_then_data ->> 'format', v_then_data -> 'display_format' ->> 'id');
      if v_fmt_now is distinct from v_fmt_then and v_fmt_now is distinct from (v_meta -> 'format' ->> 'id') then
        v_meta := case when v_fmt_now is null then v_meta - 'format'
                       else v_meta || jsonb_build_object('format',
                              coalesce(case when jsonb_typeof(v_meta -> 'format') = 'object' then v_meta -> 'format' end, '{}'::jsonb)
                              || jsonb_build_object('id', v_fmt_now)) end;
        v_changed := true;
      end if;
      if coalesce((v_f.cdoc ->> 'required')::boolean, false) is distinct from coalesce((v_then_data ->> 'required')::boolean, false)
         and coalesce((v_f.cdoc ->> 'required')::boolean, false) is distinct from coalesce(v_f.is_required, false) then
        v_req := coalesce((v_f.cdoc ->> 'required')::boolean, false); v_changed := true;
      end if;
      if (v_f.cdoc -> 'rules') is distinct from (v_then_data -> 'rules') then
        v_tnot := v_tnot || format('%s: the checks on the column %s changed in the new system. The older table keeps the checks it had.',
                                   v_name, v_f.label);
      end if;
      if (v_f.cdoc ->> 'type') is distinct from (v_then_data ->> 'type') then
        v_tnot := v_tnot || format('%s: the column %s became a different kind of column in the new system. The older table keeps it as the kind it was.',
                                   v_name, v_f.label);
      end if;
      if v_f.cdel is not null and (v_then ->> 'deleted_at') is null then
        v_changed := true;
      end if;
      continue when not v_changed;
      n_col := n_col + 1;
      if p_apply then
        v_fields := v_fields || jsonb_build_object('id', v_f.id, 'display_name', v_f.label, 'metadata', v_f.metadata,
                                                   'is_required', v_f.is_required, 'deleted_at', v_f.fdel);
        update workbench.udt_dataset_fields
           set display_name = v_label, metadata = v_meta, is_required = v_req,
               deleted_at = case when v_f.cdel is not null and (v_then ->> 'deleted_at') is null then v_f.cdel else deleted_at end
         where id = v_f.id;
      end if;
    end loop;

    -- C. COLUMNS ADDED IN THE NEW SYSTEM: the older table has no column for them. Named, never guessed.
    for v_f in
      select cf.id, coalesce(nullif(cf.data ->> 'label', ''), cf.data ->> 'key') as label, cf.data ->> 'key' as key
        from custom.record cf
       where cf.organization_id = p_org and cf.data_class = 'field' and cf.deleted_at is null
         and cf.data ->> 'entity_definition_id' = v_t.id::text and cf.created_at > v_at
         and not exists (select 1 from workbench.udt_dataset_fields f where f.id = cf.id)
       order by cf.created_at, cf.id
    loop
      select count(*) into v_n from custom.record r
       where r.organization_id = p_org and r.table_id = v_t.id and r.data_class = 'record' and r.deleted_at is null
         and r.data ? v_f.key and (r.data -> v_f.key) not in ('null'::jsonb, '""'::jsonb, '[]'::jsonb);
      v_tnot := v_tnot || format('%s: the column %s was added in the new system. It and its %s stay in the new table and are not carried back.',
                                 v_name, v_f.label, case v_n when 1 then '1 value' else v_n || ' values' end);
    end loop;

    -- D. THE TABLE ITSELF: name, description, colours — against the copy at the switch.
    v_tr := null;
    select * into v_tr from custom.record
     where organization_id = p_org and id = v_t.id and data_class = 'table';
    if v_tr.id is not null and greatest(v_tr.updated_at, coalesce(v_tr.deleted_at, v_tr.updated_at)) > v_at then
      v_then := null;
      select s.state into v_then from custom.record_state_as_of(v_t.id, v_at) s;
      if v_then is not null then
        v_then_data := coalesce(v_then -> 'data', '{}'::jsonb);
        v_desc := v_t.description;
        if (v_tr.data ->> 'name') is distinct from (v_then_data ->> 'name')
           and nullif(btrim(v_tr.data ->> 'name'), '') is not null and (v_tr.data ->> 'name') <> v_t.table_name then
          v_name := v_tr.data ->> 'name'; b_renamed := true;
        end if;
        if (v_tr.data ->> 'description') is distinct from (v_then_data ->> 'description')
           and (v_tr.data ->> 'description') is distinct from v_t.description then
          v_desc := v_tr.data ->> 'description'; b_renamed := true;
        end if;
        v_style := v_t.metadata -> 'style';
        if (v_tr.data -> 'decorations') is distinct from (v_then_data -> 'decorations') then
          v_style := platform._decorations_in_older_words(v_t.id, v_tr.data -> 'decorations', v_t.metadata -> 'style');
          b_colour := v_style is distinct from (v_t.metadata -> 'style');
        end if;
        if p_apply and (b_renamed or b_colour) then
          v_table_before := jsonb_build_object('table_name', v_t.table_name, 'description', v_t.description,
                                               'style', v_t.metadata -> 'style');
          update workbench.udt_datasets
             set table_name = v_name, description = v_desc,
                 metadata = case when b_colour then jsonb_set(coalesce(metadata, '{}'::jsonb), '{style}', coalesce(v_style, '{}'::jsonb))
                                 else metadata end
           where id = v_t.id;
        end if;
      end if;
    end if;

    -- E. SHARES: the copy's people and organization lane, at the copy's level, on the older table;
    -- a share the copy no longer holds is TAKEN BACK here through the older Share dialog's own door
    -- (public.revoke_resource_access / revoke_resource_org_access, as the person pressing), which
    -- removes the grant: an archived grant still opened the table (iam.accessible_entity_ids admits
    -- every status but rejected), so marking it archived left the person seeing it (lane
    -- LIST-COPY-PERMISSIVE, 2026-09-26). The grant as it was is kept in this carry's history
    -- (before.shares) so the carry can be undone. A refusal by the door is named, never skipped.
    -- A share to someone outside the organization rides on an outside invitation on the copy and is
    -- left as it is.
    for v_s in
      select p.granted_to_user_id as u, p.granted_to_organization_id as o, p.permission_level as lvl
        from iam.permissions p
       where p.resource_type = 'record' and p.resource_id = v_t.id and p.status = 'active'
         and not coalesce(p.is_public, false)
    loop
      v_q := null;
      select q.* into v_q from iam.permissions q
       where q.resource_type = 'dataset' and q.resource_id = v_t.id
         and ((v_s.u is not null and q.granted_to_user_id = v_s.u) or (v_s.o is not null and q.granted_to_organization_id = v_s.o))
       limit 1;
      if v_q.id is null then
        n_share := n_share + 1;
        if p_apply then
          insert into iam.permissions (resource_type, resource_id, granted_to_user_id, granted_to_organization_id,
                                       is_public, permission_level, created_by, status, granted_via)
          values ('dataset', v_t.id, v_s.u, v_s.o, false, v_s.lvl, p_actor, 'active', 'share');
          v_perms := v_perms || jsonb_build_object('user', v_s.u, 'organization', v_s.o, 'existed', false);
        end if;
      elsif v_q.status <> 'active' or v_q.permission_level <> v_s.lvl then
        n_share := n_share + 1;
        if p_apply then
          v_perms := v_perms || jsonb_build_object('id', v_q.id, 'existed', true, 'status', v_q.status, 'level', v_q.permission_level);
          update iam.permissions set status = 'active', permission_level = v_s.lvl where id = v_q.id;
        end if;
      end if;
    end loop;
    for v_q in
      select q.* from iam.permissions q
       where q.resource_type = 'dataset' and q.resource_id = v_t.id and q.status = 'active'
         and not coalesce(q.is_public, false)
         and not exists (select 1 from iam.permissions p
                          where p.resource_type = 'record' and p.resource_id = v_t.id and p.status = 'active'
                            and (p.granted_to_user_id = q.granted_to_user_id or p.granted_to_organization_id = q.granted_to_organization_id))
         and not exists (select 1 from iam.invitations i
                          where i.target_type = 'custom_table' and i.target_id = v_t.id and i.deleted_at is null
                            and i.status in ('pending', 'accepted')
                            and (i.invited_user_id = q.granted_to_user_id
                                 or lower(i.email) = (select lower(u.email) from auth.users u where u.id = q.granted_to_user_id)))
    loop
      n_share := n_share + 1;
      if p_apply then
        v_revoke := case when v_q.granted_to_user_id is not null
                         then public.revoke_resource_access('dataset', v_t.id, v_q.granted_to_user_id)
                         else public.revoke_resource_org_access('dataset', v_t.id, v_q.granted_to_organization_id) end;
        if coalesce((v_revoke ->> 'success')::boolean, false) then
          v_perms := v_perms || jsonb_build_object('id', v_q.id, 'existed', true, 'status', v_q.status, 'level', v_q.permission_level,
                                                   'taken_back', true, 'grant', to_jsonb(v_q));
        else
          n_share := n_share - 1;
          v_tnot := v_tnot || format('%s: a share the new table no longer holds is still on the older table (%s).',
                                     v_name, coalesce(v_revoke ->> 'error', 'the Share door refused'));
        end if;
      end if;
    end loop;

    -- The sentence for this table.
    if n_upd > 0 then v_parts := v_parts || format('%s edited %s', n_upd, case n_upd when 1 then 'row' else 'rows' end); end if;
    if n_new > 0 then v_parts := v_parts || format('%s new %s', n_new, case n_new when 1 then 'row' else 'rows' end); end if;
    if n_arch > 0 then v_parts := v_parts || format('%s archived %s', n_arch, case n_arch when 1 then 'row' else 'rows' end); end if;
    if n_rest > 0 then v_parts := v_parts || format('%s restored %s', n_rest, case n_rest when 1 then 'row' else 'rows' end); end if;
    if n_col > 0 then v_parts := v_parts || format('%s changed %s', n_col, case n_col when 1 then 'column' else 'columns' end); end if;
    if b_renamed then v_parts := v_parts || 'its new name'::text; end if;
    if b_colour then v_parts := v_parts || 'its colours'::text; end if;
    if n_share > 0 then v_parts := v_parts || format('%s changed %s', n_share, case n_share when 1 then 'share' else 'shares' end); end if;

    continue when cardinality(v_parts) = 0 and cardinality(v_tnot) = 0;
    v_sentence := case when cardinality(v_parts) = 0 then null
                       else format('%s: %s %s carried back into the older table.', v_name,
                              case cardinality(v_parts) when 1 then v_parts[1]
                                   else array_to_string(v_parts[1:cardinality(v_parts) - 1], ', ') || ' and ' || v_parts[cardinality(v_parts)] end,
                              case when cardinality(v_parts) = 1 and (v_parts[1] like '1 %' or v_parts[1] = 'its new name')
                                   then 'is' else 'are' end) end;
    if v_sentence is not null then v_says := v_says || v_sentence; end if;
    v_not := v_not || v_tnot;
    v_tables := v_tables || jsonb_build_object(
      'table_id', v_t.id, 'table_name', v_name, 'rows_updated', n_upd, 'rows_created', n_new,
      'rows_archived', n_arch, 'rows_restored', n_rest, 'columns_changed', n_col, 'colours_changed', b_colour,
      'renamed', b_renamed, 'shares_changed', n_share, 'says', v_sentence, 'not_carried', to_jsonb(v_tnot));

    if p_apply then
      perform history.migration_record(
        p_org, 'carried back from the new tables at Switch back', 'udt_dataset', v_t.id,
        jsonb_build_object(
          'kind', 'none',
          'why', 'the older table''s rows are not store records, so the store''s own undo cannot write them; '
                 || 'before holds each carried older row, column, table and share exactly as it was — writing those back undoes this carry',
          'before', jsonb_build_object('rows', v_rows, 'fields', v_fields, 'table', v_table_before, 'shares', v_perms),
          'press', p_press, 'undid_press', p_last.id,
          'counts', jsonb_build_object('rows_updated', n_upd, 'rows_created', n_new, 'rows_archived', n_arch,
                                       'rows_restored', n_rest, 'columns_changed', n_col, 'colours_changed', b_colour,
                                       'renamed', b_renamed, 'shares_changed', n_share),
          'not_carried', to_jsonb(v_tnot),
          'not_carried_accepted', cardinality(v_tnot) > 0 and coalesce(p_accepted, false)),
        concat_ws(' ', v_sentence, array_to_string(v_tnot, ' ')));
    end if;
  end loop;

  -- F. TABLES MADE IN THE NEW SYSTEM while switched: they stay there, and the /data home lists them.
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', coalesce(nullif(t.data ->> 'name', ''), '(unnamed table)'))
                            order by t.data ->> 'name', t.id), '[]'::jsonb)
    into v_born
    from custom.record t
   where t.organization_id = p_org and t.data_class = 'table' and t.deleted_at is null
     and not coalesce((t.data ->> 'kept_by_the_app')::boolean, false)
     and t.created_at > v_at
     and not exists (select 1 from workbench.udt_datasets d where d.id = t.id);
  if jsonb_array_length(v_born) > 0 then
    v_says := v_says || format('%s made in the new system %s there and on /data: %s.',
                               case jsonb_array_length(v_born) when 1 then '1 table' else jsonb_array_length(v_born) || ' tables' end,
                               case jsonb_array_length(v_born) when 1 then 'stays' else 'stay' end,
                               (select string_agg(b ->> 'name', ', ') from jsonb_array_elements(v_born) b));
  end if;
  if cardinality(v_says) = 0 and cardinality(v_not) = 0 then
    v_says := array['Nothing was written in the new tables since the switch, so the older tables come back exactly as they were.'];
  end if;

  if p_apply then
    perform set_config('app.relabel_keeps_updated_at', coalesce(v_keep, ''), true);
  end if;

  return jsonb_build_object('since', v_at, 'undoes', p_last.id, 'tables', v_tables,
                            'says', to_jsonb(v_says), 'not_carried', to_jsonb(v_not), 'born', v_born,
                            'needs_confirm', cardinality(v_not) > 0);
end;
$function$

;

CREATE OR REPLACE FUNCTION platform._carried_back_value(p_org uuid, p_store_type text, p_options uuid, p_older_type text, p_value jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return p_value;
  end if;
  if p_store_type = 'list' and p_options is not null then
    if jsonb_typeof(p_value) = 'array' then
      return (select coalesce(jsonb_agg(coalesce(
                 (select to_jsonb(o.data ->> 'name') from custom.record o
                   where o.organization_id = p_org and o.table_id = p_options and o.data_class = 'record'
                     and o.data ->> 'name' is not null
                     and (o.id::text = e.v #>> '{}' or o.data ->> 'key' = e.v #>> '{}' or o.data ->> 'name' = e.v #>> '{}')
                   order by (o.deleted_at is null) desc limit 1), e.v) order by e.n), '[]'::jsonb)
                from jsonb_array_elements(p_value) with ordinality e(v, n));
    end if;
    return coalesce(
      (select to_jsonb(o.data ->> 'name') from custom.record o
        where o.organization_id = p_org and o.table_id = p_options and o.data_class = 'record'
          and o.data ->> 'name' is not null
          and (o.id::text = p_value #>> '{}' or o.data ->> 'key' = p_value #>> '{}' or o.data ->> 'name' = p_value #>> '{}')
        order by (o.deleted_at is null) desc limit 1),
      p_value);
  end if;
  if p_older_type in ('json', 'object', 'array') and jsonb_typeof(p_value) = 'string' then
    begin
      return (p_value #>> '{}')::jsonb;
    exception when others then
      return p_value;
    end;
  end if;
  return p_value;
end;
$function$

;

CREATE OR REPLACE FUNCTION workbench.udt_structured_list_archive(p_list_id uuid, p_moved_to_table_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_org        uuid;
  v_name       text;
  v_deleted    timestamptz;
  v_moved_to   text;
  v_in_store   boolean;
  v_items      bigint;
  v_in_store_n bigint;
begin
  select l.organization_id, l.list_name, l.deleted_at, l.metadata #>> '{moved_to,table_id}'
    into v_org, v_name, v_deleted, v_moved_to
    from workbench.udt_structured_lists l
   where l.id = p_list_id;

  if v_org is null then
    raise exception 'there is no pick list with the id % in an organization, so there is nothing to archive', p_list_id
      using errcode = '02000';
  end if;
  if v_deleted is not null and v_moved_to = p_moved_to_table_id::text then
    return jsonb_build_object('list_id', p_list_id, 'archived', false, 'already_archived_at', v_deleted, 'moved_to', p_moved_to_table_id);
  end if;
  if v_deleted is not null then
    raise exception 'the pick list % is already archived and says it became %, not %',
                    coalesce(nullif(btrim(v_name), ''), p_list_id::text), coalesce(v_moved_to, 'nothing'), p_moved_to_table_id
      using errcode = '23514';
  end if;

  -- Never archive a list whose copy is not there: the copy is a Table of choices, same id.
  select true into v_in_store
    from custom.record r
   where r.organization_id = v_org and r.id = p_moved_to_table_id
     and r.data_class = 'table' and r.deleted_at is null;
  if v_in_store is not true then
    raise exception 'the pick list % has not arrived in the new system yet, so it is not being archived',
                    coalesce(nullif(btrim(v_name), ''), p_list_id::text)
      using errcode = '23514',
            hint = 'Copy again on the organization''s settings page (Data) copies it; then press the switch again.';
  end if;
  select count(*) into v_items
    from workbench.udt_structured_list_items i where i.list_id = p_list_id and i.deleted_at is null;
  select count(*) into v_in_store_n
    from custom.record r
   where r.organization_id = v_org and r.table_id = p_moved_to_table_id
     and r.data_class = 'record' and r.deleted_at is null;
  if v_in_store_n < v_items then
    raise exception 'the pick list % has % live choices and only % of them are in the new system, so it is not being archived',
                    coalesce(nullif(btrim(v_name), ''), p_list_id::text), v_items, v_in_store_n
      using errcode = '23514',
            hint = 'Nothing was archived. Copy again on the organization''s settings page (Data) copies what is missing.';
  end if;

  update workbench.udt_structured_lists
     set deleted_at = now(),
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
           'moved_to', jsonb_build_object(
             'store', 'custom.record', 'table_id', p_moved_to_table_id, 'at', now(), 'items', v_items,
             'reason', coalesce(nullif(btrim(p_reason), ''), 'moved into the unified record store as a Table of choices; the choices kept their own identifiers')))
   where id = p_list_id;

  return jsonb_build_object('list_id', p_list_id, 'archived', true, 'moved_to', p_moved_to_table_id, 'items', v_items);
end;
$function$;

delete from platform.client_callable_door where schema_name = 'custom' and function_name in ('record_update_adding_choices', 'choice_nudge');
drop function if exists custom.record_update_adding_choices(uuid, uuid, jsonb, jsonb, integer);
drop function if exists custom.choice_nudge(uuid);
delete from platform.knob_override where feature = 'custom' and key = 'choice_nudge';
delete from platform.feature_knob where feature = 'custom' and key = 'choice_nudge';
drop function if exists custom._field_choices_save(uuid, uuid, jsonb, boolean);
drop function if exists custom._choice_words_array(jsonb);
