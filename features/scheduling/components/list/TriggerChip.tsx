// features/scheduling/components/list/TriggerChip.tsx

"use client";

import { Calendar, Clock, Heart, Target, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { AgendaTrigger, TriggerType } from "../../types";
import { humanizeTrigger } from "../../utils/triggerHumanize";

const ICON: Record<TriggerType, typeof Calendar> = {
  "one-shot": Zap,
  interval: Clock,
  cron: Calendar,
  heartbeat: Heart,
  "context-match": Target,
  event: Zap,
  manual: Zap,
  dependency: Zap,
};

interface Props {
  trigger: AgendaTrigger | undefined;
}

export function TriggerChip({ trigger }: Props) {
  if (!trigger) {
    return (
      <Badge variant="outline" className="text-muted-foreground text-xs">
        No trigger
      </Badge>
    );
  }

  const Icon = ICON[trigger.type];
  return (
    <Badge
      variant="outline"
      className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs"
    >
      <Icon className="h-3 w-3" />
      <span className="truncate max-w-[14rem]">
        {humanizeTrigger(trigger.type, trigger.config)}
      </span>
    </Badge>
  );
}
