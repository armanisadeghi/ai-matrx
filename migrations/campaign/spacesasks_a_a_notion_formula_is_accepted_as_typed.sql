-- target: branch,production
-- additive: yes
-- ADDITIVE + ONE BODY REPLACED: Notion's formula syntax is accepted wherever a person types a formula. A formula that
--   names a column the Notion way — `prop("Budget") * 2`, `if(prop("Status") == "Done", 1, 0)` — is translated into
--   the store's own words ({Budget} * 2, IF(({Status} = "Done"), 1, 0)) by ONE translator, `custom.formula_translate_notion`
--   (the Notion importer's mapping, moved into the store: tokenizer + precedence parser + emitter, same functions, same
--   refusals), and `custom.formula_parse` runs it before its own parser. Because field_declare / field_update, the
--   formula editor's check and `custom.formula_preview` all parse through `custom.formula_parse`, every one of them
--   accepts Notion's syntax with no second copy. A Notion function the store has no word for is refused naming it.
--   Adds: custom._nfx_tokens, _nfx_call, _nfx_bin, _nfx_arglist, _nfx_primary, _nfx_unary, _nfx_expr,
--   custom.formula_translate_notion (internal: not a client door, no grant). Replaces: custom.formula_parse
--   (same signature, same answers for every text without `prop(`). Nothing stored is rewritten.
--   Locks: pg_proc rows.
--   Inverse: migrations/inverse/spacesasks_a_a_notion_formula_is_accepted_as_typed_down.sql
-- guard: custom/system_enabled
-- lock: custom
-- lane: SPACES-ASKS
-- based-on: custom.formula_parse(uuid, uuid, text) eb6ebb63fb763a2db5bcf1a39695685b024364736d1fcab2705667920e16a2ff

create function custom._nfx_tokens(p_src text)
returns jsonb
language plpgsql
immutable
set search_path to 'pg_catalog'
as $fn$
declare
  v_out jsonb := '[]'::jsonb;
  i integer := 1;
  j integer;
  n integer := char_length(p_src);
  ch text;
  v_txt text;
  v_q text;
  v_closed boolean;
  v_two text;
  v_dot boolean;
