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
 *     (2026-08-20): "A NOTIFICATION IS NEVER A CHIP"; operational incidents and
 *     alarm language are explicitly not assists, the `scheduler_` family is
 *     already dispositioned `notification`, and ambient presentation is
 *     switched off for every family but one.
 *   - The Notification System — the doctrinally right destination for
 *     "tell a person something", but today it has email + SMS channels only
 *     (browser/popup/in-app are listed remaining work), its producers are
 *     server-side, and it has no persistent in-app surface. When an in-app
 *     channel lands, this banner is the rendering that channel should feed.
 *   - The Error Inspector badge — global and admin-gated, but it is a store of
 *     CLIENT errors with no door to a record; a suspended schedule is not a
 *     browser error and putting it there would both lie ("6 errors") and
 *     pollute the triage surface.
 *   - `SessionIntegrityBanner` + `CalloutBanner` — the precedent this follows:
 *     one global, server-derived, in-words notice with the one action that
 *     resolves it. Composed here with the existing reader
 *     (`fetchSystemScheduleAlarms`), the existing entity door (`EntityRef` →
 *     `/schedules/<id>`), and the existing admin page as "review all".
 *
 * INVARIANTS
 *   - Super-admin only, gated BEFORE the read: the RPC refuses everyone else
 *     with 42501 and the Supabase proxy would capture that refusal as a red
 *     error on every page load for every user.
 *   - Absent at zero alarms (`buildSystemScheduleAlarmNotice` → null); never
 *     an "all clear" strip — wallpaper is how the next alarm gets missed.
 *   - A failed read is SAID, not swallowed: a super-admin sees "could not be
 *     read" with Retry, because silence here would read as healthy.
 *   - Fixed, but it RESERVES ITS SPACE: the shell's `.shell-main` is a
 *     full-viewport scroll container, so an in-flow strip above it would grow
 *     the document by its own height. It is therefore positioned `fixed` just
 *     under the (transparent) header — and it publishes its measured height as
 *     `--shell-alarm-h` on the document root, which the shell's scroll
 *     containers consume as `padding-top` (`styles/shell.css`).
 *
 *     THE DEFECT THAT TAUGHT US THIS (D-2026-09-11-A): without the
 *     reservation, a fixed banner COVERS the top of every page — including
 *     `/schedules/<id>`, the very record page its own links open, whose
 *     `PageHeader` and enable control sit exactly there. An alarm that hides
 *     the fix is worse than no alarm. The offset is published by the banner
 *     and consumed by the shell, so it holds on every route at once and no
 *     route is ever special-cased.
 *   - It can be COLLAPSED to a pill for this tab session, never dismissed:
 *     the only thing that removes it is fixing the schedules. Collapse state
 *     is per tab (sessionStorage) so a reload in the same tab does not
 *     re-expand it, and a new session starts loud again.
 */

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AlertOctagon, AlertTriangle, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppLink } from "@/components/navigation/AppLink";
import { CalloutBanner } from "@/components/official/CalloutBanner";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { cn } from "@/lib/utils";
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

const COLLAPSED_KEY = "matrx.schedule-alarm-banner.collapsed";

/**
 * The custom property the shell's scroll containers consume as `padding-top`
 * (`styles/shell.css`). The banner is the only writer; it is REMOVED, never set
 * to 0, whenever the banner is absent, so a stale reservation can never leave a
 * gap at the top of every page.
 */
const ALARM_HEIGHT_VAR = "--shell-alarm-h";

/** Clearance above and below the banner, matching its own `top` offset. */
const ALARM_GUTTER_PX = 16;

function readCollapsed(): boolean {
  try {
    return window.sessionStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCollapsed(value: boolean): void {
  try {
    if (value) window.sessionStorage.setItem(COLLAPSED_KEY, "1");
    else window.sessionStorage.removeItem(COLLAPSED_KEY);
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
  const [bannerEl, setBannerEl] = useState<HTMLDivElement | null>(null);

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
  }, []);

  // Read on boot, on every route change (a schedule re-enabled on its own
  // page should clear the banner the moment the person leaves it), and on
  // window focus (the fix may have happened in another tab).
  useEffect(() => {
    if (!canRead) return;
    void load();
  }, [canRead, load, pathname]);

  useEffect(() => {
    if (!canRead) return;
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [canRead, load]);

  /**
   * RESERVE THE SPACE THIS BANNER OCCUPIES.
   *
   * A `fixed` banner is outside flow, so without this it sits ON TOP of the
   * page — including the record pages its own links open. The element measures
   * itself (its height changes with collapse, with the number of schedules
   * named, and with viewport width as the list wraps) and publishes the result
   * on the document root; `styles/shell.css` turns it into top padding on every
   * shell scroll container, so no route is ever special-cased.
   *
   * A callback ref, not `useRef`: the banner has three mutually exclusive
   * render shapes (error / collapsed pill / full) and the element identity
   * changes between them. The callback fires on every swap, so the effect
   * re-measures instead of holding a stale node.
   */
  useEffect(() => {
    const root = document.documentElement;
    if (!bannerEl) {
      root.style.removeProperty(ALARM_HEIGHT_VAR);
      return;
    }
    const publish = () => {
      const height = bannerEl.getBoundingClientRect().height;
      root.style.setProperty(
        ALARM_HEIGHT_VAR,
        height > 0 ? `${Math.ceil(height) + ALARM_GUTTER_PX}px` : "0px",
      );
    };
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(bannerEl);
    return () => {
      observer.disconnect();
      root.style.removeProperty(ALARM_HEIGHT_VAR);
    };
  }, [bannerEl]);

  if (!canRead) return null;
  if (state.kind === "idle") return null;

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    writeCollapsed(next);
  };

  const shell =
    "fixed left-1/2 z-40 w-[min(56rem,calc(100vw-1.5rem))] -translate-x-1/2 shadow-lg";
  const top = { top: "calc(var(--shell-header-h, 2.75rem) + 0.5rem)" };

  if (state.kind === "failed") {
    return (
      <div ref={setBannerEl} className={shell} style={top} data-surface-value="schedule_alarm_banner_error">
        <CalloutBanner
          tone="warning"
          icon={AlertTriangle}
          title="Schedule alarms could not be read."
          description={`${state.message} A suspended or failing schedule would not be visible until this read works, so treat this as unknown, not healthy.`}
          actions={
            <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", loading && "animate-spin")} />
              Retry
            </Button>
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
      <div ref={setBannerEl} className={shell} style={top} data-surface-value="schedule_alarm_banner_collapsed">
        <button
          type="button"
          onClick={toggleCollapsed}
          className={cn(
            "mx-auto flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium backdrop-blur",
            notice.tone === "destructive"
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : "border-warning/40 bg-warning/10 text-warning",
          )}
          aria-label="Expand the schedule alarm"
        >
          <Icon className="h-3.5 w-3.5" aria-hidden />
          <span>
            {count} {count === 1 ? "schedule needs" : "schedules need"} a person
          </span>
          <ChevronDown className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div ref={setBannerEl} className={shell} style={top} data-surface-value="schedule_alarm_banner">
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
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label="Collapse the schedule alarm to a pill"
              title="Collapse — it stays visible until the schedules are back on"
              className="rounded-md p-1 text-muted-foreground hover:bg-background/60 hover:text-foreground"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
          </>
        }
      />
    </div>
  );
}
