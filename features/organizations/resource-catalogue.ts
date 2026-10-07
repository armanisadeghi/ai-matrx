/**
 * Org Resource Catalogue  [DEPRECATED for display/association]
 * ============================================================
 *
 * ⚠️  DO NOT ADD NEW ENTRIES HERE FOR DISPLAY OR ASSOCIATION.
 *
 * The "what kinds of things exist + how to render/query them" concern (icon,
 * label, schema, table, title column, scopeable) is now CANONICAL in the entity
 * registry, generated 1:1 from `platform.entity_types`:
 *
 *     import { getEntityInfo } from "@/features/scopes/registry/entityRegistry";
 *     const info = getEntityInfo("file");   // schema/table/title/icon/owner/org
 *
 * That registry is the single source of truth. This catalogue hand-re-lists the
 * same facts and HAS DRIFTED (e.g. `workflow` → bare `public.workflow` instead
 * of `workflow.definition`; `agent_app` instead of the canonical `app` token;
 * `canvas_items`/`rs_topic` tables with no registered token) —
 * exactly the class of `PGRST205` / `42703` bugs the canonical system exists to
 * kill. The org workspace count grid no longer reads from here; it renders
 * `AssociationCard`s driven by the registry.
 *
 * IT ALSO DEFINES which kinds are Sources: the org page's Resources grid groups
 * these entries by `role`, and the Source input's "Use existing" offers exactly
 * the grid's "Sources" + "Sources & Outputs" entries (`sourceRoleEntries`). The
 * registry's `platform.entity_types.content_role` marks more kinds as source /
 * hybrid (Deals, People & Companies, Folders, Code Files, Rulebooks, Recordings,
 * Data Stores, Cloud documents, Saved sources…) — the grid's list wins (Arman,
 * 2026-09-30).
 *
 * AND IT PERSISTS for the legacy access-control / sharing
 * surface (`iam.permissions`). The `shareKey`, `contributableEntries`,
 * `getEntryByShareKey`, and `moduleKey` helpers feed the "share your own" /
 * org-grants UI, which is a DIFFERENT domain from content associations and has
 * not yet migrated. When that UI moves to a registry-resolved access-control
 * model, delete this file. Until then: read display/query metadata from
 * `getEntityInfo`, and touch this catalogue only for sharing.
 *
 * ── (original note, retained) ──
 * This is the FE expression of the knowledge-system "content role" concept
 * (common-docs/projects/knowledge-system/vision/scopeable_entities.md → Source / Destination / Utility /
 * Container). The DB `shareable_resource_registry` does not yet carry a
 * `content_role` / `is_scopeable` column; when it does, this catalogue should
 * be generated from it.
 */

import type { LucideIcon } from "lucide-react";
import {
  Webhook,
  AppWindow,
  Zap,
  Puzzle,
  Workflow,
  LayoutTemplate,
  Terminal,
  FileText,
  Table,
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
  IdCard,
  ListTodo,
  ListOrdered,
} from "lucide-react";
import type { EntityTypeToken } from "@ai-matrx/associations";

/**
 * `structured_list` left the entity registry (@ai-matrx/associations 0.13.135:
 * its table `workbench.udt_structured_lists` is gone — lists live in the record
 * store as pick lists). A module-level `getEntityInfo("structured_list")` threw
 * on import and took down every page that loads this catalogue (/notes,
 * 2026-10-02). The row's words are fixed here until the lists entry moves onto
 * the pick-list home; "Pick list" is the vocabulary word (Arman, 2026-10-02).
 */
