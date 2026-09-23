// features/admin/hr/jurisdiction-rules/components/JurisdictionVerificationClient.tsx
//
// /administration/hr/jurisdiction-rules/verification (SPEC-UI-IA §3.12 route
// 85b) — the JUR-SEED board and the overdue list.

"use client";

import { cloneElement, isValidElement, type ReactNode } from "react";
import AppLink from "@/components/navigation/AppLink";
import { AlertTriangle, CheckCircle2, Circle } from "lucide-react";

import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { cn } from "@/lib/utils";

import { useJurisdictionRulesAdminData } from "../useJurisdictionRulesAdminData";
import {
  CA_PTO_PAYOUT_SEED_TASK,
  type JurisdictionRuleOverdue,
  type JurSeedProgress,
} from "../types";
import { CitationLine, RuleLoadGate, RuleStatusBadge } from "./rule-chrome";

const seedProgressColumns: MatrxColumnDef<JurSeedProgress>[] = [
  {
    id: "jur_seed_task",
    accessorKey: "jur_seed_task",
    header: "Task",
    cell: (task) => (
      <span className="font-mono text-xs">{task.jur_seed_task}</span>
    ),
    width: 180,
  },
  {
    id: "rows_total",
    accessorKey: "rows_total",
    header: "Rules",
    filter: "number",
    align: "right",
    width: 76,
  },
  {
    id: "rows_active",
    accessorKey: "rows_active",
    header: "Active",
    filter: "number",
    align: "right",
    width: 76,
  },
  {
    id: "rows_advisory",
    accessorKey: "rows_advisory",
    header: "Advisory",
    filter: "number",
    align: "right",
    width: 88,
  },
  {
    id: "rows_draft",
    accessorKey: "rows_draft",
    header: "Draft",
    filter: "number",
    align: "right",
    width: 72,
  },
  {
    id: "rows_with_unverified_keys",
    accessorKey: "rows_with_unverified_keys",
    header: "Unverified keys",
    filter: "number",
    align: "right",
    cell: (task) => (
      <span
        className={cn(
          "tabular-nums",
          task.rows_with_unverified_keys > 0 &&
            "text-amber-700 dark:text-amber-400",
        )}
      >
        {task.rows_with_unverified_keys}
      </span>
    ),
    width: 128,
  },
  {
    id: "rows_overdue",
    accessorKey: "rows_overdue",
    header: "Overdue",
    filter: "number",
    align: "right",
    cell: (task) => (
      <span
        className={cn(
          "tabular-nums",
          task.rows_overdue > 0 && "font-medium text-destructive",
        )}
      >
        {task.rows_overdue}
      </span>
    ),
    width: 88,
  },
  {
    id: "next_verification_due",
    accessorKey: "next_verification_due",
    header: "Next due",
    filter: "date",
    cell: (task) => (
      <span className="text-xs text-muted-foreground">
        {task.next_verification_due ?? "—"}
      </span>
    ),
    width: 128,
  },
  {
    id: "task_complete",
    accessorKey: "task_complete",
    header: "Complete",
    filter: "boolean",
    cell: (task) =>
      task.task_complete ? (
        <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          complete
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Circle className="h-3.5 w-3.5" aria-hidden="true" />
          open
        </span>
      ),
    width: 104,
  },
];

const overdueColumns: MatrxColumnDef<JurisdictionRuleOverdue>[] = [
  {
    id: "rule_class_label",
    accessorKey: "rule_class_label",
    header: "Class",
    cell: (row) => (
      <AppLink
        href={`/administration/hr/jurisdiction-rules/${row.rule_id}`}
        className="text-primary hover:underline"
      >
        {row.rule_class_label}
      </AppLink>
    ),
    width: 180,
  },
  {
    id: "jurisdiction",
    header: "Jurisdiction",
    accessorFn: (row) =>
      `${row.jurisdiction_name ?? row.jurisdiction_key} ${row.jurisdiction_key}`,
    cell: (row) => (
      <span>
        {row.jurisdiction_name ?? row.jurisdiction_key}{" "}
        <span className="font-mono text-xs text-muted-foreground">
          {row.jurisdiction_key}
        </span>
      </span>
    ),
    width: 200,
  },
  {
    id: "status",
    accessorKey: "status",
    header: "Status",
    filter: "select",
    cell: (row) => <RuleStatusBadge status={row.status} />,
    width: 112,
  },
  {
    id: "verification_due",
    accessorKey: "verification_due",
    header: "Due",
    filter: "date",
    cell: (row) => (
      <span className="text-xs text-muted-foreground">
        {row.verification_due ?? "—"}
      </span>
    ),
    width: 112,
  },
  {
    id: "days_overdue",
    accessorKey: "days_overdue",
    header: "Days overdue",
    filter: "number",
    align: "right",
    cell: (row) => (
      <span className="font-medium tabular-nums text-destructive">
        {row.days_overdue}
      </span>
    ),
    width: 120,
  },
  {
    id: "jur_seed_task",
    accessorKey: "jur_seed_task",
    header: "Task",
    cell: (row) => (
      <span className="font-mono text-xs text-muted-foreground">
        {row.jur_seed_task ?? "—"}
      </span>
    ),
    width: 180,
  },
  {
    id: "citation",
    header: "Citation",
    accessorFn: (row) =>
      [row.citation?.authority, row.citation?.url].filter(Boolean).join(" "),
    cell: (row) => <CitationLine citation={row.citation} />,
    width: 260,
  },
];

function seedTaskRowWrapper(task: JurSeedProgress, children: ReactNode) {
  if (!isValidElement<{ className?: string; id?: string }>(children)) {
    return children;
  }
  return cloneElement(children, {
    id: task.jur_seed_task,
    className: cn(children.props.className, "scroll-mt-16"),
  });
}

export function JurisdictionVerificationClient() {
  const { load, loading, reload } = useJurisdictionRulesAdminData();

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
        <MatrxDataTable
          urlState={{ id: "jurisdiction-seed-progress", selectedRow: false }}
          data={seedProgress}
          columns={seedProgressColumns}
          getRowId={(task) => task.jur_seed_task}
          density="condensed"
          viewTabs={false}
          pageSize={25}
          zebra
          isFetching={loading}
          detail={{ enabled: false }}
          rowWrapper={seedTaskRowWrapper}
          emptyState={{ title: "No JUR-SEED tasks are recorded." }}
          toolbar={{
            title: "JUR-SEED tasks",
            search: true,
            searchPlaceholder: "Search JUR-SEED tasks…",
            refresh: { onRefresh: reload, label: "Refresh verification board" },
          }}
        />
      </section>

      <section>
        <MatrxDataTable
          urlState={{ id: "jurisdiction-overdue-rules", selectedRow: false }}
          data={overdue}
          columns={overdueColumns}
          getRowId={(row) => `${row.rule_id}-${row.rule_version ?? 0}`}
          density="condensed"
          viewTabs={false}
          pageSize={25}
          zebra
          isFetching={loading}
          detail={{ enabled: false }}
          emptyState={{ title: "Nothing is past its verification date." }}
          toolbar={{
            title: "Past their verification date",
            search: true,
            searchPlaceholder: "Search overdue rules…",
            refresh: { onRefresh: reload, label: "Refresh verification board" },
          }}
        />
      </section>
    </div>
  );
}
