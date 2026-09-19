"use client";

/**
 * features/capture-ladder/NeedsYouAssistProducer.tsx
 *
 * A headless leaf: it renders NOTHING and never will.
 *
 * It watches the capture queue (`useNeedsYou` — realtime plus a poll floor,
 * because a dropped socket has no replay) and keeps exactly one assist row per
 * workspace in step with it. The assists dock does all the showing.
 *
 * Mounted once in `app/DeferredSingletonCore.tsx`, in the same slot the old
 * floating tray held, so there is one always-on thing in that corner instead
 * of two.
 *
 * 🚨 WHY A COMPONENT AND NOT A SWEEP. The queue is live: a batch scrape finishes
 * minutes after the person left that screen, and the row has to reach them
 * wherever they are. The other producers in this repo sweep once on a surface
 * they belong to; this one has no surface, which is precisely why the thing it
 * replaced was global too.
 */

import { useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  selectOrganizationId,
  selectOrganizationName,
} from "@/lib/redux/slices/appContextSlice";
import { useNeedsYou } from "@/features/capture-ladder/useNeedsYou";
import { produceNeedsYouAssist } from "@/features/capture-ladder/needsYouAssist";

export function NeedsYouAssistProducer(): null {
  const dispatch = useAppDispatch();
  const userId = useAppSelector(selectUserId);
  const organizationId = useAppSelector(selectOrganizationId);
  const organizationName = useAppSelector(selectOrganizationName);
  const { state, handoffs } = useNeedsYou();

  // One sweep in flight at a time, and only when the queue actually changed.
  // Without this the poll floor would re-emit the same row every minute,
  // bumping `occurrences` forever and making "you have had this for three
  // weeks" unreadable.
  const running = useRef(false);
  const lastSignature = useRef<string | null>(null);

  useEffect(() => {
    // 🚨 Only `ready` produces. Every other state — loading, no workspace, the
    // table missing, the read failing — is a state in which we do NOT know the
    // queue is empty, and resolving the row on a failed read would delete the
    // person's only sign that work is waiting. A read we could not do is never
    // evidence of nothing to do.
    if (state.kind !== "ready") return;
    if (!userId || !organizationId) return;

    const signature = `${organizationId}|${handoffs
      .map((row) => `${row.id}:${row.status}`)
      .join(",")}`;
    if (signature === lastSignature.current) return;
    if (running.current) return;

    running.current = true;
    void produceNeedsYouAssist({
      userId,
      organizationId,
      organizationName,
      handoffs,
      dispatch,
    })
      .then(() => {
        lastSignature.current = signature;
      })
      .catch((error: unknown) => {
        // Never throws into the tree. A producer that cannot write is a missing
        // nudge, not a broken app — and the full list at /capture/needs-you is
        // still there, reading the same queue directly.
        console.error(
          "[capture-ladder] could not update the waiting-for-your-browser assist",
          error,
        );
      })
      .finally(() => {
        running.current = false;
      });
  }, [state.kind, handoffs, userId, organizationId, organizationName, dispatch]);

  return null;
}

export default NeedsYouAssistProducer;
