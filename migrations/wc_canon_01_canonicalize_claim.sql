-- wc_canon_01_canonicalize_claim
-- Canonicalize wc_claim (while still in public) — add canonical columns,
-- backfill, attach trigger trio, register in entity_types + registry, apply RLS.
-- Applied: 2026-06-27

ALTER TABLE public.wc_claim
    ADD COLUMN IF NOT EXISTS created_by   uuid,
    ADD COLUMN IF NOT EXISTS updated_by   uuid,
    ADD COLUMN IF NOT EXISTS deleted_at   timestamptz,
    ADD COLUMN IF NOT EXISTS version      int NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS visibility   platform.visibility NOT NULL DEFAULT 'private';

UPDATE public.wc_claim
SET created_by = user_id
WHERE created_by IS NULL AND user_id IS NOT NULL;

UPDATE public.wc_claim
SET visibility = CASE WHEN is_public THEN 'public'::platform.visibility ELSE 'private'::platform.visibility END
WHERE true;

UPDATE public.wc_claim
SET organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
WHERE organization_id IS NULL;

DROP TRIGGER IF EXISTS set_updated_at ON public.wc_claim;
DROP TRIGGER IF EXISTS _stamp_actor    ON public.wc_claim;
DROP TRIGGER IF EXISTS _touch_row      ON public.wc_claim;
DROP TRIGGER IF EXISTS _history        ON public.wc_claim;

CREATE TRIGGER _stamp_actor
    BEFORE INSERT OR UPDATE ON public.wc_claim
    FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor();

CREATE TRIGGER _touch_row
    BEFORE INSERT OR UPDATE ON public.wc_claim
    FOR EACH ROW EXECUTE FUNCTION platform._touch_row();

CREATE TRIGGER _history
    AFTER INSERT OR UPDATE OR DELETE ON public.wc_claim
    FOR EACH ROW EXECUTE FUNCTION platform._version_capture('wc_claim');

INSERT INTO platform.entity_types
    (token, schema_name, table_name, label, default_visibility, is_component, is_versioned, has_soft_delete, is_active)
SELECT 'wc_claim', 'public', 'wc_claim', 'WC Claim', 'private', false, true, true, true
WHERE NOT EXISTS (SELECT 1 FROM platform.entity_types WHERE token = 'wc_claim');

INSERT INTO public.shareable_resource_registry
    (resource_type, schema_name, table_name, id_column, owner_column, is_public_column, display_label, url_path_template, rls_uses_has_permission)
SELECT 'wc_claim', 'public', 'wc_claim', 'id', 'created_by', 'visibility', 'WC Claim', '/legal/wc/{id}', true
WHERE NOT EXISTS (SELECT 1 FROM public.shareable_resource_registry WHERE resource_type = 'wc_claim');

SELECT iam.apply_rls('public', 'wc_claim', 'wc_claim', 'entity');
