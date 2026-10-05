import React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { CardColor } from "./Card";

export interface HorizontalCardProps {
  title: string;
  description?: string;
  descriptionNode?: React.ReactNode;
  icon: React.ReactElement<{
    size?: number;
    className?: string;
  }>;
  color: CardColor;
  path?: string;
  className?: string;
  rightIcon?: React.ReactElement;
  onClick?: () => void;
  showBorder?: boolean;
  isLast?: boolean;
}

const colorClasses: Record<CardColor, {
  iconBg: string;
  iconColor: string;
  hover: string;
}> = {
  indigo: {
    iconBg: "bg-indigo-100 dark:bg-indigo-900/70",
    iconColor: "text-indigo-500 dark:text-indigo-400",
    hover: "hover:bg-indigo-50 dark:hover:bg-indigo-900/30",
  },
  emerald: {
    iconBg: "bg-emerald-100 dark:bg-emerald-900/70",
    iconColor: "text-emerald-500 dark:text-emerald-400",
    hover: "hover:bg-emerald-50 dark:hover:bg-emerald-900/30",
  },
  blue: {
    iconBg: "bg-blue-100 dark:bg-blue-900/70",
    iconColor: "text-blue-500 dark:text-blue-400",
    hover: "hover:bg-blue-50 dark:hover:bg-blue-900/30",
  },
  amber: {
    iconBg: "bg-amber-100 dark:bg-amber-900/70",
    iconColor: "text-amber-500 dark:text-amber-400",
    hover: "hover:bg-amber-50 dark:hover:bg-amber-900/30",
  },
  purple: {
    iconBg: "bg-purple-100 dark:bg-purple-900/70",
    iconColor: "text-purple-500 dark:text-purple-400",
    hover: "hover:bg-purple-50 dark:hover:bg-purple-900/30",
  },
  gray: {
    iconBg: "bg-gray-100 dark:bg-zinc-700",
    iconColor: "text-gray-500 dark:text-gray-400",
    hover: "hover:bg-gray-50 dark:hover:bg-zinc-700",
  },
  red: {
    iconBg: "bg-red-100 dark:bg-red-900/70",
    iconColor: "text-red-500 dark:text-red-400",
    hover: "hover:bg-red-50 dark:hover:bg-red-900/30",
  },
  green: {
    iconBg: "bg-green-100 dark:bg-green-900/70",
    iconColor: "text-green-500 dark:text-green-400",
    hover: "hover:bg-green-50 dark:hover:bg-green-900/30",
  },
  yellow: {
    iconBg: "bg-yellow-100 dark:bg-yellow-900/70",
    iconColor: "text-yellow-500 dark:text-yellow-400",
    hover: "hover:bg-yellow-50 dark:hover:bg-yellow-900/30",
  },
  pink: {
    iconBg: "bg-pink-100 dark:bg-pink-900/70",
    iconColor: "text-pink-500 dark:text-pink-400",
    hover: "hover:bg-pink-50 dark:hover:bg-pink-900/30",
  },
  orange: {
    iconBg: "bg-orange-100 dark:bg-orange-900/70",
    iconColor: "text-orange-500 dark:text-orange-400",
    hover: "hover:bg-orange-50 dark:hover:bg-orange-900/30",
  },
  teal: {
    iconBg: "bg-teal-100 dark:bg-teal-900/70",
    iconColor: "text-teal-500 dark:text-teal-400",
    hover: "hover:bg-teal-50 dark:hover:bg-teal-900/30",
  },
  cyan: {
    iconBg: "bg-cyan-100 dark:bg-cyan-900/70",
    iconColor: "text-cyan-500 dark:text-cyan-400",
    hover: "hover:bg-cyan-50 dark:hover:bg-cyan-900/30",
  },
  lime: {
    iconBg: "bg-lime-100 dark:bg-lime-900/70",
    iconColor: "text-lime-500 dark:text-lime-400",
    hover: "hover:bg-lime-50 dark:hover:bg-lime-900/30",
  },
  rose: {
    iconBg: "bg-rose-100 dark:bg-rose-900/70",
    iconColor: "text-rose-500 dark:text-rose-400",
    hover: "hover:bg-rose-50 dark:hover:bg-rose-900/30",
  },
  violet: {
    iconBg: "bg-violet-100 dark:bg-violet-900/70",
    iconColor: "text-violet-500 dark:text-violet-400",
    hover: "hover:bg-violet-50 dark:hover:bg-violet-900/30",
  },
  slate: {
    iconBg: "bg-slate-100 dark:bg-slate-800/70",
    iconColor: "text-slate-500 dark:text-slate-400",
    hover: "hover:bg-slate-50 dark:hover:bg-slate-800/40",
  },
};

export const HorizontalCard = ({
  title,
  description,
  descriptionNode,
  icon,
  color,
  path,
  className,
  rightIcon = <ChevronRight size={20} className="text-gray-400 dark:text-gray-500" />,
  onClick,
  showBorder = true,
  isLast = false,
}: HorizontalCardProps) => {
  const colorClass = colorClasses[color];
  
  const cardContent = (
    <div 
      className={cn(
        "flex items-center justify-between p-4 cursor-pointer rounded-lg",
        colorClass.hover,
        !isLast && showBorder && "border-b border-gray-100 dark:border-zinc-700",
        className
      )}
    >
      <div className="flex items-center">
        <div className={cn("p-2 rounded-lg mr-4", colorClass.iconBg)}>
          {React.cloneElement(icon, { 
            className: cn(colorClass.iconColor, icon.props.className),
            size: icon.props.size || 20
          })}
        </div>
        <div>
          <h3 className="font-medium">{title}</h3>
          {description && (
            <p className="type-body text-gray-500 dark:text-gray-400">
              {description}
            </p>
          )}
          {descriptionNode && !description && descriptionNode}
        </div>
      </div>
      {rightIcon}
    </div>
  );

  if (path) {
    return (
      <Link href={path} className="block" onClick={onClick}>
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