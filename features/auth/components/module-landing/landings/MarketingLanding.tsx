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
} from "@/features/auth/components/module-landing/ModuleLanding";
import { listMarketingLandingAreas } from "@/features/marketing/lib/marketing-nav";

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
      // DERIVED from MARKETING_PILLARS — this page cannot claim a pillar is
      // live when every surface in it is still reserved.
      subAreas={listMarketingLandingAreas()}
      finalCtaHeading="Stop stitching six tools together"
      finalCtaDescription="Crawler, page registry, content plan, keyword intelligence, and cost attribution in one platform. Free to start, no credit card."
      relatedModules={["/chat", "/agents", "/knowledge"]}
    />
  );
}
