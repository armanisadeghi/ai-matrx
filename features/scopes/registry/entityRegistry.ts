// features/scopes/registry/entityRegistry.ts
//
// THE HOST BINDING for the `@ai-matrx/associations` entity registry (W5 swap,
// 2026-08-29). The merge ENGINE lives in the package
// (`createEntityRegistry` in `@ai-matrx/associations/core` — generated
// `platform.entity_types` metadata merged with a host overlay); what remains
// here is HOST MATERIAL the database and the package cannot carry:
//
//   1. `ENTITY_OVERLAY` — Lucide icons, client routes (`hrefFor`), plural
//      labels, and the exceptional candidate loaders (`data_store` → rag,
//      `hr_employee` → hr). This literal feeds the package's `entityOverlay`
//      port (both this module's standalone registry instance and the store in
//      `features/scopes/host/associationsStore.ts` are constructed from it).
//   2. The content-role display chrome (`CONTENT_ROLES` — titles, taglines,
//      Tailwind accents) consumed by host resource surfaces.
//   3. The `LucideIcon`-typed `EntityInfo` the 70+ existing consumers render
//      from (`info.Icon` is never null here — `DEFAULT_ICON` fills the gap,
//      exactly the pre-extraction behavior).
//
// Every resolver below (`getEntityInfo`, `tryGetEntityInfo`, `curatedTokens`,
// …) DELEGATES to the package engine — there is no second merge
// implementation in this repo (C9).
//
// OWNERSHIP + ORG ARE CONVENTIONS, NOT PER-TOKEN CONFIG (see the package
// registry docs): every cardable table carries `created_by` +
// `organization_id`; a token overrides only when its table diverges.

import type { LucideIcon } from "lucide-react";
import {
  AppWindow,
  AudioLines,
  BookOpen,
  BrainCircuit,
  Boxes,
  Building2,
  Contact,
  Database,
  FileCode2,
  FilePen,
  FileText,
  FlaskConical,
  Folder,
  FolderGit2,
  FolderKanban,
  Frame,
  GitBranch,
  Globe,
  Handshake,
  IdCard,
  Layers,
  Layers3,
  LayoutTemplate,
  ListChecks,
  ListOrdered,
  MailCheck,
  Megaphone,
  ListTodo,
  MessagesSquare,
  Mic,
  NotebookText,
  RefreshCw,
  Sheet,
  Shapes,
  Table,
  Tag,
  Target,
  Webhook,
  Workflow,
  UsersRound,
  Wrench,
  Zap,
} from "lucide-react";
import {
  createEntityRegistry,
  resolveEntityToken,
  isContentRole,
  DEFAULT_OWNER_COLUMN,
  DEFAULT_ORG_COLUMN,
  type ContentRole,
  type EntityInfo as PackageEntityInfo,
} from "@ai-matrx/associations/core";
import type {
  EntityOverlayMap,
  EntityTypeToken,
} from "@ai-matrx/associations";
import { listDataStoreCandidates } from "@/features/rag/service/dataStoreCandidates";
import { listHrEmployeeCandidates } from "@/features/hr/entry-points/employeeCandidates";
import { associationsErrorSink } from "@/features/scopes/host/errorSink";

// Conventions + token normalisation come straight from the package.
export { resolveEntityToken, isContentRole, DEFAULT_OWNER_COLUMN, DEFAULT_ORG_COLUMN };
export type { ContentRole };


