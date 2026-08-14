/**
 * THE GROWTH LOOP MAP — the single machine-readable source of truth.
 *
 * Research -> Plan -> Brief -> Realize -> Fill -> Publish -> Serve -> Crawl ->
 * Measure -> Analyze -> Suggest -> Write-back -> (back to Plan/Fill).
 *
 * Vision + doctrine: common-docs/systems/growth-loop/VISION.md + FEATURE.md.
 * Campaign + lanes:  common-docs/projects/growth-loop-gaps/PLAN.md.
 *
 * THE THREE PIPES: every edge must be runnable by CODE (deterministic, free),
 * by a HUMAN (a real UI they can reach), and by AI (a purpose-built agent).
 * A connection that exists on only one pipe is still a gap.
 *
 * RULES FOR EDITING THIS FILE
 * 1. Status here must reflect LIVE CODE, never intent. Every `state` other than
 *    "missing" carries a `ref` an auditor can open and verify.
 * 1b. 🚨 "LIVE" MEANS SHIPPED — on origin/main and deployed. Code sitting in a
 *    working tree, however finished, is NOT live; that is what `status:
 *    "in-progress"` is for, and the gap's `detail` must say so. This rule exists
 *    because it was broken: the 2026-08-12 audit found ~10 gaps fully built on
 *    one laptop, several with their MIGRATIONS ALREADY APPLIED to the live
 *    database, while production ran none of the code. A map that counted those
 *    as done would have been worse than no map.
 * 2. This file is the ONLY place statuses live. common-docs points here; it must
 *    never restate a status (that is how mirrors rot).
 * 3. Filling a gap = flipping its pipe state here in the SAME change as the code.
 * 4. Never delete a gap id. Set `status: "closed"` with the evidence ref.
 */

export type Pipe = "code" | "human" | "ai";

/** How well a pipe carries this edge/stage today. */
export type PipeState =
  | "live" // works unattended/reachable today, verified
  | "partial" // exists but incomplete, manual-only, or unwired
  | "missing" // nothing exists
  | "n/a"; // deliberately does not apply (record WHY in note)

export type Maturity = "production" | "near" | "stub" | "missing";

export type Repo = "ai-matrx" | "aidream" | "my-matrx" | "db";

export interface PipeStatus {
  state: PipeState;
  /** One line: what exists, or what is missing. No hedging. */
  note: string;
  /** file path / endpoint / table an auditor can open. Required unless missing. */
  ref?: string;
}

/**
 * The customer-facing face of a stage. Presence of this object is the
 * "show publicly" flag — a stage without it never renders on /how-it-works.
 *
 * Copy rules (our user is a brilliant NON-technical expert):
 * - No product jargon, no file names, no internal stage names.
 *   "Realize page shell" is engineer-speak; "Create the pages" is not.
 * - `plain` is ONE sentence a stranger understands in five seconds.
 * - Never describe intent. If the stage cannot do it today, do not say it.
 */
export interface PublicStageInfo {
  /** Customer-facing stage name. */
  title: string;
  /** One plain-English sentence. */
  plain: string;
  /** Lucide icon NAME — this file stays React-free (see FEATURE.md). */
  icon: string;
}

export interface LoopStage {
  id: string;
  /** Short label rendered in the node. */
  label: string;
  /** One sentence a non-technical person understands. */
  blurb: string;
  repos: Repo[];
  /** Canonical storage. Exact table names. */
  stores: string[];
  maturity: Maturity;
  pipes: Record<Pipe, PipeStatus>;
  /** Where a human enters this stage today. */
  entry?: string;
  /** Present = this stage is shown on the public /how-it-works page. */
  publicInfo?: PublicStageInfo;
}

export interface LoopEdge {
  id: string;
  from: string;
  to: string;
  label: string;
  pipes: Record<Pipe, PipeStatus>;
  /** Gap ids that live on this connection. */
  gaps?: string[];
}

export type GapSeverity = "blocker" | "major" | "minor";
export type GapStatus = "open" | "in-progress" | "closed";

export interface LoopGap {
  id: string;
  title: string;
  severity: GapSeverity;
  status: GapStatus;
  /** stage id or edge id this gap sits on. */
  at: string;
  /** Which pipe(s) this gap breaks. */
  breaks: Pipe[];
  /** What is missing, concretely. */
  detail: string;
  /** Campaign lane id (see LANES). */
  lane: string;
  /** Evidence path when closed. */
  evidence?: string;
}

export interface Lane {
  id: string;
  label: string;
  /** Why these gaps belong together (shared code, shared risk). */
  rationale: string;
  repos: Repo[];
  /** Lane ids that must land first. Empty = start now, in parallel. */
  dependsOn: string[];
}

// ---------------------------------------------------------------------------
// STAGES
// ---------------------------------------------------------------------------

