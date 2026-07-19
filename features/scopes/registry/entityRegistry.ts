// features/scopes/registry/entityRegistry.ts
//
// THE single resolver that turns an entity token into everything a generic
// association UI needs to RENDER it and QUERY for it — with ZERO hardcoding in
// the components themselves.
//
//   const info = getEntityInfo("task");
//   info.label / info.labelPlural / info.Icon            ← display
//   info.schema / info.table / info.titleColumn          ← candidate query
//   info.ownerColumn / info.orgColumn                    ← row scoping
//
// Two inputs, merged:
//   1. The GENERATED registry `ENTITY_TYPE_METADATA` (mirrored 1:1 from
//      `platform.entity_types`) — the source of truth for `schema`, `table`,
//      `label`, `scopeable`, `category`. NEVER hand-maintained.
//   2. A thin FE-only OVERLAY below for the ONE thing the DB can't carry: a
//      Lucide `Icon` (a React component), plus the human `titleColumn` used to
//      read picker candidates. Add a token here ONCE and every association card,
//      picker and count grid picks it up.
//
// OWNERSHIP + ORG ARE CONVENTIONS, NOT PER-TOKEN CONFIG. Verified live across
// every cardable table after the 2026 schema reorg: each carries `created_by`
// (the author/owner) and `organization_id`. So those are constants here; a
// token only overrides them in the rare case its table diverges. This is why
// the old per-token `ownerColumn: "user_id"` was WRONG — `files.files` (and
// notes/tasks/projects/conversations) have NO `user_id` column, which is what
// produced the `column files.user_id does not exist` (42703) error.
//
// This is the canonical replacement for the bespoke, duplicated
// `features/organizations/resource-catalogue.ts` — that file re-lists schema /
// table / label / icon per kind by hand and drifts from the registry. New
// association surfaces consume THIS resolver, not that catalogue.

import type { LucideIcon } from "lucide-react";
import {
  AppWindow,
  AudioLines,
  Boxes,
  Building2,
  Database,
  FileCode2,
  FilePen,
  FileText,
  Folder,
  FolderGit2,
  FolderKanban,
  GitBranch,
  Layers,
  Layers3,
  LayoutTemplate,
  ListChecks,
  ListTodo,
  MessagesSquare,
  Mic,
  NotebookText,
  Sheet,
  Sparkles,
  Table,
  Tag,
  Webhook,
  Workflow,
  Zap,
} from "lucide-react";
import {
  ENTITY_TYPE_METADATA,
  isEntityTypeToken,
  type EntityTypeToken,
} from "@/types/generated/entity-types.generated";
import { listDataStoreCandidates } from "@/features/rag/service/dataStoreCandidates";

/**
 * The universal ownership column post-2026-reorg. Every first-class entity
 * table carries it; candidate reads scope to the current user with it.
 */
export const DEFAULT_OWNER_COLUMN = "created_by";
/** The universal org-scoping column. Every first-class entity table carries it. */
export const DEFAULT_ORG_COLUMN = "organization_id";

// ─── Content roles ──────────────────────────────────────────────────────────
// The knowledge-model grouping axis (docs/knowledge/scopeable_entities.md):
// every entity brings knowledge in (source), produces it (destination), does
// both (hybrid), operates on it without truth of its own (utility), or
// organizes other entities (container). Resource surfaces group by this.
// Rescued from the deprecated `features/organizations/resource-catalogue.ts`
// into the canonical registry — when `platform.entity_types` grows a
// `content_role` column, these assignments move into the generated metadata.

export type ContentRole =
  | "utility"
  | "source"
  | "destination"
  | "hybrid"
  | "container";

export interface ContentRoleMeta {
  id: ContentRole;
  /** Section heading. */
  title: string;
  /** One-line "what is this bucket". */
  tagline: string;
  /** Categorical accent classes (tint only — surfaces stay semantic). */
  accentText: string;
  accentBg: string;
  accentBar: string;
}

/** Ordered for display: capability, data-in, data-out, both, structure. */
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
    tagline: "Read from and written to.",
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

