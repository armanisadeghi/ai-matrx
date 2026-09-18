"use client";

/**
 * "2 open deals" beside a Person — the count PLAN §4.6 asks for next to every
 * attendee who is a Person here ("their name as a door AND a count of open
 * items").
 *
 * 🚨 N4 (VERIFY-U-W1-U-W2) — ONE COUNT, ONE SOURCE, BOTH SURFACES. This lived
 * inside `CalendarEventSections.tsx`, so the event's Detail had it and the AGENDA
 * — the list a person actually looks at, and the whole reason for putting People
 * on an agenda — showed a bare name. It lives here now and both import it: a
 * second count beside the same Person is how two screens come to disagree about
 * what is open with someone.
 *
 * The open items are that Person's OPEN DEALS, read through crm's own
 * `fetchDealsForParty`, which is the only per-Person item lookup this platform
 * has today. It is capped, so a count AT the cap says "50+" rather than a number
 * that could be wrong, and a failed read says it could not be read rather than
 * claiming zero.
 */

import { useEffect, useState } from "react";

import { fetchDealsForParty } from "@/features/crm/deals/service";

/** What `fetchDealsForParty` reads at most — the cap the sentence must respect. */
export const DEALS_QUERY_CAP = 50;

export function OpenItemsCount({
  partyId,
  className = "text-xs text-muted-foreground",
}: {
  partyId: string;
  /** The host's own type scale — a list row is smaller than a record section. */
  className?: string;
}) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const deals = await fetchDealsForParty(partyId);
        if (cancelled) return;
        const open = deals.filter((deal) => deal.status === "open").length;
        const capped = deals.length >= DEALS_QUERY_CAP;
        if (open === 0) {
          setText(capped ? "No open deals in the most recent 50" : "No open deals");
          return;
        }
        setText(
          capped
            ? `${open}+ open deals`
            : open === 1
              ? "1 open deal"
              : `${open} open deals`,
        );
      } catch {
        // The count is context, not the subject: a failed count says it could not
        // be read rather than claiming zero.
        if (!cancelled) setText("Open deals could not be read");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [partyId]);

  if (!text) return null;
  return <span className={className}>{text}</span>;
}

export default OpenItemsCount;
