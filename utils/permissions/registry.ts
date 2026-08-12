import { resolveEntityDoors } from "@/components/official/entity-ref/doors";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";

/**
 * Shareable Resource Registry — TypeScript mirror
 *
 * Single source of truth lives in the Postgres
 * `platform.shareable_resource_registry` table. This file mirrors the same data
 * so the FE doesn't have to fetch the registry on every page load. The TS↔DB
 * mirror is verified at test time by
 * `utils/permissions/__tests__/registry.parity.test.ts` — if a row is added to
 * the DB and not here (or vice versa) the test fails.
 *
 * REGENERATE (do not hand-edit rows): after any registry migration run
 *   `pnpm tsx scripts/regen-shareable-registry-snapshot.ts`
 * to refresh the DB snapshot, then update the rows below to match it.
 *
 * ── Token vs. table (post-2026-canonicalization) ─────────────────────────────
 * Two distinct canonical values live on every row; DO NOT conflate them:
 *   • `resourceType` — the ENTITY TOKEN. This is the object key, the value
 *     stored in `iam.permissions.resource_type`, and the `p_resource_type`
 *     passed to every share RPC. Reference resources by this, never by table.
 *   • `tableName` (+ `schemaName`) — the PHYSICAL table (schema.table) for
 *     direct supabase-js `.from()` reads. Equals the DB registry `table_name`.
 * They coincided before the reorg (public tables named after their token) and
 * diverge now (token `note` → `workbench.notes`, token `file` → `files.files`).
 * For permission/RPC/`iam.permissions` work use `resourceType`; for a direct
 * table read use `.schema(schemaName).from(tableName)`.
 */

export interface ShareableResourceEntry {
  /**
   * The entity TOKEN — public alias used in TS / RPC arguments / UI props and
   * stored in `iam.permissions.resource_type`. This is what you pass to the
   * share RPCs; it is NOT the physical table name.
   */
  resourceType: string;

  /**
   * The PHYSICAL Postgres table name (within `schemaName`), mirroring the DB
   * registry `table_name`. Used for direct `.from()` reads. NOT the permissions
   * key — reference resources by `resourceType`. Multiple tokens may share a
   * physical name across schemas (e.g. `definition` in agent/app/skill/workflow).
   */
  tableName: string;

  /** Primary-key column on the resource table. Almost always 'id'. */
  idColumn: string;

  /** Column holding the owner's auth.uid(). Canonical tables use 'created_by'. */
  ownerColumn: string;

  /**
   * Column holding the public-visibility boolean, when the table has one.
   * Null means only “no legacy boolean is declared”; canonical enum tables and
   * types with no public-state column both use null. Call
   * `getShareCapabilities()` to resolve the verified physical state column.
   */
  isPublicColumn: string | null;

  /** Human-readable label used in the share modal title and emails. */
  displayLabel: string;

  /**
   * Optional signed-in destination pattern. `{id}` is substituted with the
   * resource id. No-login share links use the generic `/s/[token]` route.
   */
  urlPathTemplate: string;

  /**
   * When false, the table's RLS does NOT call has_permission()/has_access().
   * A permission grant inserts but does not actually grant the grantee access.
   * Surfaces broken end-to-end states explicitly.
   */
  rlsUsesHasPermission: boolean;

  /**
   * Non-`public` Postgres schema the resource table lives in. supabase-js
   * reaches it via `.schema(schemaName)`. Omitted ⇒ `public`. FE-only — not
   * part of the DB-registry parity comparison.
   */
  schemaName?: string;
}

/**
 * The canonical client-side mirror of platform.shareable_resource_registry.
 * Verified against the DB by the parity test. Regenerate rows from the DB — do
 * not hand-tune individual fields.
 */
