-- CHAIR-MATH (d) — A PRICE IS READ AS MONEY.
--
-- WHAT THIS PROVES. custom.io_infer_type (the importer's column-type proposal) answers `currency`
-- for a column of money amounts (symbol or code before or after, thousands separators, a sign or
-- accounting parentheses), `number` for a column of thousands-grouped plain numbers, and stays
-- `text` for a mixed column; every older arm (checkbox, number, date, email, text) is unchanged.
--
-- RED before migrations/campaign/chairmath_d_a_price_is_read_as_money.sql: "$4.87" -> text.
-- GREEN after it.
--
-- THE REAL USE CASE (2026-09-21 law — no fake test data). Cascade Dental Lab pastes its fee
-- schedule from a spreadsheet: "$4.87", "$12.00", "$1,250.50" in the Fee column.
--
-- Read-only; nothing is written. Run: node <scratch>/cpsql.mjs -f scripts/campaign-tests/chairmath_d_green.sql
\set ON_ERROR_STOP on
\set suite 'chairmath_d_green.sql'
\set requires 'function:custom.io_infer_type'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local statement_timeout = '60s';

create temp table cm_res (check_name text, ok boolean, detail text) on commit drop;

do $t$
declare
  v_case record;
  v_got  text;
begin
  for v_case in select * from (values
      ('money: dollar prices',                   '["$4.87", "$12.00", "$1,250.50"]'::jsonb,            'currency'),
      ('money: a negative and parentheses',      '["-$40", "($40.00)", "$0.99"]'::jsonb,               'currency'),
      ('money: code after the amount',           '["1,250.50 USD", "12 USD", "0.5 USD"]'::jsonb,       'currency'),
      ('money: code before the amount',          '["CAD 12", "CAD 1,000"]'::jsonb,                     'currency'),
      ('money: euro with a European decimal',    '["€1.250,00", "€4,87"]'::jsonb,                      'currency'),
      ('money: pounds and yen',                  '["£5", "¥1,200"]'::jsonb,                            'currency'),
      ('number: grouped by thousands',           '["1,250", "3,400", "12,000.50"]'::jsonb,             'number'),
      ('text: a mixed column stays text',        '["$4.87", "call us"]'::jsonb,                        'text'),
      ('text: a product code is not money',      '["ABC 123", "DEF 456"]'::jsonb,                      'text'),
      ('unchanged: bare numbers',                '["4.87", "12", "-3"]'::jsonb,                        'number'),
      ('unchanged: a tick box of 1 and 0',       '["1", "0", "1"]'::jsonb,                             'checkbox'),
      ('unchanged: dates',                       '["2026-10-03", "2026-11-01"]'::jsonb,                'date'),
      ('unchanged: emails',                      '["front@lakesidefootcare.com", "rosa@example.com"]'::jsonb, 'email'),
      ('unchanged: words',                       '["Received", "Shipped"]'::jsonb,                     'text'),
      ('unchanged: nothing at all',              '[]'::jsonb,                                          'text')
    ) as c(name, samples, want)
  loop
    v_got := custom.io_infer_type(v_case.samples);
    insert into cm_res values (v_case.name || ' -> ' || v_case.want, v_got = v_case.want, coalesce(v_got, '(null)'));
  end loop;
end;
$t$;

select check_name, case when ok then 'ok' else 'FAIL' end as result, detail from cm_res order by check_name;

do $t$
declare v_bad integer := (select count(*) from cm_res where not ok);
begin
  if v_bad > 0 then
    raise exception 'chairmath_d_green: % check(s) FAILED (RED) — a price is read as text', v_bad;
  end if;
  raise notice 'chairmath_d_green: all % checks passed (GREEN)', (select count(*) from cm_res);
end;
$t$;

rollback;
