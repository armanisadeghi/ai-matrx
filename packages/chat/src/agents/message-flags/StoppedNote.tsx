"use client";

/**
 * The quiet mark on an answer the person stopped (PB-05 run 2, prod ac170b56…:
 * after a reload the stopped answer simply ended mid-sentence, indistinguishable
 * from a finished one).
 *
 * Derived, never stamped by the client: live, from the stream request's
 * `cancelled` status; after a reload, from the persisted row — aidream writes
 * `metadata.stopped = true` on the partial a Stop keeps
 * (executor._stopped_call_response). A state marker, not an error.
 */

import { Square } from "lucide-react";

export function isStoppedAnswer(
  metadata: unknown,
  requestStatus: string | undefined,
): boolean {
  if (requestStatus === "cancelled") return true;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return false;
  }
  return (metadata as Record<string, unknown>).stopped === true;
}

export function StoppedNote({
  metadata,
  requestStatus,
}: {
  metadata: unknown;
  requestStatus?: string;
}) {
  if (!isStoppedAnswer(metadata, requestStatus)) return null;
  return (
    <p
      className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground"
      data-testid="stopped-note"
    >
      <Square className="h-2.5 w-2.5" aria-hidden />
      Stopped here
    </p>
  );
}
