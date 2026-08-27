"use client";

/**
 * features/hr/time/periods/components/GeneratePeriodsPanel.tsx — the calendar generator's UI.
 *
 * 🚨 WHY THIS EXISTS. `hr.pay_period_generate` had **no caller anywhere in the product**: the export
 * drive had to invoke the door by hand. SPEC-TIME §7.1 (as amended) names routes 32/33 as its
 * caller, so this is that door.
 *
 * 🚨 THE RESULT IS RENDERED AS COUNTS, NOT AS A "DONE" TOAST. The generator is idempotent — a second
 * run creates nothing and reports everything as unchanged. *"12 created, 4 already existed"* is the
 * honest answer to "did that do anything?"; a surface that says only "Generated" cannot tell a real
 * first run from a no-op, which is exactly the question somebody presses this button to answer.
 *
 * 🚨 DRIFT IS RENDERED AS PROMINENTLY AS SUCCESS. Where a stored period's dates disagree with the
 * pay group's frequency the door reports a conflict and **does not touch the row** — a period that
 * has been submitted, approved or exported is evidence, and silently re-dating it would move
 * somebody's hours between pay periods after the fact. Conflicts therefore get their own block,
 * above the successes, with both the stored and the generated dates side by side.
 *
 * 🚨 REFUSALS RENDER BY NAME. Four are possible and they are four different situations: an unknown
 * or out-of-tenant pay group, a missing `payroll.read`, a through-date before the anchor, and one
 * more than ten years past it. The server's own sentence is shown verbatim — never replaced with a
 * generic failure line.
 *
 * NO CLIENT COMPUTES ANYTHING: every count, date and frequency here is the server's.
 */

