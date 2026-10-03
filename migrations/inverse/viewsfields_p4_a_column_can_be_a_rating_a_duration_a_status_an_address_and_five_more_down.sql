-- lock: custom
-- lane: VIEWS-AND-FIELDS
-- based-on: custom._duration_seconds_of(text) 90df73341eaa6aa3d5a514671a3ce5836d6373fe9bc0c423e8a0bec0658615cf
-- based-on: custom._entity_decoded(text) 04c788810b3760ecfc59f4711913b022672d42be36ad196f8a6cc439dabc724f
-- based-on: custom._field_document_for(uuid, uuid, jsonb) fca1ff470b45414214e20cc39a0f41c4c1e12e2edceeadc6a4a8d4ecb7fe9682
-- based-on: custom._field_kind_shape_ok(jsonb, text) 8ca01d8184666edf1c93c79d7e3c3865d0558967b228d2515448279c7bc0aaf6
-- based-on: custom._field_type_parity_guard() 9c8700dbbcbc6d4e3ba5d70bc3dac26b3357141faefec3e1376066178367781e
-- based-on: custom._field_value_carry(uuid, jsonb, jsonb, jsonb) dc46bffd9149bec7f8514b175b1d01227d4fa84c98c86fc6a9e7507da5b47463
-- based-on: custom._field_type_converts_values() 6cd18db356180f2b7fed51fce06179fb92867f439cabf423cde4d1fbe7ffa82f
-- based-on: custom._field_value_carry_base(uuid, jsonb, jsonb, jsonb) e18630e6e2eea59e8e5835f8b47c709400f84bd03286810ed315871cb8cd9f11
-- based-on: custom._gs1_check_ok(text) cf4de731915632fde7f192f7681d9538e588835051b54f7b3593316f7073052d
-- based-on: custom._kind_value_fit(jsonb, jsonb, jsonb) f8e76a2e8fa7c901c5737587afef045b4cbc127795eb04ba3c552093feda97ff
-- based-on: custom._kind_value_ok(jsonb, text, jsonb) bb35d5cf6039c63b542fbf95498f2e4a597082885be6b0bab67ffdbbdacc47f8
-- based-on: custom._rich_text_problem(text) b49e4dbbe06ffce67e3e4021d5a3ab1b97354dc205bc7b18f137c6da4780febe
-- based-on: custom._status_group_word(text) 4edb9ee7a4151b58261b006622ffc775d360fabe89374e9306a9d304e81de803
-- based-on: custom.barcode_symbologies() c26cf10559562c05db212b5d1d7663d67665d400b443cba4ba3285c2526dce41
-- based-on: custom.display_format_ids() 6155275908c787eedf65fc1de0edb709ff9b90967314797ba8255f4a03da90f2
-- based-on: custom.field_kind_of(jsonb) 2e36c9a9b8280794d1f36a709633cfb5a1430294a08ed8948e4e2b272fc59fdb
-- based-on: custom.field_kinds() 5e6cfdbdb1b6d88744b824fc784b0fc1f3fc4ea7b7378e082b3abd5f9a4bbf1f
-- based-on: custom.field_update(uuid, uuid, jsonb) 9964844a37193adfc8e5ff939620014b5fa81a2542a41f0efcb9686a1dcaffc9
-- based-on: custom.formula_value(uuid, uuid, jsonb, jsonb) 2182120bdf047f2b0564c779a335afd2a8af508348e0e42b28c83db2d5244fb6
-- based-on: custom.status_groups_keyed(uuid, uuid, jsonb, jsonb, text) f7c7b83f591bddd0d2ef6e2543ca61d9f95e7b48d72972afe1743794c8fbe156
-- based-on: custom.status_groups_of(jsonb) d018d97be86764da71615461c63bc11a4a70dfc7cbc58e4d5919d8316b17e020
-- based-on: custom.validate_values(uuid, custom.record[], jsonb, text) 2d13a3252cd5478299ffd7b2f42552c52fffd29b54c6e1f8979b161de0706730
-- chair-step: the inverse of viewsfields_p4_a_column_can_be_a_rating_a_duration_a_status_an_address_and_five_more.sql.
-- It puts back, byte for byte, custom.field_kinds, custom.display_format_ids,
-- custom._field_document_for, custom._field_type_parity_guard, custom.validate_values,
-- custom.formula_value, custom.field_update and custom._field_value_carry as the main database
-- held them before P4 (re-based on production's bodies of 2026-10-03, after chairdoors3a and
-- CHAIR-MATH), and drops the thirteen P4 helpers. What it undoes: the nine kinds leave the menu and the door;
-- a column already declared as one keeps its document and reads as its behaviour (a rating as a
-- number, an address as text), and Created by / Last modified by read empty.
--
-- THE TRIGGER custom_record_field_type_converts_values (AFTER UPDATE on custom.record) runs
-- custom._field_type_converts_values, which calls custom._field_value_carry. P4 never replaces the
-- trigger body; it replaces _field_value_carry with a wrapper over custom._field_value_carry_base.
-- So the order below is load-bearing: _field_value_carry is put back first (its pre-P4 body calls
-- no P4 helper), and the trigger body is PINNED to production's own body (byte-identical, its
-- based-on line above), BEFORE any helper is dropped. A later file that moves the trigger body onto
-- a P4 helper (P4b, or a P4c-shaped draft) makes this inverse refuse by its based-on line, so the
-- trigger can never be left attached over a dropped function: run that file's inverse first.
--
-- ground-standing-ok: d — custom.field_kind_of is read by custom.table_kind_facts (chairdoors3a)
-- only behind `if to_regprocedure('custom.field_kind_of(jsonb)') is not null`; production ran
-- without it before P4, so dropping it puts back exactly that state and breaks nothing.
set local statement_timeout = '60s';

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
    ('entity_reference', 'relation', false, 'SC-R / P12: a relation whose target mode is any (REL-8), restricted by config.allowed_types to the platform kinds it may name (custom.entity_reference_kinds() — agents, notes, web sites, workbooks, datasets, conversations …); each value is {token, id}, the edge a platform.associations row record → <token>. File and Person stay relations to their kernel Tables')
  ) as extra(kind, behavior, parity, made_of);
$function$;

CREATE OR REPLACE FUNCTION custom.display_format_ids()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select array['text', 'long_text', 'markdown', 'email', 'address', 'url', 'phone', 'color',
               'number', 'decimal', 'currency', 'percent', 'progress', 'duration', 'integer',
               'rating', 'file_size', 'boolean', 'date', 'datetime', 'time', 'autonumber',
               'created_time', 'modified_time', 'relative_time', 'json', 'array', 'attachment',
               'tags', 'choice', 'person', 'relation', 'multi_choice', 'formula']::text[]
$function$;

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

  return custom._with_display_format(custom._with_display(p_organization_id, d, p_spec - 'display_format'), p_spec);
end
$function$;

