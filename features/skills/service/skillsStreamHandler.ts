/**
 * features/skills/service/skillsStreamHandler.ts
 *
 * Bridges `RESOURCE_CHANGED` stream events with `kind` starting in `skill`
 * into the skill catalog (`@ai-matrx/agents/skills`), which the skills slice
 * mirrors. Called from the central stream pump
 * (`features/agents/redux/execution-system/thunks/process-stream.ts`).
 *
 * The catalog doesn't refetch — useSkills() owns that side effect by
 * subscribing to `lastIngestAt`. Keeping the dispatch surface tiny here
 * makes it safe to wire from multiple stream-receiver sites.
 */

import type { Action } from "redux";

import { getSkillCatalog } from "@/lib/skills/skillCatalog";

/** Minimal dispatch shape — accepts any thunk dispatch the central stream
 * pump might pass in. Avoids tight coupling to the full RootState type. */
type DispatchLike = (action: Action | unknown) => unknown;

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

/** Hand a `resource_changed` event whose `kind` matches `isSkillStreamEvent`
 * to the skill catalog. No-op otherwise. `dispatch` stays in the signature
 * for the stream pump's call shape; the catalog needs none. */
export function applySkillStreamEvent(
  _dispatch: DispatchLike,
  payload: ResourceChangedPayload,
): void {
  const kind = payload.kind;
  if (!isSkillStreamEvent(kind)) return;

  const action = (payload.action ?? "modified") as
    | "created"
    | "modified"
    | "deleted"
    | "invalidated";
  getSkillCatalog().applyStreamEvent({
    kind: kind as string,
    action,
    resourceId: payload.resource_id ?? "",
    metadata: payload.metadata ?? {},
  });
}