import { useMemo, useState } from "react";
import { AlertTriangle, CalendarPlus, CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { HrFixtureCase } from "@/features/hr/mock/transport";
import { formatLocalDate } from "../../shared/format";
import { HrRpcError } from "../../api/rpc";
import type { PayPeriodRow } from "../../api/types";
import { generatePayPeriods, type GeneratePeriodsResult } from "../api/periodReads";

export interface GeneratePeriodsPanelProps {
  /** The periods currently listed — the only place this lane can learn which pay groups exist. */
  rows: PayPeriodRow[];
  mockCase?: HrFixtureCase;
  onGenerated: () => void;
}

interface Refusal {
  code: string;
  userMessage: string;
}

export function GeneratePeriodsPanel({
  rows,
  mockCase,
  onGenerated,
}: GeneratePeriodsPanelProps) {
  /**
   * The pay groups this viewer can see, derived from the periods already listed.
   *
   * ⚠️ DEBT, stated rather than hidden: there is **no pay-group list RPC** reachable from a browser
   * (`hr` is not exposed to PostgREST and only `hr_pay_group_upsert` exists in `public`). So a pay
   * group that has NEVER had a period generated does not appear here — which is precisely the
   * bootstrap case this button is for. Owed to whoever owns pay-group settings: a
   * `public.hr_pay_group_list` reader, or a Generate control on the pay-group settings surface.
   */
  const payGroups = useMemo(() => {
    const byId = new Map<string, string>();
    for (const row of rows) {
      if (row.payGroupId && !byId.has(row.payGroupId)) byId.set(row.payGroupId, row.payGroupName);
    }
    return [...byId.entries()].map(([id, name]) => ({ id, name }));
  }, [rows]);

  const [payGroupId, setPayGroupId] = useState<string>("");
  // Defaults to today. The door itself defaults to `current_date` when this is null; sending the
  // value the operator can SEE is better than relying on an invisible server default.
  const [throughDate, setThroughDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<GeneratePeriodsResult | null>(null);
  const [refusal, setRefusal] = useState<Refusal | null>(null);

  const selected = payGroupId || payGroups[0]?.id || "";

  const run = async () => {
    if (!selected) return;
    setBusy(true);
    setResult(null);
    setRefusal(null);
    try {
      const next = await generatePayPeriods(selected, throughDate || null, { mockCase });
      setResult(next);
      onGenerated();
    } catch (err: unknown) {
      // Verbatim. Four different situations; none of them is "something went wrong".
      setRefusal(
        err instanceof HrRpcError
          ? { code: err.code, userMessage: err.userMessage }
          : {
              code: "unknown_error",
              userMessage:
                err instanceof Error ? err.message : "The calendar could not be generated.",
            },
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
        <CalendarPlus className="h-4 w-4 text-muted-foreground" aria-hidden />
        Generate pay periods
      </h2>
      <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-muted-foreground">
        Builds a pay group&apos;s payroll calendar from its frequency and its first period start, up
        to the date you choose. Running it again is safe — it creates only what is missing, and it
        also fills in the employee rows for any period that was created without them.
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="min-w-[15rem]">
          <label
            htmlFor="generate-pay-group"
            className="block text-[11px] font-medium text-muted-foreground"
          >
            Pay group
          </label>
          {payGroups.length === 0 ? (
            <p className="mt-1 text-[12px] text-muted-foreground">
              No pay group is visible yet. A group appears here once it has at least one period.
            </p>
          ) : (
            <Select value={selected} onValueChange={setPayGroupId}>
              <SelectTrigger id="generate-pay-group" className="mt-1 min-h-[44px]">
                <SelectValue placeholder="Choose a pay group" />
              </SelectTrigger>
              <SelectContent>
                {payGroups.map((group) => (
                  <SelectItem key={group.id} value={group.id}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div>
          <label
            htmlFor="generate-through"
            className="block text-[11px] font-medium text-muted-foreground"
          >
            Through
          </label>
          <Input
            id="generate-through"
            type="date"
            value={throughDate}
            onChange={(e) => setThroughDate(e.target.value)}
            className="mt-1 min-h-[44px] w-[11rem]"
          />
        </div>

        <Button
          type="button"
          size="sm"
          className="min-h-[44px]"
          disabled={!selected || busy}
          onClick={() => void run()}
        >
          {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> : null}
          Generate
        </Button>
      </div>

      {refusal ? (
        <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] leading-relaxed text-destructive">
          {refusal.userMessage}
        </p>
      ) : null}

      {result ? (
        <div className="mt-3 space-y-3">
          {/* 🚨 Conflicts FIRST, and never folded into the success line. */}
          {result.conflictCount > 0 ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2.5">
              <h3 className="flex items-center gap-2 text-[12px] font-semibold text-amber-800 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4" aria-hidden />
                {result.conflictCount === 1
                  ? "1 existing period disagrees with this frequency"
                  : `${result.conflictCount} existing periods disagree with this frequency`}
              </h3>
              {result.note ? (
                <p className="mt-1 text-[12px] leading-relaxed text-amber-800 dark:text-amber-300">
                  {result.note}
                </p>
              ) : null}
              <ul className="mt-2 space-y-1.5">
                {result.conflicts.map((c) => (
                  <li
                    key={c.payPeriodId}
                    className="rounded border border-amber-500/30 bg-background/50 px-2.5 py-1.5 text-[11px]"
                  >
                    <span className="font-medium text-foreground">#{c.sequenceNumber}</span>
                    <span className="ml-2 text-muted-foreground">({c.state})</span>
                    <div className="mt-0.5 text-muted-foreground">
                      stored{" "}
                      <span className="text-foreground">
                        {formatLocalDate(c.stored.periodStartOn)} –{" "}
                        {formatLocalDate(c.stored.periodEndOn)}
                      </span>
                      {" · "}the frequency implies{" "}
                      <span className="text-foreground">
                        {formatLocalDate(c.generated.periodStartOn)} –{" "}
                        {formatLocalDate(c.generated.periodEndOn)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="rounded-md border border-border bg-muted/40 px-3 py-2.5">
            <h3 className="flex items-center gap-2 text-[12px] font-semibold text-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
              {/* The counts, in words — the whole point of not shipping a bare "Done". */}
              {result.createdCount === 0 && result.unchangedCount > 0
                ? "Nothing to create — the calendar was already complete"
                : `${result.createdCount} created, ${result.unchangedCount} already existed`}
            </h3>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
              {result.payFrequency} · anchored on{" "}
              {formatLocalDate(result.firstPeriodStartOn, { year: true })} · generated through{" "}
              {formatLocalDate(result.throughDate, { year: true })} ·{" "}
              {result.totalPeriods} periods in total.
            </p>
            {result.enrolledRows > 0 ? (
              <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                {result.enrolledRows}{" "}
                {result.enrolledRows === 1 ? "employee row" : "employee rows"} added — a period with
                no roster is a calendar, not a payroll.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
