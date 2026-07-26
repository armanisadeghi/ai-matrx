"use client";

import React, { useEffect, useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { Button } from "@/components/ui/button";
import { brokerSelectors } from "@/lib/redux/brokerSlice/selectors";

/**
 * A utility component to debug broker map entries and values
 * Only use during development, remove in production
 */
const BrokerDebugger: React.FC<{ fieldId?: string; fieldObject?: unknown }> = ({
  fieldId,
  fieldObject,
}) => {
  const brokerMap = useAppSelector(brokerSelectors.selectMap);
  const brokerValues = useAppSelector(brokerSelectors.selectAllValues);
  // For toggle visibility
  const [isVisible, setIsVisible] = useState(false);
  // For tracking changes
  const [changeCount, setChangeCount] = useState(0);

  // Force refresh every second to see real-time updates
  useEffect(() => {
    const timer = setInterval(() => {
      setChangeCount((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Get the specific entry for this field if a fieldId is provided
  const mapKey = fieldId ? `applet:${fieldId}` : "";
  const fieldEntry = fieldId ? brokerMap[mapKey] : null;
  const fieldValue = fieldEntry
    ? brokerValues[fieldEntry.brokerId]
    : undefined;

  // Get all entries related to applet preview
  const previewEntries = Object.entries(brokerMap)
    .filter(([key]) => key.startsWith("applet:"))
    .map(([key, entry]) => ({
      key,
      entry,
      value: brokerValues[entry.brokerId],
    }));

  if (!isVisible) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsVisible(true)}
          className="bg-red-100 hover:bg-red-200 border-red-300 text-red-800"
        >
          Debug Broker ({previewEntries.length})
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-96 max-h-96 overflow-auto bg-gray-50 dark:bg-gray-900 p-4 rounded-md border border-border shadow-lg">
      <div className="flex justify-between items-center mb-2">
        <h3 className="font-medium text-gray-900 dark:text-gray-100">
          Broker State Debug - Updated: {changeCount}
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsVisible(false)}
          className="h-6 w-6 p-0"
        >
          ✕
        </Button>
      </div>

      {/* Display full field object */}
      {fieldObject !== undefined && fieldObject !== null && (
        <div className="mb-4">
          <h4 className="text-sm font-medium text-gray-800 dark:text-gray-200">
            Field Object
          </h4>
          <div className="text-xs p-2 bg-gray-100 dark:bg-gray-800 rounded mb-2 max-h-40 overflow-auto">
            <pre className="whitespace-pre-wrap break-all">
              {JSON.stringify(fieldObject, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {fieldId && (
        <div className="mb-4">
          <h4 className="text-sm font-medium text-gray-800 dark:text-gray-200">
            Current Field
          </h4>
          <div className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded mb-1">
            <span className="font-medium">Map Key:</span> {mapKey}
          </div>

          <div className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded mb-1">
            <span className="font-medium">Broker ID:</span>{" "}
            {fieldEntry?.brokerId || "Not found"}
          </div>

          <div className="text-xs p-2 bg-gray-100 dark:bg-gray-800 rounded mb-2">
            <span className="font-medium block mb-1">Value:</span>
            <pre className="whitespace-pre-wrap break-all">
              {fieldValue !== undefined
                ? JSON.stringify(fieldValue, null, 2)
                : "No value found"}
            </pre>
          </div>
        </div>
      )}

      <div className="mb-4">
        <h4 className="text-sm font-medium text-gray-800 dark:text-gray-200">
          All Preview Entries ({previewEntries.length})
        </h4>
        {previewEntries.length === 0 ? (
          <div className="text-xs p-2 bg-gray-100 dark:bg-gray-800 rounded my-1">
            No entries found
          </div>
        ) : (
          previewEntries.map(({ key, entry, value }) => (
            <div
              key={key}
              className="text-xs p-2 bg-gray-100 dark:bg-gray-800 rounded my-1"
            >
              <div className="font-medium">{key.replace("applet:", "")}</div>
              {/* @ts-ignore - brokerId exists on BrokerMapEntry but type system doesn't recognize it */}
              <div className="opacity-75">BrokerID: {entry.brokerId}</div>
              <div>
                Value:{" "}
                {value !== undefined
                  ? typeof value === "object"
                    ? JSON.stringify(value)
                    : String(value)
                  : "undefined"}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default BrokerDebugger;
