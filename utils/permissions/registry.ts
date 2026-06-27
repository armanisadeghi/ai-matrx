/**
 * Shareable Resource Registry — TypeScript mirror
 *
 * Single source of truth lives in the Postgres `shareable_resource_registry`
 * table. This file mirrors the same data so the FE doesn't have to fetch the
 * registry on every page load. The ts→db mirror is verified at test time by
 * `utils/permissions/__tests__/registry.parity.test.ts` — if a row is added
 * to the DB and not here (or vice versa) the test fails.
 *
 * Adding a new shareable resource type:
 *   1. INSERT a row into public.shareable_resource_registry (one place).
 *   2. Mirror that row in REGISTRY below.
 *   3. The parity test will keep them in sync forever.
 *
 * That's it. Do NOT add aliases to share-related RPCs, do NOT hardcode a URL
 * pattern in ShareModal, do NOT add a label in a separate map. Everything
 * driven from this registry.
 */

export interface ShareableResourceEntry {
  /**
   * Public alias used in TS / RPC arguments / UI props.
   * Frequently equals tableName; for legacy types it's the singular form.
   */
  resourceType: string;

  /**
   * The canonical Postgres table name. ALL permissions.resource_type rows
   * store this value. RLS policies key on this string.
   */
  tableName: string;

  /** Primary-key column on the resource table. Almost always 'id'. */
  idColumn: string;

  /** Column holding owner's auth.uid(). Almost always 'user_id'. */
  ownerColumn: string;

  /**
   * Column holding the public-visibility boolean.
   * Null means the table has no public flag (visibility is private-only or
   * controlled by another mechanism).
   */
  isPublicColumn: string | null;

  /** Human-readable label used in the share modal title and emails. */
  displayLabel: string;

  /**
   * URL pattern for the share link. `{id}` is substituted with the resource id.
   * Replaces the inline resourcePaths map in ShareModal.getShareUrl().
   */
  urlPathTemplate: string;

  /**
   * When false, the table's RLS does NOT call has_permission(). Sharing rows
   * insert successfully but RLS will not actually grant the grantee access.
   * Surfaces broken end-to-end states explicitly.
   */
  rlsUsesHasPermission: boolean;

  /**
   * Non-`public` Postgres schema the resource table lives in, if any. supabase-js
   * reaches it via `.schema(schemaName)`. Omitted ⇒ `public`.
   * (Set for files/folders after the 2026 restructure moved them to the `files`
   * schema.) FE-only — not part of the DB `shareable_resource_registry` parity.
   */
  schemaName?: string;

  /**
   * Physical table name to use for direct `.from()` reads/writes when it differs
   * from `tableName` (which doubles as the `permissions.resource_type` / RLS key
   * and the DB-registry value the parity test checks). Omitted ⇒ use `tableName`.
   * (Set for files/folders: `tableName` is the canonical permissions key
   * `'file'` / `'folder'`, but the physical table is `files.files` /
   * `files.folders` after the 2026 canonicalization.) FE-only.
   */
  physicalTable?: string;
}

/**
 * The canonical client-side mirror of public.shareable_resource_registry.
 * Verified against the DB by the parity test.
 */
