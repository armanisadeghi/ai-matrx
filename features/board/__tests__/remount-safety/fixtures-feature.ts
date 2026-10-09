/**
 * Records for the feature items: the same property manager's turnover of
 * Unit 4B — the task to schedule the painter, the turnover project, a research
 * topic on rent-control rules, the leasing War Room, a workflow run, the owner
 * meeting, and the lease document. Rows carry every column of their generated
 * table type.
 */

import type { Database } from "@/types/database.types";
import { ORGANIZATION, PERSON } from "./people";
import { seed, seedFetch, seedRpc } from "./fake-backend";

type Row<S extends keyof Database, T extends string> = S extends keyof Database
  ? Database[S] extends { Tables: infer Tables }
    ? T extends keyof Tables
      ? Tables[T] extends { Row: infer R }
        ? R
        : never
      : never
    : never
  : never;

const STAMP = { created_at: "2026-09-27T15:30:00.000Z", updated_at: "2026-09-30T19:05:00.000Z" };
const PUBLISH = { published_to_web: false, published_to_web_at: null, published_to_web_by: null };

// ── Task ─────────────────────────────────────────────────────────────────────

export const TASK_ID = "6d1e2f3a-4b5c-4d6e-8f70-81a2b3c4d5e6";
export const PROJECT_ID = "2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f";

export const taskRow = {
  assignee_id: PERSON.id,
  completed_at: null,
  ...STAMP,
  created_by: PERSON.id,
  custom_fields: {},
  dedupe_key: null,
  deleted_at: null,
  description: "Book Rivera Painting for the hallway and both bedrooms; walls in Swiss Coffee.",
  due_date: "2026-10-09",
  due_time: null,
  id: TASK_ID,
  metadata: {},
  organization_id: ORGANIZATION.id,
  origin: "user",
  parent_task_id: null,
  priority: "high",
  project_id: PROJECT_ID,
  ...PUBLISH,
  recurrence_rule: null,
  reminders: [],
  settings: {},
  shown_to: null,
  source_id: null,
  source_imported_at: null,
  source_label: null,
  source_list_id: null,
  source_snapshot: null,
  source_type: null,
  source_url: null,
  start_date: null,
  status: "todo",
  timezone: "America/Los_Angeles",
  title: "Schedule the painter for Unit 4B",
  updated_by: PERSON.id,
  version: 2,
  visibility: "internal",
} satisfies Row<"projects", "tasks">;

export const projectRow = {
  ...STAMP,
  created_by: PERSON.id,
  custom_fields: {},
  deleted_at: null,
  description: "Turn Unit 4B over between the October 31 move-out and the December 1 move-in.",
  id: PROJECT_ID,
  metadata: {},
  name: "Unit 4B turnover",
  organization_id: ORGANIZATION.id,
  priority: "high",
  ...PUBLISH,
  settings: {},
  shown_to: null,
  slug: "unit-4b-turnover",
  start_date: "2026-10-01",
  status: "active",
  target_date: "2026-11-28",
  updated_by: PERSON.id,
  version: 4,
  visibility: "internal",
} satisfies Row<"projects", "projects">;

/** The reads every record page shares: where the record lives, its comments, its counts. */
function seedRecordDoors(): void {
  // features/unified-data/hub/doors.ts `RecordHomeAnswer`
  seedRpc("entity_record_home", { organization_id: ORGANIZATION.id });
  // features/unified-data/hub/doors.ts `entityRecordReadable` — the custom-fields
  // section's own first read (a SECURITY INVOKER read); no custom values yet.
  seedRpc("entity_record_read", {});
  // The "Linked records" section (AP-4, `EntityBackLinks`): no custom row links here. A read the
  // fixture did not answer is a failed read, which is never kept — the wake would ask again.
  seedRpc("entity_back_links", { target: null, items: [], next_cursor: null });
  // migrations/campaign/entityfields_the_add_control_is_absent_or_honest.sql —
  // the person owns the organization, so they may add a column.
  seedRpc("entity_field_rights", (args: unknown) => ({
    token: (args as { p_token?: string }).p_token ?? null,
    label: (args as { p_token?: string }).p_token === "project" ? "Projects" : "Tasks",
    may_declare: true,
    reason: null,
    may_fill_in: true,
  }));
  // features/rich-document/annotations/service.ts — no comment threads yet.
  seedRpc("cmt_list", []);
}

