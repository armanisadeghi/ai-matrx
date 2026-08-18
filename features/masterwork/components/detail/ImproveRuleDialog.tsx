"use client";

// features/masterwork/components/detail/ImproveRuleDialog.tsx
//
// The IMPROVE verb — the third core review action (Approve / Reject / Improve;
// Arman, 2026-08-17: this is how people will almost always use the review).
// The Expert talks (ProTextarea, mic), the `masterwork.rule_improver` Mandate
// rewrites that ONE rule with the FULL Rulebook as context, the rewrite lands
// as a DRAFT revision of the same rule id through the canonical saveRules CAS
// (never auto-approved), and the Expert reviews it as a before/after — Approve
// (explicit), keep editing, or discard.
//
// The dialog stays MOUNTED at page level so the Expert can submit and KEEP
// REVIEWING (the wizard's "request changes and keep going" flow): closing it
// mid-run never cancels the run — when the agent answers, the rewrite still
// lands as a draft and returns to the review queue.

import { useRef, useState } from "react";
import { ArrowRight, Wand2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ProTextarea } from "@/components/official/ProTextarea";
import { LiveRunDisplay } from "@/features/agents/components/live-run/LiveRunDisplay";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import { applyRuleImprove } from "../../agent-context/ruleImprove";
import { RuleDecisionActions } from "../../review/RuleDecisionActions";
import { useRuleImproveRun } from "../../review/useRuleImproveRun";
import type { RulebookRule, RulebookSections } from "../../types";
import { SEVERITY_LABELS } from "../../types";

export interface ImproveRuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The rule being improved; null renders nothing. */
  rule: RulebookRule | null;
  sections: RulebookSections;
  surfaceName: string;
  rulebookId: string;
  organizationId: string;
  getSurfaceScope: () => SurfaceScopePayload;
  /**
   * Persist the rewrite as a DRAFT revision (canonical upsert, id kept).
   * Called the moment the agent answers — even when the Expert already closed
   * the dialog and kept reviewing.
   */
  onLanded: (revised: RulebookRule) => Promise<void>;
  /** Discard: restore the pre-improve rule exactly as it was. */
  onDiscard: (original: RulebookRule) => Promise<void>;
  /** The explicit Approve of the landed rewrite. Resolves true when saved. */
  onApproveRevised: (revised: RulebookRule) => Promise<boolean>;
  /** Keep editing: open the full editor on the landed draft revision. */
  onEditRevised: (revised: RulebookRule) => void;
}

interface ImproveReview {
  original: RulebookRule;
  revised: RulebookRule;
}

function FieldDiff({
  label,
  before,
  after,
}: {
  label: string;
  before: string | undefined;
  after: string | undefined;
}) {
  const prev = (before ?? "").trim();
  const next = (after ?? "").trim();
  if (!prev && !next) return null;
  const changed = prev !== next;
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </div>
      {changed && prev ? (
        <p className="mt-1 text-sm leading-6 text-muted-foreground line-through decoration-destructive/40">
          {prev}
        </p>
      ) : null}
      <p
        className={`mt-1 text-sm leading-6 ${
          changed ? "text-foreground" : "text-muted-foreground"
        }`}
      >
        {next || "—"}
      </p>
    </div>
  );
}

