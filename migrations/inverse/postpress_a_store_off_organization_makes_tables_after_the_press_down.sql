-- INVERSE of migrations/campaign/postpress_a_store_off_organization_makes_tables_after_the_press.sql
-- (lane POST-PRESS-SENTENCES). Puts custom.store_is_open back to the live body it held before
-- (feaf62af3f55200436468b414ef8b116bb8382f5edc0ec8d7d40f13a006af13b).
-- based-on: custom.store_is_open(uuid) fe16d7daa35eb470f21fc39835aa34a99a930b55812a3a39c83c66a14e1b5558

CREATE OR REPLACE FUNCTION custom.store_is_open(p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_open boolean;
begin
  -- The established read, unchanged from `custom._entity_custom_fields_guard` and
  -- `custom.containment_depth_ceiling`: `platform.knob_resolve(feature, key, rung)` answers
  -- jsonb and `#>> '{}'` takes the scalar out of it. Passing the organization id means an
  -- organization rung answers for that organization; `null` asks for the platform value,
  -- which is `coalesce(value, default_value)` and is what the runner asserts is false before
  -- it opens anything (§6b.2).
  begin
    v_open := coalesce((platform.knob_resolve('custom', 'system_enabled', p_organization_id) #>> '{}')::boolean,
                       false);

    -- ── LIMITS-FIX 2026-09-21: AN ORGANIZATION BORN AFTER THE RULING STARTS WITH THE
    -- STORE ON, AND NOTHING IS WRITTEN TO SAY SO. ─────────────────────────────────────────
    -- Measured the same day: 588 organizations, 73 carrying an override, so 515 resolve to
    -- the platform default of false — the store is off for every organization anyone made
    -- without knowing to ask, which is every organization the real-data crews made. Crew D
    -- followed the product's own tour and met a refusal several calls in.
    --
    -- WHY THIS IS A READ AND NOT A ROW. The first attempt was an AFTER INSERT trigger on
    -- `iam.organizations` writing the override at birth. It worked, and it broke 129
    -- campaign suites in one apply: every one of them creates an organization and then
    -- INSERTs this exact knob row, which now already existed —
    -- `duplicate key value violates unique constraint "knob_override_pkey"`. A default
    -- belongs in how the question is ANSWERED, not in a row that everyone else's INSERT
    -- then collides with. Nothing is written here, so nothing can collide.
    --
    -- AND AN EXISTING ORGANIZATION KEEPS ITS ANSWER. This only supplies a value where the
    -- organization has said nothing: an organization-scoped override, either way, is read
    -- above and wins untouched. The instant is when the ruling actually took effect on this
    -- database, so no organization that existed before it changes behaviour.
    if not v_open and p_organization_id is not null
       and not exists (select 1 from platform.knob_override k
                        where k.feature = 'custom' and k.key = 'system_enabled'
                          and k.scope_kind = 'organization'
                          and k.organization_id = p_organization_id)
       and exists (select 1 from iam.organizations o
                    where o.id = p_organization_id
                      and o.created_at >= timestamptz '2026-09-21 01:30:44+00') then
      v_open := true;
    end if;
  exception when others then
    -- §6b.4b, and it is a real trap rather than defensive noise: `platform.knob_resolve` is
    -- SECURITY INVOKER, and `has_table_privilege('anon','platform.feature_knob','SELECT')`
    -- is false — so for a role that merely cannot SEE the row it RAISES `P0001 … is not
    -- seeded`, which reads like a missing knob and is not one. A switch this writer cannot
    -- read is CLOSED, never open, and the caller is what says so out loud.
    v_open := false;
  end;
  return v_open;
end;
$function$;
