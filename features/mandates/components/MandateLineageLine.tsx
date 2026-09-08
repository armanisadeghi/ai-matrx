"use client";

// features/mandates/components/MandateLineageLine.tsx
//
// WHERE THIS JOB CAME FROM, AND WHAT CAME FROM IT.
//
// One line under the mandate's identity, rendered on every host, reading the
// ONE column that records mandate → mandate lineage
// (`mandate.definition.source_mandate_id`, aidream 0592):
//
//   "Promoted from Podcast script"   on the copy   — with a door to the source
//   "Promoted copies: 2"             on the source — with a door to the list
//
// Both sentences are facts about the corpus, not admin management, so they
// belong on the workspace itself rather than behind the admin fold.
//
// 🚨 IT NEVER RENDERS A SILENCE AS AN ANSWER. A mandate with an ancestor the
// caller cannot read (the copy left an organization they do not belong to)
// SAYS that, instead of looking identical to a mandate that has no ancestor
// at all. Same law as the list door's refusal: absent or honest, never a
// screen that means two things.

import Link from "next/link";
import { useEffect, useState } from "react";
import { GitBranch } from "lucide-react";
import {
  fetchMandateLineage,
  NO_LINEAGE,
  type MandateLineage,
} from "../lineage";

export function MandateLineageLine({
  mandateId,
  sourceMandateId,
  /** `admin-route` keeps the doors inside the admin shell. */
  host,
}: {
  mandateId: string;
  sourceMandateId: string | null;
  host: "route" | "admin-route" | "window";
}) {
  const [lineage, setLineage] = useState<MandateLineage>(NO_LINEAGE);

  useEffect(() => {
    let cancelled = false;
    fetchMandateLineage(mandateId, sourceMandateId)
      .then((next) => {
        if (!cancelled) setLineage(next);
      })
      .catch((error: unknown) => {
        // LOUD, and nothing is rendered: an unreadable lineage must never look
        // like "this job has no lineage".
        console.error("[mandate-lineage] could not be read", error);
        if (!cancelled) setLineage(NO_LINEAGE);
      });
    return () => {
      cancelled = true;
    };
  }, [mandateId, sourceMandateId]);

  const base = host === "admin-route" ? "/administration/mandates" : "/mandates";
  const hasSomething =
    lineage.source || lineage.sourceUnreadable || lineage.copies > 0;
  if (!hasSomething) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted-foreground">
      {lineage.source ? (
        <span className="inline-flex items-center gap-1">
          <GitBranch className="h-3 w-3" />
          Promoted from{" "}
          <Link
            href={`${base}/${encodeURIComponent(lineage.source.mandateKey)}`}
            className="text-foreground underline-offset-2 hover:underline"
          >
            {lineage.source.label}
          </Link>
        </span>
      ) : lineage.sourceUnreadable ? (
        <span className="inline-flex items-center gap-1">
          <GitBranch className="h-3 w-3" />
          Promoted from a mandate you cannot see — it is homed in an
          organization you do not belong to.
        </span>
      ) : null}
      {lineage.copies > 0 ? (
        <span className="inline-flex items-center gap-1">
          <GitBranch className="h-3 w-3" />
          Promoted copies: {lineage.copies}
        </span>
      ) : null}
    </div>
  );
}
