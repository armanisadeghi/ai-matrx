import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ToolAccent } from "../../types";

/**
 * A small GLOSSY icon tile for a tool — a colored rounded chip with a soft
 * gradient + a top inset highlight so the icon reads as a glossy app-style
 * glyph, not a flat line icon. Used on the folded tool line (sm) and the
 * entity-card header (lg). Light/dark safe.
 */

interface AccentStyle {
  tile: string;
  icon: string;
}

const ACCENTS: Record<ToolAccent, AccentStyle> = {
  primary: {
    tile: "bg-gradient-to-br from-primary/30 to-primary/10 ring-primary/20",
    icon: "text-primary",
  },
  blue: {
    tile: "bg-gradient-to-br from-blue-500/30 to-blue-600/10 ring-blue-500/20",
    icon: "text-blue-600 dark:text-blue-400",
  },
  violet: {
    tile: "bg-gradient-to-br from-violet-500/30 to-violet-600/10 ring-violet-500/20",
    icon: "text-violet-600 dark:text-violet-400",
  },
  cyan: {
    tile: "bg-gradient-to-br from-cyan-500/30 to-cyan-600/10 ring-cyan-500/20",
    icon: "text-cyan-600 dark:text-cyan-400",
  },
  green: {
    tile: "bg-gradient-to-br from-emerald-500/30 to-emerald-600/10 ring-emerald-500/20",
    icon: "text-emerald-600 dark:text-emerald-400",
  },
  amber: {
    tile: "bg-gradient-to-br from-amber-500/30 to-amber-600/10 ring-amber-500/20",
    icon: "text-amber-600 dark:text-amber-400",
  },
  rose: {
    tile: "bg-gradient-to-br from-rose-500/30 to-rose-600/10 ring-rose-500/20",
    icon: "text-rose-600 dark:text-rose-400",
  },
  slate: {
    tile: "bg-gradient-to-br from-slate-400/30 to-slate-500/10 ring-slate-400/25",
    icon: "text-slate-600 dark:text-slate-300",
  },
};

const SIZE = {
  sm: { tile: "h-5 w-5 rounded-md", icon: "h-3.5 w-3.5" },
  md: { tile: "h-7 w-7 rounded-lg", icon: "h-4 w-4" },
  lg: { tile: "h-9 w-9 rounded-lg", icon: "h-[18px] w-[18px]" },
} as const;

export function ToolGlyph({
  icon: Icon,
  accent = "primary",
  size = "sm",
  className,
}: {
  icon: LucideIcon;
  accent?: ToolAccent;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  const a = ACCENTS[accent] ?? ACCENTS.primary;
  const s = SIZE[size];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center shadow-sm ring-1 ring-inset",
        // top inset highlight = the gloss/bevel
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.28)]",
        s.tile,
        a.tile,
        className,
      )}
    >
      <Icon className={cn(s.icon, a.icon)} />
    </span>
  );
}
