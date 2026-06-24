"use client";

// features/war-room/components/shared/WarRoomSearchField.tsx
//
// Compact search input shared by /war-room/all (always visible) and the per-room
// header (collapsible via WarRoomSearchFieldCollapsible).

import { useRef, useEffect } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface WarRoomSearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** aria-label when placeholder isn't enough */
  ariaLabel?: string;
  className?: string;
  inputClassName?: string;
  onEscape?: () => void;
  onBlur?: () => void;
  autoFocus?: boolean;
}

export function WarRoomSearchField({
  value,
  onChange,
  placeholder,
  ariaLabel,
  className,
  inputClassName,
  onEscape,
  onBlur,
  autoFocus,
}: WarRoomSearchFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border border-border bg-card/60 pl-2.5 pr-1 h-9",
        "focus-within:border-primary/50",
        className,
      )}
    >
      <Search className="size-4 shrink-0 text-muted-foreground" />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onEscape?.();
          }
        }}
        onBlur={onBlur}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        style={{ fontSize: "16px" }}
        className={cn(
          "min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/70 focus-visible:outline-none",
          inputClassName,
        )}
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            onChange("");
            inputRef.current?.focus();
          }}
          title="Clear search"
          aria-label="Clear search"
          className="grid place-items-center size-6 shrink-0 rounded text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}
