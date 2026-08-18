"use client";

// features/masterwork/components/detail/RuleReviewWizard.tsx
//
// Focus review — one rule at a time (Arman, 2026-08-17: "a little wizard
// almost where you're just clicking next, next, next"). For Experts who find
// the full list overwhelming: the same card, one per screen, and every
// decision auto-advances. The queue is the rules waiting on the EXPERT
// (drafts); rejected rules are with the interviewer and never appear here.

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  PartyPopper,
  Pencil,
  Wand2,
  XCircle,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  onImprove,
  requeue,
  onEdit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rulebook: Rulebook;
  /** Resolves true only when the save actually landed. */
  onApprove: (rule: RulebookRule) => Promise<boolean>;
  onReject: (rule: RulebookRule, feedback: string) => Promise<void>;
  /**
   * The third verb: opens the Improve panel over the wizard. The Expert can
   * submit and KEEP GOING — `requeue` brings the rewritten rule back into
   * this sitting's queue when the agent responds.
   */
  onImprove: (rule: RulebookRule) => void;
  /** A rule whose Improve rewrite just landed — put it back in the queue. */
  requeue: { id: string; token: number } | null;
  /** Closes the wizard and opens the full editor on this rule. */
  onEdit: (rule: RulebookRule) => void;
}) {
  // The queue is snapshotted per open so decided rules keep their slot (the
  // progress count stays honest) while the live rulebook updates underneath.
  const [queueIds, setQueueIds] = useState<string[]>(() =>
    open
      ? rulebook.rules
          .filter((rule) => ruleState(rule) === "draft")
          .map((rule) => rule.id)
      : [],
  );
  const [index, setIndex] = useState(0);
  const [rejecting, setRejecting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [decided, setDecided] = useState(0);
  const [previousOpen, setPreviousOpen] = useState(open);

  // Reset synchronously when a new review sitting begins. This is a deliberate
  // render-time state adjustment: the queue must be ready in the same render
  // as the dialog opens, not one effect and an empty-state flash later.
  if (open !== previousOpen) {
    setPreviousOpen(open);
    if (open) {
      const ids = rulebook.rules
        .filter((rule) => ruleState(rule) === "draft")
        .map((rule) => rule.id);
      setQueueIds(ids);
      setIndex(0);
      setDecided(0);
      setRejecting(false);
      setFeedback("");
    }
  }

  // An Improve rewrite that lands while this sitting is open returns to the
  // queue: appended at the end when its slot was already decided or passed,
  // left alone when it is still ahead of the Expert. (The "request changes
  // and keep going" flow — Arman, 2026-08-17.)
  const indexRef = useRef(index);
  indexRef.current = index;
  useEffect(() => {
    if (!requeue || !open) return;
    setQueueIds((prev) => {
      const pos = prev.indexOf(requeue.id);
      if (pos >= indexRef.current) return prev;
      return [...prev, requeue.id];
    });
  }, [requeue, open]);

  // The queue is snapshotted per open so decided rules keep their slot (the
  // progress count stays honest) while the live rulebook updates underneath.
  const byId = new Map(rulebook.rules.map((rule) => [rule.id, rule]));
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
      // A failed save (lost version swap while the Scout writes, network)
      // must NOT count as a decision or advance — the Expert stays on the
      // card and the page-level toast says what happened.
      const landed = await onApprove(rule);
      if (!landed) return;
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
      <DialogContent className="flex max-h-[85dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="relative space-y-1 border-b border-border px-6 py-5 pr-28 text-left">
          <DialogTitle className="text-lg">Review your rules</DialogTitle>
          <DialogDescription>
            One clear decision at a time. Read the rule, then approve it or send
            it back with feedback.
          </DialogDescription>
          {!finished ? (
            <span className="absolute right-12 top-5 text-sm font-medium tabular-nums text-muted-foreground">
              {Math.min(index + 1, queueIds.length)} of {queueIds.length}
            </span>
          ) : null}
        </DialogHeader>
        <div
          className="h-1 w-full shrink-0 overflow-hidden bg-muted"
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
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <PartyPopper className="h-8 w-8 text-primary" />
            <p className="text-sm font-medium text-foreground">
              {decided > 0
                ? `That's the queue — ${decided} ${decided === 1 ? "rule" : "rules"} reviewed in one sitting.`
                : "Nothing is waiting on you right now."}
            </p>
            <p className="text-xs text-muted-foreground">
              Rejected rules come back rewritten after your next interview turn.
            </p>
            <Button
              size="sm"
              className="mt-2"
              onClick={() => onOpenChange(false)}
            >
              Done
            </Button>
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
              <div className="grid gap-6 md:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] md:gap-8">
                <section className="min-w-0 space-y-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                    Rule to approve · {SEVERITY_LABELS[rule.severity]}
                  </p>
                  <h3 className="text-xl font-semibold leading-snug text-foreground sm:text-2xl">
                    {rule.name}
                  </h3>
                  <div className="border-l-2 border-primary/50 pl-4">
                    <p className="text-base leading-7 text-foreground">
                      {rule.statement}
                    </p>
                  </div>
                  {rule.quote ? (
                    <div className="pt-2">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        In the source&apos;s own words
                      </p>
                      <blockquote className="border-l-2 border-border pl-4 text-sm italic leading-6 text-muted-foreground">
                        “{rule.quote}”
                      </blockquote>
                    </div>
                  ) : null}
                </section>

                {rule.rationale || rule.detection ? (
                  <div className="min-w-0 space-y-3">
                    {rule.rationale ? (
                      <section className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                        <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
                          Why it matters
                        </h4>
                        <p className="mt-2 text-sm leading-6 text-foreground">
                          {rule.rationale}
                        </p>
                      </section>
                    ) : null}
                    {rule.detection ? (
                      <section className="rounded-lg border border-border bg-muted/40 p-4">
                        <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-foreground">
                          How to spot a violation
                        </h4>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          {rule.detection}
                        </p>
                      </section>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {rejecting ? (
                <div className="mt-6 space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      What needs to change?
                    </p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Your reason goes to the interviewer, who rewrites the rule
                      for your review.
                    </p>
                  </div>
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
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/20 px-6 py-4">
                {/* The three core verbs: Approve / Improve / Reject (Arman,
                2026-08-17), plus Edit for hand-fixes. Icons rely on the
                Button's own gap — never add mr-* to a button icon (icon +
                gap + margin was the "giant gap" defect). */}
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => void approve()} disabled={busy}>
                    <CheckCircle2 className="h-4 w-4" />
                    Approve
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => rule && onImprove(rule)}
                    disabled={busy}
                    title="Say what should change — the AI rewrites it and it comes back to this queue."
                  >
                    <Wand2 className="h-4 w-4" />
                    Improve
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setRejecting(true)}
                    disabled={busy}
                  >
                    <XCircle className="h-4 w-4" />
                    Reject
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => rule && onEdit(rule)}
                    disabled={busy}
                  >
                    <Pencil className="h-4 w-4" />
                    Edit
                  </Button>
                </div>
                <Button variant="ghost" onClick={advance} disabled={busy}>
                  Skip
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            ) : null}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
