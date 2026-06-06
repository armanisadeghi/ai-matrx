import {
  FileSpreadsheet,
  Layers,
  Sigma,
  Upload,
  Share2,
  History,
} from "lucide-react";
import {
  ModuleLanding,
  type ModuleCapability,
  type ModuleStep,
  type ModuleSubArea,
} from "@/features/auth/components/module-landing/ModuleLanding";

const CAPABILITIES: ModuleCapability[] = [
  {
    icon: FileSpreadsheet,
    title: "Lossless XLSX, in your browser",
    description:
      "Multi-sheet workbooks, formulas, conditional formatting, frozen rows — everything that survives the round-trip from Excel intact.",
  },
  {
    icon: Sigma,
    title: "Formulas that actually compute",
    description:
      "SUM, VLOOKUP, IF, INDEX/MATCH — the spreadsheet primitives you already know, recomputed live across sheets and references.",
  },
  {
    icon: Layers,
    title: "Realtime, multi-user editing",
    description:
      "Share with a colleague, see their cursor, watch edits flow. Permission-aware — your finance sheet stays out of the wrong hands.",
  },
  {
    icon: Upload,
    title: "Import / export anything",
    description:
      "Drop an XLSX or CSV in; export back out without losing structure. Round-trip works — keep using Excel where it makes sense.",
  },
  {
    icon: History,
    title: "Autosave + snapshots",
    description:
      "Every edit saved. Pin named snapshots before risky changes; roll back to any prior state from the version history.",
  },
];

const STEPS: ModuleStep[] = [
  {
    number: "01",
    title: "Create or import",
    description:
      "Blank workbook, template, or drag in an existing XLSX / CSV. Spin-up is instant; nothing to install.",
  },
  {
    number: "02",
    title: "Work like a spreadsheet",
    description:
      "Multi-sheet tabs, formulas across cells and sheets, formatting, freeze panes — the familiar surface, just always synced.",
  },
  {
    number: "03",
    title: "Share, hand off, ship",
    description:
      "Share with your team, an agent, or an external collaborator. Export back to XLSX for stakeholders who still live in Excel.",
  },
];

const SUB_AREAS: ModuleSubArea[] = [
  {
    title: "My workbooks",
    status: "Live",
    href: "/workbooks",
    items: ["Create + open", "Per-workbook permissions", "Pinned + recent", "Org-shared"],
  },
  {
    title: "XLSX / CSV import",
    status: "Live",
    href: "/workbooks",
    items: ["Drag-and-drop import", "Multi-sheet preserved", "Formula round-trip", "Lossless export"],
  },
  {
    title: "Realtime collaboration",
    status: "Live",
    items: ["Live cursors", "Comment threads", "Permission-aware", "External invites"],
  },
  {
    title: "Workbooks API",
    status: "Coming soon",
    items: ["Programmatic snapshots", "Webhook on save", "Agent-callable", "Org-scoped keys"],
  },
];

export default function WorkbooksLanding() {
  return (
    <ModuleLanding
      surfaceId="landing:workbooks"
      eyebrow="AI Matrx Workbooks"
      eyebrowIcon={FileSpreadsheet}
      headline="Spreadsheets that"
      headlineGradient="travel with the rest of your work."
      description="Lossless XLSX, multi-sheet, formulas, realtime editing, history. Workbooks live next to your chats, agents, and tasks — the numbers stay the same, the surface around them gets a lot smarter."
      primaryCtaHref="/sign-up?source=workbooks-landing"
      primaryCtaLabel="Start a Workbook Free"
      workspaceHref="/workbooks"
      workspaceLabel="Workbooks"
      capabilitiesHeading="Excel-grade math, browser-grade collaboration"
      capabilitiesDescription="Five capabilities under every workbook — lossless XLSX, real formulas, realtime, import/export, autosave + snapshots."
      capabilities={CAPABILITIES}
      stepsDescription="From an empty sheet (or an imported XLSX) to a shared, live workbook in three steps."
      steps={STEPS}
      subAreasHeading="Workbook surfaces"
      subAreasDescription="Build, import, collaborate, ship — every spreadsheet flow in one place."
      subAreas={SUB_AREAS}
      finalCtaHeading="Excel without the email attachments"
      finalCtaDescription="A real spreadsheet that lives where your team and agents already work. Free to start, no credit card."
      relatedModules={["/data", "/code", "/files"]}
    />
  );
}
