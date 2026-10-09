-- chair-step: undo perffix6_b_a_features_untouched_knobs_are_read_once.sql - restores platform.knob_resolve as it was
-- lane: PERF-FIX-6
-- based-on: platform.knob_resolve(text, text, uuid, uuid, jsonb) 498bf814a2cb430fd1acec39e6d1aae6d5c66374481c000171a47a9c014dbd44

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

  v_out := platform.knob_resolve_uncached(p_feature, p_key, p_organization_id, p_user_id, null);
  -- A REFUSAL IS NEVER REMEMBERED. `knob_resolve_uncached` raises for an unseeded knob and for a
  -- caller who cannot read the register; that must happen every single time it is true, so only
  -- an answer reaches the memo, and only after it has been worked out honestly once.
  perform platform.memo_put(v_k, v_out::text);
  return v_out;
end;
$function$

;
