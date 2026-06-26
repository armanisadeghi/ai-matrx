/**
 * Org Resource Catalogue
 * ----------------------
 * The single front-end source of truth for *what kinds of things* live inside
 * an organization and *how they should be presented* on the org workspace.
 *
 * This is the FE expression of the knowledge-system "content role" concept
 * (docs/knowledge/scopeable_entities.md → Source / Destination / Utility /
 * Container). The DB `shareable_resource_registry` does not yet carry a
 * `content_role` / `is_scopeable` column; when it does, this catalogue should
 * be generated from it. Until then it is curated here, deliberately, against
 * the "Include — high confidence" scopeable-entity list.
 *
 * Anything that wants to render, count, or let a user contribute an org
 * resource should read from this catalogue rather than re-listing entity types
 * inline. Add a new scopeable entity here ONCE and every org surface picks it
 * up: the role grouping, the count grid, and the "share your own" picker.
 */

import type { LucideIcon } from "lucide-react";
import {
  Webhook,
  AppWindow,
  Zap,
  Sparkles,
  Workflow,
  LayoutTemplate,
  Terminal,
  FileText,
  Table,
  List,
  Sheet,
  AudioLines,
  Globe,
  NotebookText,
  MessagesSquare,
  Layers,
  ListChecks,
  Frame,
  Microscope,
  FolderKanban,
  ListTodo,
} from "lucide-react";

/**
 * The four content roles. Mirrors the knowledge model: every entity either
 * brings knowledge in (source), produces knowledge (destination), operates on
 * it without truth of its own (utility), or organizes other entities
 * (container). This is the axis the org page groups by.
 */
export type ContentRole =
  | "utility"
  | "source"
  | "destination"
  | "hybrid"
  | "container";

export interface ContentRoleMeta {
  id: ContentRole;
  /** Friendly section heading. */
  title: string;
  /** One-line "what is this bucket" line under the heading. */
  tagline: string;
  /** Lucide accent classes — categorical tint only (surfaces stay semantic). */
  accentText: string;
  accentBg: string;
  accentBar: string;
}

/** Ordered for display: capability first, then data-in, data-out, structure. */
export const CONTENT_ROLES: ContentRoleMeta[] = [
  {
    id: "utility",
    title: "Utilities",
    tagline: "The agents and tools that act on your knowledge.",
    accentText: "text-violet-600 dark:text-violet-400",
    accentBg: "bg-violet-500/10",
    accentBar: "bg-violet-500",
  },
  {
    id: "source",
    title: "Sources",
    tagline: "Incoming sources of truth (Knowledge In).",
    accentText: "text-sky-600 dark:text-sky-400",
    accentBg: "bg-sky-500/10",
    accentBar: "bg-sky-500",
  },
  {
    id: "destination",
    title: "Outputs",
    tagline: "Knowledge your team produces.",
    accentText: "text-emerald-600 dark:text-emerald-400",
    accentBg: "bg-emerald-500/10",
    accentBar: "bg-emerald-500",
  },
  {
    id: "hybrid",
    title: "Sources & Outputs",
    tagline: "Source or Destination.",
    accentText: "text-teal-600 dark:text-teal-400",
    accentBg: "bg-teal-500/10",
    accentBar: "bg-gradient-to-r from-sky-500 to-emerald-500",
  },
  {
    id: "container",
    title: "Workspaces",
    tagline: "How work is organized.",
    accentText: "text-amber-600 dark:text-amber-400",
    accentBg: "bg-amber-500/10",
    accentBar: "bg-amber-500",
  },
];

export function getContentRole(role: ContentRole): ContentRoleMeta {
  return CONTENT_ROLES.find((r) => r.id === role) ?? CONTENT_ROLES[0];
}

export interface OrgResourceEntry {
  /** Stable key, used for React keys and lookups. */
  key: string;
  label: string;
  labelPlural: string;
  role: ContentRole;
  icon: LucideIcon;
  description: string;