export const STAGES: LoopStage[] = [
  {
    id: "research",
    label: "Research",
    blurb:
      "Learn everything about a brand, market and keywords, and write it up as one report.",
    publicInfo: {
      title: "Learn the market",
      plain:
        "We study your business, your competitors, and what people are actually searching for — and write it all up as one report.",
      icon: "Search",
    },
    repos: ["ai-matrx", "aidream", "db"],
    stores: [
      "research.rs_topic",
      "research.rs_source",
      "research.rs_synthesis",
      "research.rs_document",
    ],
    maturity: "production",
    entry: "/research/topics/[topicId]",
    pipes: {
      code: {
        state: "live",
        note: "research_refresh_dispatch is registered in system_task_runner and scheduled — 486 runs / 2 failures live on 2026-08-13. run_pipeline no longer needs a click.",
        ref: "aidream/aidream/services/research/pipeline.py#run_pipeline",
      },
      human: {
        state: "live",
        note: "Full topic workspace: keywords, sources, curation, analysis, synthesis, document.",
        ref: "ai-matrx/app/(core)/research/topics/[topicId]",
      },
      ai: {
        state: "live",
        note: "7 pinned research agents do the work INSIDE a run, and research_run(action='start') is a registered tool — an agent can now start one (G-RESEARCH-TRIGGER, closed).",
        ref: "aidream/aidream/services/research/agents.py",
      },
    },
  },
  {
    id: "plan",
    label: "Content plan",
    blurb:
      "Turn the research into the full list of pages the site should have, as a tree.",
    publicInfo: {
      title: "Plan every page",
      plain:
        "That research becomes the complete list of pages your site should have, organised the way your visitors actually think.",
      icon: "ListTree",
    },
    repos: ["ai-matrx", "aidream", "db"],
    stores: ["plan.node", "plan.entity", "plan.profile"],
    maturity: "production",
    entry: "/marketing/content-plan",
    pipes: {
      code: {
        state: "live",
        note: "Archetype expansion is deterministic and fixture-pinned (62 cases) — concepts/variants/counts to routes.",
        ref: "ai-matrx/features/marketing/content-plan/setup/archetypes.ts",
      },
      human: {
        state: "live",
        note: "Tree editor, node panel, pillar map, entity manager; drag-reparent writes real parent_id.",
        ref: "ai-matrx/features/marketing/content-plan/components/PlanTree.tsx",
      },
      ai: {
        state: "live",
        note: "3 research-wave agents + 1 merger generate the tree server-side.",
        ref: "aidream/aidream/services/content_plan/generator.py#generate_merged_plan",
      },
    },
  },
  {
    id: "brief",
    label: "Page brief",
    blurb:
      "Write the core instructions for each individual page, with its own research behind it.",
    publicInfo: {
      title: "Decide what each page says",
      plain:
        "Every single page gets its own instructions, with its own research behind it, before a word is written.",
      icon: "FileText",
    },
    repos: ["ai-matrx", "aidream", "db"],
    stores: ["plan.node.brief", "plan.node.attributes"],
    maturity: "production",
    entry: "/marketing/content-plan (node panel)",
    pipes: {
      code: {
        state: "n/a",
        note: "Writing a brief is a judgement call — code cannot author it. Code only bulk-DISPATCHES briefs (empty-brief sweep).",
        ref: "ai-matrx/features/marketing/content-plan/hooks/useContentPlanAi.ts#usePlanBulkDeepen",
      },
      human: {
        state: "live",
        note: "Brief textarea on the node panel.",
        ref: "ai-matrx/features/marketing/content-plan/components/NodePanel.tsx",
      },
      ai: {
        state: "live",
        note: "deepen_node does node-scoped research and writes brief + source entities; brief-writer agent stages a draft for the user.",
        ref: "aidream/aidream/services/content_plan/generator.py#deepen_node",
      },
    },
  },
  {
    id: "realize",
    label: "Realize page shell",
    blurb:
      "Create the actual (empty) page in the CMS at the address the plan promised.",
    publicInfo: {
      title: "Create the pages",
      plain:
        "Each planned page is created for real, at the exact web address the plan promised — nothing gets lost between the plan and the site.",
      icon: "LayoutTemplate",
    },
    repos: ["aidream", "db"],
    stores: ["client_pages (CMS project)", "client_pages.plan_node_id"],
    maturity: "near",
    entry: "/marketing/content-plan (Make it real)",
    pipes: {
      code: {
        state: "live",
        note: "cms_reconcile buckets matched/ghosts/orphans/conflicts; cms_align realize/adopt/map/retire, dry-run + idempotent.",
        ref: "aidream/aidream/services/content_plan/cms_reconciler.py",
      },
      human: {
        state: "live",
        note: "Per-PAGE build from the node panel (sends the unbuilt ancestor chain in one call), plus the whole-site Setup rungs.",
        ref: "ai-matrx/features/marketing/content-plan/components/NodeRealityCard.tsx",
      },
      ai: {
        state: "live",
        note: "content_plan tool actions cms_reconcile / cms_align.",
        ref: "aidream/aidream/tools",
      },
    },
  },
  {
    id: "fill",
    label: "Fill page body",
    blurb: "Write the real content of each page from its brief.",
    publicInfo: {
      title: "Write the content",
      plain:
        "Every page is written from its own instructions, so it says something specific and useful instead of something generic.",
      icon: "PenLine",
    },
    repos: ["aidream", "db"],
    stores: [
      "plan.cms_fill_job",
      "plan.cms_fill_item",
      "client_pages.html_content_draft",
    ],
    maturity: "near",
    pipes: {
      code: {
        state: "partial",
        note: "The durable queue and mandatory one-page preview are live; cms_fill reads the shared template_map resolver and treats realized scaffolds as unfilled, but deterministic code does not author brief-specific body copy.",
        ref: "aidream/aidream/services/content_plan/cms_fill.py",
      },
      human: {
        state: "partial",
        note: "Pages are editable, but the CMS editor is raw HTML/CSS textareas — not a surface our non-technical user can work in.",
        ref: "ai-matrx/app/(core)/cms/[siteId]/pages/[pageId]",
      },
      ai: {
        state: "live",
        note: "_author_page writes html + page CSS + SEO through the guarded page_service.",
        ref: "aidream/aidream/services/content_plan/cms_fill.py#_author_page",
      },
    },
  },
  {
    id: "publish",
    label: "Publish",
    blurb: "Make the page live for the public.",
    publicInfo: {
      title: "Put it live",
      plain:
        "Nothing becomes public on its own. You look it over, and one click makes it live.",
      icon: "Send",
    },
    repos: ["ai-matrx", "aidream", "db"],
    stores: ["client_pages.is_published", "client_activity_log"],
    maturity: "production",
    pipes: {
      code: {
        state: "live",
        note: "One guarded seam: publish_page_draft RPC; bulk publish_many; advances plan node status forward-only.",
        ref: "aidream/aidream/services/cms/pages.py#publish",
      },
      human: {
        state: "live",
        note: "Publish one page from the plan's node panel (bridge path, advances plan status) or from the CMS page editor.",
        ref: "ai-matrx/features/marketing/content-plan/components/NodeRealityCard.tsx",
      },
      ai: {
        state: "live",
        note: "cms_page publish tool, gated by per-site agent_write_policy.",
        ref: "aidream/aidream/services/cms/access.py",
      },
    },
  },
  {
    id: "serve",
    label: "Live site",
    blurb: "The page is served to real visitors on a real domain.",
    publicInfo: {
      title: "Your site, your domain",
      plain: "Your pages are served to real visitors on your own web address.",
      icon: "Globe",
    },
    repos: ["my-matrx"],
    stores: ["client_sites.domain"],
    maturity: "near",
    pipes: {
      code: {
        state: "live",
        note: "The renderer, custom-domain routing, 301 ledger, server-rendered collections, sitemap.xml, and robots.txt are live; the public collection fixture and both discovery files return complete HTML/200 responses.",
        ref: "my-matrx/lib/render/",
      },
      human: {
        state: "n/a",
        note: "Serving is infrastructure; there is no human step.",
      },
      ai: {
        state: "n/a",
        note: "Serving is infrastructure; there is no agent step.",
      },
    },
  },
  {
    id: "crawl",
    label: "Crawl",
    blurb:
      "Our crawler visits the live site and records what is actually there.",
    publicInfo: {
      title: "Check what's really there",
      plain:
        "We visit your live site the way a search engine does, and record exactly what it finds — not what you hoped it would find.",
      icon: "ScanSearch",
    },
    repos: ["aidream", "db"],
    stores: ["web.crawl_session", "web.page", "web.snapshot", "web.link_edge"],
    maturity: "production",
    entry: "/marketing/brands/[brandId]/sites/[siteId]",
    pipes: {
      code: {
        state: "live",
        note: "One crawl world as of 2026-08-10 (G-CRAWL-DUAL): the legacy scraper.crawl_* store is in graveyard and the every-minute dispatcher drives web.crawl_schedule. The writer side closed 2026-08-11 (G-CRAWL-SCHEDULE): CrawlScheduleCard writes intent direct to Supabase under the column-scoped grants of aidream migration 0322.",
        ref: "aidream/packages/matrx-scraper/matrx_scraper/web_crawl/schedules.py#dispatch_due_crawl_schedules",
      },
      human: {
        state: "live",
        note: "New-crawl workspace, per-page fetch, sitemap sync, and CrawlScheduleCard cadence/toggle controls are reachable.",
        ref: "ai-matrx/features/marketing/components/crawls/CrawlScheduleCard.tsx",
      },
      ai: {
        state: "missing",
        note: "No agent tool starts or reads a crawl.",
      },
    },
  },
  {
    id: "measure",
    label: "Measure",
    blurb:
      "Pull in the real numbers: Search Console, analytics, speed, rankings, backlinks.",
    publicInfo: {
      title: "Bring in the real numbers",
      plain:
        "Where you rank, who visited, how fast the page loads, who links to you — the actual results, all in one place.",
      icon: "BarChart3",
    },
    repos: ["aidream", "db"],
    stores: [
      "seo.search_performance_daily",
      "seo.web_analytics_daily",
      "seo.page_performance",
      "seo.backlink_*",
    ],
    maturity: "production",
    entry: "/marketing/search-console",
    pipes: {
      code: {
        state: "partial",
        note: "GSC, backlinks and ranks sync nightly; PageSpeed coverage runs in small resumable ten-minute batches; GA4 remains on-demand only.",
        ref: "aidream/aidream/services/scheduling/system_task_runner.py#register_builtin_system_tasks",
      },
      human: {
        state: "live",
        note: "Connect + sync buttons per integration; Search Console workspace.",
        ref: "ai-matrx/features/marketing/components/integrations/SiteIntegrationsWorkspace.tsx",
      },
      ai: {
        state: "missing",
        note: "No agent can trigger or read a sync directly.",
      },
    },
  },
  {
    id: "analyze",
    label: "Analyze",
    blurb:
      "Judge every page against what good looks like, and against how it is actually performing.",
    publicInfo: {
      title: "Find what's holding you back",
      plain:
        "Every page is checked against what good looks like — and against how it is actually performing out in the world.",
      icon: "SearchCheck",
    },
    repos: ["ai-matrx", "aidream", "db"],
    stores: [
      "web.analysis_result",
      "web.finding",
      "web.snapshot.audit_metrics",
    ],
    maturity: "production",
    entry: "/marketing/brands/[brandId]/sites/[siteId]/findings",
    pipes: {
      code: {
        state: "live",
        note: "15-check catalogue runs automatically after every full crawl; findings reconciled, not duplicated. FE evaluators are byte-parity locked to the server.",
        ref: "ai-matrx/features/marketing/data/analysis-service.ts",
      },
      human: {
        state: "live",
        note: "Findings table, finding detail, site analysis table, GSC insight views.",
        ref: "ai-matrx/features/marketing/components/analysis/FindingsTable.tsx",
      },
      ai: {
        state: "partial",
        note: "7 SEO agent slots exist and page analyzers run, but no agent reviews the finding register itself.",
        ref: "aidream/aidream/services/seo/keyword_agents.py",
      },
    },
  },
  {
    id: "suggest",
    label: "Suggest",
    blurb:
      "Turn what we learned into a one-click suggestion the user can accept.",
    publicInfo: {
      title: "Get told what to do next",
      plain:
        "What we learn becomes a plain-English suggestion you can accept — not a report you have to decode first.",
      icon: "Lightbulb",
    },
    repos: ["ai-matrx", "db"],
    stores: ["platform.assists", "web.finding.status"],
    maturity: "stub",
    pipes: {
      code: {
        state: "live",
        note: "private.sweep_marketing_finding_assists runs every 15 minutes and maintains the three highest-priority finding groups per actionable site in platform.assists.",
        ref: "ai-matrx/features/marketing/findings-assists-producer.ts",
      },
      human: {
        state: "live",
        note: "Finding detail and the register expose acknowledge, resolve, reopen, suppress, unsuppress, and bulk actions through one mutation service.",
        ref: "ai-matrx/features/marketing/data/finding-mutations.ts",
      },
      ai: {
        state: "live",
        note: "The purpose-built SEO Finding Fixer is pinned to seo.finding_fixer and POST /seo/findings/draft-fix returns finding-scoped replacement proposals.",
        ref: "aidream/aidream/services/seo/finding_fix.py",
      },
    },
  },
  {
    id: "writeback",
    label: "Write back",
    blurb:
      "Push the accepted improvement into the page and back into the plan.",
    publicInfo: {
      title: "Improve it, and go again",
      plain:
        "An accepted improvement is written back into the page and back into the plan — so the next pass starts from what you just learned.",
      icon: "RefreshCw",
    },
    repos: ["ai-matrx", "aidream", "db"],
    stores: [
      "client_pages (draft columns)",
      "plan.node.status_id",
      "seo metrics_desired",
    ],
    maturity: "near",
    pipes: {
      code: {
        state: "live",
        note: "Desired-meta -> page intent -> CMS draft push; never auto-publishes, never moves a route (THE 301 LAW).",
        ref: "ai-matrx/features/marketing/lib/push-to-cms.ts",
      },
      human: {
        state: "live",
        note: "Apply-meta-to-page and Push-to-CMS cards.",
        ref: "ai-matrx/features/marketing/components/pages/cards/PushToCmsCard.tsx",
      },
      ai: {
        state: "partial",
        note: "The purpose-built finding fixer proposes exact replacements and agents can write CMS drafts, but the fixer itself never applies or publishes its proposal.",
        ref: "aidream/aidream/services/seo/finding_fix.py",
      },
    },
  },
];

