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

import {
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  PencilLine,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  StoredVerification,
  TrustEnvelope,
  VerifyResult,
  VerifySubject,
} from "../types";
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
  /**
   * The durable row this verdict belongs to (D151). Pass it and the verdict is
   * persisted on arrival, the previous verdict is shown instead of re-running,
   * and a `drifted` verdict's suggested correction gets a one-click Apply.
   */
  subject?: VerifySubject;
  /** The verdict already stored on `subject` — read by the mounting surface. */
  stored?: StoredVerification | null;
}

export function VerifyAgainstSourceButton({
  trust,
  front,
  back,
  className,
  label = "Verify against source",
  subject,
  stored,
}: VerifyAgainstSourceButtonProps) {
  const verify = useVerifyAgainstSource();

  const citations = trust?.citations ?? [];
  const canVerify = citations.some((c) => (c.excerpt ?? "").trim().length > 0);
  if (!canVerify) return null;

  // A stored verdict about text the card no longer has says nothing useful —
  // the surface offers a re-check instead of a stale claim.
  const storedIsCurrent =
    stored != null && (!stored.verifiedBack || stored.verifiedBack === back);
  const shown: VerifyResult | null =
    verify.result ??
    (storedIsCurrent && stored
      ? {
          status: stored.status,
          explanation: stored.explanation,
          suggestedFix: stored.appliedAt ? null : stored.suggestedFix,
        }
      : null);

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
            ...(subject ? { subject } : {}),
          })
        }
      >
        <RefreshCw
          className={cn("h-3 w-3", verify.isVerifying && "animate-spin")}
          aria-hidden
        />
        {verify.isVerifying ? "Verifying…" : shown ? "Check again" : label}
      </Button>

      {shown && (
        <VerifyVerdict
          result={shown}
          {...(stored?.verifiedAt && !verify.result
            ? { verifiedAt: stored.verifiedAt }
            : {})}
          {...(subject && shown.suggestedFix
            ? {
                onApplyFix: () => {
                  void verify.applyFix(subject, shown.suggestedFix as string);
                },
                applying: verify.applying,
              }
            : {})}
        />
      )}
      {verify.error && (
        <p className="text-xs text-amber-600 dark:text-amber-400">{verify.error}</p>
      )}
    </div>
  );
}

/** The verify verdict callout (verified / drifted / unverifiable). Shared. */
export function VerifyVerdict({
  result,
  verifiedAt,
  onApplyFix,
  applying,
}: {
  result: VerifyResult;
  /** When shown from a stored verdict, when it was checked. */
  verifiedAt?: string;
  /** Apply `result.suggestedFix` as the item's new answer (D151). */
  onApplyFix?: () => void;
  applying?: boolean;
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
        {verifiedAt && (
          <span className="font-normal opacity-70">
            · checked {new Date(verifiedAt).toLocaleDateString()}
          </span>
        )}
      </span>
      <span className="not-italic">{result.explanation}</span>
      {drifted && result.suggestedFix && (
        <>
          <span className="text-foreground">
            <span className="font-medium">Suggested:</span> {result.suggestedFix}
          </span>
          {/* D151 — a corrected answer the user can't apply is the paid result
              thrown away twice. One click writes it onto the item. */}
          {onApplyFix && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-1 h-6 w-fit gap-1 px-2 text-xs"
              disabled={applying}
              onClick={onApplyFix}
            >
              {applying ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              ) : (
                <PencilLine className="h-3 w-3" aria-hidden />
              )}
              Use this correction
            </Button>
          )}
        </>
      )}
    </div>
  );
}
