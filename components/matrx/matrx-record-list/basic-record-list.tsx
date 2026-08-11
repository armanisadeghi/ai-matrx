"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { ComponentDensity, ComponentSize } from "@/types/componentConfigTypes";
import type { JsonObject } from "@/types/json";

interface RecordListProps {
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
  maxLength?: number;
}

const densityMap = {
  compact: "space-y-0.5",
  normal: "space-y-2",
  comfortable: "space-y-3",
} as const;

const sizeMap: Record<ComponentSize, string> = {
  default: "text-base",
  icon: "text-base",
  xs: "text-xs",
  sm: "text-sm",
  md: "text-base",
  lg: "text-lg",
  xl: "text-xl",
  "2xl": "text-2xl",
  "3xl": "text-3xl",
};

/**
 * The empty-input guard is its OWN component, above the hooked body.
 *
 * It used to be an early `return null` sitting ABOVE the memoized helpers
 * below, which made those hooks conditional (react-hooks/rules-of-hooks): a
 * first render with no records registered zero hooks and the next one with
 * records registered three, which React throws on. The body now only ever runs
 * with a non-empty input — what every line in it already assumed.
 */
export function MatrxRecordList(props: RecordListProps) {
  if (!props.records || Object.keys(props.records).length === 0 || !props.fields?.length) return null;
  return <MatrxRecordListBody {...props} />;
}

function MatrxRecordListBody({
  records,
  fields,
  density = "compact",
  size = "xs",
  showBorders = true,
  className,
  padding = "py-0.5",
  maxLength = 100,
}: RecordListProps) {

  const truncate = React.useCallback(
    (text: string) => {
      if (!text || text.length <= maxLength) return text;
      return text.slice(0, maxLength) + "...";
    },
    [maxLength],
  );

  const formatValue = React.useCallback((value: unknown): string => {
    if (value === null || value === undefined) return "-";
    if (typeof value === "object") {
      try {
        return JSON.stringify(value);
      } catch {
        return "-";
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
            title: truncate(formatValue(record[fields[0]?.name] || id)),
            content: (
              <div className={densityMap[density]}>
                {fields.map((field) => (
                  <div
                    key={field.name}
                    className={cn(
                      "flex items-center justify-between",
                      padding,
                      showBorders && "border-b border-border last:border-0",
                    )}
                  >
                    <span
                      className={cn(sizeMap[size], "text-muted-foreground")}
                    >
                      {field.displayName || field.name}
                    </span>
                    <span
                      className={cn(
                        sizeMap[size],
                        "font-medium text-right max-w-[70%] text-foreground",
                      )}
                    >
                      {truncate(formatValue(record[field.name]))}
                    </span>
                  </div>
                ))}
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
      truncate,
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

export default MatrxRecordList;
