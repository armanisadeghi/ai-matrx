"use client";

// IconButton — Universal 3-layer icon button for the shell.
//
// Structure:
//   Outer   44×44 transparent tap target — handles clicks
//   Middle  30×30 glass pill — visual element
//   Inner   16×16 icon area
//
// Styling is Tailwind, ported from the former .icon-btn* classes in
// styles/shell.css (pure static geometry, no shell state). The glass SURFACE
// itself still comes from the shared `matrx-glass-thin-border` utility and the
// `shell-tactile` press physics — separate shell primitives, left as-is.
//
// Usage:
//   <IconButton icon={<Menu />} onClick={handler} label="Open menu" />
//   <IconButton icon={<Menu />} asLabel htmlFor="some-checkbox" label="Toggle" />
//   <IconButton icon={<Menu />} active onClick={handler} label="Active state" />

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

// Outer tap target. The important flags defeat UA <button> chrome
// (background / border / shadow) exactly as the former .icon-btn rule did.
const OUTER =
  "flex items-center justify-center w-11 h-11 min-w-11 shrink-0 p-0 cursor-pointer " +
  "bg-transparent! border-none! shadow-none! [-webkit-tap-highlight-color:transparent]";

// 30×30 glass pill. overflow-hidden clips the backdrop-filter to the pill edge.
const GLASS =
  "flex items-center justify-center w-[1.875rem] h-[1.875rem] min-w-[1.875rem] max-w-[1.875rem] " +
  "rounded-full overflow-hidden shrink-0";

// 16×16 icon area; the svg fills it.
const ICON =
  "flex items-center justify-center w-4 h-4 shrink-0 pointer-events-none " +
  "text-[var(--shell-nav-icon-hover)] [&_svg]:w-full [&_svg]:h-full";

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
    GLASS,
    "matrx-glass-thin-border shell-tactile",
    active && "bg-[var(--matrx-glass-bg-active)]!",
    glassClassName,
  );

  const iconEl = <span className={ICON}>{icon}</span>;
  const inner = <span className={glassClass}>{iconEl}</span>;

  if (asLabel) {
    return (
      <label
        htmlFor={htmlFor}
        className={cn(OUTER, className)}
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
      className={cn(OUTER, className)}
      aria-label={label}
      disabled={disabled}
    >
      {inner}
    </button>
  );
}
