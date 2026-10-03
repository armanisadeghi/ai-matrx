-- target: branch,production
-- additive: yes
--   It ADDS five helpers — `custom._fx_ordinal`, `custom._fx_datetime_format`, `custom._fx_regex`,
--   `custom._fx_items`, `custom._fx_workday` — and REPLACES three bodies, each declared below
--   with the body it was written against: `custom.formula_node_kinds` lists eight more
--   functions; `custom.formula_eval` works them out; `custom._fxp_type` answers SWITCH's kind
--   from its results. The parser needs no change: it
--   reads a function name as `fx.<name>` from the list. Rules inherit them through
--   `custom.rule_node_kinds`, which reads the list where it is kept. No table, column, trigger,
--   policy, grant or row of anybody's data is touched. The inverse is
--   `migrations/inverse/viewsfields_f4_a_formula_speaks_seven_more_airtable_functions_down.sql`.
-- guard: custom/system_enabled
-- lock: custom
-- based-on: custom.formula_node_kinds() 5ef10203e8eb982a36715cba2b453445ce3ae31f085273d71f93bd6a9fc151c3
-- based-on: custom.formula_eval(uuid, jsonb, jsonb, jsonb) 8ee93bf164be8212b5cfd46f1d29b498ee6342068211dd41c35a0309c545626f
-- based-on: custom._fxp_type(jsonb, jsonb) c5214493965f9ea03062a4cc2eab50bc857c2bc634bdb683337e75f9af19cb22
--
-- LANE 10 VIEWS-AND-FIELDS, sublane F4 — EIGHT MORE OF AIRTABLE'S FORMULA FUNCTIONS (the seven
-- asked for and ARRAYCOMPACT, ARRAYJOIN's partner). The file name keeps "seven": it is the name
-- the chair's apply command and the clone ledger already carry.
--
-- Champion: Airtable's formula field reference. Each function takes Airtable's arguments in
-- Airtable's order and answers what Airtable answers:
--   SWITCH(value, match, result, …, otherwise?)  lazy, like IF: only what is needed is worked out
--   FIND(part, text, start?)                     1-based, 0 when absent, case-sensitive; start is
--                                                JavaScript indexOf's (0-based, default 0)
--   SUBSTITUTE(text, old, new, which?)           every occurrence, or only the which-th
--   REGEX_MATCH(text, pattern)                   yes/no, RE2 syntax: backreferences and lookaround are
--                                                refused by name, \p{…} classes become POSIX classes
--   DATETIME_FORMAT(date, format?)               Airtable's (moment's) tokens, UTC, [literal] text;
--                                                no format = the ISO text the language writes dates as
--   WORKDAY(start, days, holidays?)              skips Saturday, Sunday and each listed date
--                                                (comma-separated ISO dates, as Airtable takes them)
--   ARRAYJOIN(values, separator?)                a many-value column's items, ", " between by default;
--                                                empty items stay (Airtable leaves that to ARRAYCOMPACT)
--   ARRAYCOMPACT(values)                         the list without null and "" items
--
-- LOCKS. create function / create or replace function only. Not window-class.

set local statement_timeout = '60s';

-- ═════════════════════════════════════════════════════════════════════════════════════════
-- THE VOCABULARY — the 42 rows as they were, and eight more
-- ═════════════════════════════════════════════════════════════════════════════════════════

