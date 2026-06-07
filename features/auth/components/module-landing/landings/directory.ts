import type { LucideIcon } from "lucide-react";
import {
  MessageCircle,
  Webhook,
  FolderOpen,
  StickyNote,
  ListTodo,
  MessageSquare,
  AppWindow,
  Code2,
  Database,
  Layers,
  Container,
  FileScan,
  Table,
  Mic,
  BookOpen,
  FlaskConical,
  Aperture,
  FileSpreadsheet,
  Network,
} from "lucide-react";

/**
 * Single source of truth for the public "browse the platform" surface
 * at `/features`. Each entry maps a module landing route to its
 * marketing one-liner so the index page can render a grid of cards
 * without each landing exposing its own teaser API.
 *
 * Order is deliberate — hero modules first (Chat, Agents), then the
 * data and knowledge layer, then operations / dev tools, then
 * collaboration. Modules off this list aren't yet shipped as
 * standalone landings; add new entries as new landings come online.
 */
export interface ModuleLandingDirectoryEntry {
  /** Display name (used as card title). */
  label: string;
  /** Public marketing landing URL — guests can hit this without an account. */
  href: string;
  /** Lucide icon for the card header. */
  icon: LucideIcon;
  /** One-line teaser shown on the card body. */
  teaser: string;
  /** Optional grouping label for the grid section. */
  group: "Conversational" | "Knowledge & Data" | "Build & Run" | "Org & Context";
}

export const MODULE_LANDING_DIRECTORY: ModuleLandingDirectoryEntry[] = [
  // Conversational
  {
    label: "Chat",
    href: "/chat",
    icon: MessageCircle,
    teaser:
      "Agentic chat that runs research, drafts, calculations — and cites every source.",
    group: "Conversational",
  },
  {
    label: "Agents",
    href: "/agents",
    icon: Webhook,
    teaser:
      "Build, run, and share AI agents with tools, scopes, and a digital workforce mindset.",
    group: "Conversational",
  },
  {
    label: "Agent Apps",
    href: "/agent-apps",
    icon: AppWindow,
    teaser:
      "Wrap a powerful agent as a one-click form your team and clients actually use.",
    group: "Conversational",
  },
  {
    label: "Messages",
    href: "/messages",
    icon: MessageSquare,
    teaser:
      "DMs, group threads, external collaborators, and agents — all in one inbox.",
    group: "Conversational",
  },

  // Knowledge & Data
  {
    label: "Files",
    href: "/files",
    icon: FolderOpen,
    teaser:
      "A real-time file system for uploads, previews, sharing, and agent context.",
    group: "Knowledge & Data",
  },
  {
    label: "Notes",
    href: "/notes",
    icon: StickyNote,
    teaser:
      "Markdown notes pinned to scopes, searchable across your library, callable from chat.",
    group: "Knowledge & Data",
  },
  {
    label: "Knowledge",
    href: "/knowledge",
    icon: Database,
    teaser:
      "Typed data stores for retrieval — hybrid search, cited answers, scoped permissions.",
    group: "Knowledge & Data",
  },
  {
    label: "Knowledge Graph",
    href: "/knowledge/graph",
    icon: Network,
    teaser:
      "A live map of every entity and relationship across your org's content — drillable to source, agent-callable.",
    group: "Knowledge & Data",
  },
  {
    label: "Tables",
    href: "/data",
    icon: Table,
    teaser:
      "Spreadsheets you build from chat, edit by hand, and hand to agents as structured memory.",
    group: "Knowledge & Data",
  },
  {
    label: "Workbooks",
    href: "/workbooks",
    icon: FileSpreadsheet,
    teaser:
      "Lossless XLSX in the browser — multi-sheet, formulas, realtime, autosave + snapshots.",
    group: "Knowledge & Data",
  },
  {
    label: "PDF Studio",
    href: "/tools/pdf-extractor",
    icon: FileScan,
    teaser:
      "Layout-aware PDF extraction, OCR, tables-as-tables, page-anchored citations.",
    group: "Knowledge & Data",
  },
  {
    label: "Transcripts",
    href: "/transcription/processor",
    icon: Mic,
    teaser:
      "Speaker-attributed, multilingual transcripts with action items and summaries.",
    group: "Knowledge & Data",
  },
  {
    // Routes to the feature's own legacy landing (features/research/...);
    // pre-dates the `<ModuleLanding>` shell but still guest-safe.
    label: "Research",
    href: "/research",
    icon: FlaskConical,
    teaser:
      "Deep, cited research runs across the web, your docs, and your knowledge bases.",
    group: "Knowledge & Data",
  },

  // Build & Run
  {
    label: "Tasks",
    href: "/tasks",
    icon: ListTodo,
    teaser:
      "Tasks an agent can actually do — assign, run, intervene, replay.",
    group: "Build & Run",
  },
  {
    label: "Code",
    href: "/code",
    icon: Code2,
    teaser:
      "VSCode-style workspace where agents read, edit, and commit code alongside you.",
    group: "Build & Run",
  },
  {
    label: "Sandboxes",
    href: "/sandbox",
    icon: Container,
    teaser:
      "Linux containers your team and agents share. Spin up in seconds, persist for as long as needed.",
    group: "Build & Run",
  },
  {
    // Routes to the feature's own legacy landing (`app/(core)/images/
    // _components/ImagesLandingHero`); pre-dates the `<ModuleLanding>`
    // shell but still guest-safe.
    label: "Images",
    href: "/images",
    icon: Aperture,
    teaser:
      "Browse, generate, edit, annotate, convert — every image tool in one place.",
    group: "Build & Run",
  },

  // Org & Context
  {
    label: "Scopes",
    href: "/scopes",
    icon: Layers,
    teaser:
      "Model your team's dimensions — clients, repos, cases — and wire them into every action.",
    group: "Org & Context",
  },
  {
    label: "Context",
    href: "/agent-context",
    icon: BookOpen,
    teaser:
      "Typed broker slots, scoped defaults, full resolution traces — context that actually resolves.",
    group: "Org & Context",
  },
];

export const MODULE_LANDING_GROUPS: ReadonlyArray<
  ModuleLandingDirectoryEntry["group"]
> = ["Conversational", "Knowledge & Data", "Build & Run", "Org & Context"];