// ─── Content roles ──────────────────────────────────────────────────────────
// The knowledge-model grouping axis (common-docs/projects/knowledge-system/vision/scopeable_entities.md):
// every entity brings knowledge in (source), produces it (destination), does
// both (hybrid), operates on it without truth of its own (utility), or
// organizes other entities (container). Resource surfaces group by this.
// `platform.entity_types.content_role` is the only per-entity authority.

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
  ai_model: {
    Icon: BrainCircuit,
    labelPlural: "AI Models",
  },
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
  // ─── People (HR) ──────────────────────────────────────────────────────────
  //
  // D7 / SPEC-UI-IA §6: "Employees are a searchable entity type resolving to
  // /hr/people/[employeeId]." THIS is the registration point — the universal
  // search box and every association picker are registry-driven, so a token
  // joins them here and nowhere else.
  //
  // `listCandidates` is REQUIRED, not polish. The generic candidate read does a
  // `.schema(...).from(...)`, and the `hr` schema is not exposed to PostgREST —
  // so without this override `hr_employee` either cannot be searched at all or
  // fails with PGRST205 the moment somebody types. Same exception, same reason,
  // as `data_store`.
  hr_employee: {
    Icon: IdCard,
    labelPlural: "Employees",
    hrefFor: (id) => `/hr/people/${id}`,
    listCandidates: listHrEmployeeCandidates,
  },
  rulebook: {
    Icon: BookOpen,
    labelPlural: "Rulebooks",
    hrefFor: (id) => `/masterwork/${id}`,
  },
  // `skill` has a peek but NO detail route anywhere in `app/`
  // (`/agent-connections/skills` is a list), so it stays peek-only — do not
  // invent an `hrefFor` that 404s. Tracked in
  // docs/handoffs/inventory-law-sweep.md.
  skill: {
    Icon: Wrench,
    labelPlural: "Skills",
  },
  // `workflow` HAS a detail route: /workflows/[id] sets one up, runs it, and
  // watches it live. It sat peek-only here long after that route shipped, so
  // every EntityRef, peek and toast door for a workflow was dark for no reason.
  workflow: {
    Icon: Workflow,
    labelPlural: "Workflows",
    hrefFor: (id) => `/workflows/${id}`,
  },
  tool: {
    Icon: Wrench,
    labelPlural: "Tools",
  },
  content_ir_kind: {
    Icon: Shapes,
    labelPlural: "Shapes",
    // Shape detail routes use the stable kind slug. Generic EntityRef callers
    // hold the database id, so this tiny resolver route translates id → slug.
    hrefFor: (id) => `/shapes/id/${encodeURIComponent(id)}`,
  },
  message_template: {
    Icon: LayoutTemplate,
    labelPlural: "Message Templates",
    hrefFor: (id) => `/chat/message-templates/${id}`,
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
  // Knowledge knowledge store — the scope-gate for knowledge_search retrieval.
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
    hrefFor: (id) => `/transcripts/studio?session=${encodeURIComponent(id)}`,
  },
  // ─── Code (canonical `code.*` entities — attachable to orgs, war rooms, etc.) ─
  code_file: {
    Icon: FileCode2,
    labelPlural: "Code Files",
    // `?open=` is the param the code workspace actually reads
    // (features/code/hooks/useOpenCodeFileFromUrl.ts). An earlier `?tab=code-file:{id}`
    // shape was never implemented, so every Open door landed on the bare workspace.
    hrefFor: (id) => `/code?open=${encodeURIComponent(id)}`,
  },
  code_folder: {
    Icon: FolderGit2,
    labelPlural: "Code Folders",
    // The workspace has no sub-routes, so a folder's destination is the
    // Library tree with that folder expanded, highlighted, and scrolled to
    // (features/code/hooks/useFocusCodeFolderFromUrl.ts). There is no
    // `/code/folders/{id}` and there must never be one.
    hrefFor: (id) => `/code?folder=${encodeURIComponent(id)}`,
  },
  code_repository: {
    Icon: GitBranch,
    labelPlural: "Code Repositories",
    // `/knowledge/repositories` is the ONLY surface over code.code_repositories —
    // /code's Source Control view is git-on-the-sandbox, a different thing.
    // `?repo=` highlights the row and scrolls it into view.
    hrefFor: (id) => `/knowledge/repositories?repo=${encodeURIComponent(id)}`,
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
  // `docproc.processed_documents` — a document as the PDF pipeline produced it,
  // NOT `udt_document` (workbench.udt_documents) despite the similar name.
  // The studio's own detail route keys on exactly this id, so every surface
  // that names a processed document gets its door from this one line: the
  // three lineage-tree rows that were printing `8f3a2b1c…` inert, and whatever
  // names one next.
  processed_document: {
    Icon: FileText,
    labelPlural: "Processed Documents",
    hrefFor: (id) => `/tools/pdf-extractor/${id}`,
  },
  conversation: {
    Icon: MessagesSquare,
    labelPlural: "Conversations",
    hrefFor: (id) => `/chat/${id}`,
  },
  research_topic: {
    Icon: FlaskConical,
    labelPlural: "Research Topics",
    hrefFor: (id) => `/research/topics/${id}`,
  },
  research_tag: {
    Icon: Tag,
    labelPlural: "Research Tags",
    // A tag's owning topic is resolved by the flat redirect route.
    hrefFor: (id) => `/research/tags/${id}`,
  },
  // The row FlashcardPeek actually reads (education.fc_set) — the canonical
  // flashcard-set entity (legacy education.flashcard_data merged 2026-08-12).
  fc_set: {
    Icon: Layers,
    labelPlural: "Flashcards",
    hrefFor: (id) => `/education/flashcards/${id}`,
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
  study_media: {
    Icon: AudioLines,
    labelPlural: "Study Media",
    hrefFor: (id) => `/education/media/${id}`,
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
  war_room: {
    Icon: UsersRound,
    labelPlural: "War Rooms",
    hrefFor: (id) => `/war-room/${id}`,
  },

  // ─── CRM (crm.party — the ONE record for an external person/company) ──────
  party: {
    Icon: Contact,
    labelPlural: "People & Companies",
    hrefFor: (id) => `/crm/${id}`,
  },
  crm_deal: {
    Icon: Handshake,
    labelPlural: "Deals",
    hrefFor: (id) => `/crm/deals/${id}`,
  },
  crm_outreach_list: {
    Icon: Megaphone,
    labelPlural: "Outreach Lists",
    hrefFor: (id) => `/crm/outreach-lists/${id}`,
  },
  crm_sending_identity: {
    Icon: MailCheck,
    labelPlural: "Sending Mailboxes",
    hrefFor: (id) => `/crm/sending-identities/${id}`,
  },

  // ─── Web (canonical Marketing access-tree doors) ─────────────────────────
  web_brand: {
    Icon: Building2,
    labelPlural: "Marketing Accounts",
    hrefFor: (id) => `/marketing/brands/${id}`,
  },
  marketing_initiative: {
    Icon: Target,
    labelPlural: "Initiatives",
    hrefFor: (id) => `/marketing/initiatives/${id}`,
  },
  web_site: {
    Icon: Globe,
    labelPlural: "Sites",
    // The flat route is the canonical resolver when a caller only has the
    // site id; its server redirect restores the brand-first hierarchy.
    hrefFor: (id) => `/marketing/sites/${id}`,
  },
  web_page: {
    Icon: Globe,
    labelPlural: "Canonical Pages",
    // hrefFor resolves the nested brand/site route via a tiny server redirect.
    hrefFor: (id) => `/marketing/pages/${id}`,
  },
  plan_node: {
    Icon: ListOrdered,
    labelPlural: "Plan Pages",
    // The flat route resolves the node's site and opens that exact node.
    hrefFor: (id) => `/marketing/content-plan/nodes/${id}`,
  },
  web_property: {
    Icon: Globe,
    labelPlural: "Marketing Properties",
    hrefFor: (id) => `/marketing/properties/${id}`,
  },
  web_snapshot: {
    Icon: FileText,
    labelPlural: "Web Snapshots",
    hrefFor: (id) => `/marketing/snapshots/${id}`,
  },
  web_crawl_session: {
    Icon: RefreshCw,
    labelPlural: "Crawls",
    // No flat resolver route: a crawl is only meaningful inside its site, and
    // the surfaces that name one are already standing in that site. They pass
    // `href={`${sitePath}/crawls/${id}`}` — see `MarketingRefs.CrawlSessionRef`.
  },
  web_screenshot: {
    Icon: Frame,
    labelPlural: "Web Screenshots",
    hrefFor: (id) => `/marketing/screenshots/${id}`,
  },

  growth_loop_run: {
    Icon: RefreshCw,
    labelPlural: "Growth Loops",
    // Matches `platform.shareable_resource_registry.url_path_template` for this
    // token; the route resolves the run to its site and lands on the site's
    // Growth Loop tab.
    hrefFor: (id) => `/marketing/growth-loop/${id}`,
  },

  // ─── SEO (canonical keywords — Search Console watchlist targets) ──────────
  seo_keyword: {
    Icon: Tag,
    labelPlural: "Keywords",
  },
  seo_change_set: {
    Icon: FlaskConical,
    labelPlural: "SEO Changes",
    hrefFor: (id) => `/marketing/changes/${id}`,
  },

  // ─── Container display metadata ───────────────────────────────────────────
  scope: { Icon: Tag, labelPlural: "Scopes" },
  scope_type: {
    Icon: Layers3,
    labelPlural: "Scope Types",
  },
  context_item: {
    Icon: ListChecks,
    labelPlural: "Context Items",
    // The only id-addressable route needs THREE ids
    // (/organizations/[orgId]/scopes/[typeId]/context-items/[itemId]), which an
    // {id}-only door cannot build — and inventing a single-id route for a
    // COMPONENT of a scope type would be inventing a second identity for it.
    // So the door is the all-orgs hub with the item resolved, scrolled to and
    // highlighted (`AllContextItemsHub` in
    // features/scope-system/components/ContextItemsHub.tsx). An id the caller
    // cannot reach renders the access gate, never a list that looks like the
    // link worked. There is no `/context-items/{id}` and there must never be.
    hrefFor: (id) => `/context-items?item=${encodeURIComponent(id)}`,
  },
  organization: {
    Icon: Building2,
    labelPlural: "Organizations",
    hrefFor: (id) => `/organizations/${id}`,
  },
};

/** Fallback icon when a token has no overlay entry yet. */
const DEFAULT_ICON: LucideIcon = Boxes;

// ─── The ONE engine instance ────────────────────────────────────────────────
// Constructed from the same host overlay the store binding uses
// (`features/scopes/host/associationsStore.ts`). Overlay entries are merged
// per token by the package, so both instances resolve identically.
const registry = createEntityRegistry(
  associationsErrorSink,
  ENTITY_OVERLAY as EntityOverlayMap,
);

/** The host overlay — feeds the package's `entityOverlay` port. */
export function getAssociationsEntityOverlay(): EntityOverlayMap {
  return ENTITY_OVERLAY as EntityOverlayMap;
}

/**
 * Fully-resolved entity descriptor as host consumers render it: the package's
 * merged descriptor with a guaranteed Lucide `Icon` (`DEFAULT_ICON` when the
 * overlay has none — exactly the pre-extraction behavior).
 */
export interface EntityInfo extends Omit<PackageEntityInfo, "Icon"> {
  Icon: LucideIcon;
}

function withIcon(info: PackageEntityInfo): EntityInfo {
  // The overlay above only ever registers Lucide components, so the merged
  // Icon is a LucideIcon whenever present; DEFAULT_ICON fills the gap.
  return { ...info, Icon: (info.Icon as LucideIcon | null) ?? DEFAULT_ICON };
}

/**
 * Resolve a token to its full descriptor. Callers should pass `EntityTypeToken`
 * values; pass raw strings through `tryGetEntityInfo` instead.
 */
export function getEntityInfo(token: EntityTypeToken): EntityInfo {
  return withIcon(registry.getEntityInfo(token));
}

/** Safe variant for raw strings (e.g. an edge's `otherType`). */
export function tryGetEntityInfo(token: string): EntityInfo | null {
  const info = registry.tryGetEntityInfo(token);
  return info ? withIcon(info) : null;
}

/**
 * Resolve an entity descriptor from a live `(schema, table)` pair, or null when
 * that table backs no registered entity. Use this for surfaces keyed by raw
 * table name; token-keyed callers should use `getEntityInfo` directly.
 */
export function tryGetEntityInfoByTable(
  schema: string,
  table: string,
): EntityInfo | null {
  const info = registry.tryGetEntityInfoByTable(schema, table);
  return info ? withIcon(info) : null;
}

/** Resolve a raw table name only when it maps to exactly one registered entity. */
export function tryGetEntityInfoByUniqueTableName(
  table: string,
): EntityInfo | null {
  const info = registry.tryGetEntityInfoByUniqueTableName(table);
  return info ? withIcon(info) : null;
}

/**
 * Tokens the DB classifies as knowledge resources via a valid `content_role`
 * AND that can list candidates — the default set for association card grids,
 * resource sections, and attach pickers.
 */
export function curatedTokens(): EntityTypeToken[] {
  return registry.curatedTokens();
}

/**
 * Tokens offered as reference "Allowed types" — DB-driven via
 * `platform.entity_types.reference_pickable`. A pickable token with no title
 * column and no candidate source is screamed to the errorSink and excluded,
 * never silently shown broken.
 */
export function listableTokens(): EntityTypeToken[] {
  return registry.listableTokens();
}
