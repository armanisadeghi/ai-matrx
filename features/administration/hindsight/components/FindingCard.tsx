"use client";

/**
 * FindingCard — one proposed improvement on one of the four levers, with its
 * evidence, the exact proposed change, any replay verdicts, and the two
 * decisions a human can make: Apply (or Accept) and Reject.
 */
import { useState } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { Check, ChevronDown, ChevronRight, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { applyFinding, rejectFinding } from "../api";
import { conversationHref } from "../subject-doors";
import { splitEvidenceIds, type Finding } from "../types";
import { LEVER_COLOR, LEVER_LABEL, VERDICT_COLOR } from "./tokens";

const DECIDED = new Set(["applied", "rejected", "superseded", "approved"]);

function proposalBody(finding: Finding): string {
  const p = finding.proposal;
  return (
    p?.proposed_system_text ??
    p?.section_content ??
    p?.content ??
    p?.details ??
    ""
  );
}

export function FindingCard({
  finding,
  onChanged,
}: {
  finding: Finding;
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const apply = useMutation({
    mutationFn: () => applyFinding(finding.id),
    onSuccess: (res) => {
      toast.success(
        res.applied_version_number != null
          ? `Applied — the agent is now v${res.applied_version_number}`
          : "Accepted — this lever needs a human to carry it out",
      );
      onChanged();
    },
    onError: (err: Error) => toast.error(`Apply failed: ${err.message}`),
  });

  const reject = useMutation({
    mutationFn: () => rejectFinding(finding.id),
    onSuccess: () => {
      toast.success("Rejected — it won't be re-proposed for a while");
      onChanged();
    },
    onError: (err: Error) => toast.error(`Reject failed: ${err.message}`),
  });

  const verdicts = finding.proposal?.replay_verdicts ?? {};
  const decided = DECIDED.has(finding.status);
  const body = proposalBody(finding);
  const busy = apply.isPending || reject.isPending;

  return (
    <Card className="p-3" data-testid="hindsight-finding">
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? (
            <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge className={cn("border-0", LEVER_COLOR[finding.lever])}>
                {LEVER_LABEL[finding.lever]}
              </Badge>
              {finding.machine_applicable ? (
                <Badge variant="outline">one-click</Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">
                  needs a human
                </Badge>
              )}
              {finding.confidence != null && (
                <span className="text-xs tabular-nums text-muted-foreground">
                  {Math.round(finding.confidence * 100)}% confident
                </span>
              )}
              {Object.entries(verdicts).map(([verdict, count]) => (
                <Badge
                  key={verdict}
                  className={cn(
                    "border-0",
                    VERDICT_COLOR[verdict as keyof typeof VERDICT_COLOR] ??
                      "bg-slate-500/15 text-slate-600 dark:text-slate-400",
                  )}
                >
                  {count}× {verdict}
                </Badge>
              ))}
              <Badge variant="secondary">{finding.status}</Badge>
              {finding.applied_version_number != null && (
                <Badge variant="outline">→ v{finding.applied_version_number}</Badge>
              )}
            </div>
            <div className="mt-1 text-sm font-medium">{finding.title}</div>
          </div>
        </button>
        {!decided && (
          <div className="flex shrink-0 gap-1.5">
            <Button
              size="sm"
              disabled={busy}
              onClick={() => apply.mutate()}
              data-testid="hindsight-apply"
            >
              <Check className="mr-1 h-3.5 w-3.5" />
              {apply.isPending
                ? "Applying…"
                : finding.machine_applicable
                  ? "Apply"
                  : "Accept"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => reject.mutate()}
              title="Reject this finding"
              data-testid="hindsight-reject"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {expanded && (
        <div className="mt-3 space-y-3 border-t border-border pt-3 text-sm">
          {finding.reasoning && (
            <p className="text-muted-foreground">{finding.reasoning}</p>
          )}
          {(finding.evidence ?? []).length > 0 && (
            <div>
              <div className="text-xs font-medium uppercase text-muted-foreground">
                Evidence from the real transcripts
              </div>
              <ul className="mt-1 list-inside list-disc space-y-1 text-xs text-muted-foreground">
                {(finding.evidence ?? []).map((item, i) => (
                  <li key={i}>
                    {splitEvidenceIds(item).map((part, j) =>
                      part.id ? (
                        <Link
                          key={j}
                          href={conversationHref(part.id)}
                          className="font-mono underline decoration-dotted underline-offset-2 hover:text-foreground"
                          title="Open this conversation"
                        >
                          {part.id.slice(0, 8)}
                        </Link>
                      ) : (
                        <span key={j}>{part.text}</span>
                      ),
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {body && (
            <div>
              <div className="text-xs font-medium uppercase text-muted-foreground">
                Proposed change
                {finding.proposal?.section_key
                  ? ` — section <${finding.proposal.section_key}>`
                  : ""}
              </div>
              <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-2 text-xs">
                {body}
              </pre>
            </div>
          )}
          {!finding.machine_applicable && (
            <p className="text-xs text-muted-foreground">
              {LEVER_LABEL[finding.lever]} findings are reports for a human —
              “Accept” records the decision, it does not change anything by
              itself.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
