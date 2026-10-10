"use client";

// /hr/performance — the STANDARD performance review home: the reviews I am in (mine, and the ones
// I write), and for an HR seat the employer's cycles with "New cycle". The 360 trial is a separate
// process at /hr/performance/360 and shares nothing with this.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardCheck, Plus, Target, Users } from "lucide-react";
import { Badge, Button, EmptyState } from "@ai-matrx/design-system/controls";
import { MatrxDataTable, type MatrxColumnDef, type MatrxDataTableCopyConfig } from "@ai-matrx/design-system/data-table";

import { HrPageState } from "@/features/hr/shared/HrStates";
import { useHrContext } from "@/features/hr/shared/useHrContext";
import { hrPerformance360Href, hrPerformanceCycleHref, hrPerformanceGoalsHref, hrPerformanceReviewHref } from "@/features/hr/routes";

import { useReloadOnReviewsChanged } from "./invalidation";
import { NewCycleDialog } from "./NewCycleDialog";
import { listCycles, listMyReviews, myPeerRequests, type PeerRequest } from "./service";
import { dueOn, formatDay, nextStep, periodLabel, statusLabel, statusTone } from "./status";
import type { CycleSummary, ReviewSummary } from "./types";

const SEAT_LABEL: Record<string, string> = {
  employee: "Your review",
  manager: "You write",
  hr: "HR",
  skip_level: "Skip-level",
};

function useReviewsData(organizationId: string | null) {
  const [reviews, setReviews] = useState<ReviewSummary[] | null>(null);
  const [cycles, setCycles] = useState<CycleSummary[] | null>(null);
  const [requests, setRequests] = useState<PeerRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  useReloadOnReviewsChanged(reload);

  useEffect(() => {
    let live = true;
    void (async () => {
      const mine = await listMyReviews(organizationId);
      if (!live) return;
      if (!mine.ok) {
        setError(mine.message);
        return;
      }
      setReviews(mine.data);
      // Peer requests are a separate door; a failure here must not hide the reviews, and "none" is the common answer.
      void myPeerRequests().then((p) => live && p.ok && setRequests(p.data));
      if (!organizationId) {
        setCycles(null);
        return;
      }
      const cyc = await listCycles(organizationId);
      if (!live) return;
      // not_permitted is the normal answer for a person who is not an HR seat: no cycles section, no error.
      if (cyc.ok) setCycles(cyc.data);
      else if (cyc.reason === "not_permitted") setCycles(null);
      else setError(cyc.message);
    })();
    return () => {
      live = false;
    };
  }, [organizationId, tick]);

  return { reviews, cycles, requests, error, reload };
}

