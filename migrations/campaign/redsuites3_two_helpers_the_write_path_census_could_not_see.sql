-- additive: yes
--
-- chair-step: it REPLACES two live function bodies on the record write path, moving each from
--   LANGUAGE sql to LANGUAGE plpgsql with the body character for character unchanged. Nothing
--   is created, dropped, granted or revoked, no row of anybody's data is touched, and no knob
--   can hold it off — these bodies ARE the live path, so a `-- guard:` line would be a comment
--   pretending to be a switch. This is the same shape, and the same reasoning, as
--   `writeperf2_the_rest_of_the_write_path_plans_once.sql`, which converted twenty of them.
--   Each carries a `-- based-on:` hash of the body it was written against, so the whole file
--   refuses if either has moved since.
-- based-on: iam.governance_columns(text) b9b18893b5aaa54ca57d717028e7675ed1fca6b67e160df66303f2970e026129
-- based-on: platform._confirmation_admission(oid) 0f31541f1d5d6e735c44b6f3c1498c839608d1b875ae19f7473faad92466f92f
--
-- RED-SUITES-3 — TWO RE-PLANNING HELPERS ON THE LIVE WRITE PATH THAT THE CENSUS WAS BLIND TO.
--
-- HOW THEY WERE FOUND, because the way matters more than the fix. `writeperf2_red.sql` RED 4
-- asks `custom.ladder_replanners(<the forty-one write-path entry points>)` and demanded the
-- number 20. It answered 12. FIVE of those forty-one names were wrong:
--
--     custom._stamp_actor              -> platform._stamp_actor
--     custom._stamp_actor_tier         -> platform._stamp_actor_tier
--     custom._touch_row                -> platform._touch_row
--     custom._metadata_guard           -> platform._metadata_guard
--     custom._guard_governance_columns -> iam._guard_governance_columns
--
-- `custom.ladder_replanners` walks what an entry point REACHES. A name that resolves to no
-- function reaches nothing, so those five trigger functions — every one of them attached to
-- `custom.record` and fired on every single write — were reported CLEAN by never being looked
-- at. The census was not measuring the write path; it was measuring thirty-six of its
-- forty-one doors and calling that all of them.
--
-- WHAT WAS BEHIND THEM. With the five names corrected, the live write path answers:
--
--     iam.governance_columns
--     platform._confirmation_admission
--
-- Both are `LANGUAGE sql` with `SECURITY DEFINER` + `SET search_path`, which makes them
-- non-inlinable, so PostgreSQL re-plans their bodies on EVERY CALL — the plan cache of a
-- non-inlined SQL-language function lives for the calling query, not the session. That is
-- exactly the defect WRITE-PERF-2 converted twenty other helpers to close, and
-- `writeperf2_green.sql` clause 9 fails the whole write path on it. `iam.governance_columns`
-- is reached from `iam._guard_governance_columns`, a trigger on every governed table;
-- `platform._confirmation_admission` from `platform._metadata_guard`. Both run per statement
-- on the store's hottest relation.
--
-- WHAT THIS CHANGES: the LANGUAGE, and nothing else. Each body is moved into plpgsql
-- character for character — same select, same arguments, same volatility, same security, same
-- search_path, same result type. This is the remedy `custom.ladder_replanners` prints for
-- itself, and the remedy LADDER-PERF measured at 7.24 ms -> 1.36 ms on `custom.carrying_edges_of`.
--
-- Inverse: `migrations/inverse/redsuites3_two_helpers_the_write_path_census_could_not_see_down.sql`,
-- which puts both bodies back as `LANGUAGE sql`, byte for byte.

CREATE OR REPLACE FUNCTION iam.governance_columns(p_token text)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return coalesce(
    (select et.governed_columns from platform.entity_types et where et.token = p_token),
    -- THE PLATFORM DEFAULT. Deliberately NOT `visibility` — publishing is an
    -- edit-level action. These three are "delete it, or change who owns it".
    array['created_by', 'organization_id', 'deleted_at']
  );
end;
$function$;

CREATE OR REPLACE FUNCTION platform._confirmation_admission(p_relid oid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid;
begin
  select et.id into v_id
    from platform.entity_types et
   where to_regclass(quote_ident(et.schema_name) || '.' || quote_ident(et.table_name)) = p_relid
     and et.confirmation_enabled
   limit 1;
  return v_id;
end;
$function$;