create or replace function custom.formula_node_kinds()
returns table(node text, min_args integer, max_args integer, result text, signature text, says text)
language sql
immutable
set search_path to 'pg_catalog'
as $fn$
  -- The older grid's FUNCTION_SPECS (features/data-tables/formulas.ts), and its operators,
  -- as the store's `fx.*` nodes. max_args null = any number.
  select * from (values
    ('fx.sum',         1, null::integer, 'number',  'SUM(number, …)',                  'Adds every value, ignoring empty ones.'),
    ('fx.min',         1, null, 'number',  'MIN(number, …)',                  'The smallest value, ignoring empty ones.'),
    ('fx.max',         1, null, 'number',  'MAX(number, …)',                  'The largest value, ignoring empty ones.'),
    ('fx.average',     1, null, 'number',  'AVERAGE(number, …)',              'The average of the values that are filled in. Empty values are not counted.'),
    ('fx.round',       1, 2,    'number',  'ROUND(number, places?)',          'Rounds to the given number of decimal places (0 when omitted). Halves round away from zero.'),
    ('fx.abs',         1, 1,    'number',  'ABS(number)',                     'The value without its minus sign.'),
    ('fx.len',         1, 1,    'number',  'LEN(text)',                       'How many characters the text has.'),
    ('fx.upper',       1, 1,    'text',    'UPPER(text)',                     'The text in capitals.'),
    ('fx.lower',       1, 1,    'text',    'LOWER(text)',                     'The text in lower case.'),
    ('fx.trim',        1, 1,    'text',    'TRIM(text)',                      'The text without leading or trailing spaces.'),
    ('fx.concatenate', 1, null, 'text',    'CONCATENATE(text, …)',            'Joins every value into one piece of text. The & operator is the same join.'),
    ('fx.left',        2, 2,    'text',    'LEFT(text, count)',               'The first few characters of the text.'),
    ('fx.right',       2, 2,    'text',    'RIGHT(text, count)',              'The last few characters of the text.'),
    ('fx.contains',    2, 2,    'boolean', 'CONTAINS(text, part)',            'Yes when the text contains that part. Upper and lower case are treated the same.'),
    ('fx.if',          2, 3,    'unknown', 'IF(condition, then, otherwise?)', 'The second value when the condition holds, otherwise the third (empty when omitted).'),
    ('fx.and',         1, null, 'boolean', 'AND(condition, …)',               'Yes when every condition holds.'),
    ('fx.or',          1, null, 'boolean', 'OR(condition, …)',                'Yes when at least one condition holds.'),
    ('fx.not',         1, 1,    'boolean', 'NOT(condition)',                  'Turns yes into no and no into yes.'),
    ('fx.blank',       0, 0,    'unknown', 'BLANK()',                         'An empty value, for comparing against or returning.'),
    ('fx.isblank',     1, 1,    'boolean', 'ISBLANK(value)',                  'Yes when the value is empty.'),
    ('fx.today',       0, 0,    'date',    'TODAY()',                         'Today''s date.'),
    ('fx.now',         0, 0,    'date',    'NOW()',                           'The current date and time.'),
    ('fx.datediff',    3, 3,    'number',  'DATEDIFF(from, to, ''days'' | ''hours'' | ''minutes'')', 'How far the second date is after the first. Negative when it is earlier.'),
    ('fx.year',        1, 1,    'number',  'YEAR(date)',                      'The four-digit year of the date.'),
    ('fx.month',       1, 1,    'number',  'MONTH(date)',                     'The month of the date, 1 to 12.'),
    ('fx.day',         1, 1,    'number',  'DAY(date)',                       'The day of the month, 1 to 31.'),
    ('fx.dateadd',     3, 3,    'date',    'DATEADD(date, count, ''days'' | ''months'' | ''years'')', 'The date moved forward by that many units. Use a negative count to go back.'),
    -- VIEWS-AND-FIELDS F4: seven of Airtable's functions, in Airtable's argument order
    ('fx.switch',      2, null, 'unknown', 'SWITCH(value, match, result, …, otherwise?)', 'The result beside the first match for the value, else the last value.'),
    ('fx.find',        2, 3,    'number',  'FIND(part, text, start?)',        'Where the part first appears, counting from 1, or 0; a start skips that many characters.'),
    ('fx.substitute',  3, 4,    'text',    'SUBSTITUTE(text, old, new, which?)', 'The text with every old part replaced, or only the numbered one.'),
    ('fx.regex_match', 2, 2,    'boolean', 'REGEX_MATCH(text, pattern)',      'Yes when the text matches the pattern.'),
    ('fx.datetime_format', 1, 2, 'text',   'DATETIME_FORMAT(date, format?)', 'The date written in the format given, such as ''MMM D, YYYY'', in UTC.'),
    ('fx.workday',     2, 3,    'date',    'WORKDAY(start, days, holidays?)', 'The date that many working days on, skipping weekends and the holidays listed.'),
    ('fx.arrayjoin',   1, 2,    'text',    'ARRAYJOIN(values, separator?)',   'Every value of a list as one piece of text, ", " between them unless told.'),
    ('fx.arraycompact', 1, 1,   'unknown', 'ARRAYCOMPACT(values)',            'The list without its empty values.'),
    -- the operators
    ('fx.add',         2, 2,    'number',  'a + b',  'A sum. An empty value counts as 0.'),
    ('fx.sub',         2, 2,    'number',  'a - b',  'A difference. An empty value counts as 0.'),
    ('fx.mul',         2, 2,    'number',  'a * b',  'A product. An empty value counts as 0.'),
    ('fx.div',         2, 2,    'number',  'a / b',  'A quotient. Dividing by zero is refused by name.'),
    ('fx.mod',         2, 2,    'number',  'a % b',  'What is left over after dividing. Dividing by zero is refused by name.'),
    ('fx.neg',         1, 1,    'number',  '-a',     'The value with its sign turned over.'),
    ('fx.eq',          2, 2,    'boolean', 'a = b',  'The same. Numbers compare as numbers, anything else as text; an empty value matches 0 and "".'),
    ('fx.ne',          2, 2,    'boolean', 'a != b', 'Not the same (also written <>).'),
    ('fx.lt',          2, 2,    'boolean', 'a < b',  'Less than.'),
    ('fx.lte',         2, 2,    'boolean', 'a <= b', 'At most.'),
    ('fx.gt',          2, 2,    'boolean', 'a > b',  'Greater than.'),
    ('fx.gte',         2, 2,    'boolean', 'a >= b', 'At least.'),
    -- the store's own column kinds (G5): a formula Field with a system expression
    ('fx.autonumber',  0, 0,    'number',  'AUTONUMBER()',    'The record''s number in this table: assigned once, when the record is first written, never reused.'),
    ('fx.created_time',0, 0,    'date',    'CREATED_TIME()',  'When the record was created.'),
    ('fx.modified_time',0, 0,   'date',    'MODIFIED_TIME()', 'When the record was last changed.')
  ) as t(node, min_args, max_args, result, signature, says)
$fn$;


-- ═════════════════════════════════════════════════════════════════════════════════════════
-- DATETIME_FORMAT's tokens and WORKDAY's calendar
-- ═════════════════════════════════════════════════════════════════════════════════════════

create function custom._fx_ordinal(p_n integer)
returns text
language sql
immutable
set search_path to 'pg_catalog'
as $fn$
  -- English ordinals, as moment.js writes them: 1st 2nd 3rd 4th … 11th 12th 13th … 21st.
  select p_n::text || case when abs(p_n) % 100 between 11 and 13 then 'th'
                           when abs(p_n) % 10 = 1 then 'st'
                           when abs(p_n) % 10 = 2 then 'nd'
                           when abs(p_n) % 10 = 3 then 'rd'
                           else 'th' end
$fn$;

create function custom._fx_datetime_format(p_ts timestamp, p_format text)
returns text
language plpgsql
immutable
set search_path to 'pg_catalog'
as $fn$
declare
  -- Every specifier of Airtable's "Supported format specifiers for DATETIME_FORMAT" (moment.js),
  -- longest first so `DDDD` is never read as `DD` + `DD`, and `Mo` never as `M` + "o".
  -- Anything else is written as it is — moment.js does the same with a character that starts no
  -- specifier — and text in [brackets], or one character after a backslash, is written as it is.
  c_tokens constant text[] := array[
    'SSSSSSSSS', 'SSSSSSSS', 'SSSSSSS', 'SSSSSS',
    'GGGGG', 'ggggg', 'SSSSS',
    'MMMM', 'DDDD', 'DDDo', 'dddd', 'YYYY', 'gggg', 'GGGG', 'LLLL', 'llll', 'SSSS',
    'MMM', 'DDD', 'ddd', 'LTS', 'LLL', 'lll', 'SSS',
    'Mo', 'MM', 'Qo', 'Do', 'DD', 'do', 'dd', 'wo', 'ww', 'Wo', 'WW', 'YY', 'gg', 'GG',
    'HH', 'hh', 'kk', 'mm', 'ss', 'SS', 'ZZ', 'LT', 'LL', 'll',
    'M', 'Q', 'D', 'd', 'e', 'E', 'w', 'W', 'A', 'a', 'H', 'h', 'k', 'm', 's', 'S', 'Z', 'X', 'x', 'L', 'l'];
  v_out  text := '';
  v_tok  text;
  v_one  text;
  i      integer := 1;
  j      integer;
  n      integer := char_length(p_format);
  v_dow  integer := extract(dow from p_ts)::integer;        -- 0 = Sunday
  v_sat  date    := p_ts::date + (6 - extract(dow from p_ts)::integer);
  v_week integer := (extract(doy from v_sat)::integer - 1) / 7 + 1;   -- en: the week holding 1 January is week 1
  v_wyr  integer := extract(year from v_sat)::integer;
  v_ms   text    := lpad(((extract(microseconds from p_ts)::bigint / 1000) % 1000)::text, 3, '0');