// ---------------------------------------------------------------------------
// EDGES — the connections. This is where the loop actually breaks.
// ---------------------------------------------------------------------------

const MISSING = (note: string): PipeStatus => ({ state: "missing", note });

export const EDGES: LoopEdge[] = [
  {
    id: "research->plan",
    from: "research",
    to: "plan",
    label: "site shape",
    pipes: {
      code: {
        state: "live",
        note: "web.site.settings.content_plan.research_topic_id is the durable link; latest successful document is read on both sides.",
        ref: "ai-matrx/features/marketing/content-plan/setup/draft.ts",
      },
      human: {
        state: "live",
        note: "Build-with-AI dialog: research a company, then commit the staged shape.",
        ref: "ai-matrx/features/marketing/content-plan/setup/components/SetupView.tsx",
      },
      ai: {
        state: "live",
        note: "Server generator loads the report and runs the 3+1 agent wave.",
        ref: "aidream/aidream/services/content_plan/generator.py#_load_research_report",
      },
    },
  },
  {
    id: "plan->brief",
    from: "plan",
    to: "brief",
    label: "briefs",
    pipes: {
      code: {
        state: "live",
        note: "Bulk sweep dispatches every empty-brief node.",
        ref: "useContentPlanAi.ts#usePlanBulkDeepen",
      },
      human: {
        state: "live",
        note: "Open a node, write the brief.",
        ref: "NodePanel.tsx",
      },
      ai: {
        state: "live",
        note: "deepen_node / brief-writer.",
        ref: "generator.py#deepen_node",
      },
    },
  },
  {
    id: "brief->realize",
    from: "brief",
    to: "realize",
    label: "real pages",
    gaps: ["G-TEMPLATE"],
    pipes: {
      code: {
        state: "live",
        note: "realize creates the page at the right route AND scaffolds it: cms_reconciler imports scaffold_for/node_facts from content_plan/templates.py and resolves plan.profile.template_map, with an unknown explicit pin raising rather than silently defaulting (G-TEMPLATE, closed).",
        ref: "cms_reconciler.py#_realize_batch",
      },
      human: {
        state: "live",
        note: "Node panel 'The real page' always states the verdict and carries its next action; Setup rungs do the whole site with dry-run.",
        ref: "NodeRealityCard.tsx",
      },
      ai: {
        state: "live",
        note: "content_plan tool.",
        ref: "aidream/aidream/tools",
      },
    },
  },
  {
    id: "realize->fill",
    from: "realize",
    to: "fill",
    label: "content",
    pipes: {
      code: {
        state: "live",
        note: "Durable job/item queue with cancel + status.",
        ref: "cms_fill.py",
      },
      human: {
        state: "live",
        note: "'Write the content' authors ONE page from its brief in the node panel; Setup previews one page then fans out.",
        ref: "NodeRealityCard.tsx",
      },
      ai: {
        state: "live",
        note: "_author_page.",
        ref: "cms_fill.py#_author_page",
      },
    },
  },
  {
    id: "fill->publish",
    from: "fill",
    to: "publish",
    label: "goes live",
    pipes: {
      code: {
        state: "live",
        note: "publish_many over linked nodes.",
        ref: "content_plan.py POST /cms-publish",
      },
      human: {
        state: "live",
        note: "Publish one page from the node panel through the BRIDGE (advances the plan node); CMS editor publishes the page alone.",
        ref: "NodeRealityCard.tsx",
      },
      ai: {
        state: "live",
        note: "cms_page publish, policy-gated.",
        ref: "aidream/aidream/services/cms/access.py",
      },
    },
  },
  {
    id: "publish->serve",
    from: "publish",
    to: "serve",
    label: "reachable",
    gaps: ["G-SITEMAP"],
    pipes: {
      code: {
        state: "live",
        note: "Published pages render on custom domains, collections are present in server HTML, and per-host sitemap.xml plus robots.txt are live.",
        ref: "my-matrx/lib/render/sitemap.js",
      },
      human: { state: "n/a", note: "Nothing for a human to do." },
      ai: { state: "n/a", note: "Nothing for an agent to do." },
    },
  },
  {
    id: "serve->crawl",
    from: "serve",
    to: "crawl",
    label: "what shipped",
    gaps: ["G-PUBLISH-CRAWL"],
    pipes: {
      code: {
        state: "live",
        note: "cms/pages.py calls web_announce on publish, and the scheduled reconcile sweep recovers missed announcements; live runs have announced pages without errors.",
        ref: "aidream/aidream/services/web_announce/",
      },
      human: {
        state: "live",
        note: "Start a crawl by hand.",
        ref: "NewCrawlWorkspace.tsx",
      },
      ai: MISSING("No agent tool can start a crawl."),
    },
  },
  {
    id: "crawl->measure",
    from: "crawl",
    to: "measure",
    label: "the numbers",
    gaps: ["G-CMS-IDENTITY"],
    pipes: {
      code: {
        state: "live",
        note: "client_pages.web_page_id is the durable CMS-to-measurement identity stamped by executeCmsPush; every measurement table keeps that same web.page id as its FK.",
        ref: "ai-matrx/features/marketing/lib/push-to-cms.ts",
      },
      human: {
        state: "live",
        note: "Per-site integrations workspace.",
        ref: "SiteIntegrationsWorkspace.tsx",
      },
      ai: MISSING("No agent-side sync trigger."),
    },
  },
  {
    id: "measure->analyze",
    from: "measure",
    to: "analyze",
    label: "findings",
    pipes: {
      code: {
        state: "live",
        note: "Analysis runs automatically after each full crawl; GSC insight rules run client-side.",
        ref: "analysis-service.ts",
      },
      human: {
        state: "live",
        note: "Run analysis on demand.",
        ref: "CatalogueAnalysisPanel.tsx",
      },
      ai: {
        state: "partial",
        note: "Page-analyzer agents run on demand; nothing reviews the whole register.",
        ref: "aidream/aidream/services/seo/page_agents.py",
      },
    },
  },
  {
    id: "analyze->suggest",
    from: "analyze",
    to: "suggest",
    label: "offers",
    gaps: ["G-FINDING-ASSIST", "G-SUGGEST-FORK"],
    pipes: {
      code: {
        state: "partial",
        note: "private.sweep_marketing_finding_assists runs every 15 minutes without a page visit and maintains the top three finding groups per actionable site; G-SUGGEST-FORK remains because thirteen legacy offer capabilities are not absorbed.",
        ref: "features/marketing/findings-assists-producer.ts",
      },
      human: {
        state: "live",
        note: "The site owner is offered three ranked site/check groups in the ambient dock and findings surfaces. Chip click expands; the explicit Review findings button opens the filtered register, where acknowledge/resolve/suppress and canonical fixes live.",
        ref: "FindingsAssistStrip.tsx",
      },
      ai: {
        state: "partial",
        note: "Individual finding detail can launch the purpose-built fixer; the background grouped sweep is deterministic and spends no tokens. No agent yet proposes across the whole register unprompted.",
        ref: "features/marketing/lib/finding-remedies.ts",
      },
    },
  },
  {
    id: "suggest->writeback",
    from: "suggest",
    to: "writeback",
    label: "applied",
    pipes: {
      code: {
        state: "live",
        note: "planDeterministicFix drafts the derivable class free on the individual finding path; FindingFixCard applies desired metadata + a CMS DRAFT. Grouped assists navigate to that canonical path rather than adding a batch write. Never publishes.",
        ref: "features/marketing/lib/finding-fix.ts",
      },
      human: {
        state: "live",
        note: "FindingFixCard on the finding shows before/after, risks, and one Apply-as-a-draft button; PushToCmsCard remains the page-level path.",
        ref: "features/marketing/components/analysis/FindingFixCard.tsx",
      },
      ai: {
        state: "live",
        note: "The purpose-built SEO Finding Fixer (slot seo.finding_fixer, agent seo_finding_fixer_v1) writes the judgement-call replacements via POST /seo/findings/draft-fix. Proposes only — it has no write path.",
        ref: "aidream/aidream/services/seo/finding_fix.py",
      },
    },
  },
  {
    id: "writeback->fill",
    from: "writeback",
    to: "fill",
    label: "page fixed",
    pipes: {
      code: {
        state: "live",
        note: "Writes land in draft columns only; publishing stays a separate, deliberate act.",
        ref: "push-to-cms.ts#executeCmsPush",
      },
      human: {
        state: "live",
        note: "Review the draft, then publish.",
        ref: "ai-matrx/app/(core)/cms/[siteId]/pages/[pageId]",
      },
      ai: {
        state: "live",
        note: "cms_page tool under agent_write_policy.",
        ref: "aidream/aidream/services/cms/access.py",
      },
    },
  },
  {
    id: "writeback->plan",
    from: "writeback",
    to: "plan",
    label: "plan learns",
    gaps: ["G-STALENESS", "G-PLAN-STATUS"],
    pipes: {
      code: {
        state: "partial",
        note: "plan._status_flow_guard enforces transitions and publish advances nodes, but plan_signal_sweep has flipped 0 nodes in 19 runs; three sites are skipped for ambiguous vertical.",
        ref: "aidream/aidream/services/content_plan/signals.py",
      },
      human: {
        state: "live",
        note: "Set node status by hand.",
        ref: "NodePanel.tsx",
      },
      ai: MISSING("No agent proposes plan changes from live performance."),
    },
  },
  {
    id: "analyze->plan",
    from: "analyze",
    to: "plan",
    label: "reality check",
    gaps: ["G-RECONCILE-UI"],
    pipes: {
      code: {
        state: "partial",
        note: "plan_node -> web_page reconciliation exists (realizes / migrates_from) but is thin and has no scheduled run.",
        ref: "aidream/aidream/services/content_plan/reconciler.py",
      },
      human: {
        state: "live",
        note: "Tree, table, and map keep an always-on bottom drift bar; every count opens the repair sheet, and the table carries the shared Alignment verdict.",
        ref: "ai-matrx/features/marketing/content-plan/components/ContentPlanWorkbench.tsx",
      },
      ai: MISSING("No agent dispositions orphan URLs."),
    },
  },
];

