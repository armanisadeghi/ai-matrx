-- Medical/healthcare niche expansion (common-docs/systems/marketing/local-listings/PLAN.md WS7).
-- Sub-verticals: mental health, physicians, dentists, chiropractic, physical therapy,
-- veterinary, med spas, urgent care, senior care. Deduped against the live 91-row registry
-- (healthgrades, zocdoc, vitals, webmd-care, ratemds, realself, wellness-com, sharecare,
-- care-com, caring-com, mindbody already present).
-- APPLIED LIVE via Supabase (linked project txzxabzwovsujtloxrus). Idempotent upsert by slug; system org.
insert into web.listing_publisher (organization_id, slug, name, domain, tier, is_aggregator, api_access, api_notes, manage_url, categories, citation_weight, sort_rank, visibility)
select '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, v.* from (values
  -- Aggregator (feeds many downstream healthcare directories from one profile)
  ('doctor-com','Doctor.com','doctor.com','aggregator',true,'partnership','Enterprise partnership platform; syndicates practice data to Google, Healthgrades, Vitals, YP, WebMD Care Directories, Doximity, and 20+ healthcare directories from one profile.','https://cms.doctor.com/enterprise','{healthcare}'::text[],65,130,'public'::platform.visibility),

  -- Mental health
  ('psychology-today','Psychology Today','psychologytoday.com','vertical',false,'none','Self-serve paid membership ($29.95/mo); no API. Flagship therapist directory + telehealth platform.','https://join.psychologytoday.com/us/signup','{healthcare,mental-health}',95,422,'public'),
  ('goodtherapy','GoodTherapy','goodtherapy.org','vertical',false,'none','Self-serve paid membership ($29.95-39.95/mo); form-based application.','https://www.goodtherapy.org/join-goodtherapy.html','{healthcare,mental-health}',60,424,'public'),
  ('therapyden','TherapyDen','therapyden.com','vertical',false,'none','Free self-serve signup; form-based, social-justice/inclusive focus.','https://www.therapyden.com/join','{healthcare,mental-health}',45,426,'public'),
  ('zencare','Zencare','zencare.co','vertical',false,'none','Vetted application ($59-98/mo + $130 signup); video-first provider profiles.','https://zencare.co/providers','{healthcare,mental-health}',50,428,'public'),
  ('inclusive-therapists','Inclusive Therapists','inclusivetherapists.com','vertical',false,'none','Application-based membership; form.','https://www.inclusivetherapists.com/join','{healthcare,mental-health}',40,430,'public'),
  ('open-path-collective','Open Path Collective','openpathcollective.org','vertical',false,'none','Nonprofit; one-time lifetime membership fee, sliding-scale therapist network.','https://openpathcollective.org/therapists/','{healthcare,mental-health}',35,432,'public'),
  ('therapytribe','TherapyTribe','therapytribe.com','vertical',false,'none','Self-serve paid listing ($29.95/mo); free hosted practice website included.','https://www.therapytribe.com/list-your-practice/','{healthcare,mental-health}',30,434,'public'),
  ('apa-psychologist-locator','APA Psychologist Locator','locator.apa.org','vertical',false,'none','American Psychological Association member directory; membership-gated profile.','https://locator.apa.org','{healthcare,mental-health}',40,436,'public'),
  ('nbcc-therapy-directory','NBCC Therapy Directory','nbcc.org','vertical',false,'none','National Board for Certified Counselors credential-holder directory.','https://www.nbcc.org/resources/counselorresources/therapydirectory','{healthcare,mental-health}',25,438,'public'),
  ('alma','Alma','helloalma.com','vertical',false,'approval','Apply to join insurance-based therapist marketplace; approval-gated onboarding.','https://helloalma.com/providers','{healthcare,mental-health}',50,440,'public'),
  ('headway','Headway','headway.co','vertical',false,'approval','Apply to join insurance-based therapist marketplace; approval-gated onboarding.','https://headway.co/providers','{healthcare,mental-health}',50,442,'public'),

  -- Physicians / general medical
  ('doximity','Doximity','doximity.com','high_value',false,'closed','Largest US clinician directory (auto-populated from NPI data). Identity-verified claim via credential fax/DEA/institutional email required to edit; no self-serve listing-push API (developer API is for approved partner apps consuming data). Feeds US News Doctor Finder.','https://www.doximity.com/developers/documentation','{healthcare}',80,444,'public'),
  ('us-news-doctor-finder','US News Doctor Finder','health.usnews.com','vertical',false,'none','750,000+ physician profiles; auto-synced from Doximity — update via Doximity profile, no direct self-serve edit here.','https://health.usnews.com/doctors','{healthcare}',65,446,'public'),
  ('caredash','CareDash','caredash.com','vertical',false,'none','Form-based provider claim.','https://www.caredash.com','{healthcare}',30,448,'public'),
  ('findatopdoc','FindaTopDoc','findatopdoc.com','vertical',false,'none','Form-based provider signup.','https://www.findatopdoc.com','{healthcare}',28,450,'public'),
  ('npi-registry','NPI Registry (NPPES)','npiregistry.cms.hhs.gov','aggregator',true,'open','Free public read API, no key required (CMS/HHS). Foundational identity data many directories key off; providers apply for/update their NPI via the NPPES enumeration system, not this read registry.','https://npiregistry.cms.hhs.gov/api-page','{healthcare}',35,140,'public'),
  ('medicare-care-compare','Medicare Care Compare','medicare.gov','high_value',false,'closed','CMS public directory of Medicare-certified providers (physicians, hospitals, home health, hospice). Data sourced from CMS enrollment/PECOS; no third-party listing API.','https://www.medicare.gov/care-compare','{healthcare}',55,452,'public'),
  ('sesame-care','Sesame Care','sesamecare.com','vertical',false,'approval','Direct-pay telehealth/in-person marketplace; providers apply to list services and cash pricing.','https://sesamecare.com/providers','{healthcare}',40,454,'public'),

  -- Dental
  ('ada-find-a-dentist','ADA Find-a-Dentist','findadentist.ada.org','high_value',false,'none','Included with ADA membership (100,000+ dentists); opt-in checkbox required to appear, self-serve edits via My ADA portal.','https://www.ada.org/join-the-ada/member-benefits/find-a-dentist','{healthcare,dental}',65,456,'public'),
  -- 1800dentist.com covered by concurrent dental-sweep row `1800dentist` (see web_listing_publisher_dental_verticals-equivalent migration); intentionally omitted here to avoid a duplicate domain.

  -- Chiropractic
  ('aca-hands-down-better','ACA Find a Doctor of Chiropractic','handsdownbetter.org','vertical',false,'none','American Chiropractic Association consumer directory; membership-gated listing.','https://www.acatoday.org/aca-membership/join/','{healthcare,chiropractic}',40,460,'public'),

  -- Physical therapy
  ('apta-choose-pt','APTA Find a PT (ChoosePT)','choosept.com','vertical',false,'none','American Physical Therapy Association member directory; membership-gated, opt-in Find a PT profile.','https://www.apta.org/apta-and-you/explore-apta-membership/membership-benefits/find-a-pt-profile-for-apta-members','{healthcare,physical-therapy}',45,462,'public'),

  -- Veterinary
  ('avma-locate-a-vet','AVMA Member Directory','avma.org','vertical',false,'none','American Veterinary Medical Association member directory; nonmembers excluded.','https://www.avma.org/avma-member-directory-search-tips-help','{healthcare,veterinary}',40,464,'public'),
  ('aaha-hospital-locator','AAHA Hospital Locator','aaha.org','vertical',false,'none','Accreditation-based directory (only ~12-15% of US/Canada animal hospitals are AAHA-accredited); accreditation application required, not a simple claim.','https://www.aaha.org/for-pet-parents/find-an-aaha-accredited-animal-hospital-near-me/','{healthcare,veterinary}',40,466,'public'),

  -- Med spas / aesthetics
  ('amspa-directory','AmSpa Vendor & Provider Directory','americanmedspa.org','vertical',false,'none','American Med Spa Association directory (15,000+ practices in database); membership-based.','https://americanmedspa.org/resources/vendor-directory','{healthcare,med-spa}',25,468,'public'),

  -- Urgent care
  ('solv-health','Solv Health','solvhealth.com','high_value',false,'partnership','Largest independently-verified urgent care directory with real-time booking. Solv Data Connect partnership syncs via API/HL7/FHIR/RPA; contact partners@solvhealth.com.','https://www.solvhealth.com/for-providers','{healthcare,urgent-care}',55,470,'public'),
  ('urgent-care-association','Urgent Care Association Locator','ucaoa.org','vertical',false,'none','UCA member directory; membership-based.','https://www.ucaoa.org','{healthcare,urgent-care}',25,472,'public'),

  -- Senior care
  ('a-place-for-mom','A Place for Mom','aplaceformom.com','high_value',false,'partnership','Nation''s largest senior living referral network (20,000+ communities); listing via local advisor network relationship, not self-serve. Owns SeniorAdvisor.com.','https://www.aplaceformom.com','{healthcare,senior-care}',65,474,'public'),
  ('senioradvisor','SeniorAdvisor.com','senioradvisor.com','vertical',false,'partnership','Consumer reviews site; A Place for Mom-owned/fed, 100,000+ community listings.','https://www.senioradvisor.com','{healthcare,senior-care}',45,476,'public'),
  ('seniorly','Seniorly','seniorly.com','vertical',false,'none','Senior living marketplace; community claim/signup form-based.','https://www.seniorly.com','{healthcare,senior-care}',45,478,'public')
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