begin
  while i <= n loop
    if substr(p_format, i, 1) = '[' then
      j := strpos(substr(p_format, i + 1), ']');
      if j > 0 then
        v_out := v_out || substr(p_format, i + 1, j - 1);
        i := i + j + 1;
        continue;
      end if;
    end if;
    if substr(p_format, i, 1) = '\' and i < n then
      v_out := v_out || substr(p_format, i + 1, 1);
      i := i + 2;
      continue;
    end if;
    v_tok := null;
    foreach v_one in array c_tokens loop
      if substr(p_format, i, char_length(v_one)) = v_one then
        v_tok := v_one;
        exit;
      end if;
    end loop;
    if v_tok is null then
      v_out := v_out || substr(p_format, i, 1);
      i := i + 1;
      continue;
    end if;
    v_out := v_out || case
      -- the presets (en)
      when v_tok = 'LT'   then custom._fx_datetime_format(p_ts, 'h:mm A')
      when v_tok = 'LTS'  then custom._fx_datetime_format(p_ts, 'h:mm:ss A')
      when v_tok = 'L'    then custom._fx_datetime_format(p_ts, 'MM/DD/YYYY')
      when v_tok = 'l'    then custom._fx_datetime_format(p_ts, 'M/D/YYYY')
      when v_tok = 'LL'   then custom._fx_datetime_format(p_ts, 'MMMM D, YYYY')
      when v_tok = 'll'   then custom._fx_datetime_format(p_ts, 'MMM D, YYYY')
      when v_tok = 'LLL'  then custom._fx_datetime_format(p_ts, 'MMMM D, YYYY h:mm A')
      when v_tok = 'lll'  then custom._fx_datetime_format(p_ts, 'MMM D, YYYY h:mm A')
      when v_tok = 'LLLL' then custom._fx_datetime_format(p_ts, 'dddd, MMMM D, YYYY h:mm A')
      when v_tok = 'llll' then custom._fx_datetime_format(p_ts, 'ddd, MMM D, YYYY h:mm A')
      -- month, quarter
      when v_tok = 'M'    then to_char(p_ts, 'FMMM')
      when v_tok = 'Mo'   then custom._fx_ordinal(extract(month from p_ts)::integer)
      when v_tok = 'MM'   then to_char(p_ts, 'MM')
      when v_tok = 'MMM'  then to_char(p_ts, 'Mon')
      when v_tok = 'MMMM' then to_char(p_ts, 'FMMonth')
      when v_tok = 'Q'    then to_char(p_ts, 'Q')
      when v_tok = 'Qo'   then custom._fx_ordinal(extract(quarter from p_ts)::integer)
      -- day of month, day of year
      when v_tok = 'D'    then to_char(p_ts, 'FMDD')
      when v_tok = 'Do'   then custom._fx_ordinal(extract(day from p_ts)::integer)
      when v_tok = 'DD'   then to_char(p_ts, 'DD')
      when v_tok = 'DDD'  then to_char(p_ts, 'FMDDD')
      when v_tok = 'DDDo' then custom._fx_ordinal(extract(doy from p_ts)::integer)
      when v_tok = 'DDDD' then to_char(p_ts, 'DDD')
      -- day of week
      when v_tok in ('d', 'e') then v_dow::text
      when v_tok = 'do'   then custom._fx_ordinal(v_dow)
      when v_tok = 'dd'   then left(to_char(p_ts, 'FMDay'), 2)
      when v_tok = 'ddd'  then to_char(p_ts, 'Dy')
      when v_tok = 'dddd' then to_char(p_ts, 'FMDay')
      when v_tok = 'E'    then to_char(p_ts, 'ID')
      -- week of year (en: weeks start Sunday) and ISO week
      when v_tok = 'w'    then v_week::text
      when v_tok = 'wo'   then custom._fx_ordinal(v_week)
      when v_tok = 'ww'   then lpad(v_week::text, 2, '0')
      when v_tok = 'W'    then to_char(p_ts, 'FMIW')
      when v_tok = 'Wo'   then custom._fx_ordinal(extract(week from p_ts)::integer)
      when v_tok = 'WW'   then to_char(p_ts, 'IW')
      -- years
      when v_tok = 'YY'   then to_char(p_ts, 'YY')
      when v_tok = 'YYYY' then to_char(p_ts, 'YYYY')
      when v_tok = 'gg'   then lpad(right(v_wyr::text, 2), 2, '0')
      when v_tok = 'gggg' then lpad(v_wyr::text, 4, '0')
      when v_tok = 'ggggg' then lpad(v_wyr::text, 5, '0')
      when v_tok = 'GG'   then right(to_char(p_ts, 'IYYY'), 2)
      when v_tok = 'GGGG' then to_char(p_ts, 'IYYY')
      when v_tok = 'GGGGG' then lpad(to_char(p_ts, 'FMIYYY'), 5, '0')
      -- time of day
      when v_tok = 'A'    then to_char(p_ts, 'AM')
      when v_tok = 'a'    then lower(to_char(p_ts, 'AM'))
      when v_tok = 'H'    then to_char(p_ts, 'FMHH24')
      when v_tok = 'HH'   then to_char(p_ts, 'HH24')
      when v_tok = 'h'    then to_char(p_ts, 'FMHH12')
      when v_tok = 'hh'   then to_char(p_ts, 'HH12')
      when v_tok = 'k'    then (case when extract(hour from p_ts) = 0 then 24 else extract(hour from p_ts)::integer end)::text
      when v_tok = 'kk'   then lpad((case when extract(hour from p_ts) = 0 then 24 else extract(hour from p_ts)::integer end)::text, 2, '0')
      when v_tok = 'm'    then to_char(p_ts, 'FMMI')
      when v_tok = 'mm'   then to_char(p_ts, 'MI')
      when v_tok = 's'    then to_char(p_ts, 'FMSS')
      when v_tok = 'ss'   then to_char(p_ts, 'SS')
      -- fractions of a second: milliseconds, cut short or padded with zeros as moment.js does
      when v_tok like 'S%' then rpad(left(v_ms, char_length(v_tok)), char_length(v_tok), '0')
      -- the zone: this language writes every date in UTC
      when v_tok = 'Z'    then '+00:00'
      when v_tok = 'ZZ'   then '+0000'
      when v_tok = 'X'    then floor(extract(epoch from p_ts))::bigint::text
      when v_tok = 'x'    then floor(extract(epoch from p_ts) * 1000)::bigint::text
    end;
    i := i + char_length(v_tok);
  end loop;
  return v_out;
