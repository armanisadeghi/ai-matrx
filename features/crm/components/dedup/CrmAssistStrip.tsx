"use client";

/**
 * CrmAssistStrip — the /crm page's inline assist chips.
 *
 * Runs the dedup sweep (crm-assists-producer.ts) once per browser session
 * per user — one deterministic RPC per org that auto-merges identity-key
 * collisions and refreshes weak-signal suggestions — then renders this
 * surface's pending assists through the canonical AssistStrip (never a
 * forked chip component). Reports the pending-suggestion count up so the
 * header's Duplicates badge stays honest without a second query.
 */

import { useEffect, useRef } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { AssistStrip } from "@/features/assists/components/AssistStrip";
import {
  CRM_ASSIST_SURFACE,
  produceCrmDedupAssists,
} from "../../crm-assists-producer";

/** Users already swept this browser session. Module-scoped on purpose. */
const sweptUsers = new Set<string>();

export function CrmAssistStrip({
  userId,
  orgIds,
  onPendingCount,
  className,
}: {
  userId: string | null;
  orgIds: string[] | null;
  /** Called with the fresh pending-pair count once the sweep finishes. */
  onPendingCount?: (count: number) => void;
  className?: string;
}) {
  const dispatch = useAppDispatch();
  // Ref so a re-rendered callback can't re-trigger the once-per-session sweep.
  const onPendingCountRef = useRef(onPendingCount);
  onPendingCountRef.current = onPendingCount;

  useEffect(() => {
    if (!userId || !orgIds || orgIds.length === 0) return;
    if (sweptUsers.has(userId)) return;
    sweptUsers.add(userId);
    void produceCrmDedupAssists({ userId, orgIds, dispatch }).then((count) => {
      onPendingCountRef.current?.(count);
    });
  }, [userId, orgIds, dispatch]);

  return <AssistStrip surfaceName={CRM_ASSIST_SURFACE} className={className} />;
}
