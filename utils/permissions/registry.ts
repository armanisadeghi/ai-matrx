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
}

/**
 * The canonical client-side mirror of public.shareable_resource_registry.
 * Verified against the DB by the parity test.
 */
export const SHAREABLE_RESOURCE_REGISTRY = {
  agent: {
    resourceType: "agent",
    tableName: "agx_agent",
    idColumn: "id",
    ownerColumn: "user_id",
    isPublicColumn: "is_public",
    displayLabel: "Agent",
    urlPathTemplate: "/agents/{id}/edit",
    rlsUsesHasPermission: true,
  },
  agent_app: {
    resourceType: "agent_app",
    tableName: "aga_apps",
    idColumn: "id",
    ownerColumn: "user_id",
    isPublicColumn: "is_public",
    displayLabel: "Agent App",
    urlPathTemplate: "/agent-apps/{id}",
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
  cx_conversation: {
    resourceType: "cx_conversation",
    tableName: "cx_conversation",
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
  transcripts: {
    resourceType: "transcripts",
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
  cld_files: {
    resourceType: "cld_files",
    tableName: "cld_files",
    idColumn: "id",
    ownerColumn: "owner_id",
    isPublicColumn: null,
    displayLabel: "File",
    urlPathTemplate: "/files/f/{id}",
    // Files resolve access via the canonical resolver `iam.has_access('file',…)`
    // (owner + grant + org + share-link), and file grants now live in the
    // canonical `public.permissions` store (resource_type='file'). This flag
    // tracks whether the table's RLS calls the grant-only `public.has_permission`
    // helper directly; cld_files RLS still uses its own resolver path plus
    // `cld_share_links`, so a bare `permissions` row is not the whole story.
    rlsUsesHasPermission: false,
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
    resourceType: "task",
    tableName: "ctx_tasks",
    idColumn: "id",
    ownerColumn: "user_id",
    isPublicColumn: "is_public",
    displayLabel: "Task",
    urlPathTemplate: "/tasks/{id}",
    rlsUsesHasPermission: true,
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
