"use client";

import { useCallback, useRef, useState } from "react";
import { isOrganizationRequiredError } from "@/lib/organizations/organizationRequiredError";
import { toast, toastErrorAlreadyCaptured } from "@/lib/toast";
import { noteCreateErrorMessage } from "../utils/writeErrors";

/** One toast per control, replaced in place — five angry clicks are one message. */
const DRAFT_FAILURE_TOAST_ID = "notes-new-note-failed";

/**
 * One truthful async boundary for every Notes draft producer — and the ONE
 * place a failed "+" is announced.
 *
 * THE SCREAM LIVES HERE, NOT IN THE SURFACE (2026-09-18). Until then each
 * surface rendered `error` however it liked, and every click handler ended in
 * `.catch(() => undefined)` trusting it to. The tab bar rendered it as
 * screen-reader-only text: a multi-org user pressed "+", the folder create was
 * refused, and NOTHING visible happened — for six days, for everyone whose
 * "Draft" folder lived in another organization. A surface cannot opt out of a
 * toast it does not own, so the boundary raises it. Surfaces may still render
 * `error` inline as well; none may be the only thing that does.
 *
 * The one exception is "no organization is selected": the surface renders the
 * picker for it (`OrganizationRequiredNotice`), which is louder than a toast
 * and carries the remedy, so a second announcement would only be noise.
 */
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
      toast.dismiss(DRAFT_FAILURE_TOAST_ID);
    } catch (cause) {
      const message = noteCreateErrorMessage(cause);
      const needsOrganization = isOrganizationRequiredError(cause);
      setError(message);
      setOrganizationRequired(needsOrganization);
      if (!needsOrganization) {
        // A rejected thunk arrives as RTK's serialized plain object and the
        // store middleware has ALREADY filed it; a real Error came from outside
        // a thunk and this toast is its only capture.
        const announce = cause instanceof Error ? toast.error : toastErrorAlreadyCaptured;
        announce(message, { id: DRAFT_FAILURE_TOAST_ID, duration: 10_000 });
      }
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
