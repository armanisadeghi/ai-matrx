-- WS7 intake: LEGAL niche directories — general attorney directories, practice-area-specific
-- (personal injury/criminal defense, family law, immigration, estate/elder, bankruptcy, disability,
-- workers' comp, IP), bar-association/trade-association directories that allow member profiles,
-- and legal review/ranking sites. Beyond existing legal rows (avvo, findlaw, justia, lawyers-com,
-- superlawyers, martindale, nolo). Upsert-by-slug per common-docs/systems/marketing/local-listings/PLAN.md WS7.
insert into web.listing_publisher
  (slug, name, domain, tier, is_aggregator, api_access, api_notes, manage_url, categories, citation_weight, sort_rank, organization_id, visibility)
values
  -- ===== General attorney directories =====
  ('lawinfo', 'LawInfo', 'lawinfo.com', 'vertical', false, 'approval',
   'General attorney directory since 1996. Listing requires the Lead Counsel Application (credential/ethics review); approved listings go live on a paid annual contract. No public API.',
   'https://www.lawinfo.com/contact.html', '{legal}', 55, 450, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('hg-org', 'HG.org (HG Legal Resources)', 'hg.org', 'vertical', false, 'none',
   'International lawyer directory since 1995, 160+ countries, ~1.2M monthly visitors. Free Basic Listing via form (approval within 30 days); Premium Listing paid ($195+/yr) adds bio/logo/links. No public API.',
   'https://www.hg.org/list-your-law-firm', '{legal}', 45, 451, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('lawyer-com', 'Lawyer.com', 'lawyer.com', 'vertical', false, 'none',
   'General attorney directory; listing requires either a paid Premium Lawyer Profile signup or being partner-fed. No public API.',
   'https://services.lawyer.com/', '{legal}', 40, 452, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('legalmatch', 'LegalMatch', 'legalmatch.com', 'vertical', false, 'none',
   'Case-matching attorney directory operating 20+ years, connects consumers to attorneys within 24 hours. Attorney signup is sales-led (subscription plans), no self-serve public API.',
   'https://www.legalmatch.com/', '{legal}', 45, 453, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('upcounsel', 'UpCounsel', 'upcounsel.com', 'vertical', false, 'approval',
   'B2B legal marketplace (5,000+ attorneys) matching businesses/entrepreneurs to lawyers. Attorney onboarding requires an application + 15-minute interview; no public API.',
   'https://www.upcounsel.com/for-attorneys', '{legal,business-law}', 35, 454, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('best-lawyers', 'Best Lawyers', 'bestlawyers.com', 'vertical', false, 'none',
   'Purely peer-review attorney recognition directory; lawyers cannot pay to participate — inclusion is by confidential peer survey only. Profile enhancement (paid) available post-selection. No public API.',
   'https://www.bestlawyers.com/find-a-lawyer', '{legal}', 55, 460, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('lawyers-of-distinction', 'Lawyers of Distinction', 'thelawyersofdistinction.com', 'vertical', false, 'none',
   'Attorney recognition directory selected via nomination + patented objective-criteria scoring (case results, awards, reviews). Paid membership tiers include a customized profile page. No public API.',
   'https://www.thelawyersofdistinction.com/home/', '{legal}', 30, 461, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('lawyer-legion', 'Lawyer Legion', 'lawyerlegion.com', 'vertical', false, 'none',
   'General attorney directory with free listings plus paid claim/enhancement tiers; also indexes bar/trade association directories. No public API.',
   'https://www.lawyerlegion.com/', '{legal}', 30, 469, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('local-attorneys-directory', 'The Local Attorneys Directory', 'local-attorneys.com', 'long_tail', false, 'none',
   'General long-tail attorney directory organized by practice area (divorce, workers-comp, etc.) and location. Form-based, no public API.',
   'https://www.local-attorneys.com/', '{legal}', 18, 503, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('lawyers-directory-usa', 'Lawyers Directory USA', 'lawyersdirectoryusa.com', 'long_tail', false, 'none',
   'Long-tail local business directory specifically for law firms and attorneys, US-wide. Form-based free listing, no public API.',
   'https://lawyersdirectoryusa.com/', '{legal}', 12, 504, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('find-us-lawyers', 'FindUsLawyers.org', 'finduslawyers.org', 'long_tail', false, 'none',
   'Long-tail free attorney/law-firm listing directory. Form-based, no public API.',
   'https://www.finduslawyers.org/', '{legal}', 12, 505, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  -- ===== Prestige / ranking directories (high_value) =====
  ('chambers-and-partners', 'Chambers and Partners', 'chambers.com', 'high_value', false, 'approval',
   'Global law firm/lawyer ranking directory (180+ jurisdictions) driven by independent editorial research + client-reference interviews. Firms submit data via MyAccount online form or Word/Excel templates — no fee to submit or be ranked. No public API.',
   'https://chambers.com/info/submissions', '{legal}', 55, 295, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('findlegalhelp-aba', 'ABA Find Legal Help', 'findlegalhelp.org', 'high_value', false, 'none',
   'American Bar Association public-service directory of Lawyer Referral Services (LRS) by state — the ABA''s consumer entry point to certified state/county/city bar referral programs. Individual firms list indirectly by joining a certified state/local LRS, not by direct ABA signup. No public API.',
   'https://www.americanbar.org/groups/legal_services/flh-home/', '{legal}', 40, 296, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  -- ===== Personal injury / criminal defense / trial =====
  ('national-trial-lawyers', 'The National Trial Lawyers', 'thenationaltriallawyers.org', 'vertical', false, 'none',
   'Invitation-only professional org for top civil-plaintiff/criminal-defense trial lawyers (Top 100 / Top 40 Under 40). Selection is peer-nomination + third-party research; members get a public profile page with bio/CV/links. Membership dues apply; no public API.',
   'https://thenationaltriallawyers.org/member-directory/', '{legal,personal-injury,criminal-defense}', 40, 455, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('nacdl', 'NACDL Find a Lawyer Directory', 'nacdl.org', 'vertical', false, 'none',
   'National Association of Criminal Defense Lawyers public "Find a Lawyer" directory, sourced from NACDL''s member roster. Listing requires NACDL membership; no public API.',
   'https://www.nacdl.org/directory/public', '{legal,criminal-defense}', 35, 466, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('classaction-org', 'ClassAction.org', 'classaction.org', 'vertical', false, 'partnership',
   'Consumer media/lead-generation site for class-action and mass-tort matters. Firms appear by sponsoring specific case investigations through a direct partnership (contact staff@classaction.org), not a self-serve directory signup. No public API.',
   'https://www.classaction.org/about-us', '{legal,class-action,mass-tort}', 35, 462, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  -- ===== Family law =====
  ('divorcenet', 'DivorceNet', 'divorcenet.com', 'vertical', false, 'none',
   'Family-law consumer info + attorney directory (Internet Brands network, sister site to Nolo/Lawyers.com — separate domain, not a duplicate). Form-based attorney listing, no public API.',
   'https://www.divorcenet.com/', '{legal,family-law}', 30, 463, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  ('divorce-com', 'Divorce.com', 'divorce.com', 'vertical', false, 'none',
   'Searchable divorce/family-law attorney directory by location, practice focus, and reviews. Form-based signup, no public API.',
   'https://divorce.com/divorce-attorney-near-me', '{legal,family-law}', 28, 464, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  -- ===== Immigration =====
  ('aila-lawyer-search', 'AILA Immigration Lawyer Search', 'ailalawyer.com', 'vertical', false, 'none',
   'American Immigration Lawyers Association public search tool over its 18,000+ member attorneys. Listing requires AILA membership; not a referral service. No public API.',
   'https://www.aila.org/about', '{legal,immigration}', 35, 456, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  -- ===== Estate planning / elder law =====
  ('naela', 'NAELA Find a Lawyer', 'naela.org', 'vertical', false, 'none',
   'National Academy of Elder Law Attorneys public directory (basic + advanced search) over its member roster specializing in elder law/special needs planning. Listing requires NAELA membership; no public API.',
   'https://www.naela.org/Web/Shared_Content/Directories/Find-a-Lawyer.aspx', '{legal,estate-planning,elder-law}', 30, 457, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  -- ===== Bankruptcy =====
  ('nacba', 'NACBA Find an Attorney', 'nacba.org', 'vertical', false, 'none',
   'National Association of Consumer Bankruptcy Attorneys (1,500+ members, all 50 states) public zip-code attorney search over its membership. Listing requires NACBA membership; no public API.',
   'https://nacba.org/page/find-an-attorney', '{legal,bankruptcy}', 30, 458, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  -- ===== Social Security disability =====
  ('nosscr', 'NOSSCR', 'nosscr.org', 'vertical', false, 'none',
   'National Organization of Social Security Claimants'' Representatives (4,000+ members) — public referral service connecting claimants to member disability-law representatives. Listing requires NOSSCR membership; no public API.',
   'https://nosscr.org/', '{legal,disability}', 28, 459, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  -- ===== Workers' compensation =====
  ('workerscompensation-com', 'WorkersCompensation.com Attorney Directory', 'workerscompensation.com', 'vertical', false, 'none',
   'Multi-state workers'' compensation attorney directory, part of a broader workers-comp trade/news portal. No public API; listing mechanism not self-serve documented — contact via site.',
   'https://www.workerscompensation.com/state-contact-info/attorney-directory/', '{legal,workers-comp}', 30, 465, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  -- ===== Veterans =====
  ('nova-vetadvocates', 'NOVA — National Organization of Veterans'' Advocates', 'vetadvocates.org', 'vertical', false, 'none',
   '600+ attorney/agent member org representing veterans before the VA, Board of Veterans'' Appeals, and CAVC. Public Attorney/Agent Directory sourced from membership; listing requires joining NOVA. No public API.',
   'https://www.vetadvocates.org/join', '{legal,veterans}', 22, 468, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  -- ===== LGBTQ+ legal =====
  ('lgbtq-bar', 'National LGBTQ+ Bar Association', 'lgbtqbar.org', 'vertical', false, 'none',
   '1,700+ member national LGBTQ+ bar and ally-lawyer association; several state/regional chapter sites (e.g. New Mexico LGBTQ+ Bar) maintain public member directories. Listing requires membership. No public API.',
   'https://lgbtqbar.org/', '{legal}', 22, 467, '39c38960-d30c-4840-b0c1-c9960de95582', 'public'),

  -- ===== Intellectual property =====
  ('aipla', 'AIPLA Member Directory', 'aipla.org', 'vertical', false, 'none',
   'American Intellectual Property Law Association (est. 1897) member directory for patent/trademark/copyright attorneys, searchable by state. Listing requires AIPLA membership; no public API.',
   'https://www.aipla.org/members/member-directory-collaborate', '{legal,intellectual-property}', 25, 470, '39c38960-d30c-4840-b0c1-c9960de95582', 'public')
;
