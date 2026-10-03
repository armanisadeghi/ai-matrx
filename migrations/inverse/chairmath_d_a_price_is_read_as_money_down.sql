-- chair-step: the INVERSE of migrations/campaign/chairmath_d_a_price_is_read_as_money.sql.
--   It restores `custom.io_infer_type` exactly as it stood on production on 2026-10-03 before that
--   file. Hazard 4 (chair guidance): re-base on production's current body before running this after
--   any later file has replaced it.
--
-- based-on: custom.io_infer_type(jsonb) ca0417e98a65774dbd9e124a253ccd9278dec3430a977010e90266f8fd483bf0

CREATE OR REPLACE FUNCTION custom.io_infer_type(p_samples jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  -- Deliberately conservative, and it answers `text` when it is not sure. A proposal that
  -- guesses "number" off three rows and is wrong makes a person fix data later; a proposal
  -- that says "text" makes them change a dropdown now.
  with s as (select value #>> '{}' as v from jsonb_array_elements(coalesce(p_samples, '[]'::jsonb))
              where value #>> '{}' is not null and btrim(value #>> '{}') <> '')
  select case
           when not exists (select 1 from s) then 'text'
           -- LIMITS-FIX: THE TICK IS ASKED FIRST, and it has to be. A column holding only
           -- 1 and 0 is a yes/no far more often than it is a quantity, and the number arms
           -- below claimed every one of them before this arm was ever reached.
           when not exists (select 1 from s where lower(btrim(v)) not in
                             ('true','false','t','f','yes','no','y','n','1','0','on','off','x','✓','✔')) then 'checkbox'
           when not exists (select 1 from s where v !~ '^[+-]?[0-9]+$') then 'number'
           when not exists (select 1 from s where v !~ '^[+-]?[0-9]*[.][0-9]+$' and v !~ '^[+-]?[0-9]+$') then 'number'
           when not exists (select 1 from s where v !~ '^\d{4}-\d{2}-\d{2}$') then 'date'
           when not exists (select 1 from s where v !~ '^[^@\s]+@[^@\s]+[.][^@\s]+$') then 'email'
           else 'text'
         end;
$function$

;