export function seedTask(): void {
  seed("projects.tasks", [taskRow]);
  seed("projects.projects", [projectRow]);
  seedRecordDoors();
  // features/tasks/redux/taskAssociationsSlice.ts — nothing linked to the task yet.
  seedRpc("get_task_associations", { task_id: TASK_ID, notes: [], files: [], messages: [], conversations: [] });
  // features/organizations/hooks/useContainerInventory.ts `ContainerCountRow`
  seedRpc("container_resource_counts", [{ resource_key: "tasks", n: 1 }]);
}

export function seedProject(): void {
  seed("projects.projects", [projectRow]);
  seed("projects.tasks", [taskRow]);
  seedRecordDoors();
  seedRpc("container_resource_counts", [{ resource_key: "tasks", n: 1 }]);
  // features/projects/service.ts `RawProjectReference` — nothing else points at it.
  seedRpc("get_project_references", []);
  // features/organizations/service/membershipsService.ts `MbrListWithUsersRow`
  seedRpc("mbr_list_with_users", [
    {
      id: "d2e3f4a5-b6c7-4d8e-9f0a-1b2c3d4e5f6a",
      organization_id: ORGANIZATION.id,
      container_id: PROJECT_ID,
      user_id: PERSON.id,
      role: "owner",
      status: "active",
      created_at: "2026-09-27T15:30:00.000Z",
      user_email: PERSON.email,
      user_display_name: "Dana Whitfield",
      user_avatar_url: null,
    },
  ]);
  // features/agent-context/redux/hierarchyThunks.ts `FullContextResponse`
  seedRpc("get_user_full_context", {
    organizations: [
      {
        id: ORGANIZATION.id,
        name: ORGANIZATION.name,
        projects: [{ id: PROJECT_ID, name: projectRow.name, organization_id: ORGANIZATION.id }],
        tasks: [{ id: TASK_ID, title: taskRow.title, project_id: PROJECT_ID, parent_task_id: null, status: taskRow.status }],
      },
    ],
  });
}

// ── Research ─────────────────────────────────────────────────────────────────

export const TOPIC_ID = "8f9a0b1c-2d3e-4f5a-8b6c-7d8e9f0a1b2c";

export const topicRow = {
  agent_config: {},
  analyses_per_keyword: 3,
  autonomy_level: "assisted",
  consecutive_refresh_failures: 0,
  ...STAMP,
  created_by: PERSON.id,
  custom_fields: {},
  default_search_params: {},
  default_search_provider: "brave",
  deleted_at: null,
  description: "What Oregon's rent-stabilization law allows for a December renewal.",
  good_scrape_threshold: 0.6,
  id: TOPIC_ID,
  intent_brief: "Maximum allowed increase for 2027 and the notice period.",
  intent_key: null,
  last_refresh_at: "2026-09-30T18:00:00.000Z",
  last_refresh_error: null,
  last_refresh_outcome: "succeeded",
  last_refresh_trigger: "manual",
  max_auto_tag_calls: 20,
  max_documents: 40,
  max_keyword_syntheses: 10,
  max_keywords: 8,
  max_tag_consolidations: 4,
  max_topic_syntheses: 2,
  metadata: {},
  name: "Oregon rent increase limits 2027",
  next_refresh_at: null,
  organization_id: ORGANIZATION.id,
  outputs: {},
  ...PUBLISH,
  refresh_claim_expires_at: null,
  refresh_claim_token: null,
  refresh_interval_hours: null,
  scrapes_per_keyword: 5,
  shown_to: null,
  status: "ready",
  tag_suggestions: null,
  template_id: null,
  tone_profile: null,
  updated_by: PERSON.id,
  version: 3,
  videos_per_keyword: 0,
  visibility: "internal",
} satisfies Row<"research", "rs_topic">;

