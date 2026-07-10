"use client";

// features/education/trust/components/CardTrustFooter.tsx
//
// The one-line drop-in trust surface for a generated study item. Give it the
// item's TrustEnvelope + its front/back and it renders the confidence badge,
// the tappable source citations, and the shared "Verify against source" action
// (which re-checks the item against its cited passage and reports drift).
// Renders nothing when there's no envelope — a hand-made card shows no trust
// chrome. The verify affordance is the shared <VerifyAgainstSourceButton/> — the
// same one quiz items, summaries, and mind-map nodes mount.

import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TrustEnvelope } from "../types";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { SourceCitations } from "./SourceCitations";
import { VerifyAgainstSourceButton } from "./VerifyAgainstSourceButton";

export interface CardTrustFooterProps {
  trust: TrustEnvelope | null | undefined;
  front: string;
  back: string;
  className?: string;
  /** Hide the "Verify against source" action (e.g. read-only public viewer). */
  hideVerify?: boolean;
}

export function CardTrustFooter({
  trust,
  front,
  back,
  className,
  hideVerify,
}: CardTrustFooterProps) {
  if (!trust) return null;
  const citations = trust.citations ?? [];

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/30 p-2.5",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <ConfidenceBadge confidence={trust.confidence} />
        {trust.groundedIn && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <ShieldCheck className="h-3 w-3" aria-hidden />
            Grounded in {trust.groundedIn}
          </span>
        )}
      </div>

      <SourceCitations trust={trust} label={citations.length > 0 ? "Sources" : null} />

      {!hideVerify && <VerifyAgainstSourceButton trust={trust} front={front} back={back} />}
    </div>
  );
}