  /**
   * Public-schema table used for the org-owned count
   * (`where organization_id = orgId`) and the contribute item query
   * (`where user_id = me`). Null = no directly-queryable public table (e.g. it
   * lives in another schema); only shared grants are counted.
   */
  table: string | null;
  /**
   * Non-`public` Postgres schema `table` lives in, if any. supabase-js reaches it
   * via `.schema(schemaName)`. Omitted ⇒ `public`. (Set for files after the 2026
   * restructure moved them to the `files` schema.)
   */
  schemaName?: string;
  hasOrgColumn: boolean;
  /** When set, owned-count excludes rows where this boolean column is true. */
  archivedColumn?: string;

  /**
   * The value stored in `permissions.resource_type` for grants of this kind —
   * i.e. the canonical table name. Drives the shared-with-org count and the
   * "contribute" share action (the `share_resource_with_org` RPC resolver
   * accepts canonical table names directly). Deliberately a plain string, not
   * the sharing `ResourceType` union: the DB shareable registry is broader than
   * the TS mirror, so the catalogue keys on the canonical name and stays
   * independent of which subset has been mirrored. Null = not shareable.
   */
  shareKey: string | null;
  /** Column to read for a human title in the contribute picker. */
  titleColumn: string | null;

  /**
   * Path segment under `/organizations/[slug]/` for the dedicated org list
   * page. Null = no dedicated org page yet (tile is informational + feeds the
   * contribute flow).
   */
  orgRoute: string | null;

  /** Can be tagged to a scope (per the knowledge model). Informational. */
  scopeable: boolean;

  /**
   * When true, list rows for this kind suppress the per-row icon (e.g. agents,
   * where every row would show the same generic bot glyph). The category tile
   * still shows the icon. Defaults to false.
   */
  hideRowIcon?: boolean;
}

/**
 * The curated catalogue. Keep entries grouped by role for readability; display
 * order within a role follows array order.
 */
