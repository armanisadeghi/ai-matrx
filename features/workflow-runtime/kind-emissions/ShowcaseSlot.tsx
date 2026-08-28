"use client";

/**
 * THE SHOWCASE SLOT — one page-centered place for the thing the author wanted
 * the person to SEE.
 *
 * SPEC-workflow-ui-contract §3 rule 3: `presentation:"showcase"` renders here
 * and **not also** in the emissions stream; at most one is live, and a newer
 * one REPLACES the older. `"panel"` never comes here.
 *
 * ─── Why it is reserved from the DECLARED contract, not from the run ────────
 * The slot exists from FIRST PAINT, before a run does. `GET /result-schema`
 * already says which nodes carry `presentation: "showcase"` (proven live: the
 * endpoint serves the emitting node's authored presentation verbatim), so the
 * page can reserve the centered footprint with the kind's own silhouette while
 * nothing has started. A showcase that pops into existence mid-run and shoves
 * the whole page down is exactly the shift the KindSlot was built to end.
 *
 * ─── Why "replaced" means GONE ──────────────────────────────────────────────
 * A replaced showcase does not fall back into the stream. A showcase is a
 * stage, not a log: two of them on screen is two finales, and the author asked
 * for one. The replaced payload is still in the run's durable events — the
 * activity feed and the step readout both still hold it — so nothing is lost,
 * only un-staged.
 */

import React from "react";
import { Sparkles } from "lucide-react";

import { KindSlot } from "@/features/content-ir/react/slot/KindSlot";
import { cn } from "@/lib/utils";

import { EmissionRender, type RenderableEmission } from "./EmissionRender";
import type { DeclaredDeliverable } from "./result-schema";

export interface ShowcaseSlotProps {
  runId: string;
  /**
   * THE one live showcase emission, from `splitByPresentation(...).showcase`.
   * Null before anything has been staged.
   */
  emission: RenderableEmission | null;
  /**
   * The declared showcase deliverables, from `/result-schema`. Used ONLY to
   * reserve the footprint before the first one arrives — they never render
   * content themselves.
   */
  declared?: readonly DeclaredDeliverable[];
  /** True once the run has begun, so the reserved silhouette starts working. */
  started?: boolean;
  className?: string;
}

/**
 * The centered stage. Renders nothing at all when the workflow declares no
 * showcase and none has arrived — an empty stage on a page that will never use
 * one is furniture, and furniture is what this contract removes.
 */
export function ShowcaseSlot({
  runId,
  emission,
  declared = [],
  started = false,
  className,
}: ShowcaseSlotProps) {
  const reserved = declared.length > 0;
  if (!emission && !reserved) return null;

  // The reserving kind: the first declared showcase's kind, when it has one.
  // An `output.to_frontend` node declares none (dynamic output schema), so the
  // slot reserves with the generic silhouette — an honest "something large is
  // coming" rather than a guess at its shape.
  const reservingKind = declared.find((d) => d.outputKind)?.outputKind ?? null;
  const title =
    emission?.title ?? declared[0]?.title ?? "The main event";

  return (
    <section
      data-showcase-slot={runId}
      data-showcase-state={emission ? "live" : started ? "arriving" : "reserved"}
      data-showcase-node={emission?.nodeId ?? undefined}
      className={cn("mx-auto w-full max-w-4xl", className)}
    >
      <header className="mb-2 flex items-center justify-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
        <h2 className="truncate text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h2>
      </header>
      <div className="overflow-hidden rounded-2xl border border-primary/30 bg-card p-4 shadow-sm">
        {emission ? (
          // `key` on the node id, not the seq: a REPLACEMENT is a different
          // subject and should mount fresh, while the same node re-emitting an
          // updated payload should update in place rather than restart.
          <EmissionRender
            key={emission.nodeId}
            runId={runId}
            emission={emission}
            variant="bare"
          />
        ) : (
          <KindSlot
            slotKey={`${runId}:showcase`}
            kind={reservingKind}
            phase={started ? "arriving" : "reserved"}
            chrome="bare"
          />
        )}
      </div>
    </section>
  );
}

export default ShowcaseSlot;
