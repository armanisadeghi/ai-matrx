"use client";

import { useMemo, useState } from "react";
import { CalendarClock, Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  browserTimezone,
  cadenceForFrequency,
  crawlCadenceForm,
  describeCrawlCadence,
  frequencyHasTimeOfDay,
  parseCrawlCadence,
  CRAWL_FREQUENCIES,
  CRAWL_FREQUENCY_LABELS,
  CRAWL_HOUR_OPTIONS,
  type CrawlFrequency,
} from "@/features/marketing/crawler/crawl-cadence";
import {
  useSaveSiteCrawlSchedule,
  useSetSiteCrawlScheduleEnabled,
  useSiteCrawlSchedule,
} from "@/features/marketing/data/crawl-schedule-hooks";
import type { CrawlSchedule } from "@/features/marketing/types";
import { extractErrorMessage } from "@/utils/errors";

/** Absolute local time, with the relative distance a human actually reads. */
function formatNextRun(value: string | null): string | null {
  if (!value) return null;
  const when = new Date(value);
  if (Number.isNaN(when.getTime())) return null;
  const minutes = Math.round((when.getTime() - Date.now()) / 60_000);
  const relative =
    minutes <= 1
      ? "any moment"
      : minutes < 60
        ? `in ${minutes} min`
        : minutes < 60 * 48
          ? `in ${Math.round(minutes / 60)} h`
          : `in ${Math.round(minutes / 1440)} days`;
  return `${when.toLocaleString()} · ${relative}`;
}

/**
 * The human writer for `web.crawl_schedule` — "crawl this site again, this
 * often", with nobody clicking anything.
 *
 * It writes INTENT only (cadence / timezone / on-off). The every-minute server
 * dispatcher owns execution: it claims the row under a lease, starts the crawl
 * through the same path the Start-crawl button uses, and stamps the next
 * occurrence. That is why this card can show "Scheduling…" right after a save —
 * `next_run_at` is deliberately the server's to compute, and the read polls for
 * it rather than this component guessing at cron-in-a-timezone arithmetic.
 */
