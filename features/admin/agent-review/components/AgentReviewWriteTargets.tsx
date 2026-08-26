"use client";

/**
 * AgentReviewWriteTargets — the live handler for the write half of
 * `matrx-admin/agent-review` (the ONE target its manifest declares).
 *
 * Renders nothing. Mount once inside the queue list's
 * `SurfaceRuntimeProvider`, with the rows the list has loaded.
 *
 * The write goes through `updateReviewQueueRow` — the SAME service every
 * other review write uses — never raw supabase. Because super-admin RLS turns
 * a forbidden UPDATE into a silent zero-row no-op rather than an error, the
 * handler RE-READS the row afterwards and throws unless the classification
 * actually landed; the writeback runtime turns that throw into the loud toast
 * and captured error the agent reads back.
 *
 * The row's `assignment` (another agent's live claim) and `verification`
 * (the evidence gate for reaching a human) are carried over VERBATIM: this
 * target routes work, it never claims or verifies it. Status is untouchable
 * from here by design — see the manifest header.
 */

import { useEffect, useRef } from "react";

import { isJsonObject } from "@/types/json";

import { useSurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { ADMIN_AGENT_REVIEW_SURFACE_NAME } from "@/features/surfaces/manifests/admin-agent-review.manifest";
import {
  loadReviewQueueItem,
  updateReviewQueueRow,
} from "@/features/admin/agent-review/service";
import {
  metadataWithReviewTriage,
  parseReviewMetadata,
  suggestReviewTriage,
  REVIEW_LANES,
  REVIEW_PRIORITIES,
  REVIEW_TOOLS,
  REVIEW_WORKSTREAMS,
  type ReviewLane,
  type ReviewPriority,
  type ReviewTool,
  type ReviewTriage,
  type ReviewWorkstream,
} from "@/features/admin/agent-review/triage";
import type { ReviewQueueRow } from "@/features/admin/agent-review/types";

const TARGET = "review_triage_classification";

function asObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(
      `${TARGET} expects an object: { row_id, lane?, priority?, workstreams?, required_tools? }.`,
    );
  }
  return value as Record<string, unknown>;
}

function asEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new Error(
      `${TARGET}: ${field} must be one of ${allowed.join(" | ")} — got ${JSON.stringify(value)}.`,
    );
  }
  return value as T;
}

function asEnumArray<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
  { allowEmpty }: { allowEmpty: boolean },
): T[] {
  if (!Array.isArray(value)) {
    throw new Error(
      `${TARGET}: ${field} must be an array of ${allowed.join(" | ")} — it REPLACES the current set.`,
    );
  }
  if (!allowEmpty && value.length === 0) {
    throw new Error(`${TARGET}: ${field} must name at least one value.`);
  }
  const seen = value.map((entry) => asEnum(entry, allowed, field));
  // Emit in the canonical declaration order, de-duplicated, so stored triage
  // never depends on the order the agent happened to list things in.
  return allowed.filter((entry) => seen.includes(entry));
}

interface AgentReviewWriteTargetsProps {
  /** Every row the list has loaded — the set `queue_sample` is drawn from. */
  rows: ReviewQueueRow[];
  /** Called after a write lands, so the list re-reads what actually persisted. */
  onRowUpdated: (row: ReviewQueueRow) => void;
}

export function AgentReviewWriteTargets({
  rows,
  onRowUpdated,
}: AgentReviewWriteTargetsProps) {
  // The handler registers once and reads the LATEST rows through this ref,
  // never the array captured at mount.
  const rowsRef = useRef(rows);
  const onRowUpdatedRef = useRef(onRowUpdated);
  useEffect(() => {
    rowsRef.current = rows;
    onRowUpdatedRef.current = onRowUpdated;
  });

  useSurfaceWriteHandlers(ADMIN_AGENT_REVIEW_SURFACE_NAME, {
    [TARGET]: async (value: unknown) => {
      const input = asObject(value);
      const rowId = input.row_id;
      if (typeof rowId !== "string" || !rowId.trim()) {
        throw new Error(
          `${TARGET}: row_id is required — this page has no selected row, so a write must name one from queue_sample.`,
        );
      }
      const row = rowsRef.current.find((entry) => entry.id === rowId);
      if (!row) {
        throw new Error(
          `${TARGET}: no review row "${rowId}" is loaded on this page. Use an id from queue_sample.`,
        );
      }

      const hasLane = input.lane !== undefined;
      const hasPriority = input.priority !== undefined;
      const hasWorkstreams = input.workstreams !== undefined;
      const hasTools = input.required_tools !== undefined;
      if (!hasLane && !hasPriority && !hasWorkstreams && !hasTools) {
        throw new Error(
          `${TARGET}: name at least one of lane, priority, workstreams, required_tools.`,
        );
      }

      const lane: ReviewLane | undefined = hasLane
        ? asEnum(input.lane, REVIEW_LANES, "lane")
        : undefined;
      const priority: ReviewPriority | undefined = hasPriority
        ? asEnum(input.priority, REVIEW_PRIORITIES, "priority")
        : undefined;
      const workstreams: ReviewWorkstream[] | undefined = hasWorkstreams
        ? asEnumArray(input.workstreams, REVIEW_WORKSTREAMS, "workstreams", {
            allowEmpty: true,
          })
        : undefined;
      const requiredTools: ReviewTool[] | undefined = hasTools
        ? asEnumArray(input.required_tools, REVIEW_TOOLS, "required_tools", {
            allowEmpty: false,
          })
        : undefined;

      // A row with no valid envelope is classified from the page's own
      // deterministic suggestion first, so the agent's fields land on a
      // complete triage block rather than half of one.
      const parsed = parseReviewMetadata(row.metadata);
      const base: ReviewTriage =
        parsed.state === "ready" ? parsed.triage : suggestReviewTriage(row);

      const triage: ReviewTriage = {
        ...base,
        version: 1,
        lane: lane ?? base.lane,
        priority: priority ?? base.priority,
        workstreams: workstreams ?? base.workstreams,
        required_tools: requiredTools ?? base.required_tools,
        // Claim coordination and the verification record belong to the atomic
        // SQL claim protocol, not to this page.
        assignment: base.assignment,
        verification: base.verification,
      };

      const nextMetadata = metadataWithReviewTriage(row.metadata, triage);
      if (!isJsonObject(nextMetadata)) {
        throw new Error(
          `${TARGET}: the patched metadata for "${row.title}" is not storable JSON.`,
        );
      }
      await updateReviewQueueRow(row.id, { metadata: nextMetadata });

      const saved = await loadReviewQueueItem(row.id);
      const savedTriage = parseReviewMetadata(saved.metadata);
      if (
        savedTriage.state !== "ready" ||
        savedTriage.triage.lane !== triage.lane ||
        savedTriage.triage.priority !== triage.priority ||
        savedTriage.triage.required_tools.join(",") !==
          triage.required_tools.join(",") ||
        savedTriage.triage.workstreams.join(",") !==
          triage.workstreams.join(",")
      ) {
        throw new Error(
          `${TARGET}: the classification did not persist on "${row.title}". Only a super admin may write this queue.`,
        );
      }

      onRowUpdatedRef.current(saved);
    },
  });

  return null;
}

export default AgentReviewWriteTargets;
