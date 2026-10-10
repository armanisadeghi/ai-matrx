"use client";

// /hr/performance/cycles/[cycleId] — one review cycle: its dates, who is in it and who is still
// outstanding, adding people (a manager's team, a department, or named people) with every refusal
// shown by name, and closing the cycle.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardCheck, Lock, Plus, X } from "lucide-react";
import { Badge, Button, EmptyState, SegmentedControl, Select } from "@ai-matrx/design-system/controls";
import { MatrxDataTable, type MatrxColumnDef, type MatrxDataTableCopyConfig } from "@ai-matrx/design-system/data-table";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { hrPerformanceReviewHref } from "@/features/hr/routes";
import { EmploymentPicker } from "@/features/hr/people/relations/components/EmploymentPicker";
import { activeStructure, useHrStructure } from "@/features/hr/people/shared/useHrStructure";
import { HrPageState } from "@/features/hr/shared/HrStates";
import { useHrContext } from "@/features/hr/shared/useHrContext";
import { toast } from "@/lib/toast";

import { launchRefusalMessage } from "./messages";
import { closeCycle, getCycle, launchCycle, type LaunchPopulation } from "./service";
import { OUTSTANDING_LABEL, formatDay, periodLabel, statusLabel, statusTone } from "./status";
import type { CycleDetail, CycleReviewRow, LaunchRefused } from "./types";

const NONE = "__none";
type Mode = "manager" | "department" | "people";

