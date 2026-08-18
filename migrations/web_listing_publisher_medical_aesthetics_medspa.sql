-- Medical aesthetics / med spa niche (common-docs/systems/local-listings/PLAN.md WS7).
-- The beauty<->health border: board-certification directories (plastic surgery,
-- dermatology, bariatric/obesity medicine), manufacturer loyalty/provider-locator
-- programs (Botox/Juvederm/CoolSculpting, Dysport/Restylane, Xeomin/Radiesse, SculpSure),
-- BHRT networks, and general aesthetics/spa marketplaces.
-- Deduped against the live registry: realself ({healthcare,aesthetics}) and
-- amspa-directory ({healthcare,med-spa}) already present; not re-inserted.
-- APPLIED LIVE via Supabase (linked project txzxabzwovsujtloxrus). Idempotent upsert by slug; system org.
insert into web.listing_publisher (organization_id, slug, name, domain, tier, is_aggregator, api_access, api_notes, manage_url, categories, citation_weight, sort_rank, visibility)
select '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, v.* from (values
  -- Board-certification / specialty-society directories
  ('asps-find-a-plastic-surgeon','ASPS Find a Plastic Surgeon','plasticsurgery.org','high_value',false,'none','American Society of Plastic Surgeons directory (92% of US board-certified plastic surgeons); membership requires board certification + documentation, no API.','https://www.plasticsurgery.org/for-medical-professionals/join-asps','{healthcare,med-spa,aesthetics}'::text[],60,700,'public'::platform.visibility),
  ('aesthetic-society-find-a-surgeon','The Aesthetic Society Find a Surgeon','theaestheticsociety.org','vertical',false,'none','5,000+ member cosmetic-surgery specialty society (formerly ASAPS); board-certification-gated membership directory.','https://theaestheticsociety.smapply.org/prog/active_membership/','{healthcare,med-spa,aesthetics}',55,702,'public'),
  ('aad-find-a-dermatologist','AAD Find a Dermatologist','aad.org','high_value',false,'none','American Academy of Dermatology directory; board-certification-gated membership, no public API.','https://www.aad.org/member/membership','{healthcare,med-spa,aesthetics,dermatology}',60,704,'public'),
  ('asds-find-a-dermatologic-surgeon','ASDS Find a Dermatologic Surgeon','asds.net','vertical',false,'none','American Society for Dermatologic Surgery directory; specialty-board-gated membership.',null,'{healthcare,med-spa,aesthetics,dermatology}',45,706,'public'),

  -- Manufacturer loyalty / provider-locator programs (injectables, body contouring)
  ('alle-allergan-aesthetics','Allē by Allergan Aesthetics','allerganaesthetics.com','vertical',false,'approval','AbbVie/Allergan patient loyalty + provider locator covering Botox Cosmetic, Juvederm, SkinVive, CoolSculpting (8M+ members). Practices apply for a commercial account via the "One Team" (1-844-NEW-2AGN), not self-serve signup.','https://www.allerganaesthetics.com/providers/placing-an-order','{healthcare,med-spa,aesthetics}',55,708,'public'),
  ('coolsculpting-locator','CoolSculpting Provider Locator','coolsculpting.com','vertical',false,'approval','Allergan Aesthetics (AbbVie) body-contouring device locator; same commercial-account onboarding as Allē.',null,'{healthcare,med-spa,aesthetics}',45,710,'public'),
  ('aspire-galderma-rewards','ASPIRE Galderma Rewards','aspirerewards.com','vertical',false,'approval','Galderma patient loyalty + provider locator covering Dysport, Restylane family, Sculptra, Alastin. Practice enrollment via Galderma sales rep, not self-serve.','https://www.aspirerewards.com/find-specialist','{healthcare,med-spa,aesthetics}',50,712,'public'),
  ('merz-xperience-rewards','Xperience+ by Merz Aesthetics','xperiencemerz.com','vertical',false,'approval','Merz patient loyalty + provider locator covering Xeomin, Radiesse. Practice enrollment via Merz rep, not self-serve.','https://www.xeominaesthetic.com/professionals/xperience-program','{healthcare,med-spa,aesthetics}',45,714,'public'),
  ('cynosure-sculpsure-locator','Cynosure SculpSure Provider Locator','cynosure.com','vertical',false,'approval','Device-manufacturer locator for SculpSure laser body contouring; requires becoming an authorized Cynosure provider (equipment purchase/lease).',null,'{healthcare,med-spa,aesthetics}',30,716,'public'),

  -- Hormone therapy / weight loss / bariatric
  ('bodylogicmd','BodyLogicMD','bodylogicmd.com','vertical',false,'approval','Nationwide BHRT (bioidentical hormone) network; providers must complete 200+ hrs A4M training to join.','https://www.bodylogicmd.com/providers/','{healthcare,med-spa,aesthetics}',30,718,'public'),
  ('asmbs-find-a-surgeon','ASMBS Find a Surgeon','asmbs.org','vertical',false,'none','American Society for Metabolic and Bariatric Surgery directory (3,400+ members); membership-gated.','https://asmbs.org/for-patients/find-a-surgeon/','{healthcare,med-spa}',40,720,'public'),
  ('obesity-care-providers','ObesityCareProviders.com','obesitycareproviders.com','aggregator',true,'none','Obesity Action Coalition locator aggregating credentialed providers across ASMBS, The Obesity Society, Obesity Medicine Association, and ABOM-certified physicians into one search.','https://www.obesityaction.org/education-support/treatment/find-a-provider/','{healthcare,med-spa}',35,150,'public'),

  -- General med spa / beauty-industry marketplaces
  ('aesthetic-everything','Aesthetic Everything','aestheticeverything.com','vertical',false,'none','Long-running med spa/aesthetic-industry directory + awards site (since 2009); form-based/paid featured listings.','https://aestheticeverything.com','{healthcare,med-spa,aesthetics}',30,722,'public'),
  ('vagaro-marketplace','Vagaro Marketplace','vagaro.com','high_value',false,'none','Beauty/spa/wellness booking marketplace (10M+ users, 20M+ searchers); free self-serve business profile tied to Vagaro Pro software, no listing-only API.','https://www.vagaro.com/pro','{healthcare,med-spa,aesthetics}',35,724,'public')
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
