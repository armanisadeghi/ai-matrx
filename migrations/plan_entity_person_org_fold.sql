-- plan_entity_person_org_fold.sql
--
-- CRM Wave 2: fold plan.entity person/org rows into crm.party, per the
-- ratified ruling in common-docs/systems/crm/FEATURE.md:
--   entity_type IN ('person','org') -> crm.party; KEEP {'source','media'} in plan.
-- plan.entity survives as the citation/source store (122 live source rows at
-- fold time); it is NOT graveyarded.
--
-- Live person/org data at fold time (verified 2026-08-12):
--   * 2 live rows, both "Dr. Jane Reviewer" (person, MD), same org + site —
--     true duplicates; they fold to ONE party.
--   * 0 live org rows (all org rows already soft-deleted test churn — left
--     as soft-deleted history in plan.entity).
--   * Edges touching them: exactly 2 plan_node->plan_entity 'reviewed_by'
--     (plan_review payloads) + 2 trigger-written plan_entity->web_site
--     containment edges. Nothing else (verified against all 254 edges).
--
-- The (plan_node,party) and (party,web_site) association pairs were already
-- registered by crm_02_core.sql for exactly this fold.
--
-- Idempotent: keyed on crm.party.source_detail = 'plan_entity_person_org_fold'.

-- 1. Rebind the plan_review payload kind to the (plan_node, party) pair.
--    reviewed_by/authored_by edges are person edges; after the fold they only
--    ever target party, so the single binding MOVES (a payload kind binds to
--    exactly ONE pair by design).
UPDATE platform.edge_payload_kind
   SET source_type = 'plan_node', target_type = 'party'
 WHERE kind = 'plan_review'
   AND NOT (source_type = 'plan_node' AND target_type = 'party');

-- 2. Create the folded party (one per distinct (org, lower(label)) among live
--    person/org rows) with source stamping and the legacy ids in metadata.
INSERT INTO crm.party (
  party_kind, display_name, name_suffix, attributes, metadata,
  organization_id, created_by, visibility, source, source_detail
)
SELECT
  CASE e.entity_type WHEN 'org' THEN 'organization' ELSE 'person' END,
  min(e.label),
  CASE WHEN min(e.attributes->>'credentials') IS NOT NULL
       THEN min(e.attributes->>'credentials') END,
  COALESCE(
    (array_agg(e.attributes ORDER BY e.created_at))[1] - 'credentials',
    '{}'::jsonb
  ),
  jsonb_build_object('folded_from_plan_entity',
                     jsonb_agg(e.id ORDER BY e.created_at)),
  e.organization_id,
  min(e.created_by::text)::uuid,
  'internal',
  'import',
  'plan_entity_person_org_fold'
FROM plan.entity e
WHERE e.entity_type IN ('person','org')
  AND e.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM crm.party p
     WHERE p.source_detail = 'plan_entity_person_org_fold'
       AND p.organization_id = e.organization_id
       AND lower(p.display_name) = lower(e.label)
       AND p.deleted_at IS NULL
  )
GROUP BY e.organization_id, e.entity_type, lower(e.label);

-- 3. Site roster membership: party -> web_site edge, role 'writes_for'
--    (the registered role for "writes content for this site"). One edge per
--    (party, site) the folded rows belonged to.
INSERT INTO platform.associations
  (source_type, source_id, target_type, target_id, organization_id, role, created_by)
SELECT DISTINCT 'party', p.id, 'web_site', e.site_id, e.organization_id,
       'writes_for', e.created_by
FROM plan.entity e
JOIN crm.party p
  ON p.source_detail = 'plan_entity_person_org_fold'
 AND p.organization_id = e.organization_id
 AND lower(p.display_name) = lower(e.label)
 AND p.deleted_at IS NULL
WHERE e.entity_type IN ('person','org') AND e.deleted_at IS NULL
ON CONFLICT (source_type, source_id, target_type, target_id, role) DO NOTHING;

-- 4. Repoint plan_node -> plan_entity edges whose target folded, keeping role,
--    payload_kind and payload intact. (Only 'reviewed_by' exists today, but the
--    predicate covers any role so a race-created edge cannot be stranded.)
UPDATE platform.associations a
   SET target_type = 'party', target_id = p.id
  FROM plan.entity e
  JOIN crm.party p
    ON p.source_detail = 'plan_entity_person_org_fold'
   AND p.organization_id = e.organization_id
   AND lower(p.display_name) = lower(e.label)
   AND p.deleted_at IS NULL
 WHERE a.target_type = 'plan_entity' AND a.target_id = e.id
   AND a.source_type = 'plan_node'
   AND e.entity_type IN ('person','org')
   AND NOT EXISTS (
     SELECT 1 FROM platform.associations d
      WHERE d.source_type = a.source_type AND d.source_id = a.source_id
        AND d.target_type = 'party' AND d.target_id = p.id
        AND d.role IS NOT DISTINCT FROM a.role
   );

-- 5. Remove the trigger-written plan_entity -> web_site containment edges for
--    the folded rows (the party -> web_site edge from step 3 replaces them).
DELETE FROM platform.associations a
 USING plan.entity e
WHERE a.source_type = 'plan_entity' AND a.source_id = e.id
  AND a.target_type = 'web_site'
  AND e.entity_type IN ('person','org') AND e.deleted_at IS NULL;

-- 6. Soft-delete the folded plan.entity rows, stamping where they went.
UPDATE plan.entity e
   SET deleted_at = now(),
       metadata = e.metadata || jsonb_build_object('folded_to_party', p.id)
  FROM crm.party p
 WHERE p.source_detail = 'plan_entity_person_org_fold'
   AND p.organization_id = e.organization_id
   AND lower(p.display_name) = lower(e.label)
   AND p.deleted_at IS NULL
   AND e.entity_type IN ('person','org')
   AND e.deleted_at IS NULL;

-- 7. THE CUT — plan.entity no longer accepts live person/org rows. Loud guard
--    (a narrowed CHECK would break historical soft-deleted rows). Un-deleting
--    a folded row is blocked too, on purpose.
CREATE OR REPLACE FUNCTION plan._entity_kind_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog'
AS $$
BEGIN
  IF NEW.entity_type IN ('person','org') AND NEW.deleted_at IS NULL THEN
    RAISE EXCEPTION
      'plan.entity no longer holds people or organizations — they folded into crm.party (2026-08-12). Create a crm.party row and link it with a party->web_site ''writes_for'' association edge instead.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS _entity_kind_guard ON plan.entity;
CREATE TRIGGER _entity_kind_guard BEFORE INSERT OR UPDATE ON plan.entity
  FOR EACH ROW EXECUTE FUNCTION plan._entity_kind_guard();

-- 8. Keep the registry truthful: the plan_node->plan_entity pair now carries
--    source-shaped roles only; people roles live on plan_node->party.
UPDATE platform.association_types
   SET notes = 'Roles: about, cites, embeds. Source/media citations only — person/org entities folded into crm.party (plan_node->party carries authored_by/reviewed_by/about/cites).',
       updated_at = now()
 WHERE source_type = 'plan_node' AND target_type = 'plan_entity';

UPDATE platform.entity_types
   SET notes = COALESCE(notes,'') ||
       CASE WHEN COALESCE(notes,'') LIKE '%folded into crm.party%' THEN ''
            ELSE ' 2026-08-12: person/org rows folded into crm.party; table holds source/media citations only (guard: plan._entity_kind_guard).' END
 WHERE token = 'plan_entity';
