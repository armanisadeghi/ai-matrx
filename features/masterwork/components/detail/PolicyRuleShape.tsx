"use client";

// features/masterwork/components/detail/PolicyRuleShape.tsx
//
// 🚨 ONE DECISION-RULE RENDERER. Every surface that shows a rule shows its
// decision shape through THIS component — the rule row, and the focus review
// wizard where the Expert actually approves it. A wizard that showed only the
// prose let a decision rule be approved without its author ever seeing the
// precondition, the next action, the cost or the risk (Bugbot, c016fe96); the
// fix is this import, never a second renderer.

import { ArrowRight, Coins, GitBranch, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { isPolicyRule, POLICY_ACTION_KINDS, type RulebookRule } from "../../types";

/**
 * 🚨 THE POLICY RULE (W58). A decision rule is read as a decision — "when you
 * know … → do …" — never as one more commandment in a list. The chips carry
 * what the Expert weighed: which kind of move it is, and what it costs and
 * risks to make it. Rendered INSIDE the existing rule row (never a second rule
 * renderer), directly under the statement, because the precondition is what
 * tells a reader whether the statement even applies to them.
 */
export function PolicyRuleShape({ rule }: { rule: RulebookRule }) {
  if (!isPolicyRule(rule)) return null;
  const actionLabel =
    POLICY_ACTION_KINDS.find((option) => option.value === rule.action_kind)
      ?.label ?? rule.action_kind;
  return (
    <div className="mt-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1.5">
      <div className="flex flex-wrap items-start gap-x-1.5 gap-y-0.5 text-xs">
        <span className="font-medium text-muted-foreground">When you know</span>
        <span className="text-foreground">{rule.precondition}</span>
        <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="font-medium text-muted-foreground">do</span>
        <span className="text-foreground">{rule.next_action}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1">
        {rule.action_kind ? (
          <Badge
            variant="outline"
            className="px-1.5 py-0 text-[10px] text-muted-foreground"
          >
            <GitBranch className="mr-1 h-3 w-3" />
            {actionLabel}
          </Badge>
        ) : null}
        {rule.cost ? (
          <Badge
            variant="outline"
            className="px-1.5 py-0 text-[10px] text-muted-foreground"
          >
            <Coins className="mr-1 h-3 w-3" />
            {rule.cost} cost
          </Badge>
        ) : null}
        {rule.risk ? (
          <Badge
            variant="outline"
            className="px-1.5 py-0 text-[10px] text-muted-foreground"
          >
            <ShieldAlert className="mr-1 h-3 w-3" />
            {rule.risk} risk
          </Badge>
        ) : null}
      </div>
    </div>
  );
}
