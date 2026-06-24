"use client";

import { DynamicIcon } from "@/components/official/icons/IconResolver";
import { cn } from "@/styles/themes/utils";
import {
  getAllDisplayTypes,
  getDisplayMeta,
  type ResultDisplayMode,
} from "@/features/agents/utils/run-ui-utils";

/**
 * Widget picker — the same grid of options as `AgentWidgetInvokerTester`,
 * acting as a single-select. The shortcut's "widget" is the
 * `display_mode` value the runtime uses to render results.
 */
export function WidgetPicker({
  value,
  onChange,
  disabled,
}: {
  value: ResultDisplayMode;
  onChange: (next: ResultDisplayMode) => void;
  disabled?: boolean;
}) {
  const items = getAllDisplayTypes().map((displayMode) => {
    const meta = getDisplayMeta(displayMode);
    return { displayMode, meta };
  });

  return (
    <div className="flex flex-wrap gap-2">
      {items.map(({ displayMode, meta }) => {
        const active = displayMode === value;
        return (
          <button
            key={displayMode}
            type="button"
            disabled={disabled}
            onClick={() => onChange(displayMode)}
            title={meta.description}
            className={cn(
              "flex flex-col items-center justify-center gap-1.5",
              "w-[92px] h-[92px] shrink-0 rounded-xl border transition-all",
              active
                ? "border-primary bg-primary/10 shadow-sm"
                : "border-transparent bg-transparent hover:bg-muted/30 hover:border-border",
            )}
          >
            <DynamicIcon
              name={meta.icon}
              className={cn("w-6 h-6", active ? "text-primary" : meta.color)}
            />
            <span
              className={cn(
                "text-[11px] leading-tight font-medium px-1 text-center line-clamp-2 break-words w-full",
                active ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {meta.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
