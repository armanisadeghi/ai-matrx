-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.table_declare(uuid, jsonb) efd851ffc7c95f6234b9a30c855890c393155180e9360fd92db9d59b504c8305
-- based-on: custom._field_document_for(uuid, uuid, jsonb) 260464e5521f2c274b5b0a3416abdfc8548db8f311ae6d6b52dfa9367f87fcc8
-- based-on: custom._table_shape_guard() 3e2bd637cf277f6fad80526f15aa3996f939ef8c2be9fafb950a50c33e17a5ff
-- based-on: custom.field_declare(uuid, uuid, jsonb) 4802b67d8ba1f2e4ba2f91b914f792350d3f3fc8033716321c019acdd90f0e4b
--
-- LIMITS-FIX — WHAT A TABLE DECLARES IS WHAT THE TABLE HAS, AND IT IS ASKED FOR ONCE.
--
-- Three limitations the real-data crews hit on 2026-09-20/21 entering live use cases, all
-- one class: the table spec and the field door were two sources of truth speaking two
-- vocabularies, and neither was reconciled with the other.
--
-- 1. `store.fields()` ANSWERS ZERO FOR A TABLE THAT PLAINLY HAS COLUMNS (crew D, podcast
--    episode pipeline). `custom.table_declare` wrote the spec's `fields` into the table's
--    own document and created no Field record, while `custom.applicable_fields` reads only
--    Field records. MEASURED on the main database 2026-09-21: 770 tables in the store, ALL
--    770 declaring fields in their document (the shape guard refuses a table that does
--    not), 666 with Field records — and 104 tables across 15 organizations holding 315
--    declared field names with none. The newest of them are the crews' own tables, made
--    minutes earlier: "Trailhead & Torch Journeys: US National Parks", "Wraithmoor Regional
--    Museum of Art & Craft: exhibitions", "The Offside Rule: World Cup Finals". For those
--    tables the grid has no columns to draw and `custom.field_declare`'s own `via`/`of`
--    resolution — which reads that same empty answer — cannot resolve a lookup or a rollup,
--    which is why the same crew's rollup attempts refused too.
--
-- 2. ONE ROUND TRIP PER MISSING KEY. `custom._table_shape_guard` stopped at the first
--    problem, so declaring one table meant asking the live database what was wrong with it
--    over and over. Crew D hit four in a row (retention_days, default_sort, agent_writable,
--    a name on each field); reproducing it for this fix cost five more (type, slug, labels,
--    display, weight) before a row was even written.
--
-- 3. THE SAME CONCEPT, TWO WORDS, ONE CALL APART. A table spec's inline field says `name`;
--    `custom._field_document_for` read only `label` — and answered a caller that sent `name`
--    with "A field needs a name". The same split sent crew E to report that no client door
--    can declare a table-to-table relation: the door has been able to since 2026-09-19, but
--    only under the word `relation_target`, and a caller reaching for `target_table` was
--    told its column "is a Person column or a File column", which is a different mistake.
--
-- WHAT THIS CHANGES, AND WHAT IT DELIBERATELY DOES NOT. Every guard, every rule and every
-- refusal sentence stands. A table with ONE problem still gets the exact sentence and hint
-- it always got, byte for byte, so nothing asserting on those words changes; only two or
-- more are combined. `label` still wins over `name` and `relation_target` over
-- `target_table` when a caller sends both, so no existing caller's meaning moves. THIS
-- MIGRATION CONVERTS NO EXISTING DATA: the 104 split tables are not repaired here — their
-- repair reads a type out of a document that may not carry one, which is a decision of its
-- own and not something to do silently inside a shape fix.
--
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
    elsif v_alias = 'list' then
      v_parity := 'select';
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
              hint = 'FLD-11: the thirteen are select, multi_select, member, attachment, lookup, rollup, formula, url, email, phone, currency, percent and datetime, and the three plain ones are text, long_text and number. Nothing was created.';
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
    return d;
  end if;

  if v_parity is null then
    -- The three behaviours a person picks that are NOT one of the thirteen:
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
      -- No door wrote that `format`: this branch dropped it, and the thirteen parity types
      -- have no signature among them. So `custom.doc_sign`, which IS granted to
      -- `authenticated`, could never be used by a signed-in person at all: the one field it
      -- accepts had no way to exist outside an INSERT straight into `custom.record`, which
      -- needs a table privilege nobody has. Measured from the seat on the main database on
      -- 2026-09-19 while converting `scripts/campaign-tests/w3_doc_c43.sql`.
      -- A plain text field may now SAY it holds a signature, and nothing else changes: a
      -- field that does not ask for it is written exactly as before.
      if nullif(p_spec ->> 'format', '') = 'signature' then
        d := d || jsonb_build_object('format', 'signature');
      end if;
    end if;
    return d;
  end if;

  if not exists (select 1 from custom.parity_field_types() t where t.parity_type = v_parity) then
    raise exception 'There is no field type called "%" in this system.', v_parity
      using errcode = '23514',
            hint = 'FLD-11: the thirteen are select, multi_select, member, attachment, lookup, rollup, formula, url, email, phone, currency, percent and datetime.';
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
                             'kind', 'pattern', 'value', '^[+0-9][0-9 ()\-\.]{4,}$')) end);

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

  return d;
