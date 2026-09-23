-- lock: custom,platform
-- lane: GRID-PRIMITIVES
-- based-on: custom.formula_value(uuid, uuid, jsonb, jsonb) 67c106584e2fc938da29300c14fa11b30b6444e7e4cbf022eba37c1046db8c6d
-- based-on: custom._field_document_for(uuid, uuid, jsonb) 1b32018ff39ef8a72ec26a8fc123eb2277e6083cc0f76188674d7e87de242184
-- based-on: custom.field_update(uuid, uuid, jsonb) caeca3bfcbd01f176f9d41e4353599e305b08fda58c87f52d8606097c185ac7f
-- chair-step: the inverse of gridprim_a_formula_is_typed_and_the_store_works_it_out.sql. It puts
-- custom.formula_value, custom._field_document_for and custom.field_update back byte for byte as
-- the main database held them before (2026-09-22), then drops every function that file created
-- and deletes the custom.formula_parse door row.
-- WHAT IT DOES NOT UNDO: a Field declared with formula_text, display_format or one of the three
-- system kinds keeps its stored document — it is that organization's own column. Once this runs,
-- a formula column whose expression uses an fx.* node answers empty on read (custom.derived_value
-- names it in a warning, as it does for any expression it cannot work out), and an autonumber
-- keeps the numbers already stamped in `_derived`.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

