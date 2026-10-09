-- lane: PERF-FIX-6
-- based-on: platform.knob_resolve(text, text, uuid, uuid, jsonb) 614460e69c2b70948e42f94ab2bcd88ddcbed7ba0fd78d1aa532bf1d75880dd8
--
-- PERF-FIX-6 (2026-10-08). A feature's untouched knobs are read once per statement.
--   platform.knob_resolve remembered each (feature, key, organization, person) for the transaction, but every
--   distinct key still ran knob_resolve_uncached (a table page: 8-31 of them, 25-100 ms). A knob with no override
--   row in the organization resolves to its platform value for everyone, so the first resolve of a feature in a
--   statement now reads all such knobs of that feature in one query into the per-statement memo, and the rest
--   read them there. Overridden knobs, null platform values, unseeded knobs and every resolve after the
--   transaction has written go to knob_resolve_uncached exactly as before.
--   mx.knob_feature_memo = off: always the resolver (the proofs compare both on one snapshot).
-- Function bodies only: any hour.

set local statement_timeout = '60s';

CREATE OR REPLACE FUNCTION platform.knob_resolve(p_feature text, p_key text, p_organization_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_scopes jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'platform', 'public'
AS $function$
declare
  v_k   text;
  v_hit text;
  v_out jsonb;
  v_fk  text;
  v_map text;
begin
  -- A READ THAT STANDS ON A ROW-KEYED RUNG IS NOT MEMOISED. `p_scopes` is a whole array of rungs
  -- and the answer depends on every one of them; the common case by a factor of thousands is no
  -- scopes at all, and that is the one worth remembering.
  if p_scopes is not null then
    return platform.knob_resolve_uncached(p_feature, p_key, p_organization_id, p_user_id, p_scopes);
  end if;

  v_k := 'knob|' || coalesce(p_feature, '') || '|' || coalesce(p_key, '') || '|' ||
         coalesce(p_organization_id::text, '') || '|' || coalesce(p_user_id::text, '');
  v_hit := platform.memo_get(v_k);
  if v_hit is not null then
    return v_hit::jsonb;
  end if;

  -- PERF-FIX-6 (2026-10-08). A FEATURE'S UNTOUCHED KNOBS, READ ONCE PER STATEMENT. A knob with no override row
  -- in this organization (or no organization asked) resolves to its platform value, coalesce(value,
  -- default_value), for every person - knob_resolve_uncached reads no rung that is not an override row of the
  -- organization. So the first resolve of a feature in a statement reads every such knob of that feature in
  -- one query (under the caller's own role, as the resolver reads them) and keeps it in the per-statement
  -- memo; a later resolve of any of them reads it there. A knob with an override row in the organization, a
  -- platform value that is null, an unseeded knob, and every resolve after the transaction has written
  -- anything go to knob_resolve_uncached exactly as before. mx.knob_feature_memo = off: always the resolver.
  if p_feature is not null and p_key is not null
     and pg_catalog.pg_current_xact_id_if_assigned() is null
     and coalesce(current_setting('mx.knob_feature_memo', true), '') <> 'off' then
    v_fk := 'platform.knob_feature:' || p_feature || ':' || coalesce(p_organization_id::text, '') || ':' || current_user;
    v_map := platform.memo_k_get(v_fk);
    if v_map is null then
      select coalesce(jsonb_object_agg(f.key, coalesce(f.value, f.default_value)), '{}'::jsonb)::text into v_map
        from platform.feature_knob f
       where f.feature = p_feature
         and coalesce(f.value, f.default_value) is not null
         and (p_organization_id is null
              or not exists (select 1 from platform.knob_override o
                              where o.feature = f.feature and o.key = f.key
                                and o.organization_id = p_organization_id));
      perform platform.memo_k_put(v_fk, v_map);
    end if;
    v_out := v_map::jsonb -> p_key;
    if v_out is not null then
      return v_out;
    end if;
  end if;

  v_out := platform.knob_resolve_uncached(p_feature, p_key, p_organization_id, p_user_id, null);
  -- A REFUSAL IS NEVER REMEMBERED. `knob_resolve_uncached` raises for an unseeded knob and for a
  -- caller who cannot read the register; that must happen every single time it is true, so only
  -- an answer reaches the memo, and only after it has been worked out honestly once.
  perform platform.memo_put(v_k, v_out::text);
  return v_out;
end;
$function$
;
