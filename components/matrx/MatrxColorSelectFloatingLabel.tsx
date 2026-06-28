"use client";

import React, { useState } from "react";
import { motion } from "motion/react";
import { cn } from "@/styles/themes/utils";
import { FloatingSelectLabel } from "@/components/ui/floating-select-label";

interface ColorOption {
  value: string;
  label: string;
  colorClass: string;
}

interface ColorSelectProps {
  label?: string;
  options: ColorOption[];
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

const MatrxColorSelectFloatingLabel = React.forwardRef<HTMLSelectElement, ColorSelectProps>(
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
      placeholder = "Select a color",
      floatingLabel = false,
      error = false,
      id,
      ...props
    },
    ref
  ) => {
    const [isFocused, setIsFocused] = useState(false);
    const hasValue = Boolean(value);
    const selectId = id || "color-select";
    
    const selectedOption = options.find(opt => opt.value === value);

    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.3 }}
        className="relative"
        {...props}
      >
        <div className="relative">
          {floatingLabel && label && (
            <FloatingSelectLabel
              htmlFor={selectId}
              isFocused={isFocused}
              hasValue={hasValue}
              disabled={disabled}
              error={error}
            >
              <div className="flex items-center gap-2">
                {selectedOption && (
                  <div className={cn(
                    "w-3 h-3 rounded",
                    selectedOption.colorClass
                  )} />
                )}
                <span>
                  {label}
                  {required && !disabled && (
                    <span className="text-destructive ml-1">*</span>
                  )}
                </span>
              </div>
            </FloatingSelectLabel>
          )}

          <div className="relative">
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
                "pl-8 pr-8 py-2 appearance-none",
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
                <option value="">{placeholder}</option>
              )}
              {floatingLabel && !value && (
                <option value="" disabled>
                  &nbsp;
                </option>
              )}
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </motion.select>

            {/* Color indicator */}
            {selectedOption && (
              <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <div className={cn(
                  "w-4 h-4 rounded",
                  selectedOption.colorClass
                )} />
              </div>
            )}

            {/* Custom chevron */}
          </div>
        </div>
      </motion.div>
    );
  }
);

MatrxColorSelectFloatingLabel.displayName = "MatrxColorSelectFloatingLabel";

export default MatrxColorSelectFloatingLabel