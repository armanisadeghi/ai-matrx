/** Bridge skill stream events into the shared skill catalog. */
import type { Action } from "redux";

import { getSkillCatalog } from "@/lib/skills/skillCatalog";

type DispatchLike = (action: Action | unknown) => unknown;

interface ResourceChangedPayload {
  kind?: string;
  action?: string;
  resource_id?: string;
  metadata?: Record<string, unknown>;
}

export function isSkillStreamEvent(kind: string | undefined): boolean {
  return Boolean(kind?.startsWith("skill"));
}

export function applySkillStreamEvent(
  _dispatch: DispatchLike,
  payload: ResourceChangedPayload,
): void {
  if (!isSkillStreamEvent(payload.kind)) return;

  const action = (payload.action ?? "modified") as
    | "created"
    | "modified"
    | "deleted"
    | "invalidated";
  getSkillCatalog().applyStreamEvent({
    kind: payload.kind as string,
    action,
    resourceId: payload.resource_id ?? "",
    metadata: payload.metadata ?? {},
  });
}
