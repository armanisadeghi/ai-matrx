/**
 * features/review-walk/api.ts
 *
 * Contract-bound client for aidream's `/review/*` drill-down surface (C-27).
 * Same pattern as `features/hindsight/api.ts` (do NOT fold these into that
 * file — it is admin-scoped and separately owned): every call goes through
 * the typed client so a backend rename is a compile error here.
 *
 * Auth is user-scoped — the conversation owner walks their own outputs; the
 * python-client attaches the Supabase session token itself.
 */
import { BackendApiError } from "@/lib/api/errors";
import { apiGet, apiPost } from "@/lib/api/typed-client";

import type {
  DescendOut,
  FindingFromWalkOut,
  FindingFromWalkRequest,
  WalkUnitKind,
} from "./types";

/**
 * One layer of the walk: the unit, its producing provider call, and every
 * input that call received — each input tagged with WHO produced it and
 * whether that edge is recorded provenance (`linked`) or derived here
 * (`inferred`).
 *
 * Expected non-2xx outcomes the UI must render honestly (never a dead-end
 * error toast): 404 with a human explanation for ephemeral/uncapturable units,
 * 403 for a conversation or workflow run the caller does not own.
 */
export async function descend(
  unitKind: WalkUnitKind,
  unitId: string,
): Promise<DescendOut> {
  const { data } = await apiGet("/review/descend", {
    query: { unit_kind: unitKind, unit_id: unitId },
  });
  return data;
}

/**
 * Turn the finished walk into a `hindsight.finding` + pinned snapshots +
 * elevated assist. The response names the finding, its carrier review and
 * enrollment — the receipt's doors.
 */
export async function findingFromWalk(
  body: FindingFromWalkRequest,
): Promise<FindingFromWalkOut> {
  const { data } = await apiPost("/review/findings/from-walk", body);
  return data;
}

/** (status, detail) from a thrown backend error — for honest stop states. */
export function describeWalkError(error: unknown): {
  status: number | null;
  detail: string;
} {
  if (error instanceof BackendApiError) {
    return { status: error.status, detail: error.detail };
  }
  if (error instanceof Error) {
    return { status: null, detail: error.message };
  }
  return { status: null, detail: "Request failed" };
}
