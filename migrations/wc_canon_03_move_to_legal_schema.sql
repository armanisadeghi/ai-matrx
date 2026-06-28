-- wc_canon_03_move_to_legal_schema
-- Move all wc_* tables and enums from public to legal schema.
-- Update platform registry, shareable_resource_registry, deprecated_relations.
-- Applied: 2026-06-27

ALTER TYPE public.wc_finger_type SET SCHEMA legal;
ALTER TYPE public.wc_side        SET SCHEMA legal;

ALTER TABLE public.wc_impairment_definition SET SCHEMA legal;
ALTER TABLE public.wc_claim                 SET SCHEMA legal;
ALTER TABLE public.wc_report                SET SCHEMA legal;
ALTER TABLE public.wc_injury                SET SCHEMA legal;

UPDATE platform.entity_types SET schema_name = 'legal'
WHERE token IN ('wc_claim', 'wc_report', 'wc_injury', 'wc_impairment_definition');

UPDATE public.shareable_resource_registry SET schema_name = 'legal'
WHERE resource_type = 'wc_claim';

INSERT INTO platform.deprecated_relations (old_ref, new_ref, reason, deprecated_at)
VALUES
    ('public.wc_claim',                 'legal.wc_claim',                 'schema reorg 2026-06-27', now()),
    ('public.wc_report',                'legal.wc_report',                'schema reorg 2026-06-27', now()),
    ('public.wc_injury',                'legal.wc_injury',                'schema reorg 2026-06-27', now()),
    ('public.wc_impairment_definition', 'legal.wc_impairment_definition', 'schema reorg 2026-06-27', now())
ON CONFLICT (old_ref) DO UPDATE SET new_ref = EXCLUDED.new_ref, deprecated_at = EXCLUDED.deprecated_at;
