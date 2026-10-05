"use client";

import { Info, AlertTriangle, AlertCircle, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "info" | "warning" | "error" | "success";

const toneStyles: Record<
  Tone,
  { container: string; icon: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  info: {
    container:
      "border-blue-500/30 bg-blue-500/5 text-blue-900 dark:text-blue-100",
    icon: "text-blue-600 dark:text-blue-400",
    Icon: Info,
  },
  warning: {
    container:
      "border-amber-500/30 bg-amber-500/5 text-amber-900 dark:text-amber-100",
    icon: "text-amber-600 dark:text-amber-400",
    Icon: AlertTriangle,
  },
  error: {
    container:
      "border-red-500/30 bg-red-500/5 text-red-900 dark:text-red-100",
    icon: "text-red-600 dark:text-red-400",
    Icon: AlertCircle,
  },
  success: {
    container:
      "border-emerald-500/30 bg-emerald-500/5 text-emerald-900 dark:text-emerald-100",
    icon: "text-emerald-600 dark:text-emerald-400",
    Icon: CheckCircle,
  },
};

export type SettingsCalloutProps = {
  tone: Tone;
  title?: string;
  children: React.ReactNode;
  /** Optional action node rendered in the footer row of the callout. */
  action?: React.ReactNode;
};

export function SettingsCallout({
  tone,
  title,
  children,
  action,
}: SettingsCalloutProps) {
  const { container, icon, Icon } = toneStyles[tone];
  return (
    <div
      className={cn(
        "mx-4 mb-4 flex items-start gap-2.5 rounded-md border px-3 py-2.5",
        container,
      )}
    >
      <Icon className={cn("h-4 w-4 shrink-0 mt-0.5", icon)} />
      <div className="flex-1 min-w-0 type-secondary leading-relaxed">
        {title && <div className="font-semibold mb-0.5">{title}</div>}
        <div>{children}</div>
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  );
}
