-- No-code/AI-automation integration marketplaces (addendum to web_listing_publisher_ai_ml_automation_niche.sql).
-- These are the "AI automation systems" surfaces flagged during that research but not yet
-- inserted: a business becomes a listed integration/app inside the automation platform's own
-- directory, which is a distinct submission recipe (developer platform + review), not a claim form.
-- APPLIED LIVE via Supabase (linked project txzxabzwovsujtloxrus). Idempotent upsert by slug; system org.
insert into web.listing_publisher (organization_id, slug, name, domain, tier, is_aggregator, api_access, api_notes, manage_url, categories, citation_weight, sort_rank, visibility)
select '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, v.* from (values
  ('zapier-developer-platform','Zapier Developer Platform','zapier.com','high_value',false,'open','9,000+ app directory. Free self-serve integration build via Platform UI or CLI; public listing goes through Zapier''s review before appearing in the directory.','https://zapier.com/developer-platform','{ai,automation}'::text[],45,880,'public'::platform.visibility),
  ('make-apps-marketplace','Make Apps Marketplace','make.com','vertical',false,'approval','Publishing a custom app to the Marketplace (vs. private use) requires an active Make Partnership Agreement; 4-6 week review process.','https://f.make.com/submit-your-app','{ai,automation}',35,882,'public'),
  ('n8n-community-nodes','n8n Community Nodes','n8n.io','vertical',false,'open','Community nodes are self-serve npm packages (name must start with n8n-nodes-); n8n''s Creator Portal offers optional verification for panel discoverability.','https://docs.n8n.io/integrations/creating-nodes/deploy/submit-community-nodes/','{ai,automation}',30,884,'public')
) as v(slug, name, domain, tier, is_aggregator, api_access, api_notes, manage_url, categories, citation_weight, sort_rank, visibility)
on conflict (slug) do update set
  name = excluded.name,
  domain = excluded.domain,
  tier = excluded.tier,
  is_aggregator = excluded.is_aggregator,
  api_access = excluded.api_access,
  api_notes = excluded.api_notes,
  manage_url = excluded.manage_url,
  categories = excluded.categories,
  citation_weight = excluded.citation_weight,
  sort_rank = excluded.sort_rank,
  visibility = excluded.visibility,
  updated_at = now();
