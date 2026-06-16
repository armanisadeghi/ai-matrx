import type {
  ContextObjectType,
  ContextSlot,
} from "@/features/agents/types/agent-api-types";
import type { InstanceContextEntry } from "@/features/agents/types/instance.types";

export const DEMO_CONV_SINGLE = "demo-user-msg-ctx-single";
export const DEMO_CONV_MULTI = "demo-user-msg-ctx-multi";

export const DEMO_SINGLE_ENTRY: InstanceContextEntry = {
  key: "working_document",
  label: "Working Document",
  type: "text",
  slotMatched: true,
  value:
    "This is a working document context slot with a short preview snippet for the chip.",
};

export const DEMO_MULTI_ENTRIES: InstanceContextEntry[] = [
  {
    key: "recording_1",
    label: "Recording 1",
    type: "text",
    slotMatched: true,
    value: "So if you're in the studio and you hit record…",
  },
  {
    key: "recording_4",
    label: "Recording 4 — raw transcript",
    type: "text",
    slotMatched: true,
    value: "The drawers that slide up from the bottom need more padding.",
  },
  {
    key: "meeting_notes",
    label: "Meeting Notes",
    type: "text",
    slotMatched: true,
    value: "Discussed agent tab UX and record button behavior.",
  },
  {
    key: "style_guide",
    label: "Style Guide",
    type: "json",
    slotMatched: true,
    value: { spacing: "compact", theme: "enterprise", icons: "lucide" },
  },
  {
    key: "reference_pdf",
    label: "Reference PDF",
    type: "file_url",
    slotMatched: true,
    value: "https://cdn.example.com/docs/agent-context-spec.pdf",
  },
  {
    key: "owner",
    label: "Owner",
    type: "user",
    slotMatched: true,
    value: { id: "user-1", name: "Arman", email: "admin@admin.com" },
  },
  {
    key: "active_org",
    label: "Active Org",
    type: "org",
    slotMatched: true,
    value: { id: "org-1", name: "Matrx Main" },
  },
  {
    key: "current_task",
    label: "Current Task",
    type: "task",
    slotMatched: true,
    value: { id: "task-42", title: "Fix record button context UX" },
  },
  {
    key: "temperature",
    label: "Temperature",
    type: "variable",
    slotMatched: true,
    value: 0.7,
  },
];

/** One entry per ContextObjectType for the type gallery. */
export const DEMO_TYPE_ENTRIES: {
  type: ContextObjectType;
  entry: InstanceContextEntry;
  slot?: ContextSlot;
}[] = [
  {
    type: "text",
    entry: {
      key: "type_text",
      label: "Text Slot",
      type: "text",
      slotMatched: true,
      value:
        "Plain text context with markdown **support** in the detail sheet.",
    },
    slot: {
      key: "type_text",
      type: "text",
      label: "Text Slot",
      description: "Long-form text the agent can fetch via ctx_get.",
    },
  },
  {
    type: "json",
    entry: {
      key: "type_json",
      label: "JSON Payload",
      type: "json",
      slotMatched: true,
      value: { recordings: 4, status: "draft", tags: ["ux", "agents"] },
    },
  },
  {
    type: "file_url",
    entry: {
      key: "type_file_url",
      label: "File URL",
      type: "file_url",
      slotMatched: true,
      value: "https://cdn.example.com/transcripts/session-001.txt",
    },
  },
  {
    type: "db_ref",
    entry: {
      key: "type_db_ref",
      label: "Database Ref",
      type: "db_ref",
      slotMatched: true,
      value: { table: "cx_message", id: "msg-abc-123" },
    },
  },
  {
    type: "user",
    entry: {
      key: "type_user",
      label: "User Entity",
      type: "user",
      slotMatched: true,
      value: { id: "u-1", name: "Jane Doe", role: "admin" },
    },
  },
  {
    type: "org",
    entry: {
      key: "type_org",
      label: "Organization",
      type: "org",
      slotMatched: true,
      value: { id: "o-1", name: "Acme Corp", slug: "acme" },
    },
  },
  {
    type: "workspace",
    entry: {
      key: "type_workspace",
      label: "Workspace",
      type: "workspace",
      slotMatched: true,
      value: { id: "ws-1", name: "Product Team" },
    },
  },
  {
    type: "project",
    entry: {
      key: "type_project",
      label: "Project",
      type: "project",
      slotMatched: true,
      value: { id: "p-1", name: "Agent UX Refresh" },
    },
  },
  {
    type: "task",
    entry: {
      key: "type_task",
      label: "Task",
      type: "task",
      slotMatched: true,
      value: { id: "t-1", title: "Ship context chip collapse", status: "open" },
    },
  },
  {
    type: "variable",
    entry: {
      key: "type_variable",
      label: "Variable",
      type: "variable",
      slotMatched: true,
      value: "summarize_mode",
    },
  },
];

