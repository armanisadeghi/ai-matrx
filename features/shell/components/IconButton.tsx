"use client";

// IconButton — Universal 3-layer icon button for the shell.
//
// Structure:
//   Outer  (.icon-btn)        44×44 transparent tap target — handles clicks
//   Middle (.icon-btn-glass)  30×30 glass pill — visual element
//   Inner  (.icon-btn-icon)   16×16 icon area
//
// Usage:
//   <IconButton icon={<Menu />} onClick={handler} label="Open menu" />
//   <IconButton icon={<Menu />} asLabel htmlFor="some-checkbox" label="Toggle" />
//   <IconButton icon={<Menu />} active onClick={handler} label="Active state" />

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface IconButtonProps {
  /** Icon element to render (e.g. <Menu />, <Search />) */
  icon: ReactNode;
  /** Click handler — used when rendered as button */
  onClick?: () => void;
  /** Accessible label */
  label: string;
  /** If true, renders outer as <label> and requires htmlFor */
  asLabel?: boolean;
  /** For use when asLabel is true */
  htmlFor?: string;
  /** Highlights the glass pill */
  active?: boolean;
  /** Extra classes on the outer tap target */
  className?: string;
  /** Extra classes on the glass pill */
  glassClassName?: string;
  disabled?: boolean;
}

export default function IconButton({
  icon,
  onClick,
  label,
  asLabel,
  htmlFor,
  active,
  className,
  glassClassName,
  disabled,
}: IconButtonProps) {
  const glassClass = cn(
    "icon-btn-glass matrx-glass-thin-border shell-tactile",
    active && "active",
    glassClassName,
  );

  const iconEl = <span className="icon-btn-icon">{icon}</span>;
  const inner = <span className={glassClass}>{iconEl}</span>;

  if (asLabel) {
    return (
      <label
        htmlFor={htmlFor}
        className={cn("icon-btn", className)}
        aria-label={label}
      >
        {inner}
      </label>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("icon-btn", className)}
      aria-label={label}
      disabled={disabled}
    >
      {inner}
    </button>
  );
}