CREATE OR REPLACE FUNCTION custom._field_type_parity_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  d          jsonb := new.data;
  v_label    text;
  v_declared text;
  v_derived  text;
  v_type     text;
  v_edef     uuid;
  v_via      text;
  v_via_fld  jsonb;
  v_far      uuid;
  v_far_lbl  text;
  v_filter   jsonb;
  v_fkey     text;
  v_leaf     text;
  v_store_on boolean;
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

  -- Only field definitions, and never the kernel `Field` row itself (REC-27).
  if new.table_id is distinct from custom.field_kernel_id() or new.data_class = 'kernel' then
    return new;
  end if;

  v_label    := coalesce(nullif(d ->> 'label', ''), d ->> 'key', 'this field');
  v_type     := d ->> 'type';
  v_declared := nullif(d ->> 'parity_type', '');
  v_derived  := custom.parity_type(d);
  v_edef     := nullif(d ->> 'entity_definition_id', '')::uuid;

  -- (a) A NAME NOBODY SHIPS. Refused with the list, so a typo is not a silent plain field.
  if v_declared is not null
     and not exists (select 1 from custom.parity_field_types() t
                      where t.parity_type = v_declared) then
    raise exception 'the field % says it is a % and that is not one of the field types this system ships',
                    v_label, v_declared
      using errcode = '23514',
            hint = format('FLD-11: select parity_type from custom.parity_field_types() - %s.', custom._parity_types_sentence());
  end if;

  -- A Field that CALLS itself the formula parity type and carries no expression of its own.
  -- (A behaviour-`formula` Field whose answer comes from a compute Rule derives NULL above
  -- and never reaches here — it is W1-RULE's, and this lane does not demand anything of it.)
  if v_declared = 'formula' and jsonb_typeof(d -> 'config' -> 'expr') is distinct from 'object' then
    raise exception 'the field % is worked out and does not say how', v_label
      using errcode = '23514',
            hint = 'FLD-11 / REC-15: config.expr is a Rule expression - the same shape and the same evaluator a Rule uses (select node from custom.rule_node_kinds()).';
  end if;

  -- ── FIX-10B-F5, 2026-09-22: AND IT HAS TO SAY IT WITH COLUMNS THAT ARE ACTUALLY THERE. ──
  --
  -- The check above asks whether a worked-out column says HOW. This one asks whether what it
  -- says can ever be answered. VERIFIER-10, on Rincon Plumbing Co's "Truck 1 dispatch
  -- backlog": a "Ticket label" column built from the Add-field panel read `—` on all 100
  -- rows, before a write, after a write to a source column, and after a reload. Its stored
  -- expression was `{"op":"concat","args":[{"const":""}]}` — a formula reading no column at
  -- all. That particular shape is the PANEL's to refuse (only the screen knows it asked a
  -- person which columns and was answered with none; a trivial expression is legitimate here,
  -- because a compute Rule with `target_field_id` can be the thing that fills the column —
  -- `scripts/campaign-tests/w1_rule_apply.sql` declares exactly that pair on purpose). So
  -- that half is closed in `@ai-matrx/records-ui`'s FieldEditor and NOT here.
  --
  -- WHAT IS THE STORE'S TO REFUSE IS THE SIBLING THE SAME CENSUS FOUND, WHICH NO SCREEN CAN
  -- SEE. Measured on the main database, 2026-09-22, over every live formula column:
  --
  --     "Worked out"  expr {"op":"concat","args":[{"field":"title"}]}   -> NOT AN ID
  --     "Shouty"      expr {"node":"field","field":"serial"}            -> NOT AN ID
  --     "Doubled"     expr {"op":"concat","args":[{"field":"3014b868-…"}]} -> NO SUCH FIELD
  --
  -- `custom.rule_eval` refuses each of those BY NAME at evaluation — REC-17, "by id, never by
  -- name" — and `custom.derived_value` catches the refusal, writes a `raise warning` no
  -- person will ever read, and answers null. The column is therefore `—` on every record of
  -- that table forever, and the only place the reason exists is a server log. That is the
  -- same defect as F5 wearing a different hat, and it is exactly what a declaration-time
  -- guard is for: the column is refused when somebody writes it, naming the column and what
  -- is wrong with it, instead of going quiet for the rest of its life.
  --
  -- HERE, RATHER THAN IN A DOOR, BECAUSE EVERY WRITER PASSES THROUGH HERE. field_declare,
  -- field_update's behaviour arm, a table spec's inline fields, an import's new columns and
  -- any direct write to custom.record all fire this trigger; a check in one door would leave
  -- the other four open. Rows already saved are untouched until something writes them again.
  -- HELD OFF BY THE CAMPAIGN'S OWN SWITCH, READ BY NAME. `custom.store_is_open` is the one
  -- reader of `custom/system_enabled` and is what `custom.assert_store_door` above already
  -- obeyed — but it reads the knob through a function call, and an OFF proof that rests on a
  -- lane's word about what a function does is not a proof. So the knob is ALSO read here by
  -- its own name: while the switch resolves false for this organization, this new refusal
  -- does not exist and the path is exactly what it was. The two readings differ in one case
  -- and the OR is what keeps it honest — `custom.store_is_open` also answers true for an
  -- organization born after 2026-09-21 01:30:44+00, which has the store on with no override
  -- row to resolve, and a guard that went quiet for every new organization would be worse
  -- than the defect.
  -- CHAIR-ALWAYS-ON 2026-10-03: the per-organization store switch is retired and custom.store_is_open answers
  -- true for every organization, so the by-name knob read beside it is gone with the knob.
  v_store_on := custom.store_is_open(new.organization_id);

  if v_declared = 'formula' and v_store_on then
    for v_leaf in
      select distinct l #>> '{}'
        from jsonb_path_query(coalesce(d -> 'config' -> 'expr', '{}'::jsonb),
                              '$.**.field') l
       where jsonb_typeof(l) = 'string'
       union
      select distinct l #>> '{}'
        from jsonb_path_query(coalesce(d -> 'config' -> 'expr', '{}'::jsonb),
                              '$.**.parent_field') l
       where jsonb_typeof(l) = 'string'
    loop
      if v_leaf !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'the field % works its answer out from %, and that is a name rather than a column',
                        v_label, coalesce(v_leaf, 'nothing')
          using errcode = '23514',
                hint = 'REC-17: a worked-out column points at a Field BY ITS ID - {"field": "<the field''s id>"}. A name changes and the column would stop resolving, so the store never accepts one. Nothing was written.';
      end if;
      if custom.rule_field_key(new.organization_id, v_leaf::uuid) is null then
        raise exception 'the field % works its answer out from a column that is not in this organization', v_label
          using errcode = '23503',
                hint = 'REC-17 / REC-18: every {"field": …} in config.expr names a live Field of this organization. Open the table and use the id of the column you meant. Nothing was written.';
      end if;
    end loop;
  end if;

  -- (b) THE DECLARATION AND WHAT IT ACTUALLY DECLARES HAVE TO AGREE. This is the whole of
  -- ruling 1 as a refusal: a parity type is made of a behaviour and its modifiers, so a
  -- field that CALLS itself a currency while declaring no unit is refused naming BOTH words.
  if v_declared is not null and v_derived is distinct from v_declared then
    raise exception 'the field % calls itself a %, and what it actually says it is is %',
                    v_label, v_declared, coalesce(v_derived, 'a plain ' || custom.said(v_type, 'field'))
      using errcode = '23514',
            hint = format('FLD-11: %s is made of %s. A parity type is a behaviour plus its modifiers, never a behaviour of its own - fix the declaration, not the name.',
                          v_declared,
                          coalesce((select t.made_of from custom.parity_field_types() t
                                     where t.parity_type = v_declared), 'a behaviour'));
  end if;

  -- (c) THE FOUR WITH NO LIVE IMPLEMENTATION have declarations of their own, and each one
  -- is refused BY THE FIELD'S NAME rather than by an evaluator failing later.
  if v_derived in ('lookup', 'rollup') then
    v_via := nullif(d -> 'config' ->> 'via', '');
    if v_via is null then
      raise exception 'the field % has to say which relation it reads through', v_label
        using errcode = '23514',
              hint = 'FLD-11: a lookup and a rollup both travel along a relation. config.via names a relation Field of this same table, by its key.';
    end if;
    if v_edef is not null then
      select f.data into v_via_fld
        from custom.record f
       where f.organization_id = new.organization_id
         and f.table_id = custom.field_kernel_id()
         and f.deleted_at is null
         and (f.data ->> 'entity_definition_id')::uuid = v_edef
         and f.data ->> 'key' = v_via
       limit 1;
      if v_via_fld is null then
        raise exception 'the field % reads through a relation called %, and this table has no field called %',
                        v_label, v_via, v_via
          using errcode = '23514', hint = 'FLD-11: config.via names a field of the SAME table, by key.';
      end if;
      if v_via_fld ->> 'type' <> 'relation' then
        raise exception 'the field % reads through %, and % is not a relation - it is a %',
                        v_label, v_via, v_via, v_via_fld ->> 'type'
          using errcode = '23514',
                hint = 'FLD-11: a lookup reads a value through a RELATION and a rollup aggregates along one. A value on this same record is a formula, not a lookup.';
      end if;
      if v_derived = 'rollup' and not coalesce((v_via_fld ->> 'multi')::boolean, false) then
        raise exception 'the field % adds up % and % points at one thing at a time', v_label, v_via, v_via
          using errcode = '23514',
                hint = 'FLD-11: a rollup aggregates MANY records. Give the relation the multi modifier, or read the one value with a lookup.';
      end if;
    end if;
  end if;

  if v_derived = 'lookup' and nullif(d -> 'config' ->> 'pick', '') is null then
    raise exception 'the field % has to say which value it reads on the other side', v_label
      using errcode = '23514', hint = 'FLD-11: config.pick names a field key of the related record.';
  end if;

  if v_derived = 'rollup' then
    if nullif(d -> 'config' ->> 'agg', '') not in ('sum', 'count', 'min', 'max', 'avg') then
      raise exception 'the field % says it works out % of the records it points at, and it adds them up, counts them, or takes the smallest, the largest or the average',
                      v_label, custom.said(d -> 'config' ->> 'agg', 'nothing')
        using errcode = '23514', hint = 'FLD-11: config.agg is sum, count, min, max or avg.';
    end if;
    if (d -> 'config' ->> 'agg') <> 'count'
       and nullif(d -> 'config' ->> 'of', '') is null then
      raise exception 'the field % has to say which value of the records it points at it works out', v_label
        using errcode = '23514',
              hint = 'FLD-11: config.of names a field key on the far side. Only count needs no field, because it counts the records themselves.';
    end if;
    -- CHAIR-MATH (b): THE FILTER IS CHECKED WHERE THE FIELD IS DECLARED, never at read time.
    -- config.filter narrows the linked records the roll-up adds up, in the SAME grammar a saved
    -- view's filter uses (custom.record_filter_sql over the far table: {"status": "open"}, a
    -- window {"due": {"before": …}}, or a Rule expression {"op": "eq", "args": [{"field": "<far
    -- field id>"}, {"const": "open"}]}). An unknown column, an unknown op or a shape the far table
    -- cannot answer is refused here, by the field's name, with the compiler's own sentence.
    if d -> 'config' ? 'filter' and jsonb_typeof(d -> 'config' -> 'filter') <> 'null' then
      v_filter := d -> 'config' -> 'filter';
      if jsonb_typeof(v_filter) <> 'object' then
        raise exception 'the field % narrows the records it adds up with a filter, and a filter is a set of conditions like {"status": "open"}, not a %',
                        v_label, jsonb_typeof(v_filter)
          using errcode = '23514',
                hint = 'FLD-11 / CHAIR-MATH: config.filter uses the same shape a saved view''s filter does, written against the columns of the table the relation points at.';
      end if;
      if v_via_fld is not null then
        v_far := nullif(v_via_fld ->> 'relation_target', '')::uuid;
        if v_far is null then
          raise exception 'the field % narrows the records it adds up, but the relation it reads through (%) does not say which table it points at',
                          v_label, v_via
            using errcode = '23514', hint = 'FLD-11: give the relation a relation_target first.';
        end if;
        select coalesce(nullif(t.data ->> 'label_plural', ''), nullif(t.data ->> 'name', ''), 'linked')
          into v_far_lbl
          from custom.record t where t.organization_id = new.organization_id and t.id = v_far;
        if not custom.filter_is_rule(v_filter) then
          for v_fkey in select split_part(k, '.', 1) from jsonb_object_keys(v_filter) k loop
            if not exists (select 1 from custom.record f
                            where f.organization_id = new.organization_id
                              and f.table_id = custom.field_kernel_id()
                              and f.deleted_at is null
                              and f.data ->> 'entity_definition_id' = v_far::text
                              and f.data ->> 'key' = v_fkey) then
              raise exception 'the field % narrows the records it adds up by "%", and the % table has no column with that key',
                              v_label, v_fkey, coalesce(v_far_lbl, 'linked')
                using errcode = '23514',
                      hint = 'FLD-11 / CHAIR-MATH: config.filter names columns of the table the relation points at, by key — {"status": "open"} — or points at them by id in a Rule expression.';
            end if;
          end loop;
        end if;
        begin
          perform custom.record_filter_sql(new.organization_id, v_far,
                    case when custom.filter_is_rule(v_filter) then v_filter
                         else custom.choice_filter_normalize(custom.choice_field_map(new.organization_id, v_far), v_filter) end);
        exception when others then
          raise exception 'the field % narrows the records it adds up with a filter the % table cannot answer: %',
                          v_label, coalesce(v_far_lbl, 'linked'), sqlerrm
            using errcode = '23514',
                  hint = 'FLD-11 / CHAIR-MATH: config.filter is read exactly as a saved view''s filter on that table is; fix it the way that sentence says.';
        end;
      end if;
    end if;
    -- ANNOUNCED, NOT SILENT (rule 16). A rollup stamped at write time goes stale the moment
    -- a contained record moves, and nothing in this campaign yet propagates a child's write
    -- to its parents. So the declaration is refused rather than quietly wrong.
    if (d ->> 'compute_on') = 'write' then
      raise exception 'the field % adds up other records and says it works itself out when this record is saved, and it would then be out of date the moment one of them changed',
                      v_label
        using errcode = '23514',
              hint = 'FLD-11 / FLD-9: declare compute_on read for a rollup - it is then worked out from the contained records every time it is read, and is never stale. Stamping one at write time needs a child-to-parent recompute that no lane has built; W3-MIG/W3-HIST is where it belongs when somebody wants the cache.';
    end if;
  end if;

  -- (d) THE NINE THAT DO EXIST, each refused on the one thing that makes it that type.
  if v_derived = 'attachment'
     and coalesce(d ->> 'on_target_delete', '') = 'cascade' then
    raise exception 'the field % says deleting the file deletes the record that shows it', v_label
      using errcode = '23514',
            hint = 'REC-31: a picture is a File record reached through a relation. Removing the file removes the attachment, never the record it was attached to - set_null or restrict.';
  end if;

  if v_derived in ('url', 'email', 'phone')
     and not exists (select 1 from custom.field_rules(d) r where r.kind = 'pattern') then
    raise exception 'the field % holds a % and nothing says what a % looks like', v_label, v_derived, v_derived
      using errcode = '23514',
            hint = 'FLD-3 / FLD-11: the format says how to SHOW it; what makes it enforceable is an attached validation Rule of kind pattern. A format with no rule is a label on an empty box.';
  end if;

  if v_derived = 'percent'
     and not exists (select 1 from custom.field_rules(d) r where r.kind in ('min', 'max')) then
    raise exception 'the field % holds a percentage and nothing says the range it lives in', v_label
      using errcode = '23514',
            hint = 'FLD-3 / FLD-11: attach min and max Rules. A percent field that takes -40 is a percent in name only.';
  end if;

  return new;
end;
$function$;

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
      if coalesce((d ->> 'required')::boolean, false)
         and coalesce(current_setting('custom.validating_restore', true), '') <> '1' then
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
$function$;

CREATE OR REPLACE FUNCTION custom.formula_value(p_organization_id uuid, p_record_id uuid, p_field_data jsonb, p_values jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_values jsonb := coalesce(p_values, custom.record_values(p_organization_id, p_record_id));
  v_rec    custom.record;
  v_rtype  text;
  v_tf     text;
  v_key    text;
  v_keys   text[];
begin
  -- REC-15's evaluator, not a second one: every Rule node, every refusal and REC-17's
  -- "by id, never by name" still come from custom.rule_eval, which custom.formula_eval hands
  -- them to unchanged. GRID-PRIMITIVES G3 adds the formula language's own `fx.*` nodes, and
  -- the three facts only a formula about ITS OWN record can use (its id, its column, its table:
  -- autonumber and the created / modified stamps). They ride under fx_* keys so no Rule node
  -- that reads the context (stage_count, sibling_count read `table_id`) answers differently.
  --
  -- CHAIR-MATH (a): A WORKED-OUT COLUMN THIS FORMULA READS IS WORKED OUT FIRST. The values a
  -- caller hands in are the stored row, the Rule layer's block and what was stamped at write
  -- time; a roll-up, a lookup or another read-time formula is none of those, so its key is
  -- absent and the evaluator read it as blank (0). Each such key is resolved here through
  -- custom.far_value — the one reader that refuses a circle by sentence instead of recursing —
  -- and only when it is absent, so a caller that already worked it out (custom.derived_values_of
  -- in dependency order) pays nothing more.
  if p_values is not null and p_record_id is not null then
    v_keys := custom.formula_field_keys(p_organization_id, p_field_data -> 'config' -> 'expr');
    if cardinality(v_keys) > 0 then
      select * into v_rec from custom.record
       where organization_id = p_organization_id and id = p_record_id;
      if v_rec.id is not null and v_rec.table_id is not null
         and v_rec.data_class not in ('kernel', 'relation') then
        v_tf := custom.table_type_field(v_rec.organization_id, v_rec.table_id);
        if v_tf is not null then
          v_rtype := v_rec.data ->> v_tf;
        end if;
        for v_key in
          select a.data ->> 'key'
            from custom.applicable_fields(v_rec.organization_id, v_rec.table_id, v_rtype) a
           where (a.data ->> 'key') = any (v_keys)
             and (a.data ->> 'key') is distinct from (p_field_data ->> 'key')
             and custom.parity_type(a.data) in ('lookup', 'rollup', 'formula')
             and coalesce(a.data ->> 'compute_on', '') = 'read'
             and not (v_values ? (a.data ->> 'key'))
        loop
          v_values := v_values || jsonb_build_object(v_key,
                        custom.far_value(p_organization_id, p_record_id, v_key, p_field_data));
        end loop;
      end if;
    end if;
  end if;

  return custom.formula_eval(p_organization_id, p_field_data -> 'config' -> 'expr',
                             v_values,
                             coalesce(custom.rule_context(p_organization_id, p_record_id), '{}'::jsonb)
                             || jsonb_build_object('fx_self_id', p_record_id,
                                                   'fx_field_key', p_field_data ->> 'key',
                                                   'fx_table_id', p_field_data ->> 'entity_definition_id'));
end;
$function$;

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
    'allow_other',
    -- CHOICE-COLUMN-EDIT: choices added to the ones a column already has (the cell's "Add").
    'options_add',
    -- DATA-V2-BASICS-2: what a new record this column is not named in starts with.
    'default',
    -- CHAIR-MATH (b), 2026-10-03: what a lookup or roll-up reads (via, pick, agg, of) and which
    -- linked records a roll-up adds up (filter). Before this they were refused here by name on a
    -- retype, and `filter` did not exist.
    'via', 'pick', 'agg', 'of', 'filter'];
  v_unknown  text[];
  v_parsed   jsonb;
  -- CHOICE-COLUMN-EDIT: the choices exactly as they were sent (words, or {id, words}).
  v_opt_entries jsonb;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.field_update');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.field_update');
  -- VISION-REACH W4 (a): the organization's "Agent changes" setting, enforced here (custom._agent_change_gate).
  perform custom._agent_change_gate(p_organization_id, null, 'custom.field_update', p_field_id);

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

  -- ── CHOICE-COLUMN-EDIT, 2026-09-27: A CHOICE IS KNOWN BY ITS ID, NOT ONLY BY ITS WORDS. ──
  -- The column editor sends each choice as {id, words}, so a re-worded choice is the SAME
  -- option with new words, not one retired and another made (which left every cell holding the
  -- retired one). Every reader below this line still reads plain words; the entries themselves
  -- are what custom._field_choices_save saves.
  if jsonb_typeof(p_patch -> 'options') = 'array' then
    v_opt_entries := p_patch -> 'options';
    p_patch := jsonb_set(p_patch, '{options}', custom._choice_words_array(p_patch -> 'options'));
  end if;
  if p_patch ? 'options_add' and jsonb_typeof(p_patch -> 'options_add') <> 'array' then
    raise exception 'Choices to add are sent as a list of words, and % is not one.', p_patch -> 'options_add'
      using errcode = '23514', hint = 'Send options_add as ["the words", …]. Nothing was changed.';
  end if;
  if p_patch ? 'options_add' and (p_patch ? 'type' or p_patch ? 'parity_type' or p_patch ? 'plain') then
    raise exception 'Adding choices and changing what a column stores are two saves, not one.'
      using errcode = '23514', hint = 'Change what it stores first, then add the choices. Nothing was changed.';
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

  -- ── DATA-V2-BASICS, 2026-09-27: TWO COLUMNS OF ONE TABLE NEVER READ THE SAME. ──────────────
  -- BREAKER-1 F8: renaming "Notes" to "Patient Name" beside a real "Patient Name" was taken, the
  -- header row then read "Patient Name" twice over different data, and a 500-row paste matched its
  -- header to the wrong one and blanked a real column (F10). A person tells columns apart by their
  -- names, so a rename onto another column's name is refused, naming it.
  if p_patch ? 'label' and v_table is not null
     and lower(btrim(coalesce(p_patch ->> 'label', ''))) is distinct from lower(btrim(coalesce(v_old ->> 'label', '')))
     and exists (select 1 from custom.record r
                  where r.organization_id = p_organization_id
                    and r.table_id = custom.field_kernel_id()
                    and r.data_class = 'field'
                    and r.deleted_at is null
                    and r.id <> p_field_id
                    and r.data ->> 'entity_definition_id' = v_table::text
                    and lower(btrim(coalesce(r.data ->> 'label', ''))) = lower(btrim(coalesce(p_patch ->> 'label', '')))) then
    raise exception 'You already have a column called "%".', btrim(p_patch ->> 'label')
      using errcode = '23505',
            hint = 'Give this column another name, or rename the other one first. Nothing was changed.';
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
      -- CHAIR-MATH (b), 2026-10-03: WHAT A LOOKUP OR ROLL-UP READS rides a change of kind too.
      -- This fixed key list never carried via / pick / agg / of, so a column retyped to a rollup
      -- through this door was refused by the guard as "has to say which relation it reads
      -- through" however the caller spelled it; and the new filter rides beside them.
      'via',            coalesce(nullif(p_patch ->> 'via', ''),  v_old -> 'config' ->> 'via'),
      'pick',           coalesce(nullif(p_patch ->> 'pick', ''), v_old -> 'config' ->> 'pick'),
      'agg',            coalesce(nullif(p_patch ->> 'agg', ''),  v_old -> 'config' ->> 'agg'),
      'of',             coalesce(nullif(p_patch ->> 'of', ''),   v_old -> 'config' ->> 'of'),
      'filter',         case when p_patch ? 'filter' then p_patch -> 'filter'
                             else v_old -> 'config' -> 'filter' end,
      -- TAILS-2, 2026-09-21: WHEN a worked-out column works itself out is part of what the
      -- column IS, and this builder's fixed key list did not carry it — so a caller who
      -- retyped a formula and said `compute_on` got `custom._field_document_for`'s default
      -- ('read') and no word about it. It is carried now; a rollup still gets 'read', and
      -- that is said out loud rather than swallowed (see the settings arm below).
      'compute_on',     coalesce(nullif(p_patch ->> 'compute_on', ''), v_old ->> 'compute_on'),
      'on_target_delete', coalesce(p_patch ->> 'on_target_delete', v_old ->> 'on_target_delete'),
      -- DATA-V2-BASICS-2 (BREAKER-2 B2-07): the table a relation points at rides the change of kind. A
      -- column made a Relation from its settings, naming its table, was refused "does not say which".
      'relation_target', coalesce(nullif(p_patch ->> 'relation_target', ''), v_old ->> 'relation_target'),
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

    -- DATA-V2-BASICS-2 (2026-09-29, BREAKER-2 B2-05 / B2-15): A COLUMN THAT STOPS BEING A LIST.
    -- (1) Several choices turn off, and the values are kept as words ("Neck, Knee"): a Multi-choice
    --     column changed to Text kept `multi` and every value was refused as "holds many values",
    --     so it could never be made Text at all.
    -- (2) Its list goes with it, kept (`config.list_kept`): changing Visit Status to Text and back
    --     made a second "Visit Status choices" with only the words in use — the unused No-show and
    --     every colour were gone. Changing it back to a choice column takes the same list again.
    if (v_old ->> 'type') = 'list' and (v_next ->> 'type') <> 'list' then
      if not (p_patch ? 'multi') and v_next ? 'multi' then
        v_next := jsonb_set(v_next, '{multi}', 'false'::jsonb);
      end if;
      if nullif(v_old -> 'config' ->> 'options_table_id', '') is not null then
        v_next := jsonb_set(v_next, '{config}', coalesce(v_next -> 'config', '{}'::jsonb)
                    || jsonb_build_object('list_kept', v_old -> 'config' -> 'options_table_id'));
        -- (3) DATA-V2-BASICS-2 (2026-10-01, BREAKER-3/4 B3-15): its "take other values" setting is kept
        --     with it, so a strict column changed to Text and back is strict again, never silently open.
        if jsonb_typeof(v_old -> 'config' -> 'allow_other') = 'boolean' then
          v_next := jsonb_set(v_next, '{config}', (v_next -> 'config')
                      || jsonb_build_object('list_kept_allow_other', v_old -> 'config' -> 'allow_other'));
        end if;
      end if;
    elsif (v_next ->> 'type') <> 'list' and nullif(v_old -> 'config' ->> 'list_kept', '') is not null then
      v_next := jsonb_set(v_next, '{config}', coalesce(v_next -> 'config', '{}'::jsonb)
                  || jsonb_build_object('list_kept', v_old -> 'config' -> 'list_kept'));
      if jsonb_typeof(v_old -> 'config' -> 'list_kept_allow_other') = 'boolean' then
        v_next := jsonb_set(v_next, '{config}', (v_next -> 'config')
                    || jsonb_build_object('list_kept_allow_other', v_old -> 'config' -> 'list_kept_allow_other'));
      end if;
    end if;

    -- THE LIST KEPT COMES BACK (B2-15): a column that becomes a list again takes the list it had, when
    -- that list is still live, and adds any new words the caller sent to it.
    if (v_next ->> 'type') = 'list'
       and nullif(v_next -> 'config' ->> 'options_table_id', '') is null
       and nullif(v_old -> 'config' ->> 'list_kept', '') is not null
       and exists (select 1 from custom.record t
                    where t.organization_id = p_organization_id
                      and t.id = (v_old -> 'config' ->> 'list_kept')::uuid
                      and t.table_id = custom.table_kernel_id()
                      and t.deleted_at is null) then
      v_opts := (v_old -> 'config' ->> 'list_kept')::uuid;
      v_next := jsonb_set(v_next, '{config,options_table_id}', to_jsonb(v_opts::text));
      -- The kept "take other values" comes back with it, unless this change names it (B3-15).
      if not (p_patch ? 'allow_other') and jsonb_typeof(v_old -> 'config' -> 'list_kept_allow_other') = 'boolean' then
        v_next := jsonb_set(v_next, '{config}', (v_next -> 'config')
                    || jsonb_build_object('allow_other', v_old -> 'config' -> 'list_kept_allow_other'));
      end if;
      if jsonb_typeof(p_patch -> 'options') = 'array' and jsonb_array_length(p_patch -> 'options') > 0 then
        perform custom._field_choices_save(p_organization_id, v_opts, coalesce(v_opt_entries, p_patch -> 'options'), true);
      end if;
    end if;
    if (v_next ->> 'type') = 'list' and ((v_next -> 'config') ? 'list_kept' or (v_next -> 'config') ? 'list_kept_allow_other') then
      v_next := jsonb_set(v_next, '{config}', (v_next -> 'config') - 'list_kept' - 'list_kept_allow_other');
    end if;

    v_was := custom.field_behaviour(v_old);
    v_now := custom.field_behaviour(v_next);

    -- THE CHOICES. A column that becomes a list gets its Table of choices here, with the words
    -- the caller typed — or with none (lane CHOICE-COLUMN-EDIT, 2026-09-27: a choice column made
    -- with no choices yet stays a choice column with an empty list; it used to be refused, and the
    -- Sheet's Add column kept the column as plain text without a word). Its first choice is added
    -- from its settings, or from a cell (options_add, the enum nudge).
    if (v_next ->> 'type') = 'list'
       and nullif(v_next -> 'config' ->> 'options_table_id', '') is null then
      v_opts := custom._options_table_for(p_organization_id, v_next ->> 'label',
                                          case when jsonb_typeof(p_patch -> 'options') = 'array'
                                               then p_patch -> 'options' else '[]'::jsonb end);
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

    -- DATA-V2-BASICS-2 (2026-09-27): A COLUMN'S DEFAULT IS ONE OF ITS SETTINGS. `default` is what a
    -- new record this column is not named in starts with (custom.record_write fills it); null
    -- clears it. A column that changes what it holds keeps its default — a default that no longer
    -- fits is simply not filled, never a refusal.
    if p_patch ? 'default' then
      v_next := case when p_patch -> 'default' is null or jsonb_typeof(p_patch -> 'default') = 'null'
                     then v_next - 'default' else jsonb_set(v_next, '{default}', p_patch -> 'default') end;
    elsif v_old ? 'default' and not (v_next ? 'default') then
      -- DATA-V2-BASICS-2 (2026-09-29, BREAKER-2 B2-01): THE DEFAULT IS CARRIED LIKE THE VALUES. A default
      -- the column can no longer hold would make every new row fail, so it converts the way a cell does
      -- (custom._field_value_carry: a choice by its words, words to their choice) or it goes, said.
      if coalesce(jsonb_typeof(custom._field_value_carry(p_organization_id, v_old, v_next, v_old -> 'default')), 'null') <> 'null' then
        v_next := v_next || jsonb_build_object('default',
                    custom._field_value_carry(p_organization_id, v_old, v_next, v_old -> 'default'));
      else
        raise notice 'custom: "%" no longer has a default: % does not fit what it holds now.',
          coalesce(v_next ->> 'label', v_next ->> 'key'), coalesce((v_old -> 'default')::text, 'it');
      end if;
    end if;

    -- DATA-V2-BASICS-2 (2026-09-29): the default fits what the column holds now, or the save is refused.
    v_next := custom._field_default_fitted(p_organization_id, v_next);

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
  -- CHAIR-MATH (b), 2026-10-03: WHICH LINKED RECORDS A ROLL-UP ADDS UP IS A SETTING LIKE ANY
  -- OTHER. `{"filter": {"status": "open"}}` on an existing roll-up lands in config.filter and is
  -- validated against the far table by custom._field_type_parity_guard on this very write;
  -- `{"filter": null}` takes it off. On anything that is not a roll-up it is refused by name.
  if p_patch ? 'filter' then
    if custom.parity_type(v_old) is distinct from 'rollup' then
      raise exception 'Only a column that adds up linked records can narrow which ones it adds up, and "%" is not one.',
        coalesce(v_old ->> 'label', v_old ->> 'key')
        using errcode = '23514',
              hint = 'FLD-11: make it a roll-up first (type "rollup" with via and agg), then send filter.';
    end if;
    if jsonb_typeof(p_patch -> 'filter') = 'null' then
      v_next := jsonb_set(v_next, '{config}', coalesce(v_next -> 'config', '{}'::jsonb) - 'filter');
    else
      v_next := jsonb_set(v_next, '{config}', coalesce(v_next -> 'config', '{}'::jsonb)
                  || jsonb_build_object('filter', p_patch -> 'filter'));
    end if;
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

  -- THE CHOICES, EDITED WHERE THEY LIVE (lane CHOICE-COLUMN-EDIT, 2026-09-27). The whole list,
  -- in its order: re-worded by id, added, brought back, reordered and — what the list no longer
  -- names — retired (archived, never deleted), in this one statement. The options table's own
  -- title field is written, so a moved column (a copy keyed `name`) is edited exactly like a
  -- native one; before this, the arm wrote `title` only and a moved column was refused upstream.
  if jsonb_typeof(p_patch -> 'options') = 'array' and (v_old ->> 'type') = 'list' then
    v_opts := nullif(v_old -> 'config' ->> 'options_table_id', '')::uuid;
    if v_opts is null then
      v_opts := custom._options_table_for(p_organization_id, v_next ->> 'label', p_patch -> 'options');
      v_next := jsonb_set(v_next, '{config,options_table_id}', to_jsonb(v_opts::text));
    else
      perform custom._field_choices_save(p_organization_id, v_opts, coalesce(v_opt_entries, p_patch -> 'options'), false);
    end if;
  end if;

  -- CHOICES ADDED, NOTHING ELSE TOUCHED: what a cell's "Add "<words>" to the choices" sends. A
  -- word that already names a live choice (any case) adds nothing; one that names a retired
  -- choice brings it back; the rest are added at the end.
  if jsonb_typeof(p_patch -> 'options_add') = 'array' then
    if coalesce(v_next ->> 'type', v_old ->> 'type') <> 'list' then
      raise exception '"%" is not a choice column, so it has no choices to add to.', coalesce(v_old ->> 'label', v_old ->> 'key')
        using errcode = '23514', hint = 'Make it a choice column first (its settings, Stores). Nothing was changed.';
    end if;
    v_opts := nullif(v_next -> 'config' ->> 'options_table_id', '')::uuid;
    if v_opts is null then
      v_opts := custom._options_table_for(p_organization_id, v_next ->> 'label',
                                          custom._choice_words_array(p_patch -> 'options_add'));
      v_next := jsonb_set(v_next, '{config,options_table_id}', to_jsonb(v_opts::text));
    else
      perform custom._field_choices_save(p_organization_id, v_opts, p_patch -> 'options_add', true);
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

  -- DATA-V2-BASICS-2 (2026-09-27): A COLUMN'S DEFAULT IS ONE OF ITS SETTINGS. `default` is what a
  -- new record this column is not named in starts with (custom.record_write fills it); null
  -- clears it. A column that changes what it holds keeps its default — a default that no longer
  -- fits is simply not filled, never a refusal.
  if p_patch ? 'default' then
    v_next := case when p_patch -> 'default' is null or jsonb_typeof(p_patch -> 'default') = 'null'
                   then v_next - 'default' else jsonb_set(v_next, '{default}', p_patch -> 'default') end;
  elsif v_old ? 'default' and not (v_next ? 'default') then
    v_next := v_next || jsonb_build_object('default', v_old -> 'default');
  end if;

  -- DATA-V2-BASICS-2 (2026-09-29): the default fits what the column holds, or the save is refused.
  v_next := custom._field_default_fitted(p_organization_id, v_next);

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
$function$;

CREATE OR REPLACE FUNCTION custom._field_value_carry(p_organization_id uuid, p_from jsonb, p_to jsonb, p_value jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
-- ONE VALUE, CARRIED FROM WHAT A COLUMN WAS TO WHAT IT IS NOW (DATA-V2-BASICS-2, 2026-09-28).
-- custom.field_value_convert judges a value by the new behaviour alone, and a choice column's cell
-- holds the choice's KEY — so a choice column changed to Text read "in_stock" in every cell, and a
-- Text column changed to a choice column set every word aside, even the ones naming a choice.
-- Here a held choice goes by its own words, and words (or a key, or an option's id) find their
-- choice. Returns SQL null when the value does not fit, and the caller keeps it in `_retired`.
-- Neither side a choice column: exactly custom.field_value_convert.
-- DATA-V2-BASICS-2 (2026-09-30): a line of words carried into a several-choice column is split into its words.
declare
  v_from_list boolean := coalesce(p_from ->> 'type', '') = 'list';
  v_to_list   boolean := coalesce(p_to ->> 'type', '') = 'list';
  v_from_tbl  uuid    := case when v_from_list then nullif(p_from -> 'config' ->> 'options_table_id', '')::uuid end;
  v_to_tbl    uuid    := case when v_to_list then nullif(p_to -> 'config' ->> 'options_table_id', '')::uuid end;
  v_from      jsonb;
  v_to        jsonb;
  v_items     jsonb;
  v_words     jsonb := '[]'::jsonb;
  v_out       jsonb := '[]'::jsonb;
  v_one       jsonb;
  v_tok       text;
  v_word      text;
  v_k         text;
  v_hit       text;
  v_allow     boolean := coalesce((p_to -> 'config' ->> 'allow_other')::boolean, false);
  v_many_to   boolean := coalesce((p_to ->> 'multi')::boolean, false);
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return p_value;
  end if;
  if not v_from_list and not v_to_list then
    return custom.field_value_convert(p_to, p_value);
  end if;
  if jsonb_typeof(p_value) = 'object' then
    return null;
  end if;

  v_from := jsonb_build_object('options', case when v_from_tbl is null then '{}'::jsonb
                                               else custom.choice_options(p_organization_id, v_from_tbl) end);
  v_to   := jsonb_build_object('options', case when v_to_tbl is null then '{}'::jsonb
                                               else custom.choice_options(p_organization_id, v_to_tbl) end);
  v_items := case when jsonb_typeof(p_value) = 'array' then p_value else jsonb_build_array(p_value) end;

  -- ── A LINE OF WORDS INTO SEVERAL CHOICES (DATA-V2-BASICS-2, 2026-09-30; BREAKER-3 B3-02) ──────
  -- A Text column holding "Lower back, Hip" changed to Multi-choice kept "Lower back, Hip" as ONE
  -- value, and the Sheet drew it as a JSON list. Into a column that holds several choices, text that
  -- is not itself one of its choices is read as the list it is: split on commas, semicolons and line
  -- breaks (the Sheet's own reading of typed words, cell-word.ts), trimmed, blanks and repeats dropped.
  if v_to_list and v_many_to and not v_from_list then
    v_words := '[]'::jsonb;
    for v_one in select e from jsonb_array_elements(v_items) e loop
      if jsonb_typeof(v_one) = 'string'
         and (v_one #>> '{}') ~ '[,;\n]'
         and custom.choice_key_of(v_to, btrim(v_one #>> '{}')) is null then
        v_words := v_words || coalesce((
          select jsonb_agg(to_jsonb(d.w) order by d.ord)
            from (select distinct on (lower(p.w)) p.w, p.ord
                    from (select regexp_replace(btrim(part), '\s+', ' ', 'g') as w, ord
                            from regexp_split_to_table(v_one #>> '{}', '[,;\n]') with ordinality s(part, ord)) p
                   where p.w <> ''
                   order by lower(p.w), p.ord) d), '[]'::jsonb);
      else
        v_words := v_words || jsonb_build_array(v_one);
      end if;
    end loop;
    v_items := v_words;
    v_words := '[]'::jsonb;
  end if;

  -- ── INTO A CHOICE COLUMN ─────────────────────────────────────────────────────────────
  if v_to_list then
    for v_one in select e from jsonb_array_elements(v_items) e loop
      if jsonb_typeof(v_one) in ('object', 'array') then
        return null;
      end if;
      v_tok  := btrim(v_one #>> '{}');
      v_word := v_tok;
      v_hit  := null;
      if v_from_list then
        v_k := custom.choice_key_of(v_from, v_tok);
        if v_k is not null then
          v_word := coalesce(v_from -> 'options' -> v_k ->> 'label', v_tok);
        end if;
      end if;
      if v_from_list and v_from_tbl is not distinct from v_to_tbl then
        -- The same list: the key it held is still the key, a retired one included.
        v_hit := custom.choice_key_of(v_to, v_tok);
      else
        v_hit := coalesce(custom.choice_key_of(v_to, v_word), custom.choice_key_of(v_to, v_tok));
        -- Nothing retired is picked anew.
        if v_hit is not null and coalesce((v_to -> 'options' -> v_hit ->> 'retired')::boolean, false) then
          v_hit := null;
        end if;
      end if;
      if v_hit is not null then
        v_out := v_out || jsonb_build_array(to_jsonb(v_hit));
      elsif v_allow and v_word <> '' then
        v_out := v_out || jsonb_build_array(to_jsonb(v_word));   -- an other value, kept as its words
      else
        return null;
      end if;
    end loop;
    if v_many_to then
      return v_out;
    end if;
    if jsonb_array_length(v_out) = 0 then
      return 'null'::jsonb;
    end if;
    if jsonb_array_length(v_out) = 1 then
      return v_out -> 0;
    end if;
    return null;                            -- several choices do not fit one; kept, never dropped
  end if;

  -- ── OUT OF A CHOICE COLUMN: each held choice becomes its words ────────────────────────
  for v_one in select e from jsonb_array_elements(v_items) e loop
    if jsonb_typeof(v_one) = 'string' then
      v_k := custom.choice_key_of(v_from, v_one #>> '{}');
      v_words := v_words || jsonb_build_array(
        case when v_k is not null then coalesce(v_from -> 'options' -> v_k -> 'label', v_one) else v_one end);
    else
      v_words := v_words || jsonb_build_array(v_one);
    end if;
  end loop;
  if jsonb_array_length(v_words) = 0 then
    return 'null'::jsonb;
  end if;
  if jsonb_array_length(v_words) = 1 then
    return custom.field_value_convert(p_to, v_words -> 0);
  end if;
  if coalesce(p_to ->> 'type', '') = 'text' then
    -- Several choices read as one line of words: "Gloves, Masks".
    return to_jsonb((select string_agg(e #>> '{}', ', ' order by ord)
                       from jsonb_array_elements(v_words) with ordinality t(e, ord)));
  end if;
  return null;                              -- several choices are not one number, date or tick
end;
$function$;

-- THE TRIGGER BODY, pinned to production's own (see the chair-step note).
CREATE OR REPLACE FUNCTION custom._field_type_converts_values()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_key       text;
  v_label     text;
  v_table     uuid;
  v_was       text;
  v_now       text;
  v_converted integer := 0;
  v_retired_n integer := 0;
  r           record;
  v_val       jsonb;
  v_new       jsonb;
  v_data      jsonb;
  v_retired   jsonb;
  v_alts      jsonb;
  v_keep_alts jsonb;
  v_alt       jsonb;
  v_conv_alt  jsonb;
  v_alts_retired integer := 0;
  -- DATA-V2-BASICS-2: values an earlier change set aside that fit again.
  v_back_n    integer := 0;
  v_entry     jsonb;
  v_ord       bigint;
  -- DATA-V2-BASICS-2: the column as it was, enough to read a choice's key as its words later.
  v_then      jsonb;
begin
  -- THE DOOR. custom.assert_store_door resolves custom/system_enabled and, while it is false,
  -- this store takes writes only from the role that owns custom.record. The switch never
  -- removes a check: everything below runs exactly as before.
  if not custom.store_is_open(new.organization_id) then
    perform custom.assert_store_door(new.organization_id, 'custom.record');
  end if;

  if new.table_id is distinct from custom.field_kernel_id() or new.data_class = 'kernel' then
    return null;
  end if;

  v_was := custom.field_behaviour(old.data);
  v_now := custom.field_behaviour(new.data);
  if v_was is not distinct from v_now then
    return null;                          -- the Field still asks for the same thing
  end if;

  v_key   := new.data ->> 'key';
  v_then  := jsonb_strip_nulls(jsonb_build_object('type', old.data -> 'type', 'multi', old.data -> 'multi',
               'config', case when old.data ->> 'type' = 'list'
                              then jsonb_build_object('options_table_id', old.data -> 'config' -> 'options_table_id') end));
  v_label := coalesce(nullif(new.data ->> 'label', ''), v_key, 'this field');
  v_table := nullif(new.data ->> 'entity_definition_id', '')::uuid;
  if v_key is null or v_table is null then
    return null;
  end if;

  for r in
    select x.id, x.data from custom.record x
     where x.organization_id = new.organization_id
       and x.table_id = v_table
       and x.deleted_at is null
       and x.data ? v_key
  loop
    v_val := r.data -> v_key;
    if v_val is null or jsonb_typeof(v_val) = 'null' then
      continue;
    end if;
    -- DATA-V2-BASICS-2: a choice goes by its words, and words find their choice (custom._field_value_carry).
    v_new := custom._field_value_carry(new.organization_id, old.data, new.data, v_val);

    if v_new is not null then
      -- THE ALTERNATES COME TOO. VAL-3: an alternate is a candidate for the SAME field, so
      -- custom.validate_value_envelope judges it by the SAME behaviour — and a converted value
      -- sitting beside an unconverted alternate is a document that cannot be written at all.
      -- (Measured: converting Phone to a number while a merge's "222" alternate stayed a
      -- string failed the very write that was doing the converting.) One that does not convert
      -- is kept in _retired as what it was, with its rank and its source.
      v_data := r.data;
      v_alts := coalesce(v_data -> '_values' -> v_key -> 'alternates', '[]'::jsonb);
      if jsonb_typeof(v_alts) = 'array' and jsonb_array_length(v_alts) > 0 then
        v_keep_alts := '[]'::jsonb;
        v_retired   := coalesce(v_data -> '_retired', '[]'::jsonb);
        if jsonb_typeof(v_retired) <> 'array' then
          v_retired := '[]'::jsonb;
        end if;
        for v_alt in select e from jsonb_array_elements(v_alts) e loop
          v_conv_alt := custom._field_value_carry(new.organization_id, old.data, new.data, v_alt -> 'value');
          if v_conv_alt is not null then
            v_keep_alts := v_keep_alts || jsonb_build_array(v_alt || jsonb_build_object('value', v_conv_alt));
          else
            v_retired := v_retired || jsonb_build_object(
              'key', v_key, 'label', v_label, 'value', v_alt -> 'value',
              'was_an_alternate_ranked', v_alt -> 'rank', 'envelope', v_alt -> 'src',
              'field_then', v_then,
              'reason', format('%s changed what it holds and this other candidate for it does not convert, so it is kept here as it was (FLD-4 / T12)', v_label),
              'at', to_jsonb(now()));
            v_alts_retired := v_alts_retired + 1;
          end if;
        end loop;
        if jsonb_array_length(v_keep_alts) > 0 then
          v_data := jsonb_set(v_data, array['_values', v_key, 'alternates'], v_keep_alts);
        else
          v_data := jsonb_set(v_data, array['_values', v_key],
                              (v_data -> '_values' -> v_key) - 'alternates');
        end if;
        if jsonb_array_length(v_retired) > 0 then
          v_data := v_data || jsonb_build_object('_retired', v_retired);
        end if;
      end if;
      if v_new is distinct from v_val then
        v_data := v_data || jsonb_build_object(v_key, v_new);
        v_converted := v_converted + 1;
      end if;
      if v_data is distinct from r.data then
        update custom.record x set data = v_data
         where x.organization_id = new.organization_id and x.id = r.id;
      end if;
    else
      -- IT DOES NOT CONVERT. The same place, the same shape and the same reason T8's retype
      -- already uses: the value and its envelope are kept in `_retired`, and the key leaves
      -- the document so the record can be written again.
      v_data    := r.data;
      v_retired := coalesce(v_data -> '_retired', '[]'::jsonb);
      if jsonb_typeof(v_retired) <> 'array' then
        v_retired := '[]'::jsonb;
      end if;
      v_retired := v_retired || jsonb_build_object(
        'key',      v_key,
        'label',    v_label,
        'value',    v_val,
        'envelope', v_data -> '_values' -> v_key,
        -- What the column was when this was set aside, so a choice's key comes back as its words.
        'field_then', v_then,
        'reason',   format('%s now holds %s, and %s is not one — this value was kept here when the field changed, neither coerced nor deleted (FLD-4 / T12)',
                           v_label,
                           case when new.data ->> 'type' = 'range'
                                     and custom.said(new.data -> 'config' ->> 'kind', 'number') in ('date','datetime')
                                then 'dates'
                                when new.data ->> 'type' = 'range' then 'numbers'
                                when new.data ->> 'type' = 'boolean' then 'a tick or nothing'
                                when new.data ->> 'type' = 'text' then 'words'
                                when new.data ->> 'type' = 'list' then 'one of its choices'
                                when new.data ->> 'type' = 'relation' then 'a link to a record'
                                else custom.said(new.data ->> 'type', 'something else') end,
                           coalesce('"' || (v_val #>> '{}') || '"', 'that value')),
        'at',       to_jsonb(now()));
      v_data := v_data - v_key;
      if jsonb_typeof(v_data -> '_values') = 'object' then
        v_data := jsonb_set(v_data, '{_values}', (v_data -> '_values') - v_key);
      end if;
      v_data := v_data || jsonb_build_object('_retired', v_retired);
      update custom.record x set data = v_data
       where x.organization_id = new.organization_id and x.id = r.id;
      v_retired_n := v_retired_n + 1;
    end if;
  end loop;

  -- ── DATA-V2-BASICS-2 (2026-09-27): A VALUE SET ASIDE COMES BACK WHEN IT FITS AGAIN. ──────
  -- MEASURED on Harbor Dental's "Operatory Supply Orders": Operatory (Op 1 · Op 2 · Op 3) changed to
  -- a Number set all three aside in `_retired`, and changing it back to Text — by hand or by the
  -- migration's own undo — brought none of them back: the undo patches the Field and this trigger
  -- converted only the values still in place. Now a record with no value for this column takes back
  -- the newest value an earlier change set aside for it, when that value fits what the column now
  -- holds; it leaves `_retired`. Alternates keep their own path above.
  for r in
    select x.id, x.data from custom.record x
     where x.organization_id = new.organization_id
       and x.table_id = v_table
       and x.deleted_at is null
       and not (x.data ? v_key)
       and jsonb_typeof(x.data -> '_retired') = 'array'
       and exists (select 1 from jsonb_array_elements(x.data -> '_retired') e
                    where e ->> 'key' = v_key and not (e ? 'was_an_alternate_ranked'))
  loop
    select t.e, t.ord into v_entry, v_ord
      from jsonb_array_elements(r.data -> '_retired') with ordinality t(e, ord)
     where t.e ->> 'key' = v_key and not (t.e ? 'was_an_alternate_ranked')
     order by t.ord desc
     limit 1;
    v_new := custom._field_value_carry(new.organization_id, coalesce(v_entry -> 'field_then', '{}'::jsonb), new.data, v_entry -> 'value');
    if v_new is null or jsonb_typeof(v_new) = 'null' then
      continue;
    end if;
    v_retired := (select coalesce(jsonb_agg(t.e order by t.ord), '[]'::jsonb)
                    from jsonb_array_elements(r.data -> '_retired') with ordinality t(e, ord)
                   where t.ord <> v_ord);
    v_data := r.data || jsonb_build_object(v_key, v_new);
    v_data := case when jsonb_array_length(v_retired) = 0 then v_data - '_retired'
                   else jsonb_set(v_data, '{_retired}', v_retired) end;
    update custom.record x set data = v_data
     where x.organization_id = new.organization_id and x.id = r.id;
    v_back_n := v_back_n + 1;
  end loop;
  if v_back_n > 0 then
    raise notice 'custom: "%" took back % value(s) an earlier change had set aside, because they fit again.', v_label, v_back_n;
  end if;

  -- 🚨 VIS-2 (2026-09-19) — AND IT WRITES ITS MIGRATION ROW, IN THIS SAME TRANSACTION.
  -- MEASURED: `custom.migrate_retype` records a `history.migration_log` row before it patches
  -- the Field, but the CONVERSION is this trigger's, and this trigger is what runs when the
  -- same Field is retyped through the ordinary write door. So a type change made the normal
  -- way rewrote every value of the table, moved what would not convert into `_retired`, and
  -- left NOTHING in the migration log: HIS-8's undo did not exist for it and the Migrations
  -- screen did not know it had happened. The row is written here, where the rewrite is, so
  -- both routes leave the same trace.
  --
  -- The inverse is the Field's own previous shape, which is a `patch` on the Field record -
  -- the identical inverse `custom.migrate_retype` stores, and `custom.record_update` on the
  -- Field is what puts it back, firing this trigger again to convert the values the other way.
  --
  -- ONE ROW, NOT TWO. When `custom.migrate_retype` is the caller it has already recorded its
  -- row a few statements earlier IN THIS TRANSACTION, and `now()` is the transaction
  -- timestamp, so `applied_at >= now()` is exactly "recorded by this transaction" - it cannot
  -- match an older row and there are no newer ones.
  if not exists (select 1 from history.migration_log m
                  where m.organization_id = new.organization_id
                    and m.verb = 'retype'
                    and m.target_kind = 'field'
                    and m.target_id = new.id
                    and m.applied_at >= now()) then
    perform history.migration_record(
      new.organization_id, 'retype', 'field', new.id,
      jsonb_build_object(
        'kind', 'patch',
        'record_id', new.id::text,
        'patch', jsonb_strip_nulls(jsonb_build_object(
                   'type',   old.data ->> 'type',
                   'config', old.data -> 'config'))),
      format('%s behaves as %s instead of %s; %s value(s) converted, %s kept in _retired with the reason, %s other candidate(s) kept too. Recorded by the conversion itself, so a retype through the ordinary write door leaves the same trace as one through custom.migrate_retype (FLD-4 / T12 / HIS-8).',
             v_label, v_now, v_was, v_converted, v_retired_n, v_alts_retired));
  end if;

  if v_converted > 0 or v_retired_n > 0 or v_alts_retired > 0 then
    raise notice 'custom: "%" changed what it holds (% -> %): % value(s) converted, % kept in _retired with the reason, % other candidate(s) kept too.',
      v_label, v_was, v_now, v_converted, v_retired_n, v_alts_retired;
  end if;
  return null;
end;
$function$;

drop function if exists custom._field_value_carry_base(uuid, jsonb, jsonb, jsonb);
drop function if exists custom._kind_value_fit(jsonb, jsonb, jsonb);
drop function if exists custom._duration_seconds_of(text);
drop function if exists custom._rich_text_problem(text);
drop function if exists custom._entity_decoded(text);
drop function if exists custom.status_groups_keyed(uuid, uuid, jsonb, jsonb, text);
drop function if exists custom._kind_value_ok(jsonb, text, jsonb);
drop function if exists custom._field_kind_shape_ok(jsonb, text);
drop function if exists custom._gs1_check_ok(text);
drop function if exists custom.barcode_symbologies();
drop function if exists custom.status_groups_of(jsonb);
drop function if exists custom._status_group_word(text);
drop function if exists custom.field_kind_of(jsonb);
