import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { calcCols } from "./useContainerColumns";

/** Overrides base SelectTrigger nowrap/line-clamp so long values wrap in-panel. */
const dropdownTriggerClassName = (compact: boolean) =>
  cn(
    "h-auto w-full min-w-0 whitespace-normal items-start gap-2",
    compact ? "min-h-8 py-1.5 text-xs" : "min-h-9 py-2",
    "[&>span]:line-clamp-none [&>span]:min-w-0 [&>span]:flex-1",
    "[&>span]:whitespace-normal [&>span]:break-words [&>span]:text-left",
    "[&>svg]:mt-0.5 [&>svg]:shrink-0",
  );

const dropdownItemClassName =
  "h-auto min-h-9 items-start py-2 leading-snug [&>span:last-of-type]:min-w-0 [&>span:last-of-type]:whitespace-normal [&>span:last-of-type]:break-words";

interface SelectInputProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  variableName: string;
  allowOther?: boolean;
  compact?: boolean;
  wizardMode?: boolean;
  /** Show all options as clickable buttons instead of a dropdown */
  expanded?: boolean;
  /** Auto-wrap buttons into columns based on available container width */
  wrap?: boolean;
  containerWidth?: number;
}

/**
 * Select Input — dropdown by default, or a button list when expanded=true.
 */
export function SelectInput({
  value,
  onChange,
  options,
  variableName,
  allowOther = false,
  compact = false,
  wizardMode,
  expanded = false,
  wrap = true,
  containerWidth = 0,
}: SelectInputProps) {
  const isOtherValue = value.startsWith("Other: ");
  const otherText = isOtherValue ? value.substring(7) : "";
  const isValueInOptions = options.includes(value);

  const selectedOption = isValueInOptions
    ? value
    : isOtherValue
      ? "Other"
      : value;
  const customText = otherText;

  const cols = calcCols(
    containerWidth,
    options,
    expanded ? wrap : false,
    compact,
  );

  const handleSelectChange = (newValue: string) => {
    if (newValue === "Other") {
      onChange(customText ? `Other: ${customText}` : "Other: ");
    } else {
      onChange(newValue);
    }
  };

  const handleCustomTextChange = (text: string) => {
    onChange(`Other: ${text}`);
  };

  // ── Button list mode ─────────────────────────────────────────────────────
  if (expanded) {
    const isMultiCol = cols > 1;
    const gap = compact ? 4 : 6;

    const btnBase = compact
      ? "w-full min-w-0 whitespace-normal break-words text-left px-2 py-1 text-xs rounded border transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      : "w-full min-w-0 whitespace-normal break-words text-left px-3 py-1.5 text-sm rounded border transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
    const btnSelected =
      "bg-primary border-primary text-primary-foreground hover:bg-primary/90";
    const btnUnselected =
      "bg-transparent border-border text-foreground hover:bg-accent hover:border-accent-foreground/20";

    return (
      <div className={compact ? "space-y-1" : "space-y-2"}>
        <div
          style={
            isMultiCol
              ? {
                  display: "grid",
                  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                  gap,
                }
              : { display: "flex", flexDirection: "column", gap }
          }
        >
          {options.map((option, index) => {
            const isSelected = selectedOption === option;

            return (
              <button
                key={`${option}-${index}`}
                type="button"
                onClick={() => handleSelectChange(option)}
                className={`${btnBase} ${isSelected ? btnSelected : btnUnselected}`}
              >
                {option || "(empty)"}
              </button>
            );
          })}

          {allowOther && (
            <div style={isMultiCol ? { gridColumn: "1 / -1" } : undefined}>
              <button
                type="button"
                onClick={() => handleSelectChange("Other")}
                className={`${btnBase} ${selectedOption === "Other" ? btnSelected : btnUnselected}`}
              >
                Other
              </button>
              {selectedOption === "Other" && (
                <div className="pt-1">
                  <Textarea
                    value={customText}
                    onChange={(e) => handleCustomTextChange(e.target.value)}
                    placeholder="Enter any text, markdown, or custom value..."
                    className={
                      compact ? "min-h-[80px] text-xs" : "min-h-[100px] text-sm"
                    }
                    autoFocus
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Dropdown mode (default) ──────────────────────────────────────────────
  return (
    <div className={cn(compact ? "space-y-1" : "space-y-1.5", "min-w-0")}>
      <Select value={selectedOption} onValueChange={handleSelectChange}>
        <SelectTrigger className={dropdownTriggerClassName(compact)}>
          <SelectValue placeholder="Choose an option..." />
        </SelectTrigger>
        <SelectContent className="max-w-[var(--radix-select-trigger-width)]">
          {options.map((option, index) => (
            <SelectItem
              key={`${option}-${index}`}
              value={option || `__empty_${index}`}
              className={dropdownItemClassName}
            >
              {option || "(empty)"}
            </SelectItem>
          ))}
          {allowOther && (
            <SelectItem value="Other" className={dropdownItemClassName}>
              Other
            </SelectItem>
          )}
        </SelectContent>
      </Select>

      {selectedOption === "Other" && (
        <Textarea
          value={customText}
          onChange={(e) => handleCustomTextChange(e.target.value)}
          placeholder="Enter any text, markdown, or custom value..."
          className={compact ? "min-h-[80px] text-xs" : "min-h-[100px] text-sm"}
          autoFocus
        />
      )}
    </div>
  );
}