export const REPORT_TEXT = "Oregon caps 2027 increases at 9.5%; a 90-day written notice is required.";

const reportRow = {
  agent_id: null,
  agent_type: "topic_document",
  capture_version: 1,
  content: `# ${topicRow.name}\n\n${REPORT_TEXT}\n`,
  content_structured: null,
  created_at: "2026-09-30T18:06:00.000Z",
  created_by: PERSON.id,
  custom_fields: {},
  deleted_at: null,
  error: null,
  id: "9a0b1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d",
  is_current: true,
  metadata: {},
  model_id: null,
  organization_id: ORGANIZATION.id,
  source_consolidation_ids: null,
  status: "complete",
  title: topicRow.name,
  token_usage: null,
  topic_id: TOPIC_ID,
  updated_at: "2026-09-30T18:06:00.000Z",
  updated_by: PERSON.id,
  version: 1,
} satisfies Row<"research", "rs_document">;

export function seedResearch(): void {
  seed("research.rs_topic", [topicRow]);
  seed("research.rs_document", [reportRow]);
  // features/research/service.ts — no pipeline progress beyond the finished report.
  seedRpc("get_topic_overview", null);
}

// ── War Room ─────────────────────────────────────────────────────────────────

export const WAR_ROOM_ID = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

export const warRoomRow = {
  active_thread_id: null,
  anchor_id: null,
  anchor_type: "none",
  color: "amber",
  ...STAMP,
  created_by: PERSON.id,
  custom_fields: {},
  deleted_at: null,
  description: "Lease-up for the three units turning over this fall.",
  icon: "building",
  id: WAR_ROOM_ID,
  last_opened_at: "2026-09-30T19:00:00.000Z",
  metadata: {},
  organization_id: ORGANIZATION.id,
  ...PUBLISH,
  shown_to: null,
  title: "Fall lease-up",
  updated_by: PERSON.id,
  version: 6,
  visibility: "internal",
} satisfies Row<"projects", "war_rooms">;

export function seedWarRoom(): void {
  seed("projects.war_rooms", [warRoomRow]);
}

// ── Workflow run ─────────────────────────────────────────────────────────────

export const RUN_ID = "3e4f5a6b-7c8d-4e9f-a0b1-c2d3e4f5a6b7";
export const WORKFLOW_ID = "4f5a6b7c-8d9e-4f0a-b1c2-d3e4f5a6b7c8";

export const runRow = {
  agent_id: null,
  agent_version_id: null,
  completed_at: "2026-09-30T18:12:40.000Z",
  conversation_id: null,
  ...STAMP,
  created_by: PERSON.id,
  custom_fields: {},
  definition_hash: "sha256:3c1f9e2a",
  definition_id: WORKFLOW_ID,
  definition_version_id: null,
  deleted_at: null,
  error: null,
  event_seq: 14,
  id: RUN_ID,
  input: { unit: "4B", move_out: "2026-10-31" },
  interrupt_payload: null,
  last_checkpoint_id: null,
  max_recovery_retries: 3,
  metadata: {},
  organization_id: ORGANIZATION.id,
  output: { checklist_items: 12 },
  parent_run_id: null,
  project_id: PROJECT_ID,
  ...PUBLISH,
  recovery_retry_count: 0,
  request_attribution_complete: true,
  shown_to: null,
  started_at: "2026-09-30T18:11:02.000Z",
  status: "completed",
  steps_executed: 4,
  task_id: null,
  thread_id: "run-thread-4b-turnover",
  updated_by: PERSON.id,
  version: 1,
  visibility: "internal",
} satisfies Row<"workflow", "run">;

