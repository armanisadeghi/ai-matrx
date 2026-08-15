// features/scheduling/components/detail/TriggerCard.tsx

"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Edit } from "lucide-react";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { TRIGGER_TYPE_META } from "../../constants/triggerTypes";
import { humanizeRelative, humanizeTrigger } from "../../utils/triggerHumanize";
import { humanLines, scheduleDetailLocation } from "../../lib/copy";
import type { AgendaTask } from "../../types";

interface Props {
  task: AgendaTask;
}

export function TriggerCard({ task }: Props) {
  const trigger = task.triggers[0];

  if (!trigger) {
    return (
      <Card>
        <CardContent className="p-4 sm:p-5 text-sm text-muted-foreground">
          No trigger configured for this task.
        </CardContent>
      </Card>
    );
  }

  const meta = TRIGGER_TYPE_META[trigger.type];
  const Icon = meta?.icon;

  const triggerHuman = () =>
    humanLines([
      ["Schedule", task.title],
      ["Trigger", meta?.label ?? trigger.type],
      ["Fires", humanizeTrigger(trigger.type, trigger.config)],
      ["Next run", humanizeRelative(trigger.nextDueAt ?? task.nextDueAt)],
      ["Last fired", humanizeRelative(trigger.lastFiredAt ?? task.lastRunAt)],
      ["Config", JSON.stringify(trigger.config)],
    ]);

  return (
    <Card className="group/trigger">
      <CardContent className="p-4 sm:p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {Icon && <Icon className="h-4 w-4 text-blue-500" />}
            <div className="min-w-0">
              <div className="text-sm font-medium">{meta?.label}</div>
              <div className="text-xs text-muted-foreground">
                {humanizeTrigger(trigger.type, trigger.config)}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <CopyButtons
              size="xs"
              label={`${task.title} trigger`}
              className="lg:opacity-0 lg:group-hover/trigger:opacity-100 lg:focus-within:opacity-100 transition-opacity"
              human={triggerHuman}
              json={() => trigger}
              agent={() => ({
                kind: "schedule-trigger-card",
                location: scheduleDetailLocation(task),
                description:
                  "The trigger card of the open schedule, as rendered.",
                data: {
                  type: trigger.type,
                  label: meta?.label ?? trigger.type,
                  summary: humanizeTrigger(trigger.type, trigger.config),
                  config: trigger.config,
                  enabled: trigger.enabled,
                  next_due_at: trigger.nextDueAt ?? task.nextDueAt,
                  last_fired_at: trigger.lastFiredAt ?? task.lastRunAt,
                },
                summary: triggerHuman(),
                attributes: {
                  schedule_id: task.id,
                  trigger_type: trigger.type,
                  trigger_enabled: trigger.enabled,
                },
                context: {
                  schedule_title: task.title,
                  schedule_enabled: task.enabled,
                },
              })}
            />
            <Button asChild variant="outline" size="sm">
              <Link href={`/schedules/${task.id}/edit`}>
                <Edit className="h-3.5 w-3.5 mr-1.5" /> Edit
              </Link>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <div className="text-muted-foreground">Next run</div>
            <div className="font-medium mt-0.5">
              {humanizeRelative(trigger.nextDueAt ?? task.nextDueAt)}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">Last fired</div>
            <div className="font-medium mt-0.5">
              {humanizeRelative(trigger.lastFiredAt ?? task.lastRunAt)}
            </div>
          </div>
        </div>

        <pre className="text-[11px] bg-muted/60 rounded-md p-2 overflow-x-auto font-mono">
          {JSON.stringify(trigger.config, null, 2)}
        </pre>
      </CardContent>
    </Card>
  );
}