export interface DemoAttachmentSpec {
  id: string;
  title: string;
  label: string;
  iconColor: string;
  chipBg: string;
  chipBorder: string;
  note?: string;
}

/** Shared set for the side-by-side attachment style comparison. */
export const DEMO_COMPARISON_ATTACHMENTS: DemoAttachmentSpec[] = [
  {
    id: "note",
    title: "Sprint retro notes",
    label: "Note",
    iconColor: "text-orange-600 dark:text-orange-400",
    chipBg: "bg-orange-50 dark:bg-orange-950/30",
    chipBorder: "border-orange-300 dark:border-orange-700",
  },
  {
    id: "task",
    title: "Fix record button UX",
    label: "Task",
    iconColor: "text-blue-600 dark:text-blue-400",
    chipBg: "bg-blue-50 dark:bg-blue-950/30",
    chipBorder: "border-blue-300 dark:border-blue-700",
  },
  {
    id: "webpage",
    title: "aimatrx.com/docs",
    label: "Webpage",
    iconColor: "text-teal-600 dark:text-teal-400",
    chipBg: "bg-teal-50 dark:bg-teal-950/30",
    chipBorder: "border-teal-300 dark:border-teal-700",
  },
  {
    id: "image-legacy",
    title: "screenshot.png",
    label: "Image",
    iconColor: "text-blue-600 dark:text-blue-400",
    chipBg: "bg-blue-100 dark:bg-blue-950/30",
    chipBorder: "border-blue-300 dark:border-blue-700",
  },
  {
    id: "audio-legacy",
    title: "voice-memo.m4a",
    label: "Audio",
    iconColor: "text-pink-600 dark:text-pink-400",
    chipBg: "bg-pink-50 dark:bg-pink-950/30",
    chipBorder: "border-pink-300 dark:border-pink-700",
  },
  {
    id: "youtube",
    title: "Demo walkthrough",
    label: "YouTube",
    iconColor: "text-red-600 dark:text-red-400",
    chipBg: "bg-red-50 dark:bg-red-950/30",
    chipBorder: "border-red-300 dark:border-red-700",
  },
];

/** Demo conversation for seeding SmartAgentResourceChips in the comparison column. */
export const DEMO_CONV_INPUT_CHIPS = "demo-user-msg-input-chips";