export function CyclePage({ cycleId }: { cycleId: string }) {
  const hr = useHrContext();
  const orgRef = hr.orgRef;
  const [cycle, setCycle] = useState<CycleDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [refused, setRefused] = useState<LaunchRefused[]>([]);
  const [closing, setClosing] = useState(false);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let live = true;
    void getCycle(cycleId).then((r) => {
      if (!live) return;
      if (r.ok) {
        setCycle(r.data);
        setError(null);
      } else setError(r.message);
    });
    return () => {
      live = false;
    };
  }, [cycleId, tick]);

  const onClose = async () => {
    const r = await closeCycle(cycleId);
    setClosing(false);
    if (!r.ok) toast.error(r.message);
    else {
      toast.success("Cycle closed");
      reload();
    }
  };

  const columns: MatrxColumnDef<CycleReviewRow>[] = [
    {
      id: "employee",
      header: "Employee",
      accessorFn: (r) => r.employeeName,
      filter: "text",
      width: 240,
      frozen: true,
      cell: (r) => (
        <Link className="hover:underline" href={hrPerformanceReviewHref(r.reviewId, orgRef)}>
          {r.employeeName}
        </Link>
      ),
    },
    { id: "manager", header: "Manager", accessorFn: (r) => r.managerName, filter: "text", width: 200 },
    { id: "status", header: "Status", accessorFn: (r) => statusLabel(r.status), filter: "text", width: 150, cell: (r) => <Badge tone={statusTone(r.status)}>{statusLabel(r.status)}</Badge> },
    {
      id: "outstanding",
      header: "Waiting on",
      accessorFn: (r) => r.outstanding.map((o) => OUTSTANDING_LABEL[o]).join(", "),
      filter: "text",
      width: 320,
      cell: (r) => (r.outstanding.length === 0 ? "Nothing" : r.outstanding.map((o) => OUTSTANDING_LABEL[o]).join(", ")),
    },
  ];
  const copy: MatrxDataTableCopyConfig<CycleReviewRow> = {
    label: "cycle review",
    listLabel: "reviews in this cycle (this view)",
    location: "Performance — cycle",
    rowKind: "cycle-review",
    listKind: "cycle-review-list",
    rowDescription: "One review in the cycle: employee, manager, status and who it is waiting on.",
    listDescription: "The reviews in this cycle, as currently shown.",
    humanRow: (r) => [`Employee: ${r.employeeName}`, `Manager: ${r.managerName}`, `Status: ${statusLabel(r.status)}`, `Waiting on: ${r.outstanding.map((o) => OUTSTANDING_LABEL[o]).join(", ") || "Nothing"}`].join("\n"),
  };

  const c = cycle?.cycle;
  const closed = c?.status === "closed";

  return (
    <HrPageState loading={cycle === null && error === null} error={error ? new Error(error) : null} onRetry={reload} operation="This review cycle" variant="panel">
      {c && cycle ? (
        <div className="h-full overflow-y-auto pt-[var(--shell-header-h)]">
          <div className="m-3 space-y-4">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <Badge tone={closed ? "neutral" : "primary"}>{c.status}</Badge>
              <span>
                <span className="text-muted-foreground">Period </span>
                {periodLabel(c.periodStart, c.periodEnd)}
              </span>
              <span>
                <span className="text-muted-foreground">Self due </span>
                {formatDay(c.selfDueOn)}
              </span>
              <span>
                <span className="text-muted-foreground">Manager due </span>
                {formatDay(c.managerDueOn)}
              </span>
              <span>
                <span className="text-muted-foreground">Share by </span>
                {formatDay(c.shareDueOn)}
              </span>
              <span>
                <span className="text-muted-foreground">Acknowledged </span>
                {c.acknowledgedCount} of {cycle.total}
              </span>
              {!closed ? (
                <Button className="ml-auto" icon={<Lock />} variant="outline" onClick={() => setClosing(true)}>
                  Close cycle
                </Button>
              ) : null}
            </div>

            {!closed && c.organizationId ? (
              <LaunchPanel
                cycleId={cycleId}
                organizationId={c.organizationId}
                onLaunched={(refusals) => {
                  setRefused(refusals);
                  reload();
                }}
              />
            ) : null}

            {refused.length > 0 ? (
              <div role="alert" className="space-y-1 rounded-md border border-border bg-card p-3 text-sm">
                <p className="font-medium">Not added</p>
                <ul className="list-disc pl-5">
                  {refused.map((r) => (
                    <li key={`${r.employmentId}-${r.reason}`}>{launchRefusalMessage(r.employeeName, r.reason)}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {cycle.reviews.length > 0 ? (
              <MatrxDataTable<CycleReviewRow>
                tableId="hr/performance/cycle-reviews"
                data={cycle.reviews}
                columns={columns}
                getRowId={(r) => r.reviewId}
                pageSize={0}
                density="condensed"
                viewTabs={false}
                toolbar={{ title: "Reviews", searchPlaceholder: "Search people" }}
                detail={{ enabled: false }}
                copy={copy}
                emptyState={{ title: "Nobody is in this cycle yet" }}
              />
            ) : (
              <EmptyState icon={<ClipboardCheck />} title="Nobody is in this cycle yet" line="Add people above to start their reviews" />
            )}
          </div>
          <ConfirmDialog
            open={closing}
            onOpenChange={setClosing}
            title={`Close ${c.name}?`}
            description={`${cycle.reviews.filter((r) => r.outstanding.length > 0).length} reviews still have open steps. Closing locks every review in this cycle: nobody can save, submit, share, acknowledge or reopen afterwards.`}
            confirmLabel="Close cycle"
            variant="destructive"
            onConfirm={() => void onClose()}
          />
        </div>
      ) : null}
    </HrPageState>
  );
}

function LaunchPanel({ cycleId, organizationId, onLaunched }: { cycleId: string; organizationId: string; onLaunched: (refused: LaunchRefused[]) => void }) {
  const [mode, setMode] = useState<Mode>("manager");
  const [manager, setManager] = useState<string | null>(null);
  const [department, setDepartment] = useState(NONE);
  const [people, setPeople] = useState<Array<{ employmentId: string; name: string }>>([]);
  const [pickerKey, setPickerKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const structure = useHrStructure(organizationId).data;
  const departments = activeStructure(structure).departments;

  const population = (): LaunchPopulation | null => {
    if (mode === "manager") return manager ? { kind: "manager", managerEmploymentId: manager } : null;
    if (mode === "department") return department !== NONE ? { kind: "department", departmentId: department } : null;
    return people.length > 0 ? { kind: "people", employmentIds: people.map((p) => p.employmentId) } : null;
  };
  const chosen = population();

  const launch = async () => {
    if (!chosen || busy) return;
    setBusy(true);
    const r = await launchCycle(cycleId, chosen);
    setBusy(false);
    if (!r.ok) {
      toast.error(r.message);
      return;
    }
    const n = r.data.created.length;
    if (n > 0) toast.success(n === 1 ? "1 review started" : `${n} reviews started`);
    setManager(null);
    setPeople([]);
    setPickerKey((k) => k + 1);
    onLaunched(r.data.refused);
  };

  return (
    <div className="space-y-3 rounded-md border border-border bg-card p-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium">Add people</span>
        <SegmentedControl<Mode>
          aria-label="Who to add"
          value={mode}
          onValueChange={setMode}
          options={[
            { value: "manager", label: "A manager's team" },
            { value: "department", label: "A department" },
            { value: "people", label: "Named people" },
          ]}
        />
      </div>
      <div className="max-w-md space-y-2">
        {mode === "manager" ? (
          <EmploymentPicker key={`m-${pickerKey}`} value={manager} onChange={setManager} placeholder="Search for the manager" />
        ) : null}
        {mode === "department" ? (
          <Select
            aria-label="Department"
            value={department}
            onValueChange={setDepartment}
            options={[{ value: NONE, label: "Pick a department" }, ...departments.map((d) => ({ value: d.id, label: d.name }))]}
          />
        ) : null}
        {mode === "people" ? (
          <>
            <EmploymentPicker
              key={`p-${pickerKey}`}
              value={null}
              onChange={() => undefined}
              onChosen={(p) => {
                setPeople((list) => (list.some((x) => x.employmentId === p.employmentId) ? list : [...list, p]));
                setPickerKey((k) => k + 1);
              }}
              placeholder="Search by name or employee number"
            />
            {people.length > 0 ? (
              <ul className="flex flex-wrap gap-2">
                {people.map((p) => (
                  <li key={p.employmentId} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-sm">
                    {p.name}
                    <Button icon={<X />} variant="quiet" aria-label={`Remove ${p.name}`} onClick={() => setPeople((l) => l.filter((x) => x.employmentId !== p.employmentId))} />
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
      </div>
      <Button icon={<Plus />} variant="primary" disabled={!chosen || busy} onClick={() => void launch()}>
        Start reviews
      </Button>
    </div>
  );
}
