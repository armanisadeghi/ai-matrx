"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface FloatingSelectLabelProps {
  htmlFor: string;
  isFocused: boolean;
  hasValue: boolean;
  disabled?: boolean;
  error?: boolean;
  children: React.ReactNode;
}

/** Floating label wrapper for native `<select>` controls (legacy Matrx pickers). */
export function FloatingSelectLabel({
  htmlFor,
  isFocused,
  hasValue,
  disabled,
  error,
  children,
}: FloatingSelectLabelProps) {
  const floated = isFocused || hasValue;

  return (
    <label
      htmlFor={htmlFor}
      className={cn(
        "pointer-events-none absolute left-3 z-10 origin-left transition-all duration-200",
        floated ? "top-1 text-xs" : "top-1/2 -translate-y-1/2 text-sm",
        disabled && "text-muted-foreground",
        error ? "text-destructive" : "text-muted-foreground",
      )}
    >
      {children}
    </label>
  );
}
