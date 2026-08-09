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
//   2. A thin FE-only OVERLAY below for things the DB cannot carry: Lucide
//      `Icon` components, client routes, plural labels, and exceptional
//      candidate loaders. Database-owned metadata is forbidden in the overlay.
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
  Contact,
  Database,
  FileCode2,
  FilePen,
  FileText,
  Folder,
  FolderGit2,
  FolderKanban,
  Frame,
  GitBranch,
  Globe,
  Layers,
  Layers3,
  LayoutTemplate,
  ListChecks,
  ListOrdered,
  Megaphone,
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
// `platform.entity_types.content_role` is the only per-entity authority.

export type ContentRole =
  "utility" | "source" | "destination" | "hybrid" | "container";

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

/** Runtime guard for the DB's free-text `content_role` column. */
export function isContentRole(value: string | null): value is ContentRole {
  return value !== null && CONTENT_ROLES.some((r) => r.id === value);
}

/**
 * FE-only presentation + query hints for an entity token. Database-owned
 * metadata (`title_column`, `content_role`, schema/table/label, etc.) is
 * deliberately absent. Owner/org default to the conventions above — only set
 * the overrides for a table that genuinely diverges.
 */
export interface EntityOverlay {
  /** Lucide icon for tiles, chips and picker rows. */
  Icon: LucideIcon;
  /** Plural display label. Defaults to `${label}s` when omitted. */
  labelPlural?: string;
  /** Override `DEFAULT_OWNER_COLUMN` only when this table diverges. */
  ownerColumn?: string | null;
  /** Override `DEFAULT_ORG_COLUMN` only when this table diverges. */
  orgColumn?: string | null;
  /** Build a route to open one record of this type (new-tab navigation). */
  hrefFor?: (id: string) => string;
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
    | { ok: true; data: { id: string; title: string }[] }
    | { ok: false; error: string }
  >;
}

