/**
 * Runtime scope builder for `matrx-admin/agent-review` — the Agent Review
 * queue list at `/administration/users/agent-review`.
 *
 * The table loads three things: every `agent.review_queue` row (through
 * `readAllRows`, so the counts here are TRUE counts, not a page), the registry
 * classification vocabulary (`platform.taxonomy_node` + `platform.repo`), and
 * the view toggle in the URL. This module turns exactly that raw state into
 * the values the manifest declares — nothing is fetched here, and nothing the
 * page does not already hold is invented.
 *
 * Triage routing lives inside the versioned `metadata.triage` envelope that
 * the `agent-review-queue` skill writes on insert; it is parsed (never
 * trusted blindly) through `parseReviewMetadata`, and a row whose envelope is
 * missing or invalid counts as UNCLASSIFIED rather than being silently
 * bucketed somewhere plausible.
 */

import {
  createAdminAgentReviewScope,
  type AdminAgentReviewSampleEntry,
  type AdminAgentReviewVocabulary,
} from "@/features/surfaces/manifests/admin-agent-review.manifest";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import type { ReviewRegistry } from "@/features/admin/agent-review/registry";
import {
  parseReviewMetadata,
  REVIEW_LANES,
  REVIEW_TOOLS,
} from "@/features/admin/agent-review/triage";
import {
  REVIEW_STATUSES,
  type ReviewQueueRow,
  type ReviewStatus,
} from "@/features/admin/agent-review/types";
import { reviewTargetPageDisplay } from "@/features/admin/agent-review/target-page";

/** How many rows ride along in `queue_sample`. Instructions and feedback are
 *  prose; the whole queue would blow an LLM context window. */
const QUEUE_SAMPLE_SIZE = 25;

/** The queue's two views, mirroring the table's `view` URL state. */
export type ReviewQueueView = "inbox" | "all";

export interface AgentReviewScopeInput {
  rows: ReviewQueueRow[];
  registry: ReviewRegistry;
  view: ReviewQueueView;
  /** The rows the table is actually showing under the current view + filters. */
  visibleRows: ReviewQueueRow[];
  loadError?: string | null;
}

function domainName(row: ReviewQueueRow, registry: ReviewRegistry): string {
  return registry.domainsById.get(row.domain_id)?.name ?? "Not assigned";
}

function featureName(row: ReviewQueueRow, registry: ReviewRegistry): string {
  if (!row.feature_id) return "Not assigned";
  return registry.featuresById.get(row.feature_id)?.name ?? "Not assigned";
}

function countByStatus(rows: ReviewQueueRow[]): Record<ReviewStatus, number> {
  const counts = Object.fromEntries(
    REVIEW_STATUSES.map((status) => [status, 0]),
  ) as Record<ReviewStatus, number>;
  for (const row of rows) {
    if (row.status in counts) counts[row.status as ReviewStatus] += 1;
  }
  return counts;
}

/** One queue row as the agent reads it: identity, classification, routing. */
export function toSampleEntry(
  row: ReviewQueueRow,
  registry: ReviewRegistry,
): AdminAgentReviewSampleEntry {
  const parsed = parseReviewMetadata(row.metadata);
  return {
    id: row.id,
    title: row.title,
    url: reviewTargetPageDisplay(row.url).fullHref,
    status: row.status as ReviewStatus,
    source: row.source,
    repo_slug: row.repo_slug,
    domain: domainName(row, registry),
    feature: featureName(row, registry),
    instructions: row.instructions,
    feedback: row.feedback,
    conversation_id: row.conversation_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    triage: parsed.state === "ready" ? parsed.triage : null,
  };
}

function buildVocabulary(registry: ReviewRegistry): AdminAgentReviewVocabulary {
  return {
    domains: registry.domains.map((domain) => ({
      id: domain.id,
      slug: domain.slug,
      name: domain.name,
      features: domain.features.map((feature) => ({
        id: feature.id,
        slug: feature.slug,
        name: feature.name,
      })),
    })),
    repos: registry.repos.map((repo) => repo.slug),
  };
}

export function buildAgentReviewScope({
  rows,
  registry,
  view,
  visibleRows,
  loadError,
}: AgentReviewScopeInput): SurfaceScopePayload {
  const statusCounts = countByStatus(rows);

  // Repair routing is only meaningful for work an agent or Arman sent BACK.
  const repairRows = rows.filter(
    (row) =>
      row.status === "agent_changes_requested" ||
      row.status === "human_changes_requested",
  );

  const laneCounts = Object.fromEntries(
    REVIEW_LANES.map((lane) => [lane, 0]),
  ) as Record<string, number>;
  const toolCounts = Object.fromEntries(
    REVIEW_TOOLS.map((tool) => [tool, 0]),
  ) as Record<string, number>;
  for (const row of repairRows) {
    const parsed = parseReviewMetadata(row.metadata);
    if (parsed.state !== "ready") continue;
    laneCounts[parsed.triage.lane] += 1;
    // Deliberately overlapping: one repair can need browser AND database.
    for (const tool of parsed.triage.required_tools) toolCounts[tool] += 1;
  }

  const unclassified = rows.filter(
    (row) => parseReviewMetadata(row.metadata).state !== "ready",
  ).length;

  return createAdminAgentReviewScope({
    queue_row_count: rows.length,
    queue_view: view,
    visible_row_count: visibleRows.length,
    submitted_count: statusCounts.submitted,
    agent_review_count: statusCounts.agent_review,
    agent_changes_requested_count: statusCounts.agent_changes_requested,
    ready_for_human_count: statusCounts.ready_for_human,
    human_changes_requested_count: statusCounts.human_changes_requested,
    approved_count: statusCounts.approved,
    archived_count: statusCounts.archived,
    unclassified_count: unclassified,
    repair_lane_counts: laneCounts,
    repair_tool_counts: toolCounts,
    classification_vocabulary: buildVocabulary(registry),
    queue_sample: visibleRows
      .slice(0, QUEUE_SAMPLE_SIZE)
      .map((row) => toSampleEntry(row, registry)),
    ...(loadError ? { queue_load_error: loadError } : {}),
  });
}