// ---------------------------------------------------------------------------
// GAPS — never delete an id; close it with evidence.
// ---------------------------------------------------------------------------

export const GAPS: LoopGap[] = [
  {
    id: "G-PUBLISH-CRAWL",
    title: "Publishing a page tells nobody",
    severity: "blocker",
    status: "closed",
    at: "serve->crawl",
    breaks: ["code"],
    detail:
      "CLOSED AND RUNNING 2026-08-13. aidream deployed; web_announce is called from cms/pages.py on publish and from system_task_runner.py for the reconcile sweep. Live-verified at 244 successful runs: recent sweeps announced pages with zero errors. The AI crawl pipe remains honestly missing because no agent tool starts or reads a crawl.",
    lane: "L1",
    evidence: "aidream/aidream/services/web_announce/",
  },
  {
    id: "G-CRAWL-SCHEDULE",
    title: "No UI can set a site's crawl cadence",
    severity: "major",
    status: "closed",
    at: "crawl",
    breaks: ["human"],
    detail:
      "CLOSED 2026-08-11. The writer half shipped: CrawlScheduleCard in the new-crawl workspace (plus CrawlScheduleSummary in SiteOverview) creates, edits, and toggles a site's recurring schedule directly through crawl-schedule-service.ts with guardedUpdate version CAS. aidream migration 0322 is applied and ledgered: authenticated has column-scoped INSERT/UPDATE for intent columns plus version, while dispatcher lease/outcome columns stay server-only. Every save clears next_run_at so the dispatcher recomputes the occurrence from the new cadence. Verified live with a schedule row written from the card. Still open elsewhere: historical dispatcher failures and the AI pipe (no agent tool starts or reads a crawl).",
    lane: "L1",
    evidence:
      "ai-matrx/features/marketing/components/crawls/CrawlScheduleCard.tsx",
  },
  {
    id: "G-SITEMAP",
    title: "Live sites emit no sitemap.xml and no robots.txt",
    severity: "major",
    status: "closed",
    at: "publish->serve",
    breaks: ["code"],
    detail:
      "CLOSED AND LIVE-VERIFIED 2026-08-12: https://www.mymatrx.com/c/prp-injection-md/sitemap.xml returns 200 and robots.txt serves a correct per-host Sitemap line. STILL ABSENT and deliberately not claimed closed here: any IndexNow or Search Console submit ping on publish — that is a new gap if wanted, not this one.",
    lane: "L1",
    evidence: "my-matrx/lib/render/sitemap.js",
  },
  {
    id: "G-COLLECTIONS",
    title: "Collections render client-side only — invisible to crawlers",
    severity: "major",
    status: "closed",
    at: "serve",
    breaks: ["code"],
    detail:
      "CLOSED 2026-08-11. my-matrx expands <template data-matrx-collection> bindings server-side in loadSitePageProps (collectionBindings.js scan+expand, ssrBindings.js fetch) through the same public_read / public_read_fields gate as the HTTP route, with renderer-owned escaping. Ordering is configurable — ?order= / data-order -> site_collections.settings.default_order -> created_at:desc (the old default, unchanged) — DB-side with a stable id tiebreak, sort fields restricted to readable ones. PROOF: curl of /c/dev-website/events-and-booking with no JS returns 'Open house (Sep 3)' above 'Herbal workshop (Sep 17)' with internal_notes absent; 19 live iopbm + prp-injection-md pages render byte-identically before/after; 207 render-layer tests pass. Remaining (separate, W2C-render-binding): data-filter, MatrxData.render(), and aidream + matrx-frontend still hardcoding -created_at.",
    lane: "L1",
    evidence: "my-matrx/lib/render/collectionBindings.js",
  },
  {
    id: "G-FINDING-ASSIST",
    title: "Findings never reach the assists ledger",
    severity: "major",
    status: "closed",
    at: "analyze->suggest",
    breaks: ["code", "ai"],
    detail:
      "CLOSED 2026-08-13; coverage corrected the same day. The first close proved real ledger writes but only after FindingsAssistStrip rendered: produceFindingAssists lived in useEffect behind a once-per-site/browser-session guard. Live Matrx Main therefore had 5,506 findings and six rows created at page-open times. The canonical producer is now private.sweep_marketing_finding_assists(), scheduled every 15 minutes: group by site + check, rank severity/scope/recency, cap at three undecided groups per site, stable key 'seo.finding_rollup.<check>:<siteId>:site', supersede stale groups. FINAL POST-DEPLOY PROOF: 24 ledger rows — 18 current sweep groups with 18 distinct keys, exactly three each across six actionable sites; five render-era rows superseded; one dismissal retained. Scheduled runs at 00:45 and 01:00 UTC succeeded and the latter absorbed a newly analyzed site without a page visit. Clicking still only expands; explicit 'Review findings' navigates. Rows are personal and addressed to web.site.created_by by design.",
    lane: "L2",
    evidence:
      "ai-matrx/features/marketing/components/analysis/FindingsAssistStrip.tsx",
  },
  {
    id: "G-FINDING-TRACK",
    title: "A user cannot act on a finding",
    severity: "major",
    status: "closed",
    at: "suggest",
    breaks: ["human"],
    detail:
      "CLOSED. features/marketing/data/finding-mutations.ts ships acknowledge / unacknowledge / resolve / reopen / suppress / unsuppress, bulk verbs, and whole-check suppression, wired into FindingDetail and the findings table.",
    lane: "L2",
    evidence: "ai-matrx/features/marketing/data/finding-mutations.ts",
  },
  {
    id: "G-FINDING-FIX",
    title: "No path from a finding to a fixed page",
    severity: "blocker",
    status: "closed",
    at: "suggest->writeback",
    breaks: ["code", "ai"],
    detail:
      "CLOSED 2026-08-13, all three pipes. AI: scripts/seed_finding_fixer.py now creates the purpose-built system agent seo_finding_fixer_v1, seeds + activates its two Content-IR kinds, and pins slot seo.finding_fixer; finding_fix.py joined DECLARING_MODULES and is reachable at POST /seo/findings/draft-fix (durable streamed command, proposes only — no write path). CODE: planDeterministicFix + buildFindingFixEvidence draft the derivable class with zero model calls, and the findings assist producer upgrades those chips to the apply_page_meta action. HUMAN: FindingFixCard on every finding shows before/after plus risks behind one Apply-as-a-draft button. All three land through applyFindingFix -> updatePageIntent + executeCmsPush — the existing seams — writing draft twins only. Nothing publishes; THE 301 LAW holds (no route is ever moved, no CMS page created).",
    lane: "L2",
    evidence:
      "ai-matrx/features/marketing/components/analysis/FindingFixCard.tsx",
  },
  {
    id: "G-SUGGEST-FORK",
    title: "Three parallel suggestion systems",
    severity: "major",
    status: "in-progress",
    at: "suggest",
    breaks: ["code", "human", "ai"],
    detail:
      "ABSORB COMPLETE AND SHIPPED; RETIREMENT DELIBERATELY BLOCKED. The seven absorbed columns on platform.assists were DDL-only — no client read or wrote one — and are now live end to end: the evidence receipt on the card, first_seen_at + occurrences (a re-notice counts and never moves the first sighting), the resolved status with resolveAssistsByDedupeKeys() so a condition that went away closes itself, decision_note, is_starred and viewed_at with a flag column, unseen dot and filters in the /assists manager. THE CAPABILITY INVENTORY is written in features/assists/FEATURE.md — every capability of kg-suggestions and of web.finding's offer layer, each judged better / equal / not yet. NOTHING WAS RETIRED, and that is the method working: thirteen capabilities are still uncovered. The remaining gaps include producer-level suppression (dismissal is per dedupe_key, so silencing a whole check means dismissing every chip one at a time), per-record chips (entity_type/entity_id are on the ledger with no selector), and an rpc action kind for kg-suggestions' accept semantics. Assists are personal and addressed to one user by design; that is not a gap. Also settled here: web.finding's domain half is NOT a fork and is not being absorbed (the analyzer owns detection; only the offer layer moved), and extend.wbx_seo_audit is NOT dead — it is a registered canonical entity with zero consumers, i.e. unfinished work under policies/unfinished-work-alarm.md, so deleting it is forbidden.",
    lane: "L2",
    evidence: "ai-matrx/features/assists/FEATURE.md",
  },
  {
    id: "G-TEMPLATE",
    title: "Realized pages are empty — template_map is never read",
    severity: "major",
    status: "closed",
    at: "brief->realize",
    breaks: ["code"],
    detail:
      "CLOSED 2026-08-13. aidream deployed. content_plan/templates.py is a library layer over plan.profile.template_map with a real resolution chain, consumed by four modules (routers/content_plan.py, content_plan/service.py, cms_fill.py, cms_reconciler.py): cms_reconciler scaffolds html_content/css_content on create and cms_fill treats a scaffold as unfilled. Production no longer realizes empty drafts.",
    lane: "L3",
    evidence: "aidream/aidream/services/content_plan/templates.py",
  },
  {
    id: "G-CMS-IDENTITY",
    title: "CMS pages join to measurement by route string",
    severity: "major",
    status: "closed",
    at: "crawl->measure",
    breaks: ["code"],
    detail:
      "CLOSED 2026-08-13, both halves. (1) THE ID: client_pages.web_page_id (CMS migration 0037) carries the web.page a CMS page serves — the plan_node_id pattern applied to the measurement half, unique per site so a measured URL has exactly one CMS page. NOT an association edge: client_pages lives in the separate CMS Postgres, so it has no canonical entity token and an edge to it could never be validated or reaped. ONE writer each side (page_service.set_web_page_link / the /api/cms/pages set-web-page-link action, both ownership-checked and activity-logged; the column is absent from every generic update field list). resolvePushTarget now resolves by id first, exact route key second, and a case-insensitive alias only when it names exactly ONE candidate — and it never reuses a page linked to a different measured page. Proven live against both databases: with the crawler recording /About/, /Services/Service-1 and /contact?utm_source=nav, the raw-string join landed on the RIGHT page 1 of 3 (one silent WRONG PAGE, one silent miss) while the id join resolved 3 of 3, and the unique index refused a second claim. (2) THE TWIN: the fifth route comparer (normalizeRoutePath) is deleted — pageRouteKey is the only one — and the TS half now runs the same url-identity-rules.json fixture as matrx-scraper, byte-identical and SHA-256-pinned in both suites, with pnpm check:url-identity failing on a one-sided edit before either suite runs.",
    lane: "L3",
    evidence: "aidream/db/migrations/cms/0037_client_page_web_page_link.sql",
  },
  {
    id: "G-STALENESS",
    title: "Nothing ever marks a page as needing an update",
    severity: "major",
    status: "in-progress",
    at: "writeback->plan",
    breaks: ["code", "ai"],
    detail:
      "EXISTS, REACHABLE, DEPLOYED, AND EXERCISED; NOT PRODUCED. plan_signal_sweep is enabled and has succeeded 19/19 times, but every run flipped 0 nodes, no plan.node is needs-update, and three sites are skipped every day because their vertical is ambiguous. The AI pipe remains missing.",
    lane: "L4",
  },
  {
    id: "G-PLAN-STATUS",
    title: "plan_status has no enforced state machine",
    severity: "major",
    status: "closed",
    at: "writeback->plan",
    breaks: ["code"],
    detail:
      "CLOSED 2026-08-13 — the split is healed. plan._status_flow_guard enforces transitions live (migrations 0326/0327/0328), and the service half that cooperates with it now ships and is deployed: content_plan/service.py:383 reads status_override_reason as the audited escape hatch and refuses it when no status change accompanies it. Code and trigger agree again.",
    lane: "L4",
    evidence: "aidream/aidream/services/content_plan/service.py",
  },
  {
    id: "G-RECONCILE-UI",
    title: "Plan-vs-reality is always visible and actionable",
    severity: "minor",
    status: "closed",
    at: "analyze->plan",
    breaks: ["code", "human", "ai"],
    detail:
      "CLOSED 2026-08-13 — ContentPlanWorkbench mounts PlanDriftBar as the bottom status line on tree, table, and map, with no editor-shifting top block. usePlanReality auto-runs read-only on workspace open and caches the report; explicit Sync is the write run. Every count opens PlanDriftSheet, whose real repairs dry-run before apply through bridgeAdopt / bridgeResolveConflict / bridgeRealize / bridgePublish. PlanNodesTable consumes the same drift model in its sortable/filterable Alignment column. Browser-proven on datadestruction.com across tree + node editor, table, and pillar map: the bar reported 4 draft-only pages and 541 crawl-only URLs; a real Create-page repair previewed, applied, returned a one-change receipt, and refreshed the row from not-built to draft-only. The same pass exposed and pinned the Home route invariant so displayed conflicts agree with the server.",
    lane: "L4",
    evidence:
      "ai-matrx/features/marketing/content-plan/components/ContentPlanWorkbench.tsx",
  },
  {
    id: "G-RESEARCH-TRIGGER",
    title: "Research cannot be started by code or by an agent",
    severity: "major",
    status: "closed",
    at: "research",
    breaks: ["code", "ai"],
    detail:
      "CLOSED AND RUNNING 2026-08-13. aidream deployed. Both pipes live: aidream/tools/research_tool.py exposes research_run(action='start') for the AI pipe, and research_refresh_dispatch drives the scheduled lane. Live-verified: the task is enabled with 486 runs / 2 failures.",
    lane: "L5",
    evidence: "aidream/aidream/tools/research_tool.py",
  },
  {
    id: "G-PIPE-SELECTOR",
    title: "No 'one step, three pipes' primitive",
    severity: "blocker",
    status: "closed",
    at: "plan",
    breaks: [],
    detail:
      "CLOSED 2026-08-13 — all three legs run live. aidream/services/workflow_pipe_ai_runner.py installs the AI leg at boot (api/app.py, beside install_subgraph_resolver/install_plan_resolver); it runs the step's AI leg through the ONE slot funnel (run_slot) or the registered ai.agent.start node, never a bespoke LLM call, and validates the result against the step's own contract. First real step migrated: aidream/workflows/growth_loop_page_route_v1.py — the plan stage's 'choose this page's URL', previously code-only slugification in services/content_plan/concepts.py. PROVEN by a real run (scripts/run_growth_loop_page_route.py): code -> 'emergency-roof-repair-in-tampa' via text.slug; human -> interrupt carrying the schema + a frozen 3600s escalation deadline, resumed with the owner's answer; ai -> 'emergency-roof-repair-tampa' + reason from a real Page URL Chooser agent run on slot content_plan.route_picker. growth_loop/pipes.py is the POLICY half (never an executor): node_policy_for() expresses a loop stage's policy in the node's own PipePolicy shape so the two can't drift.",
    lane: "L5",
    evidence: "aidream/aidream/services/workflow_pipe_ai_runner.py",
  },
  {
    id: "G-HUMAN-TIMEOUT",
    title: "No timed human-to-AI escalation",
    severity: "major",
    status: "closed",
    at: "plan",
    breaks: ["human", "ai"],
    detail:
      "CLOSED AND RUNNING 2026-08-13. decide_for_absent_human finally has a caller: services/human_decisions/sweeper.py runs on the sch_* spine as the 30s system task 'human_decision_escalation' (migration 0346, handler-gated like every other sweep). One tick: scan interrupted runs that declared an escalation, put the 'a workflow is waiting on you' chip in front of the person, defer until the FROZEN deadline passes, claim with a lease, let the declared fallback decide, resume through the queued worker with matrx_decision provenance stamped on the answer. THE HUMAN ALWAYS WINS — the resume goes through the same atomic interrupted->running claim the HTTP route uses, so a person who answers mid-escalation keeps their decision and the AI's is discarded. Live-verified end to end against Matrx Main: a real human_input with escalation{after_seconds:300, fallback:agent} was noticed, deferred for the full 5 minutes, escalated by the platform decider, resumed and completed, with the outcome in platform.activity_log (workflow_decision.escalated) and on the run row. Defaults unchanged (growth_loop/pipes.py default_policy: human first, AI at 3600s, realize/serve/crawl/measure pinned to CODE).",
    lane: "L5",
    evidence: "aidream/aidream/services/human_decisions/",
  },
  {
    id: "G-ORCHESTRATOR",
    title: "No end-to-end run object",
    severity: "blocker",
    status: "in-progress",
    at: "research",
    breaks: ["ai"],
    detail:
      "HUMAN AND CODE PIPES CLOSED 2026-08-13; AI remains. THE ROOT CAUSE, for the record: 3,209 lines landed on 2026-08-11 (aidream 7505afdf6, the stale-machine rescue) and were dead for two days because app.py mounts 138 routers and growth_loop was the one never added. Routes supplied (13 at /api/growth-loop/*, authed), and a real UI drives them: a site owner starts the loop, sees its stage and blocker, and continues/skips/pauses it at /marketing/brands/[brandId]/sites/[siteId]/growth-loop. CODE now records every post-brief stage that has a genuine backend event: realize (cms_align), fill (cms_fill job), publish (the one CMS page publish path), crawl + analyze (the scraper host seam), and measure (claimed PageSpeed / GA4 collection runs). Each attempt points at its own durable store; migration 0347 added cms_page and seo_collection_run as registry rows, never columns. Live PBW Law loop proof: events 8-21 completed all six with real CMS page, fill-job, crawl-session, SEO-collection-run, and immutable-analysis-result pointers. Three honest absences remain: serve has no aidream-side visitor event; suggest is produced client-side by findings-assists-producer; write-back is client-side applyFindingFix -> updatePageIntent + executeCmsPush, while Python finding_fix deliberately proposes only. The remaining AI gap is not recording — no supervisor hands a stage to a pipe.step run (G-SUPERVISOR).",
    lane: "L6",
    evidence: "ai-matrx/features/growth-loop/run/",
  },
  {
    id: "G-ORCHESTRATOR-READ",
    title: "The loop's own tables are unreadable from a browser",
    severity: "minor",
    status: "closed",
    at: "research",
    breaks: ["human"],
    detail:
      "CLOSED 2026-08-13 — growth is in PostgREST only after the safety gate landed: v_loop_state runs as security_invoker, canonical component RLS makes stage/event reads follow the parent loop, svc_all is service_role-only, and anon has no growth-schema access. A real creator sees their run (1 loop / 3 stages / 7 events); a real unrelated non-admin with no target-org membership sees 0 / 0 / 0. The live REST API stayed healthy after the config reload, and run/api.ts now reads state/history direct from Supabase while orchestration actions remain on aidream.",
    lane: "L6",
    evidence: "ai-matrx/migrations/growth_orchestrator_read.sql",
  },
  {
    id: "G-SUPERVISOR",
    title: "No supervisor agent over the stages",
    severity: "major",
    status: "open",
    at: "plan",
    breaks: ["ai"],
    detail:
      "The general primitive now EXISTS and is shipped: agent_sets supervisor mode exposes each set member as a tool of an orchestrator agent. What is still missing is the specific thing — no declared slot supervises loop stages, judges stage completion, or hands off; growth_loop completion is caller-asserted through the API, never agent-judged.",
    lane: "L6",
  },
  {
    id: "G-CRAWL-DUAL",
    title: "Two crawl worlds",
    severity: "minor",
    status: "closed",
    at: "crawl",
    breaks: ["code"],
    detail:
      "CLOSED on the backend: the legacy scraper world is gone from origin — scraper_admin.py deleted, services/scraper/ emptied, api/routers/scraper.py reduced to a re-export of matrx_scraper, and the registered dispatcher drives the modern web.crawl_schedule. Frontend residue is tracked separately (permissions registry + generated types still expose the dead scraper schema).",
    lane: "L1",
    evidence: "aidream/aidream/services/scraper_client/__init__.py",
  },
  {
    id: "G-MEASURE-SCHEDULE",
    title: "GA4 never refreshes itself",
    severity: "minor",
    status: "in-progress",
    at: "measure",
    breaks: ["code"],
    detail:
      "BOTH HANDLERS NOW LIVE AND BOTH FAILING. Verified 2026-08-13: GA4 shipped and its task is enabled — and has failed 2 of 2 runs with the swallowed message '3 site syncs failed' (a count where the per-site cause must be). PageSpeed regressed hard: 267 runs / 155 failed (58%), up from 49/13, and 90 of those failures are TWO page ids retried forever on terminal PSI verdicts (NO_FCP, FAILED_DOCUMENT_REQUEST) — a poison-pill loop, not a systemic break; 16 more are 'runner cancelled before completion' (the ten-minute budget). Scheduling is solved; error handling is not. Separately, SitePerformanceWorkspace reads an automation field the backend does not return.",
    lane: "L1",
  },
];