export function ImproveRuleDialog({
  open,
  onOpenChange,
  rule,
  sections,
  surfaceName,
  rulebookId,
  organizationId,
  getSurfaceScope,
  onLanded,
  onDiscard,
  onApproveRevised,
  onEditRevised,
}: ImproveRuleDialogProps) {
  const improveRun = useRuleImproveRun({
    rulebookId,
    organizationId,
    sections,
    surfaceName,
  });
  const [feedback, setFeedback] = useState("");
  const [review, setReview] = useState<ImproveReview | null>(null);
  const [busy, setBusy] = useState(false);
  // What the async completion reads to decide "show the review" vs "toast and
  // let the queue carry it" — state would be stale inside the closure.
  const openRef = useRef(open);
  openRef.current = open;
  const runningForRef = useRef<string | null>(null);
  const [lastRule, setLastRule] = useState<RulebookRule | null>(null);
  // IMPROVE AGAIN: after a rewrite lands, the Expert can keep pushing on the
  // REVISED rule rather than the one they opened the dialog with.
  const [reimproving, setReimproving] = useState<RulebookRule | null>(null);

  // Reset per-target compose state when the dialog opens on a new rule.
  if (open && rule && rule.id !== lastRule?.id) {
    setLastRule(rule);
    setFeedback(rule.feedback ?? "");
    setReview(null);
    setReimproving(null);
  }

  const target = reimproving ?? rule;

  // Closing drops the per-sitting state: an Improve-again chain must never be
  // resumed silently the next time this dialog opens on the same rule.
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setReview(null);
      setReimproving(null);
    }
    onOpenChange(next);
  };

  const submit = async () => {
    if (!target || !feedback.trim()) return;
    runningForRef.current = target.id;
    try {
      const revised = await improveRun.run<RulebookRule>({
        surfaceKey: "masterwork-rule-improve",
        fields: target,
        expertInput: feedback.trim(),
        context: getSurfaceScope(),
        fallbackSection: target.section,
        apply: (result) => applyRuleImprove(target, result),
      });
      // Land immediately as a DRAFT revision — the rewrite must never live
      // only in this dialog's memory.
      await onLanded(revised);
      if (openRef.current && runningForRef.current === target.id) {
        setReview({ original: target, revised });
        setFeedback("");
      } else {
        toast.success(`"${revised.name}" was rewritten`, {
          description:
            "It's back in your review queue as a draft — approve it when you're happy.",
        });
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not improve the rule",
      );
    } finally {
      runningForRef.current = null;
    }
  };

  const approve = async () => {
    if (!review) return;
    setBusy(true);
    try {
      const landed = await onApproveRevised(review.revised);
      if (landed) {
        handleOpenChange(false);
      }
    } finally {
      setBusy(false);
    }
  };

  const discard = async () => {
    if (!review) return;
    setBusy(true);
    try {
      await onDiscard(rule ?? review.original);
      toast.success("Rewrite discarded — the rule is back the way it was.");
      handleOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not undo");
    } finally {
      setBusy(false);
    }
  };

  const running = improveRun.isRunning;
  const sectionLabel = (code: string) => sections[code]?.label ?? code;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="space-y-1 border-b border-border px-6 py-4 text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Wand2 className="h-4 w-4 text-primary" />
            {review ? "Review the rewrite" : "Improve this rule"}
          </DialogTitle>
          <DialogDescription>
            {review
              ? "The rewrite is saved as a draft. Approve it, keep editing, or put the rule back the way it was."
              : "Say what should change — we rewrite the rule to fit your Rulebook and bring it back for your approval."}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {target && !review ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    {target.name}
                  </span>
                  <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                    {SEVERITY_LABELS[target.severity]}
                  </Badge>
                </div>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {target.statement}
                </p>
              </div>
              <ProTextarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="What should change? Talk or type — the more specific, the better the rewrite…"
                autoGrow
                minHeight={110}
                maxHeight={280}
                disabled={running}
              />
              {improveRun.hasLiveRun ? (
                <LiveRunDisplay
                  conversationId={improveRun.conversationId}
                  pending={running}
                  label={`Rewriting "${target.name}"`}
                  onDismiss={improveRun.dismiss}
                  bodyClassName="max-h-40"
                />
              ) : null}
              {running ? (
                <p className="text-xs text-muted-foreground">
                  You don&apos;t have to wait — keep reviewing and the rewrite
                  returns to your queue as a draft the moment it&apos;s ready.
                </p>
              ) : null}
            </div>
          ) : null}

          {review ? (
            <div className="space-y-4">
              <FieldDiff
                label="Short name"
                before={review.original.name}
                after={review.revised.name}
              />
              <FieldDiff
                label="The rule"
                before={review.original.statement}
                after={review.revised.statement}
              />
              <FieldDiff
                label="Why it matters"
                before={review.original.rationale}
                after={review.revised.rationale}
              />
              <FieldDiff
                label="How to spot a violation"
                before={review.original.detection}
                after={review.revised.detection}
              />
              <FieldDiff
                label="Severity · section"
                before={`${SEVERITY_LABELS[review.original.severity]} · ${sectionLabel(review.original.section)}`}
                after={`${SEVERITY_LABELS[review.revised.severity]} · ${sectionLabel(review.revised.section)}`}
              />
              {review.original.quote ? (
                <p className="text-xs text-muted-foreground">
                  The source quote is evidence and was left untouched.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter className="gap-2 border-t border-border bg-muted/20 px-6 py-3 sm:justify-between">
          {review ? (
            /* The four verbs, same contract as every other review surface —
               Improve here means "keep pushing on the REWRITE". */
            <RuleDecisionActions
              className="sm:justify-end"
              disabled={busy}
              labels={{ reject: "Discard", edit: "Keep editing" }}
              onApprove={() => void approve()}
              onImprove={() => {
                setReimproving(review.revised);
                setReview(null);
                setFeedback("");
              }}
              onReject={() => void discard()}
              onEdit={() => {
                onEditRevised(review.revised);
                handleOpenChange(false);
              }}
            />
          ) : (
            <>
              <Button
                variant="ghost"
                onClick={() => handleOpenChange(false)}
                className="sm:mr-auto"
              >
                {running ? (
                  <>
                    Keep reviewing
                    <ArrowRight className="h-4 w-4" />
                  </>
                ) : (
                  "Cancel"
                )}
              </Button>
              <Button
                onClick={() => void submit()}
                disabled={running || !feedback.trim() || !target}
              >
                <Wand2 className="h-4 w-4" />
                {running ? "Rewriting…" : "Improve this rule"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
