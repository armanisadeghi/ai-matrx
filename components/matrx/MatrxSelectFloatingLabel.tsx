"use client";

import React, { useState } from "react";
import { motion } from "motion/react";
import { cn } from "@/styles/themes/utils";
import { Label } from "@/components/ui/label";
import { FloatingSelectLabel } from "@/components/ui/floating-select-label";

interface Option {
  value: string;
  label: string;
}

interface MatrxSelectProps {
  label?: string;
  options: (Option | string)[];
  value: string;
  onChange?: (value: string) => void;
  className?: string;
  disabled?: boolean;
  hideLabel?: boolean;
  required?: boolean;
  placeholder?: string;
  floatingLabel?: boolean;
  error?: boolean;
  id?: string;
}

const MatrxSelectFloatinglabel = React.forwardRef<
  HTMLSelectElement,
  MatrxSelectProps
>(
  (
    {
      label,
      options,
      value,
      onChange,
      className,
      disabled = false,
      hideLabel = false,
      required = false,
      placeholder = "Select an option",
      floatingLabel = false,
      error = false,
      id,
      ...props
    },
    ref
  ) => {
    const [isFocused, setIsFocused] = useState(false);
    const hasValue = Boolean(value);
    const selectId = id || "matrx-select";

    const normalizedOptions = options.map((option): Option => {
      if (typeof option === "string") {
        return { value: option, label: option };
      }
      return option;
    });

    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.3 }}
        className="relative"
        {...props}
      >
        {!floatingLabel && label && (
          <Label
            htmlFor={selectId}
            className={cn(
              "block text-sm font-medium mb-0.5 select-none",
              disabled ? "text-muted-foreground" : "text-foreground",
              error && "text-destructive"
            )}
          >
            {label}
            {required && !disabled && (
              <span className="text-destructive ml-1">*</span>
            )}
          </Label>
        )}

        <div className="relative">
          {floatingLabel && label && (
            <FloatingSelectLabel
              htmlFor={selectId}
              isFocused={isFocused}
              hasValue={hasValue}
              disabled={disabled}
              error={error}
            >
              {label}
              {required && !disabled && (
                <span className="text-destructive ml-1">*</span>
              )}
            </FloatingSelectLabel>
          )}

          <motion.select
            ref={ref}
            id={selectId}
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            required={required}
            disabled={disabled}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            className={cn(
              "w-full h-10 rounded-md border text-foreground",
              "border-zinc-200 dark:border-zinc-700 dark:bg-zinc-800",
              "hover:bg-accent/50",
              "px-3 py-2 appearance-none",
              "focus:outline-none focus:ring-0",
              "focus:border-zinc-300 dark:focus:border-zinc-600",
              "transition-colors duration-200",
              {
                "cursor-not-allowed opacity-50": disabled,
                "border-destructive": error,
              },
              className
            )}
          >
            {!floatingLabel && (
              <option value="">{label || "Select an option"}</option>
            )}
            {floatingLabel && !value && (
              <option value="" disabled>
                &nbsp;
              </option>
            )}
            {normalizedOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </motion.select>
        </div>
      </motion.div>
    );
  }
);

MatrxSelectFloatinglabel.displayName = "MatrxSelectFloatinglabel";

export default MatrxSelectFloatinglabel;