// ---------------------------------------------------------------------------
// LANES — what different agents can build at the same time without colliding.
// ---------------------------------------------------------------------------

export const LANES: Lane[] = [
  {
    id: "L1",
    label: "Close the publish -> crawl break",
    rationale:
      "Everything downstream is starved until a published page announces itself and crawls run on a cadence. Touches CMS publish, my-matrx discovery surfaces, and crawl scheduling.",
    repos: ["aidream", "my-matrx", "db"],
    dependsOn: [],
  },
  {
    id: "L2",
    label: "Make findings actionable",
    rationale:
      "One vehicle for suggestions, a finding->assist producer, a user-drivable finding lifecycle, and the fix agent an accepted assist launches.",
    repos: ["ai-matrx", "aidream", "db"],
    dependsOn: [],
  },
  {
    id: "L3",
    label: "Page identity and templates",
    rationale:
      "Give a CMS page a durable identity across projects and give realize a template so pages are not born empty. Both are about what a page IS.",
    repos: ["aidream", "ai-matrx", "db"],
    dependsOn: [],
  },
  {
    id: "L4",
    label: "Staleness and plan truth",
    rationale:
      "Cadence-driven needs-update flips, the plan_status state machine, and surfacing plan-vs-reality drift. All read measurement and write plan.",
    repos: ["aidream", "ai-matrx", "db"],
    dependsOn: ["L1"],
  },
  {
    id: "L5",
    label: "THE THREE PIPES primitive",
    rationale:
      "One step with a swappable executor (code / human / AI), timed human->AI escalation, and an agent-callable entry for every stage that lacks one. This is the platform primitive the whole vision rests on — build it once, consume it everywhere.",
    repos: ["aidream", "ai-matrx"],
    dependsOn: [],
  },
  {
    id: "L6",
    label: "The loop run object and its supervisor",
    rationale:
      "One durable run spanning all twelve stages, watchable and resumable, plus the supervising agent. Needs the pipe primitive to exist first.",
    repos: ["aidream", "ai-matrx", "db"],
    dependsOn: ["L5"],
  },
];

