-- lock: custom
-- lane: VIEWS-AND-FIELDS
-- based-on: custom._field_document_for(uuid, uuid, jsonb) a146bda96f7b496eb0e9b237a4fd30c85fa2feff45af2ad318ff8e5641492416
-- based-on: custom._field_type_converts_values() c31e16298ea8469b1f6ec6ffdd1f18d7bd20c257fe5ffe4e83e9872d0bb323c1
-- based-on: custom._field_value_carry(uuid, jsonb, jsonb, jsonb) ee7328cc5ddd9664c137fb48994f0b2848cbf7ae57ee5fcb6c246918fa605098
-- based-on: custom._html_element_names() 42d61a37def094e8a99d528e271e6f3bd237c6600647722821d2efb43580af12
-- based-on: custom._kind_value_fit(jsonb, jsonb, jsonb) fd56935bce8dc2408cb1a45a5889f35426afb78104cec3445bbbf52563af5bd9
-- based-on: custom._kind_value_ok(jsonb, text, jsonb) 872bedf659b745e4e2a25da5a636ddc82d18588793166de9c33cb3c65c7cbb8c
-- based-on: custom._retire_values_the_field_refuses(uuid, uuid, jsonb, jsonb) 535bd20a360ac1d03d1af4d7b893b653d063a67faa8b7a1b134f633b6488d2fa
-- based-on: custom._rich_text_problem(text) c837299e2aa1e6ec2ab1038e7788715c1836860ef3f17e6e5fd735fda8523d69
-- based-on: custom._value_envelope() 49a987ff8f0fde9f3711e3ef88f60b66e212b82507ea3be383642b33d4275723
-- based-on: custom._value_fits_field(uuid, uuid, jsonb, jsonb) c248e129ab1b7118a7ec8e82376c06b9741f42b8c0cac9f361167c4400598574
-- based-on: custom.field_update(uuid, uuid, jsonb) 93bfedb5985e1347a12661966f3f7f30755251210092a34e345e4815f565b87f
-- based-on: custom.formula_value(uuid, uuid, jsonb, jsonb) a37a3d5d71bff2011ba099b6a022a184885e7999b6f792a278217ddeb46af9b8
-- based-on: custom.status_groups_keyed(uuid, uuid, jsonb, jsonb, text) d0fa5104a246144cbaffa2b2f52c69723e9484c48328cd9c05cb668da063f3cf
-- based-on: custom.status_groups_of(jsonb) 466e15b026afd54ad19529aaef763ea2bbacee803d2d40c55b43cc43711e1a7d
-- based-on: custom.validate_values(uuid, custom.record[], jsonb, text) 755a2be98be0c6f41f68cc4201061f1c0be23ce9bb10c87a9db7fa9d3022d936
-- ground-standing-ok: b — the order is stated: this inverse puts back P4's own bodies and runs while P4
-- stands; to undo both, run THIS file first and then viewsfields_p4_a_column_can_be_a_rating_a_duration_a_status_an_address_and_five_more_down.sql
-- (which restores custom._field_value_carry before it drops the helpers it calls) — never P4's inverse alone under this file.
-- chair-step: the inverse of viewsfields_p4b_a_rule_that_tightens_never_locks_a_record.sql.
-- It puts back, byte for byte, the twelve bodies as viewsfields_p4_a_column_can_be_a_rating_a_
-- duration_a_status_an_address_and_five_more.sql left them, and drops the three helpers this file
-- added. What it undoes: a tightened rule leaves a record's old value in place again (and that record
-- refuses writes), rich text goes back to P4's check, and the refusals above go back to P4's words.

set local statement_timeout = '60s';

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
       or v_text ~ '[\u00AD\u061C\u180E\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]' then
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
$function$;

