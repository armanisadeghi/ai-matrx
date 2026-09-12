"use client";

/**
 * THE POLICY HALF OF A RULE, rendered — "When: …" and "Next: …".
 *
 * The unfolding-case contract (§2,
 * `common-docs/systems/masterwork/unfolding-case-contract.md`) added two
 * optional fields to a rule: `precondition` (what had to be true, split into
 * what was known and what was still unknown) and `next_action` (the step to
 * take, what it buys, what it costs and how soon).
 *
 * 🚨 THE ANTI-MISLEADING LAW still rules: `statement` remains the rule, said
 * whole, in prose. This block is the machine-readable restatement and is
 * always rendered UNDER the statement, never in place of it — a surface that
 * showed only "When X → Next Y" would be exactly the misleading half-rule the
 * law exists to kill. A rule with neither field renders nothing at all, which
 * is every rule every other Distillation lane has ever produced.
 */

import { ArrowRight, HelpCircle } from "lucide-react";

import {
  RULE_ACTION_LABELS,
  RULE_ACTION_URGENCY_LABELS,
  type RulebookRule,
} from "../../types";

export function rulePolicyIsEmpty(rule: RulebookRule): boolean {
  return !rule.precondition && !rule.next_action;
}

function Chip({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "known" | "unknown" | "action";
}) {
  const cls =
    tone === "known"
      ? "border-border bg-muted/60 text-foreground"
      : tone === "unknown"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
        : "border-primary/40 bg-primary/10 text-primary";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] leading-4 ${cls}`}
    >
      {children}
    </span>
  );
}

export function RulePolicy({ rule }: { rule: RulebookRule }) {
  const precondition = rule.precondition;
  const next = rule.next_action;
  if (!precondition && !next) return null;

  const numbers: string[] = [];
  if (next?.cost !== undefined) numbers.push(`cost ${next.cost} of 5`);
  if (next?.risk !== undefined) numbers.push(`risk ${next.risk} of 5`);
  if (next?.urgency) numbers.push(RULE_ACTION_URGENCY_LABELS[next.urgency]);

  return (
    <div className="space-y-1.5 rounded-md border border-border bg-muted/30 px-2.5 py-2">
      {precondition ? (
        <div className="space-y-1">
          <p className="text-xs text-foreground">
            <span className="font-medium text-muted-foreground">When: </span>
            {precondition.summary}
          </p>
          {precondition.known?.length || precondition.unknown?.length ? (
            <div className="flex flex-wrap gap-1">
              {(precondition.known ?? []).map((item) => (
                <Chip key={`known:${item}`} tone="known">
                  {item}
                </Chip>
              ))}
              {(precondition.unknown ?? []).map((item) => (
                <Chip key={`unknown:${item}`} tone="unknown">
                  <HelpCircle className="h-3 w-3" aria-hidden />
                  {item} — not known yet
                </Chip>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {next ? (
        <p className="flex flex-wrap items-baseline gap-x-1.5 text-xs text-foreground">
          <span className="font-medium text-muted-foreground">Next: </span>
          <Chip tone="action">
            <ArrowRight className="h-3 w-3" aria-hidden />
            {RULE_ACTION_LABELS[next.kind]}
          </Chip>
          <span>{next.target}</span>
          {next.buys ? (
            <span className="text-muted-foreground">— buys {next.buys}</span>
          ) : null}
          {numbers.length ? (
            <span className="text-muted-foreground">
              ({numbers.join(" · ")})
            </span>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