// ---------------------------------------------------------------------------
// Derived helpers (pure — safe to import anywhere).
// ---------------------------------------------------------------------------

export const PIPES: Pipe[] = ["code", "human", "ai"];

export const PIPE_LABEL: Record<Pipe, string> = {
  code: "Code",
  human: "Human",
  ai: "AI",
};

export function stageById(id: string): LoopStage | undefined {
  return STAGES.find((s) => s.id === id);
}

export function gapsAt(id: string): LoopGap[] {
  return GAPS.filter((g) => g.at === id && g.status !== "closed");
}

/** Worst pipe state on an edge — drives edge colouring. */
export function edgeHealth(edge: LoopEdge): PipeState {
  const states = PIPES.map((p) => edge.pipes[p].state).filter(
    (s) => s !== "n/a",
  );
  if (states.includes("missing")) return "missing";
  if (states.includes("partial")) return "partial";
  return "live";
}

// ---------------------------------------------------------------------------
// PUBLIC VIEW — derived, never hand-written.
//
// 🚨 THE HONESTY GATE. The public page at /how-it-works renders capability
// ONLY from `state === "live"`. "partial" and "missing" produce NOTHING —
// they can never leak out as a promise. That is deliberate: a marketing page
// must not claim a capability this map records as unfinished, and the only
// way to make it claim one is to flip a pipe to "live" here, which rule 1 at
// the top of this file says requires a `ref` an auditor can open.
//
// Consequence, on purpose: a stage with no live pipe simply shows no
// capability chips. Do not add a fallback.
// ---------------------------------------------------------------------------

