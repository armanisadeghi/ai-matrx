import React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { calcCols } from "./useContainerColumns";

interface CheckboxGroupInputProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  variableName: string;
  allowOther?: boolean;
  compact?: boolean;
  wizardMode?: boolean;
  wrap?: boolean;
  containerWidth?: number;
}

export function CheckboxGroupInput({
  value,
  onChange,
  options,
  variableName,
  allowOther = false,
  compact = false,
  wizardMode = false,
  wrap = true,
  containerWidth = 0,
}: CheckboxGroupInputProps) {
  const selectedItems = value ? value.split("\n").filter(Boolean) : [];

  const otherItem = selectedItems.find((item) => item.startsWith("Other: "));
  const otherText = otherItem ? otherItem.substring(7) : "";
  const isOtherChecked = !!otherItem;

  const regularSelectedItems = selectedItems.filter(
    (item) => !item.startsWith("Other: "),
  );

  const customText = otherText;

  const handleToggle = (option: string, checked: boolean) => {
    let newSelected: string[];

    if (checked) {
      newSelected = [
        ...selectedItems.filter(
          (item) => item !== option && !item.startsWith("Other: "),
        ),
        option,
      ];
      if (isOtherChecked) {
        newSelected.push(`Other: ${customText}`);
      }
    } else {
      newSelected = selectedItems.filter((item) => item !== option);
    }

    onChange(newSelected.join("\n"));
  };

  const handleOtherToggle = (checked: boolean) => {
    let newSelected: string[];

    if (checked) {
      newSelected = [...regularSelectedItems, `Other: ${customText}`];
    } else {
      newSelected = regularSelectedItems;
    }

    onChange(newSelected.join("\n"));
  };

  const handleCustomTextChange = (text: string) => {
    const newSelected = [...regularSelectedItems, `Other: ${text}`];
    onChange(newSelected.join("\n"));
  };

  const checkboxClass = compact
    ? "flex min-w-0 items-center space-x-2 p-1 bg-transparent rounded border-border hover:border-gray-300 dark:hover:border-gray-600 transition-colors cursor-pointer"
    : "flex min-w-0 items-center space-x-3 p-1.5 bg-transparent rounded border-border hover:border-gray-300 dark:hover:border-gray-600 transition-colors cursor-pointer";

  const cols = calcCols(containerWidth, options, wrap, compact);
  const isMultiCol = cols > 1;
  const gap = compact ? 4 : 6;

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
          const isChecked = regularSelectedItems.includes(option);
          const itemId = `${variableName}-${option}-${index}`;

          return (
            <label
              key={`${option}-${index}`}
              htmlFor={itemId}
              className={`${checkboxClass} cursor-pointer`}
            >
              <Checkbox
                checked={isChecked}
                onCheckedChange={(checked) =>
                  handleToggle(option, checked as boolean)
                }
                id={itemId}
              />
              <span
                className={
                  compact
                    ? "min-w-0 flex-1 break-words text-xs"
                    : "min-w-0 flex-1 break-words text-sm"
                }
              >
                {option || "(empty)"}
              </span>
            </label>
          );
        })}

        {allowOther && (
          <div style={isMultiCol ? { gridColumn: "1 / -1" } : undefined}>
            <label
              htmlFor={`${variableName}-other`}
              className={`${checkboxClass} cursor-pointer`}
            >
              <Checkbox
                checked={isOtherChecked}
                onCheckedChange={(checked) =>
                  handleOtherToggle(checked as boolean)
                }
                id={`${variableName}-other`}
              />
              <span
                className={
                  compact
                    ? "min-w-0 flex-1 break-words text-xs"
                    : "min-w-0 flex-1 break-words text-sm"
                }
              >
                Other
              </span>
            </label>
            {isOtherChecked && (
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
