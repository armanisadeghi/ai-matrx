"use client";

/**
 * AnimatedKpiCard — premium rollup tile.
 *
 *   - Count-up animation when the value changes (cubic ease).
 *   - Subtle tone-coloured glow on the icon side.
 *   - Pulse highlight when the value increases (great signal during
 *     live polling: "embedding count just went up").
 *   - Skeleton shimmer while loading the first value.
 */

import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type KpiTone =
  | "neutral"
  | "primary"
  | "success"
  | "info"
  | "warning"
  | "error";

const TONE_CONFIG: Record<
  KpiTone,
  { card: string; glow: string; iconText: string; iconBg: string }
> = {
  neutral: {
    card: "border-border bg-card",
    glow: "from-zinc-400/10",
    iconText: "text-foreground",
    iconBg: "bg-muted",
  },
  primary: {
    card: "border-primary/25 bg-card",
    glow: "from-primary/15",
    iconText: "text-primary",
    iconBg: "bg-primary/10",
  },
  success: {
    card: "border-emerald-500/25 bg-card",
    glow: "from-emerald-500/15",
    iconText: "text-emerald-600 dark:text-emerald-400",
    iconBg: "bg-emerald-500/10",
  },
  info: {
    card: "border-sky-500/25 bg-card",
    glow: "from-sky-500/15",
    iconText: "text-sky-600 dark:text-sky-400",
    iconBg: "bg-sky-500/10",
  },
  warning: {
    card: "border-amber-500/30 bg-card",
    glow: "from-amber-500/15",
    iconText: "text-amber-600 dark:text-amber-400",
    iconBg: "bg-amber-500/10",
  },
  error: {
    card: "border-destructive/30 bg-card",
    glow: "from-destructive/15",
    iconText: "text-destructive",
    iconBg: "bg-destructive/10",
  },
};

export interface AnimatedKpiCardProps {
  icon: React.ReactNode;
  label: string;
  /** Numeric values get a count-up tween + pulse on increase. String
   *  values render as-is (e.g. a model name or "off" state). */
  value: number | string | undefined;
  loading?: boolean;
  tone?: KpiTone;
  /** Optional sub-line (e.g. "of 12 total"). */
  detail?: string;
}

export function AnimatedKpiCard({
  icon,
  label,
  value,
  loading,
  tone = "neutral",
  detail,
}: AnimatedKpiCardProps) {
  const cfg = TONE_CONFIG[tone];

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border p-3 transition-colors",
        cfg.card,
      )}
    >
      {/* Soft tonal glow — radial via inline style (Tailwind 4 has no
          built-in bg-gradient-radial utility) */}
      <div
        className={cn(
          "pointer-events-none absolute -top-6 -right-6 h-24 w-24 rounded-full blur-2xl bg-gradient-to-br to-transparent",
          cfg.glow,
        )}
        aria-hidden
      />
      <div className="relative flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-medium text-muted-foreground tracking-wide truncate">
            {label}
          </div>
          <div className="mt-1 text-xl font-semibold leading-tight tabular-nums">
            {loading && value == null ? (
              <Skeleton className="h-6 w-12" />
            ) : typeof value === "string" ? (
              <span className="truncate inline-block max-w-full">{value}</span>
            ) : (
              <CountUp value={value ?? 0} />
            )}
          </div>
          {detail && (
            <div className="mt-0.5 text-[10px] text-muted-foreground truncate">
              {detail}
            </div>
          )}
        </div>
        <div
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
            cfg.iconBg,
            cfg.iconText,
          )}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

/** Animated number that counts up/down to a target. Highlights briefly
 *  when the target value increases — great for live-polling feedback. */
function CountUp({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    const start = prev.current;
    const end = value;
    if (start === end) return;

    if (end > start) {
      setPulse(true);
      const t = window.setTimeout(() => setPulse(false), 700);
      // Tween over ~600ms with ease-out cubic.
      const dur = 600;
      const t0 = performance.now();
      let raf = 0;
      const step = (now: number) => {
        const k = Math.min(1, (now - t0) / dur);
        const eased = 1 - Math.pow(1 - k, 3);
        setDisplay(Math.round(start + (end - start) * eased));
        if (k < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
      prev.current = end;
      return () => {
        window.clearTimeout(t);
        cancelAnimationFrame(raf);
      };
    }

    // Decrease — snap to new value (rare, e.g. after deletion).
    setDisplay(end);
    prev.current = end;
  }, [value]);

  // motion.js can't animate to/from `currentColor` (it isn't an
  // animatable value), so we render two stacked layers — the resting layer
  // inherits color naturally, and a green flash overlay fades in/out
  // when the value increases. Same visual, no "value-not-animatable"
  // warnings spamming the dev console.
  return (
    <span className="relative inline-block">
      <span className="inline-block">{display.toLocaleString()}</span>
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0 inline-block text-emerald-500"
        initial={{ opacity: 0 }}
        animate={{ opacity: pulse ? 1 : 0 }}
        transition={{ duration: 0.35 }}
      >
        {display.toLocaleString()}
      </motion.span>
    </span>
  );
}
