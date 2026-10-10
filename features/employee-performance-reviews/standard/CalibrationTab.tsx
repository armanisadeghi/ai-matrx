"use client";

// The cycle's "Calibration" tab (HR only): every review's ratings side by side — the means each side
// gave, the manager's overall, HR's calibrated rating — with the distribution by rating and by manager.
// HR records a calibrated rating and a note inline. There is NO answer text here, by the door's design.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button, Field, Select } from "@ai-matrx/design-system/controls";
import { MatrxDataTable, type MatrxColumnDef, type MatrxDataTableCopyConfig } from "@ai-matrx/design-system/data-table";

import { hrPerformanceReviewHref, type HrOrgRef } from "@/features/hr/routes";
import { toast } from "@/lib/toast";

import { distributionBars, managerBars, type DistributionBar } from "./calibration";
import { calibrateReview, getCalibration } from "./service";
import { ratingLabel, statusLabel } from "./status";
import type { CalibrationData, CalibrationRow } from "./types";

const NONE = "__none";
const mean = (n: number | null) => (n === null ? "-" : n.toFixed(1));

function Bars({ bars }: { bars: DistributionBar[] }) {
  return (
    <div className="space-y-1">
      {bars.map((b) => (
        <div key={b.key} className="flex items-center gap-2 text-sm">
          <span className="w-44 shrink-0 truncate">{b.label}</span>
          <div className="h-3 flex-1 overflow-hidden rounded-sm bg-muted" role="img" aria-label={`${b.label}: ${b.count}`}>
            <div className="h-full bg-primary" style={{ width: `${Math.round(b.share * 100)}%` }} />
          </div>
          <span className="w-8 text-right tabular-nums">{b.count}</span>
        </div>
      ))}
    </div>
  );
}

