"use client";

/**
 * Calendar Plane A on a Person record — "Upcoming with this person" (PLAN §4.6).
 *
 * It is the SAME `AgendaPanel`, filtered to this Person's own addresses. Not a
 * second agenda: a panel wraps the canonical component, and a bespoke body here
 * would drift from the home screen's the first time either changed.
 *
 * It renders NOTHING at all when this Person has no email address here — an
 * agenda filtered by an empty set can only ever be empty, and a card that
 * announces its own emptiness on every company record is noise. Absent, not
 * dead.
 */

import { useEffect, useState } from "react";

import { extractErrorMessage } from "@/utils/errors";

import { AgendaPanel } from "./AgendaPanel";
import { readPartyEmailKeys } from "./service";

export function PersonUpcomingCard({
  partyId,
  partyName,
}: {
  partyId: string;
  /** Used in the heading, so the card names the person rather than "this person". */
  partyName?: string | null;
}) {
  const [emailKeys, setEmailKeys] = useState<string[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setEmailKeys(null);
    setProblem(null);
    void (async () => {
      try {
        const keys = await readPartyEmailKeys(partyId);
        if (!cancelled) setEmailKeys(keys);
      } catch (error: unknown) {
        // NOTHING FAILS SILENTLY: a failed read is not "no addresses", which
        // would render as "nothing upcoming" — a confident and wrong claim.
        if (!cancelled) {
          setEmailKeys([]);
          setProblem(
            `We could not read this record's email addresses, so we cannot say what is upcoming with them: ${extractErrorMessage(error)}`,
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [partyId]);

  if (problem) {
    return (
      <section className="rounded-md border border-border bg-card px-2.5 py-2">
        <p className="text-xs text-muted-foreground">{problem}</p>
      </section>
    );
  }

  // Still reading, or genuinely no address to match on: absent.
  if (emailKeys === null || emailKeys.length === 0) return null;

  return (
    <AgendaPanel
      title={partyName ? `Upcoming with ${partyName}` : "Upcoming with this person"}
      partyEmailKeys={emailKeys}
      // The Person record is not the primary calendar surface, so opening it does
      // not spend a Google call; the home screen and the window do that, and the
      // Refresh control here is always available.
      refreshOnOpen={false}
    />
  );
}
