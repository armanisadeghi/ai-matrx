// components/MatrxRadio.tsx
"use client";
import React from "react";
import { motion } from "motion/react";
import { cn } from "@/utils/cn";
import * as RadixRadioGroup from "@radix-ui/react-radio-group";
import { Label } from "@/components/ui/label";
import { ComponentSize, MatrxRadioProps } from "@/types/componentConfigTypes";
import {
  getComponentStyles,
  useComponentAnimation,
  densityConfig,
} from "@/config/ui/FlexConfig";

const MatrxRadio: React.FC<MatrxRadioProps> = ({
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
  layout = "vertical",
  columns = 1,
  showSelectAll = false,
  optionClassName,
  state = disabled ? "disabled" : error ? "error" : "idle",
  ...props
}) => {
  const densityStyles = densityConfig[density];
  const animationProps = useComponentAnimation(animation, disableAnimation);

  const radioSize: Record<ComponentSize, string> = {
    default: "h-4 w-4",
    xs: "h-3 w-3",
    sm: "h-4 w-4",
    md: "h-5 w-5",
    lg: "h-6 w-6",
    xl: "h-7 w-7",
    "2xl": "h-8 w-8",
    "3xl": "h-9 w-9",
    icon: "h-4 w-4",
  }[size];

  const indicatorSize: Record<ComponentSize, string> = {
    default: "after:w-2 after:h-2",
    xs: "after:w-1.5 after:h-1.5",
    sm: "after:w-2 after:h-2",
    md: "after:w-2.5 after:h-2.5",
    lg: "after:w-3 after:h-3",
    xl: "after:w-3.5 after:h-3.5",
    "2xl": "after:w-4 after:h-4",
    "3xl": "after:w-4.5 after:h-4.5",
    icon: "after:w-1.5 after:h-1.5",
  }[size];

  if (!field) {
    return null;
  }

  return (
    <motion.div
      className={cn(densityStyles.spacing, className)}
      {...animationProps}
    >
      {field.label && (
        <Label
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

      <RadixRadioGroup.Root
        className={cn(
          "flex",
          layout === "vertical" && "flex-col",
          layout === "horizontal" && "flex-row flex-wrap",
          layout === "grid" &&
            `grid grid-cols-${columns} gap-${densityStyles.gap}`,
          !disabled && "group",
          densityStyles.spacing,
        )}
        value={value as string}
        onValueChange={!disabled ? onChange : undefined}
        disabled={disabled}
      >
        {showSelectAll && field.options && field.options.length > 1 && (
          <motion.div
            className={cn("flex items-center", optionClassName)}
            whileHover={!disabled ? { x: 5 } : undefined}
          >
            <button
              type="button"
              onClick={() => onChange?.("")}
              disabled={disabled}
              className={cn(
                "text-primary hover:text-primary/80",
                densityStyles.fontSize,
                disabled && "opacity-50 cursor-not-allowed",
              )}
            >
              Clear Selection
            </button>
          </motion.div>
        )}

        {field.options?.map((rawOption) => {
          const option =
            typeof rawOption === "string"
              ? { value: rawOption, label: rawOption, disabled: undefined }
              : rawOption;

          return (
          <motion.div
            key={option.value}
            className={cn("flex items-center", optionClassName)}
            whileHover={!disabled ? { x: 5 } : undefined}
          >
            <RadixRadioGroup.Item
              id={`${field.name}-${option.value}`}
              value={option.value}
              disabled={disabled || option.disabled}
              className={cn(
                radioSize,
                "rounded-full",
                getComponentStyles({
                  size,
                  density,
                  variant: error ? "destructive" : variant,
                  state,
                }),
                "border-2 border-input",
                "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
                "data-[state=checked]:border-primary",
              )}
            >
              <RadixRadioGroup.Indicator
                className={cn(
                  "flex items-center justify-center w-full h-full relative",
                  "after:content-[''] after:block after:rounded-full after:bg-primary",
                  indicatorSize,
                )}
              />
            </RadixRadioGroup.Item>
            <Label
              htmlFor={`${field.name}-${option.value}`}
              className={cn(
                "ml-2",
                densityStyles.fontSize,
                "font-medium",
                disabled
                  ? "text-muted-foreground cursor-not-allowed"
                  : "text-foreground cursor-pointer",
                "select-none",
              )}
            >
              {option.label}
            </Label>
          </motion.div>
          );
        })}
      </RadixRadioGroup.Root>

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

export default MatrxRadio;
