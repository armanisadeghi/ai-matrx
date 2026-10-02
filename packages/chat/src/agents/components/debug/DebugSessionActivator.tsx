"use client";

/**
 * Activates debug-session mode in Redux on mount.
 * While active, destroyInstance dispatches are no-ops, so all instance
 * and request data is retained for the duration of the browser session.
 *
 * Render this once anywhere in the tree to enable preservation:
 *   - agents/build route
 *   - agents/run route
 *   - Any debug panel (StreamDebugPanel activates it automatically too)
 */

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { setDebugSession } from "@/features/agents/redux/execution-system/conversations/conversations.slice";

export function DebugSessionActivator() {
  const dispatch = useAppDispatch();
  const debugSessionActive = useAppSelector(
    (state) => state.conversations.debugSessionActive,
  );

  useEffect(() => {
    if (!debugSessionActive) {
      dispatch(setDebugSession(true));
    }
  }, [dispatch, debugSessionActive]);

  return null;
}
