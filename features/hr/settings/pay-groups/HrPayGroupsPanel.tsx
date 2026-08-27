// features/hr/settings/pay-groups/HrPayGroupsPanel.tsx
//
// ROUTE 70 — PAY GROUPS. Frequency, the period calendar, and the workweek every hour
// is counted in.
//
// ── 🚨 THE WORKWEEK RULE, AND WHY IT IS THE WHOLE PANEL ────────────────────
// FLSA overtime is computed per WORKWEEK, not per pay period. Moving a pay group's
// workweek start therefore changes what counts as overtime — so:
//
//   • Changing it REQUIRES A FUTURE `workweek_effective_from`. The control is the
//     shared `EffectiveDateField`, so this obeys §6 like every other dated change.
//   • EXISTING WORKWEEKS ARE NOT RE-CUT. Stated in bold on the panel, because the
//     obvious "fix" — a migration that back-updates `hr.workweek` — would silently
//     restate what overtime was already paid on. That is a defect, not a cleanup.
//
// ── THE PREVIEW ────────────────────────────────────────────────────────────
// Six upcoming period boundaries, with the semimonthly split called out: a
// semimonthly period ends mid-workweek, so one overtime week lands across two pay
// periods. An admin should see that BEFORE saving, not after the first payroll.

"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, CalendarRange, Coins, Loader2, Save } from "lucide-react";

import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/lib/toast";

import { upsertHrStructure } from "../../service";
import { isHrDenied } from "../../types";
import { hrSettingsHref } from "../../routes";
import {
  EffectiveDateField,
  hrToday,
  useEffectiveDating,
  useHrFutureDatedLimit,
} from "../../shared/EffectiveDatedForm";
import { useHrContext } from "../../shared/useHrContext";
import { useHrSettingsStructure } from "../hooks/useHrSettingsStructure";
import { HrSettingsShell } from "../HrSettingsShell";
import type { HrEarningCode, HrHolidayCalendar, HrPayGroup } from "../types";
import { formatPreviewDay, previewPeriods, WORKWEEK_DAYS } from "./period-preview";

const FREQUENCIES = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every two weeks" },
  { value: "semimonthly", label: "Twice a month (1st–15th, 16th–end)" },
  { value: "monthly", label: "Monthly" },
];

export function HrPayGroupsPanel() {
  const { active, orgRef } = useHrContext();
  const organizationId = active?.organization_id ?? null;
  const { structure, isLoading, error, refresh } = useHrSettingsStructure(organizationId);

  const payGroups = structure?.pay_groups ?? [];
  const calendars = structure?.holiday_calendars ?? [];
  const earningCodes = structure?.earning_codes ?? [];

  const columns: MatrxColumnDef<HrPayGroup>[] = [
    {
      id: "name",
      accessorKey: "name",
      header: "Pay group",
      cell: (row) => (
        <span className="text-sm font-medium text-foreground">{row.name}</span>
      ),
    },
    {
      id: "frequency",
      accessorFn: (row) =>
        FREQUENCIES.find((f) => f.value === row.pay_frequency)?.label ?? row.pay_frequency,
      header: "Frequency",
      filter: "select",
    },
    {
      id: "workweek",
      accessorFn: (row) => WORKWEEK_DAYS[row.workweek_start_dow] ?? String(row.workweek_start_dow),
      header: "Workweek starts",
      filter: "select",
      cell: (row) => (
        <span className="text-sm text-foreground">
          {WORKWEEK_DAYS[row.workweek_start_dow] ?? row.workweek_start_dow}{" "}
          <span className="text-muted-foreground">{row.workweek_start_time}</span>
        </span>
      ),
    },
    {
      id: "workweek_from",
      accessorKey: "workweek_effective_from",
      header: "In effect since",
      mobileHidden: true,
    },
    {
      id: "timesheets",
      accessorFn: (row) => (row.timesheet_required ? "Required" : "Not required"),
      header: "Timesheets",
      filter: "select",
    },
    {
      id: "active",
      accessorFn: (row) => (row.is_active ? "Active" : "Inactive"),
      header: "Status",
      filter: "select",
      cell: (row) => (
        <Badge variant={row.is_active ? "secondary" : "outline"}>
          {row.is_active ? "Active" : "Inactive"}
        </Badge>
      ),
    },
  ];

  return (
    <HrSettingsShell
      section="pay-groups"
      title="Pay groups"
      description="How often people are paid, and the workweek their hours are counted in."
      loading={isLoading}
      error={error}
      operation="This employer's pay groups"
      onRetry={refresh}
    >
      <div className="space-y-6 p-4 sm:p-6">
        <section className="rounded-lg border border-border bg-card">
          <header className="flex items-start gap-3 border-b border-border p-4">
            <Coins className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 space-y-1">
              <h2 className="text-sm font-semibold text-foreground">Pay groups</h2>
              <p className="text-sm text-muted-foreground">
                Open one to change its frequency, its workweek, or the calendar and
                default earning code its timesheets use.
              </p>
            </div>
          </header>
          <div className="p-4">
            <MatrxDataTable
              data={payGroups}
              columns={columns}
              getRowId={(row) => row.id}
              pageSize={25}
              urlState={{ id: "hr-pay-groups" }}
              toolbar={{ search: true, searchPlaceholder: "Search pay groups" }}
              emptyState={{
                title: "No pay groups yet",
                description:
                  "A pay group is what cuts pay periods and workweeks. Nothing can be exported to payroll until one exists.",
              }}
              detail={{
                title: (row) => row.name,
                render: (row) => (
                  <PayGroupEditor
                    payGroup={row}
                    calendars={calendars}
                    earningCodes={earningCodes}
                    organizationId={organizationId}
                    orgRef={orgRef}
                    onSaved={refresh}
                  />
                ),
              }}
            />
          </div>
        </section>
      </div>
    </HrSettingsShell>
  );
}

