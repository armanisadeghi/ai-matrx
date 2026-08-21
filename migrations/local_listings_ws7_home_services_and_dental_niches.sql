-- WS7 intake: HOME SERVICES sub-verticals (HVAC/plumbing/roofing/electrical/landscaping/moving/cleaning-adjacent)
-- + DENTAL-specific directories. Upsert-by-slug per common-docs/systems/marketing/local-listings/PLAN.md WS7 contract.
insert into web.listing_publisher
  (slug, name, domain, tier, is_aggregator, api_access, api_notes, manage_url, categories, citation_weight, sort_rank, organization_id, visibility)
values
  -- ===== HOME SERVICES sub-verticals =====
  ('homestars', 'HomeStars', 'homestars.com', 'vertical', false, 'none',
   'Form-based: contractors create a free profile then subscribe (paid) to unlock leads/response tools. No public API. Claim/create at signup URL below.',
   'https://homestars.com/companies/new', '{home-services}', 45, 421, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('guildquality', 'GuildQuality', 'guildquality.com', 'vertical', false, 'none',
   'B2B customer-satisfaction survey platform for builders/remodelers whose public profiles double as a review directory. Onboarding is sales-led (contact GuildQuality), not self-serve signup.',
   'https://www.guildquality.com/confirm', '{home-services,construction}', 38, 422, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('acca-qa-directory', 'ACCA QA Contractor Directory', 'acca.org', 'vertical', false, 'approval',
   'Trade-association member directory (Air Conditioning Contractors of America). Listing requires ACCA membership + QA Accreditation approval; no open API.',
   'https://www.acca.org/qa-directory', '{home-services,hvac}', 50, 423, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('nrca-find-a-contractor', 'NRCA Find A Contractor', 'nrca.net', 'vertical', false, 'approval',
   'National Roofing Contractors Association member directory. Listing requires NRCA membership approval; no public API.',
   'https://www.nrca.net/FindAContractor/International', '{home-services,roofing}', 45, 424, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('gaf-roofing-contractors', 'GAF Roofing Contractors', 'gaf.com', 'vertical', false, 'approval',
   'Manufacturer-certified contractor directory (GAF Master Elite/Certified Plus). Listing requires GAF certification application, not open signup; no public API.',
   'https://www.gaf.com/en-us/roofing-contractors', '{home-services,roofing}', 55, 425, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('nalp-landscape-directory', 'NALP Landscape Contractor Directory', 'landscapeprofessionals.org', 'vertical', false, 'approval',
   'National Association of Landscape Professionals member directory. Listing requires NALP membership; no public API.',
   'https://landscapeprofessionals.org/LP/About/Find_a_Member.aspx', '{home-services,landscaping}', 40, 426, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('nari-find-a-remodeler', 'NARI Find-A-Remodeler', 'nari.org', 'vertical', false, 'approval',
   'National Association of the Remodeling Industry member directory. Listing requires NARI membership + board approval; no public API.',
   'https://nari.org/find-a-remodeler-search/', '{home-services,remodeling}', 42, 427, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('phcc', 'PHCC — Plumbing-Heating-Cooling Contractors Association', 'phccweb.org', 'vertical', false, 'approval',
   'National plumbing/HVACR trade association; ~125 state/local chapter directories feed from national membership. Listing requires PHCC membership via a local chapter; no public API.',
   'https://www.phccweb.org/', '{home-services,plumbing,hvac}', 45, 428, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('promover-ata-moving', 'ATA Moving & Storage — ProMover Directory', 'moving.org', 'vertical', false, 'approval',
   'American Trucking Associations Moving & Storage Conference (successor to AMSA); ProMover certification directory for interstate movers. Requires background check + FMCSA licensing + ethics agreement; no public API.',
   'https://www.moving.org/prepare-choose-mover', '{home-services,moving}', 50, 429, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('homeguide', 'HomeGuide', 'homeguide.com', 'vertical', false, 'none',
   'Free self-serve pro profile, pay-per-lead model, no membership fee. Form-based signup, no public API.',
   'https://homeguide.com/pro', '{home-services}', 38, 430, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('improvenet', 'ImproveNet', 'improvenet.com', 'vertical', false, 'none',
   'Free lead-gen contractor directory (owned by Alliance Media/Angi network). Self-serve signup form, no public API.',
   'https://www.improvenet.com/GetStarted', '{home-services}', 32, 431, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('modernize', 'Modernize Contractor Directory', 'modernize.com', 'vertical', false, 'none',
   'Free contractor directory across 14 home-improvement trades. Self-serve signup form, no public API.',
   'https://modernize.com', '{home-services}', 35, 432, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('best-pick-reports', 'Best Pick Reports', 'bestpickreports.com', 'vertical', false, 'approval',
   'Certification-gated home-services directory (HVAC, plumbing, electrical, roofing, landscaping, pest). Companies qualify via verified reviews + license/insurance checks, not paid placement; no public API.',
   'https://www.bestpickreports.com/content/about-us', '{home-services}', 42, 433, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('trane-dealer-locator', 'Trane Dealer Locator', 'trane.com', 'vertical', false, 'approval',
   'Manufacturer authorized-dealer directory (HVAC). Listing requires becoming a Trane dealer/Comfort Specialist; no public API.',
   'https://www.trane.com/residential/en/for-dealers/', '{home-services,hvac}', 32, 434, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('neca-find-a-contractor', 'NECA Find A Contractor', 'necanet.org', 'vertical', false, 'approval',
   'National Electrical Contractors Association member directory. Listing requires NECA chapter membership; no public API.',
   'https://www.necanet.org/about-neca/directories/find-a-contractor', '{home-services,electrical}', 42, 435, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  -- ===== DENTAL directories =====
  ('ada-find-a-dentist', 'ADA Find-A-Dentist', 'ada.org', 'vertical', false, 'approval',
   'American Dental Association consumer locator (findadentist.ada.org) drawing on 100k+ ADA member dentists. Listing is automatic upon ADA membership; no self-serve signup, no public API.',
   'https://www.ada.org/join-the-ada/member-benefits/find-a-dentist', '{healthcare,dental}', 60, 436, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('mouthhealthy', 'MouthHealthy Find-A-Dentist', 'mouthhealthy.org', 'vertical', false, 'approval',
   'ADA consumer oral-health site with its own Find-a-Dentist search (separate domain/surface from findadentist.ada.org). Same ADA-membership gate; no public API.',
   'https://www.mouthhealthy.org/', '{healthcare,dental}', 42, 437, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('dentistgrid', 'DentistGrid', 'dentistgrid.com', 'vertical', false, 'none',
   'NPI-registry-anchored dentist directory; every practice has a stub pulled from NPPES. Self-serve "Claim Your Practice Listing" form, no public API.',
   'https://www.dentistgrid.com/dentist-directory', '{healthcare,dental}', 35, 438, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('family-dental-directory', 'Family Dental Directory', 'familydentaldirectory.com', 'vertical', false, 'none',
   'Free self-serve dental practice profile signup, with paid featured-placement upsell. No public API.',
   'https://www.familydentaldirectory.com/', '{healthcare,dental}', 28, 439, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('americas-leading-dentists', 'America''s Leading Dentists', 'americasleadingdentists.com', 'vertical', false, 'none',
   'Self-serve "Claim Your Listing" / "Add Your Listing In 90 Seconds" dental directory. No public API.',
   'https://www.americasleadingdentists.com/', '{healthcare,dental}', 26, 440, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('dentistdirectory-com', 'DentistDirectory.com', 'dentistdirectory.com', 'vertical', false, 'none',
   'Dentist directory connecting patients directly to practices for booking. Form-based practice listing, no public API.',
   'http://www.dentistdirectory.com/', '{healthcare,dental}', 26, 441, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('usatopdentists', 'topDentists (USA Top Dentists)', 'usatopdentists.com', 'vertical', false, 'approval',
   'Peer-nomination/survey-based directory (dentists vote for dentists); inclusion is earned via the survey process, not self-serve signup. No public API.',
   'https://www.usatopdentists.com/', '{healthcare,dental}', 32, 442, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('invisalign-find-a-doctor', 'Invisalign Find a Doctor', 'invisalign.com', 'vertical', false, 'approval',
   'Align Technology''s certified-provider locator for dentists/orthodontists offering Invisalign. Listing requires becoming an Invisalign provider (training/certification with Align), not open signup; no public API.',
   'https://www.invisalign.com/find-a-doctor', '{healthcare,dental,orthodontics}', 52, 443, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('1800dentist', '1-800-DENTIST / Dentistry.com', '1800dentist.com', 'vertical', false, 'none',
   'Paid dental patient-referral network (Futuredontics); PatientLeads program includes a Dentistry.com directory listing, or a standalone directory listing for ~$300/yr. Form-based signup via Dentistry.com, no public API.',
   'https://dentistry.com/for-dentists/', '{healthcare,dental}', 40, 444, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('dentistrydirectories', 'Dentistry Directories', 'dentistrydirectories.com', 'vertical', false, 'none',
   'Large US/Canada dental directory (100k+ verified dentists). Form-based claim/add-listing, no public API.',
   'https://dentistrydirectories.com/', '{healthcare,dental}', 30, 445, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('dentistlink', 'DentistLink', 'dentistlink.org', 'vertical', false, 'approval',
   'Nonprofit-oriented dentist-finder network used by community health/referral organizations to route patients to participating practices. Requires becoming a partner practice, not open self-serve; no public API.',
   'https://partners.dentistlink.org/dentist-finder', '{healthcare,dental}', 26, 446, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('aapd-find-a-pediatric-dentist', 'AAPD Find a Pediatric Dentist', 'aapd.org', 'vertical', false, 'approval',
   'American Academy of Pediatric Dentistry member directory (specialty: pediatric dentistry). Listing requires AAPD membership; no public API.',
   'https://www.aapd.org/publications/find-a-pd/', '{healthcare,dental,pediatric-dentistry}', 40, 447, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('aao-find-an-orthodontist', 'AAO Find an Orthodontist', 'aaoinfo.org', 'vertical', false, 'approval',
   'American Association of Orthodontists member locator (specialty: orthodontics), 19,000+ members. Listing requires AAO membership (accredited orthodontic residency); no public API.',
   'https://aaoinfo.org/locator/', '{healthcare,dental,orthodontics}', 45, 448, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('agd-find-a-dentist', 'AGD Find an AGD Dentist', 'agd.org', 'vertical', false, 'approval',
   'Academy of General Dentistry member directory (general dentistry, incl. FAGD/MAGD fellows). Listing requires AGD membership; no public API.',
   'https://www.agd.org/practice/tools/patient-resources/find-an-agd-dentist', '{healthcare,dental}', 35, 449, '39c38960-d30c-4840-b0c1-c9960de95582', 'public')

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
  updated_at = now();