export function getContentRoleMeta(role: ContentRole): ContentRoleMeta {
  return CONTENT_ROLES.find((r) => r.id === role) ?? CONTENT_ROLES[2];
}

/**
 * FE-only presentation + query hints for an entity token. The icon is the one
 * thing `platform.entity_types` structurally cannot hold; `titleColumn` is the
 * human-readable column for the picker. Owner/org default to the conventions
 * above — only set the overrides for a table that genuinely diverges.
 */
export interface EntityOverlay {
  /** Lucide icon for tiles, chips and picker rows. */
  Icon: LucideIcon;
  /** Plural display label. Defaults to `${label}s` when omitted. */
  labelPlural?: string;
  /**
   * Column on the backing table that reads as a human title in the picker.
   * Omit when the entity has no single obvious title column — the candidate
   * picker then can't list it (e.g. containers like scope, whose candidates
   * come from the scope tree, not a generic table read).
   */
  titleColumn?: string;
  /** Override `DEFAULT_OWNER_COLUMN` only when this table diverges. */
  ownerColumn?: string | null;
  /** Override `DEFAULT_ORG_COLUMN` only when this table diverges. */
  orgColumn?: string | null;
  /** Build a route to open one record of this type (new-tab navigation). */
  hrefFor?: (id: string) => string;
  /** Knowledge-model grouping bucket. Defaults to `destination`. */
  contentRole?: ContentRole;
  /**
   * Candidate-source override for tokens whose backing table can't be read
   * client-side (e.g. `data_store` — the `rag` schema isn't PostgREST-exposed).
   * When set, pickers list candidates through this instead of the generic
   * table read. The function must resolve titles itself.
   */
  listCandidates?: (args: {
    search?: string;
    limit?: number;
  }) => Promise<
    { ok: true; data: { id: string; title: string }[] } | { ok: false; error: string }
  >;
}

