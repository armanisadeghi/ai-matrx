import {
  humanizeManagedBy,
  parseArchiveTemplateValue,
  buildMessageTemplateBundle,
  buildMessageTemplateScope,
  parseTemplateDraftValue,
} from "./message-template-scope";
import type { MessageTemplateDB } from "../types/message-templates-db";
import type { MessageTemplateDraftScope } from "@/features/surfaces/manifests/message-template.manifest";

const template: MessageTemplateDB = {
  id: "t1",
  label: "Outreach reply",
  content: "Hi {{contact.first_name}},\n{{reply.body}}\n",
  role: null,
  metadata: {
    managed_by: "crm.reply_drafting",
    subject_template: "Re: {{reply.subject}}",
    note: "Reviewed before sending.",
  },
  created_at: "2026-08-16T18:15:55Z",
  updated_at: "2026-08-16T18:15:55Z",
  tags: ["crm"],
  organization_id: "o1",
  created_by: "u1",
  updated_by: "u1",
  version: 1,
  deleted_at: null,
  visibility: "internal",
  custom_fields: {},
};

const draft: MessageTemplateDraftScope = {
  label: "Outreach reply",
  content: template.content ?? "",
  subject_template: "Re: {{reply.subject}}",
  role: null,
  tags: ["crm"],
  visibility: "private",
};

describe("buildMessageTemplateBundle", () => {
  it("packs the record as one XML element with subject, body and note", () => {
    const xml = buildMessageTemplateBundle(template);
    expect(xml.startsWith("<message_template ")).toBe(true);
    expect(xml).toContain('managed_by="crm.reply_drafting"');
    expect(xml).toContain('visibility="private"');
    expect(xml).toContain("<subject>Re: {{reply.subject}}</subject>");
    expect(xml).toContain("<content>Hi {{contact.first_name}},\n{{reply.body}}\n</content>");
    expect(xml).toContain("<note>Reviewed before sending.</note>");
    expect(xml).not.toContain("role=");
  });
});

describe("buildMessageTemplateScope", () => {
  it("omits the draft for a reader who cannot edit", () => {
    const scope = buildMessageTemplateScope({
      template,
      canEdit: false,
      mode: "view",
      draft,
      isDirty: false,
      saveError: null,
    });
    expect(scope.template_draft).toBeUndefined();
    expect(scope.can_edit).toBe(false);
    expect(scope.save_error).toBeUndefined();
  });

  it("carries the draft and the save error for the owner", () => {
    const scope = buildMessageTemplateScope({
      template,
      canEdit: true,
      mode: "edit",
      draft,
      isDirty: true,
      saveError: "network down",
    });
    expect(scope.template_draft).toEqual(draft);
    expect(scope.save_error).toBe("network down");
    expect(scope.template_content).toBe(template.content);
    expect(scope.template_fields).toEqual([
      { path: "reply.subject", label: "Reply subject" },
      { path: "contact.first_name", label: "Contact first name" },
      { path: "reply.body", label: "Reply body" },
    ]);
  });
});

describe("parseTemplateDraftValue", () => {
  it("returns only the fields sent, cleaned", () => {
    expect(
      parseTemplateDraftValue(
        { label: "  New name ", tags: [" a ", "a", "b", ""] },
        draft,
        true,
      ),
    ).toEqual({ label: "New name", tags: ["a", "b"] });
  });

  it("keeps the body byte-for-byte", () => {
    expect(parseTemplateDraftValue({ content: "Body\n\n" }, draft, true)).toEqual({
      content: "Body\n\n",
    });
  });

  it.each([
    [{ label: "x" }, false, /belongs to someone else/],
    ["text", true, /expects an object/],
    [{}, true, /at least one field/],
    [{ owner: "me" }, true, /does not accept: owner/],
    [{ label: "  " }, true, /label cannot be empty/],
    [{ content: "" }, true, /content cannot be empty/],
    [{ role: "admin" }, true, /role must be one of/],
    [{ visibility: "internal" }, true, /visibility must be one of/],
    [{ tags: "a,b" }, true, /array of strings/],
    [{ label: "Outreach reply" }, true, /would change nothing/],
  ])("refuses %j", (value, canEdit, message) => {
    expect(() => parseTemplateDraftValue(value, draft, canEdit)).toThrow(message);
  });
});

describe("humanizeManagedBy", () => {
  it("turns a job key into words a person reads", () => {
    expect(humanizeManagedBy("crm.reply_drafting")).toBe("CRM reply drafting");
    expect(humanizeManagedBy("notifications.digest")).toBe("Notifications digest");
  });
});

describe("parseArchiveTemplateValue", () => {
  it("accepts true for the owner", () => {
    expect(() => parseArchiveTemplateValue(true, true)).not.toThrow();
  });
  it.each([
    [true, false, /belongs to someone else/],
    [false, true, /expects true/],
    [{}, true, /expects true/],
  ])("refuses %j (can edit %s)", (value, canEdit, message) => {
    expect(() => parseArchiveTemplateValue(value, canEdit as boolean)).toThrow(message);
  });
});
