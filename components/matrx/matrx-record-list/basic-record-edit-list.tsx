"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { ComponentDensity, ComponentSize } from "@/types/componentConfigTypes";
import type { JsonObject } from "@/types/json";

interface FieldComponentConfig {
  name: string;
  displayName?: string;
  /** Field editor component — receives `value` (the raw field value) plus caller-supplied `props`; shape is per-field, not fixed. */
  component: React.ComponentType<{ value: unknown; size?: ComponentSize; [key: string]: unknown }>;
  props?: Record<string, unknown>;
}

interface MatrxRecordEditListProps {
  /** Keyed by record id; each value is an arbitrary, uniformly-shaped JSON record — a generic "render any JSON record" primitive with no fixed schema. */
  records: Record<string, JsonObject>;
  fields: FieldComponentConfig[];
  density?: ComponentDensity;
  size?: ComponentSize;
  showBorders?: boolean;
  className?: string;
  padding?: string;
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

export function MatrxRecordEditList({
  records,
  fields,
  density = "compact",
  size = "xs",
  showBorders = true,
  className,
  padding = "py-0.5",
}: MatrxRecordEditListProps) {
  if (!records || Object.keys(records).length === 0 || !fields?.length) {
    return null;
  }

  const recordItems = React.useMemo(
    () =>
      Object.entries(records)
        .map(([id, record]) => {
          if (!record) return null;

          return {
            title: String(record[fields[0]?.name] || id),
            content: (
              <div className={densityMap[density]}>
                {fields.map((field) => {
                  const Component = field.component;
                  const fieldValue = record[field.name];

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
                          "text-muted-foreground shrink-0",
                        )}
                      >
                        {field.displayName || field.name}
                      </span>
                      <div className="flex-1 min-w-0">
                        <Component
                          value={fieldValue}
                          size={size}
                          {...field.props}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ),
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null),
    [records, fields, density, size, showBorders, padding],
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

export default MatrxRecordEditList;
