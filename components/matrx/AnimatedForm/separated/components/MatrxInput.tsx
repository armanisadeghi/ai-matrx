// components/MatrxInput.tsx
"use client";
import React from "react";
import { motion } from "motion/react";
import { cn } from "@/utils/cn";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MatrxInputProps } from "@/types/componentConfigTypes";
import {
  getComponentStyles,
  useComponentAnimation,
  densityConfig,
} from "@/config/ui/FlexConfig";

const MatrxInput: React.FC<MatrxInputProps> = ({
  field,
  value,
  onChange,
  className,
  disabled = false,
  size = "md",
  density = "normal",
  variant = "default",
  animation = "subtle",
  disableAnimation = false,
  error,
  hint,
  startAdornment,
  endAdornment,
  hideLabel = false,
  state = disabled ? "disabled" : error ? "error" : "idle",
  ...props
}) => {
  const densityStyles = densityConfig[density];
  const animationProps = useComponentAnimation(animation, disableAnimation);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };

  return (
    <motion.div
      className={cn(densityStyles.spacing, className)}
      {...animationProps}
    >
      {!hideLabel && field.label && (
        <Label
          htmlFor={field.name}
          className={cn(
            densityStyles.fontSize,
            "font-medium",
            disabled ? "text-muted-foreground" : "text-foreground",
            error ? "text-destructive" : "",
            field.required &&
              "after:content-['*'] after:ml-0.5 after:text-destructive",
          )}
        >
          {field.label}
        </Label>
      )}

      <div className="relative">
        {startAdornment && (
          <div
            className={cn(
              "absolute left-0 inset-y-0 flex items-center pl-2",
              densityStyles.fontSize,
            )}
          >
            {startAdornment}
          </div>
        )}

        <Input
          id={field.name}
          type={field.type}
          value={value as string}
          onChange={handleChange}
          placeholder={field.placeholder}
          required={field.required}
          disabled={disabled}
          className={cn(
            getComponentStyles({ size, density, variant, state }),
            startAdornment && "pl-8",
            endAdornment && "pr-8",
            error && "border-destructive focus:ring-destructive",
          )}
          {...props}
        />

        {endAdornment && (
          <div
            className={cn(
              "absolute right-0 inset-y-0 flex items-center pr-2",
              densityStyles.fontSize,
            )}
          >
            {endAdornment}
          </div>
        )}
      </div>

      {error && (
        <motion.span
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "text-destructive",
            density === "compact" ? "text-xs" : "text-sm",
          )}
        >
          {error}
        </motion.span>
      )}

      {hint && !error && (
        <span
          className={cn(
            "text-muted-foreground",
            density === "compact" ? "text-xs" : "text-sm",
          )}
        >
          {hint}
        </span>
      )}
    </motion.div>
  );
};
