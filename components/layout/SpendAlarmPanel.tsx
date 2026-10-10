"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ExternalLink, Info, OctagonAlert, type LucideIcon } from "lucide-react";
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
import { countByLevel, sortSpendAlarms, type AlarmLevel, type SpendAlarm } from "./spendAlarm";

interface SpendAlarmPanelProps {
  /** Unreviewed alarms. */
  alarms: SpendAlarm[];
  onAcknowledge: (ackKey: string) => void;
  /** Mark every shown alarm reviewed (asked once, naming the count). */
  onAcknowledgeAll: () => void;
  /** X, Escape, the backdrop or "Remind me later": hide for this browser session; nothing is marked reviewed. */
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
 * page: it adds no layout, so nothing shifts. Every alarm names what is wrong, the
 * one thing to do, and opens its exact record. "Mark reviewed" hides one alarm
 * until it happens again; "Remind me later" (and X, Escape) hide the panel for
 * this session and mark nothing.
 */
export default function SpendAlarmPanel({
  alarms,
  onAcknowledge,
  onAcknowledgeAll,
  onClose,
}: SpendAlarmPanelProps) {
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (alarms.length === 0) setConfirming(false);
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
            return (
              <li
                key={alarm.ackKey}
                data-testid={`alarm-${alarm.id}`}
                data-level={alarm.level}
                className={cn("rounded-xl border p-3", style.card)}
              >
                <div className="flex items-start gap-3">
                  <Icon
                    data-alarm-icon={alarm.level}
                    className={cn("mt-0.5 h-5 w-5 shrink-0", style.text)}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">
                      {alarm.title}
                      {alarm.count > 1 ? (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          x{alarm.count}
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{alarm.detail}</p>
                    <p className="mt-1 text-xs font-medium text-foreground">
                      <span className={style.text}>{style.label}</span>
                      {alarm.fix ? <span>{` - ${alarm.fix}`}</span> : null}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      {alarm.link ? (
                        <Button
                          variant="outline"
                          type="button"
                          icon={<ExternalLink />}
                          title="Open this record in admin"
                          onClick={() =>
                            window.open(alarm.link as string, "_blank", "noopener,noreferrer")
                          }
                        >
                          Open
                        </Button>
                      ) : null}
                      <Button
                        variant="quiet"
                        type="button"
                        title="Hide until it happens again"
                        onClick={() => onAcknowledge(alarm.ackKey)}
                      >
                        Mark reviewed
                      </Button>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <DialogFooter className="h-9 items-center">
          {confirming ? (
            <>
              <span className="mr-auto text-sm text-foreground">{`Mark all ${alarms.length} reviewed?`}</span>
              <Button
                variant="quiet"
                type="button"
                title="Keep the alarms"
                onClick={() => setConfirming(false)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                type="button"
                title="Hide all of them until they happen again"
                onClick={() => {
                  setConfirming(false);
                  onAcknowledgeAll();
                }}
              >
                {`Yes, mark ${alarms.length}`}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="quiet"
                type="button"
                title="Close for now; the alarms return next visit"
                onClick={onClose}
              >
                Remind me later
              </Button>
              <Button
                variant="outline"
                type="button"
                title="Hide every alarm until it happens again"
                onClick={() => setConfirming(true)}
              >
                Mark all reviewed
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
