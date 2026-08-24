"use client";

/**
 * Schedules — authored here, at the tier you are standing on, and resolved by
 * the cascade site > organization > system.
 *
 * 🚨 NOTHING RUNS AUTOMATICALLY YET. This panel is STORAGE ONLY: v1 of the run
 * console is manual by Arman's explicit ruling, and no dispatcher exists. The
 * banner says exactly that, in those words, because a schedule UI that implies
 * a schedule runs is a lie the operator would only discover by nothing
 * happening. (Platform law: no unapproved schedules — creating a scheduler task
 * is NOT part of this feature.)
 *
 * Arman's cascade, verbatim: "what I put applies only to companies that don't
 * have their own schedule in. Organizations that have their own schedule, all
 * of their brands will abide by their schedule, not mine. The same goes for an
 * individual brand."
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Info, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/lib/toast";
import { cn } from "@/styles/themes/utils";
import { extractErrorMessage } from "@/utils/errors";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import type { ConsoleEngine } from "./engines";
import {
  resolveScheduleForSite,
  retireEngineSchedule,
  saveEngineSchedule,
  type ScheduleDraft,
} from "./data";
import { SYSTEM_ORGANIZATION_ID } from "@/constants/platform-orgs";
import type {
  ConsoleSiteRow,
  EngineScheduleRow,
  RunConsoleScope,
} from "./types";

/** The one sentence this panel must never soften. */
export const NO_DISPATCHER_NOTICE =
  "Nothing runs automatically yet — schedules take effect when the dispatcher ships.";

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function tierLabel(tier: string): string {
  if (tier === "site") return "Brand";
  if (tier === "organization") return "Organization";
  return "System default";
}

function describe(row: EngineScheduleRow): string {
  const when =
    row.cadence === "hourly"
      ? "Every hour"
      : row.cadence === "weekly"
        ? `Every ${DAY_NAMES[row.day_of_week ?? 0]} at ${row.run_at_utc ?? "00:00"} UTC`
        : `Daily at ${row.run_at_utc ?? "00:00"} UTC`;
  return `${when} · up to ${row.max_keywords_per_run} keywords per run · ${row.sites_per_run} brand${row.sites_per_run === 1 ? "" : "s"} per run`;
}

/**
 * The schedule this mount authors. A console at the system tier writes the
 * system row; an organization console writes its organization's row; a brand
 * console writes its own. You never author somebody else's tier — that is what
 * the permission difference IS.
 */
function ownRowFor(
  scope: RunConsoleScope,
  schedules: readonly EngineScheduleRow[],
): EngineScheduleRow | null {
  if (scope.tier === "system") {
    return schedules.find((row) => row.scope_tier === "system") ?? null;
  }
  if (scope.tier === "organization") {
    return (
      schedules.find(
        (row) =>
          row.scope_tier === "organization" &&
          row.scope_organization_id === scope.organizationId,
      ) ?? null
    );
  }
  return (
    schedules.find(
      (row) => row.scope_tier === "site" && row.site_id === scope.siteId,
    ) ?? null
  );
}

