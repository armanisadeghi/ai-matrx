import Link from "next/link";
import React from "react";
import { cn } from "@/lib/utils";

export type CardColor = 
  | "indigo" 
  | "emerald" 
  | "blue" 
  | "amber" 
  | "purple" 
  | "gray"
  | "red"
  | "green"
  | "yellow"
  | "pink"
  | "orange"
  | "teal"
  | "cyan"
  | "lime"
  | "rose"
  | "violet"
  | "slate";

export type CardSize = "xs" | "sm" | "md" | "lg" | "xl";

export interface CardProps {
  title: string;
  description?: string;
  descriptionNode?: React.ReactNode;
  icon: React.ReactElement<{
    size?: number;
    className?: string;
  }>;
  color: CardColor;
  path?: string;
  size?: CardSize;
  className?: string;
  onClick?: () => void;
  /** Compact iOS-style icon layout: small square with icon + label only, no description */
  compact?: boolean;
  /** `path` points at a separately-hosted app — open in a new tab. */
  external?: boolean;
}

const sizeClasses: Record<CardSize, string> = {
  xs: "p-3",
  sm: "p-4",
  md: "p-5",
  lg: "p-6",
  xl: "p-8",
};

// Enterprise iOS gradients: vivid but professional (mid-range, not near-black)
const iosIconBg: Record<CardColor, string> = {
  indigo:  "from-indigo-500 to-indigo-800",
  emerald: "from-emerald-500 to-emerald-800",
  blue:    "from-blue-500 to-blue-800",
  amber:   "from-amber-500 to-amber-800",
  purple:  "from-purple-600 to-purple-900",
  gray:    "from-zinc-500 to-zinc-800",
  red:     "from-red-500 to-red-800",
  green:   "from-green-500 to-green-800",
  yellow:  "from-yellow-500 to-yellow-700",
  pink:    "from-pink-500 to-pink-800",
  orange:  "from-orange-500 to-orange-800",
  teal:    "from-teal-500 to-teal-800",
  cyan:    "from-cyan-500 to-cyan-800",
  lime:    "from-lime-500 to-lime-800",
  rose:    "from-rose-500 to-rose-800",
  violet:  "from-violet-600 to-violet-900",
  slate:   "from-slate-500 to-slate-800",
};

const colorClasses: Record<CardColor, {
  bg: string;
  hover: string;
  iconBg: string;
  iconColor: string;
}> = {
  indigo: {
    bg: "bg-white dark:bg-zinc-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/30",
    hover: "hover:bg-indigo-50 dark:hover:bg-indigo-900/30",
    iconBg: "bg-indigo-100 dark:bg-indigo-900/70",
    iconColor: "text-indigo-500 dark:text-indigo-400",
  },
  emerald: {
    bg: "bg-white dark:bg-zinc-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/30",
    hover: "hover:bg-emerald-50 dark:hover:bg-emerald-900/30",
    iconBg: "bg-emerald-100 dark:bg-emerald-900/70",
    iconColor: "text-emerald-500 dark:text-emerald-400",
  },
  blue: {
    bg: "bg-white dark:bg-zinc-800 hover:bg-blue-50 dark:hover:bg-blue-900/30",
    hover: "hover:bg-blue-50 dark:hover:bg-blue-900/30",
    iconBg: "bg-blue-100 dark:bg-blue-900/70",
    iconColor: "text-blue-500 dark:text-blue-400",
  },
  amber: {
    bg: "bg-white dark:bg-zinc-800 hover:bg-amber-50 dark:hover:bg-amber-900/30",
    hover: "hover:bg-amber-50 dark:hover:bg-amber-900/30",
    iconBg: "bg-amber-100 dark:bg-amber-900/70",
    iconColor: "text-amber-500 dark:text-amber-400",
  },
  purple: {
    bg: "bg-white dark:bg-zinc-800 hover:bg-purple-50 dark:hover:bg-purple-900/30",
    hover: "hover:bg-purple-50 dark:hover:bg-purple-900/30",
    iconBg: "bg-purple-100 dark:bg-purple-900/70",
    iconColor: "text-purple-500 dark:text-purple-400",
  },
  gray: {
    bg: "bg-white dark:bg-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-700",
    hover: "hover:bg-gray-50 dark:hover:bg-zinc-700",
    iconBg: "bg-gray-100 dark:bg-zinc-700",
    iconColor: "text-gray-500 dark:text-gray-400",
  },
  red: {
    bg: "bg-white dark:bg-zinc-800 hover:bg-red-50 dark:hover:bg-red-900/30",
    hover: "hover:bg-red-50 dark:hover:bg-red-900/30",
    iconBg: "bg-red-100 dark:bg-red-900/70",
    iconColor: "text-red-500 dark:text-red-400",
  },
  green: {
    bg: "bg-white dark:bg-zinc-800 hover:bg-green-50 dark:hover:bg-green-900/30",
    hover: "hover:bg-green-50 dark:hover:bg-green-900/30",
    iconBg: "bg-green-100 dark:bg-green-900/70",
    iconColor: "text-green-500 dark:text-green-400",
  },
  yellow: {
    bg: "bg-white dark:bg-zinc-800 hover:bg-yellow-50 dark:hover:bg-yellow-900/30",
    hover: "hover:bg-yellow-50 dark:hover:bg-yellow-900/30",
    iconBg: "bg-yellow-100 dark:bg-yellow-900/70",
    iconColor: "text-yellow-500 dark:text-yellow-400",
  },
  pink: {
    bg: "bg-white dark:bg-zinc-800 hover:bg-pink-50 dark:hover:bg-pink-900/30",
    hover: "hover:bg-pink-50 dark:hover:bg-pink-900/30",
    iconBg: "bg-pink-100 dark:bg-pink-900/70",
    iconColor: "text-pink-500 dark:text-pink-400",
  },
  orange: {
    bg: "bg-white dark:bg-zinc-800 hover:bg-orange-50 dark:hover:bg-orange-900/30",
    hover: "hover:bg-orange-50 dark:hover:bg-orange-900/30",
    iconBg: "bg-orange-100 dark:bg-orange-900/70",
    iconColor: "text-orange-500 dark:text-orange-400",
  },
  teal: {
    bg: "bg-white dark:bg-zinc-800 hover:bg-teal-50 dark:hover:bg-teal-900/30",
    hover: "hover:bg-teal-50 dark:hover:bg-teal-900/30",
    iconBg: "bg-teal-100 dark:bg-teal-900/70",
    iconColor: "text-teal-500 dark:text-teal-400",
  },
  cyan: {
    bg: "bg-white dark:bg-zinc-800 hover:bg-cyan-50 dark:hover:bg-cyan-900/30",
    hover: "hover:bg-cyan-50 dark:hover:bg-cyan-900/30",
    iconBg: "bg-cyan-100 dark:bg-cyan-900/70",
    iconColor: "text-cyan-500 dark:text-cyan-400",
  },
  lime: {
    bg: "bg-white dark:bg-zinc-800 hover:bg-lime-50 dark:hover:bg-lime-900/30",
    hover: "hover:bg-lime-50 dark:hover:bg-lime-900/30",
    iconBg: "bg-lime-100 dark:bg-lime-900/70",
    iconColor: "text-lime-500 dark:text-lime-400",
  },
  rose: {
    bg: "bg-white dark:bg-zinc-800 hover:bg-rose-50 dark:hover:bg-rose-900/30",
    hover: "hover:bg-rose-50 dark:hover:bg-rose-900/30",
    iconBg: "bg-rose-100 dark:bg-rose-900/70",
    iconColor: "text-rose-500 dark:text-rose-400",
  },
  violet: {
    bg: "bg-white dark:bg-zinc-800 hover:bg-violet-50 dark:hover:bg-violet-900/30",
    hover: "hover:bg-violet-50 dark:hover:bg-violet-900/30",
    iconBg: "bg-violet-100 dark:bg-violet-900/70",
    iconColor: "text-violet-500 dark:text-violet-400",
  },
  slate: {
    bg: "bg-white dark:bg-zinc-800 hover:bg-slate-50 dark:hover:bg-slate-700/30",
    hover: "hover:bg-slate-50 dark:hover:bg-slate-700/30",
    iconBg: "bg-slate-100 dark:bg-slate-700",
    iconColor: "text-slate-500 dark:text-slate-400",
  },
};

