// features/war-room/service/readApi.ts
//
// Canonical read API for war-room thread lists and tab content modules.
// Uses the assoc_* SECURITY-DEFINER RPCs (via associationsService) — the
// public `war_room_threads` / `thread_contents` SQL functions query
// `platform.associations` directly and fail for authenticated clients
// (no table grant). Same edge semantics; RLS-respecting via assoc_for_*.
//
// Content vs structure is decided by the ONE canonical classifier
// (`isContentSourceEdge`) — the vocabulary is open: any registered entity
// token attached to a thread is content and hydrates into the assignment
// buckets. The old local whitelist wrongly excluded `project`/`task` edges,
// so canvas-pinned tasks/projects vanished on reload.
//
// Own-thread edges carry their REAL edge fields (label + metadata) so
// `is_active` / `position` / `canvas` / `pinned` and attach-time titles
// survive hydration instead of being re-synthesized.

import { isAssociationsRpcErr } from "@ai-matrx/associations";
import { supabase } from "@/utils/supabase/client";
import { projectsDb } from "@/utils/supabase/projectsDb";
import { associationsService } from "@/features/scopes/service/associationsService";
import { isContentSourceEdge } from "@/features/scopes/service/associationEdges";
import { mapThreadContentsToAssignments } from "../utils/threadContentsToAssignments";
import {
  containerKey,
  type ThreadContentModule,
  type WarRoomAssignment,
} from "../types";

function formatReadError(
  label: string,
  err: { message?: string; code?: string },
) {
  const msg = err.message?.trim() || err.code || "unknown error";
  console.error(`[war-room] ${label} failed:`, msg, err.code ?? "");
  return new Error(msg);
}

/** Thread ids currently linked to a room via `thread → war_room` edges. */
export async function listThreadIdsForRoom(roomId: string): Promise<string[]> {
  const res = await associationsService.listForTargets("war_room", [roomId]);
  if (isAssociationsRpcErr(res)) {
    throw formatReadError("listThreadIdsForRoom", res.error);
  }
  return res.data.edges
    .filter((e) => e.sourceType === "thread")
    .map((e) => e.sourceId);
}

/** Tab modules for one thread — own content + anchor-inherited content. */
export async function fetchThreadContents(
  threadId: string,
): Promise<ThreadContentModule[]> {
  const [threadRow, threadEdgesRes] = await Promise.all([
    projectsDb(supabase)
      .from("threads")
      .select("anchor_type, anchor_id")
      .eq("id", threadId)
      .is("deleted_at", null)
      .maybeSingle(),
    associationsService.listForTargets("thread", [threadId]),
  ]);

  if (threadRow.error) {
    throw formatReadError("fetchThreadContents.thread", threadRow.error);
  }
  if (isAssociationsRpcErr(threadEdgesRes)) {
    throw formatReadError("fetchThreadContents.edges", threadEdgesRes.error);
  }

  const modules: ThreadContentModule[] = [];

  for (const edge of threadEdgesRes.data.edges) {
    if (!isContentSourceEdge(edge.sourceType, edge.metadata)) continue;
    modules.push({
      module_type: edge.sourceType,
      module_id: edge.sourceId,
      origin: "thread",
      anchor_type: "",
      anchor_id: "",
      label: edge.label,
      metadata: edge.metadata,
    });
  }

  const anchorType = threadRow.data?.anchor_type;
  const anchorId = threadRow.data?.anchor_id;
  if ((anchorType === "project" || anchorType === "task") && anchorId) {
    const anchorRes = await associationsService.listForTargets(anchorType, [
      anchorId,
    ]);
    if (isAssociationsRpcErr(anchorRes)) {
      throw formatReadError("fetchThreadContents.anchor", anchorRes.error);
    }
    for (const edge of anchorRes.data.edges) {
      if (!isContentSourceEdge(edge.sourceType, edge.metadata)) continue;
      modules.push({
        module_type: edge.sourceType,
        module_id: edge.sourceId,
        origin: "anchor",
        anchor_type: anchorType,
        anchor_id: anchorId,
        label: edge.label,
        // Anchor-inherited rows keep the edge label but NOT the edge metadata:
        // is_active/position on those edges describe the ANCHOR's container,
        // not this thread's. The mapper synthesizes thread-local state.
        metadata: null,
      });
    }
  }

  return modules;
}

/** Batch-load thread tab content → assignment buckets. */
export async function fetchThreadContentAssignmentsBulk(
  threadIds: string[],
): Promise<Record<string, WarRoomAssignment[]>> {
  if (threadIds.length === 0) return {};

  const pairs = await Promise.all(
    threadIds.map(async (threadId) => {
      const modules = await fetchThreadContents(threadId);
      return {
        key: containerKey("thread", threadId),
        assignments: mapThreadContentsToAssignments(threadId, modules),
      };
    }),
  );

  const out: Record<string, WarRoomAssignment[]> = {};
  for (const { key, assignments } of pairs) {
    out[key] = assignments;
  }
  return out;
}