export function ScheduleCascadePanel({
  engine,
  scope,
  sites,
  schedules,
  capCeiling,
}: {
  engine: ConsoleEngine;
  scope: RunConsoleScope;
  sites: readonly ConsoleSiteRow[];
  schedules: readonly EngineScheduleRow[];
  /** The knob's live ceiling on keywords per pass. */
  capCeiling: number;
}) {
  const queryClient = useQueryClient();
  const own = ownRowFor(scope, schedules);

  const [cadence, setCadence] = useState<string>(own?.cadence ?? "daily");
  const [runAt, setRunAt] = useState<string>(
    (own?.run_at_utc ?? "04:50").slice(0, 5),
  );
  const [dayOfWeek, setDayOfWeek] = useState<number>(own?.day_of_week ?? 1);
  const [maxKeywords, setMaxKeywords] = useState<number>(
    own?.max_keywords_per_run ?? capCeiling,
  );
  const [sitesPerRun, setSitesPerRun] = useState<number>(
    own?.sites_per_run ?? 3,
  );
  const [enabled, setEnabled] = useState<boolean>(own?.enabled ?? false);
  const [notes, setNotes] = useState<string>(own?.notes ?? "");

  const invalidate = () =>
    void queryClient.invalidateQueries({
      queryKey: ["seo", "run-console", "schedules", engine.slug],
    });

  const save = useMutation({
    mutationFn: async () => {
      const draft: ScheduleDraft = {
        engineSlug: engine.slug,
        tier: scope.tier,
        scopeOrganizationId:
          scope.tier === "organization" ? scope.organizationId : null,
        siteId: scope.tier === "site" ? scope.siteId : null,
        cadence,
        runAtUtc: cadence === "hourly" ? null : `${runAt}:00`,
        dayOfWeek: cadence === "weekly" ? dayOfWeek : null,
        maxKeywordsPerRun: Math.min(Math.max(maxKeywords, 1), capCeiling),
        sitesPerRun: Math.max(sitesPerRun, 1),
        enabled,
        notes: notes.trim() ? notes.trim() : null,
        organizationId:
          scope.tier === "system"
            ? SYSTEM_ORGANIZATION_ID
            : scope.tier === "organization"
              ? scope.organizationId
              : (sites.find((site) => site.id === scope.siteId)
                  ?.organization_id ?? SYSTEM_ORGANIZATION_ID),
      };
      return saveEngineSchedule(draft, own?.id ?? null);
    },
    onSuccess: () => {
      invalidate();
      toast.success("Schedule saved", { description: NO_DISPATCHER_NOTICE });
    },
    onError: (error) =>
      toast.error("Could not save the schedule", {
        description: extractErrorMessage(error),
      }),
  });

  const retire = useMutation({
    mutationFn: async (id: string) => retireEngineSchedule(id),
    onSuccess: () => {
      invalidate();
      toast.success("Schedule removed", {
        description:
          "The next tier up now applies to everything this row governed.",
      });
    },
    onError: (error) =>
      toast.error("Could not remove the schedule", {
        description: extractErrorMessage(error),
      }),
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
      <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-1.5">
        <Info className="mt-px h-3.5 w-3.5 shrink-0 text-warning" />
        <p className="text-[11px] leading-relaxed text-foreground">
          {NO_DISPATCHER_NOTICE} Saving one records what you want and nothing
          else; every pass today is the manual Run now above.
        </p>
      </div>

      {/* ── The editor for THIS tier ─────────────────────────────────────── */}
      <section className="rounded-md border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-2.5 py-1.5">
          <CalendarClock className="h-3.5 w-3.5 text-primary" />
          <h3 className="text-xs font-semibold text-foreground">
            {tierLabel(scope.tier)} schedule
          </h3>
          <span className="text-[10px] text-muted-foreground">
            {scope.tier === "system"
              ? "Applies only where no organization or brand has its own."
              : scope.tier === "organization"
                ? "Overrides the system default for every brand in this organization."
                : "Overrides the organization and the system for this brand alone."}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <Label
              htmlFor="schedule-enabled"
              className="text-[10px] text-muted-foreground"
            >
              Enabled
            </Label>
            <Switch
              id="schedule-enabled"
              checked={enabled}
              onCheckedChange={setEnabled}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 p-2 sm:grid-cols-3 lg:grid-cols-5">
          <div className="flex flex-col gap-1">
            <Label className="text-[10px] text-muted-foreground">Cadence</Label>
            <Select value={cadence} onValueChange={setCadence}>
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hourly">Hourly</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {cadence === "weekly" ? (
            <div className="flex flex-col gap-1">
              <Label className="text-[10px] text-muted-foreground">Day</Label>
              <Select
                value={String(dayOfWeek)}
                onValueChange={(value) => setDayOfWeek(Number(value))}
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAY_NAMES.map((name, index) => (
                    <SelectItem key={name} value={String(index)}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {cadence !== "hourly" ? (
            <div className="flex flex-col gap-1">
              <Label
                htmlFor="schedule-run-at"
                className="text-[10px] text-muted-foreground"
              >
                Time (UTC)
              </Label>
              <Input
                id="schedule-run-at"
                type="time"
                value={runAt}
                onChange={(event) => setRunAt(event.target.value)}
                className="h-7 text-xs"
              />
            </div>
          ) : null}

          <div className="flex flex-col gap-1">
            <Label
              htmlFor="schedule-max-keywords"
              className="truncate text-[10px] text-muted-foreground"
              title={`The seo.topic_placement knob caps this at ${capCeiling}`}
            >
              Keywords / run · max {capCeiling}
            </Label>
            <Input
              id="schedule-max-keywords"
              type="number"
              min={1}
              max={capCeiling}
              value={maxKeywords}
              onChange={(event) => setMaxKeywords(Number(event.target.value))}
              className="h-7 text-xs tabular-nums"
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label
              htmlFor="schedule-sites-per-run"
              className="truncate text-[10px] text-muted-foreground"
            >
              Brands / run
            </Label>
            <Input
              id="schedule-sites-per-run"
              type="number"
              min={1}
              value={sitesPerRun}
              onChange={(event) => setSitesPerRun(Number(event.target.value))}
              className="h-7 text-xs tabular-nums"
              disabled={scope.tier === "site"}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2 border-t border-border px-2 py-2">
          <div className="flex min-w-[16rem] flex-1 flex-col gap-1">
            <Label
              htmlFor="schedule-notes"
              className="text-[10px] text-muted-foreground"
            >
              Your requirements for this engine (free text, kept with the row)
            </Label>
            <Input
              id="schedule-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="e.g. only the ITAD brands, never touch anything a person placed"
              className="h-7 text-xs"
            />
          </div>
          <Button
            size="sm"
            className="h-7 gap-1 text-xs"
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <CalendarClock className="h-3 w-3" />
            )}
            {own ? "Update schedule" : "Save schedule"}
          </Button>
          {own ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 text-xs"
              disabled={retire.isPending}
              onClick={() => {
                void (async () => {
                  const ok = await confirm({
                    title: "Remove this schedule?",
                    description:
                      "Everything it governed falls back to the next tier up. Nothing is deleted from history.",
                    confirmLabel: "Remove",
                    variant: "destructive",
                  });
                  if (ok) retire.mutate(own.id);
                })();
              }}
            >
              <Trash2 className="h-3 w-3" />
              Remove
            </Button>
          ) : null}
        </div>
      </section>

      {/* ── The cascade, made visible ────────────────────────────────────── */}
      <section className="rounded-md border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-2.5 py-1.5">
          <h3 className="text-xs font-semibold text-foreground">
            Which schedule governs each brand
          </h3>
          <span className="text-[10px] text-muted-foreground">
            Nearest wins: brand, then organization, then the system default.
          </span>
        </div>
        <div className="max-h-64 overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-muted/60 text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-2.5 py-1 font-medium">Brand</th>
                <th className="px-2.5 py-1 font-medium">Governed by</th>
                <th className="px-2.5 py-1 font-medium">What it says</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((site) => {
                const governing = resolveScheduleForSite(schedules, site);
                return (
                  <tr
                    key={site.id}
                    className="border-t border-border/60 align-top"
                  >
                    <td className="px-2.5 py-1 text-foreground">{site.name}</td>
                    <td className="px-2.5 py-1">
                      <span
                        className={cn(
                          "rounded border px-1 py-px text-[10px]",
                          governing
                            ? "border-primary/40 bg-primary/10 text-primary"
                            : "border-border text-muted-foreground",
                        )}
                      >
                        {governing ? tierLabel(governing.scope_tier) : "Nothing"}
                      </span>
                    </td>
                    <td className="px-2.5 py-1 text-[11px] text-muted-foreground">
                      {governing ? (
                        <>
                          {describe(governing)}
                          {governing.enabled ? null : (
                            <span className="ml-1 text-warning">
                              (switched off)
                            </span>
                          )}
                        </>
                      ) : (
                        "Manual runs only."
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
