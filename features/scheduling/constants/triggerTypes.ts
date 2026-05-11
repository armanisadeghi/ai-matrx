// features/scheduling/constants/triggerTypes.ts
//
// Trigger-type picker config. Order matters — used directly in the create
// form for the type-picker row of chips.

import { Calendar, Clock, Heart, Target, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { TriggerType } from "../types";

export interface TriggerTypeMeta {
  type: TriggerType;
  label: string;
  /** Single-line description for the picker chip. */
  description: string;
  icon: LucideIcon;
  /** True if the form supports creating this type in v1. */
  available: boolean;
}

export const TRIGGER_TYPES: readonly TriggerTypeMeta[] = [
  {
    type: "interval",
    label: "Interval",
    description: "Run every N seconds, starting from creation.",
    icon: Clock,
    available: true,
  },
  {
    type: "cron",
    label: "Cron schedule",
    description: "Cron expression — daily, weekly, business hours, anything.",
    icon: Calendar,
    available: true,
  },
  {
    type: "one-shot",
    label: "One-shot",
    description: "Run once at a specific time. Disables itself after firing.",
    icon: Zap,
    available: true,
  },
  {
    type: "heartbeat",
    label: "Heartbeat",
    description:
      "Run every N seconds — all runs append to the same conversation (memory across pulses).",
    icon: Heart,
    available: true,
  },
  {
    type: "context-match",
    label: "Page match",
    description:
      "Fires when you visit a matching URL. Chrome extension only.",
    icon: Target,
    available: true,
  },
] as const;

export const TRIGGER_TYPE_META: Record<TriggerType, TriggerTypeMeta> =
  TRIGGER_TYPES.reduce(
    (acc, meta) => {
      acc[meta.type] = meta;
      return acc;
    },
    {} as Record<TriggerType, TriggerTypeMeta>,
  );
