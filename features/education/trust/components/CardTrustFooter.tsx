"use client";

// features/education/trust/components/CardTrustFooter.tsx
//
// The one-line drop-in trust surface for a generated study item. Give it the
// item's TrustEnvelope + its front/back and it renders the confidence badge,
// the tappable source citations, and the "Verify against source" action (which
// re-checks the item against its cited passage and reports drift). Renders
// nothing when there's no envelope — a hand-made card shows no trust chrome.

import { ShieldCheck, RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TrustEnvelope } from "../types";
import {
  useVerifyAgainstSource,
  excerptFromCitations,
} from "../useVerifyAgainstSource";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { SourceCitations } from "./SourceCitations";

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
  const verify = useVerifyAgainstSource();

  if (!trust) return null;
  const citations = trust.citations ?? [];
  const canVerify =
    !hideVerify && citations.some((c) => (c.excerpt ?? "").trim().length > 0);

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
        {canVerify && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="ml-auto h-6 gap-1 px-1.5 text-xs"
            disabled={verify.isVerifying}
            onClick={() =>
              void verify.verify({
                front,
                back,
                sourceExcerpt: excerptFromCitations(citations),
              })
            }
          >
            <RefreshCw
              className={cn("h-3 w-3", verify.isVerifying && "animate-spin")}
              aria-hidden
            />
            {verify.isVerifying ? "Verifying…" : "Verify against source"}
          </Button>
        )}
      </div>

      <SourceCitations trust={trust} label={citations.length > 0 ? "Sources" : null} />

      {verify.result && <VerifyVerdict result={verify.result} />}
      {verify.error && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          {verify.error}
        </p>
      )}
    </div>
  );
}

function VerifyVerdict({
  result,
}: {
  result: NonNullable<ReturnType<typeof useVerifyAgainstSource>["result"]>;
}) {
  const drifted = result.status === "drifted";
  const verified = result.status === "verified";
  const Icon = verified ? CheckCircle2 : AlertTriangle;
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-md border p-2 text-xs",
        verified
          ? "border-green-600/30 bg-green-500/10 text-green-800 dark:text-green-300"
          : drifted
            ? "border-amber-600/30 bg-amber-500/10 text-amber-800 dark:text-amber-300"
            : "border-border bg-muted/50 text-muted-foreground",
      )}
    >
      <span className="inline-flex items-center gap-1 font-medium capitalize">
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {result.status === "unverifiable" ? "Can't verify" : result.status}
      </span>
      <span className="not-italic">{result.explanation}</span>
      {drifted && result.suggestedFix && (
        <span className="text-foreground">
          <span className="font-medium">Suggested:</span> {result.suggestedFix}
        </span>
      )}
    </div>
  );
}
