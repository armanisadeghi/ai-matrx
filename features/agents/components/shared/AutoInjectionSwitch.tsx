"use client";

/**
 * AutoInjectionSwitch — the ONE presentational switch row for an agent's
 * "allow automated X injection" kill switches.
 *
 * There are two of them and they are deliberately the same shape, because they
 * are the same idea applied to the two automatic input channels:
 *
 *   - Tools   → `tool_config.auto_tools_disabled`      (AgentToolsManager)
 *   - Context → `auto_context_disabled`                (AgentContextInjectionSwitch)
 *
 * Both stop *automatic* injection while the agent's own declarations still
 * apply. Keeping one component means the two can never drift into looking or
 * reading like different mechanisms — which is exactly what would teach a
 * non-technical Expert that they are unrelated settings.
 *
 * Purely presentational: it owns no state and no persistence. The caller reads
 * the flag from Redux and dispatches the thunk.
 */

import type { ReactNode } from "react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

interface AutoInjectionSwitchProps {
  /** Unique per agent + channel, so two switches on one screen never collide. */
  id: string;
  /** e.g. "Allow automated context injection". */
  label: string;
  /**
   * What is true RIGHT NOW, in the Expert's language — never a restatement of
   * the label. Callers should vary this by the actual state (including the
   * "nothing declared and injection off" dead end).
   */
  statusText: ReactNode;
  /** Lucide icon; tinted by `disabled`. */
  icon: ReactNode;
  /** The stored kill switch. The visible switch shows its INVERSE. */
  disabled: boolean;
  onChange: (disabled: boolean) => void;
  /**
   * Set when the current combination is a dead end (e.g. injection off with
   * nothing declared). Renders the status in the warning tone instead of muted.
   */
  warn?: boolean;
  className?: string;
}

export function AutoInjectionSwitch({
  id,
  label,
  statusText,
  icon,
  disabled,
  onChange,
  warn = false,
  className,
}: AutoInjectionSwitchProps) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex items-center justify-between gap-3 px-3 py-2 border-b border-border bg-muted/30 shrink-0 cursor-pointer",
        className,
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={cn(
            "shrink-0",
            disabled ? "text-muted-foreground" : "text-primary",
            warn && "text-amber-600 dark:text-amber-400",
          )}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <span className="text-xs font-medium text-foreground">{label}</span>
          <p
            className={cn(
              "text-[11px] leading-tight",
              warn
                ? "text-amber-700 dark:text-amber-300"
                : "text-muted-foreground",
            )}
          >
            {statusText}
          </p>
        </div>
      </div>
      <Switch
        id={id}
        checked={!disabled}
        onCheckedChange={(allow) => onChange(!allow)}
        className="shrink-0"
      />
    </label>
  );
}
