"use client";

// features/masterwork/components/detail/RuleReviewWizard.tsx
//
// Focus review — one rule at a time (Arman, 2026-08-17: "a little wizard
// almost where you're just clicking next, next, next"). For Experts who find
// the full list overwhelming: the same card, one per screen, and every
// decision auto-advances. The queue is the rules waiting on the EXPERT
// (drafts); rejected rules are with the interviewer and never appear here.

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  PartyPopper,
  Pencil,
  XCircle,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ProTextarea } from "@/components/official/ProTextarea";
import type { Rulebook, RulebookRule } from "../../types";
import { ruleState, SEVERITY_LABELS } from "../../types";

export function RuleReviewWizard({
  open,
  onOpenChange,
  rulebook,
  onApprove,
  onReject,
  onEdit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rulebook: Rulebook;
  onApprove: (rule: RulebookRule) => Promise<void>;
  onReject: (rule: RulebookRule, feedback: string) => Promise<void>;
  /** Closes the wizard and opens the full editor on this rule. */
  onEdit: (rule: RulebookRule) => void;
}) {
  // The queue is snapshotted per open so decided rules keep their slot (the
  // progress count stays honest) while the live rulebook updates underneath.
  const [queueIds, setQueueIds] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [rejecting, setRejecting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [decided, setDecided] = useState(0);

  useEffect(() => {
    if (!open) return;
    const ids = rulebook.rules
      .filter((r) => ruleState(r) === "draft")
      .map((r) => r.id);
    setQueueIds(ids);
    setIndex(0);
    setDecided(0);
    setRejecting(false);
    setFeedback("");
    // Deliberately only on open — the queue must not reshuffle mid-review.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const byId = useMemo(
    () => new Map(rulebook.rules.map((r) => [r.id, r])),
    [rulebook.rules],
  );
  const currentId = queueIds[index];
  const rule = currentId ? byId.get(currentId) : undefined;
  const finished = index >= queueIds.length;

  const advance = () => {
    setRejecting(false);
    setFeedback("");
    setIndex((i) => i + 1);
  };

  const approve = async () => {
    if (!rule) return;
    setBusy(true);
    try {
      await onApprove(rule);
      setDecided((d) => d + 1);
      advance();
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    if (!rule || !feedback.trim()) return;
    setBusy(true);
    try {
      await onReject(rule, feedback.trim());
      setDecided((d) => d + 1);
      advance();
    } catch (err) {
      // Stay on the card — the feedback the Expert just wrote is not lost.
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  const progressPct =
    queueIds.length === 0 ? 100 : Math.round((index / queueIds.length) * 100);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col gap-3 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2 text-base">
            <span>Review your rules</span>
            {!finished ? (
              <span className="text-xs font-normal tabular-nums text-muted-foreground">
                {Math.min(index + 1, queueIds.length)} of {queueIds.length}
              </span>
            ) : null}
          </DialogTitle>
        </DialogHeader>
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {finished || !rule ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <PartyPopper className="h-8 w-8 text-primary" />
            <p className="text-sm font-medium text-foreground">
              {decided > 0
                ? `That's the queue — ${decided} ${decided === 1 ? "rule" : "rules"} reviewed in one sitting.`
                : "Nothing is waiting on you right now."}
            </p>
            <p className="text-xs text-muted-foreground">
              Rejected rules come back rewritten after your next interview turn.
            </p>
            <Button size="sm" className="mt-2" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-md border border-border bg-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-foreground">
                  {rule.name}
                </span>
                <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                  {SEVERITY_LABELS[rule.severity]}
                </Badge>
              </div>
              <p className="text-sm text-foreground">{rule.statement}</p>
              {rule.rationale ? (
                <div>
                  <div className="text-xs font-medium text-muted-foreground">
                    Why it matters
                  </div>
                  <p className="text-sm text-foreground">{rule.rationale}</p>
                </div>
              ) : null}
              {rule.detection ? (
                <div>
                  <div className="text-xs font-medium text-muted-foreground">
                    How to spot a violation
                  </div>
                  <p className="text-sm text-foreground">{rule.detection}</p>
                </div>
              ) : null}
              {rule.quote ? (
                <blockquote className="border-l-2 border-border pl-2 text-sm italic text-foreground">
                  “{rule.quote}”
                </blockquote>
              ) : null}
              {rejecting ? (
                <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-2">
                  <p className="text-xs text-muted-foreground">
                    Why is it wrong? Your reason goes to the interviewer, who
                    rewrites the rule for your review.
                  </p>
                  <ProTextarea
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder="Talk or type — be as specific as you can…"
                    autoGrow
                    minHeight={90}
                    maxHeight={240}
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setRejecting(false)}
                      disabled={busy}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => void reject()}
                      disabled={busy || !feedback.trim()}
                    >
                      Reject with feedback
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
            {!rejecting ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => void approve()} disabled={busy}>
                    <CheckCircle2 className="mr-1 h-4 w-4" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setRejecting(true)}
                    disabled={busy}
                  >
                    <XCircle className="mr-1 h-4 w-4" />
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => rule && onEdit(rule)}
                    disabled={busy}
                  >
                    <Pencil className="mr-1 h-4 w-4" />
                    Edit
                  </Button>
                </div>
                <Button size="sm" variant="ghost" onClick={advance} disabled={busy}>
                  Skip
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            ) : null}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