export const DEMO_INPUT_CHIP_RESOURCES: {
  resourceId: string;
  blockType:
    | "input_notes"
    | "input_task"
    | "input_webpage"
    | "image"
    | "audio"
    | "youtube_video";
  preview: string;
  source: Record<string, unknown>;
}[] = [
  {
    resourceId: "demo-res-note",
    blockType: "input_notes",
    preview: "Sprint retro notes",
    source: { note_ids: ["demo-note-id"] },
  },
  {
    resourceId: "demo-res-task",
    blockType: "input_task",
    preview: "Fix record button UX",
    source: { task_ids: ["demo-task-id"] },
  },
  {
    resourceId: "demo-res-webpage",
    blockType: "input_webpage",
    preview: "aimatrx.com/docs",
    source: { url: "https://aimatrx.com/docs" },
  },
  {
    resourceId: "demo-res-image",
    blockType: "image",
    preview: "screenshot.png",
    source: { file_id: "00000000-0000-0000-0000-000000000000" },
  },
  {
    resourceId: "demo-res-audio",
    blockType: "audio",
    preview: "voice-memo.m4a",
    source: { file_id: "00000000-0000-0000-0000-000000000001" },
  },
  {
    resourceId: "demo-res-youtube",
    blockType: "youtube_video",
    preview: "Demo walkthrough",
    source: { url: "https://youtube.com/watch?v=demo" },
  },
];

/**
 * Every resource type in one conversation — drives the real
 * SmartAgentResourceChips so the editable toggle, remove, hover previews, and
 * mobile long-press can be confirmed together. Editable-capable types (notes,
 * task, table, list, data, webpage) show the Lock/Pencil toggle; the rest don't.
 */
export const DEMO_CONV_ALL_RESOURCES = "demo-user-msg-all-resources";

export const DEMO_ALL_RESOURCES: {
  resourceId: string;
  blockType: import("@/features/agents/types/instance.types").ResourceBlockType;
  preview: string;
  source: Record<string, unknown>;
}[] = [
  {
    resourceId: "demo-all-note",
    blockType: "input_notes",
    preview: "Sprint retro notes",
    source: { note_ids: ["demo-note-id"] },
  },
  {
    resourceId: "demo-all-task",
    blockType: "input_task",
    preview: "Fix record button UX",
    source: { task_ids: ["demo-task-id"] },
  },
  {
    resourceId: "demo-all-table",
    blockType: "input_table",
    preview: "Active customers",
    source: { bookmarks: [{ id: "tbl-1", table_name: "customers" }] },
  },
  {
    resourceId: "demo-all-list",
    blockType: "input_list",
    preview: "Action items",
    source: { bookmarks: [{ id: "list-1" }] },
  },
  {
    resourceId: "demo-all-data",
    blockType: "input_data",
    preview: "Analytics export",
    source: { refs: [{ id: "data-1", label: "Analytics export" }] },
  },
  {
    resourceId: "demo-all-webpage",
    blockType: "input_webpage",
    preview: "aimatrx.com/docs",
    source: { urls: ["https://aimatrx.com/docs"] },
  },
  {
    resourceId: "demo-all-image",
    blockType: "image",
    preview: "screenshot.png",
    source: { file_id: "00000000-0000-0000-0000-000000000000" },
  },
  {
    resourceId: "demo-all-audio",
    blockType: "audio",
    preview: "voice-memo.m4a",
    source: { file_id: "00000000-0000-0000-0000-000000000001" },
  },
  {
    resourceId: "demo-all-video",
    blockType: "video",
    preview: "walkthrough.mp4",
    source: { url: "https://cdn.example.com/walkthrough.mp4" },
  },
  {
    resourceId: "demo-all-document",
    blockType: "document",
    preview: "brief.pdf",
    source: { url: "https://cdn.example.com/brief.pdf" },
  },
  {
    resourceId: "demo-all-youtube",
    blockType: "youtube_video",
    preview: "Demo walkthrough",
    source: { url: "https://youtube.com/watch?v=demo" },
  },
  {
    resourceId: "demo-all-text",
    blockType: "text",
    preview: "Pasted snippet",
    source: { text: "Some pasted text content" },
  },
  // New Matrx entity references (pending backend support).
  {
    resourceId: "demo-all-agent",
    blockType: "input_agent",
    preview: "Research Assistant",
    source: { id: "agent-1" },
  },
  {
    resourceId: "demo-all-project",
    blockType: "input_project",
    preview: "Agent UX Refresh",
    source: { id: "project-1" },
  },
  {
    resourceId: "demo-all-agent-app",
    blockType: "input_agent_app",
    preview: "Meeting Summarizer",
    source: { id: "app-1" },
  },
  {
    resourceId: "demo-all-transcript",
    blockType: "input_transcript",
    preview: "Q3 planning call",
    source: { id: "transcript-1" },
  },
  {
    resourceId: "demo-all-transcript-session",
    blockType: "input_transcript_session",
    preview: "Session 2 — design review",
    source: { id: "session-1" },
  },
  {
    resourceId: "demo-all-workbook",
    blockType: "input_workbook",
    preview: "Pricing model",
    source: { id: "workbook-1" },
  },
  {
    resourceId: "demo-all-document",
    blockType: "input_document",
    preview: "Product brief",
    source: { id: "document-1" },
  },
];

