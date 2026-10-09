/**
 * The owner's page-cleanup decisions, kept in the record store as a typed table (the
 * PLATFORM-APP-DATA path: `defineTypedTable` → each organization's copy on first write).
 *
 * Why the store and not a platform table: a one-off review tool with ~150 rows that will be thrown
 * away once the cleanup lands — a trial / short-term stopgap under Arman's app-data gate
 * (common-docs systems/data/custom-data/DECISIONS.md, 2026-10-02).
 *
 * `organization` scope: the decisions are about the platform's own pages, so every member of the
 * organization they were saved in sees them. `path` is the key — one row per page.
 */
import { defineTypedTable, f } from "@ai-matrx/records/typed-table";

export const PAGE_CLEANUP_DECISIONS = ["yes", "no", "maybe"] as const;
export type PageCleanupDecision = (typeof PAGE_CLEANUP_DECISIONS)[number];

export const pageCleanupDecisions = defineTypedTable({
  name: "Page cleanup decisions",
  slug: "page_cleanup_decisions",
  kept_for: "pagecleanup",
  scope: "organization",
  owner: "feature:admin",
  key: "path",
  fields: {
    path: f.text({ label: "Page", unique: true, required: true }),
    decision: f.select(PAGE_CLEANUP_DECISIONS, { label: "Delete it" }),
    notes: f.longText({ label: "Notes" }),
    changed_at: f.modifiedTime({ label: "Changed" }),
  },
});
