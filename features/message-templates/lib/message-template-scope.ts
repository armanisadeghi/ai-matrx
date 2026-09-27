// features/message-templates/lib/message-template-scope.ts
//
// The one-template page's agent surface (`matrx-user/message-template`): the
// scope it emits (built only from state the page already rendered — never a
// fetch) and the `template_draft` parser, which checks the WHOLE value before
// the page stages anything into its edit form.

import {
  createMessageTemplateScope,
  MESSAGE_TEMPLATE_DRAFT_FIELDS,
  MESSAGE_TEMPLATE_ROLES,
  MESSAGE_TEMPLATE_VISIBILITIES,
  type MessageTemplateDraftScope,
} from "@/features/surfaces/manifests/message-template.manifest";
import {
  xmlElement,
  xmlText,
} from "@/features/surfaces/runtime/context-bundle";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import { mergeFieldsIn } from "./merge-fields";
import {
  readMessageTemplateMetadata,
  type MessageTemplateDB,
} from "../types/message-templates-db";

/** The record budget for one focused record (page-pass context budget). */
const RECORD_CONTENT_MAX = 9000;

function metadataString(metadata: unknown, key: string): string | null {
  const value = readMessageTemplateMetadata(metadata)[key];
  return typeof value === "string" && value.trim() ? value : null;
}

export function templateSubject(template: Pick<MessageTemplateDB, "metadata">): string {
  return metadataString(template.metadata, "subject_template") ?? "";
}

/** `managed_by` — the platform job that uses this template, when one does. */
export function templateManagedBy(
  template: Pick<MessageTemplateDB, "metadata">,
): string | null {
  return metadataString(template.metadata, "managed_by");
}

/**
 * A person-readable name for a `managed_by` job key: "crm.reply_drafting" →
 * "CRM reply drafting". The key itself stays in the agent's bundle.
 */
export function humanizeManagedBy(key: string): string {
  const words = key
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => (w.length <= 3 ? w.toUpperCase() : w.toLowerCase()));
  const text = words.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** THE record as one XML bundle. */
export function buildMessageTemplateBundle(template: MessageTemplateDB): string {
  return xmlElement(
    "message_template",
    {
      id: template.id,
      label: template.label,
      role: template.role,
      visibility: template.visibility === "public" ? "public" : "private",
      tags: (template.tags ?? []).join(", ") || null,
      version: template.version,
      updated: template.updated_at?.slice(0, 10),
      managed_by: templateManagedBy(template),
    },
    [
      xmlText("subject", metadataString(template.metadata, "subject_template")),
      xmlText("content", template.content ?? "", { max: RECORD_CONTENT_MAX }),
      xmlText("note", metadataString(template.metadata, "note")),
    ],
  );
}

export function buildMessageTemplateScope(input: {
  template: MessageTemplateDB;
  canEdit: boolean;
  mode: "view" | "edit";
  draft: MessageTemplateDraftScope;
  isDirty: boolean;
  saveError: string | null;
}): SurfaceScopePayload {
  const { template, canEdit, mode, draft, isDirty, saveError } = input;
  return createMessageTemplateScope({
    message_template: buildMessageTemplateBundle(template),
    template_id: template.id,
    template_label: template.label ?? "",
    template_content: template.content ?? "",
    template_fields: mergeFieldsIn(templateSubject(template), template.content ?? "").map(
      ({ path, label }) => ({ path, label }),
    ),
    can_edit: canEdit,
    template_mode: mode,
    has_unsaved_changes: isDirty,
    ...(canEdit ? { template_draft: draft } : {}),
    ...(saveError ? { save_error: saveError } : {}),
  });
}

/**
 * Checks a whole `template_draft` value against the current form and returns
 * the changes to stage. Throws a sentence the agent can act on; never partial.
 */
export function parseTemplateDraftValue(
  value: unknown,
  current: MessageTemplateDraftScope,
  canEdit: boolean,
): Partial<MessageTemplateDraftScope> {
  if (!canEdit)
    throw new Error(
      "This template belongs to someone else, so it cannot be edited here. Tell the person instead of drafting.",
    );
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(
      `template_draft expects an object with any of: ${MESSAGE_TEMPLATE_DRAFT_FIELDS.join(", ")}.`,
    );
  const raw = value as Record<string, unknown>;
  const keys = Object.keys(raw);
  if (keys.length === 0)
    throw new Error("template_draft needs at least one field to stage.");
  const unknownKeys = keys.filter(
    (k) => !(MESSAGE_TEMPLATE_DRAFT_FIELDS as readonly string[]).includes(k),
  );
  if (unknownKeys.length > 0)
    throw new Error(
      `template_draft does not accept: ${unknownKeys.join(", ")}. Allowed fields: ${MESSAGE_TEMPLATE_DRAFT_FIELDS.join(", ")}.`,
    );

  const out: Partial<MessageTemplateDraftScope> = {};
  const str = (key: "label" | "content" | "subject_template"): string | undefined => {
    if (!(key in raw)) return undefined;
    const v = raw[key];
    if (typeof v !== "string") throw new Error(`template_draft.${key} expects a string.`);
    return v;
  };

  const label = str("label");
  if (label !== undefined) {
    if (!label.trim()) throw new Error("template_draft.label cannot be empty — send a real name or omit it.");
    out.label = label.trim();
  }
  const content = str("content");
  if (content !== undefined) {
    if (!content.trim())
      throw new Error("template_draft.content cannot be empty — send the complete body or omit it.");
    out.content = content;
  }
  const subject = str("subject_template");
  if (subject !== undefined) out.subject_template = subject.trim();

  if ("role" in raw) {
    const role = raw.role;
    if (
      typeof role !== "string" ||
      !(MESSAGE_TEMPLATE_ROLES as readonly string[]).includes(role)
    )
      throw new Error(
        `template_draft.role must be one of: ${MESSAGE_TEMPLATE_ROLES.join(", ")}.`,
      );
    out.role = role as MessageTemplateDraftScope["role"];
  }
  if ("tags" in raw) {
    const tags = raw.tags;
    if (!Array.isArray(tags) || tags.some((t) => typeof t !== "string"))
      throw new Error("template_draft.tags expects an array of strings.");
    const clean: string[] = [];
    for (const t of tags as string[]) {
      const tag = t.trim();
      if (tag && !clean.includes(tag)) clean.push(tag);
    }
    out.tags = clean;
  }
  if ("visibility" in raw) {
    const vis = raw.visibility;
    if (
      typeof vis !== "string" ||
      !(MESSAGE_TEMPLATE_VISIBILITIES as readonly string[]).includes(vis)
    )
      throw new Error(
        `template_draft.visibility must be one of: ${MESSAGE_TEMPLATE_VISIBILITIES.join(", ")}.`,
      );
    out.visibility = vis as MessageTemplateDraftScope["visibility"];
  }

  const changes = (Object.keys(out) as (keyof MessageTemplateDraftScope)[]).filter(
    (k) => JSON.stringify(out[k]) !== JSON.stringify(current[k]),
  );
  if (changes.length === 0)
    throw new Error("template_draft would change nothing — the form already holds these values.");
  return out;
}

/** Checks an `archive_template` value: the owner, and exactly `true`. */
export function parseArchiveTemplateValue(value: unknown, canEdit: boolean): void {
  if (!canEdit)
    throw new Error(
      "This template belongs to someone else, so it cannot be archived here. Tell the person instead.",
    );
  if (value !== true && value !== "true")
    throw new Error("archive_template expects true (it moves this template to Trash).");
}