// ─── The overlay table ──────────────────────────────────────────────────────
// Keyed by canonical token (the only set FK-valid for platform.associations).
// Keep entries terse — code-native presentation/action metadata only.
// `schema` / `table` / `label` / `titleColumn` / `contentRole` come from the
// generated DB metadata; owner/org come from the conventions. Adding a valid
// DB `content_role` makes an entity cardable; this overlay is optional polish.
//
// Every token below is verified live against `platform.entity_types` +
// information_schema (schema/table/title column all confirmed). Non-canonical
// names (agent_app, picklist, website, canvas, research, sandbox) are
// deliberately ABSENT — they are not registered tokens (`picklist` → use
// `structured_list`), so they can never be a valid association edge endpoint.
const ENTITY_OVERLAY: Partial<Record<EntityTypeToken, EntityOverlay>> = {
  // ─── Agents / Apps / Skills (utilities) ───────────────────────────────────
  agent: {
    Icon: Webhook,
    labelPlural: "Agents",
    hrefFor: (id) => `/agents/${id}`,
  },
  agent_shortcut: {
    Icon: Zap,
    labelPlural: "Agent Shortcuts",
    hrefFor: (id) => `/agents/shortcuts/${id}`,
  },
  app: {
    Icon: AppWindow,
    labelPlural: "Agent Apps",
    hrefFor: (id) => `/agent-apps/${id}`,
  },
  // `skill` and `workflow` have peeks but NO detail route anywhere in `app/`
  // (`/agent-connections/skills` is a list; workflows only appear nested under
  // an org). Until a detail route exists they stay peek-only — do not invent an
  // `hrefFor` that 404s. Tracked in docs/handoffs/inventory-law-sweep.md.
  skill: {
    Icon: Sparkles,
    labelPlural: "Skills",
  },
  workflow: {
    Icon: Workflow,
    labelPlural: "Workflows",
  },
  message_template: {
    Icon: LayoutTemplate,
    labelPlural: "Message Templates",
    hrefFor: (id) => `/settings/message-templates/${id}`,
  },
  // Pick Lists / user lists (`/lists`) — canonical token is structured_list
  // (legacy names picklist / udt_picklists / user_lists are dead).
  structured_list: {
    Icon: ListOrdered,
    labelPlural: "Lists",
    hrefFor: (id) => `/lists/${id}`,
  },

  // ─── Sources ──────────────────────────────────────────────────────────────
  file: {
    Icon: FileText,
    labelPlural: "Files",
    hrefFor: (id) => `/files/f/${id}`,
  },
  folder: {
    Icon: Folder,
    labelPlural: "Folders",
  },
  transcript: {
    Icon: AudioLines,
    labelPlural: "Transcripts",
    // Matches `primaryRowHref` for kind="transcript" in
    // features/transcripts/browse/types.ts — one open target, not two.
    hrefFor: (id) => `/transcripts/processor?focus=${encodeURIComponent(id)}`,
  },
  dataset: {
    Icon: Table,
    labelPlural: "Datasets",
    hrefFor: (id) => `/data/${id}`,
  },
  workbook: {
    Icon: Sheet,
    labelPlural: "Workbooks",
    hrefFor: (id) => `/workbooks/${id}`,
  },
  // RAG knowledge store — the scope-gate for knowledge_search retrieval.
  // Although the DB registry owns title_column='name', `rag.*` is not
  // PostgREST-exposed, so candidates list through the registered source.
  // Edges MUST stamp `label` = store name at attach time — titles can't be
  // re-read client-side.
  data_store: {
    Icon: Database,
    labelPlural: "Data Stores",
    listCandidates: listDataStoreCandidates,
  },
  studio_session: {
    Icon: Mic,
    labelPlural: "Audio Sessions",
  },
  // ─── Code (canonical `code.*` entities — attachable to orgs, war rooms, etc.) ─
  code_file: {
    Icon: FileCode2,
    labelPlural: "Code Files",
    hrefFor: (id) => `/code?tab=${encodeURIComponent(`code-file:${id}`)}`,
  },
  code_folder: {
    Icon: FolderGit2,
    labelPlural: "Code Folders",
  },
  code_repository: {
    Icon: GitBranch,
    labelPlural: "Code Repositories",
  },

  // ─── Outputs ────────────────────────────────────────────────────────────--
  note: {
    Icon: NotebookText,
    labelPlural: "Notes",
    hrefFor: (id) => `/notes?active=${id}`,
  },
  udt_document: {
    Icon: FileText,
    labelPlural: "Documents",
    hrefFor: (id) => `/documents/${id}`,
  },
  working_document: {
    Icon: FilePen,
    labelPlural: "Working Documents",
  },
  conversation: {
    Icon: MessagesSquare,
    labelPlural: "Conversations",
    hrefFor: (id) => `/chat/${id}`,
  },
  flashcard_set: {
    Icon: Layers,
    labelPlural: "Flashcard Sets",
  },
  // The row FlashcardPeek actually reads (education.flashcard_data). An
  // individual card has no standalone route — it is studied through its set.
  flashcard_data: {
    Icon: Layers,
    labelPlural: "Flashcards",
  },
  // A quiz SESSION (education.quiz_sessions) is a taking, not the quiz — the
  // `/education/quizzes/[id]` route keys on the ASSESSMENT id (see below).
  quiz_session: {
    Icon: ListChecks,
    labelPlural: "Quizzes",
  },
  assessment: {
    Icon: ListChecks,
    labelPlural: "Assessments",
    hrefFor: (id) => `/education/quizzes/${id}`,
  },
  canvas_item: {
    Icon: Frame,
    labelPlural: "Canvas Items",
    // No `hrefFor`: `/canvas/{id}` has NO route (only /canvas/discover and
    // /canvas/shared/[token]). Four callsites link there today and 404 —
    // FOUND_DEFECTS D137.
  },

  // ─── Workspaces (containers — also valid as cards) ─────────────────────────
  project: {
    Icon: FolderKanban,
    labelPlural: "Projects",
    hrefFor: (id) => `/projects/${id}`,
  },
  sandbox_instance: {
    Icon: Boxes,
    labelPlural: "Sandboxes",
    hrefFor: (id) => `/sandbox/${id}`,
  },
  task: {
    Icon: ListTodo,
    labelPlural: "Tasks",
    hrefFor: (id) => `/tasks/${id}`,
  },

  // ─── CRM (crm.party — the ONE record for an external person/company) ──────
  party: {
    Icon: Contact,
    labelPlural: "People & Companies",
    hrefFor: (id) => `/crm/${id}`,
  },
  crm_campaign: {
    Icon: Megaphone,
    labelPlural: "Campaigns",
    // No hrefFor yet — the campaign builder is a later wave; adding a route
    // here before it exists would mint dead links on every association card.
  },

  // ─── Web (canonical pages — the marketing page workspace anchors here) ────
  web_page: {
    Icon: Globe,
    labelPlural: "Canonical Pages",
    // hrefFor resolves the nested brand/site route via a tiny server redirect.
    hrefFor: (id) => `/marketing/pages/${id}`,
  },

  // ─── SEO (canonical keywords — Search Console watchlist targets) ──────────
  seo_keyword: {
    Icon: Tag,
    labelPlural: "Keywords",
  },

  // ─── Container display metadata ───────────────────────────────────────────
  scope: { Icon: Tag, labelPlural: "Scopes" },
  scope_type: {
    Icon: Layers3,
    labelPlural: "Scope Types",
  },
  organization: {
    Icon: Building2,
    labelPlural: "Organizations",
    hrefFor: (id) => `/organizations/${id}`,
  },
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
  const titleColumn = meta.titleColumn;
  const contentRole = isContentRole(meta.contentRole)
    ? meta.contentRole
    : "destination";
  if (!isContentRole(meta.contentRole)) {
    console.error(
      `[entityRegistry] "${token}" has invalid or missing content_role ` +
        `in platform.entity_types; using destination as a loud recovery.`,
    );
  }
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
    contentRole,
    listCandidates: overlay?.listCandidates ?? null,
    canListCandidates:
      titleColumn !== null || overlay?.listCandidates !== undefined,
  };
}

