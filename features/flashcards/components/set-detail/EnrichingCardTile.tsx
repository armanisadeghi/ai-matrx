"use client";

// features/flashcards/components/set-detail/EnrichingCardTile.tsx
//
// ONE CARD IN THE LIVE ENRICHMENT CASCADE.
//
// Arman, on the first version of bulk enrichment: "we just went through this
// whole thing of creating these beautiful custom kind components so that we
// never have to show the user fucking bullshit again. And what's the first thing
// you do? … you're showing me some fucking bullshit loading components. Why
// would you show me this shit when you could create a beautiful UI that shows
// these coming in one by one."
//
// So: the card itself is on screen from the first frame — its real front, its
// real back — and its layers materialize INSIDE it, drawn by the registered
// `card_enrichment` component (`card_enrichment_stack`, the DB-routed default:
// coloured chips, per-kind icons, a rail per layer). A spinner is never the
// primary state; the most a live tile shows is a three-dot "writing…" line
// UNDER a card the learner can already read, and only until the first layer's
// first characters arrive.
//
// SAME COMPONENT, BOTH LIVES — mirrors `LiveGenerationPreview`:
//   • STREAMING — the value comes from this run's own content-ir envelope
//     (`selectKindEnvelope(requestId, "card_enrichment")`, the accumulator's
//     `metadata.__ir`). No second parse session anywhere.
//   • SETTLED — the value comes from the `fc_detail` rows that were actually
//     written. The tile stops trusting a stream the moment the database is the
//     truth, and the run drops the instance at the same instant.
//
// HONEST STATE, per card: queued → writing → N layers, or FAILED with the
// reason. A failure says it failed; it never borrows "nothing to add" (the
// truthfulness fix in data/enhanceCard.ts).

import { AlertTriangle, Check, Clock, PenLine } from "lucide-react";

import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectKindEnvelope } from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import KindInstanceRender from "@/features/content-ir/studio/components/KindInstanceRender";
import {
  cardEnrichmentValue,
  streamingEnrichmentDetails,
} from "../../data/cardEnrichmentEnvelope";
import type { BulkEnrichCardState } from "./bulkEnrichRun";

export function EnrichingCardTile({ card }: { card: BulkEnrichCardState }) {
  // Subscribe ONLY while this card owns a live request — a settled tile reads
  // the persisted rows and must not re-enter the streaming lane.
  const envelope = useAppSelector((state) =>
    card.requestId
      ? selectKindEnvelope(card.requestId, "card_enrichment")(state)
      : null,
  );

  const live = card.status === "running";
  const streamed = live ? streamingEnrichmentDetails(envelope) : [];
  const details = live ? streamed : card.layers;
  const hasContent = details.length > 0;

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card transition-colors",
        card.status === "failed"
          ? "border-destructive/40"
          : live
            ? "border-primary/50 shadow-sm"
            : "border-border",
        card.status === "waiting" && "opacity-60",
      )}
    >
      {/* The card itself — visible from frame one, never replaced by a loader. */}
      <div className="border-b border-border/70 bg-muted/30 px-3 py-2.5">
        <p className="line-clamp-3 text-sm font-medium leading-snug text-foreground">
          {card.front || "Card"}
        </p>
        {card.back ? (
          <p className="mt-1 line-clamp-2 text-xs leading-snug text-muted-foreground">
            {card.back}
          </p>
        ) : null}
        <div className="mt-2">
          <StatusChip card={card} shown={details.length} />
        </div>
      </div>

      <div className="min-w-0 px-2.5 py-2.5">
        {card.status === "failed" ? (
          <p className="flex items-start gap-1.5 text-xs leading-relaxed text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0">
              {card.error || "Enrichment failed for this card."} This card is
              untouched — run it again and only it will be picked up.
            </span>
          </p>
        ) : card.status === "empty" ? (
          <p className="text-xs text-muted-foreground">
            The AI ran and had nothing new to add for this card.
          </p>
        ) : hasContent ? (
          // FIRST-RENDERABLE-UNIT: the real component takes over the instant a
          // layer has text, and grows layer by layer from there.
          <KindInstanceRender
            kind="card_enrichment"
            value={cardEnrichmentValue(details)}
            variant="bare"
            showRoutingNote={false}
          />
        ) : live ? (
          <WritingLine />
        ) : (
          <p className="text-xs text-muted-foreground">Waiting its turn.</p>
        )}
      </div>
    </div>
  );
}

function StatusChip({
  card,
  shown,
}: {
  card: BulkEnrichCardState;
  shown: number;
}) {
  if (card.status === "failed") {
    return (
      <Chip className="border-destructive/30 bg-destructive/10 text-destructive">
        <AlertTriangle className="h-3 w-3" /> Failed
      </Chip>
    );
  }
  if (card.status === "enriched") {
    return (
      <Chip className="border-primary/30 bg-primary/10 text-primary">
        <Check className="h-3 w-3" /> {card.layers.length} new layer
        {card.layers.length === 1 ? "" : "s"}
        {card.reEnriched ? " (you picked this one)" : ""}
      </Chip>
    );
  }
  if (card.status === "empty") {
    return (
      <Chip className="border-border bg-muted text-muted-foreground">
        Nothing to add
      </Chip>
    );
  }
  if (card.status === "running") {
    return (
      <Chip className="border-primary/30 bg-primary/10 text-primary">
        <PenLine className="h-3 w-3" />
        {shown > 0
          ? `Writing layer ${shown + 1}…`
          : card.reEnriched
            ? "Adding more…"
            : "Writing…"}
      </Chip>
    );
  }
  return (
    <Chip className="border-border bg-muted text-muted-foreground">
      <Clock className="h-3 w-3" /> Queued
    </Chip>
  );
}

function Chip({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * The ONLY "still working" affordance in the cascade, and it is deliberately
 * not a spinner: three quiet dots under a card whose text is already readable,
 * up for the sub-second before the first layer's first characters land.
 */
function WritingLine() {
  return (
    <div className="flex items-center gap-1.5 py-1 text-xs text-muted-foreground">
      <span className="flex gap-1" aria-hidden>
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary/60"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </span>
      The AI is writing this card&rsquo;s first layer
    </div>
  );
}

export default EnrichingCardTile;
