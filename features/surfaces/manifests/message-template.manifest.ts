/**
 * Surface manifest — one message template (`matrx-user/message-template`).
 *
 * The record page at /chat/message-templates/[id]
 * (`features/message-templates/components/TemplateViewPage.tsx`): ONE saved
 * `agent.message_template` row — its name, role, visibility, tags, the email
 * subject (`metadata.subject_template`) and the message body, which may carry
 * `{{variable}}` merge fields. The owner can switch to Edit and save. The list
 * at /chat/message-templates is a different page and keeps its own mapping.
 *
 * Why its own surface (page pass 2026-09-27): the route used to resolve to
 * `matrx-user/chat`, so an agent opened here was told it was in a chat and saw
 * nothing of the template on screen.
 *
 * Read half: `message_template` is THE record as one XML bundle (the whole
 * body, up to the 10,000-char record budget), plus the small scalars an agent
 * reasons over (`template_mode`, `can_edit`, `has_unsaved_changes`) and the
 * edit form's live values (`template_draft`, the read twin of the target).
 *
 * Write half — ONE `draft` target, `ask`: `template_draft` stages the fields a
 * person authors (name, body, email subject, role, tags, visibility) into the
 * page's own edit form through the same setters the inputs use. Nothing is
 * saved until the person presses Save. A composite target on purpose: the
 * fields are edited in one form and saved by one Save.
 *
 * Deliberately NOT targets: saving, deleting (the person's call, behind a
 * confirmation), ownership and organization, `metadata` keys other than the
 * subject (for example `managed_by`, which ties a template to a platform job),
 * and custom fields (the Custom fields section carries its own editor).
 * No child lists: a template has no sub-records on this page.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const MESSAGE_TEMPLATE_SURFACE_NAME = "matrx-user/message-template";

/** The fields `template_draft` accepts — the edit form's own inputs. */
export const MESSAGE_TEMPLATE_DRAFT_FIELDS = [
  "label",
  "content",
  "subject_template",
  "role",
  "tags",
  "visibility",
] as const;

export const MESSAGE_TEMPLATE_ROLES = [
  "system",
  "user",
  "assistant",
  "tool",
] as const;

export const MESSAGE_TEMPLATE_VISIBILITIES = ["private", "public"] as const;

const groups: SurfaceValueGroup[] = [
  {
    key: "template",
    label: "The template",
    sortOrder: 100,
    description: "The message template open on this page.",
  },
  {
    key: "editing",
    label: "Editing",
    sortOrder: 200,
    description: "Whether the page is in view or edit mode, and the edit form's current values.",
  },
];

const DRAFT_SHAPE =
  '{ label: string, content: string, subject_template: string, role: "system" | "user" | "assistant" | "tool" | null, tags: string[], visibility: "private" | "public" }';

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "message_template",
    label: "Message template",
    description:
      'THE template, as one XML element: <message_template id label role visibility tags version updated managed_by> with <subject> (the email subject template, when set), <content> (the whole message body exactly as saved, including {{variable}} merge fields) and <note> (a note the platform stored on it, when set). managed_by names the platform job that uses this template (for example "crm.reply_drafting"); changing such a template changes what that job sends. Always present on this page — the page only renders once the template has loaded.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 1200,
    inlineUpTo: 10000,
    group: "template",
    sortOrder: 100,
  },
  {
    name: "template_id",
    label: "Template ID",
    description: "ID of the open template (agent.message_template.id).",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    group: "template",
    sortOrder: 110,
  },
  {
    name: "template_label",
    label: "Template name",
    description: "The template's saved name.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 60,
    group: "template",
    sortOrder: 120,
  },
  {
    name: "template_content",
    label: "Template body",
    description:
      "The template's saved message body, exactly as stored (merge fields such as {{reply.body}} included). An empty string when the body is empty. Same text as the <content> of message_template.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 800,
    autoContext: false,
    group: "template",
    sortOrder: 130,
  },
  {
    name: "can_edit",
    label: "Can edit",
    description:
      "True when the person viewing is the template's creator and may edit it; false for a template someone else shared (template_draft is refused then).",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    group: "editing",
    sortOrder: 200,
  },
  {
    name: "template_mode",
    label: "Page mode",
    description:
      '"view" while the template is shown read-only; "edit" while the edit form is open. Staging a draft switches the page to "edit".',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 4,
    group: "editing",
    sortOrder: 210,
  },
  {
    name: "has_unsaved_changes",
    label: "Unsaved changes",
    description:
      "True when the edit form differs from the saved template (the person has not pressed Save yet).",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    group: "editing",
    sortOrder: 220,
  },
  {
    name: "template_draft",
    label: "Edit form",
    description: `The edit form's current values, as ${DRAFT_SHAPE} — the read twin of the template_draft target. Equals the saved template until someone edits. Present only when can_edit is true.`,
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 1200,
    group: "editing",
    sortOrder: 230,
  },
  {
    name: "save_error",
    label: "Save error",
    description:
      "Why the last Save or Delete failed; absent when nothing has failed.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 160,
    group: "editing",
    sortOrder: 240,
  },
];

