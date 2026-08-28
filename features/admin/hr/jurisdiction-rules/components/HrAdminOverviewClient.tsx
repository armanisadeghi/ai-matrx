// features/admin/hr/jurisdiction-rules/components/HrAdminOverviewClient.tsx
//
// /administration/hr — the section home. Counts by status, the overdue board's
// size in red, the pending-verification population, and doors into the library
// and the JUR-SEED verification board.

"use client";

import Link from "next/link";
import { AlertTriangle, ClipboardCheck, Scale } from "lucide-react";

import { cn } from "@/lib/utils";

import { useJurisdictionRulesAdminData } from "../useJurisdictionRulesAdminData";
import { CA_PTO_PAYOUT_SEED_TASK } from "../types";
import { RuleLoadGate } from "./rule-chrome";

function Stat({
  label,
  value,
  tone = "default",
  hint,
}: {
  label: string;
  value: number | string;
  tone?: "default" | "danger" | "warning" | "good";
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <div
        className={cn(
          "text-2xl font-semibold tabular-nums",
          tone === "danger" && "text-destructive",
          tone === "warning" && "text-amber-700 dark:text-amber-400",
          tone === "good" && "text-emerald-700 dark:text-emerald-400",
        )}
      >
        {value}
      </div>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      {hint ? (
        <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>
      ) : null}
    </div>
  );
}

export function HrAdminOverviewClient() {
  const { load, loading } = useJurisdictionRulesAdminData();

  const gate = <RuleLoadGate load={load} loading={loading} loadingLabel="Loading the rule library…" />;
  if (!load || load.state !== "ok") return gate;

  const { rules, classes, seedProgress, overdue } = load.data;
  const byStatus = (status: string) =>
    rules.filter((rule) => rule.status === status).length;
  const pendingVerification = rules.filter(
    (rule) => rule.unverified_keys.length > 0,
  );
  const moneyPending = pendingVerification.filter(
    (rule) => rule.produces_money,
  ).length;
  const caTask = seedProgress.find(
    (task) => task.jur_seed_task === CA_PTO_PAYOUT_SEED_TASK,
  );

  return (
    <div className="space-y-4 p-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Active" value={byStatus("active")} tone="good" hint="binding in calculations" />
        <Stat label="Advisory" value={byStatus("advisory")} tone="warning" hint="flags only, never binding" />
        <Stat label="Draft" value={byStatus("draft")} hint="never resolves" />
        <Stat label="Superseded" value={byStatus("superseded")} />
        <Stat
          label="Overdue verification"
          value={overdue.length}
          tone={overdue.length > 0 ? "danger" : "good"}
        />
        <Stat
          label="Pending verification"
          value={pendingVerification.length}
          tone={pendingVerification.length > 0 ? "warning" : "good"}
          hint={`${moneyPending} produce money`}
        />
      </div>

      {overdue.length > 0 ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
          <div className="flex items-center gap-2 font-medium text-destructive">
            <AlertTriangle className="h-4 w-4" />
            {overdue.length} rule{overdue.length === 1 ? "" : "s"} past their
            verification date
          </div>
          <p className="mt-0.5 text-muted-foreground">
            Verification dates are the promise that a cited rule still says what
            we recorded. The oldest is {Math.max(...overdue.map((row) => row.days_overdue))} days
            past due —{" "}
            <Link
              href="/administration/hr/jurisdiction-rules/verification"
              className="text-primary hover:underline"
            >
              open the verification board
            </Link>
            .
          </p>
        </div>
      ) : null}

      {caTask && !caTask.task_complete ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          <div className="flex items-center gap-2 font-medium text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4" />
            California PTO payout amounts are withheld pending verification
          </div>
          <p className="mt-0.5 text-muted-foreground">
            {CA_PTO_PAYOUT_SEED_TASK} (the CA <code>pto-payout</code>{" "}
            <code>excludes</code> key) is not complete, so payout amounts are
            flagged rather than paid on.
          </p>
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        <Link
          href="/administration/hr/jurisdiction-rules"
          className="group rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/50"
        >
          <div className="flex items-center gap-2 text-sm font-medium">
            <Scale className="h-4 w-4 text-primary" />
            Jurisdiction rules
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {rules.length} rules across {classes.length} classes. Filter by
            class, jurisdiction and status; open a rule to review its citation
            and promote or demote it.
          </p>
        </Link>
        <Link
          href="/administration/hr/jurisdiction-rules/verification"
          className="group rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/50"
        >
          <div className="flex items-center gap-2 text-sm font-medium">
            <ClipboardCheck className="h-4 w-4 text-primary" />
            Verification
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {seedProgress.length} JUR-SEED tasks,{" "}
            {seedProgress.filter((task) => task.task_complete).length} complete.
            Plus every rule past its verification date.
          </p>
        </Link>
      </div>
    </div>
  );
}