export const Card = ({
  title,
  description,
  descriptionNode,
  icon,
  color,
  path,
  size = "md",
  className,
  onClick,
  compact = false,
  external = false,
}: CardProps) => {
  const colorClass = colorClasses[color] ?? colorClasses.gray;
  const sizeClass = sizeClasses[size];
  const externalLinkProps = external
    ? { target: "_blank", rel: "noopener noreferrer" }
    : {};

  if (compact) {
    // iOS-accurate: squircle icon (border-radius ~22% = rounded-[22%]), solid vivid bg, white icon, small label
    const compactContent = (
      <div className={cn(
        "flex flex-col items-center gap-[6px] cursor-pointer select-none",
        className
      )}>
        {/* iOS squircle icon container */}
        <div
          className={cn(
            "rounded-[22%] shadow-sm flex items-center justify-center active:opacity-75 transition-opacity",
            "w-full aspect-square max-w-[62px]",
            // gradient-to-br is required to activate the from-*/to-* gradient tokens
            "bg-gradient-to-br",
            iosIconBg[color],
          )}
        >
          {React.cloneElement(icon, {
            className: cn("text-white", icon.props.className),
            size: icon.props.size || 36,
          })}
        </div>
        {/* iOS label: small, centered, truncated */}
        <span className="text-[10.5px] font-medium text-center leading-tight text-foreground w-full truncate px-0.5">
          {title}
        </span>
      </div>
    );

    if (path) {
      return (
        <Link href={path} className="block" onClick={onClick} {...externalLinkProps}>
          {compactContent}
        </Link>
      );
    }
    return <div onClick={onClick}>{compactContent}</div>;
  }
  
  const cardContent = (
    <div className={cn(
      "rounded-xl cursor-pointer transform transition hover:scale-105",
      colorClass.bg,
      "shadow-md dark:shadow-zinc-800/20",
      sizeClass,
      className
    )}>
      <div className="flex flex-col items-center text-center space-y-3">
        <div className={cn("p-3 rounded-full", colorClass.iconBg)}>
          {React.cloneElement(icon, { 
            className: cn(colorClass.iconColor, icon.props.className),
            size: icon.props.size || 28
          })}
        </div>
        <h3 className="font-semibold text-lg">{title}</h3>
        {description && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {description}
          </p>
        )}
        {descriptionNode && !description && descriptionNode}
      </div>
    </div>
  );

  if (path) {
    return (
      <Link href={path} className="block" onClick={onClick} {...externalLinkProps}>
        {cardContent}
      </Link>
    );
  }

  return (
    <div onClick={onClick}>
      {cardContent}
    </div>
  );
}; 