export function CalibrationTab({ cycleId, orgRef, open }: { cycleId: string; orgRef: HrOrgRef; open: boolean }) {
  const [data, setData] = useState<CalibrationData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, { rating: string; note: string }>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let live = true;
    void getCalibration(cycleId).then((r) => {
      if (!live) return;
      if (r.ok) {
        setData(r.data);
        setError(null);
      } else setError(r.message);
    });
    return () => {
      live = false;
    };
  }, [cycleId, tick]);

  const scale = data?.scale ?? [];
  const options = useMemo(() => [{ value: NONE, label: "Not calibrated" }, ...scale.map((p) => ({ value: p.key, label: p.label }))], [scale]);

  const save = async (row: CalibrationRow) => {
    const e = edits[row.reviewId];
    const rating = e?.rating ?? row.calibratedRating ?? NONE;
    if (rating === NONE) {
      toast.error("Choose a rating to calibrate to.");
      return;
    }
    setSaving(row.reviewId);
    const r = await calibrateReview(row.reviewId, rating, (e?.note ?? row.calibrationNote ?? "").trim() || null);
    setSaving(null);
    if (!r.ok) {
      toast.error(r.message);
      return;
    }
    toast.success("Calibrated rating saved");
    setEdits(({ [row.reviewId]: _drop, ...rest }) => rest);
    reload();
  };

  const columns: MatrxColumnDef<CalibrationRow>[] = [
    {
      id: "employee",
      header: "Employee",
      accessorFn: (r) => r.employeeName,
      filter: "text",
      width: 220,
      frozen: true,
      cell: (r) => (
        <Link className="hover:underline" href={hrPerformanceReviewHref(r.reviewId, orgRef)}>
          {r.employeeName}
        </Link>
      ),
    },
    { id: "manager", header: "Manager", accessorFn: (r) => r.managerName, filter: "text", width: 180 },
    { id: "department", header: "Department", accessorFn: (r) => r.department ?? "", filter: "text", width: 160 },
    { id: "status", header: "Status", accessorFn: (r) => statusLabel(r.status), filter: "text", width: 140 },
    { id: "self", header: "Self avg", accessorFn: (r) => r.selfOverall, filter: "number", width: 100, cell: (r) => mean(r.selfOverall) },
    { id: "mgr", header: "Manager avg", accessorFn: (r) => r.managerOverall, filter: "number", width: 120, cell: (r) => mean(r.managerOverall) },
    { id: "overall", header: "Manager overall", accessorFn: (r) => ratingLabel(scale, r.overallRating), filter: "text", width: 170 },
    {
      id: "calibrated",
      header: "Calibrated rating",
      accessorFn: (r) => ratingLabel(scale, r.calibratedRating),
      filter: "text",
      width: 200,
      cell: (r) => (
        <Select
          aria-label={`Calibrated rating for ${r.employeeName}`}
          value={edits[r.reviewId]?.rating ?? r.calibratedRating ?? NONE}
          options={options}
          onValueChange={(rating) => setEdits((m) => ({ ...m, [r.reviewId]: { rating, note: m[r.reviewId]?.note ?? r.calibrationNote ?? "" } }))}
          disabled={!open}
        />
      ),
    },
    {
      id: "note",
      header: "Note",
      accessorFn: (r) => r.calibrationNote ?? "",
      filter: "text",
      width: 260,
      cell: (r) => (
        <Field
          aria-label={`Calibration note for ${r.employeeName}`}
          placeholder="Why"
          disabled={!open}
          value={edits[r.reviewId]?.note ?? r.calibrationNote ?? ""}
          onChange={(e) => setEdits((m) => ({ ...m, [r.reviewId]: { rating: m[r.reviewId]?.rating ?? r.calibratedRating ?? NONE, note: e.target.value } }))}
        />
      ),
    },
    {
      id: "save",
      header: "",
      accessorFn: () => "",
      filter: false,
      width: 90,
      cell: (r) => (
        <Button variant="outline" disabled={!open || !edits[r.reviewId] || saving === r.reviewId} onClick={() => void save(r)}>
          Save
        </Button>
      ),
    },
  ];
  const copy: MatrxDataTableCopyConfig<CalibrationRow> = {
    label: "calibration row",
    listLabel: "calibration rows (this view)",
    location: "Performance, cycle calibration",
    rowKind: "review-calibration",
    listKind: "review-calibration-list",
    rowDescription: "One review's ratings: self and manager averages, manager overall and calibrated rating.",
    listDescription: "The calibration rows of this cycle, as currently shown.",
    humanRow: (r) => [`Employee: ${r.employeeName}`, `Manager: ${r.managerName}`, `Manager overall: ${ratingLabel(scale, r.overallRating)}`, `Calibrated: ${ratingLabel(scale, r.calibratedRating)}`].join("\n"),
  };

  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>;
  if (!data) return null;
  const teams = managerBars(data.byManager, scale);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-label="Distribution by rating" className="space-y-2 rounded-md border border-border bg-card p-3">
          <p className="text-sm font-medium">Ratings across the cycle</p>
          <Bars bars={distributionBars(data.byRating, scale)} />
        </section>
        <section aria-label="Distribution by manager" className="space-y-3 rounded-md border border-border bg-card p-3">
          <p className="text-sm font-medium">By manager</p>
          {teams.map((t) => (
            <div key={t.managerName} className="space-y-1">
              <p className="text-xs text-muted-foreground">
                {t.managerName} · {t.count}
              </p>
              <Bars bars={t.bars.filter((b) => b.count > 0)} />
            </div>
          ))}
        </section>
      </div>
      <MatrxDataTable<CalibrationRow>
        tableId="hr/performance/calibration"
        data={data.rows}
        columns={columns}
        getRowId={(r) => r.reviewId}
        pageSize={0}
        density="condensed"
        viewTabs={false}
        toolbar={{ title: "Calibration", searchPlaceholder: "Search people" }}
        detail={{ enabled: false }}
        copy={copy}
        emptyState={{ title: "No reviews to calibrate yet" }}
      />
    </div>
  );
}