end
$fn$;

comment on function custom._fx_datetime_format(timestamp, text) is
  'VIEWS-AND-FIELDS F4: DATETIME_FORMAT''s writer — every specifier of Airtable''s supported list (moment.js, en, UTC), the L/LL/LLL/LLLL/LT/LTS presets, [literal] text and \x escapes; any other character is written as it is.';

create function custom._fx_regex(p_pattern text, p_fn text)
returns text
language plpgsql
immutable
set search_path to 'pg_catalog'
as $fn$
declare
  -- RE2 (Airtable's engine) read into a Postgres regular expression. What RE2 does not have —
  -- backreferences, lookaround, the Postgres-only escapes — is refused by name instead of being
  -- quietly answered; RE2's \b, \B, \z, named groups, \Q…\E and \p{…} classes are translated.
  v_out  text := '';
  i      integer := 1;
  n      integer := char_length(coalesce(p_pattern, ''));
  c      text;
  v_nxt  text;
  v_in   boolean := false;   -- inside [ … ]
  v_name text;
  v_cls  text;
  j      integer;
begin
  while i <= n loop
    c := substr(p_pattern, i, 1);
    if c = '\' and i < n then
      v_nxt := substr(p_pattern, i + 1, 1);
      if v_nxt ~ '[1-9]' then
        raise exception '`%` does not support backreferences such as "\%".', p_fn, v_nxt using errcode = '22023';
      elsif v_nxt in ('p', 'P') then
        if substr(p_pattern, i + 2, 1) = '{' then
          j := strpos(substr(p_pattern, i + 3), '}');
          if j = 0 then
            raise exception '`%` cannot read the pattern "%".', p_fn, p_pattern using errcode = '22023';
          end if;
          v_name := substr(p_pattern, i + 3, j - 1);
          i := i + 3 + j;
        else
          v_name := substr(p_pattern, i + 2, 1);
          i := i + 3;
        end if;
        v_cls := case v_name when 'L' then 'alpha' when 'Lu' then 'upper' when 'Ll' then 'lower'
                             when 'N' then 'digit' when 'Nd' then 'digit' when 'P' then 'punct' end;
        if v_cls is null then
          raise exception '`%` does not know the character class "\%{%}". Use L, Lu, Ll, N, Nd or P.', p_fn, v_nxt, v_name
            using errcode = '22023';
        end if;
        if v_in and v_nxt = 'P' then
          raise exception '`%` cannot use "\P{%}" inside [ ]. Write [^…] instead.', p_fn, v_name using errcode = '22023';
        end if;
        v_out := v_out || case when v_in then '[:' || v_cls || ':]'
                               when v_nxt = 'P' then '[^[:' || v_cls || ':]]'
                               else '[[:' || v_cls || ':]]' end;
        continue;
      elsif v_nxt = 'Q' and not v_in then
        j := strpos(substr(p_pattern, i + 2), '\E');
        v_name := case when j = 0 then substr(p_pattern, i + 2) else substr(p_pattern, i + 2, j - 1) end;
        v_out := v_out || regexp_replace(v_name, '([^[:alnum:][:space:]_])', '\\\1', 'g');
        i := case when j = 0 then n + 1 else i + 2 + j + 1 end;
        continue;
      elsif v_nxt in ('m', 'M', 'y', 'Y', 'Z') then
        raise exception '`%` cannot read the pattern "%".', p_fn, p_pattern using errcode = '22023';
      elsif v_nxt = 'b' and not v_in then
        v_out := v_out || '\y';
      elsif v_nxt = 'B' and not v_in then
        v_out := v_out || '\Y';
      elsif v_nxt = 'z' and not v_in then
        v_out := v_out || '\Z';
      else
        v_out := v_out || c || v_nxt;
      end if;
      i := i + 2;
      continue;
    end if;
    if v_in then
      if c = ']' then v_in := false; end if;
      v_out := v_out || c;
      i := i + 1;
      continue;
    end if;
    if c = '[' then
      v_in := true;
      v_out := v_out || c;
      i := i + 1;
      -- a ] straight after [ or [^ is a character, not the end
      if substr(p_pattern, i, 1) = '^' then v_out := v_out || '^'; i := i + 1; end if;
      if substr(p_pattern, i, 1) = ']' then v_out := v_out || ']'; i := i + 1; end if;
      continue;
    end if;
    if c = '(' and substr(p_pattern, i + 1, 1) = '?' then
      v_nxt := substr(p_pattern, i + 2, 2);
      if left(v_nxt, 1) in ('=', '!') or v_nxt in ('<=', '<!') then
        raise exception '`%` does not support lookahead or lookbehind such as "(?%".', p_fn,
          case when left(v_nxt, 1) in ('=', '!') then left(v_nxt, 1) else v_nxt end using errcode = '22023';
      end if;
      if v_nxt = 'P<' or left(v_nxt, 1) = '<' then
        -- a named group (?P<name>…) or (?<name>…) is an ordinary group here
        j := strpos(substr(p_pattern, i), '>');
        if j = 0 then
          raise exception '`%` cannot read the pattern "%".', p_fn, p_pattern using errcode = '22023';
        end if;
        v_out := v_out || '(';
        i := i + j;
        continue;
      end if;
    end if;
    v_out := v_out || c;
    i := i + 1;
  end loop;
  return v_out;
end
$fn$;

comment on function custom._fx_regex(text, text) is
  'VIEWS-AND-FIELDS F4: an RE2 pattern (Airtable''s engine) as a Postgres regular expression. Backreferences, lookaround and Postgres-only escapes are refused by name; \b \B \z, named groups, \Q…\E and \p{L|Lu|Ll|N|Nd|P} are translated.';

create function custom._fx_items(p_organization_id uuid, p_node jsonb, p_values jsonb, p_context jsonb)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_a    jsonb;
  v_type text;
begin
  -- The items of a list value, as a person reads them: a many-choice column's own labels, a
  -- link's titles, any other list as it is (or its JSON text), one value as a list of one. An
  -- empty item stays in the list as null — ARRAYJOIN keeps it, ARRAYCOMPACT drops it.
  if jsonb_typeof(p_node) = 'object' and p_node ? 'field' and not (p_node ? 'op') then
    v_a := custom.rule_eval(p_organization_id, p_node, p_values, coalesce(p_context, '{}'::jsonb));
    select f.data ->> 'type' into v_type
      from custom.record f
     where f.organization_id = p_organization_id and f.id = (p_node ->> 'field')::uuid
       and f.table_id = custom.field_kernel_id();
  else
    v_a := custom.formula_eval(p_organization_id, p_node, p_values, p_context);
    if jsonb_typeof(v_a) = 'string' and btrim(v_a #>> '{}') like '[%' then
      begin
        v_a := (v_a #>> '{}')::jsonb;
      exception when others then
        null;   -- text that only starts like a list is one value
      end;
    end if;
  end if;
  if v_a is null or jsonb_typeof(v_a) = 'null' then
    return '[]'::jsonb;
  end if;
  if jsonb_typeof(v_a) <> 'array' then
    v_a := jsonb_build_array(v_a);
  end if;
  if v_type in ('list', 'relation') then
    return coalesce((select jsonb_agg(case when custom._fx_blank(u.x) then 'null'::jsonb
                                           else to_jsonb(custom.field_words(p_organization_id, (p_node ->> 'field')::uuid, u.x)) end
                                      order by u.i)
                       from jsonb_array_elements(v_a) with ordinality u(x, i)), '[]'::jsonb);
  end if;
  return v_a;
end
$fn$;

comment on function custom._fx_items(uuid, jsonb, jsonb, jsonb) is
  'VIEWS-AND-FIELDS F4: the items of a list value for ARRAYJOIN and ARRAYCOMPACT — choice and link columns as their words, empty items kept as null.';

create function custom._fx_workday(p_start timestamp, p_days integer, p_holidays jsonb)
returns timestamp
language plpgsql
immutable
set search_path to 'pg_catalog'
as $fn$
declare
  v_hol  date[] := '{}';
  v_item text;
  v_d    record;
  v_at   timestamp := p_start;
  v_left integer := abs(p_days);
  v_step interval := case when p_days < 0 then interval '-1 day' else interval '1 day' end;
begin
  -- The holidays: Airtable takes one text of comma-separated ISO dates; a list (or its JSON
  -- text) is read the same way. A date that is not one is refused by name.
  if not custom._fx_blank(p_holidays) then
    for v_item in
      select btrim(x, ' "[]')
        from unnest(string_to_array(
               case when jsonb_typeof(p_holidays) = 'array'
                    then (select string_agg(e #>> '{}', ',') from jsonb_array_elements(p_holidays) e)
                    else custom._fx_text(p_holidays) end, ',')) x
    loop
      continue when v_item = '';
      select * into v_d from custom._fx_date(to_jsonb(v_item), '`WORKDAY`');
      v_hol := v_hol || v_d.ts::date;
    end loop;
  end if;
  -- Step a day at a time and count only Monday to Friday that are not holidays. The start
  -- itself is never counted, so WORKDAY(Friday, 1) is the Monday after.
  while v_left > 0 loop
    v_at := v_at + v_step;
    if extract(isodow from v_at) < 6 and not (v_at::date = any (v_hol)) then
      v_left := v_left - 1;
    end if;
  end loop;
  return v_at;
end
$fn$;

comment on function custom._fx_workday(timestamp, integer, jsonb) is
  'VIEWS-AND-FIELDS F4: WORKDAY''s calendar — the date p_days working days from p_start (negative goes back), skipping Saturday, Sunday and every listed holiday; the start is never counted.';

-- ═════════════════════════════════════════════════════════════════════════════════════════
-- custom.formula_eval — the evaluator, with the eight
-- ═════════════════════════════════════════════════════════════════════════════════════════

create or replace function custom.formula_eval(p_organization_id uuid, p_expr jsonb, p_values jsonb,
                                    p_context jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_op    text;
  v_args  jsonb;
  v_n     integer;
  v_spec  record;
  v_vals  jsonb[] := '{}';
  v_one   jsonb;
  v_a     jsonb;
  v_b     jsonb;
  v_x     numeric;
  v_y     numeric;
  v_nums  numeric[] := '{}';
  v_s     text;
  v_t     text;
  v_d1    record;
  v_d2    record;
  v_u     text;
  v_type  text;
  v_ts    timestamp;
  v_i     integer;
  v_k     integer;
  v_p     integer;
begin
  if p_expr is null or jsonb_typeof(p_expr) <> 'object' then
    return custom.rule_eval(p_organization_id, p_expr, p_values, coalesce(p_context, '{}'::jsonb));
  end if;

  -- ── A COLUMN. What the older grid's `displayValueOf` seam did: a choice or a relation is
  -- the WORDS a person reads (so `{Status} = "No-show"` compares the label), everything else
  -- is its stored value; a list or an object reads as its JSON (normalizeCell).
  if p_expr ? 'field' and not (p_expr ? 'op') then
    v_a := custom.rule_eval(p_organization_id, p_expr, p_values, coalesce(p_context, '{}'::jsonb));
    if v_a is null or jsonb_typeof(v_a) = 'null' then
      return 'null'::jsonb;
    end if;
    select f.data ->> 'type' into v_type
      from custom.record f
     where f.organization_id = p_organization_id and f.id = (p_expr ->> 'field')::uuid
       and f.table_id = custom.field_kernel_id();
    if v_type in ('list', 'relation') then
      return to_jsonb(custom.field_words(p_organization_id, (p_expr ->> 'field')::uuid, v_a));
    end if;
    if jsonb_typeof(v_a) in ('array', 'object') then
      return to_jsonb(v_a::text);
    end if;
    return v_a;
  end if;

  v_op := p_expr ->> 'op';
  if v_op is null or left(v_op, 3) <> 'fx.' then
    -- Every node that is not the formula language's own is a Rule node, answered by the
    -- Rules' evaluator, unchanged — so every formula written before today answers the same.
    return custom.rule_eval(p_organization_id, p_expr, p_values, coalesce(p_context, '{}'::jsonb));
  end if;

  select * into v_spec from custom.formula_node_kinds() k where k.node = v_op;
  if v_spec.node is null then
    raise exception 'This formula asks for %, and the formula language has no such function.', v_op
      using errcode = '22023', hint = 'select node, signature from custom.formula_node_kinds() is the whole list.';
  end if;
  v_args := coalesce(p_expr -> 'args', '[]'::jsonb);
  if jsonb_typeof(v_args) <> 'array' then
    raise exception '`%` was given something that is not a list of values.', v_spec.signature using errcode = '22023';
  end if;
  v_n := jsonb_array_length(v_args);
  if v_n < v_spec.min_args or (v_spec.max_args is not null and v_n > v_spec.max_args) then
    raise exception '`%` was given % value%. Use %.', upper(substr(v_op, 4)), v_n,
                    case when v_n = 1 then '' else 's' end, v_spec.signature
      using errcode = '22023';
  end if;

  -- ── short-circuit: IF, AND, OR ──────────────────────────────────────────────────────────
  if v_op = 'fx.if' then
    if custom._fx_truthy(custom.formula_eval(p_organization_id, v_args -> 0, p_values, p_context)) then
      return custom.formula_eval(p_organization_id, v_args -> 1, p_values, p_context);
    end if;
    if v_n > 2 then
      return custom.formula_eval(p_organization_id, v_args -> 2, p_values, p_context);
    end if;
    return 'null'::jsonb;
  elsif v_op = 'fx.and' then
    for v_one in select e from jsonb_array_elements(v_args) e loop
      if not custom._fx_truthy(custom.formula_eval(p_organization_id, v_one, p_values, p_context)) then
        return 'false'::jsonb;
      end if;
    end loop;
    return 'true'::jsonb;
  elsif v_op = 'fx.or' then
    for v_one in select e from jsonb_array_elements(v_args) e loop
      if custom._fx_truthy(custom.formula_eval(p_organization_id, v_one, p_values, p_context)) then
        return 'true'::jsonb;
      end if;
    end loop;
    return 'false'::jsonb;
  elsif v_op = 'fx.switch' then
    -- SWITCH(value, match, result, …, otherwise?) — Airtable's order. Only the value, the
    -- matches up to the first that holds, and that one result are worked out; a match compares
    -- exactly as `=` does (numbers as numbers, an empty value matches BLANK()).
    v_a := coalesce(custom.formula_eval(p_organization_id, v_args -> 0, p_values, p_context), 'null'::jsonb);
    v_i := 1;
    while v_i + 1 < v_n loop
      if custom._fx_cmp(v_a, coalesce(custom.formula_eval(p_organization_id, v_args -> v_i, p_values, p_context),
                                      'null'::jsonb)) = 0 then
        return custom.formula_eval(p_organization_id, v_args -> (v_i + 1), p_values, p_context);
      end if;
      v_i := v_i + 2;
    end loop;
    if v_i < v_n then
      return custom.formula_eval(p_organization_id, v_args -> v_i, p_values, p_context);
    end if;
    return 'null'::jsonb;
  elsif v_op = 'fx.arrayjoin' then
    -- ARRAYJOIN(values, separator?) reads a COLUMN's stored list, not its words joined already:
    -- a many-choice column is each choice's own label, a link each record's own title. An empty
    -- item stays, as an empty piece between two separators — Airtable leaves removing them to
    -- ARRAYCOMPACT.
    v_s := case when v_n > 1
                then custom._fx_text(custom.formula_eval(p_organization_id, v_args -> 1, p_values, p_context))
                else ', ' end;
    v_a := custom._fx_items(p_organization_id, v_args -> 0, p_values, p_context);
    return to_jsonb(coalesce((select string_agg(custom._fx_text(u.x), v_s order by u.i)
                                from jsonb_array_elements(v_a) with ordinality u(x, i)), ''));
  elsif v_op = 'fx.arraycompact' then
    -- ARRAYCOMPACT(values): the list without empty items (null and ""). false, 0 and text of
    -- spaces stay, as in Airtable.
    v_a := custom._fx_items(p_organization_id, v_args -> 0, p_values, p_context);
    return coalesce((select jsonb_agg(u.x order by u.i)
                       from jsonb_array_elements(v_a) with ordinality u(x, i)
                      where not custom._fx_blank(u.x)), '[]'::jsonb);
  end if;

  -- ── the store's own kinds ───────────────────────────────────────────────────────────────
  if v_op = 'fx.autonumber' then
    return to_jsonb(custom._fx_autonumber(p_organization_id,
             nullif(p_context ->> 'fx_table_id', '')::uuid,
             nullif(p_context ->> 'fx_field_key', ''),
             nullif(p_context ->> 'fx_self_id', '')::uuid));
  elsif v_op in ('fx.created_time', 'fx.modified_time') then
    select case when v_op = 'fx.created_time' then r.created_at else r.updated_at end into v_ts
      from custom.record r
     where r.organization_id = p_organization_id
       and r.id = nullif(p_context ->> 'fx_self_id', '')::uuid;
    if v_ts is null then
      return 'null'::jsonb;   -- a reader that has no record yet leaves it blank, never invents one
    end if;
    return to_jsonb(to_char((v_ts::timestamptz) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  elsif v_op = 'fx.blank' then
    return 'null'::jsonb;
  elsif v_op = 'fx.today' then
    return to_jsonb(to_char(now() at time zone 'UTC', 'YYYY-MM-DD'));
  elsif v_op = 'fx.now' then
    return to_jsonb(to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  end if;

  -- ── everything else evaluates every argument first ─────────────────────────────────────
  for v_one in select e from jsonb_array_elements(v_args) e loop
    v_vals := v_vals || coalesce(custom.formula_eval(p_organization_id, v_one, p_values, p_context), 'null'::jsonb);
  end loop;
  v_a := case when v_n >= 1 then v_vals[1] end;
  v_b := case when v_n >= 2 then v_vals[2] end;

  case v_op
    when 'fx.sum', 'fx.min', 'fx.max', 'fx.average' then
      foreach v_one in array v_vals loop
        if not custom._fx_blank(v_one) then
          v_nums := v_nums || custom._fx_num(v_one, format('`%s`', upper(substr(v_op, 4))));
        end if;
      end loop;
      if v_op = 'fx.sum' then
        return to_jsonb(coalesce((select sum(x) from unnest(v_nums) x), 0));
      end if;
      if cardinality(v_nums) = 0 then return 'null'::jsonb; end if;
      if v_op = 'fx.min' then return to_jsonb((select min(x) from unnest(v_nums) x)); end if;
      if v_op = 'fx.max' then return to_jsonb((select max(x) from unnest(v_nums) x)); end if;
      return to_jsonb(trim_scale((select sum(x) from unnest(v_nums) x) / cardinality(v_nums)));
    when 'fx.round' then
      v_x := custom._fx_num(v_a, '`ROUND`');
      v_y := case when v_n > 1 then trunc(custom._fx_num(v_b, '`ROUND`')) else 0 end;
      -- numeric round() rounds halves away from zero, which is the older grid's rule.
      return to_jsonb(round(v_x, v_y::integer));
    when 'fx.abs' then
      return to_jsonb(abs(custom._fx_num(v_a, '`ABS`')));
    when 'fx.len' then
      return to_jsonb(char_length(custom._fx_text(v_a)));
    when 'fx.upper' then
      return to_jsonb(upper(custom._fx_text(v_a)));
    when 'fx.lower' then
      return to_jsonb(lower(custom._fx_text(v_a)));
    when 'fx.trim' then
      return to_jsonb(regexp_replace(custom._fx_text(v_a), '^\s+|\s+$', '', 'g'));
    when 'fx.concatenate' then
      return to_jsonb((select string_agg(custom._fx_text(x), '' order by i)
                         from unnest(v_vals) with ordinality u(x, i)));
    when 'fx.left' then
      v_x := trunc(custom._fx_num(v_b, '`LEFT`'));
      return to_jsonb(left(custom._fx_text(v_a), greatest(0, v_x)::integer));
    when 'fx.right' then
      v_x := trunc(custom._fx_num(v_b, '`RIGHT`'));
      if v_x <= 0 then return '""'::jsonb; end if;
      return to_jsonb(right(custom._fx_text(v_a), v_x::integer));
    when 'fx.contains' then
      return to_jsonb(strpos(lower(custom._fx_text(v_a)), lower(custom._fx_text(v_b))) > 0);
    when 'fx.not' then
      return to_jsonb(not custom._fx_truthy(v_a));
    when 'fx.isblank' then
      return to_jsonb(custom._fx_blank(v_a));
    when 'fx.datediff' then
      select * into v_d1 from custom._fx_date(v_a, '`DATEDIFF`');
      select * into v_d2 from custom._fx_date(v_b, '`DATEDIFF`');
      v_u := custom._fx_unit(v_vals[3], array['days', 'hours', 'minutes'], 'DATEDIFF');
      return to_jsonb(trunc(extract(epoch from (v_d2.ts - v_d1.ts))
                            / case v_u when 'days' then 86400 when 'hours' then 3600 else 60 end));
    when 'fx.year' then
      select * into v_d1 from custom._fx_date(v_a, '`YEAR`');
      return to_jsonb(extract(year from v_d1.ts)::integer);
    when 'fx.month' then
      select * into v_d1 from custom._fx_date(v_a, '`MONTH`');
      return to_jsonb(extract(month from v_d1.ts)::integer);
    when 'fx.day' then
      select * into v_d1 from custom._fx_date(v_a, '`DAY`');
      return to_jsonb(extract(day from v_d1.ts)::integer);
    when 'fx.dateadd' then
      select * into v_d1 from custom._fx_date(v_a, '`DATEADD`');
      v_x := trunc(custom._fx_num(v_b, '`DATEADD`'));
      v_u := custom._fx_unit(v_vals[3], array['days', 'months', 'years'], 'DATEADD');
      -- An interval of months clamps to the end of a shorter month, as the older grid does.
      v_ts := case v_u when 'days' then v_d1.ts + make_interval(days => v_x::integer)
                       when 'months' then v_d1.ts + make_interval(months => v_x::integer)
                       else v_d1.ts + make_interval(years => v_x::integer) end;
      return to_jsonb(custom._fx_iso(v_ts, v_d1.date_only));
    when 'fx.find' then
      -- FIND(part, text, start?): Airtable's startFromPosition, which defaults to 0, is
      -- JavaScript's indexOf start — the number of characters skipped before the search. The
      -- answer counts from 1, and 0 means the part is not there. Upper and lower case differ.
      v_s := custom._fx_text(v_a);
      v_t := custom._fx_text(v_b);
      v_x := case when v_n > 2 then greatest(trunc(custom._fx_num(v_vals[3], '`FIND`')), 0) else 0 end;
      v_x := least(v_x, char_length(v_t));
      if v_s = '' then
        return to_jsonb(v_x + 1);
      end if;
      v_k := strpos(substr(v_t, v_x::integer + 1), v_s);
      return to_jsonb(case when v_k = 0 then 0 else v_k + v_x::integer end);
    when 'fx.substitute' then
      -- SUBSTITUTE(text, old, new, which?): every `old` replaced, or only the which-th one.
      v_s := custom._fx_text(v_a);
      v_t := custom._fx_text(v_b);
      v_u := custom._fx_text(v_vals[3]);
      if v_t = '' then
        return to_jsonb(v_s);
      end if;
      if v_n < 4 then
        return to_jsonb(replace(v_s, v_t, v_u));
      end if;
      v_x := trunc(custom._fx_num(v_vals[4], '`SUBSTITUTE`'));
      if v_x < 1 then
        raise exception '`SUBSTITUTE` counts which one to replace from 1, but was given %.', custom._fx_num_text(v_x)
          using errcode = '22023';
      end if;
      v_i := 0;   -- characters already passed
      v_k := 0;   -- occurrences seen
      loop
        v_p := strpos(substr(v_s, v_i + 1), v_t);
        exit when v_p = 0;
        v_i := v_i + v_p;
        v_k := v_k + 1;
        if v_k = v_x then
          return to_jsonb(left(v_s, v_i - 1) || v_u || substr(v_s, v_i + char_length(v_t)));
        end if;
        v_i := v_i + char_length(v_t) - 1;
      end loop;
      return to_jsonb(v_s);
    when 'fx.regex_match' then
      -- REGEX_MATCH(text, pattern), read as RE2 reads it (custom._fx_regex). Postgres's `~`
      -- answers yes/no without tracking captures, so the classic runaway shapes ((a+)+,
      -- (\w+\s?)+) run in milliseconds and are accepted, as RE2 accepts them. A pattern the
      -- database cannot read, or one too complex to compile (both 2201B), or one that runs past
      -- the statement's time is said in a plain sentence; a timeout keeps its own sqlstate
      -- (57014) so custom.derived_value still re-raises it as a cancelled read, never an empty
      -- cell. This is the only handler in the evaluator.
      v_t := custom._fx_regex(custom._fx_text(v_b), 'REGEX_MATCH');
      begin
        return to_jsonb(custom._fx_text(v_a) ~ v_t);
      exception
        when invalid_regular_expression then
          if sqlerrm like '%too complex%' then
            raise exception '`REGEX_MATCH` cannot work out a pattern this complex: "%".', custom._fx_text(v_b)
              using errcode = '22023';
          end if;
          raise exception '`REGEX_MATCH` cannot read the pattern "%".', custom._fx_text(v_b)
            using errcode = '22023';
        when query_canceled then
          raise exception '`REGEX_MATCH` took too long on this text. Try a simpler pattern.'
            using errcode = '57014';
      end;
    when 'fx.datetime_format' then
      select * into v_d1 from custom._fx_date(v_a, '`DATETIME_FORMAT`');
      if v_n < 2 or btrim(custom._fx_text(v_b)) = '' then
        return to_jsonb(custom._fx_iso(v_d1.ts, v_d1.date_only));
      end if;
      return to_jsonb(custom._fx_datetime_format(v_d1.ts, custom._fx_text(v_b)));
    when 'fx.workday' then
      select * into v_d1 from custom._fx_date(v_a, '`WORKDAY`');
      v_x := trunc(custom._fx_num(v_b, '`WORKDAY`'));
      if abs(v_x) > 36500 then
        raise exception '`WORKDAY` moves at most 36500 working days, but was given %.', custom._fx_num_text(v_x)
          using errcode = '22023';
      end if;
      return to_jsonb(custom._fx_iso(
        custom._fx_workday(v_d1.ts, v_x::integer, case when v_n > 2 then v_vals[3] end), v_d1.date_only));
    when 'fx.add' then
      return to_jsonb(custom._fx_num(v_a, '`+`') + custom._fx_num(v_b, '`+`'));
    when 'fx.sub' then
      return to_jsonb(custom._fx_num(v_a, '`-`') - custom._fx_num(v_b, '`-`'));
    when 'fx.mul' then
      return to_jsonb(custom._fx_num(v_a, '`*`') * custom._fx_num(v_b, '`*`'));
    when 'fx.div', 'fx.mod' then
      v_y := custom._fx_num(v_b, case when v_op = 'fx.div' then '`/`' else '`%`' end);
      if v_y = 0 then
        raise exception 'This formula divides by zero.' using errcode = '22012';
      end if;
      v_x := custom._fx_num(v_a, case when v_op = 'fx.div' then '`/`' else '`%`' end);
      -- trim_scale: 142.5 / 3 is 47.5, not 47.5000000000000000 (a number reads as the older grid prints it).
      return to_jsonb(trim_scale(case when v_op = 'fx.div' then v_x / v_y else mod(v_x, v_y) end));
    when 'fx.neg' then
      return to_jsonb(- custom._fx_num(v_a, '`-`'));
    when 'fx.eq'  then return to_jsonb(custom._fx_cmp(v_a, v_b) = 0);
    when 'fx.ne'  then return to_jsonb(custom._fx_cmp(v_a, v_b) <> 0);
    when 'fx.lt'  then return to_jsonb(custom._fx_cmp(v_a, v_b) < 0);
    when 'fx.lte' then return to_jsonb(custom._fx_cmp(v_a, v_b) <= 0);
    when 'fx.gt'  then return to_jsonb(custom._fx_cmp(v_a, v_b) > 0);
    when 'fx.gte' then return to_jsonb(custom._fx_cmp(v_a, v_b) >= 0);
    else
      raise exception 'The formula language lists % and this evaluator does not work it out.', v_op
        using errcode = '22023', hint = 'That is a defect in custom.formula_eval, not in the formula.';
  end case;
end
$fn$;

-- ═════════════════════════════════════════════════════════════════════════════════════════
-- custom._fxp_type — SWITCH answers the kind its results share
-- ═════════════════════════════════════════════════════════════════════════════════════════

create or replace function custom._fxp_type(p_node jsonb, p_fields jsonb)
returns text
language plpgsql
immutable
set search_path to 'pg_catalog'
as $fn$
declare
  v_op   text := p_node ->> 'op';
  v_f    jsonb;
  v_a    text;
  v_b    text;
begin
  -- formulaResultType: best effort, and `unknown` is always a legal answer.
  if p_node ? 'const' then
    return case jsonb_typeof(p_node -> 'const') when 'number' then 'number' when 'string' then 'text'
                                                 when 'boolean' then 'boolean' else 'unknown' end;
  end if;
  if p_node ? 'field' then
    select f into v_f from jsonb_array_elements(p_fields) f where f ->> 'id' = p_node ->> 'field' limit 1;
    return case
      when v_f ->> 'type' = 'boolean' then 'boolean'
      when v_f ->> 'type' = 'range' and v_f -> 'config' ->> 'kind' in ('date', 'datetime') then 'date'
      when v_f ->> 'type' = 'range' then 'number'
      when v_f ->> 'type' in ('text', 'list', 'relation') then 'text'
      else 'unknown' end;
  end if;
  if v_op = 'fx.if' then
    v_a := custom._fxp_type(p_node -> 'args' -> 1, p_fields);
    if jsonb_array_length(p_node -> 'args') < 3 then return v_a; end if;
    v_b := custom._fxp_type(p_node -> 'args' -> 2, p_fields);
    return case when v_a = v_b then v_a when v_a = 'unknown' then v_b when v_b = 'unknown' then v_a else 'unknown' end;
  end if;
  if v_op = 'fx.switch' then
    -- The results sit at 2, 4, 6 … and the otherwise is the last value when the count after the
    -- first is odd. One kind across all of them is the answer; `unknown` defers, as IF's does.
    return coalesce((
      select case when count(distinct r.t) = 1 then min(r.t) else 'unknown' end
        from (select custom._fxp_type(a.e, p_fields) as t
                from jsonb_array_elements(p_node -> 'args') with ordinality a(e, i)
               where (a.i > 1 and a.i % 2 = 1)
                  or (a.i = jsonb_array_length(p_node -> 'args') and a.i > 1 and a.i % 2 = 0)) r
       where r.t <> 'unknown'), 'unknown');
  end if;
  if v_op in ('fx.min', 'fx.max') then
    if jsonb_array_length(p_node -> 'args') > 0
       and not exists (select 1 from jsonb_array_elements(p_node -> 'args') a
                        where custom._fxp_type(a, p_fields) <> 'date') then
      return 'date';
    end if;
    return 'number';
  end if;
  return coalesce((select k.result from custom.formula_node_kinds() k where k.node = v_op), 'unknown');
end
$fn$;
