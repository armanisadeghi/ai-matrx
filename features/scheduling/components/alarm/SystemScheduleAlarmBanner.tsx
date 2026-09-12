"use client";

/**
 * SystemScheduleAlarmBanner — a critical schedule alarm reaches a super-admin
 * on EVERY page, from server state, until it is resolved.
 *
 * THE DEFECT THIS EXISTS FOR (2026-09-11). `scheduler.system_schedule_alarms`
 * returned six critical, repeat-guard-suspended system schedules — one of them
 * carrying an explicit human approval, its suspension freezing a 76,129-row
 * classification queue — for seventeen days. The RPC was right, the reader was
 * right, the scanner-health page (built for exactly this after the 2026-08-23
 * incident) rendered every row. Nobody opened that page, because nothing told
 * them to. An alarm you have to already suspect is a report.
 *
 * WHAT WAS INVENTORIED BEFORE THIS WAS BUILT (reuse-first, no-dead-ends):
 *   - Assists / the AssistsDock — ruled out by Arman's Chip Rescue ruling
 *     (2026-08-20): "A NOTIFICATION IS NEVER A CHIP".
 *   - The Notification System — the doctrinally right destination, but it has
 *     email + SMS channels only today. When an in-app channel lands, this
 *     rendering is what that channel should feed.
 *   - The Error Inspector badge — a store of CLIENT errors; a suspended
 *     schedule is not a browser error.
 *   - `SessionIntegrityBanner` + `CalloutBanner` — the precedent this follows.
 *
 * THE SECOND DEFECT, AND THE ONE THAT RULES THIS FILE (Arman, 2026-09-12).
 * The first version was a fixed strip that RESERVED ITS OWN SPACE: it measured
 * itself, published `--shell-alarm-h`, and the shell turned that into padding
 * on every scroll container. So an internal alarm — visible to super-admins
 * alone — permanently changed the layout of the product for the one person who
 * most needs to see what everyone else sees. It moved his content down, it
 * could not be closed, and neither of its two controls ("Review all", collapse)
 * got rid of it.
 *
 *   THE LAW: A NOTICE NEVER MODIFIES THE PAGE UNDERNEATH IT.
 *   It floats over the product. It reserves nothing, publishes no height, and
 *   shifts nothing. The person can MOVE it anywhere (`useDraggableFloat`,
 *   remembered across sessions), CLOSE it (one click = snooze three hours), or
 *   SNOOZE it for a chosen span. Because the alarm is operational, no door is
 *   permanent: every snooze expires and the alarm comes back on its own, and
 *   the only thing that ends it for good is turning the schedules back on.
 *
 * REMAINING INVARIANTS
 *   - Super-admin only, gated BEFORE the read: the RPC refuses everyone else
 *     with 42501 and the Supabase proxy would capture that refusal as a red
 *     error on every page load for every user.
 *   - Absent at zero alarms (`buildSystemScheduleAlarmNotice` → null); never
 *     an "all clear" strip — wallpaper is how the next alarm gets missed.
 *   - A failed read is SAID, not swallowed: a super-admin sees "could not be
 *     read" with Retry, because silence here would read as healthy.
 *   - Collapse (to a pill) is per tab; snooze is per browser and timed.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  AlertOctagon,
  AlertTriangle,
  BellOff,
  ChevronDown,
  ChevronUp,
  GripVertical,
  RefreshCw,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AppLink } from "@/components/navigation/AppLink";
import { CalloutBanner } from "@/components/official/CalloutBanner";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { cn } from "@/lib/utils";
import { useDraggableFloat } from "@/hooks/useDraggableFloat";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectAccessToken,
  selectAuthReady,
  selectIsSuperAdmin,
} from "@/lib/redux/selectors/userSelectors";
import { fetchSystemScheduleAlarms } from "../../service/queries";
import {
  buildSystemScheduleAlarmNotice,
  SCANNER_HEALTH_HREF,
  type SystemScheduleAlarmNotice,
} from "../../lib/system-schedule-alarm-notice";
import {
  DEFAULT_SNOOZE,
  readSnoozedUntil,
  SNOOZE_CHOICES,
  writeSnooze,
} from "../../lib/alarm-snooze";

const COLLAPSED_KEY = "matrx.schedule-alarm-banner.collapsed";
const POSITION_KEY = "matrx.schedule-alarm-banner.position";

/**
 * Collapsed state for THIS tab. Absent means "not chosen yet", and the default
 * is the compact pill on every screen so an operational notice cannot cover
 * the page the person is trying to inspect. An explicit choice always wins.
 */