export const SHAREABLE_RESOURCE_REGISTRY = {
  agent: {
    resourceType: "agent",
    // `tableName` matches DB shareable_resource_registry.table_name = 'definition'.
    // Physical table is `agent.definition`, reached via `.schema('agent')`.
    // The parity test maps by resourceType key ('agent'), not tableName.
    tableName: "definition",
    schemaName: "agent",
    physicalTable: "definition",
    idColumn: "id",
    // DB canonical (live DB + registry): owner_column = created_by.
    ownerColumn: "created_by",
    // DB canonical: agent.definition uses visibility enum, not is_public bool.
    isPublicColumn: null,
    displayLabel: "Agent",
    // DB snapshot has "/agents/{id}" — keep aligned with DB registry.
    urlPathTemplate: "/agents/{id}",
    rlsUsesHasPermission: true,
  },
  agent_app: {
    resourceType: "agent_app",
    // NOTE: The DB registry uses resource_type='app' (not 'agent_app'). The FE
    // key 'agent_app' has no matching DB row — the parity test will flag this as
    // "missing from DB". This is pre-existing drift from before this audit.
    // Do NOT change the FE key to 'app' without updating all call sites.
    // tableName must match DB table_name for the app resource = 'definition'.
    tableName: "definition",
    schemaName: "app",
    physicalTable: "definition",
    idColumn: "id",
    // DB canonical: app.definition uses created_by (not user_id).
    ownerColumn: "created_by",
    // DB canonical (new snapshot): is_public_column = null for 'app'.
    isPublicColumn: null,
    displayLabel: "App",
    urlPathTemplate: "/apps/{id}",
    rlsUsesHasPermission: true,
  },
  prompt: {
    resourceType: "prompt",
    tableName: "prompts",
    idColumn: "id",
    ownerColumn: "user_id",
    isPublicColumn: "is_public",
    displayLabel: "Prompt",
    urlPathTemplate: "/ai/prompts/edit/{id}",
    rlsUsesHasPermission: true,
  },
  note: {
    resourceType: "note",
    tableName: "notes",
    idColumn: "id",
    ownerColumn: "user_id",
    isPublicColumn: "is_public",
    displayLabel: "Note",
    urlPathTemplate: "/notes/{id}",
    rlsUsesHasPermission: true,
  },
  content_template: {
    resourceType: "content_template",
    tableName: "content_template",
    idColumn: "id",
    ownerColumn: "user_id",
    isPublicColumn: "is_public",
    displayLabel: "Content Template",
    urlPathTemplate: "/settings/content-templates/{id}",
    rlsUsesHasPermission: true,
  },
  workflow: {
    resourceType: "workflow",
    tableName: "workflow",
    idColumn: "id",
    ownerColumn: "user_id",
    isPublicColumn: "is_public",
    displayLabel: "Workflow",
    urlPathTemplate: "/workflows/{id}",
    rlsUsesHasPermission: true,
  },
  conversation: {
    resourceType: "conversation",
    // `tableName` is the value passed as `p_resource_type` to the share RPCs.
    // DB `shareable_resource_registry` row: resource_type='conversation', table_name='conversation',
    // schema_name='chat'. Physical table is `chat.conversation`, reached via `.schema('chat')`.
    tableName: "conversation",
    schemaName: "chat",
    physicalTable: "conversation",
    idColumn: "id",
    ownerColumn: "user_id",
    isPublicColumn: "is_public",
    displayLabel: "Conversation",
    urlPathTemplate: "/chat/{id}",
    rlsUsesHasPermission: true,
  },
  canvas_items: {
    resourceType: "canvas_items",
    tableName: "canvas_items",
    idColumn: "id",
    ownerColumn: "user_id",
    isPublicColumn: "is_public",
    displayLabel: "Canvas",
    urlPathTemplate: "/canvas/{id}",
    rlsUsesHasPermission: true,
  },
  udt_datasets: {
    resourceType: "udt_datasets",
    tableName: "udt_datasets",
    idColumn: "id",
    ownerColumn: "user_id",
    isPublicColumn: "is_public",
    displayLabel: "Dataset",
    urlPathTemplate: "/data/{id}",
    rlsUsesHasPermission: true,
  },
  udt_picklists: {
    resourceType: "udt_picklists",
    tableName: "udt_picklists",
    idColumn: "id",
    ownerColumn: "user_id",
    isPublicColumn: "is_public",
    displayLabel: "List",
    urlPathTemplate: "/lists/{id}",
    rlsUsesHasPermission: true,
  },
  udt_workbooks: {
    resourceType: "udt_workbooks",
    tableName: "udt_workbooks",
    idColumn: "id",
    ownerColumn: "user_id",
    isPublicColumn: "is_public",
    displayLabel: "Workbook",
    urlPathTemplate: "/workbooks/{id}",
    rlsUsesHasPermission: true,
  },
  udt_documents: {
    resourceType: "udt_documents",
    tableName: "udt_documents",
    idColumn: "id",
    ownerColumn: "user_id",
    isPublicColumn: "is_public",
    displayLabel: "Document",
    urlPathTemplate: "/documents/{id}",
    rlsUsesHasPermission: true,
  },
  transcript: {
    resourceType: "transcript",
    tableName: "transcripts",
    idColumn: "id",
    ownerColumn: "user_id",
    isPublicColumn: "is_public",
    displayLabel: "Transcript",
    urlPathTemplate: "/transcripts/{id}",
    rlsUsesHasPermission: true,
  },
  quiz_sessions: {
    resourceType: "quiz_sessions",
    tableName: "quiz_sessions",
    idColumn: "id",
    ownerColumn: "user_id",
    isPublicColumn: null,
    displayLabel: "Quiz",
    urlPathTemplate: "/quizzes/{id}",
    rlsUsesHasPermission: true,
  },
  sandbox_instances: {
    resourceType: "sandbox_instances",
    tableName: "sandbox_instances",
    idColumn: "id",
    ownerColumn: "user_id",
    isPublicColumn: null,
    displayLabel: "Sandbox",
    urlPathTemplate: "/sandbox/{id}",
    rlsUsesHasPermission: true,
  },
  file: {
    // Canonical now: the file system was fully canonicalized in the 2026
    // restructure. `resourceType` / `tableName` is `'file'` — this is the
    // value sent as `p_resource_type` to the share RPCs / `resolve_shareable_
    // resource`, which knows `'file'` (NOT the old `'cld_files'`). Physical
    // table is `files.files`, reached via `.schema('files')`.
    resourceType: "file",
    tableName: "file",
    schemaName: "files",
    physicalTable: "files",
    idColumn: "id",
    // Canonical owner column (trigger-stamped), not the old `owner_id`.
    ownerColumn: "created_by",
    // No `is_public` boolean — files carry the `platform.visibility` enum.
    isPublicColumn: null,
    displayLabel: "File",
    urlPathTemplate: "/files/f/{id}",
    // Files resolve access via the canonical resolver `iam.has_access('file',…)`
    // (owner + grant + org + visibility/share-link), and file grants live in
    // the canonical `public.permissions` store (resource_type='file').
    rlsUsesHasPermission: true,
  },
  folder: {
    // Folders are a registered canonical entity with file→folder / folder→
    // folder containment; sharing flows through `public.permissions`
    // (resource_type='folder') with `iam.has_access` RLS + visibility enum.
    resourceType: "folder",
    tableName: "folder",
    schemaName: "files",
    physicalTable: "folders",
    idColumn: "id",
    ownerColumn: "created_by",
    isPublicColumn: null,
    displayLabel: "Folder",
    // Mirrors the DB registry (`shareable_resource_registry`) — the source of
    // truth the parity test enforces. Note: the live folder browse route is
    // `/files/folders` (see app/(core)/files/folders); the registry template
    // and live route should be reconciled in the DB registry.
    urlPathTemplate: "/files/folder/{id}",
    rlsUsesHasPermission: true,
  },
  prompt_actions: {
    resourceType: "prompt_actions",
    tableName: "prompt_actions",
    idColumn: "id",
    ownerColumn: "user_id",
    isPublicColumn: "is_public",
    displayLabel: "Action",
    urlPathTemplate: "/ai/prompts/actions/{id}",
    rlsUsesHasPermission: true,
  },
  flashcard_data: {
    resourceType: "flashcard_data",
    tableName: "flashcard_data",
    idColumn: "id",
    ownerColumn: "user_id",
    isPublicColumn: "public",
    displayLabel: "Flashcard",
    urlPathTemplate: "/flashcards/{id}",
    rlsUsesHasPermission: true,
  },
  task: {
    // Canonical: workspace domain moved to `workspace` schema; physical table is
    // `workspace.tasks`, reached via `.schema('workspace')` (see workspaceDb).
    // tableName matches DB shareable_resource_registry.table_name = 'tasks'.
    resourceType: "task",
    tableName: "tasks",
    schemaName: "workspace",
    physicalTable: "tasks",
    idColumn: "id",
    // DB canonical: workspace.tasks has NO user_id column. RLS and DB registry
    // both use created_by. isResourceOwner() queries created_by.
    ownerColumn: "created_by",
    // workspace.tasks uses visibility enum, no is_public column.
    isPublicColumn: null,
    displayLabel: "Task",
    urlPathTemplate: "/tasks/{id}",
    rlsUsesHasPermission: true,
  },
  analysis_recipes: {
    resourceType: "analysis_recipes",
    tableName: "analysis_recipes",
    idColumn: "id",
    ownerColumn: "owner_user_id",
    isPublicColumn: null,
    displayLabel: "Analysis Recipe",
    urlPathTemplate: "/settings/analysis/recipes/{id}",
    rlsUsesHasPermission: false,
  },
  auto_ingest_batch: {
    resourceType: "auto_ingest_batch",
    tableName: "auto_ingest_batch",
    idColumn: "id",
    ownerColumn: "user_id",
    isPublicColumn: null,
    displayLabel: "Auto-ingest Batch",
    urlPathTemplate: "/administration/kg-cost/batches/{id}",
    rlsUsesHasPermission: false,
  },
  file_analysis: {
    resourceType: "file_analysis",
    tableName: "file_analysis",
    schemaName: "files",
    physicalTable: "analysis",
    idColumn: "file_id",
    ownerColumn: "owner_id",
    isPublicColumn: null,
    displayLabel: "File Analysis",
    urlPathTemplate: "/files/{id}",
    rlsUsesHasPermission: false,
  },
  file_entities: {
    resourceType: "file_entities",
    tableName: "file_entities",
    schemaName: "files",
    physicalTable: "entities",
    idColumn: "id",
    ownerColumn: "owner_id",
    isPublicColumn: null,
    displayLabel: "File Entity",
    urlPathTemplate: "/files/{id}",
    rlsUsesHasPermission: false,
  },
  file_overrides: {
    resourceType: "file_overrides",
    tableName: "file_overrides",
    schemaName: "files",
    physicalTable: "overrides",
    idColumn: "id",
    ownerColumn: "owner_id",
    isPublicColumn: null,
    displayLabel: "File Override",
    urlPathTemplate: "/files/{id}",
    rlsUsesHasPermission: false,
  },
  file_page_annotations: {
    resourceType: "file_page_annotations",
    tableName: "file_page_annotations",
    schemaName: "files",
    physicalTable: "page_annotations",
    idColumn: "id",
    ownerColumn: "owner_id",
    isPublicColumn: null,
    displayLabel: "Page Annotation",
    urlPathTemplate: "/files/{id}",
    rlsUsesHasPermission: false,
  },
  file_pages: {
    resourceType: "file_pages",
    tableName: "file_pages",
    schemaName: "files",
    physicalTable: "pages",
    idColumn: "id",
    ownerColumn: "owner_id",
    isPublicColumn: null,
    displayLabel: "File Page",
    urlPathTemplate: "/files/{id}",
    rlsUsesHasPermission: false,
  },
  pdf_redaction_audits: {
    resourceType: "pdf_redaction_audits",
    tableName: "pdf_redaction_audits",
    idColumn: "id",
    ownerColumn: "user_id",
    isPublicColumn: null,
    displayLabel: "Redaction Audit",
    urlPathTemplate: "/files/{id}",
    rlsUsesHasPermission: false,
  },
  redaction_mapping: {
    resourceType: "redaction_mapping",
    tableName: "redaction_mapping",
    idColumn: "id",
    ownerColumn: "owner_id",
    isPublicColumn: null,
    displayLabel: "Redaction Mapping",
    urlPathTemplate: "/files/{id}",
    rlsUsesHasPermission: false,
  },
  scope_association_suggestions: {
    resourceType: "scope_association_suggestions",
    tableName: "scope_association_suggestions",
    idColumn: "id",
    ownerColumn: "user_id",
    isPublicColumn: null,
    displayLabel: "Scope Suggestion",
    urlPathTemplate: "/scopes/suggestions/{id}",
    rlsUsesHasPermission: false,
  },
  scope_item_value_suggestions: {
    resourceType: "scope_item_value_suggestions",
    tableName: "scope_item_value_suggestions",
    idColumn: "id",
    ownerColumn: "user_id",
    isPublicColumn: null,
    displayLabel: "Scope Item Value Suggestion",
    urlPathTemplate: "/scopes/item-suggestions/{id}",
    rlsUsesHasPermission: false,
  },
  scraper_preset: {
    resourceType: "scraper_preset",
    tableName: "scraper.crawl_presets",
    idColumn: "id",
    ownerColumn: "created_by",
    isPublicColumn: "is_public",
    displayLabel: "Crawl preset",
    urlPathTemplate: "/scraper?tab=presets",
    rlsUsesHasPermission: false,
  },
  scraper_run: {
    resourceType: "scraper_run",
    tableName: "scraper.crawl_runs",
    idColumn: "id",
    ownerColumn: "user_id",
    isPublicColumn: "is_public",
    displayLabel: "Crawl run",
    urlPathTemplate: "/scraper?tab=overview&run_id={id}",
    rlsUsesHasPermission: false,
  },
  scraper_schedule: {
    resourceType: "scraper_schedule",
    tableName: "scraper.crawl_schedules",
    idColumn: "id",
    ownerColumn: "created_by",
    isPublicColumn: "is_public",
    displayLabel: "Crawl schedule",
    urlPathTemplate: "/scraper?tab=schedules",
    rlsUsesHasPermission: false,
  },
  scraper_site: {
    resourceType: "scraper_site",
    tableName: "scraper.sites",
    idColumn: "id",
    ownerColumn: "owner_user_id",
    isPublicColumn: "is_public",
    displayLabel: "Tracked website",
    urlPathTemplate: "/websites?site_id={id}",
    rlsUsesHasPermission: false,
  },
  skill: {
    resourceType: "skill",
    // `tableName` is the value passed as `p_resource_type` to the share RPCs.
    // DB `shareable_resource_registry` row: resource_type='skill', table_name='definition',
    // schema_name='skill'. Physical table is `skill.definition`, reached via `.schema('skill')`.
    tableName: "skill",
    schemaName: "skill",
    physicalTable: "definition",
    idColumn: "id",
    ownerColumn: "user_id",
    isPublicColumn: "is_public",
    displayLabel: "Skill",
    urlPathTemplate: "/skills/{id}",
    rlsUsesHasPermission: true,
  },
  user_analysis_preferences: {
    resourceType: "user_analysis_preferences",
    tableName: "user_analysis_preferences",
    idColumn: "user_id",
    ownerColumn: "user_id",
    isPublicColumn: null,
    displayLabel: "Analysis Preferences",
    urlPathTemplate: "/settings/analysis",
    rlsUsesHasPermission: false,
  },
  wf_definition: {
    resourceType: "wf_definition",
    tableName: "wf_definition",
    idColumn: "id",
    ownerColumn: "user_id",
    isPublicColumn: null,
    displayLabel: "Workflow",
    urlPathTemplate: "/workflows/{id}",
    rlsUsesHasPermission: false,
  },
  wf_run: {
    resourceType: "wf_run",
    tableName: "wf_run",
    idColumn: "id",
    ownerColumn: "user_id",
    isPublicColumn: null,
    displayLabel: "Workflow Run",
    urlPathTemplate: "/runs/{id}",
    rlsUsesHasPermission: false,
  },
  wf_trigger: {
    resourceType: "wf_trigger",
    tableName: "wf_trigger",
    idColumn: "id",
    ownerColumn: "user_id",
    isPublicColumn: null,
    displayLabel: "Workflow Trigger",
    urlPathTemplate: "/workflows/{id}/triggers/{id}",
    rlsUsesHasPermission: false,
  },
} as const satisfies Record<string, ShareableResourceEntry>;

