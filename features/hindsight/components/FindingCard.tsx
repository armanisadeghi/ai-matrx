"use client";

/**
 * FindingCard — one proposed improvement on one of the four levers, with its
 * evidence, the exact proposed change, any replay verdicts, and the two
 * decisions a human can make: Apply (or Accept) and Reject.
 */
import { useState } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Maximize2,
  MessageSquare,
  Undo2,
  X,
} from "lucide-react";
import { toast } from "@/lib/toast";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { cn } from "@/lib/utils";
import { useOpenHindsightFindingWindow } from "@/features/overlays/openers/hindsightFindingWindow";

import { applyFinding, rejectFinding } from "../api";
import {
  findingProposalBody,
  hindsightFindingAgentPayload,
  hindsightFindingHuman,
  hindsightFindingIsDecided,
} from "../copy";
import { conversationHref } from "../subject-doors";
import { useDoorAudience } from "./door-audience";
import { evidenceLine, splitEvidenceIds, type Finding } from "../types";
import { DiscussPanel } from "./DiscussPanel";
import { RegressionCasesFromFinding } from "./RegressionCasesFromFinding";
import { RevertButton } from "./RevertButton";
import { LEVER_COLOR, LEVER_LABEL, VERDICT_COLOR } from "./tokens";

export function FindingCard({
  finding,
  agentId,
  onChanged,
  onGuide,
  initialExpanded = false,
  showWindowDoor = true,
  variant = "card",
}: {
  finding: Finding;
  /** The subject agent, when known — doors the revert confirm to the version diff. */
  agentId?: string;
  onChanged: () => void;
  /**
   * When provided, "Guide" hands the finding to the host's conversation
   * surface (the workspace's center chat) instead of expanding an inline
   * DiscussPanel. The admin console omits it and keeps the inline panel.
   */
  onGuide?: (finding: Finding) => void;
  initialExpanded?: boolean;
  showWindowDoor?: boolean;
  variant?: "card" | "bare";
}) {
  const audience = useDoorAudience();
  const openFindingWindow = useOpenHindsightFindingWindow();
  const [expanded, setExpanded] = useState(initialExpanded);
  const [discussing, setDiscussing] = useState(false);

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
  const decided = hindsightFindingIsDecided(finding);
  const body = findingProposalBody(finding);
  const busy = apply.isPending || reject.isPending;

  return (
    <Card
      className={cn(
        "@container p-3",
        variant === "bare" &&
          "rounded-none border-0 bg-transparent p-4 shadow-none",
      )}
      data-testid="hindsight-finding"
    >
      <div className="flex flex-col gap-2 @md:flex-row @md:items-start @md:justify-between">
        <button
          type="button"
          className="relative min-w-0 flex-1 pr-6 text-left"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? (
            <ChevronDown className="absolute right-0 top-0.5 h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="absolute right-0 top-0.5 h-4 w-4 text-muted-foreground" />
          )}
          <div className="min-w-0">
            <div className="text-[13px] font-medium leading-5 text-foreground">
              {finding.title}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
              <Badge
                className={cn(
                  "border-0 px-1 py-0 text-[11px] leading-4",
                  LEVER_COLOR[finding.lever],
                )}
              >
                {LEVER_LABEL[finding.lever]}
              </Badge>
              {finding.machine_applicable ? (
                <Badge
                  variant="outline"
                  className="px-1 py-0 text-[11px] leading-4"
                >
                  one-click
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="px-1 py-0 text-[11px] leading-4 text-muted-foreground"
                >
                  needs a human
                </Badge>
              )}
              {finding.confidence != null && (
                <span className="tabular-nums">
                  {Math.round(finding.confidence * 100)}% confident
                </span>
              )}
              {Object.entries(verdicts).map(([verdict, count]) => (
                <Badge
                  key={verdict}
                  className={cn(
                    "border-0 px-1 py-0 text-[11px] leading-4",
                    VERDICT_COLOR[verdict as keyof typeof VERDICT_COLOR] ??
                      "bg-muted text-muted-foreground",
                  )}
                >
                  {count}× {verdict}
                </Badge>
              ))}
              {finding.status === "reverted" ? (
                <Badge className="border-0 bg-amber-500/15 px-1 py-0 text-[11px] leading-4 text-amber-700 dark:text-amber-400">
                  <Undo2 className="mr-1 h-3 w-3" />
                  reverted
                </Badge>
              ) : (
                <Badge
                  variant="secondary"
                  className="px-1 py-0 text-[11px] leading-4"
                >
                  {finding.status}
                </Badge>
              )}
              {finding.applied_version_number != null && (
                <Badge
                  variant="outline"
                  className="px-1 py-0 text-[11px] leading-4"
                >
                  → v{finding.applied_version_number}
                </Badge>
              )}
            </div>
          </div>
        </button>
        <div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-1.5 @md:w-auto">
          <CopyButtons
            size="icon"
            label={`Hindsight finding “${finding.title}”`}
            human={() => hindsightFindingHuman(finding)}
            json={() => finding}
            agent={() => hindsightFindingAgentPayload(finding, expanded)}
            agentVariant={{
              id: "finding-with-context",
              label: "Finding with context",
              hint: "What this Hindsight card shows, with its page and record identity",
              position: "first",
            }}
          />
          {showWindowDoor && (
            <Button
              size="sm"
              variant="outline"
              title="Open the full finding in a window"
              aria-label="Open the full finding in a window"
              onClick={() => openFindingWindow({ finding, agentId, audience })}
              data-testid="hindsight-open-window"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            title="Tell the reviewer what it missed"
            onClick={() => {
              if (onGuide) {
                onGuide(finding);
                return;
              }
              setDiscussing((v) => !v);
              setExpanded(true);
            }}
            data-testid="hindsight-guide"
          >
            <MessageSquare className="mr-1 h-3.5 w-3.5" />
            Guide
          </Button>
          <RevertButton
            finding={finding}
            agentId={agentId}
            onChanged={onChanged}
          />
          {!decided && (
            <>
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
            </>
          )}
        </div>
      </div>

      {expanded && (
        <div className="mt-3 space-y-3 border-t border-border pt-3 text-sm">
          {finding.reasoning && (
            <p
              className={cn(
                "text-muted-foreground",
                variant === "card" && "line-clamp-4",
              )}
            >
              {finding.reasoning}
            </p>
          )}
          {(finding.evidence ?? []).length > 0 && (
            <div>
              <div className="text-xs font-medium uppercase text-muted-foreground">
                Evidence from the real transcripts
              </div>
              <ul className="mt-1 list-inside list-disc space-y-1 text-xs text-muted-foreground">
                {(variant === "card"
                  ? (finding.evidence ?? []).slice(0, 3)
                  : (finding.evidence ?? [])
                ).map((item, i) => (
                  <li key={i}>
                    {splitEvidenceIds(evidenceLine(item)).map((part, j) =>
                      part.id ? (
                        <Link
                          key={j}
                          href={conversationHref(part.id, audience)}
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
              {variant === "card" && (finding.evidence?.length ?? 0) > 3 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  +{(finding.evidence?.length ?? 0) - 3} more in the full view
                </p>
              )}
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
              <pre
                className={cn(
                  "mt-1 whitespace-pre-wrap rounded-md bg-muted p-2 text-xs",
                  variant === "card"
                    ? "max-h-28 overflow-hidden"
                    : "overflow-visible",
                )}
              >
                {body}
              </pre>
              {variant === "card" && showWindowDoor && (
                <Button
                  size="sm"
                  variant="link"
                  className="mt-1 h-6 px-0 text-xs"
                  onClick={() =>
                    openFindingWindow({ finding, agentId, audience })
                  }
                >
                  <Maximize2 className="h-3 w-3" />
                  Read the full finding
                </Button>
              )}
            </div>
          )}
          <RegressionCasesFromFinding finding={finding} />
          {!finding.machine_applicable && (
            <p className="text-xs text-muted-foreground">
              {LEVER_LABEL[finding.lever]} findings are reports for a human —
              “Accept” records the decision, it does not change anything by
              itself. If the recommendation is close but not the real point, use{" "}
              <strong>Guide</strong> and tell the reviewer.
            </p>
          )}
          {discussing && (
            <DiscussPanel
              reviewId={finding.review_id}
              findingId={finding.id}
              findingTitle={finding.title}
              onResolved={onChanged}
            />
          )}
        </div>
      )}
    </Card>
  );
}
