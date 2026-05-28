/**
 * features/skills/service/skillsStreamHandler.ts
 *
 * Bridges `RESOURCE_CHANGED` stream events with `kind` starting in `skill`
 * into the skills slice. Called from the central stream pump
 * (`features/agents/redux/execution-system/thunks/process-stream.ts`).
 *
 * The slice doesn't refetch — useSkills() owns that side effect by
 * subscribing to `lastIngestAt`. Keeping the dispatch surface tiny here
 * makes it safe to wire from multiple stream-receiver sites.
 */

import type { AppDispatch } from "@/lib/redux/store";

import { skillsActions } from "../redux/skillsSlice";

interface ResourceChangedPayload {
  kind?: string;
  action?: string;
  resource_id?: string;
  metadata?: Record<string, unknown>;
}

/** True when `kind` is a skill-related namespace we want to react to. */
export function isSkillStreamEvent(kind: string | undefined): boolean {
  if (!kind) return false;
  return kind.startsWith("skill");
}

/** Dispatch a slice action for a `resource_changed` event whose `kind`
 * matches `isSkillStreamEvent`. No-op otherwise. */
export function applySkillStreamEvent(
  dispatch: AppDispatch,
  payload: ResourceChangedPayload,
): void {
  const kind = payload.kind;
  if (!isSkillStreamEvent(kind)) return;

  const action = (payload.action ?? "modified") as
    | "created"
    | "modified"
    | "deleted"
    | "invalidated";
  dispatch(
    skillsActions.streamEventReceived({
      kind: kind as string,
      action,
      resourceId: payload.resource_id ?? "",
      metadata: payload.metadata ?? {},
    }),
  );
}