/**
 * Union of all valid resource-type aliases. Exactly mirrors the registry's
 * primary keys.
 */
export type ResourceType = keyof typeof SHAREABLE_RESOURCE_REGISTRY;

/** Ordered list of resource-type aliases (useful for tests, dropdowns, etc.) */
export const RESOURCE_TYPES = Object.keys(
  SHAREABLE_RESOURCE_REGISTRY,
) as ResourceType[];

/**
 * Look up a registry entry by alias OR canonical table_name. Returns undefined
 * for unregistered types so callers can fail gracefully (the DB will reject
 * any subsequent write either way).
 */
export function getShareableResource(
  typeOrTable: string,
): ShareableResourceEntry | undefined {
  if (typeOrTable in SHAREABLE_RESOURCE_REGISTRY) {
    return SHAREABLE_RESOURCE_REGISTRY[typeOrTable as ResourceType];
  }
  for (const entry of Object.values(SHAREABLE_RESOURCE_REGISTRY)) {
    if (entry.tableName === typeOrTable) return entry;
  }
  return undefined;
}

/**
 * Resolve a resource type to its canonical Postgres table name. Throws if the
 * type isn't registered — this matches the DB-side resolver behavior so
 * callers can rely on a single failure mode.
 */
export function resolveTableName(resourceType: string): string {
  const entry = getShareableResource(resourceType);
  if (!entry) {
    throw new Error(
      `Unknown shareable resource type: ${resourceType}. Register it in shareable_resource_registry (see utils/permissions/registry.ts and features/sharing/FEATURE.md).`,
    );
  }
  return entry.tableName;
}

/** Human-readable label for a resource type (replaces the legacy map). */
export function getResourceTypeLabel(resourceType: string): string {
  return getShareableResource(resourceType)?.displayLabel ?? resourceType;
}

/**
 * Build the share URL for a resource. Substitutes {id} in the registry's
 * url_path_template. Returns a relative path; the caller prepends the origin.
 */
export function getResourceSharePath(
  resourceType: string,
  resourceId: string,
): string {
  const entry = getShareableResource(resourceType);
  if (!entry) return `/${resourceType}/${resourceId}`;
  return entry.urlPathTemplate.replace("{id}", resourceId);
}
