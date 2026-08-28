// features/admin/hr/jurisdiction-rules/components/JurisdictionVerificationClient.tsx
//
// /administration/hr/jurisdiction-rules/verification (SPEC-UI-IA §3.12 route
// 85b) — the JUR-SEED board and the overdue list.
//
// A verification date is a promise that a cited rule still says what we
// recorded. Overdue days are rendered in red because an expired promise on a
// binding rule is the same class of problem as a wrong number.

"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, Circle } from "lucide-react";

import { cn } from "@/lib/utils";

import { useJurisdictionRulesAdminData } from "../useJurisdictionRulesAdminData";
import { CA_PTO_PAYOUT_SEED_TASK } from "../types";
import { CitationLine, RuleLoadGate, RuleStatusBadge } from "./rule-chrome";

export function JurisdictionVerificationClient() {
  const { load, loading } = useJurisdictionRulesAdminData();

  const gate = (
    <RuleLoadGate
      load={load}
      loading={loading}
      loadingLabel="Loading the verification board…"
    />
  );
  if (!load || load.state !== "ok") return gate;

  const { seedProgress, overdue } = load.data;
  const caTask = seedProgress.find(
    (task) => task.jur_seed_task === CA_PTO_PAYOUT_SEED_TASK,
  );

  return (
    <div className="space-y-3 p-3">
      {caTask && !caTask.task_complete ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4" />
            {CA_PTO_PAYOUT_SEED_TASK} incomplete — California PTO payout amounts
            are withheld
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            The California <code>pto-payout</code> rule&rsquo;s{" "}
            <code>excludes</code> key is still unverified. Until this task is
            complete, PTO payout amounts for California are flagged pending
            verification rather than presented as owed. {caTask.rows_total} rule
            {caTask.rows_total === 1 ? " sits" : "s sit"} under this task,{" "}
            {caTask.rows_with_unverified_keys} with unverified keys.
          </p>
        </div>
      ) : null}

      <section>
        <h2 className="px-1 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          JUR-SEED tasks ({seedProgress.length})
        </h2>
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-1.5 font-medium">Task</th>
                <th className="px-3 py-1.5 font-medium">Rules</th>
                <th className="px-3 py-1.5 font-medium">Active</th>
                <th className="px-3 py-1.5 font-medium">Advisory</th>
                <th className="px-3 py-1.5 font-medium">Draft</th>
                <th className="px-3 py-1.5 font-medium">Unverified keys</th>
                <th className="px-3 py-1.5 font-medium">Overdue</th>
                <th className="px-3 py-1.5 font-medium">Next due</th>
                <th className="px-3 py-1.5 font-medium">Complete</th>
              </tr>
            </thead>
            <tbody>
              {seedProgress.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-3 py-4 text-sm text-muted-foreground"
                  >
                    No JUR-SEED tasks are recorded.
                  </td>
                </tr>
              ) : (
                seedProgress.map((task) => (
                  <tr
                    key={task.jur_seed_task}
                    id={task.jur_seed_task}
                    className="border-b border-border/60 scroll-mt-16"
                  >
                    <td className="px-3 py-1.5 font-mono text-xs">
                      {task.jur_seed_task}
                    </td>
                    <td className="px-3 py-1.5 tabular-nums">
                      {task.rows_total}
                    </td>
                    <td className="px-3 py-1.5 tabular-nums">
                      {task.rows_active}
                    </td>
                    <td className="px-3 py-1.5 tabular-nums">
                      {task.rows_advisory}
                    </td>
                    <td className="px-3 py-1.5 tabular-nums">
                      {task.rows_draft}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-1.5 tabular-nums",
                        task.rows_with_unverified_keys > 0 &&
                          "text-amber-700 dark:text-amber-400",
                      )}
                    >
                      {task.rows_with_unverified_keys}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-1.5 tabular-nums",
                        task.rows_overdue > 0 && "font-medium text-destructive",
                      )}
                    >
                      {task.rows_overdue}
                    </td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground">
                      {task.next_verification_due ?? "—"}
                    </td>
                    <td className="px-3 py-1.5">
                      {task.task_complete ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          complete
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Circle className="h-3.5 w-3.5" />
                          open
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="px-1 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Past their verification date ({overdue.length})
        </h2>
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-1.5 font-medium">Class</th>
                <th className="px-3 py-1.5 font-medium">Jurisdiction</th>
                <th className="px-3 py-1.5 font-medium">Status</th>
                <th className="px-3 py-1.5 font-medium">Due</th>
                <th className="px-3 py-1.5 font-medium">Days overdue</th>
                <th className="px-3 py-1.5 font-medium">Task</th>
                <th className="px-3 py-1.5 font-medium">Citation</th>
              </tr>
            </thead>
            <tbody>
              {overdue.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-4 text-sm text-muted-foreground"
                  >
                    Nothing is past its verification date.
                  </td>
                </tr>
              ) : (
                overdue.map((row) => (
                  <tr
                    key={`${row.rule_id}-${row.rule_version ?? 0}`}
                    className="border-b border-border/60"
                  >
                    <td className="px-3 py-1.5">
                      <Link
                        href={`/administration/hr/jurisdiction-rules/${row.rule_id}`}
                        className="text-primary hover:underline"
                      >
                        {row.rule_class_label}
                      </Link>
                    </td>
                    <td className="px-3 py-1.5">
                      {row.jurisdiction_name ?? row.jurisdiction_key}{" "}
                      <span className="font-mono text-xs text-muted-foreground">
                        {row.jurisdiction_key}
                      </span>
                    </td>
                    <td className="px-3 py-1.5">
                      <RuleStatusBadge status={row.status} />
                    </td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground">
                      {row.verification_due ?? "—"}
                    </td>
                    <td className="px-3 py-1.5 font-medium tabular-nums text-destructive">
                      {row.days_overdue}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">
                      {row.jur_seed_task ?? "—"}
                    </td>
                    <td className="px-3 py-1.5 text-xs">
                      <CitationLine citation={row.citation} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