const PICK_LIST_INFO = {
  label: "Pick list",
  labelPlural: "Pick lists",
  contentRole: "hybrid" as ContentRole,
  Icon: ListOrdered,
  scopeable: true,
};

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
  /**
   * The CANONICAL entity token for this kind (`platform.entity_types.token`).
   *
   * `key` above is this catalogue's own legacy vocabulary and does NOT match
   * the token for six kinds (`agent_app`→`app`, `sandbox`→`sandbox_instance`,
   * `flashcard`→`fc_set`, `quiz`→`quiz_session`, `canvas`→`canvas_item`,
   * `research`→`research_topic`). Surfaces that render these rows must resolve
   * routes, icons and peeks from the registry by TOKEN — keying off `key`
   * silently loses the door for exactly those six.
   *
   * `null` = no registered token maps cleanly (`website`: the entry is the
   * scraper's `scraper.sites` share key, not `web.site`), so registry lookups
   * must be skipped rather than guessed.
   */
  token: EntityTypeToken | null;
  label: string;
  labelPlural: string;
  role: ContentRole;
  icon: LucideIcon;
  description: string;

  /**
   * Table used for the org-owned count
   * (`where organization_id = orgId`) and the contribute item query
   * (owner column resolved from the canonical entity registry). Null = no
   * directly-queryable public table; only shared grants are counted.
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
  /** When set, the org's own rows exclude rows where this timestamp column is set (soft-deleted). */
  deletedAtColumn?: string;
  /**
   * THE RECORD STORE HOLDS THIS KIND (lane MOVER-DELETIONS, 2026-09-26). `"pick_lists"`: the
   * org's pick lists are Tables of choices in the record store, read from
   * `custom.organization_pick_lists` (features/data-tables/pick-lists/where-lists-live.ts), counted and listed
   * once per id.
   */
  alsoInTheNewSystem?: "pick_lists";
  /**
   * A kind with no registry token whose items a person holds as saved Sources
   * of this Sources-library kind group (`features/sources/sourceRows.ts`
   * `SOURCE_KIND_GROUP_KINDS`). Set on Websites: the Source input's "Use
   * existing" lists the web pages the person saved.
   */
  savedSourceGroup?: "web_page";
  /**
   * A kind with no registry token whose items the RECORD STORE holds: `"table"` (Datasets, read by
   * `custom.table_list_everywhere`) or `"pick_list"` (Pick lists, read by THE LIST INDEX). The Source
   * input's "Use existing" counts and lists it through those doors
   * (`features/resource-manager/source-input/recordStoreKinds.ts`).
   */
  recordStoreKind?: "table" | "pick_list";

  /**
   * The canonical entity token stored in `permissions.resource_type` for grants
   * of this kind. Drives the shared-with-org count and the "contribute" share
   * action. Deliberately a plain string, not
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
    token: "agent",
    label: "Agent",
    labelPlural: "Agents",
    role: "utility",
    icon: Webhook,
    description: "Custom AI agents the team can run.",
    // Physical table moved to `agent.definition` in the 2026 schema reorg.
    table: "definition",
    schemaName: "agent",
    hasOrgColumn: true,
    archivedColumn: "is_archived",
    shareKey: "agent",
    titleColumn: "name",
    orgRoute: "prompts",
    scopeable: true,
    hideRowIcon: true,
  },
  {
    key: "agent_app",
    token: "app",
    label: "Applet",
    labelPlural: "Applets",
    role: "utility",
    icon: AppWindow,
    description: "Packaged agent experiences — forms, chatbots, widgets.",
    // Physical table moved to `app.definition` in the 2026 schema reorg.
    table: "definition",
    schemaName: "app",
    hasOrgColumn: true,
    // Canonical resource_type is 'app' (DB + SHAREABLE_RESOURCE_REGISTRY); the
    // old drifted 'agent_app' FE key was deleted in the registry audit.
    shareKey: "app",
    titleColumn: "name",
    orgRoute: "applets",
    scopeable: true,
  },
  {
    key: "agent_shortcut",
    token: "agent_shortcut",
    label: "Shortcut",
    labelPlural: "Agent Shortcuts",
    role: "utility",
    icon: Zap,
    description: "One-click prompts and quick actions.",
    // Physical table moved to `agent.shortcut` in the 2026 schema reorg.
    table: "shortcut",
    schemaName: "agent",
    hasOrgColumn: true,
    shareKey: null,
    titleColumn: "label",
    orgRoute: "shortcuts",
    scopeable: true,
  },
  {
    key: "skill",
    token: "skill",
    label: "Skill",
    labelPlural: "Skills",
    role: "utility",
    icon: Puzzle,
    description: "Reusable capabilities agents can call.",
    // Physical table moved to `skill.definition` in the 2026 schema reorg;
    // queried via `.schema("skill")`. `shareKey` is the canonical permissions
    // key (resourceType `'skill'`) the share registry is keyed by.
    table: "definition",
    schemaName: "skill",
    hasOrgColumn: true,
    shareKey: "skill",
    titleColumn: "label",
    orgRoute: null,
    scopeable: true,
  },
  {
    key: "workflow",
    token: "workflow",
    label: "Workflow",
    labelPlural: "Workflows",
    role: "utility",
    icon: Workflow,
    description: "Multi-step automations across agents and tools.",
    table: "definition",
    schemaName: "workflow",
    archivedColumn: "is_archived",
    deletedAtColumn: "deleted_at",
    hasOrgColumn: true,
    shareKey: "workflow",
    titleColumn: "name",
    orgRoute: "workflows",
    scopeable: true,
  },
  {
    key: "message_template",
    token: "message_template",
    label: "Message Template",
    labelPlural: "Message Templates",
    role: "utility",
    icon: LayoutTemplate,
    description: "Reusable content scaffolds and structures.",
    table: "message_template",
    schemaName: "agent",
    deletedAtColumn: "deleted_at",
    hasOrgColumn: true,
    shareKey: "message_template",
    titleColumn: "label",
    orgRoute: "templates",
    scopeable: true,
  },
  {
    key: "sandbox",
    token: "sandbox_instance",
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
    token: "file",
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
    // No entity type backs a dataset any more (@ai-matrx/associations 0.13.135).
    token: null,
    label: "Table",
    labelPlural: "Tables",
    role: "hybrid",
    icon: Table,
    description: "Structured tables of org data.",
    // A table lives in the record store; the org's Tables page lists them (`orgRoute`).
    table: null,
    hasOrgColumn: false,
    recordStoreKind: "table",
    shareKey: null,
    titleColumn: null,
    orgRoute: "tables",
    scopeable: true,
  },
  {
    key: "structured_list",
    token: null,
    label: PICK_LIST_INFO.label,
    labelPlural: PICK_LIST_INFO.labelPlural,
    role: PICK_LIST_INFO.contentRole,
    icon: PICK_LIST_INFO.Icon,
    description: "Reusable, optionally grouped lists of editable option objects.",
    // A list lives in the record store as a Table of choices, read through
    // `custom.organization_pick_lists` (`alsoInTheNewSystem`).
    table: null,
    hasOrgColumn: false,
    alsoInTheNewSystem: "pick_lists",
    recordStoreKind: "pick_list",
    shareKey: "structured_list",
    titleColumn: null,
    orgRoute: null,
    scopeable: PICK_LIST_INFO.scopeable,
  },
  {
    key: "workbook",
    token: "workbook",
    label: "Workbook",
    labelPlural: "Workbooks",
    role: "hybrid",
    icon: Sheet,
    description: "Multi-sheet data workbooks.",
    table: "udt_workbooks",
    schemaName: "workbench",
    deletedAtColumn: "deleted_at",
    hasOrgColumn: true,
    shareKey: "udt_workbooks",
    titleColumn: "description",
    orgRoute: null,
    scopeable: true,
  },
  {
    key: "transcript",
    token: "transcript",
    label: "Transcript",
    labelPlural: "Transcripts",
    role: "source",
    icon: AudioLines,
    description: "Audio / meeting transcripts.",
    table: "transcripts",
    schemaName: "transcripts",
    deletedAtColumn: "deleted_at",
    hasOrgColumn: true,
    shareKey: "transcripts",
    titleColumn: "title",
    orgRoute: null,
    scopeable: true,
  },
  {
    key: "website",
    token: null,
    label: "Website",
    labelPlural: "Websites",
    role: "source",
    icon: Globe,
    description: "Tracked sites and scraped sources.",
    table: null,
    hasOrgColumn: false,
    shareKey: "scraper.sites",
    savedSourceGroup: "web_page",
    titleColumn: null,
    orgRoute: null,
    scopeable: true,
  },

  // ─── Outputs (Destinations) ─────────────────────────────────────────────
  {
    key: "note",
    token: "note",
    label: "Note",
    labelPlural: "Notes",
    role: "hybrid",
    icon: NotebookText,
    description: "Written notes and docs the team produces.",
    table: "notes",
    schemaName: "workbench",
    deletedAtColumn: "deleted_at",
    hasOrgColumn: true,
    shareKey: "notes",
    titleColumn: "label",
    orgRoute: "notes",
    scopeable: true,
  },
  {
    key: "conversation",
    token: "conversation",
    label: "Conversation",
    labelPlural: "Conversations",
    role: "destination",
    icon: MessagesSquare,
    description: "Saved agent chats.",
    table: "conversation",
    schemaName: "chat",
    hasOrgColumn: true,
    shareKey: "conversation",
    titleColumn: "title",
    orgRoute: null,
    scopeable: true,
  },
  {
    key: "flashcard",
    token: "fc_set",
    label: "Flashcard Deck",
    labelPlural: "Flashcard Decks",
    role: "destination",
    icon: Layers,
    description: "Study cards generated from your content.",
    table: "fc_set",
    schemaName: "education",
    deletedAtColumn: "deleted_at",
    hasOrgColumn: true,
    shareKey: "fc_set",
    titleColumn: "name",
    orgRoute: null,
    scopeable: true,
  },
  {
    key: "quiz",
    token: "quiz_session",
    label: "Quiz",
    labelPlural: "Quizzes",
    role: "destination",
    icon: ListChecks,
    description: "Quizzes built from your knowledge.",
    table: "quiz_sessions",
    schemaName: "education",
    deletedAtColumn: "deleted_at",
    hasOrgColumn: true,
    shareKey: "quiz_session",
    titleColumn: "title",
    orgRoute: null,
    scopeable: true,
  },
  {
    key: "canvas",
    token: "canvas_item",
    label: "Canvas",
    labelPlural: "Canvases",
    role: "destination",
    icon: Frame,
    description: "Artifacts and visual canvases.",
    table: "canvas_items",
    schemaName: "canvas",
    deletedAtColumn: "deleted_at",
    hasOrgColumn: true,
    archivedColumn: "is_archived",
    shareKey: "canvas_items",
    titleColumn: "title",
    orgRoute: null,
    scopeable: true,
  },
  {
    key: "research",
    token: "research_topic",
    label: "Research Topic",
    labelPlural: "Research",
    role: "destination",
    icon: Microscope,
    description: "Synthesized research topics.",
    table: "rs_topic",
    schemaName: "research",
    deletedAtColumn: "deleted_at",
    // rs_topic DOES carry organization_id (verified live 2026-06-27); the prior
    // `false` was stale catalogue drift.
    hasOrgColumn: true,
    shareKey: null,
    titleColumn: "name",
    orgRoute: null,
    scopeable: true,
  },

  // ─── People (HR) ─────────────────────────────────────────────────────────
  //
  // D6 / SPEC-UI-IA §6. Registered here — the one purpose this file is retained
  // for (its own header: "touch this catalogue only for sharing") — so
  // `OrgModuleSettings` renders an HR row like every other module. The display
  // and query metadata still resolves canonically: `token: "hr_employee"` IS a
  // registered `platform.entity_types` token, so `getEntityInfo("hr_employee")`
  // owns the icon, label, schema and route.
  //
  // 🚨 EVERY SHARING FIELD IS DELIBERATELY NULL, AND THAT IS THE POINT.
  //   `table: null`   — the `hr` schema is NOT exposed to PostgREST, so there is
  //                     no client-side count and there never will be. Every HR
  //                     read is an audited `public.hr_*` RPC.
  //   `shareKey: null` — HR access is governed by `hr.access_role` and the
  //                     sensitivity tiers, NOT by `iam.permissions`. Making an
  //                     employee record "shareable with the org" through the
  //                     generic grant machinery would route around the entire
  //                     access model. This must stay null.
  //   `scopeable: false` — a person is not tagged to a scope.
  {
    key: "hr_employee",
    token: "hr_employee",
    label: "Employee",
    labelPlural: "People",
    role: "container",
    icon: IdCard,
    description: "The people this organization employs, and their records.",
    table: null,
    hasOrgColumn: true,
    shareKey: null,
    titleColumn: null,
    orgRoute: "hr",
    scopeable: false,
  },

  // ─── Workspaces (Containers) ────────────────────────────────────────────
  {
    key: "project",
    token: "project",
    label: "Project",
    labelPlural: "Projects",
    role: "container",
    icon: FolderKanban,
    description: "Grouped work with its own members and scope.",
    // Physical table is `projects.projects` after the 2026 restructure; queried
    // via `.schema("projects")`.
    table: "projects",
    schemaName: "projects",
    hasOrgColumn: true,
    shareKey: null,
    titleColumn: "name",
    orgRoute: "projects",
    scopeable: true,
  },
  {
    key: "task",
    token: "task",
    label: "Task",
    labelPlural: "Tasks",
    role: "container",
    icon: ListTodo,
    description: "Units of work, optionally tied to scopes.",
    // Physical table is `projects.tasks` after the 2026 restructure; queried via
    // `.schema("projects")`. `shareKey` is the canonical permissions key `'task'`.
    table: "tasks",
    schemaName: "projects",
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

/**
 * The content roles a Source can come from: the Resources grid's "Sources" and
 * "Sources & Outputs" sections (Arman, 2026-09-30: "Just a list of the things
 * that are in either sources or sources and outputs").
 */
