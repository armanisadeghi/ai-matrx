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
// A CREATE has no such rule and must not pretend to: there is no already-cut
// workweek to protect, so the first boundary is simply chosen, and the server dates
// it from `first_period_start_on`.
//
// ── THE PREVIEW ────────────────────────────────────────────────────────────
// Six upcoming period boundaries, with the semimonthly split called out: a
// semimonthly period ends mid-workweek, so one overtime week lands across two pay
// periods. An admin should see that BEFORE saving, not after the first payroll.
// It runs in create mode too — that is the moment the choice is actually being made.
//
// ── 🚨 G2 F3: THE CREATE PATH ──────────────────────────────────────────────
// This panel used to mount `PayGroupEditor` ONLY as the `detail:` renderer of a
// `MatrxDataTable` row. With zero rows there was no path to it, so an org could
// never get its first pay group — and with no pay group there is no `hr.pay_period`,
// therefore no period lifecycle, no attestation, no approval, no export and no lock.
// One missing button held the whole G2 vertical shut.
//
// The fix is deliberately NOT a second form. `PayGroupEditor` takes
// `payGroup: HrPayGroup | null`; null is create mode, and the editor is opened by
// the header action AND by the empty state — the empty state most of all, because
// that is the moment somebody is most likely to act.

"use client";

import { useId, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarRange,
  Coins,
  Loader2,
  Plus,
  Save,
} from "lucide-react";

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

import { isHrDenied } from "../../types";
import type { HrResult } from "../../types";
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
import { upsertHrPayGroup } from "./pay-group-write";

const FREQUENCIES = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every two weeks" },
  { value: "semimonthly", label: "Twice a month (1st–15th, 16th–end)" },
  { value: "monthly", label: "Monthly" },
];

// ── The refusal, rendered where it happened ─────────────────────────────────

/**
 * 🚨 A REFUSAL IS DATA. The server names the control it rejected (`field`) and, where
 * one exists, where to go and fix it (`door`). Both are carried to the form so the
 * message lands ON the offending input instead of becoming "something went wrong".
 */
type WriteRefusal = { message: string; field: string | null; door: string | null };

function refusalOf<T>(result: HrResult<T>, fallback: string): WriteRefusal | null {
  if (result.ok) return null;
  if (isHrDenied(result)) {
    return {
      message:
        result.detail?.trim() ||
        `${fallback} (${result.reason.replace(/_/g, " ")}).`,
      field: result.field,
      door: result.door,
    };
  }
  return { message: result.message, field: null, door: null };
}

/** The one alert block, with the server's door offered when it sent one. */
function RefusalNote({ refusal }: { refusal: WriteRefusal }) {
  return (
    <div role="alert" className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
      <p className="text-sm text-destructive">{refusal.message}</p>
      {refusal.door ? (
        <Link
          href={refusal.door}
          className="inline-flex min-h-11 items-center text-sm font-medium text-foreground underline underline-offset-2 sm:min-h-0"
        >
          Go and fix it
        </Link>
      ) : null}
    </div>
  );
}

/** The message repeated at the named control — the whole point of `field`. */
function FieldRefusal({
  refusal,
  field,
}: {
  refusal: WriteRefusal | null;
  field: string;
}) {
  if (!refusal || refusal.field !== field) return null;
  return (
    <p className="text-sm text-destructive">{refusal.message}</p>
  );
}

function invalidFor(refusal: WriteRefusal | null, field: string): boolean {
  return refusal?.field === field;
}

// ── The panel ───────────────────────────────────────────────────────────────

export function HrPayGroupsPanel() {
  const { active, orgRef } = useHrContext();
  const organizationId = active?.organization_id ?? null;
  const { structure, isLoading, error, refresh } = useHrSettingsStructure(organizationId);
  const [creating, setCreating] = useState(false);

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
          <header className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <Coins className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 space-y-1">
                <h2 className="text-sm font-semibold text-foreground">Pay groups</h2>
                <p className="text-sm text-muted-foreground">
                  Open one to change its frequency, its workweek, or the calendar and
                  default earning code its timesheets use.
                </p>
              </div>
            </div>
            {/* Present whether or not rows exist — an org with forty pay groups still
                needs to add the forty-first. */}
            <Button
              type="button"
              size="sm"
              onClick={() => setCreating(true)}
              disabled={creating || !organizationId}
              className="min-h-11 w-full shrink-0 sm:min-h-9 sm:w-auto"
            >
              <Plus className="mr-2 h-4 w-4" />
              New pay group
            </Button>
          </header>

          {creating ? (
            <div className="border-b border-border bg-muted/30 p-4">
              <h3 className="px-3 text-sm font-semibold text-foreground">
                New pay group
              </h3>
              <PayGroupEditor
                payGroup={null}
                calendars={calendars}
                earningCodes={earningCodes}
                organizationId={organizationId}
                orgRef={orgRef}
                onSaved={() => {
                  setCreating(false);
                  refresh();
                }}
                onCancel={() => setCreating(false)}
              />
            </div>
          ) : null}

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
                // 🚨 The empty state carries the action itself. Explaining why the
                // thing matters and then offering nothing to click is the F3 defect.
                action: (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setCreating(true)}
                    disabled={creating || !organizationId}
                    className="min-h-11 sm:min-h-9"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    New pay group
                  </Button>
                ),
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

