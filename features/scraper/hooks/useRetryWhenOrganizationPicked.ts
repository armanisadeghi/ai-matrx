"use client";

import { useEffect, useRef } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";

/**
 * Re-run a scrape that stopped for want of an organization, the moment the
 * person picks one — they asked for the page once; asking twice is our defect.
 *
 * Fires at most ONCE per `active` episode, and only on the transition from no
 * organization to one (an organization already selected when the prompt
 * appeared is not a pick). The organization gate itself is untouched: the
 * retried request goes through the same kernel with the newly chosen value.
 */
export function useRetryWhenOrganizationPicked(
  active: boolean,
  retry: () => void,
): void {
  const organizationId = useAppSelector(selectOrganizationId);
  const sawMissing = useRef(false);
  const fired = useRef(false);
  const retryRef = useRef(retry);

  useEffect(() => {
    retryRef.current = retry;
  });

  useEffect(() => {
    if (!active) {
      sawMissing.current = false;
      fired.current = false;
      return;
    }
    if (!organizationId) {
      sawMissing.current = true;
      return;
    }
    if (sawMissing.current && !fired.current) {
      fired.current = true;
      retryRef.current();
    }
  }, [active, organizationId]);
}