// ─── The overlay table ──────────────────────────────────────────────────────
// Keyed by canonical token (the only set FK-valid for platform.associations).
// Keep entries terse — icon + titleColumn. `schema` / `table` / `label` come
// from the generated metadata; owner/org come from the conventions. ADDING A
// NEW CARD = one line here.
//
// Every token below is verified live against `platform.entity_types` +
// information_schema (schema/table/title column all confirmed). Non-canonical
// names (agent_app, picklist, website, canvas, research, sandbox) are
// deliberately ABSENT — they are not registered tokens, so they can never be a
// valid association edge endpoint.
const ENTITY_OVERLAY: Partial<Record<EntityTypeToken, EntityOverlay>> = {
  // ─── Agents / Apps / Skills (utilities) ───────────────────────────────────
  agent: {
    Icon: Webhook,
    labelPlural: "Agents",
    titleColumn: "name",
    contentRole: "utility",
    hrefFor: (id) => `/agents/${id}`,
  },
  agent_shortcut: {
    Icon: Zap,
    labelPlural: "Agent Shortcuts",
    titleColumn: "label",
    contentRole: "utility",
  },
  app: { Icon: AppWindow, labelPlural: "Agent Apps", titleColumn: "name", contentRole: "utility" },
  skill: { Icon: Sparkles, labelPlural: "Skills", titleColumn: "label", contentRole: "utility" },
  workflow: { Icon: Workflow, labelPlural: "Workflows", titleColumn: "name", contentRole: "utility" },
  content_template: {
    Icon: LayoutTemplate,
    labelPlural: "Content Templates",
    titleColumn: "label",
    contentRole: "utility",
  },

  // ─── Sources ──────────────────────────────────────────────────────────────
  file: {
    Icon: FileText,
    labelPlural: "Files",
    titleColumn: "file_name",
    contentRole: "source",
    hrefFor: (id) => `/files/f/${id}`,
  },
  folder: { Icon: Folder, labelPlural: "Folders", titleColumn: "folder_name", contentRole: "source" },
  transcript: {
    Icon: AudioLines,
    labelPlural: "Transcripts",
    titleColumn: "title",
    contentRole: "source",
  },
  dataset: {
    Icon: Table,
    labelPlural: "Datasets",
    titleColumn: "description",
    contentRole: "hybrid",
    hrefFor: (id) => `/data/${id}`,
  },
  workbook: {
    Icon: Sheet,
    labelPlural: "Workbooks",
    titleColumn: "description",
    contentRole: "hybrid",
    hrefFor: (id) => `/workbooks/${id}`,
  },
  // RAG knowledge store — the scope-gate for knowledge_search retrieval. `rag.*` is
  // NOT PostgREST-exposed, so deliberately NO titleColumn (a generic candidate
  // read would fail); stores list through the Python API via the registered
  // candidate source. Edges MUST stamp `label` = store name at attach time —
  // titles can't be re-read client-side.
  data_store: {
    Icon: Database,
    labelPlural: "Data Stores",
    contentRole: "source",
    listCandidates: listDataStoreCandidates,
  },
  studio_session: {
    Icon: Mic,
    labelPlural: "Audio Sessions",
    titleColumn: "title",
    contentRole: "source",
  },
  // ─── Code (canonical `code.*` entities — attachable to orgs, war rooms, etc.) ─
  code_file: {
    Icon: FileCode2,
    labelPlural: "Code Files",
    titleColumn: "name",
    contentRole: "source",
    hrefFor: (id) => `/code?tab=${encodeURIComponent(`code-file:${id}`)}`,
  },
  code_folder: {
    Icon: FolderGit2,
    labelPlural: "Code Folders",
    titleColumn: "name",
    contentRole: "container",
  },
  code_repository: {
    Icon: GitBranch,
    labelPlural: "Code Repositories",
    titleColumn: "name",
    contentRole: "container",
  },

  // ─── Outputs ────────────────────────────────────────────────────────────--
  note: {
    Icon: NotebookText,
    labelPlural: "Notes",
    titleColumn: "label",
    hrefFor: (id) => `/notes?active=${id}`,
    contentRole: "hybrid",
  },
  udt_document: {
    Icon: FileText,
    labelPlural: "Documents",
    titleColumn: "document_name",
    hrefFor: (id) => `/documents/${id}`,
    contentRole: "hybrid",
  },
  working_document: {
    Icon: FilePen,
    labelPlural: "Working Documents",
    titleColumn: "title",
    contentRole: "destination",
  },
  conversation: {
    Icon: MessagesSquare,
    labelPlural: "Conversations",
    titleColumn: "title",
    contentRole: "destination",
    hrefFor: (id) => `/chat/${id}`,
  },
  flashcard_set: {
    Icon: Layers,
    labelPlural: "Flashcard Sets",
    titleColumn: "title",
    contentRole: "destination",
  },
  quiz_session: {
    Icon: ListChecks,
    labelPlural: "Quizzes",
    titleColumn: "title",
    contentRole: "destination",
  },

  // ─── Workspaces (containers — also valid as cards) ─────────────────────────
  project: {
    Icon: FolderKanban,
    labelPlural: "Projects",
    titleColumn: "name",
    contentRole: "container",
  },
  task: {
    Icon: ListTodo,
    labelPlural: "Tasks",
    titleColumn: "title",
    hrefFor: (id) => `/tasks/${id}`,
    contentRole: "container",
  },

  // ─── Container display only (candidates come from the scope tree, not a
  //     generic table read — so NO titleColumn → not listable as candidates) ──
  scope: { Icon: Tag, labelPlural: "Scopes", contentRole: "container" },
  scope_type: { Icon: Layers3, labelPlural: "Scope Types", contentRole: "container" },
  organization: { Icon: Building2, labelPlural: "Organizations", contentRole: "container" },
};

/** Fallback icon when a token has no overlay entry yet. */
const DEFAULT_ICON: LucideIcon = Boxes;

/**
 * Fully-resolved entity descriptor — generated metadata + FE overlay, with safe
 * fallbacks so an un-overlaid token still renders (generic icon, derived
 * plural) even if it can't be queried for candidates yet.
 */
