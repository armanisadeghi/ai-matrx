// components/MatrxSelect.tsx
"use client";
import React from "react";
import { motion } from "motion/react";
import { cn } from "@/utils/cn";
import { Check, ChevronDown, X, Search } from "lucide-react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Label } from "@/components/ui/label";
import { MatrxSelectProps, SelectOption } from "@/types/componentConfigTypes";
import {
  getComponentStyles,
  useComponentAnimation,
  densityConfig,
} from "@/config/ui/FlexConfig";
import MatrxBaseInput from "./MatrxBaseInput";

const MatrxSelect: React.FC<MatrxSelectProps> = ({
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
  hideLabel = false,
  options = [],
  placeholder = "Select an option",
  startAdornment,
  endAdornment,
  allowClear = false,
  searchable = false,
  state = disabled ? "disabled" : error ? "error" : "idle",
  ...props
}) => {
  const densityStyles = densityConfig[density];
  const animationProps = useComponentAnimation(animation, disableAnimation);
  const [searchTerm, setSearchTerm] = React.useState("");

  const filteredOptions = searchable
    ? options.filter(
        (option) =>
          option.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
          String(option.value).toLowerCase().includes(searchTerm.toLowerCase()),
      )
    : options;

  return (
    <motion.div
      className={cn(densityStyles.spacing, className)}
      {...animationProps}
    >
      {!hideLabel && field.label && (
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

      <SelectPrimitive.Root
        value={value as string}
        onValueChange={onChange}
        disabled={disabled}
      >
        <SelectPrimitive.Trigger
          className={cn(
            getComponentStyles({ size, density, variant, state }),
            "w-full flex items-center justify-between",
            "focus:outline-none focus:ring-2 focus:ring-offset-2",
            error && "border-destructive focus:ring-destructive",
            startAdornment && "pl-8",
            endAdornment && "pr-8",
          )}
        >
          <div className="flex items-center gap-2">
            {startAdornment && (
              <span className="text-muted-foreground">{startAdornment}</span>
            )}
            <SelectPrimitive.Value placeholder={placeholder} />
            {endAdornment && (
              <span className="text-muted-foreground">{endAdornment}</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {allowClear && value && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange("");
                }}
                className="p-1 hover:bg-accent rounded-full"
              >
                <X className="h-3 w-3" />
              </button>
            )}
            <SelectPrimitive.Icon>
              <ChevronDown className="h-4 w-4" />
            </SelectPrimitive.Icon>
          </div>
        </SelectPrimitive.Trigger>

        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            className={cn(
              "bg-popover text-popover-foreground",
              "rounded-md border shadow-md",
              "min-w-[8rem] overflow-hidden",
              densityStyles.fontSize,
            )}
          >
            <SelectPrimitive.ScrollUpButton className="flex items-center justify-center h-6 bg-accent">
              <ChevronDown className="h-4 w-4 rotate-180" />
            </SelectPrimitive.ScrollUpButton>

            {searchable && (
              <div className="p-2 border-b">
                <MatrxBaseInput
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-8"
                  startAdornment={<Search className="h-4 w-4" />}
                />
              </div>
            )}

            <SelectPrimitive.Viewport>
              {filteredOptions.map((option) => (
                <SelectPrimitive.Item
                  key={option.value}
                  value={String(option.value)}
                  disabled={option.disabled}
                  className={cn(
                    "relative flex items-center gap-2",
                    densityStyles.padding[size],
                    "cursor-pointer select-none",
                    "focus:bg-accent focus:text-accent-foreground",
                    "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
                  )}
                >
                  <SelectPrimitive.ItemIndicator>
                    <Check className="h-4 w-4" />
                  </SelectPrimitive.ItemIndicator>

                  {option.icon && (
                    <span className="text-muted-foreground">{option.icon}</span>
                  )}

                  <div className="flex flex-col">
                    <SelectPrimitive.ItemText>
                      {option.label}
                    </SelectPrimitive.ItemText>
                    {option.description && (
                      <span className="text-xs text-muted-foreground">
                        {option.description}
                      </span>
                    )}
                  </div>
                </SelectPrimitive.Item>
              ))}

              {searchable && filteredOptions.length === 0 && (
                <div
                  className={cn(
                    "text-center text-muted-foreground",
                    densityStyles.padding[size],
                  )}
                >
                  No results found
                </div>
              )}
            </SelectPrimitive.Viewport>

            <SelectPrimitive.ScrollDownButton className="flex items-center justify-center h-6 bg-accent">
              <ChevronDown className="h-4 w-4" />
            </SelectPrimitive.ScrollDownButton>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>

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

export default MatrxSelect;

// Usage Example:
/*
const options: SelectOption[] = [
    {
        label: "Light Theme",
        value: "light",
        icon: <Sun className="h-4 w-4" />,
        description: "Default light mode"
    },
    {
        label: "Dark Theme",
        value: "dark",
        icon: <Moon className="h-4 w-4" />,
        description: "Default dark mode"
    },
    {
        label: "System Theme",
        value: "system",
        icon: <Laptop className="h-4 w-4" />,
        description: "Follow system preference",
        disabled: true
    }
];

<MatrxSelect
    field={{
        name: "theme",
        label: "Choose Theme",
        type: "select",
        required: true
    }}
    value={theme}
    onChange={setTheme}
    options={options}
    density="normal"
    size="md"
    searchable
    allowClear
    startAdornment={<Settings className="h-4 w-4" />}
    error="Please select a theme"
    hint="This affects the entire application"
/>
*/
