-- chair-step: inverse of migrations/campaign/chairreadperf_d_the_mask_keeps_its_plan.sql — puts back the SQL-language custom.mask_document body (six arguments) it replaced (signature, grants unchanged).
-- lane: CHAIR-READPERF
-- based-on: custom.mask_document(jsonb, text[], jsonb, boolean, jsonb, text[]) e74e43b73684cd2d87c9b50a207840dbc051ba9cee2247b0e74ccdc8063f67d6
-- lock: custom

CREATE OR REPLACE FUNCTION custom.mask_document(p_document jsonb, p_visible_keys text[], p_notices jsonb, p_by_id boolean DEFAULT false, p_key_ids jsonb DEFAULT '{}'::jsonb, p_declared_keys text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select coalesce(
    (select jsonb_object_agg(
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
       from jsonb_each(coalesce(p_document, '{}'::jsonb)) e), '{}'::jsonb)
    || case when p_notices = '{}'::jsonb then '{}'::jsonb
            else jsonb_build_object('_hidden', p_notices) end;
$function$;
