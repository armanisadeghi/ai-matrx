"use client";

/**
 * IMPROVE and EDIT for ONE Final Checkup suggestion.
 *
 * Arman, 2026-08-18: *"It doesn't have an option to edit the suggestion, and it
 * doesn't have an option to click to provide guidance to the agent so that you
 * can take the suggested version but then have it modified. Whenever a change
 * is made or an enhancement is made, that enhancement or change needs to be
 * made every single place that that code or logic exists."*
 *
 * So the two missing verbs land here, and BOTH are the platform's existing
 * implementations rather than new ones:
 *
 *   IMPROVE → `useRuleImproveRun` — THE ONE runner of the
 *             `masterwork.rule_improver` Mandate (the same one the rule-review
 *             queue and the Rule Editor's cleanup use). The rewrite streams
 *             through `LiveRunDisplay`; there is no second improve path and no
 *             agent id anywhere in this file.
 *   EDIT    → `RuleFields` — THE ONE plain-language rule form, the same fields
 *             the editor and the Add-rule window show.
 *
 * What is deliberately different from the rule-review Improve: the result is
 * NOT written to the Rulebook. A checkup suggestion is not a rule yet — the
 * rewrite becomes the proposal this finding will apply IF the Expert approves
 * it, and the whole checkup still lands in ONE save at Apply.
 */

import { useEffect, useMemo, useState } from "react";
import { BrainCircuit, Loader2 } from "lucide-react";

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
import { toast } from "@/lib/toast";
import { RuleFields, type RuleFieldValues } from "../components/detail/RuleFields";
import { useRuleImproveRun } from "../review/useRuleImproveRun";
import type { Rulebook, RuleSeverity } from "../types";
import type { CheckupFinding, CheckupProposedRule } from "./types";

export type CheckupSuggestionMode = "improve" | "edit" | "reject";

export interface CheckupSuggestionDialogProps {
  /** The finding being worked, or null when the dialog is closed. */
  finding: CheckupFinding | null;
  mode: CheckupSuggestionMode;
  /** The proposal as it stands — the checkup's, or the Expert's own so far. */
  proposal: CheckupProposedRule | null;
  rulebook: Rulebook;
  surfaceName: string;
  onClose: () => void;
  /** The Expert now owns this wording. Approving the finding applies it. */
  onProposal: (findingId: string, proposal: CheckupProposedRule) => void;
  /**
   * Set aside, with the reason in the Expert's own words. The reason is what
   * teaches the NEXT checkup not to suggest this again, so it is asked for —
   * and it stays optional, because a refusal nobody can explain is still a
   * refusal.
   */
  onReject: (findingId: string, note: string) => void;
}

function toFieldValues(
  proposal: CheckupProposedRule,
  evidence: string,
): RuleFieldValues {
  return {
    name: proposal.name,
    statement: proposal.statement,
    rationale: proposal.rationale ?? "",
    detection: proposal.detection ?? "",
    // Shown for context in the header, never edited here — the source quote is
    // mechanically-verified evidence, so `quote` is omitted from the form.
    quote: evidence,
    severity: proposal.severity,
    section: proposal.section,
  };
}

function toProposal(values: RuleFieldValues): CheckupProposedRule {
  return {
    name: values.name.trim(),
    statement: values.statement.trim(),
    severity: values.severity as RuleSeverity,
    section: values.section,
    ...(values.rationale.trim() ? { rationale: values.rationale.trim() } : {}),
    ...(values.detection.trim() ? { detection: values.detection.trim() } : {}),
  };
}

