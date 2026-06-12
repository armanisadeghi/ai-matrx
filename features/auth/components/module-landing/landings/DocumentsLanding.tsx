import {
  FileText,
  Layers,
  Type,
  Upload,
  History,
  Pencil,
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
    title: "Real documents, in your browser",
    description:
      "Paragraphs, headings, lists, tables, images — the rich-text surface you expect, with cloud collaboration built in from the start.",
  },
  {
    icon: Type,
    title: "Word-grade formatting",
    description:
      "Fonts, sizes, colors, alignment, line spacing, page setup. Headers, footers, page numbers. The detail layer professional writing needs.",
  },
  {
    icon: Layers,
    title: "Realtime, multi-user editing",
    description:
      "Co-author with teammates and agents at the same time. Live cursors, presence, permission-aware — the doc travels, the ACL stays.",
  },
  {
    icon: Upload,
    title: "Round-trip with DOCX",
    description:
      "Drop in Word documents; export back out without losing structure. Compatible with the wider professional ecosystem.",
  },
  {
    icon: History,
    title: "Autosave + snapshots",
    description:
      "Every edit saved. Pin named snapshots before rewrites; roll back to any prior state from the version history.",
  },
];

const STEPS: ModuleStep[] = [
  {
    number: "01",
    title: "Create or import",
    description:
      "Blank document, a template, or drag in an existing DOCX. Spin-up is instant; nothing to install.",
  },
  {
    number: "02",
    title: "Write like Word, ship like the cloud",
    description:
      "Format, structure, link — the familiar rich-text surface, just always synced across every device and teammate.",
  },
  {
    number: "03",
    title: "Share, hand off, ship",
    description:
      "Share with your team, an agent, or an external collaborator. Export back to DOCX for stakeholders who still live in Word.",
  },
];

const SUB_AREAS: ModuleSubArea[] = [
  {
    title: "My documents",
    status: "Live",
    href: "/documents",
    items: ["Create + open", "Per-document permissions", "Pinned + recent", "Org-shared"],
  },
  {
    title: "DOCX import / export",
    status: "Coming soon",
    items: ["Drag-and-drop DOCX", "Structure preserved", "Lossless round-trip", "Markdown import"],
  },
  {
    title: "Realtime collaboration",
    status: "Live",
    items: ["Live cursors", "Comment threads", "Permission-aware", "External invites"],
  },
  {
    title: "Documents API",
    status: "Coming soon",
    items: ["Programmatic snapshots", "Webhook on save", "Agent-callable", "Org-scoped keys"],
  },
];

export default function DocumentsLanding() {
  return (
    <ModuleLanding
      surfaceId="landing:documents"
      eyebrow="AI Matrx Documents"
      eyebrowIcon={Pencil}
      headline="Documents that"
      headlineGradient="travel with the rest of your work."
      description="Rich-text documents with real formatting, realtime co-editing, and full version history. Lives next to your chats, agents, and tasks — the writing stays, the surface around it gets a lot smarter."
      primaryCtaHref="/sign-up?source=documents-landing"
      primaryCtaLabel="Start a Document Free"
      workspaceHref="/documents"
      workspaceLabel="Documents"
      capabilitiesHeading="Word-grade writing, browser-grade collaboration"
      capabilitiesDescription="Five capabilities under every document — rich-text, formatting, realtime, DOCX import/export, autosave + snapshots."
      capabilities={CAPABILITIES}
      stepsDescription="From an empty page (or an imported DOCX) to a shared, live document in three steps."
      steps={STEPS}
      subAreasHeading="Document surfaces"
      subAreasDescription="Write, import, collaborate, ship — every document flow in one place."
      subAreas={SUB_AREAS}
      finalCtaHeading="Documents without the email attachments"
      finalCtaDescription="A real document that lives where your team and agents already work. Free to start, no credit card."
      relatedModules={["/workbooks", "/notes", "/files"]}
    />
  );
}