end
$function$

;

CREATE OR REPLACE FUNCTION custom.field_declare(p_organization_id uuid, p_table_id uuid, p_spec jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_doc     jsonb;
  v_listed  boolean;
  v_key     text;
  v_fields  jsonb;
  v_opts    uuid;
  v_id      uuid;
begin
  -- THE DECISION FIRST, BEFORE ANYTHING IS READ OR WRITTEN: the organization's
  -- own off switch, then the organization wall, then the right to change the
  -- SHAPE of this table, which is an admin's right and not an editor's.
  perform custom.assert_store_door(p_organization_id, 'custom.field_declare');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.field_declare');
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.field_declare',
                                          'admin'::public.permission_level, 'table');

  select r.data -> 'fields' into v_fields
    from custom.record r
   where r.organization_id = p_organization_id
     and r.id = p_table_id
     and r.table_id = custom.table_kernel_id()
     and r.deleted_at is null;
  if v_fields is null then
    raise exception 'That table is not in this organization, so a field cannot be added to it.'
      using errcode = '23514',
            hint = 'REC-29: organizations are hard walls. Open the table you meant and add the field there.';
  end if;

  v_doc := custom._field_document_for(p_organization_id, p_table_id, p_spec);
  v_key := v_doc ->> 'key';

  -- ── RELATION-DECLARE, 2026-09-20: "MAY I POINT AT IT" IS "MAY I SEE IT". ───────────────
  -- Pointing a column at a Table is how that Table's titles get onto your screen: the picker
  -- lists its records and platform.relation_label hydrates a chip from each one. So the
  -- question this door was not asking is the question every OTHER door onto a Table asks
  -- (T10) - and this is the one that makes a LASTING link. A caller who names the target
  -- themselves is asked it here; the Person and File columns, whose target is a kernel Table
  -- this door fills in, are untouched.
  -- LIMITS-FIX 2026-09-21: `target_table` is the same question as `relation_target`
  -- (custom._field_document_for reads both), so the may-I-see-it check has to recognise
  -- both too. Reading only one word here would let a caller reach a Table it may not see
  -- simply by spelling the argument the other way.
  if coalesce(nullif(p_spec ->> 'relation_target', ''), nullif(p_spec ->> 'target_table', '')) is not null
     and nullif(v_doc ->> 'relation_target', '') is not null then
    perform custom.assert_may_know_table(p_organization_id,
              (v_doc ->> 'relation_target')::uuid, 'custom.field_declare');
  end if;

  -- ── SEAT-SUITES, 2026-09-19: A COLUMN A TABLE DECLARED COULD NEVER BE DEFINED. ──────
  -- `custom._table_shape_guard` refuses a table that declares no fields, so EVERY table made
  -- through `custom.table_declare` names at least one column. `table_declare` writes only the
  -- NAME into the table's `fields` list — it makes no Field row — so `custom.applicable_fields`
  -- answers ZERO columns for a brand-new table, and this door then refused every one of those
  -- names as "already there". Through the doors alone, a signed-in person's first column had no
  -- type, no rules, no validation and no way to ever get one. The old suites never saw it
  -- because they INSERTed the Field rows straight into `custom.record` as the role that owns
  -- the table — a privilege no person has. Measured from the seat `authenticated` on the main
  -- database on 2026-09-19: applicable_fields = 0, then 23505 "This table already has a field
  -- called Pname", then applicable_fields = 0 again.
  --
  -- THE RULE: a NAME the table declared and never defined is FILLED IN by this door. Only a
  -- name that already has a Field ROW is a duplicate, and that is still refused by name.
  v_listed := exists (select 1 from jsonb_array_elements(v_fields) f where f ->> 'name' = v_key);
  if exists (select 1 from custom.record r
              where r.organization_id = p_organization_id
                and r.table_id = custom.field_kernel_id()
                and r.data_class = 'field'
                and r.deleted_at is null
                and r.data ->> 'entity_definition_id' = p_table_id::text
                and r.data ->> 'key' = v_key) then
    raise exception 'This table already has a field called "%".', v_doc ->> 'label'
      using errcode = '23505',
            hint = 'Two fields of one table cannot share a key. Give this one a different name, or edit the one that is already there.';
  end if;

  -- THE CHOICE LIST. The person typed words; the store keeps them the only way
  -- FLD-5/FLD-6 allows — as the records of a Table — and points the Field at it.
  if (v_doc ->> 'type') = 'list'
     and nullif(v_doc -> 'config' ->> 'options_table_id', '') is null then
    if jsonb_typeof(p_spec -> 'options') is distinct from 'array'
       or jsonb_array_length(coalesce(p_spec -> 'options', '[]'::jsonb)) = 0 then
      raise exception 'A list of choices needs its choices - "%" has none yet.', v_doc ->> 'label'
        using errcode = '23514',
              hint = 'Type the choices into the field panel, one per line, and they are saved with the field.';
    end if;
    v_opts := custom._options_table_for(p_organization_id, v_doc ->> 'label', p_spec -> 'options');
    v_doc := jsonb_set(v_doc, '{config,options_table_id}', to_jsonb(v_opts::text));
  end if;

  -- ONE SOURCE OF TRUTH, both ways: the TABLE declares which fields it has and
  -- `custom.field` defines what one of them is, so the table is told first —
  -- the field guard refuses a definition for a field the table never declared,
  -- which is the exact sentence every "Add field" ended on.
  -- A name the table already declared is not added to the list a second time; a table that
  -- listed the same column twice would show it twice on every screen.
  if not v_listed then
    update custom.record
       set data = jsonb_set(data, '{fields}',
                            coalesce(data -> 'fields', '[]'::jsonb)
                            || jsonb_build_array(jsonb_build_object('name', v_key))),
           updated_at = now(), version = version + 1
     where organization_id = p_organization_id
       and id = p_table_id
       and table_id = custom.table_kernel_id();
  end if;

  -- `data_class = 'field'` is the other half of what no client could write. A
  -- field stored as a plain record is invisible to the delete rules and to the
  -- formula-dependency check (the 19 September verdict's defect 1).
  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, custom.field_kernel_id(), 'field', v_doc)
  returning id into v_id;

  return v_id;
