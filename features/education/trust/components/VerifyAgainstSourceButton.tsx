"use client";

// features/education/trust/components/VerifyAgainstSourceButton.tsx
//
// The shared "Verify against source" affordance — a self-contained button +
// verdict that re-checks ANY cited AI-generated study item against the passage
// it cited, flagging drift after a source edit or a manual change. Wraps the
// generic `useVerifyAgainstSource` hook; the ONE verify affordance every
// education surface mounts (flashcards, quiz items, summaries, mind-map nodes) —
// never a per-surface fork.
//
// `front`/`back` are the two text fields the verify agent frames its check with
// (the claim + its answer). Renders NOTHING when there's no citation carrying a
// verbatim excerpt to check against — so a surface can mount it unconditionally.

import { RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TrustEnvelope } from "../types";
import {
  useVerifyAgainstSource,
  excerptFromCitations,
} from "../useVerifyAgainstSource";

export interface VerifyAgainstSourceButtonProps {
  trust: TrustEnvelope | null | undefined;
  /** The claim being checked (question / card front / node label / summary title). */
  front: string;
  /** The answer/body the source must support (card back / correct answer / summary body). */
  back: string;
  className?: string;
  /** Button label (default: "Verify against source"). */
  label?: string;
}

export function VerifyAgainstSourceButton({
  trust,
  front,
  back,
  className,
  label = "Verify against source",
}: VerifyAgainstSourceButtonProps) {
  const verify = useVerifyAgainstSource();

  const citations = trust?.citations ?? [];
  const canVerify = citations.some((c) => (c.excerpt ?? "").trim().length > 0);
  if (!canVerify) return null;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-6 w-fit gap-1 px-1.5 text-xs"
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
        {verify.isVerifying ? "Verifying…" : label}
      </Button>

      {verify.result && <VerifyVerdict result={verify.result} />}
      {verify.error && (
        <p className="text-xs text-amber-600 dark:text-amber-400">{verify.error}</p>
      )}
    </div>
  );
}

/** The verify verdict callout (verified / drifted / unverifiable). Shared. */
export function VerifyVerdict({
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