const definitionRow = {
  card_visibility: "internal",
  category: "operations",
  channels: {},
  compiled_at: null,
  confirmed_success_count: 3,
  ...STAMP,
  created_by: PERSON.id,
  custom_fields: {},
  deleted_at: null,
  demoted_at: null,
  demotion_reason: null,
  description: "Builds the turnover checklist for a unit from its move-out date.",
  edges: [],
  engram_counter_since: null,
  engram_state: "none",
  engram_version_tags: null,
  entry_nodes: ["start"],
  grounding_score: null,
  id: WORKFLOW_ID,
  input_kind: null,
  is_active: true,
  is_archived: false,
  is_favorite: false,
  max_concurrent_runs: null,
  metadata: {},
  name: "Turnover checklist",
  nodes: [{ id: "start", type: "start", data: {} }],
  organization_id: ORGANIZATION.id,
  output_kind: null,
  project_id: null,
  promotion_threshold_k: null,
  ...PUBLISH,
  shown_to: null,
  source_definition_id: null,
  source_snapshot_at: null,
  strict_channels: false,
  tags: ["turnover"],
  task_id: null,
  updated_by: PERSON.id,
  updated_by_system: null,
  updated_by_tier: null,
  variables: {},
  version: 2,
  viewport: {},
  visibility: "internal",
  workflow_type: "user",
} satisfies Row<"workflow", "definition">;

export function seedWorkflowRun(): void {
  seed("workflow.run", [runRow]);
  seed("workflow.definition", [definitionRow]);
  seed("workflow.runtime_surface", []);
  const server = "https://server.app.matrxserver.com";
  // features/workflow-runtime/types.ts `RunRow`
  seedFetch(new RegExp(`^${server}/runs/${RUN_ID}$`), () => ({
    id: RUN_ID,
    definition_id: WORKFLOW_ID,
    status: "completed",
    input: runRow.input,
    output: runRow.output,
    error: null,
    created_at: runRow.created_at,
    completed_at: runRow.completed_at,
    metadata: {},
    conversation_id: null,
  }));
  // `RunEventRecord[]` — the durable log replayed after the row.
  seedFetch(new RegExp(`^${server}/runs/${RUN_ID}/events`), () => []);
  // features/workflow-runtime/kind-emissions/result-schema.ts `DeclaredResultSchema` (wire form)
  seedFetch(new RegExp(`^${server}/workflows/${WORKFLOW_ID}/result-schema`), () => ({
    definition_id: WORKFLOW_ID,
    version: 2,
    input_kind: null,
    output_kind: null,
    output_kind_declared: false,
    declaration_error: null,
    deliverables: [],
  }));
}

// ── Meeting ──────────────────────────────────────────────────────────────────

export const MEETING_ID = "5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d";

export const meetingRow = {
  agenda: "Unit 4B turnover budget and the December rent.",
  ai_enabled: true,
  behavior_profile: null,
  calendar_sequence: 0,
  cancellation_reason: null,
  cancelled_at: null,
  cancelled_by: null,
  ...STAMP,
  created_by: PERSON.id,
  custom_fields: {},
  deleted_at: null,
  ended_at: null,
  host_user_id: PERSON.id,
  id: MEETING_ID,
  join_before_host: false,
  kind: "scheduled",
  lobby_enabled: true,
  locked: false,
  metadata: {},
  organization_id: ORGANIZATION.id,
  ...PUBLISH,
  recording_policy: "ask",
  recurrence_rule: null,
  room_name: "harborview-4b-owner-sync",
  scheduled_duration_minutes: 30,
  scheduled_for: "2026-10-06T17:00:00.000Z",
  shown_to: null,
  slug: "harborview-4b-owner-sync",
  started_at: null,
  time_zone: "America/Los_Angeles",
  title: "Owner sync — Unit 4B turnover",
  updated_by: PERSON.id,
  version: 1,
  visibility: "internal",
} satisfies Row<"communication", "meet_meetings">;

export function seedMeeting(): void {
  // The meeting's home carries the record page's own reads (its custom-fields section).
  seedRecordDoors();
  seed("communication.meet_meetings", [meetingRow]);
  seed("communication.meet_invitees", []);
  seedRpc("meet_meeting_occurrences", []);
}

// ── Document ─────────────────────────────────────────────────────────────────

export const DOCUMENT_ID = "7b8c9d0e-1f2a-4b3c-8d4e-5f6a7b8c9d0e";