export interface EntityInfo {
  token: EntityTypeToken;
  label: string;
  labelPlural: string;
  /** Postgres schema of the backing table (from the generated registry). */
  schema: string;
  /** Backing table name (from the generated registry). */
  table: string;
  /** Title column for the picker, or null when none is registered. */
  titleColumn: string | null;
  /** Ownership column to scope candidate reads to the current user. */
  ownerColumn: string;
  /** Org-scoping column. */
  orgColumn: string;
  Icon: LucideIcon;
  hrefFor: ((id: string) => string) | null;
  scopeable: boolean;
  category: string | null;
  /** Knowledge-model grouping bucket (resource surfaces group by this). */
  contentRole: ContentRole;
  /** Candidate-source override (rag-backed tokens etc.); null = generic read. */
  listCandidates: EntityOverlay["listCandidates"] | null;
  /** True when a picker can list real candidates (title column OR override). */
  canListCandidates: boolean;
}

/**
 * Resolve a token to its full descriptor. Callers should pass `EntityTypeToken`
 * values; pass raw strings through `tryGetEntityInfo` instead.
 */
export function getEntityInfo(token: EntityTypeToken): EntityInfo {
  const meta = ENTITY_TYPE_METADATA[token];
  const overlay = ENTITY_OVERLAY[token];
  const labelPlural = overlay?.labelPlural ?? `${meta.label}s`;
  const titleColumn = overlay?.titleColumn ?? null;
  // `null` override means "this table has no such column"; `undefined` (the
  // common case) falls back to the convention.
  const ownerColumn =
    overlay?.ownerColumn === undefined
      ? DEFAULT_OWNER_COLUMN
      : (overlay.ownerColumn ?? "");
  const orgColumn =
    overlay?.orgColumn === undefined
      ? DEFAULT_ORG_COLUMN
      : (overlay.orgColumn ?? "");
  return {
    token,
    label: meta.label,
    labelPlural,
    schema: meta.schema,
    table: meta.table,
    titleColumn,
    ownerColumn,
    orgColumn,
    Icon: overlay?.Icon ?? DEFAULT_ICON,
    hrefFor: overlay?.hrefFor ?? null,
    scopeable: meta.scopeable,
    category: meta.category,
    contentRole: overlay?.contentRole ?? "destination",
    listCandidates: overlay?.listCandidates ?? null,
    canListCandidates:
      titleColumn !== null || overlay?.listCandidates !== undefined,
  };
}

/** Safe variant for raw strings (e.g. an edge's `otherType`). */
export function tryGetEntityInfo(token: string): EntityInfo | null {
  return isEntityTypeToken(token) ? getEntityInfo(token) : null;
}

// Reverse index: "schema.table" → canonical token (first registered token wins
// when several tokens share a physical table, e.g. context_item/context_value).
// Built once from the generated metadata — the ONE place a live (schema, table)
// pair resolves back to its entity, so surfaces that only know a raw table name
// (FK-reference panels, drift reports) render through the SAME canonical
// icon/label/role as everything else instead of a hand-maintained table map.
const TABLE_TO_TOKEN: Record<string, EntityTypeToken> = (() => {
  const m: Record<string, EntityTypeToken> = {};
  for (const token of Object.keys(ENTITY_TYPE_METADATA) as EntityTypeToken[]) {
    const meta = ENTITY_TYPE_METADATA[token];
    const key = `${meta.schema}.${meta.table}`;
    if (!(key in m)) m[key] = token;
  }
  return m;
})();

/**
 * Resolve an entity descriptor from a live `(schema, table)` pair, or null when
 * that table backs no registered entity. Use this for surfaces keyed by raw
 * table name; token-keyed callers should use `getEntityInfo` directly.
 */
export function tryGetEntityInfoByTable(
  schema: string,
  table: string,
): EntityInfo | null {
  const token = TABLE_TO_TOKEN[`${schema}.${table}`];
  return token ? getEntityInfo(token) : null;
}

/** Tokens that currently have a picker-ready overlay (candidates listable). */
export function listableTokens(): EntityTypeToken[] {
  return (Object.keys(ENTITY_OVERLAY) as EntityTypeToken[]).filter((t) => {
    const o = ENTITY_OVERLAY[t];
    return o?.titleColumn != null || o?.listCandidates !== undefined;
  });
}