function PayGroupEditor({
  payGroup,
  calendars,
  earningCodes,
  organizationId,
  orgRef,
  onSaved,
}: {
  payGroup: HrPayGroup;
  calendars: HrHolidayCalendar[];
  earningCodes: HrEarningCode[];
  organizationId: string | null;
  orgRef: string | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState(payGroup.name);
  const [frequency, setFrequency] = useState(payGroup.pay_frequency);
  const [firstStart, setFirstStart] = useState(payGroup.first_period_start_on);
  const [workweekDow, setWorkweekDow] = useState(String(payGroup.workweek_start_dow));
  const [workweekTime, setWorkweekTime] = useState(payGroup.workweek_start_time);
  const [calendarId, setCalendarId] = useState(payGroup.holiday_calendar_id ?? "");
  const [earningCodeId, setEarningCodeId] = useState(
    payGroup.default_earning_code_id ?? "",
  );
  const [timesheetRequired, setTimesheetRequired] = useState(payGroup.timesheet_required);
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState<string | null>(null);

  const dating = useEffectiveDating(payGroup.workweek_effective_from);
  const { maxDaysAhead } = useHrFutureDatedLimit();

  const workweekChanged =
    Number(workweekDow) !== payGroup.workweek_start_dow ||
    workweekTime !== payGroup.workweek_start_time;

  const preview = previewPeriods({
    frequency,
    firstPeriodStartOn: firstStart,
    workweekStartDow: Number(workweekDow),
  });
  const anySplit = preview.some((row) => row.splitsWorkweek);

  const save = async () => {
    if (!organizationId) return;
    if (name.trim() === "") {
      setWhy("A pay group needs a name.");
      return;
    }
    // 🚨 The workweek move REQUIRES a future date. A same-day or backdated move would
    // re-cut a week people have already been paid for.
    if (workweekChanged && dating.value.effectiveFrom <= hrToday()) {
      setWhy(
        "Moving the workweek start takes effect on a FUTURE date. Weeks that have " +
          "already started are counted the old way and are never re-cut — pick a date " +
          "after today.",
      );
      return;
    }

    setBusy(true);
    setWhy(null);
    const result = await upsertHrStructure({
      kind: "pay_group",
      payload: {
        id: payGroup.id,
        organization_id: organizationId,
        name: name.trim(),
        pay_frequency: frequency,
        first_period_start_on: firstStart,
        holiday_calendar_id: calendarId || null,
        default_earning_code_id: earningCodeId || null,
        timesheet_required: timesheetRequired,
        ...(workweekChanged
          ? {
              workweek_start_dow: Number(workweekDow),
              workweek_start_time: workweekTime,
              workweek_effective_from: dating.value.effectiveFrom,
            }
          : {}),
      },
    });
    setBusy(false);
    if (!result.ok) {
      setWhy(
        isHrDenied(result)
          ? result.detail || `The server refused this change (${result.reason}).`
          : result.message,
      );
      return;
    }
    toast.success(`${name.trim()} is saved.`);
    onSaved();
  };

  return (
    <div className="space-y-5 p-3">
      <div className="space-y-1.5">
        <Label htmlFor="pg-name" className="text-sm font-medium">
          Name
        </Label>
        <Input id="pg-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="pg-frequency" className="text-sm font-medium">
          Frequency
        </Label>
        <Select value={frequency} onValueChange={setFrequency}>
          <SelectTrigger id="pg-frequency">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FREQUENCIES.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="pg-first-start" className="text-sm font-medium">
          First period started on
        </Label>
        <Input
          id="pg-first-start"
          type="date"
          value={firstStart}
          onChange={(e) => setFirstStart(e.target.value)}
        />
        <p className="text-sm text-muted-foreground">
          Every weekly and every-two-weeks period is counted from this day, so moving it
          moves every future boundary.
        </p>
      </div>

      {/* ── The workweek — the one control with a legal consequence ─────────── */}
      <fieldset className="space-y-3 rounded-md border border-border p-3">
        <legend className="px-1 text-xs font-medium text-muted-foreground">
          Workweek
        </legend>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="pg-dow" className="text-sm font-medium">
              Starts on
            </Label>
            <Select value={workweekDow} onValueChange={setWorkweekDow}>
              <SelectTrigger id="pg-dow">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WORKWEEK_DAYS.map((day, index) => (
                  <SelectItem key={day} value={String(index)}>
                    {day}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pg-time" className="text-sm font-medium">
              At
            </Label>
            <Input
              id="pg-time"
              type="time"
              value={workweekTime}
              onChange={(e) => setWorkweekTime(e.target.value)}
            />
          </div>
        </div>

        <p className="text-sm text-foreground">
          <span className="font-bold">
            Existing workweeks are not re-cut.
          </span>{" "}
          Overtime is computed per workweek, so weeks that have already started stay on
          the old boundary — including any overtime already paid on them. The new
          boundary applies from the date below onward.
        </p>

        {workweekChanged ? (
          <EffectiveDateField
            value={dating.value}
            onChange={dating.setDate}
            onModeChange={dating.setMode}
            maxDaysAhead={maxDaysAhead}
            label="New workweek starts from"
            consequenceLine={dating.consequenceLine}
            disabled={busy}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            In effect since {formatPreviewDay(payGroup.workweek_effective_from)}. Change
            the day or time above to move it — the move must take effect in the future.
          </p>
        )}
      </fieldset>

      {/* ── The six-period preview ──────────────────────────────────────────── */}
      <section className="space-y-2 rounded-md border border-border p-3">
        <div className="flex items-start gap-2">
          <CalendarRange className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <h3 className="text-sm font-medium text-foreground">The next six periods</h3>
            <p className="text-sm text-muted-foreground">
              What this frequency and start date actually produce.
            </p>
          </div>
        </div>
        <ul className="space-y-1">
          {preview.map((row) => (
            <li
              key={row.index}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-1.5 text-sm last:border-b-0"
            >
              <span className="text-foreground">
                {formatPreviewDay(row.startOn)} – {formatPreviewDay(row.endOn)}
              </span>
              {row.splitsWorkweek ? (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Starts mid-workweek
                </span>
              ) : null}
            </li>
          ))}
        </ul>
        {anySplit ? (
          <p className="text-sm text-muted-foreground">
            At least one of these periods begins part-way through a workweek. Overtime
            is computed per workweek, so that week&apos;s overtime is split across two
            pay periods — normal for a twice-a-month or monthly schedule, and worth
            knowing before the first payroll rather than after it.
          </p>
        ) : null}
      </section>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="pg-calendar" className="text-sm font-medium">
            Holiday calendar
          </Label>
          <Select value={calendarId} onValueChange={setCalendarId}>
            <SelectTrigger id="pg-calendar">
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              {calendars.map((calendar) => (
                <SelectItem key={calendar.id} value={calendar.id}>
                  {calendar.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {calendars.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No calendars exist yet —{" "}
              <Link
                href={hrSettingsHref("calendars", { org: orgRef })}
                className="underline underline-offset-2"
              >
                create one
              </Link>
              .
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pg-earning" className="text-sm font-medium">
            Default earning code
          </Label>
          <Select value={earningCodeId} onValueChange={setEarningCodeId}>
            <SelectTrigger id="pg-earning">
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              {earningCodes
                .filter((code) => code.is_active)
                .map((code) => (
                  <SelectItem key={code.id} value={code.id}>
                    {code.code} — {code.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          {earningCodes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No earning codes exist yet —{" "}
              <Link
                href={hrSettingsHref("codes", { org: orgRef })}
                className="underline underline-offset-2"
              >
                create some
              </Link>
              . Timesheets have nothing to write against until they do.
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Switch
          id="pg-timesheets"
          checked={timesheetRequired}
          disabled={busy}
          onCheckedChange={setTimesheetRequired}
        />
        <Label htmlFor="pg-timesheets" className="text-sm">
          Timesheets are required for this pay group
        </Label>
      </div>

      {why ? (
        <p role="alert" className="text-sm text-destructive">
          {why}
        </p>
      ) : null}

      <Button
        type="button"
        size="sm"
        onClick={save}
        disabled={busy}
        className="min-h-11 sm:min-h-9"
      >
        {busy ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Save className="mr-2 h-4 w-4" />
        )}
        Save
      </Button>
    </div>
  );
}
