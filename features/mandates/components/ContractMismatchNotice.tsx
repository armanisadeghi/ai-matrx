"use client";

/**
 * THE RED — a Holder that does not meet its mandate's contract, said loudly
 * and exactly, beside the one action that fixes it. Never a blocked Save
 * (Arman, 2026-09-25: "it can warn, make things red, scream and go crazy, but
 * it cannot block").
 *
 * Reads a `ContractCheck` (server-persisted, `features/mandates/contract-check.ts`)
 * or a bare list of pre-save problems. "Fix with AI" is a registered Coming
 * Soon (`mandates.holder-auto-heal`) until the auto-heal loop ships — the
 * design is in common-docs/systems/intelligence/mandates/REGISTER.md.
 */

import { AlertTriangle, BrainCircuit } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ComingSoonBadge } from "@/components/coming-soon/ComingSoonBadge";
import { announceComingSoon } from "@/lib/coming-soon/announce";
import { cn } from "@/lib/utils";
import type {
  ContractCheck,
  ContractMismatch,
} from "@/features/mandates/contract-check";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export interface ContractMismatchNoticeProps {
  /** The server's persisted verdict — preferred when present. */
  check?: ContractCheck | null;
  /** Pre-save problems the client found (used when there is no `check`). */
  problems?: readonly string[];
  /** Who this row answers for, e.g. "The job's default". */
  where?: string;
  /** Where the Holder opens, so the person can fix it by hand right now. */
  holderHref?: string | null;
  /** Compact = one line + actions (lists, dashboards). */
  compact?: boolean;
  className?: string;
}

export function ContractMismatchNotice({
  check,
  problems,
  where,
  holderHref,
  compact = false,
  className,
}: ContractMismatchNoticeProps) {
  const lines = check ? check.problems : [...(problems ?? [])];
  if ((!check || check.state !== "unmet") && lines.length === 0) return null;
  const headline = check?.summary
    ? check.summary
    : "This Mandate Holder does not match the job's contract. You can still save it.";
  return (
    <div
      role="alert"
      data-testid="contract-mismatch-notice"
      className={cn(
        "flex items-start gap-2 rounded-xl border border-destructive/50 bg-destructive/10 px-3 py-2 text-[12px] leading-relaxed text-destructive",
        className,
      )}
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="font-medium">
          Contract mismatch{where ? ` — ${where}` : ""}
        </p>
        <p className="text-foreground">{headline}</p>
        {!compact && lines.length > 0 && !check?.summary ? (
          <ul className="list-disc space-y-0.5 pl-4 text-foreground">
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 border-destructive/40 text-[11.5px]"
            onClick={() => void announceComingSoon("mandates.holder-auto-heal")}
          >
            <BrainCircuit className="h-3.5 w-3.5" />
            Fix with AI
            <ComingSoonBadge />
          </Button>
          {holderHref ? (
            <Link
              href={holderHref}
              className="text-[11.5px] font-medium text-foreground underline underline-offset-2"
            >
              Open the {check?.holderType ?? "agent"} to fix it
            </Link>
          ) : null}
        </div>
      </div>
      <ErrorAlchemyMenu className="ml-auto" />
    </div>
  );
}

/** Every red Holder on one job, each with its own sentence and fix. */
export function ContractMismatchList({
  mismatches,
  compact = false,
  className,
}: {
  mismatches: readonly ContractMismatch[];
  compact?: boolean;
  className?: string;
}) {
  if (mismatches.length === 0) return null;
  return (
    <div className={cn("space-y-2", className)}>
      {mismatches.map((mismatch, index) => (
        <ContractMismatchNotice
          key={`${mismatch.where}-${index}`}
          check={mismatch.check}
          where={mismatch.where}
          compact={compact}
        />
      ))}
    </div>
  );
}
