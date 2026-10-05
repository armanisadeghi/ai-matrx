"use client";
import React from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type SimpleTooltipProps = {
  children: React.ReactNode;
  text?: string;
};

type AdvancedTooltipProps = {
  children: React.ReactNode;
  text?: string;
  side?: "top" | "bottom" | "left" | "right";
  align?: "center" | "start" | "end";
  delayDuration?: number;
  className?: string;
  sideOffset?: number;
  contentClassName?: string;
  disabled?: boolean;
  variant?: "default" | "error" | "warning" | "success";
};

export const SimpleTooltip = ({ children, text }: SimpleTooltipProps) => {
  if (!text) return children;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>
        <p>{text}</p>
      </TooltipContent>
    </Tooltip>
  );
};

export const AdvancedTooltip = ({
  children,
  text,
  side = "top",
  align = "center",
  delayDuration = 200,
  className = "",
  sideOffset = 4,
  contentClassName = "",
  disabled = false,
  variant = "default",
}: AdvancedTooltipProps) => {
  if (!text || disabled) return children;

  const variantStyles = {
    default: 'bg-popover text-popover-foreground',
    error: 'bg-destructive text-destructive-foreground',
    warning: 'bg-warning text-black',
    success: 'bg-success text-black',
  };

  const baseContentClasses =
    "rounded-md px-3 py-1.5 text-sm shadow-md animate-in fade-in-0 zoom-in-95";

  return (
    <Tooltip delayDuration={delayDuration}>
      <TooltipTrigger asChild className={className}>
        {children}
      </TooltipTrigger>
      <TooltipContent
        side={side}
        align={align}
        sideOffset={sideOffset}
        className={`${baseContentClasses} ${variantStyles[variant]} ${contentClassName}`}
      >
        <p /* rich-content-exempt: tooltip or title text, plain by design */ className="leading-none whitespace-pre-wrap">{text}</p>
      </TooltipContent>
    </Tooltip>
  );
};