export function CrawlScheduleCard({
  siteId,
  organizationId,
}: {
  siteId: string;
  organizationId: string;
}) {
  const scheduleQuery = useSiteCrawlSchedule(siteId);
  const save = useSaveSiteCrawlSchedule(siteId);
  const toggle = useSetSiteCrawlScheduleEnabled(siteId);
  const schedule = scheduleQuery.data ?? null;

  const storedCadence = useMemo(
    () => parseCrawlCadence(schedule?.cadence),
    [schedule?.cadence],
  );
  const storedForm = useMemo(
    () => crawlCadenceForm(storedCadence),
    [storedCadence],
  );

  // A cadence this UI cannot represent (a hand-written cron from an admin or
  // an agent) is shown, never silently rewritten into the nearest preset.
  const isCustomCadence = Boolean(schedule) && storedForm === null;

  const [draft, setDraft] = useState<{
    frequency: CrawlFrequency;
    hour: number;
  } | null>(null);
  const effective = draft ?? storedForm ?? { frequency: "weekly" as const, hour: 3 };
  const timezone = schedule?.timezone || browserTimezone();
  const dirty =
    draft !== null &&
    (draft.frequency !== storedForm?.frequency || draft.hour !== storedForm?.hour);

  const busy = save.isPending || toggle.isPending;
  const nextRun = formatNextRun(schedule?.next_run_at ?? null);

  const reportResult = (
    result: { status: "saved" | "conflict" },
    savedMessage: string,
  ) => {
    if (result.status === "conflict") {
      toast.error("This schedule changed somewhere else", {
        description:
          "Your version was out of date, so nothing was overwritten. The current schedule is now shown — re-apply your change if you still want it.",
      });
      setDraft(null);
      return;
    }
    setDraft(null);
    toast.success(savedMessage);
  };

  const applyCadence = async (enabled: boolean) => {
    try {
      const result = await save.mutateAsync({
        siteId,
        organizationId,
        cadence: cadenceForFrequency(effective.frequency, effective.hour),
        timezone,
        enabled,
        existing: schedule
          ? { id: schedule.id, version: schedule.version }
          : null,
      });
      reportResult(
        result,
        enabled ? "Recurring crawl scheduled" : "Schedule saved (paused)",
      );
    } catch (error) {
      toast.error("Could not save the crawl schedule", {
        description: extractErrorMessage(error),
      });
    }
  };

  const setEnabled = async (enabled: boolean) => {
    // No row yet — turning it on IS the first save.
    if (!schedule) {
      if (enabled) await applyCadence(true);
      return;
    }
    try {
      const result = await toggle.mutateAsync({
        schedule: { id: schedule.id, version: schedule.version },
        enabled,
      });
      reportResult(
        result,
        enabled ? "Recurring crawl resumed" : "Recurring crawl paused",
      );
    } catch (error) {
      toast.error("Could not change the crawl schedule", {
        description: extractErrorMessage(error),
      });
    }
  };

  const enabled = Boolean(schedule?.enabled);

  return (
    <section className="space-y-2 border-t border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <CalendarClock className="h-3.5 w-3.5" /> Repeat automatically
          </h2>
          <p className="text-[10px] leading-4 text-muted-foreground">
            Re-crawl this site on a schedule, with the same settings the
            “Crawl again” button uses. No one has to be here.
          </p>
        </div>
        <Switch
          checked={enabled}
          disabled={busy || scheduleQuery.isLoading}
          aria-label="Repeat this crawl automatically"
          onCheckedChange={(checked) => void setEnabled(checked === true)}
        />
      </div>

      {scheduleQuery.isError ? (
        <p className="text-[10px] leading-4 text-destructive">
          Could not load this site’s schedule:{" "}
          {extractErrorMessage(scheduleQuery.error)}
        </p>
      ) : null}

      {isCustomCadence ? (
        <p className="rounded-md border border-border bg-muted/40 px-2.5 py-2 text-[10px] leading-4 text-muted-foreground">
          This site uses a custom schedule —{" "}
          <span className="font-medium text-foreground">
            {describeCrawlCadence(storedCadence, timezone)}
          </span>
          . It keeps running as set; the switch above pauses or resumes it.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[11px]">How often</Label>
            <Select
              value={effective.frequency}
              disabled={busy}
              onValueChange={(value) =>
                setDraft({
                  frequency: value as CrawlFrequency,
                  hour: effective.hour,
                })
              }
            >
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CRAWL_FREQUENCIES.map((frequency) => (
                  <SelectItem key={frequency} value={frequency}>
                    {CRAWL_FREQUENCY_LABELS[frequency]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">At</Label>
            <Select
              value={String(effective.hour)}
              disabled={busy || !frequencyHasTimeOfDay(effective.frequency)}
              onValueChange={(value) =>
                setDraft({
                  frequency: effective.frequency,
                  hour: Number(value),
                })
              }
            >
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CRAWL_HOUR_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={String(option.value)}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {dirty ? (
        <Button
          size="sm"
          className="h-8 w-full"
          disabled={busy}
          onClick={() => void applyCadence(true)}
        >
          {busy ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : null}
          {enabled ? "Update schedule" : "Turn on and save"}
        </Button>
      ) : null}

      <p className="text-[10px] leading-4 text-muted-foreground">
        {!schedule
          ? "Not scheduled — this site is only crawled when someone starts one."
          : !enabled
            ? `Paused · ${describeCrawlCadence(storedCadence, timezone)}`
            : nextRun
              ? `Next automatic crawl: ${nextRun}`
              : "Scheduling… the next run is set within a minute."}
      </p>

      {schedule?.last_outcome === "failed" && schedule.last_error ? (
        <p className="text-[10px] leading-4 text-destructive">
          Last automatic run failed: {schedule.last_error}
        </p>
      ) : null}
    </section>
  );
}
