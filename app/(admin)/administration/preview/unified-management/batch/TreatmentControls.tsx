"use client";

import { useState } from "react";
import {
  AppWindow,
  ArrowRight,
  BellRing,
  BrainCircuit,
  CalendarDays,
  Check,
  FileEdit,
  FileText,
  Languages,
  LayoutDashboard,
  Loader,
  Mail,
  Maximize2,
  MessageCircle,
  MessageSquare,
  PanelRight,
  RectangleVertical,
  Square,
  Target,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  RESULT_DISPLAY_META,
  type ResultDisplayMode,
} from "@/features/agents/utils/run-ui-utils";
import type {
  TreatmentFieldDef,
  TreatmentValue,
} from "./mock-data";

/**
 * Treatments use the SAME control surface as bindings: one control shared by
 * the template preview, the "set for all" slot and the per-cell grid cell, so
 * the affordance never changes as you move down the cascade.
 */

const DISPLAY_MODE_ORDER = Object.keys(
  RESULT_DISPLAY_META,
) as ResultDisplayMode[];

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Square,
  RectangleVertical,
  MessageCircle,
  FileEdit,
  PanelRight,
  Maximize2,
  LayoutDashboard,
  BellRing,
  AppWindow,
  MessageSquare,
  ArrowRight,
  Loader,
  Languages,
  Mail,
  FileText,
  Target,
  CalendarDays,
  BrainCircuit,
};

export function ModeIcon({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const Cmp = ICONS[name] ?? BrainCircuit;
  return <Cmp className={className} />;
}

/** The 13-mode widget picker, exactly as the shortcut editor offers it. */
export function DisplayModePicker({
  value,
  onChange,
  compact,
}: {
  value: ResultDisplayMode;
  onChange: (next: ResultDisplayMode) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const meta = RESULT_DISPLAY_META[value];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "w-full min-w-0 flex items-center gap-1.5 rounded-md border border-border bg-background px-2 transition-colors hover:bg-accent/60",
            compact ? "h-7 text-xs" : "h-8 text-sm",
          )}
          title={meta.description}
        >
          <ModeIcon
            name={meta.icon}
            className={cn("h-3.5 w-3.5 shrink-0", meta.color)}
          />
          <span className="truncate text-foreground">{meta.label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[22rem] p-1">
        <div className="max-h-80 overflow-y-auto">
          {DISPLAY_MODE_ORDER.map((mode) => {
            const m = RESULT_DISPLAY_META[mode];
            const active = mode === value;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  onChange(mode);
                  setOpen(false);
                }}
                className={cn(
                  "w-full flex items-start gap-2 rounded px-2 py-1.5 text-left transition-colors",
                  active ? "bg-primary/10" : "hover:bg-accent/60",
                )}
              >
                <ModeIcon
                  name={m.icon}
                  className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", m.color)}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-foreground">
                      {m.label}
                    </span>
                    {m.testMode && (
                      <span className="text-[9px] uppercase tracking-wide text-amber-600 dark:text-amber-400">
                        test
                      </span>
                    )}
                    {active && (
                      <Check className="h-3 w-3 text-primary shrink-0" />
                    )}
                  </span>
                  <span className="block text-[11px] leading-snug text-muted-foreground">
                    {m.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function TreatmentValueControl({
  def,
  value,
  onChange,
  compact,
}: {
  def: TreatmentFieldDef;
  value: TreatmentValue;
  onChange: (next: TreatmentValue) => void;
  compact?: boolean;
}) {
  const c = def.control;

  if (c.kind === "boolean") {
    return (
      <div className="flex items-center">
        <Switch
          checked={value === true}
          onCheckedChange={(v) => onChange(v === true)}
          className={compact ? "scale-90" : undefined}
        />
      </div>
    );
  }

  if (c.kind === "display-mode") {
    return (
      <DisplayModePicker
        value={value as ResultDisplayMode}
        onChange={onChange}
        compact={compact}
      />
    );
  }

  const current = typeof value === "string" ? value : "";
  return (
    <Select value={current || undefined} onValueChange={onChange}>
      <SelectTrigger
        className={cn("w-full", compact ? "h-7 text-xs" : "h-8 text-sm")}
      >
        <SelectValue placeholder="Pick…" />
      </SelectTrigger>
      <SelectContent>
        {c.options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            <span className="flex items-center gap-1.5">
              {def.key === "iconName" && (
                <ModeIcon name={o.value} className="h-3.5 w-3.5" />
              )}
              <span className="text-xs">{o.label}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