export const ORG_RESOURCE_CATALOGUE: OrgResourceEntry[] = [
  // ─── Utilities ──────────────────────────────────────────────────────────
  {
    key: "agent",
    label: "Agent",
    labelPlural: "Agents",
    role: "utility",
    icon: Webhook,
    description: "Custom AI agents the team can run.",
    table: "agx_agent",
    hasOrgColumn: true,
    archivedColumn: "is_archived",
    shareKey: "agx_agent",
    titleColumn: "name",
    orgRoute: "prompts",
    scopeable: true,
    hideRowIcon: true,
  },
  {
    key: "agent_app",
    label: "Agent App",
    labelPlural: "Agent Apps",
    role: "utility",
    icon: AppWindow,
    description: "Packaged agent experiences — forms, chatbots, widgets.",
    table: "aga_apps",
    hasOrgColumn: true,
    shareKey: "aga_apps",
    titleColumn: "name",
    orgRoute: "agent-apps",
    scopeable: true,
  },
  {
    key: "agent_shortcut",
    label: "Shortcut",
    labelPlural: "Agent Shortcuts",
    role: "utility",
    icon: Zap,
    description: "One-click prompts and quick actions.",
    table: "agx_shortcut",
    hasOrgColumn: true,
    shareKey: null,
    titleColumn: "label",
    orgRoute: "shortcuts",
    scopeable: true,
  },
  {
    key: "skill",
    label: "Skill",
    labelPlural: "Skills",
    role: "utility",
    icon: Sparkles,
    description: "Reusable capabilities agents can call.",
    table: "skl_definitions",
    hasOrgColumn: true,
    shareKey: "skl_definitions",
    titleColumn: "label",
    orgRoute: null,
    scopeable: true,
  },
  {
    key: "workflow",
    label: "Workflow",
    labelPlural: "Workflows",
    role: "utility",
    icon: Workflow,
    description: "Multi-step automations across agents and tools.",
    table: "workflow",
    hasOrgColumn: true,
    shareKey: "workflow",
    titleColumn: "name",
    orgRoute: "workflows",
    scopeable: true,
  },
  {
    key: "content_template",
    label: "Content Template",
    labelPlural: "Content Templates",
    role: "utility",
    icon: LayoutTemplate,
    description: "Reusable content scaffolds and structures.",
    table: "content_template",
    hasOrgColumn: true,
    shareKey: "content_template",
    titleColumn: "label",
    orgRoute: "templates",
    scopeable: true,
  },
  {
    key: "sandbox",
    label: "Sandbox",
    labelPlural: "Sandboxes",
    role: "utility",
    icon: Terminal,
    description: "Isolated execution environments.",
    table: "sandbox_instances",
    hasOrgColumn: true,
    shareKey: "sandbox_instances",
    titleColumn: null,
    orgRoute: null,
    scopeable: true,
  },

  // ─── Sources ────────────────────────────────────────────────────────────
  {
    key: "file",
    label: "File",
    labelPlural: "Files",
    role: "source",
    icon: FileText,
    description: "Documents and uploads the team works from.",
    // Physical table is `files.files` after the 2026 restructure; queried via
    // `.schema("files")`. `shareKey` stays the canonical permissions key.
    table: "files",
    schemaName: "files",
    hasOrgColumn: true,
    // Canonical permissions key after the 2026 file-system canonicalization:
    // `'file'` (sent as `p_resource_type` to the share RPCs). Was `'cld_files'`.
    shareKey: "file",
    titleColumn: "file_name",
    orgRoute: "files",
    scopeable: true,
  },
  {
    key: "dataset",
    label: "Dataset",
    labelPlural: "Datasets",
    role: "hybrid",
    icon: Table,
    description: "Structured tables of org data.",
    table: "udt_datasets",
    hasOrgColumn: true,
    shareKey: "udt_datasets",
    titleColumn: "description",
    orgRoute: "tables",
    scopeable: true,
  },
  {
    key: "picklist",
    label: "List",
    labelPlural: "Lists",
    role: "source",
    icon: List,
    description: "Reusable option lists and picklists.",
    table: "udt_picklists",
    hasOrgColumn: false,
    shareKey: "udt_picklists",
    titleColumn: "description",
    orgRoute: null,
    scopeable: true,
  },
  {
    key: "workbook",
    label: "Workbook",
    labelPlural: "Workbooks",
    role: "hybrid",
    icon: Sheet,
    description: "Multi-sheet data workbooks.",
    table: "udt_workbooks",
    hasOrgColumn: true,
    shareKey: "udt_workbooks",
    titleColumn: "description",
    orgRoute: null,
    scopeable: true,
  },
  {
    key: "transcript",
    label: "Transcript",
    labelPlural: "Transcripts",
    role: "source",
    icon: AudioLines,
    description: "Audio / meeting transcripts.",
    table: "transcripts",
    hasOrgColumn: true,
    shareKey: "transcripts",
    titleColumn: "title",
    orgRoute: null,
    scopeable: true,
  },
  {
    key: "website",
    label: "Website",
    labelPlural: "Websites",
    role: "source",
    icon: Globe,
    description: "Tracked sites and scraped sources.",
    table: null,
    hasOrgColumn: false,
    shareKey: "scraper.sites",
    titleColumn: null,
    orgRoute: null,
    scopeable: true,
  },

  // ─── Outputs (Destinations) ─────────────────────────────────────────────
  {
    key: "note",
    label: "Note",
    labelPlural: "Notes",
    role: "hybrid",
    icon: NotebookText,
    description: "Written notes and docs the team produces.",
    table: "notes",
    hasOrgColumn: true,
    shareKey: "notes",
    titleColumn: "label",
    orgRoute: "notes",
    scopeable: true,
  },
  {
    key: "conversation",
    label: "Conversation",
    labelPlural: "Conversations",
    role: "destination",
    icon: MessagesSquare,
    description: "Saved agent chats.",
    table: "cx_conversation",
    hasOrgColumn: true,
    shareKey: "cx_conversation",
    titleColumn: "title",
    orgRoute: null,
    scopeable: true,
  },
  {
    key: "flashcard",
    label: "Flashcard Set",
    labelPlural: "Flashcards",
    role: "destination",
    icon: Layers,
    description: "Study cards generated from your content.",
    table: "flashcard_data",
    hasOrgColumn: true,
    shareKey: "flashcard_data",
    titleColumn: "topic",
    orgRoute: null,
    scopeable: true,
  },
  {
    key: "quiz",
    label: "Quiz",
    labelPlural: "Quizzes",
    role: "destination",
    icon: ListChecks,
    description: "Quizzes built from your knowledge.",
    table: "quiz_sessions",
    hasOrgColumn: true,
    shareKey: "quiz_sessions",
    titleColumn: "title",
    orgRoute: null,
    scopeable: true,
  },
  {
    key: "canvas",
    label: "Canvas",
    labelPlural: "Canvases",
    role: "destination",
    icon: Frame,
    description: "Artifacts and visual canvases.",
    table: "canvas_items",
    hasOrgColumn: true,
    archivedColumn: "is_archived",
    shareKey: "canvas_items",
    titleColumn: "title",
    orgRoute: null,
    scopeable: true,
  },
  {
    key: "research",
    label: "Research Topic",
    labelPlural: "Research",
    role: "destination",
    icon: Microscope,
    description: "Synthesized research topics.",
    table: "rs_topic",
    hasOrgColumn: false,
    shareKey: null,
    titleColumn: "name",
    orgRoute: null,
    scopeable: true,
  },

  // ─── Workspaces (Containers) ────────────────────────────────────────────
  {
    key: "project",
    label: "Project",
    labelPlural: "Projects",
    role: "container",
    icon: FolderKanban,
    description: "Grouped work with its own members and scope.",
    // Physical table is `workspace.projects` after the 2026 restructure; queried
    // via `.schema("workspace")`.
    table: "projects",
    schemaName: "workspace",
    hasOrgColumn: true,
    shareKey: null,
    titleColumn: "name",
    orgRoute: "projects",
    scopeable: true,
  },
  {
    key: "task",
    label: "Task",
    labelPlural: "Tasks",
    role: "container",
    icon: ListTodo,
    description: "Units of work, optionally tied to scopes.",
    // Physical table is `workspace.tasks` after the 2026 restructure; queried via
    // `.schema("workspace")`. `shareKey` is the canonical permissions key `'task'`.
    table: "tasks",
    schemaName: "workspace",
    hasOrgColumn: true,
    shareKey: "task",
    titleColumn: "title",
    orgRoute: "tasks",
    scopeable: true,
  },
];

