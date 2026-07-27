import {
  BarChart3,
  Globe,
  Landmark,
  ListTree,
  Megaphone,
  Search,
} from "lucide-react";
import {
  ModuleLanding,
  type ModuleCapability,
  type ModuleStep,
  type ModuleSubArea,
} from "@/features/auth/components/module-landing/ModuleLanding";

const CAPABILITIES: ModuleCapability[] = [
  {
    icon: Landmark,
    title: "The brand is the anchor, not the URL",
    description:
      "Every tool hangs off a brand — its websites, social properties, assets, and confirmed business facts. Agencies run a hundred clients without a hundred disconnected dashboards.",
  },
  {
    icon: Globe,
    title: "Your own crawler and page registry",
    description:
      "Crawl a site, keep every page as a stable canonical record, and store each capture immutably. Audits, coverage gaps, and link graphs read from the same registry — nothing is re-derived per report.",
  },
  {
    icon: ListTree,
    title: "Plan every URL before you write it",
    description:
      "Pillars, clusters, briefs, keywords, and owners as an editable tree. You see, decide, and correct — agents do the bulk writing.",
  },
  {
    icon: Search,
    title: "Search intelligence, not just a keyword list",
    description:
      "AI keyword relationship mapping over live market volume, your real Search Console performance, backlink authority, and video source discovery.",
  },
  {
    icon: Megaphone,
    title: "Agents that act on it",
    description:
      "Every surface is registered so an agent knows what it is looking at — the crawl finding, the page, the brief, the keyword — and can work on it with you instead of being pasted context.",
  },
  {
    icon: BarChart3,
    title: "Cost attribution that goes to the page",
    description:
      "Every crawl, analysis, and AI run is priced and attributed back to a site, a page, and a client organization. You always know what a deliverable cost to produce.",
  },
];

const STEPS: ModuleStep[] = [
  {
    number: "01",
    title: "Add a brand and its sites",
    description:
      "Create the brand, add its websites, and connect Google, Bing, and other providers once. Bindings are reusable across every site under that brand.",
  },
  {
    number: "02",
    title: "Crawl, audit, and understand",
    description:
      "Run a crawl to build the canonical page registry, then read the audit rollup, coverage matrix, link graph, keywords, and backlinks over it.",
  },
  {
    number: "03",
    title: "Plan and publish against the gaps",
    description:
      "Turn findings into a content plan — pillars, clusters, briefs — then work the plan with agents and track what moves.",
  },
];

// Mirrors features/marketing/lib/marketing-nav.ts. Keep the two honest with
// each other: nothing here may claim "Live" that the hub marks coming soon.
const SUB_AREAS: ModuleSubArea[] = [
  {
    title: "Brands & Websites",
    status: "Live",
    href: "/marketing/brands",
    items: [
      "Brand cockpit + assets",
      "Crawls + canonical pages",
      "Audit + coverage",
      "Links + backlinks",
    ],
  },
  {
    title: "Strategy & Planning",
    status: "Live",
    href: "/marketing/content-plan",
    items: [
      "Content plan tree",
      "Briefs + keywords",
      "Campaigns (soon)",
      "Calendar + personas (soon)",
    ],
  },
  {
    title: "Discovery, Search & Visibility",
    status: "Live",
    href: "/marketing/keyword-research",
    items: [
      "Keyword research",
      "YouTube discovery",
      "Cross-site rank tracking (soon)",
      "AI visibility (soon)",
    ],
  },
  {
    title: "Content & Channels",
    status: "Coming soon",
    href: "/marketing/content-studio",
    items: [
      "Content studio",
      "Social publishing",
      "Email marketing",
      "Paid ads + outreach",
    ],
  },
  {
    title: "Market Intelligence",
    status: "Coming soon",
    href: "/marketing/competitors",
    items: [
      "Competitor tracking",
      "Share of voice",
      "Content + keyword gaps",
      "Brand monitoring",
    ],
  },
  {
    title: "Measurement",
    status: "Live",
    href: "/marketing/cost",
    items: [
      "Cost attribution",
      "Batch operations",
      "Cross-channel analytics (soon)",
      "Client reports (soon)",
    ],
  },
  {
    title: "SEO Tools",
    status: "Live",
    href: "/seo",
    items: [
      "Meta title + description",
      "Page audit",
      "Social preview",
      "Structured data + robots",
    ],
  },
  {
    title: "Data Connections",
    status: "Bring your own",
    href: "/marketing/connections",
    items: [
      "Google Search Console",
      "GA4 + PageSpeed",
      "Bing Webmaster",
      "DataForSEO",
    ],
  },
];

export default function MarketingLanding() {
  return (
    <ModuleLanding
      surfaceId="landing:marketing"
      eyebrow="AI Matrx for Marketing"
      eyebrowIcon={Megaphone}
      headline="Run marketing on"
      headlineGradient="one source of truth."
      description="A brand-first marketing platform with its own crawler, canonical page registry, content planner, and search intelligence — built so AI agents can do the work with you instead of guessing at pasted context."
      primaryCtaHref="/sign-up?source=marketing-landing"
      primaryCtaLabel="Start Free"
      workspaceHref="/marketing"
      workspaceLabel="Marketing"
      capabilitiesHeading="Built brand-first, not report-first"
      capabilitiesDescription="Most tools give you a dashboard. This gives you the underlying record — brands, sites, pages, snapshots, plans, keywords — that every dashboard, agent, and deliverable reads from."
      capabilities={CAPABILITIES}
      stepsDescription="From an empty workspace to a working plan in three steps."
      steps={STEPS}
      subAreasHeading="Every surface in the Marketing module"
      subAreasDescription="What is live today, and exactly what is reserved and on the way. Reserved URLs already exist — they will not move when the feature ships."
      subAreas={SUB_AREAS}
      finalCtaHeading="Stop stitching six tools together"
      finalCtaDescription="Crawler, page registry, content plan, keyword intelligence, and cost attribution in one platform. Free to start, no credit card."
      relatedModules={["/chat", "/agents", "/knowledge"]}
    />
  );
}
