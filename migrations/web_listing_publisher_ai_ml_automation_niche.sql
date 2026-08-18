-- AI/ML/automation industry niche (common-docs/systems/local-listings/PLAN.md WS7).
-- The niche that supports AI Matrx itself: AI tool discovery directories, startup/product
-- launch platforms, developer & model/API marketplaces, AI agent/bot marketplaces, B2B
-- software review sites, AI/dev agency directories, and startup/company directories.
-- Deduped against the live registry: g2, capterra, clutch, goodfirms, crunchbase already
-- present (all now have dedicated AI-category pages per 2026-08 research; tagged 'ai' below
-- via UPDATE rather than re-inserted, to respect the no-duplicate-domain rule).
-- APPLIED LIVE via Supabase (linked project txzxabzwovsujtloxrus). Idempotent upsert by slug; system org.

-- Enrich existing general B2B/software rows that also serve as primary AI-company directories
-- (each confirmed to have a live, dedicated AI/AI-agent category page as of 2026-08-18).
update web.listing_publisher
set categories = (select array(select distinct unnest(categories || array['ai']))), updated_at = now()
where slug in ('g2','capterra','clutch','goodfirms','crunchbase');

insert into web.listing_publisher (organization_id, slug, name, domain, tier, is_aggregator, api_access, api_notes, manage_url, categories, citation_weight, sort_rank, visibility)
select '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, v.* from (values
  -- AI tool discovery / "submit your AI tool" directories
  ('theres-an-ai-for-that','There''s An AI For That','theresanaiforthat.com','high_value',false,'none','Largest standalone AI tool directory (12,000+ manually vetted tools); free task-based-search submission.','https://theresanaiforthat.com/submit','{ai}'::text[],55,800,'public'::platform.visibility),
  ('futurepedia','Futurepedia','futurepedia.io','high_value',false,'none','4,000+ curated tools, 500,000+ accounts; the one major AI directory that requires paid submission upfront.',null,'{ai}',50,802,'public'),
  ('toolify-ai','Toolify','toolify.ai','vertical',false,'none','26,000+ AI tools indexed across 450+ categories; free submission.',null,'{ai}',40,804,'public'),
  ('futuretools-io','Future Tools','futuretools.io','vertical',false,'none','4,000+ tools across 29 categories; submissions reviewed before approval (spam/clone filtering).','https://futuretools.io/submit-a-tool','{ai}',40,806,'public'),
  ('topai-tools','TopAI.tools','topai.tools','vertical',false,'none','Curated AI product directory across writing, image, coding, productivity, business-automation categories.',null,'{ai}',30,808,'public'),
  ('insidr-ai','Insidr.ai','insidr.ai','vertical',false,'none','Curated AI apps directory (productivity, business, content, dev); free submission.','https://www.insidr.ai/submit-tools/','{ai}',28,810,'public'),
  ('aixploria','Aixploria','aixploria.com','vertical',false,'none','Long-running AI tools directory with category browsing.',null,'{ai}',28,812,'public'),
  ('dang-ai','Dang.ai','dang.ai','vertical',false,'none','5,000+ AI tools/services; free listing requires a visible verification badge on the submitter''s own site. DR80 dofollow.','https://dang.ai/','{ai}',32,814,'public'),

  -- Product/startup launch & discovery platforms (AI is now the most competitive category on most of these)
  ('product-hunt','Product Hunt','producthunt.com','high_value',false,'none','Highest-reach product launch platform; free, no submission fee. AI is its most competitive category.','https://www.producthunt.com','{ai,startups}',60,816,'public'),
  ('betalist','BetaList','betalist.com','vertical',false,'none','Curated pre-launch/beta-stage startup directory; slower, hand-reviewed.',null,'{ai,startups}',30,818,'public'),
  ('indie-hackers','Indie Hackers','indiehackers.com','vertical',false,'none','Bootstrapped/indie founder community with product directory and launch threads.',null,'{ai,startups}',35,820,'public'),
  ('startupbase','StartupBase','startupbase.io','vertical',false,'none','Product Hunt-style startup launch directory.',null,'{ai,startups}',25,822,'public'),
  ('uneed','Uneed','uneed.best','vertical',false,'none','Rolling-leaderboard product launch platform for indie makers.',null,'{ai,startups}',28,824,'public'),
  ('fazier','Fazier','fazier.com','vertical',false,'none','AI-focused product discovery/launch platform; less crowded than Product Hunt, strong AI-query indexing.',null,'{ai,startups}',30,826,'public'),
  ('devhunt','DevHunt','devhunt.org','vertical',false,'none','Weekly launch platform scoped to developer tools, AI coding assistants, APIs, infrastructure.',null,'{ai,startups}',28,828,'public'),
  ('launching-next','Launching Next','launchingnext.com','vertical',false,'none','Curated startup directory; permanent dofollow listing.',null,'{ai,startups}',20,830,'public'),

  -- Developer / model / API marketplaces
  ('hugging-face','Hugging Face','huggingface.co','high_value',false,'open','200,000+ ML models, datasets, and Spaces; org/model profiles are self-serve, plus an open Hub API for programmatic model/dataset/space management.','https://huggingface.co','{ai,dev-tools}',60,832,'public'),
  ('rapidapi-hub','RapidAPI Hub','rapidapi.com','vertical',false,'open','Large API marketplace; self-serve API listing and open developer signup.',null,'{ai,dev-tools}',40,834,'public'),
  ('postman-api-network','Postman API Network','postman.com','vertical',false,'open','Public API directory inside Postman; self-serve publish of API collections/docs.',null,'{ai,dev-tools}',35,836,'public'),
  ('github-marketplace','GitHub Marketplace','github.com','high_value',false,'approval','Marketplace for GitHub Apps and Actions; publishing requires GitHub App review/verification, not open self-serve.',null,'{ai,dev-tools}',45,838,'public'),

  -- AI agent / bot / assistant marketplaces
  ('openai-gpt-store','OpenAI GPT Store','chatgpt.com','high_value',false,'approval','Publishing a GPT requires a ChatGPT Business/Enterprise/Edu workspace with publishing permissions (personal Plus/Pro accounts cannot publish); massive built-in distribution once approved.','https://help.openai.com/en/articles/8798878-building-and-publishing-a-gpt','{ai}',50,840,'public'),
  ('poe','Poe','poe.com','vertical',false,'none','Quora''s multi-model AI chat platform; self-serve custom-bot creation with optional publish to the public community directory.',null,'{ai}',35,842,'public'),

  -- B2B software review / discovery platforms (beyond the existing G2/Capterra rows)
  ('trustradius','TrustRadius','trustradius.com','vertical',false,'none','Long-form verified-user reviews; mid-market/enterprise B2B buyer audience.',null,'{ai,software,b2b}',40,844,'public'),
  ('getapp','GetApp','getapp.com','vertical',false,'none','Gartner Digital Markets network (sister to Capterra); one submission via the Gartner portal lists across GetApp/Capterra/Software Advice.',null,'{ai,software,b2b}',40,846,'public'),
  ('software-advice','Software Advice','softwareadvice.com','vertical',false,'none','Gartner Digital Markets network property; same submission portal as GetApp/Capterra.',null,'{ai,software,b2b}',40,848,'public'),
  ('sourceforge','SourceForge','sourceforge.net','high_value',false,'none','22.5M monthly visits; one of the oldest software directories, free listing, high domain authority.',null,'{ai,software,b2b}',45,850,'public'),
  ('slashdot','Slashdot','slashdot.org','vertical',false,'none','Tech news/reviews community reaching technical decision-makers; product listings via Slashdot Media.',null,'{ai,software,b2b}',30,852,'public'),
  ('alternativeto','AlternativeTo','alternativeto.net','vertical',false,'none','Independent software marketplace built around "alternatives to X" search intent; free dofollow listing.',null,'{ai,software,b2b}',40,854,'public'),
  ('saashub','SaaSHub','saashub.com','vertical',false,'none','Independent SaaS marketplace organized by tool alternatives; free submission, fast approval.',null,'{ai,software,b2b}',32,856,'public'),
  ('stackshare','StackShare','stackshare.io','vertical',false,'none','Tech-stack directory read by engineers/CTOs/VPEs; free listing.',null,'{ai,software,dev-tools}',30,858,'public'),
  ('crozdesk','Crozdesk','crozdesk.com','vertical',false,'none','Business software discovery platform with category rankings; free claimable listing, paid boost available.',null,'{ai,software,b2b}',25,860,'public'),
  ('saasworthy','SaaSWorthy','saasworthy.com','vertical',false,'none','SaaS-only discovery/comparison platform; free listing.',null,'{ai,software,b2b}',25,862,'public'),

  -- AI/dev agency & consulting directories
  ('designrush','DesignRush','designrush.com','vertical',false,'none','30,000+ agency directory sorted by expertise/region/reviews/portfolio; includes an AI-development category.',null,'{ai,agencies,b2b}',40,864,'public'),
  ('upcity','UpCity','upcity.com','vertical',false,'none','Local-leaning service-provider directory with verified reviews.',null,'{ai,agencies,b2b}',32,866,'public'),
  ('sortlist','Sortlist','sortlist.com','vertical',false,'none','40,000+ agency matchmaking platform (AI + human-consultant matching).',null,'{ai,agencies,b2b}',32,868,'public'),
  ('the-manifest','The Manifest','themanifest.com','vertical',false,'none','Clutch''s sister B2B guide/shortlist site; curated agency shortlists including AI/dev services.',null,'{ai,agencies,b2b}',35,870,'public'),

  -- Startup / company / talent directories
  ('wellfound','Wellfound','wellfound.com','high_value',false,'none','150,000+ startups, 8M candidates (formerly AngelList Talent); free self-serve company profile.',null,'{ai,startups}',45,872,'public'),
  ('built-in','Built In','builtin.com','vertical',false,'none','National + per-city (Austin, NYC, SF, etc.) tech-company profile network.',null,'{ai,startups}',35,874,'public'),
  ('f6s','F6S','f6s.com','vertical',false,'none','120+ country startup network; strong for accelerator/grant-program discovery.',null,'{ai,startups}',30,876,'public'),
  ('startupblink','StartupBlink','startupblink.com','vertical',false,'none','Global startup-ecosystem ranking platform with company directory.',null,'{ai,startups}',28,878,'public')
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