/**
 * Domain vocabularies that name a registered entity by a DIFFERENT string.
 *
 * A `kind` column written by another system is not automatically a canonical
 * token. The RAG/ingest pipeline (aidream) stamps `source_kind='cld_file'` on
 * `rag.kg_chunks` and `public.auto_ingest_batch` — the legacy name of the table
 * now called `files.files`, which IS the registry's `file`: same row, same id,
 * same `/files/f/{id}` route, same peek. A surface that hands the raw string to
 * `EntityRef` therefore loses open, new tab AND peek for exactly the file
 * batches, silently, while every other kind on the same screen works.
 *
 * This map lives HERE rather than beside a consumer because that is the whole
 * lesson of `PEEK_KEY_BY_TOKEN`: six private copies of "what is this thing
 * called" drifted independently and cost six peeks their Open door. One alias
 * table, one place to add the next one.
 *
 * Only add an entry you have VERIFIED points at the same physical row — an
 * alias that merely sounds related (`processed_document` is `docproc`, not
 * `udt_document`) fabricates a route, which is worse than no link at all.
 */
const TOKEN_ALIASES: Record<string, EntityTypeToken> = {
  cld_file: "file",
};

/**
 * Normalise a raw `kind`/`type` string onto its canonical entity token.
 * Returns the input unchanged when it is already canonical or unknown — the
 * caller's existing "no registry entry → plain text" path still applies.
 */
export function resolveEntityToken(raw: string): string {
  return TOKEN_ALIASES[raw] ?? raw;
}

/** Safe variant for raw strings (e.g. an edge's `otherType`). */
export function tryGetEntityInfo(token: string): EntityInfo | null {
  const canonical = resolveEntityToken(token);
  return isEntityTypeToken(canonical) ? getEntityInfo(canonical) : null;
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

/**
 * Tokens offered as reference "Allowed types" — DB-driven via
 * `platform.entity_types.reference_pickable` (admin-managed at
 * /administration/database/relationships/entity-types), no longer gated by the FE
 * overlay. A pickable token still needs a way to list candidates: a
 * `title_column` in the registry or an FE `listCandidates` override. A
 * pickable token with neither is a config defect — it is excluded and
 * screamed about, never silently shown broken.
 */
/**
 * Tokens the DB classifies as knowledge resources via a valid `content_role`.
 * This is the default set for association card grids, resource sections, and
 * attach pickers. The reference "Allowed types" chooser deliberately uses the
 * broader `listableTokens()` set instead.
 */
export function curatedTokens(): EntityTypeToken[] {
  return (Object.keys(ENTITY_TYPE_METADATA) as EntityTypeToken[]).filter((t) => {
    const meta = ENTITY_TYPE_METADATA[t];
    const o = ENTITY_OVERLAY[t];
    return (
      isContentRole(meta.contentRole) &&
      (meta.titleColumn != null || o?.listCandidates !== undefined)
    );
  });
}

export function listableTokens(): EntityTypeToken[] {
  return (Object.keys(ENTITY_TYPE_METADATA) as EntityTypeToken[]).filter(
    (t) => {
      const meta = ENTITY_TYPE_METADATA[t];
      if (!meta.referencePickable) return false;
      const o = ENTITY_OVERLAY[t];
      const canList =
        meta.titleColumn != null || o?.listCandidates !== undefined;
      if (!canList) {
        console.error(
          `[entityRegistry] "${t}" is reference_pickable in platform.entity_types ` +
            `but has NO title_column and no FE candidate source — set its ` +
            `title_column at /administration/database/relationships/entity-types.`,
        );
      }
      return canList;
    },
  );
}
