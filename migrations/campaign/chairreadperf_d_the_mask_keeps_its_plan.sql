-- chair-step: it REPLACES the body of custom.mask_document — the six-argument overload, the only one a call can reach (signature, IMMUTABLE, search_path and grants unchanged): it is the same one expression it was, written as a plpgsql body instead of a SQL-language one, so its plan is kept for the session instead of being parsed and planned on every call. Same bytes out for every input. No other function, no table, index, policy, grant, door row or data row is touched.
-- lane: CHAIR-READPERF
-- based-on: custom.mask_document(jsonb, text[], jsonb, boolean, jsonb, text[]) 7affe83789b09b4ec1a37586c97150f0922abc368b4dc27d5c15ad204999a126
-- lock: custom
--
-- Inverse: migrations/inverse/chairreadperf_d_the_mask_keeps_its_plan_down.sql.
--
-- WHY (chair ruling, round 2 of CHAIR-READPERF, 2026-10-03). Profile of one hand-off on the clone
-- (test@test.com, a 627-scope type, 577 ms): custom.mask_document 82 ms — 0.13 ms a record — for a
-- jsonb_each over a dozen keys. The function is LANGUAGE sql with `SET search_path`, which the planner
-- never inlines, and a SQL-language function called through fmgr parses and plans its body on every call.
--
-- THE BAR (it is the access mask): byte-identical output. scripts/campaign-tests/chairreadperf_mask_parity.ts
-- compares the old expression and the new function over every record of every Table of both test seats'
-- organizations, at every rung's mask, keyed by key and by id — on the clone with both bodies side by
-- side, and on production read-only (the live function against the expression written inline) before
-- and after the apply. scripts/campaign-tests/leakt10_green.sql is run after.
--
-- THE FIVE-ARGUMENT OVERLOAD IS LEFT ALONE. Both overloads default their trailing arguments, so a call with five
-- or fewer arguments is refused as ambiguous ("function custom.mask_document(jsonb, text[], jsonb, boolean, jsonb)
-- is not unique"): nothing can reach it, and every caller passes six.

CREATE OR REPLACE FUNCTION custom.mask_document(p_document jsonb, p_visible_keys text[], p_notices jsonb, p_by_id boolean DEFAULT false, p_key_ids jsonb DEFAULT '{}'::jsonb, p_declared_keys text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
-- CHAIR-READPERF (2026-10-03): the same one expression as before, as a plpgsql body. A SQL-language
-- function that carries a SET clause is never inlined and is parsed and planned again on every call
-- (0.13 ms a record under the read door); plpgsql keeps the plan for the session.
declare
  v_out jsonb;
begin
  select jsonb_object_agg(
           case when p_by_id then coalesce(p_key_ids ->> e.key, e.key) else e.key end,
           case
             -- Visible: the reader's level reaches this declared field.
             when e.key = any (p_visible_keys) then e.value
             -- Not declared at all: there is no Field record, so there is no
             -- sensitivity, no level and no notice — nothing to withhold it FROM.
             -- The document's own value is the only truth about this key.
             -- `p_declared_keys` null means the caller did not compute the list,
             -- and then nothing is treated as undeclared: the old behaviour, exact.
             when p_declared_keys is not null and not (e.key = any (p_declared_keys))
               then e.value
             -- Declared, and this reader may not see it. Nulled, with its notice.
             else 'null'::jsonb
           end)
    into v_out
    from jsonb_each(coalesce(p_document, '{}'::jsonb)) e;
  return coalesce(v_out, '{}'::jsonb)
      || case when p_notices = '{}'::jsonb then '{}'::jsonb
              else jsonb_build_object('_hidden', p_notices) end;
end;
$function$;
