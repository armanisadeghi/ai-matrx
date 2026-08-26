"use client";

/**
 * features/hr/time/shared/MoneyAndFlags.tsx — the three renderers that keep a figure honest.
 *
 * 🚨 MONEY IS ABSENT WHEN A CONTRIBUTING RULE IS ADVISORY (SPEC-TIME §0 law 4, §7.3, L3-63).
 * `amount: null` with `moneyWithheld: true` is not "no data" — it is a decision the engine made and
 * must be **said out loud**. The surface shows the hours, omits the amount, and renders the flag as
 * a human sentence with a door to the rule. **Never a zero, never a dash, never a guess:** a zero
 * in a pay column is a claim that nothing is owed, and that claim is false here.
 *
 * 🚨 `incomplete[]` IS RENDERED AS A VISIBLE SENTENCE NAMING THE MISSING FACT — never swallowed
 * (§7.3 node I9). It rides inside the calc block (`CalcBlock.calc.incomplete`) because that is
 * where `POST /hr/calc/*` puts it; this module is the one place that knows to look, so a surface
 * cannot forget.
 */

import { AlertTriangle, HelpCircle } from "lucide-react";

import { cn } from "@/lib/utils";

import type { CalcBlock, CalcFlag, IncompleteFact, MoneyBearing } from "../api/types";
import { formatMoney } from "./format";
import { useRuleSnapshot } from "./RuleSnapshot";

/**
 * The amount cell.
 *
 * `withheld` renders no number at all. `alignRight` exists because a money column that is not
 * right-aligned is unreadable, and the withheld sentence has to sit in the same column without
 * pretending to be a figure.
 */
export function MoneyAmount({
  money,
  className,
}: {
  money: MoneyBearing;
  className?: string;
}) {
  if (money.moneyWithheld || money.amount === null) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400",
          className,
        )}
      >
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Amount not calculated
      </span>
    );
  }
  return (
    <span className={cn("tabular-nums", className)}>{formatMoney(money.amount)}</span>
  );
}

/**
 * The flag sentences. Each is the engine's own words plus a **door to the rule** — the class and
 * jurisdiction are named so a reader can tell a Los Angeles fair-workweek hold from a federal one
 * without opening anything.
 */
export function CalcFlagSentences({
  flags,
  className,
}: {
  flags: CalcFlag[];
  className?: string;
}) {
  if (flags.length === 0) return null;
  return (
    <ul className={cn("space-y-1.5", className)}>
      {flags.map((flag, index) => (
        <li
          key={`${flag.code}-${flag.ruleId ?? index}`}
          className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-2 text-xs text-foreground"
        >
          <AlertTriangle
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400"
            aria-hidden
          />
          <span className="min-w-0">
            <span className="block">{flag.message}</span>
            <span className="mt-1 block text-[11px] text-muted-foreground">
              {[flag.class, flag.jurisdictionKey].filter(Boolean).join(" · ")}
              {flag.ruleId ? (
                <>
                  {" · "}
                  <RuleIdDoor ruleId={flag.ruleId} label="Open the rule" />
                </>
              ) : null}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The rule door for a flag.
 *
 * A jurisdiction rule has no canonical UI route in this repo yet (the jurisdiction admin surface is
 * L5's), so the door opens the rule-snapshot window carrying the id rather than pretending to
 * navigate somewhere that does not exist. That is still a door — it opens, it names the record, and
 * it can be copied — and it becomes a route the day L5 registers one.
 */
function RuleIdDoor({ ruleId, label }: { ruleId: string; label: string }) {
  const snapshot = useRuleSnapshot();
  return (
    <button
      type="button"
      className="underline decoration-dotted underline-offset-2 hover:text-foreground"
      onClick={() =>
        snapshot.open({
          title: "Jurisdiction rule",
          subtitle: ruleId,
          calc: null,
          extra: { rule_id: ruleId },
        })
      }
    >
      {label}
    </button>
  );
}

/** Read `incomplete[]` out of a calc block without trusting its shape. */
export function incompleteFacts(calc: CalcBlock | null | undefined): IncompleteFact[] {
  const raw = calc?.calc?.incomplete;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (entry): entry is IncompleteFact =>
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as IncompleteFact).fact === "string",
  );
}

/**
 * 🚨 Never swallowed. A missing applicability fact is the difference between "this figure is right"
 * and "this figure is the best we could do without knowing whether the employee is exempt", and a
 * surface that hides it is presenting a guess as an answer.
 */
export function IncompleteFactSentences({
  calc,
  className,
}: {
  calc: CalcBlock | null | undefined;
  className?: string;
}) {
  const facts = incompleteFacts(calc);
  if (facts.length === 0) return null;
  return (
    <ul className={cn("space-y-1.5", className)}>
      {facts.map((fact, index) => (
        <li
          key={`${fact.class}-${fact.fact}-${index}`}
          className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-2 text-xs"
        >
          <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span>
            This figure was calculated without one fact it needed:{" "}
            <span className="font-medium">{fact.fact}</span>
            {fact.class ? (
              <span className="text-muted-foreground"> ({fact.class})</span>
            ) : null}
            .
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Everything a figure owes the reader, in one mount: flags first, then missing facts. */
export function FigureNotices({
  money,
  calc,
  className,
}: {
  money?: MoneyBearing | null;
  calc?: CalcBlock | null;
  className?: string;
}) {
  const flags = money?.flags ?? [];
  const facts = incompleteFacts(calc);
  if (flags.length === 0 && facts.length === 0) return null;
  return (
    <div className={cn("space-y-1.5", className)}>
      <CalcFlagSentences flags={flags} />
      <IncompleteFactSentences calc={calc} />
    </div>
  );
}