export const SHAREABLE_RESOURCE_REGISTRY = {
  agent: {
    resourceType: "agent",
    tableName: "definition",
    schemaName: "agent",
    idColumn: "id",
    ownerColumn: "created_by",
    isPublicColumn: null,
    displayLabel: "Agent",
    urlPathTemplate: "/agents/{id}",
    rlsUsesHasPermission: true,
  },
  agent_card: {
    resourceType: "agent_card",
    tableName: "card",
    schemaName: "agent",
    idColumn: "id",
    ownerColumn: "created_by",
    isPublicColumn: null,
    displayLabel: "Agent Card",
    urlPathTemplate: "/agents/card/{id}",
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
  app: {
    resourceType: "app",
    tableName: "definition",
    schemaName: "app",
    idColumn: "id",
    ownerColumn: "created_by",
    isPublicColumn: null,
    displayLabel: "App",
    urlPathTemplate: "/apps/{id}",
    rlsUsesHasPermission: true,
  },
  assessment: {
    resourceType: "assessment",
    tableName: "assessment",
    schemaName: "education",
    idColumn: "id",
    ownerColumn: "created_by",
    isPublicColumn: null,
    displayLabel: "Assessment",
    urlPathTemplate: "/education/quizzes/{id}",
    rlsUsesHasPermission: true,
  },
  batch_provider_batch: {
    resourceType: "batch_provider_batch",
    tableName: "auto_ingest_batch",
    idColumn: "id",
    ownerColumn: "user_id",
    isPublicColumn: null,
    displayLabel: "Auto-ingest Batch",
    urlPathTemplate: "/administration/knowledge/kg-cost/batches/{id}",
    rlsUsesHasPermission: false,
  },
  canvas_item: {
    resourceType: "canvas_item",
    tableName: "canvas_items",
    schemaName: "canvas",
    idColumn: "id",
    ownerColumn: "created_by",
    isPublicColumn: null,
    displayLabel: "Canvas Item",
    urlPathTemplate: "/canvas/{id}",
    rlsUsesHasPermission: true,
  },
  context_item: {
    resourceType: "context_item",
    tableName: "context_items",
    schemaName: "context",
    idColumn: "id",
    ownerColumn: "created_by",
    isPublicColumn: "visibility",
    displayLabel: "Context Item",
    urlPathTemplate: "",
    rlsUsesHasPermission: false,
  },
  code_file: {
    resourceType: "code_file",
    tableName: "code_files",
    schemaName: "code",
    idColumn: "id",
    ownerColumn: "created_by",
    isPublicColumn: null,
    displayLabel: "Code File",
    urlPathTemplate: "/code/files/{id}",
    rlsUsesHasPermission: true,
  },
  code_folder: {
    resourceType: "code_folder",
    tableName: "code_file_folders",
    schemaName: "code",
    idColumn: "id",
    ownerColumn: "created_by",
    isPublicColumn: null,
    displayLabel: "Code Folder",
    urlPathTemplate: "/code/folders/{id}",
    rlsUsesHasPermission: true,
  },
  code_repository: {
    resourceType: "code_repository",
    tableName: "code_repositories",
    schemaName: "code",
    idColumn: "id",
    ownerColumn: "created_by",
    isPublicColumn: null,
    displayLabel: "Code Repository",
    urlPathTemplate: "/code/repos/{id}",
    rlsUsesHasPermission: true,
  },
  message_template: {
    resourceType: "message_template",
    tableName: "message_template",
    idColumn: "id",
    ownerColumn: "user_id",
    isPublicColumn: null,
    displayLabel: "Message Template",
    urlPathTemplate: "/settings/message-templates/{id}",
    rlsUsesHasPermission: true,
  },
  conversation: {
    resourceType: "conversation",
    tableName: "conversation",
    schemaName: "chat",
    idColumn: "id",
    ownerColumn: "created_by",
    isPublicColumn: null,
    displayLabel: "Conversation",
    urlPathTemplate: "/chat/{id}",
    rlsUsesHasPermission: true,
  },
  data_store: {
    resourceType: "data_store",
    tableName: "data_stores",
    schemaName: "rag",
    idColumn: "id",
    ownerColumn: "created_by",
    // 'visibility' is the canonical enum, not a boolean is_public column — a
    // non-null value here wrongly routes sharing through make_resource_public.
    isPublicColumn: null,
    displayLabel: "Data Store",
    urlPathTemplate: "/rag/data-stores/{id}",
    rlsUsesHasPermission: false,
  },
  dm_conversation: {
    resourceType: "dm_conversation",
    tableName: "dm_conversations",
    schemaName: "communication",
    idColumn: "id",
    ownerColumn: "created_by",
    isPublicColumn: null,
    displayLabel: "Direct Conversation",
    urlPathTemplate: "/messages/{id}",
    rlsUsesHasPermission: true,
  },
  fc_card: {
    resourceType: "fc_card",
    tableName: "fc_card",
    schemaName: "education",
    idColumn: "id",
    ownerColumn: "created_by",
    isPublicColumn: null,
    displayLabel: "Flashcard",
    urlPathTemplate: "/education/flashcards/card/{id}",
    rlsUsesHasPermission: true,
  },
  fc_set: {
    resourceType: "fc_set",
    tableName: "fc_set",
    schemaName: "education",
    idColumn: "id",
    ownerColumn: "created_by",
    isPublicColumn: null,
    displayLabel: "Flashcard Set",
    urlPathTemplate: "/education/flashcards/{id}",
    rlsUsesHasPermission: true,
  },
  feature_doc: {
    resourceType: "feature_doc",
    tableName: "feature_docs",
    schemaName: "admin",
    idColumn: "id",
    ownerColumn: "created_by",
    isPublicColumn: null,
    displayLabel: "Feature Doc",
    urlPathTemplate: "/admin/docs/{slug}",
    rlsUsesHasPermission: true,
  },
  file: {
    resourceType: "file",
    tableName: "files",
    schemaName: "files",
    idColumn: "id",
    ownerColumn: "created_by",
    isPublicColumn: null,
    displayLabel: "File",
    urlPathTemplate: "/files/f/{id}",
    rlsUsesHasPermission: true,
  },
  file_analysis: {
    resourceType: "file_analysis",
    tableName: "analysis",
    schemaName: "files",
    idColumn: "file_id",
    ownerColumn: "owner_id",
    isPublicColumn: null,
    displayLabel: "File Analysis",
    urlPathTemplate: "/files/{id}",
    rlsUsesHasPermission: false,
  },
  file_entities: {
    resourceType: "file_entities",
    tableName: "entities",
    schemaName: "files",
    idColumn: "id",
    ownerColumn: "owner_id",
    isPublicColumn: null,
    displayLabel: "File Entity",
    urlPathTemplate: "/files/{id}",
    rlsUsesHasPermission: false,
  },
  file_overrides: {
    resourceType: "file_overrides",
    tableName: "overrides",
    schemaName: "files",
    idColumn: "id",
    ownerColumn: "owner_id",
    isPublicColumn: null,
    displayLabel: "File Override",
    urlPathTemplate: "/files/{id}",
    rlsUsesHasPermission: false,
  },
  file_page_annotations: {
    resourceType: "file_page_annotations",
    tableName: "page_annotations",
    schemaName: "files",
    idColumn: "id",
    ownerColumn: "owner_id",
    isPublicColumn: null,
    displayLabel: "Page Annotation",
    urlPathTemplate: "/files/{id}",
    rlsUsesHasPermission: false,
  },
  file_pages: {
    resourceType: "file_pages",
    tableName: "pages",
    schemaName: "files",
    idColumn: "id",
    ownerColumn: "owner_id",
    isPublicColumn: null,
    displayLabel: "File Page",
    urlPathTemplate: "/files/{id}",
    rlsUsesHasPermission: false,
  },
  folder: {
    resourceType: "folder",
    tableName: "folders",
    schemaName: "files",
    idColumn: "id",
    ownerColumn: "created_by",
    isPublicColumn: null,
    displayLabel: "Folder",
    urlPathTemplate: "/files/folder/{id}",
    rlsUsesHasPermission: true,
  },
  learn_doc: {
    resourceType: "learn_doc",
    tableName: "learn_doc",
    schemaName: "education",
    idColumn: "id",
    ownerColumn: "created_by",
    isPublicColumn: null,
    displayLabel: "Study Guide",
    urlPathTemplate: "/education/learn/{slug}",
    rlsUsesHasPermission: true,
  },
  note: {
    resourceType: "note",
    tableName: "notes",
    schemaName: "workbench",
    idColumn: "id",
    ownerColumn: "created_by",
    isPublicColumn: null,
    displayLabel: "Note",
    urlPathTemplate: "/notes/{id}",
    rlsUsesHasPermission: true,
  },
  note_folder: {
    resourceType: "note_folder",
    tableName: "note_folders",
    schemaName: "workbench",
    idColumn: "id",
    ownerColumn: "created_by",
    isPublicColumn: null,
    displayLabel: "Note Folder",
    urlPathTemplate: "/notes?folder={id}",
    rlsUsesHasPermission: true,
  },
  pdf_redaction_audit: {
    resourceType: "pdf_redaction_audit",
    tableName: "pdf_redaction_audits",
    schemaName: "pdf",
    idColumn: "id",
    ownerColumn: "user_id",
    isPublicColumn: null,
    displayLabel: "Redaction Audit",
    urlPathTemplate: "/files/{id}",
    rlsUsesHasPermission: false,
  },
  project: {
    resourceType: "project",
    tableName: "projects",
    schemaName: "workspace",
    idColumn: "id",
    ownerColumn: "created_by",
    isPublicColumn: null,
    displayLabel: "Project",
    urlPathTemplate: "/projects/{id}",
    rlsUsesHasPermission: true,
  },
  quiz_session: {
    resourceType: "quiz_session",
    tableName: "quiz_sessions",
    schemaName: "education",
    idColumn: "id",
    ownerColumn: "user_id",
    isPublicColumn: null,
    displayLabel: "Quiz",
    urlPathTemplate: "/quizzes/{id}",
    rlsUsesHasPermission: true,
  },
  redaction_mapping: {
    resourceType: "redaction_mapping",
    tableName: "redaction_mapping",
    schemaName: "pdf",
    idColumn: "id",
    ownerColumn: "owner_id",
    isPublicColumn: null,
    displayLabel: "Redaction Mapping",
    urlPathTemplate: "/files/{id}",
    rlsUsesHasPermission: false,
  },
  research_template: {
    resourceType: "research_template",
    tableName: "rs_template",
    schemaName: "research",
    idColumn: "id",
    ownerColumn: "created_by",
    isPublicColumn: null,
    displayLabel: "Research Template",
    urlPathTemplate: "/research/templates/{id}",
    rlsUsesHasPermission: true,
  },
  research_topic: {
    resourceType: "research_topic",
    tableName: "rs_topic",
    schemaName: "research",
    idColumn: "id",
    ownerColumn: "created_by",
    isPublicColumn: null,
    displayLabel: "Research Topic",
    urlPathTemplate: "/research/topics/{id}",
    rlsUsesHasPermission: true,
  },
  sandbox_instance: {
    resourceType: "sandbox_instance",
    tableName: "sandbox_instances",
    idColumn: "id",
    ownerColumn: "user_id",
    isPublicColumn: null,
    displayLabel: "Sandbox",
    urlPathTemplate: "/sandbox/{id}",
    rlsUsesHasPermission: true,
  },
  scope_association_suggestion: {
    resourceType: "scope_association_suggestion",
    tableName: "scope_association_suggestions",
    schemaName: "rag",
    idColumn: "id",
    ownerColumn: "user_id",
    isPublicColumn: null,
    displayLabel: "Scope Suggestion",
    urlPathTemplate: "/scopes/suggestions/{id}",
    rlsUsesHasPermission: false,
  },
  scope_item_value_suggestion: {
    resourceType: "scope_item_value_suggestion",
    tableName: "scope_item_value_suggestions",
    schemaName: "rag",
    idColumn: "id",
    ownerColumn: "user_id",
    isPublicColumn: null,
    displayLabel: "Scope Item Value Suggestion",
    urlPathTemplate: "/scopes/item-suggestions/{id}",
    rlsUsesHasPermission: false,
  },
  skill: {
    resourceType: "skill",
    tableName: "definition",
    schemaName: "skill",
    idColumn: "id",
    ownerColumn: "created_by",
    isPublicColumn: null,
    displayLabel: "Skill",
    urlPathTemplate: "/skills/{id}",
    rlsUsesHasPermission: true,
  },
  studio_session: {
    resourceType: "studio_session",
    tableName: "studio_sessions",
    schemaName: "transcripts",
    idColumn: "id",
    ownerColumn: "created_by",
    isPublicColumn: null,
    displayLabel: "Audio Session",
    urlPathTemplate: "/transcripts/studio?session={id}",
    rlsUsesHasPermission: true,
  },
  study_media: {
    resourceType: "study_media",
    tableName: "study_media",
    schemaName: "education",
    idColumn: "id",
    ownerColumn: "created_by",
    isPublicColumn: null,
    displayLabel: "Study Media",
    urlPathTemplate: "/education/media/{id}",
    rlsUsesHasPermission: true,
  },
  task: {
    resourceType: "task",
    tableName: "tasks",
    schemaName: "workspace",
    idColumn: "id",
    ownerColumn: "created_by",
    isPublicColumn: null,
    displayLabel: "Task",
    urlPathTemplate: "/tasks/{id}",
    rlsUsesHasPermission: true,
  },
  thread: {
    resourceType: "thread",
    tableName: "threads",
    schemaName: "workspace",
    idColumn: "id",
    ownerColumn: "created_by",
    isPublicColumn: null,
    displayLabel: "Thread",
    urlPathTemplate: "/war-room/all",
    rlsUsesHasPermission: true,
  },
  transcript: {
    resourceType: "transcript",
    tableName: "transcripts",
    schemaName: "transcripts",
    idColumn: "id",
    ownerColumn: "created_by",
    isPublicColumn: null,
    displayLabel: "Transcript",
    urlPathTemplate: "/transcripts/{id}",
    rlsUsesHasPermission: true,
  },
  dataset: {
    resourceType: "dataset",
    tableName: "udt_datasets",
    schemaName: "workbench",
    idColumn: "id",
    ownerColumn: "user_id",
    isPublicColumn: "is_public",
    displayLabel: "Dataset",
    urlPathTemplate: "/data/{id}",
    rlsUsesHasPermission: true,
  },
  udt_document: {
    resourceType: "udt_document",
    tableName: "udt_documents",
    schemaName: "workbench",
    idColumn: "id",
    ownerColumn: "user_id",
    isPublicColumn: "is_public",
    displayLabel: "Document",
    urlPathTemplate: "/documents/{id}",
    rlsUsesHasPermission: true,
  },
  structured_list: {
    resourceType: "structured_list",
    tableName: "udt_structured_lists",
    schemaName: "workbench",
    idColumn: "id",
    ownerColumn: "user_id",
    isPublicColumn: "is_public",
    displayLabel: "Structured List",
    urlPathTemplate: "/lists/{id}",
    rlsUsesHasPermission: true,
  },
  // Active DB registry row that predates this mirror; surfaced by the parity
  // snapshot regen during the structured-list rename. Mirrored here so the
  // TS↔DB guard stays green.
  scope: {
    resourceType: "scope",
    tableName: "scopes",
    schemaName: "context",
    idColumn: "id",
    ownerColumn: "created_by",
    // 'visibility' is the canonical enum, not a boolean is_public column — a
    // non-null value here wrongly routes sharing through make_resource_public.
    isPublicColumn: null,
    displayLabel: "Scope",
    urlPathTemplate: "/scopes/{id}",
    rlsUsesHasPermission: false,
  },
  workbook: {
    resourceType: "workbook",
    tableName: "udt_workbooks",
    schemaName: "workbench",
    idColumn: "id",
    ownerColumn: "user_id",
    isPublicColumn: "is_public",
    displayLabel: "Workbook",
    urlPathTemplate: "/workbooks/{id}",
    rlsUsesHasPermission: true,
  },
  user_analysis_preference: {
    resourceType: "user_analysis_preference",
    tableName: "user_analysis_preferences",
    schemaName: "users",
    idColumn: "user_id",
    ownerColumn: "user_id",
    isPublicColumn: null,
    displayLabel: "Analysis Preferences",
    urlPathTemplate: "/settings/analysis",
    rlsUsesHasPermission: false,
  },
  web_site: {
    resourceType: "web_site",
    tableName: "site",
    schemaName: "web",
    idColumn: "id",
    ownerColumn: "created_by",
    isPublicColumn: null,
    displayLabel: "Site",
    urlPathTemplate: "/marketing/sites/{id}",
    rlsUsesHasPermission: true,
  },
  web_page: {
    resourceType: "web_page",
    tableName: "page",
    schemaName: "web",
    idColumn: "id",
    ownerColumn: "created_by",
    isPublicColumn: null,
    displayLabel: "Canonical Page",
    urlPathTemplate: "/marketing/pages/{id}",
    rlsUsesHasPermission: true,
  },
  web_property: {
    resourceType: "web_property",
    tableName: "property",
    schemaName: "web",
    idColumn: "id",
    ownerColumn: "created_by",
    isPublicColumn: null,
    displayLabel: "Marketing Property",
    urlPathTemplate: "/marketing/properties/{id}",
    rlsUsesHasPermission: true,
  },
  web_screenshot: {
    resourceType: "web_screenshot",
    tableName: "screenshot",
    schemaName: "web",
    idColumn: "id",
    ownerColumn: "created_by",
    isPublicColumn: null,
    displayLabel: "Web Screenshot",
    urlPathTemplate: "/marketing/screenshots/{id}",
    rlsUsesHasPermission: true,
  },
  web_snapshot: {
    resourceType: "web_snapshot",
    tableName: "snapshot",
    schemaName: "web",
    idColumn: "id",
    ownerColumn: "created_by",
    isPublicColumn: null,
    displayLabel: "Web Snapshot",
    urlPathTemplate: "/marketing/snapshots/{id}",
    rlsUsesHasPermission: true,
  },
  war_room: {
    resourceType: "war_room",
    tableName: "war_rooms",
    schemaName: "workspace",
    idColumn: "id",
    ownerColumn: "created_by",
    isPublicColumn: null,
    displayLabel: "War Room",
    urlPathTemplate: "/war-room/{id}",
    rlsUsesHasPermission: true,
  },
  wc_claim: {
    resourceType: "wc_claim",
    tableName: "wc_claim",
    schemaName: "legal",
    idColumn: "id",
    ownerColumn: "created_by",
    isPublicColumn: null,
    displayLabel: "WC Claim",
    urlPathTemplate: "/legal/wc/{id}",
    rlsUsesHasPermission: true,
  },
  wf_node_data_slot: {
    resourceType: "wf_node_data_slot",
    tableName: "node_data_slot",
    schemaName: "workflow",
    idColumn: "id",
    ownerColumn: "created_by",
    isPublicColumn: null,
    displayLabel: "Workflow Node Data Slot",
    urlPathTemplate: "/workflows/{id}",
    rlsUsesHasPermission: false,
  },
  workflow_run: {
    resourceType: "workflow_run",
    tableName: "run",
    schemaName: "workflow",
    idColumn: "id",
    ownerColumn: "created_by",
    isPublicColumn: null,
    displayLabel: "Workflow Run",
    urlPathTemplate: "/runs/{id}",
    rlsUsesHasPermission: true,
  },
  workflow_template: {
    resourceType: "workflow_template",
    tableName: "template",
    schemaName: "workflow",
    idColumn: "id",
    ownerColumn: "created_by",
    isPublicColumn: null,
    displayLabel: "Workflow Template",
    urlPathTemplate: "/workflows/templates/{id}",
    rlsUsesHasPermission: true,
  },
  workflow_trigger: {
    resourceType: "workflow_trigger",
    tableName: "trigger",
    schemaName: "workflow",
    idColumn: "id",
    ownerColumn: "created_by",
    isPublicColumn: null,
    displayLabel: "Workflow Trigger",
    urlPathTemplate: "/workflows/{id}/triggers/{id}",
    rlsUsesHasPermission: true,
  },
  workflow: {
    resourceType: "workflow",
    tableName: "definition",
    schemaName: "workflow",
    idColumn: "id",
    ownerColumn: "created_by",
    isPublicColumn: null,
    displayLabel: "Workflow",
    urlPathTemplate: "/workflows/{id}",
    rlsUsesHasPermission: true,
  },
  // Live DB registry rows that predate this mirror — surfaced by the
  // 2026-07-29 snapshot regen (the working_document registration). Mirrored
  // here so the TS↔DB parity guard stays green.
  content_ir_kind_instance: {
    resourceType: "content_ir_kind_instance",
    tableName: "kind_instance",
    schemaName: "content_ir",
    idColumn: "id",
    ownerColumn: "created_by",
    // NOTE: the DB row declares 'visibility' (the canonical enum) in the
    // boolean is_public_column slot — mirrored verbatim for parity; flagged in
    // FOUND_DEFECTS (it routes ShareModal through make_resource_public).
    isPublicColumn: "visibility",
    displayLabel: "Kind Instance",
    urlPathTemplate: "/shapes/instances/{id}",
    rlsUsesHasPermission: true,
  },
  crm_campaign: {
    resourceType: "crm_campaign",
    tableName: "campaign",
    schemaName: "crm",
    idColumn: "id",
    ownerColumn: "created_by",
    isPublicColumn: null,
    displayLabel: "Campaign",
    urlPathTemplate: "/crm/campaigns/{id}",
    rlsUsesHasPermission: true,
  },
  party: {
    resourceType: "party",
    tableName: "party",
    schemaName: "crm",
    idColumn: "id",
    ownerColumn: "created_by",
    isPublicColumn: null,
    displayLabel: "Entity",
    urlPathTemplate: "/crm/{id}",
    rlsUsesHasPermission: true,
  },
  seo_collection_run: {
    resourceType: "seo_collection_run",
    tableName: "collection_run",
    schemaName: "seo",
    idColumn: "id",
    ownerColumn: "created_by",
    isPublicColumn: null,
    displayLabel: "SEO Collection Run",
    urlPathTemplate: "/marketing/seo/collections/{id}",
    rlsUsesHasPermission: true,
  },
  seo_change_set: {
    resourceType: "seo_change_set",
    tableName: "change_set",
    schemaName: "seo",
    idColumn: "id",
    ownerColumn: "created_by",
    isPublicColumn: null,
    displayLabel: "SEO Change",
    urlPathTemplate: "/marketing/changes/{id}",
    rlsUsesHasPermission: false,
  },
  seo_keyword: {
    resourceType: "seo_keyword",
    tableName: "keyword",
    schemaName: "seo",
    idColumn: "id",
    ownerColumn: "created_by",
    isPublicColumn: null,
    displayLabel: "SEO Keyword",
    urlPathTemplate: "/seo/keywords/{id}",
    rlsUsesHasPermission: false,
  },
  youtube_search: {
    resourceType: "youtube_search",
    tableName: "youtube_search",
    schemaName: "research",
    idColumn: "id",
    ownerColumn: "created_by",
    isPublicColumn: null,
    displayLabel: "YouTube Search",
    urlPathTemplate: "/marketing/discovery/youtube?search={id}",
    rlsUsesHasPermission: true,
  },
  expertise_pack: {
    resourceType: "expertise_pack",
    tableName: "expertise_pack",
    schemaName: "platform",
    idColumn: "id",
    ownerColumn: "created_by",
    isPublicColumn: null,
    displayLabel: "Expertise Pack",
    urlPathTemplate: "/expertise/{id}",
    rlsUsesHasPermission: true,
  },
  growth_loop_run: {
    resourceType: "growth_loop_run",
    tableName: "loop_run",
    schemaName: "growth",
    idColumn: "id",
    ownerColumn: "created_by",
    isPublicColumn: null,
    displayLabel: "Growth Loop Run",
    urlPathTemplate: "/marketing/growth-loop/{id}",
    rlsUsesHasPermission: true,
  },
  web_brand: {
    resourceType: "web_brand",
    tableName: "brand",
    schemaName: "web",
    idColumn: "id",
    ownerColumn: "created_by",
    isPublicColumn: null,
    displayLabel: "Brand",
    urlPathTemplate: "/marketing/brands/{id}",
    rlsUsesHasPermission: true,
  },
  working_document: {
    resourceType: "working_document",
    tableName: "working_documents",
    schemaName: "workbench",
    idColumn: "id",
    ownerColumn: "created_by",
    isPublicColumn: null,
    displayLabel: "Working Document",
    // No standalone route: the in-app destination opens a NEW chat with the
    // document linked (ChatRoomClient consumes ?attachDoc= on fresh routes).
    urlPathTemplate: "/chat/new?attachDoc={id}",
    rlsUsesHasPermission: true,
  },
} as const satisfies Record<string, ShareableResourceEntry>;

/**
 * Union of all valid resource-type tokens. Exactly mirrors the registry keys.
 */
export type ResourceType = keyof typeof SHAREABLE_RESOURCE_REGISTRY;

/** Ordered list of resource-type tokens (useful for tests, dropdowns, etc.) */
export const RESOURCE_TYPES = Object.keys(
  SHAREABLE_RESOURCE_REGISTRY,
) as ResourceType[];

/**
 * Look up a registry entry by token OR physical table_name. Returns undefined
 * for unregistered types so callers can fail gracefully (the DB will reject any
 * subsequent write either way). Prefer the token; table_name lookup is a
 * best-effort convenience and is ambiguous when tokens share a physical name.
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
 * Resolve a resource type to its PHYSICAL Postgres table name. Throws if the
 * type isn't registered. NOTE: for `iam.permissions.resource_type` filters and
 * share-RPC arguments use the TOKEN (`resourceType`) instead — this returns the
 * physical table, which differs from the token on canonical tables.
 */
export function resolveTableName(resourceType: string): string {
  const entry = getShareableResource(resourceType);
  if (!entry) {
    throw new Error(
      `Unknown shareable resource type: ${resourceType}. Register it in platform.shareable_resource_registry (see utils/permissions/registry.ts and features/sharing/FEATURE.md).`,
    );
  }
  return entry.tableName;
}

/**
 * Resolve a resource type to its canonical ENTITY TOKEN — the value stored in
 * `iam.permissions.resource_type` and passed to the share RPCs. Throws if the
 * type isn't registered. Use this (never resolveTableName) for any
 * permissions/grant query or RPC call.
 */
export function resolveResourceToken(resourceType: string): string {
  const entry = getShareableResource(resourceType);
  if (!entry) {
    throw new Error(
      `Unknown shareable resource type: ${resourceType}. Register it in platform.shareable_resource_registry (see utils/permissions/registry.ts and features/sharing/FEATURE.md).`,
    );
  }
  return entry.resourceType;
}

/** Human-readable label for a resource type (replaces the legacy map). */
export function getResourceTypeLabel(resourceType: string): string {
  return getShareableResource(resourceType)?.displayLabel ?? resourceType;
}

/**
 * Build the share path for a resource. Returns a relative path, or `null` when
 * we genuinely cannot open this resource — the caller must handle null and say
 * so honestly rather than rendering a broken link.
 *
 * THE DOOR LAW, and specifically the "one canonical path per operation" rule:
 * route truth is the ENTITY REGISTRY (`features/scopes/registry`), so that is
 * consulted first. `url_path_template` in `platform.shareable_resource_registry`
 * is a second, DB-side route authority that drifted badly — it still advertises
 * `/apps/{id}` (the real route is `/agent-apps/{id}`), `/skills/{id}`,
 * `/workflows/{id}`, `/quizzes/{id}`, `/flashcards/{id}`, `/code/files/{id}`,
 * `/runs/{id}` and `/scopes/{id}`, none of which exist. It is now the FALLBACK,
 * used only for resources the entity registry doesn't cover.
 *
 * Two guesses were removed, both of which produced 404s that reached other
 * people:
 *   - the `/${resourceType}/${resourceId}` fabrication for unregistered types;
 *   - templates that still contain a placeholder after substitution — either a
 *     non-id key (`{slug}`) or a second distinct segment the template can't
 *     express (`/workflows/{id}/triggers/{id}`).
 */
export function getResourceSharePath(
  resourceType: string,
  resourceId: string,
): string | null {
  const registryHref = resolveEntityDoors(resourceType, resourceId).href;
  if (registryHref) return registryHref;

  // A REGISTERED token with no `hrefFor` is a decision, not a gap: we looked and
  // there is no route (`workflow` lives in workflow-studio; `skill` is
  // admin-only). Falling through to the template here would hand back exactly
  // the stale `/workflows/{id}` and `/skills/{id}` this function exists to stop.
  // Only a resource type the entity registry does not know at all may fall back.
  if (tryGetEntityInfo(resourceType)) return null;

  const entry = getShareableResource(resourceType);
  if (!entry?.urlPathTemplate) return null;

  const path = entry.urlPathTemplate.replace("{id}", resourceId);
  return /\{[^}]*\}/.test(path) ? null : path;
}
