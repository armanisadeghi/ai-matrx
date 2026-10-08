-- chair-step: restores custom.field_kinds, field_kind_of, _field_document_for, _field_kind_shape_ok, _kind_value_ok and _automation_fire as they stood before notionprops2_b_a_button_is_a_column.sql, and drops custom.button_press (+ its door row) and custom._automation_run. Button columns already declared stay as text columns with format button.
-- Inverse of migrations/campaign/notionprops2_b_a_button_is_a_column.sql
-- lane: NOTION-PROPS-2
-- guard: custom/system_enabled

CREATE OR REPLACE FUNCTION custom.field_kinds()
 RETURNS TABLE(kind text, behavior text, parity boolean, made_of text)
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog'
AS $function$
  select t.parity_type, t.behavior, true, t.made_of
    from custom.parity_field_types() t
  union all
  select * from (values
    ('text',      'text',     false, 'plain text: behaviour text with no format — it carries no parity type, which is exactly what custom.parity_type answers for it'),
    ('long_text', 'text',     false, 'behaviour text with format long and config.multiline, for several lines rather than one'),
    ('number',    'range',    false, 'a plain number: behaviour range with no date kind and neither the currency nor the percent format'),
    ('relation',  'relation', false, 'REL / FLD-11: a relation a person aims themselves — relation_target names a Table of this organization, and it is a BEHAVIOUR, never a parity type of its own'),
    ('signature', 'text',     false, 'VAL-10: behaviour text whose format is signature — the one shape custom.doc_sign accepts, sealed by custom.doc_signature_write and checked by custom.doc_signature_intact'),
    ('entity_reference', 'relation', false, 'SC-R / P12: a relation whose target mode is any (REL-8), restricted by config.allowed_types to the platform kinds it may name (custom.entity_reference_kinds() — agents, notes, web sites, workbooks, datasets, conversations …); each value is {token, id}, the edge a platform.associations row record → <token>. File and Person stay relations to their kernel Tables'),
    -- LANE 10 P4 (2026-10-02): nine kinds from Airtable's and SmartSuite's field lists. Each is an
    -- existing behaviour wearing a format (FLD-1's closed set holds); custom.field_kind_of reads
    -- each back; custom._field_kind_shape_ok and custom._kind_value_ok judge them.
    ('rating',      'range',    false, 'P4: behaviour range, format rating; a whole number of stars from 0 to its max Rule (1 to 10, default 5), shown as stars'),
    ('duration',    'range',    false, 'P4: behaviour range, format duration, unit seconds; a length of time kept as seconds, never below zero'),
    ('created_by',  'formula',  false, 'P4: a formula Field whose config.system is created_by: who made the record, {id, name}, filled by the store from the record''s writer on read and never typed'),
    ('modified_by', 'formula',  false, 'P4: a formula Field whose config.system is modified_by: who last changed the record, {id, name}, filled by the store on read and never typed'),
    ('status',      'list',     false, 'P4: a single-choice list with format status; config.status_groups puts each choice key in todo, in_progress or done (Notion''s Status)'),
    ('address',     'text',     false, 'P4: behaviour text, format address; the value is {street, city, region, postal_code, country}, every part optional, at least one filled'),
    ('barcode',     'text',     false, 'P4: behaviour text, format barcode; one printable line a scanner reads, config.symbology optional (custom.barcode_symbologies()), EAN/UPC digits and check digit enforced'),
    ('rich_text',   'text',     false, 'P4: behaviour text, format rich_text; Markdown with no raw HTML and no script links, shown formatted'),
    ('count',       'formula',  false, 'P4: a roll-up whose config.agg is count, with format count: how many records a many-relation points at, as a number of its own')
  ) as extra(kind, behavior, parity, made_of);
$function$

;

CREATE OR REPLACE FUNCTION custom.field_kind_of(p_field_data jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog'
AS $function$
  select case
    when p_field_data ->> 'type' = 'range' and p_field_data ->> 'format' = 'rating'   then 'rating'
    when p_field_data ->> 'type' = 'range' and p_field_data ->> 'format' = 'duration' then 'duration'
    when p_field_data ->> 'type' = 'text'  and p_field_data ->> 'format' = 'address'  then 'address'
    when p_field_data ->> 'type' = 'text'  and p_field_data ->> 'format' = 'barcode'  then 'barcode'
    when p_field_data ->> 'type' = 'text'  and p_field_data ->> 'format' = 'rich_text' then 'rich_text'
    when p_field_data ->> 'type' = 'text'  and p_field_data ->> 'format' = 'signature' then 'signature'
    when p_field_data ->> 'type' = 'list'  and p_field_data ->> 'format' = 'status'   then 'status'
    when p_field_data ->> 'type' = 'formula' and p_field_data ->> 'format' = 'count'
         and p_field_data -> 'config' ->> 'agg' = 'count'                               then 'count'
    when p_field_data ->> 'type' = 'formula'
         and p_field_data -> 'config' ->> 'system' in ('created_by', 'modified_by', 'autonumber',
                                                       'created_time', 'modified_time')
      then p_field_data -> 'config' ->> 'system'
    when p_field_data ->> 'type' = 'relation'
         and jsonb_typeof(p_field_data -> 'config' -> 'allowed_types') = 'array'        then 'entity_reference'
    else coalesce(custom.parity_type(p_field_data),
                  case p_field_data ->> 'type'
                    when 'text' then case when p_field_data ->> 'format' = 'long'
                                            or (p_field_data -> 'config' ->> 'multiline') = 'true'
                                          then 'long_text' else 'text' end
                    when 'range' then 'number'
                    when 'relation' then 'relation'
                  end)
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
  -- GRID-PRIMITIVES G5: the three column kinds the store fills in itself.
  v_system text := null;
  -- GRID-PRIMITIVES G3: a formula a person TYPED, parsed by the store.
  v_parsed jsonb := null;
  v_relation uuid := null;   -- SEAT-SUITES: the Table a caller's own relation column points at
  -- SC-R / P12, 2026-09-24: a column that points at a PLATFORM thing — an agent, a note, a web
  -- site, a workbook — rather than at a record of one of this organization's Tables.
  v_entity  boolean := false;
  -- LANE 10 P4: which of the nine kinds the caller's word named (rating, duration, address,
  -- barcode, rich_text, status, count); created_by and modified_by ride v_system.
  v_kind    text := null;
  v_max     numeric;
  v_allowed jsonb   := null;
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
    elsif v_alias in ('autonumber', 'created_time', 'modified_time', 'auto_number',
                      'created', 'modified', 'last_modified', 'last_modified_time') then
      -- ── GRID-PRIMITIVES G5, 2026-09-22: THE STORE'S OWN STAMPS AS COLUMNS. ──────────────
      -- The older grid has an Autonumber, a Created time and a Last modified time column,
      -- and none of the three is typed: the database assigns the number and the row carries
      -- its own stamps. Here each is a formula Field whose expression is the system node —
      -- fx.autonumber is worked out ONCE, on write, and kept; the two stamps on read — so
      -- every reader that serves a worked-out value serves these with nothing new, and a
      -- hand-typed value is refused exactly as it is for any formula (FLD-9).
      v_parity := 'formula';
      v_system := case when v_alias in ('autonumber', 'auto_number') then 'autonumber'
                       when v_alias in ('created_time', 'created') then 'created_time'
                       else 'modified_time' end;
    -- ── LANE 10 P4, 2026-10-02: NINE MORE KINDS, EACH AN EXISTING BEHAVIOUR WEARING A FORMAT. ──
    -- Airtable's and SmartSuite's field lists, measured against field_kinds(): rating, duration,
    -- created by, last modified by, status, address, barcode, rich text and count were missing.
    -- None is a behaviour of its own (FLD-1's set stays closed): a rating and a duration are
    -- numbers, an address, a barcode and rich text are words, a status is a choice, a count is a
    -- roll-up, and who made or last changed a record is a formula the store fills in.
    elsif v_alias in ('rating', 'stars', 'star_rating') then
      v_kind := 'rating';  v_plain := 'number';
    elsif v_alias in ('duration', 'time_spent', 'length_of_time') then
      v_kind := 'duration'; v_plain := 'number';
    elsif v_alias in ('address', 'postal_address', 'location_address') then
      v_kind := 'address'; v_plain := 'text';
    elsif v_alias in ('barcode', 'bar_code', 'scan_code') then
      v_kind := 'barcode'; v_plain := 'text';
    elsif v_alias in ('rich_text', 'richtext', 'rich text', 'formatted_text', 'markdown') then
      v_kind := 'rich_text'; v_plain := 'text';
    elsif v_alias in ('status', 'status_with_groups') then
      v_kind := 'status'; v_parity := 'select';
    elsif v_alias in ('count', 'count_of_linked', 'link_count') then
      v_kind := 'count'; v_parity := 'rollup';
    elsif v_alias in ('created_by', 'creator', 'made_by') then
      v_parity := 'formula'; v_system := 'created_by';
      if coalesce(jsonb_typeof(p_spec -> 'display_format'), 'null') = 'null' then
        p_spec := p_spec || jsonb_build_object('display_format', jsonb_build_object('id', 'person'));
      end if;
    elsif v_alias in ('modified_by', 'last_modified_by', 'updated_by', 'changed_by') then
      v_parity := 'formula'; v_system := 'modified_by';
      if coalesce(jsonb_typeof(p_spec -> 'display_format'), 'null') = 'null' then
        p_spec := p_spec || jsonb_build_object('display_format', jsonb_build_object('id', 'person'));
      end if;
    elsif v_alias in ('entity_reference', 'entity', 'entity_ref', 'reference', 'platform_reference') then
      -- ── SC-R / P12, 2026-09-24: A RECORD POINTING AT SOMETHING THAT IS NOT A RECORD. ─────
      -- The scope system let a client's column point at its web site, its intake note or the
      -- agent that works it (16 such columns live on the main database), and the store could
      -- not: a relation reached one Table of this organization or the kernel File / Person
      -- Table and nothing else, so the mover had to refuse all sixteen. An entity reference is
      -- a RELATION (FLD-1's closed set of five behaviours holds) whose target mode is `any`
      -- (REL-8), restricted to the kinds it names in `allowed_types` — the scope system's own
      -- word `allowed_reference_types` is read too. Each kind must be one
      -- custom.entity_reference_kinds() lists; custom._field_shape_guard says which is not.
      v_entity := true;
      v_allowed := coalesce(
        case when jsonb_typeof(p_spec -> 'allowed_types') = 'array' then p_spec -> 'allowed_types' end,
        case when jsonb_typeof(v_config -> 'allowed_types') = 'array' then v_config -> 'allowed_types' end,
        case when jsonb_typeof(p_spec -> 'allowed_reference_types') = 'array' then p_spec -> 'allowed_reference_types' end,
        case when jsonb_typeof(p_spec -> 'allowed_types') = 'string'
             then jsonb_build_array(p_spec -> 'allowed_types') end);
      select coalesce(jsonb_agg(w order by first_at), '[]'::jsonb) into v_allowed
        from (select lower(btrim(x #>> '{}')) as w, min(o) as first_at
                from jsonb_array_elements(coalesce(v_allowed, '[]'::jsonb)) with ordinality as a(x, o)
               where jsonb_typeof(x) = 'string' and btrim(x #>> '{}') <> ''
               group by 1) s;
      if jsonb_array_length(v_allowed) = 0 then
        raise exception 'A column that points at things on the platform has to say which kinds of thing, and "%" names none.', coalesce(v_label, v_key, 'this column')
          using errcode = '23514',
                hint = 'SC-R / P12: send allowed_types, a list such as ["note", "web_site"]; select token, label from custom.entity_reference_kinds() lists every kind. A file is a File column and a person a Person column. Nothing was created.';
      end if;
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
        raise exception 'A column that points at other records has to point at a TABLE, and the one it names is not one of this organization''s tables.' using errcode = '23503',
                hint = 'FLD-11 / REL-8: relation_target names the Table whose records this column may point at - open the Table you meant and use its id. Nothing was created.',
            detail = jsonb_build_object('relation', v_relation)::text;
      end if;
    else
      raise exception 'There is no kind of column called "%".', p_spec ->> 'type'
        using errcode = '23514',
              hint = format('FLD-11: %s. Nothing was created.', custom._field_kinds_sentence());
    end if;
  end if;
  -- LANE 10 P4 round 3 (V11 #8): A SETTING A KIND CANNOT KEEP IS REFUSED, NEVER DROPPED. A rating,
  -- a length of time, an address, a piece of formatted text, a count and who wrote a record hold one
  -- value each; only a number of some sort has a unit.
  if (v_kind in ('rating', 'duration', 'address', 'rich_text', 'count') or v_system in ('created_by', 'modified_by'))
     and coalesce((p_spec ->> 'multi')::boolean, false) then
    raise exception '"%" holds one % per record, so it cannot hold several.', coalesce(v_label, v_key, 'This column'),
                    case coalesce(v_kind, v_system) when 'rating' then 'rating' when 'duration' then 'length of time'
                         when 'address' then 'address' when 'rich_text' then 'piece of formatted text' when 'count' then 'count'
                         else 'writer' end
      using errcode = '23514', hint = 'P4: leave multi out, or send false. Nothing was created.';
  end if;
  if (v_kind in ('rating', 'address', 'barcode', 'rich_text', 'status', 'count') or v_system in ('created_by', 'modified_by'))
     and nullif(btrim(coalesce(p_spec ->> 'unit', '')), '') is not null then
    raise exception '"%" has no unit, so it cannot be kept in %.', coalesce(v_label, v_key, 'This column'), p_spec ->> 'unit'
      using errcode = '23514', hint = 'P4: only a number, an amount of money or a percentage has a unit. Nothing was created.';
  end if;
  if v_kind = 'duration' and nullif(btrim(coalesce(p_spec ->> 'unit', '')), '') is not null
     and lower(btrim(p_spec ->> 'unit')) not in ('seconds', 'second', 's', 'sec', 'secs') then
    raise exception 'A duration is kept in seconds, so "%" cannot be kept in %. Leave the unit out; it shows as hours and minutes.', coalesce(v_label, v_key, 'This column'), p_spec ->> 'unit'
      using errcode = '23514', hint = 'P4: a duration''s unit is seconds. Nothing was created.';
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

  -- SC-R / P12: THE ENTITY REFERENCE (see its arm above). A relation with no Table target: its
  -- target mode is `any` and `allowed_types` says which platform kinds it may name. No display
  -- spec — its words are each thing's own title, read by platform.relation_label.
  if v_entity then
    d := d || jsonb_build_object(
      'type',             'relation',
      'relation_max',     coalesce((p_spec ->> 'relation_max')::integer, case when v_multi then 25 else 1 end),
      'on_target_delete', case when nullif(p_spec ->> 'on_target_delete', '') in ('restrict','set_null','cascade')
                               then p_spec ->> 'on_target_delete' else 'set_null' end,
      'rules',            v_rules,
      'config',           (v_config - 'allowed_types' - 'target_tables')
                          || jsonb_build_object('target_mode', 'any', 'allowed_types', v_allowed));
    return custom._with_display_format(d, p_spec - 'display');
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
    return custom._with_display_format(custom._with_display(p_organization_id, d, p_spec - 'display_format'), p_spec);
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
      -- LANE 10 P4: A RATING. Its top star is a max Rule (FLD-3 - a constraint is a Rule, never a
      -- config key), 1 to 10, from the caller's `max`, else the Rule it already carries, else 5.
      -- Its bottom is a min Rule of 0. It shows as stars out of that max.
      if v_kind = 'rating' then
        -- V8 #6: a top star that is not a number is refused, never quietly made 5.
        if nullif(btrim(coalesce(p_spec ->> 'max', '')), '') is not null
           and (p_spec ->> 'max') !~ '^-?[0-9]+(\.[0-9]+)?$' then
          raise exception 'A rating goes up to a whole number of stars from 1 to 10, and "%" asks for "%", which is not a number.', v_label, p_spec ->> 'max'
            using errcode = '23514', hint = 'P4: send max as a number between 1 and 10, or leave it out for 5. Nothing was created.';
        end if;
        v_max := coalesce(case when (p_spec ->> 'max') ~ '^-?[0-9]+(\.[0-9]+)?$' then (p_spec ->> 'max')::numeric end,
                          (select max((r ->> 'value')::numeric) from jsonb_array_elements(v_rules) r
                            where r ->> 'kind' = 'max' and (r ->> 'value') ~ '^-?[0-9]+(\.[0-9]+)?$'),
                          5);
        if v_max <> trunc(v_max) or v_max < 1 or v_max > 10 then
          raise exception 'A rating goes up to a whole number of stars from 1 to 10, and "%" asks for %.', v_label, v_max
            using errcode = '23514', hint = 'P4: send max between 1 and 10, or leave it out for 5. Nothing was created.';
        end if;
        d := (d - 'unit') || jsonb_build_object(
          'format', 'rating', 'multi', false,
          'rules', coalesce((select jsonb_agg(r) from jsonb_array_elements(v_rules) r
                              where coalesce(r ->> 'kind', '') not in ('min', 'max')), '[]'::jsonb)
                   || jsonb_build_array(jsonb_build_object('kind', 'min', 'value', 0),
                                        jsonb_build_object('kind', 'max', 'value', v_max)));
        if coalesce(jsonb_typeof(p_spec -> 'display_format'), 'null') = 'null'
           or (p_spec -> 'display_format' ->> 'id') = 'rating' then
          p_spec := p_spec || jsonb_build_object('display_format', jsonb_build_object(
                      'id', 'rating', 'options', jsonb_build_object('ratingMax', v_max)));
        end if;
      -- LANE 10 P4: A DURATION is a number of seconds, never below zero, shown as hours and minutes.
      elsif v_kind = 'duration' then
        -- V8 #6: a duration is kept in seconds; a caller asking for another unit of time is told so,
        -- never quietly given seconds.
        if lower(btrim(coalesce(p_spec ->> 'unit', ''))) in ('minutes', 'minute', 'min', 'mins', 'hours', 'hour', 'h', 'hr', 'hrs',
                                                              'days', 'day', 'ms', 'milliseconds', 'millisecond', 'weeks', 'week') then
          raise exception 'A duration is kept in seconds, so "%" cannot be kept in %. Leave the unit out; it shows as hours and minutes.', v_label, p_spec ->> 'unit'
            using errcode = '23514', hint = 'P4: a duration''s unit is seconds. Nothing was created.';
        end if;
        d := d || jsonb_build_object('format', 'duration', 'unit', 'seconds',
          'rules', case when exists (select 1 from jsonb_array_elements(v_rules) r where r ->> 'kind' = 'min')
                        then v_rules
                        else v_rules || jsonb_build_array(jsonb_build_object('kind', 'min', 'value', 0)) end);
        if coalesce(jsonb_typeof(p_spec -> 'display_format'), 'null') = 'null' then
          p_spec := p_spec || jsonb_build_object('display_format', jsonb_build_object(
                      'id', 'duration', 'options', jsonb_build_object('durationUnit', 'seconds')));
        end if;
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
      -- LANE 10 P4: three kinds of words. An ADDRESS is one value in parts
      -- ({street, city, region, postal_code, country}); a BARCODE is one line a scanner reads,
      -- naming its symbology when the caller did; RICH TEXT is Markdown with no raw HTML, kept
      -- on several lines. Each shows in its own format.
      if v_kind = 'address' then
        d := d || jsonb_build_object('format', 'address', 'multi', false);
        if coalesce(jsonb_typeof(p_spec -> 'display_format'), 'null') = 'null' then
          p_spec := p_spec || jsonb_build_object('display_format', jsonb_build_object('id', 'address'));
        end if;
      elsif v_kind = 'barcode' then
        d := d || jsonb_build_object('format', 'barcode',
          'config', (v_config - 'symbology') || jsonb_strip_nulls(jsonb_build_object('symbology',
                      nullif(lower(btrim(coalesce(p_spec ->> 'symbology', v_config ->> 'symbology', ''))), ''))));
        if coalesce(jsonb_typeof(p_spec -> 'display_format'), 'null') = 'null' then
          p_spec := p_spec || jsonb_build_object('display_format', jsonb_build_object('id', 'barcode'));
        end if;
      elsif v_kind = 'rich_text' then
        d := d || jsonb_build_object('format', 'rich_text', 'multi', false,
                                     'config', v_config || jsonb_build_object('multiline', true));
        if coalesce(jsonb_typeof(p_spec -> 'display_format'), 'null') = 'null' then
          p_spec := p_spec || jsonb_build_object('display_format', jsonb_build_object('id', 'markdown'));
        end if;
      end if;
    end if;
    return custom._with_display_format(custom._with_display(p_organization_id, d, p_spec - 'display_format'), p_spec);
  end if;

  if not exists (select 1 from custom.parity_field_types() t where t.parity_type = v_parity) then
    raise exception 'There is no field type called "%" in this system.', v_parity
      using errcode = '23514',
            hint = format('FLD-11: %s.', custom._parity_types_sentence());
  end if;

  d := d || jsonb_build_object('parity_type', v_parity);

  -- LANE7-SEC-ARCHIVE (2026-10-03): a standard table (no Table id: custom.entity_field_declare /
  -- entity_field_update) takes no worked-out field, said in field words BEFORE a formula is parsed
  -- against columns it does not have. custom._field_shape_guard holds the same line for every
  -- other way a definition is written.
  if p_table_id is null and (v_parity in ('formula', 'lookup', 'rollup') or v_system is not null) then
    raise exception 'A field on a standard table cannot be worked out from other values yet, so "%" cannot be a formula, lookup, rollup, count, record number or time stamp here; add it to a custom table instead.',
                    coalesce(v_label, v_key, 'this field')
      using errcode = '23514',
            hint = 'LANE7-SEC-ARCHIVE: worked-out fields run only through the store''s record doors. Nothing was written.';
  end if;

  -- LANE 10 P4: A COUNT is a roll-up that counts, whatever else it was sent: no `of`, agg count.
  if v_kind = 'count' then
    p_spec := (p_spec - 'of') || jsonb_build_object('agg', 'count');
    v_config := v_config - 'of' - 'agg';
    if coalesce(jsonb_typeof(p_spec -> 'display_format'), 'null') = 'null' then
      p_spec := p_spec || jsonb_build_object('display_format', jsonb_build_object('id', 'integer'));
    end if;
  end if;

  case v_parity
    -- ── the two list types ───────────────────────────────────────────────────
    when 'select', 'multi_select' then
      d := d || jsonb_build_object(
        'type',   'list',
        'multi',  v_parity = 'multi_select',
        'rules',  v_rules,
        'config', v_config || jsonb_build_object(
                    'options_table_id', coalesce(nullif(p_spec ->> 'options_table_id', ''),
                                                nullif(v_config ->> 'options_table_id', ''))));

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
                        'of',  nullif(p_spec ->> 'of', ''),
                        -- CHAIR-MATH (b): WHICH of the linked records it adds up. The same shape a
                        -- saved view's filter has (custom.record_filter_sql: a flat map of far-side
                        -- column keys, or a Rule expression over far-side field ids); validated
                        -- against the far table by custom._field_type_parity_guard on write.
                        -- Carried whenever it was sent (any shape but JSON null): a shape that is
                        -- not a set of conditions is REFUSED by the guard, never dropped here.
                        'filter', case when p_spec ? 'filter' and jsonb_typeof(p_spec -> 'filter') <> 'null'
                                       then p_spec -> 'filter' end)));
    when 'formula' then
      -- ── GRID-PRIMITIVES G3 / G5, 2026-09-22. ────────────────────────────────────────────
      -- A system kind carries its system expression and says which it is; nothing else it
      -- was sent can change what it works out. A formula a person TYPED (`formula_text`, the
      -- older grid's language) is parsed here by custom.formula_parse, against this Table's
      -- own columns; a mistake is refused in the parser's own words with where it is, and
      -- the text is kept beside the expression so the person edits text and never JSON.
      if v_system is not null then
        v_config := (v_config - 'formula_text') || jsonb_build_object('system', v_system);
        d := d || jsonb_build_object(
          'type',       'formula',
          'source',     'formula',
          'compute_on', case when v_system = 'autonumber' then 'write' else 'read' end,
          'rules',      v_rules,
          'config',     v_config || jsonb_build_object('expr', jsonb_build_object('op', 'fx.' || v_system)));
        if coalesce(jsonb_typeof(p_spec -> 'display_format'), 'null') = 'null' then
          p_spec := p_spec || jsonb_build_object('display_format', jsonb_build_object('id', v_system));
        end if;
      else
        if nullif(btrim(coalesce(p_spec ->> 'formula_text', '')), '') is not null then
          v_parsed := custom.formula_parse(p_organization_id, p_table_id, p_spec ->> 'formula_text');
          if not coalesce((v_parsed ->> 'ok')::boolean, false) then
            raise exception 'The formula for "%" cannot be worked out: % (at character %).',
                            v_label, v_parsed ->> 'error', coalesce((v_parsed ->> 'position')::integer, 0) + 1
              using errcode = '23514',
                    hint = 'GRID-PRIMITIVES G3: a formula names columns in braces, like {Visit fee} - {Deposit taken}; select signature, says from custom.formula_node_kinds() lists every function. Nothing was written.';
          end if;
          v_config := v_config || jsonb_build_object('formula_text', p_spec ->> 'formula_text',
                                                     'expr', v_parsed -> 'expr');
        elsif p_spec ? 'expr' then
          -- An expression written by hand no longer matches any text it came with.
          v_config := v_config - 'formula_text';
        end if;
        d := d || jsonb_build_object(
          'type',       'formula',
          'source',     'formula',
          'compute_on', coalesce(nullif(p_spec ->> 'compute_on', ''), 'read'),
          'rules',      v_rules,
          'config',     v_config || jsonb_build_object('expr',
                          coalesce(v_parsed -> 'expr', p_spec -> 'expr', v_config -> 'expr')));
      end if;

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

  -- LANE 10 P4: A STATUS is a single choice whose choices sit in To do, In progress and Done
  -- (custom.status_groups_of keeps one shape: choice key -> group); A COUNT says so in its format.
  if v_kind = 'status' then
    -- V8 #6: a status is one choice at a time; a caller asking for several is told so.
    if coalesce((p_spec ->> 'multi')::boolean, false) then
      raise exception 'A status is one choice at a time, so "%" cannot hold several. Use Several choices for that.', v_label
        using errcode = '23514', hint = 'P4: send multi false, or leave it out. Nothing was created.';
    end if;
    d := d || jsonb_build_object('format', 'status', 'multi', false,
                                 'config', (d -> 'config') || jsonb_build_object('status_groups',
                                   custom.status_groups_of(coalesce(p_spec -> 'status_groups', v_config -> 'status_groups'))));
  elsif v_kind = 'count' then
    d := d || jsonb_build_object('format', 'count');
  end if;

  return custom._with_display_format(custom._with_display(p_organization_id, d, p_spec - 'display_format'), p_spec);
end
$function$

;

CREATE OR REPLACE FUNCTION custom._field_kind_shape_ok(d jsonb, p_label text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_format text := d ->> 'format';
  v_type   text := d ->> 'type';
  v_system text := d -> 'config' ->> 'system';
  v_max    numeric;
  v_min    numeric;
begin
  if v_format = 'rating' then
    if v_type <> 'range' then
      raise exception 'The column "%" shows a rating, and a rating is a number of stars, not %.', p_label, custom.said(v_type, 'nothing')
        using errcode = '23514', hint = 'P4: a rating is behaviour range with format rating. Nothing was written.';
    end if;
    select max((r ->> 'value')::numeric) filter (where r ->> 'kind' = 'max'),
           min((r ->> 'value')::numeric) filter (where r ->> 'kind' = 'min')
      into v_max, v_min
      from jsonb_array_elements(coalesce(d -> 'rules', '[]'::jsonb)) r
     where r ->> 'kind' in ('min', 'max') and (r ->> 'value') ~ '^-?[0-9]+(\.[0-9]+)?$';
    -- A rating with no max Rule is out of 5 (the five rating columns the older grid's importer
    -- wrote carry none, measured on the main database 2026-10-02, and they keep working).
    if v_max is not null and (v_max <> trunc(v_max) or v_max < 1 or v_max > 10) then
      raise exception 'The rating "%" goes up to a whole number of stars from 1 to 10, and it says %.', p_label, v_max
        using errcode = '23514', hint = 'P4: a rating carries a max Rule of 1 to 10 - its top star - or none for 5. Nothing was written.';
    end if;
    if v_min is not null and v_min <> 0 then
      raise exception 'The rating "%" starts at no stars, so its lowest value is 0.', p_label
        using errcode = '23514', hint = 'P4: a rating''s min Rule, when it has one, is 0. Nothing was written.';
    end if;
    if coalesce((d ->> 'multi')::boolean, false) then
      raise exception 'The rating "%" holds one score, never a list.', p_label using errcode = '23514';
    end if;
  elsif v_format = 'duration' then
    if v_type <> 'range' or coalesce(d ->> 'unit', 'seconds') <> 'seconds' then
      raise exception 'The column "%" holds a length of time, and a length of time is a number of seconds.', p_label
        using errcode = '23514', hint = 'P4: a duration is behaviour range, format duration, unit seconds. Nothing was written.';
    end if;
  elsif v_format = 'status' then
    if v_type <> 'list' or coalesce((d ->> 'multi')::boolean, false) then
      raise exception 'The status "%" is one choice at a time, from its own list.', p_label
        using errcode = '23514', hint = 'P4: a status is a list Field that is not multi, with format status. Nothing was written.';
    end if;
    if d -> 'config' ? 'status_groups'
       and (jsonb_typeof(d -> 'config' -> 'status_groups') <> 'object'
            or exists (select 1 from jsonb_each(d -> 'config' -> 'status_groups') g
                        where g.value not in ('"todo"'::jsonb, '"in_progress"'::jsonb, '"done"'::jsonb))) then
      raise exception 'The status "%" puts a choice in a group that is not to do, in progress or done.', p_label
        using errcode = '23514', hint = 'P4: config.status_groups maps a choice key to todo, in_progress or done. Nothing was written.';
    end if;
  elsif v_format in ('address', 'barcode', 'rich_text') then
    if v_type <> 'text' then
      raise exception 'The column "%" holds % and that is kept as words, not %.', p_label,
                      case v_format when 'address' then 'an address' when 'barcode' then 'a barcode' else 'formatted text' end,
                      custom.said(v_type, 'nothing')
        using errcode = '23514', hint = 'P4: address, barcode and rich text are behaviour text with their format. Nothing was written.';
    end if;
    if v_format in ('address', 'rich_text') and coalesce((d ->> 'multi')::boolean, false) then
      raise exception 'The column "%" holds one %, never a list.', p_label,
                      case v_format when 'address' then 'address' else 'piece of text' end
        using errcode = '23514';
    end if;
  elsif v_format = 'count' then
    if v_type <> 'formula' or coalesce(d -> 'config' ->> 'agg', '') <> 'count' then
      raise exception 'The count "%" counts the records it points at, and it is set up to do something else.', p_label
        using errcode = '23514', hint = 'P4: a count is a roll-up whose config.agg is count. Nothing was written.';
    end if;
  end if;

  if d -> 'config' ? 'symbology' and jsonb_typeof(d -> 'config' -> 'symbology') <> 'null' then
    if v_format is distinct from 'barcode' then
      raise exception 'The column "%" is not a barcode, so it has no symbology.', p_label using errcode = '23514';
    end if;
    if not ((d -> 'config' ->> 'symbology') = any (custom.barcode_symbologies())) then
      raise exception 'The barcode "%" says it is %, and a barcode is one of %.', p_label, d -> 'config' ->> 'symbology',
                      array_to_string(custom.barcode_symbologies(), ', ')
        using errcode = '23514', hint = 'P4: leave symbology out to take any code a scanner reads. Nothing was written.';
    end if;
  end if;
  if d -> 'config' ? 'status_groups' and v_format is distinct from 'status' then
    raise exception 'The column "%" is not a status, so it has no groups.', p_label using errcode = '23514';
  end if;

  if v_system in ('created_by', 'modified_by') then
    if v_type <> 'formula' or coalesce(d ->> 'compute_on', '') <> 'read' then
      raise exception 'The column "%" says who % each record, and the store fills that in when it is read.', p_label,
                      case v_system when 'created_by' then 'made' else 'last changed' end
        using errcode = '23514', hint = 'P4: created_by and modified_by are formula Fields worked out on read. Nothing was written.';
    end if;
  end if;
end;
$function$

;

CREATE OR REPLACE FUNCTION custom._kind_value_ok(d jsonb, p_label text, v jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_format text := d ->> 'format';
  v_max    numeric;
  v_text   text;
  v_bad    text;
  v_sym    text;
begin
  if v_format = 'address' then
    if jsonb_typeof(v) <> 'object' then
      raise exception '% takes an address in parts - street, city, region, postal code and country - and it was given %.', p_label,
                      case jsonb_typeof(v) when 'string' then 'one line of words' else 'a ' || jsonb_typeof(v) end
        using errcode = '23514',
              hint = 'P4: {"street": "…", "city": "…", "region": "…", "postal_code": "…", "country": "…"}; every part is optional, at least one is filled.';
    end if;
    select string_agg(k, ', ' order by k) into v_bad
      from jsonb_object_keys(v) k
     where k not in ('street', 'city', 'region', 'postal_code', 'country');
    if v_bad is not null then
      raise exception '% is an address, and an address has no part called %.', p_label, v_bad
        using errcode = '23514', hint = 'P4: the parts are street, city, region, postal_code and country.';
    end if;
    if exists (select 1 from jsonb_each(v) e where jsonb_typeof(e.value) not in ('string', 'null')) then
      raise exception 'Each part of the address in % is words.', p_label using errcode = '23514';
    end if;
    if exists (select 1 from jsonb_each_text(v) e where length(e.value) > 200) then
      raise exception 'A part of the address in % is longer than 200 characters.', p_label using errcode = '23514';
    end if;
    if not exists (select 1 from jsonb_each_text(v) e where btrim(coalesce(e.value, '')) <> '') then
      raise exception '% was given an address with nothing in it.', p_label
        using errcode = '23514', hint = 'P4: leave the value out for no address.';
    end if;
    return true;
  elsif v_format = 'rating' then
    select max((r ->> 'value')::numeric) into v_max
      from jsonb_array_elements(coalesce(d -> 'rules', '[]'::jsonb)) r
     where r ->> 'kind' = 'max' and (r ->> 'value') ~ '^-?[0-9]+(\.[0-9]+)?$';
    if jsonb_typeof(v) <> 'number' or (v #>> '{}')::numeric <> trunc((v #>> '{}')::numeric)
       or (v #>> '{}')::numeric < 0 or (v #>> '{}')::numeric > coalesce(v_max, 5) then
      raise exception '% is a whole number of stars from 0 to %, and it was given %.', p_label, coalesce(v_max, 5),
                      case when jsonb_typeof(v) in ('number', 'string') then v #>> '{}' else 'a ' || jsonb_typeof(v) end
        using errcode = '23514', hint = 'P4: a rating.';
    end if;
    return false;
  elsif v_format = 'duration' then
    if jsonb_typeof(v) = 'number' and (v #>> '{}')::numeric < 0 then
      raise exception '% is a length of time, and a length of time is never below zero.', p_label
        using errcode = '23514', hint = 'P4: a duration is a number of seconds.';
    end if;
    -- Ten years (365.25 days each) is the longest length of time a record here holds.
    if jsonb_typeof(v) = 'number' and (v #>> '{}')::numeric > 315576000 then
      raise exception '% is longer than ten years, and a length of time here is at most ten years.', p_label
        using errcode = '23514', hint = 'P4: a duration is a number of seconds, at most 315576000.';
    end if;
    return false;
  elsif v_format = 'barcode' then
    if jsonb_typeof(v) <> 'string' then
      return false;   -- the text behaviour says "takes words"
    end if;
    v_text := v #>> '{}';
    -- Line and paragraph separators and the invisible format characters (soft hyphen, zero-width
    -- spaces and joiners, direction marks, word joiner, byte-order mark) are no part of a code.
    if btrim(v_text) = '' or v_text ~ '[[:cntrl:]]' or length(v_text) > 256
       or v_text ~ '[\u00AD\u061C\u180E\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]'
       -- V11 #9: tag characters, interlinear annotation marks, a no-break space, combining marks
       -- and private-use characters are no part of a code a scanner reads either.
       or v_text ~ '[\U000E0000-\U000E007F\uFFF9-\uFFFB\u00A0\u0300-\u036F\u1AB0-\u1AFF\u1DC0-\u1DFF\u20D0-\u20FF\uFE20-\uFE2F\uE000-\uF8FF\U000F0000-\U0010FFFF]' then
      raise exception '% is a barcode: one line of up to 256 characters a scanner reads, with no line breaks or hidden characters.', p_label
        using errcode = '23514', hint = 'P4: a barcode.';
    end if;
    v_sym := d -> 'config' ->> 'symbology';
    if v_sym in ('ean13', 'ean8', 'upc_a') then
      if v_text !~ (case v_sym when 'ean13' then '^[0-9]{13}$' when 'ean8' then '^[0-9]{8}$' else '^[0-9]{12}$' end) then
        raise exception '% is a % barcode, which is % digits, and "%" is not.', p_label,
                        case v_sym when 'ean13' then 'EAN-13' when 'ean8' then 'EAN-8' else 'UPC-A' end,
                        case v_sym when 'ean13' then 13 when 'ean8' then 8 else 12 end, v_text
          using errcode = '23514', hint = 'P4: a barcode.';
      end if;
      if not custom._gs1_check_ok(v_text) then
        raise exception 'The last digit of "%" does not check out, so % was probably misread or mistyped.', v_text, p_label
          using errcode = '23514', hint = 'P4: EAN and UPC codes end in a check digit.';
      end if;
    end if;
    return false;
  elsif v_format = 'rich_text' then
    if jsonb_typeof(v) <> 'string' then
      return false;
    end if;
    v_text := v #>> '{}';
    -- THE SANITISED SUBSET (custom._rich_text_problem, read the CommonMark way): Markdown with no
    -- raw HTML and links only to a web page, an email address or a phone number. Refused rather
    -- than stripped, so what is stored is exactly what was written.
    v_bad := custom._rich_text_problem(v_text);
    if v_bad = 'html' then
      raise exception '% keeps formatted text as Markdown, and it was given HTML.', p_label
        using errcode = '23514', hint = 'P4: write **bold**, _italic_, [a link](https://…), - lists and # headings.';
    end if;
    if v_bad = 'link' then
      raise exception '% has a link that is not a web page, an email address or a phone number.', p_label
        using errcode = '23514', hint = 'P4: links start with https://, http://, mailto: or tel:.';
    end if;
    return false;
  end if;
  return false;
end;
$function$

;

CREATE OR REPLACE FUNCTION custom._automation_fire()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  c_depth_max constant integer := 3;
  r         record;
  v_doc     jsonb;
  v_a       jsonb;
  v_spec    jsonb;
  v_trig    jsonb;
  v_on      text;
  v_kind    text;
  v_via     text;
  v_depth   integer := coalesce(nullif(current_setting('custom.automation_depth', true), '')::integer, 0);
  v_match   boolean;
  v_values  jsonb;
  v_byid    jsonb;
  v_ctx     jsonb;
  v_fields  jsonb;
  v_tfields jsonb;
  v_act     jsonb;
  v_n       integer;
  v_steps   jsonb;
  v_status  text;
  v_says    text;
  v_stepsay text;
  v_started timestamptz;
  v_me      uuid := custom.query_principal();
  v_patch   jsonb;
  k         text;
  v         jsonb;
  v_field   jsonb;
  v_rid     uuid;
  v_cand    uuid;
  v_cnt     integer;
  v_scan    integer;
  v_to      uuid;
  v_text    text;
  v_msg     text;
  v_hint    text;
  v_body    text;
  v_res     jsonb;
  v_run     uuid;
begin
  for r in select o.* from new_rows o
            where o.event_key = 'records.changed' and o.table_id is not null
              and o.operation in ('created', 'updated') and o.deleted_at is null loop
    select t.data -> 'automations' into v_doc from custom.record t
     where t.organization_id = r.organization_id and t.id = r.table_id and t.data_class = 'table';
    continue when v_doc is null or jsonb_typeof(v_doc) <> 'array';

    -- NO AUTOMATION MAY REFUSE A PERSON'S WRITE: anything unforeseen below is a warning, and only this change's
    -- automations are rolled back with it. (Only a Table that HAS automations pays for the sub-transaction.)
    begin
    v_kind := r.metadata -> 'change' ->> 'kind';
    v_via  := r.metadata -> 'change' ->> 'via';
    v_values := null;

    for v_a in select e from jsonb_array_elements(v_doc) e loop
      continue when (v_a ->> 'archived_at') is not null or not coalesce((v_a ->> 'enabled')::boolean, false);
      v_spec := v_a -> 'spec';
      v_trig := v_spec -> 'trigger';
      v_on := v_trig ->> 'on';
      v_match := case
        when v_on = 'row_added' then r.operation = 'created' and coalesce(v_kind, 'create') = 'create'
        when v_on = 'form_answered' then r.operation = 'created' and coalesce(v_kind, 'create') = 'create' and v_via = 'form'
        when v_on = 'property_edited' then r.operation = 'updated' and r.changed_field_ids ? (v_trig ->> 'field')
        else false end;
      continue when not v_match;

      if v_values is null then
        v_values := custom.record_values(r.organization_id, r.record_id);
        v_ctx := coalesce(custom.rule_context(r.organization_id, r.record_id), '{}'::jsonb)
                 || jsonb_build_object('fx_self_id', r.record_id, 'fx_table_id', r.table_id);
        -- record_values is keyed by the Field's KEY; a spec names Fields by ID (REC-17), so read it both ways.
        if v_values is not null then
          v_fields := custom._automation_fields(r.organization_id, r.table_id);
          select coalesce(jsonb_object_agg(f.key, coalesce(v_values -> (f.value ->> 'key'), 'null'::jsonb)), '{}'::jsonb)
            into v_byid from jsonb_each(v_fields) f;
        end if;
      end if;
      continue when v_values is null;

      if v_on = 'property_edited' and v_trig ? 'to'
         and lower(btrim(coalesce((v_byid -> (v_trig ->> 'field')) #>> '{}', '')))
             is distinct from lower(btrim(coalesce((v_trig -> 'to') #>> '{}', ''))) then
        continue;
      end if;
      if v_spec -> 'condition' is not null and jsonb_typeof(v_spec -> 'condition') = 'object' then
        begin
          continue when not custom._fx_truthy(custom.rule_eval(r.organization_id,
                           custom._automation_bind(v_spec -> 'condition', v_byid), v_values, v_ctx));
        exception when others then
          null;  -- a condition that cannot be worked out is a failed run, written below
        end;
      end if;

      v_started := clock_timestamp();
      v_steps := '[]'::jsonb;
      v_status := 'ran';
      v_says := 'Every step finished.';
      v_n := 0;

      if v_depth >= c_depth_max then
        v_status := 'stopped';
        v_says := format('Stopped after %s rounds: this automation keeps changing the record that starts it.', c_depth_max);
      else
        perform set_config('custom.automation_depth', (v_depth + 1)::text, true);
        for v_act in select e from jsonb_array_elements(v_spec -> 'actions') e loop
          v_n := v_n + 1;
          v_stepsay := null;
          begin
            if v_act ->> 'do' = 'set' then
              v_patch := '{}'::jsonb;
              for k, v in select key, value from jsonb_each(v_act -> 'values') loop
                v_field := v_fields -> k;
                if v_field is null then
                  raise exception 'A property this step sets is gone, so it cannot run until it is edited.' using errcode = '23503';
                end if;
                v_patch := v_patch || jsonb_build_object(v_field ->> 'key',
                             custom._action_coerce(v_field, custom._automation_value(v, v_byid, v_me), r.organization_id));
              end loop;
              perform custom.record_update(r.organization_id, r.record_id, v_patch);
              v_stepsay := 'Set ' || (select string_agg(f.value ->> 'label', ', ') from jsonb_each(v_fields) f
                                       where (v_act -> 'values') ? f.key) || ' on this row.';

            elsif v_act ->> 'do' = 'add_row' then
              v_tfields := custom._automation_fields(r.organization_id, (v_act ->> 'table_id')::uuid);
              v_patch := '{}'::jsonb;
              for k, v in select key, value from jsonb_each(v_act -> 'values') loop
                v_field := v_tfields -> k;
                if v_field is null then
                  raise exception 'A property this step sets is gone, so it cannot run until it is edited.' using errcode = '23503';
                end if;
                v_patch := v_patch || jsonb_build_object(v_field ->> 'key',
                             custom._action_coerce(v_field, custom._automation_value(v, v_byid, v_me), r.organization_id));
              end loop;
              v_rid := custom.record_write(r.organization_id, (v_act ->> 'table_id')::uuid, v_patch);
              v_stepsay := 'Added a row to the other table.';
              v_steps := v_steps || jsonb_build_array(jsonb_build_object('n', v_n, 'do', 'add_row', 'status', 'done',
                           'says', v_stepsay, 'record_id', v_rid));
              continue;

            elsif v_act ->> 'do' = 'edit_rows' then
              v_tfields := custom._automation_fields(r.organization_id, (v_act ->> 'table_id')::uuid);
              v_cnt := 0;
              v_scan := 0;
              for v_cand in select x.id from custom.record x
                             where x.organization_id = r.organization_id and x.table_id = (v_act ->> 'table_id')::uuid
                               and x.data_class = 'record' and x.deleted_at is null
                             order by x.created_at limit 2000 loop
                v_scan := v_scan + 1;
                exit when v_cnt >= coalesce((v_act ->> 'limit')::integer, 100);
                v_res := custom.record_values(r.organization_id, v_cand);
                if custom._fx_truthy(custom.rule_eval(r.organization_id,
                     custom._automation_bind(v_act -> 'where', v_byid), v_res,
                     coalesce(custom.rule_context(r.organization_id, v_cand), '{}'::jsonb)
                       || jsonb_build_object('fx_self_id', v_cand, 'fx_table_id', (v_act ->> 'table_id')::uuid))) then
                  v_patch := '{}'::jsonb;
                  for k, v in select key, value from jsonb_each(v_act -> 'values') loop
                    v_field := v_tfields -> k;
                    if v_field is null then
                      raise exception 'A property this step sets is gone, so it cannot run until it is edited.' using errcode = '23503';
                    end if;
                    v_patch := v_patch || jsonb_build_object(v_field ->> 'key',
                                 custom._action_coerce(v_field, custom._automation_value(v, v_byid, v_me), r.organization_id));
                  end loop;
                  perform custom.record_update(r.organization_id, v_cand, v_patch);
                  v_cnt := v_cnt + 1;
                end if;
              end loop;
              v_stepsay := format('Edited %s row%s in the other table.', v_cnt, case when v_cnt = 1 then '' else 's' end);
              v_steps := v_steps || jsonb_build_array(jsonb_build_object('n', v_n, 'do', 'edit_rows', 'status', 'done',
                           'says', v_stepsay, 'edited', v_cnt));
              continue;

            elsif v_act ->> 'do' = 'notify' then
              v_to := case
                when v_act -> 'to' ? 'person' then (v_act -> 'to' ->> 'person')::uuid
                when v_act -> 'to' ? 'field' then case when (v_byid ->> (v_act -> 'to' ->> 'field'))
                       ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                       then (v_byid ->> (v_act -> 'to' ->> 'field'))::uuid end
                else nullif(v_a ->> 'created_by', '')::uuid end;
              if v_to is null then
                raise exception 'There is no person to tell: the property is empty on this row.' using errcode = '22023';
              end if;
              if not iam.is_org_member(v_to, r.organization_id) then
                raise exception 'That person is not a member of this organization.' using errcode = '22023';
              end if;
              v_text := v_act ->> 'text';
              for k, v in select key, value from jsonb_each(v_byid) loop
                v_text := replace(v_text, '{{' || k || '}}',
                            case when jsonb_typeof(v) = 'string' then v #>> '{}' when v is null or jsonb_typeof(v) = 'null' then '' else v::text end);
              end loop;
              v_res := communication.notify_from_sql(r.organization_id, 'records.changed', v_to, null, null,
                         jsonb_build_object('notice', jsonb_build_object('body', v_text, 'subject', v_spec ->> 'name')),
                         null, 'custom.record', r.record_id,
                         'automation:' || (v_a ->> 'id') || ':' || r.id::text || ':' || v_n::text);
              v_stepsay := coalesce(v_res ->> 'say', 'Told them.');

            elsif v_act ->> 'do' = 'webhook' then
              if not coalesce(files.is_safe_webhook_url(v_act ->> 'url'), false) then
                raise exception 'That webhook address is not a public https address any more, so nothing was sent.' using errcode = '22023';
              end if;
              perform net.http_post(url := v_act ->> 'url',
                        body := jsonb_build_object('event', 'automation.fired', 'automation_id', v_a ->> 'id',
                                  'automation', v_spec ->> 'name', 'table_id', r.table_id, 'record_id', r.record_id,
                                  'operation', r.operation, 'changed_field_ids', r.changed_field_ids),
                        headers := '{"Content-Type": "application/json"}'::jsonb);
              v_stepsay := 'Sent the webhook.';

            elsif v_act ->> 'do' = 'agent' then
              v_steps := v_steps || jsonb_build_array(jsonb_build_object('n', v_n, 'do', 'agent', 'status', 'waiting',
                           'says', 'Waiting for a person: an agent''s changes are confirmed by a person. Open this record''s chat to ask it.',
                           'prompt', v_act ->> 'prompt'));
              if v_status = 'ran' then
                v_status := 'waiting';
                v_says := 'Waiting for a person to run the agent step.';
              end if;
              continue;
            end if;
            v_steps := v_steps || jsonb_build_array(jsonb_build_object('n', v_n, 'do', v_act ->> 'do', 'status', 'done', 'says', v_stepsay));
          exception when others then
            get stacked diagnostics v_msg = message_text, v_hint = pg_exception_hint;
            v_steps := v_steps || jsonb_build_array(jsonb_build_object('n', v_n, 'do', v_act ->> 'do', 'status', 'failed',
                         'says', v_msg, 'hint', v_hint));
            v_status := 'failed';
            v_says := format('Step %s did not run: %s', v_n, v_msg);
            exit;
          end;
        end loop;
        perform set_config('custom.automation_depth', v_depth::text, true);
      end if;

      insert into custom.record (organization_id, table_id, data_class, data)
      values (r.organization_id, null, 'automation_run', jsonb_build_object(
                'automation_id', v_a ->> 'id', 'automation', v_spec ->> 'name', 'table_id', r.table_id,
                'record_id', r.record_id, 'change_id', r.id, 'status', v_status, 'says', v_says,
                'trigger', jsonb_build_object('on', v_on, 'operation', r.operation, 'via', v_via,
                                              'changed_field_ids', r.changed_field_ids),
                'steps', v_steps, 'ran_by', v_me,
                'started_at', v_started, 'finished_at', clock_timestamp()))
      returning id into v_run;
    end loop;
    exception when others then
      perform set_config('custom.automation_depth', v_depth::text, true);
      raise warning 'custom._automation_fire: % (%): %', r.table_id, sqlstate, sqlerrm;
    end;
  end loop;
  return null;
end
$function$

;

CREATE OR REPLACE FUNCTION custom.validate_values(p_organization_id uuid, p_fields custom.record[], p_values jsonb, p_record_type text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  f        custom.record;
  d        jsonb;
  v_label  text;
  v_key    text;
  v_type   text;
  v_multi  boolean;
  v_val    jsonb;
  v_one    jsonb;
  v_items  jsonb;
  v_n      integer;
  v_rule   jsonb;
  v_kind   text;
  v_other  jsonb;
  v_table  uuid;
  v_map    jsonb;
  v_field  jsonb;
  v_types  text[];
begin
  if p_fields is null or array_length(p_fields, 1) is null then
    return;
  end if;

  -- CHOICE-VALUE. The type field's value is the option's KEY now, and `applies_to_types` was
  -- written by whoever declared the Field or the Rule - in words, in keys, or (before this
  -- lane) in option ids. All three name the same choice, so all three are asked. This is what
  -- keeps T8's Square rule attached to the square.
  -- THE MAP IS BUILT FROM THE FIELDS THEMSELVES, not from a Table id. MEASURED 2026-09-20
  -- 07:27Z: the fields of a STANDARD entity's `custom_fields` (REC-40) carry `table_token` and
  -- no `entity_definition_id` at all, so asking `custom.choice_field_map` for a Table produced
  -- an empty map and every valid choice on `crm.party` was refused. Each list Field already
  -- names the Table its choices come from; that is the only thing this needs.
  select coalesce(jsonb_object_agg(f2.data ->> 'key', jsonb_build_object(
           'label',   coalesce(nullif(f2.data ->> 'label', ''), f2.data ->> 'key'),
           'options', custom.choice_options(p_organization_id,
                        (f2.data -> 'config' ->> 'options_table_id')::uuid))), '{}'::jsonb)
    into v_map
    from unnest(p_fields) f2
   where f2.data ->> 'type' = 'list'
     and nullif(f2.data -> 'config' ->> 'options_table_id', '') is not null;

  v_types := case when p_record_type is null then '{}'::text[]
                  else custom.choice_synonyms_in(v_map, p_record_type) end;

  foreach f in array p_fields loop
    d       := f.data;
    v_key   := d ->> 'key';
    v_label := coalesce(nullif(d ->> 'label', ''), v_key);
    v_type  := d ->> 'type';
    v_multi := coalesce((d ->> 'multi')::boolean, false);
    v_val   := p_values -> v_key;

    -- REQUIRED. An absent key and a null value are the same absence and are said the same way.
    if v_val is null or jsonb_typeof(v_val) = 'null'
       or (v_multi and jsonb_typeof(v_val) = 'array' and jsonb_array_length(v_val) = 0) then
      -- A RESTORE IS NOT AN EDIT (TABLE-ACTIONS ruling, 2026-10-03): a row brought back exactly as
      -- it was archived is never refused by a `required` declared after it went (a bookings page's
      -- "Appointment"); custom._record_field_validation names that write in custom.validating_restore.
      -- V11 #1: TURNING "REQUIRED" ON NEVER LOCKS A RECORD. A record that already had no value
      -- here when this write began is not refused for it — that blank is not this write's doing,
      -- and the record stays editable; a NEW record, or a write that clears the value, still is.
      if coalesce((d ->> 'required')::boolean, false)
         and coalesce(current_setting('custom.validating_restore', true), '') <> '1'
         and not (nullif(current_setting('custom.validating_record', true), '') is not null
                  and exists (select 1 from custom.record s
                               where s.organization_id = p_organization_id
                                 and s.id = nullif(current_setting('custom.validating_record', true), '')::uuid
                                 and (s.data -> v_key is null or jsonb_typeof(s.data -> v_key) = 'null'
                                      or (jsonb_typeof(s.data -> v_key) = 'array' and jsonb_array_length(s.data -> v_key) = 0)))) then
        raise exception '% is required', v_label
          using errcode = '23514', hint = format('REC-51: the field %s of this table.', v_key);
      end if;
      continue;
    end if;

    -- A FORMULA IS NEVER WRITTEN BY HAND (FLD-9): the declaration says who computes it.
    if v_type = 'formula' then
      raise exception '% is worked out by the system, so it cannot be typed in', v_label
        using errcode = '23514',
              hint = format('FLD-9: this formula computes on %s.', coalesce(d ->> 'compute_on', 'write'));
    end if;

    -- A RELATION'S CARDINALITY IS `relation_max`, AND ONE TARGET IS A LIST OF ONE (REL-7,
    -- lane STORE-TXN-3 2026-09-22). FLD-2's `multi` and FLD-13's `relation_max` are two words
    -- for one fact and the store let them disagree: `custom._field_document_for` DERIVES
    -- relation_max from multi but never the reverse, so a caller that declared
    -- `relation_max: 50` and said nothing about multi got a column whose declaration reads
    -- "many" (`platform.relation_declaration` answers cardinality `many` off relation_max) and
    -- whose value shape was refused as "holds one value, and it was given a list". Measured
    -- 2026-09-22 on the field `matrx_records`' own `field_propose` declares for the keyword
    -- research graph. REL-7 already settles it in words — *"a relation points at at most one
    -- thing, or at many — both are written as a list, so the shape never has to change when
    -- the cardinality does. One target is a list of one."* — so for a relation the shape is
    -- read here, a scalar is a list of one, and the CEILING below is the only limit.
    if v_type = 'relation' then
      v_items := case when jsonb_typeof(v_val) = 'array'
                      then v_val else jsonb_build_array(v_val) end;
    elsif v_multi then
      if jsonb_typeof(v_val) <> 'array' then
        raise exception '% holds many values, so it takes a list', v_label
          using errcode = '23514', hint = 'FLD-2: the multi modifier.';
      end if;
      v_items := v_val;
    else
      if jsonb_typeof(v_val) = 'array' then
        raise exception '% holds one value, and it was given a list', v_label
          using errcode = '23514', hint = 'FLD-2: multi is off for this field.';
      end if;
      v_items := jsonb_build_array(v_val);
    end if;

    for v_one in select e from jsonb_array_elements(v_items) e loop
      -- LANE 10 P4: a value of one of the newer kinds is judged by its kind first. An address is
      -- judged whole (it is a set of parts, not words); the others go on to their behaviour's
      -- check and their Rules below.
      -- NOTION-PROPS-2: a button is pressed, never written, so any value it is given is refused there.
      if (d ->> 'format') in ('address', 'rating', 'duration', 'barcode', 'rich_text', 'button')
         and custom._kind_value_ok(d, v_label, v_one) then
        continue;
      end if;
      -- TYPE.
      if v_type = 'boolean' then
        -- LIMITS-FIX: a tick is a REAL boolean. A record that never answered carries no key
        -- at all and left through the absence branch above, so `false` arriving here is a
        -- person SAYING no — a different fact from never having been asked, and the store
        -- keeps the two apart rather than flattening them into one empty box.
        if jsonb_typeof(v_one) <> 'boolean' then
          raise exception '% is ticked or left unticked, and it was given a %', v_label, jsonb_typeof(v_one)
            using errcode = '23514',
                  hint = 'FLD-1: boolean. Write true or false. The WORDS "Yes" and "No" are a choice list, which is a different kind of column.';
        end if;
      elsif v_type = 'text' then
        if jsonb_typeof(v_one) <> 'string' then
          raise exception '% takes words, and it was given a %', v_label, jsonb_typeof(v_one)
            using errcode = '23514', hint = 'FLD-1: text.';
        end if;
      elsif v_type = 'range' then
        if jsonb_typeof(v_one) = 'number' then
          null;
        elsif jsonb_typeof(v_one) = 'string'
              and coalesce(d -> 'config' ->> 'kind', 'number') in ('date', 'datetime') then
          begin
            perform (v_one #>> '{}')::timestamptz;
          exception when others then
            raise exception '% takes a date, and % is not one', v_label, v_one #>> '{}'
              using errcode = '23514', hint = 'FLD-1: range, of kind date.';
          end;
        else
          raise exception '% takes a number, and it was given a %', v_label, jsonb_typeof(v_one)
            using errcode = '23514', hint = 'FLD-1: range.';
        end if;
      elsif v_type = 'list' then
        if jsonb_typeof(v_one) <> 'string' then
          raise exception '% takes one of its choices, and it was given a %', v_label, jsonb_typeof(v_one)
            using errcode = '23514',
                  hint = 'FLD-5 / FLD-6: a list field stores the option''s own KEY - a short stable word - because every pick-list is already a Table.';
        end if;
        -- OPTION MEMBERSHIP. The value is the KEY of an option of this Field's own Table.
        -- A RETIRED option's key passes here ON PURPOSE: a record that already holds one has
        -- to stay editable when somebody changes a different column. Picking a retired choice
        -- ANEW is refused by custom._resolve_choice_words, which is the only place that can
        -- tell a new pick from a value that was already there.
        -- A TOKEN THAT NAMES ONE OF THE CHOICES. The KEY is the contract and is what
        -- `custom._resolve_choice_words` stores; the label and the option's own id are
        -- accepted too, because a surface with no normaliser in front of it (a standard
        -- entity's `custom_fields`) writes what its caller sent and must not be refused for
        -- naming the right choice a different way.
        v_field := v_map -> v_key;
        -- LIST-COPY-PERMISSIVE (2026-09-26): a column that takes other values
        -- (`config.allow_other`) holds a word that is none of its choices as an other value;
        -- custom._resolve_choice_words keeps it as typed, and it passes here.
        if v_field is null
           or (custom.choice_key_of(v_field, v_one #>> '{}') is null
               and not coalesce((d -> 'config' ->> 'allow_other')::boolean, false)) then
          raise exception '% was given a choice that is not one of its choices', v_label
            using errcode = '23514',
                  hint = format('REC-51: option membership. The choices for %s are %s.', v_label,
                                coalesce(custom.choice_words(coalesce(v_field, '{}'::jsonb)),
                                         'the records of its own table, and it has none yet'));
        end if;
      elsif v_type = 'relation'
            and jsonb_typeof(d -> 'config' -> 'allowed_types') = 'array'
            and jsonb_array_length(d -> 'config' -> 'allowed_types') > 0 then
        -- ── SC-R / P12: AN ENTITY REFERENCE. Each value is {token, id}: which kind of platform
        -- thing, and which one. The kind is one this Field allows; the thing is live and the
        -- writer may open it (custom._entity_reference_target_ok, the relation rule asked of a
        -- platform entity). Missing and forbidden say the same sentence.
        if jsonb_typeof(v_one) <> 'object'
           or nullif(btrim(coalesce(v_one ->> 'token', '')), '') is null
           or coalesce(v_one ->> 'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          raise exception '% points at something on the platform, and it was given %', v_label,
                          case when jsonb_typeof(v_one) = 'object' then 'something with no kind or no id'
                               else 'a ' || jsonb_typeof(v_one) end
            using errcode = '23514',
                  hint = format('SC-R / P12: each value of %s is {"token": "<kind>", "id": "<uuid>"} — the kind is one of %s.',
                                v_label, (select string_agg(x #>> '{}', ', ') from jsonb_array_elements(d -> 'config' -> 'allowed_types') x));
        end if;
        if not ((d -> 'config' -> 'allowed_types') ? lower(btrim(v_one ->> 'token'))) then
          raise exception '% points at %, and it can only point at %', v_label,
                          coalesce((select e.label from platform.entity_types e where e.token = lower(btrim(v_one ->> 'token'))),
                                   v_one ->> 'token'),
                          (select string_agg(coalesce(e.label, x #>> '{}'), ', ' order by o)
                             from jsonb_array_elements(d -> 'config' -> 'allowed_types') with ordinality as a(x, o)
                             left join platform.entity_types e on e.token = x #>> '{}')
            using errcode = '23514',
                  hint = 'SC-R / P12: config.allowed_types is what this column may name. Point it at one of those, or widen the column.';
        end if;
        if not custom._entity_reference_target_ok(p_organization_id, lower(btrim(v_one ->> 'token')), (v_one ->> 'id')::uuid) then
          raise exception '% points at something that is not there', v_label
            using errcode = '23514',
                  hint = 'SC-R / P12 / REC-51: an entity reference points at a live thing the person writing it may open. It was deleted, it never existed, or it has not been shared with you.';
        end if;
        continue;   -- an entity reference carries no value Rules; its ceiling is asked below
      elsif v_type = 'relation' then
        if jsonb_typeof(v_one) <> 'string' then
          raise exception '% points at a record, and it was given a %', v_label, jsonb_typeof(v_one)
            using errcode = '23514', hint = 'FLD-1: relation.';
        end if;
        -- RELATION RULES. The target is a live record the relation's DECLARATION allows —
        -- `custom.relation_value_target_ok`, which asks what platform.enforce_relation_edge
        -- asks of the association beside it: the declared table (or `several`'s list, or
        -- `any`), and another organization only through the REC-29 opening both have made.
        -- The id SHAPE first, for the same reason as the list branch above.
        if (v_one #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          raise exception '% points at something that is not there', v_label
            using errcode = '23514',
                  hint = format('REC-51: %s stores the id of a record, and what it was given is not an id at all.', v_label);
        end if;
        if not custom.relation_value_target_ok(p_organization_id, f.id, d, (v_one #>> '{}')::uuid)
           -- A REFERENCE KEPT ON AN ARCHIVED RECORD (lane REFERENCE-KEEPS-ARCHIVED, chair ruling B3-21,
           -- 2026-10-01). An archive keeps every pointer at what it archived, so a record may hold one
           -- while its target sits in Archived items. That pointer is not a new link: when the row
           -- being changed (custom._record_field_validation names it) ALREADY holds this id under this
           -- key and the target is an archived record of this organization, the value stands, and the
           -- rest of the record stays editable. A NEW pointer at an archived record is still refused.
           and not (
             nullif(current_setting('custom.validating_record', true), '') is not null
             and exists (select 1 from custom.record t
                          where t.organization_id = p_organization_id
                            and t.id = (v_one #>> '{}')::uuid
                            and t.deleted_at is not null)
             and exists (select 1 from custom.record s
                          where s.organization_id = p_organization_id
                            and s.id = nullif(current_setting('custom.validating_record', true), '')::uuid
                            and (s.data -> v_key = v_one
                                 or (jsonb_typeof(s.data -> v_key) = 'array'
                                     and s.data -> v_key @> jsonb_build_array(v_one)))))
           -- A POINTER MOVED IN FROM THE OLD STORE AT A RECORD THAT IS NOW ARCHIVED (CHAIR-DOORS-3A,
           -- asked by lane 9, scopes-b ruling 1). References survive an archive: the old scope value
           -- named a scope that was archived afterwards, and a copy that lands the value AFTER the
           -- archive is not making a new link, it is carrying one that existed. So when this key's
           -- value envelope names a source of kind `move` (the copy's own provenance, interned in
           -- the record's `_sources`), a pointer at an ARCHIVED record of this organization, in the
           -- one table this relation points at, stands. A person's write carries no such source and is
           -- refused a new pointer at an archived record exactly as before.
           and not (
             -- the source as the writer handed it (an object), or as the store interned it (a pointer)
             -- (coalesced to false: with no envelope at all this must be FALSE, never NULL, or the
             --  whole refusal below would be skipped by three-valued logic)
             coalesce(coalesce(case when jsonb_typeof(p_values -> '_values' -> v_key -> 'src') = 'object'
                                    then p_values -> '_values' -> v_key -> 'src' ->> 'kind' end,
                               p_values -> '_sources' -> (p_values -> '_values' -> v_key ->> 'src') ->> 'kind') = 'move',
                      false)
             and exists (select 1 from custom.record t
                          where t.organization_id = p_organization_id
                            and t.id = (v_one #>> '{}')::uuid
                            and t.deleted_at is not null
                            and t.table_id = nullif(d ->> 'relation_target', '')::uuid)) then
          raise exception '% points at something that is not there', v_label
            using errcode = '23514',
                  hint = 'REC-51 / REL-8 / REC-29: a relation field points at a live record of a table it declares — or, across organizations, only where the table allows it and both organizations have turned on links to other organizations.';
        end if;
      end if;

      -- FLD-3: the attached validation Rules, read through the ONE seam.
      -- FLD-10 says the type field selects which Fields AND RULES apply, so a Rule carries
      -- its own applies_to_types: T8's Width applies to a rectangle and to a square, and the
      -- "the sides are equal" Rule attached to it applies to the SQUARE alone. A Rule with an
      -- empty list applies wherever its Field does.
      -- A RESTORE IS NOT AN EDIT: the value rules (at least, at most, length, pattern…) judge what a
      -- write changes; a row brought back exactly as it was is not judged by them again.
      for v_rule in select r from jsonb_array_elements(coalesce(d -> 'rules', '[]'::jsonb)) r
                     where coalesce(current_setting('custom.validating_restore', true), '') <> '1' loop
        if jsonb_array_length(coalesce(v_rule -> 'applies_to_types', '[]'::jsonb)) > 0
           and not (p_record_type is not null and (v_rule -> 'applies_to_types') ?| v_types) then
          continue;
        end if;
        v_kind := v_rule ->> 'kind';
        if v_kind = 'min' and jsonb_typeof(v_one) = 'number'
           and (v_one #>> '{}')::numeric < (v_rule ->> 'value')::numeric then
          raise exception '% has to be at least %', v_label, v_rule ->> 'value'
            using errcode = '23514', hint = 'FLD-3: an attached validation Rule, not a behavior.';
        elsif v_kind = 'max' and jsonb_typeof(v_one) = 'number'
              and (v_one #>> '{}')::numeric > (v_rule ->> 'value')::numeric then
          raise exception '% cannot be more than %', v_label, v_rule ->> 'value'
            using errcode = '23514', hint = 'FLD-3: an attached validation Rule, not a behavior.';
        elsif v_kind = 'length' and jsonb_typeof(v_one) = 'string'
              and coalesce(v_rule ->> 'value', '') <> ''
              and length(v_one #>> '{}') > (v_rule ->> 'value')::integer then
          raise exception '% is longer than % characters', v_label, v_rule ->> 'value'
            using errcode = '23514', hint = 'FLD-3.';
        -- STORE-RULE-GAPS (3): the SHORTEST, beside the longest. An empty string is a blank,
        -- not a short answer - whether a blank is allowed is `required`'s question, as it
        -- was in the older grid, so it is not asked twice.
        elsif v_kind = 'length' and jsonb_typeof(v_one) = 'string'
              and coalesce(v_rule ->> 'min', '') <> ''
              and (v_one #>> '{}') <> ''
              and length(v_one #>> '{}') < (v_rule ->> 'min')::integer then
          raise exception '% has to be at least % characters long', v_label, v_rule ->> 'min'
            using errcode = '23514', hint = 'FLD-3.',
                  detail = jsonb_build_object('field_key', v_key, 'rule', 'length',
                                              'min', (v_rule ->> 'min')::integer)::text;
        -- STORE-RULE-GAPS (1): a pattern that carries an example SAYS it — the remedy is the
        -- shape a person should type, and the example travels in `detail` as well so the one
        -- refusal builder reads it as data rather than fishing it out of a sentence.
        elsif v_kind = 'pattern' and jsonb_typeof(v_one) = 'string'
              and (v_one #>> '{}') !~ (v_rule ->> 'value') then
          if coalesce(btrim(v_rule ->> 'example'), '') <> '' then
            raise exception '% is not written the way this field expects', v_label
              using errcode = '23514',
                    hint = format('Enter it like %s.', btrim(v_rule ->> 'example')),
                    detail = jsonb_build_object('field_key', v_key, 'rule', 'pattern',
                                                'example', btrim(v_rule ->> 'example'))::text;
          end if;
          raise exception '% is not written the way this field expects', v_label
            using errcode = '23514', hint = 'FLD-3.';
        elsif v_kind = 'equals_field' then
          v_other := p_values -> (v_rule ->> 'value');
          if v_other is not null and jsonb_typeof(v_other) <> 'null' and v_other <> v_one then
            raise exception '% and % have to be the same', v_label, v_rule ->> 'value'
              using errcode = '23514',
                    hint = 'FLD-3 / T8: a constraint across two fields is a Rule attached to one of them, never a behavior.';
          end if;
        elsif v_kind = 'differs_from_field' then
          v_other := p_values -> (v_rule ->> 'value');
          if v_other is not null and v_other = v_one then
            raise exception '% and % have to be different', v_label, v_rule ->> 'value'
              using errcode = '23514', hint = 'FLD-3.';
          end if;
        end if;
      end loop;
    end loop;

    -- RELATION MAX, once per field rather than once per item. Asked of EVERY relation now,
    -- not only of the ones that also said `multi`: it is the cardinality, so a single relation
    -- handed two targets is refused here by the column's own name rather than being let
    -- through because a second word was missing.
    if v_type = 'relation' then
      v_n := jsonb_array_length(v_items);
      if v_n > coalesce((d ->> 'relation_max')::integer, v_n) then
        raise exception '% points at % things, and it can point at % at most',
                        v_label, v_n, d ->> 'relation_max'
          using errcode = '23514', hint = 'REC-51: relation_max.';
      end if;
    end if;
  end loop;
end;
$function$

;

delete from platform.client_callable_door where schema_name = 'custom' and function_name in ('button_press', '_automation_run');
drop function if exists custom.button_press(uuid, uuid, uuid);
drop function if exists custom._automation_run(uuid, uuid, uuid, jsonb, jsonb, jsonb, uuid, jsonb);
