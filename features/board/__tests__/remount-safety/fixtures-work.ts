/**
 * Records for the work items (note, chat, file): one property manager's
 * turnover of Unit 4B. Rows carry every column of their generated table type.
 */

import type { Database } from "@/types/database.types";
import { ORGANIZATION, PERSON } from "./people";
import { seed, seedFetch, seedRpc } from "./fake-backend";

export const NOTE_ID = "3f9a1c2e-8b4d-4e6f-a1b2-c3d4e5f60718";
export const NOTE_TEXT = "Paint touch-ups in the hallway and both bedrooms.";

const note = {
  id: NOTE_ID,
  label: "Unit 4B turnover checklist",
  content: NOTE_TEXT,
  content_hash: null,
  content_preview: NOTE_TEXT,
  created_at: "2026-09-28T15:00:00.000Z",
  created_by: PERSON.id,
  custom_fields: {},
  deleted_at: null,
  file_path: null,
  folder_id: null,
  folder_name: "Turnovers",
  last_device_id: null,
  metadata: {},
  organization_id: ORGANIZATION.id,
  position: 0,
  project_id: null,
  published_to_web: false,
  published_to_web_at: null,
  published_to_web_by: null,
  search_engine_indexed: null,
  shown_to: null,
  sync_version: 3,
  tags: ["turnover", "unit-4b"],
  task_id: null,
  updated_at: "2026-09-30T18:22:00.000Z",
  updated_by: PERSON.id,
  version: 3,
  visibility: "personal",
} satisfies Database["workbench"]["Tables"]["notes"]["Row"];

export function seedNote(): void {
  seed("workbench.notes", [note]);
  seedRpc("get_notes_shared_with_me", []);
  // The notes provider owns `custom_fields` and reads the note's values once
  // (features/unified-data/customFieldsRead.ts) — no custom values yet.
  seedRpc("entity_record_read", {});
}

// ── Chat ─────────────────────────────────────────────────────────────────────

export const CONVERSATION_ID = "9e2b4c71-5a3d-4f08-b6e1-2c7d9a0f4b38";
const CHAT_AGENT_ID = "4a7c2e19-0b3d-4f6a-9e85-1d2c3b4a5f60";
const SERVER = "https://server.app.matrxserver.com";

const conversation = {
  app_instance_id: null,
  cache_state: {},
  config: {},
  conversation_type: "chat",
  created_at: "2026-10-01T16:40:00.000Z",
  created_by: PERSON.id,
  custom_fields: {},
  deleted_at: null,
  description: null,
  exclude_from_kg: false,
  forked_at_position: null,
  forked_from_id: null,
  host_value_names: [],
  id: CONVERSATION_ID,
  initial_agent_id: CHAT_AGENT_ID,
  initial_agent_version_id: null,
  is_ephemeral: false,
  is_favorite: false,
  keywords: null,
  last_context_breakdown: null,
  last_model_id: null,
  last_request_id: null,
  last_request_status: "completed",
  message_count: 2,
  metadata: {},
  organization_id: ORGANIZATION.id,
  origin_class: "user",
  overrides: {},
  parent_conversation_id: null,
  sandbox_instance_id: null,
  source_app: "matrx-frontend",
  source_feature: "chat",
  status: "active",
  system_instruction: null,
  task_id: null,
  title: "Rent increase notice for Unit 4B",
  updated_at: "2026-10-01T16:41:30.000Z",
  updated_by: PERSON.id,
  variables: {},
  version: 2,
  visibility: "personal",
} satisfies Database["chat"]["Tables"]["conversation"]["Row"];

function message(position: number, role: "user" | "assistant", text: string) {
  return {
    agent_id: role === "assistant" ? CHAT_AGENT_ID : null,
    content: [{ type: "text", text }],
    content_chars: text.length,
    content_history: null,
    conversation_id: CONVERSATION_ID,
    created_at: `2026-10-01T16:4${position}:00.000Z`,
    created_by: PERSON.id,
    custom_fields: {},
    deleted_at: null,
    error: null,
    id: `0c1d2e3f-4a5b-4c6d-8e7f-90a1b2c3d4e${position}`,
    is_visible_to_model: true,
    is_visible_to_user: true,
    metadata: {},
    model_context: null,
    organization_id: ORGANIZATION.id,
    position,
    role,
    source: role === "user" ? "user" : "agent",
    status: "complete",
    tool_results_chars: 0,
    tools_on_call: null,
    updated_at: `2026-10-01T16:4${position}:00.000Z`,
    updated_by: PERSON.id,
    user_content: null,
    version: 1,
    voice: null,
  } satisfies Database["chat"]["Tables"]["message"]["Row"];
}

