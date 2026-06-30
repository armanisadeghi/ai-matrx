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
  FileText,
  Folder,
  FolderKanban,
  Layers,
  Layers3,
  LayoutTemplate,
  ListChecks,
  ListTodo,
  MessagesSquare,
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

/**
 * The universal ownership column post-2026-reorg. Every first-class entity
 * table carries it; candidate reads scope to the current user with it.
 */
export const DEFAULT_OWNER_COLUMN = "created_by";
/** The universal org-scoping column. Every first-class entity table carries it. */
export const DEFAULT_ORG_COLUMN = "organization_id";

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
  agent: { Icon: Webhook, labelPlural: "Agents", titleColumn: "name" },
  agent_shortcut: {
    Icon: Zap,
    labelPlural: "Agent Shortcuts",
    titleColumn: "label",
  },
  app: { Icon: AppWindow, labelPlural: "Agent Apps", titleColumn: "name" },
  skill: { Icon: Sparkles, labelPlural: "Skills", titleColumn: "label" },
  workflow: { Icon: Workflow, labelPlural: "Workflows", titleColumn: "name" },
  content_template: {
    Icon: LayoutTemplate,
    labelPlural: "Content Templates",
    titleColumn: "label",
  },

  // ─── Sources ──────────────────────────────────────────────────────────────
  file: { Icon: FileText, labelPlural: "Files", titleColumn: "file_name" },
  folder: { Icon: Folder, labelPlural: "Folders", titleColumn: "folder_name" },
  transcript: {
    Icon: AudioLines,
    labelPlural: "Transcripts",
    titleColumn: "title",
  },
  dataset: { Icon: Table, labelPlural: "Datasets", titleColumn: "description" },
  workbook: { Icon: Sheet, labelPlural: "Workbooks", titleColumn: "description" },

  // ─── Outputs ────────────────────────────────────────────────────────────--
  note: {
    Icon: NotebookText,
    labelPlural: "Notes",
    titleColumn: "label",
    hrefFor: (id) => `/notes?active=${id}`,
  },
  conversation: {
    Icon: MessagesSquare,
    labelPlural: "Conversations",
    titleColumn: "title",
  },
  flashcard_set: {
    Icon: Layers,
    labelPlural: "Flashcard Sets",
    titleColumn: "title",
  },
  quiz_session: {
    Icon: ListChecks,
    labelPlural: "Quizzes",
    titleColumn: "title",
  },

  // ─── Workspaces (containers — also valid as cards) ─────────────────────────
  project: {
    Icon: FolderKanban,
    labelPlural: "Projects",
    titleColumn: "name",
  },
  task: {
    Icon: ListTodo,
    labelPlural: "Tasks",
    titleColumn: "title",
    hrefFor: (id) => `/tasks/${id}`,
  },

  // ─── Container display only (candidates come from the scope tree, not a
  //     generic table read — so NO titleColumn → not listable as candidates) ──
  scope: { Icon: Tag, labelPlural: "Scopes" },
  scope_type: { Icon: Layers3, labelPlural: "Scope Types" },
  organization: { Icon: Building2, labelPlural: "Organizations" },
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
  /** True when a picker can list real candidates (needs a title column). */
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
    canListCandidates: titleColumn !== null,
  };
}

/** Safe variant for raw strings (e.g. an edge's `otherType`). */
export function tryGetEntityInfo(token: string): EntityInfo | null {
  return isEntityTypeToken(token) ? getEntityInfo(token) : null;
}

/** Tokens that currently have a picker-ready overlay (title column present). */
export function listableTokens(): EntityTypeToken[] {
  return (Object.keys(ENTITY_OVERLAY) as EntityTypeToken[]).filter(
    (t) => ENTITY_OVERLAY[t]?.titleColumn != null,
  );
}
