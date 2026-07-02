"use client";
import React from "react";
import { safeStringify } from "../utils/scraper-utils";

interface StructuredDataProps {
  structuredData: Record<string, unknown> | unknown[] | null | undefined;
}

/**
 * Component for displaying structured data
 */
const StructuredData = ({ structuredData }: StructuredDataProps) => {
  if (!structuredData || Object.keys(structuredData).length === 0) {
    return (
      <div className="p-4 text-gray-500 dark:text-gray-400">
        No structured data available
      </div>
    );
  }

  return (
    <div className="p-4">
      <pre className="whitespace-pre-wrap bg-muted p-4 rounded-md text-sm text-foreground overflow-auto">
        {safeStringify(structuredData)}
      </pre>
    </div>
  );
};

export default StructuredData;
