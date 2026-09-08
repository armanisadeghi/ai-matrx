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

import { useEffect, useState } from "react";
import {
  PropertyRow,
  StatusToken,
} from "@/components/official/ConfigurationFields";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
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
  const [readState, setReadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );

  useEffect(() => {
    let cancelled = false;
    setReadState("loading");
    fetchMandateLineage(mandateId, sourceMandateId)
      .then((next) => {
        if (!cancelled) {
          setLineage(next);
          setReadState("ready");
        }
      })
      .catch((error: unknown) => {
        // An unreadable lineage must never look
        // like "this job has no lineage".
        console.error("[mandate-lineage] could not be read", error);
        if (!cancelled) setReadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [mandateId, sourceMandateId]);

  const base =
    host === "admin-route" ? "/administration/mandates" : "/mandates";
  const unavailable = (
    <StatusToken
      status="unknown"
      label={readState === "loading" ? "Reading" : "Unavailable"}
    />
  );
  return (
    <div className="min-w-0">
      <PropertyRow
        label="Promoted from"
        value={
          readState !== "ready" ? (
            unavailable
          ) : lineage.source ? (
            <EntityRef
              token="mandate"
              id={lineage.source.id}
              name={lineage.source.label || "Display name missing"}
              href={`${base}/${encodeURIComponent(lineage.source.mandateKey)}`}
              showIcon={false}
              wrap
            />
          ) : lineage.sourceUnreadable ? (
            <StatusToken status="unknown" label="Source unavailable" />
          ) : (
            "None"
          )
        }
      />
      <PropertyRow
        label="Promoted copies"
        value={readState === "ready" ? lineage.copies : unavailable}
      />
    </div>
  );
}
