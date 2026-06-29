/**
 * Usage-type presentation — label, plural, icon, and display order for every
 * surface an agent can be used from. Imported by the engine groups, report
 * columns, and admin filters so nothing forks.
 */

import {
  AppWindow,
  CalendarClock,
  Code2,
  Columns2,
  GitFork,
  Link2,
  MessageSquareText,
  PanelTop,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import type { AgentUsageType } from "@/features/agents/redux/usages/usages.types";

export interface UsageTypeMeta {
  label: string;
  plural: string;
  icon: LucideIcon;
  /** Whether a one-click "update to active" can apply to this type. */
  remediable: boolean;
}

export const USAGE_TYPE_META: Record<AgentUsageType, UsageTypeMeta> = {
  shortcut: { label: "Shortcut", plural: "Shortcuts", icon: Link2, remediable: true },
  app: { label: "Agent app", plural: "Agent apps", icon: AppWindow, remediable: true },
  scheduled_task: {
    label: "Scheduled task",
    plural: "Scheduled tasks",
    icon: CalendarClock,
    remediable: false,
  },
  surface_binding: {
    label: "Surface binding",
    plural: "Surface bindings",
    icon: PanelTop,
    remediable: false,
  },
  sms_line: { label: "SMS line", plural: "SMS lines", icon: MessageSquareText, remediable: false },
  workflow_node: {
    label: "Workflow node",
    plural: "Workflow nodes",
    icon: Workflow,
    remediable: false,
  },
  derived_agent: {
    label: "Derived agent",
    plural: "Derived agents",
    icon: GitFork,
    remediable: true,
  },
  comparison: { label: "Comparison", plural: "Comparisons", icon: Columns2, remediable: false },
  code: { label: "Code usage", plural: "Code usages", icon: Code2, remediable: false },
};

/** Display order — most actionable / common first. */
export const USAGE_TYPE_ORDER: AgentUsageType[] = [
  "shortcut",
  "app",
  "scheduled_task",
  "workflow_node",
  "surface_binding",
  "sms_line",
  "derived_agent",
  "comparison",
  "code",
];

export function usageTypeMeta(type: AgentUsageType): UsageTypeMeta {
  return USAGE_TYPE_META[type] ?? USAGE_TYPE_META.shortcut;
}