export function StandardHome() {
  const hr = useHrContext();
  const org = hr.active?.organization_id ?? null;
  const orgRef = hr.orgRef;
  const { reviews, cycles, requests, error, reload } = useReviewsData(org);
  const [creating, setCreating] = useState(false);

  const reviewColumns: MatrxColumnDef<ReviewSummary>[] = [
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
    { id: "cycle", header: "Cycle", accessorFn: (r) => r.cycleName, filter: "text", width: 220 },
    {
      id: "role",
      header: "Your role",
      accessorFn: (r) => SEAT_LABEL[r.mySeat] ?? r.mySeat,
      filter: "select",
      filterOptions: Object.values(SEAT_LABEL).map((v) => ({ value: v, label: v })),
      width: 130,
    },
    {
      id: "status",
      header: "Status",
      accessorFn: (r) => statusLabel(r.status),
      filter: "text",
      width: 150,
      cell: (r) => <Badge tone={statusTone(r.status)}>{statusLabel(r.status)}</Badge>,
    },
    { id: "next", header: "Next step", accessorFn: (r) => nextStep(r), filter: "text", width: 200 },
    { id: "due", header: "Due", accessorFn: (r) => dueOn(r), filter: "date", width: 130, cell: (r) => formatDay(dueOn(r)) },
  ];

  const cycleColumns: MatrxColumnDef<CycleSummary>[] = [
    {
      id: "name",
      header: "Cycle",
      accessorFn: (c) => c.name,
      filter: "text",
      width: 260,
      frozen: true,
      cell: (c) => (
        <Link className="hover:underline" href={hrPerformanceCycleHref(c.cycleId, orgRef)}>
          {c.name}
        </Link>
      ),
    },
    { id: "status", header: "Status", accessorFn: (c) => c.status, filter: "text", width: 110, cell: (c) => <Badge tone={c.status === "open" ? "primary" : "neutral"}>{c.status}</Badge> },
    { id: "period", header: "Period", accessorFn: (c) => c.periodEnd, filter: "date", width: 240, cell: (c) => periodLabel(c.periodStart, c.periodEnd) },
    { id: "reviews", header: "Reviews", accessorFn: (c) => c.reviewCount, filter: "number", width: 100 },
    { id: "done", header: "Acknowledged", accessorFn: (c) => c.acknowledgedCount, filter: "number", width: 130 },
    { id: "out", header: "Outstanding", accessorFn: (c) => c.outstandingCount, filter: "number", width: 120 },
  ];

  const requestColumns: MatrxColumnDef<PeerRequest>[] = [
    {
      id: "employee",
      header: "Feedback on",
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
    { id: "cycle", header: "Cycle", accessorFn: (r) => r.cycleName, filter: "text", width: 220 },
    { id: "due", header: "Due", accessorFn: (r) => r.dueOn, filter: "date", width: 130, cell: (r) => formatDay(r.dueOn) },
    { id: "status", header: "Status", accessorFn: (r) => (r.responseStatus === "submitted" ? "Sent" : "To do"), filter: "text", width: 110, cell: (r) => <Badge tone={r.responseStatus === "submitted" ? "success" : "warning"}>{r.responseStatus === "submitted" ? "Sent" : "To do"}</Badge> },
  ];
  const requestCopy: MatrxDataTableCopyConfig<PeerRequest> = {
    label: "feedback request",
    listLabel: "feedback requests (this view)",
    location: "Performance",
    rowKind: "peer-feedback-request",
    listKind: "peer-feedback-request-list",
    rowDescription: "One request to give peer feedback: who it is about, the cycle and the due date.",
    listDescription: "The peer feedback requests you have received, as currently shown.",
    humanRow: (r) => [`Feedback on: ${r.employeeName}`, `Cycle: ${r.cycleName}`, `Due: ${formatDay(r.dueOn)}`].join("\n"),
  };

  const reviewCopy: MatrxDataTableCopyConfig<ReviewSummary> = {
    label: "performance review",
    listLabel: "performance reviews (this view)",
    location: "Performance",
    rowKind: "performance-review",
    listKind: "performance-review-list",
    rowDescription: "One performance review: employee, cycle, your role, status and next step.",
    listDescription: "The performance reviews you are part of, as currently shown.",
    humanRow: (r) => [`Employee: ${r.employeeName}`, `Cycle: ${r.cycleName}`, `Status: ${statusLabel(r.status)}`, `Next step: ${nextStep(r)}`].join("\n"),
  };
  const cycleCopy: MatrxDataTableCopyConfig<CycleSummary> = {
    label: "review cycle",
    listLabel: "review cycles (this view)",
    location: "Performance",
    rowKind: "review-cycle",
    listKind: "review-cycle-list",
    rowDescription: "One review cycle: period, status and how many reviews are acknowledged.",
    listDescription: "The review cycles of the selected employer, as currently shown.",
    humanRow: (c) => [`Cycle: ${c.name}`, `Status: ${c.status}`, `Reviews: ${c.reviewCount}`, `Acknowledged: ${c.acknowledgedCount}`].join("\n"),
  };

  const loading = reviews === null && error === null;

  return (
    <HrPageState loading={loading} error={error ? new Error(error) : null} onRetry={reload} operation="Performance reviews" employerScope="all" variant="table">
      <div className="h-full overflow-y-auto pt-[var(--shell-header-h)]">
        <div className="mx-3 mt-3 space-y-6">
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" icon={<Target />}>
              <Link href={hrPerformanceGoalsHref(orgRef)}>Goals</Link>
            </Button>
            <Button asChild variant="outline" icon={<Users />}>
              <Link href={hrPerformance360Href(orgRef)}>360 review (trial)</Link>
            </Button>
          </div>
          <section aria-label="My reviews">
            {reviews && reviews.length > 0 ? (
              <MatrxDataTable<ReviewSummary>
                tableId="hr/performance/my-reviews"
                data={reviews}
                columns={reviewColumns}
                getRowId={(r) => r.reviewId}
                pageSize={0}
                density="condensed"
                viewTabs={false}
                toolbar={{ title: "My reviews", searchPlaceholder: "Search reviews" }}
                detail={{ enabled: false }}
                copy={reviewCopy}
                emptyState={{ title: "No reviews yet" }}
              />
            ) : (
              <EmptyState icon={<ClipboardCheck />} title="No reviews yet" line="Reviews you are in, or write, appear here" />
            )}
          </section>

          {requests.length > 0 ? (
            <section aria-label="Feedback requested">
              <MatrxDataTable<PeerRequest>
                tableId="hr/performance/feedback-requested"
                data={requests}
                columns={requestColumns}
                getRowId={(r) => r.reviewId}
                pageSize={0}
                density="condensed"
                viewTabs={false}
                toolbar={{ title: "Feedback requested", searchPlaceholder: "Search requests" }}
                detail={{ enabled: false }}
                copy={requestCopy}
                emptyState={{ title: "No requests" }}
              />
            </section>
          ) : null}

          {org && cycles !== null ? (
            <section aria-label="Review cycles">
              {cycles.length > 0 ? (
                <MatrxDataTable<CycleSummary>
                  tableId="hr/performance/cycles"
                  data={cycles}
                  columns={cycleColumns}
                  getRowId={(c) => c.cycleId}
                  pageSize={0}
                  density="condensed"
                  viewTabs={false}
                  toolbar={{
                    title: "Cycles",
                    searchPlaceholder: "Search cycles",
                    add: { onAdd: () => setCreating(true) },
                  }}
                  detail={{ enabled: false }}
                  copy={cycleCopy}
                  emptyState={{ title: "No cycles yet" }}
                />
              ) : (
                <EmptyState
                  icon={<ClipboardCheck />}
                  title="No review cycles yet"
                  action={
                    <Button icon={<Plus />} variant="primary" onClick={() => setCreating(true)}>
                      New cycle
                    </Button>
                  }
                />
              )}
            </section>
          ) : null}
        </div>
      </div>
      {org ? <NewCycleDialog open={creating} onOpenChange={setCreating} organizationId={org} orgRef={orgRef} /> : null}
    </HrPageState>
  );
}