end
$function$

;

CREATE OR REPLACE FUNCTION custom._table_shape_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  d            jsonb := new.data;
  -- ── LIMITS-FIX 2026-09-21: EVERY PROBLEM WITH THIS TABLE, IN ONE ANSWER. ───────────────
  -- This guard used to stop at the FIRST thing wrong, so declaring one table meant a
  -- round trip per missing key against the live database. Real-data crew D hit four in a
  -- row (retention_days, default_sort, agent_writable, and a name on each field) declaring
  -- a podcast episode pipeline on 2026-09-21; reproducing it for this fix cost five more
  -- (type, slug, label, display, weight) before the row was even written. A person filling
  -- in a form is told everything that is wrong with it at once, and so is a caller here.
  --
  -- ONE problem still raises the EXACT sentence and hint it always did, byte for byte, so
  -- nothing that asserts on those messages changes. Only TWO OR MORE are combined.
  v_bad        text[] := '{}';
  v_bad_hints  text[] := '{}';
  v_i          integer;
  v_all        text;
  v_type       text;
  v_title      text;
  v_fields     jsonb;
  v_home       uuid;
  v_home_type  text;
  v_names      text[];
begin
  -- THE DOOR. One call to the ONE predicate (`custom.assert_store_door`), which
  -- judges `custom.caller_role()` - the identity the caller actually held - and not
  -- `current_user`, which a SECURITY DEFINER door has already rewritten to itself.
  -- The switch never removes a check: everything below runs exactly as before.
  perform custom.assert_store_door(new.organization_id, 'custom.record');

  -- A RETIREMENT IS NOT A CHANGE OF SHAPE (the shared rule DOOR-FIX and TABLE-DELETE built,
  -- now asked as ONE question). The only change in this update is `deleted_at` going from
  -- nothing to a time: the document is byte-for-byte what it was, so there is no new shape
  -- to judge. This is what lets a dependent field retire in the SAME operation as the
  -- relation it reads through - the sweep, the cascade and the door all arrive here.
  if tg_op = 'UPDATE'
     and custom.is_a_retirement(old.deleted_at, new.deleted_at,
                                old.data, new.data,
                                old.table_id, new.table_id,
                                old.organization_id, new.organization_id,
                                old.data_class, new.data_class) then
    return new;
  end if;

  -- Only Tables, and only Tables an organization DECLARED. REC-27: the kernel's nine are
  -- "defined in code, not data" — W1-STORE wrote eight of them before this guard existed
  -- and W1-FIELD adds the ninth, so a `kernel` row is exempt and the view supplies its
  -- defaults. THE BOUND OF THAT EXEMPTION, named rather than left implied: the only writer
  -- that can set data_class at all is the schema owner, because schema `custom` is revoked
  -- from PUBLIC, anon, authenticated and service_role and the one client door
  -- (custom.record_write) cannot set data_class. A tenant cannot reach this branch.
  if new.table_id is distinct from custom.table_kernel_id() or new.data_class = 'kernel' then
    return new;
  end if;

  v_type := d ->> 'type';
  if v_type is null or v_type not in ('entity', 'detail') then
    v_bad := v_bad || format('a table is an entity or a detail, and this one says %s', custom.said(v_type, 'nothing'));
      v_bad_hints := v_bad_hints || ('REC-66: type ∈ {entity, detail}.');
  end if;
  if v_type = 'detail' and coalesce(d ->> 'parent_token', '') = '' then
    v_bad := v_bad || format('a detail table has to say what it is a detail of');
      v_bad_hints := v_bad_hints || ('REC-66: parent_token is required when type is detail.');
  end if;
  if v_type <> 'detail' and d ? 'parent_token' then
    v_bad := v_bad || format('only a detail table has a parent table');
      v_bad_hints := v_bad_hints || ('REC-66: parent_token belongs to type detail and to nothing else.');
  end if;

  if coalesce(d ->> 'name', '') = '' then
    v_bad := v_bad || format('a table needs a name');
      v_bad_hints := v_bad_hints || ('REC-1.');
  end if;
  if coalesce(d ->> 'slug', '') !~ '^[a-z][a-z0-9_]*$' then
    v_bad := v_bad || format('a table needs a slug made of lower-case letters, digits and underscores');
      v_bad_hints := v_bad_hints || ('REC-66: slug.');
  end if;
  if coalesce(d ->> 'label_singular', '') = '' or coalesce(d ->> 'label_plural', '') = '' then
    v_bad := v_bad || format('a table needs both of its labels - one thing and many things');
      v_bad_hints := v_bad_hints || ('REC-66: label_singular and label_plural.');
  end if;

  if coalesce(d ->> 'display', '') not in ('list', 'page') then
    v_bad := v_bad || format('a table shows its records as a list or as a page, and this one says %s',
                    custom.said(d ->> 'display', 'nothing'));
      v_bad_hints := v_bad_hints || ('REC-1: display. T4 turns a list into a page and migrates nothing.');
  end if;
  if jsonb_typeof(d -> 'ordered') is distinct from 'boolean' then
    v_bad := v_bad || format('a table has to say whether its records are ordered');
      v_bad_hints := v_bad_hints || ('REC-1: ordered.');
  end if;
  if coalesce(d ->> 'weight', '') not in ('heavy', 'light') then
    v_bad := v_bad || format('a table is heavy or light, and this one says %s', custom.said(d ->> 'weight', 'nothing'));
      v_bad_hints := v_bad_hints || ('REC-1: heavy|light.');
  end if;
  if jsonb_typeof(d -> 'retention_days') is distinct from 'number' then
    v_bad := v_bad || format('a table has to say how long it keeps its history');
      v_bad_hints := v_bad_hints || ('REC-1: retention.');
  end if;
  -- W3-HIST (HIS-3): the floor is READ, never a literal (rule 15). Thirty days is the
  -- PLATFORM floor, and an organization that raised its own is entitled to have that
  -- honoured here too — the knob is `extensibility / user_tables.history_retention_floor_days`,
  -- raise-only, min 30. With a literal here an organization at sixty days could still declare
  -- a thirty-day table and lose thirty days of history it had already decided to keep.
  -- This body's own switch is `custom/system_enabled`, read through custom.assert_store_door
  -- above; the history writer's is `custom/row_versions_guard`.
  declare
    v_floor integer;
  begin
    -- THE GUARD, READ IN THE BODY. While `custom/system_enabled` resolves false this
    -- comparison is byte-for-byte the behaviour it has always had — the literal thirty — so
    -- the OFF path answers identically and §6.6's requirement for touching a live body is
    -- something a verifier can execute rather than something this lane asserts. Switched ON,
    -- the organization's own floor is honoured here too.
    if coalesce((platform.knob_resolve('custom', 'system_enabled', new.organization_id) #>> '{}')::boolean, false) then
      v_floor := history.retention_floor_days(new.organization_id);
    else
      v_floor := 30;
    end if;
    -- Only ask the floor question when a NUMBER was actually given: collecting the
    -- type problem above instead of raising means this line is now reached with a
    -- non-number, and `::numeric` would abort with a cast error nobody asked for.
    if jsonb_typeof(d -> 'retention_days') = 'number'
       and (d ->> 'retention_days')::numeric < v_floor then
      v_bad := v_bad || format('History here is kept for at least %s days, so this table cannot keep only %s.',
                      v_floor, d ->> 'retention_days');
      v_bad_hints := v_bad_hints || (format('REC-1 / T14 / HIS-3: %s days is the retention floor — thirty is the platform minimum and an organization may only ever raise it. Give this table %s or more.', v_floor, v_floor));
    end if;
  end;

  -- REC-N-17: a default sort AND a manual row order, both load-bearing.
  if jsonb_typeof(d -> 'default_sort') is distinct from 'array' then
    v_bad := v_bad || format('a table has to say how its records are sorted by default');
      v_bad_hints := v_bad_hints || ('REC-N-17: default_sort is an array of {field, direction}.');
  end if;
  if coalesce(d ->> 'row_order', '') not in ('manual', 'sorted') then
    v_bad := v_bad || format('a table orders its rows by hand or by its sort, and this one says %s',
                    custom.said(d ->> 'row_order', 'nothing'));
      v_bad_hints := v_bad_hints || ('REC-N-17: manual row order.');
  end if;

  if jsonb_typeof(d -> 'agent_writable') is distinct from 'boolean' then
    v_bad := v_bad || format('a table has to say whether an agent may write to it');
      v_bad_hints := v_bad_hints || ('REC-66: agent_writable, default true, is declared rather than guessed.');
  end if;

  -- REC-1: its fields. REC-2: exactly one of them is the title.
  v_fields := d -> 'fields';
  if jsonb_typeof(v_fields) is distinct from 'array' or jsonb_array_length(v_fields) = 0 then
    v_bad := v_bad || format('a table has to declare its fields');
      v_bad_hints := v_bad_hints || ('REC-1: fields.');
  end if;
  -- Same reason: `jsonb_array_elements` on a non-array aborts, so the questions that
  -- read the list are asked only when there is a list to read. The missing-fields problem
  -- is already collected above, and the caller is told about it in the same answer.
  if jsonb_typeof(v_fields) = 'array' then
    select array_agg(f ->> 'name') into v_names from jsonb_array_elements(v_fields) f;
  end if;
  if v_names is not null and array_position(v_names, null) is not null then
    v_bad := v_bad || format('every field of a table needs a name');
      v_bad_hints := v_bad_hints || ('REC-1: fields.');
  end if;
  v_title := d ->> 'title_field';
  if v_title is null then
    v_bad := v_bad || format('a table needs a title field, or its records cannot be shown as chips');
      v_bad_hints := v_bad_hints || ('REC-2.');
  end if;
  if v_title is not null and v_names is not null and not (v_title = any (v_names)) then
    v_bad := v_bad || format('the title field %s is not one of this table''s fields', v_title);
      v_bad_hints := v_bad_hints || ('REC-2: the title field names one of the table''s own fields.');
  end if;

  -- REC-1 and REC-14: exactly ONE Home, and the Home IS the parent, so "exactly one Home"
  -- and "zero or one parent" are ONE stored fact and the Home tree is REC-7's tree.
  v_home := custom.containment_parent(d);
  if v_home is null then
    v_bad := v_bad || format('a table has to live somewhere - give it a home');
      v_bad_hints := v_bad_hints || ('REC-1: exactly one Home, stored as this record''s parent_id. Additional Homes are relations (REC-3, REC-26).');
  end if;
  -- REC-11: a detail Table's records inherit only and cannot be Homes.
  select t.data ->> 'type' into v_home_type
    from custom.record h
    join custom.record t
      on t.organization_id = h.organization_id and t.id = h.table_id
   where h.organization_id = new.organization_id and h.id = v_home;
  if v_home_type = 'detail' then
    v_bad := v_bad || format('a detail record cannot be a home');
      v_bad_hints := v_bad_hints || ('REC-11: a detail table inherits only - its records take no direct shares and cannot be Homes.');
  end if;

  -- ── THE ONE ANSWER. ───────────────────────────────────────────────────────────────────
  -- Exactly one problem raises the sentence and the hint this guard has always raised, so
  -- every suite and every screen that reads those words is unchanged. Two or more are
  -- numbered into a single refusal, each with its own meaning, so a caller fixes the whole
  -- table in one more attempt instead of one attempt per key.
  if array_length(v_bad, 1) = 1 then
    raise exception '%', v_bad[1] using errcode = '23514', hint = v_bad_hints[1];
  elsif array_length(v_bad, 1) > 1 then
    v_all := '';
    for v_i in 1 .. array_length(v_bad, 1) loop
      v_all := v_all || format('%s. %s (%s)', v_i, v_bad[v_i], v_bad_hints[v_i]);
      if v_i < array_length(v_bad, 1) then v_all := v_all || '  '; end if;
    end loop;
    raise exception 'This table cannot be declared yet - % things need fixing: %',
                    array_length(v_bad, 1), v_all
      using errcode = '23514',
            hint = 'Every problem with the table is listed above, so one more attempt can fix all of them. Nothing was created.';
  end if;

  return new;
end;
$function$

;

CREATE OR REPLACE FUNCTION custom.table_declare(p_organization_id uuid, p_spec jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_id    uuid;
  v_field jsonb;
  v_doc   jsonb;
  v_opts  uuid;
  v_n     integer := 0;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.table_declare');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_declare');

  if p_organization_id is null then
    raise exception 'custom.table_declare: organization_id is required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;
  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, custom.table_kernel_id(), 'table', coalesce(p_spec, '{}'::jsonb))
  returning id into v_id;

  -- ── LIMITS-FIX 2026-09-21: THE FIELDS A TABLE DECLARES NOW EXIST. ─────────────────────
  -- `custom._table_shape_guard` REFUSES a table that declares no fields, so every table
  -- made here names its columns — and this door used to write those names into the table's
  -- own document and make no Field record for any of them. The consequence, measured on the
  -- main database on 2026-09-21: of 770 tables in the store, 104 across 15 organizations
  -- hold 315 declared field names with NO backing Field record. For those tables
  -- `custom.applicable_fields` answers ZERO columns, so `store.fields()` returns an empty
  -- array for a table that plainly has columns and already holds rows using them; the grid
  -- has nothing to draw, and `custom.field_declare`'s own `via`/`of` validation — which
  -- reads that same list — cannot resolve a lookup or a rollup at all. Real-data crew D hit
  -- every one of those symptoms within ten minutes of starting a podcast episode pipeline.
  --
  -- The two halves were never reconciled: the table document said one thing and the Field
  -- records said another, and the store had no opinion about which was true. They are now
  -- written in ONE statement, so they cannot disagree at birth.
  --
  -- It reuses `custom._field_document_for` — the SAME builder `custom.field_declare` uses —
  -- rather than composing a second field document here, so a field born with its table and a
  -- field added later are the same kind of thing, validated by the same guards. The inline
  -- entry's own word for the column's name (`name`) is what that builder now reads.
  -- The table's `fields` list is NOT appended to: the spec already carries these names, and
  -- adding them again would show every column twice on every screen.
  --
  -- A field that cannot be made fails the WHOLE declaration. A table that half exists, with
  -- some of its columns real and the rest only named, is the state this fix is removing.
  if jsonb_typeof(p_spec -> 'fields') = 'array' then
    for v_field in select * from jsonb_array_elements(p_spec -> 'fields') loop
      v_n := v_n + 1;
      -- IN THE ORDER A PERSON WROTE THEM. `sort` is what every reader orders columns by, so
      -- position in the declared list becomes position on the screen unless the caller said
      -- otherwise. Without this the columns come back in whatever order the plan produced.
      if (v_field ->> 'sort') is null then
        v_field := v_field || jsonb_build_object('sort', v_n * 100);
      end if;

      v_doc := custom._field_document_for(p_organization_id, v_id, v_field);

      -- THE CHOICE LIST, exactly as `custom.field_declare` builds it: the words a person
      -- typed are kept the only way FLD-5/FLD-6 allows, as the records of a Table.
      if (v_doc ->> 'type') = 'list'
         and nullif(v_doc -> 'config' ->> 'options_table_id', '') is null then
        if jsonb_typeof(v_field -> 'options') is distinct from 'array'
           or jsonb_array_length(coalesce(v_field -> 'options', '[]'::jsonb)) = 0 then
          raise exception 'A list of choices needs its choices - "%" has none yet.', v_doc ->> 'label'
            using errcode = '23514',
                  hint = 'Give the field its choices in the table spec, as an options array beside its name. Nothing was created.';
        end if;
        v_opts := custom._options_table_for(p_organization_id, v_doc ->> 'label', v_field -> 'options');
        v_doc := jsonb_set(v_doc, '{config,options_table_id}', to_jsonb(v_opts::text));
      end if;

      insert into custom.record (organization_id, table_id, data_class, data)
      values (p_organization_id, custom.field_kernel_id(), 'field', v_doc);
    end loop;
  end if;

  return v_id;
end;
$function$
;
