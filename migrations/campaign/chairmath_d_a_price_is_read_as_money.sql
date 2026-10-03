-- additive: yes
--
-- chair-step: it REPLACES one function body, `custom.io_infer_type`. Nothing is dropped, nothing is
--   revoked, no row of anybody's data is touched. The inverse is
--   `migrations/inverse/chairmath_d_a_price_is_read_as_money_down.sql`.
--
-- CHAIR-MATH (d) — A PRICE IS READ AS MONEY.
--
-- `custom.io_infer_type` (the importer's column-type proposal) read "$4.87" as `text`: its number
-- arms admit only bare digits with an optional decimal point. A column of prices then became a text
-- column, and every sum over it was nothing.
--
-- THE FIX. Two arms, placed after the bare-number arms and before the date arm, each firing only
-- when EVERY sample fits (so a mixed column — some "$4.87", some "call us" — stays `text`):
--   · money: a currency symbol ($ € £ ¥ ₹ ₩ ₽ ₺, R$ / CA$ / A$ / US$ …) or a three-letter code before
--     or after the amount, thousands separators (, . ' space) and a decimal part allowed, a leading
--     sign or accounting parentheses for a negative  ->  `currency`, the money kind the store already
--     has (parity `currency`; custom._field_document_for defaults its unit to $ — the symbol itself is
--     not yet carried into the proposal's unit; that is the importer's follow-up, named in the report);
--   · a number grouped by thousands ("1,250", "1,250.50")  ->  `number`.
-- No new kind is coined (lane 10's registry, custom.field_kinds, is unchanged).
--
-- GUARD: scripts/campaign-tests/chairmath_d_green.sql — red before this file ("$4.87" -> text),
-- green after (currency / number / text as above; the older arms unchanged).
--
-- based-on: custom.io_infer_type(jsonb) 0f55fb8d89f28ad78d1ef4a896b07ed082a77819588270ffca313cba443fe2a8

CREATE OR REPLACE FUNCTION custom.io_infer_type(p_samples jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  -- Deliberately conservative, and it answers `text` when it is not sure. A proposal that
  -- guesses "number" off three rows and is wrong makes a person fix data later; a proposal
  -- that says "text" makes them change a dropdown now.
  --
  -- CHAIR-MATH (d), 2026-10-03: A PRICE IS MONEY. "$4.87", "€1.250,00", "1,250.50 USD", "CAD 12",
  -- "-$40", "($40)" all read as `currency` — the money kind the store already has (parity
  -- `currency`: behaviour range, format currency, unit; custom._field_document_for defaults the
  -- unit to $). A column of plain numbers WITH thousands separators ("1,250") reads as `number`.
  -- A mixed column (some "$4.87", some "call us") stays `text`, as every arm below works: one
  -- sample outside the shape and the arm does not fire.
  with s as (select value #>> '{}' as v from jsonb_array_elements(coalesce(p_samples, '[]'::jsonb))
              where value #>> '{}' is not null and btrim(value #>> '{}') <> ''),
  -- the money shapes, one regular expression each, applied to the trimmed sample:
  --   amount  := digits, optionally grouped by , or . or space or ', with an optional . or , decimal part
  --   sign    := an optional leading - or + , or the whole thing in parentheses (accounting negative)
  --   symbol  := $ € £ ¥ ₹ ₩ ₽ ₺ R$ CA$ A$ US$ (before, optional space)
  --   code    := one of the common ISO currency codes (before or after, optional space) — never ANY
  --              three capitals, or a product code like "ABC 123" would read as money
  m as (select v,
          (regexp_replace(btrim(v), '^\((.*)\)$', '\1')) as inner_v
          from s),
  k as (select v,
          inner_v ~ ('^[+-]?\s?(R\$|CA\$|A\$|US\$|NZ\$|HK\$|S\$|[$€£¥₹₩₽₺])\s?'
                     '(\d{1,3}([,.''\s]\d{3})*|\d+)([.,]\d+)?$')
          or inner_v ~ ('^[+-]?\s?(USD|EUR|GBP|CAD|AUD|JPY|CHF|CNY|INR|MXN|BRL|NZD|SEK|NOK|DKK|HKD|SGD|KRW|ZAR|AED|SAR|PLN|CZK|HUF|TRY|ILS|THB|PHP|IDR|MYR|RUB)\s?(\d{1,3}([,.''\s]\d{3})*|\d+)([.,]\d+)?$')
          or inner_v ~ ('^[+-]?\s?(\d{1,3}([,.''\s]\d{3})*|\d+)([.,]\d+)?\s?'
                        '(R\$|CA\$|A\$|US\$|NZ\$|HK\$|S\$|[$€£¥₹₩₽₺]|(USD|EUR|GBP|CAD|AUD|JPY|CHF|CNY|INR|MXN|BRL|NZD|SEK|NOK|DKK|HKD|SGD|KRW|ZAR|AED|SAR|PLN|CZK|HUF|TRY|ILS|THB|PHP|IDR|MYR|RUB))$') as money,
          inner_v ~ '^[+-]?\d{1,3}(,\d{3})+([.]\d+)?$' as grouped_number
          from m)
  select case
           when not exists (select 1 from s) then 'text'
           -- LIMITS-FIX: THE TICK IS ASKED FIRST, and it has to be. A column holding only
           -- 1 and 0 is a yes/no far more often than it is a quantity, and the number arms
           -- below claimed every one of them before this arm was ever reached.
           when not exists (select 1 from s where lower(btrim(v)) not in
                             ('true','false','t','f','yes','no','y','n','1','0','on','off','x','✓','✔')) then 'checkbox'
           when not exists (select 1 from s where v !~ '^[+-]?[0-9]+$') then 'number'
           when not exists (select 1 from s where v !~ '^[+-]?[0-9]*[.][0-9]+$' and v !~ '^[+-]?[0-9]+$') then 'number'
           -- CHAIR-MATH (d): every sample is a money amount (symbol or code + number, separators
           -- allowed, parentheses or a sign for a negative) -> the money kind.
           when not exists (select 1 from k where not money) then 'currency'
           -- CHAIR-MATH (d): every sample is a number grouped by thousands -> a number.
           when not exists (select 1 from k where not grouped_number) then 'number'
           when not exists (select 1 from s where v !~ '^\d{4}-\d{2}-\d{2}$') then 'date'
           when not exists (select 1 from s where v !~ '^[^@\s]+@[^@\s]+[.][^@\s]+$') then 'email'
           else 'text'
         end;
$function$
;
