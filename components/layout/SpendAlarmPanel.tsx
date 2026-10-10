"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, Info, OctagonAlert, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { ProTextarea } from "@/components/official/ProTextarea";
import { countByLevel, sortSpendAlarms, type AlarmLevel, type SpendAlarm } from "./spendAlarm";

interface SpendAlarmPanelProps {
  /** Ringing alarms (open, or snoozed past their time). */
  alarms: SpendAlarm[];
  /** Open the alarm's own record page (always `/administration/billing/alarms/<id>`). */
  onOpen: (href: string) => void;
  /** Resolve the shared record for every super admin; it reopens if it happens again. */
  onResolve: (alarm: SpendAlarm, note: string) => void;
  /** Quiet the shared record for 24 hours. */
  onSnooze: (alarm: SpendAlarm) => void;
  /** X, Escape, the backdrop or "Remind me later": hide for this browser session; nothing changes. */
  onClose: () => void;
}

/** Each level has its own color, icon and word, so no two read alike (color is never the only cue). */
const LEVEL_STYLE: Record<
  AlarmLevel,
  { label: string; Icon: LucideIcon; card: string; text: string }
> = {
  critical: {
    label: "Critical",
    Icon: OctagonAlert,
    card: "border-destructive/60 bg-destructive/10",
    text: "text-destructive",
  },
  warning: {
    label: "Needs a decision",
    Icon: AlertTriangle,
    card: "border-warning/50 bg-warning/10",
    text: "text-warning",
  },
  info: {
    label: "For your information",
    Icon: Info,
    card: "border-info/40 bg-info/10",
    text: "text-info",
  },
};

function summary(counts: Record<AlarmLevel, number>): string {
  const parts: string[] = [];
  if (counts.critical) parts.push(`${counts.critical} critical`);
  if (counts.warning) parts.push(`${counts.warning} to decide`);
  if (counts.info) parts.push(`${counts.info} info`);
  return parts.join(", ");
}

/**
 * The loud sign-in surface for spend alarms (Arman, 2026-10-09). A modal over the
 * page: it adds no layout, so nothing shifts. Every alarm names what is wrong and
 * the one thing to do, opens its ONE record page, and can be resolved (for
 * everyone, with an optional note), snoozed for 24 hours, or copied for an agent.
 * "Remind me later" (and X, Escape) hide the panel for this session only.
 */
export default function SpendAlarmPanel({ alarms, onOpen, onResolve, onSnooze, onClose }: SpendAlarmPanelProps) {
  const [resolving, setResolving] = useState<string | null>(null);
  const [note, setNote] = useState("");
  useEffect(() => {
    if (alarms.length === 0) setResolving(null);
  }, [alarms.length]);

  const sorted = sortSpendAlarms(alarms);
  const counts = countByLevel(sorted);
  const top: AlarmLevel = counts.critical ? "critical" : counts.warning ? "warning" : "info";
  const TopIcon = LEVEL_STYLE[top].Icon;

  return (
    <Dialog open={alarms.length > 0} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={cn("max-w-2xl", top === "critical" && "border-destructive/60")}>
        <DialogHeader>
          <DialogTitle className={cn("flex items-center gap-2", LEVEL_STYLE[top].text)}>
            <TopIcon className="h-5 w-5 shrink-0" aria-hidden />
            Spend alarms ({alarms.length})
          </DialogTitle>
          <DialogDescription>{summary(counts)}</DialogDescription>
        </DialogHeader>

        <ul className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
          {sorted.map((alarm) => {
            const style = LEVEL_STYLE[alarm.level];
            const Icon = style.Icon;
            const isResolving = resolving === alarm.id;
            return (
              <li
                key={alarm.ackKey}
                data-testid={`alarm-${alarm.id}`}
                data-level={alarm.level}
                className={cn("rounded-xl border p-3", style.card)}
              >
                <div className="flex items-start gap-3">
                  <Icon data-alarm-icon={alarm.level} className={cn("mt-0.5 h-5 w-5 shrink-0", style.text)} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">
                      {alarm.title}
                      {alarm.count > 1 ? (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">x{alarm.count}</span>
                      ) : null}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{alarm.detail}</p>
                    <p className="mt-1 text-xs font-medium text-foreground">
                      <span className={style.text}>{style.label}</span>
                      {alarm.fix ? <span>{` - ${alarm.fix}`}</span> : null}
                    </p>
                    {isResolving ? (
                      <div className="mt-2 flex flex-col gap-2">
                        <ProTextarea
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="Note (optional)"
                          surfaceName="spend-alarm-resolve"
                        />
                        <div className="flex items-center gap-2">
                          <Button
                            variant="primary"
                            type="button"
                            title="Resolve this alarm for every super admin"
                            onClick={() => {
                              onResolve(alarm, note.trim());
                              setResolving(null);
                              setNote("");
                            }}
                          >
                            Resolve for everyone
                          </Button>
                          <Button variant="quiet" type="button" title="Keep the alarm open" onClick={() => setResolving(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 flex items-center gap-2">
                        {alarm.link ? (
                          <Button
                            variant="outline"
                            type="button"
                            icon={<ArrowRight />}
                            title="Open this alarm's record"
                            onClick={() => onOpen(alarm.link as string)}
                          >
                            Open
                          </Button>
                        ) : null}
                        {alarm.recordId ? (
                          <>
                            <Button
                              variant="quiet"
                              type="button"
                              title="Marks this alarm resolved for everyone; it reopens if it happens again"
                              onClick={() => {
                                setNote("");
                                setResolving(alarm.id);
                              }}
                            >
                              Resolve
                            </Button>
                            <Button variant="quiet" type="button" title="Quiet this alarm for 24 hours, for everyone" onClick={() => onSnooze(alarm)}>
                              Snooze 24h
                            </Button>
                          </>
                        ) : null}
                        <CopyButtons
                          size="icon"
                          label="Spend alarm"
                          className="ml-auto"
                          human={() => `${alarm.title}\n${alarm.detail}${alarm.fix ? `\n${alarm.fix}` : ""}${alarm.link ? `\n${window.location.origin}${alarm.link}` : ""}`}
                          agent={() => ({
                            kind: "spend-alarm",
                            location: "Spend alarm panel",
                            description: "One spend alarm from the sign-in panel.",
                            attributes: { level: alarm.level, count: String(alarm.count) },
                            data: {
                              record_id: alarm.recordId,
                              record_page: alarm.link ? `${typeof window === "undefined" ? "" : window.location.origin}${alarm.link}` : null,
                              kind: alarm.kind,
                              level: alarm.level,
                              title: alarm.title,
                              what_happened: alarm.detail,
                              fix: alarm.fix,
                              count: alarm.count,
                              last_at: alarm.lastAt,
                            },
                          })}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <DialogFooter className="h-9 items-center">
          <Button variant="quiet" type="button" title="Close for now; the alarms return next visit" onClick={onClose}>
            Remind me later
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