/** How a customer can make a step happen. Derived from a LIVE pipe only. */
export type PublicCapability = "you" | "ai" | "automatic";

export const PUBLIC_CAPABILITY: Record<
  PublicCapability,
  { pipe: Pipe; label: string; short: string }
> = {
  you: { pipe: "human", label: "You can do it yourself", short: "You" },
  ai: { pipe: "ai", label: "An AI agent can do it for you", short: "AI" },
  automatic: {
    pipe: "code",
    label: "It happens automatically",
    short: "Automatic",
  },
};

export const PUBLIC_CAPABILITIES: PublicCapability[] = [
  "you",
  "ai",
  "automatic",
];

export type PublicStage = LoopStage & { publicInfo: PublicStageInfo };

/** The stages cleared for public display, in loop order. */
export function publicStages(): PublicStage[] {
  return STAGES.filter((s): s is PublicStage => Boolean(s.publicInfo));
}

/** Only ways this step can ACTUALLY be run today. Never intent. */
export function publicCapabilities(stage: LoopStage): PublicCapability[] {
  return PUBLIC_CAPABILITIES.filter(
    (c) => stage.pipes[PUBLIC_CAPABILITY[c].pipe].state === "live",
  );
}

/**
 * Honest headline numbers for the public page: how many public stages you can
 * run yourself, how many an agent can run, how many run automatically.
 */
export function publicStanding(): { stages: number } & Record<
  PublicCapability,
  number
> {
  const stages = publicStages();
  const counts = { stages: stages.length, you: 0, ai: 0, automatic: 0 };
  for (const stage of stages) {
    for (const capability of publicCapabilities(stage)) counts[capability] += 1;
  }
  return counts;
}

export function loopScore(): {
  live: number;
  partial: number;
  missing: number;
  total: number;
} {
  let live = 0;
  let partial = 0;
  let missing = 0;
  for (const edge of EDGES) {
    for (const pipe of PIPES) {
      const state = edge.pipes[pipe].state;
      if (state === "live") live += 1;
      else if (state === "partial") partial += 1;
      else if (state === "missing") missing += 1;
    }
  }
  return { live, partial, missing, total: live + partial + missing };
}
