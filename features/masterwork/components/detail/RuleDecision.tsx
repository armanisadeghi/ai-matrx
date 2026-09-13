"use client";

// features/masterwork/components/detail/RuleDecision.tsx
//
// THE ONE RENDERER of a rule's DECISION half — "when this comes up → do
// this", with the kind of move it is and what it costs and risks.
//
// 🚨 Why this exists. The distillers have written the decision shape onto
// rules since W58 (`aidream/services/distillation/distill.py`): `kind`,
// `precondition`, `next_action`, `action_kind`, `cost`, `risk`. On 2026-09-12
// a census found 592 live rules carrying that if → then and NOT ONE frontend
// surface rendering it — the rule card, the review queue and the agents'
// Rulebook document all showed the statement alone. An Expert approving a
// decision rule was shown half the rule and asked to say yes. That is law 4
// (a screen never lies by omission) and it hid the single operational form the
// system has.
//
// Every surface that renders a rule imports THIS — never its own copy — so a
// new surface inherits the decision half instead of dropping it again. The
// guard is `features/masterwork/__tests__/policy-rule-surface.test.tsx`.
//
// UNKNOWN VALUES RENDER NOTHING. `action_kind`, `cost` and `risk` speak closed
// vocabularies the server drops unknown values from; a reader acting on a
// label we invented is worse than a reader told nothing.

import { ArrowRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  RULE_ACTION_KIND_LABELS,
  RULE_POLICY_LEVEL_LABELS,
  isPolicyRule,
  ruleActionKind,
  rulePolicyLevel,
  type RulebookRule,
} from "../../types";

/** The header badge that says this rule is a judgment, not a commandment. */
export function RuleDecisionBadge({ rule }: { rule: RulebookRule }) {
  if (!isPolicyRule(rule)) return null;
  return (
    <Badge
      variant="outline"
      className="px-1.5 py-0 text-[10px] border-primary/40 text-primary"
      title="A decision: what to do when a particular situation comes up, rather than a rule that always applies."
    >
      Decision
    </Badge>
  );
}

/**
 * The decision half itself. Renders nothing at all when the rule carries none
 * of it — an ordinary rule is not missing anything.
 */
export function RuleDecision({
  rule,
  className,
}: {
  rule: RulebookRule;
  className?: string;
}) {
  const precondition = rule.precondition?.trim();
  const nextAction = rule.next_action?.trim();
  const actionKind = ruleActionKind(rule);
  const cost = rulePolicyLevel(rule.cost);
  const risk = rulePolicyLevel(rule.risk);

  if (!precondition && !nextAction && !actionKind && !cost && !risk) {
    return null;
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="text-xs font-medium text-muted-foreground">
        The call you make
      </div>
      <div className="rounded-md border border-primary/20 bg-primary/5 px-2.5 py-2 text-sm">
        {precondition ? (
          <p className="text-foreground">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              When{" "}
            </span>
            {precondition}
          </p>
        ) : null}
        {nextAction ? (
          <p
            className={cn(
              "flex items-baseline gap-1.5 text-foreground",
              precondition ? "mt-1" : "",
            )}
          >
            <ArrowRight className="h-3.5 w-3.5 shrink-0 self-center text-primary" />
            <span>
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Then{" "}
              </span>
              {nextAction}
            </span>
          </p>
        ) : null}
        {actionKind || cost || risk ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {actionKind ? (
              <Badge
                variant="outline"
                className="px-1.5 py-0 text-[10px] text-muted-foreground"
              >
                {RULE_ACTION_KIND_LABELS[actionKind]}
              </Badge>
            ) : null}
            {cost ? (
              <span className="text-[11px] text-muted-foreground">
                Cost: {RULE_POLICY_LEVEL_LABELS[cost]}
              </span>
            ) : null}
            {risk ? (
              <span className="text-[11px] text-muted-foreground">
                Risk: {RULE_POLICY_LEVEL_LABELS[risk]}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
