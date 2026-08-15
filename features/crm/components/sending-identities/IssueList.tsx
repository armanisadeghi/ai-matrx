"use client";

/**
 * IssueList — every problem this mailbox has, each beside the button that fixes it.
 *
 * THE DOOR LAW's fourth corollary made concrete: *ship the fix beside the
 * complaint.* A red "domain not verified" badge with nothing next to it tells a
 * non-technical expert that something is wrong and leaves them nowhere to go —
 * which is exactly the dead end the doctrine forbids. The server already returns
 * a machine-readable `fix_action` with every refusal, so there is no excuse for
 * a problem here that a person cannot act on.
 *
 * Four shapes, decided by the fix rather than by the problem:
 *   action — a button that calls the server now (check domain, resume, warm up)
 *   link   — navigate to where it is resolved (reconnect Google)
 *   guide  — the answer is already on this page (the DNS record card below)
 *   wait   — only time resolves it; a calm progress note, never an error
 */

import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Clock,
  Loader2,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FIX_COPY } from "@/features/crm/sending-identities/types";
import type { SendingRefusal } from "@/features/crm/sending-identities/types";

interface IssueListProps {
  issues: SendingRefusal[];
  /** Which fix is running right now, keyed by `fix_action`. */
  busy?: string | null;
  onRunFix?: (fixAction: string) => void;
  /** Scroll the DNS record into view for a `guide` fix. */
  onShowGuide?: () => void;
  className?: string;
}

export function IssueList({
  issues,
  busy,
  onRunFix,
  onShowGuide,
  className,
}: IssueListProps) {
  if (issues.length === 0) return null;

  return (
    <ul className={cn("space-y-2", className)}>
      {issues.map((issue) => {
        const fix = FIX_COPY[issue.fix_action] ?? FIX_COPY.none;
        const waiting = issue.transient || fix.kind === "wait";
        const running = busy === issue.fix_action;

        return (
          <li
            key={issue.code}
            className={cn(
              "flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between",
              waiting
                ? "border-border bg-muted/40"
                : "border-destructive/30 bg-destructive/5",
            )}
          >
            <div className="flex min-w-0 items-start gap-2.5">
              {waiting ? (
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              ) : issue.code === "identity_paused" ? (
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              )}
              <p className="min-w-0 text-sm text-foreground">{issue.message}</p>
            </div>

            {fix.kind === "action" && onRunFix ? (
              <Button
                size="sm"
                variant={waiting ? "outline" : "default"}
                className="shrink-0"
                disabled={running}
                onClick={() => onRunFix(issue.fix_action)}
              >
                {running ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Working
                  </>
                ) : (
                  fix.label
                )}
              </Button>
            ) : null}

            {fix.kind === "link" && fix.href ? (
              <Button size="sm" variant="outline" className="shrink-0" asChild>
                <Link href={fix.href}>
                  {fix.label}
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Link>
              </Button>
            ) : null}

            {fix.kind === "guide" && onShowGuide ? (
              <Button
                size="sm"
                variant="default"
                className="shrink-0"
                onClick={onShowGuide}
              >
                {fix.label}
              </Button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
