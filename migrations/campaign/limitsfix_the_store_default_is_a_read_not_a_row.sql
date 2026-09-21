-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.store_is_open(uuid) 49b3a290af562253e1729d8b483ea0939ee74885b831c6ca71e15a49c4ef3662
-- based-on: custom._store_on_for_a_new_organization() 701792b2335dad73416bdfe8fe825200341652059d72f0ac4244113362e5741a
--
-- LIMITS-FIX — THE NEW-ORGANIZATION DEFAULT IS A READ, NOT A ROW. (Corrects my own apply.)
--
-- `limitsfix_a_new_organization_has_the_store_on.sql`, applied 20 minutes earlier, gave
-- `iam.organizations` an AFTER INSERT trigger writing each new organization's
-- `custom/system_enabled = true` override. It did what it said — a brand-new organization
-- declared a table, its columns and a record with no switch step — and it broke 129
-- campaign suites in the same instant, because every one of them creates an organization
-- and then INSERTs that exact knob row:
--
--   ERROR:  duplicate key value violates unique constraint "knob_override_pkey"
--   DETAIL: Key (feature, key, scope_kind, scope_id, organization_id)=(custom,
--           system_enabled, organization, …) already exists.
--
-- Measured before writing this: 129 files under `scripts/campaign-tests/` seed that row.
-- My own `limitsfix_green.sql` was one of them and went from 8 clauses passing to failing
-- before the first.
--
-- THE LESSON, and it is the lane's own law turned on itself: a DEFAULT belongs in how the
-- question is ANSWERED, not in a row that every other writer then collides with. Writing a
-- row to express a default makes the default a fact other people have to know about.
--
-- SO: the trigger function becomes a no-op that says why it is one (the trigger is left
-- attached rather than dropped — a file naming production is judged by an allow-list that
-- refuses DROP, and an empty trigger is inert), and `custom.store_is_open` answers TRUE for
-- an organization that (a) has said nothing itself and (b) was created at or after the
-- instant the ruling took effect on this database. An organization-scoped override, either
-- way, is read first and wins untouched, so THE 515 EXISTING ORGANIZATIONS KEEP THE ANSWER
-- THEY HAVE. Nothing is written, so nothing can collide.
--
-- Left behind on purpose, and recorded rather than hidden: the now-inert trigger
-- `zz_store_on_for_a_new_organization` on `iam.organizations` and its function. Removing
-- them is a DROP, which is a chair step with its own inverse migration, not something to
-- smuggle into an additive file.
--
CREATE OR REPLACE FUNCTION custom._store_on_for_a_new_organization()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- INERT ON PURPOSE. This wrote each new organization's `custom/system_enabled` override
  -- and collided with the 129 campaign suites that seed the same row. The default it was
  -- expressing now lives in `custom.store_is_open`, where it is answered and not stored.
  -- The trigger stays attached because a file that names production may not DROP; removing
  -- it is a chair step. It must never start writing again.
  return new;
end;
$function$;

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
$function$

;