export const documentRow = {
  ...STAMP,
  created_by: PERSON.id,
  custom_fields: {},
  deleted_at: null,
  description: "Residential lease for Unit 4B, December 2026 term.",
  document_name: "Unit 4B lease — 2027",
  id: DOCUMENT_ID,
  is_public: false,
  metadata: {},
  organization_id: ORGANIZATION.id,
  original_file_id: null,
  project_id: PROJECT_ID,
  ...PUBLISH,
  shown_to: null,
  source: "created",
  task_id: null,
  updated_by: PERSON.id,
  user_id: PERSON.id,
  version: 5,
  visibility: "internal",
} satisfies Row<"workbench", "udt_documents">;

export const DOCUMENT_TEXT = "Section 4. Rent is $1,925 per month, due on the 1st.";

const documentSnapshotRow = {
  created_at: "2026-09-30T19:00:00.000Z",
  created_by: PERSON.id,
  custom_fields: {},
  document_id: DOCUMENT_ID,
  id: "aa1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
  label: null,
  metadata: {},
  origin: "autosave",
  snapshot: {
    id: "doc-unit-4b-lease",
    locale: "enUS",
    title: documentRow.document_name,
    body: {
      dataStream: `${DOCUMENT_TEXT}\r\n`,
      paragraphs: [{ startIndex: DOCUMENT_TEXT.length }],
      sectionBreaks: [{ startIndex: DOCUMENT_TEXT.length + 1 }],
    },
    documentStyle: {},
  },
} satisfies Row<"workbench", "udt_document_snapshots">;

export function seedDocument(): void {
  seed("workbench.udt_documents", [documentRow]);
  seed("workbench.udt_document_snapshots", [documentSnapshotRow]);
  // utils/permissions/shareLinks.ts `getShareCapabilities`
  seedRpc("get_share_capabilities", { publish_lane: "published_to_web", public_state_kind: null, public_state_column: null });
}

// ── Data table and record (the record store, `custom.*`) ─────────────────────

export const TABLE_ID = "9c0d1e2f-3a4b-4c5d-8e6f-7a8b9c0d1e2f";
export const DATA_RECORD_ID = "0d1e2f3a-4b5c-4d6e-8f7a-8b9c0d1e2f3a";

export function seedDataTable(): void {
  // features/unified-data/objectOrganization.ts `WhereIdOpens`
  seedRpc("where_id_opens", (args: Record<string, unknown> | undefined) => {
    const id = String((args as { p_id?: string } | undefined)?.p_id);
    if (id === TABLE_ID) return { kind: "table", organization_id: ORGANIZATION.id, path: `/data/${TABLE_ID}`, live: true, resolved_id: id };
    if (id === DATA_RECORD_ID)
      return { kind: "record", organization_id: ORGANIZATION.id, path: `/data/${TABLE_ID}?record=${id}`, live: true, resolved_id: id };
    return null;
  });
  // features/unified-data/hub/doors.ts — nothing shared with this person from elsewhere.
  seedRpc("tables_shared_with_me", []);
  // The records client's row actions for the table (none declared).
  seedRpc("row_actions", []);
  // features/data-tables/data-source/record-store-grid.ts — no row actions declared.
  seedRpc("record_change_actions", { entity_type: "record", table_id: TABLE_ID, actions: [] });
}

/**
 * The record store's grid and peek (`@ai-matrx/records-ui` `TablePage` / `Peek`)
 * and its store hooks (`@ai-matrx/records/react`) stand in at the package
 * boundary — the grid is the package's own engine. Each stand-in counts its
 * mounts: a wake that unmounts the grid (what the gates did) shows as a mount.
 */
export const recordsEngine = { gridMounts: 0, peekMounts: 0 };
export const RENT_ROLL = { id: TABLE_ID, name: "Rent roll", title_field: "unit" };
export const UNIT_4B_ROW = { id: DATA_RECORD_ID, unit: "Unit 4B", rent: 1925, tenant: "Priya Raman" };