const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "template_draft",
    label: "Template draft",
    description: [
      "Stages changes to this template into the page's edit form (the page switches to Edit). Nothing is saved until the person presses Save.",
      `Value is an object with any of: ${MESSAGE_TEMPLATE_DRAFT_FIELDS.join(", ")}. Only the keys you send change; omit a key to keep the form's value.`,
      "label: the template's name (not empty). content: the COMPLETE new message body, replacing the whole body — read template_content first and send back the full text; keep the {{variable}} merge fields the template relies on unless asked to change them. subject_template: the email subject (\"\" clears it). role: one of system, user, assistant, tool. tags: an array of short strings (replaces the tag list). visibility: \"private\" or \"public\" (public shares it with everyone on the platform).",
      "Refused when can_edit is false, when a key is unknown, when label or content would be empty, or when nothing would change.",
    ].join(" "),
    valueType: "object",
    updatesValue: "template_draft",
    mode: "draft",
    applyPolicy: "ask",
    group: "editing",
    sortOrder: 200,
  },
];

export const messageTemplateManifest: SurfaceManifest = {
  surfaceName: MESSAGE_TEMPLATE_SURFACE_NAME,
  client: "matrx-user",
  executionMode: "python-stream",
  description:
    "One saved message template: its name, role, visibility, tags, email subject and body with merge fields; stage edits into its edit form (/chat/message-templates/[id]).",
  label: "Message template",
  urlPattern: "/chat/message-templates/[id]",
  readiness: "partial",
  readinessNote:
    "Record, mode and edit form emitted from TemplateViewPage; template_draft validates through a unit-tested parser. Not yet verified: no live agent write test recorded, no outside-helper binding test.",
  intro: `<surface_intro>
You are on one saved message template at /chat/message-templates/[id]. message_template is the template itself (name, role, visibility, tags, email subject and the whole body, which may hold {{variable}} merge fields filled in when the template is used). If it names managed_by, a platform job uses this template, and a change alters what that job sends.
To rewrite, rename, retag, change the subject, or otherwise edit the template, use template_draft: it fills the page's edit form and the person presses Save. Send only the fields you change; content replaces the whole body. Do not use generic tools to update agent.message_template rows for this page — they skip the person's review.
If can_edit is false, the template belongs to someone else; say so instead of drafting.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("selection", "context"), surfaceSpecific),
  writeTargets,
};

export interface MessageTemplateDraftScope {
  label: string;
  content: string;
  subject_template: string;
  role: (typeof MESSAGE_TEMPLATE_ROLES)[number] | null;
  tags: string[];
  visibility: (typeof MESSAGE_TEMPLATE_VISIBILITIES)[number];
}

/**
 * Type-safe payload helper — required keys mirror every `alwaysAvailable:
 * true` value above; optional keys mirror the rest.
 */
export function createMessageTemplateScope(values: {
  message_template: string;
  template_id: string;
  template_label: string;
  template_content: string;
  can_edit: boolean;
  template_mode: "view" | "edit";
  has_unsaved_changes: boolean;
  template_draft?: MessageTemplateDraftScope;
  save_error?: string;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
