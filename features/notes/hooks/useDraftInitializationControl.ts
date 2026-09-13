"use client";

import { useCallback, useRef, useState } from "react";
import { draftInitializationErrorMessage } from "../redux/thunks";

/** One truthful async boundary for every Notes draft producer. */
export function useDraftInitializationControl() {
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (operation: () => Promise<void>) => {
    if (inFlight.current) {
      const busy = new Error("A new note is already being started. Please wait.");
      setError(busy.message);
      throw busy;
    }
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      await operation();
    } catch (cause) {
      setError(draftInitializationErrorMessage(cause));
      throw cause;
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }, []);
  return { run, pending, error };
}
