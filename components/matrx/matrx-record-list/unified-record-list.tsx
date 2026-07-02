"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { ComponentDensity, ComponentSize } from "@/types/componentConfigTypes";
import { MatrxBasicInput, MatrxBasicTextarea } from "./basic-form-components";
import type { JsonObject } from "@/types/json";

interface UnifiedRecordListProps {
  /** Keyed by record id; each value is an arbitrary, uniformly-shaped JSON record — a generic "render any JSON record" primitive with no fixed schema. */
  records: Record<string, JsonObject>;
  fields: Array<{
    name: string;
    displayName?: string;
  }>;
  density?: ComponentDensity;
  size?: ComponentSize;
  showBorders?: boolean;
  className?: string;
  padding?: string;
  editable?: boolean;
  onFieldChange?: (recordId: string, fieldName: string, value: string) => void;
}

const densityMap = {
  compact: "space-y-0.5",
  normal: "space-y-2",
  comfortable: "space-y-3",
} as const;

const sizeMap = {
  xs: "text-xs",
  sm: "text-sm",
  md: "text-base",
  lg: "text-lg",
  xl: "text-xl",
} as const;

export function MatrxUnifiedRecordList({
  records,
  fields,
  density = "compact",
  size = "xs",
  showBorders = true,
  className,
  padding = "py-0.5",
  editable = false,
  onFieldChange,
}: UnifiedRecordListProps) {
  if (!records || Object.keys(records).length === 0 || !fields?.length) {
    return null;
  }

  const formatValue = React.useCallback((value: unknown): string => {
    if (value === null || value === undefined) return "";
    if (typeof value === "object") {
      try {
        return JSON.stringify(value);
      } catch {
        return "";
      }
    }
    return String(value);
  }, []);

  const recordItems = React.useMemo(
    () =>
      Object.entries(records)
        .map(([id, record]) => {
          if (!record) return null;

          return {
            content: (
              <div className={densityMap[density]}>
                {fields.map((field) => {
                  const value = formatValue(record[field.name]);
                  const isLongText = value.length > 100;

                  return (
                    <div
                      key={field.name}
                      className={cn(
                        "flex items-center justify-between gap-4",
                        padding,
                        showBorders && "border-b border-border last:border-0",
                      )}
                    >
                      <span
                        className={cn(
                          sizeMap[size],
                          "text-muted-foreground whitespace-nowrap",
                        )}
                      >
                        {field.displayName || field.name}
                      </span>
                      <div className="flex-1 max-w-[70%]">
                        {editable ? (
                          isLongText ? (
                            <MatrxBasicTextarea
                              value={value}
                              onChange={(newValue) =>
                                onFieldChange?.(id, field.name, newValue)
                              }
                              size={size}
                            />
                          ) : (
                            <MatrxBasicInput
                              value={value}
                              onChange={(newValue) =>
                                onFieldChange?.(id, field.name, newValue)
                              }
                              size={size}
                            />
                          )
                        ) : (
                          <span
                            className={cn(
                              sizeMap[size],
                              "font-medium text-right text-foreground block w-full",
                            )}
                          >
                            {value}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ),
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null),
    [
      records,
      fields,
      density,
      size,
      showBorders,
      padding,
      editable,
      onFieldChange,
      formatValue,
    ],
  );

  if (!recordItems.length) {
    return null;
  }

  return (
    <div className={cn(densityMap[density], className)}>
      {recordItems.map((item, index) => (
        <div key={index} className="w-full">
          {item.content}
        </div>
      ))}
    </div>
  );
}

export default MatrxUnifiedRecordList;
