"use client";

import { useCallback, useRef, useState } from "react";
import { draftInitializationErrorMessage } from "../redux/thunks";
import { isOrganizationRequiredError } from "@/lib/organizations/organizationRequiredError";

/** One truthful async boundary for every Notes draft producer. */
export function useDraftInitializationControl() {
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** True when the failure is "no organization is selected" — the surface
   *  renders the honest picker (`OrganizationRequiredNotice`) for it, never
   *  the raw sentence. */
  const [organizationRequired, setOrganizationRequired] = useState(false);
  const run = useCallback(async (operation: () => Promise<void>) => {
    if (inFlight.current) {
      const busy = new Error("A new note is already being started. Please wait.");
      setError(busy.message);
      throw busy;
    }
    inFlight.current = true;
    setPending(true);
    setError(null);
    setOrganizationRequired(false);
    try {
      await operation();
    } catch (cause) {
      setError(draftInitializationErrorMessage(cause));
      setOrganizationRequired(isOrganizationRequiredError(cause));
      throw cause;
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }, []);
  /** Clear a shown failure — e.g. once the organization it asked for exists. */
  const reset = useCallback(() => {
    setError(null);
    setOrganizationRequired(false);
  }, []);
  return { run, pending, error, organizationRequired, reset };
}
