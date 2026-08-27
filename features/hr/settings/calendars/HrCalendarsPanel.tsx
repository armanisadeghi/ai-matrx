// features/hr/settings/calendars/HrCalendarsPanel.tsx
//
// ROUTE 71 — HOLIDAY CALENDARS. Calendars, the holidays on them, and the one switch
// on this page that has a legal answer.
//
// ── 🚨 `holiday_pay_counts_toward_ot` DEFAULTS TO FALSE, AND THE CONTROL SAYS WHY ──
// Under the FLSA, overtime is owed for hours WORKED over forty in a workweek. Holiday
// pay is pay for hours NOT worked, so it does not count toward that forty — 29 CFR
// §778.218. An employer may agree to count it (a contract or a CBA can be more
// generous than the floor), which is why this is a switch and not a constant. It is
// off by default because that is the law's answer, and the reason rides the control
// so nobody flips it thinking it is a preference.
//
// ── UNIQUENESS ─────────────────────────────────────────────────────────────
// (calendar, date, name) is unique. Two holidays on one day is legitimate — a federal
// holiday and a company day — but the same holiday twice is a duplicate, and the
// duplicate is what makes a day get paid twice.

"use client";

import { useState } from "react";
import { CalendarDays, CalendarPlus, CopyPlus, Flag, Loader2, Save } from "lucide-react";

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
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";

import { upsertHrStructure } from "../../service";
import { isHrDenied } from "../../types";
import { useHrContext } from "../../shared/useHrContext";
import { useHrSettingsStructure } from "../hooks/useHrSettingsStructure";
import { HrSettingsShell } from "../HrSettingsShell";
import type { HrHoliday, HrHolidayCalendar, HrJurisdiction } from "../types";
import { federalHolidays, shiftYearForward } from "./federal-holidays";

export function HrCalendarsPanel() {
  const { active } = useHrContext();
  const organizationId = active?.organization_id ?? null;
  const { structure, isLoading, error, refresh } = useHrSettingsStructure(organizationId);

  const calendars = structure?.holiday_calendars ?? [];
  const jurisdictions = structure?.jurisdictions ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected =
    calendars.find((calendar) => calendar.id === selectedId) ?? calendars[0] ?? null;

  return (
    <HrSettingsShell
      section="calendars"
      title="Holiday calendars"
      description="Which days are holidays, and how they are paid."
      loading={isLoading}
      error={error}
      operation="This employer's holiday calendars"
      onRetry={refresh}
    >
      <div className="space-y-6 p-4 sm:p-6">
        <CalendarsSection
          calendars={calendars}
          jurisdictions={jurisdictions}
          organizationId={organizationId}
          selectedId={selected?.id ?? null}
          onSelect={setSelectedId}
          onSaved={refresh}
        />
        {selected ? (
          <HolidaysSection
            calendar={selected}
            organizationId={organizationId}
            onSaved={refresh}
          />
        ) : null}
      </div>
    </HrSettingsShell>
  );
}

// ── The calendars ───────────────────────────────────────────────────────────

function CalendarsSection({
  calendars,
  jurisdictions,
  organizationId,
  selectedId,
  onSelect,
  onSaved,
}: {
  calendars: HrHolidayCalendar[];
  jurisdictions: HrJurisdiction[];
  organizationId: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSaved: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  const columns: MatrxColumnDef<HrHolidayCalendar>[] = [
    {
      id: "name",
      accessorKey: "name",
      header: "Calendar",
      cell: (row) => (
        <span className="min-w-0">
          <span className="block text-sm font-medium text-foreground">{row.name}</span>
          {row.is_default ? (
            <span className="block text-xs text-muted-foreground">Default</span>
          ) : null}
        </span>
      ),
    },
    {
      id: "holidays",
      accessorFn: (row) => row.holidays.length,
      header: "Holidays",
      cell: (row) => (
        <span className="text-sm text-foreground">{row.holidays.length}</span>
      ),
    },
    {
      id: "ot",
      accessorFn: (row) =>
        row.holiday_pay_counts_toward_ot ? "Counts toward overtime" : "Does not count",
      header: "Holiday pay and overtime",
      filter: "select",
      cell: (row) => (
        <Badge variant={row.holiday_pay_counts_toward_ot ? "default" : "secondary"}>
          {row.holiday_pay_counts_toward_ot ? "Counts" : "Does not count"}
        </Badge>
      ),
    },
  ];

  const create = async () => {
    if (!organizationId) return;
    setBusy(true);
    const result = await upsertHrStructure({
      kind: "holiday_calendar",
      payload: {
        organization_id: organizationId,
        name: "New calendar",
        is_default: calendars.length === 0,
        holiday_pay_counts_toward_ot: false,
      },
    });
    setBusy(false);
    setCreating(false);
    if (!result.ok) {
      toast.error(
        isHrDenied(result)
          ? result.detail || `Creating a calendar was refused (${result.reason}).`
          : result.message,
      );
      return;
    }
    toast.success("A new calendar is ready to name.");
    onSaved();
  };

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4">
        <div className="flex min-w-0 items-start gap-3">
          <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 space-y-1">
            <h2 className="text-sm font-semibold text-foreground">Calendars</h2>
            <p className="text-sm text-muted-foreground">
              A pay group points at one calendar. Most employers need one; several sites
              in several states usually need several.
            </p>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          disabled={busy || creating}
          onClick={create}
          className="min-h-11 sm:min-h-9"
        >
          {busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <CalendarPlus className="mr-2 h-4 w-4" />
          )}
          New calendar
        </Button>
      </header>
      <div className="p-4">
        <MatrxDataTable
          data={calendars}
          columns={columns}
          getRowId={(row) => row.id}
          pageSize={10}
          selectedId={selectedId}
          onSelectedIdChange={(id) => id && onSelect(id)}
          urlState={{ id: "hr-holiday-calendars" }}
          toolbar={{ search: true, searchPlaceholder: "Search calendars" }}
          emptyState={{
            title: "No holiday calendars yet",
            description:
              "Setup does not create one, so nothing is a holiday here until you say so. Start from the federal set on the next panel.",
          }}
          detail={{
            title: (row) => row.name,
            render: (row) => (
              <CalendarEditor
                calendar={row}
                jurisdictions={jurisdictions}
                organizationId={organizationId}
                onSaved={onSaved}
              />
            ),
          }}
        />
      </div>
    </section>
  );
}

