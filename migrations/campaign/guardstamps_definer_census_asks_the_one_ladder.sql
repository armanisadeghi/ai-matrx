-- chair-step: it REPLACES the definition of the view iam.definer_class_census, which is a
--   MEASUREMENT object -- no grant, no revoke, no policy, no function body, no row of anybody's
--   data. There is deliberately no `-- guard:` line: no knob holds a census off, and naming one
--   would be a comment pretending to be a switch, which is exactly what this runner refuses. The
--   inverse is migrations/inverse/guardstamps_definer_census_asks_the_one_ladder_down.sql and it
--   restores the previous definition as pg_get_viewdef printed it.
--
-- GUARD-STAMPS — THE CENSUS WAS ASKING FOUR LITERAL STRINGS AND CALLING THE SILENCE A HOLE.
--
-- `iam.definer_class_census` answers "does this SECURITY DEFINER function explain itself?" with
-- `prosrc like '%class_allows%' or '%has_access%' or '%assert_class_read%' or '%assert_may_transfer%'`,
-- plus three more regexes over the same body. All seven read ONE body and stop there. So a door
-- that decides perfectly well by calling a helper — which is how this platform is built, and what
-- `custom.assert_store_door` / `custom.assert_client_may_change` / `iam.has_org_access` are FOR —
-- reads as a function that answers to nobody.
--
-- Measured on the live database 2026-09-21: of the 246 functions the census called unexplained
-- readers, **220 decide access through the ladder** by the platform's own transitive oracle,
-- `platform.definer_body_decides_access(oid)` — the same one the DD-223 `door_body_must_decide`
-- constraint trigger already trusts to admit or refuse a door row. The census and the DDL guard
-- were answering the same question two different ways, and the census's way was wrong.
--
-- THREE ANSWERS ARE ADDED, each verifiable and none of them a name allowlist:
--
--   asks_the_ladder    `platform.definer_body_decides_access(oid)` — a bounded (depth 5),
--                      visited-set walk of the CALL GRAPH looking for a strong access primitive,
--                      or the caller's own identity in a COMPARISON (never merely stamped into a
--                      column). It is the platform's existing oracle, not a new opinion, and it
--                      is evaluated LAST in the OR chain so it runs only for the ~250 rows every
--                      cheaper answer has already failed (5.2 s for all 246, measured).
--
--   anon_rule_declared a row in `platform.client_callable_door` with `anonymous_callers = true`
--                      and an `anonymous_purpose`. This is the explicit anon rule the registry
--                      exists to hold, and the table's own CHECK constraints make it expensive to
--                      fake: the purpose must be at least 40 characters, and
--                      `door_reason_never_claims_an_anonymous_door` refuses a `reason` that talks
--                      about an anonymous door without the flag being set. 14 of the 15
--                      anon-reachable readers already carry one, written by the lanes that built
--                      them; the census simply never looked at the registry.
--
--   is_trigger         now also true for `returns event_trigger`. `iam.anon_key_needs_a_class_lane`
--                      is an EVENT TRIGGER function. PostgREST cannot call it any more than it can
--                      call a row trigger, and it was the 15th anon-reachable "door" — a census
--                      artefact, not a surface. It was also the only one of the 15 with no door
--                      row, which is how it stood out.
--
-- Nothing about the surface changes: no grant, no revoke, no body, no policy. What changes is
-- that the number the ratchet watches is now a count of functions that really do decide nothing.
-- It falls 246 -> 11, and 22 -> 0 for the signed-out end, and the ceiling falls with it in the
-- same commit. The eleven that remain are authenticated-only readers of the platform's own
-- catalogue tables (`entity_type`, `platform_schema`, `templates`, `system_orgs`) and they are
-- the campaign's real remaining distance.
--
-- 🚨 The census still measures BODIES as text, and `definer_body_decides_access` still walks
-- names it finds before a '(' — dynamic SQL is invisible to both. This remains a FLOOR on the
-- problem and never a ceiling.

