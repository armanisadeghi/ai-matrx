-- get_user_tables must report the CANONICAL visibility.
--
-- The table cards read the legacy `is_public` boolean and rendered everything
-- that was not public as "Private". Every dataset here is `internal` — visible
-- to the whole organization — and every card said Private. A user reading that
-- badge believed their data was more private than it was, which is the worst
-- direction for a privacy control to be wrong in.
--
-- Purely additive: existing keys are untouched, so no caller breaks; the new
-- `visibility` and `organization_id` keys let the UI stop guessing. Consumer is
-- `VisibilityBadge` in components/user-generated-table-data/TableCards.tsx,
-- which now says "Sharing unknown" rather than guessing when neither key
-- resolves.
--
-- Idempotent. Safe to re-run.
CREATE OR REPLACE FUNCTION public.get_user_tables()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_result JSONB;
BEGIN
    SELECT jsonb_agg(jsonb_build_object(
        'id', ut.id, 'table_name', ut.table_name, 'description', ut.description, 'version', ut.version,
        'user_id', ut.user_id, 'is_public', ut.is_public, 'row_ordering_config', ut.row_ordering_config,
        'visibility', ut.visibility::text,
        'organization_id', ut.organization_id,
        'created_at', ut.created_at, 'updated_at', ut.updated_at,
        'row_count', (SELECT COUNT(*) FROM workbench.udt_dataset_rows WHERE table_id = ut.id),
        'field_count', (SELECT COUNT(*) FROM workbench.udt_dataset_fields WHERE table_id = ut.id)
    ) ORDER BY ut.created_at DESC) INTO v_result
    FROM workbench.udt_datasets ut
    WHERE ut.user_id = auth.uid();
    RETURN jsonb_build_object('success', true, 'tables', COALESCE(v_result, '[]'::jsonb));
END;
$function$;

NOTIFY pgrst, 'reload schema';
