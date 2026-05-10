"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface FieldProps {
  label: React.ReactNode;
  hint?: React.ReactNode;
  htmlFor?: string;
  trailing?: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function Field({
  label,
  hint,
  htmlFor,
  trailing,
  required,
  children,
  className,
}: FieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={htmlFor}
          className="text-sm font-medium text-foreground"
        >
          {label}
          {required && (
            <span
              aria-label="required"
              className="ml-1 text-destructive"
            >
              *
            </span>
          )}
        </label>
        {trailing}
      </div>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

interface NumberFieldProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  inputMode?: "decimal" | "numeric";
  className?: string;
}

export function NumberField({
  id,
  value,
  onChange,
  prefix,
  suffix,
  placeholder,
  min,
  max,
  step = 1,
  inputMode = "decimal",
  className,
}: NumberFieldProps) {
  return (
    <div
      className={cn(
        "relative flex items-center w-full",
        "rounded-lg border border-border bg-background",
        "transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20",
        className,
      )}
    >
      {prefix && (
        <span className="pl-3 pr-1 text-muted-foreground flex items-center pointer-events-none">
          {prefix}
        </span>
      )}
      <input
        id={id}
        type="number"
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        className={cn(
          "h-11 flex-1 min-w-0 bg-transparent text-base font-medium tabular-nums text-foreground",
          "placeholder:text-muted-foreground/60",
          "px-3",
          prefix && "pl-1",
          suffix && "pr-1",
          "outline-none",
          "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
        )}
      />
      {suffix && (
        <span className="pr-3 pl-1 text-muted-foreground flex items-center pointer-events-none">
          {suffix}
        </span>
      )}
    </div>
  );
}
