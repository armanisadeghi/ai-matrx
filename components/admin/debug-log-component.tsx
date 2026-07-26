"use client";

import { useEffect, useRef, memo } from "react";
import isEqual from "lodash/isEqual";

interface DebugLogProps {
  title?: string;
  values: Record<string, unknown>;
  indent?: number;
}

/**
 * A utility component for debugging values in React JSX
 * Only logs changed values showing previous -> new state
 * 
 * @example
 * <DebugLog title="Button state" values={{ isLoading, isDisabled, data }} />
 */
const DebugLog = memo(({ title = "Debug", values, indent = 2 }: DebugLogProps) => {
  const prevValuesRef = useRef<Record<string, unknown>>(values);

  useEffect(() => {
    // Only log if values have changed
    if (!isEqual(prevValuesRef.current, values)) {
      const changes: Record<string, { prev: unknown; new: unknown }> = {};
      
      // Find changed values
      Object.keys(values).forEach(key => {
        if (!isEqual(prevValuesRef.current[key], values[key])) {
          changes[key] = {
            prev: prevValuesRef.current[key],
            new: values[key]
          };
        }
      });

      // Only log if there are actual changes
      if (Object.keys(changes).length > 0) {
        console.log(
          `${title} (changes):`,
          JSON.stringify(changes, (key, value) => {
            // Custom replacer to show prev -> new in a readable format
            if (value && typeof value === 'object' && 'prev' in value && 'new' in value) {
              return `${JSON.stringify(value.prev)} -> ${JSON.stringify(value.new)}`;
            }
            return value;
          }, indent)
        );
      }

      prevValuesRef.current = { ...values };
    }
  }, [title, values, indent]);

  // Component doesn't render anything
  return null;
});

DebugLog.displayName = "DebugLog";

export { DebugLog };