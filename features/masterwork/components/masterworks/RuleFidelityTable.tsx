"use client";

// features/masterwork/components/masterworks/RuleFidelityTable.tsx
//
// RULE BY RULE, BOTH LEGS. The Audition's verdict used to reach the Expert as
// two headline numbers ("Masterwork 38.9, vanilla 30") over a single-leg list
// of rules — the plain model's standing on each rule was computed, stored, and
// never shown. The hand-run benchmark this Audition exists to automate
// (common-docs/projects/teach-parenting-pair/BENCHMARK-SIMPLE-PATH.md) reported
// exactly the thing the numbers hide: WHICH rules each side won, and why.
//
// So this is the verdict's body, not a garnish: one row per rule the judge
// read, the Masterwork's standing against the original beside the plain
// model's on the same rule, and an honest "not judged on this rule" where an
// arm was never asked — never a silent drop into the headline.

import Link from "next/link";

import type { RulebookRule } from "../../types";
import { ruleAnchorId } from "../detail/RuleRelations";
import type { AuditionVerdict, RuleFinding } from "./auditionVerdict";

const WINNER_COPY: Record<string, { label: string; cls: string }> = {
  candidate: { label: "wins", cls: "text-primary" },
  reference: { label: "loses", cls: "text-destructive" },
  tie: { label: "even", cls: "text-muted-foreground" },
};

export function RuleFidelityTable({
  verdict,
  rulebookId,
  rulesById,
}: {
  verdict: AuditionVerdict;
  rulebookId: string;
  rulesById: Map<string, RulebookRule>;
}) {
  if (verdict.findings.length === 0 && verdict.vanilla_findings.length === 0) {
    return null;
  }
  const vanillaById = new Map(
    verdict.vanilla_findings.map((f) => [f.rule_id, f] as const),
  );
  const seen = new Set(verdict.findings.map((f) => f.rule_id));
  const rows = [
    ...verdict.findings,
    ...verdict.vanilla_findings.filter((f) => !seen.has(f.rule_id)),
  ];
  const showVanilla = verdict.vanilla_compared;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="py-1 pr-2 font-medium">Rule</th>
            <th className="py-1 pr-2 font-medium">Yours vs the original</th>
            {showVanilla ? (
              <th className="py-1 font-medium">Vanilla AI vs the original</th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const rule = rulesById.get(row.rule_id);
            const mine = seen.has(row.rule_id)
              ? verdict.findings.find((f) => f.rule_id === row.rule_id)
              : undefined;
            const theirs = vanillaById.get(row.rule_id);
            return (
              <tr key={row.rule_id} className="border-t border-border align-top">
                <td className="py-1 pr-2">
                  {rule ? (
                    <Link
                      href={`/masterwork/${rulebookId}#${ruleAnchorId(rule.id)}`}
                      className="font-medium text-primary underline-offset-2 hover:underline"
                    >
                      {rule.name}
                    </Link>
                  ) : (
                    <span className="font-medium text-amber-600 dark:text-amber-500">
                      a rule that is no longer in this Rulebook
                    </span>
                  )}
                </td>
                <td className="py-1 pr-2">
                  {mine ? (
                    <>
                      <span className={WINNER_COPY[mine.winner]?.cls}>
                        {WINNER_COPY[mine.winner]?.label ?? mine.winner}
                      </span>
                      {mine.note ? (
                        <span className="text-muted-foreground"> — {mine.note}</span>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-muted-foreground">
                      not judged on this rule
                    </span>
                  )}
                </td>
                {showVanilla ? (
                  <td className="py-1">
                    {theirs ? (
                      <>
                        <span className={WINNER_COPY[theirs.winner]?.cls}>
                          {WINNER_COPY[theirs.winner]?.label ?? theirs.winner}
                        </span>
                        {theirs.note ? (
                          <span className="text-muted-foreground"> — {theirs.note}</span>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-muted-foreground">
                        not judged on this rule
                      </span>
                    )}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