CREATE OR REPLACE FUNCTION custom.formula_value(p_organization_id uuid, p_record_id uuid, p_field_data jsonb, p_values jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_values jsonb := coalesce(p_values, custom.record_values(p_organization_id, p_record_id));
begin
  -- REC-15's evaluator, not a second one. Every node, every refusal and REC-17's
  -- "by id, never by name" come from custom.rule_eval unchanged.
  return custom.rule_eval(p_organization_id, p_field_data -> 'config' -> 'expr',
                          v_values,
                          custom.rule_context(p_organization_id, p_record_id));
end;
$function$

;

CREATE OR REPLACE FUNCTION custom._field_document_for(p_organization_id uuid, p_table_id uuid, p_spec jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  d        jsonb;
  v_parity text := nullif(p_spec ->> 'parity_type', '');
  v_key    text := nullif(p_spec ->> 'key', '');
  -- ── LIMITS-FIX 2026-09-21: ONE WORD FOR WHAT A PERSON READS ON THE COLUMN. ──────────
  -- A table spec's inline field says `name` (`custom._table_shape_guard` demands it) and
  -- this door said `label`, so the same concept had two words one call apart and a caller
  -- that used the table's word was told "A field needs a name" while holding one. Real-data
  -- crew D hit this on 2026-09-21 declaring a podcast episode pipeline. Both words are read
  -- here; `label` still wins when a caller sends both, so no existing caller changes.
  v_label  text := coalesce(nullif(p_spec ->> 'label', ''), nullif(p_spec ->> 'name', ''));
  v_multi  boolean := coalesce((p_spec ->> 'multi')::boolean, false);
  v_config jsonb := coalesce(p_spec -> 'config', '{}'::jsonb);
  v_rules  jsonb := coalesce(p_spec -> 'rules', '[]'::jsonb);
  v_plain  text := coalesce(nullif(p_spec ->> 'plain', ''), 'text');
  v_alias  text := lower(btrim(coalesce(p_spec ->> 'type', '')));
  -- FIX-10B-F6: the caller said the word `signature`. It is one of the kinds
  -- `custom.field_kinds()` publishes and it is NOT a parity type — it is plain
  -- text wearing the one format `custom.doc_sign` accepts — so it is resolved
  -- here, beside the other words, and carried into the plain-text arm below.
  v_signature boolean := false;
  v_relation uuid := null;   -- SEAT-SUITES: the Table a caller's own relation column points at
  -- LIMITS-FIX 2026-09-21: the same one-word rule for the relation's target. Real-data crew E
  -- reported that no client door could declare a table-to-table relation; the door could, and
  -- has since 2026-09-19 — it only ever answered to `relation_target`, and a caller reaching
  -- for `target_table` got "A column that points at other records is a Person column or a File
  -- column", which describes a different mistake entirely.
  v_target text := coalesce(nullif(p_spec ->> 'relation_target', ''), nullif(p_spec ->> 'target_table', ''));
  v_deps   jsonb := case when jsonb_typeof(p_spec -> 'depends_on') = 'array'
                         then p_spec -> 'depends_on' else '[]'::jsonb end;
begin
  -- ── STORE-T: `type` IS THE WORD EVERY CALLER REACHES FOR, AND IT WAS THROWN AWAY. ──────
  -- Measured on 2026-09-20: `{"type":"number"}` produced a TEXT column and `{"type":"banana"}`
  -- was ACCEPTED, silently, as text. Only `parity_type` and `plain` were ever read, so every
  -- agent, script and other client that said "type" got a text column and was never told.
  -- Now it is read as what it plainly means, and a word that means nothing is refused BY NAME
  -- with the list — nothing is guessed and nothing is silently dropped.
  if v_alias <> '' and v_parity is null and nullif(p_spec ->> 'plain', '') is null then
    if exists (select 1 from custom.parity_field_types() t where t.parity_type = v_alias) then
      v_parity := v_alias;
    elsif v_alias in ('number', 'range', 'integer', 'decimal', 'float') then
      v_plain := 'number';
    elsif v_alias in ('long_text', 'longtext', 'long text', 'paragraph') then
      v_plain := 'long_text';
    elsif v_alias in ('text', 'string') then
      v_plain := 'text';
    elsif v_alias in ('boolean', 'bool', 'checkbox', 'check_box', 'tick', 'tickbox',
                      'yes_no', 'yesno', 'yes/no', 'toggle', 'switch') then
      -- LIMITS-FIX: every word a person, an agent or a spreadsheet reaches for when they
      -- mean a tick box lands on the one type that is one.
      v_parity := 'checkbox';
    elsif v_alias = 'list' then
      v_parity := 'select';
    elsif v_alias in ('signature', 'sign', 'e_signature', 'esignature') then
      -- ── FIX-10B-F6, 2026-09-22: THE E-SIGN HALF OF DOCUMENTS COULD NOT BE REACHED. ──────
      -- `custom.doc_sign` accepts exactly one field — text whose format is `signature` — and
      -- this door would write that format only when a caller sent `format: signature`
      -- alongside a plain text type. No screen sends a format: the add-a-column panel
      -- collects an INTENTION and the store answers the behaviour, the format and the unit.
      -- So the sentence under a rendered document ("Crews needs a signature column - a text
      -- column whose format is signature") named a precondition no screen could meet, and
      -- every sign request, expiring link and sealed hash behind it was unreachable.
      -- VERIFIER-10 F6, measured from the admin seat on Rincon Plumbing's Crews table.
      -- A signature is now a WORD like every other kind, published by
      -- `custom.field_kinds()`, and the panel that offers it sends the word.
      v_plain := 'text';
      v_signature := true;
    elsif v_alias = 'relation' then
      -- ── SEAT-SUITES, 2026-09-19: A COLUMN POINTING AT ANOTHER OF YOUR OWN TABLES COULD
      -- NOT BE MADE AT ALL. ────────────────────────────────────────────────────────────
      -- `member` points at the kernel Person Table and `attachment` at the kernel File
      -- Table, and those were the ONLY two relations this door could build. A person with
      -- an Invoice Table and a Line Table could not give Invoice a Lines column through any
      -- door, although the store holds exactly that shape already: the parity-floor
      -- fixture's own `lines` field is a plain relation at a custom Table, and every guard,
      -- every edge, every rollup and `custom.record_relation_edges` handle it. Only the
      -- door refused, and it refused EVEN WHEN THE CALLER SAID WHICH TABLE.
      -- THE RULE: a caller that NAMES its target gets the relation it asked for; a caller
      -- that names nothing still gets the old sentence, because a relation with no target
      -- is the thing that sentence is actually about.
      if v_target is null then
        raise exception 'A column that points at other records is a Person column or a File column, and "%" does not say which.', v_alias
          using errcode = '23514',
                hint = 'FLD-11: say member for a person or attachment for a file, or name the Table this column points at in relation_target. Nothing was created.';
      end if;
      v_relation := v_target::uuid;
      -- ── RELATION-DECLARE, 2026-09-20: A COLUMN COULD POINT AT SOMETHING THAT IS NOT A
      -- TABLE, AND NOBODY WAS TOLD. ────────────────────────────────────────────────────────
      -- This arm took the caller's uuid and wrote it down unread. A uuid naming NOTHING at
      -- all was accepted; a uuid naming a RECORD instead of a Table was accepted. The column
      -- then points at a thing with no records to pick from and no title field to make a chip
      -- out of, and every reader downstream has to guess what that means. Measured from the
      -- seat `authenticated` on the main database, 2026-09-20. (A Table in ANOTHER
      -- organization was already refused by custom._field_shape_guard; that stands.)
      if not exists (select 1 from custom.record t
                      where t.id = v_relation
                        and t.deleted_at is null
                        and t.table_id = custom.table_kernel_id()
                        and (t.organization_id = p_organization_id or t.data_class = 'kernel')) then
        raise exception 'A column that points at other records has to point at a TABLE, and "%" is not one of this organization''s tables.', v_relation
          using errcode = '23503',
                hint = 'FLD-11 / REL-8: relation_target names the Table whose records this column may point at - open the Table you meant and use its id. Nothing was created.';
      end if;
    else
      raise exception 'There is no kind of column called "%".', p_spec ->> 'type'
        using errcode = '23514',
              hint = format('FLD-11: %s. Nothing was created.', custom._field_kinds_sentence());
    end if;
  end if;
  if v_label is null then
    raise exception 'A field needs a name - it is what a person reads on the column.'
      using errcode = '23514', hint = 'Give the field a name (a table spec''s own word) or a label - they mean the same thing here. Everything else this door can work out.';
  end if;
  if v_key is null then
    -- The panel derives the key from the label; a caller that did not is not
    -- refused for a machine token it never meant to think about.
    v_key := regexp_replace(lower(btrim(v_label)), '[^a-z0-9]+', '_', 'g');
    v_key := regexp_replace(v_key, '^_+|_+$', '', 'g');
    if v_key !~ '^[a-z]' then v_key := 'f_' || v_key; end if;
    v_key := left(v_key, 48);
  end if;
  if v_key !~ '^[a-z][a-z0-9_]*$' then
    raise exception 'A field''s key is made of lower-case letters, digits and underscores, and this one is "%".', v_key
      using errcode = '23514', hint = 'FLD-13: leave the key out and the store makes one from the name.';
  end if;

  -- THE FLOOR EVERY FIELD STANDS ON. Every key the guards demand is written,
  -- always, so no caller can omit one by accident.
  d := jsonb_build_object(
    'key',                  v_key,
    'label',                v_label,
    'multi',                v_multi,
    'dated',                coalesce((p_spec ->> 'dated')::boolean, false),
    'required',             coalesce((p_spec ->> 'required')::boolean, false),
    'sort',                 coalesce((p_spec ->> 'sort')::numeric, 100),
    'source',               coalesce(nullif(p_spec ->> 'source', ''), 'manual'),
    'source_config',        coalesce(p_spec -> 'source_config', '{}'::jsonb),
    'sensitivity',          coalesce(nullif(p_spec ->> 'sensitivity', ''), 'internal'),
    'context_policy',       coalesce(nullif(p_spec ->> 'context_policy', ''), 'include'),
    'applies_to_types',     coalesce(p_spec -> 'applies_to_types', '[]'::jsonb),
    -- STORE-T / T7: THE CALLER'S OWN DEPENDENCY LIST, KEPT. It used to be hard-coded to the
    -- empty list here, so NO client-made formula ever had dependencies, `custom.field_dependants`
    -- could never name one, and REC-18's refusal — "this field is used by …" — could not fire for
    -- anything a person or an agent built. That is the third half of T7.
    'depends_on',           v_deps,
    'entity_definition_id', p_table_id);

  -- SEAT-SUITES 2026-09-19: two properties `custom.field` has always projected and this door
  -- silently dropped, so a person could read them and never set them. They are carried only
  -- when the caller names them, so no existing field's document changes shape.
  if nullif(p_spec ->> 'review_interval_days', '') is not null then
    d := d || jsonb_build_object('review_interval_days', (p_spec ->> 'review_interval_days')::integer);
  end if;
  if p_spec ? 'default' then
    d := d || jsonb_build_object('default', p_spec -> 'default');
  end if;

  -- THE RELATION A CALLER NAMED ITSELF (see the `relation` arm above). It carries no parity
  -- type — `custom.parity_type` answers nothing for it, exactly as it answers nothing for
  -- plain text and plain numbers — and every relation property is the caller's to declare.
  if v_relation is not null then
    d := d || jsonb_build_object(
      'type',             'relation',
      'relation_target',  v_relation,
      'relation_max',     coalesce((p_spec ->> 'relation_max')::integer, case when v_multi then 25 else 1 end),
      'on_target_delete', case when nullif(p_spec ->> 'on_target_delete', '') in ('restrict','set_null','cascade')
                               then p_spec ->> 'on_target_delete' else 'set_null' end,
      'rules',            v_rules,
      'config',           v_config);
    if nullif(p_spec ->> 'inverse_key', '') is not null then
      d := d || jsonb_build_object('inverse_key', p_spec ->> 'inverse_key');
    end if;
    return custom._with_display(p_organization_id, d, p_spec);
  end if;

  if v_parity is null then
    -- The three behaviours a person picks that are NOT one of the parity types:
    -- plain text, a long text and a plain number. They carry no parity type,
    -- which is exactly what `custom.parity_type` answers for them.
    if v_plain = 'number' then
      d := d || jsonb_build_object('type', 'range', 'config', v_config, 'rules', v_rules);
      if nullif(p_spec ->> 'unit', '') is not null then
        d := d || jsonb_build_object('unit', p_spec ->> 'unit');
      end if;
    elsif v_plain = 'long_text' then
      d := d || jsonb_build_object('type', 'text', 'format', 'long',
                                   'config', v_config || jsonb_build_object('multiline', true),
                                   'rules', v_rules);
    else
      d := d || jsonb_build_object('type', 'text', 'config', v_config, 'rules', v_rules);
      -- ── SEAT-SUITES, 2026-09-19: A SIGNATURE FIELD COULD NOT BE DECLARED BY ANYBODY. ────
      -- `custom.doc_signature_field_ok` accepts exactly one shape — a text field whose
      -- `format` is `signature` — and `custom.doc_sign` refuses every other field by name.
      -- No door wrote that `format`: this branch dropped it, and the parity types
      -- have no signature among them. So `custom.doc_sign`, which IS granted to
      -- `authenticated`, could never be used by a signed-in person at all: the one field it
      -- accepts had no way to exist outside an INSERT straight into `custom.record`, which
      -- needs a table privilege nobody has. Measured from the seat on the main database on
      -- 2026-09-19 while converting `scripts/campaign-tests/w3_doc_c43.sql`.
      -- A plain text field may now SAY it holds a signature, and nothing else changes: a
      -- field that does not ask for it is written exactly as before.
      if v_signature or nullif(p_spec ->> 'format', '') = 'signature' then
        d := d || jsonb_build_object('format', 'signature');
      end if;
    end if;
    return custom._with_display(p_organization_id, d, p_spec);
  end if;

  if not exists (select 1 from custom.parity_field_types() t where t.parity_type = v_parity) then
    raise exception 'There is no field type called "%" in this system.', v_parity
      using errcode = '23514',
            hint = format('FLD-11: %s.', custom._parity_types_sentence());
  end if;

  d := d || jsonb_build_object('parity_type', v_parity);

  case v_parity
    -- ── the two list types ───────────────────────────────────────────────────
    when 'select', 'multi_select' then
      d := d || jsonb_build_object(
        'type',   'list',
        'multi',  v_parity = 'multi_select',
        'rules',  v_rules,
        'config', v_config || jsonb_build_object(
                    'options_table_id', p_spec ->> 'options_table_id'));

    -- ── the two relation types a person names by what they hold ─────────────
    when 'member' then
      d := d || jsonb_build_object(
        'type',             'relation',
        'relation_target',  custom.person_kernel_id(),
        'relation_max',     coalesce((p_spec ->> 'relation_max')::integer, case when v_multi then 25 else 1 end),
        -- STORE-T / T7 (REL-2): what happens to this record when the thing it points at is
        -- deleted is the CALLER'S to declare — restrict, set_null or cascade. It was hard-coded
        -- to set_null, so no client could ever declare the `restrict` T7 asks for and every
        -- delete of a pointed-at record was accepted. set_null stays the default.
        'on_target_delete', case when nullif(p_spec ->> 'on_target_delete', '') in ('restrict','set_null','cascade')
                                 then p_spec ->> 'on_target_delete' else 'set_null' end,
        'rules',            v_rules,
        'config',           v_config);
    when 'attachment' then
      d := d || jsonb_build_object(
        'type',             'relation',
        'relation_target',  custom.file_kernel_id(),
        'relation_max',     coalesce((p_spec ->> 'relation_max')::integer, case when v_multi then 25 else 1 end),
        -- REC-31: removing the file removes the attachment, never the record — so `cascade` is
        -- the one answer this field may not give, and custom._field_type_parity_guard refuses it
        -- by name. restrict is a caller's to choose.
        'on_target_delete', case when nullif(p_spec ->> 'on_target_delete', '') in ('restrict','set_null','cascade')
                                 then p_spec ->> 'on_target_delete' else 'set_null' end,
        'rules',            v_rules,
        'config',           v_config);

    -- ── the three worked-out types ──────────────────────────────────────────
    when 'lookup' then
      d := d || jsonb_build_object(
        'type',       'formula',
        'source',     'formula',
        'compute_on', coalesce(nullif(p_spec ->> 'compute_on', ''), 'read'),
        'rules',      v_rules,
        'config',     v_config || jsonb_strip_nulls(jsonb_build_object(
                        'via',  nullif(p_spec ->> 'via', ''),
                        'pick', nullif(p_spec ->> 'pick', ''))));
    when 'rollup' then
      d := d || jsonb_build_object(
        'type',       'formula',
        'source',     'formula',
        -- FLD-11: a rollup that stamped itself at write time would be stale the
        -- moment a contained record changed, and the store refuses that — so the
        -- only answer this door can give is the right one.
        'compute_on', 'read',
        'rules',      v_rules,
        'config',     v_config || jsonb_strip_nulls(jsonb_build_object(
                        'via', nullif(p_spec ->> 'via', ''),
                        'agg', nullif(p_spec ->> 'agg', ''),
                        'of',  nullif(p_spec ->> 'of', ''))));
    when 'formula' then
      d := d || jsonb_build_object(
        'type',       'formula',
        'source',     'formula',
        'compute_on', coalesce(nullif(p_spec ->> 'compute_on', ''), 'read'),
        'rules',      v_rules,
        'config',     v_config || jsonb_build_object('expr', coalesce(p_spec -> 'expr', v_config -> 'expr')));

    -- ── the three formatted texts. The format says how to SHOW it; the
    --    pattern Rule is what makes it enforceable (FLD-3 / FLD-11), so the
    --    door writes the Rule rather than leaving a label on an empty box.
    when 'url' then
      d := d || jsonb_build_object('type', 'text', 'format', 'url', 'config', v_config,
        'rules', case when exists (select 1 from jsonb_array_elements(v_rules) r where r ->> 'kind' = 'pattern')
                      then v_rules
                      else v_rules || jsonb_build_array(jsonb_build_object(
                             'kind', 'pattern', 'value', '^https?://[^\s]+$')) end);
    when 'email' then
      d := d || jsonb_build_object('type', 'text', 'format', 'email', 'config', v_config,
        'rules', case when exists (select 1 from jsonb_array_elements(v_rules) r where r ->> 'kind' = 'pattern')
                      then v_rules
                      else v_rules || jsonb_build_array(jsonb_build_object(
                             'kind', 'pattern', 'value', '^[^@\s]+@[^@\s]+\.[^@\s]+$')) end);
    when 'phone' then
      d := d || jsonb_build_object('type', 'text', 'format', 'phone', 'config', v_config,
        'rules', case when exists (select 1 from jsonb_array_elements(v_rules) r where r ->> 'kind' = 'pattern')
                      then v_rules
                      else v_rules || jsonb_build_array(jsonb_build_object(
                             'kind', 'pattern', 'value', custom.phone_pattern())) end);

    -- ── the three numbers and dates ─────────────────────────────────────────
    when 'currency' then
      d := d || jsonb_build_object(
        'type', 'range', 'format', 'currency',
        'unit', coalesce(nullif(p_spec ->> 'unit', ''), '$'),
        'config', v_config, 'rules', v_rules);
    when 'percent' then
      d := d || jsonb_build_object(
        'type', 'range', 'format', 'percent', 'unit', '%', 'config', v_config,
        -- FLD-3 / FLD-11: a percent field that takes -40 is a percent in name only.
        'rules', case when exists (select 1 from jsonb_array_elements(v_rules) r
                                    where r ->> 'kind' in ('min', 'max'))
                      then v_rules
                      else v_rules || jsonb_build_array(
                             jsonb_build_object('kind', 'min', 'value', 0),
                             jsonb_build_object('kind', 'max', 'value', 100)) end);
    -- ── the tick box ────────────────────────────────────────────────────────
    -- No format, no unit, no options Table and no Rule: what it holds IS the
    -- behaviour. A default is carried when the caller named one (above), which is
    -- how a column can start life ticked.
    when 'checkbox' then
      d := d || jsonb_build_object('type', 'boolean', 'config', v_config, 'rules', v_rules);

    when 'datetime' then
      d := d || jsonb_build_object(
        'type', 'range', 'rules', v_rules,
        'config', v_config || jsonb_build_object(
                    'kind', case when coalesce(p_spec ->> 'kind', v_config ->> 'kind') = 'datetime'
                                 then 'datetime' else 'date' end));
      if coalesce(p_spec ->> 'kind', v_config ->> 'kind') = 'datetime' then
        d := d || jsonb_build_object('format', 'datetime');
      end if;
    else
      raise exception 'The field type "%" is known but this store does not yet know what it is made of.', v_parity
        using errcode = '23514',
              hint = 'custom._field_document_for has an arm per parity type; this one is missing. Nothing was written.';
  end case;

  return custom._with_display(p_organization_id, d, p_spec);
end
$function$

;

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
    'parity_type', 'plain', 'type'];
  v_unknown  text[];
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

delete from platform.client_callable_door
 where schema_name = 'custom'
   and declared_by = 'gridprim_a_formula_is_typed_and_the_store_works_it_out.sql';

drop function if exists custom.formula_parse(uuid, uuid, text);
drop function if exists custom._fxp_type(jsonb, jsonb);
drop function if exists custom._fxp_resolve(jsonb, jsonb, jsonb);
drop function if exists custom._fxp_level(jsonb, integer, integer);
drop function if exists custom._fxp_tokens(text);
drop function if exists custom.formula_eval(uuid, jsonb, jsonb, jsonb);
drop function if exists custom._fx_autonumber(uuid, uuid, text, uuid);
drop function if exists custom._fx_unit(jsonb, text[], text);
drop function if exists custom._fx_iso(timestamp, boolean);
drop function if exists custom._fx_date(jsonb, text);
drop function if exists custom._fx_cmp(jsonb, jsonb);
drop function if exists custom._fx_truthy(jsonb);
drop function if exists custom._fx_num(jsonb, text);
drop function if exists custom._fx_loose(jsonb);
drop function if exists custom._fx_text(jsonb);
drop function if exists custom._fx_num_text(numeric);
drop function if exists custom._fx_blank(jsonb);
drop function if exists custom._with_display_format(jsonb, jsonb);
drop function if exists custom._display_format_check(jsonb);
drop function if exists custom.display_format_ids();
drop function if exists custom.formula_node_kinds();