create or replace view iam.definer_class_census
with (security_invoker = true) as
 WITH client_definers AS (
         SELECT p.oid,
            n.nspname AS schema_name,
            p.proname AS function_name,
            pg_get_function_identity_arguments(p.oid) AS identity_args,
            p.prorettype in ('trigger'::regtype::oid, 'event_trigger'::regtype::oid) AS is_trigger,
            has_function_privilege('authenticated'::name, p.oid, 'EXECUTE'::text) AS auth_exec,
            has_function_privilege('anon'::name, p.oid, 'EXECUTE'::text) AS anon_exec,
            p.prosrc
           FROM pg_proc p
             JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE p.prosecdef AND (n.nspname <> ALL (ARRAY['pg_catalog'::name, 'information_schema'::name, 'extensions'::name, 'graphql'::name, 'graphql_public'::name, 'pgsodium'::name, 'vault'::name, 'auth'::name, 'storage'::name, 'realtime'::name, 'cron'::name, 'net'::name, 'pgbouncer'::name, 'supabase_migrations'::name])) AND (has_function_privilege('authenticated'::name, p.oid, 'EXECUTE'::text) OR has_function_privilege('anon'::name, p.oid, 'EXECUTE'::text))
        ), classed AS (
         SELECT et.schema_name,
            et.table_name,
            et.token,
            et.data_class::text AS data_class,
            (et.schema_name || '.'::text) || et.table_name AS qualified
           FROM platform.entity_types et
          WHERE et.is_active AND (et.data_class::text = ANY (ARRAY['private'::text, 'confidential'::text]))
        ), matched AS (
         SELECT cd_1.oid,
            ( SELECT COALESCE(string_agg(DISTINCT c.token, ', '::text ORDER BY c.token), ''::text) AS "coalesce"
                   FROM classed c
                  WHERE strpos(cd_1.prosrc, c.qualified) > 0 AND cd_1.prosrc ~ (((('(^|[^a-zA-Z0-9_.])'::text || c.schema_name) || '\.'::text) || c.table_name) || '([^a-zA-Z0-9_]|$)'::text)) AS classed_tokens
           FROM client_definers cd_1
        )
 SELECT cd.schema_name,
    cd.function_name,
    cd.identity_args,
        CASE
            WHEN cd.is_trigger THEN 'trigger (not a client door)'::text
            WHEN cd.auth_exec AND cd.anon_exec THEN 'authenticated, anon'::text
            WHEN cd.anon_exec THEN 'anon'::text
            ELSE 'authenticated'::text
        END AS reachable_by,
    cd.is_trigger,
    cd.prosrc ~* 'set\s+(created_by|user_id|owner_id|organization_id|visibility)\s*='::text AS writes_identity,
    m.classed_tokens <> ''::text AS reads_classed,
    m.classed_tokens,
    cd.prosrc ~~ '%class_allows%'::text OR cd.prosrc ~~ '%has_access%'::text OR cd.prosrc ~~ '%assert_class_read%'::text OR cd.prosrc ~~ '%assert_may_transfer%'::text AS asks_the_gate,
    cd.prosrc ~* '(created_by|user_id|owner_id|actor_user_id|actor_id|recipient_user_id|student_user_id)\s*=\s*[^;]{0,40}(auth\.uid\(\)|v_uid|v_actor|v_user|v_caller|current_user_id)'::text AS narrows_to_caller,
    cd.prosrc ~* 'is_super_admin|is_platform_admin|is_admin\s*\(|_assert_admin|assert_admin|require_admin'::text AS asks_an_admin,
    cd.prosrc ~* 'iam\.my_orgs|iam\.is_org_manager|iam\.is_org_owner|iam\._container_authz|is_org_member'::text AS org_scoped,
    (EXISTS ( SELECT 1
           FROM platform.client_callable_door d
          WHERE d.schema_name = cd.schema_name AND d.function_name = cd.function_name)) AS declared,
    ex.reason AS exempt_reason,
    (EXISTS ( SELECT 1
           FROM platform.client_callable_door d
          WHERE d.schema_name = cd.schema_name AND d.function_name = cd.function_name
            AND d.anonymous_callers AND d.anonymous_purpose IS NOT NULL)) AS anon_rule_declared,
    platform.definer_body_decides_access(cd.oid) AS asks_the_ladder
   FROM client_definers cd
     JOIN matched m ON m.oid = cd.oid
     LEFT JOIN iam.definer_class_exemption ex ON ex.schema_name = cd.schema_name AND ex.function_name = cd.function_name AND (ex.identity_args = ''::text OR ex.identity_args = cd.identity_args);

comment on view iam.definer_class_census is
  'DD-137c census of client-callable SECURITY DEFINER functions. A function EXPLAINS ITSELF when any of: asks_the_gate, narrows_to_caller, asks_an_admin, org_scoped, anon_rule_declared (an explicit anon rule in platform.client_callable_door), or asks_the_ladder (platform.definer_body_decides_access, the same transitive oracle the DD-223 door_body_must_decide trigger uses). Bodies are measured as text: dynamic SQL is invisible, so this is a FLOOR and never a ceiling.';
