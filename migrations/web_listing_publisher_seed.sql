-- Seed web.listing_publisher from the founder research (common-docs/systems/marketing/local-listings/RESEARCH.md).
-- APPLIED LIVE 2026-08-18 via Supabase MCP.
-- Rows are platform-global reference data → system org (same as web.provider). Idempotent upsert by slug.
insert into web.listing_publisher (organization_id, slug, name, domain, tier, is_aggregator, api_access, api_notes, manage_url, categories, citation_weight, sort_rank, visibility)
select '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, v.* from (values
  ('google-business-profile','Google Business Profile','google.com','critical',false,'approval','GBP APIs gated by Google access-request form; needs a verified GBP 60+ days old + business website; ~7-14 day approval; then OAuth + Business Information/Account Management APIs with quotas.','https://business.google.com','{}'::text[],100::smallint,10,'public'::platform.visibility),
  ('apple-business-connect','Apple Business Connect','apple.com','critical',false,'partnership','Third-Party Partner registration + verification; companies delegate via Partner ID or OAuth; service accounts for API use; bulk CSV alternative at small scale.','https://businessconnect.apple.com','{}',90,20,'public'),
  ('bing-places','Bing Places for Business','bing.com','critical',false,'partnership','Trusted Partner API: contact partneronbp@microsoft.com, sandbox then production; designed for listing-management partners at scale.','https://www.bingplaces.com','{}',75,30,'public'),
  ('facebook-pages','Facebook / Meta Pages & Locations','facebook.com','critical',false,'open','Graph API + Pages API with OAuth; pages_manage_metadata etc.; app review for advanced access; owner/manager authorization required.','https://www.facebook.com/business','{}',85,40,'public'),
  ('yelp','Yelp','yelp.com','critical',false,'partnership','Partner APIs (Data Ingestion / Listing Management / SMB Claiming) require a formal contract; significant sales/review process; not open to random developers.','https://biz.yelp.com','{}',85,50,'public'),
  ('foursquare','Foursquare','foursquare.com','critical',true,'open','Places API: straightforward developer signup + keys; free tier; contribution/edit via Placemaker; full third-party claim-and-control more limited.','https://foursquare.com/products/places','{}',70,60,'public'),
  ('data-axle','Data Axle','data-axle.com','aggregator',true,'open','Documented Submission API (add/update/renew/delete); free tier for small counts, paid for volume; sandbox available; contact account team for full access.',null,'{}',80,100,'public'),
  ('localeze','TransUnion Digital Business Profile (Localeze)','transunion.com','aggregator',true,'partnership','Reseller/agency and data-licenser programs; API via partnership; effort similar to Data Axle.',null,'{}',75,110,'public'),
  ('yellow-pages-network','Yellow Pages Network / IYP feeds','yp.com','aggregator',true,'closed','GPS and IYP feeds to varying degrees; commonly reached via internal tools or partners.',null,'{}',50,120,'public'),
  ('yellow-pages','Yellow Pages (YP.com / Thryv)','yp.com','high_value',false,'closed','Thryv platform APIs exist and offer listings distribution as a product feature; no readily available open management API for third parties.','https://www.thryv.com','{}',55,200,'public'),
  ('tripadvisor','TripAdvisor','tripadvisor.com','high_value',false,'closed','Content API is read-oriented (reviews/location data); owner management mostly via Management Center; bulk third-party control limited.','https://www.tripadvisor.com/Owners','{hospitality,restaurants,travel}',60,210,'public'),
  ('bbb','Better Business Bureau','bbb.org','high_value',false,'none','Manual claim/update; no public management API.','https://www.bbb.org','{}',55,220,'public'),
  ('mapquest','MapQuest','mapquest.com','high_value',false,'none','Manual/form-based; commonly fed via aggregators.',null,'{}',40,230,'public'),
  ('nextdoor','Nextdoor','nextdoor.com','high_value',false,'none','Business page claim is manual; no third-party management API.','https://business.nextdoor.com','{}',50,240,'public'),
  ('linkedin-company','LinkedIn Company Pages','linkedin.com','high_value',false,'closed','Company page management API is partner-restricted.','https://www.linkedin.com/company/setup/new/','{}',45,250,'public'),
  ('superpages','Superpages / DexKnows','superpages.com','high_value',false,'none','Manual or via aggregators.',null,'{}',35,260,'public'),
  ('angi','Angi / HomeAdvisor','angi.com','high_value',false,'closed','Pro onboarding through their own sales flows; no open listing API.','https://www.angi.com/business','{home-services}',55,270,'public'),
  ('thumbtack','Thumbtack','thumbtack.com','high_value',false,'closed','Pro profiles managed in-product; partner API limited.','https://www.thumbtack.com/pro','{home-services}',50,280,'public'),
  ('healthgrades','Healthgrades','healthgrades.com','vertical',false,'closed','Provider data via their own programs; strong healthcare citation.',null,'{healthcare}',60,300,'public'),
  ('zocdoc','Zocdoc','zocdoc.com','vertical',false,'partnership','Practice onboarding via sales; API for scheduling partners.',null,'{healthcare}',55,310,'public'),
  ('avvo','Avvo','avvo.com','vertical',false,'none','Attorney profiles claimed manually.',null,'{legal}',55,320,'public'),
  ('opentable','OpenTable','opentable.com','vertical',false,'partnership','Restaurant onboarding via sales; APIs for booking partners.',null,'{restaurants}',55,330,'public'),
  ('manta','Manta','manta.com','long_tail',false,'none','Manual claim/update forms.',null,'{}',25,400,'public'),
  ('hotfrog','Hotfrog','hotfrog.com','long_tail',false,'none','Manual claim/update forms.',null,'{}',20,410,'public'),
  ('brownbook','Brownbook','brownbook.net','long_tail',false,'none','Manual; open wiki-style edits.',null,'{}',15,420,'public'),
  ('citysearch','CitySearch','citysearch.com','long_tail',false,'none','Manual; largely aggregator-fed.',null,'{}',15,430,'public'),
  ('ezlocal','EZLocal','ezlocal.com','long_tail',false,'none','Manual claim/update forms.',null,'{}',15,440,'public'),
  ('local-com','Local.com','local.com','long_tail',false,'none','Manual; aggregator-fed.',null,'{}',15,450,'public'),
  ('showmelocal','ShowMeLocal','showmelocal.com','long_tail',false,'none','Manual claim/update forms.',null,'{}',15,460,'public')
) as v(slug, name, domain, tier, is_aggregator, api_access, api_notes, manage_url, categories, citation_weight, sort_rank, visibility)
on conflict (slug) do update set
  name=excluded.name, domain=excluded.domain, tier=excluded.tier, is_aggregator=excluded.is_aggregator,
  api_access=excluded.api_access, api_notes=excluded.api_notes, manage_url=excluded.manage_url,
  categories=excluded.categories, citation_weight=excluded.citation_weight, sort_rank=excluded.sort_rank;