/** The job the composer runs for a new chat — `chat.default_new_chat`, held by the chat agent. */
const defaultChatMandate = {
  accepts_user_input: true,
  auto_context_disabled: false,
  code_path: null,
  created_at: "2026-08-02T10:00:00.000Z",
  created_by: null,
  default_auto_run: null,
  default_config_overrides: null,
  default_consumption_map: null,
  default_holder_id: CHAT_AGENT_ID,
  default_holder_type: "agent",
  default_holder_version_id: null,
  deleted_at: null,
  description: null,
  draft_inputs: {},
  fallback_mandate_key: null,
  goal: "Answer the person in a new chat.",
  goal_grounding: "",
  id: "e5f6a7b8-c9d0-4e1f-a2b3-c4d5e6f7a8b9",
  input_source: null,
  input_waiver: null,
  is_enabled: true,
  label: "New chat",
  mandate_key: "chat.default_new_chat",
  metadata: {},
  organization_id: "00000000-0000-4000-8000-0000000000a1",
  origin: "system",
  output_kind: null,
  output_waiver: null,
  pinned_context: [],
  pins: {},
  provision_key: null,
  published_to_web: false,
  published_to_web_at: null,
  published_to_web_by: null,
  renamed_from_key: null,
  required_context_policies: [],
  required_output_keys: [],
  shown_to: null,
  source_mandate_id: null,
  updated_at: "2026-09-20T10:00:00.000Z",
  updated_by: null,
  version: 3,
  visibility: "public",
} satisfies Database["mandate"]["Tables"]["definition"]["Row"];

export const CHAT_REPLY = "Here is a 60-day notice raising the rent for Unit 4B from $1,850 to $1,925, effective December 1.";

export function seedChat(): void {
  const messages = [
    message(0, "user", "Draft a 60-day rent increase notice for Unit 4B: $1,850 to $1,925 from December 1."),
    message(1, "assistant", CHAT_REPLY),
  ];
  seed("chat.conversation", [conversation]);
  seed("chat.message", messages);
  seedRpc("get_cx_conversation_bundle", {
    conversation,
    messages,
    tool_calls: [],
    artifacts: [],
    media: [],
    pagination: { limit: 50, returned_count: 2, oldest_position: 0, has_more: false },
    requests: [],
    user_requests: [],
  });
  seedRpc("assoc_for_targets", []);
  seed("mandate.definition", [defaultChatMandate]);
  seedRpc("agx_get_list_full", []);
  // The composer's unsent-chips restore (`remarkDurability.restore`): no chip is staged in this chat.
  // Unanswered it is a failed read, which is never kept as restored.
  seedRpc("block_state_list_staged", []);
  // The attach menu's counts (`useRunControlCounts`, P24b) read the agent's RUN TIER on a chat's first
  // mount. Unanswered, the read fails and is never kept, so every wake would ask again.
  seedRpc("agx_get_run_tier", [
    {
      id: CHAT_AGENT_ID,
      is_version: false,
      version_id: null,
      name: "Rent notice helper",
      description: null,
      variable_definitions: [],
      context_policies: [],
      auto_context_disabled: false,
      model_id: "claude-sonnet-4-6",
      ui_gates: {},
      tool_ids: [],
      access_level: "owner",
      custom_tool_count: 0,
      skill_count: 0,
      connection_count: 0,
    },
  ]);
  // ../aidream/apps/shared/chat/src/agents/types/agent-definition.types.ts `AgentExecutionFull` —
  // the person's chat agent, readable by them (it answered the transcript).
  seedRpc("agx_get_execution_full", [
    {
      id: CHAT_AGENT_ID,
      variable_definitions: [],
      model_id: "claude-sonnet-4-6",
      settings: {},
      tools: [],
      custom_tools: [],
      context_policies: [],
      auto_context_disabled: false,
      ui_gates: {},
      default_rag_boost: 0,
      rag_awareness_mode: "off",
      input_kind: null,
    },
  ]);
  seedFetch(new RegExp(`^${SERVER}/runtime/operations/by-link/conversation/`), () => ({
    link_kind: "conversation",
    link_id: CONVERSATION_ID,
    operation_count: 0,
    operations: [],
  }));
  seedFetch(new RegExp(`^${SERVER}/ai/conversation/[^/]+/pending_calls`), () => []);
  seedFetch(/^\/api\/compute-targets$/, () => ({ targets: [], max_sandboxes: 3, sandbox_count: 0 }));
  seedFetch(new RegExp(`^${SERVER}/mandates/[^/]+/resolution`), () => ({
    holder_type: "agent",
    agent_id: CHAT_AGENT_ID,
    definition_agent_id: CHAT_AGENT_ID,
    is_version: false,
    provenance: "system",
    mandate_id: "e5f6a7b8-c9d0-4e1f-a2b3-c4d5e6f7a8b9",
    config_overrides: null,
  }));
}

