-- chair-step: it restores the PREVIOUS definition of the view iam.definer_class_census, as
--   pg_get_viewdef printed it before guardstamps_definer_census_asks_the_one_ladder.sql replaced
--   it. Running this makes the census blind again to doors that decide through a helper, so its
--   unexplained-reader count jumps back from 11 to 246 without a single door having changed.
--
create or replace view iam.definer_class_census with (security_invoker = true) as
 WITH client_definers AS (
         SELECT p.oid,
            n.nspname AS schema_name,
            p.proname AS function_name,
            pg_get_function_identity_arguments(p.oid) AS identity_args,
            p.prorettype = 'trigger'::regtype::oid AS is_trigger,
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
    ex.reason AS exempt_reason
   FROM client_definers cd
     JOIN matched m ON m.oid = cd.oid
     LEFT JOIN iam.definer_class_exemption ex ON ex.schema_name = cd.schema_name AND ex.function_name = cd.function_name AND (ex.identity_args = ''::text OR ex.identity_args = cd.identity_args);