function CalendarEditor({
  calendar,
  jurisdictions,
  organizationId,
  onSaved,
}: {
  calendar: HrHolidayCalendar;
  jurisdictions: HrJurisdiction[];
  organizationId: string | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState(calendar.name);
  const [jurisdictionId, setJurisdictionId] = useState(calendar.jurisdiction_id ?? "");
  const [isDefault, setIsDefault] = useState(calendar.is_default);
  const [countsTowardOt, setCountsTowardOt] = useState(
    calendar.holiday_pay_counts_toward_ot,
  );
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState<string | null>(null);

  const save = async () => {
    if (!organizationId) return;
    if (name.trim() === "") {
      setWhy("A calendar needs a name.");
      return;
    }
    setBusy(true);
    setWhy(null);
    const result = await upsertHrStructure({
      kind: "holiday_calendar",
      payload: {
        id: calendar.id,
        organization_id: organizationId,
        name: name.trim(),
        jurisdiction_id: jurisdictionId || null,
        is_default: isDefault,
        holiday_pay_counts_toward_ot: countsTowardOt,
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
    <div className="space-y-4 p-3">
      <div className="space-y-1.5">
        <Label htmlFor="cal-name" className="text-sm font-medium">
          Name
        </Label>
        <Input id="cal-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cal-jurisdiction" className="text-sm font-medium">
          Jurisdiction
        </Label>
        <Select value={jurisdictionId} onValueChange={setJurisdictionId}>
          <SelectTrigger id="cal-jurisdiction">
            <SelectValue placeholder="Not tied to one" />
          </SelectTrigger>
          <SelectContent>
            {jurisdictions.map((jurisdiction) => (
              <SelectItem key={jurisdiction.id} value={jurisdiction.id}>
                {jurisdiction.name} ({jurisdiction.level})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-3">
        <Switch
          id="cal-default"
          checked={isDefault}
          disabled={busy}
          onCheckedChange={setIsDefault}
        />
        <Label htmlFor="cal-default" className="text-sm">
          Use this calendar when a pay group names none
        </Label>
      </div>

      {/* 🚨 The FLSA control, with its reason on it. */}
      <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3">
        <div className="flex items-center gap-3">
          <Switch
            id="cal-ot"
            checked={countsTowardOt}
            disabled={busy}
            onCheckedChange={setCountsTowardOt}
          />
          <Label htmlFor="cal-ot" className="text-sm font-medium">
            Holiday pay counts toward overtime
          </Label>
        </div>
        <p className="text-sm text-muted-foreground">
          Off by default, because that is what the law says: overtime is owed for hours
          <span className="font-medium"> worked </span>
          over forty in a workweek, and holiday pay is pay for hours not worked —
          29 CFR §778.218. Turn it on only if a contract or a collective agreement
          commits you to counting it, which is more generous than the floor and
          therefore allowed.
        </p>
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

// ── The holidays on one calendar ────────────────────────────────────────────

function HolidaysSection({
  calendar,
  organizationId,
  onSaved,
}: {
  calendar: HrHolidayCalendar;
  organizationId: string | null;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const year = new Date().getFullYear();

  const existing = new Set(
    calendar.holidays.map((holiday) => `${holiday.observed_on}::${holiday.name}`),
  );

  const addMany = async (
    seeds: Array<{ name: string; actualOn: string; observedOn: string }>,
    label: string,
  ) => {
    if (!organizationId) return;
    // (calendar, date, name) is unique — filter the duplicates out HERE so the admin
    // sees "8 added, 3 already there" instead of a wall of unique-violation errors.
    const fresh = seeds.filter(
      (seed) => !existing.has(`${seed.observedOn}::${seed.name}`),
    );
    if (fresh.length === 0) {
      toast.info(`Every one of those ${seeds.length} holidays is already on this calendar.`);
      return;
    }
    const confirmed = await confirm({
      title: `Add ${fresh.length} ${fresh.length === 1 ? "holiday" : "holidays"}?`,
      description:
        `${label}. ${seeds.length - fresh.length} of them ${
          seeds.length - fresh.length === 1 ? "is" : "are"
        } already on this calendar and will be skipped. Each one is added unpaid and ` +
        "not attached to an earning code — set those after they land.",
      confirmLabel: `Add ${fresh.length}`,
    });
    if (!confirmed) return;

    setBusy(true);
    const results = await Promise.all(
      fresh.map((seed) =>
        upsertHrStructure({
          kind: "holiday",
          payload: {
            organization_id: organizationId,
            holiday_calendar_id: calendar.id,
            name: seed.name,
            observed_on: seed.observedOn,
            actual_on: seed.actualOn,
            is_paid: false,
          },
        }),
      ),
    );
    setBusy(false);

    const failed = results.filter((result) => !result.ok);
    if (failed.length > 0) {
      const first = failed[0];
      toast.error(
        `${failed.length} of ${fresh.length} could not be added. ` +
          (first.ok
            ? ""
            : isHrDenied(first)
              ? first.detail || first.reason
              : first.message),
      );
    } else {
      toast.success(`${fresh.length} added to ${calendar.name}.`);
    }
    onSaved();
  };

  const columns: MatrxColumnDef<HrHoliday>[] = [
    {
      id: "name",
      accessorKey: "name",
      header: "Holiday",
      cell: (row) => (
        <span className="text-sm font-medium text-foreground">{row.name}</span>
      ),
    },
    { id: "observed", accessorKey: "observed_on", header: "Observed" },
    {
      id: "actual",
      accessorKey: "actual_on",
      header: "Actual date",
      mobileHidden: true,
      cell: (row) => (
        <span className="text-sm text-muted-foreground">
          {row.actual_on && row.actual_on !== row.observed_on ? row.actual_on : "Same"}
        </span>
      ),
    },
    {
      id: "paid",
      accessorFn: (row) => (row.is_paid ? "Paid" : "Unpaid"),
      header: "Paid",
      filter: "select",
      cell: (row) => (
        <Badge variant={row.is_paid ? "default" : "secondary"}>
          {row.is_paid ? "Paid" : "Unpaid"}
        </Badge>
      ),
    },
    {
      id: "scope",
      accessorFn: (row) =>
        row.location_ids.length === 0 ? "Everywhere" : `${row.location_ids.length} locations`,
      header: "Where it applies",
      mobileHidden: true,
    },
  ];

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4">
        <div className="min-w-0 space-y-1">
          <h2 className="text-sm font-semibold text-foreground">
            Holidays on {calendar.name}
          </h2>
          <p className="text-sm text-muted-foreground">
            Both dates are kept: the date the holiday actually falls on, and the date it
            is observed when that lands on a weekend.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            className="min-h-11 sm:min-h-9"
            onClick={() =>
              addMany(
                federalHolidays(year),
                `The eleven US federal holidays for ${year}, with weekend observance applied`,
              )
            }
          >
            <Flag className="mr-2 h-4 w-4" />
            Import federal set ({year})
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || calendar.holidays.length === 0}
            className="min-h-11 sm:min-h-9"
            onClick={() =>
              addMany(
                shiftYearForward(calendar.holidays),
                "Every holiday on this calendar, moved forward one year with weekend observance recomputed",
              )
            }
          >
            <CopyPlus className="mr-2 h-4 w-4" />
            Duplicate a year forward
          </Button>
        </div>
      </header>
      <div className="p-4">
        <MatrxDataTable
          data={calendar.holidays}
          columns={columns}
          getRowId={(row) => row.id}
          pageSize={25}
          urlState={{ id: "hr-holidays" }}
          toolbar={{ search: true, searchPlaceholder: "Search holidays" }}
          emptyState={{
            title: "No holidays on this calendar",
            description:
              "Import the federal set to start, then add, remove and pay-flag them to match what this employer actually observes.",
          }}
        />
      </div>
    </section>
  );
}