begin
  while i <= n loop
    ch := substr(p_src, i, 1);
    if ch ~ '\s' then i := i + 1; continue; end if;
    if ch in ('"', '''') then
      v_q := ch; j := i + 1; v_txt := ''; v_closed := false;
      while j <= n loop
        if substr(p_src, j, 1) = '\' and j + 1 <= n then
          v_txt := v_txt || case substr(p_src, j + 1, 1) when 'n' then E'\n' when 't' then E'\t' else substr(p_src, j + 1, 1) end;
          j := j + 2; continue;
        end if;
        if substr(p_src, j, 1) = v_q then v_closed := true; j := j + 1; exit; end if;
        v_txt := v_txt || substr(p_src, j, 1); j := j + 1;
      end loop;
      if not v_closed then
        raise exception 'a piece of text is missing its closing quote' using errcode = '22023';
      end if;
      v_out := v_out || jsonb_build_array(jsonb_build_object('k', 'str', 'v', v_txt));
      i := j; continue;
    end if;
    if ch ~ '[0-9]' or (ch = '.' and substr(p_src, i + 1, 1) ~ '[0-9]') then
      j := i; v_dot := false;
      while j <= n loop
        if substr(p_src, j, 1) ~ '[0-9]' then j := j + 1; continue; end if;
        if substr(p_src, j, 1) = '.' and not v_dot and substr(p_src, j + 1, 1) ~ '[0-9]' then v_dot := true; j := j + 1; continue; end if;
        exit;
      end loop;
      v_out := v_out || jsonb_build_array(jsonb_build_object('k', 'num', 'v', substr(p_src, i, j - i)));
      i := j; continue;
    end if;
    if ch ~ '[A-Za-z_]' then
      j := i;
      while j <= n and substr(p_src, j, 1) ~ '[A-Za-z0-9_]' loop j := j + 1; end loop;
      v_out := v_out || jsonb_build_array(jsonb_build_object('k', 'id', 'v', substr(p_src, i, j - i)));
      i := j; continue;
    end if;
    v_two := substr(p_src, i, 2);
    if v_two in ('==', '!=', '<=', '>=', '&&', '||') then
      v_out := v_out || jsonb_build_array(jsonb_build_object('k', 'op', 'v', v_two));
      i := i + 2; continue;
    end if;
    if ch in ('-', '+', '*', '/', '%', '^', '<', '>', '!', '(', ')', ',', '.', '?', ':') then
      v_out := v_out || jsonb_build_array(jsonb_build_object('k', 'op', 'v', ch));
      i := i + 1; continue;
    end if;
    raise exception 'the character "%" is not part of Notion formula syntax', ch using errcode = '22023';
  end loop;
  return v_out || jsonb_build_array(jsonb_build_object('k', 'end', 'v', ''));
end
$fn$;

comment on function custom._nfx_tokens(text) is 'SPACES-ASKS: tokenizer of Notion formula text (internal; part of custom.formula_translate_notion).';

-- column type word -> text | number | boolean | date | any
create function custom._nfx_colkind(p_type text)
returns text
language sql
immutable
set search_path to 'pg_catalog'
as $fn$
  select case
    when p_type in ('text', 'long_text', 'rich_text', 'email', 'url', 'phone', 'choice', 'status') then 'text'
    when p_type in ('number', 'integer', 'decimal', 'currency', 'percent', 'rating', 'duration', 'autonumber') then 'number'
    when p_type = 'checkbox' then 'boolean'
    when p_type in ('date', 'datetime', 'created_time', 'modified_time') then 'date'
    else 'any' end
$fn$;

-- One call: p_args is an array of nodes {s: emitted text, k: kind, lit?: raw literal text, n?: [notes]}.
create function custom._nfx_call(p_name text, p_args jsonb, p_types jsonb)
returns jsonb
language plpgsql
immutable
set search_path to 'pg_catalog'
as $fn$
declare
  low text := lower(p_name);
  c integer := jsonb_array_length(p_args);
  a jsonb[] := array(select e from jsonb_array_elements(p_args) e);
  notes jsonb := (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(p_args) e, jsonb_array_elements(coalesce(e -> 'n', '[]'::jsonb)) x);
  s text;
  k text := 'any';
  v_lit text;
  v_unit text;
  v_key text;
  v_spec text[];
  v_factor integer;
  v_n text;
  v_all text;
  i integer;
begin
  select string_agg(e ->> 's', ', ' order by ord) into v_all from jsonb_array_elements(p_args) with ordinality t(e, ord);

  if low = 'prop' then
    if c <> 1 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    v_lit := a[1] ->> 'lit';
    if v_lit is null then raise exception 'prop() names its column with something other than plain text' using errcode = '22023'; end if;
    if position('}' in v_lit) > 0 or position('{' in v_lit) > 0 then
      raise exception 'the column name "%" holds a brace, which a formula cannot name', v_lit using errcode = '22023';
    end if;
    return jsonb_build_object('s', '{' || v_lit || '}', 'k', custom._nfx_colkind(p_types ->> v_lit), 'n', notes);
  end if;

  if low = 'if' then
    if c not between 2 and 3 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    s := 'IF(' || v_all || ')'; k := 'any';
  elsif low = 'ifs' then
    if c < 3 or c % 2 = 0 then
      raise exception 'ifs() needs pairs of condition and value, then a last value' using errcode = '22023';
    end if;
    s := a[c] ->> 's';
    i := c - 2;
    while i >= 1 loop
      s := 'IF(' || (a[i] ->> 's') || ', ' || (a[i + 1] ->> 's') || ', ' || s || ')';
      i := i - 2;
    end loop;
    k := 'any';
  elsif low in ('and', 'or') then
    if c < 2 then raise exception '%() needs two or more conditions', p_name using errcode = '22023'; end if;
    s := upper(low) || '(' || v_all || ')'; k := 'boolean';
  elsif low = 'not' then
    if c <> 1 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    s := 'NOT(' || v_all || ')'; k := 'boolean';
  elsif low = 'concat' then
    if c = 0 then raise exception 'concat() has nothing to join' using errcode = '22023'; end if;
    s := 'CONCATENATE(' || v_all || ')'; k := 'text';
  elsif low in ('format', 'tostring') then
    if c <> 1 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    s := 'CONCATENATE(' || v_all || ')'; k := 'text';
  elsif low = 'contains' then
    if c <> 2 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    notes := notes || to_jsonb('contains(): the table''s CONTAINS ignores upper/lower case; Notion''s does not.'::text);
    s := 'CONTAINS(' || v_all || ')'; k := 'boolean';
  elsif low in ('replace', 'replaceall') then
    if c <> 3 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    v_lit := a[2] ->> 'lit';
    if v_lit is null or v_lit ~ '[\\^$.|?*+()\[\]{}]' then
      raise exception '%() uses a pattern (regular expression), not a plain piece of text', p_name using errcode = '22023';
    end if;
    s := 'SUBSTITUTE(' || v_all || case when low = 'replace' then ', 1' else '' end || ')'; k := 'text';
  elsif low = 'test' then
    if c <> 2 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    s := 'REGEX_MATCH(' || v_all || ')'; k := 'boolean';
  elsif low = 'length' then
    if c <> 1 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    s := 'LEN(' || v_all || ')'; k := 'number';
  elsif low in ('lower', 'upper', 'trim') then
    if c <> 1 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    s := upper(low) || '(' || v_all || ')'; k := 'text';
  elsif low = 'empty' then
    if c <> 1 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    s := 'ISBLANK(' || v_all || ')'; k := 'boolean';
  elsif low in ('now', 'today') then
    if c <> 0 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    s := upper(low) || '()'; k := 'date';
  elsif low in ('dateadd', 'datesubtract') then
    if c <> 3 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    v_unit := a[3] ->> 'lit';
    if v_unit is null then raise exception 'its date unit is not a plain word like "days"' using errcode = '22023'; end if;
    v_key := rtrim(lower(v_unit), 's');
    v_spec := case v_key when 'day' then array['days', '1'] when 'week' then array['days', '7']
                         when 'month' then array['months', '1'] when 'year' then array['years', '1'] end;
    if v_spec is null then
      raise exception 'its date unit "%" is not one the table''s date functions have', v_unit using errcode = '22023';
    end if;
    v_factor := v_spec[2]::integer;
    v_n := a[2] ->> 's';
    if v_factor <> 1 then v_n := '(' || v_n || ' * ' || v_factor || ')'; end if;
    if low = 'datesubtract' then v_n := '(-' || v_n || ')'; end if;
    s := 'DATEADD(' || (a[1] ->> 's') || ', ' || v_n || ', "' || v_spec[1] || '")'; k := 'date';
  elsif low = 'datebetween' then
    if c <> 3 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    v_unit := a[3] ->> 'lit';
    if v_unit is null then raise exception 'its date unit is not a plain word like "days"' using errcode = '22023'; end if;
    v_key := rtrim(lower(v_unit), 's');
    v_spec := case v_key when 'day' then array['days', '1'] when 'week' then array['days', '7']
                         when 'hour' then array['hours', '1'] when 'minute' then array['minutes', '1'] end;
    if v_spec is null then
      raise exception 'its date unit "%" is not one the table''s date functions have', v_unit using errcode = '22023';
    end if;
    v_factor := v_spec[2]::integer;
    s := 'DATEDIFF(' || (a[2] ->> 's') || ', ' || (a[1] ->> 's') || ', "' || v_spec[1] || '")';
    if v_factor <> 1 then s := '(' || s || ' / ' || v_factor || ')'; end if;
    k := 'number';
  elsif low = 'formatdate' then
    if c <> 2 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    s := 'DATETIME_FORMAT(' || v_all || ')'; k := 'text';
  elsif low in ('year', 'month') then
    if c <> 1 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    s := upper(low) || '(' || v_all || ')'; k := 'number';
  elsif low = 'date' then
    if c <> 1 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    s := 'DAY(' || v_all || ')'; k := 'number';
  elsif low = 'round' then
    if c not between 1 and 2 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    s := 'ROUND(' || v_all || ')'; k := 'number';
  elsif low = 'abs' then
    if c <> 1 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    s := 'ABS(' || v_all || ')'; k := 'number';
  elsif low in ('min', 'max', 'sum') then
    if c = 0 then raise exception '%() has no values', p_name using errcode = '22023'; end if;
    s := upper(low) || '(' || v_all || ')'; k := 'number';
  elsif low = 'tonumber' then
    if c <> 1 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    notes := notes || to_jsonb('toNumber(): worked out as the value times 1.'::text);
    s := '(' || v_all || ' * 1)'; k := 'number';
  else
    raise exception 'it uses %(), which the table''s formulas do not have', p_name using errcode = '22023';
  end if;
  return jsonb_build_object('s', s, 'k', k, 'n', notes);
end
$fn$;

comment on function custom._nfx_call(text, jsonb, jsonb) is 'SPACES-ASKS: one Notion function call written in the store''s words (internal; part of custom.formula_translate_notion).';

create function custom._nfx_bin(p_op text, p_a jsonb, p_b jsonb)
returns jsonb
language plpgsql
immutable
set search_path to 'pg_catalog'
as $fn$
declare
  v_notes jsonb := coalesce(p_a -> 'n', '[]'::jsonb) || coalesce(p_b -> 'n', '[]'::jsonb);
  v_mapped text;
begin
  if p_op in ('and', '&&', 'or', '||') then
    return jsonb_build_object('s', case when p_op in ('and', '&&') then 'AND(' else 'OR(' end || (p_a ->> 's') || ', ' || (p_b ->> 's') || ')',
                              'k', 'boolean', 'n', v_notes);
  end if;
  if p_op = '^' then
    raise exception 'it raises a number to a power (^ / pow), which the table''s formulas do not have' using errcode = '22023';
  end if;
  if p_op = '+' and 'text' in (p_a ->> 'k', p_b ->> 'k') then
    return jsonb_build_object('s', '(' || (p_a ->> 's') || ' & ' || (p_b ->> 's') || ')', 'k', 'text', 'n', v_notes);
  end if;
  v_mapped := case p_op when '==' then '=' else p_op end;
  return jsonb_build_object('s', '(' || (p_a ->> 's') || ' ' || v_mapped || ' ' || (p_b ->> 's') || ')',
                            'k', case when p_op in ('==', '!=', '<', '<=', '>', '>=') then 'boolean'
                                      when p_op = '+' then 'number' else 'number' end,
                            'n', v_notes);
end
$fn$;

comment on function custom._nfx_bin(text, jsonb, jsonb) is 'SPACES-ASKS: one Notion infix operation written in the store''s words (internal).';

-- ( args ) -> {"args": [...nodes], "i": next index}; p_i points at "("
create function custom._nfx_arglist(p_t jsonb, p_i integer, p_types jsonb)
returns jsonb
language plpgsql
immutable
set search_path to 'pg_catalog'
as $fn$
declare
  v_i integer := p_i + 1;
  v_args jsonb := '[]'::jsonb;
  v_r jsonb;
  v_tok jsonb;
begin
  if p_t -> v_i = '{"k": "op", "v": ")"}'::jsonb then
    return jsonb_build_object('args', v_args, 'i', v_i + 1);
  end if;
  loop
    v_r := custom._nfx_expr(p_t, v_i, 0, p_types);
    v_args := v_args || jsonb_build_array(v_r - 'i');
    v_i := (v_r ->> 'i')::integer;
    v_tok := p_t -> v_i;
    v_i := v_i + 1;
    if v_tok = '{"k": "op", "v": ","}'::jsonb then continue; end if;
    if v_tok = '{"k": "op", "v": ")"}'::jsonb then exit; end if;
    raise exception 'a function call is missing a comma or its closing ")"' using errcode = '22023';
  end loop;
  return jsonb_build_object('args', v_args, 'i', v_i);
end
$fn$;

create function custom._nfx_primary(p_t jsonb, p_i integer, p_types jsonb)
returns jsonb
language plpgsql
immutable
set search_path to 'pg_catalog'
as $fn$
declare
  v_tok jsonb := p_t -> p_i;
  v_k text := v_tok ->> 'k';
  v_v text := v_tok ->> 'v';
  v_i integer := p_i + 1;
  v_r jsonb;
  v_c jsonb;
begin
  if v_k = 'num' then
    return jsonb_build_object('s', v_v, 'k', 'number', 'i', v_i);
  elsif v_k = 'str' then
    return jsonb_build_object('s', '"' || replace(replace(v_v, '\', '\\'), '"', '\"') || '"', 'k', 'text', 'lit', v_v, 'i', v_i);
  elsif v_k = 'op' and v_v = '(' then
    v_r := custom._nfx_expr(p_t, v_i, 0, p_types);
    if p_t -> ((v_r ->> 'i')::integer) <> '{"k": "op", "v": ")"}'::jsonb then
      raise exception 'expected ")" in the formula' using errcode = '22023';
    end if;
    return jsonb_build_object('s', v_r ->> 's', 'k', v_r ->> 'k', 'n', coalesce(v_r -> 'n', '[]'::jsonb), 'i', (v_r ->> 'i')::integer + 1);
  elsif v_k = 'id' then
    if v_v in ('true', 'false') then
      return jsonb_build_object('s', upper(v_v), 'k', 'boolean', 'i', v_i);
    end if;
    if p_t -> v_i = '{"k": "op", "v": "("}'::jsonb then
      v_r := custom._nfx_arglist(p_t, v_i, p_types);
      v_c := custom._nfx_call(v_v, v_r -> 'args', p_types);
      return v_c || jsonb_build_object('i', (v_r ->> 'i')::integer);
    end if;
    if v_v in ('current', 'index', 'acc') then
      raise exception 'it works through a list item by item (current / index), which the table''s formulas do not have' using errcode = '22023';
    end if;
    raise exception '"%" is a name Notion formulas only allow in a function call or as true/false', v_v using errcode = '22023';
  end if;
  raise exception 'unexpected "%" where a value should start', v_v using errcode = '22023';
end
$fn$;

create function custom._nfx_unary(p_t jsonb, p_i integer, p_types jsonb)
returns jsonb
language plpgsql
immutable
set search_path to 'pg_catalog'
as $fn$
declare
  v_tok jsonb := p_t -> p_i;
  v_r jsonb;
  v_node jsonb;
  v_i integer;
  v_name text;
  v_args jsonb;
  v_ar jsonb;
begin
  if v_tok ->> 'k' = 'op' and v_tok ->> 'v' in ('-', '!') then
    v_r := custom._nfx_expr(p_t, p_i + 1, 7, p_types);
    return jsonb_build_object('s', case when v_tok ->> 'v' = '!' then 'NOT(' || (v_r ->> 's') || ')' else '(-' || (v_r ->> 's') || ')' end,
                              'k', case when v_tok ->> 'v' = '!' then 'boolean' else 'number' end,
                              'n', coalesce(v_r -> 'n', '[]'::jsonb), 'i', (v_r ->> 'i')::integer);
  end if;
  if v_tok ->> 'k' = 'id' and v_tok ->> 'v' = 'not' and p_t -> (p_i + 1) <> '{"k": "op", "v": "("}'::jsonb then
    v_r := custom._nfx_expr(p_t, p_i + 1, 7, p_types);
    return jsonb_build_object('s', 'NOT(' || (v_r ->> 's') || ')', 'k', 'boolean',
                              'n', coalesce(v_r -> 'n', '[]'::jsonb), 'i', (v_r ->> 'i')::integer);
  end if;
  v_node := custom._nfx_primary(p_t, p_i, p_types);
  v_i := (v_node ->> 'i')::integer;
  -- method style: prop("A").concat(" ", prop("B")) — the receiver is the first argument
  while p_t -> v_i = '{"k": "op", "v": "."}'::jsonb loop
    v_i := v_i + 1;
    if (p_t -> v_i) ->> 'k' <> 'id' then
      raise exception 'a dot must be followed by a function name' using errcode = '22023';
    end if;
    v_name := (p_t -> v_i) ->> 'v';
    v_i := v_i + 1;
    v_args := jsonb_build_array(v_node - 'i');
    if p_t -> v_i = '{"k": "op", "v": "("}'::jsonb then
      v_ar := custom._nfx_arglist(p_t, v_i, p_types);
      v_args := v_args || (v_ar -> 'args');
      v_i := (v_ar ->> 'i')::integer;
    end if;
    v_node := custom._nfx_call(v_name, v_args, p_types);
  end loop;
  return v_node || jsonb_build_object('i', v_i);
end
$fn$;

create function custom._nfx_expr(p_t jsonb, p_i integer, p_min integer, p_types jsonb)
returns jsonb
language plpgsql
immutable
set search_path to 'pg_catalog'
as $fn$
declare
  v_left jsonb;
  v_right jsonb;
  v_i integer;
  v_tok jsonb;
  v_op text;
  v_bp integer;
  v_a jsonb;
  v_b jsonb;
  v_tern jsonb;
begin
  v_left := custom._nfx_unary(p_t, p_i, p_types);
  v_i := (v_left ->> 'i')::integer;
  loop
    v_tok := p_t -> v_i;
    v_op := null;
    if v_tok ->> 'k' = 'op' and v_tok ->> 'v' in ('||', '&&', '==', '!=', '<', '<=', '>', '>=', '+', '-', '*', '/', '%', '^') then
      v_op := v_tok ->> 'v';
    elsif v_tok ->> 'k' = 'id' and v_tok ->> 'v' in ('and', 'or') then
      v_op := v_tok ->> 'v';
    end if;
    exit when v_op is null;
    v_bp := case v_op when 'or' then 1 when '||' then 1 when 'and' then 2 when '&&' then 2
                      when '==' then 3 when '!=' then 3
                      when '<' then 4 when '<=' then 4 when '>' then 4 when '>=' then 4
                      when '+' then 5 when '-' then 5
                      when '*' then 6 when '/' then 6 when '%' then 6 else 8 end;
    exit when v_bp < p_min;
    v_right := custom._nfx_expr(p_t, v_i + 1, case when v_op = '^' then v_bp else v_bp + 1 end, p_types);
    v_i := (v_right ->> 'i')::integer;
    v_left := custom._nfx_bin(v_op, v_left - 'i', v_right - 'i') || jsonb_build_object('i', v_i);
  end loop;
  if p_min = 0 and p_t -> v_i = '{"k": "op", "v": "?"}'::jsonb then
    v_a := custom._nfx_expr(p_t, v_i + 1, 0, p_types);
    if p_t -> ((v_a ->> 'i')::integer) <> '{"k": "op", "v": ":"}'::jsonb then
      raise exception 'expected ":" in the formula' using errcode = '22023';
    end if;
    v_b := custom._nfx_expr(p_t, (v_a ->> 'i')::integer + 1, 0, p_types);
    v_tern := custom._nfx_call('if', jsonb_build_array(v_left - 'i', v_a - 'i', v_b - 'i'), p_types);
    return v_tern || jsonb_build_object('i', (v_b ->> 'i')::integer);
  end if;
  return v_left;
end
$fn$;

-- THE ONE TRANSLATOR. Notion formula text (+ the table's column name -> type word map, so `+` can tell text-joining
-- from adding) -> {ok, formula, reason, notes}.
create function custom.formula_translate_notion(p_text text, p_types jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
immutable
set search_path to 'pg_catalog'
as $fn$
declare
  v_t jsonb;
  v_r jsonb;
begin
  if btrim(coalesce(p_text, '')) = '' then
    raise exception 'the formula is empty' using errcode = '22023';
  end if;
  v_t := custom._nfx_tokens(btrim(p_text));
  v_r := custom._nfx_expr(v_t, 0, 0, coalesce(p_types, '{}'::jsonb));
  if (v_t -> ((v_r ->> 'i')::integer)) ->> 'k' <> 'end' then
    raise exception 'unexpected "%"', (v_t -> ((v_r ->> 'i')::integer)) ->> 'v' using errcode = '22023';
  end if;
  return jsonb_build_object('ok', true, 'formula', v_r ->> 's', 'reason', null, 'notes', coalesce(v_r -> 'n', '[]'::jsonb));
exception when invalid_parameter_value then
  return jsonb_build_object('ok', false, 'formula', null, 'reason', sqlerrm, 'notes', '[]'::jsonb);
end
$fn$;

comment on function custom.formula_translate_notion(text, jsonb) is
  'SPACES-ASKS: Notion formula 2.0 text (prop("A") * 2, if(...), .concat(...)) written in the store''s own formula words ({A} * 2, IF(...)). The one translator: custom.formula_parse runs it, so every typed formula accepts Notion syntax. Never throws for a formula it cannot carry: {ok:false, reason} names what has no word here.';


-- custom.formula_parse: the body of gridprim_a_formula_is_typed_and_the_store_works_it_out.sql with ONE addition — a
-- text that names a column the Notion way (prop("…")) is translated first; a Notion formula that cannot be carried is
-- answered {ok:false, error} naming what has no word here.
create or replace function custom.formula_parse(p_organization_id uuid, p_table_id uuid, p_text text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_fields jsonb;
  v_tokens jsonb;
  v_r      jsonb;
  v_expr   jsonb;
  v_refs   jsonb := '[]'::jsonb;
  v_msg    text;
  v_at     text;
  v_text   text := p_text;
  v_types  jsonb;
  v_tr     jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.formula_parse');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.formula_parse');

  select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'key', f.data ->> 'key', 'label', f.data ->> 'label',
                                               'type', f.data ->> 'type', 'config', f.data -> 'config')
                            order by (f.data ->> 'sort')::numeric nulls last), '[]'::jsonb)
    into v_fields
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.data_class = 'field'
     and f.deleted_at is null
     and f.data ->> 'entity_definition_id' = p_table_id::text;

  -- NOTION'S SYNTAX: prop("Budget") * 2 is the same formula as {Budget} * 2.
  if coalesce(p_text, '') ~* '\mprop\s*\(' then
    select coalesce(jsonb_object_agg(k, t), '{}'::jsonb) into v_types
      from (select x.k, x.t from (
              select f ->> 'label' as k, f ->> 'type' as t from jsonb_array_elements(v_fields) f
              union all
              select f ->> 'key', f ->> 'type' from jsonb_array_elements(v_fields) f) x
             where x.k is not null) y;
    v_tr := custom.formula_translate_notion(p_text, v_types);
    if coalesce((v_tr ->> 'ok')::boolean, false) is not true then
      return jsonb_build_object('ok', false,
                                'error', 'This reads as a Notion formula, and it cannot be used here because ' || (v_tr ->> 'reason') || '.',
                                'position', 0, 'text', p_text);
    end if;
    v_text := v_tr ->> 'formula';
  end if;

  begin
    if btrim(coalesce(v_text, '')) = '' then
      raise exception 'This formula is empty.' using errcode = '22023', detail = '0';
    end if;
    v_tokens := custom._fxp_tokens(v_text);
    v_r := custom._fxp_level(v_tokens, 0, 0);
    if (v_tokens -> ((v_r ->> 'i')::integer)) ->> 't' <> 'end' then
      raise exception 'Nothing should follow the formula here — remove `%`.',
                      (v_tokens -> ((v_r ->> 'i')::integer)) ->> 'x'
        using errcode = '22023', detail = (v_tokens -> ((v_r ->> 'i')::integer)) ->> 'p';
    end if;
    v_r := custom._fxp_resolve(v_r -> 'n', v_fields, v_refs);
    v_expr := v_r -> 'n';
    v_refs := v_r -> 'refs';
  exception when invalid_parameter_value then
    get stacked diagnostics v_msg = message_text, v_at = pg_exception_detail;
    return jsonb_build_object('ok', false, 'error', v_msg,
                              'position', coalesce(nullif(v_at, '')::integer, 0), 'text', p_text);
  end;

  return jsonb_build_object('ok', true, 'expr', v_expr, 'references', v_refs,
                            'result_type', custom._fxp_type(v_expr, v_fields), 'text', p_text);
end
$fn$;
