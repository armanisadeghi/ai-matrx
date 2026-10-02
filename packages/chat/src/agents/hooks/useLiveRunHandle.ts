"use client";

/**
 * useLiveRunHandle — own ONE live agent run's conversation instance from a
 * component, when the launch itself happens somewhere else (a thunk, a lane, a
 * service call that takes an `onConversationCreated` callback).
 *
 * `useLiveAgentRun` covers the case where the component both launches and
 * watches. It cannot cover a thunk-launched run: the thunk owns the launch, the
 * component owns the screen. This hook is the missing half — the component
 * claims the conversation the thunk created, renders it
 * (`<LiveRunDisplay conversationId={…}>` or the floating `LiveRunWindow`), and
 * the instance is destroyed on the next claim and on unmount, so keeping it
 * alive for the display never becomes a leak.
 *
 * Contract for the launch side: pass `displayMode: "direct"` + `keepInstance:
 * true` + `onConversationCreated: handle.claim`. Without `keepInstance` the
 * launcher tears the instance down at the end of the run and the display goes
 * blank at the exact moment the content completes.
 */

import { useEffect, useRef, useState } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { destroyInstanceIfAllowed } from "@/features/agents/redux/execution-system/conversations/conversations.thunks";

export interface LiveRunHandle {
  /** The claimed conversation — feed to `<LiveRunDisplay conversationId>`. */
  conversationId: string | null;
  /**
   * Adopt a conversation as THIS handle's live run. Pass it straight through as
   * the launcher's `onConversationCreated`. Claiming a second run releases the
   * first — a stale stream can never leak into the next run's display.
   */
  claim: (conversationId: string) => void;
  /** Drop the current run: destroys the instance and clears the handle. */
  release: () => void;
}

export function useLiveRunHandle(): LiveRunHandle {
  const dispatch = useAppDispatch();
  const [conversationId, setConversationId] = useState<string | null>(null);
  // The ref is what the unmount cleanup and the async launch callbacks read —
  // state would be stale inside both.
  const ownedRef = useRef<string | null>(null);

  const destroyOwned = () => {
    const owned = ownedRef.current;
    if (owned) {
      ownedRef.current = null;
      dispatch(destroyInstanceIfAllowed(owned));
    }
  };

  const claim = (next: string) => {
    if (ownedRef.current === next) return;
    destroyOwned();
    ownedRef.current = next;
    setConversationId(next);
  };

  const release = () => {
    destroyOwned();
    setConversationId(null);
  };

  useEffect(() => () => destroyOwned(), [dispatch]);

  return { conversationId, claim, release };
}
