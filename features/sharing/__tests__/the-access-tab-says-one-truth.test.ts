/**
 * 🚨 THE ACCESS TAB SAYS ONE TRUTH (lane RECORDS-UI-FIX, guide re-walk 2026-09-23).
 *
 * A new table in admin's Workspace — Backflow test readings, spring 2026 — read on the
 * Share dialog's Access tab: "Visibility: Internal — readable inside the owning
 * organization" and, right under it, "Private — only you". The table's SETTING is internal;
 * the organization shows its members only what is shared with them, so the store answers
 * `org_readable = false`. The visibility row now says both halves, so it can no longer
 * contradict the headline.
 *
 * RED before: `accessSummaryView(...).visibility_label` was the bare setting's label.
 */
import { accessSummaryView, visibilityLabel } from "@/features/sharing/format";
import type { AccessSummary } from "@/features/sharing/service/accessSummary";

const BASE: AccessSummary = {
  entityType: "custom_record",
  entityId: "98fb1727-3c2e-4d1a-9b8f-5e6a7c4d2b10",
  visibility: "internal",
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
  it("an internal table the organization does not open to its members is not called readable inside it", () => {
    const view = accessSummaryView(BASE, "custom_record");
    expect(view.headline).toBe("Private — only you");
    expect(view.visibility_label).not.toBe(visibilityLabel("internal"));
    expect(view.visibility_label).toContain("Internal");
    expect(view.visibility_label).toContain("shows its members only what is shared with them");
  });

  it("an internal table the organization can read keeps the plain label, beside a headline that agrees", () => {
    const view = accessSummaryView({ ...BASE, orgReadable: true }, "custom_record");
    expect(view.visibility_label).toBe("Internal — readable inside the owning organization");
    expect(view.headline).toContain("everyone in admin's Workspace");
  });
});
