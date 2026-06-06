import {
  Database,
  Search,
  FileText,
  Layers,
  Quote,
  RefreshCw,
} from "lucide-react";
import {
  ModuleLanding,
  type ModuleCapability,
  type ModuleStep,
  type ModuleSubArea,
} from "@/features/auth/components/module-landing/ModuleLanding";

const CAPABILITIES: ModuleCapability[] = [
  {
    icon: Database,
    title: "Data stores for every source",
    description:
      "Group PDFs, web pages, code repos, transcripts into named data stores. Agents query the right store for the right job — no global soup.",
  },
  {
    icon: Search,
    title: "Semantic + keyword search",
    description:
      "Hybrid retrieval that finds the relevant chunk whether you remember the exact phrase or just the gist. Every result ranks transparently.",
  },
  {
    icon: Quote,
    title: "Cited answers, every time",
    description:
      "Every agent reply pins back to the source document and the exact passage. Hand the citation to a colleague, jump straight to the paragraph.",
  },
  {
    icon: Layers,
    title: "Scoped to your team",
    description:
      "Permission-aware retrieval — sensitive docs stay invisible to people (and agents) who shouldn't see them. RLS enforced at the DB.",
  },
  {
    icon: RefreshCw,
    title: "Keep it fresh",
    description:
      "Auto-sync data stores from cloud drives, websites, GitHub repos. The knowledge base updates without anyone re-uploading PDFs.",
  },
];

const STEPS: ModuleStep[] = [
  {
    number: "01",
    title: "Create a data store",
    description:
      "Name it, scope it, set permissions. Upload files or connect a source (Drive, GitHub, a website).",
  },
  {
    number: "02",
    title: "Let agents query it",
    description:
      "Reference the data store from any agent. The agent picks relevant chunks per question and cites them in its answer.",
  },
  {
    number: "03",
    title: "Iterate as you learn",
    description:
      "Add new docs as they come in, retire stale ones, refine chunking. Quality climbs as the store matures.",
  },
];

const SUB_AREAS: ModuleSubArea[] = [
  {
    title: "Data stores",
    status: "Live",
    href: "/rag/data-stores",
    items: ["Create + manage", "Cloud + repo sync", "Permission scopes", "Stats + freshness"],
  },
  {
    title: "Search",
    status: "Live",
    href: "/rag/search",
    items: ["Hybrid retrieval", "Per-store filtering", "Result citations", "Save as agent context"],
  },
  {
    title: "Document library",
    status: "Live",
    href: "/rag/library",
    items: ["Every doc you've added", "Filter + sort", "Preview before retrieve", "Version history"],
  },
  {
    title: "Repositories",
    status: "Live",
    href: "/rag/repositories",
    items: ["Index your code", "Symbol-aware search", "Diff-aware updates", "PR-ready citations"],
  },
];

export default function KnowledgeLanding() {
  return (
    <ModuleLanding
      surfaceId="landing:knowledge"
      eyebrow="AI Matrx Knowledge"
      eyebrowIcon={Database}
      headline="Knowledge bases that"
      headlineGradient="actually answer the question."
      description="Group your docs, code, and reference material into named data stores. Agents query the right store for the right job, cite every source, and stay scoped to who's allowed to see what."
      primaryCtaHref="/sign-up?source=knowledge-landing"
      primaryCtaLabel="Build Your Knowledge Base Free"
      workspaceHref="/rag/data-stores"
      workspaceLabel="Knowledge"
      capabilitiesHeading="More than file upload + hope"
      capabilitiesDescription="Five capabilities that make retrieval actually work — typed stores, hybrid search, citations, scopes, freshness."
      capabilities={CAPABILITIES}
      stepsDescription="From scattered PDFs to a queryable, cited knowledge base in three steps."
      steps={STEPS}
      subAreasHeading="Knowledge surfaces"
      subAreasDescription="Stores, search, library, repos — every retrieval need under one roof."
      subAreas={SUB_AREAS}
      finalCtaHeading="Stop pasting docs into prompts"
      finalCtaDescription="Group your knowledge once, query it forever, cite every answer. Free to start, no credit card."
      relatedModules={["/files", "/tools/pdf-extractor", "/chat"]}
    />
  );
}
