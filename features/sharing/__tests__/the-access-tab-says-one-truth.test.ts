/**
 * 🚨 THE ACCESS TAB SAYS ONE TRUTH (lane RECORDS-UI-FIX, guide re-walk 2026-09-23).
 *
 * A new table in admin's Workspace — Backflow test readings, spring 2026 — read on the
 * Share dialog's Access tab: "Visibility: Internal — readable inside the owning
 * organization" and, right under it, "Private — only you". The table's SETTING is internal;
 * the organization shows its members only what is shared with them, so the store answers
 * `org_readable = false`. The "Who can open it" line is read from the same answer the headline
 * reads (access ladder T-13: never from a row setting), so it can no longer contradict it.
 *
 * RED before: `accessSummaryView(...).visibility_label` was the bare setting's label.
 */
import { accessSummaryView } from "@/features/sharing/format";
import type { AccessSummary } from "@/features/sharing/service/accessSummary";

const BASE: AccessSummary = {
  entityType: "custom_record",
  entityId: "98fb1727-3c2e-4d1a-9b8f-5e6a7c4d2b10",
  ownerId: "87a6e699-3622-4869-8843-d0867456c0dd",
  viewerIsOwner: true,
  organizationId: "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f",
  organizationName: "admin's Workspace",
  canManage: true,
  isPublic: false,
  orgReadable: false,
  directGrantCount: 0,
  directGrants: [],
  memberCount: 3,
  containers: [],
} as unknown as AccessSummary;

describe("the Access tab says one truth", () => {
  it("a table the organization does not open to its members is not called open inside it", () => {
    const view = accessSummaryView(BASE, "custom_record");
    expect(view.headline).toBe("Private — only you");
    expect(view.reach_label).toBe("Only its owner and the people it is shared with");
  });

  it("a table the organization can read says every member can open it, beside a headline that agrees", () => {
    const view = accessSummaryView({ ...BASE, orgReadable: true }, "custom_record");
    expect(view.reach_label).toBe("Every member of admin's Workspace can open it");
    expect(view.headline).toContain("everyone in admin's Workspace");
  });

  it("a record published to the web says so", () => {
    const view = accessSummaryView({ ...BASE, isPublic: true }, "custom_record");
    expect(view.reach_label).toContain("Published to the web");
  });
});