/**
 * Entries a member can contribute via the share-your-own flow: needs a public
 * table to read the user's items from, a title column, and a shareable key.
 */
export function contributableEntries(): OrgResourceEntry[] {
  return ORG_RESOURCE_CATALOGUE.filter(
    (e) => e.shareKey !== null && e.table !== null && e.titleColumn !== null,
  );
}

export function entriesByRole(role: ContentRole): OrgResourceEntry[] {
  return ORG_RESOURCE_CATALOGUE.filter((e) => e.role === role);
}

export function getEntry(key: string): OrgResourceEntry | undefined {
  return ORG_RESOURCE_CATALOGUE.find((e) => e.key === key);
}

/** Canonical-table → entry lookup, for resolving a permissions grant's kind. */
export function getEntryByShareKey(
  shareKey: string,
): OrgResourceEntry | undefined {
  return ORG_RESOURCE_CATALOGUE.find((e) => e.shareKey === shareKey);
}

/**
 * Stable key used in `org_module_settings.module_key` (and matched by the
 * `share_resource_with_org` RPC). For shareable kinds this is the canonical
 * table name so the server can look it up directly; otherwise the public table
 * or the catalogue key.
 */
export function moduleKey(entry: OrgResourceEntry): string {
  return entry.table ?? entry.shareKey ?? entry.key;
}
