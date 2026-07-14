import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ToolAccent } from "../../types";

/**
 * The per-tool icon for the folded tool line and entity-card headers.
 *
 * HOUSE RULE (owner-specified, repo-wide): a colored icon changes its TEXT
 * color only — no background tile, no ring, no gloss, no shadow. The previous
 * "glossy chip" version put a colored gradient tile behind every tool icon,
 * which reads as loud/childish in the transcript. The icon is now a plain
 * Lucide glyph tinted by accent, sized to sit in the text line.
 */

const ACCENT_ICON: Record<ToolAccent, string> = {
  primary: "text-primary",
  blue: "text-blue-600 dark:text-blue-400",
  violet: "text-violet-600 dark:text-violet-400",
  cyan: "text-cyan-600 dark:text-cyan-400",
  green: "text-emerald-600 dark:text-emerald-400",
  amber: "text-amber-600 dark:text-amber-400",
  rose: "text-rose-600 dark:text-rose-400",
  slate: "text-slate-600 dark:text-slate-300",
};

const SIZE = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-[18px] w-[18px]",
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
  return (
    <Icon
      className={cn(
        "shrink-0",
        SIZE[size],
        ACCENT_ICON[accent] ?? ACCENT_ICON.primary,
        className,
      )}
    />
  );
}