// ── The one editor, in two modes ────────────────────────────────────────────

/**
 * `payGroup === null` is CREATE. Everything else about the form is identical, which
 * is the point: a second create form is a thing somebody then has to keep in sync
 * with the workweek rule, and the workweek rule is the one that has legal teeth.
 */
function PayGroupEditor({
  payGroup,
  calendars,
  earningCodes,
  organizationId,
  orgRef,
  onSaved,
  onCancel,
}: {
  payGroup: HrPayGroup | null;
  calendars: HrHolidayCalendar[];
  earningCodes: HrEarningCode[];
  organizationId: string | null;
  orgRef: string | null;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const isCreate = payGroup === null;
  // Distinct ids per mounted editor: the create panel and an expanded row can be on
  // the page at the same time, and duplicate DOM ids break every `htmlFor`.
  const uid = useId();

  const [name, setName] = useState(payGroup?.name ?? "");
  const [frequency, setFrequency] = useState(payGroup?.pay_frequency ?? "biweekly");
  const [firstStart, setFirstStart] = useState(
    payGroup?.first_period_start_on ?? hrToday(),
  );
  const [workweekDow, setWorkweekDow] = useState(
    String(payGroup?.workweek_start_dow ?? 0),
  );
  const [workweekTime, setWorkweekTime] = useState(
    payGroup?.workweek_start_time ?? "00:00",
  );
  const [calendarId, setCalendarId] = useState(payGroup?.holiday_calendar_id ?? "");
  const [earningCodeId, setEarningCodeId] = useState(
    payGroup?.default_earning_code_id ?? "",
  );
  const [timesheetRequired, setTimesheetRequired] = useState(
    payGroup?.timesheet_required ?? true,
  );
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<WriteRefusal | null>(null);

  const dating = useEffectiveDating(payGroup?.workweek_effective_from);
  const { maxDaysAhead } = useHrFutureDatedLimit();

  // Only an EXISTING group can move its workweek. A create is choosing one.
  const workweekChanged =
    payGroup !== null &&
    (Number(workweekDow) !== payGroup.workweek_start_dow ||
      workweekTime !== payGroup.workweek_start_time);

  const preview = previewPeriods({
    frequency,
    firstPeriodStartOn: firstStart,
    workweekStartDow: Number(workweekDow),
  });
  const anySplit = preview.some((row) => row.splitsWorkweek);

  const save = async () => {
    if (!organizationId) return;
    if (name.trim() === "") {
      setRefusal({
        message: "A pay group needs a name.",
        field: "name",
        door: null,
      });
      return;
    }
    if (firstStart.trim() === "") {
      setRefusal({
        message:
          "A pay group needs the day its first period started. Every weekly and " +
          "every-two-weeks boundary after it is counted from that day.",
        field: "first_period_start_on",
        door: null,
      });
      return;
    }
    // 🚨 The workweek move REQUIRES a future date. A same-day or backdated move would
    // re-cut a week people have already been paid for. The server refuses it too
    // (`workweek_change_needs_future_date`); this says so before the round trip.
    if (workweekChanged && dating.value.effectiveFrom <= hrToday()) {
      setRefusal({
        message:
          "Moving the workweek start takes effect on a FUTURE date. Weeks that have " +
          "already started are counted the old way and are never re-cut — pick a date " +
          "after today.",
        field: "workweek_effective_from",
        door: null,
      });
      return;
    }

    setBusy(true);
    setRefusal(null);
    const result = await upsertHrPayGroup({
      ...(payGroup ? { id: payGroup.id } : {}),
      organization_id: organizationId,
      name: name.trim(),
      pay_frequency: frequency,
      first_period_start_on: firstStart,
      holiday_calendar_id: calendarId || null,
      default_earning_code_id: earningCodeId || null,
      timesheet_required: timesheetRequired,
      // On a create the workweek is simply chosen, and the server dates it from
      // `first_period_start_on`. On an edit it only travels when it actually moved,
      // and then only with a future effective date.
      ...(isCreate
        ? {
            workweek_start_dow: Number(workweekDow),
            workweek_start_time: workweekTime,
          }
        : workweekChanged
          ? {
              workweek_start_dow: Number(workweekDow),
              workweek_start_time: workweekTime,
              workweek_effective_from: dating.value.effectiveFrom,
            }
          : {}),
    });
    setBusy(false);

    const denial = refusalOf(result, "The server refused this pay group");
    if (denial) {
      setRefusal(denial);
      return;
    }

    toast.success(
      isCreate ? `${name.trim()} is created.` : `${name.trim()} is saved.`,
    );
    onSaved();
  };

  return (
    <div className="space-y-5 p-3">
      <div className="space-y-1.5">
        <Label htmlFor={`${uid}-name`} className="text-sm font-medium">
          Name <span className="text-destructive">*</span>
        </Label>
        <Input
          id={`${uid}-name`}
          value={name}
          disabled={busy}
          aria-invalid={invalidFor(refusal, "name")}
          onChange={(e) => setName(e.target.value)}
        />
        <FieldRefusal refusal={refusal} field="name" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${uid}-frequency`} className="text-sm font-medium">
          Frequency <span className="text-destructive">*</span>
        </Label>
        <Select value={frequency} onValueChange={setFrequency}>
          <SelectTrigger id={`${uid}-frequency`} aria-invalid={invalidFor(refusal, "pay_frequency")}>
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
        <FieldRefusal refusal={refusal} field="pay_frequency" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${uid}-first-start`} className="text-sm font-medium">
          {isCreate ? "First period starts on" : "First period started on"}{" "}
          <span className="text-destructive">*</span>
        </Label>
        <Input
          id={`${uid}-first-start`}
          type="date"
          value={firstStart}
          disabled={busy}
          aria-invalid={invalidFor(refusal, "first_period_start_on")}
          onChange={(e) => setFirstStart(e.target.value)}
        />
        <p className="text-sm text-muted-foreground">
          Every weekly and every-two-weeks period is counted from this day, so moving it
          moves every future boundary.
        </p>
        <FieldRefusal refusal={refusal} field="first_period_start_on" />
      </div>

      {/* ── The workweek — the one control with a legal consequence ─────────── */}
      <fieldset className="space-y-3 rounded-md border border-border p-3">
        <legend className="px-1 text-xs font-medium text-muted-foreground">
          Workweek
        </legend>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-dow`} className="text-sm font-medium">
              Starts on
            </Label>
            <Select value={workweekDow} onValueChange={setWorkweekDow}>
              <SelectTrigger id={`${uid}-dow`}>
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
            <Label htmlFor={`${uid}-time`} className="text-sm font-medium">
              At
            </Label>
            <Input
              id={`${uid}-time`}
              type="time"
              value={workweekTime}
              disabled={busy}
              onChange={(e) => setWorkweekTime(e.target.value)}
            />
          </div>
        </div>

        <p className="text-sm text-foreground">
          <span className="font-bold">Existing workweeks are not re-cut.</span>{" "}
          {isCreate ? (
            <>
              Overtime is computed per workweek, so this boundary decides what counts
              as overtime for everyone in this group. It applies from the first period
              start above onward, and moving it later takes effect on a future date
              only — weeks that have already started stay as they were counted.
            </>
          ) : (
            <>
              Overtime is computed per workweek, so weeks that have already started stay
              on the old boundary — including any overtime already paid on them. The new
              boundary applies from the date below onward.
            </>
          )}
        </p>

        {workweekChanged ? (
          <>
            <EffectiveDateField
              value={dating.value}
              onChange={dating.setDate}
              onModeChange={dating.setMode}
              maxDaysAhead={maxDaysAhead}
              label="New workweek starts from"
              consequenceLine={dating.consequenceLine}
              disabled={busy}
            />
            <FieldRefusal refusal={refusal} field="workweek_effective_from" />
          </>
        ) : payGroup ? (
          <p className="text-sm text-muted-foreground">
            In effect since {formatPreviewDay(payGroup.workweek_effective_from)}. Change
            the day or time above to move it — the move must take effect in the future.
          </p>
        ) : null}
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
          <Label htmlFor={`${uid}-calendar`} className="text-sm font-medium">
            Holiday calendar
          </Label>
          <Select value={calendarId} onValueChange={setCalendarId}>
            <SelectTrigger id={`${uid}-calendar`}>
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
          <Label htmlFor={`${uid}-earning`} className="text-sm font-medium">
            Default earning code
          </Label>
          <Select value={earningCodeId} onValueChange={setEarningCodeId}>
            <SelectTrigger id={`${uid}-earning`}>
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
          id={`${uid}-timesheets`}
          checked={timesheetRequired}
          disabled={busy}
          onCheckedChange={setTimesheetRequired}
        />
        <Label htmlFor={`${uid}-timesheets`} className="text-sm">
          Timesheets are required for this pay group
        </Label>
      </div>

      {refusal ? <RefusalNote refusal={refusal} /> : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={save}
          disabled={busy}
          className="min-h-11 sm:min-h-9"
        >
          {busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : isCreate ? (
            <Plus className="mr-2 h-4 w-4" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          {isCreate ? "Create pay group" : "Save"}
        </Button>
        {onCancel ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onCancel}
            disabled={busy}
            className="min-h-11 sm:min-h-9"
          >
            Cancel
          </Button>
        ) : null}
      </div>
    </div>
  );
}
