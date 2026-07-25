-- Plan<->reality seam registered NOW + missing brands/sites + vertical profile seeds.
-- APPLIED LIVE 2026-07-24 via Supabase MCP (migration: plan_reconciliation_seam_and_vertical_seeds).
--
-- 1. plan_node -> web_page (container none). Roles: realizes (live page IS this
--    planned URL), migrates_from (legacy page folding into this node — the
--    existing-site migration map). The ONLY plan<->crawl connection.
INSERT INTO platform.association_types (source_type, target_type, label, container_side, conveys_max, is_active, notes) VALUES
('plan_node', 'web_page', NULL, 'none', 'viewer', true,
 'Plan-vs-reality seam. Roles: realizes (live page IS this planned URL), migrates_from (legacy page folding into this node — the existing-site migration map). Written by the reconciler; the ONLY plan<->crawl connection.');

INSERT INTO platform.categories (organization_id, dimension, name, slug, is_system, position)
SELECT '39c38960-d30c-4840-b0c1-c9960de95582', 'association_role', v.name, v.name, true, v.pos
FROM (VALUES ('realizes', 90), ('migrates_from', 100)) AS v(name, pos)
WHERE NOT EXISTS (
  SELECT 1 FROM platform.categories c
  WHERE c.dimension='association_role' AND c.slug=v.name AND c.deleted_at IS NULL);

SELECT platform.sync_association_gc_triggers('web_page');

-- 2. Missing brands + sites for the launch list (replicates web.create_site
--    effects — brand -> site -> website property — because that RPC requires
--    auth.uid()). Org: Titanium; actor: arman@armansadeghi.com.
DO $$
DECLARE
  v_org uuid := 'f9cb3e35-2a65-4f2a-8525-088d6551071c';
  v_actor uuid := '4cf62e4e-2679-484f-b652-034e697418df';
  v_brand uuid; v_site uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM web.site WHERE domain='prpinjectionmd.com' AND deleted_at IS NULL) THEN
    INSERT INTO web.brand (organization_id, created_by, name, website_url, industry, status, visibility)
    VALUES (v_org, v_actor, 'PRP Injection MD', 'https://prpinjectionmd.com', 'Medical', 'active', 'internal')
    RETURNING id INTO v_brand;
    INSERT INTO web.site (organization_id, created_by, brand_id, name, root_url, domain, status, visibility)
    VALUES (v_org, v_actor, v_brand, 'PRP Injection MD', 'https://prpinjectionmd.com', 'prpinjectionmd.com', 'active', 'internal')
    RETURNING id INTO v_site;
    INSERT INTO web.property (organization_id, created_by, brand_id, kind, url, display_name, site_id)
    VALUES (v_org, v_actor, v_brand, 'website', 'https://prpinjectionmd.com', 'PRP Injection MD', v_site);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM web.site WHERE domain='titaniummarketing.com' AND deleted_at IS NULL) THEN
    INSERT INTO web.brand (organization_id, created_by, name, website_url, industry, status, visibility)
    VALUES (v_org, v_actor, 'Titanium Marketing', 'https://titaniummarketing.com', 'Digital Marketing', 'active', 'internal')
    RETURNING id INTO v_brand;
    INSERT INTO web.site (organization_id, created_by, brand_id, name, root_url, domain, status, visibility)
    VALUES (v_org, v_actor, v_brand, 'Titanium Marketing', 'https://titaniummarketing.com', 'titaniummarketing.com', 'active', 'internal')
    RETURNING id INTO v_site;
    INSERT INTO web.property (organization_id, created_by, brand_id, kind, url, display_name, site_id)
    VALUES (v_org, v_actor, v_brand, 'website', 'https://titaniummarketing.com', 'Titanium Marketing', v_site);
  END IF;
END $$;

-- 3. Vertical profiles (config, not content). Org = the org owning the first
--    site each vertical plans. attribute_schemas/template_map filled by the
--    first real plan build. NOTE: ai-platform seeded under admin's Workspace
--    because the live aimatrx.com site sits there (flagged for org move).
INSERT INTO plan.profile (organization_id, created_by, vertical, attribute_schemas, template_map, schema_org_map, cadences)
VALUES
('5dc930e9-bd65-44a1-8369-af773f6e1a5b', '4cf62e4e-2679-484f-b652-034e697418df', 'it-asset-disposition',
 '{}'::jsonb, '{}'::jsonb,
 '{"homepage":"Organization","service-page":"Service","location-page":"LocalBusiness","article":"Article","guide":"Article","faq":"FAQPage","comparison":"Article"}'::jsonb,
 '{"article":{"review_days":180},"service-page":{"review_days":365},"location-page":{"review_days":365}}'::jsonb),
('f9cb3e35-2a65-4f2a-8525-088d6551071c', '4cf62e4e-2679-484f-b652-034e697418df', 'data-destruction',
 '{}'::jsonb, '{}'::jsonb,
 '{"homepage":"Organization","service-page":"Service","location-page":"LocalBusiness","article":"Article","guide":"Article","faq":"FAQPage","comparison":"Article"}'::jsonb,
 '{"article":{"review_days":180},"service-page":{"review_days":365}}'::jsonb),
('f9cb3e35-2a65-4f2a-8525-088d6551071c', '4cf62e4e-2679-484f-b652-034e697418df', 'medical',
 '{"node":{"type":"object","properties":{"reviewed_required":{"type":"boolean","default":true},"conditions":{"type":"array","items":{"type":"string"}},"procedures":{"type":"array","items":{"type":"string"}}}}}'::jsonb,
 '{}'::jsonb,
 '{"homepage":"MedicalOrganization","service-page":"MedicalProcedure","article":"MedicalWebPage","guide":"MedicalWebPage","faq":"FAQPage","comparison":"MedicalWebPage"}'::jsonb,
 '{"article":{"review_days":90},"service-page":{"review_days":180}}'::jsonb),
('884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f', '4cf62e4e-2679-484f-b652-034e697418df', 'ai-platform',
 '{}'::jsonb, '{}'::jsonb,
 '{"homepage":"Organization","service-page":"SoftwareApplication","article":"TechArticle","guide":"TechArticle","faq":"FAQPage","comparison":"TechArticle"}'::jsonb,
 '{"article":{"review_days":120},"guide":{"review_days":120}}'::jsonb),
('f9cb3e35-2a65-4f2a-8525-088d6551071c', '4cf62e4e-2679-484f-b652-034e697418df', 'digital-marketing',
 '{}'::jsonb, '{}'::jsonb,
 '{"homepage":"Organization","service-page":"Service","article":"Article","guide":"Article","faq":"FAQPage","comparison":"Article"}'::jsonb,
 '{"article":{"review_days":180},"service-page":{"review_days":365}}'::jsonb);
