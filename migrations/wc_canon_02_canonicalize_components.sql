-- wc_canon_02_canonicalize_components
-- Register wc_report, wc_injury, wc_impairment_definition as component entities,
-- wire composition relationships, apply component RLS, ref-data policy.
-- Applied: 2026-06-27

DROP TRIGGER IF EXISTS set_updated_at ON public.wc_injury;
DROP TRIGGER IF EXISTS _touch_row      ON public.wc_injury;
DROP TRIGGER IF EXISTS _stamp_actor    ON public.wc_injury;

ALTER TABLE public.wc_report
    ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS _touch_row ON public.wc_report;
CREATE TRIGGER _touch_row
    BEFORE INSERT OR UPDATE ON public.wc_report
    FOR EACH ROW EXECUTE FUNCTION platform._touch_row();

CREATE TRIGGER _touch_row
    BEFORE INSERT OR UPDATE ON public.wc_injury
    FOR EACH ROW EXECUTE FUNCTION platform._touch_row();

INSERT INTO platform.entity_types
    (token, schema_name, table_name, label, default_visibility, is_component, is_versioned, has_soft_delete, is_active)
SELECT 'wc_report', 'public', 'wc_report', 'WC Report', 'private', true, false, false, true
WHERE NOT EXISTS (SELECT 1 FROM platform.entity_types WHERE token = 'wc_report');

INSERT INTO platform.entity_types
    (token, schema_name, table_name, label, default_visibility, is_component, is_versioned, has_soft_delete, is_active)
SELECT 'wc_injury', 'public', 'wc_injury', 'WC Injury', 'private', true, false, false, true
WHERE NOT EXISTS (SELECT 1 FROM platform.entity_types WHERE token = 'wc_injury');

INSERT INTO platform.entity_types
    (token, schema_name, table_name, label, default_visibility, is_component, is_versioned, has_soft_delete, is_active)
SELECT 'wc_impairment_definition', 'public', 'wc_impairment_definition', 'WC Impairment Definition', 'public', true, false, false, true
WHERE NOT EXISTS (SELECT 1 FROM platform.entity_types WHERE token = 'wc_impairment_definition');

INSERT INTO platform.entity_relationships (child_type, parent_type, fk_column, kind)
SELECT 'wc_report', 'wc_claim', 'claim_id', 'composition'
WHERE NOT EXISTS (SELECT 1 FROM platform.entity_relationships WHERE child_type = 'wc_report' AND kind = 'composition');

INSERT INTO platform.entity_relationships (child_type, parent_type, fk_column, kind)
SELECT 'wc_injury', 'wc_report', 'report_id', 'composition'
WHERE NOT EXISTS (SELECT 1 FROM platform.entity_relationships WHERE child_type = 'wc_injury' AND kind = 'composition');

SELECT iam.apply_rls('public', 'wc_report', 'wc_report', 'component');
SELECT iam.apply_rls('public', 'wc_injury', 'wc_injury', 'component');

ALTER TABLE public.wc_impairment_definition ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS svc_all   ON public.wc_impairment_definition;
DROP POLICY IF EXISTS auth_read ON public.wc_impairment_definition;

CREATE POLICY svc_all ON public.wc_impairment_definition
    TO service_role USING (true) WITH CHECK (true);

CREATE POLICY auth_read ON public.wc_impairment_definition
    FOR SELECT TO authenticated USING (true);
