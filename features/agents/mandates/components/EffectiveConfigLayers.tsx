"use client";

/**
 * EffectiveConfigLayers — the truthful three-layer view of a mandate-resolved
 * run's settings, per setting key:
 *
 *   agent's own definition  →  binding overrides (digital)  →  mandate PINS (code)
 *
 * Precedence is left-to-right (pins win — Arman's pins law, 2026-08-22). Pins
 * are CODE-OWNED levers only (`reasoning`, `streaming`) and render locked with
 * "set by the mandate"; a model id can NEVER be a pin — `parseMandateWave1`
 * refuses non-lever keys at ingress, and this component defensively skips any
 * that slip through rather than rendering one.
 *
 * The agent's own values are not fetched here (they live in the definition the
 * Holder runs); that layer renders honestly as "agent's own setting" unless the
 * binding/pin overrides it.
 */

import { Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { JsonObject } from "@/types/json";
import { ALLOWED_PIN_KEYS } from "../provision-shapes";

function display(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

export function EffectiveConfigLayers({
  pins,
  bindingOverrides,
  className,
}: {
  /** `agent.mandate.pins` — pre-filtered by `parseMandateWave1`. */
  pins: JsonObject;
  /** The binding's `config_overrides` for the shown principal, or null. */
  bindingOverrides: JsonObject | null;
  className?: string;
}) {
  const pinKeys = Object.keys(pins).filter((k) => ALLOWED_PIN_KEYS.has(k));
  const overrideKeys = Object.keys(bindingOverrides ?? {});
  const keys = [...new Set([...overrideKeys, ...pinKeys])];
  if (keys.length === 0) return null;

  return (
    <div className={cn("space-y-1", className)}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Effective settings — agent → binding → mandate pins
      </p>
      <div className="overflow-hidden rounded-md border border-border">
        {keys.map((key) => {
          const pinned = key in pins;
          const overridden = bindingOverrides != null && key in bindingOverrides;
          return (
            <div
              key={key}
              className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 border-b border-border/60 px-2 py-1 text-[11px] last:border-b-0"
            >
              <code className="truncate font-mono text-foreground">{key}</code>
              {/* Layer 1 — the agent's own definition (base). */}
              <span
                className={cn(
                  "truncate",
                  !overridden && !pinned
                    ? "font-medium text-foreground"
                    : "text-muted-foreground line-through decoration-border",
                )}
              >
                agent&apos;s own
              </span>
              {/* Layer 2 — binding overrides. */}
              <span
                className={cn(
                  "truncate",
                  overridden && !pinned
                    ? "font-medium text-foreground"
                    : overridden
                      ? "text-muted-foreground line-through decoration-border"
                      : "text-muted-foreground/60",
                )}
              >
                {overridden ? display(bindingOverrides?.[key]) : "—"}
              </span>
              {/* Layer 3 — mandate pins (code-owned; wins). */}
              {pinned ? (
                <Badge
                  variant="outline"
                  className="w-fit gap-1 text-[10px] font-medium"
                  title="Set by the mandate — a code-owned lever; bindings cannot change it."
                >
                  <Lock className="h-2.5 w-2.5" />
                  {display(pins[key])} · set by the mandate
                </Badge>
              ) : (
                <span className="text-muted-foreground/60">—</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
