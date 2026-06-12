import {
  Table,
  MessageSquare,
  Filter,
  Share2,
  Workflow,
  FileSpreadsheet,
} from "lucide-react";
import {
  ModuleLanding,
  type ModuleCapability,
  type ModuleStep,
  type ModuleSubArea,
} from "@/features/auth/components/module-landing/ModuleLanding";

const CAPABILITIES: ModuleCapability[] = [
  {
    icon: MessageSquare,
    title: "Build a table from chat",
    description:
      "Describe what you want in plain English. The agent designs the schema, picks types, fills in seed rows. You edit from there.",
  },
  {
    icon: Filter,
    title: "Spreadsheet-style editing",
    description:
      "Sort, filter, group, freeze columns. Bulk edit, formulas, type-safe cells. Familiar shortcuts where you expect them.",
  },
  {
    icon: Workflow,
    title: "Agent-callable as a tool",
    description:
      "Hand any table to an agent — it reads, writes, queries, and updates rows as part of its workflow. Tables become structured agent memory.",
  },
  {
    icon: FileSpreadsheet,
    title: "Import + export anything",
    description:
      "CSV, Excel, Google Sheets, JSON, Notion. Two-way sync where it makes sense. No copy-paste between tools.",
  },
  {
    icon: Share2,
    title: "Permission-aware sharing",
    description:
      "Per-row, per-column visibility. Share a table with an external collaborator without giving them access to the rest of your workspace.",
  },
];

const STEPS: ModuleStep[] = [
  {
    number: "01",
    title: "Make a table",
    description:
      "Describe it to chat, import a CSV, or start blank. Within seconds you have a structured surface to work with.",
  },
  {
    number: "02",
    title: "Edit + query like a spreadsheet",
    description:
      "Type rows in by hand, paste from anywhere, write formulas. Or hand the table to an agent to populate from a source.",
  },
  {
    number: "03",
    title: "Wire into the rest of your stack",
    description:
      "Use it as agent context, share with a teammate, sync to Google Sheets, or export for a presentation.",
  },
];

const SUB_AREAS: ModuleSubArea[] = [
  {
    title: "My tables",
    status: "Live",
    href: "/data",
    items: ["Create + edit", "Per-table permissions", "Version history", "Pinned + recent"],
  },
  {
    title: "Spreadsheet editor",
    status: "Live",
    href: "/data",
    items: ["Sort + filter", "Type-safe cells", "Formulas", "Bulk edit"],
  },
  {
    title: "Chat → table",
    status: "Live",
    items: ["Schema from prompt", "Auto-populate from source", "Refine via follow-ups", "Save as template"],
  },
  {
    title: "Sync + export",
    status: "Live",
    items: ["CSV / Excel / JSON", "Google Sheets sync", "Notion bridge (soon)", "Webhook updates"],
  },
];

export default function TablesLanding() {
  return (
    <ModuleLanding
      surfaceId="landing:tables"
      eyebrow="AI Matrx Tables"
      eyebrowIcon={Table}
      headline="Tables your agents"
      headlineGradient="can fill, read, and update."
      description="Build tables from chat, edit like a spreadsheet, query like a database. Hand any table to an agent and it becomes a structured surface the agent can read and write — memory with rows."
      primaryCtaHref="/sign-up?source=tables-landing"
      primaryCtaLabel="Create Your First Table Free"
      workspaceHref="/data"
      workspaceLabel="Tables"
      capabilitiesHeading="More than a spreadsheet, less than a database"
      capabilitiesDescription="Five capabilities turn ad-hoc rows into structured surfaces agents can actually work with."
      capabilities={CAPABILITIES}
      stepsDescription="From a vague idea to a structured, agent-callable table in three steps."
      steps={STEPS}
      subAreasHeading="Table surfaces"
      subAreasDescription="Manage tables, edit them, generate from chat, sync to external tools."
      subAreas={SUB_AREAS}
      finalCtaHeading="Structure without the database setup"
      finalCtaDescription="Tables that feel like spreadsheets and act like databases — built for agents. Free to start, no credit card."
      relatedModules={["/workbooks", "/chat", "/agents"]}
    />
  );
}
