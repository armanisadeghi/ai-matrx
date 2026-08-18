"use client";

/**
 * The documented connections between rules, rendered as REAL DOORS.
 *
 * 🚨 Why this exists — Arman, 2026-08-18, after reading all 28 rules of the SEO
 * Keyword Optimization Rulebook by hand:
 *
 * > "The agents are often creating individual rules that are somewhat related
 * > to other rules, but they're failing to document the relationship. And so
 * > they're representing the rule as though it's a standalone thing… So on a
 * > few of the rules, I found that they were MISLEADING, and I fixed them."
 *
 * A rule that hides its relationship to another rule is a correctness defect.
 * The primary fix is in the rule's own words (the distillers now carry the
 * connecting aspect inline in `statement`); `relates_to` is the machine-
 * readable half — and THE DOOR LAW says a named relationship the UI can
 * resolve must be rendered AND linked. So every sibling here is a link that
 * scrolls to that rule, labelled with the sibling's real name, never a bare id.
 *
 * The server never writes an unresolvable reference (`resolve_rule_relations`
 * in `aidream/services/distillation/distill.py` drops what it cannot resolve),
 * so a miss here means the sibling was retired out from under the link — we
 * say so rather than render a door that opens onto nothing.
 */

import { Link2 } from "lucide-react";

import {
  RULE_RELATION_LABELS,
  type RulebookRule,
  type RuleRelationKind,
} from "../../types";

/** The DOM id every rule row carries, so a relation link can reach it. */
export function ruleAnchorId(ruleId: string): string {
  return `rule-${ruleId}`;
}

export function RuleRelations({
  rule,
  allRules,
}: {
  rule: RulebookRule;
  allRules: RulebookRule[];
}) {
  const relations = rule.relates_to ?? [];
  if (relations.length === 0) return null;

  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground">
        How this connects to your other rules
      </div>
      <ul className="space-y-1">
        {relations.map((relation) => {
          const sibling = allRules.find((r) => r.id === relation.rule_id);
          const label =
            RULE_RELATION_LABELS[relation.kind as RuleRelationKind] ??
            "Relates to";
          return (
            <li
              key={`${relation.kind}:${relation.rule_id}`}
              className="flex flex-wrap items-baseline gap-x-1.5 text-xs"
            >
              <Link2 className="h-3 w-3 shrink-0 self-center text-muted-foreground" />
              <span className="text-muted-foreground">{label}</span>
              {sibling ? (
                <a
                  href={`#${ruleAnchorId(sibling.id)}`}
                  className="font-medium text-primary underline-offset-2 hover:underline"
                >
                  {sibling.name}
                </a>
              ) : (
                // Not a dead link dressed up as a live one: the sibling is gone.
                <span className="text-amber-600 dark:text-amber-500">
                  a rule that is no longer in this Rulebook (
                  <code className="font-mono">{relation.rule_id}</code>)
                </span>
              )}
              {relation.note ? (
                <span className="text-muted-foreground">— {relation.note}</span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