// ── File ─────────────────────────────────────────────────────────────────────

export const FILE_ID = "b7e4c2a1-9d3f-4e6b-8a5c-1f2e3d4c5b6a";
export const FILE_TEXT = "# Pet addendum — Unit 4B\n\nOne cat permitted. Pet deposit $300, refundable at move-out.\n";
const FILE_PATH = `${PERSON.id}/leases/unit-4b-pet-addendum.md`;

export const fileRow = {
  artifact_kind: null,
  canonical_processed_document_id: null,
  checksum: "sha256:9b1f0c3e7a2d4c5b8e6f1a0d3c2b4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d",
  client_modified_at: "2026-09-29T21:10:00.000Z",
  created_at: "2026-09-29T21:12:00.000Z",
  created_by: PERSON.id,
  current_version: 1,
  custom_fields: {},
  deleted_at: null,
  derivation_kind: null,
  derivation_metadata: {},
  duplicate_of_file_id: null,
  duration_ms: null,
  file_name: "unit-4b-pet-addendum.md",
  file_path: FILE_PATH,
  height: null,
  id: FILE_ID,
  metadata: {},
  mime_type: "text/markdown",
  organization_id: ORGANIZATION.id,
  origin_device_id: null,
  parent_file_id: null,
  parent_folder_id: null,
  parent_record_id: null,
  parent_record_type: null,
  provider_session_id: null,
  published_to_web: false,
  published_to_web_at: null,
  published_to_web_by: null,
  shown_to: null,
  size_bytes: FILE_TEXT.length,
  storage_uri: `s3://matrx-user-files/${FILE_PATH}`,
  updated_at: "2026-09-29T21:12:00.000Z",
  updated_by: PERSON.id,
  version: 1,
  visibility: "personal",
  width: null,
} satisfies Database["files"]["Tables"]["files"]["Row"];

const FILES = "https://files.matrxserver.com";

/** The files server's `FileRecord` (features/files/redux/converters.ts `apiFileRecordToCloudFile`). */
const fileRecordApi = {
  id: FILE_ID,
  owner_id: PERSON.id,
  organization_id: ORGANIZATION.id,
  file_path: FILE_PATH,
  file_name: fileRow.file_name,
  mime_type: fileRow.mime_type,
  size_bytes: fileRow.size_bytes,
  checksum: fileRow.checksum,
  visibility: "personal",
  current_version: 1,
  parent_folder_id: null,
  metadata: {},
  created_at: fileRow.created_at,
  updated_at: fileRow.updated_at,
  deleted_at: null,
  public_url: null,
  url: `${FILES}/files/${FILE_ID}/download`,
  cdn_url: null,
  download_url: `${FILES}/files/${FILE_ID}/download?disposition=attachment`,
  duplicate_of_file_id: null,
  canonical_processed_document_id: null,
  parent_file_id: null,
  derivation_kind: null,
  derivation_metadata: {},
};

export function seedFile(): void {
  seed("files.files", [fileRow]);
  seedFetch(new RegExp(`^${FILES}/files/${FILE_ID}\\?`), () => fileRecordApi);
  seedFetch(new RegExp(`^${FILES}/files/${FILE_ID}/(download|content|raw)`), () => FILE_TEXT);
}
