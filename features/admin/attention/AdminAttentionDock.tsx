"use client";

/**
 * AdminAttentionDock — everything that needs a person responsible for the
 * platform, on every page, as ONE floating card with a way out.
 *
 * THE DEFECTS THIS EXISTS FOR (Arman, 2026-09-14). Two floating notices had
 * grown side by side with two snoozes, two mute stores, two layout markers
 * and two ideas of a row. The schedule one had become furniture: "it keeps
 * reminding me … but some of these things should be off … it's not giving
 * me an out"; "it doesn't show me where to go to fix that"; "it's including
 * UUIDs in the text". So:
 *
 *   ONE CARD   every source (schedule alarms, provider outages, …) renders
 *              through the same row, under one title, one pill, one snooze.
 *   A WAY OUT  per item: mute for 1 hour … 30 days, with a note, stored on
 *              the record when it has one (every super-admin sees it) and in
 *              this browser when it does not. For the whole dock: a timed
 *              snooze. Nothing is ever muted forever.
 *   DOORS      the record (open / new tab / peek), the run that failed, the
 *              product pages the job feeds — or an honest "hasn't said".
 *   ACTIONS    the fix beside the complaint (Re-enable), through the same
 *              write path the record page uses, with its consequence stated.
 *   NO UUIDS   every sentence renders through TextWithDoors.
 *
 * IT FLOATS, AND THAT IS THE LAW (Arman, 2026-09-12): a notice never modifies
 * the page under it. It is fixed, movable (`useDraggableFloat`), publishes no
 * height and measures nothing. While visible it marks the document with its
 * compact/expanded state so `styles/shell.css` can keep a scroll runway on
 * the actual shell scroll owner — a size class, never a measured height.
 *
 * REMAINING INVARIANTS
 *   - Super-admin only, gated BEFORE any read.
 *   - Absent at zero live items (`buildAttentionNotice` → null) — never an
 *     "all clear" strip; wallpaper is how the next alarm gets missed.
 *   - A failed read is SAID for a source that says so (`loud`), with Retry.
 *   - A mute that has run out is not a mute: the local store is re-read on
 *     every poll result and the nearest expiry arms a timer, so silence ends
 *     by itself in this tab without a reload (Bugbot, 2026-09-13).
 *   - Collapse is per tab (default: the compact pill, so an operational
 *     notice cannot cover the page the person is trying to inspect); snooze
 *     is per browser and timed.
 */

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
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
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useDraggableFloat } from "@/hooks/useDraggableFloat";
import { refreshNow, useNow } from "@/hooks/useNow";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectAccessToken,
  selectAuthReady,
  selectIsSuperAdmin,
} from "@/lib/redux/selectors/userSelectors";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { AttentionItemRow } from "./AttentionItemRow";
import { buildAttentionNotice } from "./build-notice";
import { DEFAULT_SNOOZE, readSnoozedUntil, SNOOZE_CHOICES, writeSnooze } from "./dock-snooze";
import { NOTE_MUTE, touchMutes } from "./item-mute";
import { useLocalMutes } from "./useLocalMutes";
import { useProviderOutageSource } from "./sources/useProviderOutageSource";
import { useScheduleAlarmSource } from "./sources/useScheduleAlarmSource";
import type { AttentionAction, AttentionItem } from "./types";

const COLLAPSED_KEY = "matrx.admin-attention.collapsed";
/** Every source's React Query key starts with this, so one invalidation wakes all. */
export const ATTENTION_QUERY_PREFIX = ["admin-attention"] as const;
const POSITION_KEY = "matrx.admin-attention.position";

/**
 * Collapsed state for THIS tab. Absent means "not chosen yet", and the default
 * is the compact pill so an operational notice cannot cover the page the
 * person is trying to inspect. An explicit choice always wins.
 */
function readCollapsed(): boolean {
  try {
    const stored = window.sessionStorage.getItem(COLLAPSED_KEY);
    if (stored === "1") return true;
    if (stored === "0") return false;
  } catch {
    // Storage refused (private mode) — fall through to the default.
  }
  return true;
}

function writeCollapsed(value: boolean): void {
  try {
    window.sessionStorage.setItem(COLLAPSED_KEY, value ? "1" : "0");
  } catch {
    // Storage refused (private mode) — the in-memory state still applies.
  }
}

