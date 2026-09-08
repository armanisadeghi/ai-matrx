/**
 * What a review row IS, as text — the lane that filed it and the full blob the
 * list's search must cover.
 *
 * Arman, 2026-09-07: *"I'm trying to find what you need me to review in
 * agent-review but I can't seem to find it — it's one of the biggest weaknesses
 * of the system."* Search covered only the rendered COLUMNS (title, status,
 * domain, feature, repo, url), so the sentence an agent actually wrote — the
 * instructions — and the lane that filed the row were both unsearchable. This
 * module is the one place that says what a row's searchable identity is, so the
 * table, the surface scope, and any future exporter agree.
 */

import { isJsonObject } from "@/types/json";
import type { ReviewQueueRow } from "@/features/admin/agent-review/types";

/** Shown when a row was filed without `metadata.origin.agent_label`. */
export const REVIEW_LANE_UNLABELLED = "Not labeled";

function metadataObject(row: ReviewQueueRow): Record<string, unknown> | null {
  return isJsonObject(row.metadata) ? row.metadata : null;
}

function nestedObject(
  parent: Record<string, unknown> | null,
  key: string,
): Record<string, unknown> | null {
  const value = parent?.[key];
  return isJsonObject(value) ? value : null;
}

function nestedString(
  parent: Record<string, unknown> | null,
  key: string,
): string | null {
  const value = parent?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * The campaign/lane slug that filed this row (`metadata.origin.agent_label`).
 * One filter on this column shows a whole lane's items — which is the point of
 * THE LANE TAG RULE in the `agent-review-queue` skill.
 */
export function reviewLaneLabel(row: ReviewQueueRow): string {
  const origin = nestedObject(metadataObject(row), "origin");
  return nestedString(origin, "agent_label") ?? REVIEW_LANE_UNLABELLED;
}

/** Free-text notes an agent left on the row, when it left any. */
export function reviewMetadataNotes(row: ReviewQueueRow): string | null {
  const metadata = metadataObject(row);
  const notes = nestedString(metadata, "notes");
  const verificationNotes = nestedString(
    nestedObject(nestedObject(metadata, "triage"), "verification"),
    "notes",
  );
  return [notes, verificationNotes].filter(Boolean).join(" ") || null;
}

/**
 * Everything a search for this row may legitimately match. Passed to
 * `MatrxDataTable` as `searchText`, so it widens matching WITHOUT adding a
 * column for every searchable field.
 */
export function reviewSearchText(
  row: ReviewQueueRow,
  names: { domain: string; feature: string },
): string {
  const origin = nestedObject(metadataObject(row), "origin");
  return [
    row.title,
    row.instructions,
    row.url,
    row.repo_slug,
    names.domain,
    names.feature,
    row.feedback ?? "",
    reviewLaneLabel(row),
    nestedString(origin, "thread_id") ?? "",
    nestedString(origin, "branch") ?? "",
    reviewMetadataNotes(row) ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}