function readCollapsed(): boolean {
  try {
    const stored = window.sessionStorage.getItem(COLLAPSED_KEY);
    if (stored === "1") return true;
    if (stored === "0") return false;
  } catch {
    // Storage refused (private mode) — fall through to the screen default.
  }
  return true;
}

function writeCollapsed(value: boolean): void {
  try {
    // Both answers are STORED: "expanded" is a choice too, and on a phone it
    // has to survive the narrow-screen default that would re-collapse it.
    window.sessionStorage.setItem(COLLAPSED_KEY, value ? "1" : "0");
  } catch {
    // Storage refused (private mode) — the in-memory state still applies.
  }
}

type ReadState =
  | { kind: "idle" }
  | { kind: "ok"; notice: SystemScheduleAlarmNotice | null }
  | { kind: "failed"; message: string };

export default function SystemScheduleAlarmBanner() {
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);
  const authReady = useAppSelector(selectAuthReady);
  const accessToken = useAppSelector(selectAccessToken);
  const pathname = usePathname();
  const [state, setState] = useState<ReadState>({ kind: "idle" });
  const [collapsed, setCollapsed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [snoozedUntil, setSnoozedUntil] = useState<number | null>(null);
  const wakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  /**
   * It FLOATS. The alarm is fixed, movable, and remembered — and it publishes
   * NO height, because nothing under it is allowed to move on its account.
   */
  const float = useDraggableFloat({
    storageKey: POSITION_KEY,
    elementRef: cardRef,
    // Bottom-right by default: out of the way of every page's own header and
    // primary controls, which is where the first version's covering defect and
    // its space-reserving fix both came from.
    anchor: { bottom: "1rem", right: "1rem" },
  });

  const canRead = Boolean(isSuperAdmin && authReady && accessToken);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const alarms = await fetchSystemScheduleAlarms();
      setState({ kind: "ok", notice: buildSystemScheduleAlarmNotice(alarms) });
    } catch (error) {
      setState({
        kind: "failed",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setCollapsed(readCollapsed());
    setSnoozedUntil(readSnoozedUntil());
  }, []);

  /** A snooze ALWAYS ends by itself — in this tab, without a reload. */
  useEffect(() => {
    if (wakeTimer.current) clearTimeout(wakeTimer.current);
    if (snoozedUntil === null) return;
    const delay = Math.max(0, snoozedUntil - Date.now());
    wakeTimer.current = setTimeout(() => setSnoozedUntil(readSnoozedUntil()), delay + 250);
    return () => {
      if (wakeTimer.current) clearTimeout(wakeTimer.current);
    };
  }, [snoozedUntil]);

  // Read on boot, on every route change (a schedule re-enabled on its own
  // page should clear the banner the moment the person leaves it), and on
  // window focus (the fix may have happened in another tab).
  useEffect(() => {
    if (!canRead) return;
    void load();
  }, [canRead, load, pathname]);

  useEffect(() => {
    if (!canRead) return;
    const onFocus = () => {
      setSnoozedUntil(readSnoozedUntil());
      void load();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [canRead, load]);

  if (!canRead) return null;
  if (state.kind === "idle") return null;
  // Snoozed: silent, and silent on purpose — it returns on its own.
  if (snoozedUntil !== null) return null;

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    writeCollapsed(next);
  };

  const snooze = (ms: number) => {
    setSnoozedUntil(writeSnooze(ms));
  };

  /** Nothing here reserves space: `pointer-events` are the card's own only. */
  const shell = "z-50 w-[min(44rem,calc(100vw-1.5rem))] shadow-xl";

  const dragHandle = (
    <button
      type="button"
      aria-label="Drag the schedule alarm somewhere else"
      title="Drag me anywhere"
      className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-background/60 hover:text-foreground"
      onDoubleClick={float.reset}
      {...float.dragHandleProps}
    >
      <GripVertical className="h-3.5 w-3.5" aria-hidden />
    </button>
  );

  const snoozeMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Snooze the schedule alarm"
          title="Snooze — it comes back on its own"
          className="rounded-md p-1 text-muted-foreground hover:bg-background/60 hover:text-foreground"
        >
          <BellOff className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Quiet for a while. It comes back on its own — only turning the
          schedules back on ends it.
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {SNOOZE_CHOICES.map((choice) => (
          <DropdownMenuItem key={choice.id} onSelect={() => snooze(choice.ms)}>
            Snooze {choice.label}
          </DropdownMenuItem>
        ))}
        {float.moved && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={float.reset}>
              Move back to the corner
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const closeButton = (
    <button
      type="button"
      onClick={() => snooze(DEFAULT_SNOOZE.ms)}
      aria-label={`Close the schedule alarm for ${DEFAULT_SNOOZE.label}`}
      title={`Close — back in ${DEFAULT_SNOOZE.label}`}
      className="rounded-md p-1 text-muted-foreground hover:bg-background/60 hover:text-foreground"
    >
      <X className="h-3.5 w-3.5" />
    </button>
  );

  if (state.kind === "failed") {
    return (
      <div
        ref={cardRef}
        className={shell}
        style={float.style}
        data-surface-value="schedule_alarm_banner_error"
      >
        <CalloutBanner
          tone="warning"
          icon={AlertTriangle}
          className="bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80"
          title="Schedule alarms could not be read."
          description={`${state.message} A suspended or failing schedule would not be visible until this read works, so treat this as unknown, not healthy.`}
          actions={
            <>
              <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
                <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", loading && "animate-spin")} />
                Retry
              </Button>
              {dragHandle}
              {snoozeMenu}
              {closeButton}
            </>
          }
        />
      </div>
    );
  }

  const notice = state.notice;
  // Nothing to report renders NOTHING — never an "all clear" strip.
  if (notice === null) return null;
  const Icon = notice.tone === "destructive" ? AlertOctagon : AlertTriangle;

  if (collapsed) {
    const count = notice.criticalCount + notice.warningCount;
    return (
      <div
        ref={cardRef}
        className="z-50 flex items-center gap-1 shadow-xl"
        style={float.style}
        data-surface-value="schedule_alarm_banner_collapsed"
      >
        <span
          className={cn(
            "flex items-center gap-1 rounded-full border py-1 pl-2 pr-1 text-xs font-medium backdrop-blur",
            notice.tone === "destructive"
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : "border-warning/40 bg-warning/10 text-warning",
          )}
        >
          {dragHandle}
          <button
            type="button"
            onClick={toggleCollapsed}
            className="flex items-center gap-1.5"
            aria-label="Expand the schedule alarm"
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            <span>
              {count} {count === 1 ? "schedule needs" : "schedules need"} a person
            </span>
            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          </button>
          {snoozeMenu}
          {closeButton}
        </span>
      </div>
    );
  }

  return (
    <div
      ref={cardRef}
      className={shell}
      style={float.style}
      data-surface-value="schedule_alarm_banner"
    >
      <CalloutBanner
        tone={notice.tone}
        icon={Icon}
        className="bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80"
        title={notice.title}
        description={
          <>
            <span>{notice.description}</span>
            <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              {notice.items.map((item) => (
                <span key={item.taskId} className="inline-flex items-center gap-1">
                  {/* THE DOOR LAW: every schedule named here opens — the record
                      route is where re-enabling lives. */}
                  <EntityRef
                    token="sch_task"
                    id={item.taskId}
                    name={item.title}
                    href={item.href}
                    labelClassName="text-foreground"
                  />
                  <span
                    className={cn(
                      "text-[11px]",
                      item.severity === "critical" ? "text-destructive" : "text-warning",
                    )}
                  >
                    {item.state}
                  </span>
                </span>
              ))}
            </span>
          </>
        }
        actions={
          <>
            <Button size="sm" variant={notice.tone === "destructive" ? "destructive" : "default"} asChild>
              <AppLink href={SCANNER_HEALTH_HREF}>Review all</AppLink>
            </Button>
            {dragHandle}
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label="Collapse the schedule alarm to a pill"
              title="Collapse to a pill"
              className="rounded-md p-1 text-muted-foreground hover:bg-background/60 hover:text-foreground"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            {snoozeMenu}
            {closeButton}
          </>
        }
      />
    </div>
  );
}
