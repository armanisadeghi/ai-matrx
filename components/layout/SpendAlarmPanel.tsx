"use client";

import { AlertCircle, AlertTriangle, ExternalLink } from "lucide-react";
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
import type { SpendAlarm } from "./spendAlarm";

interface SpendAlarmPanelProps {
  /** Unacknowledged alarms, errors first. */
  alarms: SpendAlarm[];
  onAcknowledge: (ackKey: string) => void;
  onAcknowledgeAll: () => void;
}

/**
 * The loud sign-in surface for spend alarms (Arman, 2026-10-09). A modal over the
 * page: it adds no layout, so nothing shifts, and it stays until each alarm is
 * acknowledged. Delivery is the existing super-admin announcement rail.
 */
export default function SpendAlarmPanel({
  alarms,
  onAcknowledge,
  onAcknowledgeAll,
}: SpendAlarmPanelProps) {
  const errors = alarms.filter((a) => a.severity === "error").length;
  return (
    <Dialog open={alarms.length > 0}>
      <DialogContent
        className="max-w-2xl border-destructive/60"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5 shrink-0" aria-hidden />
            Spend alarms ({alarms.length})
          </DialogTitle>
          <DialogDescription>
            {errors > 0 ? `${errors} errors` : "Warnings only"}
          </DialogDescription>
        </DialogHeader>

        <ul className="flex flex-col gap-2">
          {alarms.map((alarm) => {
            const isError = alarm.severity === "error";
            const Icon = isError ? AlertCircle : AlertTriangle;
            return (
              <li
                key={alarm.ackKey}
                className={cn(
                  "rounded-xl border p-3",
                  isError
                    ? "border-destructive/60 bg-destructive/10"
                    : "border-warning/50 bg-warning/10",
                )}
              >
                <div className="flex items-start gap-3">
                  <Icon
                    className={cn(
                      "mt-0.5 h-5 w-5 shrink-0",
                      isError ? "text-destructive" : "text-warning",
                    )}
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
                    <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">
                      {alarm.detail}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      {alarm.link ? (
                        <Button
                          variant="outline"
                          type="button"
                          icon={<ExternalLink />}
                          onClick={() =>
                            window.open(
                              alarm.link as string,
                              "_blank",
                              "noopener,noreferrer",
                            )
                          }
                        >
                          Open
                        </Button>
                      ) : null}
                      <Button
                        variant="quiet"
                        type="button"
                        onClick={() => onAcknowledge(alarm.ackKey)}
                      >
                        Acknowledge
                      </Button>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <DialogFooter>
          <Button variant="danger" type="button" onClick={onAcknowledgeAll}>
            Acknowledge all
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
