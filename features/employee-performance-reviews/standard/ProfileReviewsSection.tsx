"use client";

// The employee's HR profile, "Performance" tab: every standard review of this employment, newest
// first, each opening its review page. The door decides what this viewer sees (the employee sees
// only reviews shared with them; a manager or HR sees the rest) — this component adds no filter.

import { useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { Badge, EmptyState } from "@ai-matrx/design-system/controls";

import { hrPerformanceReviewHref, type HrOrgRef } from "@/features/hr/routes";
import { HrLoading } from "@/features/hr/shared/HrStates";

import { GoalsView } from "./GoalsView";
import { reviewHistory } from "./service";
import { formatDay, periodLabel, statusLabel, statusTone } from "./status";
import type { HistoryRow } from "./types";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
export function ProfileReviewsSection({ employmentId, org }: { employmentId: string | null; org: HrOrgRef }) {
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!employmentId) return;
    let live = true;
    void reviewHistory(employmentId).then((r) => {
      if (!live) return;
      if (r.ok) setRows(r.data);
      else setError(r.message);
    });
    return () => {
      live = false;
    };
  }, [employmentId]);

  return (
    <section aria-label="Performance reviews" className="space-y-3 p-3 sm:p-4">
      <h3 className="text-sm font-semibold text-foreground">Performance reviews</h3>
      {!employmentId ? (
        <EmptyState icon={<ClipboardCheck />} title="No reviews to show" />
      ) : error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        <ErrorAlchemyMenu error={error} /></p>
      ) : rows === null ? (
        <HrLoading variant="cards" rows={2} />
      ) : rows.length === 0 ? (
        <EmptyState icon={<ClipboardCheck />} title="No reviews yet" />
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border bg-card">
          {rows.map((r) => (
            <li key={r.reviewId}>
              <Link className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5 text-sm hover:bg-muted" href={hrPerformanceReviewHref(r.reviewId, org)}>
                <span className="font-medium">{r.cycleName}</span>
                <span className="text-muted-foreground">{periodLabel(r.periodStart, r.periodEnd)}</span>
                <span className="text-muted-foreground">Manager {r.managerName}</span>
                <Badge tone={statusTone(r.status)}>{statusLabel(r.status)}</Badge>
                {r.acknowledgedAt ? <span className="text-muted-foreground">Acknowledged {formatDay(r.acknowledgedAt)}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {employmentId ? <GoalsView employmentId={employmentId} title="Goals" /> : null}
    </section>
  );
}
