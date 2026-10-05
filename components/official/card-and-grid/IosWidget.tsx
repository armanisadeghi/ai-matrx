import React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { CardColor } from "./Card";

// iOS solid icon gradients — two-stop gradient per color for a richer widget feel
const widgetGradients: Record<CardColor, string> = {
  indigo:  "from-indigo-500 to-indigo-700",
  emerald: "from-emerald-500 to-emerald-700",
  blue:    "from-blue-500 to-blue-700",
  amber:   "from-amber-400 to-amber-600",
  purple:  "from-purple-600 to-purple-800",
  gray:    "from-zinc-500 to-zinc-700",
  red:     "from-red-500 to-red-700",
  green:   "from-green-500 to-green-700",
  yellow:  "from-yellow-400 to-yellow-600",
  pink:    "from-pink-500 to-pink-700",
  orange:  "from-orange-400 to-orange-600",
  teal:    "from-teal-500 to-teal-700",
  cyan:    "from-cyan-500 to-cyan-700",
  lime:    "from-lime-500 to-lime-700",
  rose:    "from-rose-500 to-rose-700",
  violet:  "from-violet-600 to-violet-800",
  slate:   "from-slate-500 to-slate-700",
};

export interface IosWidgetProps {
  title: string;
  description?: string;
  icon: React.ReactElement<{ size?: number; className?: string }>;
  color: CardColor;
  path?: string;
  badge?: string;
  className?: string;
  onClick?: () => void;
}

/**
 * iOS-style 2×2 widget — occupies col-span-2 row-span-2 in the icon grid.
 * Uses a vivid gradient background with a large icon, title, and brief description.
 */
export const IosWidget = ({
  title,
  description,
  icon,
  color,
  path,
  badge,
  className,
  onClick,
}: IosWidgetProps) => {
  const content = (
    <div
      className={cn(
        // Fill the explicit CSS grid area assigned by parent
        "w-full h-full",
        "rounded-[20px] bg-gradient-to-br shadow-md",
        "flex flex-col justify-between",
        "p-3",
        "cursor-pointer active:opacity-80 transition-opacity select-none",
        widgetGradients[color],
        className,
      )}
    >
      {/* Top row: icon + optional badge */}
      <div className="flex items-start justify-between">
        <div className="text-white/90">
          {React.cloneElement(icon, {
            className: cn("text-white", icon.props.className),
            size: icon.props.size || 32,
          })}
        </div>
        {badge && (
          <span className="text-[9px] font-semibold bg-white/25 text-white rounded-full px-2 py-0.5 leading-tight">
            {badge}
          </span>
        )}
      </div>

      {/* Bottom: title + description */}
      <div>
        <p className="text-white type-title leading-tight line-clamp-2">
          {title}
        </p>
        {description && (
          <p className="text-white/70 type-meta leading-tight mt-0.5 line-clamp-2">
            {description}
          </p>
        )}
      </div>
    </div>
  );

  if (path) {
    return (
      <Link href={path} className="contents" onClick={onClick}>
        {content}
      </Link>
    );
  }
  return <div className="contents" onClick={onClick}>{content}</div>;
};