export default function AdminAttentionDock() {
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);
  const authReady = useAppSelector(selectAuthReady);
  const accessToken = useAppSelector(selectAccessToken);
  const organizationId = useAppSelector(selectOrganizationId);
  const canRead = Boolean(isSuperAdmin && authReady && accessToken && organizationId);

  const [collapsedChoice, setCollapsedChoice] = useState(readCollapsed);
  const pathname = usePathname();
  const [snoozedUntil, setSnoozedUntil] = useState(readSnoozedUntil);
  const localMutes = useLocalMutes();
  const now = useNow();
  const [noteFor, setNoteFor] = useState<AttentionItem | null>(null);
  const [noteBusy, setNoteBusy] = useState(false);
  const wakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  const queryClient = useQueryClient();

  const schedules = useScheduleAlarmSource(canRead);
  const outages = useProviderOutageSource(canRead);
  const sources = [schedules, outages];

  const float = useDraggableFloat({
    storageKey: POSITION_KEY,
    elementRef: cardRef,
    // Bottom-right by default: out of the way of every page's own header and
    // primary controls.
    anchor: { bottom: "1rem", right: "1rem" },
  });

  // 🚨 A MUTE THAT HAS RUN OUT IS NOT A MUTE. This is a session-long
  // singleton, so "read once on mount" would mean "once per full page load".
  // Every comparison below is against `now` from the shared 30-second clock,
  // and the nearest expiry among the items ON SCREEN (local or on the row)
  // arms a timer that re-reads the store and the sources at that moment.
  const nextExpiry = sources
    .flatMap((s) => s.items)
    .flatMap((item) => {
      const out: number[] = [];
      const local = localMutes[item.key];
      if (typeof local === "number") out.push(local);
      if (item.mute.current) out.push(new Date(item.mute.current.until).getTime());
      return out;
    })
    .filter((t) => Number.isFinite(t) && t > now)
    .reduce<number | null>((soonest, t) => (soonest === null || t < soonest ? t : soonest), null);

  useEffect(() => {
    if (nextExpiry === null) return;
    // +1ms so the timer lands strictly after the expiry the reads compare
    // against (`until > now`), never on the same millisecond.
    const delay = Math.max(0, nextExpiry - Date.now()) + 1;
    const timer = window.setTimeout(() => {
      refreshNow();
      touchMutes();
      // Every source's query shares this prefix — one invalidation wakes all.
      void queryClient.invalidateQueries({ queryKey: ATTENTION_QUERY_PREFIX });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [nextExpiry, queryClient]);

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

  useEffect(() => {
    if (!canRead) return;
    const onFocus = () => setSnoozedUntil(readSnoozedUntil());
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [canRead]);

  const notice = canRead ? buildAttentionNotice(sources, localMutes, now) : null;
  const loudFailures = canRead ? sources.filter((s) => s.status === "failed" && s.loud) : [];
  const visible = notice !== null || loudFailures.length > 0;
  // On a source's OWN review page the page is the expanded view: the card
  // would only float over the very rows (and Unmute buttons) it points at.
  // The pill stays, so the person still sees the count and the way back.
  const onReviewPage = sources.some(
    (s) => s.review !== null && pathname !== null && pathname.startsWith(s.review.href),
  );
  const collapsed = onReviewPage || collapsedChoice;

  // The singleton lives outside every route's React tree, so this document
  // marker is the one shared contract every shell scroll owner can consume.
  useEffect(() => {
    const root = document.documentElement;
    if (!visible || snoozedUntil !== null) {
      delete root.dataset.adminAttention;
      return;
    }
    root.dataset.adminAttention = collapsed ? "compact" : "expanded";
    return () => {
      delete root.dataset.adminAttention;
    };
  }, [collapsed, snoozedUntil, visible]);

  if (!canRead) return null;
  if (!visible) return null;
  // Snoozed: silent, and silent on purpose — it returns on its own.
  if (snoozedUntil !== null) return null;

  const toggleCollapsed = () => {
    if (onReviewPage) return;
    const next = !collapsedChoice;
    setCollapsedChoice(next);
    writeCollapsed(next);
  };

  const snooze = (ms: number) => setSnoozedUntil(writeSnooze(ms));

  const onAction = async (item: AttentionItem, action: AttentionAction) => {
    if (action.confirm) {
      const ok = await confirm({
        title: action.confirm.title,
        description: action.confirm.description,
        confirmLabel: action.confirm.confirmLabel,
        variant: action.confirm.variant ?? "default",
      });
      if (!ok) return;
    }
    try {
      await action.run();
      toast.success(`${action.label}: done for "${item.title}"`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const onMute = async (item: AttentionItem, ms: number, note: string | null = null) => {
    try {
      await item.mute.apply(Date.now() + ms, note);
      toast.success(
        item.mute.scope === "server"
          ? `"${item.title}" is muted for every super-admin — it comes back on its own.`
          : `"${item.title}" is muted in this browser — it comes back on its own.`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const onUnmute = async (item: AttentionItem) => {
    if (!item.mute.clear) return;
    try {
      await item.mute.clear();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const Icon = notice?.tone === "warning" ? AlertTriangle : AlertOctagon;
  const tone = notice?.tone ?? "warning";
  const shell = "z-50 w-[min(46rem,calc(100vw-1.5rem))] shadow-xl";
  const iconButton =
    "rounded-md p-1 text-muted-foreground hover:bg-background/60 hover:text-foreground";

  const dragHandle = (
    <button
      type="button"
      aria-label="Drag the attention dock somewhere else"
      title="Drag me anywhere"
      className={cn("shrink-0", iconButton)}
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
          aria-label="Snooze the attention dock"
          title="Snooze — it comes back on its own"
          className={iconButton}
        >
          <BellOff className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Quiet everything for a while. It comes back on its own — to quiet ONE
          thing for longer, use Mute on its row.
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
            <DropdownMenuItem onSelect={float.reset}>Move back to the corner</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const closeButton = (
    <button
      type="button"
      onClick={() => snooze(DEFAULT_SNOOZE.ms)}
      aria-label={`Close the attention dock for ${DEFAULT_SNOOZE.label}`}
      title={`Close — back in ${DEFAULT_SNOOZE.label}`}
      className={iconButton}
    >
      <X className="h-3.5 w-3.5" />
    </button>
  );

  const noteDialog = (
    <TextInputDialog
      open={noteFor !== null}
      onOpenChange={(open) => {
        if (!open) setNoteFor(null);
      }}
      title={noteFor ? `Mute "${noteFor.title}" for ${NOTE_MUTE.label}` : "Mute"}
      description="Say why it is fine for this to stay off — every super-admin will read it beside the schedule, and the mute ends on its own."
      placeholder="e.g. The commerce module is not built yet; nothing to sync until eBay approves us."
      multiline
      rows={3}
      confirmLabel={`Mute for ${NOTE_MUTE.label}`}
      busy={noteBusy}
      onConfirm={async (value) => {
        if (!noteFor) return;
        setNoteBusy(true);
        try {
          await onMute(noteFor, NOTE_MUTE.ms, value.trim());
          setNoteFor(null);
        } finally {
          setNoteBusy(false);
        }
      }}
    />
  );

  if (collapsed) {
    const count = notice ? notice.criticalCount + notice.warningCount : 0;
    const label = notice
      ? notice.pill
      : `${loudFailures.length === 1 ? "A check" : `${loudFailures.length} checks`} could not be read`;
    return (
      <div
        ref={cardRef}
        className="z-50 flex items-center gap-1 shadow-xl"
        style={float.style}
        data-surface-value="admin_attention_dock_collapsed"
      >
        <span
          className={cn(
            "flex items-center gap-1 rounded-full border py-1 pl-2 pr-1 text-xs font-medium backdrop-blur",
            tone === "destructive"
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : "border-warning/40 bg-warning/10 text-warning",
          )}
        >
          {dragHandle}
          <button
            type="button"
            onClick={toggleCollapsed}
            className="flex items-center gap-1.5"
            aria-label="Expand the attention dock"
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            <span>{label}</span>
            {count > 0 && !onReviewPage && <ChevronDown className="h-3.5 w-3.5" aria-hidden />}
          </button>
          {snoozeMenu}
          {closeButton}
        </span>
        {noteDialog}
      </div>
    );
  }

  return (
    <div
      ref={cardRef}
      className={shell}
      style={float.style}
      data-surface-value="admin_attention_dock"
    >
      <div
        role="status"
        className={cn(
          "flex max-h-[min(70dvh,40rem)] flex-col rounded-lg border bg-card/95 shadow-xl backdrop-blur supports-[backdrop-filter]:bg-card/80",
          tone === "destructive" ? "border-destructive/40" : "border-warning/40",
        )}
      >
        <div className="flex items-start gap-2 px-3 pt-2.5">
          <Icon
            className={cn(
              "mt-0.5 h-4 w-4 shrink-0",
              tone === "destructive" ? "text-destructive" : "text-warning",
            )}
            aria-hidden
          />
          <p className="min-w-0 flex-1 text-sm font-medium text-foreground" data-testid="attention-title">
            {notice?.title ?? "Some checks could not be read."}
          </p>
          <div className="flex shrink-0 items-center gap-0.5">
            {dragHandle}
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label="Collapse the attention dock to a pill"
              title="Collapse to a pill"
              className={iconButton}
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            {snoozeMenu}
            {closeButton}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-2.5">
          {loudFailures.map((source) => (
            <div
              key={`failed:${source.id}`}
              className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-2 py-1.5 text-xs"
              data-testid="attention-read-failed"
            >
              <AlertTriangle className="h-3.5 w-3.5 text-warning" aria-hidden />
              <span className="min-w-0 flex-1">
                {source.label} could not be read: {source.error ?? "unknown error"}. Treat this
                as unknown, not healthy.
              </span>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={source.refetch}>
                <RefreshCw className="mr-1 h-3 w-3" aria-hidden />
                Retry
              </Button>
            </div>
          ))}

          {notice?.sections.map(({ source, items }) => (
            <section key={source.id} className="mt-2" data-testid={`attention-section-${source.id}`}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {source.label}
                </h3>
                {source.review && (
                  <AppLink
                    href={source.review.href}
                    className="text-[11px] text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
                  >
                    {source.review.label}
                  </AppLink>
                )}
              </div>
              <ul className="divide-y divide-border/60">
                {items.map((item) => (
                  <AttentionItemRow
                    key={item.key}
                    item={item}
                    onAction={onAction}
                    onMute={onMute}
                    onMuteWithNote={setNoteFor}
                    onUnmute={onUnmute}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
      {noteDialog}
    </div>
  );
}