export const DEMO_LEGACY_ATTACHMENTS: DemoAttachmentSpec[] = [
  {
    id: "webpage",
    title: "aimatrx.com/docs",
    label: "Webpage",
    iconColor: "text-teal-600 dark:text-teal-400",
    chipBg: "bg-teal-50 dark:bg-teal-950/30",
    chipBorder: "border-teal-300 dark:border-teal-700",
  },
  {
    id: "note",
    title: "Sprint retro notes",
    label: "Note",
    iconColor: "text-orange-600 dark:text-orange-400",
    chipBg: "bg-orange-50 dark:bg-orange-950/30",
    chipBorder: "border-orange-300 dark:border-orange-700",
  },
  {
    id: "task",
    title: "Fix mobile drawer padding",
    label: "Task",
    iconColor: "text-blue-600 dark:text-blue-400",
    chipBg: "bg-blue-50 dark:bg-blue-950/30",
    chipBorder: "border-blue-300 dark:border-blue-700",
  },
  {
    id: "table",
    title: "Q1 metrics",
    label: "Table",
    iconColor: "text-green-600 dark:text-green-400",
    chipBg: "bg-green-50 dark:bg-green-950/30",
    chipBorder: "border-green-300 dark:border-green-700",
  },
  {
    id: "list",
    title: "Action items",
    label: "List",
    iconColor: "text-purple-600 dark:text-purple-400",
    chipBg: "bg-purple-50 dark:bg-purple-950/30",
    chipBorder: "border-purple-300 dark:border-purple-700",
  },
  {
    id: "data",
    title: "Analytics export",
    label: "Data",
    iconColor: "text-gray-600 dark:text-gray-400",
    chipBg: "bg-gray-50 dark:bg-gray-950/30",
    chipBorder: "border-gray-300 dark:border-gray-700",
  },
  {
    id: "youtube",
    title: "Demo walkthrough",
    label: "YouTube",
    iconColor: "text-red-600 dark:text-red-400",
    chipBg: "bg-red-50 dark:bg-red-950/30",
    chipBorder: "border-red-300 dark:border-red-700",
  },
  {
    id: "image-legacy",
    title: "screenshot.png",
    label: "Image",
    iconColor: "text-blue-600 dark:text-blue-400",
    chipBg: "bg-blue-50 dark:bg-blue-950/30",
    chipBorder: "border-blue-300 dark:border-blue-700",
    note: "Legacy chip — no file_id on block",
  },
  {
    id: "audio-legacy",
    title: "voice-memo.m4a",
    label: "Audio",
    iconColor: "text-pink-600 dark:text-pink-400",
    chipBg: "bg-pink-50 dark:bg-pink-950/30",
    chipBorder: "border-pink-300 dark:border-pink-700",
    note: "Legacy chip — no file_id on block",
  },
  {
    id: "doc-legacy",
    title: "brief.pdf",
    label: "Doc",
    iconColor: "text-gray-600 dark:text-gray-400",
    chipBg: "bg-gray-50 dark:bg-gray-950/30",
    chipBorder: "border-gray-300 dark:border-gray-700",
    note: "Legacy chip — no file_id on block",
  },
];
