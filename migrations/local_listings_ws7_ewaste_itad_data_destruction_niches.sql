-- WS7 intake: E-WASTE / ELECTRONICS RECYCLING / ITAD / DATA DESTRUCTION niche.
-- Requested by Arman for two of his companies: All Green Electronics Recycling
-- (e-waste recycling, IT asset disposition, data destruction) and Data Destruction Inc
-- (hard-drive destruction, on-site hard-drive shredding). This niche runs almost entirely
-- on third-party CERTIFICATION-BODY directories (R2/SERI, e-Stewards/BAN, NAID AAA & PRISM
-- Privacy+/i-SIGMA) rather than open consumer directories — the "listing" IS the certification
-- for the top-tier ones. No pre-existing rows in this niche; verified against live table by
-- slug and domain before insert. Upsert-by-slug per common-docs/systems/local-listings/PLAN.md WS7.
insert into web.listing_publisher
  (slug, name, domain, tier, is_aggregator, api_access, api_notes, manage_url, categories, citation_weight, sort_rank, organization_id, visibility)
values
  -- ===== The "big three" certification-body directories (highest citation value) =====
  ('seri-r2-certified', 'SERI — R2 Certified Facility Finder', 'sustainableelectronics.org', 'vertical', false, 'approval',
   'The dominant US electronics-recycling standard (R2v3). SERI aggregates R2 certificates from all Authorized Certification Bodies into one daily-updated directory searchable/filterable by state, materials accepted, and consumer drop-off. There is no separate "listing" step — a facility appears automatically once it holds an active R2 certificate (obtained via an accredited certification body audit). No public API.',
   'https://sustainableelectronics.org/find-an-r2-certified-facility/', '{e-waste,itad,electronics-recycling}', 75, 479, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('e-stewards-ban', 'e-Stewards Certified Recyclers (Basel Action Network)', 'e-stewards.org', 'vertical', false, 'approval',
   'The strictest global e-waste standard — prohibits hazardous-waste export to developing countries and prison labor, requires documented data destruction + downstream accountability. Created/managed by Basel Action Network. Listing requires passing an e-Stewards certification audit; the public "Find a Recycler" locator (also mirrored at ban.org/find-recyclers) is populated from certified facilities only. No public API.',
   'https://e-stewards.org/find-a-recycler/', '{e-waste,itad,electronics-recycling}', 70, 480, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('isigma-naid-prism', 'i-SIGMA — NAID AAA / PRISM Privacy+ Service Provider Locator', 'isigmaonline.org', 'vertical', false, 'approval',
   'The data-destruction industry''s gold-standard certification body (formerly NAID, merged with PRISM International). NAID AAA Certification covers secure destruction of media/hard drives/paper (scheduled + surprise audits); PRISM Privacy+ covers records/information management. The Service Provider Locator lists i-SIGMA members, NAID AAA Certified, and PRISM Privacy+ Certified providers by location. Directly relevant to hard-drive/on-site shredding businesses. No public API — apply via the certification application, then appear in the locator.',
   'https://isigmaonline.org/service-locator/', '{data-destruction,itad}', 75, 481, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  -- ===== Aggregators of the certification directories =====
  ('itad-finder', 'ITAD Finder', 'itadfinder.com', 'vertical', false, 'closed',
   'Third-party directory aggregating 1,100+ R2 and e-Stewards certified ITAD/electronics-recycling facilities nationwide, searchable by state/city/certification type. Populated automatically from the official R2 and e-Stewards certificate registries — no direct self-serve submission form was found; a facility appears once it holds either certification. Verify current submission process directly with the site.',
   'https://www.itadfinder.com/directory/', '{itad,e-waste,electronics-recycling}', 45, 482, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('itad-certify', 'ITAD Certify', 'itadcertify.com', 'vertical', false, 'approval',
   'Directory connecting clients to certified ITAD providers. Self-serve "Join" flow: register company, build a searchable listing, upload logo/photo. Free tier requires accreditation by ADISA, e-Stewards, R2, RIOS, or NAID (also free for ASCDI members); includes free lead-gen and PR support. No public API.',
   'https://www.itadcertify.com/join', '{itad,data-destruction,e-waste}', 40, 483, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('ascdi-itad', 'ASCDI/NATD Certified ITADs', 'ascdi.com', 'vertical', false, 'approval',
   'Association of Service and Computer Dealers International / North American Association of Telecom Dealers — maintains a certified-ITAD member roster (feeds ITAD Certify''s free tier). Listing requires ASCDI/NATD membership. No public API.',
   'https://www.ascdi.com/itad/', '{itad,e-waste}', 28, 490, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  -- ===== Government / regulatory =====
  ('epa-certified-electronics-recyclers', 'EPA Certified Electronics Recyclers', 'epa.gov', 'high_value', false, 'none',
   'US EPA''s official reference page on electronics-recycler certification (Sustainable Materials Management program). Points to the R2 and e-Stewards registries rather than hosting its own submission form — inclusion is derived from holding either certification, not a direct EPA signup. High trust/authority value for citation purposes. No public API.',
   'https://www.epa.gov/electronics-batteries-management/certified-electronics-recyclers', '{e-waste,itad,electronics-recycling}', 55, 475, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('calrecycle-cew-directory', 'CalRecycle — Covered Electronic Waste (CEW) Approved Collectors/Recyclers Directory', 'calrecycle.ca.gov', 'vertical', false, 'approval',
   'California-specific state regulatory directory (Directory of Approved Collectors and Recyclers of Covered Electronic Waste) — required registration to participate in CA''s CEW recycling-payment program and be listed as an approved collector/recycler. Model example of a state e-waste stewardship program; most other states run analogous programs (worth a follow-up sweep once operating states for these two companies are confirmed). Application via CalRecycle forms 186C/186R/186D, not a public API.',
   'https://www2.calrecycle.ca.gov/Electronics/cew/participantsDirectory', '{e-waste,electronics-recycling}', 40, 484, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  -- ===== Trade associations =====
  ('isri', 'ISRI — Institute of Scrap Recycling Industries Member Directory', 'isri.org', 'vertical', false, 'approval',
   'National scrap-recycling trade association (metals, electronics, paper, plastics, etc.) with a real-time searchable membership directory plus an annual print/app "Membership Directory and Industry Guide." Listing requires ISRI membership. No public API.',
   'https://www.isri.org/', '{recycling,scrap-recycling,e-waste}', 45, 485, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('iaitam-directory', 'IAITAM Industry Directory', 'iaitam.org', 'vertical', false, 'approval',
   'International Association of IT Asset Managers — Industry Directory featuring Provider Members offering ITAM/ITAD services (procurement through disposition/resale). Listing requires IAITAM Provider Membership. No public API.',
   'https://iaitam.org/directory/', '{itad,it-asset-management}', 35, 486, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  -- ===== High-traffic consumer recycling locators =====
  ('earth911', 'Earth911 Recycling Locator', 'earth911.com', 'high_value', false, 'none',
   'Largest US recycling-location database (100,000+ listings, 350+ materials, 650K+ monthly visitors), covers electronics/e-waste. Free self-serve business signup via the Earth911 Manager listing platform (create account, add locations, submit for review). Also powers the iRecycle mobile app. No public API.',
   'https://listing.earth911.com/', '{recycling,e-waste}', 55, 476, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('recyclenation', 'RecycleNation', 'recyclenation.com', 'vertical', false, 'none',
   'Recycling search engine/database (100,000+ data points across 50+ materials incl. electronics), powered by ERI (a national ITAD/electronics-recycling provider). Self-serve listing mechanism not clearly documented publicly — contact via site. No public API.',
   'https://recyclenation.com/', '{recycling,e-waste}', 35, 487, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('1800recycling', '1-800-RECYCLING.com', '1800recycling.com', 'vertical', false, 'none',
   'Consumer recycling-location search covering ~140,000 US/Canada locations, with a companion mobile app. Listing/inclusion mechanism not clearly self-serve-documented — contact via site. No public API.',
   'https://1800recycling.com/', '{recycling,e-waste}', 28, 488, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('irecycle-app', 'iRecycle App (Earth911)', 'irecycleapp.com', 'vertical', false, 'none',
   'Mobile-app surface for Earth911''s recycling-locator database (1.6M+ ways to recycle, 350+ materials) — separate app/domain, same underlying dataset as the Earth911 listing above. No independent signup; inclusion flows from the Earth911 Manager listing. No public API.',
   'https://www.irecycleapp.com/', '{recycling,e-waste}', 20, 491, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('recyclers-world', 'Recycler''s World', 'recycle.net', 'long_tail', false, 'none',
   'Long-running B2B recycling trade directory/marketplace (Traders and Recyclers Directory) with a Computer & Electronics category. Free self-serve "Add a Listing" form. No public API.',
   'https://recycle.net/addlisting.html', '{recycling,scrap-recycling,e-waste}', 22, 506, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('scrapmonster', 'ScrapMonster', 'scrapmonster.com', 'vertical', false, 'none',
   'North America''s largest scrap-trading platform (110K+ members, 160K+ company profiles) with dedicated Electronic Waste Recycling and IT Recycling company directories. Free self-serve registration creates a business profile/listing; paid "Gold" tier adds ranked exposure. No public API.',
   'https://www.scrapmonster.com/register', '{recycling,scrap-recycling,e-waste}', 30, 489, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  -- ===== Battery/electronics take-back network =====
  ('battery-network-call2recycle', 'Call2Recycle / The Battery Network — Collection Partner', 'batterynetwork.org', 'vertical', false, 'approval',
   'Nonprofit battery + cellphone stewardship program (30,000+ US/Canada drop-off locations, partners incl. Home Depot/Staples/Lowe''s). Becoming a collection-partner drop-off site requires an application/agreement, not open self-serve signup. No public API.',
   'https://batterynetwork.org/collection-partners/', '{recycling,battery-recycling,e-waste}', 40, 492, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  -- ===== On-site/mobile shredding lead network (direct fit for Data Destruction Inc) =====
  ('shred-nations-partners', 'Shred Nations Partner Network', 'shrednations.com', 'vertical', false, 'partnership',
   'The main marketplace connecting shredding customers (paper AND on-site/mobile hard-drive destruction requests) to local shredding/data-destruction providers nationwide. Becoming a network partner is relationship-led — contact retailpartners@shrednations.com or apply via the partner portal; not a self-serve public form. No public API. Directly relevant lead-gen channel for on-site hard-drive shredding.',
   'https://partners.shrednations.com/', '{data-destruction,shredding}', 42, 493, '39c38960-d30c-4840-b0c1-c9960de95582', 'public')
;