export function CheckupSuggestionDialog({
  finding,
  mode,
  proposal,
  rulebook,
  surfaceName,
  onClose,
  onProposal,
  onReject,
}: CheckupSuggestionDialogProps) {
  const [guidance, setGuidance] = useState("");
  const [fields, setFields] = useState<RuleFieldValues | null>(null);

  const improve = useRuleImproveRun({
    rulebookId: rulebook.id,
    organizationId: rulebook.organization_id,
    sections: rulebook.sections,
    surfaceName,
  });

  // A new finding is a new question — never carry the last one's guidance or
  // half-typed edits into it.
  const findingId = finding?.id ?? null;
  useEffect(() => {
    setGuidance("");
    setFields(
      finding && proposal ? toFieldValues(proposal, finding.evidence) : null,
    );
    // Only when the finding or the mode changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [findingId, mode]);

  const context = useMemo(
    () => ({
      rulebook: { id: rulebook.id, name: rulebook.name },
      sections: rulebook.sections,
      what_the_expert_said: finding?.evidence ?? "",
      why_we_suggested_it: finding?.reason ?? "",
    }),
    [rulebook.id, rulebook.name, rulebook.sections, finding?.evidence, finding?.reason],
  );

  if (!finding) return null;
  // Only `retire` findings legitimately have no proposal; every other mode
  // needs one to act on.
  if (!proposal && mode !== "reject") return null;

  const submitImprove = async () => {
    if (!guidance.trim() || !proposal) return;
    try {
      const revised = await improve.run<CheckupProposedRule>({
        surfaceKey: "masterwork-checkup-improve",
        fields: {
          name: proposal.name,
          statement: proposal.statement,
          rationale: proposal.rationale ?? "",
          detection: proposal.detection ?? "",
          severity: proposal.severity,
          section: proposal.section,
        },
        expertInput: guidance.trim(),
        context,
        fallbackSection: proposal.section,
        apply: (result) => ({
          name: result.name.trim(),
          statement: result.statement.trim(),
          severity: result.severity,
          section: result.section,
          ...(result.rationale.trim() ? { rationale: result.rationale.trim() } : {}),
          ...(result.detection.trim() ? { detection: result.detection.trim() } : {}),
        }),
      });
      onProposal(finding.id, revised);
      toast.success("Rewritten — the suggestion now says what you asked for.", {
        description: "It's approved with your wording. Apply when you're ready.",
      });
      onClose();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "The rewrite did not come back.",
      );
    }
  };

  const saveEdit = () => {
    if (!fields) return;
    if (!fields.name.trim() || !fields.statement.trim()) {
      toast.error("A rule needs a short name and the rule itself.");
      return;
    }
    onProposal(finding.id, toProposal(fields));
    toast.success("Saved your wording.", {
      description: "It's approved as you wrote it. Apply when you're ready.",
    });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="flex max-h-[85dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border px-5 py-3">
          <DialogTitle className="text-base">
            {mode === "improve"
              ? "Change the suggestion"
              : mode === "edit"
                ? "Write it yourself"
                : "Set this one aside"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {mode === "improve"
              ? "Say what should be different and we'll rewrite it. You still decide whether to keep it."
              : mode === "edit"
                ? "Edit the suggested rule directly. Saving approves your version — nothing is written until you apply."
                : "Telling us why stops us suggesting the same thing next time. You can skip it."}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {mode === "reject" ? (
            <ProTextarea
              value={guidance}
              onChange={(e) => setGuidance(e.target.value)}
              autoGrow
              minHeight={90}
              placeholder="Why not? (optional)"
            />
          ) : mode === "improve" && proposal ? (
            <>
              <div className="rounded-md border border-border bg-muted/30 p-2.5">
                <p className="text-sm font-medium text-foreground">
                  {proposal.name}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                  {proposal.statement}
                </p>
              </div>
              <ProTextarea
                value={guidance}
                onChange={(e) => setGuidance(e.target.value)}
                autoGrow
                minHeight={90}
                placeholder="What should be different? Say it however you'd say it out loud."
              />
              {improve.hasLiveRun ? (
                <LiveRunDisplay variant="bare" />
              ) : null}
            </>
          ) : fields ? (
            <RuleFields
              values={fields}
              onChange={(patch) =>
                setFields((prev) => (prev ? { ...prev, ...patch } : prev))
              }
              sections={rulebook.sections}
              idPrefix="checkup-rule"
              autoFocusName={false}
              omitFields={["quote"]}
            />
          ) : null}
        </div>

        <DialogFooter className="border-t border-border px-5 py-3">
          <Button variant="ghost" onClick={onClose} disabled={improve.isRunning}>
            Cancel
          </Button>
          {mode === "reject" ? (
            <Button
              variant="destructive"
              onClick={() => {
                onReject(finding.id, guidance.trim());
                onClose();
              }}
            >
              Set it aside
            </Button>
          ) : mode === "improve" ? (
            <Button
              onClick={() => void submitImprove()}
              disabled={improve.isRunning || !guidance.trim()}
            >
              {improve.isRunning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <BrainCircuit className="h-4 w-4" />
              )}
              Rewrite it
            </Button>
          ) : (
            <Button onClick={saveEdit}>Save my version</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CheckupSuggestionDialog;
