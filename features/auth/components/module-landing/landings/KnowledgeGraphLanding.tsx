import {
  Network,
  Spline,
  Search,
  Eye,
  GitBranch,
  Filter,
} from "lucide-react";
import {
  ModuleLanding,
  type ModuleCapability,
  type ModuleStep,
  type ModuleSubArea,
} from "@/features/auth/components/module-landing/ModuleLanding";

const CAPABILITIES: ModuleCapability[] = [
  {
    icon: Network,
    title: "Auto-extracted entities + edges",
    description:
      "Every doc, note, transcript, and chat the system ingests gets entities and relationships pulled out — people, orgs, products, claims, dates — and stitched into one live graph.",
  },
  {
    icon: Spline,
    title: "See clusters, gaps, blind spots",
    description:
      "Where is your knowledge dense? Where is it thin? The graph surfaces clusters and weak spots so you can see, at a glance, what your org actually knows.",
  },
  {
    icon: Eye,
    title: "Drill into source mentions",
    description:
      "Click any node and see every doc, page, paragraph that referenced it — with the snippet, the source, and a jump-to-context link.",
  },
  {
    icon: Filter,
    title: "Scope-aware filtering",
    description:
      "Filter the graph by scope, project, or department. Compare the knowledge map your finance team has against marketing's, find the gaps.",
  },
  {
    icon: Search,
    title: "Search the graph",
    description:
      "Look up entities by name or partial match. Find connections two or three hops away — the link between a client and a competitor mentioned once in 2023.",
  },
  {
    icon: GitBranch,
    title: "Wire it into agents",
    description:
      "Agents can query the graph as a tool — \"what do we know about X?\" returns a structured answer, not a vector search.",
  },
];

const STEPS: ModuleStep[] = [
  {
    number: "01",
    title: "Ingest content",
    description:
      "Upload docs, connect data stores, drop transcripts in. The pipeline extracts entities and edges automatically — no manual tagging.",
  },
  {
    number: "02",
    title: "Explore the canvas",
    description:
      "Pan, zoom, search, filter. Find the entity you care about, see what's connected, where it shows up, who else mentions it.",
  },
  {
    number: "03",
    title: "Use it as context",
    description:
      "Pin nodes as agent context, ask agents \"what do we know about X\", or just keep the graph open as an inventory of your org's knowledge.",
  },
];

const SUB_AREAS: ModuleSubArea[] = [
  {
    title: "Org-wide graph",
    status: "Live",
    href: "/knowledge/graph",
    items: [
      "Every entity, every doc",
      "Pan / zoom / search",
      "Source mention drill-down",
      "Edge weight + recency",
    ],
  },
  {
    title: "Scope-filtered views",
    status: "Live",
    items: [
      "Filter by scope or project",
      "Compare scope maps",
      "Per-scope density stats",
      "Permission-aware",
    ],
  },
  {
    title: "Suggestions + gaps",
    status: "Live",
    items: [
      "Auto-flagged weak clusters",
      "Suggested new scopes",
      "Accept / reject / defer",
      "Per-org coverage report",
    ],
  },
  {
    title: "Graph as agent tool",
    status: "Live",
    items: [
      "Callable from any agent",
      "Cited graph answers",
      "Multi-hop queries",
      "Replay-able trajectories",
    ],
  },
];

export default function KnowledgeGraphLanding() {
  return (
    <ModuleLanding
      surfaceId="landing:knowledge-graph"
      eyebrow="AI Matrx Knowledge Graph"
      eyebrowIcon={Network}
      headline="See what your org"
      headlineGradient="actually knows."
      description="Every doc, note, transcript, and conversation flows through entity extraction. The result is a live map of your org's knowledge — clusters, gaps, hubs, weak spots — visible at a glance, drillable to source, callable from any agent."
      primaryCtaHref="/sign-up?source=knowledge-graph-landing"
      primaryCtaLabel="Explore the Graph Free"
      workspaceHref="/knowledge/graph"
      workspaceLabel="Knowledge Graph"
      capabilitiesHeading="Knowledge made structural"
      capabilitiesDescription="Six capabilities turn your scattered content into a visible, queryable map."
      capabilities={CAPABILITIES}
      stepsDescription="From a pile of docs to a live, agent-queryable graph in three steps."
      steps={STEPS}
      subAreasHeading="Graph surfaces"
      subAreasDescription="Org-wide canvas, scope-filtered views, gap suggestions, agent-callable graph queries."
      subAreas={SUB_AREAS}
      finalCtaHeading="Stop guessing what your org knows"
      finalCtaDescription="A live map of every entity and relationship, drillable to source. Free to start, no credit card."
      relatedModules={["/knowledge", "/scopes", "/agent-context"]}
    />
  );
}
