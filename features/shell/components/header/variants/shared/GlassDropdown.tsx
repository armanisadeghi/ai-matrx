"use client";

// GlassDropdown — Floating glass menu for desktop.
//
// Positioned relative to its trigger via a wrapper div.
// Renders below the trigger, centered horizontally.
// Closes on click-outside or Escape.
//
// Two modes:
//   1. Actions mode — pass `actions` for clickable rows
//   2. Select mode — pass `options` + `onSelect` for a picker

import { useEffect, useRef } from "react";
import LucideIcon from "./LucideIcon";
import type { HeaderAction, HeaderDropdownOption } from "../types";

interface GlassDropdownBaseProps {
  open: boolean;
  onClose: () => void;
  /** Alignment relative to trigger */
  align?: "center" | "left" | "right";
}

interface GlassDropdownActionsProps extends GlassDropdownBaseProps {
  mode: "actions";
  actions: HeaderAction[];
  options?: never;
  onSelect?: never;
}

interface GlassDropdownSelectProps<T extends string = string> extends GlassDropdownBaseProps {
  mode: "select";
  options: HeaderDropdownOption<T>[];
  onSelect: (value: T) => void;
  actions?: never;
}

type GlassDropdownProps<T extends string = string> =
  | GlassDropdownActionsProps
  | GlassDropdownSelectProps<T>;

export default function GlassDropdown<T extends string = string>(props: GlassDropdownProps<T>) {
  const { open, onClose, align = "center" } = props;
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on click-outside
  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay to avoid catching the triggering click
    const timer = setTimeout(() => document.addEventListener("click", onClick), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("click", onClick);
    };
  }, [open, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const alignClass =
    align === "left"
      ? "hdr-dropdown-left"
      : align === "right"
        ? "hdr-dropdown-right"
        : "hdr-dropdown-center";

  return (
    <div
      ref={dropdownRef}
      className={`hdr-dropdown matrx-glass-thin-border ${alignClass}`}
      role="menu"
    >
      {props.mode === "actions" &&
        props.actions.map((action) => (
          <button
            key={action.label}
            className={`hdr-dropdown-row ${action.destructive ? "hdr-dropdown-row-destructive" : ""}`}
            onClick={() => {
              action.onPress();
              onClose();
            }}
            type="button"
            role="menuitem"
          >
            <LucideIcon name={action.icon} size={15} className="hdr-dropdown-row-icon" />
            <span>{action.label}</span>
          </button>
        ))}

      {props.mode === "select" &&
        props.options.map((opt) => (
          <button
            key={opt.value}
            className="hdr-dropdown-row"
            onClick={() => {
              props.onSelect(opt.value);
              onClose();
            }}
            type="button"
            role="menuitem"
          >
            {opt.icon && (
              <LucideIcon name={opt.icon} size={15} className="hdr-dropdown-row-icon" />
            )}
            <span>{opt.label}</span>
          </button>
        ))}
    </div>
  );
}
