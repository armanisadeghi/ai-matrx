/**
 * Mock data for the ONE BINDING UI preview. No wiring, no services, no writes.
 *
 * The shapes deliberately mirror the real ones so the preview reads as the real
 * thing: `HolderInput` mirrors `features/surfaces/utils/buildBindingTargets.ts`'s
 * BindingTarget, and `OfferedValue` mirrors
 * `features/mandates/provision-shapes.ts` plus the ONE field it is missing today
 * (`sample`) — the preview shows what principle 5 of UI-STANDARD.md would buy.
 */

export type SourceMode =
  | "holder_default"
  | "offered_value"
  | "direct_value"
  | "prompt_user";

export interface HolderInput {
  name: string;
  label: string;
  kind: string;
  required?: boolean;
  description?: string;
  /** The holder's own default, previewed verbatim (UI-STANDARD principle 5). */
  defaultValue?: string;
  /** Which of the four sources this row currently uses. */
  mode: SourceMode;
  /** For `offered_value` — the offered value's name. */
  boundTo?: string;
  /** For `direct_value` / `prompt_user`. */
  literal?: string;
  prompt?: string;
  /** Set when the row opened pre-selected because the resolver would auto-bind. */
  autoBound?: boolean;
  /** A live, per-row refusal in domain words (principle 7). */
  problem?: string;
}

export interface OfferedValue {
  name: string;
  label: string;
  kind: string;
  guaranteed: boolean;
  description: string;
  /** Roughly how big this value is — shown at the point of choice (principle 6). */
  sizeHint?: string;
  /** THE MISSING FIELD: an actual sample, so a source can be previewed. */
  sample?: string;
}

export const PLACE = {
  name: "matrx-user/transcripts-cleanup",
  label: "Transcript Cleanup",
  client: "Matrx User",
  declaredCount: 60,
};

export const HOLDER = {
  kind: "agent" as const,
  name: "Cleanup Surface Demo Reporter",
  version: "v9",
  pinned: false,
};

export const OFFERED: OfferedValue[] = [
  {
    name: "cleaned_transcript_text",
    label: "Cleaned transcript",
    kind: "string",
    guaranteed: false,
    description:
      "The current cleaned-up version of the transcript, as shown in the Clean container.",
    sizeHint: "~8,000 chars",
    sample: "So the first thing we need to look at is the onboarding funnel…",
  },
  {
    name: "session_title",
    label: "Session title",
    kind: "string",
    guaranteed: true,
    description: "The cleanup session's title.",
    sizeHint: "~60 chars",
    sample: "Q3 planning — product sync",
  },
  {
    name: "active_pane",
    label: "Active pane",
    kind: "string",
    guaranteed: false,
    description: "Which pane the user is currently working in (raw | clean | custom).",
    sizeHint: "~10 chars",
    sample: "clean",
  },
  {
    name: "raw_word_count",
    label: "Raw word count",
    kind: "number",
    guaranteed: true,
    description: "Word count of the raw transcript.",
    sizeHint: "~6 chars",
    sample: "4,912",
  },
  {
    name: "page_state",
    label: "Cleanup page state",
    kind: "object",
    guaranteed: true,
    description:
      "The whole cleanup page's state as a structured object — panes, slots, playback.",
    sizeHint: "~2 KB",
    sample: '{ "pane": "clean", "slots": 3, "playing": false }',
  },
  {
    name: "context_items",
    label: "Context items",
    kind: "object",
    guaranteed: true,
    description: "The context items attached to this session.",
    sizeHint: "~4 KB",
    sample: '[{ "id": "ci_8f2…", "label": "Style guide" }]',
  },
];

export const INPUTS: HolderInput[] = [
  {
    name: "working_text",
    label: "Working Text",
    kind: "string",
    required: true,
    description: "The transcript text the agent should report on.",
    mode: "offered_value",
    boundTo: "cleaned_transcript_text",
  },
  {
    name: "session_label",
    label: "Session Label",
    kind: "string",
    description: "A human label for the session, used in the report heading.",
    mode: "offered_value",
    boundTo: "session_title",
    autoBound: true,
  },
  {
    name: "pane_origin",
    label: "Pane Origin",
    kind: "string",
    description: "Which pane the request came from.",
    mode: "holder_default",
    defaultValue: "clean",
  },
  {
    name: "word_total",
    label: "Word Total",
    kind: "number",
    description: "Total words considered.",
    mode: "direct_value",
    literal: "0",
  },
  {
    name: "report_tone",
    label: "Report Tone",
    kind: "string",
    description: "How formal the written report should be.",
    mode: "prompt_user",
    prompt: "How formal should this report be?",
    defaultValue: "neutral",
  },
  {
    name: "page_state",
    label: "Cleanup page state",
    kind: "object",
    description: "Structured page state, delivered as a context policy.",
    mode: "offered_value",
    boundTo: "page_state",
  },
  {
    name: "session_context",
    label: "Session context items",
    kind: "object",
    description: "Context items for this session.",
    mode: "offered_value",
    boundTo: "raw_word_count",
    problem:
      "number is a scalar where this context policy expects a structured shape — pick an object value, or deliver it as a variable.",
  },
];

/** Places × inputs, the batch mode of the same middle. */
export const BATCH_ROWS = [
  {
    place: "matrx-user/chat",
    label: "Chat",
    op: "ADD" as const,
    cells: ["content", "—", "—", "0", "ask", "auto", "—"],
    health: "amber" as const,
  },
  {
    place: "matrx-user/notes",
    label: "Notes",
    op: "ADD" as const,
    cells: ["content", "note_title", "—", "0", "ask", "auto", "—"],
    health: "green" as const,
  },
  {
    place: "matrx-user/tasks",
    label: "Tasks",
    op: "UPD" as const,
    cells: ["—", "task_title", "—", "0", "ask", "auto", "—"],
    health: "red" as const,
  },
  {
    place: "matrx-user/transcripts-cleanup",
    label: "Transcript Cleanup",
    op: "UPD" as const,
    cells: [
      "cleaned_transcript_text",
      "session_title",
      "clean",
      "0",
      "ask",
      "page_state",
      "context_items",
    ],
    health: "green" as const,
  },
];

export const SCOPE_RUNGS = [
  {
    id: "system",
    label: "System",
    description: "Everyone, everywhere — the platform's own answer. Any org or user may override it.",
  },
  {
    id: "organization",
    label: "Organization",
    description: "Everyone in one organization. Overrides system; a user may still override it.",
  },
  {
    id: "user",
    label: "Just me",
    description: "Only you. The strongest rung — nothing overrides it.",
  },
];
