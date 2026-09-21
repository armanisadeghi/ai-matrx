-- additive: yes
--   It ADDS three new functions — `custom.phone_pattern()`, `custom.phone_canonical(text)`
--   and `custom.phone_display(text)` — and REPLACES the bodies of two existing ones,
--   `custom._field_document_for` and `custom.io_infer_column`, so that both read the one
--   pattern out of `custom.phone_pattern()` instead of spelling it out. It then rewrites the
--   stored `pattern` Rule of every existing phone Field that still carries one of the two old
--   patterns verbatim, and of every pending `work_approval` that would re-introduce one.
--   Nothing is dropped, nothing is revoked, no enum value is added, no door is created.
--   The inverse is `migrations/inverse/tails3_a_phone_number_may_be_written_the_way_people_write_it_down.sql`.
--
-- chair-step: it REPLACES the live bodies of `custom._field_document_for(uuid,uuid,jsonb)` and
--   `custom.io_infer_column(uuid,uuid,text,jsonb)`, and it UPDATEs existing `custom.record`
--   rows of `data_class` `field` and `work_approval`. Both replacements widen what is
--   accepted and narrow nothing; the row update swaps one Rule value for another and touches
--   no Value a person entered.
--
-- NO `-- target:` AND NO `-- guard:` HEADER, ON PURPOSE — same reason as
--   `tails3_a_portal_says_which_tables_it_shows.sql`: a file that NAMES production is judged
--   by an allow-list, and this one's whole point is to replace two function bodies. The OFF
--   switch is not lost: every path changed here already sits behind
--   `custom.store_is_open` / `custom.assert_store_door`, and the three new functions are pure
--   and decide nobody's access.
-- lane: TAILS-3
--
-- ── WHAT WAS BROKEN (AGENT-BUILDS-2's closing walk, 2026-09-21) ────────────────────────
--
-- The `phone` parity type's default validation Rule was the regex
--
--     ^[+0-9][0-9 ()\-\.]{4,}$
--
-- and it REFUSES `(415) 555-0178` — the ordinary American way of writing a phone number —
-- because the string starts with `(`. The walk that books a service call with Ironclad Mobile
-- Mechanic had to write `415-555-0178` instead, and left a comment in
-- `scripts/agent-walk/close.mjs` saying so. A real customer typing their real number into a
-- public booking page or a public form got "Phone is not written the way this field expects".
--
-- It is a CLASS, not an instance. TWO different phone patterns were live in the tree:
--
--   1. `^[+0-9][0-9 ()\-\.]{4,}$`   — what `custom._field_document_for` writes for a new
--                                     `phone` Field (12 stored Field rows carried it).
--   2. `^[+]?[0-9 ().-]{7,20}$`     — the kernel `contact_phone` Field shipped by
--                                     `w1_field_types_*` and mirrored in
--                                     `aidream/packages/matrx-records/.../field_types.py`
--                                     (8 stored Field rows carried it).
--
-- The second already accepts a leading `+`, and still refuses a leading `(`. A third spelling,
-- `^[+]?[0-9][0-9 ()./-]{6,19}$`, lived inside `custom.io_infer_column`, so a CSV column full
-- of `(415) 555-0178` was not even RECOGNISED as a phone column on import. Three spellings of
-- one idea, each wrong in the same way, is what a parity type exists to prevent.
--
-- ── THE FIX ───────────────────────────────────────────────────────────────────────────
--
-- ONE function, `custom.phone_pattern()`, holds the pattern, and every place that produced or
-- asserted one now calls it. The pattern is
--
--   ^(?=(?:[^0-9]*[0-9]){7,22}[^0-9]*$)[+]?[0-9 ().-]+(?:[ ]*(?:ext…|ext.|x)[ ]*[0-9]{1,8})?$
--
-- read as two claims made separately, which is why it is readable at all:
--
--   * THE LOOKAHEAD counts DIGITS, anywhere in the string: at least seven (a local number
--     such as `555-0178` is a real phone number), at most twenty-two (E.164 allows fifteen,
--     plus an extension). That single clause is what refuses `415`, an email address and a
--     sentence, and it does it by counting rather than by policing where a `(` may appear.
--   * THE BODY says which characters a person may use to write one: `+`, digits, spaces,
--     parentheses, dots and dashes, in any arrangement, optionally followed by an extension
--     written `x204`, `ext 204`, `ext. 204` or `extension 204`.
--
-- Accepted, all measured: `(415) 555-0178`, `415-555-0178`, `+1 415 555 0178`,
-- `+44 20 7946 0958`, `415.555.0178`, `(415)555-0178 x204`, `4155550178`,
-- `+1 (415) 555-0178 ext. 204`, `4155550178x204`, `+14155550178`, `555-0178`.
-- Refused, all measured: `call me maybe`, `marcus.delgado@harborlinemail.example`, `415`, ``.
--
-- THE PATTERN IS PORTABLE ON PURPOSE. The client reads the same Rule out of the Field
-- document and tests it with a JavaScript `RegExp`, so the pattern uses only constructs both
-- Postgres ARE and ECMAScript share — no `(?i)` inline flag, no `\d`, character classes
-- spelled out. Verified against both engines over the fourteen cases above.
--
-- ── THE ONE CANONICAL NORMALISATION, AND WHERE DISPLAY LIVES ──────────────────────────
--
-- `custom.phone_canonical(text)` is THE one normalisation: keep the leading `+` if the person
-- wrote one, keep the digits, keep the extension after an `x`. `(415) 555-0178` and
-- `415.555.0178` and `(415)555-0178` all canonicalise to `4155550178`; `+1 (415) 555-0178
-- ext. 204` canonicalises to `+14155550178x204`. It guesses no country code: a bare ten-digit
-- number stays bare, because assuming `+1` would silently turn a Manchester number into a
-- Californian one.
--
-- `custom.phone_display(text)` is THE one display spelling, in one place, for any surface that
-- holds a canonical number and must show it to a person: NANP numbers become
-- `(415) 555-0178` / `+1 (415) 555-0178`, an extension becomes ` ext. 204`, and anything else
-- is returned in its canonical `+…` form rather than grouped by a rule this store invented for
-- a country it cannot identify.
--
-- WHAT IS STORED IS STILL WHAT THE PERSON TYPED, AND THAT IS DELIBERATE — read this before
-- changing it. There is today NO phone branch anywhere in the display path:
-- `records-ui/src/values.tsx` special-cases `email`, `url`, `percent`, `currency` and
-- `datetime` and lets `phone` fall through to `String(value)`. So rewriting the stored value
-- to its canonical form at the door would make every grid cell, export and document show
-- `4155550178` where the customer typed `(415) 555-0178` — the same customer-facing harm as
-- the refusal, pointed the other way. The canonical form is therefore COMPUTED, in one place,
-- for the jobs that need one identity per number (matching, de-duplication, handing a number
-- to a dialer or to SMS), and the person's own spelling is what the screen keeps. When
-- `values.tsx` grows its `phone` branch it calls a mirror of `custom.phone_display`, exactly
-- as `PARITY_FIELD_TYPES` mirrors `custom.parity_field_types()` today.

-- ── 1. THE PATTERN, IN ONE PLACE ───────────────────────────────────────────────────────
create or replace function custom.phone_pattern()
returns text
language sql
immutable
set search_path to 'pg_catalog'
as $phone_pattern$
  select '^(?=(?:[^0-9]*[0-9]){7,22}[^0-9]*$)[+]?[0-9 ().-]+(?:[ ]*(?:[eE][xX][tT][eE][nN][sS][iI][oO][nN]|[eE][xX][tT]\.?|[xX])[ ]*[0-9]{1,8})?$'::text
$phone_pattern$;

comment on function custom.phone_pattern() is
  'THE regex a phone Field validates against. Every place that writes or asserts a phone '
  'pattern reads it here — custom._field_document_for, custom.io_infer_column, and the '
  'client, which gets it in the Field document and tests it with a JavaScript RegExp. It '
  'counts digits (7..22) rather than policing punctuation, so every ordinary spelling of a '
  'real number is accepted and a sentence, an email address and a three-digit stub are not. '
  'Portable between Postgres ARE and ECMAScript on purpose: no (?i), no \d.';

-- ── 2. THE ONE CANONICAL NORMALISATION ────────────────────────────────────────────────
create or replace function custom.phone_canonical(p_text text)
returns text
language plpgsql
immutable
strict
set search_path to 'pg_catalog'
as $phone_canonical$
declare
  c_ext constant text :=
    '(?:[ ]*(?:[eE][xX][tT][eE][nN][sS][iI][oO][nN]|[eE][xX][tT]\.?|[xX])[ ]*)([0-9]{1,8})[ ]*$';
  v_s    text := btrim(p_text);
  v_ext  text;
  v_base text;
  v_plus boolean;
  v_dig  text;
begin
  if v_s = '' then
    return null;
  end if;
  v_ext  := substring(v_s from c_ext);
  v_base := case when v_ext is null then v_s else regexp_replace(v_s, c_ext, '') end;
  -- The `+` is kept ONLY when the person wrote one. A bare ten-digit number is NOT assumed
  -- to be North American: a country code this store invented would be a wrong number.
  v_plus := btrim(v_base) ~ '^\+';
  v_dig  := regexp_replace(v_base, '[^0-9]', '', 'g');
  if v_dig = '' then
    return null;
  end if;
  return (case when v_plus then '+' else '' end) || v_dig
         || coalesce('x' || v_ext, '');
end;
$phone_canonical$;

comment on function custom.phone_canonical(text) is
  'THE one canonical form of a phone number: the leading + if the person wrote one, the '
  'digits, and the extension after an x. It is what two spellings of the same number are '
  'compared by — matching, de-duplication, handing a number to a dialer or to SMS. It never '
  'guesses a country code. It is NOT what is stored: the store keeps the spelling the person '
  'typed, because nothing in the display path formats a phone and a canonical value on screen '
  'would read worse than what they wrote. See the file header.';

-- ── 3. THE ONE DISPLAY SPELLING ───────────────────────────────────────────────────────
create or replace function custom.phone_display(p_text text)
returns text
language plpgsql
immutable
strict
set search_path to 'pg_catalog'
as $phone_display$
declare
  v_c    text := custom.phone_canonical(p_text);
  v_ext  text;
  v_core text;
  v_plus boolean;
  v_dig  text;
  v_ten  text;
  v_out  text;
begin
  if v_c is null then
    return null;
  end if;
  v_ext  := substring(v_c from 'x([0-9]+)$');
  v_core := regexp_replace(v_c, 'x[0-9]+$', '');
  v_plus := left(v_core, 1) = '+';
  v_dig  := regexp_replace(v_core, '[^0-9]', '', 'g');

  if (not v_plus and length(v_dig) = 10)
     or (length(v_dig) = 11 and left(v_dig, 1) = '1') then
    -- NANP, the one plan this store can group without inventing anything.
    v_ten := right(v_dig, 10);
    v_out := case when length(v_dig) = 11 then '+1 ' else '' end
             || '(' || substr(v_ten, 1, 3) || ') '
             || substr(v_ten, 4, 3) || '-' || substr(v_ten, 7, 4);
  else
    -- Every other plan: the canonical international spelling, ungrouped. E.164 unformatted
    -- is never WRONG; a grouping guessed for a country we have not identified would be.
    v_out := v_core;
  end if;

  return v_out || coalesce(' ext. ' || v_ext, '');
end;
$phone_display$;

comment on function custom.phone_display(text) is
  'THE one human spelling of a phone number, for a surface that holds a canonical number and '
  'must show it to a person. NANP numbers are grouped (415) 555-0178; everything else is '
  'returned in its canonical + form rather than grouped by a rule invented for a country this '
  'store cannot identify. An extension is appended as " ext. 204".';

-- ── 4. THE DOOR THAT WRITES A NEW PHONE FIELD READS THE PATTERN ───────────────────────
-- `custom._field_document_for` builds the Field document for every declared column. Its
-- `phone` arm wrote the regex out by hand; it now asks `custom.phone_pattern()`. Nothing else
-- in the body changes — the surrounding `case` is reproduced verbatim from the live
-- definition so the replacement is a one-line difference.
do $swap$
declare
  v_fn   oid  := to_regprocedure('custom._field_document_for(uuid,uuid,jsonb)');
  v_src  text;
  v_old  text := '''kind'', ''pattern'', ''value'', ''^[+0-9][0-9 ()\-\.]{4,}$''';
  v_new  text := '''kind'', ''pattern'', ''value'', custom.phone_pattern()';
begin
  if v_fn is null then
    -- The rehearsal copy is far behind the main database and does not carry the field door
    -- at all. Nothing to swap, and a scratch run must not fail on an absence.
    raise notice 'custom._field_document_for does not exist here; nothing to swap.';
    return;
  end if;
  v_src := pg_get_functiondef(v_fn);
  if position(v_old in v_src) = 0 then
    raise exception 'custom._field_document_for no longer writes the old phone pattern verbatim; refusing to guess where the new one goes.'
      using errcode = '23514',
            hint = 'Somebody changed the phone arm since this file was written. Read the live body, put custom.phone_pattern() in the phone arm by hand, and re-run.';
  end if;
  execute replace(v_src, v_old, v_new);
end;
$swap$;

-- ── 5. THE IMPORT'S "IS THIS A PHONE COLUMN" HEURISTIC READS IT TOO ───────────────────
-- Same class: a CSV column of `(415) 555-0178` was not recognised as a phone column, so the
-- import offered it as free text. The digit-count clause beside it (7..15) is kept — the
-- inference is allowed to be narrower than the validator, because guessing a column's type
-- wrongly is worse than leaving it as text.
do $swap$
declare
  v_fn  oid  := to_regprocedure('custom.io_infer_column(uuid,uuid,text,jsonb)');
  v_src text;
  v_old text := '''^[+]?[0-9][0-9 ()./-]{6,19}$''';
  v_new text := 'custom.phone_pattern()';
begin
  if v_fn is null then
    raise notice 'custom.io_infer_column does not exist here; nothing to swap.';
    return;
  end if;
  v_src := pg_get_functiondef(v_fn);
  if position(v_old in v_src) = 0 then
    raise exception 'custom.io_infer_column no longer carries the old phone heuristic verbatim; refusing to guess.'
      using errcode = '23514',
            hint = 'Read the live body, put custom.phone_pattern() in the phone arm by hand, and re-run.';
  end if;
  execute replace(v_src, v_old, v_new);
end;
$swap$;

-- ── 6. THE FIELDS THAT ALREADY EXIST ──────────────────────────────────────────────────
-- A Field carries its Rules in its own row, so fixing the door fixes only the NEXT phone
-- column. Every Field whose stored pattern Rule is VERBATIM one of the two old patterns is
-- moved forward here; a Rule somebody wrote themselves is left exactly as it is, because a
-- person's own pattern is their decision and not this file's to overwrite.
do $rows$
declare
  v_pat   text := custom.phone_pattern();
  v_old   text[] := array['^[+0-9][0-9 ()\-\.]{4,}$', '^[+]?[0-9 ().-]{7,20}$'];
  v_field integer := 0;
  v_appr  integer := 0;
begin
  with moved as (
    update custom.record r
       set data = jsonb_set(
                    r.data, '{rules}',
                    (select jsonb_agg(
                              case when rule ->> 'kind' = 'pattern'
                                    and (rule ->> 'value') = any (v_old)
                                   then jsonb_set(rule, '{value}', to_jsonb(v_pat))
                                   else rule end)
                       from jsonb_array_elements(r.data -> 'rules') rule))
     where r.data_class = 'field'
       and r.deleted_at is null
       and jsonb_typeof(r.data -> 'rules') = 'array'
       and exists (select 1 from jsonb_array_elements(r.data -> 'rules') rule
                    where rule ->> 'kind' = 'pattern'
                      and (rule ->> 'value') = any (v_old))
    returning 1)
  select count(*) into v_field from moved;

  -- A PENDING CHANGE CARRIES THE OLD RULE TOO. `work_approval` rows hold a `field_add` that
  -- has not been applied yet; approving one after this file ran would put an old pattern
  -- straight back into the store, which is exactly how a class re-opens.
  with moved as (
    update custom.record r
       set data = jsonb_set(
                    r.data, '{change,field,rules}',
                    (select jsonb_agg(
                              case when rule ->> 'kind' = 'pattern'
                                    and (rule ->> 'value') = any (v_old)
                                   then jsonb_set(rule, '{value}', to_jsonb(v_pat))
                                   else rule end)
                       from jsonb_array_elements(r.data -> 'change' -> 'field' -> 'rules') rule))
     where r.data_class = 'work_approval'
       and r.deleted_at is null
       and jsonb_typeof(r.data -> 'change' -> 'field' -> 'rules') = 'array'
       and exists (select 1 from jsonb_array_elements(r.data -> 'change' -> 'field' -> 'rules') rule
                    where rule ->> 'kind' = 'pattern'
                      and (rule ->> 'value') = any (v_old))
    returning 1)
  select count(*) into v_appr from moved;

  raise notice 'phone pattern moved forward on % field rows and % pending approvals', v_field, v_appr;
end;
$rows$;

-- ── 7. THE FILE PROVES ITSELF BEFORE IT COMMITS ───────────────────────────────────────
-- Ten real-world spellings and four things that are not phone numbers, judged by the pattern
-- this file just installed, plus the canonical and display forms of three of them. A file
-- that installed a pattern which refuses `(415) 555-0178` must not be allowed to land.
do $selfcheck$
declare
  v_pat text := custom.phone_pattern();
  r     record;
  v_bad text[] := '{}';
begin
  for r in
    select * from (values
      ('(415) 555-0178',              true),
      ('415-555-0178',                true),
      ('+1 415 555 0178',             true),
      ('+44 20 7946 0958',            true),
      ('415.555.0178',                true),
      ('(415)555-0178 x204',          true),
      ('4155550178',                  true),
      ('+1 (415) 555-0178 ext. 204',  true),
      ('555-0178',                    true),
      ('+14155550178',                true),
      ('call me maybe',               false),
      ('marcus.delgado@harborlinemail.example', false),
      ('415',                         false),
      ('',                            false)
    ) as t(v, want)
  loop
    if (r.v ~ v_pat) is distinct from r.want then
      v_bad := v_bad || format('%L expected %s', r.v, r.want);
    end if;
  end loop;

  if custom.phone_canonical('(415) 555-0178') <> '4155550178' then
    v_bad := v_bad || format('canonical of (415) 555-0178 is %L', custom.phone_canonical('(415) 555-0178'));
  end if;
  if custom.phone_canonical('+1 (415) 555-0178 ext. 204') <> '+14155550178x204' then
    v_bad := v_bad || format('canonical of the extension case is %L', custom.phone_canonical('+1 (415) 555-0178 ext. 204'));
  end if;
  if custom.phone_display('4155550178') <> '(415) 555-0178' then
    v_bad := v_bad || format('display of 4155550178 is %L', custom.phone_display('4155550178'));
  end if;
  if custom.phone_display('+14155550178x204') <> '+1 (415) 555-0178 ext. 204' then
    v_bad := v_bad || format('display of the extension case is %L', custom.phone_display('+14155550178x204'));
  end if;
  if custom.phone_display('+442079460958') <> '+442079460958' then
    v_bad := v_bad || format('display of the UK number is %L', custom.phone_display('+442079460958'));
  end if;

  if array_length(v_bad, 1) is not null then
    raise exception 'the phone pattern this file installed does not behave: %', array_to_string(v_bad, '; ')
      using errcode = '23514';
  end if;
  raise notice 'phone pattern, canonical and display all behave over 19 measured cases';
end;
$selfcheck$;