CREATE OR REPLACE FUNCTION custom._kind_value_fit(p_to jsonb, p_original jsonb, p_value jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_format text := p_to ->> 'format';
  v_out    jsonb := p_value;
  v_items  jsonb;
  v_one    jsonb;
  v_secs   numeric;
begin
  if coalesce(v_format, '') not in ('address', 'rating', 'duration', 'barcode', 'rich_text') then
    return p_value;
  end if;
  if p_value is null then
    if v_format = 'duration' and jsonb_typeof(p_original) = 'string' then
      v_secs := custom._duration_seconds_of(p_original #>> '{}');
      if v_secs is null then return null; end if;
      v_out := to_jsonb(v_secs);
    else
      return null;
    end if;
  end if;
  if jsonb_typeof(v_out) = 'null' then
    return v_out;
  end if;
  if v_format = 'address' and jsonb_typeof(v_out) = 'string' then
    if btrim(v_out #>> '{}') = '' then return 'null'::jsonb; end if;
    v_out := jsonb_build_object('street', left(btrim(v_out #>> '{}'), 200));
  end if;
  v_items := case when jsonb_typeof(v_out) = 'array' then v_out else jsonb_build_array(v_out) end;
  for v_one in select x from jsonb_array_elements(v_items) x loop
    if v_format in ('rich_text', 'barcode') and jsonb_typeof(v_one) <> 'string' then
      return null;
    end if;
    if v_format in ('rating', 'duration') and jsonb_typeof(v_one) <> 'number' then
      return null;
    end if;
    begin
      perform custom._kind_value_ok(p_to, coalesce(nullif(p_to ->> 'label', ''), 'this column'), v_one);
    exception when sqlstate '23514' then
      return null;
    end;
  end loop;
  return v_out;
end;
$function$;

CREATE OR REPLACE FUNCTION custom._rich_text_problem(p_text text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v text := coalesce(p_text, '');
  m text[];
  d text;
begin
  if v ~ '<[A-Za-z][A-Za-z0-9-]*(\s+[A-Za-z_:][A-Za-z0-9_.:-]*(\s*=\s*([^\s"''=<>`]+|''[^'']*''|"[^"]*"))?)*\s*/?>'
     or v ~ '</[A-Za-z][A-Za-z0-9-]*\s*>'
     or v ~ '<!--' or v ~ '<\?' or v ~ '<![A-Za-z]' or v ~ '<!\[CDATA\[' then
    return 'html';
  end if;
  for m in
    select regexp_matches(v, '\]\(\s*<?([^)>\s]*)', 'g')
    union all
    select regexp_matches(v, '(?:^|\n)[ ]{0,3}\[[^\]\n]+\]:[ \t]*\n?[ \t]*<?([^>\s]+)', 'g')
    union all
    select regexp_matches(v, '<([A-Za-z][A-Za-z0-9+.-]{1,31}:[^<>\s]*)>', 'g')
  loop
    d := lower(regexp_replace(custom._entity_decoded(m[1]), '[\s[:cntrl:]]', '', 'g'));
    if d ~ '^[a-z][a-z0-9+.-]*:' and d !~ '^(https?|mailto|tel):' then
      return 'link';
    end if;
  end loop;
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.status_groups_of(p_groups jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_out   jsonb := '{}'::jsonb;
  e       record;
  x       jsonb;
  v_group text;
begin
  if p_groups is null or jsonb_typeof(p_groups) = 'null' then
    return '{}'::jsonb;
  end if;
  if jsonb_typeof(p_groups) <> 'object' then
    raise exception 'A status column''s groups say which choices are to do, in progress and done, and these are a %.', jsonb_typeof(p_groups)
      using errcode = '23514',
            hint = 'P4: status_groups is {"Not started": "todo", "In progress": "in_progress", "Done": "done"}, or {"done": ["Done", "Cancelled"]}. Nothing was written.';
  end if;
  for e in select key, value from jsonb_each(p_groups) loop
    v_group := custom._status_group_word(e.key);
    if v_group is not null and jsonb_typeof(e.value) = 'array' then
      for x in select value from jsonb_array_elements(e.value) loop
        if jsonb_typeof(x) <> 'string' or btrim(x #>> '{}') = '' then
          raise exception 'A status group lists its choices by their words, and "%" lists %.', e.key, x::text
            using errcode = '23514', hint = 'P4: {"done": ["Done", "Cancelled"]}. Nothing was written.';
        end if;
        v_out := v_out || jsonb_build_object(btrim(x #>> '{}'), v_group);
      end loop;
    else
      v_group := case when jsonb_typeof(e.value) = 'string' then custom._status_group_word(e.value #>> '{}') end;
      if v_group is null then
        raise exception 'A status choice is to do, in progress or done, and "%" is put in %.', e.key,
                        case when jsonb_typeof(e.value) = 'string' then format('"%s"', e.value #>> '{}') else jsonb_typeof(e.value) end
          using errcode = '23514', hint = 'P4: the three groups are todo, in_progress and done. Nothing was written.';
      end if;
      v_out := v_out || jsonb_build_object(btrim(e.key), v_group);
    end if;
  end loop;
  return v_out;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.status_groups_keyed(p_organization_id uuid, p_options_table_id uuid, p_groups jsonb, p_kept jsonb, p_label text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_opts jsonb := case when p_options_table_id is null then '{}'::jsonb
                       else custom.choice_options(p_organization_id, p_options_table_id) end;
  v_out  jsonb := '{}'::jsonb;
  e      record;
  v_key  text;
begin
  if p_groups is null or jsonb_typeof(p_groups) <> 'object' then
    return '{}'::jsonb;
  end if;
  for e in
    select g.key as name, g.value as grp,
           coalesce(p_kept is not null and jsonb_typeof(p_kept) = 'object' and p_kept -> g.key = g.value, false) as kept
      from jsonb_each(p_groups) g
     order by 3 desc, 1
  loop
    v_key := null;
    select o.key into v_key
      from jsonb_each(v_opts) o
     where o.key = e.name
        or o.value ->> 'id' = e.name
        or lower(btrim(o.value ->> 'label')) = lower(btrim(e.name))
     order by (o.key = e.name) desc, (o.value ->> 'id' = e.name) desc,
              coalesce((o.value ->> 'retired')::boolean, false)
     limit 1;
    if v_key is null then
      if e.kept then
        continue;                                 -- its choice is gone; so is its group
      end if;
      raise exception 'The status "%" has no choice called "%", so it cannot put it in a group.', p_label, e.name
        using errcode = '23514', hint = 'P4: name a choice of this column by its words, its key or its id. Nothing was written.';
    end if;
    if coalesce((v_opts -> v_key ->> 'retired')::boolean, false) then
      continue;                                   -- a removed choice keeps no group
    end if;
    v_out := v_out || jsonb_build_object(v_key, e.grp);
  end loop;
  return v_out;
end;
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
    'via', 'pick', 'agg', 'of', 'filter',
    -- LANE 10 P4: a status column's groups and a barcode column's symbology.
    'status_groups', 'symbology'];
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
      'display_format', coalesce(p_patch -> 'display_format', v_old -> 'display_format'),
      -- LANE 10 P4: carried like every other setting, so a status keeps its groups and a barcode
      -- its symbology when the column is saved through its kind.
      'status_groups',  coalesce(p_patch -> 'status_groups', v_old -> 'config' -> 'status_groups'),
      'symbology',      coalesce(p_patch -> 'symbology', v_old -> 'config' -> 'symbology')));
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
  -- LANE 10 P4: a status column's groups, and a barcode column's symbology, changed in place.
  -- custom._field_kind_shape_ok refuses either on a column that is not that kind, by name.
  if p_patch ? 'status_groups' then
    -- V8 #3: MERGED into the groups the column holds, never replacing them; the Field guard keys
    -- each name to its choice, refuses a name that is no choice, and drops removed choices.
    v_next := jsonb_set(v_next, '{config,status_groups}',
                coalesce(case when jsonb_typeof(v_old -> 'config' -> 'status_groups') = 'object'
                              then v_old -> 'config' -> 'status_groups' end, '{}'::jsonb)
                || custom.status_groups_of(p_patch -> 'status_groups'));
  end if;
  if p_patch ? 'symbology' then
    v_next := case when nullif(btrim(coalesce(p_patch ->> 'symbology', '')), '') is null
                   then v_next #- '{config,symbology}'
                   else jsonb_set(v_next, '{config,symbology}', to_jsonb(lower(btrim(p_patch ->> 'symbology')))) end;
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

CREATE OR REPLACE FUNCTION custom.formula_value(p_organization_id uuid, p_record_id uuid, p_field_data jsonb, p_values jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_values jsonb;
  v_who    uuid;
  v_env    jsonb;
  v_born   timestamptz;
  v_rec    custom.record;
  v_rtype  text;
  v_tf     text;
  v_key    text;
  v_keys   text[];
begin
  -- LANE 10 P4: WHO MADE IT AND WHO LAST CHANGED IT, the way Created time and Last changed time
  -- are filled: from the record's own stamps (custom.record.created_by / updated_by, which
  -- platform._stamp_actor writes from the writing actor), on read, never typed. The value is
  -- {id, name, actor}: the name is the organization's own (custom.history_people, the namer
  -- comments and history use), null for somebody who is not a member of it.
  -- V8 #4: WHO WROTE IS ALSO WHICH KIND OF WRITER. A system or an agent write leaves
  -- custom.record.updated_by naming the person before it; the write's own tier is on its values'
  -- envelopes (`_values.<key>.actor`: user, agent or system, with `on_behalf_of` for an agent).
  -- Last changed by reads the latest envelope; Created by the envelope stamped when the record was
  -- made. A system write answers {id: null, name: null, actor: "system"}; an agent's answers
  -- actor "agent" with the person it wrote for.
  if (p_field_data -> 'config' ->> 'system') in ('created_by', 'modified_by') then
    select case when (p_field_data -> 'config' ->> 'system') = 'created_by' then r.created_by else r.updated_by end,
           r.created_at,
           (select e.value from jsonb_each(case when jsonb_typeof(r.data -> '_values') = 'object' then r.data -> '_values' else '{}'::jsonb end) e
             where jsonb_typeof(e.value) = 'object' and e.value ? 'actor' and e.value ? 'at'
               -- Created by: a value first written (ver 1), the earliest. Last changed by: the latest
               -- write, and of writes in one moment the one with the most versions behind it.
               and ((p_field_data -> 'config' ->> 'system') = 'modified_by' or coalesce(e.value ->> 'ver', '1') = '1')
             order by case when (p_field_data -> 'config' ->> 'system') = 'created_by' then (e.value ->> 'at')::timestamptz end asc,
                      case when (p_field_data -> 'config' ->> 'system') = 'modified_by' then (e.value ->> 'at')::timestamptz end desc,
                      case when (p_field_data -> 'config' ->> 'system') = 'modified_by' then coalesce((e.value ->> 'ver')::numeric, 1) end desc
             limit 1)
      into v_who, v_born, v_env
      from custom.record r
     where r.organization_id = p_organization_id
       and r.id = p_record_id;
    -- A Created by envelope counts only when it was stamped as the record was made.
    if (p_field_data -> 'config' ->> 'system') = 'created_by' and v_env is not null
       and abs(extract(epoch from ((v_env ->> 'at')::timestamptz - v_born))) > 5 then
      v_env := null;
    end if;
    if v_env ->> 'actor' = 'system' then
      return jsonb_build_object('id', null, 'name', null, 'actor', 'system');
    end if;
    if v_env ->> 'actor' = 'agent' then
      v_who := coalesce(nullif(v_env ->> 'on_behalf_of', '')::uuid, v_who);
      return jsonb_build_object('id', v_who, 'actor', 'agent',
                                'name', case when v_who is not null then custom.history_people(p_organization_id, array[v_who]) -> v_who::text -> 'name' end);
    end if;
    if v_who is null then
      return 'null'::jsonb;
    end if;
    return jsonb_build_object('id', v_who, 'actor', 'user',
                              'name', custom.history_people(p_organization_id, array[v_who]) -> v_who::text -> 'name');
  end if;
  v_values := coalesce(p_values, custom.record_values(p_organization_id, p_record_id));
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
      -- LANE 10 P4: a value of one of the newer kinds is judged by its kind first. An address is
      -- judged whole (it is a set of parts, not words); the others go on to their behaviour's
      -- check and their Rules below.
      if (d ->> 'format') in ('address', 'rating', 'duration', 'barcode', 'rich_text')
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
$function$;

CREATE OR REPLACE FUNCTION custom._field_value_carry(p_organization_id uuid, p_from jsonb, p_to jsonb, p_value jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  -- ONE VALUE, CARRIED FROM WHAT A COLUMN WAS TO WHAT IT IS NOW (DATA-V2-BASICS-2). The carry by
  -- behaviour is custom._field_value_carry_base, unchanged; LANE 10 P4 (verifier V8 #1) fits its
  -- answer to the newer kinds (custom._kind_value_fit): converted where it can be, SQL null — kept
  -- in `_retired` with its reason by the caller — where it cannot, so no change of kind leaves a
  -- value in place that the column then refuses.
  select custom._kind_value_fit(p_to, p_value,
                                custom._field_value_carry_base(p_organization_id, p_from, p_to, p_value));
$function$;

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

CREATE OR REPLACE FUNCTION custom._value_envelope()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_data     jsonb := coalesce(new.data, '{}'::jsonb);
  v_actor    text;
  v_obo      text;
  v_refusal  text;
  v_values   jsonb;
  v_key      text;
  v_declared boolean;
  v_type_fld text;
  v_rtype    text;
  v_src      text;
  v_agent    text[] := '{}'::text[];   -- ENRICH: the keys of this Table a model owns
  -- KINDS-GLUE N-C3: the platform Fields of a Table kept for agent outputs (config.kept_by = agent_output),
  -- key -> {label, default}, read in the same walk of the applicable Fields.
  v_platform jsonb := '{}'::jsonb;
  v_kept_by  text;
  v_flabel   text;
  v_fdefault jsonb;
  v_pkey     text;
  -- BIG-VALUES-WRITE: the text values over the ceiling this write carries into files.
  v_whole    jsonb := '{}'::jsonb;     -- key -> the whole text the writer supplied
  v_park     jsonb := '{}'::jsonb;     -- key -> the whole text that still needs its file
  v_ceiling  bigint;
  v_text     text;
  v_prior    jsonb;
  v_carry    jsonb;
begin
  -- THE DOOR. The thirteenth and last RETURNS trigger in this schema to read the ONE
  -- predicate, which judges custom.caller_role() and never current_user. custom/system_enabled
  -- decides WHO may write and never which check runs.
  perform custom.assert_store_door(new.organization_id, 'custom.record');

  -- A WRITE THAT ASSERTS NO VALUE HAS NO AUTHOR TO JUDGE (lane AGENT, 2026-09-19).
  -- MEASURED: a real agent turn wrote twenty records and could not delete ONE of them.
  -- custom.record_delete does `update custom.record set deleted_at = now()`, which fires
  -- this trigger over the UNCHANGED document; the document names no `_actor`, so
  -- custom.actor_word falls back to the connection's declaration ('agent'), and the
  -- forward arm below then refuses because nothing names the person the agent acts for —
  -- and nothing CAN, because a delete carries no document to put `_on_behalf_of` in and
  -- there is no GUC for it. So every agent delete, restore and reparent of a business
  -- record was refused, by a check about authorship, on a statement that authors nothing.
  --
  -- The condition is exactly that: an UPDATE whose `data` is not distinct from the row's
  -- existing `data` asserts no Value, so there is no new authorship to record and the
  -- authorship already stored stays exactly as it was. Every check below still runs, in
  -- full, on every statement that DOES change the document. This cannot widen anything:
  -- a write that changes no data could not have carried a value to mis-author.
  if TG_OP = 'UPDATE' and old.data is not distinct from new.data then
    return new;
  end if;

  -- A TEXT VALUE OF ANY SIZE SIMPLY SAVES (lane BIG-VALUES-WRITE, 2026-09-25). The owner:
  -- "Make sure that large data size is easy for users." A business record's text value over
  -- this organization's ceiling for one value (custom/value_max_bytes) is no longer refused:
  -- the cell keeps its first 1000 characters, and the whole text is carried into a file by
  -- the ONE rule the table mover already uses (matrx_records.big_values) - here it waits in
  -- custom.whole_value_parked until its file is written (below, and custom.whole_value_complete).
  -- The ceiling below then judges what the cell really holds. A definition row, a JSON value
  -- and a value on a key that is not one of the Table's Fields keep the refusal.
  if new.data_class = 'record'
     and new.table_id is not null
     and new.table_id <> custom.table_kernel_id()
     and new.table_id <> custom.field_kernel_id() then
    v_ceiling := custom.whole_value_ceiling(new.organization_id);
    for v_key, v_text in
      select e.key, e.value #>> '{}'
        from jsonb_each(v_data) e
       where left(e.key, 1) <> '_' and jsonb_typeof(e.value) = 'string'
         and octet_length(e.value::text) > v_ceiling
    loop
      -- Held OFF by the store's own switch (custom/system_enabled): an organization whose store
      -- is not on keeps the refusal below, exactly as before this file.
      -- CHAIR-ALWAYS-ON 2026-10-03: the store switch is retired; the store is always on, so no exit here.
      v_whole := v_whole || jsonb_build_object(v_key, v_text);
      v_data := jsonb_set(v_data, array[v_key], to_jsonb(custom.whole_value_head(v_text)));
    end loop;
  end if;

  -- THE CEILING (finding 4), over what the WRITER supplied, before anything else touches
  -- the document.
  v_refusal := custom.size_refusal(new.organization_id, v_data);
  if v_refusal is not null then
    raise exception '%', v_refusal
      using errcode = '23514',
            hint = 'The ceilings are custom/value_max_bytes and custom/document_max_bytes - organization-settable knobs with published defaults, not constants. A value too big to live in the record lives as a record of this store''s File table, and the value points at it.';
  end if;

  v_declared := v_data ? '_values' or v_data ? '_sources' or v_data ? '_actor' or v_data ? '_on_behalf_of';

  -- WHO OPENS THE ENVELOPE (finding 2). A business document always gets one, whether or not
  -- its writer opened it; a DEFINITION row (kernel, table, field, rule, merge_field,
  -- relation) is the shape of the store rather than a set of asserted Values, and keeps its
  -- prior behaviour exactly - nothing to do unless it declared something itself.
  if new.data_class is distinct from 'record' and not v_declared then
    return new;
  end if;

  v_actor := custom.actor_word(v_data ->> '_actor');
  v_obo   := nullif(btrim(coalesce(v_data ->> '_on_behalf_of', '')), '');
  -- DATA-V2-BASICS-2 (2026-09-29): AN AGENT ACTING FOR A PERSON CARRIES THAT PERSON. When the document
  -- does not say who wrote it, the author is the connection's declaration (custom.actor_word above)
  -- — and so is the person: the connection is signed in AS the person the agent acts for (the server's
  -- acting_as, the same principal the held-write card carries). The records a store door writes for an
  -- agent (a choice column's choices, a board's rules) used to be refused "does not say who the agent is
  -- acting for" whenever custom/agent_schema_changes let the agent write without asking. A document that
  -- DECLARES itself an agent still names its person itself.
  if v_obo is null and v_actor = 'agent' and nullif(btrim(coalesce(v_data ->> '_actor', '')), '') is null then
    v_obo := nullif(btrim(coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')), '');
  end if;
  if v_obo is not null and v_actor <> 'agent' then
    raise exception 'This write says it is on behalf of somebody, and its author is a %. Only an agent acts on behalf of a person.', v_actor
      using errcode = '22023';
  end if;
  -- THE FORWARD ARM (finding 3). The converse above was built; this one was not, so an agent
  -- write naming nobody landed unremarked.
  if v_actor = 'agent' and v_obo is null then
    raise exception 'This write says an agent wrote it, and does not say who the agent is acting for. An agent always acts on behalf of a person.'
      using errcode = '22004',
            hint = 'Put "_on_behalf_of" in the record with that person''s id. Work the platform does for nobody in particular is written by "system" - that is what the third word in the vocabulary is for. The vocabulary is exactly user, agent, system.';
  end if;

  -- The declaration is a fact about the WRITE, not content of the record.
  v_data := v_data - '_actor' - '_on_behalf_of';

  -- A VALUE IS A FIELD'S VALUE. The envelope is opened over the APPLICABLE FIELDS of this
  -- record's Table - the same set custom._record_field_validation validates against, chosen
  -- by the record's own type field where the Table has one - and never over the document's
  -- other keys, which carry structure rather than assertions. custom.validate_value_envelope
  -- refuses an envelope on a key that is not a declared Field, and it is right to.
  if new.data_class = 'record'
     and new.table_id is not null
     and new.table_id <> custom.table_kernel_id()
     and new.table_id <> custom.field_kernel_id() then
    v_type_fld := custom.table_type_field(new.organization_id, new.table_id);
    if v_type_fld is not null then
      v_rtype := v_data ->> v_type_fld;
    end if;
    v_values := coalesce(v_data -> '_values', '{}'::jsonb);
    if jsonb_typeof(v_values) <> 'object' then
      v_values := '{}'::jsonb;        -- the envelope law below refuses the malformed block by name
    end if;
    -- ENRICH, 2026-09-20: THE SAME LOOP NOW ALSO ANSWERS "WHO OWNS THIS COLUMN".
    -- A Field whose `source` is `agent` is a column an enrichment fills (AGT-6). Reading it
    -- here costs nothing - the Field rows are already being walked - and it is what lets the
    -- rule below pin a cell the moment a PERSON types over one of them.
    for v_key, v_src, v_kept_by, v_flabel, v_fdefault in
                        select f.data ->> 'key', f.data ->> 'source', f.data -> 'config' ->> 'kept_by',
                               coalesce(nullif(btrim(f.data ->> 'label'), ''), f.data ->> 'key'), f.data -> 'default'
                          from custom.applicable_fields(new.organization_id, new.table_id, v_rtype) f
    loop
      if v_key is not null and v_data ? v_key and not (v_values ? v_key) then
        v_values := v_values || jsonb_build_object(v_key, '{}'::jsonb);
      end if;
      if v_key is not null and v_src = 'agent' then
        v_agent := v_agent || v_key;
      end if;
      if v_key is not null and v_kept_by = 'agent_output' then
        v_platform := v_platform || jsonb_build_object(v_key, jsonb_build_object('label', v_flabel, 'default', v_fdefault));
      end if;
    end loop;

    -- KINDS-GLUE N-C3 (CHAIR-DOORS-2): ON A TABLE KEPT FOR AGENT OUTPUTS, A PERSON NEVER WRITES THE
    -- PLATFORM FIELDS, AND A PERSON'S EDIT MARKS THE ROW KEPT. The platform Fields (output_state,
    -- output_chain, output_generation, output_replaced_by, output_reason, ...) say where an output stands
    -- in its chain; only the chain door custom.record_write_graph_superseding moves them, and it opens
    -- itself for exactly its own transaction (custom.output_chain_door = this transaction's id), so a
    -- person's Make current / Keep both through that door is the door's write, not hers. The one
    -- platform Field a person sets herself is output_kept = true: keeping is the owner's own mark.
    -- Any other value a person writes on such a row (or a row she adds) marks it kept, so the next
    -- regeneration never hides or overwrites her work (knob records/agent_outputs.keep_on_person_edit,
    -- default on, per organization and Table). A person's own import counts as hers: the importer
    -- stamps imported values `system` (they came from a file), so a row it adds in a person's browser
    -- session (the connection says user, the document says it came via import) is judged as her write.
    if v_platform <> '{}'::jsonb
       and (v_actor = 'user'
            or (v_data -> '_source' ->> 'via' = 'import' and platform.declared_actor_tier() is not distinct from 'user'))
       and coalesce(current_setting('custom.output_chain_door', true), '') is distinct from txid_current()::text then
      for v_pkey in select k from jsonb_object_keys(v_platform) k loop
        if v_pkey = 'output_kept' and (v_data -> v_pkey) = 'true'::jsonb then
          continue;
        end if;
        if (tg_op = 'UPDATE' and (v_data -> v_pkey) is distinct from (old.data -> v_pkey))
           or (tg_op = 'INSERT' and coalesce(v_data -> v_pkey, 'null'::jsonb) <> 'null'::jsonb
               and (v_data -> v_pkey) is distinct from (v_platform -> v_pkey -> 'default')) then
          raise exception '"%" is kept by the app, so it is not yours to change.', v_platform -> v_pkey ->> 'label'
            using errcode = '42501',
                  hint = 'Nothing was saved. Where an output stands in its chain changes only through its own actions (Make current, Keep both, It replaces...). Edit the output''s values instead, and it is kept as yours.';
        end if;
      end loop;
      if v_platform ? 'output_kept'
         and (v_data -> 'output_kept') is distinct from 'true'::jsonb
         and (tg_op = 'INSERT'
              or exists (select 1 from jsonb_each(v_data) e
                          where left(e.key, 1) <> '_' and not (v_platform ? e.key)
                            and (old.data -> e.key) is distinct from e.value))
         and coalesce((platform.knob_resolve('records', 'agent_outputs.keep_on_person_edit', new.organization_id, null,
                         jsonb_build_array(jsonb_build_object('kind', 'table', 'id', new.table_id))) #>> '{}')::boolean, true) then
        v_data := v_data || jsonb_build_object('output_kept', true);
        if not (v_values ? 'output_kept') then
          v_values := v_values || jsonb_build_object('output_kept', '{}'::jsonb);
        end if;
      end if;
    end if;
    if v_values <> '{}'::jsonb or v_data ? '_values' then
      v_data := jsonb_set(v_data, '{_values}', v_values);
    end if;
  end if;

  -- BIG-VALUES-WRITE: each carried value's envelope names its whole text. The SAME whole text
  -- the cell's file already holds (same SHA-256) keeps that pointer, so re-saving it is not a
  -- new version; any other text gets a pending pointer and waits for its file.
  for v_key, v_text in select e.key, e.value #>> '{}' from jsonb_each(v_whole) e loop
    if coalesce(jsonb_typeof(v_data -> '_values' -> v_key), '') <> 'object' then
      raise exception '%', custom.size_refusal(new.organization_id,
                                               jsonb_build_object(v_key, v_whole -> v_key))
        using errcode = '23514',
              hint = 'Only a Field of this Table carries a big text into a file. Declare the Field, then write it again.';
    end if;
    v_prior := null;
    if tg_op = 'UPDATE' then
      v_prior := old.data -> '_sources' -> (old.data -> '_values' -> v_key ->> 'src');
    end if;
    v_carry := custom.whole_value_source(v_text, v_data -> '_values' -> v_key -> 'src');
    if v_prior is not null and v_prior ->> 'kind' = 'whole_value_in_file'
       and v_prior ->> 'sha256' = v_carry ->> 'sha256' then
      v_data := jsonb_set(v_data, array[v_key], old.data -> v_key);
      v_data := jsonb_set(v_data, array['_values', v_key, 'src'], v_prior);
    else
      v_data := jsonb_set(v_data, array['_values', v_key, 'src'], v_carry);
      v_park := v_park || jsonb_build_object(v_key, v_text);
    end if;
  end loop;

  v_data := custom.intern_provenance(v_data);
  v_data := custom.stamp_value_envelopes(v_data, v_actor, v_obo, now());
  v_data := custom.value_versions(case when tg_op = 'UPDATE' then old.data else '{}'::jsonb end, v_data);
  -- ENRICH: A PERSON'S EDIT OF AN AGENT-OWNED CELL PINS IT, THROUGH EVERY DOOR AT ONCE —
  -- AND ONLY THE CELL THEY ACTUALLY EDITED. This runs AFTER custom.value_versions on
  -- purpose: `custom.stamp_value_envelopes` puts the writer's word on EVERY envelope in the
  -- document, so before the version is decided there is no way to tell the value a person
  -- just typed from the forty others the same write left alone. The version IS that
  -- distinction, already computed, and asking it a second way is how the two would drift.
  v_data := custom.pin_agent_cells(v_data,
              case when tg_op = 'UPDATE' then old.data else '{}'::jsonb end, v_agent);
  -- ENRICH: AND A VALUE NOBODY RE-ASSERTED KEEPS ITS OWN MOMENT AND ITS OWN AUTHOR.
  v_data := custom.carry_unchanged_value_stamps(
              case when tg_op = 'UPDATE' then old.data else '{}'::jsonb end, v_data);

  v_refusal := custom.value_envelope_refusal(v_data);
  if v_refusal is not null then
    raise exception '%', v_refusal
      using errcode = '23514', hint = 'VAL-1..VAL-8: a value carries its source, its author, its reason for being missing and its other candidates, inside this record''s one document.';
  end if;

  new.data := v_data;

  -- BIG-VALUES-WRITE: the whole texts that still need their file wait beside the record, in
  -- the same transaction - so a refused write leaves nothing waiting.
  if v_park <> '{}'::jsonb then
    perform custom.whole_value_park(new.organization_id, new.table_id, new.id,
                                    coalesce(new.created_by, custom.query_principal()),
                                    new.visibility, v_data, v_park);
  end if;
  return new;
end;
$function$;

drop function if exists custom._retire_values_the_field_refuses(uuid, uuid, jsonb, jsonb);
drop function if exists custom._value_fits_field(uuid, uuid, jsonb, jsonb);
drop function if exists custom._html_element_names();
