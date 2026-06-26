// features/war-room/service/readApi.ts
//
// Canonical read API for war-room thread lists and tab content modules.
// Uses the assoc_* SECURITY-DEFINER RPCs (via associationsService) — the
// public `war_room_threads` / `thread_contents` SQL functions query
// `platform.associations` directly and fail for authenticated clients
// (no table grant). Same edge semantics; RLS-respecting via assoc_for_*.

import { supabase } from "@/utils/supabase/client";
import { workspaceDb } from "@/utils/supabase/workspaceDb";
import { associationsService } from "@/features/scopes/service/associationsService";
import { isScopesRpcErr } from "@/features/scopes/types";
import { mapThreadContentsToAssignments } from "../utils/threadContentsToAssignments";
import {
  containerKey,
  type ThreadContentModule,
  type WarRoomAssignment,
} from "../types";

/** Structural edge tokens — never tab modules (matches DB `thread_contents`). */
const STRUCTURAL_SOURCE_TYPES = new Set([
  "project",
  "task",
  "war_room",
  "thread",
  "scope",
  "scope_type",
  "organization",
]);

function isTabModuleSourceType(sourceType: string): boolean {
  return !STRUCTURAL_SOURCE_TYPES.has(sourceType);
}

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
  if (isScopesRpcErr(res)) {
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
    workspaceDb(supabase)
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
  if (isScopesRpcErr(threadEdgesRes)) {
    throw formatReadError("fetchThreadContents.edges", threadEdgesRes.error);
  }

  const modules: ThreadContentModule[] = [];

  for (const edge of threadEdgesRes.data.edges) {
    if (!isTabModuleSourceType(edge.sourceType)) continue;
    modules.push({
      module_type: edge.sourceType,
      module_id: edge.sourceId,
      origin: "thread",
      anchor_type: "",
      anchor_id: "",
    });
  }

  const anchorType = threadRow.data?.anchor_type;
  const anchorId = threadRow.data?.anchor_id;
  if ((anchorType === "project" || anchorType === "task") && anchorId) {
    const anchorRes = await associationsService.listForTargets(anchorType, [
      anchorId,
    ]);
    if (isScopesRpcErr(anchorRes)) {
      throw formatReadError("fetchThreadContents.anchor", anchorRes.error);
    }
    for (const edge of anchorRes.data.edges) {
      if (!isTabModuleSourceType(edge.sourceType)) continue;
      modules.push({
        module_type: edge.sourceType,
        module_id: edge.sourceId,
        origin: "anchor",
        anchor_type: anchorType,
        anchor_id: anchorId,
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
