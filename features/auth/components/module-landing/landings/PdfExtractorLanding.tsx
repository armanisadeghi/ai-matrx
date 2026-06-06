import {
  FileScan,
  FileText,
  Table2,
  Quote,
  Layers,
  Replace,
} from "lucide-react";
import {
  ModuleLanding,
  type ModuleCapability,
  type ModuleStep,
  type ModuleSubArea,
} from "@/features/auth/components/module-landing/ModuleLanding";

const CAPABILITIES: ModuleCapability[] = [
  {
    icon: FileText,
    title: "Layout-aware extraction",
    description:
      "Headers, paragraphs, tables, footnotes — preserved with their structure intact. Not raw text dumps that an agent has to puzzle out.",
  },
  {
    icon: Table2,
    title: "Tables come out as tables",
    description:
      "Cells, columns, headers, merged spans. Export as CSV, drop into a data table, or send straight to an agent for analysis.",
  },
  {
    icon: Quote,
    title: "Page-anchored citations",
    description:
      "Every chunk knows its page and bounding box. Agents cite \"page 4, paragraph 2\" — and the link jumps to the exact spot.",
  },
  {
    icon: Replace,
    title: "OCR when needed",
    description:
      "Scanned PDFs and image-only pages go through OCR automatically. Mixed documents (text + scans) get the right treatment per page.",
  },
  {
    icon: Layers,
    title: "Batch + RAG-ready",
    description:
      "Drop a folder of PDFs, get a structured corpus back. Feed straight into a knowledge data store for retrieval at scale.",
  },
];

const STEPS: ModuleStep[] = [
  {
    number: "01",
    title: "Drop the PDF",
    description:
      "One file, a folder, or a watched directory. The processor figures out what's text vs. scanned and routes accordingly.",
  },
  {
    number: "02",
    title: "Review the structure",
    description:
      "Verify section detection, table boundaries, OCR pages. Tweak chunking if needed; defaults are usually right.",
  },
  {
    number: "03",
    title: "Push into the rest of the platform",
    description:
      "Send to a knowledge store for RAG, to a data table for analysis, to a chat for inspection, or download as JSON / CSV.",
  },
];

const SUB_AREAS: ModuleSubArea[] = [
  {
    title: "Single-file extractor",
    status: "Live",
    href: "/tools/pdf-extractor",
    items: ["Drag-and-drop UI", "Live preview", "Tweak before export", "Save profiles"],
  },
  {
    title: "Batch processing",
    status: "Live",
    items: ["Folder upload", "Background workers", "Per-file status", "Bulk export"],
  },
  {
    title: "RAG ingest",
    status: "Live",
    items: ["Push to data store", "Auto-chunking", "Citation anchors", "Re-index on update"],
  },
  {
    title: "Tables → data",
    status: "Live",
    items: ["Detect tables", "Export CSV", "Push to /data", "Agent-callable"],
  },
];

export default function PdfExtractorLanding() {
  return (
    <ModuleLanding
      surfaceId="landing:pdf-extractor"
      eyebrow="AI Matrx PDF Studio"
      eyebrowIcon={FileScan}
      headline="PDFs that come out"
      headlineGradient="structured, cited, agent-ready."
      description="Layout-aware extraction, OCR when needed, tables as tables, every chunk anchored to its page. Drop a PDF in; get out a corpus your agents can search, cite, and analyze."
      primaryCtaHref="/sign-up?source=pdf-extractor-landing"
      primaryCtaLabel="Extract Your First PDF Free"
      workspaceHref="/tools/pdf-extractor"
      workspaceLabel="PDF Studio"
      capabilitiesHeading="Beyond pdf-to-text"
      capabilitiesDescription="Five capabilities turn PDFs from blobs of text into structured, cited, queryable content."
      capabilities={CAPABILITIES}
      stepsDescription="From a stack of PDFs to a queryable knowledge base in three steps."
      steps={STEPS}
      subAreasHeading="Extractor surfaces"
      subAreasDescription="Single-file, batch, RAG ingest, tables — every PDF flow under one roof."
      subAreas={SUB_AREAS}
      finalCtaHeading="Stop wrestling with PDFs"
      finalCtaDescription="Extract structure, not just text. Cite by page, query by content. Free to start, no credit card."
      relatedModules={["/rag/data-stores", "/files", "/data"]}
    />
  );
}