export const SOURCE_CONTENT_ROLES = ["source", "hybrid"] as const satisfies readonly ContentRole[];

/**
 * THE kinds a Source can be picked from — exactly the entries the organization
 * page's Resources grid shows under "Sources" and "Sources & Outputs", in the
 * grid's order (`CONTENT_ROLES` order, then catalogue order). The Source
 * input's "Use existing" reads this; the grid renders `entriesByRole` per role
 * — the same entries, so the two can never disagree.
 */
export function sourceRoleEntries(): OrgResourceEntry[] {
  const roles = new Set<ContentRole>(SOURCE_CONTENT_ROLES);
  return CONTENT_ROLES.filter((r) => roles.has(r.id)).flatMap((r) => entriesByRole(r.id));
}

export function getEntry(key: string): OrgResourceEntry | undefined {
  return ORG_RESOURCE_CATALOGUE.find((e) => e.key === key);
}

/** Canonical-token → entry lookup, for resolving a permissions grant's kind. */
export function getEntryByShareKey(
  shareKey: string,
): OrgResourceEntry | undefined {
  return ORG_RESOURCE_CATALOGUE.find((e) => e.shareKey === shareKey);
}

/**
 * Stable canonical entity token used in `platform.org_module_config.module_token`.
 * Bare physical table names are never module keys.
 */
export function moduleKey(entry: OrgResourceEntry): string {
  return entry.token ?? entry.shareKey ?? entry.key;
}
