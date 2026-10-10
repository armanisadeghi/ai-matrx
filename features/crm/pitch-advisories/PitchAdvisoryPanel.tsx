"use client";

// features/crm/pitch-advisories/PitchAdvisoryPanel.tsx
//
// THE ONE rendering of the PR floor's warnings (pitch advisories E1–E17), used
// identically above the action button on every surface: the single-send dialog,
// the outreach-list activation step, the Chasebox review, the Press Room
// source-request rail and the reputation publish step.
//
// What it promises, on screen, every time:
//   - each warning in the newsjack authors' own words, strongest first;
//   - the one-click offer beside it (an AI job by mandate key, or a local
//     action the host performs) — an offer the host cannot perform is shown as
//     plain guidance, never as a dead button;
//   - that NONE of it stops the action: the host's own button stays live, and
//     pressing it records that the person saw these (who, when, which).

import Link from "next/link";
import { AlertTriangle, Info, Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MandateOffer } from "./MandateOffer";
import type { AdvisoryOffer, PitchAdvisory } from "./service";
import type { PitchAdvisoryState } from "./usePitchAdvisories";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
const TONE: Record<PitchAdvisory["severity"], string> = {
  strong: "border-destructive/40 bg-destructive/5",
  warn: "border-amber-500/40 bg-amber-500/5",
  info: "border-border bg-muted/30",
};

function SeverityIcon({ severity }: { severity: PitchAdvisory["severity"] }) {
  if (severity === "strong")
    return <ShieldAlert aria-label="Strong warning" className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />;
  if (severity === "warn")
    return <AlertTriangle aria-label="Warning" className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />;
  return <Info aria-label="Note" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />;
}

/** A host performs a local offer and returns true; false/absent → shown as guidance. */
export type LocalOfferHandler = (advisory: PitchAdvisory, offer: AdvisoryOffer) => boolean | void;

function OfferControl({
  advisory,
  offer,
  onLocalOffer,
  canPerformLocal,
  surfaceName,
}: {
  advisory: PitchAdvisory;
  offer: AdvisoryOffer;
  onLocalOffer?: LocalOfferHandler;
  canPerformLocal?: (offer: AdvisoryOffer) => boolean;
  surfaceName?: string;
}) {
  if (offer.action === "mandate") {
    return <MandateOffer offer={offer} surfaceName={surfaceName} />;
  }
  if (onLocalOffer && canPerformLocal?.(offer)) {
    return (
      <Button
        type="button"
        variant="outline"
        className="w-fit"
        onClick={() => onLocalOffer(advisory, offer)}
      >
        {offer.label}
      </Button>
    );
  }
  return (
    <span className="text-[11px] text-muted-foreground">
      Suggested: {offer.label}
    </span>
  );
}

export function PitchAdvisoryPanel({
  state,
  organizationId,
  onLocalOffer,
  canPerformLocal,
  surfaceName,
  actionLabel = "the action",
  className,
}: {
  state: Pick<PitchAdvisoryState, "report" | "loading" | "error" | "retry">;
  organizationId?: string | null;
  onLocalOffer?: LocalOfferHandler;
  /** Which local offers this host can actually perform. */
  canPerformLocal?: (offer: AdvisoryOffer) => boolean;
  surfaceName?: string;
  /** How the host's button reads, for the "you can still …" line. */
  actionLabel?: string;
  className?: string;
}) {
  const { report, loading, error, retry } = state;

  if (loading && !report) {
    return (
      <p className={cn("flex items-center gap-2 text-xs text-muted-foreground", className)} data-testid="pitch-advisories-loading">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking this against your PR settings…
      </p>
    );
  }
  if (error) {
    return (
      <div className={cn("rounded-md border border-border bg-muted/30 p-2 text-xs", className)} data-testid="pitch-advisories-error">
        <p className="text-muted-foreground">
          The pitch check could not run ({error}). Nothing is stopping {actionLabel}; you just won&rsquo;t see its warnings.
        <ErrorAlchemyMenu error={error} /></p>
        <Button type="button" variant="quiet" className="mt-1" onClick={retry}>
          Check again
        </Button>
      </div>
    );
  }
  const advisories = report?.advisories ?? [];
  if (advisories.length === 0) return null;
  const warned = advisories.some((a) => a.severity !== "info");

  return (
    <section
      aria-label="Pitch advisories"
      data-testid="pitch-advisories"
      className={cn("space-y-1.5", className)}
    >
      {advisories.map((advisory, index) => (
        <div
          key={`${advisory.rule}-${advisory.code}-${index}`}
          data-rule={advisory.rule}
          data-severity={advisory.severity}
          className={cn("flex gap-2 rounded-md border p-2.5 text-sm", TONE[advisory.severity])}
        >
          <SeverityIcon severity={advisory.severity} />
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="leading-snug text-foreground">{advisory.message}</p>
            {(advisory.offer || (advisory.other_offers ?? []).length > 0) && (
              <div className="flex flex-wrap items-start gap-2">
                {[advisory.offer, ...(advisory.other_offers ?? [])]
                  .filter((offer): offer is AdvisoryOffer => Boolean(offer))
                  .map((offer) => (
                    <OfferControl
                      key={`${offer.action}-${offer.label}`}
                      advisory={advisory}
                      offer={offer}
                      onLocalOffer={onLocalOffer}
                      canPerformLocal={canPerformLocal}
                      surfaceName={surfaceName}
                    />
                  ))}
              </div>
            )}
          </div>
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{advisory.rule}</span>
        </div>
      ))}
      {warned && (
        <p className="text-[11px] text-muted-foreground" data-testid="pitch-advisories-go-ahead-note">
          None of these stop you — {actionLabel} still goes ahead, and we note that you saw them.
          {organizationId ? (
            <>
              {" "}
              <Link
                className="underline underline-offset-2 hover:text-foreground"
                href={`/organizations/${organizationId}/settings/configuration`}
              >
                Change these in your PR settings
              </Link>
              .
            </>
          ) : null}
        </p>
      )}
    </section>
  );
}
